#!/usr/bin/env node

/**
 * ChittyRouter Email Sending Service
 * Cloudflare Email Workers integration for client communication
 */

import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';
import { logEmailToChain } from '../utils/chain-logger.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/send-case-update':
        return await sendCaseUpdate(request, env);
      case '/send-document-receipt':
        return await sendDocumentReceipt(request, env);
      case '/send-court-reminder':
        return await sendCourtReminder(request, env);
      case '/send-chittyid-confirmation':
        return await sendChittyIDConfirmation(request, env);
      default:
        return new Response('ChittyRouter Email Service Active', { status: 200 });
    }
  }
};

// Send case status updates to clients
async function sendCaseUpdate(request, env) {
  try {
    const { caseId, clientEmail, update, attorneyName } = await request.json();

    const msg = createMimeMessage();
    msg.setSender({
      name: 'Legal Team',
      addr: 'updates@example.com'
    });
    msg.setRecipient(clientEmail);
    msg.setSubject(`Case Update: ${caseId}`);

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #1a365d;">Case Update - ${caseId}</h2>

        <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Latest Update</h3>
          <p>${update}</p>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
          <p><strong>Attorney:</strong> ${attorneyName}</p>
          <p><strong>Secure Communication:</strong> All case communications are protected by ChittyOS encryption</p>
          <p><strong>Document Portal:</strong> <a href="https://evidence.example.com/${caseId}">Access Your Documents</a></p>
        </div>

        <div style="font-size: 12px; color: #718096; margin-top: 30px;">
          <p>This message was sent via ChittyRouter secure communication system.</p>
          <p>Please do not reply to this email. For urgent matters, contact our office directly.</p>
        </div>
      </div>
    `;

    msg.setMessage('text/html', htmlContent);

    const message = new EmailMessage(
      'updates@example.com',
      clientEmail,
      msg.asRaw()
    );

    await env.EMAIL_SENDER.send(message);

    // Log to ChittyChain
    await logEmailToChain(env, {
      type: 'CASE_UPDATE_SENT',
      caseId,
      recipient: clientEmail,
      attorney: attorneyName,
      timestamp: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Case update sent successfully'
    }));

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), { status: 500 });
  }
}

// Send document receipt confirmations
async function sendDocumentReceipt(request, env) {
  try {
    const { chittyId, clientEmail, documentName, hash } = await request.json();

    const msg = createMimeMessage();
    msg.setSender({
      name: 'Evidence Vault',
      addr: 'evidence@example.com'
    });
    msg.setRecipient(clientEmail);
    msg.setSubject(`Document Received - ChittyID: ${chittyId}`);

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #2d3748;">Document Successfully Received</h2>

        <div style="background: #e6fffa; border-left: 4px solid #38b2ac; padding: 20px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #2c7a7b;">Document Details</h3>
          <p><strong>Document:</strong> ${documentName}</p>
          <p><strong>ChittyID:</strong> <code style="background: #f7fafc; padding: 2px 6px; border-radius: 4px;">${chittyId}</code></p>
          <p><strong>Verification Hash:</strong> <code style="background: #f7fafc; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${hash}</code></p>
          <p><strong>Status:</strong> ✅ Verified and stored in Evidence Vault</p>
        </div>

        <div style="background: #fff5f5; border: 1px solid #fed7d7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="color: #c53030; margin-top: 0;">🔒 Blockchain Verification</h4>
          <p>Your document has been cryptographically verified and stored in our secure ChittyChain evidence ledger. This ensures:</p>
          <ul>
            <li>Immutable proof of receipt</li>
            <li>Tamper-evident storage</li>
            <li>Court-admissible chain of custody</li>
          </ul>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px; font-size: 12px; color: #718096;">
          <p>This is an automated confirmation from the ChittyOS platform.</p>
          <p>Your document is now part of the secure legal record.</p>
        </div>
      </div>
    `;

    msg.setMessage('text/html', htmlContent);

    const message = new EmailMessage(
      'evidence@example.com',
      clientEmail,
      msg.asRaw()
    );

    await env.EMAIL_SENDER.send(message);

    return new Response(JSON.stringify({
      success: true,
      chittyId,
      message: 'Document receipt confirmation sent'
    }));

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), { status: 500 });
  }
}

// Send court date reminders
async function sendCourtReminder(request, env) {
  try {
    const { caseId, clientEmail, courtDate, courtroom, time } = await request.json();

    const msg = createMimeMessage();
    msg.setSender({
      name: 'Court Calendar',
      addr: 'calendar@example.com'
    });
    msg.setRecipient(clientEmail);
    msg.setSubject(`Court Reminder: ${caseId} - ${courtDate}`);

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #744210; background: #fef5e7; padding: 15px; border-radius: 8px; text-align: center;">
          ⚖️ Court Date Reminder
        </h2>

        <div style="background: #f0fff4; border: 2px solid #48bb78; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #2f855a;">Upcoming Court Appearance</h3>
          <p><strong>Case:</strong> ${caseId}</p>
          <p><strong>Date:</strong> ${courtDate}</p>
          <p><strong>Time:</strong> ${time}</p>
          <p><strong>Courtroom:</strong> ${courtroom}</p>
        </div>

        <div style="background: #fffaf0; border: 1px solid #ed8936; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="color: #c05621; margin-top: 0;">📋 Preparation Checklist</h4>
          <ul>
            <li>Review case documents in Evidence Vault</li>
            <li>Bring valid photo identification</li>
            <li>Arrive 30 minutes early</li>
            <li>Contact our office with any questions</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://evidence.example.com/${caseId}"
             style="background: #3182ce; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            📁 Access Case Documents
          </a>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px; font-size: 12px; color: #718096;">
          <p>Questions? Call us at (555) 123-LEGAL</p>
          <p>This reminder was sent via ChittyRouter secure scheduling system.</p>
        </div>
      </div>
    `;

    msg.setMessage('text/html', htmlContent);

    const message = new EmailMessage(
      'calendar@example.com',
      clientEmail,
      msg.asRaw()
    );

    await env.EMAIL_SENDER.send(message);

    return new Response(JSON.stringify({
      success: true,
      message: 'Court reminder sent successfully'
    }));

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), { status: 500 });
  }
}

// Send ChittyID confirmation for new entities
async function sendChittyIDConfirmation(request, env) {
  try {
    const { chittyId, email, entityType, name } = await request.json();

    const msg = createMimeMessage();
    msg.setSender({
      name: 'ChittyID System',
      addr: 'chittyid@example.com'
    });
    msg.setRecipient(email);
    msg.setSubject(`ChittyID Assigned: ${chittyId}`);

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center;">
          <h1 style="margin: 0;">🆔 ChittyID Generated</h1>
        </div>

        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <h2 style="margin-top: 0; color: #2d3748;">Your Official ChittyID</h2>
          <div style="background: white; padding: 15px; border-radius: 6px; border: 2px solid #e2e8f0;">
            <code style="font-size: 18px; color: #2b6cb0; font-weight: bold;">${chittyId}</code>
          </div>
          <p style="margin-top: 15px; color: #4a5568;"><strong>Entity:</strong> ${name} (${entityType})</p>
        </div>

        <div style="background: #e6fffa; border-left: 4px solid #38b2ac; padding: 20px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #2c7a7b;">What is ChittyID?</h3>
          <p>Your ChittyID is a unique identifier in the ChittyOS legal platform that:</p>
          <ul>
            <li>Provides secure, verified identity across all systems</li>
            <li>Enables blockchain-verified document authentication</li>
            <li>Links all case communications and evidence</li>
            <li>Ensures immutable legal record keeping</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <p style="color: #718096; font-size: 14px;">
            Keep this ChittyID for your records. It will be referenced in all future communications.
          </p>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px; font-size: 12px; color: #718096;">
          <p>This ChittyID was generated by the official ChittyID system with Mod-97 validation.</p>
          <p>Powered by ChittyOS - Secure Legal Technology Platform</p>
        </div>
      </div>
    `;

    msg.setMessage('text/html', htmlContent);

    const message = new EmailMessage(
      'chittyid@example.com',
      email,
      msg.asRaw()
    );

    await env.EMAIL_SENDER.send(message);

    return new Response(JSON.stringify({
      success: true,
      chittyId,
      message: 'ChittyID confirmation sent successfully'
    }));

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), { status: 500 });
  }
}

// Export for wrangler.toml configuration
export const emailConfig = {
  send_email: [
    { name: 'EMAIL_SENDER', destination_address: 'updates@example.com' },
    { name: 'EVIDENCE_SENDER', destination_address: 'evidence@example.com' },
    { name: 'CALENDAR_SENDER', destination_address: 'calendar@example.com' },
    { name: 'CHITTYID_SENDER', destination_address: 'chittyid@example.com' }
  ]
};