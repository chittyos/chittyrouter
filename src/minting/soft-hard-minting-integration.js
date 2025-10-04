#!/usr/bin/env node

/**
 * Soft/Hard Minting Integration for ChittyRouter
 * Connects ChittyLedger progressive minting with ChittyRouter evidence processing
 * Implements 99% soft / 1% hard minting strategy for cost optimization
 */

import { ChittyIDValidator } from '../chittyid/chittyid-validator.js';
import { ProductionSessionSync } from '../sync/enhanced-session-sync.js';

export class SoftHardMintingService {
  constructor(env) {
    this.env = env;
    this.ledgerAPI = env.LEDGER_API || 'https://ledger.chitty.cc';
    this.evidenceAPI = env.EVIDENCE_API || 'https://evidence.chitty.cc';

    // Initialize dependencies
    this.chittyIDValidator = new ChittyIDValidator(env);
    this.sessionSync = new ProductionSessionSync(env);

    // Minting thresholds and configuration
    this.config = {
      softMintPercentage: 99,
      hardMintPercentage: 1,
      criticalityThreshold: 0.9, // Documents with criticality > 0.9 get hard minted
      batchSize: 100,
      gasOptimizationEnabled: true,
      costPerHardMint: 40, // $40 average per on-chain transaction
      costPerSoftMint: 0.01 // $0.01 for off-chain storage
    };

    // Metrics
    this.metrics = {
      totalDocuments: 0,
      softMinted: 0,
      hardMinted: 0,
      costSaved: 0,
      avgProcessingTime: 0
    };

    console.log('💎 Soft/Hard Minting Service initialized');
    console.log(`📊 Strategy: ${this.config.softMintPercentage}% soft / ${this.config.hardMintPercentage}% hard`);
  }

  /**
   * Process document for minting with automatic soft/hard decision
   */
  async processDocument(document, options = {}) {
    const startTime = Date.now();

    try {
      // Step 1: Generate and validate ChittyID (requires id.chitty.cc)
      const chittyId = await this.generateDocumentChittyID(document);

      // Step 2: Determine minting strategy
      const mintingDecision = await this.determineMintingStrategy(document, options);

      // Step 3: Process based on decision
      let result;
      if (mintingDecision.strategy === 'hard') {
        result = await this.hardMint(document, chittyId, mintingDecision);
      } else {
        result = await this.softMint(document, chittyId, mintingDecision);
      }

      // Step 4: Sync with session
      await this.syncWithSession(chittyId, result);

      // Step 5: Update metrics
      this.updateMetrics(result, Date.now() - startTime);

      console.log(`✅ Document processed: ${chittyId} (${mintingDecision.strategy} minted)`);

      return {
        success: true,
        chittyId,
        mintingStrategy: mintingDecision.strategy,
        result,
        cost: mintingDecision.strategy === 'hard'
          ? this.config.costPerHardMint
          : this.config.costPerSoftMint,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('❌ Document processing failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate ChittyID for document (requires id.chitty.cc)
   */
  async generateDocumentChittyID(document) {
    const result = await this.chittyIDValidator.generateChittyID({
      type: 'document',
      title: document.title,
      hash: await this.calculateDocumentHash(document),
      timestamp: new Date().toISOString(),
      metadata: {
        size: document.size,
        mimeType: document.mimeType,
        classification: document.classification
      }
    });

    if (!result.success) {
      throw new Error(`ChittyID generation failed: ${result.error}`);
    }

    return result.chittyId;
  }

  /**
   * Determine minting strategy based on document characteristics
   */
  async determineMintingStrategy(document, options = {}) {
    const factors = {
      criticality: 0,
      legalWeight: 0,
      evidentiaryValue: 0,
      requiresImmutability: false,
      costBenefit: 0
    };

    // Check document type criticality
    const criticalTypes = ['criminal-evidence', 'property-deed', 'court-order', 'settlement'];
    if (criticalTypes.includes(document.type?.toLowerCase())) {
      factors.criticality += 0.5;
      factors.requiresImmutability = true;
    }

    // Check legal weight
    if (document.legalWeight === 'high' || document.courtAdmissible) {
      factors.legalWeight = 0.3;
      factors.evidentiaryValue = 0.3;
    }

    // Check value/amount involved
    if (document.value && document.value > 50000) {
      factors.criticality += 0.3;
    }

    // Calculate total score
    const totalScore = factors.criticality + factors.legalWeight + factors.evidentiaryValue;

    // Forced hard minting for critical documents
    if (options.forceHard || totalScore >= this.config.criticalityThreshold) {
      return {
        strategy: 'hard',
        score: totalScore,
        factors,
        reason: 'Document meets criticality threshold for on-chain storage'
      };
    }

    // Random selection for 1% hard minting (cost optimization)
    const randomSelection = Math.random() * 100;
    if (randomSelection <= this.config.hardMintPercentage) {
      return {
        strategy: 'hard',
        score: totalScore,
        factors,
        reason: 'Random selection for blockchain verification (1% strategy)'
      };
    }

    // Default to soft minting
    return {
      strategy: 'soft',
      score: totalScore,
      factors,
      reason: 'Document suitable for off-chain storage with hash anchoring'
    };
  }

  /**
   * Soft mint document (off-chain with hash anchoring)
   */
  async softMint(document, chittyId, decision) {
    const payload = {
      chittyId,
      documentHash: await this.calculateDocumentHash(document),
      metadata: {
        title: document.title,
        type: document.type,
        size: document.size,
        mimeType: document.mimeType,
        classification: document.classification,
        timestamp: new Date().toISOString(),
        decision
      },
      storage: 'off-chain',
      verificationMethod: 'hash-anchor'
    };

    // Store in ChittyOS-Data (off-chain)
    const response = await fetch(`${this.evidenceAPI}/api/v1/soft-mint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.env.API_KEY}`,
        'X-ChittyID': chittyId
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Soft minting failed: ${response.status}`);
    }

    const result = await response.json();

    this.metrics.softMinted++;
    this.metrics.costSaved += (this.config.costPerHardMint - this.config.costPerSoftMint);

    console.log(`☁️ Soft minted: ${chittyId} (saved $${this.config.costPerHardMint - this.config.costPerSoftMint})`);

    return {
      mintType: 'soft',
      chittyId,
      documentHash: payload.documentHash,
      storageLocation: result.storageLocation,
      verificationUrl: `${this.evidenceAPI}/verify/${chittyId}`,
      costSaved: this.config.costPerHardMint - this.config.costPerSoftMint
    };
  }

  /**
   * Hard mint document (on-chain blockchain storage)
   */
  async hardMint(document, chittyId, decision) {
    const payload = {
      chittyId,
      documentHash: await this.calculateDocumentHash(document),
      documentContent: document.content, // Full content for on-chain
      metadata: {
        title: document.title,
        type: document.type,
        size: document.size,
        mimeType: document.mimeType,
        classification: document.classification,
        timestamp: new Date().toISOString(),
        decision
      },
      storage: 'on-chain',
      gasOptimization: this.config.gasOptimizationEnabled
    };

    // Submit to ChittyLedger for blockchain storage
    const response = await fetch(`${this.ledgerAPI}/api/v1/hard-mint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.env.API_KEY}`,
        'X-ChittyID': chittyId
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Hard minting failed: ${response.status}`);
    }

    const result = await response.json();

    this.metrics.hardMinted++;

    console.log(`⛓️ Hard minted: ${chittyId} (tx: ${result.transactionHash})`);

    return {
      mintType: 'hard',
      chittyId,
      documentHash: payload.documentHash,
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber,
      gasUsed: result.gasUsed,
      blockchainUrl: `${this.ledgerAPI}/tx/${result.transactionHash}`,
      permanentUrl: `${this.ledgerAPI}/document/${chittyId}`,
      cost: this.config.costPerHardMint
    };
  }

  /**
   * Batch process multiple documents with optimized minting
   */
  async batchProcess(documents, options = {}) {
    console.log(`📦 Batch processing ${documents.length} documents`);

    const results = {
      processed: [],
      failed: [],
      summary: {
        total: documents.length,
        softMinted: 0,
        hardMinted: 0,
        totalCost: 0,
        costSaved: 0
      }
    };

    // Process in batches for efficiency
    for (let i = 0; i < documents.length; i += this.config.batchSize) {
      const batch = documents.slice(i, i + this.config.batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(doc => this.processDocument(doc, options))
      );

      batchResults.forEach((result, index) => {
        const doc = batch[index];
        if (result.status === 'fulfilled') {
          results.processed.push(result.value);

          if (result.value.mintingStrategy === 'hard') {
            results.summary.hardMinted++;
            results.summary.totalCost += this.config.costPerHardMint;
          } else {
            results.summary.softMinted++;
            results.summary.totalCost += this.config.costPerSoftMint;
            results.summary.costSaved += (this.config.costPerHardMint - this.config.costPerSoftMint);
          }
        } else {
          results.failed.push({
            document: doc,
            error: result.reason.message
          });
        }
      });

      // Small delay between batches
      if (i + this.config.batchSize < documents.length) {
        await this.sleep(100);
      }
    }

    console.log(`✅ Batch complete: ${results.processed.length} processed, ${results.failed.length} failed`);
    console.log(`💰 Cost saved: $${results.summary.costSaved.toFixed(2)}`);

    return results;
  }

  /**
   * Upgrade soft-minted document to hard mint
   */
  async upgradeToHardMint(chittyId, reason) {
    console.log(`⬆️ Upgrading ${chittyId} to hard mint: ${reason}`);

    try {
      // Fetch soft-minted document
      const softDoc = await this.fetchSoftMintedDocument(chittyId);

      if (!softDoc) {
        throw new Error(`Document ${chittyId} not found in soft mint storage`);
      }

      // Hard mint the document
      const result = await this.hardMint(softDoc, chittyId, {
        strategy: 'upgrade',
        reason,
        originalMintType: 'soft'
      });

      // Update records
      await this.updateMintingRecord(chittyId, {
        upgraded: true,
        upgradeReason: reason,
        upgradeTimestamp: new Date().toISOString(),
        hardMintResult: result
      });

      console.log(`✅ Successfully upgraded ${chittyId} to hard mint`);

      return result;

    } catch (error) {
      console.error(`❌ Failed to upgrade ${chittyId}:`, error.message);
      throw error;
    }
  }

  /**
   * Sync minting result with session
   */
  async syncWithSession(chittyId, result) {
    await this.sessionSync.saveState('minting', {
      chittyId,
      mintType: result.mintType,
      timestamp: new Date().toISOString(),
      result
    });
  }

  /**
   * Calculate document hash
   */
  async calculateDocumentHash(document) {
    const content = JSON.stringify({
      title: document.title,
      content: document.content,
      type: document.type,
      size: document.size
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Fetch soft-minted document
   */
  async fetchSoftMintedDocument(chittyId) {
    const response = await fetch(`${this.evidenceAPI}/api/v1/document/${chittyId}`, {
      headers: {
        'Authorization': `Bearer ${this.env.API_KEY}`
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  }

  /**
   * Update minting record
   */
  async updateMintingRecord(chittyId, updates) {
    const response = await fetch(`${this.evidenceAPI}/api/v1/record/${chittyId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.env.API_KEY}`
      },
      body: JSON.stringify(updates)
    });

    return response.ok;
  }

  /**
   * Update metrics
   */
  updateMetrics(result, processingTime) {
    this.metrics.totalDocuments++;

    // Update average processing time
    const totalTime = this.metrics.avgProcessingTime * (this.metrics.totalDocuments - 1);
    this.metrics.avgProcessingTime = (totalTime + processingTime) / this.metrics.totalDocuments;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const totalCost = (this.metrics.hardMinted * this.config.costPerHardMint) +
                     (this.metrics.softMinted * this.config.costPerSoftMint);

    const theoreticalCost = this.metrics.totalDocuments * this.config.costPerHardMint;

    return {
      ...this.metrics,
      totalCost,
      theoreticalCost,
      actualSavings: theoreticalCost - totalCost,
      savingsPercentage: ((theoreticalCost - totalCost) / theoreticalCost * 100).toFixed(2),
      softMintPercentage: (this.metrics.softMinted / this.metrics.totalDocuments * 100).toFixed(2),
      hardMintPercentage: (this.metrics.hardMinted / this.metrics.totalDocuments * 100).toFixed(2)
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Cloudflare Worker handler
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const mintingService = new SoftHardMintingService(env);

    try {
      // Process single document
      if (url.pathname === '/mint/document' && request.method === 'POST') {
        const body = await request.json();
        const result = await mintingService.processDocument(body.document, body.options || {});

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Batch process documents
      if (url.pathname === '/mint/batch' && request.method === 'POST') {
        const body = await request.json();
        const results = await mintingService.batchProcess(body.documents, body.options || {});

        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Upgrade soft mint to hard mint
      if (url.pathname === '/mint/upgrade' && request.method === 'POST') {
        const body = await request.json();
        const result = await mintingService.upgradeToHardMint(body.chittyId, body.reason);

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get metrics
      if (url.pathname === '/mint/metrics' && request.method === 'GET') {
        const metrics = mintingService.getMetrics();

        return new Response(JSON.stringify(metrics), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('Minting service error:', error);

      return new Response(JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }
};