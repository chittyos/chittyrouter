/**
 * ChittyChain logging utilities for ChittyRouter
 */

import { storeInChittyChain } from './storage.js';

// Log email activity to ChittyChain
export async function logEmailToChain(env, emailData) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'EMAIL_ACTIVITY',
    service: 'CHITTYROUTER',
    data: emailData,
    hash: await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(emailData))
    )
  };

  try {
    // Store in ChittyChain
    await storeInChittyChain(logEntry);

    // Also store in Durable Object for quick access
    if (env.CHITTYCHAIN_DO) {
      const durableObjectId = env.CHITTYCHAIN_DO.idFromName('email-log');
      const durableObject = env.CHITTYCHAIN_DO.get(durableObjectId);

      await durableObject.fetch(new Request('https://example.com/log-email', {
        method: 'POST',
        body: JSON.stringify(logEntry)
      }));
    }

    console.log('Email activity logged to ChittyChain:', emailData.type);

  } catch (error) {
    console.error('Error logging to ChittyChain:', error);
  }
}

// Log routing activity
export async function logRoutingActivity(routingData) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'ROUTING_ACTIVITY',
    service: 'CHITTYROUTER',
    data: routingData
  };

  await storeInChittyChain(logEntry);
}

// Log system events
export async function logSystemEvent(eventType, eventData) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'SYSTEM_EVENT',
    service: 'CHITTYROUTER',
    eventType: eventType,
    data: eventData
  };

  await storeInChittyChain(logEntry);
}

// Log error events
export async function logError(error, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'ERROR_EVENT',
    service: 'CHITTYROUTER',
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context: context
  };

  await storeInChittyChain(logEntry);
  console.error('Error logged to ChittyChain:', error.message);
}