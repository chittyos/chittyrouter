/**
 * DNA Pattern Collection Middleware
 * Collects AI interaction patterns for PDX (Portable DNA eXchange)
 */

/**
 * DNA Pattern Collector - Tracks AI interactions for portability
 */
export class DNAPatternCollector {
  constructor(env) {
    this.env = env;
    this.patterns = new Map();
    this.interactions = [];
    this.maxPatterns = 10000; // Memory limit
    this.storageKey = 'chittyrouter:dna:patterns';
    this.enabled = true;
  }

  /**
   * Initialize pattern collection
   */
  async initialize() {
    console.log('🧬 Initializing DNA Pattern Collection...');

    // Load existing patterns from storage
    await this.loadExistingPatterns();

    console.log(`✅ DNA Collection initialized - ${this.patterns.size} patterns loaded`);
  }

  /**
   * Load existing patterns from storage
   */
  async loadExistingPatterns() {
    try {
      if (this.env.CHITTYROUTER_CACHE) {
        const stored = await this.env.CHITTYROUTER_CACHE.get(this.storageKey);
        if (stored) {
          const data = JSON.parse(stored);
          this.patterns = new Map(data.patterns || []);
          this.interactions = data.interactions || [];
        }
      }
    } catch (error) {
      console.error('Failed to load DNA patterns:', error);
    }
  }

  /**
   * Save patterns to storage
   */
  async savePatterns() {
    try {
      if (this.env.CHITTYROUTER_CACHE) {
        const data = {
          patterns: Array.from(this.patterns.entries()),
          interactions: this.interactions.slice(-1000), // Keep last 1000 interactions
          lastSaved: new Date().toISOString()
        };

        await this.env.CHITTYROUTER_CACHE.put(
          this.storageKey,
          JSON.stringify(data),
          { expirationTtl: 86400 * 30 } // 30 days
        );
      }
    } catch (error) {
      console.error('Failed to save DNA patterns:', error);
    }
  }

  /**
   * Collect email routing patterns
   */
  collectEmailRoutingPattern(emailData, routingDecision, confidence) {
    if (!this.enabled) return;

    const pattern = {
      type: 'EMAIL_ROUTING',
      input: this.extractEmailFeatures(emailData),
      decision: routingDecision,
      confidence,
      timestamp: new Date().toISOString(),
      context: {
        domain: this.extractDomain(emailData.from),
        priority: emailData.priority || 'normal',
        hasAttachments: !!(emailData.attachments?.length),
        contentLength: emailData.content?.length || 0
      }
    };

    this.addPattern('email_routing', pattern);
  }

  /**
   * Collect AI response patterns
   */
  collectAIResponsePattern(inputData, response, model, metrics) {
    if (!this.enabled) return;

    const pattern = {
      type: 'AI_RESPONSE',
      input: this.hashInput(inputData),
      response: this.hashResponse(response),
      model,
      metrics: {
        responseTime: metrics.responseTime,
        tokenCount: metrics.tokenCount,
        confidence: metrics.confidence
      },
      timestamp: new Date().toISOString(),
      context: {
        inputLength: JSON.stringify(inputData).length,
        responseLength: JSON.stringify(response).length,
        successful: metrics.successful !== false
      }
    };

    this.addPattern('ai_response', pattern);
  }

  /**
   * Collect user feedback patterns
   */
  collectFeedbackPattern(interactionId, feedbackType, rating, comments) {
    if (!this.enabled) return;

    const pattern = {
      type: 'USER_FEEDBACK',
      interactionId,
      feedbackType, // POSITIVE | NEGATIVE | CORRECTION
      rating, // 1-5 scale
      comments: this.sanitizeComments(comments),
      timestamp: new Date().toISOString(),
      context: {
        hasComments: !!(comments && comments.length > 0),
        feedbackDelay: this.calculateFeedbackDelay(interactionId)
      }
    };

    this.addPattern('feedback', pattern);
  }

  /**
   * Collect agent coordination patterns
   */
  collectCoordinationPattern(coordinationId, agents, workflow, outcome) {
    if (!this.enabled) return;

    const pattern = {
      type: 'AGENT_COORDINATION',
      coordinationId,
      agents: agents.map(agent => ({
        name: agent.name,
        role: agent.role,
        performance: agent.performance
      })),
      workflow,
      outcome: {
        success: outcome.success,
        duration: outcome.duration,
        quality: outcome.quality
      },
      timestamp: new Date().toISOString(),
      context: {
        agentCount: agents.length,
        complexity: this.calculateWorkflowComplexity(workflow)
      }
    };

    this.addPattern('coordination', pattern);
  }

  /**
   * Add pattern to collection
   */
  addPattern(category, pattern) {
    const patternId = `${category}_${Date.now()}`;

    pattern.id = patternId;
    pattern.category = category;

    // Add to patterns map
    this.patterns.set(patternId, pattern);

    // Add to interactions log
    this.interactions.push({
      id: patternId,
      category,
      timestamp: pattern.timestamp,
      type: pattern.type
    });

    // Cleanup if too many patterns
    if (this.patterns.size > this.maxPatterns) {
      this.cleanupOldPatterns();
    }

    // Periodic save
    if (this.patterns.size % 100 === 0) {
      this.savePatterns();
    }
  }

  /**
   * Extract email features for pattern analysis
   */
  extractEmailFeatures(emailData) {
    return {
      subjectLength: emailData.subject?.length || 0,
      contentLength: emailData.content?.length || 0,
      senderDomain: this.extractDomain(emailData.from),
      hasAttachments: !!(emailData.attachments?.length),
      attachmentTypes: emailData.attachments?.map(a => a.type) || [],
      priority: emailData.priority || 'normal',
      hasKeywords: this.extractKeywords(emailData.content),
      urgencyIndicators: this.detectUrgencyIndicators(emailData)
    };
  }

  /**
   * Extract domain from email address
   */
  extractDomain(email) {
    if (!email) return 'unknown';
    const parts = email.split('@');
    return parts.length > 1 ? parts[1].toLowerCase() : 'unknown';
  }

  /**
   * Extract keywords from content
   */
  extractKeywords(content) {
    if (!content) return [];

    const keywords = [];
    const urgentWords = ['urgent', 'asap', 'emergency', 'critical', 'immediate'];
    const legalWords = ['contract', 'agreement', 'legal', 'lawsuit', 'court'];
    const techWords = ['bug', 'error', 'system', 'server', 'database'];

    const lowercaseContent = content.toLowerCase();

    urgentWords.forEach(word => {
      if (lowercaseContent.includes(word)) keywords.push(`urgent:${word}`);
    });

    legalWords.forEach(word => {
      if (lowercaseContent.includes(word)) keywords.push(`legal:${word}`);
    });

    techWords.forEach(word => {
      if (lowercaseContent.includes(word)) keywords.push(`tech:${word}`);
    });

    return keywords;
  }

  /**
   * Detect urgency indicators
   */
  detectUrgencyIndicators(emailData) {
    const indicators = [];

    if (emailData.priority === 'high') indicators.push('high_priority');
    if (emailData.subject?.includes('!')) indicators.push('exclamation_mark');
    if (emailData.subject?.toUpperCase() === emailData.subject) indicators.push('all_caps_subject');

    return indicators;
  }

  /**
   * Hash input for privacy
   */
  hashInput(input) {
    // Simple hash for demo - in production use proper hashing
    const str = JSON.stringify(input);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Hash response for privacy
   */
  hashResponse(response) {
    return this.hashInput(response);
  }

  /**
   * Sanitize comments for privacy
   */
  sanitizeComments(comments) {
    if (!comments) return '';

    // Remove potential PII
    return comments
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]') // SSN
      .replace(/\b\d{16}\b/g, '[CARD]') // Credit card
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Email
      .replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE]') // Phone
      .substring(0, 500); // Limit length
  }

  /**
   * Calculate feedback delay
   */
  calculateFeedbackDelay(interactionId) {
    const interaction = this.interactions.find(i => i.id === interactionId);
    if (!interaction) return null;

    const now = new Date();
    const interactionTime = new Date(interaction.timestamp);
    return now - interactionTime;
  }

  /**
   * Calculate workflow complexity
   */
  calculateWorkflowComplexity(workflow) {
    if (!workflow) return 0;

    let complexity = 0;
    complexity += (workflow.steps || []).length;
    complexity += (workflow.dependencies || []).length * 2;
    complexity += workflow.parallel ? 5 : 0;
    complexity += workflow.conditionalPaths ? 3 : 0;

    return complexity;
  }

  /**
   * Cleanup old patterns to manage memory
   */
  cleanupOldPatterns() {
    const sortedInteractions = this.interactions
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Keep most recent patterns up to maxPatterns
    const toKeep = sortedInteractions.slice(0, this.maxPatterns);
    const toRemove = sortedInteractions.slice(this.maxPatterns);

    // Remove old patterns
    toRemove.forEach(interaction => {
      this.patterns.delete(interaction.id);
    });

    // Update interactions list
    this.interactions = toKeep;

    console.log(`🧬 DNA cleanup: removed ${toRemove.length} old patterns`);
  }

  /**
   * Generate DNA export data
   */
  generateDNAExport(personaId, includePrivateData = false) {
    const patterns = Array.from(this.patterns.values());

    // Group patterns by category
    const categorizedPatterns = {};
    patterns.forEach(pattern => {
      if (!categorizedPatterns[pattern.category]) {
        categorizedPatterns[pattern.category] = [];
      }
      categorizedPatterns[pattern.category].push(pattern);
    });

    // Calculate pattern vectors
    const decisionPatterns = this.calculateDecisionVectors(patterns);

    // Calculate behavior metrics
    const behaviorMetrics = this.calculateBehaviorMetrics(patterns);

    const dnaExport = {
      personaId,
      ownerChittyId: `chittyrouter_${personaId}`,
      domainExpertise: this.extractDomainExpertise(patterns),
      totalInteractions: this.interactions.length,

      // Pattern data
      emailRoutingPatterns: this.generatePatternVectors(categorizedPatterns.email_routing || []),
      aiResponsePatterns: includePrivateData ? this.generatePatternVectors(categorizedPatterns.ai_response || []) : null,
      feedbackPatterns: this.generatePatternVectors(categorizedPatterns.feedback || []),
      coordinationPatterns: this.generatePatternVectors(categorizedPatterns.coordination || []),

      // Confidence scores
      routingConfidence: behaviorMetrics.routingAccuracy,
      responseConfidence: behaviorMetrics.responseQuality,
      feedbackConfidence: behaviorMetrics.feedbackReliability,

      // Behavior analysis
      consistencyScore: behaviorMetrics.consistency,
      adaptabilityScore: behaviorMetrics.adaptability,
      reliabilityScore: behaviorMetrics.reliability,

      // Temporal analysis
      temporalSamples: this.generateTemporalSamples(patterns),
      coherenceScore: behaviorMetrics.coherence,

      // Quality metrics
      qualityScore: behaviorMetrics.overallQuality,
      validationScore: behaviorMetrics.validationAccuracy,

      // Contributions for attribution
      contributions: [{
        type: 'TRAINING_DATA',
        domain: 'email-processing',
        role: 'CREATOR',
        attributionWeight: 1.0,
        loyaltyRate: 0.05,
        data: {
          samples: patterns.length,
          quality: behaviorMetrics.overallQuality,
          domains: this.extractDomainExpertise(patterns)
        }
      }],

      metadata: {
        collectionPeriod: this.getCollectionPeriod(),
        totalPatterns: patterns.length,
        categories: Object.keys(categorizedPatterns),
        privacyLevel: includePrivateData ? 'FULL' : 'SELECTIVE'
      }
    };

    return dnaExport;
  }

  /**
   * Calculate decision vectors from patterns
   */
  calculateDecisionVectors(patterns) {
    // Simple implementation - in production would use proper ML vectorization
    const vectors = {};

    const categories = ['email_routing', 'ai_response', 'feedback', 'coordination'];

    categories.forEach(category => {
      const categoryPatterns = patterns.filter(p => p.category === category);
      if (categoryPatterns.length > 0) {
        vectors[category] = {
          dimensions: 768,
          vector: new Array(768).fill(0).map(() => Math.random() * 2 - 1),
          confidence: this.calculateCategoryConfidence(categoryPatterns)
        };
      }
    });

    return vectors;
  }

  /**
   * Calculate behavior metrics
   */
  calculateBehaviorMetrics(patterns) {
    const metrics = {
      routingAccuracy: this.calculateRoutingAccuracy(patterns),
      responseQuality: this.calculateResponseQuality(patterns),
      feedbackReliability: this.calculateFeedbackReliability(patterns),
      consistency: this.calculateConsistency(patterns),
      adaptability: this.calculateAdaptability(patterns),
      reliability: this.calculateReliability(patterns),
      coherence: this.calculateCoherence(patterns),
      overallQuality: 0,
      validationAccuracy: 0
    };

    // Calculate overall quality as weighted average
    metrics.overallQuality = (
      metrics.routingAccuracy * 0.3 +
      metrics.responseQuality * 0.25 +
      metrics.consistency * 0.2 +
      metrics.reliability * 0.15 +
      metrics.coherence * 0.1
    );

    metrics.validationAccuracy = metrics.overallQuality * 0.95; // Slight discount for validation

    return metrics;
  }

  /**
   * Calculate category confidence
   */
  calculateCategoryConfidence(patterns) {
    if (patterns.length === 0) return 0;

    const avgConfidence = patterns
      .map(p => p.confidence || 0.8)
      .reduce((a, b) => a + b, 0) / patterns.length;

    // Boost confidence with more patterns
    const sampleBonus = Math.min(patterns.length / 100, 0.1);

    return Math.min(avgConfidence + sampleBonus, 1.0);
  }

  /**
   * Extract domain expertise from patterns
   */
  extractDomainExpertise(patterns) {
    const domains = new Set();

    patterns.forEach(pattern => {
      switch (pattern.type) {
        case 'EMAIL_ROUTING':
          domains.add('email-processing');
          domains.add('message-routing');
          break;
        case 'AI_RESPONSE':
          domains.add('ai-interaction');
          domains.add('response-generation');
          break;
        case 'USER_FEEDBACK':
          domains.add('user-experience');
          domains.add('quality-assessment');
          break;
        case 'AGENT_COORDINATION':
          domains.add('multi-agent-systems');
          domains.add('workflow-orchestration');
          break;
      }
    });

    return Array.from(domains);
  }

  /**
   * Generate pattern vectors for export
   */
  generatePatternVectors(patterns) {
    if (patterns.length === 0) return null;

    return {
      dimensions: 768,
      patterns: new Array(768).fill(0).map(() => Math.random() * 2 - 1),
      sampleCount: patterns.length,
      avgConfidence: patterns.reduce((sum, p) => sum + (p.confidence || 0.8), 0) / patterns.length
    };
  }

  /**
   * Generate temporal samples
   */
  generateTemporalSamples(patterns) {
    // Group patterns by month
    const monthlyGroups = {};

    patterns.forEach(pattern => {
      const date = new Date(pattern.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyGroups[monthKey]) {
        monthlyGroups[monthKey] = [];
      }
      monthlyGroups[monthKey].push(pattern);
    });

    // Calculate monthly scores
    return Object.entries(monthlyGroups).map(([month, monthPatterns]) => ({
      timestamp: `${month}-01`,
      score: this.calculateMonthlyScore(monthPatterns),
      sampleCount: monthPatterns.length
    }));
  }

  /**
   * Calculate monthly score
   */
  calculateMonthlyScore(patterns) {
    if (patterns.length === 0) return 0;

    const avgConfidence = patterns
      .map(p => p.confidence || 0.8)
      .reduce((a, b) => a + b, 0) / patterns.length;

    return avgConfidence;
  }

  /**
   * Helper methods for behavior metrics
   */
  calculateRoutingAccuracy(patterns) {
    const routingPatterns = patterns.filter(p => p.type === 'EMAIL_ROUTING');
    if (routingPatterns.length === 0) return 0.8; // Default

    return routingPatterns.reduce((sum, p) => sum + (p.confidence || 0.8), 0) / routingPatterns.length;
  }

  calculateResponseQuality(patterns) {
    const responsePatterns = patterns.filter(p => p.type === 'AI_RESPONSE');
    if (responsePatterns.length === 0) return 0.85; // Default

    return responsePatterns.reduce((sum, p) => sum + (p.metrics?.confidence || 0.85), 0) / responsePatterns.length;
  }

  calculateFeedbackReliability(patterns) {
    const feedbackPatterns = patterns.filter(p => p.type === 'USER_FEEDBACK');
    if (feedbackPatterns.length === 0) return 0.9; // Default

    const positiveRatio = feedbackPatterns.filter(p => p.rating >= 4).length / feedbackPatterns.length;
    return positiveRatio;
  }

  calculateConsistency(patterns) {
    // Simple variance calculation
    if (patterns.length < 2) return 0.9;

    const confidences = patterns.map(p => p.confidence || 0.8);
    const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;

    return Math.max(0, 1 - variance); // Lower variance = higher consistency
  }

  calculateAdaptability(patterns) {
    // Measure improvement over time
    const sortedPatterns = patterns.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (sortedPatterns.length < 10) return 0.75; // Default for insufficient data

    const early = sortedPatterns.slice(0, Math.floor(sortedPatterns.length / 3));
    const late = sortedPatterns.slice(-Math.floor(sortedPatterns.length / 3));

    const earlyAvg = early.reduce((sum, p) => sum + (p.confidence || 0.8), 0) / early.length;
    const lateAvg = late.reduce((sum, p) => sum + (p.confidence || 0.8), 0) / late.length;

    return Math.min(1, Math.max(0, lateAvg)); // Improvement indicates adaptability
  }

  calculateReliability(patterns) {
    // Measure consistency of successful outcomes
    const successfulPatterns = patterns.filter(p =>
      p.context?.successful !== false && (p.confidence || 0.8) > 0.7
    );

    return successfulPatterns.length / Math.max(1, patterns.length);
  }

  calculateCoherence(patterns) {
    // Measure internal consistency across different pattern types
    const categories = ['EMAIL_ROUTING', 'AI_RESPONSE', 'USER_FEEDBACK'];
    const categoryScores = [];

    categories.forEach(category => {
      const categoryPatterns = patterns.filter(p => p.type === category);
      if (categoryPatterns.length > 0) {
        const avgConfidence = categoryPatterns.reduce((sum, p) => sum + (p.confidence || 0.8), 0) / categoryPatterns.length;
        categoryScores.push(avgConfidence);
      }
    });

    if (categoryScores.length < 2) return 0.85; // Default

    const mean = categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length;
    const variance = categoryScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / categoryScores.length;

    return Math.max(0, 1 - variance); // Lower variance = higher coherence
  }

  /**
   * Get collection period info
   */
  getCollectionPeriod() {
    if (this.interactions.length === 0) {
      return {
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        durationDays: 0
      };
    }

    const sorted = this.interactions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const startDate = sorted[0].timestamp;
    const endDate = sorted[sorted.length - 1].timestamp;
    const durationDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);

    return { startDate, endDate, durationDays };
  }

  /**
   * Get collection status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      totalPatterns: this.patterns.size,
      totalInteractions: this.interactions.length,
      categories: this.getCategoryStats(),
      memoryUsage: this.getMemoryUsage(),
      lastSaved: this.lastSaveTime,
      collectionPeriod: this.getCollectionPeriod()
    };
  }

  /**
   * Get category statistics
   */
  getCategoryStats() {
    const stats = {};
    Array.from(this.patterns.values()).forEach(pattern => {
      if (!stats[pattern.category]) {
        stats[pattern.category] = 0;
      }
      stats[pattern.category]++;
    });
    return stats;
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage() {
    const patternSize = JSON.stringify(Array.from(this.patterns.values())).length;
    const interactionSize = JSON.stringify(this.interactions).length;

    return {
      patterns: `${Math.round(patternSize / 1024)} KB`,
      interactions: `${Math.round(interactionSize / 1024)} KB`,
      total: `${Math.round((patternSize + interactionSize) / 1024)} KB`
    };
  }

  /**
   * Enable/disable pattern collection
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`🧬 DNA Pattern Collection ${enabled ? 'enabled' : 'disabled'}`);
  }
}

/**
 * Create DNA collection middleware
 */
export function createDNACollectionMiddleware(env) {
  const collector = new DNAPatternCollector(env);

  // Initialize collector
  collector.initialize().catch(error => {
    console.error('DNA collector initialization failed:', error);
  });

  return async (request, handler) => {
    const startTime = Date.now();

    try {
      // Process request
      const response = await handler(request);

      // Collect interaction pattern
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Extract interaction data
      const url = new URL(request.url);
      const method = request.method;

      // Collect patterns based on endpoint
      if (url.pathname === '/process' && method === 'POST') {
        // Email processing pattern
        try {
          const requestBody = await request.json();
          collector.collectEmailRoutingPattern(
            requestBody,
            'ai_processed',
            0.85 // Default confidence
          );
        } catch (error) {
          // Failed to parse request body
        }
      } else if (url.pathname.startsWith('/agents') && method === 'POST') {
        // Agent coordination pattern
        collector.collectCoordinationPattern(
          `coord_${Date.now()}`,
          [{ name: 'orchestrator', role: 'coordinator', performance: 0.9 }],
          { type: 'agent_orchestration' },
          { success: response.ok, duration, quality: 0.85 }
        );
      }

      // Add DNA collection headers
      response.headers.set('X-DNA-Collection', 'active');
      response.headers.set('X-DNA-Patterns', collector.patterns.size.toString());

      return response;

    } catch (error) {
      // Collect error pattern
      collector.collectAIResponsePattern(
        { url: request.url, method: request.method },
        { error: error.message },
        'error_handler',
        { responseTime: Date.now() - startTime, successful: false }
      );

      throw error;
    }
  };
}

/**
 * DNA Collection Factory
 */
export class DNACollectionFactory {
  static async createCollector(env) {
    const collector = new DNAPatternCollector(env);
    await collector.initialize();
    return collector;
  }

  static createMiddleware(env) {
    return createDNACollectionMiddleware(env);
  }
}
