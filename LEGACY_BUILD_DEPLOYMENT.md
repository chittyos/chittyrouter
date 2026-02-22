# Legacy Build Deployment Guide

## Overview

This document describes the deployment of features from the legacy build (77 files) to ChittyRouter AI Gateway. The legacy build includes comprehensive ChittyOS platform integration that was not available in the minimal build.

## What Changed

### Entry Point Switch

**Before (Minimal Build):**
- Entry: `src/index-minimal.js` → `src/unified-worker.js`
- Files Active: 23 (30%)
- Features: Core AI routing, session sync, email monitoring

**After (Legacy Build):**
- Entry: `src/index-cloudflare.js` (delegates to `src/unified-worker.js` for core routes)
- Files Active: 46+ (60%)
- Features: All minimal features PLUS full ChittyOS integration

### New Features Enabled

#### 1. ChittyOS Platform Integration
- **File**: `src/integration/chittyos-integration.js`
- **Services**: 34+ ChittyOS services (Score, Trust, Verify, Auth, Books, Finance)
- **Endpoints**: `/integration/status`, `/integration/service`

#### 2. PDX API (AI DNA Portability)
- **Files**: `src/pdx/pdx-api.js`, `src/pdx/pdx-core.js`
- **Version**: v1.0
- **Endpoints**: 
  - `POST /pdx/v1/export` - Export AI DNA
  - `POST /pdx/v1/import` - Import AI DNA
  - `POST /pdx/v1/verify` - Verify AI DNA
  - `POST /pdx/v1/revoke` - Revoke AI DNA
  - `GET /pdx/v1/status` - PDX status

#### 3. ChittyChat Integration
- **Files**: `src/api/chittychat-endpoints.js`, `src/synthesis/chittychat-project-synth.js`
- **Endpoints**:
  - `POST /chittychat/sync` - Project sync
  - `POST /chittychat/webhook` - Webhook handler
  - `GET /chittychat/metrics` - Metrics

#### 4. Service Discovery
- **File**: `src/utils/service-discovery.js`
- **Capability**: Dynamic routing to 34+ ChittyOS services
- **Endpoint**: `GET /discovery/status`

#### 5. Enhanced Security
- **File**: `src/utils/chittyos-security-integration.js`
- **Features**: Multi-layer authentication, ChittyID validation

#### 6. Registry Integration
- **File**: `src/utils/registry.js`
- **Capability**: Service registration with ChittyBeacon

#### 7. Specialized AI Agents
- **Files**: 
  - `src/ai/triage-agent.js` - Email classification
  - `src/ai/priority-agent.js` - Urgency assessment
  - `src/ai/response-agent.js` - Automated responses
  - `src/ai/document-agent.js` - Attachment analysis

#### 8. Email Worker
- **File**: `src/email/cloudflare-email-handler.js`
- **Capability**: Cloudflare Email API integration via `async email()` handler

#### 9. Redis Integration (Optional)
- **File**: `src/redis/redis-integration.js`
- **Features**: Distributed caching, pub/sub
- **Status**: Configurable (REDIS_ENABLED=false by default)

## Configuration Changes

### wrangler.toml

#### Entry Point
```toml
main = "src/index-cloudflare.js"  # Changed from index-minimal.js
```

#### New Environment Variables

**Development/Staging/Production:**
```toml
# ChittyOS Integration
CHITTYOS_ENDPOINT = "https://chittyos.com"
CHITTYCHAT_API = "https://chittychat.api.com"
CHITTYID_ENDPOINT = "https://id.chitty.cc"
CHITTYBEACON_URL = "https://beacon.chitty.cc"
EVIDENCE_VAULT_URL = "https://evidence.chitty.cc"
REGISTRY_URL = "https://registry.chitty.cc"

# PDX API
PDX_API_VERSION = "v1.0"
PDX_ENABLED = "true"

# Redis (Optional)
REDIS_ENABLED = "false"
REDIS_HOST = ""
REDIS_PORT = "6379"
```

### Secrets (via `wrangler secret put`)

The following secrets should be set for full functionality:

```bash
# Required for ChittyChat notifications
wrangler secret put CHITTYCHAT_API_KEY

# Required for PDX operations
wrangler secret put PDX_API_KEY

# Required for service authentication
wrangler secret put CHITTYOS_API_KEY

# Optional for Redis
wrangler secret put REDIS_PASSWORD
```

## Compatibility Fixes

### Fixed Issues

1. **chat-router.js** - Removed `process.env` usage
   - **Before**: `process.env.CHITTYCHAT_API_KEY`
   - **After**: `env.CHITTYCHAT_API_KEY` with fallback handling

### Known Limitations

These files use Node.js-specific APIs and are NOT used in the legacy build:

- `src/minting/hardened-minting-service.js` - Uses `node:crypto`
- `src/minting/verifiable-random-minting.js` - Uses `node:crypto`
- `src/chittyid/chittyid-validator.js` - Uses `node:crypto`
- `src/daemon/macos-file-daemon.js` - Uses `child_process`, `fs`, `path`

These files remain unused and do not affect production.

## Deployment Steps

### 1. Local Testing

```bash
# Install dependencies
npm install

# Test with wrangler dev
npm run dev

# Test specific endpoints
curl http://localhost:8787/health
curl http://localhost:8787/integration/status
curl http://localhost:8787/discovery/status
```

### 2. Deploy to Staging

```bash
# Set secrets
wrangler secret put CHITTYCHAT_API_KEY --env staging
wrangler secret put PDX_API_KEY --env staging
wrangler secret put CHITTYOS_API_KEY --env staging

# Deploy
npm run deploy:staging

# Verify
curl https://staging.router.chitty.cc/health
curl https://staging.router.chitty.cc/integration/status
```

### 3. Deploy to Production

```bash
# Set secrets
wrangler secret put CHITTYCHAT_API_KEY --env production
wrangler secret put PDX_API_KEY --env production
wrangler secret put CHITTYOS_API_KEY --env production

# Deploy
npm run deploy:production

# Verify
curl https://router.chitty.cc/health
curl https://router.chitty.cc/integration/status
```

## API Endpoints

### New Endpoints (Legacy Build Only)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/process` | POST | AI-powered email processing (legacy route) |
| `/agents` | POST | AI agent orchestration |
| `/chittychat/*` | POST | ChittyChat integration |
| `/pdx/v1/*` | POST/GET | PDX AI DNA portability |
| `/integration/service` | POST | Service routing via discovery |
| `/integration/status` | GET | ChittyOS integration status |
| `/discovery/status` | GET | Service discovery status |

### Existing Endpoints (From Minimal Build)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Comprehensive health check |
| `/metrics` | GET | System metrics |
| `/ai/route` | POST | AI routing |
| `/ai/process-email` | POST | Email processing |
| `/ai/orchestrate` | POST | Agent orchestration |
| `/sync/*` | POST | Sync operations |
| `/session/*` | POST/GET | Session management |
| `/mcp/*` | GET/POST | Model Context Protocol |
| `/email/*` | GET/POST | Email monitoring |

## Routing Architecture

The legacy build uses a **hybrid routing model**:

```
Request → index-cloudflare.js
  ├─ /mcp/* → UnifiedWorker (core)
  ├─ /session/* → UnifiedWorker (core)
  ├─ /mobile/* → UnifiedWorker (core)
  ├─ /chittychat/* → handleChittyChatRequest (legacy)
  ├─ /pdx/* → PDXApiFactory (legacy)
  ├─ /integration/* → ChittyOSIntegration (legacy)
  ├─ /discovery/* → ServiceDiscovery (legacy)
  └─ Legacy routes (/process, /agents, /health)
```

This preserves backward compatibility while enabling new features.

## Health Check Response

The `/health` endpoint now returns comprehensive status:

```json
{
  "service": "ChittyRouter AI Gateway",
  "version": "2.1.0-ai",
  "status": "healthy",
  "timestamp": "2026-02-22T08:30:00.000Z",
  "ai": {
    "status": "healthy",
    "model": "@cf/meta/llama-3.1-8b-instruct"
  },
  "integration": {
    "overall_health": "healthy",
    "services": ["ChittyScore", "ChittyTrust", "..."],
    "active_connections": 34
  },
  "serviceDiscovery": {
    "status": "active",
    "discovered_services": 34,
    "beacon_url": "https://beacon.chitty.cc"
  },
  "capabilities": [
    "intelligent-email-routing",
    "ai-powered-triage",
    "automated-responses",
    "document-analysis",
    "priority-classification",
    "agent-orchestration",
    "service-discovery",
    "pdx-dna-portability",
    "registry-integration"
  ]
}
```

## Testing

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

### End-to-End Test

```bash
# Test ChittyOS integration
curl -X POST https://router.chitty.cc/integration/service \
  -H "Content-Type: application/json" \
  -d '{"capability": "identity", "operation": "validate", "data": {...}}'

# Test PDX export
curl -X POST https://router.chitty.cc/pdx/v1/export \
  -H "Authorization: Bearer $PDX_API_KEY" \
  -d '{"chittyId": "CHITTY-...", "scope": "full"}'

# Test ChittyChat sync
curl -X POST https://router.chitty.cc/chittychat/sync \
  -H "Authorization: Bearer $CHITTYCHAT_API_KEY" \
  -d '{"projectId": "...", "data": {...}}'
```

## Monitoring

### Key Metrics

- **Cold Start Time**: 200-300ms (increased from 50-100ms in minimal build)
- **Bundle Size**: ~1.2MB (increased from ~500KB)
- **Memory Usage**: Higher due to additional services
- **Request Success Rate**: Monitor `/health` endpoint

### Logs

```bash
# Tail production logs
npm run tail --env production

# Filter for errors
wrangler tail --env production | grep ERROR

# Monitor specific routes
wrangler tail --env production | grep "POST /pdx"
```

## Rollback Plan

If issues arise, rollback to minimal build:

```bash
# 1. Edit wrangler.toml
# Change: main = "src/index-minimal.js"

# 2. Remove legacy environment variables (optional)

# 3. Deploy
npm run deploy:production

# 4. Verify
curl https://router.chitty.cc/health
```

## Performance Comparison

| Metric | Minimal Build | Legacy Build | Impact |
|--------|--------------|--------------|--------|
| Cold Start | 50-100ms | 200-300ms | +200% |
| Bundle Size | ~500KB | ~1.2MB | +140% |
| Files Active | 23 (30%) | 46+ (60%) | +100% |
| Features | Core | Full | Complete |
| Cost/Month | $5 | $15 | +200% |

## Support

For issues or questions:
- ChittyOS Documentation: https://docs.chitty.cc
- ChittyRouter GitHub: https://github.com/chittyos/chittyrouter
- ChittyBeacon Status: https://beacon.chitty.cc

---

**Last Updated**: 2026-02-22  
**Version**: 2.1.0-ai (Legacy Build)  
**Author**: ChittyOS Platform Team
