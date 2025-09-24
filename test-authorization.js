#!/usr/bin/env node

import { HardenedMintingService } from './src/minting/hardened-minting-service.js';
import crypto from 'node:crypto';

// Mock environment
const testEnv = {
  API_KEY: 'test-api-key-12345678901234567890123456789012',
  SERVICE_API_KEY: 'service-key-12345678901234567890123456789012',
  LEDGER_API: 'https://ledger.chitty.cc',
  EVIDENCE_API: 'https://evidence.chitty.cc',
  CHITTYID_SERVER: 'https://id.chitty.cc',
  SIGNING_KEY: 'test-signing-key',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  NODE_ENV: 'test',
  BYPASS_OWNERSHIP: true
};

// Mock crypto if needed
if (typeof crypto === 'undefined') {
  global.crypto = {
    subtle: {
      digest: async () => new ArrayBuffer(32),
      sign: async () => new ArrayBuffer(64),
      importKey: async () => ({ type: 'secret' }),
      encrypt: async (algo, key, data) => new ArrayBuffer(data.byteLength + 16),
      decrypt: async (algo, key, data) => new ArrayBuffer(data.byteLength - 16)
    },
    getRandomValues: (array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }
  };
}

// Mock fetch
globalThis.fetch = async (url, options) => {
  console.log(`Mock call to: ${url}`);

  // ChittyID validation
  if (url.includes('/validate/')) {
    const chittyId = url.split('/').pop();
    return {
      ok: true,
      json: async () => ({
        valid: chittyId.startsWith('CE-'),
        chittyId,
        entityType: 'document',
        createdAt: new Date().toISOString(),
        metadata: {
          verified: true,
          owner: 'user-123',
          documentHash: 'abc123'
        }
      })
    };
  }

  // ChittyID generation
  if (url.includes('/api/v1/generate')) {
    const body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        success: true,
        chittyId: `CE-${Date.now().toString(16).toUpperCase()}-DOC-${Date.now()}`,
        entityType: 'document',
        owner: body.owner,
        organization: body.organization
      })
    };
  }

  // ChittyID ownership
  if (url.includes('/ownership/')) {
    const chittyId = url.split('/').pop();
    const userId = options.headers['X-User-ID'];
    return {
      ok: true,
      json: async () => ({
        owner: userId === 'user-123' ? 'user-123' : 'other-user',
        delegates: [],
        createdAt: new Date().toISOString(),
        permissions: ['read', 'update']
      })
    };
  }

  // ChittyID metadata
  if (url.includes('/metadata/')) {
    const chittyId = url.split('/').pop();
    return {
      ok: true,
      json: async () => ({
        chittyId,
        entityType: 'document',
        owner: 'user-123',
        documentHash: 'original-hash-12345',
        type: 'evidence',
        createdAt: new Date().toISOString()
      })
    };
  }

  // Minting endpoints
  if (url.includes('/secure/soft-mint') || url.includes('/secure/hard-mint')) {
    return {
      ok: true,
      json: async () => ({
        success: true,
        mintType: url.includes('soft') ? 'soft' : 'hard',
        verificationHash: 'hash-' + Date.now(),
        timestamp: new Date().toISOString()
      })
    };
  }

  return { ok: false, status: 404 };
};

// Test scenarios
async function testAuthorization() {
  console.log('\n============================================================');
  console.log('🔐 AUTHORIZATION & OWNERSHIP TESTING');
  console.log('============================================================\n');

  const service = new HardenedMintingService(testEnv);

  // Test 1: No authentication provided
  console.log('🗺️ Test 1: No authentication (should use test mode)');
  try {
    const doc1 = {
      title: 'Test Document',
      content: 'Test content',
      type: 'evidence',
      mimeType: 'application/pdf',
      size: 1024
    };

    const result = await service.processDocument(doc1, {});
    console.log('✅ Processed without auth (test mode)');
    console.log('  ChittyID:', result.chittyId);
    console.log('  User:', result.authorization?.userId || 'test-user');
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 2: API Key authentication
  console.log('\n🗺️ Test 2: API Key authentication');
  try {
    const doc2 = {
      title: 'API Key Document',
      content: 'Content via API',
      type: 'filing',
      mimeType: 'text/plain',
      size: 512
    };

    const result = await service.processDocument(doc2, {
      apiKey: testEnv.API_KEY
    });
    console.log('✅ Processed with API key');
    console.log('  ChittyID:', result.chittyId);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 3: JWT authentication
  console.log('\n🗺️ Test 3: JWT authentication');
  try {
    // Create a mock JWT
    const payload = {
      sub: 'user-123',
      org: 'VanguardLaw',
      permissions: ['mint:document', 'validate:chittyid'],
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const mockJWT = 'header.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.signature';

    const doc3 = {
      title: 'JWT Authenticated Document',
      content: 'Secure content',
      type: 'settlement',
      mimeType: 'application/pdf',
      size: 2048
    };

    const result = await service.processDocument(doc3, {
      authToken: mockJWT
    });
    console.log('✅ Processed with JWT');
    console.log('  ChittyID:', result.chittyId);
    console.log('  Authenticated user:', payload.sub);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 4: Existing ChittyID with ownership
  console.log('\n🗺️ Test 4: Existing ChittyID with ownership verification');
  try {
    const existingChittyId = 'CE-12345678-DOC-1758362000';
    const payload = {
      sub: 'user-123',
      org: 'VanguardLaw',
      permissions: ['mint:document']
    };
    const mockJWT = 'header.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.signature';

    const doc4 = {
      chittyId: existingChittyId,
      title: 'Existing Document',
      content: 'Original content',
      type: 'evidence',
      mimeType: 'application/pdf',
      size: 1024
    };

    const result = await service.processDocument(doc4, {
      authToken: mockJWT
    });
    console.log('✅ Ownership verified for existing ChittyID');
    console.log('  ChittyID:', result.chittyId);
    console.log('  Owner:', payload.sub);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 5: Unauthorized origin
  console.log('\n🗺️ Test 5: Unauthorized origin (should fail)');
  try {
    const doc5 = {
      title: 'Unauthorized Origin',
      content: 'Should be rejected',
      type: 'evidence',
      mimeType: 'text/plain',
      size: 256
    };

    await service.processDocument(doc5, {
      origin: 'https://malicious-site.com',
      apiKey: testEnv.API_KEY
    });
    console.log('❌ Should have been rejected!');
  } catch (error) {
    console.log('✅ Correctly rejected:', error.message);
  }

  // Test 6: Content integrity check
  console.log('\n🗺️ Test 6: Content integrity check (modified content)');
  try {
    const existingChittyId = 'CE-87654321-DOC-1758362000';
    const doc6 = {
      chittyId: existingChittyId,
      title: 'Modified Document',
      content: 'This content has been changed!',  // Different from original
      type: 'evidence',
      mimeType: 'application/pdf',
      size: 2048
    };

    await service.processDocument(doc6, {
      apiKey: testEnv.API_KEY
    });
    console.log('❌ Should have detected content modification!');
  } catch (error) {
    console.log('✅ Content modification detected:', error.message);
  }

  console.log('\n============================================================');
  console.log('🎯 AUTHORIZATION TESTING COMPLETED');
  console.log('============================================================');
}

// Run tests
testAuthorization().catch(console.error);