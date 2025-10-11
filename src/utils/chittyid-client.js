/**
 * ChittyID Client Wrapper for ChittyRouter
 * Uses standard @chittyos/chittyid-client package
 * SERVICE OR FAIL - No local generation allowed
 */

import ChittyIDClient from "@chittyos/chittyid-client";

// Initialize standard client
const client = new ChittyIDClient({
  serviceUrl: process.env.CHITTYID_SERVICE_URL || "https://id.chitty.cc/v1",
  apiKey: process.env.CHITTY_ID_TOKEN || process.env.CHITTYID_API_KEY,
});

// Request ChittyID minting for emails
export async function requestEmailChittyID(message) {
  return await client.mint({
    entity: "INFO",
    name: `Email: ${message.subject}`,
    metadata: {
      type: "EMAIL",
      from: message.from,
      to: message.to,
      subject: message.subject,
      timestamp: new Date().toISOString(),
    },
  });
}

// Request ChittyID minting for documents
export async function requestDocumentChittyID(attachment) {
  const fileHash = await calculateFileHash(attachment);

  return await client.mint({
    entity: "PROP",
    name: attachment.name,
    metadata: {
      type: "DOCUMENT",
      filename: attachment.name,
      fileHash: fileHash,
      size: attachment.size,
      mimeType: attachment.type,
      timestamp: new Date().toISOString(),
    },
  });
}

// Request ChittyID minting for case entities
export async function requestCaseChittyID(caseData) {
  return await client.mint({
    entity: "EVNT",
    name: `Case: ${caseData.caseNumber}`,
    metadata: {
      type: "CASE",
      caseNumber: caseData.caseNumber,
      parties: caseData.parties,
      court: caseData.court,
      timestamp: new Date().toISOString(),
    },
  });
}

// Request ChittyID minting for participants
export async function requestParticipantChittyID(participantData) {
  return await client.mint({
    entity: "PEO",
    name: participantData.name,
    metadata: {
      type: "PARTICIPANT",
      email: participantData.email,
      role: participantData.role,
      timestamp: new Date().toISOString(),
    },
  });
}

// Calculate file hash for verification
async function calculateFileHash(file) {
  const arrayBuffer = await file.stream().arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Request ChittyID for media/migration files
export async function generateMediaChittyID(mediaData) {
  return await client.mint({
    entity: "PROP",
    name: mediaData.filename,
    metadata: {
      type: "MEDIA",
      path: mediaData.path,
      source: mediaData.source || "MEDIA",
      filename: mediaData.filename,
      mimeType: mediaData.mimeType,
      size: mediaData.size,
      timestamp: new Date().toISOString(),
    },
  });
}

// Validate ChittyID format
export async function validateChittyID(chittyId) {
  const result = await client.validate(chittyId);
  return result.valid;
}

// Export client for direct usage
export { client as chittyIDClient };
