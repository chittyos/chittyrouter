# Quick Fix Guide: Deploy Legacy Build to Production

This guide provides step-by-step instructions to switch from the minimal build to the legacy build (enabling all 77 files).

## Prerequisites

- [ ] Read `LEGACY_VS_MINIMAL_ANALYSIS.md` (comprehensive analysis)
- [ ] Have access to Cloudflare Workers dashboard
- [ ] Have `wrangler` CLI installed and authenticated
- [ ] Have backup/rollback plan ready

---

## Step 1: Fix Critical Compatibility Issue (Required)

### Fix `chat-router.js` - Replace `process.env`

**File:** `src/utils/chat-router.js`  
**Line:** 70  
**Issue:** Uses `process.env.CHITTYCHAT_API_KEY` which doesn't exist in Workers

**Current Code:**
```javascript
async function notifyAttorneys(thread) {
  const notification = { /* ... */ };
  
  try {
    const response = await fetch('https://chittychat.api.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CHITTYCHAT_API_KEY}` // ❌ WRONG
      },
      body: JSON.stringify(notification)
    });
    // ...
  } catch (error) {
    console.error('Error sending ChittyChat notification:', error);
  }
}
```

**Fixed Code:**
```javascript
// Add env parameter to function signature
async function notifyAttorneys(thread, env) {
  const notification = { /* ... */ };
  
  try {
    const response = await fetch('https://chittychat.api.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.CHITTYCHAT_API_KEY}` // ✅ CORRECT
      },
      body: JSON.stringify(notification)
    });
    // ...
  } catch (error) {
    console.error('Error sending ChittyChat notification:', error);
  }
}
```

**Update all callers of `notifyAttorneys()`:**
```javascript
// Line 30 in chat-router.js
// Before:
await notifyAttorneys(chittyThread);

// After:
// This needs to be fixed by passing env through from the caller
// Since this is called from routeToChittyChat, we need to update that function too
```

**Complete Fix for `chat-router.js`:**

```javascript
/**
 * ChittyChat integration utilities for ChittyRouter
 */

import { storeInChittyChain } from './storage.js';

// Route email to ChittyChat thread
export async function routeToChittyChat(emailData, env) { // ✅ Add env parameter
  const chittyThread = {
    id: emailData.chittyId,
    caseId: emailData.caseId,
    type: 'EMAIL_INTAKE',
    participants: [emailData.from, 'legal-team'],
    messages: [{
      timestamp: new Date().toISOString(),
      from: emailData.from,
      subject: emailData.subject,
      content: emailData.content,
      attachments: emailData.attachments,
      chittyId: emailData.chittyId
    }],
    status: 'ACTIVE',
    priority: determinePriority(emailData)
  };

  // Store in ChittyChain for immutable record
  await storeInChittyChain(chittyThread);

  // Notify attorneys via ChittyChat
  await notifyAttorneys(chittyThread, env); // ✅ Pass env

  return chittyThread;
}

// ... rest of file stays same until notifyAttorneys ...

// Notify attorneys of new thread
async function notifyAttorneys(thread, env) { // ✅ Add env parameter
  const notification = {
    type: 'NEW_EMAIL_THREAD',
    threadId: thread.id,
    caseId: thread.caseId,
    from: thread.messages[0].from,
    subject: thread.messages[0].subject,
    priority: thread.priority,
    timestamp: new Date().toISOString()
  };

  // Send to ChittyChat notification system
  try {
    const response = await fetch('https://chittychat.api.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.CHITTYCHAT_API_KEY}` // ✅ Use env
      },
      body: JSON.stringify(notification)
    });

    if (!response.ok) {
      console.error('Failed to send ChittyChat notification:', response.statusText);
    }
  } catch (error) {
    console.error('Error sending ChittyChat notification:', error);
  }
}

// ... rest of file unchanged ...
```

**Then update the caller in `routing/cloudflare-integration.js`:**

```javascript
// Line 28 - Add env parameter
await routeToChittyChat({
  caseId,
  chittyId,
  from: message.from,
  subject: message.headers.get("subject"),
  content: await streamToText(message.raw),
  attachments: await processAttachments(message)
}, env); // ✅ Pass env
```

---

## Step 2: Update wrangler.toml

### 2.1 Change Entry Point

```toml
# Line 2 - Change this
main = "src/index-minimal.js"

# To this
main = "src/index-cloudflare.js"
```

### 2.2 Add Environment Variables

Add these to the `[vars]` section (after line 38):

```toml
# ChittyOS Service Integration
CHITTYOS_SCORE_URL = "https://score.chitty.cc/api/v1"
CHITTYOS_TRUST_URL = "https://trust.chitty.cc/api/v1"
CHITTYOS_VERIFY_URL = "https://verify.chitty.cc/api/v1"
CHITTYOS_AUTH_URL = "https://auth.chitty.cc/api/v1"
REGISTRY_URL = "https://registry.chitty.cc/api/v1"

# ChittyChat Integration
CHITTYCHAT_API_URL = "https://chat.chitty.cc/api/v1"

# PDX API Configuration
PDX_ENABLED = "true"
PDX_VERSION = "1.0.0"
```

### 2.3 Enable Analytics Engine

Uncomment lines 180-181 in `env.production`:

```toml
# Before (commented out):
# [[env.production.analytics_engine_datasets]]
# binding = "AI_ANALYTICS"

# After (uncommented):
[[env.production.analytics_engine_datasets]]
binding = "AI_ANALYTICS"
```

---

## Step 3: Set Secrets

Run these commands to add required API keys:

```bash
# ChittyChat API Key
wrangler secret put CHITTYCHAT_API_KEY --env production
# When prompted, paste your ChittyChat API key

# ChittyOS Platform API Key
wrangler secret put CHITTYOS_API_KEY --env production
# When prompted, paste your ChittyOS API key

# PDX Signing Key (for AI DNA portability)
wrangler secret put PDX_SIGNING_KEY --env production
# When prompted, paste your PDX signing key
```

**Verify secrets are set:**
```bash
wrangler secret list --env production
```

Expected output:
```
CHITTYCHAIN_API_KEY
CHITTYCHAT_API_KEY
CHITTYOS_API_KEY
ENCRYPTION_KEY
EVIDENCE_VAULT_API_KEY
PDX_SIGNING_KEY
```

---

## Step 4: Test in Staging First

### 4.1 Deploy to Staging

```bash
# Make the same changes to staging environment
wrangler secret put CHITTYCHAT_API_KEY --env staging
wrangler secret put CHITTYOS_API_KEY --env staging
wrangler secret put PDX_SIGNING_KEY --env staging

# Deploy
wrangler deploy --env staging
```

### 4.2 Run Smoke Tests

```bash
# Basic health check
curl https://staging-router.chitty.cc/health | jq

# Test MCP endpoints (should still work)
curl https://staging-router.chitty.cc/mcp/info | jq

# Test NEW endpoints (legacy features)
curl https://staging-router.chitty.cc/integration/status | jq
curl https://staging-router.chitty.cc/discovery/status | jq
curl https://staging-router.chitty.cc/pdx/v1/status | jq
curl https://staging-router.chitty.cc/chittychat/status | jq

# Test AI processing (existing feature)
curl -X POST https://staging-router.chitty.cc/process \
  -H "Content-Type: application/json" \
  -d '{"from":"test@example.com","subject":"Test","content":"Test email"}' | jq
```

### 4.3 Monitor Staging

Check Cloudflare Dashboard:
- **Workers & Pages** → **chittyrouter** → **Metrics**
- Look for:
  - ✅ No 5xx errors
  - ✅ Response time < 500ms p95
  - ✅ CPU time < 10ms average
  - ✅ Success rate > 99%

---

## Step 5: Production Deployment

### 5.1 Create Backup

```bash
# Save current deployment info
wrangler deployments list --env production > deployment-backup.txt

# Save current wrangler.toml
cp wrangler.toml wrangler.toml.backup
```

### 5.2 Deploy to Production

```bash
# Final check - dry run
wrangler deploy --env production --dry-run

# Actually deploy
wrangler deploy --env production
```

### 5.3 Verify Deployment

```bash
# Health check
curl https://router.chitty.cc/health | jq

# Check version
curl https://router.chitty.cc/ | jq '.version'
# Should show: "2.1.0-ai"

# Test legacy endpoints
curl https://router.chitty.cc/integration/status | jq
curl https://router.chitty.cc/discovery/status | jq
```

### 5.4 Monitor Production

Watch metrics for 1 hour:
```bash
# Stream logs
wrangler tail --env production

# Check metrics every 5 minutes
watch -n 300 'curl -s https://router.chitty.cc/health | jq'
```

---

## Step 6: Rollback Plan (If Needed)

If anything goes wrong:

### Option A: Instant Rollback via Wrangler

```bash
# Restore previous wrangler.toml
cp wrangler.toml.backup wrangler.toml

# Redeploy immediately
wrangler deploy --env production
```

### Option B: Rollback via Cloudflare Dashboard

1. Go to **Workers & Pages** → **chittyrouter**
2. Click **Deployments** tab
3. Find previous deployment (marked "Active")
4. Click **...** → **Rollback to this deployment**
5. Confirm rollback

### Option C: Manual Rollback

```bash
# Quick revert in wrangler.toml
sed -i 's/main = "src\/index-cloudflare.js"/main = "src\/index-minimal.js"/g' wrangler.toml

# Deploy
wrangler deploy --env production
```

---

## Step 7: Post-Deployment Checklist

### 7.1 Verify All Endpoints

```bash
# Create a test script
cat > test-endpoints.sh << 'EOF'
#!/bin/bash
BASE_URL="https://router.chitty.cc"

echo "Testing Core Endpoints..."
curl -s "$BASE_URL/health" | jq -r '.status'
curl -s "$BASE_URL/mcp/info" | jq -r '.status'

echo "Testing Legacy Endpoints..."
curl -s "$BASE_URL/integration/status" | jq -r '.error // "OK"'
curl -s "$BASE_URL/discovery/status" | jq -r '.error // "OK"'
curl -s "$BASE_URL/pdx/v1/status" | jq -r '.error // "OK"'
curl -s "$BASE_URL/chittychat/status" | jq -r '.error // "OK"'

echo "All tests complete!"
EOF

chmod +x test-endpoints.sh
./test-endpoints.sh
```

### 7.2 Update Documentation

- [ ] Update README.md with new endpoints
- [ ] Update API documentation
- [ ] Update ARCHITECTURE.md to reflect production entry point
- [ ] Document new features for team

### 7.3 Set Up Monitoring

Create alerts in Cloudflare Dashboard:
- Alert when error rate > 1%
- Alert when p95 latency > 1000ms
- Alert when CPU time > 20000ms

### 7.4 Communicate Changes

Notify team:
```markdown
**ChittyRouter Upgraded to Legacy Build**

New features now available:
- ✅ Full ChittyOS platform integration
- ✅ PDX API (AI DNA portability)
- ✅ ChittyChat integration
- ✅ Service discovery
- ✅ Enhanced security layer

Endpoints:
- /integration/* - ChittyOS integration
- /pdx/v1/* - PDX API
- /chittychat/* - ChittyChat webhooks
- /discovery/* - Service discovery

Documentation: See LEGACY_VS_MINIMAL_ANALYSIS.md
```

---

## Troubleshooting

### Issue: "Module not found" errors

**Symptom:** 
```
Error: Module "src/utils/chat-router.js" not found
```

**Solution:**
Make sure you made the changes to `chat-router.js` in Step 1.

### Issue: "Unauthorized" errors on new endpoints

**Symptom:**
```json
{"error": "Unauthorized", "status": 401}
```

**Solution:**
Verify secrets are set correctly:
```bash
wrangler secret list --env production
```

### Issue: High latency after deployment

**Symptom:**
Response times > 1000ms (vs 200ms before)

**Solution:**
1. Check bundle size: `wrangler deploy --dry-run`
2. If bundle > 1MB, consider code splitting
3. Check if external services are slow (ChittyOS, ChittyChat)
4. Add caching for service discovery results

### Issue: 500 errors on ChittyChat endpoints

**Symptom:**
```json
{"error": "ChittyChat API failed"}
```

**Solution:**
1. Check ChittyChat API is reachable: `curl https://chat.chitty.cc/api/v1/health`
2. Verify `CHITTYCHAT_API_KEY` secret is correct
3. Check logs: `wrangler tail --env production`
4. Add fallback behavior in code

---

## Summary

**What You Did:**
1. ✅ Fixed `chat-router.js` compatibility issue
2. ✅ Changed entry point to `index-cloudflare.js`
3. ✅ Added ChittyOS environment variables
4. ✅ Set API key secrets
5. ✅ Tested in staging
6. ✅ Deployed to production
7. ✅ Verified all endpoints work

**What You Gained:**
- 🎉 Full ChittyOS platform integration (34+ services)
- 🎉 PDX API for AI DNA portability
- 🎉 ChittyChat integration for project sync
- 🎉 Service discovery and dynamic routing
- 🎉 Enhanced security layer
- 🎉 23 additional active files (46 total vs 23)

**Trade-offs Accepted:**
- ⚠️ Larger bundle size (~1.2MB vs ~500KB)
- ⚠️ Slower cold starts (~200-300ms vs ~50-100ms)
- ⚠️ More external dependencies
- ⚠️ More complex configuration

**Next Steps:**
- Monitor performance for 1 week
- Optimize bundle size if needed
- Add more comprehensive tests
- Document new API endpoints
- Train team on new features

---

## Time Estimate

- **Step 1 (Fix code):** 15 minutes
- **Step 2-3 (Config + Secrets):** 10 minutes
- **Step 4 (Staging test):** 30 minutes
- **Step 5 (Production deploy):** 15 minutes
- **Step 6 (Monitoring):** 1 hour
- **Step 7 (Post-deployment):** 1 hour

**Total:** ~3 hours (plus 1 week monitoring)

---

## Need Help?

- **Documentation:** See `LEGACY_VS_MINIMAL_ANALYSIS.md`
- **Architecture:** See `ARCHITECTURE.md`
- **Development:** See `CLAUDE.md`
- **Logs:** `wrangler tail --env production`
- **Metrics:** Cloudflare Dashboard → Workers & Pages → chittyrouter
