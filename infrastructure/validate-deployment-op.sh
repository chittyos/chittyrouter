#!/usr/bin/env bash

# ChittyOS Infrastructure Validation Script with 1Password
# Uses 'op' CLI to securely retrieve Cloudflare credentials

set -euo pipefail

echo "=========================================="
echo "ChittyOS Infrastructure Validation"
echo "Using 1Password for credentials"
echo "=========================================="

# 0) Setup with 1Password
echo -e "\n🔐 Retrieving credentials from 1Password..."

# Check if op is available and signed in
if ! command -v op &> /dev/null; then
  echo "❌ ERROR: 1Password CLI (op) not installed"
  echo "Install from: https://1password.com/downloads/command-line/"
  exit 1
fi

# Retrieve credentials from 1Password
# Assumes items are stored in 1Password with these exact names
# Adjust vault/item names as needed for your setup
CF_API_TOKEN=$(op read "op://Private/Cloudflare API/credential" 2>/dev/null || op read "op://Private/CF_API_TOKEN/password" 2>/dev/null) || {
  echo "❌ ERROR: Could not retrieve CF_API_TOKEN from 1Password"
  echo "Make sure you have an item named 'Cloudflare API' or 'CF_API_TOKEN' in 1Password"
  exit 1
}

CF_ACCOUNT_ID=$(op read "op://Private/Cloudflare API/account_id" 2>/dev/null || op read "op://Private/CF_ACCOUNT_ID/password" 2>/dev/null) || {
  echo "❌ ERROR: Could not retrieve CF_ACCOUNT_ID from 1Password"
  echo "Make sure you have the account ID stored in 1Password"
  exit 1
}

echo "✅ Credentials retrieved successfully"

API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json")

# 1) List zones and assert required domains
echo -e "\n📍 Checking DNS Zones..."
curl -s "${auth[@]}" "$API/zones" | jq -r '.result[].name' | tee /tmp/zones.txt

echo -e "\n✅ Required zones:"
grep -E '^(chitty\.cc|chittycorp\.com|nevershitty\.com|chicagoapps\.com)$' /tmp/zones.txt | sort -u || {
  echo "❌ ERROR: Missing required zones"
  exit 1
}

# 2) Capture zone IDs
echo -e "\n🆔 Capturing Zone IDs..."
declare -A zone_ids
for Z in chitty.cc chittycorp.com nevershitty.com chicagoapps.com; do
  zid=$(curl -s "${auth[@]}" "$API/zones?name=$Z" | jq -r '.result[0].id')
  if [ "$zid" != "null" ] && [ -n "$zid" ]; then
    echo "$Z=$zid"
    zone_ids["$Z"]="$zid"
    # Export for use in script
    export "${Z//./_}_id=$zid"
  else
    echo "❌ ERROR: Could not get zone ID for $Z"
    exit 1
  fi
done

# 3) DNS sanity: list records for chitty.cc core subdomains
echo -e "\n🔍 Checking chitty.cc subdomains..."
chitty_cc_id="${zone_ids[chitty.cc]}"
curl -s "${auth[@]}" "$API/zones/${chitty_cc_id}/dns_records?per_page=1000" | jq -r '.result[].name' | \
  grep -E '^(api|auth|id|chat|router|trace|docs|status)\.chitty\.cc$' | sort || {
  echo "⚠️  WARNING: Some expected subdomains may be missing"
}

# 4) Workers routes validation
echo -e "\n⚡ Checking Workers routes..."
workers_missing=0
for route in api auth id router trace status; do
  echo -n "  $route.chitty.cc: "
  found=$(curl -s "${auth[@]}" "$API/accounts/$CF_ACCOUNT_ID/workers/routes?zone_id=${chitty_cc_id}" | \
    jq -r --arg r "$route" '.result[] | select(.pattern | test("^" + $r + "\\.chitty\\.cc")) | .pattern' | head -1)

  if [ -n "$found" ]; then
    echo "✅ $found"
  else
    echo "❌ NOT FOUND"
    workers_missing=1
  fi
done

# 5) Pages: list projects and Deploy Hooks URLs
echo -e "\n📄 Checking Pages projects..."
curl -s "${auth[@]}" "$API/accounts/$CF_ACCOUNT_ID/pages/projects" | \
  jq -r '.result[] | "\(.name)\t\(.subdomain // "no-subdomain")\t\(.build_config.deployment_trigger.metadata.webhook_url // "no-hook")"' | \
  column -t -s $'\t'

# 6) Bulk Redirects validation
echo -e "\n↪️ Checking Bulk Redirects..."

# List redirect lists
echo "  Redirect Lists:"
curl -s "${auth[@]}" "$API/accounts/$CF_ACCOUNT_ID/rules/lists" | \
  jq -r '.result[] | select(.kind=="redirect") | "    - \(.name) (ID: \(.id))"'

# Check for chitty-aliases list
chitty_aliases_id=$(curl -s "${auth[@]}" "$API/accounts/$CF_ACCOUNT_ID/rules/lists" | \
  jq -r '.result[] | select(.kind=="redirect" and .name=="chitty-aliases") | .id')

if [ -n "$chitty_aliases_id" ] && [ "$chitty_aliases_id" != "null" ]; then
  echo "  ✅ chitty-aliases list found: $chitty_aliases_id"

  # Count items in list
  item_count=$(curl -s "${auth[@]}" "$API/accounts/$CF_ACCOUNT_ID/rules/lists/$chitty_aliases_id/items" | \
    jq -r '.result | length')
  echo "     Items in list: $item_count"
else
  echo "  ❌ chitty-aliases list NOT FOUND"
fi

# Check for active redirect rules
echo -e "\n  Active Redirect Rules:"
curl -s "${auth[@]}" "$API/accounts/$CF_ACCOUNT_ID/rulesets/phases/http_request_redirect/entrypoint" 2>/dev/null | \
  jq -r '.result.rules[] | "    - \(.description // "Unnamed") (ID: \(.id))"' || {
  echo "    No redirect rules found or endpoint not available"
}

# 7) HSTS and Security Headers check
echo -e "\n🔒 Security Configuration:"
echo "  Checking HSTS for chitty.cc..."
hsts_enabled=$(curl -s "${auth[@]}" "$API/zones/${chitty_cc_id}/settings/security_header" | \
  jq -r '.result.value.strict_transport_security.enabled // false')

if [ "$hsts_enabled" = "true" ]; then
  echo "  ✅ HSTS enabled"
else
  echo "  ⚠️  HSTS not enabled or not configured"
fi

# 8) Summary and exit status
echo -e "\n=========================================="
echo "Validation Summary:"
echo "=========================================="

missing=0

# Check zones
for need in chitty.cc chittycorp.com nevershitty.com chicagoapps.com; do
  if ! grep -qx "$need" /tmp/zones.txt; then
    echo "❌ MISSING zone: $need"
    missing=1
  fi
done

# Check Workers routes
if [ $workers_missing -eq 1 ]; then
  echo "❌ Some Workers routes are missing"
  missing=1
fi

# Check redirect lists
if [ -z "$chitty_aliases_id" ] || [ "$chitty_aliases_id" = "null" ]; then
  echo "❌ chitty-aliases redirect list not configured"
  missing=1
fi

if [ $missing -eq 0 ]; then
  echo "✅ All critical infrastructure components validated successfully!"
else
  echo "❌ Infrastructure validation failed - see errors above"
  exit 1
fi

# Cleanup
rm -f /tmp/zones.txt

# Clear sensitive variables
unset CF_API_TOKEN
unset CF_ACCOUNT_ID

echo -e "\n✨ Validation complete!"