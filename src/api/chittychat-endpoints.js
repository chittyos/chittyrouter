/**
 * ChittyChat Integration API Endpoints
 * Handles ChittyChat project synchronization and communication
 */

import { ChittyChatProjectSync } from "../sync/chittychat-project-sync.js";
import { ChittyChatProjectSynth } from "../synthesis/chittychat-project-synth.js";

export class ChittyChatEndpoints {
  constructor(env) {
    this.chittyChat = new ChittyChatProjectSync(env);
    this.synthesis = new ChittyChatProjectSynth(env);
  }

  /**
   * Handle ChittyChat webhook events
   */
  async handleWebhook(request) {
    try {
      const event = await request.json();
      const signature = request.headers.get("X-ChittyChat-Signature");

      // Verify webhook signature
      if (!this.verifyWebhookSignature(event, signature)) {
        return new Response("Invalid signature", { status: 401 });
      }

      console.log("🔔 ChittyChat webhook received:", event.type);

      switch (event.type) {
        case "project_update":
          return await this.handleProjectUpdate(event.data);

        case "participant_joined":
          return await this.handleParticipantJoined(event.data);

        case "message_created":
          return await this.handleMessageCreated(event.data);

        case "thread_created":
          return await this.handleThreadCreated(event.data);

        case "document_shared":
          return await this.handleDocumentShared(event.data);

        default:
          console.log("🤷 Unknown webhook event type:", event.type);
          return new Response("Event processed", { status: 200 });
      }
    } catch (error) {
      console.error("❌ ChittyChat webhook error:", error);
      return new Response("Webhook processing failed", { status: 500 });
    }
  }

  /**
   * Get ChittyChat project status
   */
  async getProjectStatus() {
    try {
      const status = await this.chittyChat.getProjectStatus();

      return new Response(
        JSON.stringify({
          success: true,
          status: status,
          config: this.chittyChat.getSyncConfig(),
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Manually trigger project sync
   */
  async triggerProjectSync(request) {
    try {
      const { activities } = await request.json();

      const result = await this.chittyChat.batchSync(activities);

      return new Response(
        JSON.stringify({
          success: true,
          result: result,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Subscribe to ChittyChat project events
   */
  async subscribeToEvents(request) {
    try {
      const { webhookUrl } = await request.json();

      const result = await this.chittyChat.subscribeToProjectEvents(webhookUrl);

      return new Response(
        JSON.stringify({
          success: true,
          subscription: result,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Handle project update webhook
   */
  async handleProjectUpdate(data) {
    console.log("📊 ChittyChat project updated:", data.projectId);

    // Update local project state if needed
    // This could trigger re-sync of routing rules, participant lists, etc.

    return new Response(
      JSON.stringify({
        processed: true,
        action: "project_state_updated",
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Handle participant joined webhook
   */
  async handleParticipantJoined(data) {
    console.log(
      "👤 New participant joined ChittyChat:",
      data.participant.email,
    );

    // Could trigger email routing rule updates
    // Add participant to routing rules for case-related emails

    return new Response(
      JSON.stringify({
        processed: true,
        action: "participant_routing_updated",
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Handle message created webhook
   */
  async handleMessageCreated(data) {
    console.log("💬 New message in ChittyChat:", data.messageId);

    // Could trigger AI analysis of the message
    // Update case status or routing priorities based on message content

    return new Response(
      JSON.stringify({
        processed: true,
        action: "message_analyzed",
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Handle thread created webhook
   */
  async handleThreadCreated(data) {
    console.log("🧵 New thread created in ChittyChat:", data.threadId);

    // Could create corresponding email routing rules
    // Set up automatic email forwarding to thread participants

    return new Response(
      JSON.stringify({
        processed: true,
        action: "thread_routing_created",
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Handle document shared webhook
   */
  async handleDocumentShared(data) {
    console.log("📄 Document shared in ChittyChat:", data.documentId);

    // Could trigger document analysis and routing
    // Update document routing rules based on shared documents

    return new Response(
      JSON.stringify({
        processed: true,
        action: "document_routing_updated",
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(_payload, _signature) {
    // Implement signature verification logic
    // This would use HMAC-SHA256 with a shared secret
    // TODO: Implement actual HMAC-SHA256 verification with payload and signature
    return true; // Placeholder - implement actual verification
  }

  /**
   * Get ChittyChat integration metrics
   */
  async getIntegrationMetrics() {
    try {
      const status = await this.chittyChat.getProjectStatus();

      const metrics = {
        projectStatus: status.available ? "connected" : "disconnected",
        lastSync: status.lastSync,
        syncCount: status.syncCount,
        participants: status.participants?.length || 0,
        syncConfig: this.chittyChat.getSyncConfig(),
        timestamp: new Date().toISOString(),
      };

      return new Response(
        JSON.stringify({
          success: true,
          metrics: metrics,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Handle project and topic synthesis
   */
  async handleProjectTopicSynthesis(request) {
    try {
      const { projectId, topics, timeRange, synthesisType } =
        await request.json();

      let result;
      switch (synthesisType) {
        case "project_insights":
          result = await this.synthesis.synthesizeProjectInsights(
            projectId,
            timeRange,
          );
          break;
        case "topic_trends":
          result = await this.synthesis.synthesizeTopicTrends(
            topics,
            [projectId],
            timeRange,
          );
          break;
        case "cross_project":
          result = await this.synthesis.synthesizeCrossProjectKnowledge(
            projectId,
            topics,
          );
          break;
        default:
          result = await this.synthesis.synthesizeProjectInsights(
            projectId,
            timeRange,
          );
      }

      return new Response(
        JSON.stringify({
          success: true,
          synthesis: result,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Generate project insights
   */
  async generateProjectInsights(request) {
    try {
      const { projectId, includeRecommendations, includeMetrics } =
        await request.json();

      const insights = await this.synthesis.synthesizeProjectInsights(
        projectId,
        "7d",
      );

      // Optionally include additional data
      const response = {
        insights: insights,
        timestamp: new Date().toISOString(),
      };

      if (includeRecommendations) {
        response.recommendations = await this.synthesis.generateRecommendations(
          insights.insights,
        );
      }

      if (includeMetrics) {
        const projectData = await this.synthesis.fetchProjectData(
          projectId,
          "7d",
        );
        response.metrics =
          await this.synthesis.calculateProjectMetrics(projectData);
      }

      return new Response(
        JSON.stringify({
          success: true,
          ...response,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }
}

/**
 * Route ChittyChat API requests
 */
export async function handleChittyChatRequest(request, env) {
  const url = new URL(request.url);
  const endpoints = new ChittyChatEndpoints(env);

  switch (url.pathname) {
    case "/chittychat/webhook":
      if (request.method === "POST") {
        return await endpoints.handleWebhook(request);
      }
      break;

    case "/chittychat/status":
      if (request.method === "GET") {
        return await endpoints.getProjectStatus();
      }
      break;

    case "/chittychat/sync":
      if (request.method === "POST") {
        return await endpoints.triggerProjectSync(request);
      }
      break;

    case "/chittychat/subscribe":
      if (request.method === "POST") {
        return await endpoints.subscribeToEvents(request);
      }
      break;

    case "/chittychat/metrics":
      if (request.method === "GET") {
        return await endpoints.getIntegrationMetrics();
      }
      break;

    case "/chittychat/synthesize":
      if (request.method === "POST") {
        return await endpoints.handleProjectTopicSynthesis(request);
      }
      break;

    case "/chittychat/insights":
      if (request.method === "POST") {
        return await endpoints.generateProjectInsights(request);
      }
      break;
  }

  return new Response("ChittyChat endpoint not found", { status: 404 });
}
