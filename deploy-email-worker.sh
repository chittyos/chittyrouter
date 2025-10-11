#!/bin/bash

echo "🚀 Deploying Enhanced Email Worker..."
echo ""

# Create deployment config for email worker
cat > wrangler-email.toml << 'TOML'
name = "chittyos-email-worker"
main = "src/workers/email-worker.js"
compatibility_date = "2024-09-23"
account_id = "0bc21e3a5a9de1a4cc843be9c3e08121"

[vars]
DEFAULT_FORWARD = "no-reply@itcan.llc"
SERVICE_NAME = "chittyos-email-worker"
SERVICE_VERSION = "2.1.0"

# AI binding
[ai]
binding = "AI"

# KV bindings for analytics and rate limiting
[[kv_namespaces]]
binding = "EMAIL_ANALYTICS"
id = "email_analytics_kv"

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "rate_limits_kv"

# Optional R2 binding for email archival (create bucket if needed)
# [[r2_buckets]]
# binding = "EMAIL_ARCHIVE"
# bucket_name = "email-archive-chittyos"
TOML

echo "📝 Created deployment config: wrangler-email.toml"
echo ""
echo "⚙️  Deploying to Cloudflare..."
wrangler deploy --config wrangler-email.toml

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Test endpoints:"
echo "   Health: curl https://chittyos-email-worker.chittycorp-llc.workers.dev/health"
echo "   Status: curl https://chittyos-email-worker.chittycorp-llc.workers.dev/status"

