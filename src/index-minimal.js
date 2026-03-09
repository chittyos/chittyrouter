/**
 * ChittyRouter Entry Point
 * Delegates routing to unified-worker.js.
 * Exports all Durable Object classes (legacy + Agents SDK + MCP Gateway).
 */
import UnifiedWorker from "./unified-worker.js";
import { ChittyRouterMcpGateway } from "./mcp/mcp-gateway.js";
import { McpAgent } from "agents/mcp";

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

// MCP Gateway Durable Object
export { ChittyRouterMcpGateway } from "./mcp/mcp-gateway.js";

// MCP Gateway handler — serves /mcp/v2 via Streamable HTTP
const mcpHandler = McpAgent.serve("/mcp/v2", { binding: "MCP_GATEWAY" });

export default {
  async fetch(request, env, ctx) {
    // Route MCP requests to the gateway before unified worker
    const url = new URL(request.url);
    if (url.pathname.startsWith("/mcp/v2")) {
      return mcpHandler.fetch(request, env, ctx);
    }

    return await UnifiedWorker.fetch(request, env, ctx);
  },
};
