#!/usr/bin/env node

/**
 * ChittyRouter + Cloudflare Email Routing Integration
 * Email Workers for ChittyOS case management
 */

import { ChittyIDValidator } from '../chittyid/chittyid-validator.js';
import { routeToChittyChat } from '../utils/chat-router.js';
import { storeInChittyChain, storeInEvidenceVault } from '../utils/storage.js';
import { EMAIL_ROUTES } from '../config/routes.js';

// Email Worker for incoming case emails
export default {
  async email(message, env, ctx) {
    // Extract case information from email address
    const to = message.to;
    const caseMatch = to.match(/([a-zA-Z-]+)-v-([a-zA-Z-]+)@/);

    if (caseMatch) {
      const [, plaintiff, defendant] = caseMatch;
      const caseId = `${plaintiff.toUpperCase()}_v_${defendant.toUpperCase()}`;

      // Generate ChittyID for email evidence
      const chittyId = await generateEmailChittyID(message);

      // Route to ChittyChat thread
      await routeToChittyChat({
        caseId,
        chittyId,
        from: message.from,
        subject: message.headers.get("subject"),
        content: await streamToText(message.raw),
        attachments: await processAttachments(message)
      });

      // Send confirmation
      await message.reply({
        subject: `Re: ${message.headers.get("subject")} [ChittyID: ${chittyId}]`,
        text: `Your message has been received and assigned ChittyID: ${chittyId}\n\nThis communication is now part of the secure ChittyOS case management system.\n\nLegal Team\nSecure Legal Communications`
      });
    }

    // Route based on email configuration
    const route = EMAIL_ROUTES[to.toLowerCase()];
    if (route && route.attorneys) {
      for (const attorney of route.attorneys) {
        await message.forward(attorney);
      }
    } else {
      // Default forward to intake
      await message.forward("intake@example.com");
    }
  }
};

// Process email attachments
async function processAttachments(message) {
  const attachments = [];

  for (const attachment of message.attachments) {
    const chittyId = await generateDocumentChittyID(attachment);

    attachments.push({
      filename: attachment.name,
      size: attachment.size,
      type: attachment.type,
      chittyId: chittyId,
      hash: await calculateFileHash(attachment),
      stored: await storeInEvidenceVault(attachment, chittyId)
    });
  }

  return attachments;
}

// Convert ReadableStream to text
async function streamToText(readableStream) {
  const reader = readableStream.getReader();
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += new TextDecoder().decode(value);
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

// Calculate file hash for verification
async function calculateFileHash(file) {
  const arrayBuffer = await file.stream().arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Durable Object for case state management
export class CaseStateDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/store-email':
        return this.storeEmail(await request.json());
      case '/get-case-emails':
        return this.getCaseEmails(url.searchParams.get('caseId'));
      case '/update-case-status':
        return this.updateCaseStatus(await request.json());
      default:
        return new Response('Case State DO Active', { status: 200 });
    }
  }

  async storeEmail(emailData) {
    await this.state.storage.put(`email:${emailData.chittyId}`, emailData);

    // Update case timeline
    const timeline = await this.state.storage.get('timeline') || [];
    timeline.push({
      timestamp: new Date().toISOString(),
      type: 'EMAIL_RECEIVED',
      chittyId: emailData.chittyId,
      from: emailData.from,
      subject: emailData.subject
    });

    await this.state.storage.put('timeline', timeline);

    return new Response(JSON.stringify({
      success: true,
      chittyId: emailData.chittyId
    }));
  }

  async getCaseEmails(caseId) {
    const emails = await this.state.storage.list({ prefix: 'email:' });
    const caseEmails = [];

    for (const [key, email] of emails) {
      if (email.caseId === caseId) {
        caseEmails.push(email);
      }
    }

    return new Response(JSON.stringify(caseEmails));
  }

  async updateCaseStatus(statusData) {
    await this.state.storage.put(`case:${statusData.caseId}`, statusData);
    return new Response(JSON.stringify({ success: true }));
  }
}