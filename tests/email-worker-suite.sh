#!/bin/bash

# Email Worker Comprehensive Test Suite
# Tests AI classification, routing logic, and tracking headers
# For ongoing testing of the chittyos-email-worker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
WORKER_URL="https://chittyos-email-worker.chittycorp-llc.workers.dev"
TEST_EMAIL="test@chitty.cc"
RESULTS_DIR="./test-results"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

# Create results directory
mkdir -p "$RESULTS_DIR"

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Email Worker Comprehensive Test Suite             ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to log test results
log_test() {
    local test_name="$1"
    local status="$2"
    local details="$3"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗${NC} $test_name"
        echo -e "  ${YELLOW}Details: $details${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi

    # Log to file
    echo "$TIMESTAMP,$test_name,$status,$details" >> "$RESULTS_DIR/test-log.csv"
}

# Test 1: Worker health check
echo -e "\n${BLUE}[Test 1]${NC} Worker Health Check"
if curl -s "$WORKER_URL" | grep -q "chittyos-email-worker"; then
    log_test "Worker Health Check" "PASS" "Worker is responding"
else
    log_test "Worker Health Check" "FAIL" "Worker not responding correctly"
fi

# Test 2: Check email routing configuration
echo -e "\n${BLUE}[Test 2]${NC} Email Routing Configuration"
ROUTING_STATUS=$(cloudflare-cli email routing list 2>&1 || echo "Error checking routing")
if echo "$ROUTING_STATUS" | grep -q "test@chitty.cc"; then
    log_test "Email Routing Config" "PASS" "Routing configured for test@chitty.cc"
else
    log_test "Email Routing Config" "SKIP" "Cannot verify routing (requires Cloudflare CLI)"
fi

# Test 3-7: AI Classification Tests
echo -e "\n${BLUE}[Tests 3-7]${NC} AI Classification Scenarios"
echo -e "${YELLOW}NOTE: These tests require manual email sending${NC}"
echo ""
echo "To test AI classification, send emails with these scenarios:"
echo ""
echo -e "${GREEN}Test 3: Litigation Classification${NC}"
echo "  To: $TEST_EMAIL"
echo "  Subject: Urgent: Court Filing Deadline"
echo "  Body: Need to file motion by 5pm tomorrow. Case: Arias v Bianchi."
echo "  Expected: classification=litigation, urgency=critical"
echo ""
echo -e "${GREEN}Test 4: Contract Classification${NC}"
echo "  To: $TEST_EMAIL"
echo "  Subject: Operating Agreement Review"
echo "  Body: Please review the attached LLC operating agreement."
echo "  Expected: classification=legal (contract), urgency=standard"
echo ""
echo -e "${GREEN}Test 5: General Correspondence${NC}"
echo "  To: $TEST_EMAIL"
echo "  Subject: Meeting Tomorrow"
echo "  Body: Let's meet at 3pm to discuss the project."
echo "  Expected: classification=general, urgency=routine"
echo ""
echo -e "${GREEN}Test 6: High-Priority Detection${NC}"
echo "  To: $TEST_EMAIL"
echo "  Subject: URGENT: Emergency Hearing"
echo "  Body: Emergency hearing scheduled for tomorrow at 9am. Immediate response required."
echo "  Expected: classification=litigation, urgency=critical, priority=High"
echo ""
echo -e "${GREEN}Test 7: Entity Extraction${NC}"
echo "  To: $TEST_EMAIL"
echo "  Subject: Case Update"
echo "  Body: Regarding Arias v Bianchi case 2024D007847. ARIBIA LLC and Luisa Arias."
echo "  Expected: entityCount>0 (should extract names, case numbers)"
echo ""

# Test 8: Monitoring logs
echo -e "\n${BLUE}[Test 8]${NC} Log Monitoring Capability"
if command -v wrangler &> /dev/null; then
    log_test "Wrangler CLI Available" "PASS" "Can monitor worker logs"
    echo -e "  ${GREEN}→${NC} Run: ${YELLOW}wrangler tail chittyos-email-worker --format pretty${NC}"
else
    log_test "Wrangler CLI Available" "FAIL" "Install wrangler to monitor logs"
fi

# Test 9: Forwarding disabled check
echo -e "\n${BLUE}[Test 9]${NC} Verify Forwarding Disabled (Test Mode)"
echo -e "${YELLOW}Check worker logs for 'forwarding disabled for testing'${NC}"
log_test "Forwarding Disabled Check" "MANUAL" "Verify in worker logs"

# Test 10: Processing time check
echo -e "\n${BLUE}[Test 10]${NC} Performance Baseline"
echo -e "${YELLOW}Check worker logs for 'X-Processing-Time' header${NC}"
echo -e "  Target: <2000ms per email"
log_test "Processing Time Baseline" "MANUAL" "Check processing time in logs"

# Summary
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Test Summary                          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Total Tests:  ${BLUE}$TOTAL_TESTS${NC}"
echo -e "Passed:       ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:       ${RED}$FAILED_TESTS${NC}"
echo -e "Results:      $RESULTS_DIR/test-log.csv"
echo ""

# Next steps
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Monitor logs: wrangler tail chittyos-email-worker --format pretty"
echo "2. Send test emails to: $TEST_EMAIL"
echo "3. Verify AI classifications in logs"
echo "4. Document any issues in: $RESULTS_DIR/"
echo ""

# Exit with appropriate code
if [ $FAILED_TESTS -gt 0 ]; then
    exit 1
else
    exit 0
fi
