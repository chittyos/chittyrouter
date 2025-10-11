#!/bin/bash

echo "🏢 Cloudflare Account Information"
echo ""

echo "1️⃣ Account from Wrangler Config:"
grep -r "account_id" wrangler.toml 2>/dev/null | head -3

echo ""
echo "2️⃣ Account from Scripts:"
ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e08121"
echo "   Account ID: $ACCOUNT_ID"

echo ""
echo "3️⃣ Wrangler Whoami:"
wrangler whoami 2>&1

echo ""
echo "4️⃣ Account Details:"
echo "   Dashboard: https://dash.cloudflare.com/$ACCOUNT_ID"
echo "   Email Routing: https://dash.cloudflare.com/$ACCOUNT_ID/chitty.cc/email/routing/overview"

echo ""
echo "5️⃣ Zone Information:"
echo "   Domain: chitty.cc"
echo "   Zone ID: 3ab6766c4f70b9ec5bd6bd5e8b06c18b"
