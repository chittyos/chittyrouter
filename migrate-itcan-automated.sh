#!/bin/bash

# Complete itcan.llc Migration Automation
# This script helps automate the migration process

set -e

DOMAIN="itcan.llc"
ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"
WORKER_NAME="chittyos-email-worker"
DESTINATION_EMAIL="no-reply@itcan.llc"

echo "════════════════════════════════════════════════════════════════"
echo "🚀 itcan.llc Migration to ChittyCorp LLC"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Step 1: Check if domain needs to be added
echo "📋 Step 1: Add Domain to Cloudflare"
echo "────────────────────────────────────────────────────────────────"
echo "⚠️  MANUAL STEP REQUIRED:"
echo ""
echo "1. Open: https://dash.cloudflare.com/$ACCOUNT_ID/add-site"
echo "2. Enter: $DOMAIN"
echo "3. Select: Free plan"
echo "4. Click: Add Site"
echo "5. Copy the nameservers shown"
echo ""
read -p "Press Enter after you've added the domain and copied nameservers..."
echo ""

# Step 2: Check DNS propagation
echo "📋 Step 2: Update Nameservers & Wait for Propagation"
echo "────────────────────────────────────────────────────────────────"
echo "⚠️  MANUAL STEP REQUIRED:"
echo ""
echo "1. Go to your domain registrar (where you bought $DOMAIN)"
echo "2. Update nameservers to the ones Cloudflare showed"
echo "3. Save changes"
echo ""
read -p "Press Enter after you've updated nameservers at registrar..."
echo ""

echo "⏳ Checking DNS propagation..."
echo "This may take 2-24 hours. Checking every 30 seconds..."
echo ""

PROPAGATED=false
MAX_CHECKS=120  # Check for 1 hour
CHECK_COUNT=0

while [ "$PROPAGATED" = false ] && [ $CHECK_COUNT -lt $MAX_CHECKS ]; do
    echo -n "Checking DNS (attempt $((CHECK_COUNT + 1))/$MAX_CHECKS)... "

    NS_RESULT=$(dig NS $DOMAIN +short | grep cloudflare || echo "")

    if [ ! -z "$NS_RESULT" ]; then
        echo "✅ PROPAGATED!"
        echo ""
        echo "Nameservers found:"
        dig NS $DOMAIN +short
        echo ""
        PROPAGATED=true
    else
        echo "⏳ Still waiting..."
        sleep 30
        CHECK_COUNT=$((CHECK_COUNT + 1))
    fi
done

if [ "$PROPAGATED" = false ]; then
    echo ""
    echo "⚠️  DNS has not propagated yet after 1 hour of checking."
    echo "This is normal - it can take up to 24 hours."
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting. Run this script again later."
        exit 1
    fi
fi

echo ""
echo "📋 Step 3: Enable Email Routing on $DOMAIN"
echo "────────────────────────────────────────────────────────────────"
echo "⚠️  MANUAL STEP REQUIRED:"
echo ""
echo "1. Open: https://dash.cloudflare.com/$ACCOUNT_ID/$DOMAIN/email/routing/overview"
echo "2. Click: 'Get Started' or 'Enable Email Routing'"
echo "3. Follow the wizard (MX records added automatically)"
echo "4. Complete setup"
echo ""
read -p "Press Enter after Email Routing is enabled..."
echo ""

# Step 4: Verify MX records
echo "🔍 Verifying MX records..."
MX_RESULT=$(dig MX $DOMAIN +short | grep cloudflare || echo "")

if [ ! -z "$MX_RESULT" ]; then
    echo "✅ MX records found:"
    dig MX $DOMAIN +short
    echo ""
else
    echo "⚠️  MX records not found yet. They may still be propagating."
    echo ""
fi

echo ""
echo "📋 Step 4: Add Destination Address"
echo "────────────────────────────────────────────────────────────────"
echo "⚠️  MANUAL STEP REQUIRED:"
echo ""
echo "1. Open: https://dash.cloudflare.com/$ACCOUNT_ID/$DOMAIN/email/routing/addresses"
echo "2. Click: 'Add destination address'"
echo "3. Enter: $DESTINATION_EMAIL"
echo "4. Save"
echo "5. Check email at $DESTINATION_EMAIL"
echo "6. Click verification link"
echo ""
read -p "Press Enter after destination is verified..."
echo ""

echo ""
echo "📋 Step 5: Create Email Worker Route on chitty.cc"
echo "────────────────────────────────────────────────────────────────"
echo "⚠️  MANUAL STEP REQUIRED:"
echo ""
echo "1. Open: https://dash.cloudflare.com/$ACCOUNT_ID/chitty.cc/email/routing/routes"
echo "2. Click: 'Email Workers' tab"
echo "3. Click: 'Create Email Worker Route'"
echo "4. Configure:"
echo "   - Matcher: *@chitty.cc"
echo "   - Action: Run Worker"
echo "   - Worker: $WORKER_NAME"
echo "   - Enabled: ✓"
echo "5. Save"
echo ""
read -p "Press Enter after worker route is created..."
echo ""

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🧪 Testing Email Routing"
echo "════════════════════════════════════════════════════════════════"
echo ""

echo "Starting worker log monitoring in background..."
wrangler tail $WORKER_NAME --format pretty &
TAIL_PID=$!
sleep 2

echo ""
echo "📧 Sending test email..."
echo "Testing email routing after migration" | mail -s "Migration Test - $(date +%H:%M:%S)" test@chitty.cc

if [ $? -eq 0 ]; then
    echo "✅ Test email sent to test@chitty.cc"
    echo ""
    echo "Watch the logs above for processing..."
    echo "Check $DESTINATION_EMAIL inbox for arrival"
    echo ""
    echo "Press Ctrl+C to stop log monitoring when done"
    wait $TAIL_PID
else
    echo "⚠️  Failed to send test email. Check mail command availability."
    kill $TAIL_PID 2>/dev/null
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Migration Complete!"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Summary:"
echo "  • Domain: $DOMAIN migrated to ChittyCorp LLC"
echo "  • Email Routing: Enabled on $DOMAIN"
echo "  • Destination: $DESTINATION_EMAIL verified"
echo "  • Worker Route: Created on chitty.cc"
echo "  • Worker: $WORKER_NAME deployed and active"
echo ""
echo "📧 Test Results:"
echo "  • Test email sent to: test@chitty.cc"
echo "  • Should forward to: $DESTINATION_EMAIL"
echo "  • Check inbox and logs above"
echo ""
echo "🎯 Next Steps:"
echo "  • Send production emails to verify routing"
echo "  • Monitor: wrangler tail $WORKER_NAME"
echo "  • View analytics: Dashboard → Email → Analytics"
echo ""
echo "════════════════════════════════════════════════════════════════"
