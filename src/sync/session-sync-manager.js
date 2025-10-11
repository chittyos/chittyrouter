/**
 * SessionSyncManager - Cross-project session synchronization
 * Integrates with ChittyChat's GitHub-based persistent session architecture
 * Uses chittychat-data repo for project management and branch-based sessions
 * Manages state across Claude, OpenAI, Gemini, and ChittyOS services
 */

import { Octokit } from "@octokit/rest";
import getRepositoryManager from "./repository-manager.js";
import { mintId } from "../utils/chittyid-adapter.js";

const CHITTY_ORG = "ChittyOS";
const SESSION_REPO = "chittychat-data"; // For project management and sessions
const DATA_REPO = "chittyos-data"; // For actual data storage
const BRANCH_PREFIX = "session";

export class SessionSyncManager {
  constructor(env) {
    this.env = env;
    this.github = new Octokit({
      auth: env.GITHUB_TOKEN,
      baseUrl: "https://api.github.com",
    });

    // Use hardened repository manager
    this.repoManager = getRepositoryManager(env);

    // Separate repos for different purposes
    this.sessionRepo = SESSION_REPO; // Project management
    this.dataRepo = DATA_REPO; // Data storage

    // Session metadata
    this.projectId = env.PROJECT_ID || "chittyrouter";
    this.sessionId = null;
    this.branch = null;

    // Cross-service state
    this.state = {
      claude: {},
      openai: {},
      gemini: {},
      notion: {},
      neon: {},
      cloudflare: {},
    };

    // Sync queue for batching operations
    this.syncQueue = [];
    this.syncTimer = null;
  }

  /**
   * Initialize or resume session
   */
  async initSession(options = {}) {
    const { sessionId, projectId, resumeFrom } = options;

    this.projectId = projectId || this.projectId;
    // Use mintId for session IDs with proper entity type and context
    this.sessionId =
      sessionId || (await mintId("SESSN", `${this.projectId}-sync`, this.env));
    this.branch = `${BRANCH_PREFIX}/${this.projectId}/${this.sessionId}`;

    try {
      if (resumeFrom) {
        // Resume existing session
        await this.resumeSession(resumeFrom);
      } else {
        // Create new session branch
        await this.createSessionBranch();
      }

      // Initialize session structure
      await this.initializeSessionStructure();

      // Set up auto-sync
      this.startAutoSync();

      return {
        sessionId: this.sessionId,
        projectId: this.projectId,
        branch: this.branch,
        resumedFrom: resumeFrom || null,
      };
    } catch (error) {
      console.error("Session initialization failed:", error);
      throw error;
    }
  }

  /**
   * Create new session branch in GitHub
   */
  async createSessionBranch() {
    try {
      // Get main branch SHA
      const { data: mainRef } = await this.github.git.getRef({
        owner: CHITTY_ORG,
        repo: this.sessionRepo,
        ref: "heads/main",
      });

      // Create new branch
      await this.github.git.createRef({
        owner: CHITTY_ORG,
        repo: this.sessionRepo,
        ref: `refs/heads/${this.branch}`,
        sha: mainRef.object.sha,
      });

      console.log(`Created session branch: ${this.branch}`);
    } catch (error) {
      if (error.status === 422) {
        // Branch already exists, use it
        console.log(`Session branch exists: ${this.branch}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Resume existing session
   */
  async resumeSession(sessionIdentifier) {
    try {
      // Find session branch
      const branches = await this.github.repos.listBranches({
        owner: CHITTY_ORG,
        repo: SESSION_REPO,
      });

      const sessionBranch = branches.data.find((b) =>
        b.name.includes(sessionIdentifier),
      );

      if (!sessionBranch) {
        throw new Error(`Session not found: ${sessionIdentifier}`);
      }

      this.branch = sessionBranch.name;
      const parts = this.branch.split("/");
      this.projectId = parts[1];
      this.sessionId = parts[2];

      // Load session state
      await this.loadSessionState();

      console.log(`Resumed session: ${this.sessionId}`);
    } catch (error) {
      console.error("Failed to resume session:", error);
      throw error;
    }
  }

  /**
   * Initialize session directory structure
   */
  async initializeSessionStructure() {
    const structure = [
      `projects/${this.projectId}/.chittychat/config.json`,
      `projects/${this.projectId}/evidence/`,
      `projects/${this.projectId}/processed/`,
      `projects/${this.projectId}/chain-of-custody/`,
      `projects/${this.projectId}/atomic-facts/`,
      `projects/${this.projectId}/state/claude.json`,
      `projects/${this.projectId}/state/openai.json`,
      `projects/${this.projectId}/state/gemini.json`,
      `projects/${this.projectId}/state/notion.json`,
      `projects/${this.projectId}/state/sync-metadata.json`,
    ];

    const config = {
      projectId: this.projectId,
      sessionId: this.sessionId,
      createdAt: new Date().toISOString(),
      services: {
        claude: { enabled: true, model: "claude-opus-4-1-20250805" },
        openai: { enabled: true, model: "gpt-4" },
        gemini: { enabled: true, model: "gemini-pro" },
        notion: {
          enabled: true,
          database: this.env.NOTION_DATABASE_ID_ATOMIC_FACTS,
        },
        github: { enabled: true, repo: SESSION_REPO },
      },
      syncSettings: {
        autoSync: true,
        syncInterval: 30000,
        conflictResolution: "latest-write",
        retryPolicy: {
          maxRetries: 3,
          backoffMs: 1000,
        },
      },
    };

    // Create config file
    await this.commitFile(
      `projects/${this.projectId}/.chittychat/config.json`,
      JSON.stringify(config, null, 2),
      "Initialize session configuration",
    );
  }

  /**
   * Save state to GitHub
   */
  async saveState(service, data, metadata = {}) {
    const timestamp = new Date().toISOString();

    // Update local state
    this.state[service] = {
      ...this.state[service],
      ...data,
      lastUpdated: timestamp,
    };

    // Queue for sync
    this.syncQueue.push({
      service,
      data,
      metadata,
      timestamp,
    });

    // Trigger sync
    this.scheduleSyncFlush();

    return {
      service,
      saved: true,
      timestamp,
      queued: this.syncQueue.length,
    };
  }

  /**
   * Load session state from GitHub
   */
  async loadSessionState() {
    const services = [
      "claude",
      "openai",
      "gemini",
      "notion",
      "neon",
      "cloudflare",
    ];

    for (const service of services) {
      try {
        const content = await this.getFileContent(
          `projects/${this.projectId}/state/${service}.json`,
        );

        if (content) {
          this.state[service] = JSON.parse(content);
        }
      } catch (error) {
        // State file doesn't exist yet
        console.log(`No existing state for ${service}`);
      }
    }

    return this.state;
  }

  /**
   * Sync atomic facts to session
   */
  async syncAtomicFacts(facts) {
    const timestamp = new Date().toISOString();
    const batchId = `batch-${Date.now()}`;

    // Group facts by type for organized storage
    const factsByType = facts.reduce((acc, fact) => {
      const type = fact.factType || "UNCLASSIFIED";
      if (!acc[type]) acc[type] = [];
      acc[type].push(fact);
      return acc;
    }, {});

    // Save each type group
    for (const [type, typeFacts] of Object.entries(factsByType)) {
      const filename = `projects/${this.projectId}/atomic-facts/${type.toLowerCase()}-${batchId}.json`;

      await this.commitFile(
        filename,
        JSON.stringify(
          {
            batchId,
            type,
            timestamp,
            count: typeFacts.length,
            facts: typeFacts,
          },
          null,
          2,
        ),
        `Sync ${typeFacts.length} ${type} atomic facts`,
      );
    }

    // Update sync metadata
    await this.updateSyncMetadata({
      lastFactSync: timestamp,
      factBatches: batchId,
      factCount: facts.length,
      factTypes: Object.keys(factsByType),
    });

    return {
      synced: facts.length,
      batchId,
      timestamp,
      types: Object.keys(factsByType),
    };
  }

  /**
   * Sync evidence documents
   */
  async syncEvidence(documents) {
    const timestamp = new Date().toISOString();
    const results = [];

    for (const doc of documents) {
      const filename = `projects/${this.projectId}/evidence/${doc.id}-${doc.type}.json`;

      await this.commitFile(
        filename,
        JSON.stringify(
          {
            ...doc,
            syncedAt: timestamp,
            sessionId: this.sessionId,
          },
          null,
          2,
        ),
        `Sync evidence: ${doc.title || doc.id}`,
      );

      // Add to chain of custody
      await this.addToChainOfCustody({
        documentId: doc.id,
        action: "SYNCED",
        timestamp,
        sessionId: this.sessionId,
        hash: await this.calculateHash(doc),
      });

      results.push({
        id: doc.id,
        synced: true,
        timestamp,
      });
    }

    return results;
  }

  /**
   * Add to chain of custody
   */
  async addToChainOfCustody(entry) {
    const filename = `projects/${this.projectId}/chain-of-custody/log-${new Date().toISOString().split("T")[0]}.jsonl`;

    const content = JSON.stringify(entry) + "\n";

    await this.appendToFile(filename, content);

    return entry;
  }

  /**
   * Cross-service state synchronization
   */
  async syncCrossServiceState() {
    const services = Object.keys(this.state);
    const syncReport = {
      timestamp: new Date().toISOString(),
      services: {},
    };

    for (const service of services) {
      if (this.state[service] && Object.keys(this.state[service]).length > 0) {
        const filename = `projects/${this.projectId}/state/${service}.json`;

        await this.commitFile(
          filename,
          JSON.stringify(this.state[service], null, 2),
          `Update ${service} state`,
        );

        syncReport.services[service] = {
          synced: true,
          items: Object.keys(this.state[service]).length,
        };
      }
    }

    // Update sync metadata
    await this.updateSyncMetadata({
      lastStateSync: syncReport.timestamp,
      syncedServices: Object.keys(syncReport.services),
    });

    return syncReport;
  }

  /**
   * Update sync metadata
   */
  async updateSyncMetadata(updates) {
    const filename = `projects/${this.projectId}/state/sync-metadata.json`;

    let metadata = {};
    try {
      const existing = await this.getFileContent(filename);
      if (existing) {
        metadata = JSON.parse(existing);
      }
    } catch (error) {
      // File doesn't exist yet
    }

    metadata = {
      ...metadata,
      ...updates,
      lastUpdated: new Date().toISOString(),
      sessionId: this.sessionId,
      projectId: this.projectId,
    };

    await this.commitFile(
      filename,
      JSON.stringify(metadata, null, 2),
      "Update sync metadata",
    );

    return metadata;
  }

  /**
   * Schedule sync flush
   */
  scheduleSyncFlush() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.syncTimer = setTimeout(() => {
      this.flushSyncQueue();
    }, 5000); // 5 second debounce
  }

  /**
   * Flush sync queue
   */
  async flushSyncQueue() {
    if (this.syncQueue.length === 0) return;

    const items = [...this.syncQueue];
    this.syncQueue = [];

    try {
      // Group by service
      const byService = items.reduce((acc, item) => {
        if (!acc[item.service]) acc[item.service] = [];
        acc[item.service].push(item);
        return acc;
      }, {});

      // Sync each service
      for (const [service, serviceItems] of Object.entries(byService)) {
        const filename = `projects/${this.projectId}/state/${service}.json`;

        // Merge all updates
        const merged = serviceItems.reduce(
          (acc, item) => ({
            ...acc,
            ...item.data,
            lastUpdated: item.timestamp,
          }),
          this.state[service] || {},
        );

        await this.commitFile(
          filename,
          JSON.stringify(merged, null, 2),
          `Batch sync ${service} state (${serviceItems.length} updates)`,
        );

        this.state[service] = merged;
      }

      console.log(`Flushed ${items.length} sync items`);
    } catch (error) {
      console.error("Sync flush failed:", error);
      // Re-queue failed items
      this.syncQueue.push(...items);
    }
  }

  /**
   * Start auto-sync timer
   */
  startAutoSync() {
    setInterval(() => {
      this.flushSyncQueue();
      this.syncCrossServiceState();
    }, 30000); // Every 30 seconds
  }

  /**
   * Create pull request for session
   */
  async createSessionPR() {
    try {
      const { data: pr } = await this.github.pulls.create({
        owner: CHITTY_ORG,
        repo: this.sessionRepo,
        title: `Session: ${this.projectId}/${this.sessionId}`,
        head: this.branch,
        base: "main",
        body: `## Session Summary

**Project:** ${this.projectId}
**Session ID:** ${this.sessionId}
**Created:** ${new Date().toISOString()}

### Services Used
${Object.keys(this.state)
  .map((s) => `- ${s}`)
  .join("\n")}

### Auto-Merge
This PR will auto-merge after 3 days.

---
*Generated by ChittyRouter Session Sync*`,
      });

      // Enable auto-merge
      await this.github.pulls.updateBranch({
        owner: CHITTY_ORG,
        repo: this.sessionRepo,
        pull_number: pr.number,
      });

      return {
        pr: pr.number,
        url: pr.html_url,
        branch: this.branch,
      };
    } catch (error) {
      console.error("Failed to create PR:", error);
      throw error;
    }
  }

  /**
   * Store data in chittyos-data repository
   */
  async storeData(dataType, data, metadata = {}) {
    const timestamp = new Date().toISOString();
    const dataPath = `data/${dataType}/${this.projectId}/${timestamp.split("T")[0]}/${data.id || Date.now()}.json`;

    try {
      // Store data in chittyos-data repo
      await this.commitFileToRepo(
        DATA_REPO,
        `data-${this.projectId}`,
        dataPath,
        JSON.stringify(
          {
            ...data,
            metadata: {
              ...metadata,
              projectId: this.projectId,
              sessionId: this.sessionId,
              storedAt: timestamp,
              dataType,
            },
          },
          null,
          2,
        ),
        `Store ${dataType} data from ${this.projectId}`,
      );

      return {
        stored: true,
        repo: DATA_REPO,
        path: dataPath,
        timestamp,
      };
    } catch (error) {
      console.error("Failed to store data in chittyos-data:", error);
      throw error;
    }
  }

  /**
   * Utility: Commit file to GitHub (for session/project management)
   */
  async commitFile(path, content, message) {
    return this.commitFileToRepo(
      SESSION_REPO,
      this.branch,
      path,
      content,
      message,
    );
  }

  /**
   * Utility: Commit file to specific repository
   */
  async commitFileToRepo(repo, branch, path, content, message) {
    try {
      let sha;

      // Check if file exists
      try {
        const { data: existing } = await this.github.repos.getContent({
          owner: CHITTY_ORG,
          repo,
          path,
          ref: branch,
        });
        sha = existing.sha;
      } catch (error) {
        // File doesn't exist
      }

      await this.github.repos.createOrUpdateFileContents({
        owner: CHITTY_ORG,
        repo,
        path,
        message: `[${this.sessionId}] ${message}`,
        content: Buffer.from(content).toString("base64"),
        branch,
        sha,
      });
    } catch (error) {
      console.error(`Failed to commit ${path} to ${repo}:`, error);
      throw error;
    }
  }

  /**
   * Utility: Get file content from GitHub
   */
  async getFileContent(path) {
    try {
      const { data } = await this.github.repos.getContent({
        owner: CHITTY_ORG,
        repo: this.sessionRepo,
        path,
        ref: this.branch,
      });

      return Buffer.from(data.content, "base64").toString("utf-8");
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Utility: Append to file
   */
  async appendToFile(path, content) {
    let existing = "";
    try {
      existing = (await this.getFileContent(path)) || "";
    } catch (error) {
      // File doesn't exist
    }

    await this.commitFile(path, existing + content, `Append to ${path}`);
  }

  /**
   * Utility: Calculate hash
   */
  async calculateHash(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Get session status
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      projectId: this.projectId,
      branch: this.branch,
      state: {
        services: Object.keys(this.state),
        queueDepth: this.syncQueue.length,
      },
      lastSync: this.state.lastSync || null,
    };
  }
}

// Cloudflare Worker handler
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const manager = new SessionSyncManager(env);

    try {
      // Initialize session
      if (url.pathname === "/session/init" && request.method === "POST") {
        const body = await request.json();
        const result = await manager.initSession(body);

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Save state
      if (url.pathname === "/session/state" && request.method === "POST") {
        const body = await request.json();
        const result = await manager.saveState(
          body.service,
          body.data,
          body.metadata,
        );

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Sync atomic facts
      if (
        url.pathname === "/session/atomic-facts" &&
        request.method === "POST"
      ) {
        const body = await request.json();
        const result = await manager.syncAtomicFacts(body.facts);

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get status
      if (url.pathname === "/session/status" && request.method === "GET") {
        const status = manager.getStatus();

        return new Response(JSON.stringify(status), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Session sync error:", error);
      return new Response(
        JSON.stringify({
          error: error.message,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        },
      );
    }
  },
};
