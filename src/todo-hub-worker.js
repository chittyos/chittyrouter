/**
 * ChittyOS Todo Hub Worker
 * Central hub for omnidirectional todo synchronization across AI platforms
 * Handles REST API and WebSocket connections
 */

import {
  listTodos,
  createTodo,
  getTodo,
  updateTodo,
  deleteTodo,
  syncTodos,
  getTodosSince,
  handleWebSocket,
  healthCheck,
} from "./routing/todo-hub.js";

/**
 * Main fetch handler for all incoming requests
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers for cross-origin requests
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    // Handle preflight OPTIONS requests
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      let response;

      // Route to appropriate handler
      if (path === "/health" || path === "/api/todos/health") {
        response = await healthCheck(request, env);
      }
      // WebSocket endpoint
      else if (path === "/api/todos/watch") {
        response = await handleWebSocket(request, env);
      }
      // List todos (GET /api/todos)
      else if (path === "/api/todos" && method === "GET") {
        response = await listTodos(request, env);
      }
      // Create todo (POST /api/todos)
      else if (path === "/api/todos" && method === "POST") {
        response = await createTodo(request, env);
      }
      // Bulk sync endpoint (POST /api/todos/sync)
      else if (path === "/api/todos/sync" && method === "POST") {
        response = await syncTodos(request, env);
      }
      // Delta sync endpoint (GET /api/todos/since/:timestamp)
      else if (path.match(/^\/api\/todos\/since\/\d+$/) && method === "GET") {
        const timestamp = path.split("/").pop();
        response = await getTodosSince(request, env, timestamp);
      }
      // Get specific todo (GET /api/todos/:id)
      else if (path.match(/^\/api\/todos\/[A-Z0-9-]+$/) && method === "GET") {
        const id = path.split("/").pop();
        response = await getTodo(request, env, id);
      }
      // Update todo (PUT /api/todos/:id)
      else if (path.match(/^\/api\/todos\/[A-Z0-9-]+$/) && method === "PUT") {
        const id = path.split("/").pop();
        response = await updateTodo(request, env, id);
      }
      // Delete todo (DELETE /api/todos/:id)
      else if (
        path.match(/^\/api\/todos\/[A-Z0-9-]+$/) &&
        method === "DELETE"
      ) {
        const id = path.split("/").pop();
        response = await deleteTodo(request, env, id);
      }
      // Not found
      else {
        response = new Response(
          JSON.stringify({
            error: "Endpoint not found",
            path,
            method,
            availableEndpoints: [
              "GET /health",
              "GET /api/todos",
              "POST /api/todos",
              "GET /api/todos/:id",
              "PUT /api/todos/:id",
              "DELETE /api/todos/:id",
              "POST /api/todos/sync",
              "GET /api/todos/since/:timestamp",
              "WS /api/todos/watch",
            ],
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Add CORS headers to response
      const headers = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error("Worker error:", error);

      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error.message,
          stack: env.ENVIRONMENT === "development" ? error.stack : undefined,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        },
      );
    }
  },

  /**
   * Scheduled handler for periodic tasks (cleanup, maintenance)
   */
  async scheduled(event, env, ctx) {
    try {
      console.log("Running scheduled tasks...");

      // Cleanup stale WebSocket subscriptions (older than 24 hours)
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const result = await env.DB.prepare(
        `
        DELETE FROM ws_subscriptions WHERE last_ping < ?
      `,
      )
        .bind(cutoff)
        .run();

      console.log(`Cleaned up ${result.changes} stale WebSocket subscriptions`);

      // Additional maintenance tasks could be added here
      // - Archive old completed todos
      // - Cleanup conflict logs older than 30 days
      // - Update sync metadata statistics
    } catch (error) {
      console.error("Scheduled task error:", error);
    }
  },
};
