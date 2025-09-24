/**
 * ChittyID generation utilities for ChittyRouter
 * Calls the id.chitty.cc service for generating unique IDs
 */

const CHITTYID_SERVICE_URL = 'https://id.chitty.cc/api/v1';

// Generate ChittyID for emails
export async function generateEmailChittyID(message) {
  try {
    const response = await fetch(`${CHITTYID_SERVICE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'EMAIL',
        metadata: {
          from: message.from,
          to: message.to,
          subject: message.subject,
          timestamp: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ChittyID service error: ${response.status}`);
    }

    const data = await response.json();
    return data.chittyId;
  } catch (error) {
    console.error('Failed to generate ChittyID from service:', error);
    // Fallback to local generation if service is unavailable
    return `CE-FALLBACK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Generate ChittyID for documents
export async function generateDocumentChittyID(attachment) {
  try {
    const fileHash = await calculateFileHash(attachment);

    const response = await fetch(`${CHITTYID_SERVICE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'DOCUMENT',
        metadata: {
          filename: attachment.name,
          fileHash: fileHash,
          size: attachment.size,
          mimeType: attachment.type,
          timestamp: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ChittyID service error: ${response.status}`);
    }

    const data = await response.json();
    return data.chittyId;
  } catch (error) {
    console.error('Failed to generate ChittyID from service:', error);
    // Fallback to local generation if service is unavailable
    return `CD-FALLBACK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Generate ChittyID for case entities
export async function generateCaseChittyID(caseData) {
  try {
    const response = await fetch(`${CHITTYID_SERVICE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CASE',
        metadata: {
          caseNumber: caseData.caseNumber,
          parties: caseData.parties,
          court: caseData.court,
          timestamp: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ChittyID service error: ${response.status}`);
    }

    const data = await response.json();
    return data.chittyId;
  } catch (error) {
    console.error('Failed to generate ChittyID from service:', error);
    // Fallback to local generation if service is unavailable
    return `CC-FALLBACK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Generate ChittyID for participants
export async function generateParticipantChittyID(participantData) {
  try {
    const response = await fetch(`${CHITTYID_SERVICE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'PARTICIPANT',
        metadata: {
          email: participantData.email,
          name: participantData.name,
          role: participantData.role,
          timestamp: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ChittyID service error: ${response.status}`);
    }

    const data = await response.json();
    return data.chittyId;
  } catch (error) {
    console.error('Failed to generate ChittyID from service:', error);
    // Fallback to local generation if service is unavailable
    return `CP-FALLBACK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Calculate file hash for verification
async function calculateFileHash(file) {
  const arrayBuffer = await file.stream().arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate ChittyID for media/migration files
export async function generateMediaChittyID(mediaData) {
  try {
    const response = await fetch(`${CHITTYID_SERVICE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'MEDIA',
        metadata: {
          path: mediaData.path,
          source: mediaData.source || 'MEDIA',
          filename: mediaData.filename,
          mimeType: mediaData.mimeType,
          size: mediaData.size,
          timestamp: new Date().toISOString()
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ChittyID service error: ${response.status}`);
    }

    const data = await response.json();
    return data.chittyId;
  } catch (error) {
    console.error('Failed to generate ChittyID from service:', error);
    // Fallback to local generation if service is unavailable
    return `CHITTY-${mediaData.source || 'MEDIA'}-FALLBACK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Validate ChittyID format
export async function validateChittyID(chittyId) {
  try {
    // First try to validate with the service
    const response = await fetch(`${CHITTYID_SERVICE_URL}/validate/${encodeURIComponent(chittyId)}`);

    if (response.ok) {
      const data = await response.json();
      return data.valid === true;
    }
  } catch (error) {
    console.error('Failed to validate with ChittyID service:', error);
  }

  // Fallback to local validation if service is unavailable
  const patterns = [
    /^CE-[a-f0-9]{8}-EMAIL-\d+$/, // Email ChittyID
    /^CD-[a-f0-9]{8}-DOC-\d+$/,   // Document ChittyID
    /^CC-[a-f0-9]{8}-CASE-\d+$/,  // Case ChittyID
    /^CP-[a-f0-9]{8}-PERSON-\d+$/, // Participant ChittyID
    /^CHITTY-[A-Z]+-\d+-[a-f0-9]{32}$/, // Media/Migration ChittyID
    /^C[ECPD]-FALLBACK-\d+-[a-z0-9]+$/, // Fallback ChittyID
    /^CHITTY-[A-Z]+-FALLBACK-\d+-[a-z0-9]+$/ // Media Fallback ChittyID
  ];

  return patterns.some(pattern => pattern.test(chittyId));
}

// Extract ChittyID type
export function getChittyIDType(chittyId) {
  if (chittyId.startsWith('CE-')) return 'EMAIL';
  if (chittyId.startsWith('CD-')) return 'DOCUMENT';
  if (chittyId.startsWith('CC-')) return 'CASE';
  if (chittyId.startsWith('CP-')) return 'PARTICIPANT';
  if (chittyId.startsWith('CHITTY-')) return 'MEDIA';
  return 'UNKNOWN';
}

// Parse media ChittyID components
export async function parseMediaChittyID(chittyId) {
  try {
    // Try to get details from the service
    const response = await fetch(`${CHITTYID_SERVICE_URL}/details/${encodeURIComponent(chittyId)}`);

    if (response.ok) {
      const data = await response.json();
      return data.metadata;
    }
  } catch (error) {
    console.error('Failed to parse ChittyID from service:', error);
  }

  // Fallback to local parsing if service is unavailable
  const match = chittyId.match(/^CHITTY-([A-Z]+)-(\d+)-([a-f0-9]{32})$/);
  if (!match) return null;

  return {
    source: match[1],
    timestamp: parseInt(match[2]),
    hash: match[3],
    date: new Date(parseInt(match[2]))
  };
}

// Batch generate ChittyIDs for better performance
export async function batchGenerateChittyIDs(items) {
  try {
    const response = await fetch(`${CHITTYID_SERVICE_URL}/generate/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items })
    });

    if (!response.ok) {
      throw new Error(`ChittyID service error: ${response.status}`);
    }

    const data = await response.json();
    return data.chittyIds;
  } catch (error) {
    console.error('Failed to batch generate ChittyIDs:', error);
    // Fallback to generating individually
    return Promise.all(items.map(item => {
      switch(item.type) {
        case 'EMAIL': return generateEmailChittyID(item.data);
        case 'DOCUMENT': return generateDocumentChittyID(item.data);
        case 'CASE': return generateCaseChittyID(item.data);
        case 'PARTICIPANT': return generateParticipantChittyID(item.data);
        case 'MEDIA': return generateMediaChittyID(item.data);
        default: return `UNKNOWN-FALLBACK-${Date.now()}`;
      }
    }));
  }
}