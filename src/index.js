// ChittyRouter - Unified Intelligent Routing Gateway for ALL ChittyOS Services
import { handleAnalytics } from "./analytics.js";
import { handleServices } from "./services.js";
import { handleDatabase } from "./database.js";
import { handleOpenAPISchema } from "./openapi-schema.js";
import { SessionService } from "./services/session-service.js";
import { MobileBridgeService } from "./services/mobile-bridge.js";
import { ChittySchemaService } from "./services/chittyschema-service.js";
import { createLitigationRouter } from "./litigation/index.js";
import UnifiedServiceRouter, {
  handleServiceHealth,
} from "./routing/unified-service-router.js";

// Import and re-export Durable Objects from other modules
export { SyncStateDurableObject } from "./sync/unified-sync-orchestrator.js";
export { AIStateDO } from "./ai/ai-state.js";
export { PersistentAgent } from "./agents/persistent-agent.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;

    // Initialize unified router
    const router = new UnifiedServiceRouter(env);

    // Route based on subdomain or path
    try {
      // Router health endpoint (priority check)
      if (pathname === "/router/health") {
        return await handleServiceHealth(request, env);
      }

      // Platform routes (main chittyos-platform-live functionality) - PRIORITY
      if (hostname.includes("platform") || pathname.startsWith("/platform")) {
        return await handlePlatform(request, env, ctx);
      }

      // Check if this is a known ChittyOS service route
      const isKnownService =
        router.findServiceByHostname(hostname) ||
        router.findServiceByPath(pathname);

      // If it's a known service, use unified routing
      if (isKnownService) {
        return await router.route(request);
      }

      // Legacy routes for backward compatibility
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
  // Main platform logic coordinating AI, KV, and Durable Objects
  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    // Platform health check
    if (pathname === "/platform/health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          service: "chittyos-platform",
          version: "2.1.0",
          timestamp: new Date().toISOString(),
          bindings: {
            ai: !!env.AI,
            kvState: !!env.KV_PLATFORM_STATE,
            kvData: !!env.KV_PLATFORM_DATA,
            aiGatewayState: !!env.AI_GATEWAY_STATE,
            platformState: !!env.PLATFORM_STATE,
            syncState: !!env.SYNC_STATE,
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Platform state management via Durable Object
    if (pathname.startsWith("/platform/state")) {
      if (!env.PLATFORM_STATE) {
        return new Response(
          JSON.stringify({ error: "Platform state not available" }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const id = env.PLATFORM_STATE.idFromName("platform-global");
      const stub = env.PLATFORM_STATE.get(id);
      return await stub.fetch(request);
    }

    // AI Gateway coordination via Durable Object
    if (pathname.startsWith("/platform/ai")) {
      if (!env.AI_GATEWAY_STATE) {
        return new Response(
          JSON.stringify({ error: "AI Gateway not available" }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const id = env.AI_GATEWAY_STATE.idFromName("ai-gateway-global");
      const stub = env.AI_GATEWAY_STATE.get(id);
      return await stub.fetch(request);
    }

    // Sync coordination via Durable Object
    if (pathname.startsWith("/platform/sync")) {
      if (!env.SYNC_STATE) {
        return new Response(
          JSON.stringify({ error: "Sync state not available" }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const id = env.SYNC_STATE.idFromName("sync-global");
      const stub = env.SYNC_STATE.get(id);
      return await stub.fetch(request);
    }

    // Persistent Agents via Durable Object
    if (pathname.startsWith("/platform/agents")) {
      if (!env.PERSISTENT_AGENTS) {
        return new Response(
          JSON.stringify({ error: "Persistent agents not available" }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Extract agent name from path: /platform/agents/{agentName}/{action}
      const pathParts = pathname.split("/").filter((p) => p);
      const agentName = pathParts[2] || "default";

      const id = env.PERSISTENT_AGENTS.idFromName(agentName);
      const stub = env.PERSISTENT_AGENTS.get(id);
      return await stub.fetch(request);
    }

    // KV-based caching and data retrieval
    if (pathname.startsWith("/platform/cache") && env.KV_PLATFORM_DATA) {
      const key = url.searchParams.get("key");
      if (!key) {
        return new Response(
          JSON.stringify({ error: "Missing key parameter" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (request.method === "GET") {
        const value = await env.KV_PLATFORM_DATA.get(key);
        return new Response(JSON.stringify({ key, value }), {
          headers: { "Content-Type": "application/json" },
        });
      } else if (request.method === "PUT") {
        const body = await request.json();
        await env.KV_PLATFORM_DATA.put(key, JSON.stringify(body.value));
        return new Response(JSON.stringify({ success: true, key }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Default platform info
    return new Response(
      JSON.stringify({
        service: "ChittyOS Platform",
        version: "2.1.0",
        endpoints: [
          "/platform/health",
          "/platform/state/*",
          "/platform/ai/*",
          "/platform/sync/*",
          "/platform/cache?key=*",
        ],
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Platform service error",
        message: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// Durable Object classes for stateful coordination
export class AIGatewayState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      // Initialize AI gateway state
      this.requestQueue = (await this.state.storage.get("requestQueue")) || [];
      this.modelCache = (await this.state.storage.get("modelCache")) || {};
      this.stats = (await this.state.storage.get("stats")) || {
        totalRequests: 0,
        totalTokens: 0,
        modelUsage: {},
      };
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // AI Gateway health
      if (pathname.endsWith("/health")) {
        return new Response(
          JSON.stringify({
            status: "healthy",
            durable: "AIGatewayState",
            queueSize: this.requestQueue.length,
            cacheSize: Object.keys(this.modelCache).length,
            stats: this.stats,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // AI request routing
      if (request.method === "POST" && pathname.endsWith("/route")) {
        const body = await request.json();
        const { model, prompt, options } = body;

        // Track request
        this.stats.totalRequests++;
        this.stats.modelUsage[model] = (this.stats.modelUsage[model] || 0) + 1;
        await this.state.storage.put("stats", this.stats);

        // Route to AI binding if available
        if (this.env.AI) {
          const response = await this.env.AI.run(model, {
            prompt,
            ...options,
          });

          return new Response(
            JSON.stringify({
              success: true,
              response,
              model,
              cached: false,
            }),
            {
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            error: "AI binding not available",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get AI statistics
      if (pathname.endsWith("/stats")) {
        return new Response(JSON.stringify(this.stats), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          error: "Unknown AI Gateway endpoint",
          endpoints: ["/health", "/route", "/stats"],
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "AI Gateway error",
          message: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }
}

export class ChittyOSPlatformState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      // Initialize platform state
      this.services = (await this.state.storage.get("services")) || {};
      this.metrics = (await this.state.storage.get("metrics")) || {
        uptime: Date.now(),
        requests: 0,
        errors: 0,
      };
      this.config = (await this.state.storage.get("config")) || {
        version: "2.1.0",
        environment: "production",
      };
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // Platform state health
      if (pathname.endsWith("/health")) {
        return new Response(
          JSON.stringify({
            status: "healthy",
            durable: "ChittyOSPlatformState",
            uptime: Date.now() - this.metrics.uptime,
            services: Object.keys(this.services).length,
            metrics: this.metrics,
            config: this.config,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Register service
      if (request.method === "POST" && pathname.endsWith("/register")) {
        const body = await request.json();
        const { serviceId, metadata } = body;

        this.services[serviceId] = {
          ...metadata,
          registeredAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        };

        await this.state.storage.put("services", this.services);

        return new Response(
          JSON.stringify({
            success: true,
            serviceId,
            registered: true,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Get all services
      if (pathname.endsWith("/services")) {
        return new Response(
          JSON.stringify({
            services: this.services,
            count: Object.keys(this.services).length,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Update metrics
      if (request.method === "POST" && pathname.endsWith("/metrics")) {
        const body = await request.json();
        this.metrics = { ...this.metrics, ...body };
        await this.state.storage.put("metrics", this.metrics);

        return new Response(
          JSON.stringify({
            success: true,
            metrics: this.metrics,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: "Unknown Platform State endpoint",
          endpoints: ["/health", "/register", "/services", "/metrics"],
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Platform State error",
          message: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }
}

export class SyncState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      // Initialize sync state
      this.syncQueue = (await this.state.storage.get("syncQueue")) || [];
      this.lastSync = (await this.state.storage.get("lastSync")) || null;
      this.syncStatus = (await this.state.storage.get("syncStatus")) || {
        inProgress: false,
        lastSuccess: null,
        lastError: null,
        totalSyncs: 0,
      };
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // Sync state health
      if (pathname.endsWith("/health")) {
        return new Response(
          JSON.stringify({
            status: "healthy",
            durable: "SyncState",
            queueSize: this.syncQueue.length,
            lastSync: this.lastSync,
            syncStatus: this.syncStatus,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Queue sync operation
      if (request.method === "POST" && pathname.endsWith("/queue")) {
        const body = await request.json();
        const { operation, data } = body;

        // Import ChittyID utility for proper ID generation
        const { ChittyIdClient } = await import(
          "./utils/chittyid-integration.js"
        );

        // Generate ChittyID from authority service for sync operation
        let syncId;
        try {
          const chittyIdResult = await ChittyIdClient.request(
            "sync-operation",
            {
              purpose: `Sync queue operation: ${operation}`,
            },
            this.env,
          );
          syncId = chittyIdResult.chittyId;
        } catch (error) {
          console.error("Failed to mint ChittyID for sync operation:", error);
          throw new Error(
            "Cannot queue sync operation without valid ChittyID from id.chitty.cc",
          );
        }

        this.syncQueue.push({
          operation,
          data,
          queuedAt: new Date().toISOString(),
          id: syncId,
        });

        await this.state.storage.put("syncQueue", this.syncQueue);

        return new Response(
          JSON.stringify({
            success: true,
            queued: true,
            queueSize: this.syncQueue.length,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Process sync queue
      if (request.method === "POST" && pathname.endsWith("/process")) {
        if (this.syncStatus.inProgress) {
          return new Response(
            JSON.stringify({
              error: "Sync already in progress",
              status: this.syncStatus,
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        this.syncStatus.inProgress = true;
        await this.state.storage.put("syncStatus", this.syncStatus);

        try {
          const processed = [];
          while (this.syncQueue.length > 0) {
            const item = this.syncQueue.shift();
            processed.push(item);
            // Actual sync logic would go here
          }

          this.syncStatus.inProgress = false;
          this.syncStatus.lastSuccess = new Date().toISOString();
          this.syncStatus.totalSyncs++;
          this.lastSync = new Date().toISOString();

          await this.state.storage.put("syncQueue", this.syncQueue);
          await this.state.storage.put("syncStatus", this.syncStatus);
          await this.state.storage.put("lastSync", this.lastSync);

          return new Response(
            JSON.stringify({
              success: true,
              processed: processed.length,
              status: this.syncStatus,
            }),
            {
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (error) {
          this.syncStatus.inProgress = false;
          this.syncStatus.lastError = error.message;
          await this.state.storage.put("syncStatus", this.syncStatus);
          throw error;
        }
      }

      // Get sync status
      if (pathname.endsWith("/status")) {
        return new Response(
          JSON.stringify({
            status: this.syncStatus,
            queueSize: this.syncQueue.length,
            lastSync: this.lastSync,
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: "Unknown Sync State endpoint",
          endpoints: ["/health", "/queue", "/process", "/status"],
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Sync State error",
          message: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }
}
