#!/usr/bin/env node

/**
 * ChittyRouter Pipeline System - Production Architecture
 * Mandatory Router → Intake → Trust → Authorization → Generation flow
 * No direct ID creation - everything goes through proper authentication
 */

// Using native await this.generateChittyId() available in Cloudflare Workers

// Import existing Durable Objects
import { AIStateDO } from './ai/ai-state.js';
import { SyncStateDurableObject } from './sync/durable-objects.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const sessionId = request.headers.get('X-Session-ID') || await this.generateChittyId();

    // Add session context to all requests
    const sessionContext = await initializeSessionContext(sessionId, env);
    ctx.sessionContext = sessionContext;

    // Route based on endpoint type
    if (url.pathname.startsWith('/pipeline/')) {
      return handlePipelineEndpoint(request, env, ctx);
    } else if (url.pathname.startsWith('/direct/')) {
      return handleDirectEndpoint(request, env, ctx);
    } else if (url.pathname.startsWith('/bridge/')) {
      return handleBridgeEndpoint(request, env, ctx);
    } else if (url.pathname.startsWith('/session/')) {
      return handleSessionEndpoint(request, env, ctx);
    }

    return new Response('Not Found', { status: 404 });
  }
};

/**
 * Pipeline Endpoints - Full authenticated workflow
 * POST /pipeline/chittyid/generate - Generate ChittyID through full pipeline
 * POST /pipeline/legal/intake - Legal document intake
 * GET /pipeline/status/{pipelineId} - Pipeline execution status
 */
async function handlePipelineEndpoint(request, env, ctx) {
  const url = new URL(request.url);
  const correlationId = generateCorrelationId();

  // Log pipeline entry
  await logPipelineEvent(correlationId, 'PIPELINE_ENTRY', {
    path: url.pathname,
    sessionId: ctx.sessionContext.sessionId,
    timestamp: new Date().toISOString()
  }, env);

  try {
    if (url.pathname === '/pipeline/chittyid/generate') {
      return await handleChittyIDGeneration(request, env, ctx, correlationId);
    } else if (url.pathname === '/pipeline/legal/intake') {
      return await handleLegalIntake(request, env, ctx, correlationId);
    } else if (url.pathname.startsWith('/pipeline/status/')) {
      const pipelineId = url.pathname.split('/').pop();
      return await getPipelineStatus(pipelineId, env, ctx);
    }

    return new Response('Pipeline endpoint not found', { status: 404 });
  } catch (error) {
    await logPipelineEvent(correlationId, 'PIPELINE_ERROR', {
      error: error.message,
      stack: error.stack
    }, env);

    return new Response(JSON.stringify({
      error: 'Pipeline execution failed',
      correlationId
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * ChittyID Generation - Mandatory Pipeline Flow
 * Router → Intake → Trust → Authorization → Generation
 */
async function handleChittyIDGeneration(request, env, ctx, correlationId) {
  const requestData = await request.json();
  const pipelineId = generatePipelineId();

  // Initialize pipeline execution state
  const pipelineState = {
    id: pipelineId,
    correlationId,
    sessionId: ctx.sessionContext.sessionId,
    status: 'STARTED',
    stages: {
      router: { status: 'PENDING' },
      intake: { status: 'PENDING' },
      trust: { status: 'PENDING' },
      authorization: { status: 'PENDING' },
      generation: { status: 'PENDING' }
    },
    startTime: new Date().toISOString(),
    requestData
  };

  // Store pipeline state
  await env.PIPELINE_STATE.put(pipelineId, JSON.stringify(pipelineState));

  try {
    // Stage 1: Router - Route and validate request
    const routerResult = await executeRouterStage(requestData, pipelineState, env, ctx);
    pipelineState.stages.router = {
      status: 'COMPLETED',
      result: routerResult,
      completedAt: new Date().toISOString()
    };

    // Stage 2: Intake - Process and categorize
    const intakeResult = await executeIntakeStage(routerResult, pipelineState, env, ctx);
    pipelineState.stages.intake = {
      status: 'COMPLETED',
      result: intakeResult,
      completedAt: new Date().toISOString()
    };

    // Stage 3: Trust - Evaluate trust level
    const trustResult = await executeTrustStage(intakeResult, pipelineState, env, ctx);
    pipelineState.stages.trust = {
      status: 'COMPLETED',
      result: trustResult,
      completedAt: new Date().toISOString()
    };

    // Stage 4: Authorization - Authorize generation
    const authResult = await executeAuthorizationStage(trustResult, pipelineState, env, ctx);
    pipelineState.stages.authorization = {
      status: 'COMPLETED',
      result: authResult,
      completedAt: new Date().toISOString()
    };

    // Stage 5: Generation - Generate ChittyID
    const generationResult = await executeGenerationStage(authResult, pipelineState, env, ctx);
    pipelineState.stages.generation = {
      status: 'COMPLETED',
      result: generationResult,
      completedAt: new Date().toISOString()
    };

    // Complete pipeline
    pipelineState.status = 'COMPLETED';
    pipelineState.completedAt = new Date().toISOString();
    pipelineState.chittyId = generationResult.chittyId;

    // Store final state
    await env.PIPELINE_STATE.put(pipelineId, JSON.stringify(pipelineState));

    // Log successful completion
    await logPipelineEvent(correlationId, 'PIPELINE_COMPLETED', {
      pipelineId,
      chittyId: generationResult.chittyId,
      duration: Date.now() - new Date(pipelineState.startTime).getTime()
    }, env);

    return new Response(JSON.stringify({
      success: true,
      pipelineId,
      chittyId: generationResult.chittyId,
      correlationId,
      stages: pipelineState.stages
    }), {
      headers: {
        'Content-Type': 'application/json',
        'X-Pipeline-ID': pipelineId,
        'X-Correlation-ID': correlationId
      }
    });

  } catch (error) {
    // Mark pipeline as failed
    pipelineState.status = 'FAILED';
    pipelineState.error = error.message;
    pipelineState.failedAt = new Date().toISOString();

    await env.PIPELINE_STATE.put(pipelineId, JSON.stringify(pipelineState));

    throw error;
  }
}

// Helper functions
function generateCorrelationId() {
  return `cor_${Date.now()}_${await this.generateChittyId().substr(2, 9)}`;
}

function generatePipelineId() {
  return `pipe_${Date.now()}_${await this.generateChittyId().substr(2, 9)}`;
}

// Additional implementation would continue here...

export {
  handlePipelineEndpoint,
  generateCorrelationId,
  generatePipelineId
};

// ChittyChainDO - Distributed ChittyID chain management
export class ChittyChainDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      if (url.pathname === '/chain/append' && method === 'POST') {
        return await this.appendToChain(request);
      }

      if (url.pathname === '/chain/validate' && method === 'POST') {
        return await this.validateChain(request);
      }

      if (url.pathname === '/chain/state' && method === 'GET') {
        return await this.getChainState(request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('ChittyChainDO error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async appendToChain(request) {
    const body = await request.json();
    const { chittyId, parentId, sessionId, metadata } = body;

    const chainEntry = {
      chittyId,
      parentId,
      sessionId,
      metadata,
      timestamp: new Date().toISOString(),
      blockNumber: await this.getNextBlockNumber()
    };

    await this.storage.put(`chain-${chittyId}`, chainEntry);

    return new Response(JSON.stringify({
      success: true,
      blockNumber: chainEntry.blockNumber,
      chittyId
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async validateChain(request) {
    const body = await request.json();
    const { chittyId } = body;

    const chainEntry = await this.storage.get(`chain-${chittyId}`);

    return new Response(JSON.stringify({
      valid: !!chainEntry,
      entry: chainEntry
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getChainState(request) {
    const allEntries = await this.storage.list();
    const chain = [];

    for (const [key, value] of allEntries) {
      if (key.startsWith('chain-')) {
        chain.push(value);
      }
    }

    return new Response(JSON.stringify({
      chainLength: chain.length,
      entries: chain.sort((a, b) => a.blockNumber - b.blockNumber)
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getNextBlockNumber() {
    const currentBlock = await this.storage.get('current-block') || 0;
    const nextBlock = currentBlock + 1;
    await this.storage.put('current-block', nextBlock);
    return nextBlock;
  }
}

// SessionStateDO - Enhanced session state management
export class SessionStateDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      if (url.pathname === '/session/create' && method === 'POST') {
        return await this.createSession(request);
      }

      if (url.pathname === '/session/update' && method === 'POST') {
        return await this.updateSession(request);
      }

      if (url.pathname === '/session/get' && method === 'GET') {
        return await this.getSession(request);
      }

      if (url.pathname === '/session/sync' && method === 'POST') {
        return await this.syncSession(request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('SessionStateDO error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async createSession(request) {
    const body = await request.json();
    const { sessionId, metadata } = body;

    const session = {
      sessionId,
      metadata,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      vectorClock: { [sessionId]: 1 },
      status: 'ACTIVE'
    };

    await this.storage.put(`session-${sessionId}`, session);

    return new Response(JSON.stringify({
      success: true,
      session
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async updateSession(request) {
    const body = await request.json();
    const { sessionId, updates, vectorClock } = body;

    const session = await this.storage.get(`session-${sessionId}`);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Vector clock conflict resolution
    const updatedSession = {
      ...session,
      ...updates,
      lastUpdated: new Date().toISOString(),
      vectorClock: this.mergeVectorClocks(session.vectorClock, vectorClock)
    };

    await this.storage.put(`session-${sessionId}`, updatedSession);

    return new Response(JSON.stringify({
      success: true,
      session: updatedSession
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getSession(request) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');

    const session = await this.storage.get(`session-${sessionId}`);

    return new Response(JSON.stringify({
      found: !!session,
      session
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async syncSession(request) {
    const body = await request.json();
    const { sessionId, remoteVectorClock, remoteState } = body;

    const localSession = await this.storage.get(`session-${sessionId}`);

    if (!localSession) {
      return new Response(JSON.stringify({ error: 'Session not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const conflictResolution = this.resolveConflicts(
      localSession,
      remoteState,
      remoteVectorClock
    );

    if (conflictResolution.needsUpdate) {
      await this.storage.put(`session-${sessionId}`, conflictResolution.resolvedState);
    }

    return new Response(JSON.stringify({
      success: true,
      conflictsResolved: conflictResolution.conflictsFound,
      session: conflictResolution.resolvedState
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  mergeVectorClocks(local, remote) {
    const merged = { ...local };

    for (const [node, timestamp] of Object.entries(remote)) {
      merged[node] = Math.max(merged[node] || 0, timestamp);
    }

    return merged;
  }

  resolveConflicts(localState, remoteState, remoteVectorClock) {
    const localClock = localState.vectorClock;
    const conflicts = [];

    // Simple last-writer-wins with vector clock precedence
    const resolvedState = { ...localState };
    let needsUpdate = false;

    for (const [key, value] of Object.entries(remoteState)) {
      if (key !== 'vectorClock' && localState[key] !== value) {
        // Check vector clock precedence
        const remoteIsNewer = this.isVectorClockNewer(remoteVectorClock, localClock);

        if (remoteIsNewer) {
          resolvedState[key] = value;
          needsUpdate = true;
          conflicts.push({ key, resolution: 'remote-wins' });
        }
      }
    }

    resolvedState.vectorClock = this.mergeVectorClocks(localClock, remoteVectorClock);

    return {
      resolvedState,
      conflictsFound: conflicts.length,
      needsUpdate: needsUpdate || conflicts.length > 0,
      conflicts
    };
  }

  isVectorClockNewer(clock1, clock2) {
    let hasGreater = false;
    let hasLess = false;

    const allNodes = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);

    for (const node of allNodes) {
      const ts1 = clock1[node] || 0;
      const ts2 = clock2[node] || 0;

      if (ts1 > ts2) hasGreater = true;
      if (ts1 < ts2) hasLess = true;
    }

    return hasGreater && !hasLess;
  }
}

// PipelineStateDO - Pipeline execution state management
export class PipelineStateDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    try {
      if (url.pathname === '/pipeline/create' && method === 'POST') {
        return await this.createPipeline(request);
      }

      if (url.pathname === '/pipeline/update' && method === 'POST') {
        return await this.updatePipeline(request);
      }

      if (url.pathname === '/pipeline/get' && method === 'GET') {
        return await this.getPipeline(request);
      }

      if (url.pathname === '/pipeline/status' && method === 'GET') {
        return await this.getPipelineStatus(request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('PipelineStateDO error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async createPipeline(request) {
    const body = await request.json();
    const { pipelineId, sessionId, stages, metadata } = body;

    const pipeline = {
      pipelineId,
      sessionId,
      stages: stages || ['ROUTER', 'INTAKE', 'TRUST', 'AUTHORIZATION', 'GENERATION'],
      metadata,
      status: 'CREATED',
      currentStage: 0,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      stageHistory: []
    };

    await this.storage.put(`pipeline-${pipelineId}`, pipeline);

    return new Response(JSON.stringify({
      success: true,
      pipeline
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async updatePipeline(request) {
    const body = await request.json();
    const { pipelineId, stageResult, nextStage } = body;

    const pipeline = await this.storage.get(`pipeline-${pipelineId}`);
    if (!pipeline) {
      return new Response(JSON.stringify({ error: 'Pipeline not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update stage history
    pipeline.stageHistory.push({
      stage: pipeline.stages[pipeline.currentStage],
      result: stageResult,
      completedAt: new Date().toISOString()
    });

    // Move to next stage
    if (nextStage !== undefined) {
      pipeline.currentStage = nextStage;
    } else {
      pipeline.currentStage += 1;
    }

    // Check if pipeline is complete
    if (pipeline.currentStage >= pipeline.stages.length) {
      pipeline.status = 'COMPLETED';
      pipeline.completedAt = new Date().toISOString();
    } else {
      pipeline.status = 'IN_PROGRESS';
    }

    pipeline.lastUpdated = new Date().toISOString();

    await this.storage.put(`pipeline-${pipelineId}`, pipeline);

    return new Response(JSON.stringify({
      success: true,
      pipeline
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getPipeline(request) {
    const url = new URL(request.url);
    const pipelineId = url.searchParams.get('pipelineId');

    const pipeline = await this.storage.get(`pipeline-${pipelineId}`);

    return new Response(JSON.stringify({
      found: !!pipeline,
      pipeline
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getPipelineStatus(request) {
    const url = new URL(request.url);
    const pipelineId = url.searchParams.get('pipelineId');

    const pipeline = await this.storage.get(`pipeline-${pipelineId}`);

    if (!pipeline) {
      return new Response(JSON.stringify({ error: 'Pipeline not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const status = {
      pipelineId: pipeline.pipelineId,
      status: pipeline.status,
      currentStage: pipeline.currentStage,
      stageName: pipeline.stages[pipeline.currentStage],
      progress: pipeline.currentStage / pipeline.stages.length,
      stageHistory: pipeline.stageHistory,
      lastUpdated: pipeline.lastUpdated
    };

    return new Response(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Export all Durable Objects
export { AIStateDO, SyncStateDurableObject };