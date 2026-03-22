/**
 * ChittyRouter Entry Point
 * Delegates routing to unified-worker.js.
 * Exports all Durable Object classes (legacy + Agents SDK + MCP Gateway).
 */
import UnifiedWorker from "./unified-worker.js";
import { ChittyRouterMcpGateway } from "./mcp/mcp-gateway.js";
import { McpAgent } from "agents/mcp";
import { authenticateMcpRequest } from "./mcp/mcp-auth.js";

// Legacy Durable Objects
export { SyncStateDurableObject, AIStateDO } from "./unified-worker.js";

// Agents SDK Durable Objects
export { TriageAgent } from "./agents/triage-agent.js";
export { PriorityAgent } from "./agents/priority-agent.js";
export { ResponseAgent } from "./agents/response-agent.js";
export { DocumentAgent } from "./agents/document-agent.js";
export { EntityAgent } from "./agents/entity-agent.js";
export { EvidenceAgent } from "./agents/evidence-agent.js";
export { CalendarAgent } from "./agents/calendar-agent.js";
export { FinanceAgent } from "./agents/finance-agent.js";
export { NotificationAgent } from "./agents/notification-agent.js";
export { IntelligenceAgent } from "./agents/intelligence-agent.js";
export { WebhookIngestionAgent } from "./agents/webhook-agent.js";
export { MessagingAgent } from "./agents/messaging-agent.js";
export { ScrapeAgent } from "./agents/scrape-agent.js";

// MCP Gateway Durable Object
export { ChittyRouterMcpGateway } from "./mcp/mcp-gateway.js";

// MCP Gateway handler — serves /mcp/v2 via Streamable HTTP
const mcpHandler = McpAgent.serve("/mcp/v2", { binding: "MCP_GATEWAY" });

/**
 * Map cron expressions to internal cron route paths.
 * Must stay in sync with [triggers].crons in wrangler.toml and
 * the /cron/* routes registered in unified-worker.js RouteMultiplexer.
 */
const CRON_ROUTE_MAP = {
  "0 */6 * * *": "/cron/cleanup-ai-cache",
  "0 0 * * *": "/cron/ai-metrics-report",
  "*/30 * * * *": "/cron/sync-dlq-process",
  "0 */2 * * *": "/cron/session-reconcile",
  "*/15 * * * *": "/cron/inbox-monitor",
};

export default {
  async fetch(request, env, ctx) {
    // Route MCP requests to the gateway before unified worker
    const url = new URL(request.url);
    if (url.pathname.startsWith("/mcp/v2")) {
      const authResult = await authenticateMcpRequest(request, env);
      if (authResult) return authResult;
      return mcpHandler.fetch(request, env, ctx);
    }

    return await UnifiedWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    const cronPath = CRON_ROUTE_MAP[event.cron];
    if (!cronPath) {
      console.warn(`No handler mapped for cron expression: ${event.cron}`);
      return;
    }

    // Create a synthetic internal request and delegate to the unified worker
    const request = new Request(`https://router.chitty.cc${cronPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    ctx.waitUntil(
      UnifiedWorker.fetch(request, env, ctx).then((response) => {
        if (!response.ok) {
          console.error(
            `Cron ${event.cron} (${cronPath}) failed with status ${response.status}`,
          );
        }
      }),
    );
  },
};
