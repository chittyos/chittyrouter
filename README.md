# ChittyRouter - Persistent AI Agents Platform

**Production URL**: https://router.chitty.cc

Intelligent AI agents with memory, learning, and self-healing capabilities deployed on Cloudflare Workers.

## 🚀 New: Persistent AI Agents ✅ DEPLOYED

Persistent agents with memory, learning, and self-healing capabilities deployed to production.

- ✅ **4-Tier Memory System**: KV + Vectorize + R2 + Durable Objects
- ✅ **Learning Engine**: Agents improve with each interaction
- ✅ **Self-Healing**: Automatic fallback chains
- ✅ **Cost Optimization**: Workers AI free tier for simple tasks
- ✅ **Production Live**: https://router.chitty.cc/platform/agents/

### Quick Start

```bash
curl -X POST 'https://router.chitty.cc/platform/agents/my-agent/complete' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Your task","taskType":"email_routing"}'
```

### Agent Documentation
- **[Architecture](PERSISTENT_AGENTS_ARCHITECTURE.md)** - Complete system design
- **[Integration Guide](INTEGRATION_GUIDE.md)** - How to use agents
- **[Deployment Summary](DEPLOYMENT_SUMMARY.md)** - Infrastructure details

## 📚 Other Documentation
- **[Growth Loop Analytics](./GROWTH_LOOPS.md)** - Email worker feedback loops
- **[AI Gateway Setup](AI_GATEWAY_SETUP.md)** - Gateway configuration

## Consolidated Services
1. **chittyos-platform-live** - Main platform with AI, Durable Objects, and KV
2. **chitty-bridge** - Bridge service
3. **cloudeto-cto-mcp** - CTO MCP service
4. **chittyconsultant** - Consultant service
5. **chittychain-migrated** - Chain service
6. **chitty-landing** - Landing page
7. **chitty-website** - Website (Pages)

## Architecture
- Single worker with path-based routing
- Shared KV namespaces and Durable Objects
- Workers AI integration
- Handles all 73 domains

## Deployment Options

### Email Worker (Production)
```bash
# Deploy email worker with AI and analytics
wrangler deploy --config wrangler-email.toml

# Monitor logs
wrangler tail chittyos-email-worker --format pretty

# Run tests
./tests/email-worker-suite.sh

# View analytics
wrangler kv key list --namespace-id=695c3bef12ca4c298c56630b51b94d9b --remote --prefix="email:"
```

### Option 1: Unified Worker (Recommended for simplicity)
```bash
# Install dependencies
npm install

# Deploy single worker handling all services
npm run deploy:production
```

### Option 2: Multi-Worker Architecture (Recommended for scale)
```bash
# Deploy gateway and all service workers
wrangler deploy --config wrangler.multi.toml

# For development
./scripts/dev-multi.sh
```

## Routes
- `/platform/*` - Platform services
- `/bridge/*` - Bridge API
- `/consultant/*` - Consultant tools
- `/chain/*` - Chain services
- `/cto/*` - CTO MCP
- `/health` - Health check endpoint

## Bindings Required
- 2 KV Namespaces (need to be created in ChittyCorp account)
- 3 Durable Objects (AIGatewayState, ChittyOSPlatformState, SyncState)
- Workers AI binding

## Migration Status
- [ ] Download actual worker code from client account
- [ ] Create KV namespaces in ChittyCorp
- [ ] Migrate KV data
- [ ] Deploy and test
- [ ] Update DNS records
- [ ] Delete workers from client account