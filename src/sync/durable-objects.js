/**
 * Durable Objects for sync state management
 * Persistent storage for sync operations and session state
 */

export class SyncStateDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // Store atomic facts
      if (url.pathname === '/atomic-facts' && method === 'POST') {
        return await this.storeAtomicFacts(request);
      }

      // Get sync state
      if (url.pathname === '/state' && method === 'GET') {
        return await this.getSyncState(request);
      }

      // Update sync state
      if (url.pathname === '/state' && method === 'POST') {
        return await this.updateSyncState(request);
      }

      // Get metrics
      if (url.pathname === '/metrics' && method === 'GET') {
        return await this.getMetrics(request);
      }

      // Clean up old data
      if (url.pathname === '/cleanup' && method === 'POST') {
        return await this.cleanup(request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Durable Object error:', error);
      return new Response(JSON.stringify({
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Store atomic facts
   */
  async storeAtomicFacts(request) {
    const body = await request.json();
    const { syncId, facts, timestamp } = body;

    // Store facts with expiration
    const key = `sync-${syncId}`;
    const data = {
      syncId,
      facts,
      timestamp,
      storedAt: new Date().toISOString(),
      factCount: facts.length
    };

    await this.storage.put(key, data);

    // Update counters
    const totalFacts = await this.storage.get('total-facts') || 0;
    await this.storage.put('total-facts', totalFacts + facts.length);

    const syncCount = await this.storage.get('sync-count') || 0;
    await this.storage.put('sync-count', syncCount + 1);

    // Track last sync
    await this.storage.put('last-sync', {
      syncId,
      timestamp,
      factCount: facts.length
    });

    return new Response(JSON.stringify({
      stored: facts.length,
      syncId,
      totalFacts: totalFacts + facts.length,
      success: true
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Get sync state
   */
  async getSyncState(request) {
    const url = new URL(request.url);
    const syncId = url.searchParams.get('syncId');

    if (syncId) {
      // Get specific sync
      const data = await this.storage.get(`sync-${syncId}`);
      if (!data) {
        return new Response(JSON.stringify({
          error: 'Sync not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // Get all state
      const allData = await this.storage.list();
      const state = {};

      for (const [key, value] of allData) {
        state[key] = value;
      }

      return new Response(JSON.stringify(state), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Update sync state
   */
  async updateSyncState(request) {
    const body = await request.json();
    const { key, data, merge = false } = body;

    if (merge) {
      // Merge with existing data
      const existing = await this.storage.get(key) || {};
      const merged = { ...existing, ...data };
      await this.storage.put(key, merged);

      return new Response(JSON.stringify({
        key,
        merged: true,
        data: merged
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // Replace data
      await this.storage.put(key, data);

      return new Response(JSON.stringify({
        key,
        updated: true,
        data
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Get metrics
   */
  async getMetrics(request) {
    const totalFacts = await this.storage.get('total-facts') || 0;
    const syncCount = await this.storage.get('sync-count') || 0;
    const lastSync = await this.storage.get('last-sync') || null;

    // Get recent syncs
    const allData = await this.storage.list();
    const recentSyncs = [];

    for (const [key, value] of allData) {
      if (key.startsWith('sync-') && value.timestamp) {
        recentSyncs.push({
          syncId: value.syncId,
          timestamp: value.timestamp,
          factCount: value.factCount
        });
      }
    }

    // Sort by timestamp (most recent first)
    recentSyncs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const metrics = {
      totalFacts,
      syncCount,
      lastSync,
      recentSyncs: recentSyncs.slice(0, 10), // Last 10 syncs
      storageKeys: allData.size,
      timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(metrics), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Clean up old data
   */
  async cleanup(request) {
    const body = await request.json();
    const { olderThanDays = 7 } = body;

    const cutoffTime = new Date();
    cutoffTime.setDate(cutoffTime.getDate() - olderThanDays);

    const allData = await this.storage.list();
    const deletedKeys = [];

    for (const [key, value] of allData) {
      if (key.startsWith('sync-') && value.timestamp) {
        const syncTime = new Date(value.timestamp);
        if (syncTime < cutoffTime) {
          await this.storage.delete(key);
          deletedKeys.push(key);
        }
      }
    }

    return new Response(JSON.stringify({
      cleaned: true,
      deletedKeys: deletedKeys.length,
      cutoffTime: cutoffTime.toISOString(),
      keys: deletedKeys
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Worker handler for Durable Objects deployment
export default {
  async fetch(request, env) {
    // This worker only hosts Durable Objects
    return new Response('Durable Objects Worker', { status: 200 });
  }
};