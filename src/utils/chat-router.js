/**
 * ChittyChat integration utilities for ChittyRouter
 */

import { storeInChittyChain } from './storage.js';

// Route email to ChittyChat thread
export async function routeToChittyChat(emailData) {
  const chittyThread = {
    id: emailData.chittyId,
    caseId: emailData.caseId,
    type: 'EMAIL_INTAKE',
    participants: [emailData.from, 'legal-team'],
    messages: [{
      timestamp: new Date().toISOString(),
      from: emailData.from,
      subject: emailData.subject,
      content: emailData.content,
      attachments: emailData.attachments,
      chittyId: emailData.chittyId
    }],
    status: 'ACTIVE',
    priority: determinePriority(emailData)
  };

  // Store in ChittyChain for immutable record
  await storeInChittyChain(chittyThread);

  // Notify attorneys via ChittyChat
  await notifyAttorneys(chittyThread);

  return chittyThread;
}

// Determine message priority based on content and sender
function determinePriority(emailData) {
  const urgentKeywords = [
    'urgent', 'emergency', 'asap', 'immediate',
    'court date', 'deadline', 'subpoena', 'motion'
  ];

  const content = (emailData.subject + ' ' + emailData.content).toLowerCase();
  const hasUrgentKeywords = urgentKeywords.some(keyword =>
    content.includes(keyword)
  );

  if (hasUrgentKeywords) return 'HIGH';
  if (emailData.attachments && emailData.attachments.length > 0) return 'NORMAL';
  return 'LOW';
}

// Notify attorneys of new thread
async function notifyAttorneys(thread) {
  const notification = {
    type: 'NEW_EMAIL_THREAD',
    threadId: thread.id,
    caseId: thread.caseId,
    from: thread.messages[0].from,
    subject: thread.messages[0].subject,
    priority: thread.priority,
    timestamp: new Date().toISOString()
  };

  // Send to ChittyChat notification system
  try {
    const response = await fetch('https://chittychat.api.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CHITTYCHAT_API_KEY}`
      },
      body: JSON.stringify(notification)
    });

    if (!response.ok) {
      console.error('Failed to send ChittyChat notification:', response.statusText);
    }
  } catch (error) {
    console.error('Error sending ChittyChat notification:', error);
  }
}

// Create new case thread
export async function createCaseThread(caseData) {
  const thread = {
    id: `CASE_${caseData.caseId}_MAIN`,
    caseId: caseData.caseId,
    type: 'CASE_MANAGEMENT',
    participants: caseData.attorneys || ['legal-team'],
    messages: [{
      timestamp: new Date().toISOString(),
      from: 'system',
      content: `Case thread created for ${caseData.caseId}`,
      type: 'SYSTEM_MESSAGE'
    }],
    status: 'ACTIVE',
    priority: 'NORMAL',
    metadata: {
      caseNumber: caseData.caseNumber,
      parties: caseData.parties,
      created: new Date().toISOString()
    }
  };

  await storeInChittyChain(thread);
  return thread;
}

// Add message to existing thread
export async function addMessageToThread(threadId, messageData) {
  // Retrieve existing thread from storage
  // Update with new message
  // Store updated thread

  const message = {
    timestamp: new Date().toISOString(),
    from: messageData.from,
    content: messageData.content,
    attachments: messageData.attachments || [],
    chittyId: messageData.chittyId
  };

  // This would integrate with actual ChittyChat storage
  console.log(`Adding message to thread ${threadId}:`, message);

  return message;
}