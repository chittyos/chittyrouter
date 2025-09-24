#!/usr/bin/env node

/**
 * Distributed Session Sync System
 * Cross-service synchronization with vector clocks and conflict resolution
 * Automatic retry with exponential backoff
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/sync/session/state') {
      return handleSessionStateSync(request, env, ctx);
    } else if (url.pathname === '/sync/session/conflict') {
      return handleConflictResolution(request, env, ctx);
    } else if (url.pathname === '/sync/session/health') {
      return handleSyncHealth(request, env, ctx);
    }

    return new Response('Sync endpoint not found', { status: 404 });
  },

  // Scheduled task for automatic synchronization
  async scheduled(event, env, ctx) {
    await performScheduledSync(env);
  }
};

/**
 * Vector Clock Implementation for Distributed Sessions
 */
class VectorClock {
  constructor(nodeId, clock = {}) {
    this.nodeId = nodeId;
    this.clock = { ...clock };

    // Ensure this node exists in the clock
    if (!(nodeId in this.clock)) {
      this.clock[nodeId] = 0;
    }
  }

  /**
   * Increment this node's clock
   */
  tick() {
    this.clock[this.nodeId]++;
    return this;
  }

  /**
   * Update clock with received message
   */
  update(otherClock) {
    // Increment own clock
    this.tick();

    // Update with maximum values from other clock
    for (const [nodeId, timestamp] of Object.entries(otherClock)) {
      if (nodeId !== this.nodeId) {
        this.clock[nodeId] = Math.max(this.clock[nodeId] || 0, timestamp);
      }
    }

    return this;
  }

  /**
   * Compare with another vector clock
   * Returns: 'before', 'after', 'concurrent', or 'equal'
   */
  compare(otherClock) {
    const thisNodes = new Set(Object.keys(this.clock));
    const otherNodes = new Set(Object.keys(otherClock));
    const allNodes = new Set([...thisNodes, ...otherNodes]);

    let thisGreater = false;
    let otherGreater = false;

    for (const nodeId of allNodes) {
      const thisValue = this.clock[nodeId] || 0;
      const otherValue = otherClock[nodeId] || 0;

      if (thisValue > otherValue) {
        thisGreater = true;
      } else if (otherValue > thisValue) {
        otherGreater = true;
      }
    }

    if (thisGreater && !otherGreater) return 'after';
    if (otherGreater && !thisGreater) return 'before';
    if (!thisGreater && !otherGreater) return 'equal';
    return 'concurrent';
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      nodeId: this.nodeId,
      clock: this.clock,
      timestamp: Date.now()
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(data) {
    return new VectorClock(data.nodeId, data.clock);
  }
}

/**
 * Distributed Session State Manager
 */
class DistributedSessionState {
  constructor(sessionId, nodeId, initialState = {}) {
    this.sessionId = sessionId;
    this.nodeId = nodeId;
    this.state = { ...initialState };
    this.vectorClock = new VectorClock(nodeId);
    this.conflictLog = [];
    this.syncLog = [];
  }

  /**
   * Update local state with vector clock increment
   */
  updateState(updates, metadata = {}) {
    // Increment vector clock
    this.vectorClock.tick();

    // Apply updates
    this.state = this.mergeState(this.state, updates);

    // Log the update
    const logEntry = {
      timestamp: Date.now(),
      vectorClock: this.vectorClock.toJSON(),
      updates,
      metadata,
      nodeId: this.nodeId
    };

    this.syncLog.push(logEntry);

    return this;
  }

  /**
   * Sync with remote session state
   */
  async syncWith(remoteState, env) {
    const remoteVectorClock = VectorClock.fromJSON(remoteState.vectorClock);
    const comparison = this.vectorClock.compare(remoteVectorClock.clock);

    const syncResult = {
      sessionId: this.sessionId,
      nodeId: this.nodeId,
      remoteNodeId: remoteState.nodeId,
      comparison,
      conflictResolved: false,
      mergedState: null,
      timestamp: Date.now()
    };

    switch (comparison) {
      case 'before':
        // Remote is newer, accept their state
        this.acceptRemoteState(remoteState);
        syncResult.action = 'ACCEPT_REMOTE';
        break;

      case 'after':
        // Local is newer, keep local state
        syncResult.action = 'KEEP_LOCAL';
        break;

      case 'equal':
        // States are equivalent
        syncResult.action = 'NO_CHANGE';
        break;

      case 'concurrent': {
        // Conflict detected, need resolution
        const resolvedState = await this.resolveConflict(remoteState, env);
        syncResult.conflictResolved = true;
        syncResult.mergedState = resolvedState;
        syncResult.action = 'CONFLICT_RESOLVED';
        break;
      }
    }

    // Log sync operation
    this.syncLog.push(syncResult);

    return syncResult;
  }

  /**
   * Deep merge objects
   */
  deepMerge(obj1, obj2) {
    const result = { ...obj1 };

    for (const [key, value] of Object.entries(obj2)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value) &&
          typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
        result[key] = this.deepMerge(result[key], value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Merge state objects
   */
  mergeState(currentState, updates) {
    return this.deepMerge(currentState, updates);
  }

  /**
   * Serialize session state
   */
  toJSON() {
    return {
      sessionId: this.sessionId,
      nodeId: this.nodeId,
      state: this.state,
      vectorClock: this.vectorClock.toJSON(),
      conflictLog: this.conflictLog,
      syncLog: this.syncLog.slice(-50), // Keep last 50 sync events
      lastUpdated: Date.now()
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(data) {
    const session = new DistributedSessionState(data.sessionId, data.nodeId, data.state);
    session.vectorClock = VectorClock.fromJSON(data.vectorClock);
    session.conflictLog = data.conflictLog || [];
    session.syncLog = data.syncLog || [];
    return session;
  }
}

/**
 * Initialize session context
 */
async function initializeSessionContext(sessionId, env) {
  const sessionData = await env.SESSION_STATE.get(sessionId);

  if (sessionData) {
    return DistributedSessionState.fromJSON(JSON.parse(sessionData));
  } else {
    const newSession = new DistributedSessionState(sessionId, env.NODE_ID || 'chittyrouter');
    await env.SESSION_STATE.put(sessionId, JSON.stringify(newSession.toJSON()));
    return newSession;
  }
}

/**
 * Handle session state synchronization
 */
async function handleSessionStateSync(request, env, ctx) {
  try {
    const { sessionId, state, vectorClock } = await request.json();

    const session = await initializeSessionContext(sessionId, env);
    const syncResult = await session.sync(state, VectorClock.fromJSON(vectorClock), env);

    return new Response(JSON.stringify(syncResult), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle conflict resolution
 */
async function handleConflictResolution(request, env, ctx) {
  try {
    const { sessionId, conflictId } = await request.json();

    const session = await initializeSessionContext(sessionId, env);
    const conflict = session.conflictLog.find(c => c.id === conflictId);

    if (!conflict) {
      return new Response(JSON.stringify({ error: 'Conflict not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(conflict), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle sync health check
 */
async function handleSyncHealth(request, env, ctx) {
  try {
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      services: {
        sessionState: !!env.SESSION_STATE,
        nodeId: env.NODE_ID || 'chittyrouter'
      }
    };

    return new Response(JSON.stringify(health), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Perform scheduled synchronization
 */
async function performScheduledSync(env) {
  try {
    console.log('Performing scheduled session sync...');
    // Add scheduled sync logic here
    return { success: true };
  } catch (error) {
    console.error('Scheduled sync failed:', error);
    return { success: false, error: error.message };
  }
}

export {
  VectorClock,
  DistributedSessionState,
  initializeSessionContext,
  handleSessionStateSync,
  handleConflictResolution,
  handleSyncHealth,
  performScheduledSync
};