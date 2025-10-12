# Minimal Fixes Required

## High Priority (Blocking Production)

### Infrastructure Bindings
- **Current**: Agents reference `env.PLATFORM_VECTORS`, `env.PLATFORM_STORAGE`, `env.BLOCKCHAIN_QUEUE` but bindings not configured
- **Fix**: Add to `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "PLATFORM_STORAGE"
id = "YOUR_KV_NAMESPACE_ID"

[[vectorize]]
binding = "PLATFORM_VECTORS"
index_name = "evidence-vectors"

[[queues]]
binding = "BLOCKCHAIN_QUEUE"
queue_name = "blockchain-anchoring"
```

### Agent Integration
- **Current**: Coordination server registers agents by name but no actual instances connected
- **Fix**: Choose one approach:
  1. **In-process**: Instantiate agents in worker fetch handler, remove WebSocket routing
  2. **External agents**: Implement WebSocket clients for each agent class
- **Recommended**: In-process (simpler, lower latency)

### Vector Search Fix
- **Current**: `this.vectors.query(chittyId, { topK: 50 })` queries by string, not embedding
- **Fix**: Generate embedding first in `pattern-forecasting-agent.js:513-523`:
```javascript
async getHistoricalContext(chittyId, limit = 50) {
  if (!this.vectors) return [];

  try {
    // FIX: Get item to generate embedding
    const record = await this.storage.get(chittyId);
    if (!record) return [];

    const embedding = await this.ai.run("@cf/baai/bge-base-en-v1.5", {
      text: this.formatInput(JSON.parse(record).input),
    });

    const results = await this.vectors.query(embedding.data[0], { topK: limit });
    return results.matches || [];
  } catch (error) {
    return [];
  }
}
```

### Test Coverage
- **Current**: 0% test coverage for 1,292 lines of evidence agent code
- **Fix**: Add minimum test suite:
  - `tests/unit/universal-ingestion-agent.test.js`
  - `tests/unit/auto-classification-agent.test.js`
  - `tests/unit/pattern-forecasting-agent.test.js`
  - `tests/integration/evidence-pipeline-e2e.test.js`
- **Target**: 80% coverage before production

## Medium Priority (Production Hardening)

### Reindexing Automation
- **Current**: `reindex()` method exists but never called on schedule
- **Fix**: Add cron trigger to `wrangler.toml`:
```toml
[[triggers.crons]]
cron = "0 */6 * * *"  # Every 6 hours
```
- **Handler**: Create scheduled handler in worker to call reindex for eligible items

### Blockchain Queue Consumer
- **Current**: `queueForBlockchain()` sends to queue but no consumer processes it
- **Fix**: Implement queue consumer:
```javascript
export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      const { chittyId, priority } = message.body;
      // Anchor to ChittyChain
      await anchorToBlockchain(chittyId, env);
    }
  }
}
```

### Index Implementation
- **Current**: KV array-based indexing with race conditions
- **Fix**: Replace with production search:
  - Option A: Migrate to Vectorize semantic search
  - Option B: Use D1 with full-text indexes
  - Option C: Add atomic operations with KV transactions

### Environment Documentation
- **Current**: Required variables (`CHITTYID_SERVICE_URL`, `CHITTY_ID_TOKEN`) not documented
- **Fix**: Create `.env.example`:
```bash
# ChittyID Service (REQUIRED)
CHITTYID_SERVICE_URL=https://id.chitty.cc
CHITTY_ID_TOKEN=mcp_auth_YOUR_TOKEN_HERE

# Agent Configuration
AGENT_COORDINATION_PORT=8080
```

## Low Priority (Documentation)

### Deployment Status Clarity
- **Replace**: "Autonomous evidence pipeline with NO human classification required"
- **With**: "Autonomous evidence pipeline prototype - agents implemented, integration in progress"

### Scoping Qualifiers
- **Replace**: "ALWAYS preserves everything"
- **With**: "Preserves everything when service dependencies are available (ChittyID, storage, vectors)"

### Architecture Documentation
- **Add**: Integration diagram showing current vs target state
- **Add**: Deployment checklist tracking completion %
- **Add**: Performance benchmarks and cost estimates
