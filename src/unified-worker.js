/**
 * ChittyRouter Unified Worker
 * Consolidates all sync operations into a single worker to optimize worker count
 * Handles: AI routing, Notion sync, Session management, and orchestration
 */

// Import all sync modules
import { NotionAtomicFactsSync } from "./sync/notion-atomic-facts-sync.js";
import { SessionSyncManager } from "./sync/session-sync-manager.js";
import { UnifiedSyncOrchestrator } from "./sync/unified-sync-orchestrator.js";
import { ChittyRouterAI } from "./ai/intelligent-router.js";
import { EmailProcessor } from "./ai/email-processor.js";
import { AgentOrchestrator } from "./ai/agent-orchestrator.js";
import { SessionService } from "./services/session-service.js";
import { MobileBridgeService } from "./services/mobile-bridge.js";

/**
 * Route multiplexer - determines which service to invoke based on path
 */
class RouteMultiplexer {
  constructor(env) {
    this.env = env;

    // Initialize all services
    this.services = {
      ai: {
        router: new ChittyRouterAI(env.AI, env),
        emailProcessor: new EmailProcessor(env),
        agentOrchestrator: new AgentOrchestrator(env),
      },
      sync: {
        notion: new NotionAtomicFactsSync(env),
        session: new SessionSyncManager(env),
        orchestrator: new UnifiedSyncOrchestrator(env),
      },
      sessions: {
        sessionService: new SessionService(env),
        mobileBridge: new MobileBridgeService(env),
      },
    };

    // Route patterns mapped to handlers
    this.routes = new Map([
      // AI Routes
      ["/ai/route", this.handleAIRoute.bind(this)],
      ["/ai/process-email", this.handleEmailProcessing.bind(this)],
      ["/ai/orchestrate", this.handleAgentOrchestration.bind(this)],

      // MCP Routes (Model Context Protocol)
      ["/mcp", this.handleMCP.bind(this)],
      ["/mcp/info", this.handleMCP.bind(this)],
      ["/mcp/tools", this.handleMCPTools.bind(this)],
      ["/mcp/openapi.json", this.handleMCPOpenAPI.bind(this)],
      ["/mcp/health", this.handleMCPHealth.bind(this)],

      // Sync Routes
      ["/sync/notion/atomic-facts", this.handleNotionSync.bind(this)],
      ["/sync/notion/dlq", this.handleNotionDLQ.bind(this)],
      ["/sync/notion/status", this.handleNotionStatus.bind(this)],

      // Session Routes
      ["/session/init", this.handleSessionInit.bind(this)],
      ["/session/state", this.handleSessionState.bind(this)],
      ["/session/atomic-facts", this.handleSessionAtomicFacts.bind(this)],
      ["/session/status", this.handleSessionStatus.bind(this)],

      // Session Management API
      ["/session", this.handleSessionManagement.bind(this)],
      ["/mobile", this.handleMobileBridge.bind(this)],

      // Orchestration Routes
      ["/sync/unified", this.handleUnifiedSync.bind(this)],
      ["/sync/status", this.handleSyncStatus.bind(this)],
      ["/sync/retry", this.handleSyncRetry.bind(this)],

      // Health & Metrics
      ["/health", this.handleHealth.bind(this)],
      ["/metrics", this.handleMetrics.bind(this)],

      // Cron Jobs
      ["/cron/sync-dlq-process", this.handleCronDLQ.bind(this)],
      ["/cron/session-reconcile", this.handleCronReconcile.bind(this)],
      ["/cron/cleanup-ai-cache", this.handleCronCleanup.bind(this)],
      ["/cron/ai-metrics-report", this.handleCronMetrics.bind(this)],
    ]);
  }

  /**
   * Main request router
   */
  async route(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Find matching route
    for (const [pattern, handler] of this.routes) {
      if (this.matchPath(path, pattern)) {
        return handler(request, url);
      }
    }

    // Default 404
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  /**
   * Path matching with wildcard support
   */
  matchPath(path, pattern) {
    // Exact match
    if (path === pattern) return true;

    // Wildcard match (e.g., /ai/* matches /ai/anything)
    if (pattern.endsWith("/*")) {
      const base = pattern.slice(0, -2);
      return path.startsWith(base + "/") || path === base;
    }

    return false;
  }

  // ============ AI Handlers ============

  async handleAIRoute(request) {
    const body = await request.json();
    const result = await this.services.ai.router.route(body);
    return this.jsonResponse(result);
  }

  async handleEmailProcessing(request) {
    const body = await request.json();
    const result = await this.services.ai.emailProcessor.processEmail(body);
    return this.jsonResponse(result);
  }

  async handleAgentOrchestration(request) {
    const body = await request.json();
    const result = await this.services.ai.agentOrchestrator.orchestrate(body);
    return this.jsonResponse(result);
  }

  // ============ Sync Handlers ============

  async handleNotionSync(request) {
    const body = await request.json();
    const result = await this.services.sync.notion.sync(
      body.facts || [],
      body.options || {},
    );
    return this.jsonResponse(result);
  }

  async handleNotionDLQ(request) {
    const result = await this.services.sync.notion.processDLQ();
    return this.jsonResponse(result);
  }

  async handleNotionStatus(request) {
    const status = this.services.sync.notion.getStatus();
    return this.jsonResponse(status);
  }

  // ============ Session Handlers ============

  async handleSessionInit(request) {
    const body = await request.json();
    const result = await this.services.sync.session.initSession(body);
    return this.jsonResponse(result);
  }

  async handleSessionState(request) {
    const body = await request.json();
    const result = await this.services.sync.session.saveState(
      body.service,
      body.data,
      body.metadata,
    );
    return this.jsonResponse(result);
  }

  async handleSessionAtomicFacts(request) {
    const body = await request.json();
    const result = await this.services.sync.session.syncAtomicFacts(body.facts);
    return this.jsonResponse(result);
  }

  async handleSessionStatus(request) {
    const status = this.services.sync.session.getStatus();
    return this.jsonResponse(status);
  }

  // ============ Orchestration Handlers ============

  async handleUnifiedSync(request) {
    const body = await request.json();
    const result = await this.services.sync.orchestrator.syncPipeline(
      body.data,
      body.options,
    );
    return this.jsonResponse(result);
  }

  async handleSyncStatus(request) {
    const status = this.services.sync.orchestrator.getStatus();
    return this.jsonResponse(status);
  }

  async handleSyncRetry(request) {
    const results = await this.services.sync.orchestrator.retryFailedSyncs();
    return this.jsonResponse(results);
  }

  // ============ MCP Handlers (Model Context Protocol) ============

  async handleMCP(request, url) {
    // MCP info endpoint - returns server metadata
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json",
    };

    return new Response(
      JSON.stringify({
        name: "ChittyRouter MCP",
        version: "3.0.0",
        protocol: "mcp",
        description: "ChittyRouter AI Gateway with Model Context Protocol",
        tools: 23,
        categories: 17,
        endpoints: {
          mcp: "https://mcp.chitty.cc",
          openapi: "https://ai.chitty.cc/openapi.json",
          info: "https://mcp.chitty.cc/info",
          tools: "https://mcp.chitty.cc/tools",
        },
        integration: {
          chatgpt: {
            schema: "https://ai.chitty.cc/openapi.json",
            protocol: "REST API with OpenAPI 3.0",
          },
          claude: {
            mcp: "https://mcp.chitty.cc",
            protocol: "Model Context Protocol (MCP)",
          },
        },
        status: "production-ready",
        deployment: "chittyrouter-unified-worker",
      }),
      { headers },
    );
  }

  async handleMCPTools(request, url) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json",
    };

    const tools = {
      categories: [
        "ChittyID",
        "ChittyLedger",
        "ChittyBooks",
        "ChittyFinance",
        "ChittyTrust",
        "ChittyCertify",
        "ChittyVerify",
        "ChittyScore",
        "ChittyChain",
        "ChittyEvidence",
        "ChittyMint",
        "ChittyChat",
        "ChittySchema",
        "ChittyCanon",
        "ChittyRegistry",
        "ChittyGateway",
        "Integration",
      ],
      tools: [
        {
          name: "chittycheck",
          description: "Run ChittyID compliance check",
          category: "Integration",
        },
        {
          name: "chitfix",
          description: "Fix ChittyID violations",
          category: "Integration",
        },
        {
          name: "mint_chittyid",
          description: "Mint new ChittyID",
          category: "ChittyID",
        },
        {
          name: "validate_chittyid",
          description: "Validate ChittyID format",
          category: "ChittyID",
        },
        {
          name: "create_ledger_entry",
          description: "Create ledger entry",
          category: "ChittyLedger",
        },
        {
          name: "sync_project",
          description: "Sync project data",
          category: "Integration",
        },
        {
          name: "sync_session",
          description: "Sync session state",
          category: "Integration",
        },
        {
          name: "ai_route",
          description: "AI-powered routing",
          category: "Integration",
        },
        {
          name: "process_email",
          description: "Process email with AI",
          category: "Integration",
        },
      ],
      total: 23,
      deployment: "chittyrouter-unified-worker",
    };
    return new Response(JSON.stringify(tools), { headers });
  }

  async handleMCPOpenAPI(request, url) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json",
    };

    const openapi = {
      openapi: "3.0.0",
      info: {
        title: "ChittyRouter MCP API",
        version: "3.0.0",
        description:
          "ChittyRouter AI Gateway Model Context Protocol Server API",
      },
      servers: [
        { url: "https://mcp.chitty.cc", description: "Production MCP Server" },
        { url: "https://ai.chitty.cc", description: "AI Gateway" },
      ],
      paths: {
        "/mcp/info": {
          get: {
            summary: "Get MCP server information",
            responses: {
              200: {
                description: "Server information",
                content: {
                  "application/json": {
                    schema: { type: "object" },
                  },
                },
              },
            },
          },
        },
        "/mcp/tools": {
          get: {
            summary: "Get available tools",
            responses: {
              200: {
                description: "Available tools",
                content: {
                  "application/json": {
                    schema: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    };
    return new Response(JSON.stringify(openapi, null, 2), { headers });
  }

  async handleMCPHealth(request, url) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json",
    };

    return new Response(
      JSON.stringify({
        status: "healthy",
        service: "ChittyRouter MCP",
        deployment: "chittyrouter-unified-worker",
        ai: await this.checkAIHealth(),
        timestamp: new Date().toISOString(),
      }),
      { headers },
    );
  }

  // ============ Health & Metrics ============

  async handleHealth(request) {
    const health = {
      status: "healthy",
      services: {
        ai: await this.checkAIHealth(),
        sync: await this.checkSyncHealth(),
        storage: await this.checkStorageHealth(),
      },
      timestamp: new Date().toISOString(),
    };

    return this.jsonResponse(health);
  }

  async handleMetrics(request) {
    const metrics = {
      ai: this.services.ai.router.getMetrics
        ? await this.services.ai.router.getMetrics()
        : {},
      notion: this.services.sync.notion.getStatus(),
      session: this.services.sync.session.getStatus(),
      orchestrator: this.services.sync.orchestrator.getStatus(),
      timestamp: new Date().toISOString(),
    };

    return this.jsonResponse(metrics);
  }

  // ============ Cron Job Handlers ============

  async handleCronDLQ(request) {
    const notionDLQ = await this.services.sync.notion.processDLQ();
    const retryFailed =
      await this.services.sync.orchestrator.retryFailedSyncs();

    return this.jsonResponse({
      notion: notionDLQ,
      retry: retryFailed,
      timestamp: new Date().toISOString(),
    });
  }

  async handleCronReconcile(request) {
    const result = await this.services.sync.session.syncCrossServiceState();
    return this.jsonResponse(result);
  }

  async handleCronCleanup(request) {
    let cleaned = 0;

    // Clean AI cache if available
    if (this.env.AI_CACHE) {
      const keys = await this.env.AI_CACHE.list();
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

      for (const key of keys.keys) {
        const metadata = key.metadata || {};
        if (metadata.timestamp && metadata.timestamp < cutoff) {
          await this.env.AI_CACHE.delete(key.name);
          cleaned++;
        }
      }
    }

    return this.jsonResponse({
      cleaned,
      timestamp: new Date().toISOString(),
    });
  }

  async handleCronMetrics(request) {
    const report = await this.generateMetricsReport();

    // Send to analytics if configured
    if (this.env.AI_ANALYTICS) {
      await this.env.AI_ANALYTICS.writeDataPoints(report.dataPoints);
    }

    return this.jsonResponse(report);
  }

  // ============ Health Check Helpers ============

  async checkAIHealth() {
    try {
      const response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 10,
      });
      return { status: "healthy", model: "@cf/meta/llama-3.1-8b-instruct" };
    } catch (error) {
      return { status: "unhealthy", error: error.message };
    }
  }

  async checkSyncHealth() {
    return {
      notion: this.services.sync.notion ? "configured" : "not configured",
      session: this.services.sync.session ? "configured" : "not configured",
      orchestrator: this.services.sync.orchestrator
        ? "configured"
        : "not configured",
    };
  }

  async checkStorageHealth() {
    const storage = {};

    if (this.env.AI_CACHE) {
      storage.kv = "available";
    }

    if (this.env.DOCUMENT_STORAGE) {
      storage.r2 = "available";
    }

    if (this.env.AI_STATE_DO) {
      storage.durable_objects = "available";
    }

    return storage;
  }

  // ============ Metrics Report Generator ============

  async generateMetricsReport() {
    const report = {
      timestamp: new Date().toISOString(),
      period: "24h",
      dataPoints: [],
      summary: {},
    };

    // Collect metrics from all services
    if (this.services.sync.notion) {
      const notionMetrics = this.services.sync.notion.getStatus().metrics;
      report.summary.notion = notionMetrics;

      // Convert to data points for analytics
      for (const [key, value] of Object.entries(notionMetrics.counters || {})) {
        report.dataPoints.push({
          timestamp: Date.now(),
          metric: `notion.${key}`,
          value,
          labels: { service: "notion" },
        });
      }
    }

    return report;
  }

  // ============ Response Helpers ============

  jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  }

  async errorResponse(error, status = 500) {
    return this.jsonResponse(
      {
        error: error.message || "Internal Server Error",
        code: error.code || "UNKNOWN_ERROR",
        timestamp: new Date().toISOString(),
      },
      status,
    );
  }
}

/**
 * Durable Object exports (consolidated)
 */
export { SyncStateDurableObject } from "./sync/unified-sync-orchestrator.js";
export { AIStateDO } from "./ai/ai-state.js";
// ChittyChainDO export removed - doesn't exist in current setup

/**
 * Main Worker export
 */
export default {
  async fetch(request, env, ctx) {
    const multiplexer = new RouteMultiplexer(env);

    try {
      // Add request ID for tracing
      const requestId = crypto.randomUUID(); // Use UUID for request ID
      ctx.waitUntil(this.logRequest(env, requestId, request));

      // Route the request
      const response = await multiplexer.route(request);

      // Add standard headers
      response.headers.set("X-Request-ID", requestId);
      response.headers.set("X-Powered-By", "ChittyRouter-Unified");

      return response;
    } catch (error) {
      console.error("Worker error:", error);
      return multiplexer.errorResponse(error);
    }
  },

  // ============ Session Management Handlers ============

  async handleSessionManagement(request) {
    return await this.services.sessions.sessionService.handleRequest(request);
  },

  async handleMobileBridge(request) {
    return await this.services.sessions.mobileBridge.handleRequest(request);
  },

  async logRequest(env, requestId, request) {
    // Log to analytics if available
    if (env.AI_ANALYTICS) {
      await env.AI_ANALYTICS.writeDataPoints([
        {
          timestamp: Date.now(),
          metric: "request",
          value: 1,
          labels: {
            path: new URL(request.url).pathname,
            method: request.method,
            requestId,
          },
        },
      ]);
    }
  },
};
