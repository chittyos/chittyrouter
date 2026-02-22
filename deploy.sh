#!/bin/bash
# ChittyRouter Phase 1 Deployment Execution Script
# Run this script to deploy to Cloudflare staging

set -e  # Exit on error

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  🚀 ChittyRouter Phase 1 Deployment                             ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from chittyrouter directory"
    exit 1
fi

echo "📋 Pre-deployment checklist:"
echo "├─ Branch: claude/deploy-phase1-011CUfrp7KdHqWDYeXHcc23o"
echo "├─ Components: Universal Intake, Trust Engine, MCP Agent"
echo "└─ Deployment target: Cloudflare Workers (staging)"
echo ""

# Option 1: GitHub CLI (if available)
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI detected"
    echo ""
    echo "Triggering GitHub Actions deployment..."

    gh workflow run deploy.yml \
        --ref claude/deploy-phase1-011CUfrp7KdHqWDYeXHcc23o \
        -f environment=staging

    if [ $? -eq 0 ]; then
        echo "✅ Workflow triggered successfully!"
        echo ""
        echo "📊 Monitor deployment:"
        echo "   gh run watch"
        echo "   Or visit: https://github.com/chittyos/chittyrouter/actions"
        exit 0
    else
        echo "⚠️ GitHub CLI trigger failed, trying alternative methods..."
    fi
fi

# Option 2: Wrangler CLI (if available and configured)
if command -v wrangler &> /dev/null; then
    echo "✅ Wrangler CLI detected"
    echo ""
    set +e
    read -p "Deploy directly via Wrangler? (y/n) " -n 1 -r
    read_status=$?
    set -e
    echo

    if [ $read_status -ne 0 ]; then
        echo "Input cancelled or failed. Aborting deployment."
        exit 1
    fi
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📦 Installing dependencies..."
        npm install

        echo "🚀 Deploying to staging..."
        wrangler deploy --env staging

        if [ $? -eq 0 ]; then
            echo ""
            echo "✅ Deployment complete!"
            echo ""
            echo "📊 Testing endpoints..."

            # Test health endpoint
            echo "Testing /health..."
            curl -s https://router.chitty.cc/health | jq '.' || echo "Failed"

            echo ""
            echo "Testing /intake/health..."
            curl -s https://router.chitty.cc/intake/health | jq '.' || echo "Failed"

            exit 0
        else
            echo "❌ Wrangler deployment failed"
            exit 1
        fi
    fi
fi

# Option 3: Manual instructions
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MANUAL DEPLOYMENT REQUIRED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Neither GitHub CLI nor Wrangler CLI is available."
echo "Please deploy manually using one of these methods:"
echo ""
echo "Method 1: GitHub Actions (Recommended)"
echo "────────────────────────────────────────"
echo "1. Visit: https://github.com/chittyos/chittyrouter/actions"
echo "2. Click 'Deploy ChittyRouter to Cloudflare'"
echo "3. Click 'Run workflow' (top right)"
echo "4. Select environment: staging"
echo "5. Click 'Run workflow' button"
echo ""
echo "Method 2: Create Pull Request"
echo "──────────────────────────────"
echo "1. Visit: https://github.com/chittyos/chittyrouter/pull/new/claude/deploy-phase1-011CUfrp7KdHqWDYeXHcc23o"
echo "2. Create PR to merge into 'main'"
echo "3. Merge PR (auto-deploys to staging)"
echo ""
echo "Method 3: Wrangler CLI (requires setup)"
echo "────────────────────────────────────────"
echo "npm install"
echo "wrangler login"
echo "wrangler deploy --env staging"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "After deployment, test with:"
echo "  curl https://router.chitty.cc/health"
echo "  curl https://router.chitty.cc/intake/health"
echo ""
