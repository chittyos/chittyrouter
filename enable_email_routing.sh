#!/bin/bash
# Enable Email Routing and create worker route for chitty.cc

ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e08121"
ZONE_ID="3ab6766c4f70b9ec5bd6bd5e8b06c18b"  # chitty.cc

# Get Cloudflare API token
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-$(op read 'op://Private/Cloudflare API Token/credential' 2>/dev/null)}"

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_API_TOKEN not set"
    echo "Please set it: export CLOUDFLARE_API_TOKEN=your_token"
    exit 1
fi

echo "🚀 Setting up Email Routing for chitty.cc..."
echo ""

# Step 1: Enable Email Routing
echo "1️⃣  Enabling Email Routing..."
ENABLE_RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/enable" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json")

if echo "$ENABLE_RESULT" | jq -e '.success' > /dev/null 2>&1; then
    echo "   ✅ Email Routing enabled"
else
    echo "   ⚠️  $(echo "$ENABLE_RESULT" | jq -r '.errors[0].message // "Already enabled or error occurred"')"
fi

echo ""

# Step 2: Create Email Worker Route
echo "2️⃣  Creating Email Worker Route..."
ROUTE_RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "matchers": [
      {
        "field": "to",
        "type": "literal",
        "value": "*@chitty.cc"
      }
    ],
    "actions": [
      {
        "type": "worker",
        "value": ["chittyos-email-worker"]
      }
    ],
    "name": "Universal Email Worker Route",
    "priority": 1
  }')

if echo "$ROUTE_RESULT" | jq -e '.success' > /dev/null 2>&1; then
    RULE_ID=$(echo "$ROUTE_RESULT" | jq -r '.result.id')
    echo "   ✅ Worker route created (ID: $RULE_ID)"
    echo "   📧 All emails to *@chitty.cc → chittyos-email-worker"
else
    echo "   ⚠️  $(echo "$ROUTE_RESULT" | jq -r '.errors[0].message // "Error creating route"')"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🧪 Test by sending email to: test@chitty.cc"
echo "📊 Monitor logs: wrangler tail chittyos-email-worker --format pretty"
echo "🔗 Dashboard: https://dash.cloudflare.com/$ACCOUNT_ID/chitty.cc/email/routing/overview"
