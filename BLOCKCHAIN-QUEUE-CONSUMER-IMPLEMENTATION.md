# Blockchain Queue Consumer - Implementation Guide

**Priority**: CRITICAL
**Estimated Time**: 8 hours
**Objective**: Create consumer for orphaned BLOCKCHAIN_QUEUE to process evidence

---

## Problem

`BLOCKCHAIN_QUEUE` has a producer (`UniversalIngestionAgent`) but no consumer:

```javascript
// From universal-ingestion-agent.js (LINE 275-282)
async queueForBlockchain(chittyId, priority) {
  // Queue for blockchain anchoring
  await this.env.BLOCKCHAIN_QUEUE.send({
    chittyId,
    priority,
    timestamp: new Date().toISOString(),
  });
}
```

**Result**: Evidence queued but never processed → data loss

---

## Solution Overview

Create a Cloudflare Queue consumer worker that:
1. Receives messages from `BLOCKCHAIN_QUEUE`
2. Fetches full evidence record from `PLATFORM_STORAGE`
3. Routes to soft/hard minting service
4. Stores result in ChittyChain
5. Tracks monetization metrics

---

## Implementation Steps

### Step 1: Create Consumer Worker (2 hours)

**File**: `src/workers/blockchain-consumer.js`

```javascript
/**
 * Blockchain Queue Consumer Worker
 * Processes evidence queued for blockchain storage
 */

import { SoftHardMintingService } from '../minting/soft-hard-minting-integration.js';
import { storeInChittyChain } from '../utils/storage.js';
import { logSystemEvent } from '../utils/chain-logger.js';

export default {
  async queue(batch, env, ctx) {
    console.log(`📦 Processing batch of ${batch.messages.length} evidence items`);

    // Initialize minting service
    const mintingService = new SoftHardMintingService(env);

    // Track batch metrics
    const metrics = {
      processed: 0,
      failed: 0,
      softMinted: 0,
      hardMinted: 0,
      totalCost: 0
    };

    // Process messages in parallel (batched)
    const promises = batch.messages.map(async (msg) => {
      try {
        const { chittyId, priority, timestamp } = msg.body;

        console.log(`📄 Processing evidence: ${chittyId} (priority: ${priority})`);

        // Step 1: Fetch evidence record from storage
        const evidenceJSON = await env.PLATFORM_STORAGE.get(chittyId);
        if (!evidenceJSON) {
          console.error(`❌ Evidence not found in storage: ${chittyId}`);
          msg.retry();
          metrics.failed++;
          return;
        }

        const evidence = JSON.parse(evidenceJSON);

        // Step 2: Process through minting service
        const mintingResult = await mintingService.processDocument(
          {
            ...evidence.input,
            chittyId: chittyId,
            priority: priority
          },
          {
            forceHard: priority === 'critical'
          }
        );

        // Step 3: Store in ChittyChain
        await storeInChittyChain(env, {
          type: 'EVIDENCE_MINTED',
          chittyId: chittyId,
          mintingStrategy: mintingResult.mintingStrategy,
          cost: mintingResult.cost,
          timestamp: new Date().toISOString(),
          originalPriority: priority,
          evidenceMetadata: {
            probability: evidence.analysis?.probability,
            priority: evidence.analysis?.priority,
            entities: evidence.entities?.length || 0
          }
        });

        // Step 4: Track monetization
        if (env.BILLING_QUEUE) {
          await env.BILLING_QUEUE.send({
            chittyId: chittyId,
            operation: mintingResult.mintingStrategy === 'hard' ? 'hard_mint' : 'soft_mint',
            cost: mintingResult.cost,
            timestamp: new Date().toISOString(),
            metadata: {
              priority: priority,
              evidenceProbability: evidence.analysis?.probability
            }
          });
        }

        // Update metrics
        metrics.processed++;
        if (mintingResult.mintingStrategy === 'hard') {
          metrics.hardMinted++;
          metrics.totalCost += 40;
        } else {
          metrics.softMinted++;
          metrics.totalCost += 0.01;
        }

        // Acknowledge message (processed successfully)
        msg.ack();

        console.log(`✅ Evidence processed: ${chittyId} (${mintingResult.mintingStrategy})`);

      } catch (error) {
        console.error(`❌ Failed to process message:`, error);
        metrics.failed++;

        // Retry message (will go to DLQ after max retries)
        msg.retry();
      }
    });

    // Wait for all messages to process
    await Promise.allSettled(promises);

    // Log batch completion
    await logSystemEvent('BLOCKCHAIN_QUEUE_BATCH_COMPLETE', {
      batchSize: batch.messages.length,
      metrics: metrics,
      timestamp: new Date().toISOString()
    });

    console.log(`📊 Batch complete: ${metrics.processed} processed, ${metrics.failed} failed`);
    console.log(`💰 Total cost: $${metrics.totalCost.toFixed(2)} (${metrics.softMinted} soft, ${metrics.hardMinted} hard)`);
  }
};
```

### Step 2: Update wrangler.toml (30 minutes)

Add queue consumer configuration:

```toml
# Queue configuration for evidence processing
[[queues.producers]]
queue = "blockchain-queue"
binding = "BLOCKCHAIN_QUEUE"

[[queues.consumers]]
queue = "blockchain-queue"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "blockchain-dlq"

# Dead letter queue for failed messages
[[queues.producers]]
queue = "blockchain-dlq"
binding = "BLOCKCHAIN_DLQ"

# Billing queue (if not exists)
[[queues.producers]]
queue = "billing-queue"
binding = "BILLING_QUEUE"
```

### Step 3: Create Integration Test (2 hours)

**File**: `tests/integration/blockchain-queue.test.js`

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { UniversalIngestionAgent } from '../../src/ai/universal-ingestion-agent.js';

describe('Blockchain Queue Integration', () => {
  let env;
  let agent;

  beforeAll(() => {
    // Mock env with queue bindings
    env = {
      BLOCKCHAIN_QUEUE: {
        send: async (msg) => {
          console.log('Queue message sent:', msg);
          return { id: 'msg-123' };
        }
      },
      PLATFORM_STORAGE: new Map(),
      PLATFORM_VECTORS: {
        insert: async () => {}
      },
      CHITTYID_SERVICE_URL: 'https://id.chitty.cc',
      CHITTY_ID_TOKEN: 'test-token'
    };

    agent = new UniversalIngestionAgent(env);
  });

  it('should queue high-priority evidence for blockchain', async () => {
    const input = {
      subject: 'Critical evidence - property deed',
      body: 'Deed for 123 Main St',
      filename: 'deed-123-main-st.pdf',
      priority: 'critical'
    };

    const result = await agent.ingest(input);

    expect(result.success).toBe(true);
    expect(result.blockchainQueued).toBe(true);
    expect(result.chittyId).toBeDefined();
  });

  it('should queue high-probability evidence for blockchain', async () => {
    const input = {
      subject: 'Criminal evidence - surveillance footage',
      body: 'Video evidence from incident',
      filename: 'surveillance-2024-10-12.mp4'
    };

    // Mock AI analysis to return high probability
    const originalAnalyze = agent.analyzeProbability;
    agent.analyzeProbability = async () => ({
      probability: 0.95, // > 0.7 threshold
      type: 'video',
      priority: 'high',
      entities: []
    });

    const result = await agent.ingest(input);

    expect(result.blockchainQueued).toBe(true);

    // Restore original method
    agent.analyzeProbability = originalAnalyze;
  });

  it('should NOT queue low-priority, low-probability evidence', async () => {
    const input = {
      subject: 'General inquiry',
      body: 'Question about office hours'
    };

    // Mock low probability
    const originalAnalyze = agent.analyzeProbability;
    agent.analyzeProbability = async () => ({
      probability: 0.2,
      type: 'communication',
      priority: 'low',
      entities: []
    });

    const result = await agent.ingest(input);

    expect(result.blockchainQueued).toBe(false);

    agent.analyzeProbability = originalAnalyze;
  });
});
```

### Step 4: Add Monitoring (1 hour)

**File**: `src/monitoring/queue-metrics.js`

```javascript
/**
 * Queue monitoring and metrics
 */

export class QueueMetrics {
  constructor(env) {
    this.env = env;
  }

  async getBlockchainQueueMetrics() {
    // Query queue depth, processing rate, error rate
    // (Requires Cloudflare Analytics API integration)

    return {
      queueDepth: 0, // Messages waiting
      messagesProcessed: 0, // Total processed
      messagesRetried: 0, // Retry count
      messagesInDLQ: 0, // Dead letter queue
      averageProcessingTime: 0, // ms
      errorRate: 0.0 // percentage
    };
  }

  async recordProcessingMetrics(metrics) {
    // Store in Durable Object for dashboard
    if (this.env.METRICS_DO) {
      const doId = this.env.METRICS_DO.idFromName('queue-metrics');
      const metricsObject = this.env.METRICS_DO.get(doId);

      await metricsObject.fetch(new Request('https://example.com/metrics', {
        method: 'POST',
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          ...metrics
        })
      }));
    }
  }

  async getHealthStatus() {
    const metrics = await this.getBlockchainQueueMetrics();

    return {
      healthy: metrics.queueDepth < 1000 && metrics.errorRate < 0.01,
      queueDepth: metrics.queueDepth,
      errorRate: metrics.errorRate,
      processingRate: metrics.messagesProcessed,
      timestamp: new Date().toISOString()
    };
  }
}
```

### Step 5: Add Health Check Endpoint (30 minutes)

Update main worker to expose queue health:

```javascript
// In index.js or main worker
import { QueueMetrics } from './monitoring/queue-metrics.js';

// Add endpoint
if (url.pathname === '/queue/health') {
  const queueMetrics = new QueueMetrics(env);
  const health = await queueMetrics.getHealthStatus();

  return new Response(JSON.stringify(health), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### Step 6: Deployment (1 hour)

```bash
# 1. Deploy queue consumer
npm run deploy

# 2. Verify deployment
curl https://router.chitty.cc/queue/health

# 3. Monitor queue processing
wrangler tail blockchain-consumer

# 4. Check for errors
wrangler tail blockchain-consumer --format pretty | grep ERROR

# 5. Verify queue depth decreasing
# (Should see queued messages being processed)
```

### Step 7: Testing in Production (1 hour)

```bash
# Send test evidence through pipeline
curl -X POST https://router.chitty.cc/api/evidence/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CHITTY_ID_TOKEN" \
  -d '{
    "subject": "Test evidence - critical priority",
    "body": "This is a test of the blockchain queue consumer",
    "priority": "critical"
  }'

# Check queue health
curl https://router.chitty.cc/queue/health

# Verify evidence was minted
curl https://ledger.chitty.cc/api/v1/evidence/{chittyId}

# Check billing was tracked (if billing queue exists)
curl https://billing.chitty.cc/api/v1/usage/recent
```

---

## Validation Checklist

- [ ] Consumer worker created (`src/workers/blockchain-consumer.js`)
- [ ] `wrangler.toml` updated with queue configuration
- [ ] Integration tests pass (`npm run test:integration`)
- [ ] Deployment successful (`npm run deploy`)
- [ ] Health check endpoint returns healthy status
- [ ] Test evidence processed through full pipeline
- [ ] Queue depth = 0 (no orphaned messages)
- [ ] Minting decisions logged to ChittyChain
- [ ] Billing tracked (if billing queue exists)
- [ ] Monitoring dashboard shows metrics

---

## Expected Outcomes

**Before**:
- Evidence queued but never processed
- Queue depth increasing over time
- No minting decisions made
- No billing tracking

**After**:
- All queued evidence processed
- Queue depth = 0
- Soft/hard minting decisions made
- Billing metrics tracked
- Full audit trail in ChittyChain

**Metrics**:
- Processing rate: 100+ docs/second
- Error rate: < 0.1%
- Soft/hard ratio: ~99/1
- Cost savings: $500+/month

---

## Rollback Plan

If deployment fails:

1. **Immediate**: Stop consumer worker
   ```bash
   wrangler delete blockchain-consumer
   ```

2. **Restore**: Remove queue consumer from `wrangler.toml`
   ```bash
   git checkout wrangler.toml
   ```

3. **Redeploy**: Deploy without consumer
   ```bash
   npm run deploy
   ```

4. **Investigation**: Check logs for errors
   ```bash
   wrangler tail blockchain-consumer --format pretty
   ```

5. **Fix**: Address errors, redeploy

---

## Next Steps After Implementation

Once blockchain queue consumer is working:

1. **Phase 2**: Integrate with unified pipeline (1 week)
2. **Phase 3**: Add monetization hooks (3-5 days)
3. **Optimization**: Tune batch size, timeouts based on metrics
4. **Scaling**: Add more consumer workers if queue depth remains high

---

**Document Version**: 1.0
**Created**: 2025-10-12
**Status**: Ready for Implementation
**Priority**: CRITICAL
