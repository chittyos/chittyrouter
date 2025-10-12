# Blockchain Queue Consumer Integration

## Problem Solved

**Before**: `universal-ingestion-agent.js` sent high-priority evidence (probability > 0.7) to `BLOCKCHAIN_QUEUE`, but no consumer existed to process messages. Evidence was queued but never minted to blockchain.

**After**: Cloudflare Pipelines consumer reads queue → routes through soft/hard minting → executes full 7-step evidence ingestion → anchors to ChittyChain.

## Architecture

```
universal-ingestion-agent.js
  ↓
  BLOCKCHAIN_QUEUE.send({ chittyId, priority, timestamp })
  ↓
BlockchainQueueConsumer (NEW)
  ↓
  1. Retrieve document from storage
  ↓
  2. SoftHardMintingService.processDocument()
     - 99% soft mint (off-chain, $0.01)
     - 1% hard mint (on-chain, $40)
     - Criticality > 0.9 → force hard mint
  ↓
  3. EvidenceIngestionOrchestrator.ingestEvidence()
     - Schema validation (ChittySchema)
     - ChittyID mint (id.chitty.cc)
     - Event store (event-sourced)
     - Verify (ChittyVerify)
     - Compliance (ChittyCheck)
     - Storage (ChittySchema)
     - Case linking (ChittyCases)
  ↓
  4. storeInChittyChain() - Final blockchain anchoring
  ↓
  ✅ Evidence blockchain-anchored with cost optimization
```

## Cost Optimization

### Soft Mint (99% of documents)
- **Cost**: $0.01 per document
- **Storage**: Off-chain (ChittyOS-Data)
- **Verification**: Hash anchoring
- **Use case**: Standard evidence documents

### Hard Mint (1% of documents + critical threshold)
- **Cost**: $40 per document
- **Storage**: On-chain (ChittyLedger blockchain)
- **Verification**: Full blockchain immutability
- **Triggers**:
  - Random 1% selection
  - Priority = "critical"
  - Probability > 0.9
  - Document types: criminal-evidence, property-deed, court-order, settlement
  - Document value > $50,000

### Cost Savings
- **Without optimization**: 100% hard mint = $40/doc
- **With optimization**: 99% soft + 1% hard = $0.40/doc average
- **Savings**: $39.60 per document (99% reduction)

## Monetization Hooks

Both soft and hard minting include billing integration points:

```javascript
// Soft mint billing (line 199-207 in soft-hard-minting-integration.js)
POST https://evidence.chitty.cc/api/v1/soft-mint
Cost: $0.01
Tracked via: this.metrics.softMinted

// Hard mint billing (line 252-260 in soft-hard-minting-integration.js)
POST https://ledger.chitty.cc/api/v1/hard-mint
Cost: $40
Tracked via: this.metrics.hardMinted

// Upgrade billing (soft → hard)
POST /mint/upgrade
Additional cost: $39.99 (difference between soft and hard)
```

## Deployment

### 1. Create Cloudflare Queues

```bash
# Create main queue
wrangler queues create blockchain-queue

# Create dead letter queue
wrangler queues create blockchain-dlq

# Create error tracking queue
wrangler queues create error-tracking
```

### 2. Set Secrets

```bash
wrangler secret put CHITTY_ID_TOKEN --config wrangler.queue-consumer.toml
wrangler secret put API_KEY --config wrangler.queue-consumer.toml
wrangler secret put CHITTY_REGISTRY_TOKEN --config wrangler.queue-consumer.toml
wrangler secret put CHITTY_VERIFY_TOKEN --config wrangler.queue-consumer.toml
wrangler secret put CHITTY_CHECK_TOKEN --config wrangler.queue-consumer.toml
```

### 3. Update KV Namespace IDs

Edit `wrangler.queue-consumer.toml`:
- Replace `YOUR_PLATFORM_STORAGE_KV_ID` with actual KV namespace ID
- Replace `YOUR_METRICS_STORAGE_KV_ID` with actual KV namespace ID

### 4. Deploy Consumer

```bash
wrangler deploy --config wrangler.queue-consumer.toml
```

### 5. Bind Queue to Main Worker

In `wrangler.toml` (main ChittyRouter worker):
```toml
[[queues.producers]]
binding = "BLOCKCHAIN_QUEUE"
queue = "blockchain-queue"
```

## Testing

### Unit Tests

```bash
npm run test -- src/pipeline/blockchain-queue-consumer.test.js
```

### Integration Test

```javascript
// Send test message to queue
await env.BLOCKCHAIN_QUEUE.send({
  chittyId: 'CHITTY-INFO-123456-ABC',
  priority: 'high',
  timestamp: new Date().toISOString(),
  metadata: {
    filename: 'test-evidence.pdf',
    type: 'legal-document',
    probability: 0.85
  }
});

// Consumer automatically processes
// Check metrics endpoint
const metrics = await fetch('https://router.chitty.cc/queue/metrics');
```

## Monitoring

### Queue Metrics

```bash
# View queue status
wrangler queues list

# Monitor consumer logs
wrangler tail chittyrouter-blockchain-consumer

# Check metrics storage
wrangler kv:key list --namespace-id=YOUR_METRICS_STORAGE_KV_ID --prefix="queue-metrics:"
```

### Key Metrics

- **Processed**: Total messages processed
- **Soft Minted**: Count of soft mints
- **Hard Minted**: Count of hard mints
- **Failed**: Failed processing attempts
- **Total Cost**: Cumulative minting costs
- **Success Rate**: (Processed - Failed) / Processed
- **Avg Cost Per Document**: Total Cost / Processed

## Retry Strategy

1. **First failure**: Retry after 60 seconds
2. **Second failure**: Retry after 120 seconds (2^1 * 60)
3. **Third failure**: Retry after 240 seconds (2^2 * 60)
4. **After 3 failures**: Move to Dead Letter Queue

## Error Handling

### Dead Letter Queue Processing

```javascript
// Separate consumer for DLQ investigation
export default {
  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      console.error('DLQ Message:', message.body);

      // Log to external monitoring
      await logToDashboard(message.body);

      // Optionally: Manual review workflow
      await createManualReviewTask(message.body);

      message.ack();
    }
  }
};
```

## Integration with Existing Code

### Universal Ingestion Agent (NO CHANGES REQUIRED)

The existing code at `src/ai/universal-ingestion-agent.js:277` already sends to queue:

```javascript
async queueForBlockchain(chittyId, priority) {
  await this.env.BLOCKCHAIN_QUEUE.send({
    chittyId,
    priority,
    timestamp: new Date().toISOString(),
  });
}
```

Consumer automatically picks up these messages.

### Soft/Hard Minting Service (NO CHANGES REQUIRED)

Existing `src/minting/soft-hard-minting-integration.js` works as-is:
- Cost tracking built-in
- Metrics collection automatic
- API endpoints functional

### Evidence Orchestrator (NO CHANGES REQUIRED)

Existing `src/litigation/evidence-ingestion-orchestrator.js` works as-is:
- 7-step ChittyOS flow implemented
- Service registry dynamic
- Case linking automatic

## Next Steps

1. ✅ Create blockchain-queue-consumer.js
2. ✅ Create wrangler.queue-consumer.toml
3. ⏳ Create Cloudflare Queues (requires CLI)
4. ⏳ Deploy consumer worker
5. ⏳ Test with sample evidence
6. ⏳ Monitor metrics and costs
7. ⏳ Tune soft/hard mint ratios based on real usage

## Cost Projections

### Scenario: 1,000 documents/month

**Without optimization (100% hard mint)**:
- Cost: 1,000 × $40 = $40,000/month

**With optimization (99% soft, 1% hard)**:
- Soft: 990 × $0.01 = $9.90
- Hard: 10 × $40 = $400
- Total: $409.90/month
- **Savings: $39,590.10/month (99% reduction)**

### Scenario: 10,000 documents/month

**With optimization**:
- Soft: 9,900 × $0.01 = $99
- Hard: 100 × $40 = $4,000
- Total: $4,099/month
- **Savings: $395,901/month**

## Upgrade Path

Documents can be upgraded from soft → hard mint on demand:

```javascript
// Upgrade when evidence becomes critical
await mintingService.upgradeToHardMint(
  'CHITTY-INFO-123456-ABC',
  'Document required for court submission'
);

// Costs $39.99 (difference between $0.01 and $40)
```

Use cases for upgrades:
- Evidence selected for court filing
- Document challenged by opposing counsel
- Chain of custody verification required
- Regulatory audit triggered
- High-value transaction finalized
