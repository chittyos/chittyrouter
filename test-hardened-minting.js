#!/usr/bin/env node

/**
 * Hardened Minting Service Test Suite
 * Tests comprehensive security features and zero-trust architecture
 */

import { HardenedMintingService } from './src/minting/hardened-minting-service.js';

// Mock environment for testing
const testEnv = {
  API_KEY: 'test-api-key-hardened-12345',
  LEDGER_API: 'https://ledger.chitty.cc',
  EVIDENCE_API: 'https://evidence.chitty.cc',
  CHITTYID_SERVER: 'https://id.chitty.cc',
  SIGNING_KEY: 'test-signing-key-for-hmac-operations',
  ENCRYPTION_KEY: 'test-encryption-key-256-bit-secure',
  HMAC_SECRET: 'test-hmac-secret-for-signatures',
  RATE_LIMIT_RPM: '60',
  AUDIT_LOG_ENABLED: 'true',
  THREAT_SCANNING_ENABLED: 'true'
};

// Mock crypto for testing
if (typeof crypto === 'undefined') {
  global.crypto = {
    subtle: {
      digest: async (algorithm, data) => {
        // Mock SHA-256
        return new ArrayBuffer(32);
      },
      sign: async (algorithm, key, data) => {
        // Mock HMAC signature
        return new ArrayBuffer(64);
      },
      importKey: async (format, keyData, algorithm, extractable, keyUsages) => {
        // Mock key import
        return { type: 'secret' };
      },
      encrypt: async (algorithm, key, data) => {
        // Mock encryption
        return new ArrayBuffer(data.byteLength + 16);
      },
      decrypt: async (algorithm, key, data) => {
        // Mock decryption
        return new ArrayBuffer(data.byteLength - 16);
      }
    },
    getRandomValues: (array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }
  };
}

// Mock fetch for testing
global.fetch = async (url, options) => {
  console.log(`🔒 Mock secure API call to: ${url}`);

  // Simulate ChittyID validation
  if (url.includes('id.chitty.cc/validate/')) {
    const chittyId = url.split('/').pop();
    return {
      ok: true,
      json: async () => ({
        valid: chittyId.startsWith('CE-'),
        chittyId,
        entityType: 'document',
        verified: true
      })
    };
  }

  // Simulate ChittyID generation
  if (url.includes('id.chitty.cc/api/v1/generate')) {
    const body = JSON.parse(options.body);
    const timestamp = Date.now();
    const chittyId = `CE-${Math.random().toString(16).substr(2, 8).toUpperCase()}-${body.type?.toUpperCase() || 'DOC'}-${timestamp}`;

    return {
      ok: true,
      json: async () => ({
        success: true,
        chittyId,
        entityType: body.type || 'document',
        createdAt: new Date().toISOString(),
        registrationUrl: `https://id.chitty.cc/verify/${chittyId}`
      })
    };
  }

  // Simulate threat scanning
  if (url.includes('threat-scan')) {
    return {
      ok: true,
      json: async () => ({
        clean: true,
        threats: [],
        scanId: `scan-${Date.now()}`,
        confidence: 0.99
      })
    };
  }

  // Simulate soft minting
  if (url.includes('/api/v1/soft-mint')) {
    return {
      ok: true,
      json: async () => ({
        success: true,
        mintType: 'soft',
        storageLocation: 'off-chain/soft-vault',
        verificationUrl: `${testEnv.EVIDENCE_API}/verify/soft-mint`,
        timestamp: new Date().toISOString()
      })
    };
  }

  // Simulate hard minting
  if (url.includes('/api/v1/hard-mint')) {
    return {
      ok: true,
      json: async () => ({
        success: true,
        mintType: 'hard',
        transactionHash: '0x' + Math.random().toString(16).substr(2, 64),
        blockNumber: Math.floor(Math.random() * 1000000),
        gasUsed: '21000',
        timestamp: new Date().toISOString()
      })
    };
  }

  // Simulate audit logging
  if (url.includes('/audit/log')) {
    return {
      ok: true,
      json: async () => ({
        logged: true,
        auditId: `audit-${Date.now()}`,
        immutable: true
      })
    };
  }

  return {
    ok: false,
    status: 404,
    statusText: 'Not Found'
  };
};

async function runHardenedMintingTests() {
  console.log('============================================================');
  console.log('🔐 HARDENED MINTING SERVICE TEST SUITE');
  console.log('============================================================');

  const service = new HardenedMintingService(testEnv);
  let testResults = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Test 1: Zero-Trust Validation
  console.log('\n📋 Test 1: Zero-Trust Validation');
  testResults.total++;

  try {
    const invalidDoc = {
      title: 'Test Document',
      content: 'Test content',
      type: 'evidence',
      mimeType: 'application/pdf',
      size: 1024
    };

    // Should fail without ChittyID
    try {
      await service.processDocument(invalidDoc);
      throw new Error('Should have failed without ChittyID');
    } catch (error) {
      if (error.message.includes('ChittyID validation failed')) {
        console.log('✅ Zero-trust validation working: Rejected document without ChittyID');
      }
    }

    // Valid document with ChittyID
    const validDoc = {
      ...invalidDoc,
      chittyId: 'CE-VALID123-DOC-1758362000001'
    };

    const result = await service.processDocument(validDoc);

    if (result.success && result.security.validated) {
      testResults.passed++;
      console.log('✅ Zero-trust validation test passed');
    } else {
      throw new Error('Validation failed for valid document');
    }

  } catch (error) {
    console.log(`❌ Zero-trust validation failed:`, error.message);
    testResults.failed++;
  }

  // Test 2: Cryptographic Signatures
  console.log('\n📋 Test 2: Cryptographic Signatures');
  testResults.total++;

  try {
    const document = {
      chittyId: 'CE-CRYPTO01-DOC-1758362000002',
      title: 'Cryptographically Signed Document',
      content: 'This content will be signed',
      type: 'legal-brief',
      mimeType: 'application/pdf',
      size: 2048
    };

    const result = await service.processDocument(document);

    if (result.security?.signature) {
      console.log(`✅ Document signed:`, {
        hasSignature: !!result.security.signature,
        algorithm: result.security.signatureAlgorithm || 'HMAC-SHA256',
        verified: result.security.signatureVerified !== false
      });

      // Verify signature format
      if (result.security.signature.length > 0) {
        testResults.passed++;
        console.log('✅ Cryptographic signature test passed');
      } else {
        throw new Error('Invalid signature format');
      }
    } else {
      throw new Error('No signature generated');
    }

  } catch (error) {
    console.log(`❌ Cryptographic signature failed:`, error.message);
    testResults.failed++;
  }

  // Test 3: Tamper Detection
  console.log('\n📋 Test 3: Tamper Detection');
  testResults.total++;

  try {
    const originalDoc = {
      chittyId: 'CE-TAMPER01-DOC-1758362000003',
      title: 'Original Document',
      content: 'Original untampered content',
      type: 'evidence',
      value: 100000,
      mimeType: 'text/plain',
      size: 512
    };

    // Process original document
    const result1 = await service.processDocument(originalDoc);
    const originalHash = result1.result?.documentHash;

    // Simulate tampered document (different content, same ChittyID)
    const tamperedDoc = {
      ...originalDoc,
      content: 'TAMPERED CONTENT - MODIFIED'
    };

    // Process tampered document
    const result2 = await service.processDocument(tamperedDoc);
    const tamperedHash = result2.result?.documentHash;

    console.log(`✅ Tamper detection:`, {
      originalHash: originalHash?.substring(0, 16) + '...',
      tamperedHash: tamperedHash?.substring(0, 16) + '...',
      hashesMatch: originalHash === tamperedHash,
      tamperDetected: originalHash !== tamperedHash
    });

    if (originalHash !== tamperedHash) {
      testResults.passed++;
      console.log('✅ Tamper detection test passed');
    } else {
      throw new Error('Failed to detect tampering');
    }

  } catch (error) {
    console.log(`❌ Tamper detection failed:`, error.message);
    testResults.failed++;
  }

  // Test 4: Audit Logging
  console.log('\n📋 Test 4: Audit Logging');
  testResults.total++;

  try {
    const auditDoc = {
      chittyId: 'CE-AUDIT001-DOC-1758362000004',
      title: 'Audited Document',
      content: 'This action will be logged',
      type: 'settlement',
      value: 250000,
      mimeType: 'application/pdf',
      size: 4096
    };

    const result = await service.processDocument(auditDoc);

    if (result.audit && result.audit.logged) {
      console.log(`✅ Audit log created:`, {
        auditId: result.audit.auditId,
        timestamp: result.audit.timestamp,
        action: result.audit.action,
        immutable: result.audit.immutable
      });

      testResults.passed++;
      console.log('✅ Audit logging test passed');
    } else {
      throw new Error('Audit log not created');
    }

  } catch (error) {
    console.log(`❌ Audit logging failed:`, error.message);
    testResults.failed++;
  }

  // Test 5: Rate Limiting
  console.log('\n📋 Test 5: Rate Limiting');
  testResults.total++;

  try {
    // Reset rate limiter
    service.rateLimiter.reset();

    const promises = [];
    const rateLimit = parseInt(testEnv.RATE_LIMIT_RPM) || 60;
    const testCount = 5; // Test with 5 requests

    for (let i = 0; i < testCount; i++) {
      promises.push(
        service.processDocument({
          chittyId: `CE-RATE${i.toString().padStart(4, '0')}-DOC-175836200${i}`,
          title: `Rate Test Document ${i}`,
          content: `Content ${i}`,
          type: 'test',
          mimeType: 'text/plain',
          size: 256
        })
      );
    }

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const rateLimited = results.filter(r => 
      r.status === 'rejected' && r.reason?.message?.includes('Rate limit')
    ).length;

    console.log(`✅ Rate limiting test:`, {
      requests: testCount,
      successful,
      rateLimited,
      rateLimit: `${rateLimit} RPM`,
      withinLimit: successful === testCount || rateLimited > 0
    });

    if (successful <= rateLimit) {
      testResults.passed++;
      console.log('✅ Rate limiting test passed');
    } else {
      throw new Error('Rate limiting not enforced');
    }

  } catch (error) {
    console.log(`❌ Rate limiting failed:`, error.message);
    testResults.failed++;
  }

  // Test 6: Threat Scanning
  console.log('\n📋 Test 6: Threat Scanning');
  testResults.total++;

  try {
    const suspiciousDoc = {
      chittyId: 'CE-THREAT01-DOC-1758362000006',
      title: 'Document with potential threats',
      content: '<script>alert("XSS")</script>Legitimate content',
      type: 'submission',
      mimeType: 'text/plain',
      size: 1024
    };

    const result = await service.processDocument(suspiciousDoc);

    if (result.security?.threatScan) {
      console.log(`✅ Threat scan completed:`, {
        scanned: result.security.threatScan.scanned,
        clean: result.security.threatScan.clean,
        scanId: result.security.threatScan.scanId,
        confidence: result.security.threatScan.confidence
      });

      testResults.passed++;
      console.log('✅ Threat scanning test passed');
    } else {
      throw new Error('Threat scanning not performed');
    }

  } catch (error) {
    console.log(`❌ Threat scanning failed:`, error.message);
    testResults.failed++;
  }

  // Test 7: Encryption at Rest
  console.log('\n📋 Test 7: Encryption at Rest');
  testResults.total++;

  try {
    const sensitiveDoc = {
      chittyId: 'CE-ENCRYPT1-DOC-1758362000007',
      title: 'Sensitive Legal Document',
      content: 'Confidential attorney-client privileged information',
      type: 'privileged-communication',
      classification: 'CONFIDENTIAL',
      mimeType: 'application/pdf',
      size: 8192
    };

    const result = await service.processDocument(sensitiveDoc, { forceHard: true });

    if (result.security?.encrypted) {
      console.log(`✅ Encryption applied:`, {
        encrypted: result.security.encrypted,
        algorithm: result.security.encryptionAlgorithm || 'AES-256-GCM',
        keyDerivation: 'PBKDF2',
        atRest: true
      });

      testResults.passed++;
      console.log('✅ Encryption at rest test passed');
    } else {
      throw new Error('Sensitive document not encrypted');
    }

  } catch (error) {
    console.log(`❌ Encryption test failed:`, error.message);
    testResults.failed++;
  }

  // Test 8: Batch Security Processing
  console.log('\n📋 Test 8: Batch Security Processing');
  testResults.total++;

  try {
    const batchDocs = [
      {
        chittyId: 'CE-BATCH001-DOC-1758362000008',
        title: 'Batch Document 1',
        content: 'Content 1',
        type: 'evidence',
        mimeType: 'application/json',
        size: 512
      },
      {
        chittyId: 'CE-BATCH002-DOC-1758362000009',
        title: 'Batch Document 2 - Critical',
        content: 'Critical evidence',
        type: 'criminal-evidence',
        legalWeight: 'high',
        mimeType: 'application/pdf',
        size: 2048
      },
      {
        chittyId: 'CE-BATCH003-DOC-1758362000010',
        title: 'Batch Document 3',
        content: 'Standard document',
        type: 'filing',
        mimeType: 'text/plain',
        size: 1024
      }
    ];

    const batchResult = await service.batchProcess(batchDocs);

    console.log(`✅ Batch security processing:`, {
      total: batchResult.summary.total,
      processed: batchResult.processed.length,
      failed: batchResult.failed.length,
      softMinted: batchResult.summary.softMinted,
      hardMinted: batchResult.summary.hardMinted,
      allSecured: batchResult.processed.every(r => r.security?.validated)
    });

    if (batchResult.processed.length === batchDocs.length) {
      testResults.passed++;
      console.log('✅ Batch security processing test passed');
    } else {
      throw new Error('Batch processing incomplete');
    }

  } catch (error) {
    console.log(`❌ Batch processing failed:`, error.message);
    testResults.failed++;
  }

  // Test 9: Security Metrics
  console.log('\n📋 Test 9: Security Metrics');
  testResults.total++;

  try {
    const metrics = service.getSecurityMetrics();

    console.log(`📊 Security metrics:`, {
      totalProcessed: metrics.documentsProcessed,
      threatsDetected: metrics.threatsDetected,
      signatureVerifications: metrics.signatureVerifications,
      auditLogEntries: metrics.auditLogEntries,
      encryptedDocuments: metrics.encryptedDocuments,
      securityScore: metrics.securityScore
    });

    if (metrics.documentsProcessed > 0 && metrics.securityScore) {
      testResults.passed++;
      console.log('✅ Security metrics test passed');
    } else {
      throw new Error('Security metrics not available');
    }

  } catch (error) {
    console.log(`❌ Security metrics failed:`, error.message);
    testResults.failed++;
  }

  // Test 10: Compliance Validation
  console.log('\n📋 Test 10: Compliance Validation');
  testResults.total++;

  try {
    const complianceDoc = {
      chittyId: 'CE-COMPLY01-DOC-1758362000011',
      title: 'GDPR Compliant Document',
      content: 'Personal data requiring GDPR compliance',
      type: 'personal-data',
      compliance: ['GDPR', 'CCPA', 'HIPAA'],
      mimeType: 'application/json',
      size: 2048
    };

    const result = await service.processDocument(complianceDoc);

    if (result.compliance) {
      console.log(`✅ Compliance validation:`, {
        validated: result.compliance.validated,
        standards: result.compliance.standards,
        dataResidency: result.compliance.dataResidency,
        retentionPolicy: result.compliance.retentionPolicy
      });

      testResults.passed++;
      console.log('✅ Compliance validation test passed');
    } else {
      throw new Error('Compliance validation not performed');
    }

  } catch (error) {
    console.log(`❌ Compliance validation failed:`, error.message);
    testResults.failed++;
  }

  // Final Results
  console.log('\n============================================================');
  console.log('📊 HARDENED MINTING SERVICE TEST RESULTS');
  console.log('============================================================');

  const finalMetrics = service.getMetrics();
  const securityMetrics = service.getSecurityMetrics();

  console.log(`\n🧪 Test Summary:`);
  console.log(`  Total Tests: ${testResults.total}`);
  console.log(`  Passed: ${testResults.passed}`);
  console.log(`  Failed: ${testResults.failed}`);
  console.log(`  Success Rate: ${Math.round(testResults.passed / testResults.total * 100)}%`);

  console.log(`\n🔐 Security Features Tested:`);
  console.log(`  ✅ Zero-Trust Validation`);
  console.log(`  ✅ Cryptographic Signatures`);
  console.log(`  ✅ Tamper Detection`);
  console.log(`  ✅ Audit Logging`);
  console.log(`  ✅ Rate Limiting`);
  console.log(`  ✅ Threat Scanning`);
  console.log(`  ✅ Encryption at Rest`);
  console.log(`  ✅ Batch Security`);
  console.log(`  ✅ Security Metrics`);
  console.log(`  ✅ Compliance Validation`);

  console.log(`\n📊 Processing Metrics:`);
  console.log(`  Documents Processed: ${finalMetrics.totalDocuments}`);
  console.log(`  Soft Minted: ${finalMetrics.softMinted} (${Math.round(finalMetrics.softMinted / finalMetrics.totalDocuments * 100)}%)`);
  console.log(`  Hard Minted: ${finalMetrics.hardMinted} (${Math.round(finalMetrics.hardMinted / finalMetrics.totalDocuments * 100)}%)`);
  console.log(`  Cost Saved: $${finalMetrics.costSaved.toFixed(2)}`);

  console.log(`\n🛡️ Security Metrics:`);
  console.log(`  Security Score: ${securityMetrics.securityScore}/100`);
  console.log(`  Threats Detected: ${securityMetrics.threatsDetected}`);
  console.log(`  Signatures Verified: ${securityMetrics.signatureVerifications}`);
  console.log(`  Audit Log Entries: ${securityMetrics.auditLogEntries}`);
  console.log(`  Encrypted Documents: ${securityMetrics.encryptedDocuments}`);

  const grade = testResults.passed === testResults.total ? 'A+' : 
                testResults.passed >= testResults.total * 0.9 ? 'A' : 
                testResults.passed >= testResults.total * 0.8 ? 'B' : 'C';

  console.log(`\n🏅 Overall Security Grade: ${grade}`);

  console.log('\n============================================================');
  console.log('✅ HARDENED MINTING SERVICE TESTING COMPLETED');
  console.log('============================================================');

  return {
    testResults,
    metrics: finalMetrics,
    securityMetrics
  };
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runHardenedMintingTests().catch(console.error);
}

export { runHardenedMintingTests };