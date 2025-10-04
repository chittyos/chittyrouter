#!/usr/bin/env node
/**
 * ChittyMCP HTTP Adapter - Remote MCP Server via HTTP/SSE
 * Allows Claude Desktop to connect to ChittyMCP at https://mcp.chitty.cc
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// MCP Server configuration
const server = new Server(
  {
    name: "chittymcp-remote",
    version: "2.1.0",
    vendor: "ChittyOS",
    description: "ChittyMCP Remote Server - 32 tools via HTTP/SSE",
  },
  {
    capabilities: {
      tools: {},
      resources: false,
      prompts: false,
    },
  },
);

// SSE endpoint for MCP protocol
app.get("/sse", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const transport = new SSEServerTransport("/sse", res);
  await server.connect(transport);

  // Keep connection alive
  const heartbeat = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    transport.close();
  });
});

// HTTP endpoints for direct tool calls
app.post("/tools/:toolName", async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  try {
    // Forward to the actual MCP handler
    const response = await fetch(
      "https://mcp.chitty.cc/mcp/tools/" + toolName,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
      },
    );

    const result = await response.json();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// List available tools
app.get("/tools", async (req, res) => {
  const tools = [
    // File Operations
    { name: "read_file", category: "file_operations" },
    { name: "write_file", category: "file_operations" },
    { name: "list_directory", category: "file_operations" },

    // Git Operations
    { name: "git_status", category: "git_operations" },
    { name: "git_commit", category: "git_operations" },

    // Web Operations
    { name: "fetch_url", category: "web_operations" },

    // Database Operations
    { name: "query_database", category: "database_operations" },

    // ChittyOS Integration
    { name: "chittyid_generate", category: "chittyos_integration" },
    { name: "chittyos_sync", category: "chittyos_integration" },

    // AI Operations
    { name: "ai_analyze", category: "ai_operations" },

    // Project Management
    { name: "project_status", category: "project_management" },

    // System Operations
    { name: "system_health", category: "system_operations" },

    // Security Operations
    { name: "encrypt_data", category: "security_operations" },
    { name: "decrypt_data", category: "security_operations" },
    { name: "validate_schema", category: "security_operations" },

    // Data Management
    { name: "backup_data", category: "data_management" },
    { name: "restore_data", category: "data_management" },

    // Monitoring
    { name: "monitor_service", category: "monitoring" },
    { name: "search_logs", category: "monitoring" },

    // Deployment
    { name: "deploy_service", category: "deployment" },

    // Reporting
    { name: "generate_report", category: "reporting" },

    // Workflow
    { name: "execute_workflow", category: "workflow_automation" },

    // RClone Operations (4 tools)
    { name: "rclone_copy", category: "rclone_storage" },
    { name: "rclone_sync", category: "rclone_storage" },
    { name: "rclone_list", category: "rclone_storage" },
    { name: "rclone_config", category: "rclone_storage" },

    // Replit Operations (5 tools)
    { name: "replit_create", category: "replit_development" },
    { name: "replit_deploy", category: "replit_development" },
    { name: "replit_run", category: "replit_development" },
    { name: "replit_files", category: "replit_development" },
    { name: "replit_collaborate", category: "replit_development" },
  ];

  res.json({
    total: 32,
    categories: 19,
    tools: tools,
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "ChittyMCP Remote",
    version: "2.1.0",
    transport: ["http", "sse"],
    tools: 32,
    categories: 19,
  });
});

// OpenAPI specification
app.get("/openapi.json", (req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "ChittyMCP Remote API",
      version: "2.1.0",
      description: "Remote MCP server with 32 tools for ChittyOS integration",
    },
    servers: [
      {
        url: "https://mcp.chitty.cc",
        description: "Production server",
      },
    ],
    paths: {
      "/tools": {
        get: {
          summary: "List available tools",
          responses: {
            200: {
              description: "List of tools",
            },
          },
        },
      },
      "/tools/{toolName}": {
        post: {
          summary: "Execute a tool",
          parameters: [
            {
              name: "toolName",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Tool execution result",
            },
          },
        },
      },
      "/sse": {
        get: {
          summary: "Server-Sent Events endpoint for MCP protocol",
          responses: {
            200: {
              description: "SSE stream",
            },
          },
        },
      },
    },
  });
});

// Start server (for local testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`ChittyMCP HTTP Adapter running on port ${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
    console.log(`Tools endpoint: http://localhost:${PORT}/tools`);
  });
}

export default app;
