/**
 * Repository Manager - Centralized repository access and validation
 * Ensures proper separation between chittychat-data and chittyos-data
 * Implements retry logic, validation, and audit trails
 *
 * All GitHub API calls route through ChittyConnect for centralized credential management.
 */

import { GitHubClientProxy } from '../lib/chittyconnect-client.js';

const CHITTY_ORG = 'ChittyOS';
const REPOS = {
  SESSION: 'chittychat-data',  // Project management, sessions, config
  DATA: 'chittyos-data',        // Immutable data storage
  EVIDENCE: 'evidence-vault'    // Evidence and document storage
};

// Define what goes in each repository
const REPO_PATTERNS = {
  'chittychat-data': [
    /^projects\/.*\/\.chittychat\//,  // Project config
    /^sessions\//,                     // Session management
    /^state\//,                        // Service state
    /^sync\//                          // Sync metadata
  ],
  'chittyos-data': [
    /^data\/atomic-facts\//,          // Atomic facts
    /^data\/entities\//,               // Legal entities
    /^data\/relationships\//,          // Entity relationships
    /^data\/chain-of-custody\//        // Audit trails
  ],
  'evidence-vault': [
    /^evidence\//,                     // Evidence documents
    /^documents\//,                    // Original documents
    /^artifacts\//                     // Processed artifacts
  ]
};

export class RepositoryManager {
  constructor(env) {
    this.env = env;
    // Use ChittyConnect proxy - credentials managed centrally
    this.github = new GitHubClientProxy(env, { org: CHITTY_ORG });

    // Cache for branch existence checks
    this.branchCache = new Map();
    this.cacheExpiry = 300000; // 5 minutes

    // Retry configuration
    this.retryConfig = {
      maxRetries: 3,
      backoffMs: 1000,
      maxBackoffMs: 10000
    };
  }

  /**
   * Validate which repository a path should go to
   */
  validateRepository(path) {
    for (const [repo, patterns] of Object.entries(REPO_PATTERNS)) {
      if (patterns.some(pattern => pattern.test(path))) {
        return repo;
      }
    }

    throw new Error(`Invalid path: ${path} doesn't match any repository pattern`);
  }

  /**
   * Store data with automatic repository selection
   */
  async store(path, content, metadata = {}) {
    const repo = this.validateRepository(path);
    const branch = await this.ensureBranch(repo, metadata.branch);

    return this.commitWithRetry(repo, branch, path, content, metadata.message || 'Store data');
  }

  /**
   * Ensure branch exists, create if necessary
   */
  async ensureBranch(repo, branchName) {
    const cacheKey = `${repo}:${branchName}`;
    const cached = this.branchCache.get(cacheKey);

    // Check cache
    if (cached && cached.expiry > Date.now()) {
      return branchName;
    }

    try {
      // Check if branch exists
      await this.github.git.getRef({
        owner: CHITTY_ORG,
        repo,
        ref: `heads/${branchName}`
      });

      // Cache successful check
      this.branchCache.set(cacheKey, {
        exists: true,
        expiry: Date.now() + this.cacheExpiry
      });

      return branchName;

    } catch (error) {
      if (error.status === 404) {
        // Create branch
        await this.createBranch(repo, branchName);

        // Cache new branch
        this.branchCache.set(cacheKey, {
          exists: true,
          expiry: Date.now() + this.cacheExpiry
        });

        return branchName;
      }
      throw error;
    }
  }

  /**
   * Create new branch from main
   */
  async createBranch(repo, branchName) {
    const { data: mainRef } = await this.github.git.getRef({
      owner: CHITTY_ORG,
      repo,
      ref: 'heads/main'
    });

    await this.github.git.createRef({
      owner: CHITTY_ORG,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: mainRef.object.sha
    });

    console.log(`Created branch ${branchName} in ${repo}`);
  }

  /**
   * Commit with retry logic
   */
  async commitWithRetry(repo, branch, path, content, message) {
    let lastError;

    for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.commit(repo, branch, path, content, message);
      } catch (error) {
        lastError = error;

        // Don't retry on certain errors
        if (error.status === 401 || error.status === 403) {
          throw error;
        }

        // Calculate backoff
        const backoff = Math.min(
          this.retryConfig.backoffMs * Math.pow(2, attempt),
          this.retryConfig.maxBackoffMs
        );

        console.log(`Retry ${attempt + 1}/${this.retryConfig.maxRetries} after ${backoff}ms`);
        await this.sleep(backoff);
      }
    }

    throw lastError;
  }

  /**
   * Commit file to repository
   */
  async commit(repo, branch, path, content, message) {
    // Validate content
    if (typeof content === 'object') {
      content = JSON.stringify(content, null, 2);
    }

    // Add metadata to commit message
    const fullMessage = `[${new Date().toISOString()}] ${message}`;

    let sha;

    // Check if file exists
    try {
      const { data: existing } = await this.github.repos.getContent({
        owner: CHITTY_ORG,
        repo,
        path,
        ref: branch
      });
      sha = existing.sha;
    } catch (error) {
      // File doesn't exist, which is fine
    }

    const result = await this.github.repos.createOrUpdateFileContents({
      owner: CHITTY_ORG,
      repo,
      path,
      message: fullMessage,
      content: Buffer.from(content).toString('base64'),
      branch,
      sha
    });

    // Create audit entry
    await this.createAuditEntry(repo, path, result.data.commit.sha, message);

    return {
      repo,
      path,
      branch,
      sha: result.data.commit.sha,
      url: result.data.content.html_url
    };
  }

  /**
   * Create audit trail entry
   */
  async createAuditEntry(repo, path, commitSha, message) {
    const auditPath = `data/audit/${new Date().toISOString().split('T')[0]}/${Date.now()}.json`;
    const auditData = {
      timestamp: new Date().toISOString(),
      repo,
      path,
      commitSha,
      message,
      projectId: this.env.PROJECT_ID,
      sessionId: this.env.SESSION_ID
    };

    // Store audit entry in chittyos-data
    if (repo !== REPOS.DATA) {
      try {
        await this.commit(
          REPOS.DATA,
          'audit-trail',
          auditPath,
          auditData,
          'Audit trail entry'
        );
      } catch (error) {
        console.error('Failed to create audit entry:', error);
        // Don't fail the main operation if audit fails
      }
    }
  }

  /**
   * Bulk operations with transaction-like behavior
   */
  async bulkStore(operations) {
    const results = [];
    const rollback = [];

    try {
      for (const op of operations) {
        const result = await this.store(op.path, op.content, op.metadata);
        results.push(result);
        rollback.push(result);
      }

      return {
        success: true,
        results
      };

    } catch (error) {
      // Attempt rollback
      console.error('Bulk operation failed, attempting rollback:', error);

      for (const item of rollback.reverse()) {
        try {
          await this.deleteFile(item.repo, item.branch, item.path);
        } catch (rollbackError) {
          console.error('Rollback failed for:', item.path, rollbackError);
        }
      }

      throw error;
    }
  }

  /**
   * Delete file (for rollback)
   */
  async deleteFile(repo, branch, path) {
    try {
      const { data: file } = await this.github.repos.getContent({
        owner: CHITTY_ORG,
        repo,
        path,
        ref: branch
      });

      await this.github.repos.deleteFile({
        owner: CHITTY_ORG,
        repo,
        path,
        message: `[ROLLBACK] Delete ${path}`,
        sha: file.sha,
        branch
      });
    } catch (error) {
      console.error(`Failed to delete ${path}:`, error);
    }
  }

  /**
   * Read data from repository
   */
  async read(path, options = {}) {
    const repo = this.validateRepository(path);
    const branch = options.branch || 'main';

    try {
      const { data } = await this.github.repos.getContent({
        owner: CHITTY_ORG,
        repo,
        path,
        ref: branch
      });

      const content = Buffer.from(data.content, 'base64').toString('utf8');

      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List files in path
   */
  async list(path, options = {}) {
    const repo = this.validateRepository(path);
    const branch = options.branch || 'main';

    try {
      const { data } = await this.github.repos.getContent({
        owner: CHITTY_ORG,
        repo,
        path,
        ref: branch
      });

      if (Array.isArray(data)) {
        return data.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size,
          sha: item.sha
        }));
      }

      return [];
    } catch (error) {
      if (error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Utility: Sleep for backoff
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get repository statistics
   */
  async getStats() {
    const stats = {};

    for (const [name, repo] of Object.entries(REPOS)) {
      try {
        const { data } = await this.github.repos.get({
          owner: CHITTY_ORG,
          repo
        });

        stats[name] = {
          repo,
          size: data.size,
          defaultBranch: data.default_branch,
          updatedAt: data.updated_at,
          openIssues: data.open_issues_count
        };
      } catch (error) {
        stats[name] = {
          repo,
          error: error.message
        };
      }
    }

    return stats;
  }
}

// Module-level singleton
let repositoryManagerInstance = null;

// Export singleton instance
export default function getRepositoryManager(env) {
  if (!repositoryManagerInstance) {
    repositoryManagerInstance = new RepositoryManager(env);
  }
  return repositoryManagerInstance;
}