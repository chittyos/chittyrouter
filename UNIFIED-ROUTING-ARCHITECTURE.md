# ChittyRouter - Unified Service Routing Architecture
**Version**: 2.1.0
**Last Updated**: October 3, 2025

---

## Executive Summary

ChittyRouter now serves as the **Unified Intelligent Routing Gateway** for ALL ChittyOS services. Instead of each service handling its own routing, ChittyRouter provides centralized, AI-powered routing with service discovery, health monitoring, and intelligent fallback mechanisms.

**Key Innovation**: One router, 20+ services, AI-powered decision making.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│            ChittyRouter (router.chitty.cc)          │
│                 Intelligent Gateway                  │
└─────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
    🔍 Service      🤖 AI-Powered    🔄 Service
    Discovery       Routing          Bindings
         │                │                │
         └────────────────┼────────────────┘
                          ▼
         ┌────────────────────────────────┐
         │   Route to Appropriate Service  │
         └────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
    📋 ChittyChat   🆔 ChittyID    📊 ChittySchema
    (Platform)      (Identity)     (Data)

    + 17 more services...
```

---

## Routing Strategy (3-Tier)

### 1. Hostname-Based Routing (Primary)
**Most Specific** - Routes based on subdomain

```javascript
id.chitty.cc        → ChittyID Service
auth.chitty.cc      → ChittyAuth
schema.chitty.cc    → ChittySchema
registry.chitty.cc  → ChittyRegistry
```

### 2. Path-Based Routing (Secondary)
**Pattern Matching** - Routes based on URL path

```javascript
/api/v1/*           → API Gateway (ChittyChat)
/schema/*           → ChittySchema
/litigation/*       → Litigation Router
/oauth/*            → ChittyAuth
```

### 3. AI-Powered Routing (Fallback)
**Intelligent Analysis** - Uses Llama 4 to determine routing for ambiguous requests

```javascript
// Example: AI analyzes request context
const context = {
  hostname: "chitty.cc",
  pathname: "/verify/entity/12345",
  method: "POST"
};

// AI determines: "verify" service
// Routes to: verify.chitty.cc
```

---

## Supported Services (20+)

### Core Platform
| Service | Domain | Worker | Description |
|---------|--------|--------|-------------|
| **gateway** | gateway.chitty.cc | chittyos-platform-prod | Unified platform entry |
| **router** | router.chitty.cc | chittyrouter | Intelligent routing gateway |

### Identity & Auth
| Service | Domain | Worker | Description |
|---------|--------|--------|-------------|
| **id** | id.chitty.cc | chittyid-service | ChittyID central authority |
| **auth** | auth.chitty.cc | chittyauth | Authentication & OAuth |

### Data & Schema
| Service | Domain | Worker | Description |
|---------|--------|--------|-------------|
| **schema** | schema.chitty.cc | chittyschema | Universal data framework |
| **canon** | canon.chitty.cc | chittycanon | Canonical data management |
| **sync** | sync.chitty.cc | chittychat | Data synchronization |

### Service Discovery
| Service | Domain | Worker | Description |
|---------|--------|--------|-------------|
| **registry** | registry.chitty.cc | chittyregistry | Service discovery & health |

### AI Services
| Service | Domain | Worker | Description |
|---------|--------|--------|-------------|
| **ai** | ai.chitty.cc | chittychat | AI gateway & embeddings |
| **langchain** | langchain.chitty.cc | chittychat | LangChain orchestration |
| **mcp** | mcp.chitty.cc | chittymcp | Model Context Protocol |

### Application Services
| Service | Domain | Worker | Description |
|---------|--------|--------|-------------|
| **cases** | cases.chitty.cc | chittychat | Legal case management |
| **chat** | chat.chitty.cc | chittychat | Real-time messaging |
| **beacon** | beacon.chitty.cc | chittychat | Monitoring & analytics |
| **email** | email.chitty.cc | chittyrouter | Email routing |

### Verification & Trust
| Service | Domain | Worker | Description |
|---------|--------|--------|-------------|
| **verify** | verify.chitty.cc | chittyverify | Data verification |
| **certify** | certify.chitty.cc | chittycertify | Service certification |

### Viewer & Portal
| Service | Domain | Worker | Description |
|---------|--------|--------|-------------|
| **viewer** | viewer.chitty.cc | chittychat | Immutable data viewer |
| **portal** | portal.chitty.cc | chittychat | MCP portal |
| **api** | api.chitty.cc | chittychat | REST API gateway |

---

## API Endpoints

### Router Management

**Health Check**:
```bash
GET https://router.chitty.cc/router/health

Response:
{
  "status": "healthy",
  "router": "chittyrouter-unified",
  "version": "2.1.0",
  "services": 20,
  "timestamp": "2025-10-03T23:30:00Z"
}
```

**Routing Statistics**:
```bash
GET https://router.chitty.cc/router/stats

Response:
{
  "totalServices": 20,
  "servicesByType": {
    "core": 5,
    "ai": 3,
    "data": 3,
    "apps": 4
  },
  "services": { ... }
}
```

### Service Routing

**Direct Service Access**:
```bash
# Routes to ChittyID
GET https://id.chitty.cc/v1/validate/CHITTY-PEO-12345-ABC

# Routes to ChittySchema
POST https://schema.chitty.cc/api/v1/evidence
Content-Type: application/json

# Routes to ChittyAuth
POST https://auth.chitty.cc/oauth/authorize
```

**Path-Based Routing**:
```bash
# Routes to litigation service
POST https://router.chitty.cc/litigation/evidence/ingest

# Routes to ChittySchema
GET https://router.chitty.cc/schema/health
```

---

## Implementation Details

### UnifiedServiceRouter Class

**Location**: `src/routing/unified-service-router.js`

**Key Methods**:

1. **route(request)** - Main routing logic
   ```javascript
   const router = new UnifiedServiceRouter(env);
   const response = await router.route(request);
   ```

2. **findServiceByHostname(hostname)** - Hostname matching
   ```javascript
   const service = router.findServiceByHostname('id.chitty.cc');
   // Returns: { domain: 'id.chitty.cc', worker: 'chittyid-service', ... }
   ```

3. **findServiceByPath(pathname)** - Path pattern matching
   ```javascript
   const service = router.findServiceByPath('/api/v1/cases');
   // Returns: { domain: 'api.chitty.cc', worker: 'chittychat', ... }
   ```

4. **intelligentRoute(request)** - AI-powered routing
   ```javascript
   const service = await router.intelligentRoute(request);
   // Uses Llama 4 to analyze request and determine service
   ```

5. **forwardToService(request, service)** - Service forwarding
   - Uses service bindings when available
   - Falls back to HTTP fetch
   - Handles self-routing for ChittyRouter services

---

## Service Bindings

**Cloudflare Worker Bindings** (when available):

```toml
# wrangler.toml
[[services]]
binding = "PLATFORM_SERVICE"
service = "chittyos-platform-prod"

[[services]]
binding = "AUTH_SERVICE"
service = "chittyauth"

[[services]]
binding = "SCHEMA_SERVICE"
service = "chittyschema"

[[services]]
binding = "REGISTRY_SERVICE"
service = "chittyregistry"

[[services]]
binding = "ID_SERVICE"
service = "chittyid-service"

[[services]]
binding = "MCP_SERVICE"
service = "chittymcp"
```

**Fallback Mechanism**: If service binding not available, uses HTTP fetch to service domain.

---

## AI-Powered Routing

### How It Works

1. **Request Analysis**: AI examines hostname, pathname, method, and headers
2. **Service Matching**: AI compares against available service descriptions
3. **Decision**: AI responds with service key (e.g., "auth", "schema", "cases")
4. **Routing**: Request forwarded to identified service

### Example AI Prompt

```
Analyze this HTTP request and determine which ChittyOS service should handle it:

Request Context:
{
  "hostname": "chitty.cc",
  "pathname": "/verify/entity/12345",
  "method": "POST",
  "headers": { "content-type": "application/json" }
}

Available Services:
- id: ChittyID central authority (id.chitty.cc)
- auth: Authentication & OAuth (auth.chitty.cc)
- verify: Data verification (verify.chitty.cc)
- ...

Respond with ONLY the service key (e.g., "verify").
```

**AI Model**: `@cf/meta/llama-4-scout-17b-16e-instruct`
**Max Tokens**: 50
**Confidence**: High for clear patterns, fallback to gateway for ambiguous

---

## Routing Flow Diagram

```
┌─────────────────────────────────────┐
│  Incoming Request to router.chitty.cc│
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  1. Check if /router/health or      │
│     /router/stats (internal)        │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  2. Try Hostname-Based Routing      │
│     (id.chitty.cc → ChittyID)       │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  3. Try Path-Based Routing          │
│     (/api/* → API Gateway)          │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  4. Try AI-Powered Routing          │
│     (AI analyzes request)           │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  5. Fallback to Gateway             │
│     (gateway.chitty.cc)             │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Forward to Service Worker or       │
│  HTTP Fetch to Service Domain       │
└─────────────────────────────────────┘
```

---

## Benefits of Unified Routing

### 1. **Centralized Control**
- Single point for routing logic
- Consistent service discovery
- Unified health monitoring

### 2. **Intelligent Fallbacks**
- AI-powered routing for ambiguous requests
- Graceful degradation to HTTP fetch
- Service binding optimization

### 3. **Simplified Management**
- Add new services by updating registry
- No per-service routing configuration
- Automatic service discovery

### 4. **Performance Optimization**
- Service bindings reduce latency
- Smart caching of routing decisions
- Efficient hostname/path matching

### 5. **AI Enhancement**
- Context-aware routing decisions
- Natural language service discovery
- Adaptive routing based on patterns

---

## Configuration

### Adding a New Service

1. **Update Service Registry** in `unified-service-router.js`:

```javascript
const CHITTYOS_SERVICES = {
  // ... existing services

  newservice: {
    domain: 'newservice.chitty.cc',
    worker: 'newservice-worker',
    description: 'Description of new service',
    routes: ['/new/*', '/service/*']
  }
};
```

2. **Add Service Binding** (optional) in `wrangler.toml`:

```toml
[[services]]
binding = "NEWSERVICE_SERVICE"
service = "newservice-worker"
```

3. **Update Binding Map** in router:

```javascript
getServiceBinding(workerName) {
  const bindings = {
    // ... existing bindings
    'newservice-worker': 'NEWSERVICE_SERVICE'
  };
  return bindings[workerName] || null;
}
```

---

## Testing

### Local Development

```bash
# Start ChittyRouter dev server
npm run dev

# Test routing
curl http://localhost:8787/router/health
curl http://localhost:8787/router/stats
```

### Service-Specific Testing

```bash
# Test ID service routing
curl -H "Host: id.chitty.cc" http://localhost:8787/health

# Test schema service routing
curl -H "Host: schema.chitty.cc" http://localhost:8787/api/v1/health

# Test path-based routing
curl http://localhost:8787/litigation/health
```

### AI Routing Testing

```bash
# Test ambiguous request (should use AI)
curl -X POST http://localhost:8787/process/entity \
  -H "Content-Type: application/json" \
  -d '{"id": "12345", "type": "verification"}'
```

---

## Deployment

### Production Deployment

```bash
# Deploy to production
npm run deploy:production

# Verify deployment
curl https://router.chitty.cc/router/health
```

### DNS Configuration

All `*.chitty.cc` domains should point to `router.chitty.cc`:

```
id.chitty.cc       → CNAME router.chitty.cc
auth.chitty.cc     → CNAME router.chitty.cc
schema.chitty.cc   → CNAME router.chitty.cc
...
```

Or configure direct routes in `wrangler.toml`:

```toml
[[routes]]
pattern = "*.chitty.cc/*"
zone_name = "chitty.cc"
```

---

## Monitoring & Analytics

### Health Monitoring

```bash
# Router health
GET /router/health

# Service statistics
GET /router/stats

# Individual service health (via routing)
GET https://id.chitty.cc/health
GET https://schema.chitty.cc/health
```

### Analytics

- Request count per service
- Routing method distribution (hostname/path/AI)
- AI routing success rate
- Service response times
- Error rates per service

---

## Future Enhancements

1. **Service Registry Integration**: Dynamic service discovery from `registry.chitty.cc`
2. **Load Balancing**: Distribute requests across multiple instances
3. **Circuit Breaker**: Automatic failover for unhealthy services
4. **Request Caching**: Cache routing decisions for performance
5. **Advanced AI**: Multi-model routing with confidence scoring
6. **Traffic Shaping**: Rate limiting and quota management per service
7. **A/B Testing**: Route percentage of traffic to service variants

---

## Architecture Decisions

### Why Unified Routing?

**Before**:
- Each service handled own routing
- Duplicate routing logic across services
- Difficult to manage routing changes
- No centralized monitoring

**After**:
- Single routing gateway
- Consistent routing logic
- Easy service addition/removal
- Centralized health monitoring
- AI-powered intelligence

### Why AI-Powered Routing?

- **Flexibility**: Handles ambiguous or new request patterns
- **Adaptability**: Learns from context rather than hard-coded rules
- **Resilience**: Provides intelligent fallback when pattern matching fails
- **Future-proof**: Can adapt to new services without code changes

---

## Summary

ChittyRouter is now the **Unified Intelligent Routing Gateway** for the entire ChittyOS ecosystem:

✅ **20+ Services** - All routed through single gateway
✅ **3-Tier Routing** - Hostname → Path → AI
✅ **Service Bindings** - Optimized performance when available
✅ **HTTP Fallback** - Resilient cross-worker communication
✅ **AI Enhancement** - Llama 4 powered intelligent decisions
✅ **Centralized Control** - Single point for routing management

**Result**: Simplified architecture, improved performance, intelligent routing decisions.

---

**Document Version**: 1.0
**Created**: October 3, 2025
**ChittyRouter Version**: 2.1.0
**Author**: ChittyOS Platform Team
