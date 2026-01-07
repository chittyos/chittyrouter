/**
 * ChittyRouter AI Gateway - Cloudflare Workers Entry Point
 * Unified Worker with MCP Integration
 */

// Import unified worker which handles all routes including MCP
import UnifiedWorker from "./unified-worker.js";
export { SyncStateDurableObject, AIStateDO } from "./unified-worker.js";

// Legacy imports for compatibility
import { ChittyRouterAI } from "./ai/intelligent-router.js";
import { EmailProcessor } from "./ai/email-processor.js";
import { AgentOrchestrator } from "./ai/agent-orchestrator.js";
import { ServiceDiscovery } from "./utils/service-discovery.js";
import {
  initializeRegistry,
  updateServiceStatus,
  registryHealthCheck,
} from "./utils/registry.js";
import { getServiceHealth } from "./utils/storage.js";
import {
  initializeChittyOSSecurity,
  ChittySecurityManager,
} from "./utils/chittyos-security-integration.js";
import {
  getChittyOSIntegration,
  createChittyOSMiddleware,
} from "./integration/chittyos-integration.js";
import { handleChittyChatRequest } from "./api/chittychat-endpoints.js";
import { PDXApiFactory } from "./pdx/pdx-api.js";

// Initialize security and registry on first request
let registryInitialized = false;
let securityManager = null;
let chittyOSIntegration = null;
let pdxApi = null;
let serviceDiscovery = null;

// Main ChittyRouter AI Gateway with Unified Worker
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Check if this is an MCP route first
    if (url.pathname.startsWith("/mcp") || url.pathname === "/") {
      // Delegate to unified worker for MCP and all new routes
      return UnifiedWorker.fetch(request, env, ctx);
    }

    // Check if this is a session management route
    if (
      url.pathname.startsWith("/session") ||
      url.pathname.startsWith("/mobile")
    ) {
      // Delegate to unified worker for session management
      return UnifiedWorker.fetch(request, env, ctx);
    }

    // Legacy routing for backward compatibility
    const ai = env.AI; // Cloudflare AI binding
    const router = new ChittyRouterAI(ai, env);

    // Initialize service discovery and ChittyOS integration on first request
    if (!serviceDiscovery) {
      try {
        // Initialize service discovery first
        serviceDiscovery = new ServiceDiscovery(env);
        await serviceDiscovery.initialize();
        console.log(
          "🔍 Service Discovery initialized - using registry services",
        );

        // Initialize complete ChittyOS integration using discovered services
        chittyOSIntegration = await getChittyOSIntegration(env);

        // Legacy security manager for backward compatibility
        if (!securityManager) {
          securityManager = await initializeChittyOSSecurity(
            env,
            "chittyrouter",
          );
        }

        // Initialize registry with authenticated ChittyID
        if (!registryInitialized) {
          const initResult = await initializeRegistry(env);
          registryInitialized = initResult.initialized;
        }

        console.log("🚀 Complete ChittyOS Integration initialized:", {
          integration: chittyOSIntegration.getStatus(),
          services: Array.from(chittyOSIntegration.services.keys()),
          discoveredServices: serviceDiscovery.getDiscoveryStatus(),
        });

        // Initialize PDX API for AI DNA portability
        if (!pdxApi) {
          pdxApi = await PDXApiFactory.createAPI(env);
          console.log("🧬 PDX API initialized - AI DNA portability enabled");
        }
      } catch (error) {
        console.error("❌ ChittyOS Integration failed:", error);
        // Continue with legacy initialization
        if (!securityManager) {
          securityManager = await initializeChittyOSSecurity(
            env,
            "chittyrouter",
          );
        }
      }
    }

    // Apply security middleware if available
    const securityMiddleware = securityManager?.createAuthMiddleware();

    try {
      // Apply security for protected endpoints
      if (securityMiddleware && securityManager.requiresAuth(request)) {
        const authCheck = await securityMiddleware(request, async (req) => {
          return null; // Placeholder
        });

        if (authCheck && authCheck.status === 401) {
          return authCheck;
        }
      }

      // AI-powered email processing endpoint
      if (url.pathname === "/process" && request.method === "POST") {
        const emailData = await request.json();
        const result = await router.intelligentRoute(emailData);

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // AI agent orchestration endpoint
      if (url.pathname === "/agents" && request.method === "POST") {
        const taskData = await request.json();
        const orchestrator = new AgentOrchestrator(ai, env);
        const result = await orchestrator.executeTask(taskData);

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // ChittyChat integration endpoints
      if (url.pathname.startsWith("/chittychat/")) {
        return await handleChittyChatRequest(request, env);
      }

      // PDX (Portable DNA eXchange) API endpoints
      if (url.pathname.startsWith("/pdx/")) {
        if (!pdxApi) {
          return new Response(
            JSON.stringify({ error: "PDX API not available" }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return await pdxApi.handlePDXRequest(request);
      }

      // Service routing endpoint using service discovery
      if (
        url.pathname === "/integration/service" &&
        request.method === "POST"
      ) {
        if (!serviceDiscovery) {
          return new Response(
            JSON.stringify({ error: "Service Discovery not available" }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const { capability, operation, data, preferredService } =
          await request.json();

        try {
          const result = await serviceDiscovery.routeToService(
            capability,
            operation,
            data,
          );
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // Service discovery status endpoint
      if (url.pathname === "/discovery/status") {
        const status = serviceDiscovery
          ? serviceDiscovery.getDiscoveryStatus()
          : { error: "Service Discovery not initialized" };

        return new Response(JSON.stringify(status), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Health check with AI status, ChittyOS integration, and service discovery
      if (url.pathname === "/health") {
        const aiHealth = await router.healthCheck();
        const integrationHealth = chittyOSIntegration
          ? await chittyOSIntegration.performHealthCheck()
          : null;
        const discoveryHealth = serviceDiscovery
          ? serviceDiscovery.getDiscoveryStatus()
          : null;

        return new Response(
          JSON.stringify({
            service: "ChittyRouter AI Gateway",
            version: "2.1.0-ai",
            status: integrationHealth?.overall_health || "healthy",
            timestamp: new Date().toISOString(),
            ai: aiHealth,
            integration: integrationHealth,
            serviceDiscovery: discoveryHealth,
            capabilities: [
              "intelligent-email-routing",
              "ai-powered-triage",
              "automated-responses",
              "document-analysis",
              "priority-classification",
              "agent-orchestration",
              "service-discovery",
              "pdx-dna-portability",
              "registry-integration",
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // ChittyOS Integration status endpoint
      if (url.pathname === "/integration/status") {
        const status = chittyOSIntegration
          ? chittyOSIntegration.getStatus()
          : { error: "Integration not initialized" };

        return new Response(JSON.stringify(status), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Default AI router info
      return new Response(
        JSON.stringify({
          service: "ChittyRouter AI Gateway",
          message:
            "AI-powered intelligent routing with complete ChittyOS integration",
          version: "2.1.0-ai",
          serviceDiscovery: serviceDiscovery ? "active" : "inactive",
          chittyOS_integration: chittyOSIntegration ? "active" : "inactive",
          endpoints: [
            "POST /process - AI email processing",
            "POST /agents - Agent orchestration",
            "POST /integration/service - Service routing via discovery",
            "GET /health - Comprehensive health check",
            "GET /discovery/status - Service discovery status",
            "POST /pdx/v1/* - PDX AI DNA API",
            "POST /chittychat/* - ChittyChat integration",
          ],
          aiModels: [
            "@cf/meta/llama-3.1-8b-instruct",
            "@cf/microsoft/resnet-50",
            "@cf/openai/whisper",
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("ChittyRouter AI Gateway error:", error);

      return new Response(
        JSON.stringify({
          error: "AI Gateway processing failed",
          message: error.message,
          fallback: "traditional routing available",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },

  // AI-powered Email Worker interface
  async email(message, env, ctx) {
    const processor = new EmailProcessor(env.AI, env);
    return await processor.processIncomingEmail(message, ctx);
  },
};

// Export AI components (AIStateDO already exported from unified-worker)
export { ChittyRouterAI } from "./ai/intelligent-router.js";
export { AgentOrchestrator } from "./ai/agent-orchestrator.js";

// ChittyRouter AI Gateway startup
console.log("🚀 ChittyRouter AI Gateway Starting...");
console.log("🤖 AI-powered intelligent routing enabled");
console.log("🔍 Service discovery with 34+ ChittyOS services");
console.log("📡 Registry integration with live discovery");
console.log("🧬 PDX v1.0 - AI DNA Portability enabled");
console.log("✨ Complete ChittyOS Integration Ready!");
