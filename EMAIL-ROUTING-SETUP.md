# Email Routing Configuration Guide

## Worker Deployed ✅
- **Name**: chittyos-email-worker
- **URL**: https://chittyos-email-worker.chittycorp-llc.workers.dev
- **Version**: 68d101f2-de01-46bc-92bd-c26f107fd9f9

## Configuration Steps

### 1. Enable Email Routing (Per Domain)

For each domain, go to Cloudflare Dashboard:

1. Navigate to: **Email** → **Email Routing** → **Routes**
2. Click **"Enable Email Routing"** (if not already enabled)
3. Verify MX records are configured

### 2. Create Catch-All Rule with Worker

For each domain you want to handle:

```bash
# Example for chitty.cc
curl -X POST "https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/email/routing/rules" \
  -H "Authorization: Bearer {API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "enabled": true,
    "matchers": [{"type": "all"}],
    "actions": [{
      "type": "worker",
      "value": ["chittyos-email-worker"]
    }],
    "name": "Route all emails to AI worker",
    "priority": 0
  }'
```

### 3. Required Domains to Configure

Priority domains:
- ✅ chitty.cc
- ✅ nevershitty.com
- ✅ chittycorp.com
- ✅ aribia.llc
- ✅ itcanbellc.com

Additional domains (60+ total):
- chittychat.com
- chittyos.com
- mrniceweird.com
- chicagofurnishedcondos.com
- jeanarlene.com
- nickyb.me
- aribia.co
- apt-arlene.llc
- chittyrouter.com

### 4. Verify Email Routing

Send test email to: `test@chitty.cc`

Expected behavior:
1. Email received by worker
2. AI classification runs (litigation/finance/compliance/operations)
3. Sentiment analysis performed
4. Urgency level detected
5. Email forwarded to: no-reply@itcan.llc
6. Tracking data stored

## Manual Configuration via Dashboard

1. Go to: https://dash.cloudflare.com/
2. Select domain (e.g., chitty.cc)
3. Go to **Email** → **Email Routing**
4. Click **"Routing Rules"**
5. Click **"Create routing rule"**
6. Configure:
   - **Expression**: Match all messages
   - **Action**: Send to a Worker
   - **Worker**: Select `chittyos-email-worker`
7. Click **"Save"**

## Testing

### Send Test Email

```bash
# Using sendmail (if available)
echo "Subject: Test Email
To: hello@chitty.cc
From: test@example.com

This is a test email for the AI-powered email worker." | sendmail -t

# Or use mail command
echo "Test email body" | mail -s "Test Subject" hello@chitty.cc
```

### Watch Logs

```bash
wrangler tail chittyos-email-worker --format pretty
```

## Features Active

✅ **AI Classification**: Litigation, Finance, Compliance, Operations
✅ **Sentiment Analysis**: Positive, Negative, Neutral
✅ **Urgency Detection**: Critical, High, Medium, Low
✅ **Entity Extraction**: Names, dates, amounts
✅ **BCC Tracking**: Certified emails to bcc@chitty.cc
✅ **Namespace Copy Detection**: Auto-detect @chitty.cc copies
✅ **Multi-workstream Routing**: Smart routing based on content
✅ **Weekly Impact Reports**: Monday 9am cron job
✅ **Rate Limiting**: Protection against spam
✅ **Spam Filtering**: Quick spam detection before AI

## Next Steps

1. **Enable Email Routing** for each domain in Cloudflare Dashboard
2. **Create routing rules** to send emails to worker
3. **Test** with real emails
4. **Monitor** logs and impact reports
5. **Adjust** routing rules based on patterns

## Troubleshooting

- **Emails not received**: Check MX records and Email Routing enabled
- **Worker errors**: Check logs with `wrangler tail`
- **AI not classifying**: Verify AI binding is configured
- **Forwarding fails**: Check DEFAULT_FORWARD env var

## Support

Worker deployed to account: ChittyCorp LLC (0bc21e3a5a9de1a4cc843be9c3e98121)
