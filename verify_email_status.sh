#!/bin/bash

echo "🔍 Email Routing Status Verification"
echo ""

# Check DNS MX records for chitty.cc
echo "1️⃣ DNS MX Records for chitty.cc:"
dig +short MX chitty.cc | head -5

echo ""
echo "2️⃣ Email Routing Destinations (if any):"
wrangler email routing list 2>/dev/null || echo "   No destinations configured or routing not enabled"

echo ""
echo "3️⃣ Email Worker Routes:"
# This would require API access, showing the manual check instead
echo "   Check: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e08121/chitty.cc/email/routing/routes"

echo ""
echo "4️⃣ Email Sender (test@chitty.local check):"
echo "   The test emails from 'nb@chitty.local' suggest LOCAL mail server, not Cloudflare"
echo "   Domain: chitty.local (not chitty.cc)"

echo ""
echo "📊 Conclusion:"
echo "   - If MX records show Cloudflare: Email Routing MAY be enabled"
echo "   - If no MX records: Email Routing is NOT enabled"
echo "   - Test emails were likely LOCAL system tests, not external"
