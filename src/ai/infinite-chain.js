/**
 * Infinite Model Chain - Cost optimization through collaborative model chaining
 * Drive costs toward $0 while preserving creativity, knowledge, and innovation
 */

export class InfiniteModelChain {
  constructor(ai, env) {
    this.ai = ai;
    this.env = env;

    // Available models with specialties and costs
    this.models = [
      {
        name: "@cf/meta/llama-4-scout-17b-16e-instruct",
        cost: 0.0002,
        specialty: "draft",
        priority: 1,
      },
      {
        name: "@cf/google/gemma-3-12b-it",
        cost: 0.0002,
        specialty: "creativity",
        priority: 2,
      },
      {
        name: "@cf/openai/gpt-oss-120b",
        cost: 0.0003,
        specialty: "knowledge",
        priority: 3,
      },
      {
        name: "@cf/qwen/qwen-2.5-72b-instruct",
        cost: 0.0003,
        specialty: "reasoning",
        priority: 4,
      },
      {
        name: "@cf/meta/llama-3.2-11b-vision-instruct",
        cost: 0.0002,
        specialty: "multimodal",
        priority: 5,
      },
      // Premium fallback
      {
        name: "anthropic/claude-3.5-sonnet",
        cost: 0.003,
        specialty: "premium",
        priority: 99,
      },
    ];

    // Quality thresholds by task type
    this.qualityThresholds = {
      simple_query: 0.75,
      creative_task: 0.85,
      legal_analysis: 0.95,
      code_generation: 0.9,
      explanation: 0.8,
      reasoning: 0.88,
      default: 0.85,
    };

    this.maxChainLength = 5;
  }

  /**
   * Execute chain until quality threshold met
   */
  async executeChain(prompt, options = {}) {
    const {
      taskType = "default",
      requirements = {},
      maxCost = 0.005,
      skipCache = false,
    } = options;

    const startTime = Date.now();
    const chain = [];
    let currentResult = null;
    let cumulativeCost = 0;
    const qualityThreshold =
      this.qualityThresholds[taskType] || this.qualityThresholds.default;

    console.log(
      `🔗 Starting infinite chain for ${taskType}, target quality: ${qualityThreshold}`,
    );

    // Check cache first
    if (!skipCache) {
      const cached = await this.checkCache(prompt);
      if (cached) {
        return {
          output: cached.response,
          chain_length: 0,
          models_used: ["cache"],
          total_cost: 0,
          quality_score: cached.quality || 0.95,
          savings_vs_premium: 100,
          cache_hit: true,
          latency_ms: Date.now() - startTime,
        };
      }
    }

    // Execute chain
    for (let i = 0; i < this.maxChainLength; i++) {
      // Cost limit check
      if (cumulativeCost >= maxCost) {
        console.warn(`⚠️ Cost limit reached: $${cumulativeCost.toFixed(4)}`);
        break;
      }

      // Select next model
      const model = this.selectNextModel(chain, requirements, currentResult);
      if (!model) {
        console.log("✅ No more models needed");
        break;
      }

      console.log(`🔧 Chain step ${i + 1}: ${model.specialty} (${model.name})`);

      try {
        // Execute model
        const result = await this.executeModel(model, prompt, currentResult);
        chain.push(result);
        cumulativeCost += model.cost;

        // Assess quality
        const quality = await this.assessQuality(
          result.output,
          requirements,
          taskType,
        );
        result.quality = quality;

        console.log(
          `📊 Quality: ${quality.score.toFixed(2)} (target: ${qualityThreshold})`,
        );

        if (quality.score >= qualityThreshold) {
          // Success - quality threshold met
          const savings = ((0.003 - cumulativeCost) / 0.003) * 100;

          // Cache result
          await this.cacheResult(prompt, result.output, quality.score);

          return {
            output: result.output,
            chain_length: chain.length,
            models_used: chain.map((r) => r.model.specialty),
            total_cost: cumulativeCost,
            quality_score: quality.score,
            quality_breakdown: quality.breakdown,
            savings_vs_premium: Math.max(0, savings),
            cache_hit: false,
            latency_ms: Date.now() - startTime,
            chain_details: chain.map((r) => ({
              model: r.model.specialty,
              cost: r.model.cost,
              quality: r.quality?.score,
            })),
          };
        }

        currentResult = result;
      } catch (error) {
        console.error(`❌ Model ${model.name} failed:`, error.message);

        // Try next model
        continue;
      }
    }

    // Chain exhausted - use premium fallback
    console.log("⚡ Chain exhausted, using premium fallback");
    return this.executePremiumFallback(
      prompt,
      chain,
      cumulativeCost,
      startTime,
    );
  }

  /**
   * Select next model based on chain history and requirements
   */
  selectNextModel(chain, requirements, currentResult) {
    const usedSpecialties = chain.map((r) => r.model.specialty);

    // Priority order: draft → creativity → knowledge → reasoning → multimodal
    const selectionOrder = [
      "draft",
      "creativity",
      "knowledge",
      "reasoning",
      "multimodal",
    ];

    // Select based on requirements
    if (requirements.creativity && !usedSpecialties.includes("creativity")) {
      return this.models.find((m) => m.specialty === "creativity");
    }

    if (requirements.knowledge && !usedSpecialties.includes("knowledge")) {
      return this.models.find((m) => m.specialty === "knowledge");
    }

    if (requirements.reasoning && !usedSpecialties.includes("reasoning")) {
      return this.models.find((m) => m.specialty === "reasoning");
    }

    if (requirements.multimodal && !usedSpecialties.includes("multimodal")) {
      return this.models.find((m) => m.specialty === "multimodal");
    }

    // Follow default order
    for (const specialty of selectionOrder) {
      if (!usedSpecialties.includes(specialty)) {
        return this.models.find((m) => m.specialty === specialty);
      }
    }

    // All cheap models exhausted
    return null;
  }

  /**
   * Execute single model in chain
   */
  async executeModel(model, originalPrompt, previousResult) {
    let prompt = originalPrompt;

    if (previousResult) {
      // Chain prompt: enhance previous output
      prompt = `Previous AI response (enhance with ${model.specialty}):
${previousResult.output}

Original request: ${originalPrompt}

Your task: Enhance the response by adding ${model.specialty}. Keep all good aspects, improve weak aspects. Be concise.`;
    }

    const response = await this.ai.run(model.name, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: model.specialty === "creativity" ? 0.8 : 0.3,
    });

    return {
      model: model,
      output: response.response,
      cost: model.cost,
      timestamp: Date.now(),
    };
  }

  /**
   * Assess quality of output
   */
  async assessQuality(output, requirements, taskType) {
    try {
      // Use cheap Llama for assessment
      const assessor = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [
          {
            role: "user",
            content: `Assess AI response quality (0.0-1.0 scale):

OUTPUT: ${output.substring(0, 500)}

TASK TYPE: ${taskType}
REQUIREMENTS: ${JSON.stringify(requirements)}

Rate:
- creativity: 0.0-1.0
- knowledge: 0.0-1.0
- innovation: 0.0-1.0
- completeness: 0.0-1.0
- overall: 0.0-1.0

JSON only, no explanation.`,
          },
        ],
        max_tokens: 100,
        temperature: 0.1,
      });

      const scores = JSON.parse(assessor.response.match(/\{[\s\S]*\}/)[0]);

      return {
        score: scores.overall || 0.7,
        breakdown: scores,
      };
    } catch (error) {
      console.warn("Quality assessment failed:", error.message);
      // Conservative estimate
      return { score: 0.7, breakdown: {} };
    }
  }

  /**
   * Premium fallback when chain insufficient
   */
  async executePremiumFallback(prompt, chain, cumulativeCost, startTime) {
    console.log("💎 Executing premium fallback");

    // Note: Premium external APIs (Anthropic, OpenAI) would go here
    // For now, use best available Cloudflare model
    const premium =
      this.models.find((m) => m.specialty === "premium") ||
      this.models.find((m) => m.name.includes("gpt-oss"));

    try {
      const result = await this.ai.run(premium.name, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.5,
      });

      const totalCost = cumulativeCost + premium.cost;

      return {
        output: result.response,
        chain_length: chain.length + 1,
        models_used: [...chain.map((r) => r.model.specialty), "premium"],
        total_cost: totalCost,
        quality_score: 0.95,
        savings_vs_premium: ((0.003 - totalCost) / 0.003) * 100,
        fallback: "premium_required",
        cache_hit: false,
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      console.error("Premium fallback failed:", error);

      // Return best chain result
      const bestResult = chain.reduce(
        (best, curr) =>
          (curr.quality?.score || 0) > (best.quality?.score || 0) ? curr : best,
        chain[0],
      );

      return {
        output: bestResult?.output || "Error: All models failed",
        chain_length: chain.length,
        models_used: chain.map((r) => r.model.specialty),
        total_cost: cumulativeCost,
        quality_score: bestResult?.quality?.score || 0,
        error: "premium_fallback_failed",
        cache_hit: false,
        latency_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Check cache for existing result
   */
  async checkCache(prompt) {
    if (!this.env.KV_CACHE) return null;

    try {
      const cacheKey = `chain:${this.hashPrompt(prompt)}`;
      const cached = await this.env.KV_CACHE.get(cacheKey, "json");

      if (cached && this.isFresh(cached, 24 * 60 * 60)) {
        console.log("🎯 Cache hit");
        return cached;
      }
    } catch (error) {
      console.warn("Cache check failed:", error.message);
    }

    return null;
  }

  /**
   * Cache result for future use
   */
  async cacheResult(prompt, response, quality) {
    if (!this.env.KV_CACHE) return;

    try {
      const cacheKey = `chain:${this.hashPrompt(prompt)}`;
      await this.env.KV_CACHE.put(
        cacheKey,
        JSON.stringify({
          response,
          quality,
          timestamp: Date.now(),
        }),
        {
          expirationTtl: 24 * 60 * 60, // 24 hours
        },
      );
    } catch (error) {
      console.warn("Cache write failed:", error.message);
    }
  }

  /**
   * Hash prompt for cache key
   */
  hashPrompt(prompt) {
    // Simple hash for demo - use crypto.subtle in production
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check if cached result is fresh
   */
  isFresh(cached, maxAge) {
    return Date.now() - cached.timestamp < maxAge * 1000;
  }

  /**
   * Get chain statistics
   */
  getStats() {
    return {
      models_available: this.models.length,
      specialties: this.models.map((m) => m.specialty),
      cost_range: {
        min: Math.min(...this.models.map((m) => m.cost)),
        max: Math.max(...this.models.map((m) => m.cost)),
        premium: 0.003,
      },
      quality_thresholds: this.qualityThresholds,
    };
  }
}

export default InfiniteModelChain;
