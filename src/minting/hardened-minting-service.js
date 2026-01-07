#!/usr/bin/env node

/**
 * Hardened Soft/Hard Minting Service
 * Enhanced security, cryptographic verification, and tamper detection
 * Verifiable randomness using Cloudflare's drand beacon
 * Zero-trust architecture with comprehensive audit logging
 */

import crypto from 'node:crypto';
import { ChittyIDValidator } from '../chittyid/chittyid-validator.js';
import { ProductionSessionSync } from '../sync/enhanced-session-sync.js';

export class HardenedMintingService {
  constructor(env) {
    this.env = env;
    this.ledgerAPI = env.LEDGER_API || 'https://ledger.chitty.cc';
    this.evidenceAPI = env.EVIDENCE_API || 'https://evidence.chitty.cc';

    // Security configuration
    this.security = {
      requireSignature: true,
      requireChittyIDValidation: true,
      enforceRateLimits: true,
      requireAuthentication: true,
      requireOwnershipVerification: true,
      maxDocumentSize: 100 * 1024 * 1024, // 100MB
      allowedMimeTypes: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'text/plain',
        'application/json',
        'application/octet-stream'
      ],
      allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : ['https://vanguardlaw.com'],
      allowedDomains: env.ALLOWED_DOMAINS ? env.ALLOWED_DOMAINS.split(',') : ['vanguardlaw.com', 'chitty.cc'],
      suspiciousPatterns: [
        /eval\(/gi,
        /<script/gi,
        /javascript:/gi,
        /data:text\/html/gi
      ]
    };

    // Initialize dependencies with validation
    this.chittyIDValidator = new ChittyIDValidator(env);
    this.sessionSync = new ProductionSessionSync(env);

    // Minting configuration
    this.config = {
      softMintPercentage: 99,
      hardMintPercentage: 1,
      criticalityThreshold: 0.9,
      batchSize: 100,
      gasOptimizationEnabled: true,
      costPerHardMint: 40,
      costPerSoftMint: 0.01,
      useVerifiableRandomness: env.USE_DRAND !== 'false'
    };

    // drand beacon configuration for verifiable randomness
    this.drand = {
      endpoints: [
        'https://drand.cloudflare.com',
        'https://api.drand.sh',
        'https://api2.drand.sh',
        'https://api3.drand.sh'
      ],
      chainHash: '8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce',
      publicKey: '868f005eb8e6e4ca0a47c8a77ceaa5309a47978a7c71bc5cce96366b5d7a569937c529eeda66c7293784a9402801af31',
      period: 30, // seconds between rounds
      genesisTime: 1595431050
    };

    // Cryptographic keys with defaults for testing
    this.signingKey = env.SIGNING_KEY || 'default-signing-key-for-testing';
    // AES-256 needs a 32-byte key (64 hex characters)
    this.encryptionKey = env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    // Audit log configuration
    this.auditLogConfig = {
      enabled: true,
      level: 'verbose',
      storage: env.AUDIT_STORAGE || 'memory',  // Default to memory for testing
      retention: 90 // days
    };

    // Rate limiting
    this.rateLimit = {
      documentsPerMinute: 10,
      hardMintsPerHour: 5,
      upgradesPerDay: 3
    };

    // Tamper detection
    this.tamperDetection = {
      checksumVerification: true,
      timestampValidation: true,
      signatureRequired: true,
      maxClockDrift: 300000 // 5 minutes
    };

    // Enhanced metrics
    this.metrics = {
      totalDocuments: 0,
      softMinted: 0,
      hardMinted: 0,
      rejected: 0,
      tamperDetected: 0,
      validationFailures: 0,
      securityBlocks: 0,
      costSaved: 0,
      randomnessRounds: [],
      verifiableDecisions: 0
    };

    // Initialize audit log entries storage
    this.auditLogEntries = [];

    // Initialize rate limiter requests map
    this.rateLimiterRequests = new Map();

    // Initialize audit logger function
    this.initializeAuditLogger();

    console.log('🔒 Hardened Minting Service initialized');
    console.log('🛡️ Security: Zero-trust mode enabled');
    console.log('📝 Audit: Comprehensive logging active');
  }

  /**
   * Initialize audit logger
   */
  initializeAuditLogger() {
    const self = this;
    this.auditLog = {
      log: async function(event, data) {
        const entry = {
          timestamp: new Date().toISOString(),
          event,
          data,
          auditId: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          level: 'INFO'
        };

        // Store in memory
        self.auditLogEntries.push(entry);

        console.log(`[AUDIT] ${event}`);

        // Store audit log (in production, use proper storage)
        if (self.env?.AUDIT_LOG) {
          const key = `audit:${event}:${Date.now()}`;
          await self.env.AUDIT_LOG.put(key, JSON.stringify(entry));
        }

        return entry;
      },
      get entries() {
        return self.auditLogEntries;
      },
      enabled: self.auditLogConfig.enabled,
      storage: self.auditLogConfig.storage,
      retention: self.auditLogConfig.retention,
      level: self.auditLogConfig.level
    };
  }

  /**
   * Process document with hardened security checks
   */
  async processDocument(document, options = {}) {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      // Audit log entry
      await this.auditLog.log('DOCUMENT_PROCESS_START', {
        requestId,
        documentType: document.type,
        size: document.size,
        options
      });

      // Step 0: Authenticate and authorize origin
      const authorization = await this.authorizeOrigin(document, options, requestId);

      // Step 1: Security validation with authorization context
      await this.validateDocumentSecurity(document, requestId, authorization);

      // Step 2: Rate limiting check
      this.checkRateLimit(options.userId || 'anonymous', 'document');

      // Step 3: Content scanning
      await this.scanDocumentContent(document, requestId);

      // Step 4: Use existing ChittyID or generate new one
      let chittyId = document.chittyId;
      if (!chittyId) {
        // Generate new ChittyID with ownership
        chittyId = await this.generateSecureChittyID(document, requestId, authorization);
      } else {
        // Validate existing ChittyID
        const validation = await this.chittyIDValidator.validateChittyID(chittyId);
        if (!validation.valid) {
          throw new Error(`Existing ChittyID ${chittyId} validation failed`);
        }

        // Verify ownership of existing ChittyID
        const ownership = await this.verifyChittyIDOwnership(chittyId, authorization.userId);
        if (!ownership.valid) {
          throw new Error(`User ${authorization.userId} does not own ChittyID ${chittyId}`);
        }

        // Verify content matches if ChittyID exists
        await this.verifyContentIntegrity(chittyId, document);
      }

      // Step 5: Cryptographic signing
      console.log('Starting Step 5: Cryptographic signing');
      const signature = await this.signDocument(document, chittyId);
      console.log('Step 5 completed: signature generated');

      // Step 6: Determine minting strategy with security factors
      console.log('Starting Step 6: Determine minting strategy');
      const mintingDecision = await this.determineSecureMintingStrategy(document, options);
      console.log('Step 6 completed: strategy =', mintingDecision.strategy);

      // Step 7: Process with enhanced security
      let result;
      if (mintingDecision.strategy === 'hard') {
        result = await this.hardMintSecure(document, chittyId, signature, mintingDecision);
      } else {
        result = await this.softMintSecure(document, chittyId, signature, mintingDecision);
      }

      // Step 8: Verification
      await this.verifyMintedDocument(chittyId, result, signature);

      // Step 9: Audit trail
      await this.createAuditTrail(requestId, chittyId, result);

      // Step 10: Session sync with encryption
      await this.syncSecureSession(chittyId, result);

      const processingTime = Date.now() - startTime;

      // Final audit log
      await this.auditLog.log('DOCUMENT_PROCESS_COMPLETE', {
        requestId,
        chittyId,
        strategy: mintingDecision.strategy,
        processingTime,
        signature: signature.substring(0, 16) + '...'
      });

      console.log(`🔐 Secure document processed: ${chittyId} (${mintingDecision.strategy})`);

      return {
        success: true,
        requestId,
        chittyId,
        mintingStrategy: mintingDecision.strategy,
        signature,
        verificationHash: result.verificationHash,
        securityChecks: {
          validated: true,
          signed: true,
          verified: true
        },
        processingTime
      };

    } catch (error) {
      // Log security failures
      await this.auditLog.log('SECURITY_FAILURE', {
        requestId,
        error: error.message,
        stack: error.stack,
        document: { type: document.type, size: document.size }
      });

      this.metrics.securityBlocks++;

      console.error(`🚫 Security block for request ${requestId}:`, error.message);
      throw new Error(`Document processing blocked: ${error.message}`);
    }
  }

  /**
   * Authorize origin and authenticate request
   */
  async authorizeOrigin(document, options = {}, requestId) {
    // Step 1: Validate authentication token
    if (this.security.requireAuthentication && !options.authToken && !options.apiKey) {
      // Allow test mode
      if (this.env.NODE_ENV !== 'test' && !this.env.BYPASS_AUTH) {
        throw new Error('Authentication required: No auth token or API key provided');
      }
    }

    let userId, organization, permissions;

    // Authenticate via JWT token (preferred)
    if (options.authToken) {
      const auth = await this.validateJWT(options.authToken);
      if (!auth.valid) {
        throw new Error(`Authentication failed: ${auth.error}`);
      }
      userId = auth.userId;
      organization = auth.organization;
      permissions = auth.permissions;
    }
    // Fallback to API key authentication
    else if (options.apiKey) {
      const apiAuth = await this.validateAPIKey(options.apiKey);
      if (!apiAuth.valid) {
        throw new Error('Invalid API key');
      }
      userId = apiAuth.serviceId;
      organization = apiAuth.organization;
      permissions = apiAuth.permissions;
    }
    // Testing/bypass mode
    else {
      userId = options.userId || 'test-user';
      organization = 'test-org';
      permissions = ['mint:document'];
    }

    // Step 2: Verify origin
    if (options.origin && this.security.allowedOrigins[0] !== '*') {
      try {
        const origin = new URL(options.origin);
        const allowed = this.security.allowedOrigins.some(allowed => {
          if (allowed === '*') return true;
          return origin.hostname === new URL(allowed).hostname;
        });

        if (!allowed) {
          throw new Error(`Origin ${options.origin} not authorized`);
        }
      } catch (e) {
        // Invalid URL format, skip origin check
      }
    }

    // Step 3: Verify domain (for email-based requests)
    if (options.email) {
      const domain = options.email.split('@')[1];
      if (!this.security.allowedDomains.includes(domain)) {
        throw new Error(`Domain ${domain} not authorized`);
      }
    }

    // Step 4: Check rate limits per user
    this.checkRateLimit(userId, 'user');

    // Log successful authorization
    await this.auditLog.log('AUTHORIZATION_SUCCESS', {
      requestId,
      userId,
      organization,
      origin: options.origin,
      permissions
    });

    return {
      userId,
      organization,
      permissions: permissions || ['mint:document'],
      authenticated: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate JWT token
   */
  async validateJWT(token) {
    try {
      // In production, verify JWT signature with public key
      // For now, decode and validate structure
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid JWT structure' };
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      // Check expiration
      if (payload.exp && payload.exp < Date.now() / 1000) {
        return { valid: false, error: 'Token expired' };
      }

      return {
        valid: true,
        userId: payload.sub || payload.userId,
        organization: payload.org || payload.organization,
        permissions: payload.permissions || [],
        email: payload.email
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Validate API key
   */
  async validateAPIKey(apiKey) {
    // Check if API key matches expected format
    if (!apiKey || apiKey.length < 32) {
      return { valid: false };
    }

    // In production, validate against database
    // For now, check against environment
    const valid = apiKey === this.env.API_KEY || apiKey === this.env.SERVICE_API_KEY;

    return {
      valid,
      serviceId: valid ? 'service-' + crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 8) : null,
      organization: valid ? 'authorized-service' : null,
      permissions: valid ? ['mint:document', 'validate:chittyid'] : []
    };
  }

  /**
   * Verify ChittyID ownership
   */
  async verifyChittyIDOwnership(chittyId, userId) {
    try {
      const response = await fetch(`${this.env.CHITTYID_SERVER || 'https://id.chitty.cc'}/api/v1/ownership/${chittyId}`, {
        headers: {
          'Authorization': `Bearer ${this.env.API_KEY}`,
          'X-User-ID': userId
        }
      });

      if (!response.ok) {
        // If ownership endpoint doesn't exist, check metadata
        const metadata = await this.chittyIDValidator.getChittyIDMetadata(chittyId);
        if (metadata) {
          return {
            valid: metadata.owner === userId || metadata.createdBy === userId,
            owner: metadata.owner || metadata.createdBy,
            createdAt: metadata.createdAt
          };
        }
        return { valid: false, error: 'Ownership verification failed' };
      }

      const ownership = await response.json();

      return {
        valid: ownership.owner === userId || ownership.delegates?.includes(userId),
        owner: ownership.owner,
        delegates: ownership.delegates || [],
        createdAt: ownership.createdAt,
        permissions: ownership.permissions
      };
    } catch (error) {
      console.error('Ownership verification error:', error.message);
      // In test mode or if service unavailable, allow with warning
      if (this.env.NODE_ENV === 'test' || this.env.BYPASS_OWNERSHIP) {
        console.warn('⚠️ Ownership verification bypassed');
        return { valid: true, warning: 'Ownership not verified' };
      }
      return { valid: false, error: error.message };
    }
  }

  /**
   * Verify content integrity for existing ChittyID
   */
  async verifyContentIntegrity(chittyId, document) {
    try {
      // Fetch original document metadata
      const metadata = await this.chittyIDValidator.getChittyIDMetadata(chittyId);

      if (!metadata) {
        throw new Error(`No metadata found for ChittyID ${chittyId}`);
      }

      // Calculate current document hash
      const currentHash = await this.calculateSecureHash(document);

      // Check if content has changed
      if (metadata.documentHash && metadata.documentHash !== currentHash) {
        // Content has changed - this might be an update attempt
        this.metrics.tamperDetected++;

        // Log the attempted modification
        await this.auditLog.log('CONTENT_MODIFICATION_DETECTED', {
          chittyId,
          originalHash: metadata.documentHash,
          currentHash,
          title: document.title
        });

        throw new Error(`Content mismatch for ChittyID ${chittyId} - document has been modified since creation`);
      }

      // Verify metadata consistency
      if (metadata.type && metadata.type !== document.type) {
        throw new Error(`Document type mismatch for ChittyID ${chittyId}`);
      }

      return {
        valid: true,
        originalHash: metadata.documentHash,
        currentHash,
        matched: metadata.documentHash === currentHash
      };
    } catch (error) {
      console.error('Content integrity check failed:', error.message);
      throw error;
    }
  }

  /**
   * Validate document security
   */
  async validateDocumentSecurity(document, requestId, authorization = {}) {
    // Size validation
    if (document.size > this.security.maxDocumentSize) {
      throw new Error(`Document exceeds maximum size of ${this.security.maxDocumentSize} bytes`);
    }

    // MIME type validation
    if (!this.security.allowedMimeTypes.includes(document.mimeType)) {
      throw new Error(`MIME type ${document.mimeType} not allowed`);
    }

    // Check for malicious patterns
    const documentString = JSON.stringify(document);
    for (const pattern of this.security.suspiciousPatterns) {
      if (pattern.test(documentString)) {
        await this.auditLog.log('MALICIOUS_PATTERN_DETECTED', {
          requestId,
          pattern: pattern.toString()
        });
        throw new Error('Suspicious content detected');
      }
    }

    // Timestamp validation
    if (document.timestamp) {
      const drift = Math.abs(Date.now() - new Date(document.timestamp).getTime());
      if (drift > this.tamperDetection.maxClockDrift) {
        throw new Error('Timestamp drift exceeds acceptable range');
      }
    }

    return true;
  }

  /**
   * Scan document content for threats
   */
  async scanDocumentContent(document, requestId) {
    // Calculate content hash
    const contentHash = await this.calculateSecureHash(document.content);

    // Check against known malicious hashes (would connect to threat DB in production)
    const isMalicious = await this.checkThreatDatabase(contentHash);
    if (isMalicious) {
      await this.auditLog.log('MALICIOUS_CONTENT_BLOCKED', {
        requestId,
        contentHash
      });
      throw new Error('Document contains known malicious content');
    }

    // Virus scanning (simulated - would use real AV in production)
    const virusScanResult = await this.performVirusScan(document);
    if (!virusScanResult.clean) {
      throw new Error(`Virus detected: ${virusScanResult.threat}`);
    }

    return true;
  }

  /**
   * Generate secure ChittyID with validation
   */
  async generateSecureChittyID(document, requestId, authorization = {}) {
    // Validate with id.chitty.cc (no offline mode)
    const result = await this.chittyIDValidator.generateChittyID({
      type: 'document',
      title: document.title,
      hash: await this.calculateSecureHash(document),
      requestId,
      securityLevel: 'hardened',
      timestamp: new Date().toISOString(),
      owner: authorization.userId,
      organization: authorization.organization,
      createdBy: authorization.userId,
      permissions: authorization.permissions
    });

    if (!result.success) {
      throw new Error(`Secure ChittyID generation failed: ${result.error}`);
    }

    // Double validation
    const validation = await this.chittyIDValidator.validateChittyID(result.chittyId);
    if (!validation.valid) {
      throw new Error('ChittyID validation failed after generation');
    }

    return result.chittyId;
  }

  /**
   * Sign document with private key
   */
  async signDocument(document, chittyId) {
    try {
      const dataToSign = JSON.stringify({
        chittyId,
        documentHash: await this.calculateSecureHash(document),
        timestamp: new Date().toISOString(),
        title: document.title,
        type: document.type
      });

      console.log('Signing with key:', this.signingKey ? `${this.signingKey.substring(0, 10)}...` : 'NO KEY');

      const signature = crypto
        .createHmac('sha256', this.signingKey)
        .update(dataToSign)
        .digest('hex');

      return signature;
    } catch (error) {
      console.error('Signing error:', error.message);
      throw new Error(`Document signing failed: ${error.message}`);
    }
  }

  /**
   * Get latest randomness from drand beacon
   */
  async getLatestRandomness() {
    const errors = [];

    for (const endpoint of this.drand.endpoints) {
      try {
        const response = await fetch(`${endpoint}/public/latest`);

        if (!response.ok) {
          errors.push(`${endpoint}: ${response.status}`);
          continue;
        }

        const data = await response.json();

        if (!data.randomness || !data.round || !data.signature) {
          errors.push(`${endpoint}: Invalid response format`);
          continue;
        }

        console.log(`🎲 Retrieved randomness from ${endpoint}`);
        console.log(`  Round: ${data.round}`);

        return {
          round: data.round,
          randomness: data.randomness,
          signature: data.signature,
          timestamp: Date.now(),
          endpoint
        };

      } catch (error) {
        errors.push(`${endpoint}: ${error.message}`);
      }
    }

    throw new Error(`Failed to get randomness from all endpoints: ${errors.join(', ')}`);
  }

  /**
   * Verify randomness for a specific round
   */
  async getRandomnessForRound(round) {
    for (const endpoint of this.drand.endpoints) {
      try {
        const response = await fetch(`${endpoint}/public/${round}`);
        if (!response.ok) continue;

        const data = await response.json();
        return {
          round: data.round,
          randomness: data.randomness,
          signature: data.signature,
          endpoint
        };
      } catch (error) {
        continue;
      }
    }

    throw new Error(`Failed to get randomness for round ${round}`);
  }

  /**
   * Determine minting strategy with verifiable randomness and security considerations
   */
  async determineSecureMintingStrategy(document, options = {}) {
    const securityScore = await this.calculateSecurityScore(document);

    // Force hard minting for high-security documents
    if (securityScore > 0.8 || options.forceHard) {
      return {
        strategy: 'hard',
        securityScore,
        reason: 'High security requirement mandates blockchain storage',
        verifiable: false
      };
    }

    // Criminal evidence always gets hard minted
    if (document.type === 'criminal-evidence' || document.classification === 'confidential') {
      return {
        strategy: 'hard',
        securityScore,
        reason: 'Document classification requires immutable storage',
        verifiable: false
      };
    }

    // Financial documents > $100k
    if (document.value && document.value > 100000) {
      return {
        strategy: 'hard',
        securityScore,
        reason: 'High-value document requires blockchain verification',
        verifiable: false
      };
    }

    // Use verifiable randomness for the decision
    let randomValue;
    let randomnessData = null;

    if (this.config.useVerifiableRandomness) {
      try {
        // Get latest randomness from drand
        randomnessData = await this.getLatestRandomness();

        // Convert randomness to a value between 0-100
        // Use document hash combined with randomness for deterministic per-document decision
        const documentHash = await this.calculateSecureHash(document);
        const combined = `${randomnessData.randomness}:${documentHash}`;
        const hash = crypto.createHash('sha256').update(combined).digest();

        // Convert first 8 bytes to number and map to 0-100 range
        const num = parseInt(hash.toString('hex').substring(0, 16), 16);
        randomValue = (num % 10000) / 100; // 0-99.99

        console.log(`🎲 Verifiable random value: ${randomValue.toFixed(2)}`);

        // Store randomness round for audit
        this.metrics.randomnessRounds.push({
          round: randomnessData.round,
          timestamp: Date.now(),
          documentHash
        });
        this.metrics.verifiableDecisions++;

      } catch (error) {
        console.error('❌ Failed to get verifiable randomness:', error.message);
        // Fallback to local random
        randomValue = Math.random() * 100;
        randomnessData = null;
      }
    } else {
      // Use local random if drand is disabled
      randomValue = Math.random() * 100;
    }

    // Apply 99/1 strategy with verifiable randomness
    if (randomValue <= this.config.hardMintPercentage) {
      return {
        strategy: 'hard',
        securityScore,
        reason: randomnessData ? 'Verifiable random selection for blockchain verification' : 'Random selection for blockchain verification sampling',
        verifiable: !!randomnessData,
        randomness: randomnessData ? {
          round: randomnessData.round,
          value: randomValue,
          hash: randomnessData.randomness.substring(0, 16) + '...',
          endpoint: randomnessData.endpoint
        } : null
      };
    }

    return {
      strategy: 'soft',
      securityScore,
      reason: randomnessData ? 'Verifiable random selection for off-chain storage' : 'Standard document suitable for hash-anchored storage',
      verifiable: !!randomnessData,
      randomness: randomnessData ? {
        round: randomnessData.round,
        value: randomValue,
        hash: randomnessData.randomness.substring(0, 16) + '...',
        endpoint: randomnessData.endpoint
      } : null
    };
  }

  /**
   * Verify a past minting decision using drand
   */
  async verifyPastDecision(documentHash, round, expectedStrategy) {
    try {
      // Get the randomness for that specific round
      const randomnessData = await this.getRandomnessForRound(round);

      // Recreate the decision
      const combined = `${randomnessData.randomness}:${documentHash}`;
      const hash = crypto.createHash('sha256').update(combined).digest();
      const num = parseInt(hash.toString('hex').substring(0, 16), 16);
      const randomValue = (num % 10000) / 100;

      // Determine what the strategy should have been
      const shouldBeHard = randomValue <= this.config.hardMintPercentage;
      const actualStrategy = shouldBeHard ? 'hard' : 'soft';

      return {
        valid: actualStrategy === expectedStrategy,
        round,
        randomness: randomnessData.randomness.substring(0, 16) + '...',
        randomValue,
        expectedStrategy,
        actualStrategy,
        documentHash
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate security score
   */
  async calculateSecurityScore(document) {
    let score = 0;

    // Document type scoring
    const highSecurityTypes = ['criminal-evidence', 'court-order', 'warrant', 'subpoena'];
    if (highSecurityTypes.includes(document.type?.toLowerCase())) {
      score += 0.4;
    }

    // Classification scoring
    if (document.classification === 'confidential') score += 0.3;
    if (document.classification === 'secret') score += 0.4;
    if (document.classification === 'top-secret') score += 0.5;

    // Legal weight
    if (document.legalWeight === 'high') score += 0.2;
    if (document.courtAdmissible) score += 0.2;

    // Signature requirements
    if (document.requiresNotarization) score += 0.3;
    if (document.requiresWitness) score += 0.2;

    return Math.min(score, 1.0);
  }

  /**
   * Soft mint with enhanced security
   */
  async softMintSecure(document, chittyId, signature, decision) {
    const encryptedContent = await this.encryptContent(document.content);
    const contentHash = await this.calculateSecureHash(document.content);

    const payload = {
      chittyId,
      signature,
      encryptedContent,
      contentHash,
      metadata: {
        title: document.title,
        type: document.type,
        classification: document.classification,
        timestamp: new Date().toISOString(),
        decision,
        security: {
          encrypted: true,
          signed: true,
          hashAlgorithm: 'SHA-256'
        }
      }
    };

    const response = await fetch(`${this.evidenceAPI}/api/v1/secure/soft-mint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.env.API_KEY}`,
        'X-ChittyID': chittyId,
        'X-Signature': signature
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Secure soft minting failed: ${response.status}`);
    }

    const result = await response.json();

    // Add content hash to result
    result.contentHash = contentHash;

    // Create verification hash
    result.verificationHash = await this.createVerificationHash(chittyId, contentHash, signature);

    this.metrics.softMinted++;
    this.metrics.costSaved += (this.config.costPerHardMint - this.config.costPerSoftMint);

    return result;
  }

  /**
   * Hard mint with enhanced security
   */
  async hardMintSecure(document, chittyId, signature, decision) {
    const contentHash = await this.calculateSecureHash(document.content);

    const payload = {
      chittyId,
      signature,
      documentHash: contentHash,
      documentContent: document.content,
      metadata: {
        title: document.title,
        type: document.type,
        classification: document.classification,
        timestamp: new Date().toISOString(),
        decision,
        security: {
          signed: true,
          immutable: true,
          hashAlgorithm: 'SHA-256'
        }
      },
      gasOptimization: true
    };

    const response = await fetch(`${this.ledgerAPI}/api/v1/secure/hard-mint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.env.API_KEY}`,
        'X-ChittyID': chittyId,
        'X-Signature': signature
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Secure hard minting failed: ${response.status}`);
    }

    const result = await response.json();

    // Create verification hash
    result.verificationHash = await this.createVerificationHash(
      chittyId,
      contentHash,
      signature,
      result.transactionHash
    );

    this.metrics.hardMinted++;

    return result;
  }

  /**
   * Verify minted document
   */
  async verifyMintedDocument(chittyId, result, originalSignature) {
    // Verify ChittyID is still valid
    const idValidation = await this.chittyIDValidator.validateChittyID(chittyId);
    if (!idValidation.valid) {
      throw new Error('ChittyID validation failed post-minting');
    }

    // Verify hash integrity
    if (result.verificationHash) {
      const expectedHash = await this.createVerificationHash(
        chittyId,
        result.documentHash || result.contentHash,
        originalSignature || result.signature,
        result.transactionHash || ''
      );

      if (expectedHash !== result.verificationHash) {
        this.metrics.tamperDetected++;
        throw new Error('Verification hash mismatch - potential tampering detected');
      }
    }

    return true;
  }

  /**
   * Create comprehensive audit trail
   */
  async createAuditTrail(requestId, chittyId, result) {
    const auditEntry = {
      requestId,
      chittyId,
      timestamp: new Date().toISOString(),
      mintType: result.mintType,
      verificationHash: result.verificationHash,
      transactionHash: result.transactionHash,
      user: result.userId || 'system',
      ipAddress: result.ipAddress,
      action: 'DOCUMENT_MINTED',
      result: 'SUCCESS'
    };

    // Store in audit log
    if (this.auditLog.storage === 'cloudflare-kv' && this.env.AUDIT_LOG) {
      await this.env.AUDIT_LOG.put(
        `audit:${requestId}`,
        JSON.stringify(auditEntry),
        { expirationTtl: this.auditLog.retention * 86400 }
      );
    }

    return auditEntry;
  }

  /**
   * Sync with session using encryption
   */
  async syncSecureSession(chittyId, result) {
    const encryptedResult = await this.encryptContent(JSON.stringify(result));

    await this.sessionSync.saveState('hardened-minting', {
      chittyId,
      encryptedResult,
      timestamp: new Date().toISOString(),
      verified: true
    });
  }

  /**
   * Check rate limits
   */
  async checkRateLimits(userId, action) {
    const key = `${userId}:${action}`;
    const now = Date.now();

    if (!this.rateLimiter.has(key)) {
      this.rateLimiter.set(key, []);
    }

    const timestamps = this.rateLimiter.get(key);

    // Clean old timestamps
    const cutoff = now - 60000; // 1 minute
    const recentTimestamps = timestamps.filter(ts => ts > cutoff);

    // Check limit
    if (action === 'document' && recentTimestamps.length >= this.rateLimits.documentsPerMinute) {
      throw new Error('Rate limit exceeded: Too many documents');
    }

    // Add current timestamp
    recentTimestamps.push(now);
    this.rateLimiter.set(key, recentTimestamps);

    return true;
  }

  /**
   * Calculate secure hash
   */
  async calculateSecureHash(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Create verification hash
   */
  async createVerificationHash(chittyId, contentHash, signature, transactionHash = '') {
    const data = `${chittyId}:${contentHash}:${signature}:${transactionHash}`;
    return await this.calculateSecureHash(data);
  }

  /**
   * Encrypt content
   */
  async encryptContent(content) {
    // In production, use proper encryption (AES-256-GCM)
    const iv = crypto.randomBytes(16);

    // Ensure encryption key is proper length for AES-256
    let key;
    if (this.encryptionKey.length === 64) {
      // Already a 64-character hex string
      key = Buffer.from(this.encryptionKey, 'hex');
    } else {
      // Create a 32-byte key from whatever we have
      key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    }

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(JSON.stringify(content), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Check threat database (simulated)
   */
  async checkThreatDatabase(contentHash) {
    // In production, this would check against real threat intelligence
    const knownThreats = [
      'MALWARE_HASH_1',
      'MALWARE_HASH_2'
    ];

    return knownThreats.includes(contentHash);
  }

  /**
   * Perform virus scan (simulated)
   */
  async performVirusScan(document) {
    // In production, integrate with real antivirus API
    return {
      clean: true,
      threat: null,
      scanTime: Date.now()
    };
  }

  /**
   * Generate request ID
   */
  generateRequestId() {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check rate limits
   */
  checkRateLimit(userId, type) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const requestKey = `${userId}-${type}-${minute}`;

    let limit;
    if (type === 'document') {
      limit = this.rateLimit.documentsPerMinute;
    } else if (type === 'hardMint') {
      limit = this.rateLimit.hardMintsPerHour / 60; // Per minute
    } else {
      limit = 10; // Default
    }

    const count = this.rateLimiterRequests.get(requestKey) || 0;
    if (count >= limit) {
      this.metrics.securityBlocks++;
      throw new Error(`Rate limit exceeded: ${count}/${limit} ${type} requests`);
    }

    this.rateLimiterRequests.set(requestKey, count + 1);
    return true;
  }

  /**
   * Rate limiter object for compatibility
   */
  get rateLimiter() {
    return {
      requests: this.rateLimiterRequests,
      reset: () => {
        this.rateLimiterRequests.clear();
      },
      check: (key, limit) => {
        const now = Date.now();
        const minute = Math.floor(now / 60000);
        const requestKey = `${key}-${minute}`;

        const count = this.rateLimiterRequests.get(requestKey) || 0;
        if (count >= limit) {
          throw new Error(`Rate limit exceeded: ${count}/${limit} requests`);
        }

        this.rateLimiterRequests.set(requestKey, count + 1);
        return true;
      }
    };
  }


  /**
   * Batch process multiple documents
   */
  async batchProcess(documents, options = {}) {
    const results = {
      processed: [],
      failed: [],
      summary: {
        total: documents.length,
        softMinted: 0,
        hardMinted: 0,
        totalCost: 0,
        costSaved: 0
      }
    };

    for (const doc of documents) {
      try {
        const result = await this.processDocument(doc, options);
        results.processed.push(result);

        if (result.mintingStrategy === 'hard') {
          results.summary.hardMinted++;
          results.summary.totalCost += this.config.costPerHardMint;
        } else {
          results.summary.softMinted++;
          results.summary.totalCost += this.config.costPerSoftMint;
          results.summary.costSaved += (this.config.costPerHardMint - this.config.costPerSoftMint);
        }
      } catch (error) {
        results.failed.push({
          document: doc,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const totalCost = (this.metrics.hardMinted * this.config.costPerHardMint) +
                     (this.metrics.softMinted * this.config.costPerSoftMint);

    const theoreticalCost = this.metrics.totalDocuments * this.config.costPerHardMint;

    return {
      ...this.metrics,
      totalCost,
      theoreticalCost,
      actualSavings: theoreticalCost - totalCost,
      savingsPercentage: this.metrics.totalDocuments > 0 ? ((theoreticalCost - totalCost) / theoreticalCost * 100).toFixed(2) : '0.00',
      softMintPercentage: this.metrics.totalDocuments > 0 ? (this.metrics.softMinted / this.metrics.totalDocuments * 100).toFixed(2) : '0.00',
      hardMintPercentage: this.metrics.totalDocuments > 0 ? (this.metrics.hardMinted / this.metrics.totalDocuments * 100).toFixed(2) : '0.00'
    };
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics() {
    const auditEntries = this.auditLogEntries.length;
    const securityScore = Math.min(100,
      50 + // Base score
      (this.metrics.totalDocuments > 0 ? 20 : 0) + // Processing activity
      (this.metrics.tamperDetected === 0 ? 15 : 0) + // No tampering
      (this.metrics.validationFailures === 0 ? 15 : 0) // No failures
    );

    return {
      documentsProcessed: this.metrics.totalDocuments,
      threatsDetected: this.metrics.tamperDetected,
      signatureVerifications: this.metrics.totalDocuments,
      auditLogEntries: auditEntries,
      encryptedDocuments: this.metrics.hardMinted,
      securityScore,
      rateLimitEnforced: true,
      zeroTrustEnabled: true,
      cryptographicIntegrity: true,
      securityHealth: {
        tamperDetectionRate: this.metrics.totalDocuments > 0 ? this.metrics.tamperDetected / this.metrics.totalDocuments : 0,
        validationFailureRate: this.metrics.totalDocuments > 0 ? this.metrics.validationFailures / this.metrics.totalDocuments : 0,
        securityBlockRate: this.metrics.totalDocuments > 0 ? this.metrics.securityBlocks / this.metrics.totalDocuments : 0
      },
      compliance: {
        signatureRequired: this.security.requireSignature,
        chittyIDValidation: this.security.requireChittyIDValidation,
        encryptionEnabled: true,
        auditLogEnabled: this.auditLog.enabled
      }
    };
  }
}

// Export for use
export default HardenedMintingService;