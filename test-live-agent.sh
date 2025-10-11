#!/bin/bash
# Test live persistent agent deployment

WORKER_URL="https://chittyrouter.chittycorp-llc.workers.dev"

echo "🧪 Testing Live Persistent Agent"
echo "=================================="
echo ""

# Test 1: Worker health
echo "Test 1: Worker Health Check"
echo "----------------------------"
curl -s "${WORKER_URL}/health" | jq '.'
echo ""

# Test 2: Create persistent agent instance and test
echo "Test 2: Persistent Agent - Simple Task"
echo "---------------------------------------"
AGENT_ID=$(curl -s -X POST "${WORKER_URL}/platform/agents/email-router" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "complete",
    "prompt": "Route this email: Customer complaint about billing",
    "taskType": "email_routing",
    "context": {"sender": "customer@example.com"}
  }' | jq -r '.')

echo "$AGENT_ID" | jq '.'
echo ""

# Test 3: Agent stats
echo "Test 3: Agent Statistics"
echo "------------------------"
curl -s "${WORKER_URL}/platform/agents/email-router/stats" | jq '.'
echo ""

echo "=================================="
echo "✅ Live agent test complete!"
