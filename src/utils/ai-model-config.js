/**
 * ChittyOS AI Model Configuration
 * Centralized configuration for latest Cloudflare Workers AI models
 */

export class AIModelConfig {
  constructor(env) {
    this.env = env;
    this.models = {
      primary: env.AI_MODEL_PRIMARY || '@cf/meta/llama-4-scout-17b-16e-instruct',
      secondary: env.AI_MODEL_SECONDARY || '@cf/openai/gpt-oss-120b',
      vision: env.AI_MODEL_VISION || '@cf/meta/llama-3.2-11b-vision-instruct',
      audio: env.AI_MODEL_AUDIO || '@cf/openai/whisper',
      reasoning: env.AI_MODEL_REASONING || '@cf/google/gemma-3-12b-it',
      // Fallback for legacy code
      legacy: '@cf/meta/llama-3.1-8b-instruct'
    };
  }

  /**
   * Get primary AI model for general tasks
   */
  getPrimaryModel() {
    return this.models.primary;
  }

  /**
   * Get secondary AI model for fallback
   */
  getSecondaryModel() {
    return this.models.secondary;
  }

  /**
   * Get vision model for image/document analysis
   */
  getVisionModel() {
    return this.models.vision;
  }

  /**
   * Get audio model for voice processing
   */
  getAudioModel() {
    return this.models.audio;
  }

  /**
   * Get reasoning model for complex logic
   */
  getReasoningModel() {
    return this.models.reasoning;
  }

  /**
   * Get best model for specific task type
   */
  getModelForTask(taskType) {
    const taskModels = {
      'email_routing': this.models.primary,
      'document_analysis': this.models.vision,
      'legal_reasoning': this.models.reasoning,
      'triage': this.models.primary,
      'priority_assessment': this.models.reasoning,
      'response_generation': this.models.secondary,
      'content_classification': this.models.primary,
      'vision_analysis': this.models.vision,
      'audio_processing': this.models.audio,
      'general': this.models.primary
    };

    return taskModels[taskType] || this.models.primary;
  }

  /**
   * Get model capabilities
   */
  getModelCapabilities(model) {
    const capabilities = {
      '@cf/meta/llama-4-scout-17b-16e-instruct': {
        multimodal: true,
        contextWindow: 128000,
        reasoning: 'high',
        speed: 'medium',
        languages: 'multilingual',
        features: ['function_calling', 'json_mode', 'vision']
      },
      '@cf/openai/gpt-oss-120b': {
        multimodal: false,
        contextWindow: 128000,
        reasoning: 'very_high',
        speed: 'medium',
        languages: 'multilingual',
        features: ['function_calling', 'json_mode', 'advanced_reasoning']
      },
      '@cf/meta/llama-3.2-11b-vision-instruct': {
        multimodal: true,
        contextWindow: 128000,
        reasoning: 'high',
        speed: 'fast',
        languages: 'multilingual',
        features: ['vision', 'document_analysis', 'image_understanding']
      },
      '@cf/google/gemma-3-12b-it': {
        multimodal: true,
        contextWindow: 128000,
        reasoning: 'very_high',
        speed: 'medium',
        languages: 'multilingual',
        features: ['advanced_reasoning', 'multimodal', 'json_mode']
      }
    };

    return capabilities[model] || capabilities[this.models.primary];
  }

  /**
   * Get cost estimation for model
   */
  getModelCost(model) {
    const costs = {
      '@cf/meta/llama-4-scout-17b-16e-instruct': { input: 0.0002, output: 0.0004 },
      '@cf/openai/gpt-oss-120b': { input: 0.0003, output: 0.0006 },
      '@cf/meta/llama-3.2-11b-vision-instruct': { input: 0.0002, output: 0.0004 },
      '@cf/google/gemma-3-12b-it': { input: 0.0002, output: 0.0004 },
      '@cf/openai/whisper': { input: 0.0001, output: 0.0001 },
      // Legacy fallback
      '@cf/meta/llama-3.1-8b-instruct': { input: 0.0001, output: 0.0002 }
    };

    return costs[model] || costs[this.models.primary];
  }

  /**
   * Validate model availability
   */
  async validateModel(ai, model) {
    try {
      const testResponse = await ai.run(model, {
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 1
      });
      return !!testResponse;
    } catch (error) {
      console.warn(`Model ${model} validation failed:`, error.message);
      return false;
    }
  }

  /**
   * Cost-sorted chain (cheapest → priciest) by getModelCost.input.
   * Used to start the fallback chain at a cheaper model when a cost-degrade
   * override is active.
   */
  getCostSortedModels() {
    const candidates = [
      this.models.legacy,        // @cf/meta/llama-3.1-8b-instruct  (cheapest)
      this.models.primary,       // scout 17b
      this.models.vision,        // llama-3.2-11b-vision
      this.models.reasoning,     // gemma-3-12b
      this.models.secondary      // gpt-oss-120b (priciest)
    ];
    const unique = [...new Set(candidates)];
    return unique.sort(
      (a, b) => this.getModelCost(a).input - this.getModelCost(b).input
    );
  }

  /**
   * Map a ChittyComptroller tier name (from a DegradeSignal `to_tier`) to a
   * starting index into the cost-sorted model chain. Lower index = cheaper
   * model = deeper cost cut.
   *
   * Comptroller tier order (priciest → cheapest), per
   * chittyops/services/comptroller/worker.ts degradeTo():
   *   T3_opus > T3_sonnet > T2_haiku > T1_personal > T1_workspace > T0
   * ChittyRouter only runs @cf/* models (all "T0" from Comptroller's view), so
   * the cheaper the requested tier, the cheaper the @cf/* model we start at.
   *
   * Returns the index in getCostSortedModels() to start the chain from.
   */
  tierToChainStart(toTier) {
    const sorted = this.getCostSortedModels();
    const last = sorted.length - 1;
    // Fraction of the way DOWN the (priciest→cheapest) ladder.
    const tierRank = {
      T3_opus: 0,
      T3_sonnet: 1,
      T2_haiku: 2,
      T1_personal: 3,
      T1_workspace: 4,
      T0: 5
    };
    const maxRank = 5;
    const rank = tierRank[toTier];
    if (rank === undefined) {
      // Unknown tier from Comptroller → fail safe to the cheapest model.
      return 0;
    }
    // T0 (rank 5) → index 0 (cheapest). T3_opus (rank 0) → top of cheap half.
    // Invert: deeper degrade (higher rank) → lower start index.
    const fromCheapEnd = maxRank - rank; // 0..5
    return Math.min(fromCheapEnd, last);
  }

  /**
   * Read an active, unexpired cost-degrade override from KV.
   *
   * Lookup precedence: service-specific (`tier_override:chittyrouter`) wins over
   * global (`tier_override:global`). Expiry is enforced at READ time against
   * `expires_at` (ISO-8601 or epoch ms) — an expired key returns null even if KV
   * has not yet evicted it. Returns the override record or null.
   *
   * @param {object} env - Worker env (needs AI_CACHE KV binding)
   * @param {number} now - epoch ms (injectable for deterministic tests)
   */
  async getActiveOverride(env, now = Date.now()) {
    const kv = env && env.AI_CACHE;
    if (!kv) return null;
    for (const key of ['tier_override:chittyrouter', 'tier_override:global']) {
      let raw;
      try {
        raw = await kv.get(key);
      } catch {
        continue;
      }
      if (!raw) continue;
      let rec;
      try {
        rec = JSON.parse(raw);
      } catch {
        continue;
      }
      const exp = typeof rec.expires_at === 'number'
        ? rec.expires_at
        : Date.parse(rec.expires_at);
      if (!Number.isFinite(exp) || now >= exp) {
        continue; // expired or malformed — auto-revert
      }
      return rec;
    }
    return null;
  }

  /**
   * Get fallback model chain.
   *
   * When a cost-degrade `override` is supplied (from getActiveOverride), the
   * chain STARTS at the cheaper model tier mapped from the override's `to_tier`,
   * dropping the pricier models entirely so the cheap model is tried first and
   * the expensive ones are never reached on success.
   *
   * @param {string} taskType
   * @param {object|null} override - active DegradeSignal override or null
   */
  getFallbackChain(taskType, override = null) {
    if (override && override.to_tier) {
      const sorted = this.getCostSortedModels(); // cheapest → priciest
      const depth = this.tierToChainStart(override.to_tier);
      // Degraded chain is cost-first: always try the cheapest model first, then
      // climb only `depth` steps up the cost ladder. Deeper degrade (T0) → depth
      // 0 → cheapest model only; shallower degrade → more headroom toward
      // pricier models. legacy (cheapest) is always the head AND a safety net.
      const degraded = sorted.slice(0, depth + 1); // cheapest first, already ordered
      return [...new Set(degraded)];
    }

    const primary = this.getModelForTask(taskType);
    const fallbacks = [
      primary,
      this.models.secondary,
      this.models.primary,
      this.models.legacy
    ];

    // Remove duplicates while preserving order
    return [...new Set(fallbacks)];
  }

  /**
   * Execute with automatic fallback.
   *
   * If a cost-degrade override is active in KV (env.AI_CACHE), the fallback
   * chain is built starting at the cheaper model tier — closing the
   * Comptroller cost-throttle loop. ERROR-driven fallback still applies on top.
   */
  async runWithFallback(ai, taskType, prompt, options = {}) {
    const override = this.env ? await this.getActiveOverride(this.env) : null;
    if (override) {
      console.log(
        `💸 cost-degrade override active (to_tier=${override.to_tier}, ` +
        `expires_at=${override.expires_at}) — starting fallback chain at cheaper tier`
      );
    }
    const fallbackChain = this.getFallbackChain(taskType, override);
    let lastError;

    for (const model of fallbackChain) {
      try {
        console.log(`🤖 Attempting ${taskType} with ${model}`);

        const response = await ai.run(model, {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.max_tokens || 1000,
          temperature: options.temperature || 0.1,
          ...options
        });

        if (response && response.response) {
          console.log(`✅ ${taskType} successful with ${model}`);
          return {
            response: response.response,
            model,
            success: true
          };
        }
      } catch (error) {
        console.warn(`❌ ${model} failed for ${taskType}:`, error.message);
        lastError = error;
        continue;
      }
    }

    throw new Error(`All models failed for ${taskType}. Last error: ${lastError?.message}`);
  }

  /**
   * Get model configuration summary
   */
  getConfigSummary() {
    return {
      version: '2.1.0-ai',
      models: this.models,
      features: {
        multimodal: true,
        visionSupport: true,
        audioSupport: true,
        advancedReasoning: true,
        functionCalling: true,
        jsonMode: true,
        fallbackChain: true
      },
      enterprise: {
        versionManagement: true,
        randomnessBeacon: true,
        costOptimization: true,
        performanceMonitoring: true
      }
    };
  }
}

export default AIModelConfig;