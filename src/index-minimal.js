/**
 * ChittyRouter Entry Point
 * Delegates routing to unified-worker.js.
 * Exports all Durable Object classes (legacy + Agents SDK).
 */
import UnifiedWorker from "./unified-worker.js";

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

export default {
  async fetch(request, env, ctx) {
    return await UnifiedWorker.fetch(request, env, ctx);
  }
};
