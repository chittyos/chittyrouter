# Email Routing Management & Feedback System

## 🔄 How Email Routing Works

### Flow Overview
```
Email Received → AI Analysis → Route to Workstream → Forward → Track → Feedback
```

**1. Email Reception** (chittyos-email-worker)
- Receives email via Cloudflare Email Routing
- Generates transaction ID: `EMAIL-{timestamp}-{random}`
- Extracts domain, sender, recipient

**2. AI Analysis** (Workers AI)
- Classification: legal, financial, technical, personal, etc.
- Sentiment: positive, neutral, negative
- Urgency: critical, high, medium, low
- Entity extraction: names, amounts, dates

**3. Workstream Routing**
- **Litigation**: Legal cases, court docs, attorney communications
- **Finance**: Invoices, payments, accounting
- **Compliance**: Regulatory, audits, documentation
- **Operations**: Day-to-day business

**4. Forwarding**
- To: Configured destination (default: `no-reply@itcan.llc`)
- Logs: Transaction ID, routing decision, AI insights

**5. Tracking & Feedback**
- Analytics logged to KV storage
- Webhooks sent for priority emails
- Feedback sent to chitty.cc senders

---

## 📊 Confirming Routing is Working

### Method 1: Real-Time Logs
```bash
wrangler tail chittyos-email-worker --format pretty
```

**What to look for:**
```
[EMAIL-1234567890-abc123] Email received: {
  from: "sender@example.com",
  to: "test@chitty.cc",
  domain: "chitty.cc",
  bccTracked: false,
  timestamp: "2025-10-03T..."
}
[EMAIL-1234567890-abc123] AI Classification: {
  classification: "business",
  sentiment: 0.8,
  urgency: "medium"
}
[EMAIL-1234567890-abc123] Forwarding to no-reply@itcan.llc
[EMAIL-1234567890-abc123] Successfully forwarded
```

### Method 2: Cloudflare Dashboard Analytics
**URL**: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/chitty.cc/email/routing/analytics

**Metrics:**
- ✅ Emails received (total count)
- ✅ Emails forwarded (success rate)
- ✅ Emails rejected (errors)
- ✅ Processing time (performance)

### Method 3: Transaction ID Tracking
Every email gets a unique transaction ID logged to:
- Console logs (wrangler tail)
- Analytics KV storage (30-day retention)
- Feedback notifications (if enabled)

**View transaction:**
```
https://portal.chitty.cc/tracking/{TRANSACTION_ID}
```

### Method 4: Test Emails
```bash
# Send test email
mail -s "Test Email" test@chitty.cc <<< "Testing routing"

# Check logs immediately
wrangler tail chittyos-email-worker --format pretty
```

---

## 🔁 Feedback Loop to Users

### Automatic Feedback (for @chitty.cc senders)

**Trigger**: Email FROM any @chitty.cc address
**Enabled**: Set `FEEDBACK_ENABLED=true` environment variable

**Feedback Contains:**
```
ChittyOS Email Routing Confirmation

Transaction ID: EMAIL-1696348800-xyz789
From: nick@chitty.cc
To: client@example.com
Forwarded to: no-reply@itcan.llc
Priority: High

AI Analysis:
- Classification: litigation
- Sentiment: neutral
- Urgency: critical
- Entities detected: 3

✓ Certified tracking enabled (bcc@chitty.cc detected)

View details: https://portal.chitty.cc/tracking/EMAIL-1696348800-xyz789
```

**How it works:**
1. Worker detects sender is @chitty.cc
2. Builds feedback message with routing details
3. Sends POST to `{TRACKING_ROUTER_URL}/feedback`
4. Feedback delivered via notification system

### Enable Feedback
```bash
# Update environment variable
wrangler secret put FEEDBACK_ENABLED
# Enter: true

# Or in wrangler.toml
[vars]
FEEDBACK_ENABLED = "true"
```

---

## 📈 Analytics & Tracking

### 1. KV Storage Analytics
**Namespace**: `EMAIL_ANALYTICS` (if configured)

**Data stored per email:**
```json
{
  "transactionId": "EMAIL-...",
  "action": "forwarded",
  "from": "sender@example.com",
  "to": "recipient@chitty.cc",
  "forwardedTo": "destination@itcan.llc",
  "domain": "chitty.cc",
  "processingTime": 342,
  "priority": true,
  "size": 12845,
  "timestamp": "2025-10-03T..."
}
```

**Retention**: 30 days

### 2. Priority Email Webhooks
**Trigger**: Email marked as priority (urgency: high/critical)
**Endpoint**: `WEBHOOK_URL` environment variable

**Webhook payload:**
```json
{
  "transactionId": "EMAIL-...",
  "event": "priority_email",
  "from": "sender@example.com",
  "to": "legal@chitty.cc",
  "subject": "Urgent: Court Filing Due Tomorrow",
  "domain": "chitty.cc",
  "timestamp": "2025-10-03T..."
}
```

### 3. Workstream Routing Notifications
Emails are routed to specialized workers:

**Litigation** → `EVIDENCE_ROUTER_URL`
- Stores in evidence system
- Links to case management
- Sends to legal team

**Finance** → `FINANCE_ROUTER_URL`
- Extracts amounts, dates
- Routes to accounting
- Tracks invoices/receipts

**Compliance** → `COMPLIANCE_ROUTER_URL`
- Regulatory tracking
- Audit trail
- Documentation storage

### 4. BCC Certified Tracking
**Trigger**: Email BCC to `bcc@chitty.cc`
**Function**: Certified delivery proof

**Tracking includes:**
```json
{
  "transactionId": "EMAIL-...",
  "from": "sender@example.com",
  "to": "recipient@example.com",
  "bccCertified": true,
  "timestamp": "2025-10-03T...",
  "deliveryProof": {
    "messageId": "...",
    "forwarded": true,
    "aiClassification": {...}
  }
}
```

**Stored at**: `{TRACKING_ROUTER_URL}/certified/{TRANSACTION_ID}`

---

## 🔧 Configuration for Feedback & Tracking

### Required Environment Variables
```toml
# wrangler.toml
[vars]
FEEDBACK_ENABLED = "true"
TRACKING_ROUTER_URL = "https://router.chitty.cc"
DEFAULT_FORWARD = "no-reply@itcan.llc"

# Optional: Workstream routers
EVIDENCE_ROUTER_URL = "https://router.chitty.cc/evidence"
FINANCE_ROUTER_URL = "https://router.chitty.cc/finance"
COMPLIANCE_ROUTER_URL = "https://router.chitty.cc/compliance"

# Optional: Webhooks
WEBHOOK_URL = "https://api.chitty.cc/webhooks/email"
```

### Optional KV Namespaces
```toml
# For analytics storage
[[kv_namespaces]]
binding = "EMAIL_ANALYTICS"
id = "your-kv-namespace-id"

# For financial email tracking
[[kv_namespaces]]
binding = "FINANCIAL_EMAILS"
id = "your-financial-kv-id"
```

### Deploy with Feedback Enabled
```bash
cd /tmp/email-worker

# Update wrangler.toml
cat >> wrangler.toml << 'EOF'

[vars]
FEEDBACK_ENABLED = "true"
TRACKING_ROUTER_URL = "https://router.chitty.cc"
WEBHOOK_URL = "https://api.chitty.cc/webhooks/email"
EOF

# Redeploy
wrangler deploy
```

---

## 🧪 Testing the Feedback Loop

### Test 1: Basic Feedback (from @chitty.cc)
```bash
# Send email FROM chitty.cc address
mail -s "Test Feedback" \
  -a "From: nick@chitty.cc" \
  recipient@example.com <<< "Testing feedback loop"

# Check for feedback POST in logs
wrangler tail chittyos-email-worker --format pretty | grep feedback
```

**Expected log:**
```
[EMAIL-...] Feedback sent to nick@chitty.cc
```

### Test 2: Priority Email Webhook
```bash
# Send urgent email
mail -s "URGENT: Legal Matter" \
  legal@chitty.cc <<< "Requires immediate attention"

# Check webhook was sent
wrangler tail chittyos-email-worker | grep webhook
```

### Test 3: BCC Certified Tracking
```bash
# Send with BCC to bcc@chitty.cc
# (Use email client with BCC support)
# To: someone@example.com
# BCC: bcc@chitty.cc

# Check logs for certified tracking
wrangler tail chittyos-email-worker | grep -i "certified"
```

**Expected:**
```
[EMAIL-...] BCC tracked: true
[EMAIL-...] Certified tracking enabled
[EMAIL-...] Sent to certified tracking system
```

---

## 📊 Monitoring Dashboard (Future)

### Proposed ChittyOS Email Dashboard
**URL**: `https://portal.chitty.cc/email`

**Features:**
- Real-time email processing stats
- Transaction ID search
- Routing decisions view
- AI insights visualization
- Certified tracking history
- Workstream distribution charts
- Alert configuration

### Weekly Impact Reports
**Automated cron**: Monday 9:00 AM

**Report includes:**
- Total emails processed
- Workstream breakdown (litigation, finance, compliance, ops)
- AI classification distribution
- Urgency levels
- Top domains/senders
- Average processing time
- Key insights and trends

**Enable cron:**
```toml
[[triggers.crons]]
cron = "0 9 * * 1"  # Monday 9am
```

---

## 🔍 Troubleshooting Routing Issues

### Issue: Emails not being forwarded
**Check:**
1. ✓ Destination address verified in Cloudflare
2. ✓ Worker route is enabled
3. ✓ Check logs for forward errors

```bash
wrangler tail chittyos-email-worker | grep -i "forward"
```

### Issue: No feedback received
**Check:**
1. ✓ `FEEDBACK_ENABLED = "true"` set
2. ✓ Sender is @chitty.cc address
3. ✓ `TRACKING_ROUTER_URL` configured
4. ✓ Check logs for feedback attempts

```bash
wrangler tail chittyos-email-worker | grep -i "feedback"
```

### Issue: Analytics not working
**Check:**
1. ✓ `EMAIL_ANALYTICS` KV namespace bound
2. ✓ Check logs for analytics errors
3. ✓ Verify KV namespace ID

```bash
wrangler kv:namespace list | grep EMAIL_ANALYTICS
```

### Issue: Webhooks not firing
**Check:**
1. ✓ `WEBHOOK_URL` environment variable set
2. ✓ Email is marked as priority
3. ✓ Check webhook endpoint is reachable

```bash
curl -X POST $WEBHOOK_URL -H "Content-Type: application/json" -d '{"test": true}'
```

---

## 📋 Routing Management Checklist

### Daily
- [ ] Monitor real-time logs for errors
- [ ] Check forwarding success rate
- [ ] Review priority email alerts

### Weekly
- [ ] Review impact report (Monday 9am)
- [ ] Analyze workstream distribution
- [ ] Check for routing anomalies

### Monthly
- [ ] Review analytics retention
- [ ] Update domain configurations
- [ ] Test feedback loop functionality
- [ ] Verify destination addresses

---

## 🎯 Summary

### ✅ Routing Confirmation Methods
1. **Real-time logs** - `wrangler tail`
2. **Cloudflare Analytics** - Dashboard metrics
3. **Transaction ID tracking** - Unique ID per email
4. **Test emails** - Verify end-to-end

### ✅ Feedback Loop Components
1. **Automatic feedback** - For @chitty.cc senders (when enabled)
2. **Analytics storage** - KV namespace (30-day retention)
3. **Priority webhooks** - Real-time alerts for urgent emails
4. **Workstream routing** - Evidence/finance/compliance systems
5. **BCC certified tracking** - Delivery proof system

### ✅ Enable Full Tracking
```bash
# Set environment variables
wrangler secret put FEEDBACK_ENABLED
# Enter: true

wrangler secret put WEBHOOK_URL
# Enter: https://api.chitty.cc/webhooks/email

# Redeploy
wrangler deploy
```

---

**All systems deployed and ready for configuration! 🚀**
