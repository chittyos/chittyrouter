# ChittyContextual Memory Deployment Strategy

## Current Status
- **Branch**: feature/contextual-memory-integration
- **Last Commit**: e061934 - feat: Integrate ChittyContextual memory system into persistent agents
- **Issue**: Branch diverged from main (no common history)

## Architecture Overview

### Memory System Integration
The ChittyContextual memory system adds conversation history retention to the Persistent Agent Durable Object:

1. **ContextualMemory Module** (`src/agents/contextual-memory.js`)
   - Converts stored memory into OpenAI-compatible message arrays
   - Extracts entities and topics from prompts
   - Builds conversation history from memory tiers
   - Enriches context with case-specific knowledge

2. **PersistentAgent Integration** (`src/agents/persistent-agent.js`)
   - Instantiates ContextualMemory with multi-tier memory
   - Builds conversation history before AI calls
   - Passes message arrays to AI Gateway
   - Stores interactions for future recall

3. **AIGatewayClient Support** (`src/ai/ai-gateway-client.js`)
   - Accepts message arrays instead of single prompts
   - Maintains backward compatibility
   - Preserves fallback chain logic

## Deployment Strategy

### Phase 1: Local Testing (Immediate)
```bash
# Clean working directory
git stash push -m "Uncommitted changes for contextual memory"

# Start local development server
wrangler dev --local --persist

# Test endpoints
# 1. Initial interaction
curl -X POST http://localhost:8787/platform/agents/legal-assistant/complete \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Remember this: The case number is 2024D007847 for Arias v. Bianchi",
    "taskType": "case_update",
    "context": {"training": true}
  }'

# 2. Memory recall test
curl -X POST http://localhost:8787/platform/agents/legal-assistant/complete \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What case number did I just tell you about?",
    "taskType": "case_query"
  }'
```

### Phase 2: Branch Cleanup (Today)
```bash
# Option A: Rebase on production (recommended)
git checkout production
git pull origin production
git checkout -b feature/contextual-memory-v2
git cherry-pick e061934  # Apply contextual memory changes

# Option B: Create clean PR branch
git checkout production
git pull origin production
git checkout -b feature/contextual-memory-clean
# Manually apply changes from contextual-memory.js and agent modifications

# Option C: Force merge (not recommended)
# Only if history doesn't matter
git checkout feature/contextual-memory-integration
git rebase --onto production --root
```

### Phase 3: Staging Deployment
```bash
# Deploy to staging environment
wrangler deploy --env staging

# Staging URL: https://staging.router.chitty.cc/
# Test memory persistence across requests
```

### Phase 4: Production Deployment
```bash
# After staging validation
git checkout production
git merge feature/contextual-memory-v2
git push origin production

# Auto-deploys via GitHub Actions to:
# - mcp.chitty.cc
# - router.chitty.cc
```

## Testing Strategy

### Unit Tests
```javascript
// tests/contextual-memory.test.js
describe('ContextualMemory', () => {
  test('builds conversation history from memory', async () => {
    // Test conversation history building
  });

  test('extracts entities from prompts', () => {
    // Test entity extraction
  });

  test('enriches context with case data', async () => {
    // Test case context enrichment
  });
});
```

### Integration Tests
```javascript
// tests/integration/persistent-agent-memory.test.js
describe('PersistentAgent with Memory', () => {
  test('remembers information across requests', async () => {
    // Test memory persistence
  });

  test('recalls similar past experiences', async () => {
    // Test semantic memory
  });

  test('maintains conversation context', async () => {
    // Test conversation continuity
  });
});
```

### End-to-End Tests
```bash
# tests/e2e/memory-persistence.sh
#!/bin/bash

# 1. Train agent with information
RESPONSE1=$(curl -X POST $AGENT_URL/complete -d '{"prompt": "Learn this: Client is John Doe, case 2024X001"}')

# 2. Query for recall
RESPONSE2=$(curl -X POST $AGENT_URL/complete -d '{"prompt": "Who is the client?"}')

# 3. Verify memory
echo $RESPONSE2 | grep -q "John Doe" && echo "PASS: Agent remembers client" || echo "FAIL"
```

## Cloudflare-Specific Considerations

### Durable Object Configuration
- **Class**: PersistentAgent
- **Binding**: PERSISTENT_AGENTS
- **Storage**: Transactional storage per agent instance
- **Limitations**:
  - 128KB per key-value pair
  - 1GB total storage per Durable Object
  - Consider pagination for large conversation histories

### KV Namespaces (Working Memory)
```toml
[[kv_namespaces]]
binding = "AGENT_WORKING_MEMORY"
id = "your_kv_id"
preview_id = "your_preview_kv_id"
```

### R2 Buckets (Episodic Memory)
```toml
[[r2_buckets]]
binding = "AGENT_EPISODIC_MEMORY"
bucket_name = "agent-episodes"
```

### Vectorize (Semantic Memory) - Future Enhancement
```toml
[[vectorize]]
binding = "AGENT_SEMANTIC_MEMORY"
index_name = "agent-experiences"
```

## Monitoring & Validation

### Key Metrics
- Memory retrieval latency
- Conversation context accuracy
- Storage utilization per agent
- Memory tier hit rates

### Validation Checklist
- [ ] Agent remembers information across requests
- [ ] Conversation history builds correctly
- [ ] Entity extraction works for case numbers, names, dates
- [ ] Similar experiences influence responses
- [ ] Memory persists after Durable Object sleep/wake
- [ ] Performance acceptable (<500ms added latency)

## Rollback Plan

If issues occur:
```bash
# 1. Immediate rollback via Cloudflare dashboard
# Navigate to Workers > chittyrouter > Deployments
# Click "Rollback" on previous version

# 2. Git revert
git revert HEAD
git push origin production

# 3. Emergency disable (feature flag)
# Add to worker:
if (env.DISABLE_CONTEXTUAL_MEMORY) {
  // Use original non-contextual flow
}
```

## Next Steps

1. **Immediate**: Test locally with wrangler dev
2. **Today**: Clean up branch divergence
3. **Tomorrow**: Deploy to staging for validation
4. **This Week**: Production deployment after staging success

## Questions Answered

1. **Should I test locally first?**
   YES - Use `wrangler dev --local --persist` for immediate testing

2. **How to handle branch divergence?**
   Rebase on production branch or create clean cherry-pick branch

3. **Will changes auto-deploy?**
   YES - GitHub Actions deploys production branch to router.chitty.cc

4. **Cloudflare-specific considerations?**
   - Durable Object storage limits (128KB/key, 1GB total)
   - Consider pagination for large histories
   - Use KV for working memory (fast, TTL support)
   - Use R2 for episodic memory (unlimited storage)

## Contact

For deployment issues:
- Check GitHub Actions: https://github.com/chittyos/chittyrouter/actions
- Monitor: `wrangler tail chittyrouter-production`
- Logs: Cloudflare Dashboard > Workers > Logs