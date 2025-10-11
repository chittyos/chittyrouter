#!/bin/bash

################################################################################
# R2 & Neon Configuration Setup Script
#
# Purpose: Automate R2 bucket creation and Neon secret configuration
# Usage: ./scripts/setup-r2-neon.sh
# Exit Codes: 0 = success, 1 = configuration error, 2 = deployment error
################################################################################

set -euo pipefail

# Configuration
ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"
BUCKET_NAME="email-archive-chittyos"
WORKER_NAME="chittyos-email-worker"
WRANGLER_CONFIG="wrangler-email.toml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

################################################################################
# Helper Functions
################################################################################

log() {
    echo -e "${GREEN}[✓]${NC} $1"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

info() {
    echo -e "${BLUE}[i]${NC} $1"
}

section() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

################################################################################
# Setup Functions
################################################################################

setup_r2_bucket() {
    section "Step 1: R2 Bucket Configuration"

    # Check if bucket exists
    info "Checking if R2 bucket '$BUCKET_NAME' exists..."
    if npx wrangler r2 bucket list --account-id "$ACCOUNT_ID" 2>/dev/null | grep -q "$BUCKET_NAME"; then
        warn "R2 bucket '$BUCKET_NAME' already exists (this is OK)"
    else
        info "Creating R2 bucket: $BUCKET_NAME"
        if npx wrangler r2 bucket create "$BUCKET_NAME" --account-id "$ACCOUNT_ID"; then
            log "R2 bucket created successfully"
        else
            error "Failed to create R2 bucket"
            return 1
        fi
    fi

    # Verify bucket creation
    echo ""
    info "Verifying bucket..."
    if npx wrangler r2 bucket list --account-id "$ACCOUNT_ID" | grep -q "$BUCKET_NAME"; then
        log "R2 bucket verified: $BUCKET_NAME"
        return 0
    else
        error "R2 bucket not found after creation"
        return 1
    fi
}

update_wrangler_config() {
    section "Step 2: Update Wrangler Configuration"

    info "Checking $WRANGLER_CONFIG for R2 binding..."

    # Check if R2 binding is already uncommented
    if grep -q "^binding = \"EMAIL_ARCHIVE\"" "$WRANGLER_CONFIG"; then
        warn "R2 binding already enabled in $WRANGLER_CONFIG"
        return 0
    fi

    # Check if commented R2 binding exists
    if grep -q "^# \[\[r2_buckets\]\]" "$WRANGLER_CONFIG"; then
        info "Uncommenting R2 binding in $WRANGLER_CONFIG"

        # Create backup
        cp "$WRANGLER_CONFIG" "${WRANGLER_CONFIG}.backup"
        log "Backup created: ${WRANGLER_CONFIG}.backup"

        # Uncomment R2 binding section
        sed -i '' '/^# Optional R2 binding/,/^# bucket_name/ {
            s/^# \(\[\[r2_buckets\]\]\)/\1/
            s/^# \(binding = "EMAIL_ARCHIVE"\)/\1/
            s/^# \(bucket_name = "email-archive-chittyos"\)/\1/
        }' "$WRANGLER_CONFIG"

        log "R2 binding enabled in $WRANGLER_CONFIG"

        # Show changes
        echo ""
        info "Updated configuration:"
        grep -A 2 "r2_buckets" "$WRANGLER_CONFIG"
    else
        warn "R2 binding section not found in $WRANGLER_CONFIG - may need manual addition"
        info "Expected format:"
        echo "  [[r2_buckets]]"
        echo "  binding = \"EMAIL_ARCHIVE\""
        echo "  bucket_name = \"email-archive-chittyos\""
    fi

    return 0
}

setup_neon_secret() {
    section "Step 3: Neon Database Secret Configuration"

    # Check if NEON_DATABASE_URL is set
    if [ -z "${NEON_DATABASE_URL:-}" ]; then
        error "NEON_DATABASE_URL not set in environment"
        echo ""
        warn "Please set it first:"
        echo "  export NEON_DATABASE_URL='postgresql://user:password@endpoint.neon.tech/database?sslmode=require'"
        echo ""
        warn "Or load from ~/.env:"
        echo "  source ~/.env && echo \$NEON_DATABASE_URL"
        return 1
    fi

    info "NEON_DATABASE_URL found in environment"
    info "Connection endpoint: $(echo "$NEON_DATABASE_URL" | sed -n 's|.*@\([^/]*\)/.*|\1|p')"

    # Set Wrangler secret
    echo ""
    info "Setting NEON_CONNECTION_STRING secret for worker: $WORKER_NAME"
    if echo "$NEON_DATABASE_URL" | npx wrangler secret put NEON_CONNECTION_STRING --name "$WORKER_NAME"; then
        log "Neon secret configured successfully"
    else
        error "Failed to set Neon secret"
        return 1
    fi

    return 0
}

verify_configuration() {
    section "Step 4: Configuration Verification"

    local all_good=0

    # Verify R2 bucket
    info "Verifying R2 bucket..."
    if npx wrangler r2 bucket list --account-id "$ACCOUNT_ID" | grep -q "$BUCKET_NAME"; then
        log "R2 bucket exists: $BUCKET_NAME"
    else
        error "R2 bucket not found: $BUCKET_NAME"
        all_good=1
    fi

    # Verify wrangler config
    echo ""
    info "Verifying wrangler configuration..."
    if grep -q "^binding = \"EMAIL_ARCHIVE\"" "$WRANGLER_CONFIG"; then
        log "R2 binding enabled in $WRANGLER_CONFIG"
    else
        error "R2 binding not found in $WRANGLER_CONFIG"
        all_good=1
    fi

    # Verify Neon secret
    echo ""
    info "Verifying Neon secret..."
    if npx wrangler secret list --name "$WORKER_NAME" 2>/dev/null | grep -q "NEON_CONNECTION_STRING"; then
        log "Neon secret configured for $WORKER_NAME"
    else
        error "Neon secret not found for $WORKER_NAME"
        all_good=1
    fi

    echo ""
    if [ $all_good -eq 0 ]; then
        log "All configuration verification checks passed"
        return 0
    else
        error "Some verification checks failed"
        return 1
    fi
}

show_next_steps() {
    section "Setup Complete!"

    echo ""
    log "Configuration Summary:"
    echo "  ✅ R2 bucket: $BUCKET_NAME"
    echo "  ✅ Worker config: $WRANGLER_CONFIG (R2 binding enabled)"
    echo "  ✅ Neon secret: NEON_CONNECTION_STRING (configured)"

    echo ""
    info "Next Steps:"
    echo ""
    echo "  1. Deploy email worker with new configuration:"
    echo "     ${BLUE}npx wrangler deploy --config $WRANGLER_CONFIG${NC}"
    echo ""
    echo "  2. Test email processing with R2 archival:"
    echo "     ${BLUE}./tests/email-worker-suite.sh${NC}"
    echo ""
    echo "  3. Verify database connectivity:"
    echo "     ${BLUE}curl https://email.chitty.cc/db-test${NC}"
    echo ""
    echo "  4. Monitor R2 storage usage:"
    echo "     ${BLUE}npx wrangler r2 bucket list --account-id $ACCOUNT_ID${NC}"
    echo ""
    echo "  5. Run compliance check (target: ≥80%):"
    echo "     ${BLUE}/Users/nb/.claude/projects/-/chittychat/chittycheck-enhanced.sh${NC}"
    echo ""

    info "Cost Estimate:"
    echo "  - R2 Storage: ~\$0.10-\$1.00/month (negligible)"
    echo "  - Neon Database: Already included in existing plan"
    echo ""
}

################################################################################
# Main Execution
################################################################################

main() {
    section "ChittyRouter R2 & Neon Configuration Setup"
    info "Worker: $WORKER_NAME"
    info "Account: $ACCOUNT_ID"
    info "R2 Bucket: $BUCKET_NAME"
    echo ""

    # Check we're in the right directory
    if [ ! -f "$WRANGLER_CONFIG" ]; then
        error "Cannot find $WRANGLER_CONFIG in current directory"
        error "Please run from: /Users/nb/.claude/projects/-/CHITTYOS/chittyos-services/chittyrouter"
        exit 1
    fi

    # Execute setup steps
    if ! setup_r2_bucket; then
        error "R2 bucket setup failed"
        exit 1
    fi

    if ! update_wrangler_config; then
        error "Wrangler config update failed"
        exit 1
    fi

    if ! setup_neon_secret; then
        warn "Neon secret setup skipped (NEON_DATABASE_URL not set)"
        warn "You can set it later manually"
    fi

    if ! verify_configuration; then
        error "Configuration verification failed"
        exit 1
    fi

    show_next_steps
    exit 0
}

# Run main function
main "$@"
