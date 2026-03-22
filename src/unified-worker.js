/**
 * ChittyRouter Unified Worker
 * Consolidates all sync operations into a single worker to optimize worker count
 * Handles: AI routing, Notion sync, Session management, and orchestration
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
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
import { InboxMonitor, handleScheduledMonitoring } from "./email/inbox-monitor.js";

// Webhook handlers
import { handleNotionWebhook } from "./webhooks/notion.js";
import { handleGithubWebhook } from "./webhooks/github.js";
import { handleStripeWebhook } from "./webhooks/stripe.js";

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
        emailProcessor: new EmailProcessor(env.AI, env),
        agentOrchestrator: new AgentOrchestrator(env.AI, env),
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
      email: {
        inboxMonitor: new InboxMonitor(env),
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
      ["/api/v1/status", this.handleApiStatus.bind(this)],
      ["/status", this.handleApiStatus.bind(this)],
      ["/metrics", this.handleMetrics.bind(this)],

      // Cron Jobs
      ["/cron/sync-dlq-process", this.handleCronDLQ.bind(this)],
      ["/cron/session-reconcile", this.handleCronReconcile.bind(this)],
      ["/cron/cleanup-ai-cache", this.handleCronCleanup.bind(this)],
      ["/cron/ai-metrics-report", this.handleCronMetrics.bind(this)],
      ["/cron/inbox-monitor", this.handleCronInboxMonitor.bind(this)],

      // Email Monitoring Routes
      ["/email/monitor", this.handleInboxMonitor.bind(this)],
      ["/email/status", this.handleEmailStatus.bind(this)],
      ["/email/urgent", this.handleUrgentEmails.bind(this)],

      // Webhook Ingestion Routes
      ["/webhook/notion", this.handleWebhookNotion.bind(this)],
      ["/webhook/github", this.handleWebhookGithub.bind(this)],
      ["/webhook/stripe", this.handleWebhookStripe.bind(this)],
      ["/webhook/status", this.handleWebhookStatus.bind(this)],

      // Agents SDK Routes — delegate to stateful Durable Object agents
      ["/agents/triage/*", this.delegateToAgent.bind(this, "TRIAGE_AGENT")],
      ["/agents/priority/*", this.delegateToAgent.bind(this, "PRIORITY_AGENT")],
      ["/agents/response/*", this.delegateToAgent.bind(this, "RESPONSE_AGENT")],
      ["/agents/document/*", this.delegateToAgent.bind(this, "DOCUMENT_AGENT")],
      ["/agents/entity/*", this.delegateToAgent.bind(this, "ENTITY_AGENT")],
      ["/agents/evidence/*", this.delegateToAgent.bind(this, "EVIDENCE_AGENT")],
      ["/agents/calendar/*", this.delegateToAgent.bind(this, "CALENDAR_AGENT")],
      ["/agents/finance/*", this.delegateToAgent.bind(this, "FINANCE_AGENT")],
      ["/agents/notification/*", this.delegateToAgent.bind(this, "NOTIFICATION_AGENT")],
      ["/agents/intelligence/*", this.delegateToAgent.bind(this, "INTELLIGENCE_AGENT")],
      ["/agents/webhook/*", this.delegateToAgent.bind(this, "WEBHOOK_AGENT")],
      ["/agents/messaging/*", this.delegateToAgent.bind(this, "MESSAGING_AGENT")],
      ["/agents/scrape/*", this.delegateToAgent.bind(this, "SCRAPE_AGENT")],
      ["/agents/status", this.handleAgentStatus.bind(this)],
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

  async handleSessionManagement(request) {
    return await this.services.sessions.sessionService.handleRequest(request);
  }

  async handleMobileBridge(request) {
    return await this.services.sessions.mobileBridge.handleRequest(request);
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
      status: "ok",
      service: "chittyrouter",
      services: {
        ai: await this.checkAIHealth(),
        sync: await this.checkSyncHealth(),
        storage: await this.checkStorageHealth(),
      },
      agents: {
        count: 12,
        bindings: [
          "TRIAGE_AGENT", "PRIORITY_AGENT", "RESPONSE_AGENT", "DOCUMENT_AGENT",
          "ENTITY_AGENT", "EVIDENCE_AGENT", "CALENDAR_AGENT", "FINANCE_AGENT",
          "NOTIFICATION_AGENT", "INTELLIGENCE_AGENT", "WEBHOOK_AGENT", "MESSAGING_AGENT", "SCRAPE_AGENT",
        ].filter((n) => !!this.env[n]).length,
        route: "/agents/status",
      },
      timestamp: new Date().toISOString(),
    };

    return this.jsonResponse(health);
  }

  async handleApiStatus() {
    const agentBindings = [
      "TRIAGE_AGENT", "PRIORITY_AGENT", "RESPONSE_AGENT", "DOCUMENT_AGENT",
      "ENTITY_AGENT", "EVIDENCE_AGENT", "CALENDAR_AGENT", "FINANCE_AGENT",
      "NOTIFICATION_AGENT", "INTELLIGENCE_AGENT", "WEBHOOK_AGENT", "MESSAGING_AGENT", "SCRAPE_AGENT",
    ];
    return this.jsonResponse({
      status: "ok",
      service: "chittyrouter",
      version: this.env.VERSION || "2.1.0-ai",
      tier: 2,
      domain: "router.chitty.cc",
      organization: "CHITTYOS",
      environment: this.env.ENVIRONMENT,
      agents: {
        total: 12,
        available: agentBindings.filter((n) => !!this.env[n]).length,
      },
      aiModels: {
        primary: this.env.AI_MODEL_PRIMARY,
        secondary: this.env.AI_MODEL_SECONDARY,
        vision: this.env.AI_MODEL_VISION,
        reasoning: this.env.AI_MODEL_REASONING,
      },
      timestamp: new Date().toISOString(),
    });
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

  // ============ Email Monitoring Handlers ============

  async handleCronInboxMonitor(request) {
    const results = await this.services.email.inboxMonitor.monitorAllInboxes();
    return this.jsonResponse({
      success: true,
      ...results,
      cron: true
    });
  }

  async handleInboxMonitor(request) {
    const results = await this.services.email.inboxMonitor.monitorAllInboxes();
    return this.jsonResponse(results);
  }

  async handleEmailStatus(request) {
    // Return cached email status
    try {
      const status = await this.env.AI_CACHE?.get('email_status', 'json');
      return this.jsonResponse(status || { message: 'No status cached' });
    } catch (error) {
      return this.jsonResponse({ error: error.message }, 500);
    }
  }

  async handleUrgentEmails(request) {
    // Return only urgent emails
    try {
      const status = await this.env.AI_CACHE?.get('email_status', 'json');
      const urgent = status?.urgent_items || [];
      return this.jsonResponse({
        count: urgent.length,
        items: urgent.filter(i => i.urgencyScore >= 50)
      });
    } catch (error) {
      return this.jsonResponse({ error: error.message }, 500);
    }
  }

  // ============ Webhook Handlers ============

  async handleWebhookNotion(request) {
    return handleNotionWebhook(request, this.env);
  }

  async handleWebhookGithub(request) {
    return handleGithubWebhook(request, this.env);
  }

  async handleWebhookStripe(request) {
    return handleStripeWebhook(request, this.env);
  }

  async handleWebhookStatus() {
    const platforms = ['notion', 'github', 'stripe'];
    const configuredCount = platforms.filter(
      (p) => !!this.env[`${p.toUpperCase()}_WEBHOOK_SECRET`]
    ).length;
    return this.jsonResponse({
      status: configuredCount === platforms.length ? "healthy" : "degraded",
      platforms: platforms.length,
      ready: configuredCount,
    });
  }

  // ============ Agents SDK Delegation ============

  /**
   * Get an initialized Agents SDK stub.
   * The Agents SDK (partyserver) requires a setup request with x-partykit-room
   * header before the agent will accept normal requests.
   */
  async getAgentStub(bindingName) {
    const binding = this.env[bindingName];
    if (!binding) return null;
    const id = binding.idFromName(bindingName);
    const stub = binding.get(id);
    // Initialize the agent's name via partyserver protocol
    const setupReq = new Request("http://dummy-example.cloudflare.com/cdn-cgi/partyserver/set-name/");
    setupReq.headers.set("x-partykit-room", bindingName);
    await stub.fetch(setupReq).then((r) => r.text());
    return stub;
  }

  /**
   * Forward request to a stateful Agents SDK Durable Object.
   * Routes like /agents/triage/classify → agent receives /classify.
   */
  async delegateToAgent(bindingName, request, url) {
    const stub = await this.getAgentStub(bindingName);
    if (!stub) {
      return this.jsonResponse({ error: `Agent binding ${bindingName} not available` }, 503);
    }

    // Strip the /agents/<name> prefix so the agent receives clean paths
    const agentPath = url.pathname.replace(/^\/agents\/[^/]+/, "") || "/";
    const agentUrl = new URL(agentPath, url.origin);
    agentUrl.search = url.search;

    const agentRequest = new Request(agentUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    });

    try {
      return await stub.fetch(agentRequest);
    } catch (err) {
      console.error(`Agent ${bindingName} fetch failed:`, err);
      return this.jsonResponse({ error: `Agent ${bindingName} unavailable` }, 502);
    }
  }

  /**
   * Aggregate status from all agents.
   */
  async handleAgentStatus() {
    const agentNames = [
      "TRIAGE_AGENT", "PRIORITY_AGENT", "RESPONSE_AGENT", "DOCUMENT_AGENT",
      "ENTITY_AGENT", "EVIDENCE_AGENT", "CALENDAR_AGENT", "FINANCE_AGENT",
      "NOTIFICATION_AGENT", "INTELLIGENCE_AGENT", "WEBHOOK_AGENT", "MESSAGING_AGENT", "SCRAPE_AGENT",
    ];

    const results = await Promise.all(
      agentNames.map(async (name) => {
        try {
          const stub = await this.getAgentStub(name);
          if (!stub) return [name, { status: "not_bound" }];
          const resp = await stub.fetch(new Request("https://agent/status"));
          if (!resp.ok) {
            const text = await resp.text();
            return [name, { status: "error", error: text.slice(0, 200) }];
          }
          return [name, await resp.json()];
        } catch (err) {
          return [name, { status: "error", error: err.message }];
        }
      })
    );

    const statuses = Object.fromEntries(results);

    return this.jsonResponse({
      agents: statuses,
      totalAgents: agentNames.length,
      timestamp: new Date().toISOString(),
    });
  }

  // ============ Health Check Helpers ============

  async checkAIHealth() {
    try {
      await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
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
    console.error("Error response:", error.message || error);
    return this.jsonResponse(
      {
        error: "Internal Server Error",
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

      // Clone with additional headers (response.headers may be immutable)
      const headers = new Headers(response.headers);
      headers.set("X-Request-ID", requestId);
      headers.set("X-Powered-By", "ChittyRouter-Unified");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error("Worker error:", error);
      return multiplexer.errorResponse(error);
    }
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
