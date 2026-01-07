#!/usr/bin/env node

/**
 * Test Session Sync Repository Configuration
 * Validates ChittyRouter uses correct repos for different purposes
 */

import fs from 'fs';

function testSessionSyncConfig() {
  console.log('🔍 Testing Session Sync Repository Configuration...\n');

  const sessionSyncPath = './src/sync/session-sync-manager.js';
  const sessionSyncContent = fs.readFileSync(sessionSyncPath, 'utf8');

  console.log('📂 Repository Configuration:');

  // Check for correct repository constants
  const hasSessionRepo = sessionSyncContent.includes("SESSION_REPO = 'chittychat-data'");
  const hasDataRepo = sessionSyncContent.includes("DATA_REPO = 'chittyos-data'");

  console.log(`  ${hasSessionRepo ? '✅' : '❌'} chittychat-data for project management`);
  console.log(`  ${hasDataRepo ? '✅' : '❌'} chittyos-data for data storage`);

  // Check for proper separation of concerns
  const hasStoreDataMethod = sessionSyncContent.includes('async storeData(');
  const hasCommitFileMethod = sessionSyncContent.includes('async commitFile(');
  const hasCommitFileToRepoMethod = sessionSyncContent.includes('async commitFileToRepo(');

  console.log('\n🔧 Method Implementation:');
  console.log(`  ${hasStoreDataMethod ? '✅' : '❌'} storeData() method for chittyos-data`);
  console.log(`  ${hasCommitFileMethod ? '✅' : '❌'} commitFile() method for chittychat-data`);
  console.log(`  ${hasCommitFileToRepoMethod ? '✅' : '❌'} commitFileToRepo() generic method`);

  // Check for proper repository usage
  const usesDataRepoForStorage = sessionSyncContent.includes('Store data in chittyos-data');
  const usesSessionRepoForManagement = sessionSyncContent.includes('project management');

  console.log('\n📋 Usage Patterns:');
  console.log(`  ${usesDataRepoForStorage ? '✅' : '❌'} Data storage in chittyos-data`);
  console.log(`  ${usesSessionRepoForManagement ? '✅' : '❌'} Project management in chittychat-data`);

  // Check documentation
  const hasCorrectDocumentation = sessionSyncContent.includes('Uses chittychat-data repo for project management');

  console.log('\n📚 Documentation:');
  console.log(`  ${hasCorrectDocumentation ? '✅' : '❌'} Correct repository usage documented`);

  // Summary
  const allChecks = [
    hasSessionRepo,
    hasDataRepo,
    hasStoreDataMethod,
    hasCommitFileMethod,
    hasCommitFileToRepoMethod,
    usesDataRepoForStorage,
    usesSessionRepoForManagement,
    hasCorrectDocumentation
  ];

  const passedChecks = allChecks.filter(Boolean).length;
  const totalChecks = allChecks.length;

  console.log(`\n📊 Overall Score: ${passedChecks}/${totalChecks} checks passed`);

  if (passedChecks === totalChecks) {
    console.log('✅ Session Sync Repository Configuration: PERFECT');
    console.log('\n🎯 Repository Separation:');
    console.log('  📦 chittychat-data: Project management, sessions, collaboration');
    console.log('  💾 chittyos-data: Actual data storage, facts, evidence');
    return true;
  } else {
    console.log('⚠️ Session Sync Repository Configuration: NEEDS IMPROVEMENT');
    return false;
  }
}

// Test other sync modules too
function testOtherSyncModules() {
  console.log('\n🔍 Testing Other Sync Modules...\n');

  const syncFiles = [
    './src/sync/chittychat-project-sync.js',
    './src/sync/distributed-session-sync.js',
    './src/sync/notion-atomic-facts-sync.js'
  ];

  for (const file of syncFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      const fileName = file.split('/').pop();

      console.log(`📄 ${fileName}:`);

      // Check for hardcoded endpoints vs service discovery
      const hasHardcodedEndpoints = content.includes('https://') && !content.includes('discovery');
      const usesServiceDiscovery = content.includes('ServiceDiscovery') || content.includes('getEndpointForCapability');

      console.log(`  ${!hasHardcodedEndpoints ? '✅' : '⚠️'} No hardcoded endpoints: ${!hasHardcodedEndpoints}`);
      console.log(`  ${usesServiceDiscovery ? '✅' : '⚠️'} Uses service discovery: ${usesServiceDiscovery}`);
    }
  }
}

// Run tests
const sessionSyncPassed = testSessionSyncConfig();
testOtherSyncModules();

console.log('\n' + '='.repeat(60));
console.log(sessionSyncPassed ? '✅ ALL REPOSITORY CONFIGURATIONS VERIFIED' : '❌ REPOSITORY CONFIGURATION NEEDS FIXES');
console.log('='.repeat(60));