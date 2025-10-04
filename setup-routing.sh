#!/bin/bash

# Cloudflare Email Routing Setup Script
# Configures email routing for chitty.cc domain

echo "🚀 Cloudflare Email Routing Setup"
echo "=================================="
echo ""

# Get Cloudflare API token from environment or prompt
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "⚠️  CLOUDFLARE_API_TOKEN not set"
  echo "Please set it or run manually via dashboard"
  echo ""
  echo "Manual Setup Instructions:"
  echo "1. Go to https://dash.cloudflare.com/"
  echo "2. Select domain: chitty.cc"
  echo "3. Navigate to: Email → Email Routing → Routing Rules"
  echo "4. Click 'Create routing rule'"
  echo "5. Configure:"
  echo "   - Match: All incoming messages"
  echo "   - Action: Send to a Worker"
  echo "   - Worker: chittyos-email-worker"
  echo "6. Click Save"
  exit 1
fi

ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"
WORKER_NAME="chittyos-email-worker"

echo "✅ Account ID: $ACCOUNT_ID"
echo "✅ Worker: $WORKER_NAME"
echo ""

# Get zone ID for chitty.cc
echo "🔍 Finding chitty.cc zone..."
ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?account.id=$ACCOUNT_ID&name=chitty.cc" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.result[0].id')

if [ "$ZONE_ID" == "null" ] || [ -z "$ZONE_ID" ]; then
  echo "❌ Could not find chitty.cc zone"
  exit 1
fi

echo "✅ Zone ID: $ZONE_ID"
echo ""

# Check if Email Routing is enabled
echo "🔍 Checking Email Routing status..."
ROUTING_STATUS=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json")

echo "$ROUTING_STATUS" | jq '.'
echo ""

# Create routing rule
echo "📧 Creating email routing rule..."
RULE_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "{
    \"enabled\": true,
    \"matchers\": [{\"type\": \"all\"}],
    \"actions\": [{
      \"type\": \"worker\",
      \"value\": [\"$WORKER_NAME\"]
    }],
    \"name\": \"AI Email Worker - All Messages\",
    \"priority\": 0
  }")

echo "$RULE_RESPONSE" | jq '.'
echo ""

if echo "$RULE_RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ Email routing configured successfully!"
else
  echo "❌ Failed to configure email routing"
  echo "Please configure manually via dashboard"
fi
