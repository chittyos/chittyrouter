# ChittyRouter Phase 1 - Deployment Instructions

**Branch:** `claude/deploy-phase1-011CUfrp7KdHqWDYeXHcc23o`
**Status:** Ready for Manual Deployment
**Date:** 2025-10-31

---

## 🚀 Quick Deployment (Remote Workers)

Since this is a **remote Cloudflare deployment**, use Wrangler CLI or GitHub Actions.

### **Option 1: GitHub Actions (Recommended)**

The repository has automated workflows, but they require:
1. Merging to `main` or `production` branch
2. Or using `workflow_dispatch` with manual trigger

**To trigger deployment:**
1. Go to: https://github.com/chittyos/chittyrouter/actions
2. Select "Deploy ChittyRouter to Cloudflare" workflow
3. Click "Run workflow"
4. Choose environment: `staging`
5. Click "Run workflow" button

### **Option 2: Wrangler CLI (If Available)**

If you have access to Wrangler CLI with proper credentials:

```bash
# Install dependencies
npm install

# Deploy to staging
wrangler deploy --env staging

# Deploy to production (after testing)
wrangler deploy --env production
```

---

## 📋 What Will Be Deployed

### **New Components:**

1. **Universal Intake Layer** (`src/intake/universal-intake.js`)
   - POST /intake - Accept 10 input types
   - GET /intake/health - Health check

2. **Trust Engine** (`src/attribution/trust-engine.js`)
   - 6-dimensional trust scoring
   - Integrated with ChittyOS authorities

3. **Cloudflare Native MCP Agent** (`src/mcp/chittyrouter-mcp-agent.js`)
   - 10 MCP tools exposed
   - Durable Object based
   - Replaces old Node.js implementation

### **Dependencies to Install:**
```json
{
  "agents": "latest",
  "zod": "^3.22.0"
}
```

### **Configuration Changes:**
- New endpoint: `/intake`
- New Durable Object: `ChittyRouterMCP`
- Updated `src/index.js` with intake handler

---

## ✅ Post-Deployment Testing

### **Test Endpoints:**

**1. Health Check:**
```bash
curl https://router.chitty.cc/health
# Should return: { "status": "healthy", "services": [..., "intake"], ... }
```

**2. Intake Health:**
```bash
curl https://router.chitty.cc/intake/health
# Should return: { "status": "healthy", "supportedTypes": [...], ... }
```

**3. Universal Intake:**
```bash
curl -X POST https://router.chitty.cc/intake \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "text",
      "content": "Test intake message"
    }
  }'

# Should return:
# {
#   "success": true,
#   "id": "text-...",
#   "type": "text",
#   "chittyId": "INTAKE-TEXT-...",
#   "attribution": { "trustScore": ..., ... },
#   "storage": { "tier": "HOT", ... },
#   "routing": { "destinations": ... }
# }
```

**4. MCP Agent (with Claude Desktop):**
```
1. Open Claude Desktop
2. Settings → Developer → MCP Servers
3. Add server:
   URL: https://mcp.chitty.cc
   Name: ChittyRouter

4. Test tools:
   - Ask Claude to "ingest this text message"
   - Ask Claude to "classify this email"
   - Ask Claude to "extract evidence from this document"
```

---

## 🔧 Rollback Plan

If deployment fails or issues arise:

**1. Rollback via Git:**
```bash
# Revert to previous commit
git revert HEAD
git push origin claude/deploy-phase1-011CUfrp7KdHqWDYeXHcc23o
```

**2. Disable New Endpoints:**
```javascript
// In src/index.js, comment out:
// if (pathname.startsWith("/intake")) {
//   return await handleIntake(request, env, universalIntake);
// }
```

**3. Remove Durable Object Binding:**
```toml
# In wrangler.toml, comment out:
# [[env.production.durable_objects.bindings]]
# name = "CHITTYROUTER_MCP"
# class_name = "ChittyRouterMCP"
```

---

## 📊 Monitoring

**Watch for:**
- Successful deployment confirmation
- No 500 errors on `/health` endpoint
- `/intake/health` returns 200
- MCP tools accessible

**Metrics to Track:**
- Request count to `/intake`
- Trust scoring performance
- MCP tool invocations
- Error rates

---

## 🎯 Success Criteria

- ✅ All health endpoints return 200
- ✅ Universal intake accepts test data
- ✅ Trust scoring returns valid scores
- ✅ MCP tools respond correctly
- ✅ No increase in error rates
- ✅ Existing functionality unaffected

---

## 🚨 Known Limitations

**Not Yet Implemented:**
- PDF OCR integration (code exists, not wired)
- Voice transcription (Whisper configured, not tested)
- URL scraping (basic implementation)
- Image/video processing (stubs only)

**These are acceptable** - Phase 1 focuses on architecture. Full implementation in Weeks 2-3.

---

## 📞 Support

**If Deployment Fails:**
1. Check GitHub Actions logs
2. Check Cloudflare Workers dashboard
3. Review error messages in deployment output
4. Rollback if necessary

**Contact:**
- GitHub Issues: https://github.com/chittyos/chittyrouter/issues
- Documentation: See PARALLEL_IMPLEMENTATION_SUMMARY.md

---

**Deployment Status:** Awaiting Manual Trigger
**Risk Level:** Low (all changes additive, no breaking changes)
**Estimated Time:** 5-10 minutes
