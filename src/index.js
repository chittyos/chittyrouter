// Unified ChittyOS Worker - Consolidating all services into one
import { handleAnalytics } from "./analytics.js";
import { handleServices } from "./services.js";
import { handleDatabase } from "./database.js";
import { handleOpenAPISchema } from "./openapi-schema.js";
import { SessionService } from "./services/session-service.js";
import { MobileBridgeService } from "./services/mobile-bridge.js";
import { ChittySchemaService } from "./services/chittyschema-service.js";
import { createLitigationRouter } from "./litigation/index.js";

// Import and re-export Durable Objects from other modules
export { SyncStateDurableObject } from "./sync/unified-sync-orchestrator.js";
export { AIStateDO } from "./ai/ai-state.js";

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

      // Session management endpoints
      if (pathname.startsWith("/session")) {
        const sessionService = new SessionService(env);
        return await sessionService.handleRequest(request);
      }

      // Mobile bridge endpoints
      if (pathname.startsWith("/mobile")) {
        const mobileBridgeService = new MobileBridgeService(env);
        return await mobileBridgeService.handleRequest(request);
      }

      // ChittySchema endpoints - integrated service
      if (pathname.startsWith("/schema")) {
        const schemaService = new ChittySchemaService(env);
        return await schemaService.handleRequest(request, pathname);
      }

      // Litigation endpoints
      if (pathname.startsWith("/litigation") || hostname.includes("legal")) {
        return await handleLitigation(request, env, ctx);
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
              "session",
              "mobile",
              "schema",
              "litigation",
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

async function handleLitigation(request, env, ctx) {
  try {
    // Create litigation router with AI and environment
    const litigationRouter = await createLitigationRouter(env.AI, env);

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Route litigation requests
    if (
      request.method === "POST" &&
      pathname === "/litigation/evidence/ingest"
    ) {
      const body = await request.json();
      const result = await litigationRouter.evidenceOrchestrator.ingestEvidence(
        body.metadata,
        body.data,
      );

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST" && pathname === "/litigation/email/route") {
      const emailData = await request.json();
      const result = await litigationRouter.intelligentRoute(emailData);

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "GET" && pathname.startsWith("/litigation/cases/")) {
      const caseNumber = pathname.split("/").pop();
      const docketData =
        await litigationRouter.evidenceOrchestrator.getCookCountyDocket(
          caseNumber,
        );

      return new Response(JSON.stringify(docketData), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Health check for litigation service
    if (pathname === "/litigation/health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          service: "ChittyRouter Litigation Extension",
          features: [
            "evidence_ingestion",
            "cook_county_docket_scraping",
            "ai_powered_routing",
            "case_analysis",
            "attorney_transitions",
            "ardc_complaints",
          ],
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: "Litigation endpoint not found",
        available_endpoints: [
          "POST /litigation/evidence/ingest",
          "POST /litigation/email/route",
          "GET /litigation/cases/{case_number}",
          "GET /litigation/health",
        ],
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Litigation service error",
        message: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
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
