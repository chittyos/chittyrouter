/**
 * ChittyChat Project & Topic Synthesis Engine
 * Intelligent content aggregation, analysis, and synthesis using ChittyChat data
 */

import { ChittyChatProjectSync } from '../sync/chittychat-project-sync.js';
import { validateAIResponseSchema } from '../utils/schema-validation.js';

export class ChittyChatProjectSynth {
  constructor(env) {
    this.env = env;
    this.chatSync = new ChittyChatProjectSync(env);
    this.ai = env.AI;
  }

  /**
   * Synthesize project insights from ChittyChat conversations
   */
  async synthesizeProjectInsights(projectId, timeRange = '7d') {
    try {
      // Fetch project data from ChittyChat
      const projectData = await this.fetchProjectData(projectId, timeRange);

      // Extract key conversations and topics
      const conversations = await this.extractKeyConversations(projectData);

      // Perform AI-powered synthesis
      const synthesis = await this.performAISynthesis(conversations, 'project_insights');

      // Generate actionable recommendations
      const recommendations = await this.generateRecommendations(synthesis);

      // Create synthesis report
      const report = {
        projectId: projectId,
        timeRange: timeRange,
        timestamp: new Date().toISOString(),
        insights: synthesis,
        recommendations: recommendations,
        metrics: await this.calculateProjectMetrics(projectData),
        keyTopics: await this.extractKeyTopics(conversations),
        sentiment: await this.analyzeSentiment(conversations),
        participants: await this.analyzeParticipants(projectData)
      };

      // Sync synthesis back to ChittyChat
      await this.chatSync.syncProjectSynthesis(report);

      return report;

    } catch (error) {
      console.error('❌ Project synthesis failed:', error);
      return {
        projectId: projectId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Synthesize topics across multiple projects
   */
  async synthesizeTopicTrends(topics, projectIds, timeRange = '30d') {
    try {
      const topicData = await this.fetchTopicData(topics, projectIds, timeRange);

      const synthesis = await this.performAISynthesis(topicData, 'topic_trends');

      const trends = {
        topics: topics,
        projects: projectIds,
        timeRange: timeRange,
        timestamp: new Date().toISOString(),
        trends: synthesis,
        crossProjectInsights: await this.analyzeCrossProjectPatterns(topicData),
        emergingTopics: await this.identifyEmergingTopics(topicData),
        topicEvolution: await this.analyzeTopicEvolution(topicData),
        recommendations: await this.generateTopicRecommendations(synthesis)
      };

      // Sync topic synthesis to all relevant projects
      for (const projectId of projectIds) {
        await this.chatSync.syncTopicSynthesis(projectId, trends);
      }

      return trends;

    } catch (error) {
      console.error('❌ Topic synthesis failed:', error);
      return {
        topics: topics,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Real-time conversation synthesis
   */
  async synthesizeConversation(conversationId, context = {}) {
    try {
      const conversation = await this.fetchConversationData(conversationId);

      const synthesis = await this.performAISynthesis(conversation, 'conversation_summary', context);

      const summary = {
        conversationId: conversationId,
        timestamp: new Date().toISOString(),
        summary: synthesis.summary,
        keyPoints: synthesis.keyPoints,
        actionItems: synthesis.actionItems,
        decisions: synthesis.decisions,
        nextSteps: synthesis.nextSteps,
        participants: synthesis.participants,
        sentiment: synthesis.sentiment,
        topics: synthesis.topics,
        urgency: synthesis.urgency
      };

      // Auto-sync conversation summary
      await this.chatSync.syncConversationSummary(conversationId, summary);

      return summary;

    } catch (error) {
      console.error('❌ Conversation synthesis failed:', error);
      return {
        conversationId: conversationId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Cross-project knowledge synthesis
   */
  async synthesizeCrossProjectKnowledge(organizationId, domains) {
    try {
      const knowledgeData = await this.fetchCrossProjectData(organizationId, domains);

      const synthesis = await this.performAISynthesis(knowledgeData, 'knowledge_synthesis');

      const knowledge = {
        organizationId: organizationId,
        domains: domains,
        timestamp: new Date().toISOString(),
        knowledgeMap: synthesis.knowledgeMap,
        patterns: synthesis.patterns,
        insights: synthesis.insights,
        opportunities: synthesis.opportunities,
        risks: synthesis.risks,
        recommendations: synthesis.recommendations,
        expertiseAreas: await this.identifyExpertiseAreas(knowledgeData),
        collaborationOpportunities: await this.findCollaborationOpportunities(knowledgeData)
      };

      // Sync to organization-wide knowledge base
      await this.chatSync.syncOrganizationKnowledge(organizationId, knowledge);

      return knowledge;

    } catch (error) {
      console.error('❌ Cross-project synthesis failed:', error);
      return {
        organizationId: organizationId,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Perform AI-powered synthesis
   */
  async performAISynthesis(data, synthesisType, context = {}) {
    const prompts = {
      project_insights: `
        Analyze this project data and provide comprehensive insights:

        DATA: ${JSON.stringify(data)}

        Provide analysis in JSON format:
        {
          "summary": "overall project summary",
          "keyInsights": ["insight1", "insight2"],
          "progress": "assessment of progress",
          "blockers": ["blocker1", "blocker2"],
          "opportunities": ["opportunity1", "opportunity2"],
          "risks": ["risk1", "risk2"],
          "teamDynamics": "analysis of team collaboration",
          "communicationPatterns": "patterns observed in communications",
          "decisionPoints": ["decision1", "decision2"],
          "confidence": 0.95
        }
      `,

      topic_trends: `
        Analyze topic trends across multiple projects:

        DATA: ${JSON.stringify(data)}

        Provide trend analysis in JSON format:
        {
          "trendingSummary": "overview of trending topics",
          "topicEvolution": "how topics have evolved",
          "crossProjectPatterns": ["pattern1", "pattern2"],
          "emergingThemes": ["theme1", "theme2"],
          "declining": ["declining_topic1", "declining_topic2"],
          "correlations": "relationships between topics",
          "predictions": ["prediction1", "prediction2"],
          "confidence": 0.90
        }
      `,

      conversation_summary: `
        Summarize this conversation with actionable insights:

        CONVERSATION: ${JSON.stringify(data)}
        CONTEXT: ${JSON.stringify(context)}

        Provide summary in JSON format:
        {
          "summary": "concise conversation summary",
          "keyPoints": ["point1", "point2"],
          "actionItems": ["action1", "action2"],
          "decisions": ["decision1", "decision2"],
          "nextSteps": ["step1", "step2"],
          "participants": ["participant analysis"],
          "sentiment": "overall sentiment",
          "topics": ["topic1", "topic2"],
          "urgency": "low|medium|high",
          "followUpNeeded": true|false
        }
      `,

      knowledge_synthesis: `
        Synthesize knowledge across projects and domains:

        DATA: ${JSON.stringify(data)}

        Provide knowledge synthesis in JSON format:
        {
          "knowledgeMap": "overview of organizational knowledge",
          "patterns": ["pattern1", "pattern2"],
          "insights": ["insight1", "insight2"],
          "opportunities": ["opportunity1", "opportunity2"],
          "risks": ["risk1", "risk2"],
          "recommendations": ["rec1", "rec2"],
          "knowledgeGaps": ["gap1", "gap2"],
          "expertiseDistribution": "analysis of expertise across teams"
        }
      `
    };

    try {
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompts[synthesisType] }]
      });

      const synthesis = this.parseAIResponse(response.response);

      // Validate synthesis against schema
      const validation = await validateAIResponseSchema(synthesis, synthesisType);
      if (!validation.valid) {
        console.warn('⚠️ Synthesis validation failed:', validation.errors);
      }

      return synthesis;

    } catch (error) {
      console.error('AI synthesis failed:', error);
      throw new Error(`AI synthesis failed: ${error.message}`);
    }
  }

  /**
   * Fetch project data from ChittyChat
   */
  async fetchProjectData(projectId, timeRange) {
    // Implementation would fetch from ChittyChat API
    return {
      projectId: projectId,
      conversations: [],
      messages: [],
      participants: [],
      documents: [],
      timeRange: timeRange
    };
  }

  /**
   * Extract key conversations based on importance
   */
  async extractKeyConversations(projectData) {
    const conversations = projectData.conversations || [];

    // Score conversations by importance
    const scoredConversations = await Promise.all(
      conversations.map(async (conv) => {
        const score = await this.scoreConversationImportance(conv);
        return { ...conv, importanceScore: score };
      })
    );

    // Return top conversations
    return scoredConversations
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, 10);
  }

  /**
   * Score conversation importance
   */
  async scoreConversationImportance(conversation) {
    let score = 0;

    // Participant count
    score += (conversation.participants?.length || 0) * 0.1;

    // Message count
    score += (conversation.messages?.length || 0) * 0.05;

    // Keywords that indicate importance
    const importantKeywords = [
      'decision', 'urgent', 'important', 'critical', 'deadline',
      'action', 'next steps', 'milestone', 'blocker', 'issue'
    ];

    const content = conversation.messages?.map(m => m.content).join(' ').toLowerCase() || '';
    importantKeywords.forEach(keyword => {
      if (content.includes(keyword)) score += 0.2;
    });

    // Recent conversations get higher scores
    const age = Date.now() - new Date(conversation.timestamp).getTime();
    const ageDays = age / (1000 * 60 * 60 * 24);
    score += Math.max(0, 1 - ageDays / 7); // Higher score for conversations within a week

    return score;
  }

  /**
   * Generate actionable recommendations
   */
  async generateRecommendations(synthesis) {
    const prompt = `
      Based on this project synthesis, generate specific actionable recommendations:

      SYNTHESIS: ${JSON.stringify(synthesis)}

      Provide recommendations in JSON format:
      {
        "immediate": ["urgent actions needed now"],
        "shortTerm": ["actions for next 1-2 weeks"],
        "longTerm": ["strategic actions for next month+"],
        "communication": ["communication improvements needed"],
        "process": ["process improvements suggested"],
        "risk_mitigation": ["actions to address identified risks"]
      }
    `;

    try {
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }]
      });

      return this.parseAIResponse(response.response);

    } catch (error) {
      console.error('Recommendation generation failed:', error);
      return {
        immediate: [],
        shortTerm: [],
        longTerm: [],
        communication: [],
        process: [],
        risk_mitigation: []
      };
    }
  }

  /**
   * Calculate project metrics
   */
  async calculateProjectMetrics(projectData) {
    return {
      totalMessages: projectData.messages?.length || 0,
      totalConversations: projectData.conversations?.length || 0,
      activeParticipants: projectData.participants?.filter(p => p.active).length || 0,
      responseTime: this.calculateAverageResponseTime(projectData.messages || []),
      engagementScore: this.calculateEngagementScore(projectData),
      collaborationIndex: this.calculateCollaborationIndex(projectData),
      topicDiversity: this.calculateTopicDiversity(projectData)
    };
  }

  /**
   * Parse AI response with error handling
   */
  parseAIResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { raw_response: response };
    } catch (error) {
      return {
        parse_error: true,
        raw_response: response,
        error: error.message
      };
    }
  }

  /**
   * Calculate average response time
   */
  calculateAverageResponseTime(messages) {
    if (messages.length < 2) return 0;

    let totalTime = 0;
    let responseCount = 0;

    for (let i = 1; i < messages.length; i++) {
      const prevTime = new Date(messages[i-1].timestamp);
      const currTime = new Date(messages[i].timestamp);
      const diff = currTime - prevTime;

      if (diff < 24 * 60 * 60 * 1000) { // Within 24 hours
        totalTime += diff;
        responseCount++;
      }
    }

    return responseCount > 0 ? totalTime / responseCount : 0;
  }

  /**
   * Calculate engagement score
   */
  calculateEngagementScore(projectData) {
    const messages = projectData.messages || [];
    const participants = projectData.participants || [];

    if (participants.length === 0) return 0;

    const messagesPerParticipant = messages.length / participants.length;
    const activeParticipants = participants.filter(p => p.lastActive &&
      Date.now() - new Date(p.lastActive).getTime() < 7 * 24 * 60 * 60 * 1000
    ).length;

    return Math.min(1, (messagesPerParticipant / 10) * (activeParticipants / participants.length));
  }

  /**
   * Calculate collaboration index
   */
  calculateCollaborationIndex(projectData) {
    // Implementation would analyze cross-participant interactions
    return 0.75; // Placeholder
  }

  /**
   * Calculate topic diversity
   */
  calculateTopicDiversity(projectData) {
    // Implementation would analyze topic distribution
    return 0.65; // Placeholder
  }
}

/**
 * Synthesis API endpoints
 */
export class SynthesisEndpoints {
  constructor(env) {
    this.synth = new ChittyChatProjectSynth(env);
  }

  /**
   * Handle synthesis requests
   */
  async handleSynthesisRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/synthesis/project' && request.method === 'POST') {
        const { projectId, timeRange } = await request.json();
        const result = await this.synth.synthesizeProjectInsights(projectId, timeRange);

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path === '/synthesis/topics' && request.method === 'POST') {
        const { topics, projectIds, timeRange } = await request.json();
        const result = await this.synth.synthesizeTopicTrends(topics, projectIds, timeRange);

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path === '/synthesis/conversation' && request.method === 'POST') {
        const { conversationId, context } = await request.json();
        const result = await this.synth.synthesizeConversation(conversationId, context);

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path === '/synthesis/knowledge' && request.method === 'POST') {
        const { organizationId, domains } = await request.json();
        const result = await this.synth.synthesizeCrossProjectKnowledge(organizationId, domains);

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Synthesis endpoint not found', { status: 404 });

    } catch (error) {
      return new Response(JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}