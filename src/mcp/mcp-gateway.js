/**
 * ChittyRouterMcpGateway — MCP gateway exposing all 12 Agents SDK DOs as MCP tools.
 * Extends McpAgent from agents/mcp for Streamable HTTP transport.
 * Served at /mcp/v2 via McpAgent.serve().
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ALL_TOOL_SCHEMAS } from "./tool-schemas.js";

export class ChittyRouterMcpGateway extends McpAgent {
  server = new McpServer({
    name: "ChittyRouter",
    version: "2.1.0",
  });

  async init() {
    for (const [toolName, toolDef] of Object.entries(ALL_TOOL_SCHEMAS)) {
      this.server.tool(
        toolName,
        toolDef.description,
        toolDef.schema.shape,
        async (params) => {
          return this.handleToolCall(toolName, toolDef, params);
        },
      );
    }
  }

  /**
   * Execute a tool call by delegating to the appropriate agent DO.
   */
  async handleToolCall(toolName, toolDef, args) {
    try {
      const response = await this.delegateToAgentDO(
        toolDef.binding,
        toolDef.method,
        toolDef.path,
        toolDef.method === "GET" ? null : args,
        toolDef.method === "GET" ? args : null,
      );

      const status = response.status;
      const body = await response.text();

      if (status >= 400) {
        return {
          content: [{ type: "text", text: body }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: body }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message, tool: toolName }) }],
        isError: true,
      };
    }
  }

  /**
   * Forward request to a stateful Agents SDK Durable Object.
   * Replicates the delegation pattern from unified-worker.js:659-686.
   *
   * @param {string} bindingName - DO binding name (e.g. "ENTITY_AGENT")
   * @param {string} method - HTTP method (GET or POST)
   * @param {string} path - Agent endpoint path (e.g. "/create")
   * @param {object|null} body - Request body for POST requests
   * @param {object|null} queryParams - Query parameters for GET requests
   * @returns {Promise<Response>}
   */
  async delegateToAgentDO(bindingName, method, path, body, queryParams) {
    const binding = this.env[bindingName];
    if (!binding) {
      throw new Error(`Agent binding ${bindingName} not available`);
    }

    // Singleton pattern — one instance per agent type
    const id = binding.idFromName(bindingName);
    const stub = binding.get(id);

    // Initialize the agent via partyserver protocol (required before first use)
    await stub.fetch(new Request("http://agent.internal/cdn-cgi/partyserver/set-name/", {
      headers: { "x-partykit-room": bindingName },
    })).then((r) => r.text());

    // Build request URL
    const url = new URL(path, "https://agent.internal");
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const request = new Request(url.toString(), {
      method,
      headers: { "Content-Type": "application/json" },
      body: method !== "GET" && method !== "HEAD" && body
        ? JSON.stringify(body)
        : undefined,
    });

    return stub.fetch(request);
  }
}
