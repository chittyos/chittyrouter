#!/usr/bin/env node

import { VerifiableRandomMinting } from './src/minting/verifiable-random-minting.js';

// Mock environment
const testEnv = {
  USE_DRAND: 'true'
};

// Mock fetch to simulate drand responses
globalThis.fetch = async (url) => {
  console.log(`🌐 Fetching: ${url}`);

  // Mock latest randomness
  if (url.includes('/public/latest')) {
    const mockRound = Math.floor(Date.now() / 30000); // Simulate 30s rounds
    return {
      ok: true,
      json: async () => ({
        round: mockRound,
        randomness: crypto.randomBytes(32).toString('hex'),
        signature: crypto.randomBytes(48).toString('hex'),
        previous_signature: crypto.randomBytes(48).toString('hex')
      })
    };
  }

  // Mock specific round
  if (url.match(/\/public\/\d+/)) {
    const round = parseInt(url.split('/').pop());
    return {
      ok: true,
      json: async () => ({
        round,
        randomness: crypto.randomBytes(32).toString('hex'),
        signature: crypto.randomBytes(48).toString('hex')
      })
    };
  }

  // Mock chain info
  if (url.includes('/info')) {
    return {
      ok: true,
      json: async () => ({
        public_key: '868f005eb8e6e4ca0a47c8a77ceaa5309a47978a7c71bc5cce96366b5d7a569937c529eeda66c7293784a9402801af31',
        period: 30,
        genesis_time: 1595431050,
        hash: '8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce',
        schemeID: 'pedersen-bls-chained',
        metadata: { beaconID: 'default' }
      })
    };
  }

  return { ok: false, status: 404 };
};

import crypto from 'crypto';

async function testVerifiableRandomness() {
  console.log('\n============================================================');
  console.log('🎲 VERIFIABLE RANDOM MINTING TEST');
  console.log('============================================================\n');

  const service = new VerifiableRandomMinting(testEnv);

  // Test 1: Get latest randomness
  console.log('🎆 Test 1: Fetching latest randomness from drand beacon');
  try {
    const randomness = await service.getLatestRandomness();
    console.log('✅ Latest randomness retrieved:');
    console.log(`  Round: ${randomness.round}`);
    console.log(`  Randomness: ${randomness.randomness.substring(0, 32)}...`);
    console.log(`  Endpoint: ${randomness.endpoint}`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 2: Get chain info
  console.log('\n🎆 Test 2: Getting drand chain information');
  try {
    const info = await service.getChainInfo();
    console.log('✅ Chain info retrieved:');
    console.log(`  Period: ${info.period} seconds`);
    console.log(`  Genesis: ${new Date(info.genesisTime * 1000).toISOString()}`);
    console.log(`  Chain Hash: ${info.hash?.substring(0, 32)}...`);
  } catch (error) {
    console.log('❌ Failed:', error.message);
  }

  // Test 3: Make verifiable minting decisions
  console.log('\n🎆 Test 3: Making verifiable minting decisions');
  
  const testDocuments = [
    { title: 'Document 1', type: 'filing', size: 1024 },
    { title: 'Document 2', type: 'evidence', size: 2048 },
    { title: 'Document 3', type: 'settlement', size: 4096, value: 75000 },
    { title: 'Document 4', type: 'criminal-evidence', size: 8192 },
    { title: 'Document 5', type: 'contract', size: 512 }
  ];

  for (const doc of testDocuments) {
    try {
      const decision = await service.determineVerifiableMintingStrategy(doc);
      console.log(`\n  Document: ${doc.title} (${doc.type})`);
      console.log(`    Strategy: ${decision.strategy.toUpperCase()}`);
      console.log(`    Reason: ${decision.reason}`);
      console.log(`    Verifiable: ${decision.verifiable}`);
      if (decision.randomness) {
        console.log(`    Random Value: ${decision.randomness.value?.toFixed(2)}`);
        console.log(`    drand Round: ${decision.randomness.round}`);
      }
    } catch (error) {
      console.log(`  ❌ Error for ${doc.title}:`, error.message);
    }
  }

  // Test 4: Verify distribution over many decisions
  console.log('\n🎆 Test 4: Verifying distribution (100 decisions)');
  
  // Disable drand for speed
  service.config.useVerifiableRandomness = false;
  
  for (let i = 0; i < 100; i++) {
    const doc = {
      title: `Test Doc ${i}`,
      type: 'standard',
      size: 1024
    };
    await service.determineVerifiableMintingStrategy(doc);
  }

  const metrics = service.getMetrics();
  console.log('\n📊 Distribution Results:');
  console.log(`  Total Decisions: ${metrics.totalDecisions}`);
  console.log(`  Soft Minting: ${metrics.softDecisions} (${metrics.softPercentage}%)`);
  console.log(`  Hard Minting: ${metrics.hardDecisions} (${metrics.hardPercentage}%)`);
  console.log(`  Target: 99% soft / 1% hard`);

  // Check if distribution is reasonable (allowing for randomness)
  const hardRate = parseFloat(metrics.hardPercentage);
  if (hardRate >= 0 && hardRate <= 5) {
    console.log(`  ✅ Distribution within acceptable range`);
  } else {
    console.log(`  ⚠️ Distribution outside expected range`);
  }

  // Test 5: Verify past decision
  console.log('\n🎆 Test 5: Verifying past minting decision');
  
  // Re-enable verifiable randomness
  service.config.useVerifiableRandomness = true;
  
  try {
    // Make a decision
    const doc = { title: 'Verifiable Doc', type: 'evidence', size: 2048 };
    const decision = await service.determineVerifiableMintingStrategy(doc);
    
    if (decision.randomness) {
      // Now verify it
      const docHash = await service.hashDocument(doc);
      const verification = await service.verifyPastDecision(
        docHash,
        decision.randomness.round,
        decision.strategy
      );

      console.log('\n  Verification Result:');
      console.log(`    Valid: ${verification.valid}`);
      console.log(`    Document Hash: ${docHash.substring(0, 16)}...`);
      console.log(`    Round: ${verification.round}`);
      console.log(`    Expected: ${verification.expectedStrategy}`);
      console.log(`    Actual: ${verification.actualStrategy}`);

      if (verification.valid) {
        console.log('  ✅ Past decision successfully verified!');
      } else {
        console.log('  ❌ Verification failed');
      }
    }
  } catch (error) {
    console.log('❌ Verification test failed:', error.message);
  }

  // Test 6: Current round calculation
  console.log('\n🎆 Test 6: Current drand round calculation');
  const currentRound = service.getCurrentRound();
  console.log(`  Current Round (calculated): ${currentRound}`);
  console.log(`  Time since genesis: ${Math.floor((Date.now()/1000 - service.drand.genesisTime) / 60)} minutes`);
  console.log(`  Rounds occur every: ${service.drand.period} seconds`);

  console.log('\n============================================================');
  console.log('🎯 VERIFIABLE RANDOM MINTING TEST COMPLETED');
  console.log('============================================================');

  console.log('\n💡 Key Benefits of Verifiable Randomness:');
  console.log('  1. Provably fair soft/hard minting decisions');
  console.log('  2. Cryptographically verifiable using drand beacon');
  console.log('  3. Cannot be manipulated or predicted in advance');
  console.log('  4. Publicly auditable through League of Entropy');
  console.log('  5. Maintains 99/1 distribution with transparency');
}

// Run test
testVerifiableRandomness().catch(console.error);