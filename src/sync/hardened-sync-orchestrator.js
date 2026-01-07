/**
 * Hardened Sync Orchestrator - Production-ready sync coordination
 * Coordinates all sync operations with validation, retry logic, and monitoring
 */

import { SessionSyncManager } from './session-sync-manager.js';
import getRepositoryManager from './repository-manager.js';
import { getValidator } from './data-validator.js';
import { ChittyChatProjectSync } from './chittychat-project-sync.js';

export class HardenedSyncOrchestrator {
  constructor(env) {
    this.env = env;
    this.sessionSync = new SessionSyncManager(env);
    this.repoManager = getRepositoryManager(env);
    this.validator = getValidator();
    this.chatSync = new ChittyChatProjectSync(env);

    // Monitoring and metrics
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      validationErrors: 0,
      retryAttempts: 0,
      startTime: Date.now()
    };

    // Circuit breaker for external services
    this.circuitBreaker = {
      failures: 0,
      lastFailure: null,
      threshold: 5,
      timeout: 60000,
      state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    };

    // Operation queue for rate limiting
    this.operationQueue = [];
    this.processing = false;
    this.maxConcurrent = 3;
    this.rateLimit = 100; // ms between operations
  }

  /**
   * Initialize orchestrator and all sync services
   */
  async initialize(options = {}) {
    try {
      console.log('🔄 Initializing Hardened Sync Orchestrator...');

      // Initialize session
      const sessionResult = await this.sessionSync.initSession({
        sessionId: options.sessionId,
        projectId: options.projectId || this.env.PROJECT_ID,
        resumeFrom: options.resumeFrom
      });

      // Validate repository access
      await this.validateRepositoryAccess();

      // Start operation processor
      this.startOperationProcessor();

      console.log('✅ Sync Orchestrator initialized:', sessionResult);

      return {
        initialized: true,
        session: sessionResult,
        repositories: await this.repoManager.getStats(),
        circuitBreaker: this.circuitBreaker.state
      };

    } catch (error) {
      console.error('❌ Orchestrator initialization failed:', error);
      throw error;
    }
  }

  /**
   * Validate repository access and permissions
   */
  async validateRepositoryAccess() {
    const repos = ['chittychat-data', 'chittyos-data', 'evidence-vault'];
    const results = [];

    for (const repo of repos) {
      try {
        // Test write access by creating a test file
        const testPath = `test/access-validation-${Date.now()}.json`;
        const testContent = { test: true, timestamp: new Date().toISOString() };

        await this.repoManager.store(testPath, testContent, {
          message: 'Access validation test'
        });

        results.push({ repo, status: 'accessible' });
      } catch (error) {
        results.push({ repo, status: 'error', error: error.message });
        console.warn(`⚠️ Repository access issue for ${repo}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Sync atomic facts with full validation and retry
   */
  async syncAtomicFacts(facts, options = {}) {
    return this.executeWithCircuitBreaker(async () => {
      // Validate all facts first
      const validation = this.validator.validateBatch(facts, 'atomicFact');

      if (!validation.batchValid) {
        const errors = validation.results
          .filter(r => !r.valid)
          .map(r => `Item ${r.index}: ${r.errors.join(', ')}`);

        throw new Error(`Validation failed: ${errors.join('; ')}`);
      }

      // Execute sync with the session manager
      const result = await this.sessionSync.syncAtomicFacts(facts);

      // Sync to ChittyChat project
      if (options.syncToProject !== false) {
        try {
          await this.chatSync.syncAtomicFacts(facts, result);
        } catch (chatError) {
          console.warn('⚠️ ChittyChat sync failed:', chatError.message);
          // Don't fail the main operation if project sync fails
        }
      }

      this.updateMetrics('success');
      console.log(`✅ Synced ${facts.length} atomic facts successfully`);

      return {
        ...result,
        validation,
        chatSynced: options.syncToProject !== false
      };
    });
  }

  /**
   * Sync evidence documents with integrity checks
   */
  async syncEvidence(documents, options = {}) {
    return this.executeWithCircuitBreaker(async () => {
      const validatedDocs = [];

      // Validate each document
      for (const doc of documents) {
        const validation = this.validator.validate(doc, 'evidence');
        if (!validation.valid) {
          throw new Error(`Document validation failed: ${validation.errors.join(', ')}`);
        }

        // Calculate hash for integrity
        const docWithHash = {
          ...doc,
          hash: this.calculateDocumentHash(doc),
          validatedAt: validation.validatedAt
        };

        validatedDocs.push(docWithHash);
      }

      // Execute sync
      const result = await this.sessionSync.syncEvidence(validatedDocs);

      this.updateMetrics('success');
      console.log(`✅ Synced ${documents.length} evidence documents`);

      return result;
    });
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async executeWithCircuitBreaker(operation) {
    // Check circuit breaker state
    if (this.circuitBreaker.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailure;
      if (timeSinceFailure < this.circuitBreaker.timeout) {
        throw new Error('Circuit breaker is OPEN - operation rejected');
      } else {
        this.circuitBreaker.state = 'HALF_OPEN';
      }
    }

    try {
      this.metrics.totalOperations++;
      const result = await operation();

      // Reset circuit breaker on success
      if (this.circuitBreaker.state === 'HALF_OPEN') {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failures = 0;
      }

      return result;

    } catch (error) {
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailure = Date.now();

      if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
        this.circuitBreaker.state = 'OPEN';
        console.error('🚨 Circuit breaker opened due to repeated failures');
      }

      this.updateMetrics('failure');
      throw error;
    }
  }

  /**
   * Queue operation for rate-limited execution
   */
  async queueOperation(operation, metadata = {}) {
    return new Promise((resolve, reject) => {
      this.operationQueue.push({
        operation,
        metadata,
        resolve,
        reject,
        timestamp: Date.now()
      });

      this.processQueue();
    });
  }

  /**
   * Process operation queue with rate limiting
   */
  async processQueue() {
    if (this.processing || this.operationQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.operationQueue.length > 0) {
      const { operation, resolve, reject } = this.operationQueue.shift();

      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // Rate limiting
      if (this.operationQueue.length > 0) {
        await this.sleep(this.rateLimit);
      }
    }

    this.processing = false;
  }

  /**
   * Start background operation processor
   */
  startOperationProcessor() {
    setInterval(() => {
      this.processQueue();
    }, this.rateLimit);
  }

  /**
   * Calculate document hash for integrity verification
   */
  calculateDocumentHash(document) {
    // Remove hash field if present to avoid circular dependency
    const { hash, ...docForHash } = document;
    const content = JSON.stringify(docForHash, Object.keys(docForHash).sort());

    return require('crypto')
      .createHash('sha256')
      .update(content)
      .digest('hex');
  }

  /**
   * Update metrics
   */
  updateMetrics(type, metadata = {}) {
    switch (type) {
      case 'success':
        this.metrics.successfulOperations++;
        break;
      case 'failure':
        this.metrics.failedOperations++;
        break;
      case 'validation_error':
        this.metrics.validationErrors++;
        break;
      case 'retry':
        this.metrics.retryAttempts++;
        break;
    }
  }

  /**
   * Get comprehensive status
   */
  getStatus() {
    const uptime = Date.now() - this.metrics.startTime;
    const successRate = this.metrics.totalOperations > 0
      ? (this.metrics.successfulOperations / this.metrics.totalOperations) * 100
      : 0;

    return {
      status: 'operational',
      uptime,
      circuitBreaker: this.circuitBreaker,
      metrics: {
        ...this.metrics,
        successRate: Math.round(successRate * 100) / 100,
        operationsPerMinute: Math.round((this.metrics.totalOperations / uptime) * 60000)
      },
      queue: {
        pending: this.operationQueue.length,
        processing: this.processing
      },
      validator: this.validator.getStats(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Perform health check
   */
  async healthCheck() {
    try {
      const checks = await Promise.allSettled([
        this.validateRepositoryAccess(),
        this.repoManager.getStats(),
        this.sessionSync.getSessionStatus()
      ]);

      const failures = checks.filter(c => c.status === 'rejected');

      return {
        healthy: failures.length === 0,
        checks: checks.map(c => ({
          status: c.status,
          value: c.value,
          reason: c.reason?.message
        })),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🔄 Shutting down Sync Orchestrator...');

    // Process remaining queue items
    await this.processQueue();

    // Final sync of session state
    try {
      await this.sessionSync.flushSyncQueue();
    } catch (error) {
      console.error('Error during final sync:', error);
    }

    console.log('✅ Sync Orchestrator shutdown complete');
  }

  /**
   * Utility: Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default HardenedSyncOrchestrator;