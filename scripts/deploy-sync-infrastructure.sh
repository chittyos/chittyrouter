#!/bin/bash

# ChittyRouter Sync Infrastructure Deployment Script
# Deploys the complete sync pipeline: Session, Notion, GitHub integration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-staging}
PROJECT_NAME="chittyrouter-ai"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}🚀 ChittyRouter Sync Infrastructure Deployment${NC}"
echo "=============================================="
echo "Environment: $ENVIRONMENT"
echo "Project: $PROJECT_NAME"
echo ""

# Pre-deployment checks
echo -e "${YELLOW}📋 Pre-deployment checks...${NC}"

# Check required tools
command -v wrangler >/dev/null 2>&1 || { echo -e "${RED}❌ wrangler CLI is required but not installed.${NC}" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}❌ Node.js is required but not installed.${NC}" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}❌ npm is required but not installed.${NC}" >&2; exit 1; }

# Check wrangler authentication
if ! wrangler whoami >/dev/null 2>&1; then
    echo -e "${RED}❌ Wrangler not authenticated. Run 'wrangler login' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Tools check passed${NC}"

# Check environment variables
echo -e "${YELLOW}🔐 Checking environment variables...${NC}"

# Required secrets (will be prompted if missing)
REQUIRED_SECRETS=(
    "NOTION_INTEGRATION_TOKEN"
    "GITHUB_TOKEN"
    "NOTION_DATABASE_ID_ATOMIC_FACTS"
)

MISSING_SECRETS=()

for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! wrangler secret list --env "$ENVIRONMENT" 2>/dev/null | grep -q "$secret"; then
        MISSING_SECRETS+=("$secret")
    fi
done

if [ ${#MISSING_SECRETS[@]} -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Missing required secrets:${NC}"
    for secret in "${MISSING_SECRETS[@]}"; do
        echo "  - $secret"
    done

    read -p "Do you want to set these secrets now? (y/n): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        for secret in "${MISSING_SECRETS[@]}"; do
            echo -e "${BLUE}Setting $secret...${NC}"
            read -s -p "Enter value for $secret: " SECRET_VALUE
            echo
            echo "$SECRET_VALUE" | wrangler secret put "$secret" --env "$ENVIRONMENT"
        done
    else
        echo -e "${RED}❌ Deployment cannot continue without required secrets.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Environment variables check passed${NC}"

# Build and test
echo -e "${YELLOW}🔨 Building project...${NC}"
cd "$ROOT_DIR"

# Install dependencies
npm ci

# Run tests
echo -e "${YELLOW}🧪 Running tests...${NC}"
npm run test:unit
npm run lint

echo -e "${GREEN}✅ Build and tests passed${NC}"

# Deploy Durable Objects first
echo -e "${YELLOW}☁️  Deploying Durable Objects...${NC}"

# Create a temporary wrangler.toml for Durable Objects
cat > "$ROOT_DIR/wrangler.do.toml" << EOF
name = "${PROJECT_NAME}-durable-objects"
main = "src/sync/durable-objects.js"
compatibility_date = "$(date +%Y-%m-%d)"
compatibility_flags = ["nodejs_compat"]

[[durable_objects.bindings]]
name = "SYNC_STATE"
class_name = "SyncStateDurableObject"

[env.${ENVIRONMENT}]
EOF

# Deploy Durable Objects
wrangler deploy --config wrangler.do.toml --env "$ENVIRONMENT"

# Clean up temporary file
rm "$ROOT_DIR/wrangler.do.toml"

echo -e "${GREEN}✅ Durable Objects deployed${NC}"

# Deploy main worker
echo -e "${YELLOW}☁️  Deploying main worker...${NC}"
wrangler deploy --env "$ENVIRONMENT"

echo -e "${GREEN}✅ Main worker deployed${NC}"

# Setup Notion database
echo -e "${YELLOW}📊 Setting up Notion database...${NC}"

# Check if setup script exists and run it
if [ -f "$ROOT_DIR/scripts/setup-notion-atomic-facts.js" ]; then
    # Set environment variables for the setup script
    export NOTION_INTEGRATION_TOKEN=$(wrangler secret list --env "$ENVIRONMENT" 2>/dev/null | grep NOTION_INTEGRATION_TOKEN || echo "")

    if [ -z "$NOTION_INTEGRATION_TOKEN" ]; then
        echo -e "${YELLOW}⚠️  NOTION_INTEGRATION_TOKEN not found. Skipping Notion setup.${NC}"
        echo "Run the setup script manually: node scripts/setup-notion-atomic-facts.js"
    else
        node "$ROOT_DIR/scripts/setup-notion-atomic-facts.js"
    fi
else
    echo -e "${YELLOW}⚠️  Notion setup script not found. Skipping Notion setup.${NC}"
fi

# Deploy cron triggers
echo -e "${YELLOW}⏰ Setting up cron triggers...${NC}"

# Cron triggers are defined in wrangler.toml and deployed automatically
echo -e "${GREEN}✅ Cron triggers configured${NC}"

# Setup monitoring
echo -e "${YELLOW}📈 Setting up monitoring...${NC}"

# Create analytics dashboard queries
cat > "$ROOT_DIR/analytics-queries.sql" << 'EOF'
-- ChittyRouter Sync Analytics Queries

-- Sync success rate by service
SELECT
    service,
    COUNT(*) as total_syncs,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_syncs,
    ROUND(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
FROM sync_events
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY service;

-- DLQ depth monitoring
SELECT
    service,
    COUNT(*) as dlq_items,
    MAX(timestamp) as last_failure
FROM dlq_events
WHERE processed = false
GROUP BY service;

-- Session sync performance
SELECT
    DATE_TRUNC('hour', timestamp) as hour,
    AVG(duration_ms) as avg_duration,
    P95(duration_ms) as p95_duration,
    COUNT(*) as sync_count
FROM session_sync_events
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour;
EOF

echo -e "${GREEN}✅ Analytics queries created${NC}"

# Health check
echo -e "${YELLOW}🏥 Running health checks...${NC}"

# Get worker URL
WORKER_URL=$(wrangler deployments list --env "$ENVIRONMENT" --format json | jq -r '.[0].url' 2>/dev/null || echo "")

if [ -z "$WORKER_URL" ]; then
    echo -e "${YELLOW}⚠️  Could not determine worker URL. Skipping health checks.${NC}"
else
    echo "Testing endpoints..."

    # Test sync status endpoint
    if curl -s -f "$WORKER_URL/sync/status" >/dev/null; then
        echo -e "${GREEN}✅ Sync status endpoint healthy${NC}"
    else
        echo -e "${RED}❌ Sync status endpoint unhealthy${NC}"
    fi

    # Test session endpoint
    if curl -s -f "$WORKER_URL/session/status" >/dev/null; then
        echo -e "${GREEN}✅ Session status endpoint healthy${NC}"
    else
        echo -e "${RED}❌ Session status endpoint unhealthy${NC}"
    fi
fi

# Deployment summary
echo ""
echo -e "${GREEN}🎉 Deployment Summary${NC}"
echo "===================="
echo "Environment: $ENVIRONMENT"
echo "Project: $PROJECT_NAME"
echo "Worker URL: ${WORKER_URL:-'Not available'}"
echo ""
echo "Sync Endpoints:"
echo "  - POST /sync/unified - Main sync pipeline"
echo "  - POST /sync/notion/atomic-facts - Notion sync"
echo "  - POST /session/init - Session initialization"
echo "  - GET /sync/status - Health check"
echo ""
echo "Monitoring:"
echo "  - Analytics queries: analytics-queries.sql"
echo "  - Cron jobs: DLQ processing, session reconciliation"
echo ""

# Next steps
echo -e "${BLUE}📝 Next Steps:${NC}"
echo "1. Set up custom domains for sync.chitty.cc and api.chitty.cc"
echo "2. Configure monitoring alerts in Cloudflare Dashboard"
echo "3. Test the sync pipeline with sample data"
echo "4. Review analytics queries and set up dashboards"
echo ""

# Test data option
read -p "Do you want to create test data to verify the deployment? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}🧪 Creating test data...${NC}"

    # Create test payload
    cat > "$ROOT_DIR/test-sync-payload.json" << 'EOF'
{
  "data": {
    "atomicFacts": [
      {
        "factId": "test-fact-001",
        "factType": "DATE",
        "factText": "Test deployment completed on test date",
        "classification": "FACT",
        "weight": 1.0,
        "parentArtifactId": "deployment-test",
        "verificationMethod": "Automated deployment test"
      }
    ]
  },
  "options": {
    "projectId": "chittyrouter",
    "validateOnly": true
  }
}
EOF

    if [ -n "$WORKER_URL" ]; then
        echo "Testing sync pipeline..."
        RESPONSE=$(curl -s -X POST "$WORKER_URL/sync/unified" \
            -H "Content-Type: application/json" \
            -d @"$ROOT_DIR/test-sync-payload.json")

        if echo "$RESPONSE" | jq -e '.syncId' >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Test sync successful${NC}"
            echo "Response: $RESPONSE" | jq '.'
        else
            echo -e "${RED}❌ Test sync failed${NC}"
            echo "Response: $RESPONSE"
        fi
    else
        echo -e "${YELLOW}⚠️  Worker URL not available. Test payload created at test-sync-payload.json${NC}"
    fi
fi

echo ""
echo -e "${GREEN}🚀 ChittyRouter Sync Infrastructure deployment complete!${NC}"

# Save deployment info
cat > "$ROOT_DIR/.deployment-info.json" << EOF
{
  "environment": "$ENVIRONMENT",
  "project": "$PROJECT_NAME",
  "deployedAt": "$(date -Iseconds)",
  "workerUrl": "${WORKER_URL:-''}",
  "version": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
}
EOF

echo "Deployment info saved to .deployment-info.json"