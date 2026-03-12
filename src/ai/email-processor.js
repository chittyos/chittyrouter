/**
 * AI Email Processor - Intelligent Email Processing Pipeline
 * Replaces traditional email workers with AI-powered processing
 */

import { ChittyRouterAI } from './intelligent-router.js';
import { ChittyIDValidator } from '../chittyid/chittyid-validator.js';
import { storeInChittyChain } from '../utils/storage.js';
import { ServiceDiscovery } from '../utils/service-discovery.js';
import { generateEmailChittyID } from '../utils/chittyid-generator.js';

export class EmailProcessor {
  constructor(ai, env) {
    this.ai = ai;
    this.env = env;
    this.router = new ChittyRouterAI(ai, env);
    this.serviceDiscovery = null;
    this.endpoints = {};
  }

  /**
   * Process email via Agents SDK pipeline (triage → priority → response).
   * Called from the /ai/process-email HTTP endpoint.
   *
   * @param {{ subject: string, from: string, content: string, to?: string, channel?: string, metadata?: object }} body
   * @returns {Promise<object>}
   */
  async processEmail(body) {
    const { subject, from, content, to, channel, metadata } = body;

    // Step 1: Triage — classify via TriageAgent
    const triageResult = await this.callAgent("TRIAGE_AGENT", "/classify", {
      sender: from,
      subject,
      content,
      channel: channel || "email",
      metadata,
    });

    // Step 2: Priority — score via PriorityAgent
    const priorityResult = await this.callAgent("PRIORITY_AGENT", "/score", {
      sender: from,
      subject,
      content,
      category: triageResult.category,
      org: triageResult.org,
      triageConfidence: triageResult.confidence,
    });

    // Step 3: Response — draft via ResponseAgent
    const responseResult = await this.callAgent("RESPONSE_AGENT", "/draft", {
      emailData: { subject, from, content, to },
      triageResult: { category: triageResult.category },
      priorityResult: { level: priorityResult.level },
      org: triageResult.org,
    });

    return {
      success: true,
      pipeline: "agents-sdk",
      triage: {
        org: triageResult.org,
        category: triageResult.category,
        confidence: triageResult.confidence,
        fallback: triageResult.fallback,
      },
      priority: {
        level: priorityResult.level,
        score: priorityResult.score,
        escalated: priorityResult.escalated,
        fallback: priorityResult.fallback,
      },
      response: {
        shouldRespond: responseResult.shouldRespond,
        subject: responseResult.subject,
        body: responseResult.body,
        responseType: responseResult.responseType,
        fallback: responseResult.fallback,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Call an Agents SDK Durable Object via its HTTP interface.
   * Reuses the same stub initialization pattern as unified-worker delegateToAgent.
   */
  async callAgent(bindingName, path, body) {
    const binding = this.env[bindingName];
    if (!binding) {
      throw new Error(`Agent binding ${bindingName} not available`);
    }

    const id = binding.idFromName(bindingName);
    const stub = binding.get(id);

    // Initialize agent name via partyserver protocol
    const setupReq = new Request("http://dummy-example.cloudflare.com/cdn-cgi/partyserver/set-name/");
    setupReq.headers.set("x-partykit-room", bindingName);
    await stub.fetch(setupReq).then((r) => r.text());

    const resp = await stub.fetch(new Request(`https://agent${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`${bindingName} ${path} failed (${resp.status}): ${text.slice(0, 200)}`);
    }

    return resp.json();
  }

  /**
   * Initialize service discovery for email processing
   */
  async initializeServiceDiscovery() {
    if (!this.serviceDiscovery) {
      this.serviceDiscovery = new ServiceDiscovery(this.env);
      await this.serviceDiscovery.initialize();
      await this.discoverEmailEndpoints();
      console.log('📧 Email processor service discovery initialized');
    }
  }

  /**
   * Discover email-related service endpoints
   */
  async discoverEmailEndpoints() {
    try {
      // Discover intake endpoint
      const intakeEndpoint = await this.serviceDiscovery.getEndpointForCapability('email_intake', 'chitty-intake');
      if (intakeEndpoint) {
        this.endpoints.intake = intakeEndpoint;
      } else {
        this.endpoints.intake = 'intake@example.com';
      }

      // Discover emergency endpoint
      const emergencyEndpoint = await this.serviceDiscovery.getEndpointForCapability('emergency_routing', 'chitty-emergency');
      if (emergencyEndpoint) {
        this.endpoints.emergency = emergencyEndpoint;
      } else {
        this.endpoints.emergency = 'emergency@example.com';
      }

      // Discover ChittyChat endpoint for thread creation
      const chittychatEndpoint = await this.serviceDiscovery.getEndpointForCapability('project_collaboration', 'chittychat');
      if (chittychatEndpoint) {
        this.endpoints.chittychat = `${chittychatEndpoint}/api`;
      }

      // Discover Evidence Vault for document storage
      const evidenceEndpoint = await this.serviceDiscovery.getEndpointForCapability('document_storage', 'evidence-vault');
      if (evidenceEndpoint) {
        this.endpoints.evidence = `${evidenceEndpoint}/api`;
      }

      console.log('📧 Discovered email endpoints:', this.endpoints);

    } catch (error) {
      console.warn('⚠️ Failed to discover email endpoints:', error.message);
      // Use fallback endpoints
      this.endpoints = {
        intake: 'intake@example.com',
        emergency: 'emergency@example.com'
      };
    }
  }

  /**
   * Process incoming email with full AI pipeline
   * Replaces traditional email worker logic
   */
  async processIncomingEmail(message, ctx) {
    console.log('📧 AI processing incoming email from:', message.from);

    try {
      // Initialize service discovery
      await this.initializeServiceDiscovery();

      // Convert email message to structured data
      const emailData = await this.extractEmailData(message);

      // AI-powered processing pipeline
      const routingResult = await this.router.intelligentRoute(emailData);

      // Execute AI-determined actions
      await this.executeRoutingActions(message, routingResult);

      // Send AI-generated response if needed
      if (routingResult.ai.response?.should_respond) {
        await this.sendAIResponse(message, routingResult.ai.response);
      }

      // Forward to determined routes
      await this.forwardToRoutes(message, routingResult.ai.routing);

      console.log('✅ AI email processing completed:', routingResult.chittyId);

      return {
        success: true,
        chittyId: routingResult.chittyId,
        ai_processed: true,
        routing: routingResult.ai.routing,
        actions_taken: routingResult.actions
      };

    } catch (error) {
      console.error('❌ AI email processing failed:', error);
      return await this.fallbackProcessing(message, error);
    }
  }

  /**
   * Extract structured data from email message
   */
  async extractEmailData(message) {
    const subject = message.headers.get('subject') || '';
    const from = message.from || '';
    const to = message.to || '';

    // Convert email content to text
    const content = await this.streamToText(message.raw);

    // Process attachments
    const attachments = await this.processAttachments(message);

    // Extract case patterns using AI
    const casePattern = await this.extractCasePattern(to, subject, content);

    return {
      from,
      to,
      subject,
      content,
      attachments,
      casePattern,
      timestamp: new Date().toISOString(),
      messageId: message.headers.get('message-id') || `ai-${Date.now()}`
    };
  }

  /**
   * AI-powered case pattern extraction
   */
  async extractCasePattern(to, subject, content) {
    const prompt = `
    Extract legal case information from this email:

    To: ${to}
    Subject: ${subject}
    Content preview: ${content.substring(0, 300)}

    Look for:
    - Case patterns like "plaintiff-v-defendant"
    - Case numbers
    - Matter references
    - Court case identifiers

    Respond with JSON:
    {
      "has_case_pattern": true|false,
      "pattern_type": "lawsuit|case_number|matter|none",
      "extracted_pattern": "PLAINTIFF_v_DEFENDANT",
      "case_number": "2024D007847",
      "confidence": 0.95
    }
    `;

    try {
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }]
      });

      const parsed = this.parseAIResponse(response.response);
      return parsed.has_case_pattern ? parsed : null;

    } catch (error) {
      console.error('Case pattern extraction failed:', error);
      return this.fallbackCaseExtraction(to, subject);
    }
  }

  /**
   * Execute actions determined by AI routing
   */
  async executeRoutingActions(message, routingResult) {
    for (const action of routingResult.actions) {
      try {
        switch (action.type) {
          case 'ROUTE_EMAIL':
            console.log(`📤 Routing to: ${action.destination}`);
            break;

          case 'GENERATE_CHITTYID':
            console.log(`🆔 ChittyID generated: ${routingResult.chittyId}`);
            break;

          case 'CREATE_CHITTY_THREAD':
            await this.createChittyThread(routingResult, message);
            break;

          case 'ESCALATE':
            await this.escalateMessage(message, action);
            break;

          case 'SEND_AUTO_RESPONSE':
            console.log('📨 Auto-response will be sent');
            break;

          default:
            console.log(`⚠️ Unknown action type: ${action.type}`);
        }
      } catch (error) {
        console.error(`Failed to execute action ${action.type}:`, error);
      }
    }
  }

  /**
   * Send AI-generated response
   */
  async sendAIResponse(message, response) {
    try {
      await message.reply({
        subject: response.subject,
        text: response.body + '\n\n---\nThis response was generated by ChittyRouter AI Gateway'
      });

      console.log('✅ AI response sent');
    } catch (error) {
      console.error('Failed to send AI response:', error);
    }
  }

  /**
   * Forward email to AI-determined routes using discovered endpoints
   */
  async forwardToRoutes(message, routing) {
    try {
      // Primary route
      if (routing.primary_route) {
        await message.forward(routing.primary_route);
        console.log(`📧 Forwarded to primary: ${routing.primary_route}`);
      }

      // CC routes
      if (routing.cc_routes) {
        for (const ccRoute of routing.cc_routes) {
          await message.forward(ccRoute);
          console.log(`📧 CC'd to: ${ccRoute}`);
        }
      }
    } catch (error) {
      console.error('Failed to forward email:', error);
      // Fallback to discovered intake endpoint
      const fallbackEndpoint = this.endpoints.intake || 'intake@example.com';
      await message.forward(fallbackEndpoint);
      console.log(`📧 Fallback to: ${fallbackEndpoint}`);
    }
  }

  /**
   * Create ChittyChat thread for case communications
   */
  async createChittyThread(routingResult, message) {
    const threadData = {
      chittyId: routingResult.chittyId,
      casePattern: routingResult.ai.analysis.case_pattern,
      participants: [message.from, 'legal-team'],
      type: 'EMAIL_INTAKE',
      priority: routingResult.ai.analysis.priority,
      timestamp: new Date().toISOString()
    };

    try {
      await storeInChittyChain(threadData);
      console.log('💬 ChittyChat thread created');
    } catch (error) {
      console.error('Failed to create ChittyChat thread:', error);
    }
  }

  /**
   * Escalate urgent messages
   */
  async escalateMessage(message, action) {
    const escalationData = {
      type: 'URGENT_EMAIL_ESCALATION',
      from: message.from,
      subject: message.headers.get('subject'),
      level: action.level,
      timestamp: new Date().toISOString()
    };

    try {
      // Send to discovered emergency route
      const emergencyEndpoint = this.endpoints.emergency || 'emergency@example.com';
      await message.forward(emergencyEndpoint);

      // Log escalation
      await storeInChittyChain(escalationData);

      console.log(`🚨 Message escalated to: ${emergencyEndpoint}`);
    } catch (error) {
      console.error('Failed to escalate message:', error);
    }
  }

  /**
   * Process email attachments with AI
   */
  async processAttachments(message) {
    const attachments = [];

    try {
      for (const attachment of message.attachments || []) {
        const chittyId = await generateEmailChittyID({
          from: message.from,
          filename: attachment.name
        });

        attachments.push({
          name: attachment.name,
          size: attachment.size,
          type: attachment.type,
          chittyId,
          processed: true
        });
      }
    } catch (error) {
      console.error('Attachment processing failed:', error);
    }

    return attachments;
  }

  /**
   * Convert ReadableStream to text
   */
  async streamToText(readableStream) {
    const reader = readableStream.getReader();
    let result = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += new TextDecoder().decode(value);
      }
    } finally {
      reader.releaseLock();
    }

    return result;
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
   * Fallback case extraction when AI fails
   */
  fallbackCaseExtraction(to, subject) {
    // Traditional regex patterns as fallback
    const lawsuitPattern = to.match(/([a-zA-Z-]+)-v-([a-zA-Z-]+)@/);
    if (lawsuitPattern) {
      const [, plaintiff, defendant] = lawsuitPattern;
      return {
        has_case_pattern: true,
        pattern_type: 'lawsuit',
        extracted_pattern: `${plaintiff.toUpperCase()}_v_${defendant.toUpperCase()}`,
        confidence: 0.8,
        fallback: true
      };
    }

    return null;
  }

  /**
   * Fallback processing when AI completely fails
   */
  async fallbackProcessing(message, error) {
    console.log('🔄 Using fallback email processing');

    try {
      // Initialize service discovery if not already done
      if (!this.serviceDiscovery) {
        await this.initializeServiceDiscovery();
      }

      // Basic forwarding to discovered intake endpoint
      const intakeEndpoint = this.endpoints.intake || 'intake@example.com';
      await message.forward(intakeEndpoint);

      // Send basic acknowledgment
      await message.reply({
        subject: `Re: ${message.headers.get('subject')}`,
        text: 'Your email has been received and will be reviewed by our team.\n\nThank you,\nLegal Team'
      });

      return {
        success: true,
        fallback: true,
        error: error.message,
        routing: { primary_route: intakeEndpoint }
      };

    } catch (fallbackError) {
      console.error('Even fallback processing failed:', fallbackError);
      return {
        success: false,
        error: fallbackError.message,
        fallback_failed: true
      };
    }
  }
}