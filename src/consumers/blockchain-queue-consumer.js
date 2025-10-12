/**
 * Blockchain Queue Consumer
 *
 * Bridges orphaned BLOCKCHAIN_QUEUE to soft/hard minting + ChittyChain storage
 * Implements Cloudflare Queues consumer pattern with batch processing
 *
 * Flow:
 * 1. BLOCKCHAIN_QUEUE.receive() → {chittyId, priority, timestamp, probability}
 * 2. Route to SoftHardMintingService based on priority/probability
 * 3. Store result in ChittyChain via API
 * 4. Track monetization metrics
 */

import { SoftHardMintingService } from "../minting/soft-hard-minting-integration.js";
import { EvidenceIngestionOrchestrator } from "../litigation/evidence-ingestion-orchestrator.js";
import { storeInChittyChain } from "../utils/storage.js";

export default {
  /**
   * Queue consumer handler - called by Cloudflare when messages available
   * @param {MessageBatch} batch - Batch of queue messages
   * @param {Env} env - Environment bindings
   * @param {ExecutionContext} ctx - Execution context
   */
  async queue(batch, env, ctx) {
    const results = {
      processed: 0,
      failed: 0,
      softMinted: 0,
      hardMinted: 0,
      totalCost: 0,
      errors: [],
    };

    console.log(
      `📦 Processing blockchain queue batch: ${batch.messages.length} messages`,
    );

    // Initialize services
    const mintingService = new SoftHardMintingService(env);
    const evidenceOrchestrator = new EvidenceIngestionOrchestrator(env.AI, env);

    // Process messages in parallel (within batch)
    const messagePromises = batch.messages.map(async (message) => {
      try {
        const result = await processBlockchainMessage(
          message,
          mintingService,
          evidenceOrchestrator,
          env,
        );

        results.processed++;
        if (result.mintType === "hard") {
          results.hardMinted++;
          results.totalCost += 40; // $40 per hard mint
        } else {
          results.softMinted++;
          results.totalCost += 0.01; // $0.01 per soft mint
        }

        // Acknowledge message
        message.ack();

        return { success: true, result };
      } catch (error) {
        results.failed++;
        results.errors.push({
          messageId: message.id,
          error: error.message,
          timestamp: new Date().toISOString(),
        });

        console.error(`❌ Failed to process message ${message.id}:`, error);

        // Retry message (Cloudflare will retry up to max_retries)
        message.retry();

        return { success: false, error: error.message };
      }
    });

    await Promise.allSettled(messagePromises);

    // Log batch results
    console.log(
      `✅ Batch complete: ${results.processed} processed, ${results.failed} failed`,
    );
    console.log(
      `💰 Batch cost: $${results.totalCost.toFixed(2)} (${results.softMinted} soft, ${results.hardMinted} hard)`,
    );

    // Store batch metrics
    await storeBatchMetrics(env, results);

    return results;
  },
};

/**
 * Process individual blockchain queue message
 */
async function processBlockchainMessage(
  message,
  mintingService,
  evidenceOrchestrator,
  env,
) {
  const { chittyId, priority, timestamp, probability, metadata } = message.body;

  console.log(
    `🔗 Processing blockchain message for ${chittyId} (priority: ${priority}, probability: ${probability})`,
  );

  try {
    // Step 1: Fetch document from storage
    const document = await fetchDocument(chittyId, env);
    if (!document) {
      throw new Error(`Document not found for ChittyID: ${chittyId}`);
    }

    // Step 2: Determine minting strategy
    const mintingOptions = {
      forceHard: priority === "critical" || probability > 0.9,
      metadata: {
        queuedAt: timestamp,
        priority,
        probability,
        originalMetadata: metadata,
      },
    };

    // Step 3: Process through minting service
    const mintResult = await mintingService.processDocument(
      document,
      mintingOptions,
    );

    console.log(
      `✅ Minted ${chittyId}: ${mintResult.mintingStrategy} (cost: $${mintResult.cost})`,
    );

    // Step 4: Store in ChittyChain
    const chainResult = await storeInChittyChain(env, {
      chittyId,
      blockHash:
        mintResult.result.transactionHash || mintResult.result.documentHash,
      mintType: mintResult.mintingStrategy,
      timestamp: new Date().toISOString(),
      metadata: {
        priority,
        probability,
        cost: mintResult.cost,
        processingTime: mintResult.processingTime,
      },
    });

    console.log(`⛓️ Stored in ChittyChain: ${chainResult.blockHash}`);

    // Step 5: Update evidence orchestrator (if applicable)
    if (document.evidenceType) {
      await evidenceOrchestrator.storeAIAnalysisEvent(chittyId, {
        blockchain_storage: {
          mintType: mintResult.mintingStrategy,
          blockHash: chainResult.blockHash,
          cost: mintResult.cost,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      chittyId,
      mintType: mintResult.mintingStrategy,
      blockHash: chainResult.blockHash,
      cost: mintResult.cost,
      success: true,
    };
  } catch (error) {
    console.error(`❌ Failed to process ${chittyId}:`, error);
    throw error;
  }
}

/**
 * Fetch document from PLATFORM_STORAGE
 */
async function fetchDocument(chittyId, env) {
  try {
    const docData = await env.PLATFORM_STORAGE.get(chittyId);
    if (!docData) {
      return null;
    }

    return JSON.parse(docData);
  } catch (error) {
    console.error(`❌ Failed to fetch document ${chittyId}:`, error);
    return null;
  }
}

/**
 * Store batch processing metrics
 */
async function storeBatchMetrics(env, results) {
  const metricsKey = `blockchain-queue-metrics:${Date.now()}`;
  const metrics = {
    timestamp: new Date().toISOString(),
    processed: results.processed,
    failed: results.failed,
    softMinted: results.softMinted,
    hardMinted: results.hardMinted,
    totalCost: results.totalCost,
    errors: results.errors,
  };

  try {
    await env.PLATFORM_STORAGE.put(metricsKey, JSON.stringify(metrics), {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });

    // Update aggregate metrics
    await updateAggregateMetrics(env, metrics);
  } catch (error) {
    console.error("❌ Failed to store batch metrics:", error);
  }
}

/**
 * Update aggregate blockchain queue metrics
 */
async function updateAggregateMetrics(env, batchMetrics) {
  const aggregateKey = "blockchain-queue-aggregate-metrics";

  try {
    const currentData = await env.PLATFORM_STORAGE.get(aggregateKey);
    const current = currentData
      ? JSON.parse(currentData)
      : {
          totalProcessed: 0,
          totalFailed: 0,
          totalSoftMinted: 0,
          totalHardMinted: 0,
          totalCost: 0,
          lastUpdated: null,
        };

    const updated = {
      totalProcessed: current.totalProcessed + batchMetrics.processed,
      totalFailed: current.totalFailed + batchMetrics.failed,
      totalSoftMinted: current.totalSoftMinted + batchMetrics.softMinted,
      totalHardMinted: current.totalHardMinted + batchMetrics.hardMinted,
      totalCost: current.totalCost + batchMetrics.totalCost,
      lastUpdated: new Date().toISOString(),
      lastBatch: batchMetrics.timestamp,
    };

    await env.PLATFORM_STORAGE.put(aggregateKey, JSON.stringify(updated));

    console.log(
      `📊 Aggregate metrics updated: ${updated.totalProcessed} total processed, $${updated.totalCost.toFixed(2)} total cost`,
    );
  } catch (error) {
    console.error("❌ Failed to update aggregate metrics:", error);
  }
}

/**
 * Get blockchain queue metrics
 * HTTP endpoint for monitoring
 */
export async function getBlockchainQueueMetrics(env) {
  try {
    const aggregateData = await env.PLATFORM_STORAGE.get(
      "blockchain-queue-aggregate-metrics",
    );
    const aggregate = aggregateData ? JSON.parse(aggregateData) : null;

    // Get recent batch metrics (last 24 hours)
    const recentBatches = [];
    const list = await env.PLATFORM_STORAGE.list({
      prefix: "blockchain-queue-metrics:",
    });

    for (const key of list.keys) {
      const batchData = await env.PLATFORM_STORAGE.get(key.name);
      if (batchData) {
        recentBatches.push(JSON.parse(batchData));
      }
    }

    // Sort by timestamp descending
    recentBatches.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
      aggregate,
      recentBatches: recentBatches.slice(0, 100), // Last 100 batches
      summary: {
        totalProcessed: aggregate?.totalProcessed || 0,
        totalFailed: aggregate?.totalFailed || 0,
        successRate: aggregate?.totalProcessed
          ? (
              (aggregate.totalProcessed /
                (aggregate.totalProcessed + aggregate.totalFailed)) *
              100
            ).toFixed(2) + "%"
          : "0%",
        softMintPercentage: aggregate?.totalProcessed
          ? (
              (aggregate.totalSoftMinted / aggregate.totalProcessed) *
              100
            ).toFixed(2) + "%"
          : "0%",
        hardMintPercentage: aggregate?.totalProcessed
          ? (
              (aggregate.totalHardMinted / aggregate.totalProcessed) *
              100
            ).toFixed(2) + "%"
          : "0%",
        totalCost: aggregate?.totalCost
          ? `$${aggregate.totalCost.toFixed(2)}`
          : "$0.00",
        lastUpdated: aggregate?.lastUpdated || null,
      },
    };
  } catch (error) {
    console.error("❌ Failed to get blockchain queue metrics:", error);
    return { error: error.message };
  }
}
