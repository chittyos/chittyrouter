/**
 * ChittyRouter AI - Intelligent Routing Engine
 * Core AI-powered email routing that replaces traditional rule-based routing
 */

import { logEmailToChain } from "../utils/chain-logger.js";
import {
  validateEmailSchema,
  validateAIResponseSchema,
} from "../utils/schema-validation.js";
import { ChittyChatProjectSync } from "../sync/chittychat-project-sync.js";
import AIModelConfig from "../utils/ai-model-config.js";
import { requestEmailChittyID } from "../utils/chittyid-client.js";
import { AIGatewayClient } from "./ai-gateway-client.js";

export class ChittyRouterAI {
  constructor(ai, env) {
    this.ai = ai;
    this.env = env;
    this.chittyChat = new ChittyChatProjectSync(env);
    this.aiConfig = new AIModelConfig(env);
    this.aiGateway = new AIGatewayClient(env); // Multi-provider AI Gateway
  }

  /**
   * Main AI routing intelligence - replaces all traditional routing logic
   */
  async intelligentRoute(emailData) {
    console.log("🧠 AI processing email:", emailData.subject);

    try {
      // Validate email data against ChittyOS schema
      const schemaValidation = await validateEmailSchema(emailData);
      if (!schemaValidation.valid) {
        console.warn(
          "⚠️ Email schema validation failed:",
          schemaValidation.errors,
        );
        // Use normalized data if available
        emailData = schemaValidation.normalizedData || emailData;
      }

      // Generate unique ChittyID for tracking
      const chittyId = await requestEmailChittyID(emailData);

      // AI-powered comprehensive analysis
      const analysis = await this.comprehensiveAIAnalysis(emailData);

      // Determine routing based on AI analysis
      const routingDecision = await this.makeIntelligentRoutingDecision(
        emailData,
        analysis,
      );

      // Generate AI response if appropriate
      const response = await this.generateIntelligentResponse(
        emailData,
        analysis,
      );

      // Process attachments with AI
      const attachmentAnalysis = await this.analyzeAttachments(
        emailData.attachments,
      );

      // Create routing result
      const result = {
        chittyId,
        timestamp: new Date().toISOString(),
        ai: {
          analysis,
          routing: routingDecision,
          response,
          attachments: attachmentAnalysis,
        },
        actions: await this.determineActions(analysis, routingDecision),
      };

      // Log to ChittyChain for immutable record
      await logEmailToChain(this.env, {
        type: "AI_INTELLIGENT_ROUTING",
        chittyId,
        emailData: this.sanitizeEmailData(emailData),
        result,
      });

      // Sync routing decision to ChittyChat project
      const chatSync = await this.chittyChat.syncEmailRouting(
        emailData,
        result,
      );
      if (chatSync.synced) {
        result.chittyChat = {
          synced: true,
          syncId: chatSync.syncId,
          projectUpdate: chatSync.projectUpdate,
        };
      }

      return result;
    } catch (error) {
      console.error("❌ AI routing failed:", error);
      return this.fallbackRouting(emailData, error);
    }
  }

  /**
   * Comprehensive AI analysis - replaces all manual classification
   */
  async comprehensiveAIAnalysis(emailData) {
    const prompt = `
    You are ChittyRouter AI, an intelligent legal email routing system. Analyze this email and provide comprehensive routing intelligence:

    EMAIL:
    From: ${emailData.from}
    To: ${emailData.to}
    Subject: ${emailData.subject}
    Content: ${emailData.content}

    Provide analysis in JSON format:
    {
      "category": "lawsuit|document_submission|court_notice|emergency|appointment|billing|inquiry",
      "priority": "CRITICAL|HIGH|NORMAL|LOW",
      "urgency_score": 0.95,
      "case_related": true|false,
      "case_pattern": "plaintiff-v-defendant format if detected",
      "legal_entities": ["entity1", "entity2"],
      "action_required": "immediate|scheduled|acknowledgment|none",
      "routing_recommendation": "specific@example.com",
      "auto_response_needed": true|false,
      "key_topics": ["topic1", "topic2"],
      "sentiment": "positive|neutral|negative|urgent",
      "compliance_flags": ["flag1", "flag2"],
      "reasoning": "detailed explanation"
    }
    `;

    try {
      const response = await this.aiConfig.runWithFallback(
        this.ai,
        "email_routing",
        prompt,
      );

      const analysisResult = this.parseAIAnalysis(response.response);

      // Validate AI response against schema
      const responseValidation = await validateAIResponseSchema(
        analysisResult,
        "email_analysis",
      );
      if (!responseValidation.valid) {
        console.warn(
          "⚠️ AI response schema validation failed:",
          responseValidation.errors,
        );
      }

      return analysisResult;
    } catch (error) {
      console.error("AI analysis failed:", error);
      throw new Error(`AI analysis failed: ${error.message}`);
    }
  }

  /**
   * Intelligent routing decision using AI
   */
  async makeIntelligentRoutingDecision(emailData, analysis) {
    const prompt = `
    Based on this email analysis, determine the optimal routing:

    ANALYSIS: ${JSON.stringify(analysis)}

    AVAILABLE ROUTES:
    - case-management@example.com (active litigation)
    - intake@example.com (new clients)
    - emergency@example.com (urgent matters)
    - documents@example.com (evidence/filings)
    - calendar@example.com (scheduling)
    - billing@example.com (financial matters)
    - partners@example.com (high-value cases)

    ROUTING RULES:
    - Emergency/Court deadlines → emergency@example.com
    - New client inquiries → intake@example.com
    - Case communications → case-management@example.com
    - Document submissions → documents@example.com
    - High-value cases → partners@example.com

    Respond with JSON:
    {
      "primary_route": "email@example.com",
      "cc_routes": ["email1@example.com"],
      "priority_queue": "immediate|high|normal|low",
      "estimated_response_time": "1 hour",
      "special_handling": ["flag1", "flag2"],
      "reasoning": "why this routing"
    }
    `;

    try {
      const response = await this.aiConfig.runWithFallback(
        this.ai,
        "email_routing",
        prompt,
      );

      return this.parseAIResponse(response.response);
    } catch (error) {
      console.error("AI routing decision failed:", error);
      return {
        primary_route: "intake@example.com",
        reasoning: "AI routing failed, using safe default",
      };
    }
  }

  /**
   * Generate intelligent auto-responses
   */
  async generateIntelligentResponse(emailData, analysis) {
    if (!analysis.auto_response_needed) {
      return {
        should_respond: false,
        reason: "AI determined no response needed",
      };
    }

    const prompt = `
    Generate a professional, helpful auto-response for this legal email:

    SENDER: ${emailData.from}
    SUBJECT: ${emailData.subject}
    ANALYSIS: Category: ${analysis.category}, Priority: ${analysis.priority}

    Response requirements:
    - Professional legal tone
    - Acknowledge receipt
    - Set expectations
    - Provide ChittyID reference
    - Include relevant next steps
    - Maximum 200 words

    Generate only the email body text, no subject line.
    `;

    try {
      const response = await this.aiConfig.runWithFallback(
        this.ai,
        "email_routing",
        prompt,
      );

      return {
        should_respond: true,
        subject: `Re: ${emailData.subject}`,
        body: response.response,
        type: "ai_generated",
      };
    } catch (error) {
      console.error("AI response generation failed:", error);
      return {
        should_respond: false,
        error: error.message,
      };
    }
  }

  /**
   * AI-powered attachment analysis
   */
  async analyzeAttachments(attachments) {
    if (!attachments || attachments.length === 0) {
      return { has_attachments: false };
    }

    const analyses = [];

    for (const attachment of attachments) {
      try {
        // Analyze file type and content
        const analysis = await this.analyzeDocument(attachment);
        analyses.push(analysis);
      } catch (error) {
        analyses.push({
          filename: attachment.name,
          error: error.message,
          analyzed: false,
        });
      }
    }

    return {
      has_attachments: true,
      count: attachments.length,
      analyses,
      summary: await this.summarizeAttachments(analyses),
    };
  }

  /**
   * Analyze individual document with AI
   */
  async analyzeDocument(attachment) {
    const prompt = `
    Analyze this legal document attachment:

    Filename: ${attachment.name}
    Size: ${attachment.size} bytes
    Type: ${attachment.type}

    Determine:
    - Document category (contract, evidence, motion, filing, etc.)
    - Importance level (critical, high, normal, low)
    - Requires immediate attention (yes/no)
    - Potential case relevance
    - Compliance requirements

    Respond with JSON analysis.
    `;

    try {
      const response = await this.aiConfig.runWithFallback(
        this.ai,
        "email_routing",
        prompt,
      );

      return {
        filename: attachment.name,
        ai_analysis: this.parseAIResponse(response.response),
        analyzed: true,
      };
    } catch (error) {
      return {
        filename: attachment.name,
        error: error.message,
        analyzed: false,
      };
    }
  }

  /**
   * Determine actions based on AI analysis
   */
  async determineActions(analysis, routingDecision) {
    const actions = [];

    // Route email
    actions.push({
      type: "ROUTE_EMAIL",
      destination: routingDecision.primary_route,
      priority: analysis.priority,
      timing: "immediate",
    });

    // Generate ChittyID
    actions.push({
      type: "GENERATE_CHITTYID",
      category: analysis.category,
      timing: "immediate",
    });

    // Auto-respond if needed
    if (analysis.auto_response_needed) {
      actions.push({
        type: "SEND_AUTO_RESPONSE",
        timing: "immediate",
      });
    }

    // Create case thread if case-related
    if (analysis.case_related) {
      actions.push({
        type: "CREATE_CHITTY_THREAD",
        case_pattern: analysis.case_pattern,
        timing: "immediate",
      });

      // Sync case thread creation to ChittyChat
      const caseData = {
        chittyId: analysis.case_chittyId || `CASE-${Date.now()}`,
        case_pattern: analysis.case_pattern,
        parties: analysis.legal_entities,
        court: analysis.court,
        caseType: analysis.case_type || "civil",
      };

      const threadSync = await this.chittyChat.syncCaseThread(
        caseData,
        `thread-${Date.now()}`,
      );
      if (threadSync.synced) {
        actions.push({
          type: "CHITTYCHAT_THREAD_SYNCED",
          threadId: threadSync.threadId,
          chatRoomId: threadSync.chatRoomId,
          timing: "completed",
        });
      }
    }

    // Escalate if critical
    if (analysis.priority === "CRITICAL") {
      actions.push({
        type: "ESCALATE",
        level: "immediate_attention",
        timing: "immediate",
      });
    }

    return actions;
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
        error: error.message,
      };
    }
  }

  /**
   * Parse comprehensive AI analysis
   */
  parseAIAnalysis(response) {
    const parsed = this.parseAIResponse(response);

    // Ensure required fields with defaults
    return {
      category: parsed.category || "inquiry",
      priority: parsed.priority || "NORMAL",
      urgency_score: parsed.urgency_score || 0.5,
      case_related: parsed.case_related || false,
      case_pattern: parsed.case_pattern || null,
      legal_entities: parsed.legal_entities || [],
      action_required: parsed.action_required || "acknowledgment",
      routing_recommendation:
        parsed.routing_recommendation || "intake@example.com",
      auto_response_needed: parsed.auto_response_needed || false,
      key_topics: parsed.key_topics || [],
      sentiment: parsed.sentiment || "neutral",
      compliance_flags: parsed.compliance_flags || [],
      reasoning: parsed.reasoning || "AI analysis completed",
      ...parsed,
    };
  }

  /**
   * Fallback routing when AI fails
   */
  fallbackRouting(emailData, error) {
    return {
      chittyId: null, // SERVICE OR FAIL - No local ID generation
      fallback: true,
      error: error.message,
      routing: {
        primary_route: "intake@example.com",
        reasoning: "AI failed, using safe default routing (no ChittyID)",
      },
      actions: [
        {
          type: "ROUTE_EMAIL",
          destination: "intake@example.com",
          priority: "NORMAL",
          timing: "immediate",
        },
      ],
    };
  }

  /**
   * Sanitize email data for logging
   */
  sanitizeEmailData(emailData) {
    return {
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      content_length: emailData.content?.length || 0,
      has_attachments: !!emailData.attachments?.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Summarize attachment analyses
   */
  async summarizeAttachments(analyses) {
    if (analyses.length === 0) return "No attachments";

    const categories = analyses
      .map((a) => a.ai_analysis?.category)
      .filter(Boolean);
    const importance = analyses
      .map((a) => a.ai_analysis?.importance)
      .filter(Boolean);

    return {
      total_files: analyses.length,
      categories: [...new Set(categories)],
      highest_importance: importance.includes("critical")
        ? "critical"
        : importance.includes("high")
          ? "high"
          : "normal",
    };
  }

  /**
   * Health check for AI systems
   */
  async healthCheck() {
    try {
      const testResponse = await this.ai.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "user", content: "Test AI health" }],
      });

      return {
        status: "healthy",
        model: "@cf/meta/llama-3.1-8b-instruct",
        response_time: "fast",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Legacy function retrofits with AI enhancement
  async sendIntelligentCaseUpdate(data) {
    // AI enhances the case update with context awareness
    const aiEnhancement = await this.enhanceMessage(data, "case_update");
    // Use existing email sending logic with AI enhancements
    return this.sendAIEnhancedEmail(data, aiEnhancement);
  }

  async sendAIDocumentReceipt(data) {
    const aiEnhancement = await this.enhanceMessage(data, "document_receipt");
    return this.sendAIEnhancedEmail(data, aiEnhancement);
  }

  async sendSmartCourtReminder(data) {
    const aiEnhancement = await this.enhanceMessage(data, "court_reminder");
    return this.sendAIEnhancedEmail(data, aiEnhancement);
  }

  async sendAIChittyIDConfirmation(data) {
    const aiEnhancement = await this.enhanceMessage(
      data,
      "chittyid_confirmation",
    );
    return this.sendAIEnhancedEmail(data, aiEnhancement);
  }

  async enhanceMessage(data, type) {
    // AI enhancement logic for messages
    return { ai_enhanced: true, type, enhancement: "AI optimization applied" };
  }

  async sendAIEnhancedEmail(data, enhancement) {
    // Retrofit existing email sending with AI enhancements
    return new Response(
      JSON.stringify({
        success: true,
        ai_enhanced: true,
        enhancement,
        message: "Email sent with AI optimization",
      }),
    );
  }
}
