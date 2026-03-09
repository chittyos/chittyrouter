/**
 * Unit Tests for MCP Gateway
 * Tests tool registration, delegation routing, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock agents/mcp and MCP SDK before any imports that use them
vi.mock("agents/mcp", () => ({
  McpAgent: class MockMcpAgent {
    constructor() {
      this.env = {};
    }
    static serve(path, opts) {
      return { fetch: vi.fn() };
    }
  },
}));

vi.mock("agents", () => ({
  Agent: class MockAgent {
    constructor() {
      this.env = {};
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  McpServer: class MockMcpServer {
    constructor(opts) {
      this.name = opts.name;
      this.version = opts.version;
      this._tools = new Map();
    }
    tool(name, description, schema, handler) {
      this._tools.set(name, { description, schema, handler });
    }
  },
}));

import { ALL_TOOL_SCHEMAS } from "../../src/mcp/tool-schemas.js";
import { ChittyRouterMcpGateway } from "../../src/mcp/mcp-gateway.js";

// ── Tool Schema Tests ────────────────────────────────────────────────

describe("MCP Tool Schemas", () => {
  it("should define exactly 39 tools", () => {
    const toolNames = Object.keys(ALL_TOOL_SCHEMAS);
    expect(toolNames.length).toBe(39);
  });

  it("should use agent__action naming convention for all tools", () => {
    for (const name of Object.keys(ALL_TOOL_SCHEMAS)) {
      expect(name).toMatch(/^[a-z]+__[a-z]+$/);
    }
  });

  it("should have required fields for every tool", () => {
    for (const [name, def] of Object.entries(ALL_TOOL_SCHEMAS)) {
      expect(def.description, `${name} missing description`).toBeTruthy();
      expect(def.schema, `${name} missing schema`).toBeTruthy();
      expect(def.method, `${name} missing method`).toBeTruthy();
      expect(["GET", "POST"]).toContain(def.method);
      expect(def.path, `${name} missing path`).toBeTruthy();
      expect(def.binding, `${name} missing binding`).toBeTruthy();
    }
  });

  it("should cover all 12 agent bindings", () => {
    const bindings = new Set(Object.values(ALL_TOOL_SCHEMAS).map((d) => d.binding));
    const expected = [
      "TRIAGE_AGENT", "PRIORITY_AGENT", "RESPONSE_AGENT", "DOCUMENT_AGENT",
      "ENTITY_AGENT", "EVIDENCE_AGENT", "CALENDAR_AGENT", "FINANCE_AGENT",
      "NOTIFICATION_AGENT", "INTELLIGENCE_AGENT", "WEBHOOK_AGENT", "MESSAGING_AGENT",
    ];
    for (const b of expected) {
      expect(bindings.has(b), `Missing binding: ${b}`).toBe(true);
    }
  });

  it("should have valid Zod schemas for all tools", () => {
    for (const [name, def] of Object.entries(ALL_TOOL_SCHEMAS)) {
      expect(typeof def.schema.safeParse, `${name} should have safeParse`).toBe("function");
    }
  });

  it("should accept empty objects for GET tools with all-optional schemas", () => {
    // GET tools with required fields are excluded
    const hasRequiredFields = ["entity__get", "evidence__custody", "finance__ledger", "messaging__thread"];
    const getToolsWithOptionalOnly = Object.entries(ALL_TOOL_SCHEMAS).filter(
      ([name, def]) => def.method === "GET" && !hasRequiredFields.includes(name),
    );
    for (const [name, def] of getToolsWithOptionalOnly) {
      const result = def.schema.safeParse({});
      expect(result.success, `${name} GET schema should accept empty object`).toBe(true);
    }
  });

  const toolCountByAgent = {
    TRIAGE_AGENT: 2,
    PRIORITY_AGENT: 2,
    RESPONSE_AGENT: 2,
    DOCUMENT_AGENT: 2,
    ENTITY_AGENT: 6,
    EVIDENCE_AGENT: 5,
    CALENDAR_AGENT: 3,
    FINANCE_AGENT: 4,
    NOTIFICATION_AGENT: 3,
    INTELLIGENCE_AGENT: 4,
    WEBHOOK_AGENT: 2,
    MESSAGING_AGENT: 4,
  };

  for (const [binding, expectedCount] of Object.entries(toolCountByAgent)) {
    it(`should have ${expectedCount} tools for ${binding}`, () => {
      const count = Object.values(ALL_TOOL_SCHEMAS).filter((d) => d.binding === binding).length;
      expect(count).toBe(expectedCount);
    });
  }
});

// ── Gateway Delegation Tests ────────────────────────────────────────

describe("MCP Gateway Delegation", () => {
  let gateway;
  let mockStub;

  function createMockEnv() {
    mockStub = {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 1, status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    };

    const mockBinding = {
      idFromName: vi.fn().mockReturnValue("test-id"),
      get: vi.fn().mockReturnValue(mockStub),
    };

    return {
      TRIAGE_AGENT: mockBinding,
      PRIORITY_AGENT: mockBinding,
      RESPONSE_AGENT: mockBinding,
      DOCUMENT_AGENT: mockBinding,
      ENTITY_AGENT: mockBinding,
      EVIDENCE_AGENT: mockBinding,
      CALENDAR_AGENT: mockBinding,
      FINANCE_AGENT: mockBinding,
      NOTIFICATION_AGENT: mockBinding,
      INTELLIGENCE_AGENT: mockBinding,
      WEBHOOK_AGENT: mockBinding,
      MESSAGING_AGENT: mockBinding,
      MCP_GATEWAY: mockBinding,
    };
  }

  beforeEach(() => {
    gateway = new ChittyRouterMcpGateway();
    gateway.env = createMockEnv();
  });

  it("should delegate POST tools with JSON body", async () => {
    await gateway.delegateToAgentDO(
      "ENTITY_AGENT", "POST", "/create",
      { entity_type: "P", name: "Test Person" },
      null,
    );

    expect(mockStub.fetch).toHaveBeenCalledOnce();
    const req = mockStub.fetch.mock.calls[0][0];
    expect(req.method).toBe("POST");
    expect(new URL(req.url).pathname).toBe("/create");
    const body = await req.clone().json();
    expect(body.entity_type).toBe("P");
    expect(body.name).toBe("Test Person");
  });

  it("should delegate GET tools with query params", async () => {
    await gateway.delegateToAgentDO(
      "ENTITY_AGENT", "GET", "/search",
      null,
      { entity_type: "P", org: "ChittyOS" },
    );

    expect(mockStub.fetch).toHaveBeenCalledOnce();
    const req = mockStub.fetch.mock.calls[0][0];
    expect(req.method).toBe("GET");
    const url = new URL(req.url);
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("entity_type")).toBe("P");
    expect(url.searchParams.get("org")).toBe("ChittyOS");
  });

  it("should omit undefined/null query params", async () => {
    await gateway.delegateToAgentDO(
      "ENTITY_AGENT", "GET", "/search",
      null,
      { entity_type: "P", org: undefined, status: null },
    );

    const req = mockStub.fetch.mock.calls[0][0];
    const url = new URL(req.url);
    expect(url.searchParams.get("entity_type")).toBe("P");
    expect(url.searchParams.has("org")).toBe(false);
    expect(url.searchParams.has("status")).toBe(false);
  });

  it("should use singleton pattern (idFromName with binding name)", async () => {
    await gateway.delegateToAgentDO("ENTITY_AGENT", "GET", "/stats", null, {});
    expect(gateway.env.ENTITY_AGENT.idFromName).toHaveBeenCalledWith("ENTITY_AGENT");
  });

  it("should throw when binding is not available", async () => {
    gateway.env = {};
    await expect(
      gateway.delegateToAgentDO("ENTITY_AGENT", "GET", "/stats", null, {}),
    ).rejects.toThrow("Agent binding ENTITY_AGENT not available");
  });
});

// ── Gateway Tool Handler Tests ──────────────────────────────────────

describe("MCP Gateway handleToolCall", () => {
  let gateway;
  let mockStub;

  beforeEach(() => {
    gateway = new ChittyRouterMcpGateway();
    mockStub = {
      fetch: vi.fn(),
    };
    const mockBinding = {
      idFromName: vi.fn().mockReturnValue("test-id"),
      get: vi.fn().mockReturnValue(mockStub),
    };
    gateway.env = {
      ENTITY_AGENT: mockBinding,
      TRIAGE_AGENT: mockBinding,
    };
  });

  it("should return MCP content for successful responses", async () => {
    mockStub.fetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 1, name: "Test" }), { status: 200 }),
    );

    const toolDef = ALL_TOOL_SCHEMAS.entity__create;
    const result = await gateway.handleToolCall("entity__create", toolDef, {
      entity_type: "P",
      name: "Test",
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(1);
  });

  it("should return isError for 4xx responses", async () => {
    mockStub.fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "name is required" }), { status: 400 }),
    );

    const toolDef = ALL_TOOL_SCHEMAS.entity__create;
    const result = await gateway.handleToolCall("entity__create", toolDef, {});

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("name is required");
  });

  it("should return isError for 5xx responses", async () => {
    mockStub.fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Internal error" }), { status: 500 }),
    );

    const toolDef = ALL_TOOL_SCHEMAS.triage__classify;
    const result = await gateway.handleToolCall("triage__classify", toolDef, {
      content: "test",
    });

    expect(result.isError).toBe(true);
  });

  it("should handle fetch exceptions gracefully", async () => {
    mockStub.fetch.mockRejectedValue(new Error("DO unavailable"));

    const toolDef = ALL_TOOL_SCHEMAS.entity__create;
    const result = await gateway.handleToolCall("entity__create", toolDef, {
      entity_type: "P",
      name: "Test",
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("DO unavailable");
    expect(parsed.tool).toBe("entity__create");
  });
});

// ── Gateway Init Tests ──────────────────────────────────────────────

describe("MCP Gateway Init", () => {
  it("should have a McpServer instance with correct name and version", () => {
    const gateway = new ChittyRouterMcpGateway();
    expect(gateway.server.name).toBe("ChittyRouter");
    expect(gateway.server.version).toBe("2.1.0");
  });

  it("should register all 39 tools during init", async () => {
    const gateway = new ChittyRouterMcpGateway();
    await gateway.init();
    expect(gateway.server._tools.size).toBe(39);
  });

  it("should register tools with correct names", async () => {
    const gateway = new ChittyRouterMcpGateway();
    await gateway.init();
    for (const name of Object.keys(ALL_TOOL_SCHEMAS)) {
      expect(gateway.server._tools.has(name), `Tool ${name} not registered`).toBe(true);
    }
  });
});
