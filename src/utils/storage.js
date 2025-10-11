/**
 * Storage utilities for ChittyRouter
 * Integrates with ChittyChain and Evidence Vault services
 */

import {
  validateDocumentSchema,
  getSchemaServiceHealth,
} from "./schema-validation.js";

// Store data in ChittyChain blockchain ledger
export async function storeInChittyChain(env, data) {
  const chainEntry = {
    timestamp: new Date().toISOString(),
    type: data.type || "CHITTYROUTER_ENTRY",
    data: data,
    hash: await calculateDataHash(data),
  };

  try {
    // Use the CHITTYOS_SERVICE binding from wrangler.toml
    const endpoint = env.CHITTYOS_ENDPOINT || "https://chittyos.com";
    const response = await fetch(`${endpoint}/api/chittychain/store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CHITTYCHAIN_API_KEY}`,
      },
      body: JSON.stringify(chainEntry),
    });

    if (!response.ok) {
      throw new Error(`ChittyChain storage failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Stored in ChittyChain:", result.blockHash);
    return result;
  } catch (error) {
    console.error("Error storing in ChittyChain:", error);
    // Fallback to local storage for development
    return await storeLocally(chainEntry);
  }
}

// Store document in Evidence Vault
export async function storeInEvidenceVault(env, file, chittyId) {
  // Validate document metadata against schema
  const documentData = {
    filename: file.name,
    size: file.size,
    type: file.type,
    chittyId: chittyId,
    timestamp: new Date().toISOString(),
  };

  const schemaValidation = await validateDocumentSchema(documentData);
  if (!schemaValidation.valid) {
    console.warn(
      "⚠️ Document schema validation failed:",
      schemaValidation.errors,
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("chittyId", chittyId);
  formData.append("timestamp", documentData.timestamp);

  // Include validated metadata
  if (schemaValidation.valid) {
    formData.append("documentType", schemaValidation.documentType);
    formData.append("classification", schemaValidation.classification);
    formData.append(
      "complianceFlags",
      JSON.stringify(schemaValidation.complianceFlags),
    );
  }

  try {
    const endpoint = env.EVIDENCE_VAULT_URL || "https://evidence.chittyos.com";
    const response = await fetch(`${endpoint}/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EVIDENCE_VAULT_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Evidence Vault storage failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Stored in Evidence Vault:", result.vaultId);
    return result;
  } catch (error) {
    console.error("Error storing in Evidence Vault:", error);
    return {
      error: error.message,
      stored: false,
      chittyId: chittyId,
    };
  }
}

// Retrieve data from ChittyChain
export async function retrieveFromChittyChain(env, identifier) {
  try {
    const endpoint = env.CHITTYOS_ENDPOINT || "https://chittyos.com";
    const response = await fetch(
      `${endpoint}/api/chittychain/retrieve/${identifier}`,
      {
        headers: {
          Authorization: `Bearer ${env.CHITTYCHAIN_API_KEY}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`ChittyChain retrieval failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error retrieving from ChittyChain:", error);
    return null;
  }
}

// Query ChittyChain by case ID
export async function queryChittyChainByCase(env, caseId) {
  try {
    const endpoint = env.CHITTYOS_ENDPOINT || "https://chittyos.com";
    const response = await fetch(
      `${endpoint}/api/chittychain/query?caseId=${caseId}`,
      {
        headers: {
          Authorization: `Bearer ${env.CHITTYCHAIN_API_KEY}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`ChittyChain query failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error querying ChittyChain:", error);
    return [];
  }
}

// ChittyChat integration for messaging
export async function sendChittyChatMessage(env, message) {
  try {
    const endpoint = env.CHITTYCHAT_API || "https://chittychat.api.com";
    const response = await fetch(`${endpoint}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CHITTYCHAT_API_KEY}`,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`ChittyChat send failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error sending ChittyChat message:", error);
    return { error: error.message, sent: false };
  }
}

// Generate ChittyID using the service binding
export async function generateChittyIDFromService(env, type, metadata) {
  try {
    // Use the CHITTYID_SERVICE binding
    const response = await fetch("https://id.chitty.cc/api/v1/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: env.CHITTYID_API_KEY
          ? `Bearer ${env.CHITTYID_API_KEY}`
          : undefined,
      },
      body: JSON.stringify({
        type: type,
        metadata: metadata,
      }),
    });

    if (!response.ok) {
      throw new Error(`ChittyID service error: ${response.status}`);
    }

    const data = await response.json();
    return data.chittyId;
  } catch (error) {
    console.error("Failed to generate ChittyID from service:", error);
    // SERVICE OR FAIL - No local generation allowed
    throw new Error(
      `ChittyID service unavailable - cannot generate ${type} ID: ${error.message}`,
    );
  }
}

// Store locally for development/fallback
async function storeLocally(data) {
  // This would use Durable Objects in production
  const id = `local_${Date.now()}`;

  console.log(`Storing locally with ID: ${id}`, data);

  return {
    id: id,
    blockHash: `local_${await calculateDataHash(data)}`,
    stored: true,
    timestamp: new Date().toISOString(),
  };
}

// Calculate hash for data verification
async function calculateDataHash(data) {
  const dataString = JSON.stringify(data);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(dataString),
  );
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Verify data integrity
export async function verifyDataIntegrity(data, expectedHash) {
  const actualHash = await calculateDataHash(data);
  return actualHash === expectedHash;
}

// Get service health status
export async function getServiceHealth(env) {
  const services = {
    chittyos: env.CHITTYOS_ENDPOINT || "https://chittyos.com",
    chittychat: env.CHITTYCHAT_API || "https://chittychat.api.com",
    evidence_vault: env.EVIDENCE_VAULT_URL || "https://evidence.chittyos.com",
    chittyid: "https://id.chitty.cc",
    schema: "https://schema.chitty.cc",
  };

  const health = {};

  for (const [name, endpoint] of Object.entries(services)) {
    try {
      // Use specific health check for schema service
      if (name === "schema") {
        health[name] = await getSchemaServiceHealth();
        continue;
      }

      const response = await fetch(`${endpoint}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      health[name] = {
        status: response.ok ? "healthy" : "unhealthy",
        statusCode: response.status,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      health[name] = {
        status: "unreachable",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  return health;
}
