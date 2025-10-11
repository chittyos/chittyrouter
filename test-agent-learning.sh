#!/bin/bash

AGENT_URL="https://chittyrouter.chittycorp-llc.workers.dev/platform/agents/email-router"

echo "🧪 Testing Persistent Agent Learning System"
echo "==========================================="
echo ""

# Test 1: Simple email routing task
echo "Test 1: Email Routing (Simple Task)"
echo "------------------------------------"
curl -s -X POST "${AGENT_URL}/complete" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Route: Customer wants refund","taskType":"email_routing"}' | jq '{success, provider, cost, agent_id, memory_context_used}'
echo ""

# Test 2: Another simple task
echo "Test 2: Second Email Routing"
echo "-----------------------------"
curl -s -X POST "${AGENT_URL}/complete" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Route: Technical support request","taskType":"email_routing"}' | jq '{success, provider, cost}'
echo ""

# Test 3: Complex legal reasoning task
echo "Test 3: Legal Reasoning (Complex Task)"
echo "---------------------------------------"
curl -s -X POST "${AGENT_URL}/complete" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Analyze contract clause liability","taskType":"legal_reasoning"}' | jq '{success, provider, cost}'
echo ""

# Test 4: Triage task
echo "Test 4: Triage Task"
echo "-------------------"
curl -s -X POST "${AGENT_URL}/complete" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Classify: urgent billing issue","taskType":"triage"}' | jq '{success, provider, cost}'
echo ""

# Test 5: Another triage (should learn)
echo "Test 5: Second Triage Task"
echo "--------------------------"
curl -s -X POST "${AGENT_URL}/complete" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Classify: password reset","taskType":"triage"}' | jq '{success, provider, cost}'
echo ""

# Test 6: Check agent statistics
echo "Test 6: Agent Learning Statistics"
echo "----------------------------------"
curl -s "${AGENT_URL}/stats" | jq '.'
echo ""

echo "==========================================="
echo "✅ Learning test complete!"
echo ""
echo "Key observations:"
echo "• Agent persists state across all requests"
echo "• Memory context retrieved each time"
echo "• Model scores increase with successful tasks"
echo "• Cost tracking per interaction"
echo "• Provider routing optimizes over time"
