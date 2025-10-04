# Email Routing Quick Start Guide

## 🚀 5-Minute Setup

### Step 1: Enable Feedback Loop (30 seconds)
```bash
cd /Users/nb/.claude/projects/-/CHITTYOS/chittyos-services/chittyrouter

# Enable automatic feedback to senders
wrangler secret put FEEDBACK_ENABLED --name chittyos-email-worker
# Enter: true
```

### Step 2: Configure Cloudflare Email Routing (2 minutes)
1. Open: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/chitty.cc/email/routing/overview
2. Click **"Get Started"** → Follow wizard
3. Click **"Email Workers"** tab → **"Create Route"**
4. Set:
   - Matcher: `*@chitty.cc`
   - Worker: `chittyos-email-worker`
   - Enabled: ✓
5. Save

### Step 3: Add Destination Address (1 minute)
1. Click **"Destination addresses"** → **"Add address"**
2. Enter: `no-reply@itcan.llc`
3. Check email → Click verification link

### Step 4: Test (1 minute)
```bash
# Send test email
echo "Testing email routing" | mail -s "Test Email" test@chitty.cc

# Monitor in real-time
wrangler tail chittyos-email-worker --format pretty
```

---

## 📊 How to Confirm Routing Works

### ✅ Check Logs (Real-Time)
```bash
wrangler tail chittyos-email-worker --format pretty
```

**Look for:**
- `[EMAIL-xxx] Email received` ← Email arrived
- `[EMAIL-xxx] AI Classification:` ← AI analyzed
- `[EMAIL-xxx] Forwarding to` ← Being sent
- `[EMAIL-xxx] Successfully forwarded` ← Success!

### ✅ Check Dashboard (Analytics)
**URL**: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/chitty.cc/email/routing/analytics

**Metrics:**
- Total received ← Should increase with each test
- Total forwarded ← Should match received
- Errors ← Should be 0

### ✅ Check Destination Inbox
- Email should arrive at `no-reply@itcan.llc`
- Subject unchanged
- Body unchanged
- (Note: Headers added but not visible to recipient)

---

## 🔁 Understanding the Feedback Loop

### What Happens When You Send Email

```
1. You send: you@chitty.cc → someone@example.com
                ↓
2. Worker receives it
                ↓
3. AI analyzes:
   - Classification: "business"
   - Sentiment: "positive"
   - Urgency: "medium"
                ↓
4. Routes to workstream:
   - If legal → litigation router
   - If invoice → finance router
   - If audit → compliance router
                ↓
5. Forwards to: no-reply@itcan.llc
                ↓
6. Sends you feedback (IF ENABLED):
   ┌─────────────────────────────────────┐
   │ ChittyOS Email Routing Confirmation │
   │                                     │
   │ Transaction ID: EMAIL-xxx-yyy       │
   │ From: you@chitty.cc                 │
   │ To: someone@example.com             │
   │ Forwarded to: no-reply@itcan.llc    │
   │ Priority: Normal                    │
   │                                     │
   │ AI Analysis:                        │
   │ - Classification: business          │
   │ - Sentiment: positive               │
   │ - Urgency: medium                   │
   │                                     │
   │ View: portal.chitty.cc/tracking/... │
   └─────────────────────────────────────┘
```

### Types of Feedback

#### 1. Automatic Feedback (to senders)
**When**: Email FROM @chitty.cc
**Where**: Sent to `{TRACKING_ROUTER_URL}/feedback`
**Contains**: Transaction ID, routing decision, AI insights

#### 2. Priority Webhooks
**When**: Email urgency = high/critical
**Where**: Sent to `WEBHOOK_URL`
**Contains**: Alert for immediate attention

#### 3. Analytics Logging
**When**: Every email
**Where**: KV storage (30-day retention)
**Contains**: Full routing metadata

#### 4. BCC Certified Tracking
**When**: Email BCC to `bcc@chitty.cc`
**Where**: Sent to `{TRACKING_ROUTER_URL}/certified`
**Contains**: Delivery proof for legal compliance

---

## 🎯 Common Use Cases

### Use Case 1: Legal Email Tracking
**Scenario**: You need proof an email was sent

**How:**
```
To: attorney@example.com
BCC: bcc@chitty.cc
Subject: Settlement Offer - Case 2024D007847

[Email content]
```

**What happens:**
- ✅ Email forwarded to attorney
- ✅ BCC tracking detects bcc@chitty.cc
- ✅ Certified delivery record created
- ✅ Transaction ID logged
- ✅ Retrievable for legal evidence

### Use Case 2: Priority Legal Matter
**Scenario**: Urgent court filing needs immediate attention

**How:**
```
To: legal@chitty.cc
Subject: URGENT: Court Filing Due Tomorrow

[Email content with urgent keywords]
```

**What happens:**
- ✅ AI detects urgency: "critical"
- ✅ Classified as: "litigation"
- ✅ Routed to: litigation workstream
- ✅ Webhook sent: priority_email alert
- ✅ Forwarded with: high priority flag

### Use Case 3: Invoice Processing
**Scenario**: Accounting needs to track an invoice

**How:**
```
To: billing@chitty.cc
Subject: Invoice #12345 - Payment Due $5,000

[Invoice details]
```

**What happens:**
- ✅ AI classifies: "finance"
- ✅ Entities extracted: amounts, dates
- ✅ Routed to: finance workstream
- ✅ Stored in: financial tracking
- ✅ Linked to: accounting system

### Use Case 4: Personal Copy
**Scenario**: Want a copy in your own inbox

**How:**
```
From: nick@chitty.cc
To: client@example.com
BCC: nick@chitty.cc

[Email content]
```

**What happens:**
- ✅ Detects: namespace copy (you@chitty.cc → you@chitty.cc)
- ✅ Logs: copy recorded
- ✅ Prevents: duplicate forwarding
- ✅ Note: compliance tracking maintained

---

## 🔧 Enable Advanced Features

### Enable Feedback (Users get routing confirmations)
```bash
wrangler secret put FEEDBACK_ENABLED --name chittyos-email-worker
# Enter: true
```

### Enable Priority Webhooks (Real-time alerts)
```bash
wrangler secret put WEBHOOK_URL --name chittyos-email-worker
# Enter: https://api.chitty.cc/webhooks/email
```

### Enable Analytics Storage (30-day history)
```bash
# Create KV namespace
wrangler kv:namespace create EMAIL_ANALYTICS

# Add to wrangler.toml
[[kv_namespaces]]
binding = "EMAIL_ANALYTICS"
id = "your-namespace-id"

# Redeploy
wrangler deploy
```

---

## 📈 Monitor Everything

### Real-Time Monitoring
```bash
# All logs
wrangler tail chittyos-email-worker --format pretty

# Only email receipts
wrangler tail chittyos-email-worker | grep "Email received"

# Only forwarding
wrangler tail chittyos-email-worker | grep "forwarded"

# Only errors
wrangler tail chittyos-email-worker | grep -i error

# Only feedback
wrangler tail chittyos-email-worker | grep -i feedback
```

### Check Specific Transaction
```bash
# Get transaction ID from logs: EMAIL-1696348800-xyz789
# View details at:
open "https://portal.chitty.cc/tracking/EMAIL-1696348800-xyz789"
```

---

## 🧪 Quick Tests

### Test 1: Basic Routing
```bash
echo "Test" | mail -s "Basic Test" test@chitty.cc
wrangler tail chittyos-email-worker | grep "Successfully forwarded"
```
**Expected**: ✅ Email forwarded to no-reply@itcan.llc

### Test 2: AI Classification
```bash
echo "Urgent legal matter requiring immediate attention" | \
  mail -s "URGENT: Court Filing" legal@chitty.cc
wrangler tail chittyos-email-worker | grep "classification"
```
**Expected**: ✅ Classification: litigation, Urgency: critical

### Test 3: Feedback Loop (requires @chitty.cc sender)
```bash
# Use email client to send FROM nick@chitty.cc TO someone@example.com
wrangler tail chittyos-email-worker | grep "Feedback sent"
```
**Expected**: ✅ Feedback sent to nick@chitty.cc

### Test 4: BCC Tracking
```bash
# Use email client with BCC support
# To: someone@example.com, BCC: bcc@chitty.cc
wrangler tail chittyos-email-worker | grep "Certified tracking"
```
**Expected**: ✅ Certified tracking enabled

---

## 🚨 Troubleshooting

### Problem: No emails arriving
```bash
# Check Email Routing is enabled
open "https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/chitty.cc/email/routing/overview"

# Check DNS MX records
dig MX chitty.cc

# Check worker route exists
open "https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/chitty.cc/email/routing/routes"
```

### Problem: Forwarding fails
```bash
# Check destination is verified
open "https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/chitty.cc/email/routing/addresses"

# Check logs for error
wrangler tail chittyos-email-worker | grep -i "forward"
```

### Problem: No feedback received
```bash
# Check feedback is enabled
wrangler secret list --name chittyos-email-worker | grep FEEDBACK

# Check sender is @chitty.cc
# Only emails FROM @chitty.cc domain get feedback

# Check logs
wrangler tail chittyos-email-worker | grep -i feedback
```

---

## 📚 Documentation

- **Full Setup**: `CONFIGURE-EMAIL-ROUTING.md`
- **Routing & Feedback**: `EMAIL-ROUTING-MANAGEMENT.md`
- **Deployment Details**: `EMAIL-WORKER-DEPLOYMENT-COMPLETE.md`
- **Testing**: `TEST-EMAIL-WORKER.sh`

---

## ✅ Quick Checklist

- [ ] Worker deployed: ✅ chittyos-email-worker
- [ ] Email Routing enabled in Cloudflare
- [ ] Worker route created (*@chitty.cc)
- [ ] Destination verified (no-reply@itcan.llc)
- [ ] Feedback enabled (FEEDBACK_ENABLED=true)
- [ ] Test email sent and received
- [ ] Monitoring logs work (wrangler tail)
- [ ] Dashboard shows metrics

---

**You're ready! Send an email to test@chitty.cc and watch it route! 🚀**
