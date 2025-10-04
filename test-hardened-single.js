#!/usr/bin/env node

import { HardenedMintingService } from './src/minting/hardened-minting-service.js';

// Polyfill fetch if not available
if (!globalThis.fetch) {
  console.log('⚠️ Fetch not available, installing polyfill');
}

// Mock environment
const testEnv = {
  API_KEY: 'test-api-key',
  LEDGER_API: 'https://ledger.chitty.cc',
  EVIDENCE_API: 'https://evidence.chitty.cc',
  CHITTYID_SERVER: 'https://id.chitty.cc',
  SIGNING_KEY: 'test-signing-key-for-hmac',
  ENCRYPTION_KEY: 'test-encryption-key'
};

// Mock crypto
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

// Override fetch with mock
globalThis.fetch = async (url, options) => {
  console.log(`Mock call to: ${url}`);

  if (url.includes('id.chitty.cc') && url.includes('/validate/')) {
    console.log('Handling validation request');
    const chittyId = url.split('/').pop();
    return {
      ok: true,
      json: async () => ({
        valid: chittyId.startsWith('CE-'),
        chittyId,
        entityType: 'document',
        createdAt: new Date().toISOString(),
        metadata: { verified: true }
      })
    };
  }

  if (url.includes('id.chitty.cc/api/v1/generate')) {
    return {
      ok: true,
      json: async () => ({
        success: true,
        chittyId: `CE-TEST${Date.now()}`,
        entityType: 'document'
      })
    };
  }

  if (url.includes('/api/v1/secure/soft-mint')) {
    return {
      ok: true,
      json: async () => ({
        success: true,
        mintType: 'soft',
        storageLocation: 'off-chain/soft-vault',
        verificationUrl: 'https://evidence.chitty.cc/verify/soft-mint',
        timestamp: new Date().toISOString(),
        verificationHash: 'hash-' + Date.now()
      })
    };
  }

  if (url.includes('/api/v1/secure/hard-mint')) {
    return {
      ok: true,
      json: async () => ({
        success: true,
        mintType: 'hard',
        transactionHash: '0x' + Math.random().toString(16).substr(2, 64),
        blockNumber: Math.floor(Math.random() * 1000000),
        gasUsed: '21000',
        timestamp: new Date().toISOString(),
        verificationHash: 'hash-' + Date.now()
      })
    };
  }

  return { ok: false, status: 404 };
};

async function testSingle() {
  const service = new HardenedMintingService(testEnv);

  const validDoc = {
    chittyId: 'CE-12345678-DOC-1758362000',
    title: 'Test Document',
    content: 'Test content',
    type: 'evidence',
    mimeType: 'application/pdf',
    size: 1024
  };

  try {
    console.log('\nTesting document processing...');
    const result = await service.processDocument(validDoc);
    console.log('✅ Success:', result);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testSingle().catch(console.error);