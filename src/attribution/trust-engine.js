/**
 * Trust Engine for ChittyRouter
 * Six-dimensional trust scoring system
 * Provides provenance, verification, and confidence scoring
 */

/**
 * Six dimensions of trust
 */
export const TRUST_DIMENSIONS = {
  SOURCE_VERIFICATION: 'source_verification',     // Is the source verified?
  CONTENT_CONSISTENCY: 'content_consistency',     // Is content internally consistent?
  CORROBORATION: 'corroboration',                 // Can it be corroborated?
  FACTUAL_ACCURACY: 'factual_accuracy',           // Are facts verifiable?
  TEMPORAL_VALIDITY: 'temporal_validity',         // Is timestamp trustworthy?
  INTEGRITY_CHECK: 'integrity_check'              // Is data tamper-free?
};

/**
 * Trust levels
 */
export const TRUST_LEVELS = {
  VERIFIED: 'verified',           // 0.9 - 1.0
  HIGH: 'high',                   // 0.7 - 0.9
  MODERATE: 'moderate',           // 0.5 - 0.7
  LOW: 'low',                     // 0.3 - 0.5
  UNVERIFIED: 'unverified',       // 0.0 - 0.3
  SUSPICIOUS: 'suspicious'        // < 0.0 (negative indicators)
};

/**
 * Trust Engine
 * Calculates six-dimensional trust scores for all inputs
 */
export class TrustEngine {
  constructor(env) {
    this.env = env;
    this.trustEndpoint = env.CHITTYTRUST_ENDPOINT || 'https://trust.chitty.cc';
    this.verifyEndpoint = env.CHITTYVERIFY_ENDPOINT || 'https://verify.chitty.cc';
  }

  /**
   * Main trust scoring method
   * Returns comprehensive trust analysis
   */
  async scoreInput(data) {
    try {
      console.log('🔐 Trust Engine: Scoring input', {
        type: data.type,
        id: data.id
      });

      // Calculate all six dimensions in parallel
      const [
        sourceVerification,
        contentConsistency,
        corroboration,
        factualAccuracy,
        temporalValidity,
        integrityCheck
      ] = await Promise.allSettled([
        this.scoreSourceVerification(data),
        this.scoreContentConsistency(data),
        this.scoreCorroboration(data),
        this.scoreFactualAccuracy(data),
        this.scoreTemporalValidity(data),
        this.scoreIntegrityCheck(data)
      ]);

      // Extract scores (handle rejections gracefully)
      const dimensions = {
        [TRUST_DIMENSIONS.SOURCE_VERIFICATION]: this.extractScore(sourceVerification, 0.5),
        [TRUST_DIMENSIONS.CONTENT_CONSISTENCY]: this.extractScore(contentConsistency, 0.5),
        [TRUST_DIMENSIONS.CORROBORATION]: this.extractScore(corroboration, 0.5),
        [TRUST_DIMENSIONS.FACTUAL_ACCURACY]: this.extractScore(factualAccuracy, 0.5),
        [TRUST_DIMENSIONS.TEMPORAL_VALIDITY]: this.extractScore(temporalValidity, 0.5),
        [TRUST_DIMENSIONS.INTEGRITY_CHECK]: this.extractScore(integrityCheck, 0.5)
      };

      // Calculate overall trust score (weighted average)
      const trustScore = this.calculateOverallScore(dimensions);

      // Determine trust level
      const trustLevel = this.determineTrustLevel(trustScore);

      // Calculate confidence interval
      const confidence = this.calculateConfidence(dimensions);

      // Determine if verified
      const verified = trustScore >= 0.7 && dimensions[TRUST_DIMENSIONS.SOURCE_VERIFICATION] >= 0.8;

      console.log('✅ Trust scoring complete', {
        trustScore,
        trustLevel,
        verified
      });

      return {
        trustScore,
        trustLevel,
        dimensions,
        verified,
        confidence,
        timestamp: new Date().toISOString(),
        metadata: {
          engine: 'chittyrouter-trust-v1',
          dimensionCount: 6
        }
      };

    } catch (error) {
      console.error('❌ Trust scoring failed:', error);

      // Return default low-trust score on error
      return {
        trustScore: 0.3,
        trustLevel: TRUST_LEVELS.LOW,
        verified: false,
        confidence: 0.1,
        error: error.message
      };
    }
  }

  /**
   * Dimension 1: Source Verification
   * Can we verify the source of this data?
   */
  async scoreSourceVerification(data) {
    let score = 0.5; // Baseline

    // Known, verified sources get bonus
    if (await this.isVerifiedSource(data)) {
      score += 0.3;
    }

    // Cryptographic signatures boost trust
    if (data.metadata?.signature) {
      const signatureValid = await this.verifySignature(data);
      score += signatureValid ? 0.2 : -0.3;
    }

    // Domain reputation (for URLs, emails)
    if (data.type === 'email' || data.type === 'url') {
      const reputation = await this.getDomainReputation(data);
      score += (reputation - 0.5) * 0.2; // -0.1 to +0.1
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Dimension 2: Content Consistency
   * Is the content internally consistent?
   */
  async scoreContentConsistency(data) {
    let score = 0.7; // Start optimistic

    try {
      // Use AI to check for contradictions
      const analysis = await this.env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
        messages: [{
          role: 'user',
          content: `Analyze this content for internal contradictions or inconsistencies. Return a score from 0-1 where 1 is perfectly consistent.\n\nContent: ${JSON.stringify(data.content).substring(0, 2000)}`
        }]
      });

      // Parse AI response for consistency score
      const aiScore = this.parseConsistencyScore(analysis.response);
      if (aiScore !== null) {
        score = aiScore;
      }

    } catch (error) {
      console.warn('⚠️ Consistency check failed:', error.message);
    }

    return score;
  }

  /**
   * Dimension 3: Corroboration
   * Can we find corroborating evidence?
   */
  async scoreCorroboration(data) {
    let score = 0.5; // Neutral baseline

    try {
      // Search for similar/related content in our database
      const similar = await this.findSimilarContent(data);

      if (similar && similar.length > 0) {
        // More corroborating sources = higher score
        const corroborationBonus = Math.min(0.3, similar.length * 0.1);
        score += corroborationBonus;

        // Check if corroborating sources agree or contradict
        const agreement = await this.checkAgreement(data, similar);
        score += (agreement - 0.5) * 0.4; // -0.2 to +0.2
      }

    } catch (error) {
      console.warn('⚠️ Corroboration check failed:', error.message);
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Dimension 4: Factual Accuracy
   * Are stated facts verifiable?
   */
  async scoreFactualAccuracy(data) {
    let score = 0.6; // Slightly optimistic baseline

    try {
      // Extract factual claims
      const facts = await this.extractFacts(data);

      if (facts && facts.length > 0) {
        // Verify each fact
        const verificationResults = await Promise.allSettled(
          facts.map(fact => this.verifyFact(fact))
        );

        // Calculate percentage of verified facts
        const verifiedCount = verificationResults.filter(r =>
          r.status === 'fulfilled' && r.value === true
        ).length;

        score = verifiedCount / facts.length;
      }

    } catch (error) {
      console.warn('⚠️ Fact verification failed:', error.message);
    }

    return score;
  }

  /**
   * Dimension 5: Temporal Validity
   * Is the timestamp trustworthy?
   */
  async scoreTemporalValidity(data) {
    let score = 0.8; // Start high, penalize anomalies

    const timestamp = new Date(data.timestamp);
    const now = new Date();

    // Future timestamps are suspicious
    if (timestamp > now) {
      score -= 0.5;
    }

    // Very old timestamps might be suspicious (depends on type)
    const age = now - timestamp;
    const maxAge = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years
    if (age > maxAge) {
      score -= 0.2;
    }

    // Check if timestamp aligns with metadata
    if (data.metadata?.receivedAt) {
      const receivedAt = new Date(data.metadata.receivedAt);
      const timeDiff = Math.abs(receivedAt - timestamp);

      // Timestamps should be within reasonable range
      if (timeDiff > 24 * 60 * 60 * 1000) { // > 1 day
        score -= 0.3;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Dimension 6: Integrity Check
   * Is data tamper-free?
   */
  async scoreIntegrityCheck(data) {
    let score = 0.7; // Baseline

    try {
      // Calculate content hash
      const contentHash = await this.calculateHash(data.content);

      // Check if hash has been stored/verified before
      const hashVerified = await this.verifyHash(contentHash, data.id);
      if (hashVerified === true) {
        score += 0.2;
      } else if (hashVerified === false) {
        score -= 0.5; // Hash mismatch = tampering
      }

      // Use ChittyVerify authority
      const verifyResult = await this.checkWithVerifyAuthority(data, contentHash);
      if (verifyResult?.verified) {
        score += 0.1;
      }

    } catch (error) {
      console.warn('⚠️ Integrity check failed:', error.message);
    }

    return Math.max(0, Math.min(1, score));
  }

  // ============ Helper Methods ============

  extractScore(settledResult, defaultScore) {
    if (settledResult.status === 'fulfilled') {
      return settledResult.value;
    }
    return defaultScore;
  }

  calculateOverallScore(dimensions) {
    // Weighted average of all dimensions
    const weights = {
      [TRUST_DIMENSIONS.SOURCE_VERIFICATION]: 0.25,
      [TRUST_DIMENSIONS.CONTENT_CONSISTENCY]: 0.15,
      [TRUST_DIMENSIONS.CORROBORATION]: 0.15,
      [TRUST_DIMENSIONS.FACTUAL_ACCURACY]: 0.20,
      [TRUST_DIMENSIONS.TEMPORAL_VALIDITY]: 0.10,
      [TRUST_DIMENSIONS.INTEGRITY_CHECK]: 0.15
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [dimension, weight] of Object.entries(weights)) {
      if (dimensions[dimension] !== undefined) {
        weightedSum += dimensions[dimension] * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  }

  determineTrustLevel(score) {
    if (score >= 0.9) return TRUST_LEVELS.VERIFIED;
    if (score >= 0.7) return TRUST_LEVELS.HIGH;
    if (score >= 0.5) return TRUST_LEVELS.MODERATE;
    if (score >= 0.3) return TRUST_LEVELS.LOW;
    if (score >= 0) return TRUST_LEVELS.UNVERIFIED;
    return TRUST_LEVELS.SUSPICIOUS;
  }

  calculateConfidence(dimensions) {
    // Confidence is higher when all dimensions agree
    const scores = Object.values(dimensions);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Lower standard deviation = higher confidence
    return Math.max(0, Math.min(1, 1 - stdDev));
  }

  async isVerifiedSource(data) {
    // Check against verified source registry
    // In production, this would query a database
    const verifiedSources = [
      'id.chitty.cc',
      'schema.chitty.cc',
      'trust.chitty.cc',
      'verify.chitty.cc'
    ];

    const source = this.extractDomain(data);
    return verifiedSources.includes(source);
  }

  async verifySignature(data) {
    try {
      // Use ChittyVerify authority to verify signature
      const response = await fetch(`${this.verifyEndpoint}/api/v1/verify-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ChittyOS-Service': 'chittyrouter-trust'
        },
        body: JSON.stringify({
          data: data.content,
          signature: data.metadata.signature
        })
      });

      if (response.ok) {
        const result = await response.json();
        return result.valid === true;
      }
    } catch (error) {
      console.warn('⚠️ Signature verification failed:', error.message);
    }

    return false;
  }

  async getDomainReputation(data) {
    const domain = this.extractDomain(data);

    try {
      // Use ChittyTrust authority
      const response = await fetch(`${this.trustEndpoint}/api/v1/domain-reputation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ChittyOS-Service': 'chittyrouter-trust'
        },
        body: JSON.stringify({ domain })
      });

      if (response.ok) {
        const result = await response.json();
        return result.reputation || 0.5;
      }
    } catch (error) {
      console.warn('⚠️ Domain reputation check failed:', error.message);
    }

    return 0.5; // Neutral
  }

  parseConsistencyScore(aiResponse) {
    // Try to extract numeric score from AI response
    const match = aiResponse.match(/(\d+\.?\d*)/);
    if (match) {
      const score = parseFloat(match[1]);
      return score <= 1 ? score : score / 100; // Handle 0-100 scale
    }
    return null;
  }

  async findSimilarContent(data) {
    // Use Vectorize for semantic similarity search
    if (!this.env.AGENT_SEMANTIC_MEMORY) {
      return [];
    }

    try {
      // Generate embedding for content
      const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: JSON.stringify(data.content).substring(0, 1000)
      });

      // Search for similar vectors
      const results = await this.env.AGENT_SEMANTIC_MEMORY.query(embedding.data, {
        topK: 5,
        returnMetadata: true
      });

      return results.matches || [];
    } catch (error) {
      console.warn('⚠️ Similarity search failed:', error.message);
      return [];
    }
  }

  async checkAgreement(data, similar) {
    // Use AI to check if similar content agrees or contradicts
    if (similar.length === 0) return 0.5;

    try {
      const analysis = await this.env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
        messages: [{
          role: 'user',
          content: `Compare this content with similar content and rate agreement from 0-1.\n\nContent: ${JSON.stringify(data.content).substring(0, 500)}\n\nSimilar: ${JSON.stringify(similar.map(s => s.metadata)).substring(0, 500)}`
        }]
      });

      const score = this.parseConsistencyScore(analysis.response);
      return score !== null ? score : 0.5;
    } catch (error) {
      return 0.5;
    }
  }

  async extractFacts(data) {
    // Use AI to extract factual claims
    try {
      const analysis = await this.env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
        messages: [{
          role: 'user',
          content: `Extract verifiable factual claims from this content. Return as JSON array of strings.\n\n${JSON.stringify(data.content).substring(0, 1000)}`
        }]
      });

      // Parse JSON from response
      const jsonMatch = analysis.response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn('⚠️ Fact extraction failed:', error.message);
    }

    return [];
  }

  async verifyFact(fact) {
    // In production, this would use external fact-checking APIs
    // For now, return neutral
    return true;
  }

  async calculateHash(content) {
    const data = typeof content === 'string' ? content : JSON.stringify(content);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async verifyHash(hash, id) {
    // Check if we've stored this hash before
    if (!this.env.AGENT_WORKING_MEMORY) {
      return null;
    }

    try {
      const stored = await this.env.AGENT_WORKING_MEMORY.get(`hash:${id}`);
      if (stored) {
        return stored === hash;
      }

      // Store for future verification
      await this.env.AGENT_WORKING_MEMORY.put(`hash:${id}`, hash);
      return null;
    } catch (error) {
      return null;
    }
  }

  async checkWithVerifyAuthority(data, hash) {
    try {
      const response = await fetch(`${this.verifyEndpoint}/api/v1/integrity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ChittyOS-Service': 'chittyrouter-trust'
        },
        body: JSON.stringify({
          content: data.content,
          hash,
          authority: 'chittyverify'
        })
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('⚠️ ChittyVerify authority check failed:', error.message);
    }

    return null;
  }

  extractDomain(data) {
    if (data.type === 'email' && data.content?.from) {
      const match = data.content.from.match(/@([^>]+)/);
      return match ? match[1] : 'unknown';
    }

    if (data.type === 'url' && data.content?.url) {
      try {
        const url = new URL(data.content.url);
        return url.hostname;
      } catch {
        return 'unknown';
      }
    }

    return 'unknown';
  }
}

export default TrustEngine;
