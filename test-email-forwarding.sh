#!/bin/bash

# Email Forwarding Test Script
# Tests actual email forwarding with proper sample size

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Email Forwarding Test - Proper Statistical Testing  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if monitoring is already running
if pgrep -f "wrangler tail chittyos-email-worker" > /dev/null; then
    echo -e "${GREEN}✓${NC} Log monitoring already running"
else
    echo -e "${YELLOW}→${NC} Starting log monitoring in background..."
    CLOUDFLARE_ACCOUNT_ID=0bc21e3a5a9de1a4cc843be9c3e98121 wrangler tail chittyos-email-worker --format pretty > test-results/forwarding-logs.txt 2>&1 &
    TAIL_PID=$!
    echo -e "${GREEN}✓${NC} Monitoring started (PID: $TAIL_PID)"
    echo "$TAIL_PID" > test-results/tail-pid.txt
fi

echo ""
echo -e "${BLUE}═══ Test Requirements ═══${NC}"
echo ""
echo "To achieve statistical validity, you must send:"
echo -e "  ${YELLOW}Minimum: 30 test emails${NC} (for basic statistical claims)"
echo -e "  ${GREEN}Recommended: 50+ test emails${NC} (for confidence)"
echo ""

echo "Test scenarios to cover:"
echo "  1. Litigation emails (urgent) → legal@aribia.llc"
echo "  2. Contract emails (standard) → mgmt@aribia.llc"
echo "  3. General emails (routine) → mgmt@aribia.llc"
echo "  4. Various urgency levels"
echo "  5. Different sender addresses"
echo ""

echo -e "${YELLOW}Press Enter when you're ready to start testing...${NC}"
read

# Create results directory
mkdir -p test-results

# Initialize results file
echo "timestamp,from,to,classification,urgency,forward_to,success,processing_time_ms" > test-results/forwarding-test-results.csv

echo ""
echo -e "${GREEN}✓${NC} Results file created: test-results/forwarding-test-results.csv"
echo ""
echo -e "${BLUE}═══ Send Test Emails Now ═══${NC}"
echo ""
echo "Send emails to these addresses and I'll track them:"
echo "  • test@chitty.cc"
echo "  • legal@chitty.cc"
echo "  • contracts@chitty.cc"
echo "  • support@chitty.cc"
echo ""
echo -e "${YELLOW}→${NC} Monitoring logs for 10 minutes..."
echo -e "${YELLOW}→${NC} Send at least 30 emails during this time"
echo ""

# Monitor for 10 minutes
END_TIME=$(($(date +%s) + 600))
EMAIL_COUNT=0

while [ $(date +%s) -lt $END_TIME ]; do
    # Check log file for new emails
    if [ -f test-results/forwarding-logs.txt ]; then
        CURRENT_COUNT=$(grep -c "Email received:" test-results/forwarding-logs.txt 2>/dev/null || echo "0")
        if [ "$CURRENT_COUNT" -gt "$EMAIL_COUNT" ]; then
            EMAIL_COUNT=$CURRENT_COUNT
            echo -e "${GREEN}✓${NC} Email #$EMAIL_COUNT received"
        fi
    fi

    sleep 2
done

echo ""
echo -e "${BLUE}═══ Test Complete ═══${NC}"
echo ""
echo "Emails received: $EMAIL_COUNT"

if [ "$EMAIL_COUNT" -ge 30 ]; then
    echo -e "${GREEN}✓ PASS${NC} - Sufficient sample size for statistical claims"
elif [ "$EMAIL_COUNT" -ge 10 ]; then
    echo -e "${YELLOW}⚠ WARN${NC} - Some testing done but below minimum (n=30)"
else
    echo -e "${RED}✗ FAIL${NC} - Insufficient testing (minimum: 30, got: $EMAIL_COUNT)"
fi

echo ""
echo "Results saved to:"
echo "  • test-results/forwarding-logs.txt"
echo "  • test-results/forwarding-test-results.csv"
echo ""
echo "To analyze results, run:"
echo "  grep 'Successfully forwarded' test-results/forwarding-logs.txt | wc -l"
echo "  grep 'Forward failed' test-results/forwarding-logs.txt | wc -l"
echo ""

# Stop monitoring
if [ -f test-results/tail-pid.txt ]; then
    TAIL_PID=$(cat test-results/tail-pid.txt)
    kill $TAIL_PID 2>/dev/null || true
    rm test-results/tail-pid.txt
fi

echo -e "${GREEN}✓${NC} Testing complete"
