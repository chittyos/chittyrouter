#!/usr/bin/env node

/**
 * Notion Webhook Integration System
 * Real-time bidirectional synchronization with ChittyRouter
 * Implements Notion webhook receiver and processor
 */

import crypto from 'crypto';
import { initializeSessionContext } from './distributed-session-sync.js';
import { generateCorrelationId, generatePipelineId } from '../pipeline-system.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Webhook endpoints
    if (url.pathname === '/webhook/notion/receive') {
      return handleWebhookReceive(request, env, ctx);
    } else if (url.pathname === '/webhook/notion/register') {
      return handleWebhookRegistration(request, env, ctx);
    } else if (url.pathname === '/webhook/notion/status') {
      return handleWebhookStatus(request, env, ctx);
    } else if (url.pathname === '/webhook/notion/verify') {
      return handleWebhookVerification(request, env, ctx);
    }

    return new Response('Not Found', { status: 404 });
  }
};

/**
 * Notion Webhook Event Types
 * https://developers.notion.com/reference/webhook-events
 */
const WEBHOOK_EVENT_TYPES = {
  PAGE_CREATED: 'page.created',
  PAGE_UPDATED: 'page.updated',
  PAGE_DELETED: 'page.deleted',
  DATABASE_CREATED: 'database.created',
  DATABASE_UPDATED: 'database.updated',
  BLOCK_CREATED: 'block.created',
  BLOCK_UPDATED: 'block.updated',
  BLOCK_DELETED: 'block.deleted',
  COMMENT_CREATED: 'comment.created',
  COMMENT_UPDATED: 'comment.updated'
};

/**
 * Handle incoming Notion webhook events
 */
async function handleWebhookReceive(request, env, ctx) {
  const correlationId = generateCorrelationId();

  try {
    // Verify webhook signature
    const signature = request.headers.get('X-Notion-Signature');
    if (!verifyWebhookSignature(request, signature, env.NOTION_WEBHOOK_SECRET)) {
      return new Response('Invalid signature', { status: 401 });
    }

    const webhookData = await request.json();
    const eventId = webhookData.id;
    const eventType = webhookData.type;

    // Log webhook reception
    await logWebhookEvent(correlationId, 'WEBHOOK_RECEIVED', {
      eventId,
      eventType,
      timestamp: webhookData.created_time
    }, env);

    // Check for duplicate processing (idempotency)
    const processedKey = `webhook_processed_${eventId}`;
    const alreadyProcessed = await env.WEBHOOK_CACHE.get(processedKey);

    if (alreadyProcessed) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Event already processed',
        eventId,
        correlationId
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Process webhook based on event type
    const processingResult = await processWebhookEvent(webhookData, env, ctx, correlationId);

    // Mark as processed
    await env.WEBHOOK_CACHE.put(processedKey, JSON.stringify({
      processedAt: new Date().toISOString(),
      correlationId,
      result: processingResult
    }), {
      expirationTtl: 86400 * 7 // Keep for 7 days
    });

    return new Response(JSON.stringify({
      success: true,
      eventId,
      correlationId,
      processingResult
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    await logWebhookError(correlationId, error, env);

    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      correlationId
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Process webhook event based on type
 */
async function processWebhookEvent(webhookData, env, ctx, correlationId) {
  const eventType = webhookData.type;
  const payload = webhookData.payload;

  // Initialize session for webhook processing
  const sessionId = `webhook_${webhookData.id}`;
  const sessionContext = await initializeSessionContext(sessionId, env);

  let result;

  switch (eventType) {
    case WEBHOOK_EVENT_TYPES.PAGE_CREATED:
      result = await handlePageCreated(payload, sessionContext, env, ctx, correlationId);
      break;

    case WEBHOOK_EVENT_TYPES.PAGE_UPDATED:
      result = await handlePageUpdated(payload, sessionContext, env, ctx, correlationId);
      break;

    case WEBHOOK_EVENT_TYPES.PAGE_DELETED:
      result = await handlePageDeleted(payload, sessionContext, env, ctx, correlationId);
      break;

    case WEBHOOK_EVENT_TYPES.DATABASE_UPDATED:
      result = await handleDatabaseUpdated(payload, sessionContext, env, ctx, correlationId);
      break;

    case WEBHOOK_EVENT_TYPES.COMMENT_CREATED:
      result = await handleCommentCreated(payload, sessionContext, env, ctx, correlationId);
      break;

    default:
      result = {
        processed: false,
        reason: `Event type ${eventType} not handled`
      };
  }

  // Update session state with processing result
  sessionContext.updateState({
    lastWebhook: {
      eventId: webhookData.id,
      eventType,
      result,
      timestamp: Date.now()
    }
  });

  await env.SESSION_STATE.put(sessionId, JSON.stringify(sessionContext.toJSON()));

  return result;
}

/**
 * Handle page created event
 */
async function handlePageCreated(payload, sessionContext, env, ctx, correlationId) {
  const pageId = payload.id;
  const databaseId = payload.parent?.database_id;

  // Check if this is an ATOMIC FACTS database page
  if (databaseId !== env.NOTION_DATABASE_ID_ATOMIC_FACTS) {
    return {
      processed: false,
      reason: 'Not an ATOMIC FACTS database page'
    };
  }

  // Extract fact data from the page
  const factData = await extractFactFromNotionPage(payload, env);

  // Check if this fact needs ChittyID generation
  if (!factData.chittyId) {
    // Generate ChittyID through pipeline
    const pipelineResult = await generateChittyIDForFact(factData, env, ctx, correlationId);

    if (pipelineResult.success) {
      // Update Notion page with generated ChittyID
      await updateNotionPageWithChittyID(pageId, pipelineResult.chittyId, env);

      return {
        processed: true,
        action: 'CHITTYID_GENERATED',
        chittyId: pipelineResult.chittyId,
        pipelineId: pipelineResult.pipelineId
      };
    }
  }

  // Sync to ChittyChain
  const chainResult = await syncToChittyChain(factData, env, correlationId);

  return {
    processed: true,
    action: 'PAGE_SYNCED',
    pageId,
    chainResult
  };
}

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(request, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const body = request.body;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const expectedSignature = hmac.digest('hex');

  return signature === expectedSignature;
}

/**
 * Extract fact data from Notion page
 */
async function extractFactFromNotionPage(page, env) {
  const properties = page.properties || {};

  return {
    factId: properties['Fact ID']?.title?.[0]?.plain_text || null,
    chittyId: properties['External ID']?.rich_text?.[0]?.plain_text || null,
    factText: properties['Fact Text']?.rich_text?.[0]?.plain_text || '',
    factType: properties['Fact Type']?.select?.name || 'UNKNOWN',
    classification: properties['Classification Level']?.select?.name || 'FACT',
    weight: properties['Weight']?.number || 0.5,
    pipelineId: properties['Pipeline ID']?.rich_text?.[0]?.plain_text || null,
    trustLevel: properties['Trust Level']?.number || 0,
    pageId: page.id,
    lastEdited: page.last_edited_time,
    createdTime: page.created_time
  };
}

/**
 * Generate ChittyID for fact through pipeline
 */
async function generateChittyIDForFact(factData, env, ctx, correlationId) {
  const pipelineRequest = {
    entityType: mapFactTypeToEntityType(factData.factType),
    entityData: {
      ...factData,
      source: 'NOTION_WEBHOOK'
    }
  };

  try {
    const response = await fetch('https://api.vanguardlaw.com/pipeline/chittyid/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
        'X-Service-Auth': env.SERVICE_AUTH_TOKEN
      },
      body: JSON.stringify(pipelineRequest)
    });

    if (!response.ok) {
      throw new Error(`Pipeline generation failed: ${response.status}`);
    }

    const result = await response.json();

    return {
      success: true,
      chittyId: result.chittyId,
      pipelineId: result.pipelineId
    };

  } catch (error) {
    console.error('ChittyID generation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper functions
function mapFactTypeToEntityType(factType) {
  const mapping = {
    'DATE': 'EVENT',
    'AMOUNT': 'THING',
    'ADMISSION': 'EVENT',
    'IDENTITY': 'PERSON',
    'LOCATION': 'LOCATION',
    'RELATIONSHIP': 'EVENT',
    'ACTION': 'EVENT',
    'STATUS': 'THING'
  };

  return mapping[factType] || 'THING';
}

// Logging functions
async function logWebhookEvent(correlationId, event, data, env) {
  const logEntry = {
    correlationId,
    event,
    data,
    timestamp: new Date().toISOString()
  };

  await env.WEBHOOK_LOGS.put(
    `webhook_${correlationId}_${Date.now()}`,
    JSON.stringify(logEntry),
    { expirationTtl: 604800 } // 7 days
  );
}

async function logWebhookError(correlationId, error, env) {
  const errorEntry = {
    correlationId,
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  };

  await env.WEBHOOK_ERRORS.put(
    `webhook_error_${correlationId}_${Date.now()}`,
    JSON.stringify(errorEntry),
    { expirationTtl: 604800 } // 7 days
  );
}

// Missing handler functions
async function handleWebhookRegistration(request, env, ctx) {
  try {
    const registration = await request.json();
    return new Response(JSON.stringify({ success: true, registration }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleWebhookStatus(request, env, ctx) {
  try {
    const status = {
      status: 'healthy',
      timestamp: Date.now(),
      webhookEndpoint: '/webhook/notion/receive'
    };
    return new Response(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleWebhookVerification(request, env, ctx) {
  try {
    const verification = { verified: true, timestamp: Date.now() };
    return new Response(JSON.stringify(verification), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handlePageUpdated(payload, sessionContext, env, ctx, correlationId) {
  const result = await processPageEvent(payload, 'UPDATED', sessionContext, env, ctx, correlationId);
  return result;
}

async function handlePageDeleted(payload, sessionContext, env, ctx, correlationId) {
  const result = await processPageEvent(payload, 'DELETED', sessionContext, env, ctx, correlationId);
  return result;
}

async function handleDatabaseUpdated(payload, sessionContext, env, ctx, correlationId) {
  return {
    processed: true,
    action: 'DATABASE_UPDATED',
    databaseId: payload.id
  };
}

async function handleCommentCreated(payload, sessionContext, env, ctx, correlationId) {
  return {
    processed: true,
    action: 'COMMENT_CREATED',
    commentId: payload.id
  };
}

async function updateNotionPageWithChittyID(pageId, chittyId, env) {
  // Placeholder for Notion API update
  console.log(`Would update Notion page ${pageId} with ChittyID ${chittyId}`);
  return { success: true };
}

async function syncToChittyChain(factData, env, correlationId) {
  // Placeholder for ChittyChain sync
  console.log(`Would sync fact ${factData.factId} to ChittyChain`);
  return { success: true };
}

export {
  handleWebhookReceive,
  processWebhookEvent,
  WEBHOOK_EVENT_TYPES
};