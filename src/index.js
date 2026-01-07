// Unified ChittyOS Worker - Consolidating all services into one
import { handleAnalytics } from "./analytics.js";
import { handleServices } from "./services.js";
import { handleDatabase } from "./database.js";
import { handleOpenAPISchema } from "./openapi-schema.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;

    // Route based on subdomain or path
    try {
      // OpenAPI Schema routes (for ChatGPT integration)
      if (
        hostname.includes("ai.chitty.cc") ||
        pathname.startsWith("/openapi")
      ) {
        const schemaResponse = await handleOpenAPISchema(request);
        if (schemaResponse) {
          return schemaResponse;
        }
      }

      // Platform routes (main chittyos-platform-live functionality)
      if (hostname.includes("platform") || pathname.startsWith("/platform")) {
        return await handleServices(request, env, ctx);
      }

      // Bridge service routes
      if (hostname.includes("bridge") || pathname.startsWith("/bridge")) {
        return await handleBridge(request, env, ctx);
      }

      // Consultant service routes
      if (
        hostname.includes("consultant") ||
        pathname.startsWith("/consultant")
      ) {
        return await handleConsultant(request, env, ctx);
      }

      // Chain service routes
      if (hostname.includes("chain") || pathname.startsWith("/chain")) {
        return await handleChain(request, env, ctx);
      }

      // CTO MCP routes
      if (hostname.includes("cto") || pathname.startsWith("/cto")) {
        return await handleCTO(request, env, ctx);
      }

      // Landing page routes
      if (hostname.includes("landing") || pathname === "/") {
        return await handleLanding(request, env, ctx);
      }

      // Analytics endpoint
      if (pathname === "/analytics") {
        return await handleAnalytics(request, env);
      }

      // API services endpoints
      if (pathname.startsWith("/api/")) {
        return await handleServices(request, env);
      }

      // Database endpoints (Neon + Hyperdrive)
      if (pathname.startsWith("/db/")) {
        return await handleDatabase(request, env);
      }

      // Health check endpoint
      if (pathname === "/health") {
        return new Response(
          JSON.stringify({
            status: "healthy",
            services: [
              "platform",
              "bridge",
              "consultant",
              "chain",
              "cto",
              "landing",
              "analytics",
              "ai",
              "workflows",
              "vectorize",
            ],
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      }

      // Default fallback
      return new Response("ChittyOS Unified Worker - Service not found", {
        status: 404,
      });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  },
};

// Platform handler implementations
async function handleBridge(request, env, ctx) {
  return await handleServices(request, env, ctx);
}

async function handleConsultant(request, env, ctx) {
  return await handleServices(request, env, ctx);
}

async function handleChain(request, env, ctx) {
  return await handleServices(request, env, ctx);
}

async function handleCTO(request, env, ctx) {
  return await handleServices(request, env, ctx);
}

async function handleLanding(request, env, ctx) {
  return new Response("ChittyOS Ultimate Worker - Unified Platform", {
    headers: { "content-type": "text/plain" },
  });
}
async function handlePlatform(request, env, ctx) {
  // This will contain the main platform logic with AI, KV, and Durable Objects
  const {
    AI_GATEWAY_STATE,
    PLATFORM_STATE,
    SYNC_STATE,
    KV_PLATFORM_STATE,
    KV_PLATFORM_DATA,
    AI,
  } = env;

  // TODO: Add actual platform logic here
  return new Response("ChittyOS Platform Service", {
    headers: { "content-type": "text/plain" },
  });
}

// Bridge service handler
async function handleBridge(request, env, ctx) {
  // TODO: Add bridge service logic
  return new Response("ChittyOS Bridge Service", {
    headers: { "content-type": "text/plain" },
  });
}

// Consultant service handler
async function handleConsultant(request, env, ctx) {
  // TODO: Add consultant service logic
  return new Response("ChittyOS Consultant Service", {
    headers: { "content-type": "text/plain" },
  });
}

// Chain service handler
async function handleChain(request, env, ctx) {
  // TODO: Add chain service logic
  return new Response("ChittyOS Chain Service", {
    headers: { "content-type": "text/plain" },
  });
}

// CTO MCP handler
async function handleCTO(request, env, ctx) {
  // TODO: Add CTO MCP logic
  return new Response("ChittyOS CTO MCP Service", {
    headers: { "content-type": "text/plain" },
  });
}

// Landing page handler
async function handleLanding(request, env, ctx) {
  // TODO: Add landing page logic
  return new Response("ChittyOS Landing Page", {
    headers: { "content-type": "text/plain" },
  });
}

// Durable Object classes (from chittyos-platform-live)
export class AIGatewayState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    // TODO: Add AI Gateway logic
    return new Response("AI Gateway State");
  }
}

export class ChittyOSPlatformState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    // TODO: Add Platform State logic
    return new Response("Platform State");
  }
}

export class SyncState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    // TODO: Add Sync State logic
    return new Response("Sync State");
  }
}
