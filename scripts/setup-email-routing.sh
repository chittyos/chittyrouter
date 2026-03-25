#!/usr/bin/env bash
# setup-email-routing.sh
# Configure Cloudflare Email Routing for chitty.cc zone
# Routes all emails to the chittyrouter worker
#
# Prerequisites:
#   CLOUDFLARE_API_TOKEN must have:
#     - Zone > Email Routing Rules > Edit
#     - Zone > Zone > Read
#   for the chitty.cc zone
#
# Usage: CLOUDFLARE_API_TOKEN=<token> bash scripts/setup-email-routing.sh

set -euo pipefail

ZONE_ID="7a4f759e0928fb2be4772a2f72ad0df2"
ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"
WORKER_NAME="chittyrouter"
API_BASE="https://api.cloudflare.com/client/v4"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set"
  exit 1
fi

auth_header="Authorization: Bearer $CLOUDFLARE_API_TOKEN"

echo "=== Cloudflare Email Routing Setup for chitty.cc ==="
echo ""

# Step 1: Check email routing status
echo "[1/5] Checking email routing status..."
routing_status=$(curl -s "$API_BASE/zones/$ZONE_ID/email/routing" \
  -H "$auth_header" \
  -H "Content-Type: application/json")

if echo "$routing_status" | jq -e '.success == false' > /dev/null 2>&1; then
  echo "ERROR: Cannot access email routing API."
  echo "Response: $(echo "$routing_status" | jq -c '.errors')"
  echo ""
  echo "Your API token needs these permissions:"
  echo "  - Zone > Email Routing Rules > Edit"
  echo "  - Zone > Zone > Read"
  echo ""
  echo "Update your token at:"
  echo "  https://dash.cloudflare.com/$ACCOUNT_ID/api-tokens"
  exit 1
fi

enabled=$(echo "$routing_status" | jq -r '.result.enabled // false')
echo "  Email routing enabled: $enabled"

# Step 2: Enable email routing if not enabled
if [ "$enabled" != "true" ]; then
  echo "[2/5] Enabling email routing..."
  enable_result=$(curl -s -X POST "$API_BASE/zones/$ZONE_ID/email/routing/enable" \
    -H "$auth_header" \
    -H "Content-Type: application/json")
  if echo "$enable_result" | jq -e '.success' > /dev/null 2>&1; then
    echo "  Email routing enabled successfully"
  else
    echo "  WARNING: Could not enable email routing: $(echo "$enable_result" | jq -c '.errors')"
  fi
else
  echo "[2/5] Email routing already enabled, skipping"
fi

# Step 3: List existing rules
echo "[3/5] Listing existing email routing rules..."
existing_rules=$(curl -s "$API_BASE/zones/$ZONE_ID/email/routing/rules" \
  -H "$auth_header" \
  -H "Content-Type: application/json")

echo "  Existing rules:"
echo "$existing_rules" | jq -r '.result[]? | "  - [\(.enabled // false)] \(.matchers[0].value // "catch-all") -> \(.actions[0].type) \(.actions[0].value // .actions[0].value[]? // "")"' 2>/dev/null || echo "  (none)"
echo ""

# Step 4: Create specific address rules -> Worker
# These route specific addresses to the chittyrouter worker
ADDRESSES=(
  "evidence@chitty.cc"
  "legal@chitty.cc"
  "intake@chitty.cc"
  "calendar@chitty.cc"
)

echo "[4/5] Creating email routing rules for specific addresses..."
for addr in "${ADDRESSES[@]}"; do
  echo "  Creating rule: $addr -> Worker($WORKER_NAME)"
  result=$(curl -s -X POST "$API_BASE/zones/$ZONE_ID/email/routing/rules" \
    -H "$auth_header" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg addr "$addr" \
      --arg worker "$WORKER_NAME" \
      '{
        "actions": [{
          "type": "worker",
          "value": [$worker]
        }],
        "enabled": true,
        "matchers": [{
          "field": "to",
          "type": "literal",
          "value": $addr
        }],
        "name": ("Route " + $addr + " to " + $worker)
      }')")

  if echo "$result" | jq -e '.success' > /dev/null 2>&1; then
    rule_id=$(echo "$result" | jq -r '.result.tag // .result.id // "unknown"')
    echo "    OK (rule: $rule_id)"
  else
    error=$(echo "$result" | jq -c '.errors')
    echo "    FAILED: $error"
  fi
done

# Step 5: Set catch-all rule to route to worker
echo "[5/5] Configuring catch-all rule -> Worker($WORKER_NAME)..."

# First check if there's an existing catch-all
catchall_id=$(echo "$existing_rules" | jq -r '.result[]? | select(.matchers[0].type == "all") | .tag // .id' 2>/dev/null | head -1)

if [ -n "$catchall_id" ] && [ "$catchall_id" != "null" ]; then
  echo "  Updating existing catch-all rule ($catchall_id)..."
  result=$(curl -s -X PUT "$API_BASE/zones/$ZONE_ID/email/routing/rules/$catchall_id" \
    -H "$auth_header" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg worker "$WORKER_NAME" \
      '{
        "actions": [{
          "type": "worker",
          "value": [$worker]
        }],
        "enabled": true,
        "matchers": [{
          "type": "all"
        }],
        "name": "Catch-all to chittyrouter"
      }')")
else
  echo "  Creating new catch-all rule..."
  # The catch-all uses the dedicated catch-all endpoint
  result=$(curl -s -X PUT "$API_BASE/zones/$ZONE_ID/email/routing/rules/catch_all" \
    -H "$auth_header" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg worker "$WORKER_NAME" \
      '{
        "actions": [{
          "type": "worker",
          "value": [$worker]
        }],
        "enabled": true,
        "matchers": [{
          "type": "all"
        }],
        "name": "Catch-all to chittyrouter"
      }')")
fi

if echo "$result" | jq -e '.success' > /dev/null 2>&1; then
  echo "  Catch-all rule configured successfully"
else
  echo "  FAILED: $(echo "$result" | jq -c '.errors')"
  echo ""
  echo "  NOTE: If catch-all failed, the specific address rules above should"
  echo "  still work for evidence@, legal@, intake@, calendar@chitty.cc"
fi

echo ""
echo "=== Verification ==="
echo ""

# Final: list all rules
final_rules=$(curl -s "$API_BASE/zones/$ZONE_ID/email/routing/rules" \
  -H "$auth_header" \
  -H "Content-Type: application/json")

echo "Active email routing rules:"
echo "$final_rules" | jq -r '.result[]? | "  [\(if .enabled then "ACTIVE" else "DISABLED" end)] \(.matchers[0].value // "catch-all (*@chitty.cc)") -> \(.actions[0].type):\(.actions[0].value // .actions[0].value[]? // "")"' 2>/dev/null || echo "  (none found)"

# Also get catch-all specifically
echo ""
echo "Catch-all rule:"
catchall=$(curl -s "$API_BASE/zones/$ZONE_ID/email/routing/rules/catch_all" \
  -H "$auth_header" \
  -H "Content-Type: application/json")
echo "$catchall" | jq '.result | {enabled, actions, matchers}' 2>/dev/null || echo "  Not configured"

echo ""
echo "=== DNS Check ==="
echo "MX records should point to route{1,2,3}.mx.cloudflare.net"
echo "SPF should include ~all or include:_spf.mx.cloudflare.net"
echo ""
echo "Done. Send a test email to evidence@chitty.cc to verify."
