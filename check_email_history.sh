#!/bin/bash
# Check for email delivery logs and analytics

ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e08121"
ZONE_ID="3ab6766c4f70b9ec5bd6bd5e8b06c18b"  # chitty.cc

echo "📧 Checking Email Routing Analytics for Past Week..."
echo ""

# Check wrangler for recent logs
echo "1️⃣ Recent Worker Logs (last 24 hours):"
echo "Running: wrangler tail chittyos-email-worker --once"
timeout 5 wrangler tail chittyos-email-worker --once 2>/dev/null || echo "   No recent logs available"

echo ""
echo "2️⃣ Email Analytics:"
echo "   Dashboard: https://dash.cloudflare.com/$ACCOUNT_ID/chitty.cc/email/routing/analytics"
echo ""

# Check if we have KV analytics stored
echo "3️⃣ Checking KV Analytics Storage..."
wrangler kv:namespace list 2>/dev/null | grep -i email || echo "   No KV namespaces found for email analytics"

echo ""
echo "4️⃣ Email Routing Configuration:"
curl -s https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing 2>/dev/null | jq -r '.result | "Enabled: \(.enabled // false)\nCreated: \(.created // "unknown")"' || echo "   Unable to fetch routing config"

