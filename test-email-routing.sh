#!/bin/bash

# Test Email Routing End-to-End
# Run this after completing destination verification and worker route setup

echo "════════════════════════════════════════════════════════════════"
echo "🧪 Testing Email Routing - chittyos-email-worker"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."
echo ""

# Check 1: Destination verified
echo "1. Destination address (no-reply@itcan.llc)"
echo "   ⚠️  Ensure this is verified in Cloudflare dashboard"
echo ""

# Check 2: Worker route exists
echo "2. Worker route (*@chitty.cc → chittyos-email-worker)"
echo "   ⚠️  Ensure this exists in Email Workers tab"
echo ""

read -p "Are both prerequisites complete? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Complete setup first, then run this script again."
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🚀 Running Tests"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Test 1: Basic routing
echo "Test 1: Basic Email Routing"
echo "────────────────────────────────────────────────────────────────"
echo "Sending to: test@chitty.cc"
echo ""

echo "Testing basic email routing - $(date)" | \
  mail -s "Test 1: Basic Routing" test@chitty.cc

if [ $? -eq 0 ]; then
    echo "✅ Test email 1 sent"
else
    echo "❌ Failed to send test email 1"
fi
echo ""
sleep 2

# Test 2: Legal classification
echo "Test 2: Legal Email Classification"
echo "────────────────────────────────────────────────────────────────"
echo "Sending to: legal@chitty.cc"
echo ""

cat <<EOF | mail -s "URGENT: Arias v Bianchi Case 2024D007847" legal@chitty.cc
This is an urgent legal matter requiring immediate attention.

The court filing deadline is tomorrow. Please review the attached
documents and provide guidance on the settlement offer.

Case: Arias v Bianchi
Case Number: 2024D007847
Deadline: Tomorrow
Priority: Critical
EOF

if [ $? -eq 0 ]; then
    echo "✅ Test email 2 sent (should classify as litigation/critical)"
else
    echo "❌ Failed to send test email 2"
fi
echo ""
sleep 2

# Test 3: Finance email
echo "Test 3: Finance Email Classification"
echo "────────────────────────────────────────────────────────────────"
echo "Sending to: billing@chitty.cc"
echo ""

cat <<EOF | mail -s "Invoice #12345 - Payment Due \$5,000" billing@chitty.cc
Invoice Details:
- Invoice Number: #12345
- Amount: \$5,000.00
- Due Date: October 10, 2025
- Payment Method: Wire Transfer

Please process this payment by the due date to avoid late fees.
EOF

if [ $? -eq 0 ]; then
    echo "✅ Test email 3 sent (should classify as finance)"
else
    echo "❌ Failed to send test email 3"
fi
echo ""
sleep 2

# Test 4: BCC tracking
echo "Test 4: BCC Certified Tracking"
echo "────────────────────────────────────────────────────────────────"
echo "⚠️  This test requires email client with BCC support"
echo "   Manually send an email:"
echo "   • To: someone@example.com"
echo "   • BCC: bcc@chitty.cc"
echo "   • Subject: Test Certified Tracking"
echo ""
echo "   Then check logs for: 'Certified tracking enabled'"
echo ""

# Summary
echo "════════════════════════════════════════════════════════════════"
echo "📊 Test Summary"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "3 test emails sent:"
echo "  1. Basic routing → test@chitty.cc"
echo "  2. Legal (urgent) → legal@chitty.cc"
echo "  3. Finance (invoice) → billing@chitty.cc"
echo ""
echo "📧 Check Results:"
echo "  1. Inbox: no-reply@itcan.llc (should have 3 emails)"
echo "  2. Logs: Worker processing (running in background)"
echo "  3. Classification: AI analysis in logs"
echo ""
echo "🔍 Monitor logs:"
echo "  wrangler tail chittyos-email-worker --format pretty"
echo ""
echo "Expected in logs:"
echo "  [EMAIL-xxx] Email received"
echo "  [EMAIL-xxx] AI Classification: { ... }"
echo "  [EMAIL-xxx] Forwarding to no-reply@itcan.llc"
echo "  [EMAIL-xxx] Successfully forwarded"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

read -p "Open no-reply@itcan.llc inbox to check emails? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Opening email client..."
    open "mailto:no-reply@itcan.llc"
fi

echo ""
echo "✅ Testing complete!"
echo ""
