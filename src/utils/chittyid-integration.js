/**
 * ChittyID Integration for Workers
 * Ensures every worker and service gets a unique ChittyID from id.chitty.cc
 * Uses service discovery to find ChittyID service endpoint
 */

import { ServiceDiscovery } from "./service-discovery.js";

// Default fallback endpoint
const CHITTYID_API_FALLBACK = "https://id.chitty.cc/api/v1";
let serviceDiscovery = null;

/**
 * Get ChittyID API endpoint using service discovery
 */
async function getChittyIdApiEndpoint(env) {
  if (!serviceDiscovery && env) {
    serviceDiscovery = new ServiceDiscovery(env);
    await serviceDiscovery.initialize();
  }

  if (serviceDiscovery) {
    try {
      const endpoint = await serviceDiscovery.getEndpointForCapability(
        "chittyid_generation",
        "chittyid",
      );
      if (endpoint) {
        return `${endpoint}/api/v1`;
      }
    } catch (error) {
      console.warn("⚠️ Failed to discover ChittyID endpoint:", error.message);
    }
  }

  return CHITTYID_API_FALLBACK;
}

/**
 * Request a new ChittyID for a worker/service from id.chitty.cc
 */
export async function requestChittyId(workerName, metadata = {}, env = null) {
  try {
    const chittyIdApi = await getChittyIdApiEndpoint(env);

    const params = new URLSearchParams({
      for: `chittyrouter-${workerName}`,
      region: metadata.region || "1", // North America
      jurisdiction: metadata.jurisdiction || "USA",
      entityType: "T", // ChittyThing for workers/services
      trustLevel: metadata.trustLevel || "2", // Standard trust
      purpose: `ChittyOS Worker: ${workerName}`,
      requester: "chittyrouter",
    });

    const response = await fetch(`${chittyIdApi}/get-chittyid?${params}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Service-Name": "chittyrouter",
        "X-Worker-Name": workerName,
        "User-Agent": "ChittyRouter/2.0.0-ai",
      },
    });

    if (!response.ok) {
      throw new Error(`ChittyID request failed: ${response.status}`);
    }

    const result = await response.json();

    console.log(`ChittyID received for ${workerName}: ${result.chittyId}`);

    return {
      chittyId: result.chittyId,
      metadata: result.metadata || {},
      timestamp: result.timestamp,
    };
  } catch (error) {
    console.error(`Failed to request ChittyID for ${workerName}:`, error);

    // NO LOCAL GENERATION - All ChittyIDs MUST come from id.chitty.cc
    throw new Error(
      `ChittyID service unavailable for ${workerName}. Cannot proceed without valid ChittyID from id.chitty.cc`,
    );
  }
}

/**
 * Verify an existing ChittyID with id.chitty.cc
 */
export async function verifyChittyId(chittyId, env = null) {
  try {
    const chittyIdApi = await getChittyIdApiEndpoint(env);

    const response = await fetch(`${chittyIdApi}/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        id: chittyId,
        context: "worker-verification",
      }),
    });

    if (!response.ok) {
      return { valid: false, error: `Verification failed: ${response.status}` };
    }

    const result = await response.json();
    return {
      valid: result.valid,
      chittyId: result.id,
      details: result.details || {},
      lastVerified: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Failed to verify ChittyID ${chittyId}:`, error);
    return { valid: false, error: error.message };
  }
}

/**
 * Get or create ChittyID for a worker
 */
export async function ensureWorkerChittyId(env, workerName) {
  // Check if worker already has a ChittyID stored
  const storedId = await getStoredChittyId(env, workerName);

  if (storedId) {
    // Verify it's still valid
    const verification = await verifyChittyId(storedId, env);
    if (verification.valid) {
      console.log(`Using existing ChittyID for ${workerName}: ${storedId}`);
      return storedId;
    }
    console.warn(
      `Stored ChittyID invalid for ${workerName}, requesting new one`,
    );
  }

  // Request a new ChittyID
  const newId = await requestChittyId(
    workerName,
    {
      environment: env.ENVIRONMENT,
      version: env.VERSION,
      accountId: env.ACCOUNT_ID,
      capabilities: getWorkerCapabilities(workerName),
    },
    env,
  );

  // Store the new ChittyID
  await storeChittyId(env, workerName, newId.chittyId);

  return newId.chittyId;
}

/**
 * Store ChittyID in KV or Durable Object
 */
async function storeChittyId(env, workerName, chittyId) {
  if (env.CHITTYID_STORE) {
    // Store in KV
    await env.CHITTYID_STORE.put(
      `worker:${workerName}`,
      JSON.stringify({
        chittyId,
        workerName,
        storedAt: new Date().toISOString(),
      }),
      { expirationTtl: 86400 * 365 }, // 1 year
    );
  } else {
    // Fallback to environment variable or config
    env[`CHITTYID_${workerName.toUpperCase()}`] = chittyId;
  }

  console.log(`Stored ChittyID for ${workerName}: ${chittyId}`);
}

/**
 * Retrieve stored ChittyID
 */
async function getStoredChittyId(env, workerName) {
  // Check KV store first
  if (env.CHITTYID_STORE) {
    const stored = await env.CHITTYID_STORE.get(`worker:${workerName}`);
    if (stored) {
      const data = JSON.parse(stored);
      return data.chittyId;
    }
  }

  // Check environment variable
  const envId = env[`CHITTYID_${workerName.toUpperCase()}`];
  if (envId) {
    return envId;
  }

  // Check hardcoded registry
  const hardcoded = KNOWN_WORKER_IDS[workerName];
  if (hardcoded) {
    return hardcoded;
  }

  return null;
}

/**
 * REMOVED: generateFallbackChittyId()
 *
 * ChittyOS Policy: NO local ChittyID generation permitted.
 * All ChittyIDs MUST be minted from id.chitty.cc service.
 * Fallback generation violates ChittyID Authority and has been removed.
 */

/**
 * Get worker capabilities for ChittyID metadata
 */
function getWorkerCapabilities(workerName) {
  const capabilities = {
    chittyrouter: ["ai", "email", "routing", "sync"],
    chittychat: ["messaging", "sessions", "github-sync"],
    chittyid: ["id-generation", "verification"],
    chittychain: ["blockchain", "ledger", "immutable-storage"],
    chittydashboard: ["ui", "analytics", "reporting"],
    chittycases: ["case-management", "legal-workflow"],
    chittyverify: ["verification", "authentication"],
    "chitty-unified": ["ai", "processing", "sync", "logging"],
    "chitty-ui": ["frontend", "dashboard", "user-interface"],
    "chitty-connect": ["integrations", "webhooks", "external-apis"],
  };

  return capabilities[workerName] || ["general"];
}

/**
 * Known worker ChittyIDs (hardcoded registry)
 */
const KNOWN_WORKER_IDS = {
  chittyid: "CHITTY-CORE-ID-000001",
  chittychat: "CHITTY-CORE-CHAT-000002",
  chittychain: "CHITTY-CORE-CHAIN-000003",
};

/**
 * Request ChittyIDs for multiple workers (sequential requests)
 */
export async function batchRequestChittyIds(workers) {
  const results = [];

  for (const worker of workers) {
    try {
      const result = await requestChittyId(
        worker.name,
        worker.metadata || {},
        worker.env,
      );
      results.push({
        workerName: worker.name,
        chittyId: result.chittyId,
        success: true,
      });
    } catch (error) {
      console.error(`Failed to request ChittyID for ${worker.name}:`, error);

      // NO FALLBACK - Record failure without generating local ID
      results.push({
        workerName: worker.name,
        chittyId: null,
        success: false,
        error: error.message,
        message: "ChittyID service unavailable - no local generation permitted",
      });
    }
  }

  return results;
}

/**
 * ChittyID middleware for worker initialization
 */
export async function chittyIdMiddleware(env, workerName) {
  // Ensure worker has a ChittyID on startup
  const chittyId = await ensureWorkerChittyId(env, workerName);

  // Add to environment for easy access
  env.WORKER_CHITTYID = chittyId;

  // Add to all responses
  return {
    chittyId,
    addToResponse: (response) => {
      response.headers.set("X-ChittyID", chittyId);
      response.headers.set("X-Worker-Name", workerName);
      return response;
    },
  };
}

/**
 * Initialize service discovery for ChittyID integration
 */
export async function initializeChittyIdDiscovery(env) {
  if (!serviceDiscovery) {
    serviceDiscovery = new ServiceDiscovery(env);
    await serviceDiscovery.initialize();
    console.log("🆔 ChittyID service discovery initialized");
  }
  return serviceDiscovery;
}

/**
 * Export ChittyID client for use in workers
 */
export const ChittyIdClient = {
  request: requestChittyId,
  verify: verifyChittyId,
  ensure: ensureWorkerChittyId,
  batch: batchRequestChittyIds,
  middleware: chittyIdMiddleware,
  initializeDiscovery: initializeChittyIdDiscovery,
  getEndpoint: getChittyIdApiEndpoint,
};
