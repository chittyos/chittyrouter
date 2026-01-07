# ChittyOS Ultimate Worker

## Overview
Flexible Cloudflare Worker architecture supporting both:
1. **Unified Worker** - Single worker handling all services
2. **Multi-Worker with Gateway** - Separate workers with service bindings

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