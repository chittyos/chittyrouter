#!/bin/bash
# Check AI Gateway configuration via Cloudflare API

TOKEN=$(cat ~/.wrangler/config/default.toml | grep oauth_token | cut -d'"' -f2)
ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"

echo "Fetching AI Gateway configuration..."
echo ""

curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-gateway/gateways" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" | jq '.'
