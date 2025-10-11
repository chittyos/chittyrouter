#!/bin/bash
# Setup Email Routing to prevent future email loss

echo "🚀 Configuring Email Routing for chitty.cc"
echo ""

ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e08121"
ZONE_ID="3ab6766c4f70b9ec5bd6bd5e8b06c18b"

echo "⚠️  CRITICAL: Emails are currently being REJECTED"
echo "   Reason: No destination addresses configured"
echo ""

echo "📋 Required Steps (MANUAL - Dashboard Required):"
echo ""
echo "1️⃣ Add Destination Email Address"
echo "   URL: https://dash.cloudflare.com/$ACCOUNT_ID/chitty.cc/email/routing/addresses"
echo "   Action: Click 'Add destination address'"
echo "   Add: no-reply@itcan.llc (or your preferred email)"
echo "   Status: MUST verify via email confirmation"
echo ""

echo "2️⃣ Create Catch-All Route"
echo "   URL: https://dash.cloudflare.com/$ACCOUNT_ID/chitty.cc/email/routing/routes"
echo "   Action: Click 'Create address' or 'Create route'"
echo "   Configure:"
echo "     - Type: Catch-all (*@chitty.cc)"
echo "     - Action: Send to address → no-reply@itcan.llc"
echo "     OR"
echo "     - Action: Run Worker → chittyos-email-worker"
echo ""

echo "3️⃣ Enable Email Routing (if needed)"
echo "   URL: https://dash.cloudflare.com/$ACCOUNT_ID/chitty.cc/email/routing/overview"
echo "   If not enabled, click 'Enable Email Routing'"
echo ""

echo "⏰ URGENCY: Until this is done, ALL emails to @chitty.cc are REJECTED"
echo ""

echo "🔍 Alternative: Check if emails went to spam/quarantine at senders"
echo "   Since emails were rejected, senders may have received bounce messages"
echo "   Contact important senders and ask them to resend after setup is complete"
echo ""

echo "📊 After Setup:"
echo "   - Future emails will be processed correctly"
echo "   - Worker will classify and route intelligently"
echo "   - Analytics will track all email activity"
