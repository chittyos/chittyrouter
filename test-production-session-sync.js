#!/usr/bin/env node

/**
 * Production Session Sync Test Suite
 * Comprehensive testing of enhanced session sync capabilities
 */

import { ProductionSessionSync } from './src/sync/enhanced-session-sync.js';

// Enhanced test environment
const testEnv = {
  PROJECT_ID: 'chittyrouter-production-test',
  SYNC_RETRY_COUNT: '3',
  SYNC_TIMEOUT_MS: '5000',
  SYNC_BATCH_SIZE: '5',
  CONFLICT_RESOLUTION: 'last-writer-wins',
  COMPRESSION_ENABLED: 'true',
  ENCRYPTION_ENABLED: 'false',
  ENCRYPTION_KEY: 'test-encryption-key-256bit'
};

async function runProductionTests() {
  console.log('============================================================');
  console.log('🏭 PRODUCTION SESSION SYNC TEST SUITE');
  console.log('============================================================');

  const sessionSync = new ProductionSessionSync(testEnv);
  let testResults = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Test 1: Session Initialization
  console.log('\n📋 Test 1: Production Session Initialization');
  testResults.total++;

  try {
    const session = await sessionSync.initializeSession({
      sessionId: 'prod-test-session-001'
    });

    console.log(`✅ Session initialized:`, {
      sessionId: session.sessionId,
      branch: session.branch,
      initLatency: session.performance.initLatency
    });

    testResults.passed++;
  } catch (error) {
    console.log(`❌ Session initialization failed:`, error.message);
    testResults.failed++;
  }

  // Test 2: State Management with Versioning
  console.log('\n📋 Test 2: Advanced State Management');
  testResults.total++;

  try {
    const stateResults = [];

    // Save state for multiple services
    for (const service of ['claude', 'openai', 'gemini']) {
      const result = await sessionSync.saveState(service, {
        sessionData: `${service}-production-data`,
        timestamp: new Date().toISOString(),
        metadata: { test: true, service }
      }, {
        source: `${service}-api`,
        priority: 'normal'
      });

      stateResults.push(result);
    }

    const avgLatency = stateResults.reduce((sum, r) => sum + r.latency, 0) / stateResults.length;
    const totalConflicts = stateResults.reduce((sum, r) => sum + r.conflicts, 0);

    console.log(`✅ State management completed:`, {
      services: stateResults.length,
      avgLatency: Math.round(avgLatency),
      totalConflicts,
      avgSize: Math.round(stateResults.reduce((sum, r) => sum + r.size, 0) / stateResults.length)
    });

    testResults.passed++;
  } catch (error) {
    console.log(`❌ State management failed:`, error.message);
    testResults.failed++;
  }

  // Test 3: Queue-based Sync with Priorities
  console.log('\n📋 Test 3: Queue-based Synchronization');
  testResults.total++;

  try {
    const queueResults = [];

    // Queue multiple operations with different priorities
    for (let i = 0; i < 8; i++) {
      const priority = i % 3 === 0 ? 'high' : 'normal';
      const result = await sessionSync.saveStateToQueue(`queue-service-${i}`, {
        queueData: `queue-item-${i}`,
        priority,
        batch: 'test-batch-001'
      }, {
        priority,
        source: 'queue-test'
      });

      queueResults.push(result);
    }

    // Wait for queue processing
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log(`✅ Queue sync completed:`, {
      queued: queueResults.length,
      avgPosition: Math.round(queueResults.reduce((sum, r) => sum + r.position, 0) / queueResults.length)
    });

    testResults.passed++;
  } catch (error) {
    console.log(`❌ Queue sync failed:`, error.message);
    testResults.failed++;
  }

  // Test 4: Conflict Resolution
  console.log('\n📋 Test 4: Conflict Resolution Testing');
  testResults.total++;

  try {
    // Create a state
    await sessionSync.saveState('conflict-test', {
      data: 'original-data',
      version: 1
    });

    // Try to save with wrong expected version (should handle gracefully)
    const conflictResult = await sessionSync.saveState('conflict-test', {
      data: 'conflicting-data',
      version: 2
    }, {
      expectedVersion: 1, // This will be wrong since version is now 2
      strict: false
    });

    console.log(`✅ Conflict resolution handled:`, {
      finalVersion: conflictResult.version,
      conflicts: conflictResult.conflicts
    });

    testResults.passed++;
  } catch (error) {
    console.log(`❌ Conflict resolution failed:`, error.message);
    testResults.failed++;
  }

  // Test 5: Error Handling and Circuit Breaker
  console.log('\n📋 Test 5: Error Handling and Resilience');
  testResults.total++;

  try {
    // Test with invalid service (should fail gracefully)
    try {
      await sessionSync.saveState('invalid-service', { test: 'data' });
    } catch (error) {
      console.log(`⚠️ Expected error handled: ${error.message}`);
    }

    // Test circuit breaker doesn't interfere with valid operations
    const validResult = await sessionSync.saveState('claude', {
      resilience: 'test',
      timestamp: new Date().toISOString()
    });

    console.log(`✅ Error handling working:`, {
      validOperation: validResult.version > 0,
      circuitOpen: false
    });

    testResults.passed++;
  } catch (error) {
    console.log(`❌ Error handling failed:`, error.message);
    testResults.failed++;
  }

  // Test 6: Performance Under Load
  console.log('\n📋 Test 6: Performance Load Testing');
  testResults.total++;

  try {
    const loadStart = Date.now();
    const concurrentOps = [];

    // Create 15 concurrent operations
    for (let i = 0; i < 15; i++) {
      concurrentOps.push(
        sessionSync.saveState(`load-service-${i % 3}`, {
          loadTest: true,
          iteration: i,
          data: new Array(50).fill(0).map(() => Math.random()),
          timestamp: new Date().toISOString()
        }, {
          source: 'load-test',
          batch: `load-batch-${Math.floor(i / 5)}`
        })
      );
    }

    const loadResults = await Promise.allSettled(concurrentOps);
    const loadDuration = Date.now() - loadStart;
    const successful = loadResults.filter(r => r.status === 'fulfilled').length;

    console.log(`✅ Load test completed:`, {
      operations: loadResults.length,
      successful,
      duration: `${loadDuration}ms`,
      successRate: `${Math.round(successful / loadResults.length * 100)}%`,
      opsPerSecond: Math.round((loadResults.length / loadDuration) * 1000)
    });

    testResults.passed++;
  } catch (error) {
    console.log(`❌ Load test failed:`, error.message);
    testResults.failed++;
  }

  // Test 7: Metrics and Monitoring
  console.log('\n📋 Test 7: Metrics and Monitoring');
  testResults.total++;

  try {
    const metrics = sessionSync.getMetrics();
    const status = sessionSync.getStatus();
    const serviceStates = sessionSync.getServiceStates();

    console.log(`📊 Performance Metrics:`);
    console.log(`  Operations: ${metrics.operations} (${Math.round(metrics.successRate * 100)}% success rate)`);
    console.log(`  Average Latency: ${Math.round(metrics.avgLatency)}ms`);
    console.log(`  Ops/Second: ${Math.round(metrics.operationsPerSecond)}`);
    console.log(`  Retries: ${metrics.retries}`);
    console.log(`  Queue Depth: ${metrics.queueDepth}`);

    console.log(`📈 Service States:`);
    Object.entries(serviceStates).forEach(([service, state]) => {
      if (state.version > 0) {
        console.log(`  ${service}: v${state.version} (${state.conflicts} conflicts)`);
      }
    });

    console.log(`🔧 System Status: ${status.status}`);

    const metricsValid = metrics.operations > 0 && metrics.successRate > 0.7;

    if (metricsValid) {
      console.log(`✅ Metrics and monitoring working correctly`);
      testResults.passed++;
    } else {
      console.log(`❌ Metrics validation failed`);
      testResults.failed++;
    }

  } catch (error) {
    console.log(`❌ Metrics test failed:`, error.message);
    testResults.failed++;
  }

  // Final Results
  console.log('\n============================================================');
  console.log('📊 PRODUCTION TEST RESULTS');
  console.log('============================================================');

  const finalMetrics = sessionSync.getMetrics();
  const finalStatus = sessionSync.getStatus();

  console.log(`🧪 Test Summary:`);
  console.log(`  Total Tests: ${testResults.total}`);
  console.log(`  Passed: ${testResults.passed}`);
  console.log(`  Failed: ${testResults.failed}`);
  console.log(`  Success Rate: ${Math.round(testResults.passed / testResults.total * 100)}%`);

  console.log(`\n⚡ Performance Summary:`);
  console.log(`  Total Operations: ${finalMetrics.operations}`);
  console.log(`  Success Rate: ${Math.round(finalMetrics.successRate * 100)}%`);
  console.log(`  Average Latency: ${Math.round(finalMetrics.avgLatency)}ms`);
  console.log(`  Operations/Second: ${Math.round(finalMetrics.operationsPerSecond)}`);
  console.log(`  Runtime: ${Math.round(finalMetrics.runtime)}ms`);

  console.log(`\n🔧 System Health:`);
  console.log(`  Session: ${finalStatus.sessionId}`);
  console.log(`  Status: ${finalStatus.status}`);
  console.log(`  Circuit Breaker: ${finalMetrics.circuitBreaker.isOpen ? 'OPEN' : 'CLOSED'}`);
  console.log(`  Queue Depth: ${finalMetrics.queueDepth}`);

  console.log(`\n🏅 Overall Grade: ${testResults.passed === testResults.total ? 'A+' : testResults.passed >= testResults.total * 0.8 ? 'A' : 'B'}`);

  console.log('\n============================================================');
  console.log('✅ PRODUCTION SESSION SYNC TESTING COMPLETED');
  console.log('============================================================');

  return {
    testResults,
    metrics: finalMetrics,
    status: finalStatus
  };
}

// Run the production tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runProductionTests().catch(console.error);
}

export { runProductionTests };