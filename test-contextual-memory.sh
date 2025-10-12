#!/bin/bash

# Test script for ChittyContextual Memory Integration
# Tests memory persistence across agent interactions

BASE_URL="${1:-http://localhost:8787}"
AGENT_NAME="legal-assistant"
AGENT_URL="$BASE_URL/platform/agents/$AGENT_NAME/complete"

echo "🧠 Testing ChittyContextual Memory System"
echo "==========================================="
echo "Target: $AGENT_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Train the agent with case information
echo "Test 1: Training agent with case information..."
TRAIN_RESPONSE=$(curl -s -X POST "$AGENT_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Remember this important information: The case number is 2024D007847 for Arias v. Bianchi. The client is Nicholas Bianchi who is the defendant. The opposing party is Gabriela Arias. The case type is divorce proceedings.",
    "taskType": "case_training",
    "context": {
      "training": true,
      "case_id": "2024D007847"
    }
  }')

echo "Training Response:"
echo "$TRAIN_RESPONSE" | jq '.' 2>/dev/null || echo "$TRAIN_RESPONSE"
echo ""

# Wait for memory to persist
sleep 2

# Test 2: Query for case number
echo "Test 2: Querying for case number..."
CASE_QUERY=$(curl -s -X POST "$AGENT_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the case number I told you about?",
    "taskType": "case_query"
  }')

echo "Case Query Response:"
echo "$CASE_QUERY" | jq '.' 2>/dev/null || echo "$CASE_QUERY"

# Check if response contains the case number
if echo "$CASE_QUERY" | grep -q "2024D007847"; then
  echo -e "${GREEN}✓ PASS: Agent remembered case number${NC}"
else
  echo -e "${RED}✗ FAIL: Agent did not remember case number${NC}"
fi
echo ""

# Test 3: Query for client name
echo "Test 3: Querying for client name..."
CLIENT_QUERY=$(curl -s -X POST "$AGENT_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Who is our client in this case?",
    "taskType": "client_query"
  }')

echo "Client Query Response:"
echo "$CLIENT_QUERY" | jq '.' 2>/dev/null || echo "$CLIENT_QUERY"

# Check if response contains the client name
if echo "$CLIENT_QUERY" | grep -qi "bianchi"; then
  echo -e "${GREEN}✓ PASS: Agent remembered client name${NC}"
else
  echo -e "${RED}✗ FAIL: Agent did not remember client name${NC}"
fi
echo ""

# Test 4: Query for case context
echo "Test 4: Querying for full case context..."
CONTEXT_QUERY=$(curl -s -X POST "$AGENT_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Summarize what you know about the Arias v. Bianchi case",
    "taskType": "case_summary"
  }')

echo "Context Query Response:"
echo "$CONTEXT_QUERY" | jq '.' 2>/dev/null || echo "$CONTEXT_QUERY"

# Check for multiple remembered elements
REMEMBERED_ITEMS=0
if echo "$CONTEXT_QUERY" | grep -qi "arias"; then
  ((REMEMBERED_ITEMS++))
  echo -e "${GREEN}✓ Remembered: Arias${NC}"
fi
if echo "$CONTEXT_QUERY" | grep -qi "bianchi"; then
  ((REMEMBERED_ITEMS++))
  echo -e "${GREEN}✓ Remembered: Bianchi${NC}"
fi
if echo "$CONTEXT_QUERY" | grep -q "2024D007847"; then
  ((REMEMBERED_ITEMS++))
  echo -e "${GREEN}✓ Remembered: Case number${NC}"
fi
if echo "$CONTEXT_QUERY" | grep -qi "divorce"; then
  ((REMEMBERED_ITEMS++))
  echo -e "${GREEN}✓ Remembered: Case type${NC}"
fi

echo ""
if [ $REMEMBERED_ITEMS -ge 3 ]; then
  echo -e "${GREEN}✅ SUCCESS: Agent demonstrated good memory retention ($REMEMBERED_ITEMS/4 items)${NC}"
else
  echo -e "${YELLOW}⚠️  WARNING: Agent memory retention is limited ($REMEMBERED_ITEMS/4 items)${NC}"
fi

# Test 5: Check agent stats
echo ""
echo "Test 5: Checking agent statistics..."
STATS_URL="$BASE_URL/platform/agents/$AGENT_NAME/stats"
STATS=$(curl -s "$STATS_URL")
echo "Agent Stats:"
echo "$STATS" | jq '.' 2>/dev/null || echo "$STATS"

echo ""
echo "==========================================="
echo "Testing complete!"
echo ""
echo "To monitor live requests:"
echo "  wrangler tail"
echo ""
echo "To check Durable Object storage:"
echo "  npx wrangler kv:key list --namespace-id=AGENT_WORKING_MEMORY"