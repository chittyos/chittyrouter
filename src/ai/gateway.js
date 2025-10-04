#!/usr/bin/env node

/**
 * ChittyRouter AI Gateway
 * Intelligent routing and processing with AI agents
 */

import { Ai } from '@cloudflare/ai';
import { intelligentTriage } from './triage-agent.js';
import { autoResponder } from './response-agent.js';
import { documentAnalyzer } from './document-agent.js';
import { priorityClassifier } from './priority-agent.js';
import { ChittyIDValidator } from '../chittyid/chittyid-validator.js';
import { logEmailToChain } from '../utils/chain-logger.js';

export class ChittyRouterAIGateway {
  constructor(env) {
    this.ai = new Ai(env.AI);
    this.env = env;
  }

  /**
   * Main AI Gateway Processing Pipeline
   * Orchestrates all AI agents for intelligent email handling
   */
  async processEmail(emailData) {
    const validator = new ChittyIDValidator(this.env);
    const result = await validator.generateChittyID({
      type: 'email',
      title: emailData.subject || 'Email',
      hash: await this.hashEmail(emailData)
    });
    const chittyId = result.chittyId;

    console.log(`🤖 AI Gateway processing email: ${chittyId}`);

    try {
      // Step 1: Intelligent Triage - Determine case type and urgency
      const triageResult = await intelligentTriage(this.ai, emailData);

      // Step 2: Priority Classification - AI-powered priority assessment
      const priority = await priorityClassifier(this.ai, emailData, triageResult);

      // Step 3: Document Analysis - Process attachments with AI
      const documentAnalysis = await this.analyzeAttachments(emailData.attachments);

      // Step 4: Route Decision - AI-enhanced routing logic
      const routingDecision = await this.makeRoutingDecision(emailData, triageResult, priority);

      // Step 5: Auto-Response - Generate intelligent responses if appropriate
      const autoResponse = await this.generateAutoResponse(emailData, triageResult);

      // Compile AI processing results
      const aiResults = {
        chittyId,
        triage: triageResult,
        priority,
        documentAnalysis,
        routing: routingDecision,
        autoResponse,
        timestamp: new Date().toISOString(),
        aiVersion: '1.0.0'
      };

      // Log AI processing to ChittyChain
      await logEmailToChain(this.env, {
        type: 'AI_GATEWAY_PROCESSING',
        chittyId,
        results: aiResults
      });

      return aiResults;

    } catch (error) {
      console.error('❌ AI Gateway processing failed:', error);

      // Fallback to traditional routing
      return {
        chittyId,
        fallback: true,
        error: error.message,
        routing: { destination: 'intake@example.com', reason: 'AI_FALLBACK' }
      };
    }
  }

  /**
   * AI-Enhanced Routing Decision
   * Uses multiple AI signals to determine optimal routing
   */
  async makeRoutingDecision(emailData, triageResult, priority) {
    const prompt = `
    Analyze this legal email and determine the best routing:

    From: ${emailData.from}
    To: ${emailData.to}
    Subject: ${emailData.subject}
    Content Preview: ${emailData.content.substring(0, 500)}...

    Triage Classification: ${triageResult.category}
    Priority Level: ${priority.level}
    Confidence: ${triageResult.confidence}

    Available Routes:
    - case-management@example.com (active cases)
    - intake@example.com (new clients)
    - emergency@example.com (urgent matters)
    - documents@example.com (document submissions)
    - calendar@example.com (scheduling)

    Provide routing recommendation with reasoning.
    `;

    try {
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }]
      });

      return {
        destination: this.extractDestination(response.response),
        reasoning: response.response,
        confidence: this.calculateConfidence(response.response),
        aiGenerated: true
      };

    } catch (error) {
      console.error('AI routing decision failed:', error);
      return {
        destination: 'intake@example.com',
        reasoning: 'AI routing failed, using default',
        confidence: 0.1,
        aiGenerated: false
      };
    }
  }

  /**
   * Analyze email attachments with AI
   */
  async analyzeAttachments(attachments) {
    if (!attachments || attachments.length === 0) {
      return { hasAttachments: false };
    }

    const analyses = [];

    for (const attachment of attachments) {
      try {
        const analysis = await documentAnalyzer(this.ai, attachment);
        analyses.push({
          filename: attachment.name,
          analysis,
          chittyId: attachment.chittyId
        });
      } catch (error) {
        console.error(`Failed to analyze ${attachment.name}:`, error);
        analyses.push({
          filename: attachment.name,
          error: error.message,
          chittyId: attachment.chittyId
        });
      }
    }

    return {
      hasAttachments: true,
      count: attachments.length,
      analyses
    };
  }

  /**
   * Generate intelligent auto-responses
   */
  async generateAutoResponse(emailData, triageResult) {
    // Only auto-respond to certain categories
    const autoResponseCategories = [
      'document_submission',
      'appointment_request',
      'general_inquiry'
    ];

    if (!autoResponseCategories.includes(triageResult.category)) {
      return { shouldRespond: false, reason: 'Category not suitable for auto-response' };
    }

    try {
      const response = await autoResponder(this.ai, emailData, triageResult);
      return {
        shouldRespond: true,
        response,
        category: triageResult.category
      };
    } catch (error) {
      console.error('Auto-response generation failed:', error);
      return {
        shouldRespond: false,
        error: error.message
      };
    }
  }

  /**
   * Extract destination email from AI response
   */
  extractDestination(aiResponse) {
    const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
    const match = aiResponse.match(emailPattern);
    return match ? match[1] : 'intake@example.com';
  }

  /**
   * Calculate confidence score from AI response
   */
  calculateConfidence(aiResponse) {
    // Look for confidence indicators in the response
    const confidencePatterns = [
      /confidence[:\s]+(\d+)%/i,
      /certain[ly]*[:\s]+(\d+)%/i,
      /sure[:\s]+(\d+)%/i
    ];

    for (const pattern of confidencePatterns) {
      const match = aiResponse.match(pattern);
      if (match) {
        return parseInt(match[1]) / 100;
      }
    }

    // Default confidence based on response length and certainty words
    const certaintyWords = ['definitely', 'clearly', 'obviously', 'certainly'];
    const uncertaintyWords = ['maybe', 'possibly', 'might', 'could'];

    let confidence = 0.7; // base confidence

    certaintyWords.forEach(word => {
      if (aiResponse.toLowerCase().includes(word)) confidence += 0.1;
    });

    uncertaintyWords.forEach(word => {
      if (aiResponse.toLowerCase().includes(word)) confidence -= 0.1;
    });

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Health check for AI services
   */
  async healthCheck() {
    try {
      const testResponse = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: 'Test message' }]
      });

      return {
        aiWorker: 'healthy',
        model: '@cf/meta/llama-3.1-8b-instruct',
        timestamp: new Date().toISOString(),
        testResponse: testResponse.response?.substring(0, 100) || 'No response'
      };
    } catch (error) {
      return {
        aiWorker: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async hashEmail(emailData) {
    const crypto = globalThis.crypto || require('crypto');
    const data = JSON.stringify({
      from: emailData.from,
      subject: emailData.subject,
      date: emailData.date
    });
    if (crypto.subtle) {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      return crypto.createHash('sha256').update(data).digest('hex');
    }
  }
}

// Middleware for AI Gateway integration
export async function aiGatewayMiddleware(request, env, ctx) {
  const gateway = new ChittyRouterAIGateway(env);

  // Extract email data from request
  const emailData = await request.json();

  // Process through AI Gateway
  const aiResults = await gateway.processEmail(emailData);

  // Add AI results to context for downstream processing
  ctx.aiResults = aiResults;

  return aiResults;
}

console.log('🤖 ChittyRouter AI Gateway initialized');
console.log('🧠 Intelligent triage enabled');
console.log('📊 Priority classification active');
console.log('📄 Document analysis ready');
console.log('🎯 Auto-response system loaded');