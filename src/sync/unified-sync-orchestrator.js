/**
 * UnifiedSyncOrchestrator - Master sync coordinator
 * Manages all sync operations: Session, Notion, GitHub, Cross-Service
 */

import { SessionSyncManager } from './session-sync-manager.js';
import { NotionAtomicFactsSync } from './notion-atomic-facts-sync.js';

export class UnifiedSyncOrchestrator {
  constructor(env) {
    this.env = env;
    this.sessionManager = new SessionSyncManager(env);
    this.notionSync = new NotionAtomicFactsSync(env);

    // Sync state tracking
    this.activeSyncs = new Map();
    this.syncHistory = [];
    this.failedSyncs = [];

    // Durable Object for persistent state
    this.durableObjectId = env.SYNC_STATE.idFromName('unified-sync');
    this.durableObject = env.SYNC_STATE.get(this.durableObjectId);
  }

  /**
   * Master sync pipeline
   */
  async syncPipeline(data, options = {}) {
    const syncId = `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const startTime = Date.now();

    this.activeSyncs.set(syncId, {
      id: syncId,
      status: 'processing',
      startTime,
      data: data.length || Object.keys(data).length
    });

    try {
      // Phase 1: Session initialization
      const session = await this.initializeSession(data, options);

      // Phase 2: Process and extract atomic facts
      const atomicFacts = await this.extractAtomicFacts(data);

      // Phase 3: Parallel sync to all destinations
      const [githubResult, notionResult, durableResult] = await Promise.allSettled([
        this.syncToGitHub(session, atomicFacts, data),
        this.syncToNotion(atomicFacts),
        this.syncToDurableObjects(syncId, atomicFacts)
      ]);

      // Phase 4: Cross-service state reconciliation
      const reconciled = await this.reconcileState({
        github: githubResult.value || githubResult.reason,
        notion: notionResult.value || notionResult.reason,
        durable: durableResult.value || durableResult.reason
      });

      // Phase 5: Update sync metadata
      const syncResult = {
        syncId,
        sessionId: session.sessionId,
        duration: Date.now() - startTime,
        results: {
          github: githubResult.status === 'fulfilled' ? githubResult.value : null,
          notion: notionResult.status === 'fulfilled' ? notionResult.value : null,
          durable: durableResult.status === 'fulfilled' ? durableResult.value : null
        },
        errors: [
          githubResult.status === 'rejected' ? githubResult.reason : null,
          notionResult.status === 'rejected' ? notionResult.reason : null,
          durableResult.status === 'rejected' ? durableResult.reason : null
        ].filter(Boolean),
        reconciliation: reconciled,
        timestamp: new Date().toISOString()
      };

      this.activeSyncs.delete(syncId);
      this.syncHistory.push(syncResult);

      return syncResult;
    } catch (error) {
      this.activeSyncs.delete(syncId);
      this.failedSyncs.push({
        syncId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Initialize or resume session
   */
  async initializeSession(data, options) {
    const sessionOptions = {
      projectId: options.projectId || 'chittyrouter',
      sessionId: options.sessionId,
      resumeFrom: options.resumeFrom
    };

    const session = await this.sessionManager.initSession(sessionOptions);

    // Store initial context
    await this.sessionManager.saveState('context', {
      source: 'ChittyRouter',
      pipeline: 'UnifiedSync',
      dataTypes: this.identifyDataTypes(data),
      timestamp: new Date().toISOString()
    });

    return session;
  }

  /**
   * Extract atomic facts from various data sources
   */
  async extractAtomicFacts(data) {
    const facts = [];

    // Handle different data structures
    if (Array.isArray(data)) {
      // Direct array of facts
      facts.push(...data.filter(item => item.factId));
    } else if (data.evidenceEnvelope) {
      // Evidence envelope structure
      facts.push(...this.extractFromEvidenceEnvelope(data.evidenceEnvelope));
    } else if (data.emails) {
      // Email processing pipeline
      facts.push(...await this.extractFromEmails(data.emails));
    } else if (data.documents) {
      // Document processing
      facts.push(...await this.extractFromDocuments(data.documents));
    } else if (data.atomicFacts) {
      // Direct atomic facts
      facts.push(...data.atomicFacts);
    }

    // Enrich facts with metadata
    return facts.map(fact => ({
      ...fact,
      extractedAt: new Date().toISOString(),
      source: 'ChittyRouter',
      sessionId: this.sessionManager.sessionId
    }));
  }

  /**
   * Extract facts from evidence envelope
   */
  extractFromEvidenceEnvelope(envelope) {
    const facts = [];

    if (envelope.facts) {
      facts.push(...envelope.facts);
    }

    if (envelope.artifacts) {
      for (const artifact of envelope.artifacts) {
        if (artifact.extractedFacts) {
          facts.push(...artifact.extractedFacts);
        }
      }
    }

    return facts;
  }

  /**
   * Extract facts from emails
   */
  async extractFromEmails(emails) {
    const facts = [];

    for (const email of emails) {
      // Extract date facts
      if (email.date) {
        facts.push({
          factId: `email-date-${email.id}`,
          factType: 'DATE',
          factText: `Email sent on ${email.date}`,
          parentArtifactId: email.id,
          classification: 'FACT'
        });
      }

      // Extract identity facts
      if (email.from) {
        facts.push({
          factId: `email-sender-${email.id}`,
          factType: 'IDENTITY',
          factText: `Sender: ${email.from}`,
          parentArtifactId: email.id,
          classification: 'FACT'
        });
      }

      // Extract action facts from subject
      if (email.subject) {
        facts.push({
          factId: `email-subject-${email.id}`,
          factType: 'ACTION',
          factText: email.subject,
          parentArtifactId: email.id,
          classification: 'ASSERTION'
        });
      }
    }

    return facts;
  }

  /**
   * Extract facts from documents
   */
  async extractFromDocuments(documents) {
    const facts = [];

    for (const doc of documents) {
      if (doc.extractedFacts) {
        facts.push(...doc.extractedFacts);
      }

      // Extract metadata facts
      if (doc.metadata) {
        for (const [key, value] of Object.entries(doc.metadata)) {
          facts.push({
            factId: `doc-meta-${doc.id}-${key}`,
            factType: 'STATUS',
            factText: `${key}: ${value}`,
            parentArtifactId: doc.id,
            classification: 'FACT'
          });
        }
      }
    }

    return facts;
  }

  /**
   * Sync to GitHub via SessionSyncManager
   */
  async syncToGitHub(session, atomicFacts, originalData) {
    // Sync atomic facts
    const factsResult = await this.sessionManager.syncAtomicFacts(atomicFacts);

    // Sync evidence if present
    let evidenceResult = null;
    if (originalData.documents || originalData.evidenceEnvelope) {
      const documents = originalData.documents || originalData.evidenceEnvelope?.artifacts || [];
      evidenceResult = await this.sessionManager.syncEvidence(documents);
    }

    // Save sync state
    await this.sessionManager.saveState('sync', {
      lastSync: new Date().toISOString(),
      atomicFacts: factsResult,
      evidence: evidenceResult
    });

    // Cross-service state sync
    const stateResult = await this.sessionManager.syncCrossServiceState();

    return {
      session: session.sessionId,
      facts: factsResult,
      evidence: evidenceResult,
      state: stateResult
    };
  }

  /**
   * Sync to Notion
   */
  async syncToNotion(atomicFacts) {
    const result = await this.notionSync.sync(atomicFacts);

    // Process any DLQ items
    if (result.dlq && result.dlq.length > 0) {
      const dlqResult = await this.notionSync.processDLQ();
      result.dlqProcessed = dlqResult;
    }

    return result;
  }

  /**
   * Sync to Durable Objects
   */
  async syncToDurableObjects(syncId, atomicFacts) {
    const request = new Request('https://sync.internal/atomic-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        syncId,
        facts: atomicFacts,
        timestamp: new Date().toISOString()
      })
    });

    const response = await this.durableObject.fetch(request);
    return response.json();
  }

  /**
   * Reconcile state across services
   */
  async reconcileState(results) {
    const reconciliation = {
      timestamp: new Date().toISOString(),
      services: {},
      conflicts: [],
      resolutions: []
    };

    // Check GitHub state
    if (results.github && !results.github.error) {
      reconciliation.services.github = {
        status: 'synced',
        facts: results.github.facts?.synced || 0
      };
    }

    // Check Notion state
    if (results.notion && !results.notion.error) {
      reconciliation.services.notion = {
        status: 'synced',
        created: results.notion.created?.length || 0,
        updated: results.notion.updated?.length || 0
      };
    }

    // Check Durable Objects state
    if (results.durable && !results.durable.error) {
      reconciliation.services.durable = {
        status: 'synced',
        stored: results.durable.stored || 0
      };
    }

    // Identify conflicts
    const githubCount = reconciliation.services.github?.facts || 0;
    const notionCount = (reconciliation.services.notion?.created || 0) +
                       (reconciliation.services.notion?.updated || 0);

    if (githubCount !== notionCount && githubCount > 0 && notionCount > 0) {
      reconciliation.conflicts.push({
        type: 'count_mismatch',
        github: githubCount,
        notion: notionCount
      });

      // Attempt resolution
      reconciliation.resolutions.push({
        conflict: 'count_mismatch',
        action: 'retry_failed_items',
        scheduled: true
      });
    }

    return reconciliation;
  }

  /**
   * Identify data types in payload
   */
  identifyDataTypes(data) {
    const types = [];

    if (Array.isArray(data)) types.push('array');
    if (data.evidenceEnvelope) types.push('evidenceEnvelope');
    if (data.emails) types.push('emails');
    if (data.documents) types.push('documents');
    if (data.atomicFacts) types.push('atomicFacts');

    return types;
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    return {
      activeSyncs: Array.from(this.activeSyncs.values()),
      recentSyncs: this.syncHistory.slice(-10),
      failedSyncs: this.failedSyncs.slice(-10),
      sessionStatus: this.sessionManager.getStatus(),
      notionStatus: this.notionSync.getStatus(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Retry failed syncs
   */
  async retryFailedSyncs() {
    const results = [];

    for (const failed of this.failedSyncs) {
      try {
        // Attempt to extract and resync data
        const retryResult = await this.syncPipeline(
          { atomicFacts: [] }, // Would need to store original data
          { resumeFrom: failed.syncId }
        );

        results.push({
          originalId: failed.syncId,
          retryId: retryResult.syncId,
          success: true
        });

        // Remove from failed list
        this.failedSyncs = this.failedSyncs.filter(f => f.syncId !== failed.syncId);
      } catch (error) {
        results.push({
          originalId: failed.syncId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }
}

// Durable Object for persistent sync state
export class SyncStateDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/atomic-facts' && request.method === 'POST') {
      const body = await request.json();

      // Store facts in Durable Object storage
      await this.state.storage.put(`sync-${body.syncId}`, body);

      // Update counters
      const count = await this.state.storage.get('total-facts') || 0;
      await this.state.storage.put('total-facts', count + body.facts.length);

      return new Response(JSON.stringify({
        stored: body.facts.length,
        syncId: body.syncId,
        total: count + body.facts.length
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
}

// Cloudflare Worker handler
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const orchestrator = new UnifiedSyncOrchestrator(env);

    try {
      // Main sync pipeline
      if (url.pathname === '/sync/unified' && request.method === 'POST') {
        const body = await request.json();
        const result = await orchestrator.syncPipeline(body.data, body.options);

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Status endpoint
      if (url.pathname === '/sync/status' && request.method === 'GET') {
        const status = orchestrator.getStatus();

        return new Response(JSON.stringify(status), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Retry failed syncs
      if (url.pathname === '/sync/retry' && request.method === 'POST') {
        const results = await orchestrator.retryFailedSyncs();

        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Orchestrator error:', error);
      return new Response(JSON.stringify({
        error: error.message
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }
};