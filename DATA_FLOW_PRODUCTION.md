# ChittyRouter Production Data Flow Architecture

**Status:** ✅ **DEPLOYED & RUNNING**
**Worker:** `chittyrouter-production`
**Account:** ChittyCorp LLC
**Last Updated:** 2025-10-31

## 🎯 What's Actually Deployed Today

### **Production Services (Active)**

#### 1. **Unified Service Router**
- **Path:** All routes coordinated through `UnifiedServiceRouter`
- **Function:** Dynamic service discovery and intelligent routing
- **Status:** ✅ Operational

#### 2. **Platform Services** (`/platform/*`)
- **Core Functions:**
  - Health monitoring (`/platform/health`)
  - State management via Durable Objects
  - AI gateway coordination
  - Sync orchestration
  - Persistent agents
  - KV-based caching

- **Durable Objects:**
  - `AIGatewayState` - AI request routing and statistics
  - `ChittyOSPlatformState` - Service registry and metrics
  - `SyncState` - Cross-service synchronization queue
  - `PersistentAgent` - Long-running agent instances

#### 3. **Session Management** (`/session/*`)
- GitHub-based session persistence
- Cross-platform state coordination
- Session initialization and resume
- Real-time session status

#### 4. **Mobile Bridge** (`/mobile/*`)
- Mobile app integration endpoints
- Bridge between mobile and web services
- Status monitoring

#### 5. **ChittySchema Service** (`/schema/*`)
- Data validation endpoints
- Schema management
- Type checking integration

#### 6. **Litigation Router** (`/litigation/*`)
- Evidence ingestion orchestration
- Cook County docket scraping
- AI-powered case analysis
- Attorney transition tracking
- ARDC complaint integration

---

## 📊 Data Storage Architecture (Production)

### **Storage Layers**

#### **1. Durable Objects (Stateful)**
```javascript
// AI Gateway State
env.AI_GATEWAY_STATE.idFromName("ai-gateway-global")
// Tracks: request queue, model cache, usage stats

// Platform State
env.PLATFORM_STATE.idFromName("platform-global")
// Tracks: service registry, metrics, config

// Sync State
env.SYNC_STATE.idFromName("sync-global")
// Tracks: sync queue, sync status, last sync timestamp

// Persistent Agents
env.PERSISTENT_AGENTS.idFromName(agentName)
// Tracks: agent state, working memory, semantic memory refs
```

#### **2. KV Storage (Fast Cache)**
```
AGENT_WORKING_MEMORY
├── Agent context
├── Session state
└── Temporary data
```

#### **3. Vectorize (Semantic Search)**
```
agent-memory-index
└── Semantic embeddings for agent memory
```

#### **4. R2 Buckets (Object Storage)**
```
chittyos-agent-episodes
└── Long-term episodic memory
```

---

## 🔄 Data Flow Patterns

### **Pattern 1: Incoming Request → Service Routing**
```
Client Request
    ↓
UnifiedServiceRouter
    ↓
├─ Known Service? → Service Handler
├─ Platform Route? → Durable Object
├─ Session Route?  → SessionService
├─ Mobile Route?   → MobileBridgeService
└─ Legacy Route?   → Legacy Handler
```

### **Pattern 2: AI Request Processing**
```
AI Request
    ↓
AIGatewayState Durable Object
    ↓
├─ Check cache (modelCache)
├─ Queue request (requestQueue)
├─ Route to env.AI binding
├─ Update stats
└─ Return response
```

### **Pattern 3: Cross-Service Synchronization**
```
Service A → Sync Operation
    ↓
SyncState.queue()
    ↓
├─ Generate ChittyID from id.chitty.cc
├─ Add to syncQueue
├─ Store in Durable Object
└─ Process on /sync/process
```

### **Pattern 4: Session Persistence**
```
Session Init/Update
    ↓
SessionService
    ↓
SessionSyncManager
    ↓
├─ Create GitHub branch: session/{project}/{sessionId}
├─ Store in chittychat-data repo
├─ Sync across Claude/OpenAI/Gemini
└─ Maintain vector clock for consistency
```

---

## 🏛️ Multi-Cloud Storage (Available, Partially Used)

### **Storage Tiers Defined:**

**HOT Tier:**
- Primary: Cloudflare R2
- Backup: Google Drive
- Metadata: Notion, Neon, GitHub
- Use Case: Frequent access, < 1MB files

**WARM Tier:**
- Primary: Google Drive
- Backup: GitHub
- Metadata: Notion, Neon
- Use Case: Moderate access

**COLD Tier:**
- Primary: GitHub
- Backup: Google Drive
- Metadata: Neon
- Use Case: Infrequent access

**ARCHIVE Tier:**
- Primary: GitHub
- Metadata: Neon
- Use Case: Long-term retention

### **Providers Configured:**
- ✅ `CloudflareR2Provider` - R2 object storage
- ✅ `GoogleDriveProvider` - Drive integration via googleapis
- ✅ `GitHubProvider` - GitHub storage and metadata
- ✅ `NotionProvider` - Notion database sync
- ✅ `NeonProvider` - PostgreSQL metadata

### **Current Status:**
🟡 **Code exists but not actively used in production routing**

---

## 🔑 ChittyOS Authority Integration

### **Authority Services (Configured):**

1. **ChittySchema** (`https://schema.chitty.cc`)
   - Data validation
   - Type checking
   - Schema enforcement

2. **ChittyTrust** (`https://trust.chitty.cc`)
   - Trust scoring
   - Reputation management
   - Content evaluation

3. **ChittyVerify** (`https://verify.chitty.cc`)
   - Integrity verification
   - Content hashing
   - Authenticity checks

4. **ChittyID** (`https://id.chitty.cc`)
   - Unique identifier generation
   - Using official `@chittyos/chittyid-client@1.0.0`
   - Required for sync operations

5. **ChittyRegistry** (`https://registry.chitty.cc`)
   - Service registration
   - Operation logging
   - Discovery coordination

### **Usage in Production:**
- ✅ ChittyID actively used in `SyncState` for operation tracking
- 🟡 Other authorities configured but not enforced
- 📋 Available for validation when needed

---

## 📦 What's NOT Currently Active

### **1. Multi-Cloud Storage Manager**
- **Status:** Code complete, not integrated into main routing
- **Path:** `src/storage/multi-cloud-storage-manager.js`
- **Why:** Production uses simpler R2/KV/DO approach
- **Next Step:** Integrate for evidence/document storage

### **2. Comprehensive Authority Validation**
- **Status:** Authority endpoints configured, not enforced
- **Why:** Production prioritizes speed over validation
- **Next Step:** Add validation middleware

### **3. Multi-Repository Data Routing**
- **Status:** SessionSyncManager has GitHub integration
- **Why:** Not all services use GitHub-based persistence yet
- **Next Step:** Expand to all data types

### **4. Email Processing Pipeline**
- **Status:** Email worker code exists
- **Why:** Not configured in production wrangler.toml
- **Next Step:** Enable email routing

---

## 🚀 Production Endpoints

### **Health Checks:**
```bash
GET https://router.chitty.cc/health
GET https://router.chitty.cc/router/health
GET https://router.chitty.cc/platform/health
GET https://router.chitty.cc/litigation/health
```

### **Platform Services:**
```bash
POST https://router.chitty.cc/platform/ai/route
GET  https://router.chitty.cc/platform/state/health
POST https://router.chitty.cc/platform/sync/queue
GET  https://router.chitty.cc/platform/agents/{name}/status
```

### **Session Management:**
```bash
POST https://router.chitty.cc/session/init
POST https://router.chitty.cc/session/state
GET  https://router.chitty.cc/session/status
```

### **Mobile Bridge:**
```bash
GET https://router.chitty.cc/mobile/status
```

### **Litigation:**
```bash
POST https://router.chitty.cc/litigation/evidence/ingest
POST https://router.chitty.cc/litigation/email/route
GET  https://router.chitty.cc/litigation/cases/{caseNumber}
```

---

## 📋 Deployment Configuration

### **wrangler.toml (Production):**
```toml
[env.production]
name = "chittyrouter-production"
main = "src/index.js"

# Bindings
ai.binding = "AI"  # Cloudflare AI models
kv_namespaces = ["AGENT_WORKING_MEMORY"]
vectorize = ["AGENT_SEMANTIC_MEMORY"]
r2_buckets = ["AGENT_EPISODIC_MEMORY"]
durable_objects = ["AI_GATEWAY_STATE", "PLATFORM_STATE", "SYNC_STATE", "PERSISTENT_AGENTS"]

# Routes
routes = ["router.chitty.cc/*"]
```

### **Dependencies:**
```json
{
  "@chittyos/chittyid-client": "^1.0.0",  // Official package
  "@modelcontextprotocol/sdk": "^1.0.0",
  "@neondatabase/serverless": "^1.0.1",
  "@notionhq/client": "^5.1.0",
  "@octokit/rest": "^22.0.0"
}
```

---

## 🎯 Summary: What Works Today

### ✅ **Production-Ready:**
- Unified service routing with dynamic discovery
- Durable Object state management (4 classes)
- Session management with GitHub persistence
- Mobile bridge integration
- ChittySchema validation service
- Litigation router with evidence orchestration
- AI gateway with Cloudflare AI binding
- KV/Vectorize/R2 storage integration

### 🟡 **Configured But Not Used:**
- Multi-cloud storage manager (R2/Drive/GitHub)
- Authority validation (Schema/Trust/Verify)
- Notion/Neon metadata sync
- Email worker pipeline

### 📋 **Next Steps:**
1. Enable email routing configuration
2. Integrate multi-cloud storage for evidence
3. Add authority validation middleware
4. Expand GitHub-based persistence to all services
5. Implement comprehensive data tier routing

---

**This document reflects the ACTUAL deployed state as of 2025-10-31.**
**For aspirational architecture, see original CLAUDE.md documentation.**
