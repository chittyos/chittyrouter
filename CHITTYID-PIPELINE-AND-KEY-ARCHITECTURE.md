# ChittyID Pipeline & API Key Management Architecture

**Date**: 2025-10-12
**Version**: 1.0
**Status**: Architecture Analysis & Recommendations

## Executive Summary

This document analyzes the ChittyID intake/minting pipeline and evaluates whether ChittyRouter should be responsible for generating third-party API keys (Cloudflare, OpenAI, etc.).

**Key Findings**:
- ✅ **ChittyID Pipeline is Centralized** - All ID minting flows through `id.chitty.cc`
- ⚠️ **API Key Management is Decentralized** - Each service manages its own external API keys
- 💡 **Recommendation**: Create dedicated `ChittyKey` service for centralized key management

---

## 1. ChittyID Intake & Minting Pipeline

### Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ChittyID Authority                        │
│                   https://id.chitty.cc                       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Official ChittyID Minting Service                  │    │
│  │  - Entity types: PEO, PLACE, PROP, EVNT, AUTH,     │    │
│  │    INFO, FACT, CONTEXT, ACTOR                      │    │
│  │  - Format: CHITTY-{TYPE}-{SEQ}-{CHECK}            │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS REST API
                              │ Authorization: Bearer {CHITTY_ID_TOKEN}
                              │
┌─────────────────────────────┴────────────────────────────────┐
│                        Client Layer                           │
│                                                               │
│  ┌──────────────────────┐   ┌──────────────────────────┐   │
│  │ @chittyos/           │   │  ChittyID Adapter        │   │
│  │ chittyid-client      │◄──┤  (Entity Mapping)        │   │
│  │ (Official SDK)       │   │                          │   │
│  └──────────────────────┘   └──────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────┴────────────────────────────────┐
│                     Consuming Services                        │
│                                                               │
│  • ChittyRouter (email routing, sessions)                    │
│  • ChittyChat (messaging, sync)                              │
│  • ChittySchema (data entities)                              │
│  • HardenedMintingService (legal documents)                  │
│  • SessionSyncManager (session IDs)                          │
└───────────────────────────────────────────────────────────────┘
```

### Minting Flow

**1. Service Initialization**:
```javascript
// src/utils/chittyid-adapter.js
const client = new ChittyIDClient({
  serviceUrl: env.CHITTYID_SERVICE_URL || "https://id.chitty.cc/v1",
  apiKey: env.CHITTY_ID_TOKEN,
  timeout: 10000
});
```

**2. ID Request**:
```javascript
// Entity type mapping
const ENTITY_MAP = {
  SESSN: "CONTEXT",    // Sessions
  APIKEY: "AUTH",      // API Keys (!)
  SESSION: "CONTEXT",
  KEY: "AUTH"
};

await client.mint({
  entity: "CONTEXT",
  name: "project-sync-session",
  metadata: { originalEntity: "SESSN", purpose: "sync" }
});
```

**3. Validation**:
```javascript
// ChittyCheck enforces 1189+ pattern blocks
// No local generation allowed - MUST come from id.chitty.cc
const validation = await client.validate(chittyId);
```

### Key Components

**Primary Minting Locations**:
- `src/utils/chittyid-adapter.js` - Main adapter (✅ uses official client)
- `src/chittyid/chittyid-validator.js` - Validation service
- `src/minting/hardened-minting-service.js` - Legal document minting
- `src/sync/session-sync-manager.js` - Session ID minting (✅ Phase 1 complete)

**Intake Points**:
1. **Email Processing** → `src/workers/email-worker.js` → mints ChittyIDs for emails
2. **Session Management** → `src/sync/session-sync-manager.js` → mints session IDs
3. **Legal Documents** → `src/minting/hardened-minting-service.js` → mints evidence IDs
4. **Todo System** → `src/routing/todo-hub.js` → mints todo item IDs

---

## 2. Current API Key Management Patterns

### Third-Party API Keys Currently Used

**Cloudflare Services**:
```toml
# wrangler.toml - No API keys stored
# Managed via: wrangler login (OAuth)
# Per-service secrets via: wrangler secret put
```

**AI Model Providers**:
```bash
# Stored as Cloudflare Worker Secrets
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put HUGGINGFACE_API_KEY
wrangler secret put MISTRAL_API_KEY
wrangler secret put CF_AI_GATEWAY_TOKEN
```

**Database & Storage**:
```bash
wrangler secret put NEON_DATABASE_URL
wrangler secret put GITHUB_TOKEN
wrangler secret put NOTION_TOKEN
```

**ChittyOS Internal**:
```bash
wrangler secret put CHITTY_ID_TOKEN     # For id.chitty.cc
```

### Current Pattern: **Decentralized Management**

Each service independently:
1. ✅ Stores secrets via `wrangler secret put`
2. ✅ Accesses via `env.SECRET_NAME`
3. ❌ No centralized inventory
4. ❌ No automated rotation
5. ❌ No usage tracking across services

**Security Integration** (src/utils/chittyos-security-integration.js):
```javascript
const CHITTYOS_SERVICES = {
  score: "https://score.chitty.cc/api/v1",
  trust: "https://trust.chitty.cc/api/v1",
  verify: "https://verify.chitty.cc/api/v1",
  auth: "https://auth.chitty.cc/api/v1",  // ← ChittyAuth exists!
  beacon: "https://beacon.chitty.cc/api/v1"
};
```

---

## 3. Should ChittyRouter Generate Third-Party Keys?

### Analysis

**Current State**:
- ChittyRouter is **NOT** responsible for key generation
- Keys are manually created in each third-party platform
- Keys are manually added via `wrangler secret put`

**ChittyRouter's Current Responsibilities**:
✅ Email routing with AI
✅ Service discovery
✅ Unified gateway
✅ Agent orchestration
❌ Key management (not currently)

### Recommendation: **NO - Create Dedicated ChittyKey Service**

**Why ChittyRouter should NOT handle this**:

1. **Separation of Concerns**: Routing ≠ Secret Management
2. **Single Responsibility**: Router focuses on request routing, not credential lifecycle
3. **Security Blast Radius**: Key compromise shouldn't affect routing
4. **Service Complexity**: Router is already complex (90+ files, 862-line main file)

**What SHOULD happen instead**:

```
┌─────────────────────────────────────────────────────────────┐
│                     ChittyKey Service                        │
│                   https://key.chitty.cc                      │
│                                                              │
│  • Generate API keys for third-party services               │
│  • Store encrypted keys in Cloudflare KV/Secrets           │
│  • Automatic rotation policies                              │
│  • Usage tracking & auditing                                │
│  • Integration with ChittyAuth for authorization           │
│  • Vaults for different key types (AI, DB, Storage)        │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │
                 ┌────────────┴───────────┐
                 │                        │
        ┌────────▼────────┐     ┌────────▼────────┐
        │  ChittyRouter   │     │  ChittyChat     │
        │  (consumer)     │     │  (consumer)     │
        └─────────────────┘     └─────────────────┘
```

---

## 4. Recommended Architecture

### Phase 1: Inventory & Audit (Immediate)

**Create Key Inventory**:
```javascript
// src/utils/key-inventory.js
export const KEY_INVENTORY = {
  // AI Services
  ai_models: {
    openai: { secret: "OPENAI_API_KEY", services: ["chittyrouter", "chittychat"] },
    anthropic: { secret: "ANTHROPIC_API_KEY", services: ["chittyrouter"] },
    huggingface: { secret: "HUGGINGFACE_API_KEY", services: ["chittyrouter"] }
  },

  // Databases
  databases: {
    neon: { secret: "NEON_DATABASE_URL", services: ["chittyrouter", "chittyschema"] }
  },

  // ChittyOS Internal
  chittyos: {
    id_service: { secret: "CHITTY_ID_TOKEN", services: ["all"] }
  },

  // Version Control
  vcs: {
    github: { secret: "GITHUB_TOKEN", services: ["session-sync", "chittychat"] }
  }
};
```

### Phase 2: Centralize Access (Short-term)

**Option A: Use Existing ChittyAuth**
Extend `auth.chitty.cc` to handle third-party key management:

```javascript
// New endpoints for ChittyAuth
POST /api/v1/keys/request
  → Request temporary access to third-party API key
  → Returns time-limited token, logs usage

GET /api/v1/keys/inventory
  → List all registered keys and their usage

POST /api/v1/keys/rotate
  → Trigger key rotation with zero-downtime
```

**Option B: New ChittyKey Service**
Create dedicated `key.chitty.cc` service:

```javascript
// src/services/chittykey/
export class ChittyKeyService {
  async requestKey(serviceId, keyType, chittyId) {
    // 1. Validate service via ChittyAuth
    // 2. Check authorization via ChittyID
    // 3. Return time-limited key from vault
    // 4. Log access for audit
  }

  async rotateKey(keyId, newValue) {
    // 1. Update key in vault
    // 2. Notify all consumers
    // 3. Grace period for old key
    // 4. Revoke old key
  }
}
```

### Phase 3: Automated Rotation (Long-term)

**Key Rotation Pipeline**:
```
1. ChittyKey detects key age > 90 days
2. Generates new key in third-party service
3. Updates vault with new key
4. Notifies consumers via ChittyBeacon
5. Grace period: both keys work
6. Revoke old key after grace period
7. Audit log to ChittyChain
```

---

## 5. Integration with ChittyAuth

### Current ChittyAuth Capabilities

From `src/utils/chittyos-security-integration.js`:

```javascript
async authenticateWithChittyAuth() {
  const authRequest = {
    chittyId: this.chittyId,
    workerName: this.workerName,
    requestedScopes: ['routing', 'ai', 'sync']
  };

  const response = await fetch(`${CHITTYOS_SERVICES.auth}/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authRequest)
  });

  this.authToken = response.token;
  this.authenticated = true;
}
```

**ChittyAuth Already Handles**:
- ✅ OAuth 2.0 flows
- ✅ JWT token generation
- ✅ MCP Portal integration
- ✅ Service-to-service authentication

**Extend for Key Management**:
```javascript
// Add to ChittyAuth
async requestAPIKey(thirdPartyService, scope) {
  // 1. Verify caller's ChittyID
  // 2. Check authorization for requested service
  // 3. Fetch key from vault
  // 4. Return time-limited access token
  // 5. Log usage
}
```

---

## 6. Migration Plan

### Step 1: Audit (Week 1)
- [ ] Run `wrangler secret list` on all workers
- [ ] Document all third-party keys
- [ ] Map key → service dependencies
- [ ] Identify keys shared across services

### Step 2: Centralize Inventory (Week 2)
- [ ] Create `KEY_INVENTORY` constant
- [ ] Add key documentation to each service's CLAUDE.md
- [ ] Create key rotation runbook

### Step 3: Prototype ChittyKey (Week 3-4)
- [ ] Design ChittyKey service API
- [ ] Implement KV-backed key vault
- [ ] Add encryption layer (AES-256-GCM)
- [ ] Integrate with ChittyAuth for authorization

### Step 4: Migrate Services (Week 5-6)
- [ ] Migrate ChittyRouter to use ChittyKey
- [ ] Migrate ChittyChat
- [ ] Migrate remaining services
- [ ] Verify no direct secret access

### Step 5: Automation (Week 7-8)
- [ ] Implement automatic rotation
- [ ] Add usage monitoring
- [ ] Create alert rules
- [ ] Document incident response

---

## 7. Security Considerations

### Current Risks

**❌ Decentralized Management**:
- No visibility into key usage across services
- Manual rotation = keys rarely rotated
- Key compromise affects multiple services
- No automated expiration

**❌ No Access Control**:
- Any code in worker can access `env.SECRET_NAME`
- No fine-grained permissions
- No temporary access tokens

**✅ Current Protections**:
- Keys stored in Cloudflare's encrypted secret storage
- Not in git repositories
- Environment-specific (staging vs production)

### Hardened Architecture

**With ChittyKey Service**:
```
1. Service requests key via ChittyAuth token
2. ChittyKey validates authorization
3. Returns time-limited access token (not raw key)
4. Token expires after configurable TTL
5. All access logged to audit trail
6. Anomaly detection triggers alerts
```

**Zero-Trust Principles**:
- Never store raw keys in consuming services
- Always use time-limited access tokens
- Authenticate every request
- Log everything
- Assume breach (defense in depth)

---

## 8. Recommendations Summary

### Immediate Actions

1. **DO NOT** add key generation to ChittyRouter
   - Violates single responsibility
   - Increases attack surface
   - Complicates already complex codebase

2. **DO** create centralized key inventory
   - Document all existing keys
   - Map service dependencies
   - Identify rotation needs

3. **DO** leverage existing ChittyAuth
   - Extend with key management endpoints
   - Use existing ChittyID integration
   - Maintain consistent auth model

### Long-Term Vision

**ChittyKey Service** (`key.chitty.cc`):
- Centralized third-party API key management
- Automated rotation policies
- Usage tracking & auditing
- Integration with ChittyAuth
- Zero-trust access model

**ChittyID Pipeline** (already correct):
- ✅ Centralized at `id.chitty.cc`
- ✅ All services use official client
- ✅ ChittyCheck enforces compliance
- ✅ No local generation

---

## 9. Next Steps

**For ChittyRouter Refactoring** (current work):
- ✅ Continue code quality improvements
- ✅ Extract Durable Objects from index.js
- ⏸️ Do NOT add key management responsibilities

**For Key Management** (new workstream):
1. Create `KEY_INVENTORY.md` documenting all secrets
2. Design ChittyKey service API specification
3. Prototype key vault with Cloudflare KV
4. Plan migration from direct secret access to ChittyKey

**For ChittyID Pipeline** (working correctly):
- ✅ Keep using `id.chitty.cc` for all minting
- ✅ Continue Phase 1 runtime minting (session IDs complete)
- 🔄 Extend to remaining local generation patterns

---

## Appendix A: Key Inventory Template

```markdown
# ChittyRouter Key Inventory

## AI Services
- **OPENAI_API_KEY**: OpenAI API access
  - Used by: ChittyRouter (intelligent routing)
  - Rotation: Manual, last rotated: Unknown
  - Cost: $X/month

- **ANTHROPIC_API_KEY**: Claude API access
  - Used by: ChittyRouter (AI analysis)
  - Rotation: Manual

## Databases
- **NEON_DATABASE_URL**: PostgreSQL connection
  - Used by: ChittyRouter, ChittySchema
  - Contains: host, username, password, database

## ChittyOS Internal
- **CHITTY_ID_TOKEN**: ChittyID authority access
  - Used by: All services
  - Critical: Yes
  - Rotation: Via id.chitty.cc admin
```

## Appendix B: ChittyKey API Specification (Draft)

```typescript
// GET /api/v1/keys/request
interface KeyRequest {
  serviceId: string;        // "chittyrouter"
  keyType: string;          // "openai_api_key"
  chittyId: string;         // Service ChittyID
  authToken: string;        // ChittyAuth JWT
  ttl?: number;             // Optional TTL in seconds (default: 3600)
}

interface KeyResponse {
  accessToken: string;      // Time-limited token (not raw key!)
  expiresAt: string;        // ISO timestamp
  keyId: string;            // For rotation tracking
  usage: KeyUsageInfo;
}

// POST /api/v1/keys/rotate
interface KeyRotation {
  keyId: string;
  newValue: string;         // New key from third-party
  gracePeriod: number;      // Seconds both keys valid
}
```

---

**Document Status**: Draft for Review
**Author**: AI Architecture Analysis
**Review Required By**: ChittyOS Platform Team
