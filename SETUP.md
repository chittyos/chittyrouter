# ChittyOS Unified Worker Setup Guide

## Prerequisites
- Cloudflare account with Workers enabled
- Neon account for database
- Node.js 16+ installed
- Wrangler CLI installed

## Quick Start

### 1. Clone and Install
```bash
git clone https://github.com/chittyos/chitty-ultimate-worker
cd chitty-ultimate-worker
npm install
```

### 2. Configure Accounts
```bash
# Login to Cloudflare
wrangler login

# Switch to ChittyCorp account
# Account ID: 0bc21e3a5a9de1a4cc843be9c3e98121
```

### 3. Set Up Database

#### Option A: Hyperdrive + Neon (Recommended)
1. Create Neon database at https://neon.tech
2. Get your connection string
3. Create Hyperdrive:
```bash
wrangler hyperdrive create chittyos-db \
  --connection-string "postgresql://user:pass@endpoint.neon.tech/db"
```
4. Update `wrangler.toml` with Hyperdrive ID

#### Option B: Direct Neon Connection
1. Create Neon database
2. Add connection string as secret:
```bash
wrangler secret put NEON_DATABASE_URL
```

### 4. Configure Secrets

Run the automated setup:
```bash
./scripts/setup-secrets.sh
```

Or manually add secrets:
```bash
# Required
wrangler secret put NEON_DATABASE_URL
wrangler secret put CF_API_TOKEN

# Optional (based on features used)
wrangler secret put OPENAI_API_KEY
wrangler secret put AUTH_SECRET
```

### 5. Local Development
```bash
# Copy example vars
cp .dev.vars.example .dev.vars

# Edit .dev.vars with your values
nano .dev.vars

# Run locally
npm run dev
```

### 6. Deploy

#### To staging:
```bash
npm run deploy
```

#### To production:
```bash
npm run deploy:production
```

## Service Endpoints

- `/` - Landing page
- `/health` - Health check
- `/platform/*` - Platform services
- `/bridge/*` - Bridge API
- `/consultant/*` - Consultant tools
- `/chain/*` - Chain services
- `/cto/*` - CTO MCP
- `/analytics` - Analytics dashboard
- `/api/*` - API services
- `/db/*` - Database operations

## Enabling Additional Services

Edit `wrangler.toml` and uncomment the services you need:

- **AI**: Uncomment `[ai]` section
- **Vectorize**: Uncomment `[[vectorize]]` section
- **D1**: Uncomment `[[d1_databases]]` section
- **R2**: Uncomment `[[r2_buckets]]` section
- **Queues**: Uncomment `[[queues]]` section
- **Email**: Uncomment `[send_email]` section

## Troubleshooting

### Secret not found error
```bash
wrangler secret list  # Check available secrets
wrangler secret put SECRET_NAME  # Add missing secret
```

### Database connection issues
- Verify Neon database is active
- Check Hyperdrive configuration
- Ensure connection string is correct

### Deployment fails
- Check account limits (100 workers max)
- Verify all required bindings exist
- Check `wrangler tail` for runtime errors

## GitHub Integration

This repo is configured for Cloudflare Pages/Workers CI/CD:

1. Connect repo in Cloudflare dashboard
2. Set build command: `npm install`
3. Set build output: `/`
4. Add environment variables in dashboard

## Support

- Documentation: https://developers.cloudflare.com/workers/
- Neon Docs: https://neon.tech/docs
- Issues: https://github.com/chittyos/chitty-ultimate-worker/issues