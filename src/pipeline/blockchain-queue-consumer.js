/**
 * Blockchain Queue Consumer - Cloudflare Pipelines Implementation
 * Connects orphaned BLOCKCHAIN_QUEUE to soft/hard minting + evidence ingestion
 *
 * Architecture:
 * BLOCKCHAIN_QUEUE → determineMintingStrategy() → soft/hard mint → 7-step ingestion → ChittyChain
 */

import { SoftHardMintingService } from "../minting/soft-hard-minting-integration.js";
import { EvidenceIngestionOrchestrator } from "../litigation/evidence-ingestion-orchestrator.js";
import { storeInChittyChain } from "../utils/storage.js";

export class BlockchainQueueConsumer {
  constructor(env) {
    this.env = env;
    this.mintingService = new SoftHardMintingService(env);
    this.evidenceOrchestrator = new EvidenceIngestionOrchestrator(env.AI, env);

    this.metrics = {
      processed: 0,
      softMinted: 0,
      hardMinted: 0,
      failed: 0,
      totalCost: 0,
    };
  }

  /**
   * Main consumer loop - processes BLOCKCHAIN_QUEUE messages
   * Triggered by Cloudflare Pipelines on message arrival
   */
  async consume(batch) {
    console.log(`📦 Processing batch: ${batch.messages.length} items`);

    const results = [];

    for (const message of batch.messages) {
      try {
        const result = await this.processMessage(message);
        results.push(result);

        // Acknowledge successful processing
        message.ack();
      } catch (error) {
        console.error("❌ Message processing failed:", error);
        this.metrics.failed++;

        // Retry with exponential backoff (up to 3 times)
        if (message.attempts < 3) {
          message.retry({ delaySeconds: Math.pow(2, message.attempts) * 60 });
        } else {
          console.error(`⚠️ Message exceeded retry limit, moving to DLQ`);
          message.ack(); // Remove from queue after max retries
          await this.sendToDeadLetterQueue(message);
        }
      }
    }

    return {
      processed: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      metrics: this.metrics,
    };
  }

  /**
   * Process single queue message
   * Flow: Retrieve document → Mint (soft/hard) → Ingest → ChittyChain
   */
  async processMessage(message) {
    const { chittyId, priority, timestamp, metadata } = message.body;

    console.log(`🔄 Processing: ${chittyId} (priority: ${priority})`);

    // Step 1: Retrieve document from storage
    const document = await this.retrieveDocument(chittyId, metadata);

    if (!document) {
      throw new Error(`Document not found: ${chittyId}`);
    }

    // Step 2: Determine minting strategy and execute
    const mintingResult = await this.mintingService.processDocument(document, {
      priority,
      forceHard:
        priority === "critical" ||
        (document.probability && document.probability > 0.9),
    });

    // Update metrics
    this.metrics.processed++;
    this.metrics.totalCost += mintingResult.cost;

    if (mintingResult.mintingStrategy === "hard") {
      this.metrics.hardMinted++;
    } else {
      this.metrics.softMinted++;
    }

    // Step 3: Full evidence ingestion (7-step ChittyOS flow)
    const ingestionResult = await this.evidenceOrchestrator.ingestEvidence(
      {
        filename: document.filename || document.title,
        sha256: document.hash || (await this.calculateHash(document)),
        evidence_type: document.type || "document",
        significance_level: priority,
        original_path: document.path,
        metadata: document.metadata,
      },
      document.content || document,
    );

    // Step 4: Final ChittyChain anchoring
    const chainResult = await storeInChittyChain(this.env, {
      chittyId: mintingResult.chittyId,
      mintType: mintingResult.mintingStrategy,
      documentHash: mintingResult.result.documentHash,
      transactionHash: mintingResult.result.transactionHash, // Only present for hard mints
      ingestion: ingestionResult,
      queueTimestamp: timestamp,
      processedAt: new Date().toISOString(),
    });

    console.log(`✅ Completed: ${chittyId} → ${chainResult.blockHash}`);

    return {
      success: true,
      chittyId: mintingResult.chittyId,
      mintingStrategy: mintingResult.mintingStrategy,
      cost: mintingResult.cost,
      blockHash: chainResult.blockHash,
      processingTime: mintingResult.processingTime,
    };
  }

  /**
   * Retrieve document from storage by ChittyID
   */
  async retrieveDocument(chittyId, metadata) {
    // Try PLATFORM_STORAGE first
    if (this.env.PLATFORM_STORAGE) {
      const stored = await this.env.PLATFORM_STORAGE.get(chittyId);
      if (stored) {
        return JSON.parse(stored);
      }
    }

    // Try evidence API
    const evidenceAPI = this.env.EVIDENCE_API || "https://evidence.chitty.cc";
    const response = await fetch(`${evidenceAPI}/api/v1/document/${chittyId}`, {
      headers: {
        Authorization: `Bearer ${this.env.API_KEY}`,
      },
    });

    if (response.ok) {
      return await response.json();
    }

    // Fallback: reconstruct from metadata if available
    if (metadata) {
      console.warn(`⚠️ Document not in storage, using metadata`);
      return {
        chittyId,
        ...metadata,
        reconstructed: true,
      };
    }

    return null;
  }

  /**
   * Calculate document hash
   */
  async calculateHash(document) {
    const content = JSON.stringify({
      title: document.title,
      content: document.content,
      type: document.type,
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Send failed messages to Dead Letter Queue
   */
  async sendToDeadLetterQueue(message) {
    if (!this.env.BLOCKCHAIN_DLQ) {
      console.error("⚠️ No DLQ configured, message lost");
      return;
    }

    await this.env.BLOCKCHAIN_DLQ.send({
      originalMessage: message.body,
      attempts: message.attempts,
      lastError: message.lastError,
      timestamp: new Date().toISOString(),
    });

    console.log(`📮 Sent to DLQ: ${message.body.chittyId}`);
  }

  /**
   * Get consumer metrics
   */
  getMetrics() {
    const successRate =
      this.metrics.processed > 0
        ? (
            ((this.metrics.processed - this.metrics.failed) /
              this.metrics.processed) *
            100
          ).toFixed(2)
        : 0;

    return {
      ...this.metrics,
      successRate: `${successRate}%`,
      avgCostPerDocument:
        this.metrics.processed > 0
          ? (this.metrics.totalCost / this.metrics.processed).toFixed(2)
          : 0,
    };
  }
}

/**
 * Cloudflare Queue Consumer Handler
 * Automatically invoked by Cloudflare when messages arrive
 */
export default {
  async queue(batch, env, ctx) {
    const consumer = new BlockchainQueueConsumer(env);

    try {
      const result = await consumer.consume(batch);

      console.log("📊 Batch metrics:", result.metrics);

      // Store metrics for monitoring
      if (env.METRICS_STORAGE) {
        await env.METRICS_STORAGE.put(
          `queue-metrics:${Date.now()}`,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            result,
          }),
        );
      }

      return result;
    } catch (error) {
      console.error("❌ Queue consumer error:", error);

      // Log to error tracking
      if (env.ERROR_TRACKING) {
        await env.ERROR_TRACKING.send({
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });
      }

      throw error;
    }
  },
};
