/**
 * AI State Management - Durable Object for AI processing state
 * Replaces traditional case state with AI-enhanced state management
 */

export class AIStateDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case "/store-ai-analysis":
          return this.storeAIAnalysis(await request.json());

        case "/get-ai-history":
          return this.getAIHistory(url.searchParams.get("chittyId"));

        case "/store-agent-result":
          return this.storeAgentResult(await request.json());

        case "/get-case-intelligence":
          return this.getCaseIntelligence(url.searchParams.get("caseId"));

        case "/update-ai-learning":
          return this.updateAILearning(await request.json());

        default:
          return new Response("AI State DO Active", { status: 200 });
      }
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message,
        }),
        { status: 500 },
      );
    }
  }

  /**
   * Store AI analysis results
   */
  async storeAIAnalysis(analysisData) {
    const key = `ai-analysis:${analysisData.chittyId}`;

    const record = {
      ...analysisData,
      stored_at: new Date().toISOString(),
      version: "2.0.0-ai",
    };

    await this.state.storage.put(key, record);

    // Update case intelligence if case-related
    if (analysisData.case_related) {
      await this.updateCaseIntelligence(analysisData);
    }

    return new Response(
      JSON.stringify({
        success: true,
        chittyId: analysisData.chittyId,
        stored: true,
      }),
    );
  }

  /**
   * Get AI processing history for a ChittyID
   */
  async getAIHistory(chittyId) {
    const key = `ai-analysis:${chittyId}`;
    const analysis = await this.state.storage.get(key);

    if (!analysis) {
      return new Response(
        JSON.stringify({
          found: false,
          chittyId,
        }),
      );
    }

    return new Response(
      JSON.stringify({
        found: true,
        chittyId,
        analysis,
      }),
    );
  }

  /**
   * Store agent orchestration results
   */
  async storeAgentResult(agentData) {
    const key = `agent-result:${agentData.taskId}`;

    await this.state.storage.put(key, {
      ...agentData,
      stored_at: new Date().toISOString(),
    });

    // Update agent performance metrics
    await this.updateAgentMetrics(agentData);

    return new Response(
      JSON.stringify({
        success: true,
        taskId: agentData.taskId,
      }),
    );
  }

  /**
   * Get comprehensive case intelligence
   */
  async getCaseIntelligence(caseId) {
    const caseKey = `case-intelligence:${caseId}`;
    const intelligence = await this.state.storage.get(caseKey);

    if (!intelligence) {
      return new Response(
        JSON.stringify({
          found: false,
          caseId,
          intelligence: null,
        }),
      );
    }

    // Get related AI analyses
    const analyses = await this.getRelatedAnalyses(caseId);

    return new Response(
      JSON.stringify({
        found: true,
        caseId,
        intelligence,
        related_analyses: analyses,
        ai_insights: this.generateAIInsights(intelligence, analyses),
      }),
    );
  }

  /**
   * Update case intelligence with new AI data
   */
  async updateCaseIntelligence(analysisData) {
    const caseId = analysisData.case_pattern || analysisData.case_id;
    if (!caseId) return;

    const caseKey = `case-intelligence:${caseId}`;
    let intelligence = (await this.state.storage.get(caseKey)) || {
      caseId,
      created_at: new Date().toISOString(),
      communications: [],
      ai_insights: {},
      timeline: [],
    };

    // Add new communication
    intelligence.communications.push({
      chittyId: analysisData.chittyId,
      timestamp: new Date().toISOString(),
      category: analysisData.category,
      priority: analysisData.priority,
      sentiment: analysisData.sentiment,
      key_topics: analysisData.key_topics,
    });

    // Update AI insights
    intelligence.ai_insights = this.aggregateInsights(
      intelligence,
      analysisData,
    );

    // Update timeline
    intelligence.timeline.push({
      timestamp: new Date().toISOString(),
      event: "AI_ANALYSIS_COMPLETED",
      chittyId: analysisData.chittyId,
      category: analysisData.category,
    });

    intelligence.updated_at = new Date().toISOString();

    await this.state.storage.put(caseKey, intelligence);
  }

  /**
   * Aggregate AI insights for case intelligence
   */
  aggregateInsights(intelligence, newAnalysis) {
    const insights = intelligence.ai_insights || {};

    // Update category distribution
    insights.categories = insights.categories || {};
    insights.categories[newAnalysis.category] =
      (insights.categories[newAnalysis.category] || 0) + 1;

    // Update priority trends
    insights.priorities = insights.priorities || {};
    insights.priorities[newAnalysis.priority] =
      (insights.priorities[newAnalysis.priority] || 0) + 1;

    // Update sentiment analysis
    insights.sentiment_trends = insights.sentiment_trends || [];
    insights.sentiment_trends.push({
      timestamp: new Date().toISOString(),
      sentiment: newAnalysis.sentiment,
      urgency_score: newAnalysis.urgency_score,
    });

    // Track key topics
    insights.key_topics = insights.key_topics || {};
    for (const topic of newAnalysis.key_topics || []) {
      insights.key_topics[topic] = (insights.key_topics[topic] || 0) + 1;
    }

    // Calculate overall case health
    insights.case_health = this.calculateCaseHealth(insights);

    return insights;
  }

  /**
   * Calculate case health score based on AI insights
   */
  calculateCaseHealth(insights) {
    let health_score = 0.7; // baseline

    // Adjust based on priority distribution
    const priorities = insights.priorities || {};
    const total_communications = Object.values(priorities).reduce(
      (a, b) => a + b,
      0,
    );

    if (total_communications > 0) {
      const critical_ratio = (priorities.CRITICAL || 0) / total_communications;
      const emergency_ratio = (priorities.HIGH || 0) / total_communications;

      if (critical_ratio > 0.3) health_score -= 0.3;
      if (emergency_ratio > 0.5) health_score -= 0.2;
    }

    // Adjust based on sentiment trends
    const recent_sentiments = (insights.sentiment_trends || []).slice(-5);
    const negative_recent = recent_sentiments.filter(
      (s) => s.sentiment === "negative",
    ).length;

    if (negative_recent > 3) health_score -= 0.2;

    return Math.max(0.1, Math.min(1.0, health_score));
  }

  /**
   * Get related AI analyses for a case
   */
  async getRelatedAnalyses(caseId) {
    const analyses = [];
    const list = await this.state.storage.list({ prefix: "ai-analysis:" });

    for (const [, analysis] of list) {
      if (analysis.case_pattern === caseId || analysis.case_id === caseId) {
        analyses.push({
          chittyId: analysis.chittyId,
          timestamp: analysis.timestamp,
          category: analysis.category,
          priority: analysis.priority,
        });
      }
    }

    return analyses.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );
  }

  /**
   * Generate AI insights from case data
   */
  generateAIInsights(intelligence, analyses) {
    return {
      total_communications: analyses.length,
      case_health: intelligence.ai_insights?.case_health || 0.7,
      primary_categories: this.getTopCategories(
        intelligence.ai_insights?.categories,
      ),
      priority_distribution: intelligence.ai_insights?.priorities,
      recent_activity: analyses.slice(0, 5),
      recommendations: this.generateRecommendations(intelligence),
    };
  }

  /**
   * Get top categories from case intelligence
   */
  getTopCategories(categories) {
    if (!categories) return [];

    return Object.entries(categories)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([category, count]) => ({ category, count }));
  }

  /**
   * Generate AI recommendations for case management
   */
  generateRecommendations(intelligence) {
    const recommendations = [];

    // Check case health
    const health = intelligence.ai_insights?.case_health || 0.7;
    if (health < 0.5) {
      recommendations.push(
        "Case requires immediate attention due to low health score",
      );
    }

    // Check priority distribution
    const priorities = intelligence.ai_insights?.priorities || {};
    const critical_count = priorities.CRITICAL || 0;
    if (critical_count > 5) {
      recommendations.push(
        "High number of critical communications - consider escalation",
      );
    }

    // Check communication frequency
    const recent_comms =
      intelligence.communications?.filter(
        (c) =>
          new Date(c.timestamp) >
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      ).length || 0;

    if (recent_comms > 10) {
      recommendations.push("High communication volume - consider case review");
    }

    return recommendations;
  }

  /**
   * Update AI learning data
   */
  async updateAILearning(learningData) {
    const key = `ai-learning:${learningData.type}`;

    let learning = (await this.state.storage.get(key)) || {
      type: learningData.type,
      patterns: {},
      accuracy_metrics: {},
      created_at: new Date().toISOString(),
    };

    // Update learning patterns
    if (learningData.pattern) {
      learning.patterns[learningData.pattern] =
        (learning.patterns[learningData.pattern] || 0) + 1;
    }

    // Update accuracy metrics
    if (learningData.accuracy) {
      learning.accuracy_metrics[new Date().toISOString()] =
        learningData.accuracy;
    }

    learning.updated_at = new Date().toISOString();

    await this.state.storage.put(key, learning);

    return new Response(
      JSON.stringify({
        success: true,
        learning_updated: true,
      }),
    );
  }

  /**
   * Update agent performance metrics
   */
  async updateAgentMetrics(agentData) {
    const key = "agent-metrics";

    let metrics = (await this.state.storage.get(key)) || {
      total_tasks: 0,
      success_rate: 0,
      agent_performance: {},
      created_at: new Date().toISOString(),
    };

    metrics.total_tasks += 1;

    // Update agent-specific metrics
    for (const agentType of agentData.agents_used || []) {
      if (!metrics.agent_performance[agentType]) {
        metrics.agent_performance[agentType] = {
          tasks_completed: 0,
          success_count: 0,
          success_rate: 0,
        };
      }

      const agent_metrics = metrics.agent_performance[agentType];
      agent_metrics.tasks_completed += 1;

      if (agentData.success) {
        agent_metrics.success_count += 1;
      }

      agent_metrics.success_rate =
        agent_metrics.success_count / agent_metrics.tasks_completed;
    }

    // Update overall success rate
    const total_successes = Object.values(metrics.agent_performance).reduce(
      (sum, agent) => sum + agent.success_count,
      0,
    );
    metrics.success_rate = total_successes / metrics.total_tasks;

    metrics.updated_at = new Date().toISOString();

    await this.state.storage.put(key, metrics);
  }
}
