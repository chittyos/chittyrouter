#!/usr/bin/env node

/**
 * Enhanced Session Sync Testing
 * Tests edge cases, error scenarios, and performance under load
 */

import fs from 'fs';
import path from 'path';

// Enhanced mock environment
const mockEnv = {
  PROJECT_ID: 'chittyrouter-enhanced-test',
  GITHUB_TOKEN: 'mock-enhanced-token',
  ENVIRONMENT: 'test',
  SESSION_REPO: 'chittychat-data',
  DATA_REPO: 'chittyos-data',
  SYNC_RETRY_COUNT: 3,
  SYNC_TIMEOUT_MS: 5000
};

// Enhanced GitHub API mock with failure scenarios
class EnhancedMockGitHub {
  constructor() {
    this.operations = [];
    this.failureCount = 0;
    this.shouldFail = false;
    this.latency = 0;
  }

  simulateFailure(enabled = true) {
    this.shouldFail = enabled;
  }

  simulateLatency(ms = 0) {
    this.latency = ms;
  }

  async _mockOperation(type, params) {
    if (this.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latency));
    }

    if (this.shouldFail && this.failureCount < 2) {
      this.failureCount++;
      throw new Error(`Simulated ${type} failure #${this.failureCount}`);
    }

    this.operations.push({ type, params, timestamp: Date.now() });
    return this._getMockResponse(type);
  }

  _getMockResponse(type) {
    switch (type) {
      case 'getRef':
        return { data: { object: { sha: 'mock-sha-' + Date.now() } } };
      case 'createRef':
        return { data: { ref: 'refs/heads/test-branch', object: { sha: 'mock-sha-' + Date.now() } } };
      case 'getContent':
        return { data: { content: Buffer.from('{}').toString('base64'), sha: 'mock-sha-' + Date.now() } };
      case 'createOrUpdateFile':
        return { data: { commit: { sha: 'mock-commit-' + Date.now() } } };
      default:
        return { data: {} };
    }
  }

  git = {
    getRef: async (params) => this._mockOperation('getRef', params),
    createRef: async (params) => this._mockOperation('createRef', params)
  };

  repos = {
    getContent: async (params) => this._mockOperation('getContent', params),
    createOrUpdateFileContents: async (params) => this._mockOperation('createOrUpdateFile', params)
  };
}

// Enhanced Session Sync Manager with error handling
class EnhancedSessionSyncManager {
  constructor(env) {
    this.env = env;
    this.github = new EnhancedMockGitHub();
    this.sessionRepo = env.SESSION_REPO;
    this.dataRepo = env.DATA_REPO;
    this.projectId = env.PROJECT_ID;
    this.sessionId = null;
    this.branch = null;
    this.retryCount = env.SYNC_RETRY_COUNT || 3;
    this.timeoutMs = env.SYNC_TIMEOUT_MS || 5000;

    // Performance metrics
    this.metrics = {
      operations: 0,
      failures: 0,
      retries: 0,
      totalLatency: 0,
      startTime: Date.now()
    };

    // Enhanced state with versioning
    this.state = {
      claude: { version: 1, data: {} },
      openai: { version: 1, data: {} },
      gemini: { version: 1, data: {} },
      notion: { version: 1, data: {} },
      neon: { version: 1, data: {} },
      cloudflare: { version: 1, data: {} }
    };

    // Conflict resolution strategy
    this.conflictResolution = 'last-writer-wins'; // or 'merge' or 'manual'
  }

  async initializeSession(sessionId = null) {
    this.sessionId = sessionId || `enhanced-test-${Date.now()}`;
    this.branch = `session/${this.projectId}/${this.sessionId}`;

    console.log(`🚀 Initializing enhanced session: ${this.sessionId}`);
    console.log(`🌿 Branch: ${this.branch}`);

    try {
      await this._withRetry(async () => {
        await this.github.git.createRef({
          owner: 'ChittyOS',
          repo: this.sessionRepo,
          ref: `refs/heads/${this.branch}`,
          sha: 'mock-main-sha'
        });
      });

      // Initialize session metadata with enhanced structure
      const sessionMetadata = {
        sessionId: this.sessionId,
        projectId: this.projectId,
        branch: this.branch,
        createdAt: new Date().toISOString(),
        version: 1,
        services: Object.keys(this.state),
        conflictResolution: this.conflictResolution,
        metrics: {
          initialized: true,
          operationCount: 0
        }
      };

      await this._commitToSession('.chittychat/session.json', sessionMetadata);

      return {
        sessionId: this.sessionId,
        branch: this.branch,
        metadata: sessionMetadata
      };
    } catch (error) {
      this.metrics.failures++;
      console.error(`❌ Session initialization failed:`, error.message);
      throw error;
    }
  }

  async saveState(service, data, options = {}) {
    const startTime = Date.now();

    try {
      // Enhanced state with conflict detection
      const currentState = this.state[service];
      const newVersion = currentState.version + 1;

      const stateData = {
        service,
        version: newVersion,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: data,
        metadata: {
          source: options.source || 'unknown',
          checksum: this._calculateChecksum(data),
          conflictResolution: options.conflictResolution || this.conflictResolution
        }
      };

      // Detect potential conflicts
      if (options.expectedVersion && options.expectedVersion !== currentState.version) {
        console.log(`⚠️ Potential conflict detected for ${service}:`);
        console.log(`  Expected version: ${options.expectedVersion}`);
        console.log(`  Current version: ${currentState.version}`);

        if (this.conflictResolution === 'strict') {
          throw new Error(`Conflict detected: version mismatch for ${service}`);
        }
      }

      await this._withRetry(async () => {
        await this._commitToSession(`state/${service}.json`, stateData);
      });

      // Update local state
      this.state[service] = {
        version: newVersion,
        data: stateData
      };

      const latency = Date.now() - startTime;
      this.metrics.totalLatency += latency;
      this.metrics.operations++;

      console.log(`💾 Enhanced state saved for ${service} (v${newVersion}) - ${latency}ms`);

      return {
        service,
        version: newVersion,
        latency,
        checksum: stateData.metadata.checksum
      };
    } catch (error) {
      this.metrics.failures++;
      console.error(`❌ Failed to save state for ${service}:`, error.message);
      throw error;
    }
  }

  async storeData(dataType, data, options = {}) {
    const startTime = Date.now();

    try {
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const dataId = options.id || `${dataType}-${Date.now()}`;
      const filePath = `data/${dataType}/${this.projectId}/${timestamp}/${dataId}.json`;

      const dataPackage = {
        id: dataId,
        type: dataType,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        data: data,
        metadata: {
          size: JSON.stringify(data).length,
          checksum: this._calculateChecksum(data),
          compression: options.compression || 'none'
        }
      };

      await this._withRetry(async () => {
        await this._commitToDataRepo(filePath, dataPackage);
      });

      const latency = Date.now() - startTime;
      this.metrics.totalLatency += latency;
      this.metrics.operations++;

      console.log(`📊 Enhanced data stored: ${dataType}/${dataId} - ${latency}ms`);

      return {
        dataType,
        dataId,
        filePath,
        latency,
        size: dataPackage.metadata.size
      };
    } catch (error) {
      this.metrics.failures++;
      console.error(`❌ Failed to store data ${dataType}:`, error.message);
      throw error;
    }
  }

  async _withRetry(operation, maxRetries = null) {
    const retries = maxRetries || this.retryCount;
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await Promise.race([
          operation(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Operation timeout')), this.timeoutMs)
          )
        ]);

        if (attempt > 1) {
          console.log(`✅ Retry successful on attempt ${attempt}`);
        }

        return result;
      } catch (error) {
        lastError = error;
        this.metrics.retries++;

        if (attempt < retries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`🔄 Retry ${attempt}/${retries} in ${backoffMs}ms: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw new Error(`Operation failed after ${retries} attempts: ${lastError.message}`);
  }

  async _commitToSession(filePath, data) {
    return this.github.repos.createOrUpdateFileContents({
      owner: 'ChittyOS',
      repo: this.sessionRepo,
      path: `projects/${this.projectId}/${filePath}`,
      message: `Enhanced sync: ${filePath}`,
      content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
      branch: this.branch
    });
  }

  async _commitToDataRepo(filePath, data) {
    return this.github.repos.createOrUpdateFileContents({
      owner: 'ChittyOS',
      repo: this.dataRepo,
      path: filePath,
      message: `Enhanced data: ${filePath}`,
      content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
      branch: `data-${this.projectId}`
    });
  }

  _calculateChecksum(data) {
    // Simple checksum for testing
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  getMetrics() {
    const runtime = Date.now() - this.metrics.startTime;
    return {
      ...this.metrics,
      runtime,
      avgLatency: this.metrics.operations > 0 ? this.metrics.totalLatency / this.metrics.operations : 0,
      successRate: this.metrics.operations > 0 ? (this.metrics.operations - this.metrics.failures) / this.metrics.operations : 0,
      operationsPerSecond: runtime > 0 ? (this.metrics.operations / runtime) * 1000 : 0
    };
  }
}

// Enhanced Vector Clock for distributed sync
class EnhancedVectorClock {
  constructor(nodeId, clock = {}) {
    this.nodeId = nodeId;
    this.clock = { ...clock };

    if (!(nodeId in this.clock)) {
      this.clock[nodeId] = 0;
    }
  }

  tick() {
    this.clock[this.nodeId]++;
    return this;
  }

  update(otherClock) {
    for (const [node, timestamp] of Object.entries(otherClock)) {
      this.clock[node] = Math.max(this.clock[node] || 0, timestamp);
    }
    this.tick(); // Increment own clock after update
    return this;
  }

  compare(otherClock) {
    let hasGreater = false;
    let hasLess = false;

    const allNodes = new Set([...Object.keys(this.clock), ...Object.keys(otherClock)]);

    for (const node of allNodes) {
      const thisClock = this.clock[node] || 0;
      const otherTimestamp = otherClock[node] || 0;

      if (thisClock > otherTimestamp) hasGreater = true;
      if (thisClock < otherTimestamp) hasLess = true;
    }

    if (hasGreater && !hasLess) return 1;  // This clock is ahead
    if (hasLess && !hasGreater) return -1; // Other clock is ahead
    if (!hasGreater && !hasLess) return 0; // Clocks are equal
    return null; // Concurrent/conflicting
  }

  isConcurrent(otherClock) {
    return this.compare(otherClock) === null;
  }

  toJSON() {
    return { ...this.clock };
  }
}

// Main test suite
async function runEnhancedTests() {
  console.log('============================================================');
  console.log('🧪 ENHANCED SESSION SYNC TESTING SUITE');
  console.log('============================================================');

  const manager = new EnhancedSessionSyncManager(mockEnv);

  // Test 1: Basic functionality with metrics
  console.log('\n📋 Test 1: Enhanced Session Initialization');
  const session = await manager.initializeSession();
  console.log(`✅ Session created with enhanced metadata:`, {
    sessionId: session.sessionId,
    version: session.metadata.version,
    services: session.metadata.services.length
  });

  // Test 2: State saving with conflict detection
  console.log('\n📋 Test 2: Enhanced State Management with Versioning');

  const stateResults = [];
  for (const service of ['claude', 'openai', 'gemini']) {
    const result = await manager.saveState(service, {
      activeSession: session.sessionId,
      timestamp: new Date().toISOString(),
      data: { test: `${service}-data`, value: Math.random() }
    }, {
      source: `${service}-api`,
      expectedVersion: 1
    });
    stateResults.push(result);
  }

  console.log(`✅ Enhanced state management completed:`, {
    services: stateResults.length,
    avgLatency: stateResults.reduce((sum, r) => sum + r.latency, 0) / stateResults.length,
    totalChecksums: stateResults.map(r => r.checksum).length
  });

  // Test 3: Data storage with enhanced metadata
  console.log('\n📋 Test 3: Enhanced Data Storage');

  const dataResults = [];
  for (const dataType of ['atomic_facts', 'evidence', 'transcripts']) {
    const result = await manager.storeData(dataType, {
      content: `Enhanced test ${dataType}`,
      metadata: { enhanced: true, testId: Date.now() }
    }, {
      id: `enhanced-${dataType}-001`,
      compression: 'gzip'
    });
    dataResults.push(result);
  }

  console.log(`✅ Enhanced data storage completed:`, {
    dataTypes: dataResults.length,
    totalSize: dataResults.reduce((sum, r) => sum + r.size, 0),
    avgLatency: dataResults.reduce((sum, r) => sum + r.latency, 0) / dataResults.length
  });

  // Test 4: Error handling and retry logic
  console.log('\n📋 Test 4: Error Handling and Retry Logic');

  manager.github.simulateFailure(true);

  try {
    await manager.saveState('test-service', { errorTest: true }, {
      source: 'error-test'
    });
    console.log('✅ Error handling: Recovered from simulated failures');
  } catch (error) {
    console.log('❌ Error handling failed:', error.message);
  }

  manager.github.simulateFailure(false);

  // Test 5: Performance under load
  console.log('\n📋 Test 5: Performance Testing');

  const loadTestStart = Date.now();
  const concurrentOps = [];

  for (let i = 0; i < 10; i++) {
    concurrentOps.push(
      manager.saveState(`load-test-${i}`, {
        iteration: i,
        data: new Array(100).fill(0).map(() => Math.random())
      }, {
        source: 'load-test'
      })
    );
  }

  const loadResults = await Promise.allSettled(concurrentOps);
  const loadTestDuration = Date.now() - loadTestStart;
  const successful = loadResults.filter(r => r.status === 'fulfilled').length;

  console.log(`✅ Load test completed:`, {
    operations: loadResults.length,
    successful,
    duration: `${loadTestDuration}ms`,
    successRate: `${(successful / loadResults.length * 100).toFixed(1)}%`
  });

  // Test 6: Distributed vector clocks
  console.log('\n📋 Test 6: Enhanced Distributed Vector Clocks');

  const node1 = new EnhancedVectorClock('chittyrouter-1');
  const node2 = new EnhancedVectorClock('chittyrouter-2');
  const node3 = new EnhancedVectorClock('claude-api');

  // Simulate distributed operations
  node1.tick().tick(); // [node1: 2]
  node2.tick(); // [node2: 1]
  node3.tick().tick().tick(); // [node3: 3]

  // Sync between nodes
  node1.update(node2.toJSON()); // node1 learns about node2
  node2.update(node3.toJSON()); // node2 learns about node3
  node1.update(node3.toJSON()); // node1 learns about node3

  console.log('Vector clock states:');
  console.log(`  Node 1: ${JSON.stringify(node1.toJSON())}`);
  console.log(`  Node 2: ${JSON.stringify(node2.toJSON())}`);
  console.log(`  Node 3: ${JSON.stringify(node3.toJSON())}`);

  // Test conflict detection
  const conflictClock = { 'chittyrouter-1': 1, 'claude-api': 5 };
  const comparison = node1.compare(conflictClock);
  console.log(`✅ Conflict detection: ${comparison === null ? 'Concurrent state detected' : 'No conflicts'}`);

  // Final metrics
  console.log('\n📊 Final Performance Metrics:');
  const finalMetrics = manager.getMetrics();
  console.log(`  Total Operations: ${finalMetrics.operations}`);
  console.log(`  Success Rate: ${(finalMetrics.successRate * 100).toFixed(1)}%`);
  console.log(`  Average Latency: ${finalMetrics.avgLatency.toFixed(1)}ms`);
  console.log(`  Operations/Second: ${finalMetrics.operationsPerSecond.toFixed(1)}`);
  console.log(`  Total Retries: ${finalMetrics.retries}`);
  console.log(`  Runtime: ${finalMetrics.runtime}ms`);

  console.log('\n============================================================');
  console.log('✅ ENHANCED SESSION SYNC TESTING COMPLETED');
  console.log(`📊 Session: ${session.sessionId}`);
  console.log(`🔄 Total GitHub Operations: ${manager.github.operations.length}`);
  console.log(`📈 Performance Score: ${(finalMetrics.successRate * 100).toFixed(1)}%`);
  console.log('============================================================');
}

// Run the enhanced tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runEnhancedTests().catch(console.error);
}

export { EnhancedSessionSyncManager, EnhancedVectorClock };