#!/bin/bash
# Check Email Routing status via Cloudflare API

ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"
ZONE_ID="3ab6766c4f70b9ec5bd6bd5e8b06c18b"  # chitty.cc zone ID

# Read API token from environment or 1Password
if [ -z "$CF_API_TOKEN" ]; then
    echo "Getting Cloudflare API token from 1Password..."
    export CF_API_TOKEN=$(op read "op://Employee/Cloudflare API Token - ChittyCorp/credential")
fi

echo "Checking Email Routing for chitty.cc..."
echo ""

# Check if Email Routing is enabled
echo "1️⃣  Email Routing Status:"
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.result | "Status: \(.enabled // "not enabled")"'

echo ""
echo "2️⃣  Email Worker Routes:"
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.result[] | "- \(.matchers[0].field): \(.matchers[0].value) → \(.actions[0].value[0])"' || echo "No routes configured"

echo ""
echo "3️⃣  Destination Addresses:"
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/email/routing/addresses" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.result[] | "- \(.email): \(.verified)"'

