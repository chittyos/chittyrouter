/**
 * ChittyRouter MCP Agent — Cloudflare Native Implementation
 *
 * Uses Cloudflare's McpAgent class (Durable Object) instead of Node.js WebSocket.
 * Each tool is a thin wrapper around ChittyRouterAI methods.
 * No separate layers — the MCP agent calls directly into the router pipeline.
 */

import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { ChittyRouterAI } from "../ai/intelligent-router.js";

export class ChittyRouterMCPAgent extends McpAgent {
  server = {
    name: "ChittyRouter MCP",
    version: "3.0.0",
  };

  async init() {
    // ingest — universal intake, the core pipeline
    this.server.tool(
      "ingest",
      {
        inputType: z.enum(["email", "document", "voice", "image", "form", "webhook", "sms", "chat", "api"]).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        subject: z.string().optional(),
        content: z.string().optional(),
        documentUrl: z.string().optional(),
        audioUrl: z.string().optional(),
        imageUrl: z.string().optional(),
        webhookEvent: z.string().optional(),
        formFields: z.record(z.string()).optional(),
      },
      async (params) => {
        const router = this.getRouter();
        const result = await router.ingest(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // route_email — classic email routing
    this.server.tool(
      "route_email",
      {
        from: z.string(),
        to: z.string(),
        subject: z.string(),
        content: z.string(),
        attachments: z.array(z.object({ name: z.string(), size: z.number(), type: z.string() })).optional(),
      },
      async (params) => {
        const router = this.getRouter();
        const result = await router.intelligentRoute(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    // classify — just the AI analysis step
    this.server.tool(
      "classify",
      {
        content: z.string(),
        inputType: z.string().optional(),
      },
      async (params) => {
        const router = this.getRouter();
        const inputType = params.inputType || "unknown";
        const normalized = router.normalize(inputType, params);
        const analysis = await router.analyzeInput(inputType, normalized);
        return { content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }] };
      }
    );

    // trust_score — just the trust scoring step
    this.server.tool(
      "trust_score",
      {
        content: z.string(),
        source: z.string().optional(),
        inputType: z.string().optional(),
      },
      async (params) => {
        const router = this.getRouter();
        const inputType = params.inputType || "unknown";
        const normalized = router.normalize(inputType, params);
        const analysis = await router.analyzeInput(inputType, normalized);
        const trust = await router.scoreTrust(inputType, normalized, analysis);
        return { content: [{ type: "text", text: JSON.stringify(trust, null, 2) }] };
      }
    );

    // health — pipeline health check
    this.server.tool(
      "health",
      {},
      async () => {
        const router = this.getRouter();
        const aiHealth = await router.healthCheck();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "healthy",
              service: "ChittyRouter MCP Agent",
              ai: aiHealth,
              accepts: ["email", "document", "voice", "image", "form", "webhook", "sms", "chat", "api"],
              pipeline: ["detect-type", "normalize", "ai-analyze", "trust-score", "route", "log"],
              timestamp: new Date().toISOString(),
            }, null, 2),
          }],
        };
      }
    );
  }

  getRouter() {
    if (!this._router) {
      this._router = new ChittyRouterAI(this.env.AI, this.env);
    }
    return this._router;
  }
}
