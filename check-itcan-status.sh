#!/bin/bash

# Quick Migration Status Checker

DOMAIN="itcan.llc"
DESTINATION="no-reply@itcan.llc"

echo "════════════════════════════════════════════════════════════════"
echo "📊 itcan.llc Migration Status Check"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check 1: DNS Nameservers
echo "1️⃣  Nameservers (Should be Cloudflare):"
NS=$(dig NS $DOMAIN +short | head -3)
if echo "$NS" | grep -q cloudflare; then
    echo "   ✅ Using Cloudflare nameservers:"
    echo "$NS" | sed 's/^/      /'
else
    echo "   ❌ Not using Cloudflare nameservers yet:"
    echo "$NS" | sed 's/^/      /'
fi
echo ""

# Check 2: MX Records
echo "2️⃣  MX Records (For email routing):"
MX=$(dig MX $DOMAIN +short)
if echo "$MX" | grep -q cloudflare; then
    echo "   ✅ Cloudflare MX records found:"
    echo "$MX" | sed 's/^/      /'
else
    echo "   ❌ Cloudflare MX records not found:"
    if [ -z "$MX" ]; then
        echo "      (No MX records)"
    else
        echo "$MX" | sed 's/^/      /'
    fi
fi
echo ""

# Check 3: A Record
echo "3️⃣  A Record (Domain resolution):"
A=$(dig A $DOMAIN +short | head -1)
if [ ! -z "$A" ]; then
    echo "   ✅ Resolves to: $A"
else
    echo "   ⚠️  No A record found"
fi
echo ""

# Check 4: Worker Status
echo "4️⃣  Email Worker:"
WORKER_STATUS=$(wrangler deployments list --name chittyos-email-worker 2>&1 | grep -i "created" || echo "")
if [ ! -z "$WORKER_STATUS" ]; then
    echo "   ✅ chittyos-email-worker is deployed"
else
    echo "   ❌ Worker status unknown"
fi
echo ""

# Summary
echo "════════════════════════════════════════════════════════════════"
echo "📋 Next Steps:"
echo "════════════════════════════════════════════════════════════════"
echo ""

if ! echo "$NS" | grep -q cloudflare; then
    echo "⏳ Waiting for nameserver propagation..."
    echo "   • Check again in 15-30 minutes"
    echo "   • Can take up to 24 hours"
fi

if echo "$NS" | grep -q cloudflare && ! echo "$MX" | grep -q cloudflare; then
    echo "📧 Enable Email Routing:"
    echo "   • https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/$DOMAIN/email"
    echo "   • Click 'Enable Email Routing'"
fi

if echo "$MX" | grep -q cloudflare; then
    echo "✅ Add destination address:"
    echo "   • https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/$DOMAIN/email/routing/addresses"
    echo "   • Add: $DESTINATION"
    echo "   • Verify via email"
    echo ""
    echo "✅ Create worker route:"
    echo "   • https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/chitty.cc/email/routing/routes"
    echo "   • Matcher: *@chitty.cc → chittyos-email-worker"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
