#!/bin/bash

# ChittyOS Worker Branch Setup Script
# Creates branches for each worker to be synced from ChittyOS

echo "🚀 Setting up worker branches for ChittyOS sync..."

# Read worker mapping
WORKERS=$(cat worker-branch-mapping.json | grep '"branch"' | grep -v '"main"' | cut -d'"' -f4)

# Create each worker branch
for BRANCH in $WORKERS; do
    echo "📌 Creating branch: $BRANCH"
    git checkout -b "$BRANCH" main 2>/dev/null || git checkout "$BRANCH"
    
    # Create worker-specific directory
    WORKER_NAME=$(echo "$BRANCH" | cut -d'/' -f2)
    mkdir -p "workers/$WORKER_NAME"
    
    # Create placeholder for worker code
    cat > "workers/$WORKER_NAME/index.js" << 'WORKER'
/**
 * Placeholder for $WORKER_NAME worker
 * Will be synced from ChittyOS
 */
export default {
  async fetch(request, env, ctx) {
    return new Response(`${WORKER_NAME} worker - awaiting sync from ChittyOS`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
WORKER
    
    # Commit the placeholder
    git add -A
    git commit -m "Initialize $BRANCH for ChittyOS sync" 2>/dev/null || true
    
    echo "✅ Branch $BRANCH ready for sync"
done

# Return to main branch
git checkout main
echo "✅ All worker branches created and ready for ChittyOS sync"
