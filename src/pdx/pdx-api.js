/**
 * PDX (Portable DNA eXchange) API Implementation
 * REST API endpoints for PDX v1.0 specification compliance
 */

import { PDXCore, PDXValidator } from './pdx-core.js';
import { ChittySecurityManager } from '../utils/chittyos-security-integration.js';

/**
 * PDX API Server
 */
export class PDXApi {
  constructor(env) {
    this.env = env;
    this.pdxCore = null;
    this.validator = null;
    this.securityManager = null;
    this.initialized = false;
  }

  /**
   * Initialize PDX API
   */
  async initialize() {
    try {
      console.log('🧬 Initializing PDX API...');

      // Initialize PDX core
      this.pdxCore = new PDXCore(this.env);
      await this.pdxCore.initialize();

      // Initialize validator
      this.validator = new PDXValidator(this.pdxCore);

      // Initialize security manager
      this.securityManager = new ChittySecurityManager(this.env, 'pdx-api');
      await this.securityManager.initialize();

      this.initialized = true;
      console.log('✅ PDX API initialized - DNA portability active');

      return { initialized: true };

    } catch (error) {
      console.error('❌ PDX API initialization failed:', error);
      throw error;
    }
  }

  /**
   * Handle PDX API requests
   */
  async handlePDXRequest(request) {
    if (!this.initialized) {
      return this.createErrorResponse(503, 'PDX API not initialized');
    }

    const url = new URL(request.url);
    const method = request.method;
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Validate PDX API path
    if (pathParts.length < 3 || pathParts[0] !== 'pdx' || pathParts[1] !== 'v1') {
      return this.createErrorResponse(404, 'PDX API endpoint not found');
    }

    const endpoint = pathParts[2];

    try {
      // Add CORS headers
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ChittyID'
      };

      if (method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: corsHeaders
        });
      }

      // Route to appropriate handler
      switch (endpoint) {
        case 'export':
          return await this.handleExport(request, corsHeaders);
        case 'import':
          return await this.handleImport(request, corsHeaders);
        case 'verify':
          return await this.handleVerify(request, corsHeaders, pathParts);
        case 'revoke':
          return await this.handleRevoke(request, corsHeaders);
        case 'status':
          return await this.handleStatus(request, corsHeaders);
        case 'licenses':
          return await this.handleLicenses(request, corsHeaders);
        default:
          return this.createErrorResponse(404, 'Unknown PDX endpoint', corsHeaders);
      }

    } catch (error) {
      console.error('PDX API error:', error);
      return this.createErrorResponse(500, error.message);
    }
  }

  /**
   * Handle PDX export request
   * POST /pdx/v1/export
   */
  async handleExport(request, corsHeaders) {
    if (request.method !== 'POST') {
      return this.createErrorResponse(405, 'Method Not Allowed', corsHeaders);
    }

    try {
      // Authenticate request
      const authResult = await this.authenticateRequest(request);
      if (!authResult.success) {
        return this.createErrorResponse(401, authResult.error, corsHeaders);
      }

      const exportRequest = await request.json();
      const { dnaProfiles, destinationSystem, transferType, includePrivateData, options = {} } = exportRequest;

      if (!dnaProfiles || !Array.isArray(dnaProfiles) || dnaProfiles.length === 0) {
        return this.createErrorResponse(400, 'dnaProfiles array is required', corsHeaders);
      }

      const exportResults = [];
      const errors = [];

      // Process each DNA profile
      for (const profileId of dnaProfiles) {
        try {
          // Collect DNA data for this profile
          const dnaData = await this.collectDNAData(profileId, includePrivateData);

          // Create PDX package
          const pdxPackage = await this.pdxCore.createPDXPackage(dnaData, {
            ...options,
            destinationSystem,
            transferType,
            personaId: profileId,
            includePrivateData
          });

          exportResults.push({
            profileId,
            packageId: pdxPackage.header.packageId,
            package: pdxPackage,
            status: 'exported'
          });

        } catch (error) {
          errors.push({
            profileId,
            error: error.message,
            status: 'failed'
          });
        }
      }

      const response = {
        exportId: `export_${Date.now()}`,
        transferType,
        destinationSystem,
        results: exportResults,
        errors,
        timestamp: new Date().toISOString()
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('PDX export error:', error);
      return this.createErrorResponse(400, error.message, corsHeaders);
    }
  }

  /**
   * Handle PDX import request
   * POST /pdx/v1/import
   */
  async handleImport(request, corsHeaders) {
    if (request.method !== 'POST') {
      return this.createErrorResponse(405, 'Method Not Allowed', corsHeaders);
    }

    try {
      const importRequest = await request.json();
      const { pdxPackage, importPolicy = 'SELECTIVE', verifyIntegrity = true } = importRequest;

      if (!pdxPackage) {
        return this.createErrorResponse(400, 'pdxPackage is required', corsHeaders);
      }

      // Validate package if requested
      let validation = { isValid: true };
      if (verifyIntegrity) {
        validation = await this.pdxCore.validatePDXPackage(pdxPackage);
        if (!validation.isValid) {
          return this.createErrorResponse(400, 'Package validation failed: ' + validation.errors.join(', '), corsHeaders);
        }
      }

      // Check license compatibility
      const licenseCheck = await this.checkLicenseCompatibility(pdxPackage.licenses);
      if (!licenseCheck.compatible) {
        return this.createErrorResponse(403, 'License terms not acceptable: ' + licenseCheck.reason, corsHeaders);
      }

      // Import the DNA data
      const importResult = await this.importDNAData(pdxPackage, importPolicy);

      // Setup attribution tracking
      await this.setupAttributionTracking(pdxPackage);

      const response = {
        importId: `import_${Date.now()}`,
        packageId: pdxPackage.header.packageId,
        importPolicy,
        validation,
        licenseCheck,
        importResult,
        timestamp: new Date().toISOString()
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('PDX import error:', error);
      return this.createErrorResponse(400, error.message, corsHeaders);
    }
  }

  /**
   * Handle PDX verification request
   * GET /pdx/v1/verify/{packageId}
   */
  async handleVerify(request, corsHeaders, pathParts) {
    if (request.method !== 'GET') {
      return this.createErrorResponse(405, 'Method Not Allowed', corsHeaders);
    }

    const packageId = pathParts[3];
    if (!packageId) {
      return this.createErrorResponse(400, 'Package ID is required', corsHeaders);
    }

    try {
      // Get package from storage (mock implementation)
      const pdxPackage = await this.getStoredPackage(packageId);
      if (!pdxPackage) {
        return this.createErrorResponse(404, 'Package not found', corsHeaders);
      }

      // Validate package
      const validation = await this.pdxCore.validatePDXPackage(pdxPackage);

      // Check signatures
      const signatureValidation = await this.validator.validateSignatures(pdxPackage);

      // Check structure
      const structureValidation = await this.validator.validateStructure(pdxPackage);

      const verificationResult = {
        packageId,
        valid: validation.isValid,
        validationScore: validation.score,
        checks: {
          structure: structureValidation,
          signatures: signatureValidation,
          integrity: validation
        },
        package: {
          version: pdxPackage.header.version,
          createdAt: pdxPackage.header.createdAt,
          expiresAt: pdxPackage.header.expiresAt,
          issuer: pdxPackage.header.issuer,
          subject: pdxPackage.header.subject
        },
        timestamp: new Date().toISOString()
      };

      return new Response(JSON.stringify(verificationResult, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('PDX verification error:', error);
      return this.createErrorResponse(500, error.message, corsHeaders);
    }
  }

  /**
   * Handle PDX revocation request
   * POST /pdx/v1/revoke
   */
  async handleRevoke(request, corsHeaders) {
    if (request.method !== 'POST') {
      return this.createErrorResponse(405, 'Method Not Allowed', corsHeaders);
    }

    try {
      // Authenticate request
      const authResult = await this.authenticateRequest(request);
      if (!authResult.success) {
        return this.createErrorResponse(401, authResult.error, corsHeaders);
      }

      const revokeRequest = await request.json();
      const { packageId, reason, effectiveDate } = revokeRequest;

      if (!packageId || !reason) {
        return this.createErrorResponse(400, 'packageId and reason are required', corsHeaders);
      }

      // Process revocation
      const revocationResult = await this.revokePackage(packageId, reason, effectiveDate);

      const response = {
        revocationId: `revoke_${Date.now()}`,
        packageId,
        reason,
        effectiveDate: effectiveDate || new Date().toISOString(),
        status: 'revoked',
        result: revocationResult,
        timestamp: new Date().toISOString()
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('PDX revocation error:', error);
      return this.createErrorResponse(400, error.message, corsHeaders);
    }
  }

  /**
   * Handle PDX status request
   * GET /pdx/v1/status
   */
  async handleStatus(request, corsHeaders) {
    if (request.method !== 'GET') {
      return this.createErrorResponse(405, 'Method Not Allowed', corsHeaders);
    }

    const status = {
      service: 'PDX API',
      version: '1.0',
      specification: 'PDX v1.0',
      status: 'active',
      pdxCore: this.pdxCore.getStatus(),
      capabilities: [
        'DNA_EXPORT',
        'DNA_IMPORT',
        'PACKAGE_VALIDATION',
        'SIGNATURE_VERIFICATION',
        'LICENSE_CHECKING',
        'ATTRIBUTION_TRACKING'
      ],
      supportedFormats: ['PDX-JSON'],
      supportedLicenses: ['CDCL'],
      encryptionSupport: ['AES-256-GCM', 'ECDSA-P256'],
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(status, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  /**
   * Handle license information request
   * GET /pdx/v1/licenses
   */
  async handleLicenses(request, corsHeaders) {
    const licenses = {
      supportedLicenses: [
        {
          type: 'CDCL',
          version: '1.0',
          name: 'ChittyDNA Contributor License',
          description: 'Standard license for AI DNA contributions with fair compensation',
          features: [
            'Attribution tracking',
            'Automatic compensation',
            'Portability rights',
            'Privacy protection'
          ],
          defaultTerms: {
            loyaltyRate: 0.05,
            minimumPayment: 0.01,
            paymentCurrency: 'USDC',
            paymentFrequency: 'MONTHLY'
          }
        }
      ],
      fairUseProvisions: {
        researchUse: true,
        personalUse: true,
        benchmarkUse: true,
        securityTesting: true,
        volumeLimits: {
          maxInferencesPerDay: 1000,
          maxDataSizeGB: 1.0
        }
      },
      customLicensing: {
        available: true,
        contact: 'licensing@chitty.cc'
      }
    };

    return new Response(JSON.stringify(licenses, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  /**
   * Authenticate PDX API request
   */
  async authenticateRequest(request) {
    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { success: false, error: 'Authentication token required' };
      }

      const token = authHeader.substring(7);

      // Validate with ChittyAuth (mock implementation)
      if (this.securityManager) {
        const validation = await this.securityManager.validateToken?.(token);
        if (validation?.valid) {
          return { success: true, chittyId: validation.chittyId };
        }
      }

      // Simple token validation for demo
      if (token.length > 10) {
        return { success: true, chittyId: 'authenticated-user' };
      }

      return { success: false, error: 'Invalid authentication token' };

    } catch (error) {
      return { success: false, error: 'Authentication failed: ' + error.message };
    }
  }

  /**
   * Collect DNA data for export
   */
  async collectDNAData(profileId, includePrivateData = false) {
    // Mock DNA data collection - in production would gather actual patterns
    const dnaData = {
      personaId: profileId,
      ownerChittyId: `owner_${profileId}`,
      domainExpertise: ['email-processing', 'ai-routing', 'document-analysis'],
      emailRoutingPatterns: {
        dimensions: 768,
        patterns: require("../utils/deterministic-vectors.js").generateDeterministicPatterns(Date.now(), 768)
      },
      routingConfidence: 0.87,
      aiResponsePatterns: includePrivateData ? {
        dimensions: 1024,
        patterns: require("../utils/deterministic-vectors.js").generateDeterministicPatterns(Date.now(), 1024)
      } : null,
      responseConfidence: 0.82,
      feedbackPatterns: {
        dimensions: 512,
        patterns: require("../utils/deterministic-vectors.js").generateDeterministicPatterns(Date.now(), 512)
      },
      feedbackConfidence: 0.79,
      contributions: [
        {
          type: 'TRAINING_DATA',
          domain: 'email-processing',
          role: 'CREATOR',
          attributionWeight: 1.0,
          loyaltyRate: 0.05,
          data: { samples: 1000, quality: 0.9 }
        }
      ],
      temporalSamples: [
        { timestamp: '2025-08-01', score: 0.85 },
        { timestamp: '2025-09-01', score: 0.87 }
      ],
      coherenceScore: 0.86,
      qualityScore: 0.89,
      validationScore: 0.91
    };

    return dnaData;
  }

  /**
   * Check license compatibility
   */
  async checkLicenseCompatibility(licenses) {
    // Simple compatibility check
    for (const license of licenses) {
      if (license.licenseType === 'CDCL') {
        return { compatible: true, license: license.licenseType };
      }
    }

    return {
      compatible: false,
      reason: 'No compatible license found. Only CDCL is currently supported.'
    };
  }

  /**
   * Import DNA data from PDX package
   */
  async importDNAData(pdxPackage, importPolicy) {
    // Mock implementation - would integrate with actual AI systems
    const importStats = {
      patternsImported: pdxPackage.dnaProfile.decisionPatterns.length,
      contributionsProcessed: pdxPackage.contributions.length,
      modelDeltasApplied: pdxPackage.dnaProfile.modelDeltas.length,
      privacyLevel: importPolicy,
      integrationStatus: 'successful'
    };

    console.log(`🧬 DNA imported: ${pdxPackage.header.packageId}`);

    return importStats;
  }

  /**
   * Setup attribution tracking for imported DNA
   */
  async setupAttributionTracking(pdxPackage) {
    // Setup tracking with financial services
    if (this.pdxCore.financialServices) {
      for (const contribution of pdxPackage.contributions) {
        // Create attribution record
        const attribution = {
          contributionId: contribution.contributionId,
          packageId: pdxPackage.header.packageId,
          loyaltyRate: contribution.attribution.loyaltyRate,
          paymentTerms: pdxPackage.licenses[0]?.compensationTerms
        };

        console.log(`💰 Attribution tracking setup: ${contribution.contributionId}`);
      }
    }
  }

  /**
   * Get stored PDX package (mock implementation)
   */
  async getStoredPackage(packageId) {
    // In production, would retrieve from persistent storage
    // For demo, return null (package not found)
    return null;
  }

  /**
   * Revoke PDX package
   */
  async revokePackage(packageId, reason, effectiveDate) {
    // Mock revocation implementation
    console.log(`🚫 Package revoked: ${packageId}, reason: ${reason}`);

    return {
      packageId,
      revoked: true,
      reason,
      effectiveDate: effectiveDate || new Date().toISOString(),
      notificationsSent: []
    };
  }

  /**
   * Create error response
   */
  createErrorResponse(status, message, headers = {}) {
    return new Response(JSON.stringify({
      error: message,
      status,
      timestamp: new Date().toISOString()
    }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });
  }
}

/**
 * PDX API Factory
 */
export class PDXApiFactory {
  static async createAPI(env) {
    const api = new PDXApi(env);
    await api.initialize();
    return api;
  }
}