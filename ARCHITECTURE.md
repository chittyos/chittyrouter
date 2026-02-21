# ChittyRouter Architecture Documentation

## Entry Point Architecture

ChittyRouter has multiple entry points for different runtime contexts. Understanding which entry point is used in which environment is critical for debugging and development.

### Production Entry Point (Cloudflare Workers)

**File:** `src/index-minimal.js`  
**Configured in:** `config/wrangler.toml` (line: `main = "src/index-minimal.js"`)  
**Runtime:** Cloudflare Workers  
**Status:** ✅ Active (Production)

This is the **canonical production entry point** deployed to Cloudflare Workers. It's an extremely lightweight 12-line wrapper that delegates all functionality to `unified-worker.js`.

```javascript
import UnifiedWorker from "./unified-worker.js";
export { SyncStateDurableObject, AIStateDO } from "./unified-worker.js";

export default {
  async fetch(request, env, ctx) {
    return await UnifiedWorker.fetch(request, env, ctx);
  }
};
```

**Why minimal?** This pattern allows hot-swapping the underlying implementation without changing the entry point, and keeps the top-level export clean and simple.

### Core Worker Implementation

**File:** `src/unified-worker.js`  
**Imported by:** `src/index-minimal.js`, `src/index-cloudflare.js`  
**Runtime:** Cloudflare Workers  
**Status:** ✅ Active (Production)

The `RouteMultiplexer` class in this file handles all production routing:
- AI routes (`/ai/route`, `/ai/process-email`, `/ai/orchestrate`)
- MCP routes (`/mcp/*`)
- Sync routes (`/sync/*`)
- Session routes (`/session/*`)
- Email monitoring (`/email/*`)
- Health & metrics (`/health`, `/metrics`)
- Cron jobs (DLQ processing, session reconciliation, inbox monitoring)

**Services initialized:**
- `ChittyRouterAI` - AI routing
- `EmailProcessor` - Email AI processing
- `AgentOrchestrator` - Multi-agent coordination
- `NotionAtomicFactsSync` - Notion synchronization
- `SessionSyncManager` - Session state management
- `UnifiedSyncOrchestrator` - Sync orchestration
- `SessionService` - Session API
- `MobileBridgeService` - Mobile integration
- `InboxMonitor` - Email monitoring

### Legacy Entry Point (Full-Featured)

**File:** `src/index-cloudflare.js`  
**Status:** ⚠️ Legacy (Not used in production, but functional)

This entry point provides backward compatibility and includes additional services not available in the minimal production build:

**Additional features:**
- `ChittyOSIntegration` - Full platform integration with Redis
- `PDXApiFactory` - AI DNA portability (Personal Data eXchange)
- `ChittyChatEndpoints` - Project synthesis and ChittyChat integration
- `ChittySecurityManager` - Enhanced security layer
- `ServiceDiscovery` - Dynamic service discovery

**Legacy routes (not in production):**
- `/chittychat/*` - ChittyChat project endpoints
- `/pdx/v1/*` - PDX AI DNA portability API
- `/integration/*` - ChittyOS integration endpoints

**Why it exists:** This entry point represents the full-featured version with all ChittyOS integrations. It's maintained for:
1. Development environments that need full features
2. Testing complete integration workflows
3. Gradual migration path if production needs these features

**To switch to this entry point:** Change `wrangler.toml`:
```toml
main = "src/index-cloudflare.js"
```

### Development Entry Point (Node.js)

**File:** `src/index.js`  
**Runtime:** Node.js (Express-style server)  
**Status:** 🔧 Development only

This entry point runs a local Node.js server for development without Cloudflare Workers. It uses Express-style routing and is useful for:
- Local development without Wrangler
- Integration testing with Node.js tooling
- Debugging with Node.js debuggers

**Not suitable for production:** Uses Node.js APIs that aren't available in Cloudflare Workers.

## Import Dependency Analysis

### Production Path Files (23 files)

Files imported from `src/index-minimal.js` → `src/unified-worker.js`:

**Core Services (11 files):**
- `src/unified-worker.js` - Route multiplexer
- `src/sync/notion-atomic-facts-sync.js` - Notion sync
- `src/sync/session-sync-manager.js` - Session management
- `src/sync/unified-sync-orchestrator.js` - Sync orchestration
- `src/ai/intelligent-router.js` - AI routing
- `src/ai/email-processor.js` - Email AI
- `src/ai/agent-orchestrator.js` - Agent coordination
- `src/services/session-service.js` - Session API
- `src/services/mobile-bridge.js` - Mobile bridge
- `src/email/inbox-monitor.js` - Email monitoring
- (Plus their dependencies: ~12 more utility files)

**Utilities & Dependencies:**
- `src/utils/service-discovery.js`
- `src/utils/telemetry.js`
- `src/utils/schema-validation.js`
- `src/utils/error-handling.js`
- `src/utils/chittyid-integration.js`
- `src/email/sender.js`
- `src/email/gmail-token-manager.js`
- And others...

### Non-Production Files (54 files)

Files that exist in the repository but are **not imported in production**:

#### Never Imported Anywhere
- `src/daemon/macos-file-daemon.js` - macOS-specific file daemon
- `src/pdx/dna-collection-middleware.js` - PDX middleware (orphaned)

#### Only Available via Legacy Entry (`index-cloudflare.js`)
- `src/integration/chittyos-integration.js` - Full ChittyOS integration
- `src/redis/redis-integration.js` - Redis caching & pub/sub
- `src/pdx/pdx-api.js` - PDX API endpoints
- `src/pdx/pdx-core.js` - PDX core functionality
- `src/api/chittychat-endpoints.js` - ChittyChat integration
- `src/synthesis/chittychat-project-synth.js` - Project synthesis

#### Other Unused Files
- Various storage providers
- Alternative routing implementations
- Legacy database layers
- Unused agent implementations

### Architectural Decision Needed

**Current State:** Production uses minimal build (23 files), but documentation references features only available in legacy build (77 files).

**Options:**

**Option A: Keep Minimal (Current)**
- ✅ Smaller bundle size
- ✅ Faster cold starts
- ✅ Simpler dependency graph
- ❌ Missing features (Redis, PDX, ChittyChat, full ChittyOS)
- ❌ Documentation doesn't match reality

**Option B: Switch to Full-Featured**
- ✅ All features available
- ✅ Documentation matches implementation
- ✅ Better ChittyOS integration
- ❌ Larger bundle
- ❌ More complex initialization
- ❌ More potential failure points

**Recommendation:** If you need the full features, switch to `index-cloudflare.js`. Otherwise, update documentation to reflect the minimal build's actual capabilities.

## Module Categories

### Core AI Services (Production)
Files that implement AI functionality in production:
- `src/ai/intelligent-router.js` - Smart routing with AI
- `src/ai/email-processor.js` - Email content analysis
- `src/ai/agent-orchestrator.js` - Multi-agent coordination

### Specialized AI Agents (Not in Production)
AI agents that exist but aren't used in the minimal build:
- `src/ai/triage-agent.js`
- `src/ai/priority-agent.js`
- `src/ai/response-agent.js`
- `src/ai/document-agent.js`

### Sync Services (Production)
- `src/sync/notion-atomic-facts-sync.js` - Active
- `src/sync/session-sync-manager.js` - Active
- `src/sync/unified-sync-orchestrator.js` - Active
- `src/sync/enhanced-session-sync.js` - Not used
- `src/sync/distributed-session-sync.js` - Not used
- `src/sync/hardened-sync-orchestrator.js` - Not used

### Email Services (Production)
- `src/email/inbox-monitor.js` - Active (monitoring)
- `src/email/sender.js` - Active (sending)
- `src/email/gmail-token-manager.js` - Active (OAuth)
- `src/email/cloudflare-email-handler.js` - Not used in current routing

### Integration Services (Legacy Only)
- `src/integration/chittyos-integration.js` - Full platform integration
- `src/api/chittychat-endpoints.js` - ChittyChat API
- `src/synthesis/chittychat-project-synth.js` - Project intelligence

### Platform Services (Legacy Only)
- `src/redis/redis-integration.js` - Caching & pub/sub
- `src/pdx/pdx-api.js` - AI DNA portability
- `src/pdx/pdx-core.js` - PDX core

### Utilities (Mostly Production)
- `src/utils/service-discovery.js` - ✅ Used
- `src/utils/telemetry.js` - ✅ Used
- `src/utils/schema-validation.js` - ✅ Used
- `src/utils/error-handling.js` - ✅ Used
- `src/utils/chittyid-integration.js` - ✅ Used
- `src/utils/chittybeacon-integration.js` - ⚠️ Unknown usage
- `src/utils/ai-model-config.js` - ⚠️ Check usage

### Minting Services (Legacy)
- `src/minting/hardened-minting-service.js` - Uses `node:crypto` (not Workers-compatible)
- `src/minting/verifiable-random-minting.js` - Uses `node:crypto` (not Workers-compatible)
- `src/minting/soft-hard-minting-integration.js` - Present, usage unknown

### ChittyID Validation
- `src/chittyid/chittyid-validator.js` - Uses `node:crypto` (legacy only)

## Cloudflare Workers Compatibility

### ✅ Production Path is Clean
The production entry point (`index-minimal.js` → `unified-worker.js`) and all its dependencies are **fully Cloudflare Workers compatible**:
- ✅ No `node:*` protocol imports
- ✅ No `fs`, `path`, `os`, `child_process` usage
- ✅ No `process.env` usage (uses `env` binding parameter)
- ✅ No `require()` in ESM context

### ⚠️ Legacy/Unused Files Have Compatibility Issues

**Files with `node:crypto` imports (not Workers-compatible):**
- `src/minting/hardened-minting-service.js:1` - `import crypto from 'node:crypto';`
- `src/minting/verifiable-random-minting.js:1` - `import crypto from 'node:crypto';`
- `src/chittyid/chittyid-validator.js:1` - `import crypto from "node:crypto";`

**Files with Node.js-specific APIs:**
- `src/daemon/macos-file-daemon.js:8` - `import { spawn, exec } from 'child_process';`
- `src/daemon/macos-file-daemon.js:10` - `import { readFile, stat } from 'fs/promises';`
- `src/daemon/macos-file-daemon.js:11` - `import path from 'path';`

**Files with `process.env` usage:**
- `src/daemon/macos-file-daemon.js` - Multiple uses (lines 33, 38, 44)
- `src/utils/chat-router.js:16` - Uses `process.env.CHITTYCHAT_API_KEY`

**Impact:** These compatibility issues only affect unused or legacy-only files. The production build is completely safe.

**If switching to legacy entry point:** These issues would need to be addressed:
1. Replace `node:crypto` with Cloudflare's `crypto` Web API
2. Remove or mock Node.js-specific file system operations
3. Replace `process.env` with `env` parameter

## Development Tools (Not for Production)

These files in the root directory are **standalone developer tools** and should not be deployed:

- `interactive-project-menu.js` - Interactive CLI menu for ChittyOS projects
- `project-cache.js` - Project cache manager
- `project-command.js` - `/project` command implementation
- `project-initializer.js` - Project initialization wizard
- `project-intelligence.js` - Advanced project intelligence
- `project-navigator.js` - Project navigation utilities
- `project-selector.js` - Project selection interface
- `setup-project-command.sh` - Setup script wrapper

**These files:**
- Have shebang (`#!/usr/bin/env node`) for direct execution
- Are not imported by any `src/` files
- Not referenced in `package.json` scripts
- Part of a larger ChittyOS developer workflow system
- Can be moved to `dev-tools/` directory or removed if not used

## Test Files in Root Directory

Several test files exist in the root directory (should be in `tests/`):

- `test-authorization.js`
- `test-chittyid-validation.js`
- `test-hardened-minting.js`
- `test-hardened-single.js`
- `test-production-session-sync.js`
- `test-service-discovery.js`
- `test-session-sync-complete.js`
- `test-session-sync-enhanced.js`
- `test-session-sync.js`
- `test-verifiable-randomness.js`

**Recommendation:** Move these to `tests/manual/` or integrate into the vitest suite.

## Verification Commands

```bash
# Check which entry point is configured
grep "^main = " wrangler.toml

# Trace imports from production entry
node trace-imports.js src/index-minimal.js

# Check for Node.js APIs in production path
grep -r "node:" src/unified-worker.js src/sync/ src/ai/ src/services/ src/email/

# List all entry points
ls -la src/index*.js src/unified-worker.js

# Run production build
npm run build

# Test production entry locally
npm run dev
```

## Summary

- **Production Entry:** `src/index-minimal.js` (12 lines) → `src/unified-worker.js` (RouteMultiplexer)
- **Production Files:** 23 out of 77 files (30%)
- **Unused Files:** 54 files (70%) - either legacy, development, or dead code
- **Compatibility:** Production path is fully Workers-compatible
- **Architecture Decision Needed:** Minimal build vs full-featured build

---

**Last Updated:** 2025-02-21  
**Analysis Method:** Recursive import tracing + manual code review  
**Production Entry Verified:** wrangler.toml line `main = "src/index-minimal.js"`
