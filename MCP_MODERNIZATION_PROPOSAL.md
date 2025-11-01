# ChittyRouter MCP Modernization Proposal

**Date:** 2025-10-31
**Status:** 📋 Proposal
**Priority:** 🔥 High - Cloudflare native support just released

---

## 🎯 Overview

Cloudflare just announced **native MCP (Model Context Protocol) support** for Workers with:
- `McpAgent` class built on Durable Objects
- Automatic WebSocket hibernation
- Built-in OAuth authentication
- SQL storage per agent instance
- HTTP streamable transport

**ChittyRouter should migrate from Node.js-style MCP to Cloudflare's native implementation.**

---

## 📊 Current State vs New Approach

### **Current Implementation (Production)**

**Files:**
- `src/mcp/mcp-server.js` - Node.js HTTP server with WebSocket
- `src/mcp/mcp-handler.js` - Custom CLI bridge
- `src/mcp-server.js` - Stdio transport implementation
- `src/mcp-http-adapter.js` - SSE server transport

**Dependencies:**
```json
"@modelcontextprotocol/sdk": "^1.0.0"
```

**Approach:**
- Node.js `http` and `ws` modules
- WebSocket server on port 3000
- Manual session management
- Custom authentication
- StdioServerTransport / SSEServerTransport

**Problems:**
- ❌ Requires Node.js runtime (not pure Workers)
- ❌ Manual session state management
- ❌ Custom OAuth implementation needed
- ❌ No automatic hibernation
- ❌ Port-based (not Workers-native)

---

### **Cloudflare Native Approach (New)**

**Package:**
```json
"agents": "latest"  // Cloudflare's agents SDK
```

**Minimal Implementation (15 lines):**
```typescript
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export class ChittyRouterMCP extends McpAgent {
  server = new McpServer({
    name: "ChittyRouter",
    version: "2.1.0",
  });

  async init() {
    // Define tools
    this.server.tool(
      "route_email",
      {
        to: z.string(),
        subject: z.string(),
        body: z.string()
      },
      async (params) => {
        // Call ChittyRouter AI routing
        const result = await this.env.AI.run(/* routing logic */);
        return { content: [{ type: "text", text: result }] };
      }
    );
  }
}
```

**wrangler.toml:**
```toml
[[durable_objects.bindings]]
name = "CHITTYROUTER_MCP"
class_name = "ChittyRouterMCP"
script_name = "chittyrouter-production"

[[routes]]
pattern = "mcp.chitty.cc/*"
zone_name = "chitty.cc"
```

**Benefits:**
- ✅ Pure Cloudflare Workers (no Node.js needed)
- ✅ Automatic session management via Durable Objects
- ✅ Built-in OAuth (Cloudflare handles it)
- ✅ Automatic WebSocket hibernation (cost savings)
- ✅ SQL storage per agent instance
- ✅ HTTP streamable transport
- ✅ Zero-latency SQLite

---

## 🔧 Proposed Architecture

### **ChittyRouter MCP Tools**

The McpAgent should expose ChittyRouter's core capabilities:

**1. Email Routing Tools**
```typescript
this.server.tool("route_email", emailSchema, async (params) => {
  // AI-powered email routing
});

this.server.tool("classify_email", emailSchema, async (params) => {
  // Email classification (triage agent)
});

this.server.tool("extract_evidence", emailSchema, async (params) => {
  // Document analysis and evidence extraction
});
```

**2. Session Management Tools**
```typescript
this.server.tool("init_session", sessionSchema, async (params) => {
  // Initialize GitHub-backed session
});

this.server.tool("sync_session", syncSchema, async (params) => {
  // Cross-platform session sync
});
```

**3. Storage Tools**
```typescript
this.server.tool("store_evidence", evidenceSchema, async (params) => {
  // Multi-cloud storage with tier routing
});

this.server.tool("retrieve_evidence", querySchema, async (params) => {
  // Retrieve from HOT/WARM/COLD tiers
});
```

**4. Litigation Tools**
```typescript
this.server.tool("analyze_case", caseSchema, async (params) => {
  // Cook County docket analysis
});

this.server.tool("extract_facts", documentSchema, async (params) => {
  // Atomic fact extraction
});
```

**5. ChittyOS Integration Tools**
```typescript
this.server.tool("validate_schema", dataSchema, async (params) => {
  // ChittySchema validation
});

this.server.tool("mint_chittyid", purposeSchema, async (params) => {
  // ChittyID generation via official client
});
```

---

## 🔄 Migration Plan

### **Phase 1: Add Native MCP Alongside Existing (Week 1)**

**Goal:** Get Cloudflare native MCP working without breaking existing

**Tasks:**
1. Install `agents` package
2. Create `src/mcp/chittyrouter-mcp-agent.js` with McpAgent class
3. Add Durable Object binding to wrangler.toml
4. Expose basic tools (route_email, classify_email)
5. Deploy to staging
6. Test with Claude Desktop

**Deliverables:**
- Working McpAgent at `mcp.chitty.cc`
- 2-3 core tools functional
- OAuth authentication working

---

### **Phase 2: Port All Tools (Week 2)**

**Goal:** Complete feature parity with existing MCP implementation

**Tasks:**
1. Port email routing tools
2. Port session management tools
3. Port storage tools
4. Port litigation tools
5. Port ChittyOS integration tools
6. Add SQL storage for agent memory
7. Test all tools end-to-end

**Deliverables:**
- Full tool catalog migrated
- Agent state persisted in Durable Object SQL
- Documentation updated

---

### **Phase 3: Deprecate Old Implementation (Week 3)**

**Goal:** Clean up legacy code

**Tasks:**
1. Redirect old endpoints to new McpAgent
2. Remove Node.js-based MCP server files
3. Update documentation
4. Remove unused dependencies
5. Deploy to production

**Deliverables:**
- Clean codebase with only native implementation
- Updated README and docs
- Production deployment

---

## 📋 Code Structure

### **Proposed File Organization**

```
src/
├── mcp/
│   ├── chittyrouter-mcp-agent.js      # Main McpAgent class
│   ├── tools/
│   │   ├── email-routing.js           # Email tools
│   │   ├── session-management.js      # Session tools
│   │   ├── storage.js                 # Storage tools
│   │   ├── litigation.js              # Litigation tools
│   │   └── chittyos.js                # ChittyOS tools
│   └── schemas.js                     # Zod schemas for all tools
└── index.js                           # Export McpAgent for Workers
```

### **Example Tool Implementation**

**src/mcp/tools/email-routing.js:**
```typescript
import { z } from "zod";

export const emailSchema = {
  to: z.string().email(),
  from: z.string().email(),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(z.object({
    filename: z.string(),
    contentType: z.string(),
    size: z.number()
  })).optional()
};

export async function routeEmail(env, params) {
  // Use ChittyRouterAI from existing codebase
  const { ChittyRouterAI } = await import('../ai/intelligent-router.js');
  const router = new ChittyRouterAI(env.AI, env);

  const result = await router.route({
    type: 'email',
    data: params
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result, null, 2)
    }]
  };
}

export async function classifyEmail(env, params) {
  const { TriageAgent } = await import('../ai/triage-agent.js');
  const agent = new TriageAgent(env);

  const classification = await agent.classify(params);

  return {
    content: [{
      type: "text",
      text: JSON.stringify(classification, null, 2)
    }]
  };
}
```

---

## 🎯 Benefits

### **Technical Benefits**

1. **Native Workers Integration**
   - No Node.js runtime required
   - Full Workers API access
   - Edge deployment globally

2. **Automatic State Management**
   - Durable Objects handle sessions
   - SQL storage per agent
   - Hibernation during idle

3. **Built-in OAuth**
   - Cloudflare manages authentication
   - No custom implementation needed
   - Enterprise-grade security

4. **Cost Optimization**
   - Hibernation reduces costs
   - No always-on WebSocket server
   - Pay only for active usage

5. **Better Developer Experience**
   - 15-line minimal implementation
   - Type-safe with Zod
   - Clear API surface

### **Business Benefits**

1. **Faster Development**
   - Less boilerplate code
   - Cloudflare handles hard parts
   - Focus on business logic

2. **Better Reliability**
   - Cloudflare-managed infrastructure
   - Automatic failover
   - Global edge network

3. **Future-Proof**
   - Cloudflare's official approach
   - Active development and support
   - Integration with Cloudflare catalog

---

## 🚀 Quick Start Implementation

**Step 1: Install Dependencies**
```bash
npm install agents zod
```

**Step 2: Create McpAgent**
```typescript
// src/mcp/chittyrouter-mcp-agent.js
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { emailSchema, routeEmail, classifyEmail } from "./tools/email-routing.js";

export class ChittyRouterMCP extends McpAgent {
  server = new McpServer({
    name: "ChittyRouter AI Gateway",
    version: "2.1.0",
  });

  async init() {
    // Email routing tools
    this.server.tool("route_email", emailSchema, (params) =>
      routeEmail(this.env, params)
    );

    this.server.tool("classify_email", emailSchema, (params) =>
      classifyEmail(this.env, params)
    );

    // TODO: Add more tools
  }
}
```

**Step 3: Export in Workers Entry Point**
```typescript
// src/index.js
export { ChittyRouterMCP } from './mcp/chittyrouter-mcp-agent.js';
```

**Step 4: Configure wrangler.toml**
```toml
[[durable_objects.bindings]]
name = "CHITTYROUTER_MCP"
class_name = "ChittyRouterMCP"
script_name = "chittyrouter-production"
```

**Step 5: Deploy**
```bash
wrangler deploy --env production
```

---

## 📊 Comparison Table

| Feature | Current (Node.js) | New (McpAgent) |
|---------|------------------|----------------|
| **Runtime** | Node.js http/ws | Cloudflare Workers |
| **State Management** | Manual Map() | Durable Objects + SQL |
| **Authentication** | Custom | Built-in OAuth |
| **Hibernation** | No | Automatic |
| **Code Complexity** | ~500 lines | ~50 lines |
| **Deployment** | Port-based | Workers routes |
| **Cost** | Always running | Pay-per-use |
| **Latency** | Variable | Edge-optimized |
| **Maintenance** | High | Low |

---

## ✅ Recommendation

**Migrate to Cloudflare's native McpAgent immediately.**

**Rationale:**
1. ✅ Reduces code by 90% (~500 → ~50 lines)
2. ✅ Cloudflare-managed OAuth and state
3. ✅ Better performance with hibernation
4. ✅ Future-proof with official support
5. ✅ Can run in parallel during migration (no disruption)

**Timeline:** 2-3 weeks for complete migration

**Risk:** Low - can deploy alongside existing implementation

---

## 📚 Resources

- **Cloudflare Blog:** https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/
- **McpAgent API:** https://developers.cloudflare.com/agents/model-context-protocol/mcp-agent-api/
- **Durable Objects:** https://developers.cloudflare.com/durable-objects/
- **MCP Specification:** https://modelcontextprotocol.io/

---

**Next Step:** Begin Phase 1 implementation on feature branch.
