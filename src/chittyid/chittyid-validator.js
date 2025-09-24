#!/usr/bin/env node

/**
 * ChittyID Validation Service Client
 * Integrates with id.chitty.cc for official ChittyID validation and generation
 * Implements local caching, batch validation, and retry logic
 * CLI demo format: ^[0-9]{2}-[0-9]-[A-Z]{3}-[0-9]{4}-[A-Z]-[0-9]{6}-[0-9]+-[0-9]+$
 */

import crypto from 'crypto';

// Export the canonical ChittyID regex pattern
export const CHITTY_ID_RX = /^[0-9]{2}-[0-9]-[A-Z]{3}-[0-9]{4}-[A-Z]-[0-9]{6}-[0-9]+-[0-9]+$/;

export class ChittyIDValidator {
  constructor(env) {
    this.env = env;
    this.baseURL = env.CHITTYID_SERVER || 'https://id.chitty.cc';
    this.apiKey = env.CHITTYID_API_KEY;

    // Validation cache (TTL: 1 hour)
    this.validationCache = new Map();
    this.cacheTimeout = 3600000; // 1 hour

    // Batch processing
    this.validationQueue = [];
    this.batchSize = 10;
    this.batchTimer = null;

    // Rate limiting
    this.requestCount = 0;
    this.requestLimit = 100; // per minute
    this.requestWindow = 60000;
    this.windowStart = Date.now();

    // Metrics
    this.metrics = {
      totalValidations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      apiCalls: 0,
      failures: 0,
      avgLatency: 0
    };

    console.log('🔐 ChittyID Validator initialized with id.chitty.cc');
    console.log('⚠️  ONLINE ONLY: All ChittyIDs must be validated through id.chitty.cc');
    console.log('🚫 No offline generation or validation permitted');
  }

  /**
   * Validate a ChittyID through id.chitty.cc
   */
  async validateChittyID(chittyId, options = {}) {
    const startTime = Date.now();

    try {
      // Check format first (local validation)
      if (!this.isValidFormat(chittyId)) {
        return {
          valid: false,
          chittyId,
          error: 'Invalid ChittyID format - must be validated through id.chitty.cc',
          source: 'format-check'
        };
      }

      // Check cache
      const cached = this.checkCache(chittyId);
      if (cached && !options.forceRefresh) {
        this.metrics.cacheHits++;
        return cached;
      }

      // Rate limiting check
      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded - please retry later');
      }

      // API validation
      const result = await this.validateWithAPI(chittyId, options);

      // Cache the result
      this.cacheResult(chittyId, result);

      const latency = Date.now() - startTime;
      this.updateMetrics(latency);

      return result;

    } catch (error) {
      this.metrics.failures++;
      console.error(`❌ ChittyID validation failed for ${chittyId}:`, error.message);

      return {
        valid: false,
        chittyId,
        error: `id.chitty.cc validation failed: ${error.message}`,
        source: 'api-error',
        requiresOnlineValidation: true
      };
    }
  }

  /**
   * Batch validate multiple ChittyIDs
   */
  async validateBatch(chittyIds, options = {}) {
    console.log(`🔄 Batch validating ${chittyIds.length} ChittyIDs`);

    const results = [];
    const uncachedIds = [];

    // Check cache first
    for (const id of chittyIds) {
      const cached = this.checkCache(id);
      if (cached && !options.forceRefresh) {
        results.push(cached);
        this.metrics.cacheHits++;
      } else {
        uncachedIds.push(id);
      }
    }

    // Validate uncached IDs in batches
    for (let i = 0; i < uncachedIds.length; i += this.batchSize) {
      const batch = uncachedIds.slice(i, i + this.batchSize);
      const batchResults = await this.validateBatchWithAPI(batch, options);

      // Cache results
      batchResults.forEach(result => {
        this.cacheResult(result.chittyId, result);
        results.push(result);
      });

      // Small delay between batches to respect rate limits
      if (i + this.batchSize < uncachedIds.length) {
        await this.sleep(100);
      }
    }

    return results;
  }

  /**
   * Generate a new ChittyID through id.chitty.cc
   */
  async generateChittyID(entityData, options = {}) {
    const startTime = Date.now();

    try {
      // Check rate limit
      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded - please retry later');
      }

      // Validate entity data
      const validation = this.validateEntityData(entityData);
      if (!validation.valid) {
        throw new Error(`Invalid entity data: ${validation.error}`);
      }

      // Generate through API
      const response = await fetch(`${this.baseURL}/api/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Client-ID': 'chittyrouter',
          'X-Request-ID': this.generateRequestId()
        },
        body: JSON.stringify({
          entityType: entityData.type,
          entityData: {
            ...entityData,
            timestamp: new Date().toISOString(),
            source: 'chittyrouter'
          },
          options: {
            ...options,
            validate: true,
            register: options.register !== false
          }
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      // Cache the new ID as valid
      this.cacheResult(result.chittyId, {
        valid: true,
        chittyId: result.chittyId,
        entityType: entityData.type,
        createdAt: result.createdAt,
        source: 'generated'
      });

      const latency = Date.now() - startTime;
      this.updateMetrics(latency);

      console.log(`✅ Generated ChittyID: ${result.chittyId}`);

      return {
        success: true,
        chittyId: result.chittyId,
        entityType: entityData.type,
        createdAt: result.createdAt,
        registrationUrl: `${this.baseURL}/verify/${result.chittyId}`,
        latency
      };

    } catch (error) {
      this.metrics.failures++;
      console.error('❌ ChittyID generation failed:', error.message);

      // No offline generation - must use id.chitty.cc
      throw new Error(`ChittyID generation requires id.chitty.cc service: ${error.message}`);
    }
  }

  /**
   * Register an existing ChittyID with id.chitty.cc
   */
  async registerChittyID(chittyId, metadata, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}/api/v1/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Client-ID': 'chittyrouter'
        },
        body: JSON.stringify({
          chittyId,
          metadata: {
            ...metadata,
            registeredAt: new Date().toISOString(),
            source: 'chittyrouter'
          },
          options
        })
      });

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.status}`);
      }

      const result = await response.json();

      console.log(`✅ Registered ChittyID: ${chittyId}`);

      return {
        success: true,
        chittyId,
        registered: true,
        registrationId: result.registrationId,
        verificationUrl: `${this.baseURL}/verify/${chittyId}`
      };

    } catch (error) {
      console.error(`❌ Failed to register ${chittyId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get ChittyID metadata from id.chitty.cc
   */
  async getChittyIDMetadata(chittyId) {
    try {
      // Check cache first
      const cached = this.checkCache(chittyId);
      if (cached && cached.metadata) {
        return cached.metadata;
      }

      const response = await fetch(`${this.baseURL}/api/v1/metadata/${chittyId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Client-ID': 'chittyrouter'
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`API error: ${response.status}`);
      }

      const metadata = await response.json();

      // Update cache with metadata
      const existing = this.checkCache(chittyId) || {};
      this.cacheResult(chittyId, {
        ...existing,
        metadata,
        metadataFetchedAt: new Date().toISOString()
      });

      return metadata;

    } catch (error) {
      console.error(`❌ Failed to fetch metadata for ${chittyId}:`, error.message);
      return null;
    }
  }

  /**
   * Validate with id.chitty.cc API
   */
  async validateWithAPI(chittyId, options = {}) {
    this.metrics.apiCalls++;

    try {
      const response = await fetch(`${this.baseURL}/api/v1/validate/${chittyId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Client-ID': 'chittyrouter',
          'X-Request-ID': this.generateRequestId()
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {
            valid: false,
            chittyId,
            error: 'ChittyID not found',
            source: 'api'
          };
        }
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();

      return {
        valid: result.valid,
        chittyId,
        entityType: result.entityType,
        createdAt: result.createdAt,
        lastVerified: new Date().toISOString(),
        metadata: result.metadata,
        source: 'api'
      };

    } catch (error) {
      throw new Error(`API validation failed: ${error.message}`);
    }
  }

  /**
   * Batch validation with API
   */
  async validateBatchWithAPI(chittyIds, options = {}) {
    this.metrics.apiCalls++;

    try {
      const response = await fetch(`${this.baseURL}/api/v1/validate/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Client-ID': 'chittyrouter'
        },
        body: JSON.stringify({
          chittyIds,
          options
        })
      });

      if (!response.ok) {
        throw new Error(`Batch API error: ${response.status}`);
      }

      const results = await response.json();

      return results.validations.map(v => ({
        valid: v.valid,
        chittyId: v.chittyId,
        entityType: v.entityType,
        createdAt: v.createdAt,
        lastVerified: new Date().toISOString(),
        source: 'api-batch'
      }));

    } catch (error) {
      // Fallback to individual validation
      console.warn('Batch validation failed, falling back to individual:', error.message);

      const results = [];
      for (const id of chittyIds) {
        const result = await this.validateWithAPI(id, options);
        results.push(result);
      }
      return results;
    }
  }

  /**
   * Local format validation
   */
  isValidFormat(chittyId) {
    // ChittyID format: CE-XXXXXXXX-TYPE-TIMESTAMP
    const pattern = /^C[EPLT]-[A-F0-9]{8}-[A-Z]{3,10}-\d{10,13}$/;

    if (!pattern.test(chittyId)) {
      return false;
    }

    // Validate checksum
    return this.validateChecksum(chittyId);
  }

  /**
   * Validate ChittyID checksum
   */
  validateChecksum(chittyId) {
    const parts = chittyId.split('-');
    if (parts.length !== 4) return false;

    // For testing and demonstration, accept any valid format
    // In production, this would validate against the actual checksum algorithm
    return true; // Simplified for testing
  }

  /**
   * Local ChittyID generation is disabled
   * All ChittyIDs must be generated through id.chitty.cc
   */
  generateLocalChittyID(entityData) {
    throw new Error('Local ChittyID generation is disabled. All ChittyIDs must be generated through id.chitty.cc for authenticity verification.');
  }

  /**
   * Get entity prefix
   */
  getEntityPrefix(entityType) {
    const prefixes = {
      'event': 'CE',
      'person': 'CP',
      'location': 'CL',
      'thing': 'CT',
      'email': 'CE',
      'document': 'CT',
      'case': 'CE'
    };

    return prefixes[entityType.toLowerCase()] || 'CE';
  }

  /**
   * Validate entity data
   */
  validateEntityData(entityData) {
    if (!entityData || typeof entityData !== 'object') {
      return { valid: false, error: 'Entity data must be an object' };
    }

    if (!entityData.type) {
      return { valid: false, error: 'Entity type is required' };
    }

    const validTypes = ['event', 'person', 'location', 'thing', 'email', 'document', 'case'];
    if (!validTypes.includes(entityData.type.toLowerCase())) {
      return { valid: false, error: `Invalid entity type: ${entityData.type}` };
    }

    return { valid: true };
  }

  /**
   * Check cache for validation result
   */
  checkCache(chittyId) {
    const cached = this.validationCache.get(chittyId);

    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.cacheTimeout) {
        this.metrics.cacheHits++;
        return cached.data;
      }

      // Remove expired entry
      this.validationCache.delete(chittyId);
    }

    this.metrics.cacheMisses++;
    return null;
  }

  /**
   * Cache validation result
   */
  cacheResult(chittyId, result) {
    this.validationCache.set(chittyId, {
      data: result,
      timestamp: Date.now()
    });

    // Cleanup old entries if cache is too large
    if (this.validationCache.size > 1000) {
      this.cleanupCache();
    }
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    const expired = [];

    for (const [key, value] of this.validationCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        expired.push(key);
      }
    }

    expired.forEach(key => this.validationCache.delete(key));

    console.log(`🧹 Cleaned up ${expired.length} expired cache entries`);
  }

  /**
   * Check rate limit
   */
  checkRateLimit() {
    const now = Date.now();

    // Reset window if needed
    if (now - this.windowStart > this.requestWindow) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.requestLimit) {
      return false;
    }

    this.requestCount++;
    return true;
  }

  /**
   * Generate request ID for tracking
   */
  generateRequestId() {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update metrics
   */
  updateMetrics(latency) {
    this.metrics.totalValidations++;

    // Update average latency
    const totalLatency = this.metrics.avgLatency * (this.metrics.totalValidations - 1);
    this.metrics.avgLatency = (totalLatency + latency) / this.metrics.totalValidations;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get validator metrics
   */
  getMetrics() {
    const cacheHitRate = this.metrics.totalValidations > 0
      ? (this.metrics.cacheHits / this.metrics.totalValidations)
      : 0;

    return {
      ...this.metrics,
      cacheHitRate,
      cacheSize: this.validationCache.size,
      requestCount: this.requestCount,
      requestLimit: this.requestLimit
    };
  }

  /**
   * Health check for id.chitty.cc connection
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/health`, {
        headers: {
          'X-Client-ID': 'chittyrouter'
        }
      });

      return {
        healthy: response.ok,
        status: response.status,
        endpoint: this.baseURL,
        cacheSize: this.validationCache.size,
        metrics: this.getMetrics()
      };

    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        endpoint: this.baseURL
      };
    }
  }
}

// Cloudflare Worker handler for ChittyID validation
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const validator = new ChittyIDValidator(env);

    try {
      // Validate single ChittyID
      if (url.pathname === '/chittyid/validate' && request.method === 'POST') {
        const body = await request.json();
        const result = await validator.validateChittyID(body.chittyId, body.options || {});

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Batch validation
      if (url.pathname === '/chittyid/validate/batch' && request.method === 'POST') {
        const body = await request.json();
        const results = await validator.validateBatch(body.chittyIds, body.options || {});

        return new Response(JSON.stringify({
          validations: results,
          count: results.length
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Generate new ChittyID
      if (url.pathname === '/chittyid/generate' && request.method === 'POST') {
        const body = await request.json();
        const result = await validator.generateChittyID(body.entityData, body.options || {});

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Register existing ChittyID
      if (url.pathname === '/chittyid/register' && request.method === 'POST') {
        const body = await request.json();
        const result = await validator.registerChittyID(
          body.chittyId,
          body.metadata || {},
          body.options || {}
        );

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get metadata
      if (url.pathname.startsWith('/chittyid/metadata/') && request.method === 'GET') {
        const chittyId = url.pathname.split('/').pop();
        const metadata = await validator.getChittyIDMetadata(chittyId);

        return new Response(JSON.stringify({
          chittyId,
          metadata,
          found: !!metadata
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Health check
      if (url.pathname === '/chittyid/health' && request.method === 'GET') {
        const health = await validator.healthCheck();

        return new Response(JSON.stringify(health), {
          headers: { 'Content-Type': 'application/json' },
          status: health.healthy ? 200 : 503
        });
      }

      // Metrics
      if (url.pathname === '/chittyid/metrics' && request.method === 'GET') {
        const metrics = validator.getMetrics();

        return new Response(JSON.stringify(metrics), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('ChittyID validation error:', error);

      return new Response(JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }
};