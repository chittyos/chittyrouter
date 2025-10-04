/**
 * Unified ChittyOS Service Router
 *
 * This is the central routing intelligence that routes ALL ChittyOS services
 * through a single, intelligent gateway with AI-powered decision making.
 *
 * Architecture: ChittyRouter → Service Discovery → Route to Service Worker
 */

// Service Registry - All ChittyOS Services
const CHITTYOS_SERVICES = {
  // Core Platform Services
  gateway: {
    domain: "gateway.chitty.cc",
    worker: "chittyos-platform-prod",
    description: "Unified platform entry point",
    routes: ["/*"],
  },

  // Identity & Auth
  id: {
    domain: "id.chitty.cc",
    worker: "chittyid-service",
    description: "ChittyID central authority (pipeline-only)",
    routes: ["/v1/mint", "/v1/validate", "/health"],
  },
  auth: {
    domain: "auth.chitty.cc",
    worker: "chittyauth",
    description: "Authentication & OAuth",
    routes: ["/oauth/*", "/jwt/*", "/mcp/*"],
  },

  // Data & Schema
  schema: {
    domain: "schema.chitty.cc",
    worker: "chittyschema",
    description: "Universal data framework",
    routes: ["/api/v1/*", "/sync/*", "/health"],
  },
  canon: {
    domain: "canon.chitty.cc",
    worker: "chittycanon",
    description: "Canonical data management",
    routes: ["/resolve/*", "/validate/*"],
  },

  // Service Discovery & Registry
  registry: {
    domain: "registry.chitty.cc",
    worker: "chittyregistry",
    description: "Service discovery & health",
    routes: ["/services/*", "/health/*", "/register"],
  },

  // Communication & Sync
  chat: {
    domain: "chat.chitty.cc",
    worker: "chittychat",
    description: "Real-time messaging",
    routes: ["/rooms/*", "/messages/*", "/ws"],
  },
  sync: {
    domain: "sync.chitty.cc",
    worker: "chittychat",
    description: "Data synchronization",
    routes: ["/api/*", "/notion/*", "/status"],
  },

  // AI Services
  ai: {
    domain: "ai.chitty.cc",
    worker: "chittychat",
    description: "AI gateway & embeddings",
    routes: ["/chat/*", "/embeddings/*", "/models"],
  },
  langchain: {
    domain: "langchain.chitty.cc",
    worker: "chittychat",
    description: "LangChain orchestration",
    routes: ["/agents/*", "/chains/*"],
  },
  mcp: {
    domain: "mcp.chitty.cc",
    worker: "chittymcp",
    description: "Model Context Protocol",
    routes: ["/tools/*", "/resources/*"],
  },

  // Application Services
  cases: {
    domain: "cases.chitty.cc",
    worker: "chittychat",
    description: "Legal case management",
    routes: ["/api/*", "/evidence/*", "/docket/*"],
  },
  beacon: {
    domain: "beacon.chitty.cc",
    worker: "chittychat",
    description: "Monitoring & analytics",
    routes: ["/metrics/*", "/events/*", "/status"],
  },

  // Verification & Trust
  verify: {
    domain: "verify.chitty.cc",
    worker: "chittyverify",
    description: "Data verification",
    routes: ["/validate/*", "/check/*"],
  },
  certify: {
    domain: "certify.chitty.cc",
    worker: "chittycertify",
    description: "Service certification",
    routes: ["/certify/*", "/status/*"],
  },

  // Email & Communication
  email: {
    domain: "email.chitty.cc",
    worker: "chittyrouter", // Self - email routing
    description: "Email routing & processing",
    routes: ["/process/*", "/route/*"],
  },
  router: {
    domain: "router.chitty.cc",
    worker: "chittyrouter", // Self
    description: "Intelligent routing gateway",
    routes: ["/*"],
  },

  // Viewer & Portal
  viewer: {
    domain: "viewer.chitty.cc",
    worker: "chittychat",
    description: "Immutable data viewer",
    routes: ["/view/*", "/audit/*"],
  },
  portal: {
    domain: "portal.chitty.cc",
    worker: "chittychat",
    description: "MCP portal",
    routes: ["/dashboard/*", "/tools/*"],
  },

  // API Gateway
  api: {
    domain: "api.chitty.cc",
    worker: "chittychat",
    description: "REST API gateway",
    routes: ["/v1/*", "/v2/*", "/graphql"],
  },
};

/**
 * Intelligent Service Router
 */
export class UnifiedServiceRouter {
  constructor(env) {
    this.env = env;
    this.services = CHITTYOS_SERVICES;
  }

  /**
   * Route request to appropriate service
   */
  async route(request) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;

    // 1. Try hostname-based routing first (most specific)
    const hostnameService = this.findServiceByHostname(hostname);
    if (hostnameService) {
      return await this.forwardToService(request, hostnameService);
    }

    // 2. Try path-based routing
    const pathService = this.findServiceByPath(pathname);
    if (pathService) {
      return await this.forwardToService(request, pathService);
    }

    // 3. Try AI-powered intelligent routing (for ambiguous requests)
    if (this.env.AI) {
      const aiRoute = await this.intelligentRoute(request);
      if (aiRoute) {
        return await this.forwardToService(request, aiRoute);
      }
    }

    // 4. Fallback to gateway
    return await this.forwardToService(request, this.services.gateway);
  }

  /**
   * Find service by hostname
   */
  findServiceByHostname(hostname) {
    for (const [key, service] of Object.entries(this.services)) {
      if (hostname.includes(service.domain.split(".")[0])) {
        return service;
      }
    }
    return null;
  }

  /**
   * Find service by path
   */
  findServiceByPath(pathname) {
    // Check each service's routes
    for (const [key, service] of Object.entries(this.services)) {
      for (const route of service.routes) {
        if (this.matchRoute(pathname, route)) {
          return service;
        }
      }
    }
    return null;
  }

  /**
   * Match route pattern
   */
  matchRoute(pathname, pattern) {
    // Convert pattern to regex
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return regex.test(pathname);
  }

  /**
   * AI-powered intelligent routing for ambiguous requests
   */
  async intelligentRoute(request) {
    try {
      const url = new URL(request.url);

      // Prepare context for AI
      const context = {
        hostname: url.hostname,
        pathname: url.pathname,
        method: request.method,
        headers: Object.fromEntries(request.headers),
      };

      // AI prompt for routing decision
      const prompt = `Analyze this HTTP request and determine which ChittyOS service should handle it:

Request Context:
${JSON.stringify(context, null, 2)}

Available Services:
${Object.entries(this.services)
  .map(([key, svc]) => `- ${key}: ${svc.description} (${svc.domain})`)
  .join("\n")}

Respond with ONLY the service key (e.g., "auth", "schema", "cases").`;

      const aiResponse = await this.env.AI.run(
        "@cf/meta/llama-4-scout-17b-16e-instruct",
        {
          prompt,
          max_tokens: 50,
        },
      );

      const serviceKey = aiResponse.response?.trim().toLowerCase();

      if (serviceKey && this.services[serviceKey]) {
        return this.services[serviceKey];
      }
    } catch (error) {
      console.error("AI routing failed:", error);
    }

    return null;
  }

  /**
   * Forward request to service worker
   */
  async forwardToService(request, service) {
    // For self-routing (chittyrouter), handle internally
    if (service.worker === "chittyrouter") {
      return await this.handleLocalService(request, service);
    }

    // For ChittyChat platform services, use service bindings if available
    if (
      service.worker === "chittychat" ||
      service.worker === "chittyos-platform-prod"
    ) {
      // Service binding available
      if (this.env.PLATFORM_SERVICE) {
        return await this.env.PLATFORM_SERVICE.fetch(request);
      }

      // Fallback to HTTP fetch
      return await this.fetchService(request, service.domain);
    }

    // For other services, use service bindings or HTTP
    const bindingName = this.getServiceBinding(service.worker);
    if (this.env[bindingName]) {
      return await this.env[bindingName].fetch(request);
    }

    // Fallback to HTTP fetch
    return await this.fetchService(request, service.domain);
  }

  /**
   * Handle local ChittyRouter services
   */
  async handleLocalService(request, service) {
    const url = new URL(request.url);

    // Email routing
    if (
      url.pathname.startsWith("/process") ||
      url.pathname.startsWith("/route")
    ) {
      // Import email processor
      const { handleEmailRouting } = await import(
        "../ai/intelligent-router.js"
      );
      return await handleEmailRouting(request, this.env);
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          service: "chittyrouter",
          status: "healthy",
          mode: "unified-routing",
          version: "2.1.0",
          services: Object.keys(this.services).length,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response("ChittyRouter - Service route not found", {
      status: 404,
    });
  }

  /**
   * HTTP fetch to service
   */
  async fetchService(request, domain) {
    const url = new URL(request.url);
    const targetUrl = `https://${domain}${url.pathname}${url.search}`;

    return await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
    });
  }

  /**
   * Get service binding name from worker name
   */
  getServiceBinding(workerName) {
    const bindings = {
      chittyauth: "AUTH_SERVICE",
      chittyschema: "SCHEMA_SERVICE",
      chittyregistry: "REGISTRY_SERVICE",
      "chittyid-service": "ID_SERVICE",
      chittymcp: "MCP_SERVICE",
    };

    return bindings[workerName] || null;
  }

  /**
   * Get routing analytics
   */
  getRoutingStats() {
    return {
      totalServices: Object.keys(this.services).length,
      servicesByType: {
        core: ["gateway", "id", "auth", "schema", "registry"].length,
        ai: ["ai", "langchain", "mcp"].length,
        data: ["sync", "canon", "verify"].length,
        apps: ["cases", "chat", "beacon", "email"].length,
      },
      services: this.services,
    };
  }
}

/**
 * Service health check endpoint
 */
export async function handleServiceHealth(request, env) {
  const router = new UnifiedServiceRouter(env);
  const stats = router.getRoutingStats();

  return new Response(
    JSON.stringify({
      status: "healthy",
      router: "chittyrouter-unified",
      version: "2.1.0",
      timestamp: new Date().toISOString(),
      ...stats,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}

export default UnifiedServiceRouter;
