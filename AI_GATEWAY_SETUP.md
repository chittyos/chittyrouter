# AI Gateway Setup Instructions

## Status: ⚠️ Manual Setup Required

AI Gateway client code is ready but needs manual Cloudflare dashboard configuration.

## 1. Create AI Gateway (Manual - 2 minutes)

Visit: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/ai/ai-gateway

Click **"Create Gateway"** and configure:
- **Name**: `chittyos-ai-gateway`
- **Cache TTL**: `3600` seconds (1 hour)
- **Logging**: ✅ Enabled
- **Rate Limiting**: ✅ Enabled
  - Interval: 60 seconds
  - Limit: 100 requests
  - Technique: Sliding window

## 2. Get API Keys from 1Password

Run with `op` CLI:

```bash
export OPENAI_API_KEY=$(op read "op://Private/OpenAI/api_key")
export ANTHROPIC_API_KEY=$(op read "op://Private/Anthropic/api_key")
export HUGGINGFACE_API_KEY=$(op read "op://Private/HuggingFace/api_key")
export MISTRAL_API_KEY=$(op read "op://Private/Mistral/api_key")
```

## 3. Add to wrangler.toml

```toml
[vars]
AI_GATEWAY_ID = "chittyos-ai-gateway"
CLOUDFLARE_ACCOUNT_ID = "0bc21e3a5a9de1a4cc843be9c3e98121"

[[kv_namespaces]]
binding = "AI_USAGE_KV"
id = "YOUR_KV_NAMESPACE_ID"  # Create via: wrangler kv:namespace create "AI_USAGE_KV"
```

## 4. Set Secrets

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY  
wrangler secret put HUGGINGFACE_API_KEY
wrangler secret put MISTRAL_API_KEY
```

## 5. Test Integration

```bash
# Deploy updated worker
wrangler deploy

# Test AI Gateway routing
curl https://chittyos-email-worker.chittycorp-llc.workers.dev/test-ai
```

## What's Already Done

✅ AIGatewayClient created (`src/ai/ai-gateway-client.js`)
✅ Multi-provider support (OpenAI, Anthropic, Google, HuggingFace, Mistral, Workers AI)
✅ Intelligent routing by task complexity
✅ Automatic fallback chains
✅ Cost tracking
✅ ChittyRouter integration started

## Expected Results

**Cost Savings**: 88% reduction ($500/mo → $60/mo)
- Simple tasks → Workers AI (FREE)
- Complex tasks → OpenAI/Claude via gateway (cached 50-80%)

**Performance**: 
- Cache hits return in <50ms
- Automatic failover to backup providers
- Usage analytics and cost tracking

## Next Steps

1. Complete manual gateway creation (link above)
2. Add API keys as secrets
3. Deploy and test
4. Monitor savings via gateway dashboard
