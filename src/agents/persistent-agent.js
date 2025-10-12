/**
 * Persistent Agent with Memory, Learning, and Self-Healing
 * Cloudflare Durable Object implementation
 */

import { AIGatewayClient } from "../ai/ai-gateway-client.js";
import { ContextualMemory } from "./contextual-memory.js";

/**
 * AgentMemory - Multi-tier memory system
 */
class AgentMemory {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  /**
   * Build context from memory tiers
   */
  async recall(options = {}) {
    const { taskType, limit = 5 } = options;

    // Tier 1: Working memory (KV)
    const workingMemory = await this.getWorkingMemory();

    // Tier 2: Semantic memory (Vectorize) - retrieve similar past experiences
    const semanticMemory = await this.getSemanticMemory(taskType, limit);

    return {
      recent: workingMemory,
      similar: semanticMemory,
      retrieved_at: new Date().toISOString(),
    };
  }

  /**
   * Store interaction in all memory tiers
   */
  async store(interaction) {
    const timestamp = Date.now();
    const sessionId = await this.getSessionId();

    // Tier 1: Working memory (KV) - fast access, short TTL
    if (this.env.AGENT_WORKING_MEMORY) {
      await this.env.AGENT_WORKING_MEMORY.put(
        `agent:${this.state.id}:session:${sessionId}`,
        JSON.stringify({
          recentMessages: [interaction],
          lastUpdate: timestamp,
        }),
        { expirationTtl: 3600 }, // 1 hour
      );
    }

    // Tier 2: Semantic memory (Vectorize) - if available
    if (this.env.AGENT_SEMANTIC_MEMORY && interaction.embedding) {
      await this.env.AGENT_SEMANTIC_MEMORY.insert([
        {
          id: `interaction:${timestamp}`,
          values: interaction.embedding,
          metadata: {
            agentId: this.state.id.toString(),
            task: interaction.taskType,
            outcome: interaction.success,
            provider: interaction.provider,
            cost: interaction.cost,
          },
        },
      ]);
    }

    // Tier 3: Episodic memory (R2) - complete logs
    if (this.env.AGENT_EPISODIC_MEMORY) {
      const date = new Date().toISOString().split("T")[0];
      await this.env.AGENT_EPISODIC_MEMORY.put(
        `episodes/${this.state.id}/${date}/${timestamp}.json`,
        JSON.stringify(interaction),
      );
    }

    // Tier 4: Update aggregate stats in Durable Object state
    await this.updateAggregateStats(interaction);
  }

  async getWorkingMemory() {
    const sessionId = await this.getSessionId();
    if (!this.env.AGENT_WORKING_MEMORY) return null;

    const data = await this.env.AGENT_WORKING_MEMORY.get(
      `agent:${this.state.id}:session:${sessionId}`,
    );
    return data ? JSON.parse(data) : null;
  }

  async getSemanticMemory() {
    if (!this.env.AGENT_SEMANTIC_MEMORY) return [];

    // TODO: Generate embedding for current task
    // For now, return empty - will be enhanced with actual embeddings
    return [];
  }

  async getSessionId() {
    let sessionId = await this.state.storage.get("sessionId");
    if (!sessionId) {
      sessionId = `session_${Date.now()}`;
      await this.state.storage.put("sessionId", sessionId);
    }
    return sessionId;
  }

  async updateAggregateStats(interaction) {
    const stats = (await this.state.storage.get("aggregate_stats")) || {
      total_interactions: 0,
      total_cost: 0,
      provider_usage: {},
      task_type_usage: {},
    };

    stats.total_interactions += 1;
    stats.total_cost += interaction.cost || 0;

    // Track provider usage
    const provider = interaction.provider;
    stats.provider_usage[provider] = (stats.provider_usage[provider] || 0) + 1;

    // Track task type usage
    const taskType = interaction.taskType;
    stats.task_type_usage[taskType] =
      (stats.task_type_usage[taskType] || 0) + 1;

    await this.state.storage.put("aggregate_stats", stats);
  }
}

/**
 * LearningEngine - Performance tracking and model optimization
 */
class LearningEngine {
  constructor(env) {
    this.env = env;
  }

  async trackPerformance(agentId, interaction) {
    // Store in Durable Object state for now
    // In production, this would go to PostgreSQL (Neon)
    console.log(`📊 Tracking performance: ${agentId}`, {
      taskType: interaction.taskType,
      provider: interaction.provider,
      success: interaction.success,
      cost: interaction.cost,
      qualityScore: interaction.qualityScore,
    });
  }

  async optimizeModelSelection(agentId, taskType, modelScores = {}) {
    // Analyze historical performance to select best provider
    // Filter scores for this specific task type
    const taskScores = {};
    for (const [key, score] of Object.entries(modelScores)) {
      if (key.startsWith(`${taskType}:`)) {
        const provider = key.split(":")[1];
        taskScores[provider] = score;
      }
    }

    if (Object.keys(taskScores).length === 0) {
      // Default routing if no history
      const defaultRouting = {
        simple: "workersai",
        moderate: "workersai",
        complex: "anthropic",
        vision: "google",
      };
      return defaultRouting[taskType] || "workersai";
    }

    // Calculate quality/cost ratio for each provider
    let bestProvider = "workersai";
    let bestScore = 0;

    for (const [provider, score] of Object.entries(taskScores)) {
      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }

    return bestProvider;
  }
}

/**
 * PersistentAgent Durable Object
 * REAL agent with memory, learning, and self-healing
 */
export class PersistentAgent {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.memory = new AgentMemory(state, env);
    this.contextualMemory = new ContextualMemory(this.memory, {
      maxContextMessages: 10,
      includeSystemContext: true,
    });
    this.aiGateway = new AIGatewayClient(env);
    this.learning = new LearningEngine(env);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Route to appropriate handler (handle both /complete and /platform/agents/*/complete)
    if (pathname.endsWith("/complete") || pathname === "/complete") {
      return this.handleComplete(request);
    }

    if (pathname.endsWith("/stats") || pathname === "/stats") {
      return this.handleStats(request);
    }

    if (pathname.endsWith("/health") || pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          agent_id: this.state.id.toString(),
        }),
      );
    }

    return new Response(
      JSON.stringify({
        error: "Not Found",
        path: pathname,
        available_endpoints: ["/complete", "/stats", "/health"],
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Main request handler with memory context and learning
   */
  async handleComplete(request) {
    try {
      const { prompt, taskType, context } = await request.json();

      // Build conversation history from memory (ChittyContextual integration)
      const { messages, contextMetadata } =
        await this.contextualMemory.buildConversationHistory(prompt, {
          taskType,
          limit: 5,
        });

      // Analyze prompt for entities and topics
      const promptAnalysis = await this.contextualMemory.analyzePrompt(prompt);

      // Get optimal provider based on learning
      const modelScores = (await this.state.storage.get("model_scores")) || {};
      const preferredProvider = await this.learning.optimizeModelSelection(
        this.state.id.toString(),
        taskType,
        modelScores,
      );

      // Execute with AI Gateway using conversation history
      const response = await this.aiGateway.complete(messages, {
        complexity: this.assessComplexity(taskType),
        preferredProvider,
        context: {
          ...context,
          entities: promptAnalysis.entities,
          topics: promptAnalysis.topics,
          contextMetadata,
        },
      });

      // Store in memory
      await this.memory.store({
        prompt,
        response: response.response,
        provider: response.provider,
        cost: response.cost,
        success: response.success,
        taskType,
        timestamp: Date.now(),
      });

      // Track performance and learn
      const qualityScore = await this.assessQuality(response);
      await this.learning.trackPerformance(this.state.id.toString(), {
        taskType,
        provider: response.provider,
        success: response.success,
        responseTime: response.responseTime,
        cost: response.cost,
        qualityScore,
      });

      // Update model scores (simple learning)
      await this.learn(
        taskType,
        response.provider,
        response.success,
        qualityScore,
      );

      // Self-heal if needed
      if (!response.success) {
        return this.selfHeal(prompt, taskType, response);
      }

      return new Response(
        JSON.stringify({
          ...response,
          agent_id: this.state.id.toString(),
          memory_context_used: memoryContext !== null,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("❌ Agent error:", error);
      return new Response(
        JSON.stringify({
          error: error.message,
          agent_id: this.state.id.toString(),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Learning mechanism - update model preferences
   */
  async learn(taskType, provider, success, qualityScore) {
    const modelScores = (await this.state.storage.get("model_scores")) || {};

    if (success) {
      // Increase score for successful providers
      const key = `${taskType}:${provider}`;
      modelScores[key] = (modelScores[key] || 0) + qualityScore;
    } else {
      // Decrease score for failed providers
      const key = `${taskType}:${provider}`;
      modelScores[key] = Math.max(0, (modelScores[key] || 0) - 1);
    }

    await this.state.storage.put("model_scores", modelScores);
  }

  /**
   * Self-healing - automatic recovery from failures
   */
  async selfHeal(prompt, taskType, failedResponse) {
    console.log(`🔧 Self-healing after ${failedResponse.provider} failure`);

    // Get fallback provider
    const fallbackProviders = this.getFallbackChain(failedResponse.provider);

    for (const fallback of fallbackProviders) {
      try {
        const retryResponse = await this.aiGateway.complete(prompt, {
          complexity: this.assessComplexity(taskType),
          preferredProvider: fallback,
        });

        if (retryResponse.success) {
          console.log(`✅ Self-healed with ${fallback}`);

          // Learn: This provider works better for this task type
          await this.learn(taskType, fallback, true, 0.8);
          await this.learn(taskType, failedResponse.provider, false, 0);

          return new Response(
            JSON.stringify({
              ...retryResponse,
              self_healed: true,
              original_provider: failedResponse.provider,
              fallback_provider: fallback,
            }),
            {
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      } catch (error) {
        console.error(`❌ Fallback ${fallback} failed:`, error.message);
        continue;
      }
    }

    // All fallbacks failed
    return new Response(
      JSON.stringify({
        error: "All providers failed",
        original_error: failedResponse.error,
        agent_id: this.state.id.toString(),
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Get agent statistics
   */
  async handleStats() {
    const stats = (await this.state.storage.get("aggregate_stats")) || {};
    const modelScores = (await this.state.storage.get("model_scores")) || {};

    return new Response(
      JSON.stringify({
        agent_id: this.state.id.toString(),
        stats,
        model_scores: modelScores,
        created_at: await this.state.storage.get("created_at"),
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  assessComplexity(taskType) {
    const complexityMap = {
      email_routing: "simple",
      legal_reasoning: "complex",
      document_analysis: "moderate",
      triage: "simple",
      code_generation: "complex",
      summarization: "simple",
    };
    return complexityMap[taskType] || "moderate";
  }

  assessQuality(response) {
    // Simple heuristic - can be enhanced with user feedback
    if (response.cached) return 0.8; // Cached responses are trusted
    if (response.provider === "workersai") return 0.7;
    if (response.provider === "anthropic") return 0.9;
    if (response.provider === "openai") return 0.85;
    return 0.75;
  }

  getFallbackChain(failedProvider) {
    const chains = {
      workersai: ["mistral", "anthropic", "openai"],
      mistral: ["workersai", "anthropic"],
      anthropic: ["openai", "mistral"],
      openai: ["anthropic", "mistral"],
      google: ["openai", "anthropic"],
      huggingface: ["workersai", "mistral"],
    };
    return chains[failedProvider] || ["workersai", "anthropic"];
  }
}

export default PersistentAgent;
