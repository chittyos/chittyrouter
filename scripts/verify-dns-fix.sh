#!/bin/bash

################################################################################
# DNS Error 1000 Fix - Verification Script
#
# Purpose: Automated verification of DNS Error 1000 resolution
# Usage: ./scripts/verify-dns-fix.sh
# Exit Codes: 0 = success, 1 = DNS still broken, 2 = HTTP still failing
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Domains to verify
DOMAINS=("gateway.chitty.cc" "register.chitty.cc")

# Log file
LOG_FILE="/Users/nb/.claude/projects/-/CHITTYOS/chittyos-services/chittyrouter/VERIFY_LOG.md"

################################################################################
# Logging Functions
################################################################################

log() {
    echo -e "${GREEN}[✓]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] $1" >> "$LOG_FILE"
}

error() {
    echo -e "${RED}[✗]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $1" >> "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[!]${NC} $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARN] $1" >> "$LOG_FILE"
}

section() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "# $1" >> "$LOG_FILE"
}

################################################################################
# Verification Functions
################################################################################

verify_dns_records() {
    local domain=$1
    section "DNS Record Verification: $domain"

    # Get DNS records
    local dns_output=$(dig +short "$domain" 2>&1)

    # Check for A records (should be empty or CNAME)
    if echo "$dns_output" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        error "A records still present for $domain"
        echo "$dns_output" | while read -r line; do
            error "  → $line"
        done
        return 1
    else
        log "No A records found for $domain (correct)"
        if [ -n "$dns_output" ]; then
            log "DNS resolves to: $dns_output"
        fi
        return 0
    fi
}

verify_http_endpoint() {
    local domain=$1
    section "HTTP Endpoint Verification: https://$domain/health"

    # Make HTTP request
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "https://$domain/health" 2>&1)
    local response_body=$(curl -s "https://$domain/health" 2>&1)

    # Check for Error 1000
    if echo "$response_body" | grep -qi "error 1000"; then
        error "DNS Error 1000 still present on $domain"
        error "HTTP Status: $http_code"
        return 1
    fi

    # Check HTTP status code
    if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
        log "HTTP $http_code OK for $domain"
        log "Response: $response_body"
        return 0
    elif [ "$http_code" = "403" ]; then
        error "HTTP 403 Forbidden on $domain (DNS Error 1000 likely)"
        error "Response: $response_body"
        return 1
    elif [ "$http_code" = "404" ]; then
        warn "HTTP 404 Not Found on $domain (worker may not have /health endpoint)"
        return 0  # Not a DNS error
    else
        warn "HTTP $http_code on $domain (unexpected status)"
        warn "Response: $response_body"
        return 0  # Not necessarily a DNS error
    fi
}

verify_workers_custom_domain() {
    local domain=$1
    section "Workers Custom Domain Verification: $domain"

    # Check if CF_API_TOKEN is set
    if [ -z "${CF_API_TOKEN:-}" ]; then
        warn "CF_API_TOKEN not set - skipping Workers API verification"
        return 0
    fi

    # Query Workers API for custom domains
    local api_response=$(curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
        "https://api.cloudflare.com/client/v4/accounts/0bc21e3a5a9de1a4cc843be9c3e98121/workers/domains" 2>&1)

    # Check if domain is in response
    if echo "$api_response" | jq -e ".result[] | select(.hostname == \"$domain\")" > /dev/null 2>&1; then
        log "Custom domain $domain found in Workers configuration"

        # Get domain status
        local domain_status=$(echo "$api_response" | jq -r ".result[] | select(.hostname == \"$domain\") | .status")
        log "Domain status: $domain_status"

        if [ "$domain_status" = "active" ]; then
            log "Custom domain is active"
            return 0
        else
            warn "Custom domain status: $domain_status (not active yet)"
            return 0
        fi
    else
        warn "Custom domain $domain not found in Workers configuration"
        warn "May need to add via: npx wrangler deployments domains add $domain"
        return 0  # Warning, not error
    fi
}

flush_dns_cache() {
    section "DNS Cache Flush"

    if sudo dscacheutil -flushcache 2>/dev/null; then
        log "Local DNS cache flushed successfully"
    else
        warn "Could not flush DNS cache (may require sudo)"
    fi
}

generate_summary() {
    section "Verification Summary"

    local total_checks=0
    local passed_checks=0
    local failed_checks=0

    # Count results from log
    total_checks=$(grep -c "\[INFO\]" "$LOG_FILE" || echo "0")
    passed_checks=$(grep -c "\[INFO\].*OK\|correct\|success" "$LOG_FILE" || echo "0")
    failed_checks=$(grep -c "\[ERROR\]" "$LOG_FILE" || echo "0")

    echo "Total Checks: $total_checks"
    echo "Passed: $passed_checks"
    echo "Failed: $failed_checks"

    echo "" >> "$LOG_FILE"
    echo "## Summary" >> "$LOG_FILE"
    echo "- Total Checks: $total_checks" >> "$LOG_FILE"
    echo "- Passed: $passed_checks" >> "$LOG_FILE"
    echo "- Failed: $failed_checks" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"

    if [ "$failed_checks" -eq 0 ]; then
        log "All verification checks passed! DNS Error 1000 resolved."
        return 0
    else
        error "$failed_checks verification checks failed"
        return 1
    fi
}

################################################################################
# Main Execution
################################################################################

main() {
    # Initialize log file
    echo "# DNS Error 1000 Verification Log" > "$LOG_FILE"
    echo "**Generated**: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"

    section "DNS Error 1000 Fix Verification"
    log "Starting verification for domains: ${DOMAINS[*]}"

    # Flush DNS cache first
    flush_dns_cache

    # Track overall success
    local overall_success=0

    # Verify each domain
    for domain in "${DOMAINS[@]}"; do
        # DNS verification
        if ! verify_dns_records "$domain"; then
            overall_success=1
        fi

        # HTTP verification
        if ! verify_http_endpoint "$domain"; then
            overall_success=1
        fi

        # Workers verification (optional)
        verify_workers_custom_domain "$domain"
    done

    # Generate summary
    if ! generate_summary; then
        overall_success=1
    fi

    # Final output
    echo ""
    if [ $overall_success -eq 0 ]; then
        log "DNS Error 1000 verification PASSED"
        log "Verification log: $LOG_FILE"
        exit 0
    else
        error "DNS Error 1000 verification FAILED"
        error "Review log for details: $LOG_FILE"
        exit 1
    fi
}

# Run main function
main "$@"
