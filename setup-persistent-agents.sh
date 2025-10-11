#!/bin/bash
# Setup Persistent Agents Infrastructure
# Creates KV, R2, and Vectorize resources for agent memory system

set -e

echo "🚀 Setting up Persistent Agents Infrastructure"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ wrangler CLI not found${NC}"
    echo "Install with: npm install -g wrangler"
    exit 1
fi

echo -e "${GREEN}✅ wrangler CLI found${NC}"
echo ""

# Check authentication
echo "Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo -e "${RED}❌ Not authenticated with Cloudflare${NC}"
    echo "Run: wrangler login"
    exit 1
fi

echo -e "${GREEN}✅ Authenticated with Cloudflare${NC}"
echo ""

# Step 1: Create KV Namespace for Working Memory
echo "Step 1: Creating KV namespace for agent working memory..."
KV_OUTPUT=$(wrangler kv:namespace create "AGENT_WORKING_MEMORY" 2>&1)
echo "$KV_OUTPUT"

# Extract KV namespace ID from output
KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

if [ -z "$KV_ID" ]; then
    echo -e "${YELLOW}⚠️  KV namespace may already exist or creation failed${NC}"
    echo "To find existing namespace: wrangler kv:namespace list"
else
    echo -e "${GREEN}✅ KV namespace created: $KV_ID${NC}"

    # Update wrangler.toml with KV ID
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/id = \"TBD\"/id = \"$KV_ID\"/" wrangler.toml
    else
        # Linux
        sed -i "s/id = \"TBD\"/id = \"$KV_ID\"/" wrangler.toml
    fi
    echo -e "${GREEN}✅ Updated wrangler.toml with KV namespace ID${NC}"
fi
echo ""

# Step 2: Create R2 Bucket for Episodic Memory
echo "Step 2: Creating R2 bucket for agent episodic memory..."
if wrangler r2 bucket create chittyos-agent-episodes 2>&1; then
    echo -e "${GREEN}✅ R2 bucket created: chittyos-agent-episodes${NC}"
else
    echo -e "${YELLOW}⚠️  R2 bucket may already exist${NC}"
    echo "To verify: wrangler r2 bucket list"
fi
echo ""

# Step 3: Create Vectorize Index for Semantic Memory
echo "Step 3: Creating Vectorize index for agent semantic memory..."
if wrangler vectorize create agent-memory-index --dimensions=768 --metric=cosine 2>&1; then
    echo -e "${GREEN}✅ Vectorize index created: agent-memory-index${NC}"
else
    echo -e "${YELLOW}⚠️  Vectorize index may already exist${NC}"
    echo "To verify: wrangler vectorize list"
fi
echo ""

# Step 4: Summary and Next Steps
echo "=============================================="
echo -e "${GREEN}✅ Infrastructure Setup Complete${NC}"
echo "=============================================="
echo ""
echo "Resources created:"
echo "  • KV Namespace: AGENT_WORKING_MEMORY ($KV_ID)"
echo "  • R2 Bucket: chittyos-agent-episodes"
echo "  • Vectorize Index: agent-memory-index (768 dimensions, cosine metric)"
echo ""
echo "Next steps:"
echo "  1. Complete AI Gateway setup (manual dashboard step)"
echo "     → https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/ai/ai-gateway"
echo ""
echo "  2. Add AI provider API keys as secrets:"
echo "     → wrangler secret put OPENAI_API_KEY"
echo "     → wrangler secret put ANTHROPIC_API_KEY"
echo "     → wrangler secret put HUGGINGFACE_API_KEY"
echo "     → wrangler secret put MISTRAL_API_KEY"
echo ""
echo "  3. Deploy the worker:"
echo "     → wrangler deploy"
echo ""
echo "  4. Test persistent agent:"
echo "     → node test-persistent-agent.js"
echo ""
echo -e "${GREEN}Ready to deploy real persistent agents!${NC}"
