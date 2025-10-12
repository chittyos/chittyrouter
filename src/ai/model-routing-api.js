/**
 * ChittyRouter Model Selection API
 * Cost-optimal model routing for Claude Code output-style integration
 * Version: 1.0.0
 * Created: 2025-10-09
 */

export class ModelRoutingAPI {
  constructor(env) {
    this.env = env;
    this.modelPricing = {
      "sonnet-4.5": { input: 0.003, output: 0.015 }, // per 1K tokens
      "sonnet-4": { input: 0.003, output: 0.015 },
      "haiku-3.5": { input: 0.0008, output: 0.004 },
      "opus-3.5": { input: 0.015, output: 0.075 },
      "opus-3.5-batch": { input: 0.0075, output: 0.0375 }, // 50% discount for async
      "gpt-4-turbo": { input: 0.01, output: 0.03 },
      "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
      "llama-3.1-8b": { input: 0, output: 0 }, // Cloudflare AI (free tier)
    };

    this.modelCapabilities = {
      "sonnet-4.5": {
        complexity: "high",
        reasoning: "excellent",
        speed: "fast",
      },
      "sonnet-4": { complexity: "high", reasoning: "excellent", speed: "fast" },
      "haiku-3.5": { complexity: "low", reasoning: "good", speed: "very_fast" },
      "opus-3.5": { complexity: "very_high", reasoning: "best", speed: "slow" },
      "opus-3.5-batch": {
        complexity: "very_high",
        reasoning: "best",
        speed: "async",
      },
      "llama-3.1-8b": { complexity: "low", reasoning: "fair", speed: "fast" },
    };
  }

  /**
   * Main routing decision endpoint
   * Called by output-style before responding
   */
  async route(request) {
    const {
      task_type,
      complexity,
      urgency,
      cost_budget,
      context_size,
      user_preference = "cost_optimal",
    } = await request.json();

    // Analyze task requirements
    const analysis = this.analyzeTask(task_type, complexity, context_size);

    // Calculate rework risk
    const reworkRisk = this.calculateReworkRisk(task_type, complexity);

    // Get candidate models
    const candidates = this.getCandidateModels(analysis, cost_budget);

    // Select optimal model
    const decision = this.selectModel(
      candidates,
      urgency,
      reworkRisk,
      cost_budget,
      user_preference,
    );

    // Build response
    return new Response(
      JSON.stringify({
        selected_model: decision.model,
        reasoning: decision.reasoning,
        cost_estimate: decision.cost_estimate,
        alternatives: decision.alternatives,
        fallback_chain: decision.fallbacks,
        rework_risk: reworkRisk,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  /**
   * Analyze task to determine model requirements
   */
  analyzeTask(task_type, complexity, context_size) {
    const taskProfiles = {
      grep: { min_complexity: "trivial", tools_only: true },
      read: { min_complexity: "trivial", tools_only: true },
      simple_edit: { min_complexity: "low", reasoning_needed: false },
      edit: { min_complexity: "medium", reasoning_needed: true },
      code_refactor: { min_complexity: "high", reasoning_needed: true },
      research: {
        min_complexity: "high",
        reasoning_needed: true,
        async_viable: true,
      },
      analysis: { min_complexity: "high", reasoning_needed: true },
      implementation: { min_complexity: "very_high", reasoning_needed: true },
    };

    const profile = taskProfiles[task_type] || taskProfiles.edit;

    return {
      ...profile,
      complexity: complexity || profile.min_complexity,
      context_size,
      tokens_estimate: this.estimateTokens(task_type, complexity, context_size),
    };
  }

  /**
   * Estimate token usage
   */
  estimateTokens(task_type, complexity, context_size) {
    const baseTokens = {
      trivial: { in: 100, out: 50 },
      low: { in: 500, out: 200 },
      medium: { in: 1200, out: 450 },
      high: { in: 3000, out: 1000 },
      very_high: { in: 8000, out: 2500 },
    };

    const estimate = baseTokens[complexity] || baseTokens.medium;

    // Adjust for context size
    if (context_size) {
      estimate.in = Math.max(estimate.in, context_size * 0.8);
    }

    return estimate;
  }

  /**
   * Calculate rework risk (0.0-1.0)
   */
  calculateReworkRisk(task_type, complexity) {
    const riskMatrix = {
      trivial: 0.05,
      low: 0.15,
      medium: 0.3,
      high: 0.5,
      very_high: 0.7,
    };

    let risk = riskMatrix[complexity] || 0.3;

    // Increase risk for unfamiliar task types
    const highRiskTasks = ["implementation", "research", "analysis"];
    if (highRiskTasks.includes(task_type)) {
      risk = Math.min(1.0, risk * 1.3);
    }

    return risk;
  }

  /**
   * Get candidate models based on requirements
   */
  getCandidateModels(analysis, cost_budget) {
    const candidates = [];

    // Tools-only option
    if (analysis.tools_only) {
      candidates.push({
        model: "none",
        cost: 0,
        reasoning: "Tool-only execution (no LLM needed)",
      });
      return candidates;
    }

    // Model selection based on complexity
    const complexityMap = {
      trivial: ["haiku-3.5", "llama-3.1-8b"],
      low: ["haiku-3.5", "sonnet-4", "llama-3.1-8b"],
      medium: ["sonnet-4", "sonnet-4.5", "haiku-3.5"],
      high: ["sonnet-4.5", "sonnet-4", "opus-3.5"],
      very_high: ["opus-3.5", "sonnet-4.5", "opus-3.5-batch"],
    };

    const suitableModels =
      complexityMap[analysis.complexity] || complexityMap.medium;

    for (const model of suitableModels) {
      const pricing = this.modelPricing[model];
      const tokens = analysis.tokens_estimate;
      const cost =
        (tokens.in / 1000) * pricing.input +
        (tokens.out / 1000) * pricing.output;

      if (!cost_budget || cost <= cost_budget) {
        candidates.push({
          model,
          cost,
          tokens,
          capabilities: this.modelCapabilities[model],
        });
      }
    }

    return candidates.sort((a, b) => a.cost - b.cost);
  }

  /**
   * Select optimal model considering all factors
   */
  selectModel(candidates, urgency, reworkRisk, _cost_budget, _user_preference) {
    if (candidates.length === 0) {
      return {
        model: "sonnet-4",
        reasoning: "Default fallback (no suitable candidates)",
        cost_estimate: 0.15,
        alternatives: [],
        fallbacks: ["haiku-3.5", "llama-3.1-8b"],
      };
    }

    // Tools-only path
    if (candidates[0].model === "none") {
      return {
        model: "none",
        reasoning: "Tool-only execution (zero cost)",
        cost_estimate: 0,
        alternatives: [],
        fallbacks: [],
      };
    }

    let selected = candidates[0]; // Start with cheapest

    // Adjust for rework risk
    if (reworkRisk > 0.3) {
      // High rework risk: use better model to avoid 2x cost
      const totalCostWithRework = selected.cost * (1 + reworkRisk);

      for (const candidate of candidates) {
        const betterModel = this.modelCapabilities[candidate.model];
        if (
          betterModel.reasoning === "excellent" ||
          betterModel.reasoning === "best"
        ) {
          const candidateTotalCost = candidate.cost * (1 + reworkRisk * 0.3); // Better model = lower rework
          if (candidateTotalCost < totalCostWithRework) {
            selected = candidate;
            break;
          }
        }
      }
    }

    // Adjust for urgency
    if (urgency === "urgent") {
      // Prefer faster models
      for (const candidate of candidates) {
        const caps = this.modelCapabilities[candidate.model];
        if (
          caps.speed === "very_fast" ||
          (caps.speed === "fast" && candidate.cost <= selected.cost * 1.2)
        ) {
          selected = candidate;
          break;
        }
      }
    } else if (urgency === "low" && selected.cost > 0.5) {
      // Offer async batch option
      const asyncCandidate = candidates.find((c) => c.model.includes("batch"));
      if (asyncCandidate) {
        selected = {
          ...asyncCandidate,
          async_recommended: true,
        };
      }
    }

    // Build response
    return {
      model: selected.model,
      reasoning: this.buildReasoning(selected, reworkRisk, urgency),
      cost_estimate: selected.cost,
      alternatives: candidates
        .filter((c) => c.model !== selected.model)
        .slice(0, 3)
        .map((c) => ({
          model: c.model,
          cost: c.cost,
          tradeoff: this.describeTradeoff(c, selected),
        })),
      fallbacks: this.buildFallbackChain(selected.model),
      async_recommended: selected.async_recommended || false,
    };
  }

  /**
   * Build human-readable reasoning
   */
  buildReasoning(selected, reworkRisk, urgency) {
    const parts = [];

    if (selected.model === "none") {
      return "Tool-only execution requires no LLM generation";
    }

    const caps = this.modelCapabilities[selected.model];

    parts.push(`Selected ${selected.model}`);

    if (reworkRisk > 0.3) {
      parts.push(
        `High rework risk (${(reworkRisk * 100).toFixed(0)}%) justifies better model`,
      );
    } else {
      parts.push("Complexity matches model capabilities");
    }

    if (urgency === "urgent") {
      parts.push(`Optimized for speed (${caps.speed})`);
    } else if (urgency === "low") {
      parts.push("Cost-optimal routing (no time pressure)");
    }

    if (selected.async_recommended) {
      parts.push("Async batch recommended for 50% cost savings");
    }

    return parts.join(". ");
  }

  /**
   * Describe tradeoff vs selected model
   */
  describeTradeoff(candidate, selected) {
    const candCaps = this.modelCapabilities[candidate.model];
    const selCaps = this.modelCapabilities[selected.model];

    if (candidate.cost < selected.cost) {
      return `${((1 - candidate.cost / selected.cost) * 100).toFixed(0)}% cheaper, but ${candCaps.reasoning} reasoning vs ${selCaps.reasoning}`;
    } else {
      return `${((candidate.cost / selected.cost - 1) * 100).toFixed(0)}% more expensive, but ${candCaps.reasoning} reasoning`;
    }
  }

  /**
   * Build fallback chain
   */
  buildFallbackChain(primary_model) {
    const fallbacks = [
      { model: "sonnet-4", trigger: "rate_limit" },
      { model: "haiku-3.5", trigger: "cost_exceeded" },
      { model: "llama-3.1-8b", trigger: "all_paid_models_failed" },
    ];

    return fallbacks.filter((f) => f.model !== primary_model);
  }

  /**
   * Health check
   */
  async health() {
    return new Response(
      JSON.stringify({
        status: "healthy",
        service: "ChittyRouter Model Selection API",
        version: "1.0.0",
        models_available: Object.keys(this.modelPricing),
        pricing_current: true,
        timestamp: new Date().toISOString(),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * Cloudflare Worker fetch handler
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const api = new ModelRoutingAPI(env);

    // Health check
    if (url.pathname === "/ai/route/health") {
      return api.health();
    }

    // Main routing endpoint
    if (url.pathname === "/ai/route" && request.method === "POST") {
      return api.route(request);
    }

    // Model pricing info
    if (url.pathname === "/ai/route/pricing") {
      return new Response(JSON.stringify(api.modelPricing), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Model capabilities info
    if (url.pathname === "/ai/route/capabilities") {
      return new Response(JSON.stringify(api.modelCapabilities), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("ChittyRouter Model Selection API v1.0.0", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
