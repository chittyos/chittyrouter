#!/usr/bin/env node
/**
 * ChittyRouter MCP Server - Claude Desktop Extension
 * Provides 23 tools across 17 categories for ChittyOS integration
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// Import ChittyRouter MCP handlers
import { ChittyRouterMCP } from "./unified-worker.js";

const server = new Server(
  {
    name: "chittymcp",
    version: "2.1.0",
    vendor: "ChittyOS",
    description: "ChittyMCP Server with 23 tools for ChittyOS integration",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Initialize ChittyRouter MCP handler
const chittyMCP = new ChittyRouterMCP();

// Tool definitions matching the unified worker implementation
const TOOLS = [
  // File Operations
  {
    name: "read_file",
    description: "Read contents of a file",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List contents of a directory",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list" },
      },
      required: ["path"],
    },
  },

  // Git Operations
  {
    name: "git_status",
    description: "Get git repository status",
    inputSchema: {
      type: "object",
      properties: {
        repo_path: { type: "string", description: "Repository path" },
      },
      required: ["repo_path"],
    },
  },
  {
    name: "git_commit",
    description: "Create a git commit",
    inputSchema: {
      type: "object",
      properties: {
        repo_path: { type: "string", description: "Repository path" },
        message: { type: "string", description: "Commit message" },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Files to commit",
        },
      },
      required: ["repo_path", "message"],
    },
  },

  // Web Operations
  {
    name: "fetch_url",
    description: "Fetch content from a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE"],
          default: "GET",
        },
        headers: { type: "object", description: "HTTP headers" },
        body: { type: "string", description: "Request body" },
      },
      required: ["url"],
    },
  },

  // Database Operations
  {
    name: "query_database",
    description: "Execute a database query",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "SQL query to execute" },
        database: { type: "string", description: "Database connection string" },
      },
      required: ["query"],
    },
  },

  // ChittyOS Integration
  {
    name: "chittyid_generate",
    description: "Generate a new ChittyID",
    inputSchema: {
      type: "object",
      properties: {
        entity_type: {
          type: "string",
          enum: [
            "PEO",
            "PLACE",
            "PROP",
            "EVNT",
            "AUTH",
            "INFO",
            "FACT",
            "CONTEXT",
            "ACTOR",
          ],
          description: "Entity type for ChittyID",
        },
        metadata: { type: "object", description: "Additional metadata" },
      },
      required: ["entity_type"],
    },
  },
  {
    name: "chittyos_sync",
    description: "Sync data with ChittyOS services",
    inputSchema: {
      type: "object",
      properties: {
        service: { type: "string", description: "ChittyOS service name" },
        action: { type: "string", description: "Sync action" },
        data: { type: "object", description: "Data to sync" },
      },
      required: ["service", "action"],
    },
  },

  // AI Operations
  {
    name: "ai_analyze",
    description: "Analyze content using AI",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Content to analyze" },
        type: {
          type: "string",
          enum: ["text", "email", "document"],
          description: "Content type",
        },
        model: { type: "string", description: "AI model to use" },
      },
      required: ["content", "type"],
    },
  },

  // Project Management
  {
    name: "project_status",
    description: "Get ChittyOS project status",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Project identifier" },
      },
    },
  },

  // System Operations
  {
    name: "system_health",
    description: "Check system health across ChittyOS services",
    inputSchema: {
      type: "object",
      properties: {
        services: {
          type: "array",
          items: { type: "string" },
          description: "Services to check",
        },
      },
    },
  },

  // Additional tools to reach 23 total
  {
    name: "encrypt_data",
    description: "Encrypt sensitive data",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "string", description: "Data to encrypt" },
        key_id: { type: "string", description: "Encryption key ID" },
      },
      required: ["data"],
    },
  },
  {
    name: "decrypt_data",
    description: "Decrypt sensitive data",
    inputSchema: {
      type: "object",
      properties: {
        encrypted_data: { type: "string", description: "Data to decrypt" },
        key_id: { type: "string", description: "Encryption key ID" },
      },
      required: ["encrypted_data"],
    },
  },
  {
    name: "validate_schema",
    description: "Validate data against ChittyOS schema",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "object", description: "Data to validate" },
        schema_type: { type: "string", description: "Schema type" },
      },
      required: ["data", "schema_type"],
    },
  },
  {
    name: "backup_data",
    description: "Create data backup",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path or service" },
        destination: { type: "string", description: "Backup destination" },
      },
      required: ["source"],
    },
  },
  {
    name: "restore_data",
    description: "Restore data from backup",
    inputSchema: {
      type: "object",
      properties: {
        backup_path: { type: "string", description: "Backup file path" },
        destination: { type: "string", description: "Restore destination" },
      },
      required: ["backup_path"],
    },
  },
  {
    name: "monitor_service",
    description: "Monitor ChittyOS service metrics",
    inputSchema: {
      type: "object",
      properties: {
        service_name: { type: "string", description: "Service to monitor" },
        metrics: {
          type: "array",
          items: { type: "string" },
          description: "Metrics to collect",
        },
      },
      required: ["service_name"],
    },
  },
  {
    name: "deploy_service",
    description: "Deploy ChittyOS service",
    inputSchema: {
      type: "object",
      properties: {
        service_name: { type: "string", description: "Service to deploy" },
        environment: {
          type: "string",
          enum: ["development", "staging", "production"],
        },
        config: { type: "object", description: "Deployment configuration" },
      },
      required: ["service_name", "environment"],
    },
  },
  {
    name: "search_logs",
    description: "Search through system logs",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        service: { type: "string", description: "Service to search" },
        timeframe: { type: "string", description: "Time range" },
      },
      required: ["query"],
    },
  },
  {
    name: "generate_report",
    description: "Generate system or project report",
    inputSchema: {
      type: "object",
      properties: {
        report_type: {
          type: "string",
          enum: ["health", "usage", "security", "performance"],
        },
        format: { type: "string", enum: ["json", "csv", "pdf"] },
        filters: { type: "object", description: "Report filters" },
      },
      required: ["report_type"],
    },
  },
  {
    name: "execute_workflow",
    description: "Execute a ChittyOS workflow",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: { type: "string", description: "Workflow identifier" },
        parameters: { type: "object", description: "Workflow parameters" },
      },
      required: ["workflow_id"],
    },
  },

  // RClone Integration Tools
  {
    name: "rclone_copy",
    description: "Copy files/folders using rclone",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source path or remote" },
        destination: {
          type: "string",
          description: "Destination path or remote",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Additional rclone options",
        },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "rclone_sync",
    description: "Sync directories using rclone",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Source directory" },
        destination: { type: "string", description: "Destination directory" },
        delete_excluded: {
          type: "boolean",
          default: false,
          description: "Delete files at destination not in source",
        },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "rclone_list",
    description: "List files in remote storage",
    inputSchema: {
      type: "object",
      properties: {
        remote_path: { type: "string", description: "Remote path to list" },
        format: {
          type: "string",
          enum: ["json", "csv", "table"],
          default: "json",
        },
        recursive: { type: "boolean", default: false },
      },
      required: ["remote_path"],
    },
  },
  {
    name: "rclone_config",
    description: "Manage rclone configuration",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "show", "create", "delete"] },
        remote_name: {
          type: "string",
          description: "Name of remote for show/delete",
        },
        config: { type: "object", description: "Configuration for create" },
      },
      required: ["action"],
    },
  },

  // Replit Integration Tools
  {
    name: "replit_create",
    description: "Create a new Replit project",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        language: { type: "string", description: "Programming language" },
        description: { type: "string", description: "Project description" },
        public: {
          type: "boolean",
          default: false,
          description: "Make project public",
        },
      },
      required: ["name", "language"],
    },
  },
  {
    name: "replit_deploy",
    description: "Deploy Replit project",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Replit project ID" },
        environment: {
          type: "string",
          enum: ["development", "production"],
          default: "production",
        },
        config: { type: "object", description: "Deployment configuration" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "replit_run",
    description: "Run code in Replit environment",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Replit project ID" },
        code: { type: "string", description: "Code to execute" },
        language: { type: "string", description: "Programming language" },
        input: { type: "string", description: "Input for the program" },
      },
      required: ["code", "language"],
    },
  },
  {
    name: "replit_files",
    description: "Manage files in Replit project",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Replit project ID" },
        action: { type: "string", enum: ["list", "read", "write", "delete"] },
        file_path: { type: "string", description: "File path" },
        content: {
          type: "string",
          description: "File content for write operation",
        },
      },
      required: ["project_id", "action"],
    },
  },
  {
    name: "replit_collaborate",
    description: "Manage Replit project collaboration",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Replit project ID" },
        action: { type: "string", enum: ["invite", "remove", "list"] },
        username: { type: "string", description: "Username for invite/remove" },
        permission: {
          type: "string",
          enum: ["read", "write", "admin"],
          default: "write",
        },
      },
      required: ["project_id", "action"],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Create a mock request/env/ctx for the unified worker
    const mockRequest = {
      method: "POST",
      url: `https://mcp.chitty.cc/mcp/tools/${name}`,
      json: () => Promise.resolve(args),
    };

    const mockEnv = {
      // Add any required environment variables
      CHITTY_MCP_SERVER: "true",
      MCP_SERVER_NAME: "ChittyMCP",
      VERSION: "2.1.0",
    };

    const mockCtx = {};

    // Handle the tool call through the unified worker
    const result = await chittyMCP.handleMCPToolCall(
      mockRequest,
      mockEnv,
      mockCtx,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error.message}`,
    );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ChittyMCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
