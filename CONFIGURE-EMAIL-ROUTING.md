# Email Worker Configuration Guide

## ✅ Deployment Status
**Worker Deployed**: `chittyos-email-worker`
**URL**: https://chittyos-email-worker.chittycorp-llc.workers.dev
**Version**: 68d101f2-de01-46bc-92bd-c26f107fd9f9

## 🔧 Step 1: Enable Email Routing in Cloudflare Dashboard

1. **Navigate to Email Routing**
   - Go to https://dash.cloudflare.com/
   - Select account: **ChittyCorp LLC**
   - Choose domain: **chitty.cc** (or any domain)
   - Click **Email** in the left sidebar

2. **Enable Email Routing**
   - Click **Get Started** or **Enable Email Routing**
   - Follow the wizard to add DNS records
   - Verify your domain

## 🔧 Step 2: Add Email Worker Route

1. **Go to Email Workers**
   - In Email Routing section, click **Email Workers** tab
   - Click **Create Email Worker Route**

2. **Configure Worker Route**
   - **Matcher Type**: Custom
   - **Match Expression**: `*@chitty.cc` (or specific addresses)
   - **Action**: Run Worker
   - **Worker**: Select `chittyos-email-worker`
   - **Enabled**: Yes

3. **Save the Route**

## 🔧 Step 3: Configure Additional Domains

Repeat Step 1 and 2 for these domains:
- ✓ `chitty.cc`
- ✓ `nevershitty.com`
- ✓ `chittyos.com`
- ✓ `chittycorp.com`
- ✓ `aribia.llc`
- ✓ `itcanbellc.com`
- ✓ `mrniceweird.com`
- ✓ `chicagofurnishedcondos.com`

## 📧 Step 4: Add Destination Addresses

1. **Add Verified Email Address**
   - In Email Routing → **Destination addresses**
   - Click **Add destination address**
   - Add: `no-reply@itcan.llc` (or your preferred address)
   - Verify via email confirmation

## 🧪 Testing the Email Worker

### Test 1: Basic Email Reception
Send an email to: `test@chitty.cc`

**Expected Behavior:**
- Worker receives email
- AI classifies email
- Forwards to `no-reply@itcan.llc`
- Logs transaction ID

### Test 2: BCC Tracking (Certified Email)
Send an email with BCC: `bcc@chitty.cc`

**Expected Behavior:**
- Worker detects BCC tracking
- Stores evidence of certified delivery
- Forwards email normally

### Test 3: Legal Email Classification
Send email with subject: "Urgent Legal Matter - Case 2024D007847"

**Expected Behavior:**
- AI classifies as "litigation" workstream
- Urgency level: "critical"
- Routes to legal team

### Test 4: Namespace Copy Detection
From: `nick@chitty.cc`
BCC: `nick@chitty.cc`

**Expected Behavior:**
- Worker detects namespace copy
- Logs for compliance tracking
- Does not forward duplicate

## 🔍 Monitoring

### View Worker Logs
```bash
wrangler tail chittyos-email-worker --format pretty
```

### Check Email Routing Stats
- Dashboard → Email → Analytics
- View: Received, Forwarded, Rejected

## 🚨 Troubleshooting

**Issue**: Emails not received
- ✓ Check DNS MX records are set
- ✓ Verify Email Routing is enabled
- ✓ Check worker route is active

**Issue**: AI classification not working
- ✓ Verify AI binding in worker
- ✓ Check worker logs for errors
- ✓ Ensure Workers AI is enabled in account

**Issue**: Forwarding fails
- ✓ Verify destination address is confirmed
- ✓ Check DEFAULT_FORWARD environment variable
- ✓ Review worker logs for errors

## 📊 Weekly Reports

The worker generates weekly impact reports every Monday at 9:00 AM.

**Report includes:**
- Total emails processed
- Workstream breakdown (litigation, finance, compliance, operations)
- AI classification stats
- Urgency levels
- Top domains and senders
- Key insights

**To enable cron trigger:**
Add to wrangler.toml:
```toml
[[triggers.crons]]
cron = "0 9 * * 1"  # Monday at 9:00 AM
```

## 🎯 Next Steps

1. ✓ Worker deployed
2. ⏳ Configure Email Routing in Dashboard
3. ⏳ Add domains
4. ⏳ Test with sample emails
5. ⏳ Monitor logs and analytics
6. ⏳ Set up weekly reports cron
