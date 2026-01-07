#!/usr/bin/env node

/**
 * ChittyID Validation Test Suite
 * Tests integration with id.chitty.cc service
 */

import { ChittyIDValidator } from './src/chittyid/chittyid-validator.js';

// Mock environment for testing
const testEnv = {
  CHITTYID_SERVER: 'https://id.chitty.cc',
  CHITTYID_API_KEY: 'test-api-key-12345',
  PROJECT_ID: 'chittyrouter-test'
};

// Mock fetch for testing without real API calls
global.fetch = async (url, options) => {
  console.log(`🔍 Mock API call to: ${url}`);

  // Simulate API responses
  if (url.includes('/validate/')) {
    const chittyId = url.split('/').pop();

    // Simulate valid IDs
    if (chittyId.startsWith('CE-') || chittyId.startsWith('CP-')) {
      return {
        ok: true,
        json: async () => ({
          valid: true,
          chittyId,
          entityType: 'event',
          createdAt: new Date().toISOString(),
          metadata: {
            verified: true,
            registeredBy: 'chittyrouter'
          }
        })
      };
    }

    // Simulate invalid ID
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found'
    };
  }

  if (url.includes('/validate/batch')) {
    const body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        validations: body.chittyIds.map(id => ({
          valid: id.startsWith('C'),
          chittyId: id,
          entityType: 'event',
          createdAt: new Date().toISOString()
        }))
      })
    };
  }

  if (url.includes('/generate')) {
    const body = JSON.parse(options.body);
    const timestamp = Date.now();
    const chittyId = `CE-${Math.random().toString(16).substr(2, 8).toUpperCase()}-${body.entityData.type.toUpperCase()}-${timestamp}`;

    return {
      ok: true,
      json: async () => ({
        chittyId,
        entityType: body.entityData.type,
        createdAt: new Date().toISOString()
      })
    };
  }

  if (url.includes('/register')) {
    const body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        success: true,
        chittyId: body.chittyId,
        registrationId: `reg-${Date.now()}`,
        registered: true
      })
    };
  }

  if (url.includes('/metadata/')) {
    const chittyId = url.split('/').pop();
    return {
      ok: true,
      json: async () => ({
        chittyId,
        entityType: 'event',
        createdAt: new Date().toISOString(),
        metadata: {
          source: 'test',
          verified: true
        }
      })
    };
  }

  if (url.includes('/health')) {
    return {
      ok: true,
      status: 200
    };
  }

  return {
    ok: false,
    status: 404,
    statusText: 'Not Found'
  };
};

async function runChittyIDTests() {
  console.log('============================================================');
  console.log('🔐 CHITTYID VALIDATION TEST SUITE');
  console.log('============================================================');

  const validator = new ChittyIDValidator(testEnv);
  let testResults = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Test 1: Single ChittyID Validation
  console.log('\n📋 Test 1: Single ChittyID Validation');
  testResults.total++;

  try {
    // Test valid ChittyID
    const validId = 'CE-A1B2C3D4-EMAIL-1758362000000';
    const validResult = await validator.validateChittyID(validId);

    console.log(`✅ Valid ChittyID test:`, {
      chittyId: validId,
      valid: validResult.valid,
      source: validResult.source
    });

    // Test invalid ChittyID
    const invalidId = 'INVALID-ID-12345';
    const invalidResult = await validator.validateChittyID(invalidId);

    console.log(`✅ Invalid ChittyID test:`, {
      chittyId: invalidId,
      valid: invalidResult.valid,
      error: invalidResult.error
    });

    if (validResult.valid && !invalidResult.valid) {
      testResults.passed++;
      console.log('✅ Single validation test passed');
    } else {
      throw new Error('Validation logic error');
    }

  } catch (error) {
    console.log(`❌ Single validation failed:`, error.message);
    testResults.failed++;
  }

  // Test 2: Batch Validation
  console.log('\n📋 Test 2: Batch ChittyID Validation');
  testResults.total++;

  try {
    const batchIds = [
      'CE-11111111-EMAIL-1758362000001',
      'CP-22222222-PERSON-1758362000002',
      'CL-33333333-LOCATION-1758362000003',
      'CT-44444444-THING-1758362000004',
      'INVALID-ID-BATCH'
    ];

    const batchResults = await validator.validateBatch(batchIds);

    const validCount = batchResults.filter(r => r.valid).length;
    const invalidCount = batchResults.filter(r => !r.valid).length;

    console.log(`✅ Batch validation completed:`, {
      total: batchIds.length,
      valid: validCount,
      invalid: invalidCount
    });

    if (validCount === 4 && invalidCount === 1) {
      testResults.passed++;
      console.log('✅ Batch validation test passed');
    } else {
      throw new Error('Batch validation count mismatch');
    }

  } catch (error) {
    console.log(`❌ Batch validation failed:`, error.message);
    testResults.failed++;
  }

  // Test 3: ChittyID Generation
  console.log('\n📋 Test 3: ChittyID Generation');
  testResults.total++;

  try {
    const entityData = {
      type: 'email',
      from: 'test@example.com',
      subject: 'Test Email',
      timestamp: new Date().toISOString()
    };

    const generateResult = await validator.generateChittyID(entityData);

    console.log(`✅ Generated ChittyID:`, {
      chittyId: generateResult.chittyId,
      entityType: generateResult.entityType,
      registrationUrl: generateResult.registrationUrl
    });

    if (generateResult.success && generateResult.chittyId) {
      testResults.passed++;
      console.log('✅ ChittyID generation test passed');
    } else {
      throw new Error('Generation failed');
    }

  } catch (error) {
    console.log(`❌ ChittyID generation failed:`, error.message);
    testResults.failed++;
  }

  // Test 4: ChittyID Registration
  console.log('\n📋 Test 4: ChittyID Registration');
  testResults.total++;

  try {
    const chittyIdToRegister = 'CE-TESTREG1-EMAIL-1758362000999';
    const metadata = {
      source: 'test-suite',
      caseId: 'TEST-CASE-001',
      verified: false
    };

    const registerResult = await validator.registerChittyID(chittyIdToRegister, metadata);

    console.log(`✅ Registered ChittyID:`, {
      chittyId: registerResult.chittyId,
      registered: registerResult.registered,
      verificationUrl: registerResult.verificationUrl
    });

    if (registerResult.success && registerResult.registered) {
      testResults.passed++;
      console.log('✅ ChittyID registration test passed');
    } else {
      throw new Error('Registration failed');
    }

  } catch (error) {
    console.log(`❌ ChittyID registration failed:`, error.message);
    testResults.failed++;
  }

  // Test 5: Cache Performance
  console.log('\n📋 Test 5: Cache Performance');
  testResults.total++;

  try {
    const testId = 'CE-CACHE001-EMAIL-1758362000111';

    // First call (cache miss)
    const firstCall = await validator.validateChittyID(testId);

    // Second call (should be cached)
    const secondCall = await validator.validateChittyID(testId);

    const metrics = validator.getMetrics();

    console.log(`📊 Cache metrics:`, {
      cacheHits: metrics.cacheHits,
      cacheMisses: metrics.cacheMisses,
      cacheHitRate: Math.round(metrics.cacheHitRate * 100) + '%',
      cacheSize: metrics.cacheSize
    });

    if (metrics.cacheHits > 0) {
      testResults.passed++;
      console.log('✅ Cache performance test passed');
    } else {
      throw new Error('Cache not working');
    }

  } catch (error) {
    console.log(`❌ Cache test failed:`, error.message);
    testResults.failed++;
  }

  // Test 6: Metadata Retrieval
  console.log('\n📋 Test 6: Metadata Retrieval');
  testResults.total++;

  try {
    const metadataId = 'CE-META0001-EMAIL-1758362000222';
    const metadata = await validator.getChittyIDMetadata(metadataId);

    console.log(`✅ Retrieved metadata:`, {
      chittyId: metadataId,
      found: !!metadata,
      verified: metadata?.metadata?.verified
    });

    if (metadata && metadata.entityType) {
      testResults.passed++;
      console.log('✅ Metadata retrieval test passed');
    } else {
      throw new Error('Metadata not found');
    }

  } catch (error) {
    console.log(`❌ Metadata retrieval failed:`, error.message);
    testResults.failed++;
  }

  // Test 7: Health Check
  console.log('\n📋 Test 7: Health Check');
  testResults.total++;

  try {
    const health = await validator.healthCheck();

    console.log(`🔧 Health status:`, {
      healthy: health.healthy,
      endpoint: health.endpoint,
      cacheSize: health.cacheSize
    });

    if (health.healthy) {
      testResults.passed++;
      console.log('✅ Health check test passed');
    } else {
      throw new Error('Service unhealthy');
    }

  } catch (error) {
    console.log(`❌ Health check failed:`, error.message);
    testResults.failed++;
  }

  // Test 8: Rate Limiting
  console.log('\n📋 Test 8: Rate Limiting');
  testResults.total++;

  try {
    // Test rate limiting doesn't block normal usage
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        validator.validateChittyID(`CE-RATE${i}000-EMAIL-175836200${i}000`)
      );
    }

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;

    console.log(`✅ Rate limiting test:`, {
      requests: promises.length,
      successful,
      requestCount: validator.requestCount,
      requestLimit: validator.requestLimit
    });

    if (successful === promises.length) {
      testResults.passed++;
      console.log('✅ Rate limiting test passed');
    } else {
      throw new Error('Rate limiting too restrictive');
    }

  } catch (error) {
    console.log(`❌ Rate limiting test failed:`, error.message);
    testResults.failed++;
  }

  // Final Results
  console.log('\n============================================================');
  console.log('📊 CHITTYID VALIDATION TEST RESULTS');
  console.log('============================================================');

  const finalMetrics = validator.getMetrics();

  console.log(`🧪 Test Summary:`);
  console.log(`  Total Tests: ${testResults.total}`);
  console.log(`  Passed: ${testResults.passed}`);
  console.log(`  Failed: ${testResults.failed}`);
  console.log(`  Success Rate: ${Math.round(testResults.passed / testResults.total * 100)}%`);

  console.log(`\n📊 Validation Metrics:`);
  console.log(`  Total Validations: ${finalMetrics.totalValidations}`);
  console.log(`  Cache Hits: ${finalMetrics.cacheHits}`);
  console.log(`  Cache Hit Rate: ${Math.round(finalMetrics.cacheHitRate * 100)}%`);
  console.log(`  API Calls: ${finalMetrics.apiCalls}`);
  console.log(`  Average Latency: ${Math.round(finalMetrics.avgLatency)}ms`);

  console.log(`\n🔐 ChittyID Service:`);
  console.log(`  Endpoint: ${testEnv.CHITTYID_SERVER}`);
  console.log(`  Cache Size: ${finalMetrics.cacheSize}`);
  console.log(`  Request Count: ${finalMetrics.requestCount}/${finalMetrics.requestLimit}`);

  console.log(`\n🏅 Overall Grade: ${testResults.passed === testResults.total ? 'A+' : testResults.passed >= testResults.total * 0.8 ? 'A' : 'B'}`);

  console.log('\n============================================================');
  console.log('✅ CHITTYID VALIDATION TESTING COMPLETED');
  console.log('============================================================');

  return {
    testResults,
    metrics: finalMetrics
  };
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runChittyIDTests().catch(console.error);
}

export { runChittyIDTests };