/**
 * Universal Ingestion Agent
 *
 * Core Principle: Everything is potential evidence until proven otherwise.
 *
 * Philosophy:
 * - Not everything IS evidence, but anything COULD BE evidence
 * - Evidence value is contextual, temporal, and unpredictable
 * - Preserve EVERYTHING with probabilistic scoring
 * - Reindex periodically as context changes
 */

export class UniversalIngestionAgent {
  constructor(env) {
    this.env = env;
    this.ai = env.AI;
    this.vectorDb = env.PLATFORM_VECTORS;
    this.ledger = env.PLATFORM_STORAGE;
  }

  /**
   * Probabilistic evidence analysis
   * Returns continuous probability score (0.0-1.0) instead of binary classification
   */
  async analyzeProbability(input) {
    const prompt = `Analyze this input as POTENTIAL evidence using probabilistic reasoning.

Input: ${this.formatInput(input)}

Provide:
1. Evidence probability (0.0-1.0 continuous score)
2. Type IF evidence (document/communication/financial/testimony/physical)
3. Potential case relevance (pattern matching)
4. Temporal relevance (immediate vs future value)
5. Key entities (people, places, properties, dates, amounts)
6. Preservation priority (critical/high/medium/low)

Remember: Today's irrelevant receipt could be tomorrow's critical evidence.`;

    const analysis = await this.ai.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          {
            role: "system",
            content:
              "You are an evidence probability analyst. Everything is potential evidence. Score probability continuously, not binary.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    );

    return {
      probability: this.extractProbability(analysis),
      type: analysis.type || "unknown",
      potentialCases: analysis.cases || [],
      temporalRelevance: analysis.temporal || "future",
      entities: analysis.entities || [],
      priority: analysis.priority || "medium",
      reasoning: analysis.reasoning || "",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Universal ingestion - ALWAYS preserve, regardless of evidence status
   */
  async ingest(input) {
    // Step 1: Probabilistic analysis
    const analysis = await this.analyzeProbability(input);

    // Step 2: ALWAYS mint ChittyID
    const entityType = analysis.probability > 0.7 ? "EVNT" : "INFO";
    const chittyId = await this.mintChittyID(entityType, input, analysis);

    // Step 3: ALWAYS extract entities
    const entities = await this.extractEntities(input, analysis);

    // Step 4: ALWAYS generate cryptographic proof
    const hash = await this.generateHash(input);

    // Step 5: ALWAYS store in ledger with metadata
    await this.storeInLedger({
      chittyId,
      input,
      hash,
      analysis,
      entities,
      metadata: {
        evidenceProbability: analysis.probability,
        ingestionDate: new Date().toISOString(),
        reindexCount: 0,
        probabilityHistory: [
          {
            timestamp: new Date().toISOString(),
            probability: analysis.probability,
            reason: "initial_ingestion",
          },
        ],
      },
    });

    // Step 6: Index in vector database for similarity search
    await this.indexInVectorDb(chittyId, input, analysis);

    // Step 7: Queue for blockchain if priority warrants
    if (analysis.priority === "critical" || analysis.probability > 0.7) {
      await this.queueForBlockchain(chittyId, analysis.priority);
    }

    return {
      success: true,
      chittyId,
      evidenceProbability: analysis.probability,
      entities: entities.length,
      priority: analysis.priority,
      blockchainQueued:
        analysis.priority === "critical" || analysis.probability > 0.7,
    };
  }

  /**
   * Periodic reindexing - Re-evaluate evidence probability as context changes
   */
  async reindex(chittyId) {
    // Fetch original ingestion
    const record = await this.ledger.get(chittyId);
    if (!record) return { error: "Record not found" };

    // Re-analyze with current context
    const newAnalysis = await this.analyzeProbability(record.input);

    // Track probability drift
    const probabilityDrift =
      newAnalysis.probability - record.analysis.probability;

    // Update metadata
    record.metadata.reindexCount++;
    record.metadata.probabilityHistory.push({
      timestamp: new Date().toISOString(),
      probability: newAnalysis.probability,
      drift: probabilityDrift,
      reason: "periodic_reindex",
    });

    // Elevate to EVNT if crossed threshold
    if (record.analysis.probability < 0.7 && newAnalysis.probability >= 0.7) {
      const newChittyId = await this.mintChittyID(
        "EVNT",
        record.input,
        newAnalysis,
      );
      record.metadata.elevatedFrom = chittyId;
      record.chittyId = newChittyId;
      record.metadata.elevationDate = new Date().toISOString();
    }

    // Update analysis
    record.analysis = newAnalysis;

    // Save updated record
    await this.ledger.put(record.chittyId, JSON.stringify(record));

    return {
      chittyId: record.chittyId,
      probabilityDrift,
      elevated:
        newAnalysis.probability >= 0.7 && record.analysis.probability < 0.7,
      reindexCount: record.metadata.reindexCount,
    };
  }

  /**
   * Similarity-based elevation - When one item becomes evidence, elevate similar items
   */
  async elevateRelated(evidenceChittyId) {
    // Find similar items via vector search
    const similar = await this.vectorDb.query(evidenceChittyId, { topK: 20 });

    const elevated = [];
    for (const item of similar) {
      if (item.probability < 0.7) {
        // Elevate probability based on similarity
        const probabilityBoost = item.similarity * 0.3; // Up to 30% boost
        item.probability = Math.min(item.probability + probabilityBoost, 1.0);

        // Reindex with boosted probability
        await this.reindex(item.chittyId);
        elevated.push(item.chittyId);
      }
    }

    return { elevated: elevated.length, items: elevated };
  }

  // Helper methods
  formatInput(input) {
    if (typeof input === "string") return input;
    if (input.subject) return `Email: ${input.subject}\n${input.body || ""}`;
    if (input.filename) return `File: ${input.filename}`;
    return JSON.stringify(input);
  }

  extractProbability(analysis) {
    // Parse probability from AI response
    const match = analysis.match(/probability[:\s]+([0-9.]+)/i);
    return match ? parseFloat(match[1]) : 0.5;
  }

  async mintChittyID(entityType, input, analysis) {
    const purpose =
      entityType === "EVNT"
        ? `Evidence: ${analysis.type}`
        : `Potential Evidence: ${analysis.type}`;

    const response = await fetch(`${this.env.CHITTYID_SERVICE_URL}/v1/mint`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entity: entityType, purpose }),
    });

    if (!response.ok) {
      // Fallback to pending ID
      return `pending-${entityType.toLowerCase()}-${Date.now()}`;
    }

    const data = await response.json();
    return data.chitty_id;
  }

  async extractEntities(input, analysis) {
    // Entity extraction logic (simplified)
    return analysis.entities || [];
  }

  async generateHash(input) {
    const text = this.formatInput(input);
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async storeInLedger(record) {
    await this.ledger.put(record.chittyId, JSON.stringify(record));
  }

  async indexInVectorDb(chittyId, input, analysis) {
    // Vector indexing for similarity search
    const embedding = await this.ai.run("@cf/baai/bge-base-en-v1.5", {
      text: this.formatInput(input),
    });

    await this.vectorDb.insert([
      {
        id: chittyId,
        values: embedding.data[0],
        metadata: {
          probability: analysis.probability,
          type: analysis.type,
          priority: analysis.priority,
        },
      },
    ]);
  }

  async queueForBlockchain(chittyId, priority) {
    // Queue for blockchain anchoring
    await this.env.BLOCKCHAIN_QUEUE.send({
      chittyId,
      priority,
      timestamp: new Date().toISOString(),
    });
  }
}
