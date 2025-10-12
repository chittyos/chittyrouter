#!/bin/bash

###############################################################################
# ChittyOS Todo Hub - Automated Deployment Script
# Deploys omnidirectional todo synchronization hub to sync.chitty.cc
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
WORKER_NAME="chittyos-todo-hub"
CONFIG_FILE="wrangler-todo-hub.toml"
SCHEMA_FILE="schema/todos.sql"
ENV="${1:-production}"  # Default to production, or use first argument

###############################################################################
# Helper Functions
###############################################################################

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
  if ! command -v "$1" &> /dev/null; then
    log_error "$1 is not installed. Please install it first."
    exit 1
  fi
}

###############################################################################
# Pre-flight Checks
###############################################################################

log_info "Starting ChittyOS Todo Hub deployment to ${ENV}..."
echo ""

# Check required commands
log_info "Checking prerequisites..."
check_command "wrangler"
check_command "curl"
check_command "jq"

# Check Cloudflare authentication
log_info "Verifying Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
  log_error "Not authenticated with Cloudflare. Run: wrangler login"
  exit 1
fi
log_success "Authenticated with Cloudflare"

# Check configuration file exists
if [ ! -f "$CONFIG_FILE" ]; then
  log_error "Configuration file not found: $CONFIG_FILE"
  exit 1
fi

# Check schema file exists
if [ ! -f "$SCHEMA_FILE" ]; then
  log_error "Schema file not found: $SCHEMA_FILE"
  exit 1
fi

###############################################################################
# Database Setup
###############################################################################

log_info "Setting up D1 database..."

# Determine database name based on environment
if [ "$ENV" == "production" ]; then
  DB_NAME="chittyos-todos"
elif [ "$ENV" == "staging" ]; then
  DB_NAME="chittyos-todos-staging"
else
  DB_NAME="chittyos-todos-dev"
fi

# Check if database exists
DB_EXISTS=$(wrangler d1 list | grep "$DB_NAME" || true)

if [ -z "$DB_EXISTS" ]; then
  log_warning "Database '$DB_NAME' not found. Creating..."
  wrangler d1 create "$DB_NAME"
  log_success "Database created: $DB_NAME"

  log_warning "IMPORTANT: Update wrangler-todo-hub.toml with the database_id from above output"
  read -p "Press Enter after updating wrangler-todo-hub.toml..."
else
  log_success "Database exists: $DB_NAME"
fi

# Apply schema
log_info "Applying database schema..."
if wrangler d1 execute "$DB_NAME" --file="$SCHEMA_FILE" --env="$ENV"; then
  log_success "Schema applied successfully"
else
  log_error "Failed to apply schema"
  exit 1
fi

# Verify tables
log_info "Verifying tables..."
TABLES=$(wrangler d1 execute "$DB_NAME" --command="SELECT name FROM sqlite_master WHERE type='table'" --env="$ENV" | grep -E "(todos|sync_metadata|ws_subscriptions|conflict_log)" || true)

if [ -z "$TABLES" ]; then
  log_error "Tables not found. Schema may not have applied correctly."
  exit 1
fi

log_success "Tables verified:"
echo "$TABLES"

###############################################################################
# KV Namespace Setup (Optional)
###############################################################################

log_info "Checking KV namespace..."

KV_EXISTS=$(wrangler kv:namespace list | grep "TODO_CACHE" || true)

if [ -z "$KV_EXISTS" ]; then
  log_warning "KV namespace 'TODO_CACHE' not found."
  read -p "Create KV namespace for caching? (y/n): " create_kv

  if [ "$create_kv" == "y" ]; then
    wrangler kv:namespace create "TODO_CACHE"
    wrangler kv:namespace create "TODO_CACHE" --preview
    log_success "KV namespaces created"
    log_warning "IMPORTANT: Update wrangler-todo-hub.toml with KV namespace IDs"
    read -p "Press Enter after updating wrangler-todo-hub.toml..."
  fi
else
  log_success "KV namespace exists"
fi

###############################################################################
# Secrets Configuration
###############################################################################

log_info "Checking secrets..."

# Check if CHITTY_ID_TOKEN is set
SECRETS=$(wrangler secret list --env="$ENV" 2>/dev/null || echo "")

if echo "$SECRETS" | grep -q "CHITTY_ID_TOKEN"; then
  log_success "CHITTY_ID_TOKEN is configured"
else
  log_warning "CHITTY_ID_TOKEN not found"

  if [ -n "$CHITTY_ID_TOKEN" ]; then
    log_info "Found CHITTY_ID_TOKEN in environment. Setting secret..."
    echo "$CHITTY_ID_TOKEN" | wrangler secret put CHITTY_ID_TOKEN --env="$ENV"
    log_success "Secret configured from environment"
  else
    log_error "CHITTY_ID_TOKEN not found in environment"
    log_info "Set it manually: wrangler secret put CHITTY_ID_TOKEN --env=$ENV"
    exit 1
  fi
fi

###############################################################################
# Build and Deploy
###############################################################################

log_info "Building worker..."
if [ -f "package.json" ]; then
  npm run build 2>/dev/null || log_warning "Build script not found, skipping..."
fi

log_info "Deploying to Cloudflare Workers..."
if wrangler deploy --config "$CONFIG_FILE" --env="$ENV"; then
  log_success "Worker deployed successfully!"
else
  log_error "Deployment failed"
  exit 1
fi

###############################################################################
# Post-Deployment Verification
###############################################################################

log_info "Verifying deployment..."

# Determine URL based on environment
if [ "$ENV" == "production" ]; then
  HEALTH_URL="https://sync.chitty.cc/health"
elif [ "$ENV" == "staging" ]; then
  HEALTH_URL="https://staging-sync.chitty.cc/health"
else
  HEALTH_URL="https://dev-sync.chitty.cc/health"
fi

# Wait a few seconds for worker to be ready
sleep 3

# Test health endpoint
log_info "Testing health endpoint: $HEALTH_URL"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$HEALTH_URL" || echo "000")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" == "200" ]; then
  log_success "Health check passed!"
  echo "$HEALTH_BODY" | jq '.' 2>/dev/null || echo "$HEALTH_BODY"
else
  log_error "Health check failed (HTTP $HTTP_CODE)"
  echo "$HEALTH_BODY"
  exit 1
fi

###############################################################################
# Summary
###############################################################################

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "ChittyOS Todo Hub Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_info "Environment: $ENV"
log_info "Health URL: $HEALTH_URL"
log_info "API Base: ${HEALTH_URL%/health}"
echo ""
log_info "Available Endpoints:"
echo "  GET  $HEALTH_URL"
echo "  GET  ${HEALTH_URL%/health}/api/todos"
echo "  POST ${HEALTH_URL%/health}/api/todos"
echo "  POST ${HEALTH_URL%/health}/api/todos/sync"
echo "  GET  ${HEALTH_URL%/health}/api/todos/since/:timestamp"
echo "  WS   ${HEALTH_URL%/health}/api/todos/watch"
echo ""
log_info "Next Steps:"
echo "  1. Test API: curl -H 'Authorization: Bearer \$CHITTY_TOKEN' ${HEALTH_URL%/health}/api/todos"
echo "  2. View logs: wrangler tail $WORKER_NAME-$ENV"
echo "  3. Monitor DB: wrangler d1 execute $DB_NAME --command='SELECT COUNT(*) FROM todos'"
echo ""
log_info "Documentation: TODO-HUB-README.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
