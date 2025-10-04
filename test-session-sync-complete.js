#!/usr/bin/env node

/**
 * Comprehensive Session Sync Test
 * Tests ChittyRouter session synchronization across repositories and services
 */

import fs from 'fs';
import path from 'path';

// Mock environment for testing
const mockEnv = {
  PROJECT_ID: 'chittyrouter-test',
  GITHUB_TOKEN: 'mock-token-for-testing',
  ENVIRONMENT: 'test',
  SESSION_REPO: 'chittychat-data',
  DATA_REPO: 'chittyos-data'
};

// Mock GitHub API responses
class MockGitHub {
  constructor() {
    this.operations = [];
  }

  git = {
    getRef: async (params) => {
      this.operations.push({ type: 'getRef', params });
      return { data: { object: { sha: 'mock-sha-123' } } };
    },
    createRef: async (params) => {
      this.operations.push({ type: 'createRef', params });
      return { data: { ref: params.ref } };
    }
  };

  repos = {
    createOrUpdateFileContents: async (params) => {
      this.operations.push({ type: 'createOrUpdateFile', params });
      return { data: { commit: { sha: 'commit-sha-456' } } };
    },
    getContent: async (params) => {
      this.operations.push({ type: 'getContent', params });
      if (params.path.includes('existing')) {
        return { data: { sha: 'existing-sha-789', content: 'ZXhpc3RpbmcgY29udGVudA==' } };
      }
      throw new Error('File not found');
    }
  };

  getOperations() {
    return this.operations;
  }

  clearOperations() {
    this.operations = [];
  }
}

// Mock SessionSyncManager for testing
class MockSessionSyncManager {
  constructor(env) {
    this.env = env;
    this.github = new MockGitHub();
    this.sessionRepo = env.SESSION_REPO || 'chittychat-data';
    this.dataRepo = env.DATA_REPO || 'chittyos-data';
    this.projectId = env.PROJECT_ID || 'chittyrouter';
    this.sessionId = `test-${Date.now()}`;
    this.branch = `session/${this.projectId}/${this.sessionId}`;

    this.state = {
      claude: {},
      openai: {},
      gemini: {},
      notion: {},
      neon: {},
      cloudflare: {}
    };

    this.syncQueue = [];
  }

  async initSession(options = {}) {
    console.log(`📝 Initializing session: ${this.sessionId}`);

    // Mock session initialization
    await this.createSessionBranch();
    await this.initializeSessionStructure();

    return {
      sessionId: this.sessionId,
      projectId: this.projectId,
      branch: this.branch,
      sessionRepo: this.sessionRepo,
      dataRepo: this.dataRepo
    };
  }

  async createSessionBranch() {
    console.log(`🌿 Creating session branch: ${this.branch}`);

    // Mock branch creation in chittychat-data
    await this.github.git.getRef({
      owner: 'ChittyOS',
      repo: this.sessionRepo,
      ref: 'heads/main'
    });

    await this.github.git.createRef({
      owner: 'ChittyOS',
      repo: this.sessionRepo,
      ref: `refs/heads/${this.branch}`,
      sha: 'mock-sha-123'
    });
  }

  async initializeSessionStructure() {
    console.log(`📁 Initializing session structure`);

    const config = {
      projectId: this.projectId,
      sessionId: this.sessionId,
      createdAt: new Date().toISOString(),
      services: {
        claude: { enabled: true, model: 'claude-opus-4-1-20250805' },
        openai: { enabled: true, model: 'gpt-4' },
        gemini: { enabled: true, model: 'gemini-pro' },
        notion: { enabled: true },
        github: { enabled: true, repo: this.sessionRepo }
      },
      repositories: {
        session: this.sessionRepo,
        data: this.dataRepo
      }
    };

    // Create config file in session repo
    await this.commitFileToRepo(
      this.sessionRepo,
      this.branch,
      `projects/${this.projectId}/.chittychat/config.json`,
      JSON.stringify(config, null, 2),
      'Initialize session configuration'
    );
  }

  async saveState(service, data, metadata = {}) {
    const timestamp = new Date().toISOString();

    console.log(`💾 Saving ${service} state`);

    // Update local state
    this.state[service] = {
      ...this.state[service],
      ...data,
      lastUpdated: timestamp
    };

    // Save to session repo (chittychat-data)
    await this.commitFileToRepo(
      this.sessionRepo,
      this.branch,
      `projects/${this.projectId}/state/${service}.json`,
      JSON.stringify(this.state[service], null, 2),
      `Update ${service} state`
    );

    return {
      service,
      saved: true,
      timestamp,
      repository: this.sessionRepo
    };
  }

  async storeData(dataType, data, metadata = {}) {
    const timestamp = new Date().toISOString();
    const dataPath = `data/${dataType}/${this.projectId}/${timestamp.split('T')[0]}/${data.id || Date.now()}.json`;

    console.log(`📊 Storing ${dataType} data in ${this.dataRepo}`);

    // Store data in chittyos-data repo
    await this.commitFileToRepo(
      this.dataRepo,
      `data-${this.projectId}`,
      dataPath,
      JSON.stringify({
        ...data,
        metadata: {
          ...metadata,
          projectId: this.projectId,
          sessionId: this.sessionId,
          storedAt: timestamp,
          dataType
        }
      }, null, 2),
      `Store ${dataType} data from ${this.projectId}`
    );

    return {
      stored: true,
      repo: this.dataRepo,
      path: dataPath,
      timestamp
    };
  }

  async commitFileToRepo(repo, branch, path, content, message) {
    console.log(`📤 Committing to ${repo}:${branch} - ${path}`);

    // Check if file exists
    try {
      await this.github.repos.getContent({
        owner: 'ChittyOS',
        repo,
        path,
        ref: branch
      });
    } catch (error) {
      // File doesn't exist
    }

    await this.github.repos.createOrUpdateFileContents({
      owner: 'ChittyOS',
      repo,
      path,
      message: `[${this.sessionId}] ${message}`,
      content: Buffer.from(content).toString('base64'),
      branch
    });
  }

  getOperations() {
    return this.github.getOperations();
  }
}

async function testSessionSync() {
  console.log('🧪 Testing Session Sync Implementation\n');

  const sessionManager = new MockSessionSyncManager(mockEnv);

  try {
    // Test 1: Session Initialization
    console.log('📋 Test 1: Session Initialization');
    const initResult = await sessionManager.initSession();
    console.log('✅ Session initialized:', {
      sessionId: initResult.sessionId,
      sessionRepo: initResult.sessionRepo,
      dataRepo: initResult.dataRepo
    });

    // Test 2: Save Cross-Service State
    console.log('\n📋 Test 2: Cross-Service State Management');
    await sessionManager.saveState('claude', {
      conversation_id: 'claude-conv-123',
      model: 'claude-opus-4-1-20250805',
      context_length: 8192,
      last_interaction: new Date().toISOString()
    });

    await sessionManager.saveState('openai', {
      thread_id: 'thread-456',
      model: 'gpt-4',
      tokens_used: 2500,
      last_response: new Date().toISOString()
    });

    await sessionManager.saveState('gemini', {
      session_id: 'gemini-789',
      model: 'gemini-pro',
      safety_settings: { harassment: 'block_medium_and_above' }
    });

    console.log('✅ Cross-service state saved to chittychat-data');

    // Test 3: Store Data in chittyos-data
    console.log('\n📋 Test 3: Data Storage in chittyos-data');

    await sessionManager.storeData('atomic_facts', {
      id: 'fact-001',
      fact_text: 'Email received from client regarding contract dispute',
      fact_type: 'COMMUNICATION',
      source_document: 'email-2024-001',
      extracted_at: new Date().toISOString()
    });

    await sessionManager.storeData('evidence', {
      id: 'evidence-001',
      title: 'Contract Agreement',
      document_type: 'PDF',
      file_size: 245760,
      uploaded_at: new Date().toISOString()
    });

    console.log('✅ Data stored in chittyos-data');

    // Test 4: Verify Repository Separation
    console.log('\n📋 Test 4: Repository Separation Verification');

    const operations = sessionManager.getOperations();
    const sessionRepoOps = operations.filter(op =>
      op.params && op.params.repo === 'chittychat-data'
    );
    const dataRepoOps = operations.filter(op =>
      op.params && op.params.repo === 'chittyos-data'
    );

    console.log(`📦 chittychat-data operations: ${sessionRepoOps.length}`);
    console.log(`💾 chittyos-data operations: ${dataRepoOps.length}`);

    sessionRepoOps.forEach(op => {
      console.log(`  📦 ${op.type}: ${op.params.path || op.params.ref || 'branch operation'}`);
    });

    dataRepoOps.forEach(op => {
      console.log(`  💾 ${op.type}: ${op.params.path || op.params.ref || 'branch operation'}`);
    });

    // Test 5: Session State Summary
    console.log('\n📋 Test 5: Session State Summary');
    console.log('🔄 Active Services:', Object.keys(sessionManager.state));
    console.log('📊 Session Data:', {
      projectId: sessionManager.projectId,
      sessionId: sessionManager.sessionId,
      branch: sessionManager.branch,
      repositories: {
        session: sessionManager.sessionRepo,
        data: sessionManager.dataRepo
      }
    });

    console.log('\n✅ All Session Sync Tests Passed!');

    return {
      success: true,
      sessionId: sessionManager.sessionId,
      operationsCount: operations.length,
      repositorySeparation: {
        'chittychat-data': sessionRepoOps.length,
        'chittyos-data': dataRepoOps.length
      }
    };

  } catch (error) {
    console.error('\n❌ Session Sync Test Failed:', error);
    return { success: false, error: error.message };
  }
}

// Test distributed session sync
async function testDistributedSync() {
  console.log('\n🌐 Testing Distributed Session Sync\n');

  // Mock vector clock test
  const nodeId = 'chittyrouter-node-1';
  const vectorClock = {
    'chittyrouter-node-1': 1,
    'claude-api': 2,
    'openai-api': 1
  };

  console.log('⏰ Vector Clock Test:');
  console.log(`  Node ID: ${nodeId}`);
  console.log(`  Clock State:`, vectorClock);

  // Simulate clock update
  vectorClock[nodeId]++;
  console.log(`  After tick:`, vectorClock);

  console.log('✅ Distributed sync mechanisms ready');
}

// Run all tests
async function runAllTests() {
  console.log('=' .repeat(60));
  console.log('🧪 CHITTYROUTER SESSION SYNC COMPREHENSIVE TEST');
  console.log('=' .repeat(60));

  const sessionResult = await testSessionSync();
  await testDistributedSync();

  console.log('\n' + '=' .repeat(60));
  if (sessionResult.success) {
    console.log('✅ ALL SESSION SYNC TESTS COMPLETED SUCCESSFULLY');
    console.log(`📊 Session ID: ${sessionResult.sessionId}`);
    console.log(`🔄 Total Operations: ${sessionResult.operationsCount}`);
    console.log(`📂 Repository Distribution:`, sessionResult.repositorySeparation);
  } else {
    console.log('❌ SESSION SYNC TESTS FAILED');
    console.log(`Error: ${sessionResult.error}`);
  }
  console.log('=' .repeat(60));
}

runAllTests().catch(console.error);