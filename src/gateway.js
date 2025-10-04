// Gateway Worker - Routes requests to appropriate service workers
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const pathname = url.pathname;

    try {
      // Route to appropriate service worker based on subdomain or path

      // Platform service (main)
      if (hostname.includes("platform") || pathname.startsWith("/platform")) {
        return await env.PLATFORM.fetch(request);
      }

      // Bridge service
      if (hostname.includes("bridge") || pathname.startsWith("/bridge")) {
        return await env.BRIDGE.fetch(request);
      }

      // Consultant service
      if (
        hostname.includes("consultant") ||
        pathname.startsWith("/consultant")
      ) {
        return await env.CONSULTANT.fetch(request);
      }

      // Chain service
      if (hostname.includes("chain") || pathname.startsWith("/chain")) {
        return await env.CHAIN.fetch(request);
      }

      // CTO MCP service
      if (hostname.includes("cto") || pathname.startsWith("/cto")) {
        return await env.CTO.fetch(request);
      }

      // Landing pages
      if (hostname.includes("landing") || pathname === "/") {
        return await env.LANDING.fetch(request);
      }

      // Health check - query all services
      if (pathname === "/health") {
        const services = [
          "PLATFORM",
          "BRIDGE",
          "CONSULTANT",
          "CHAIN",
          "CTO",
          "LANDING",
        ];
        const health = {};

        for (const service of services) {
          try {
            if (env[service]) {
              const response = await env[service].fetch(
                new Request("https://internal/health"),
              );
              health[service.toLowerCase()] = response.ok
                ? "healthy"
                : "unhealthy";
            } else {
              health[service.toLowerCase()] = "not configured";
            }
          } catch (error) {
            health[service.toLowerCase()] = "error";
          }
        }

        return new Response(
          JSON.stringify({
            status: "gateway operational",
            services: health,
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      }

      // Service discovery endpoint
      if (pathname === "/services") {
        return new Response(
          JSON.stringify({
            services: {
              platform: "/platform",
              bridge: "/bridge",
              consultant: "/consultant",
              chain: "/chain",
              cto: "/cto",
              landing: "/",
            },
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      }

      // Default response
      return new Response("ChittyOS Gateway - Service not found", {
        status: 404,
        headers: { "content-type": "text/plain" },
      });
    } catch (error) {
      return new Response(`Gateway error: ${error.message}`, {
        status: 500,
        headers: { "content-type": "text/plain" },
      });
    }
  },
};
