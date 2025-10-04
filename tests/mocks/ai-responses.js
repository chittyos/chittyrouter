/**
 * Mock AI Responses for Testing
 * Provides realistic AI responses without making actual API calls
 */

export class MockAI {
  constructor() {
    this.responses = new Map();
    this.callCount = 0;
    this.setupDefaultResponses();
  }

  setupDefaultResponses() {
    // Mock comprehensive AI analysis responses
    this.responses.set('analysis_lawsuit', {
      response: JSON.stringify({
        category: "lawsuit",
        priority: "HIGH",
        urgency_score: 0.85,
        case_related: true,
        case_pattern: "SMITH_v_JONES",
        legal_entities: ["Smith", "Jones", "ABC Law Firm"],
        action_required: "immediate",
        routing_recommendation: "case-management@example.com",
        auto_response_needed: true,
        key_topics: ["personal injury", "settlement", "discovery"],
        sentiment: "urgent",
        compliance_flags: ["deadline_pending"],
        reasoning: "High-priority lawsuit communication requiring immediate attention"
      })
    });

    this.responses.set('analysis_document_submission', {
      response: JSON.stringify({
        category: "document_submission",
        priority: "NORMAL",
        urgency_score: 0.4,
        case_related: true,
        case_pattern: "ARIAS_v_BIANCHI",
        legal_entities: ["Arias", "Bianchi"],
        action_required: "acknowledgment",
        routing_recommendation: "documents@example.com",
        auto_response_needed: true,
        key_topics: ["evidence", "discovery", "filing"],
        sentiment: "neutral",
        compliance_flags: [],
        reasoning: "Standard document submission requiring processing and acknowledgment"
      })
    });

    this.responses.set('analysis_emergency', {
      response: JSON.stringify({
        category: "emergency",
        priority: "CRITICAL",
        urgency_score: 0.95,
        case_related: true,
        case_pattern: "DOE_v_COMPANY",
        legal_entities: ["John Doe", "Big Company Inc"],
        action_required: "immediate",
        routing_recommendation: "emergency@example.com",
        auto_response_needed: false,
        key_topics: ["court order", "injunction", "deadline"],
        sentiment: "urgent",
        compliance_flags: ["court_deadline", "immediate_response"],
        reasoning: "Critical emergency requiring immediate legal attention"
      })
    });

    this.responses.set('analysis_inquiry', {
      response: JSON.stringify({
        category: "inquiry",
        priority: "LOW",
        urgency_score: 0.2,
        case_related: false,
        case_pattern: null,
        legal_entities: [],
        action_required: "acknowledgment",
        routing_recommendation: "intake@example.com",
        auto_response_needed: true,
        key_topics: ["consultation", "general inquiry"],
        sentiment: "neutral",
        compliance_flags: [],
        reasoning: "General inquiry requiring standard response"
      })
    });

    // Mock routing decision responses
    this.responses.set('routing_lawsuit', {
      response: JSON.stringify({
        primary_route: "case-management@example.com",
        cc_routes: ["partners@example.com"],
        priority_queue: "high",
        estimated_response_time: "2 hours",
        special_handling: ["urgent_review", "partner_notification"],
        reasoning: "Active litigation requires case management team with partner oversight"
      })
    });

    this.responses.set('routing_emergency', {
      response: JSON.stringify({
        primary_route: "emergency@example.com",
        cc_routes: ["partners@example.com", "case-management@example.com"],
        priority_queue: "immediate",
        estimated_response_time: "30 minutes",
        special_handling: ["immediate_escalation", "after_hours_alert"],
        reasoning: "Emergency situation requiring immediate attention and escalation"
      })
    });

    this.responses.set('routing_documents', {
      response: JSON.stringify({
        primary_route: "documents@example.com",
        cc_routes: [],
        priority_queue: "normal",
        estimated_response_time: "4 hours",
        special_handling: ["document_verification"],
        reasoning: "Document submission follows standard processing workflow"
      })
    });

    // Mock auto-response generation
    this.responses.set('response_lawsuit', {
      response: "Thank you for your communication regarding the Smith v. Jones matter. We have received your message and assigned it ChittyID [CHITTY_ID]. Your case manager will respond within 2 hours. For urgent matters, please call our emergency line at (555) 123-4567.\n\nBest regards,\nLegal Team"
    });

    this.responses.set('response_document', {
      response: "We have received your document submission for the Arias v. Bianchi case. Your submission has been assigned ChittyID [CHITTY_ID] and will be processed within 4 hours. You will receive a confirmation once the documents have been reviewed and filed.\n\nThank you,\nDocument Processing Team"
    });

    this.responses.set('response_general', {
      response: "Thank you for contacting our law firm. We have received your inquiry and assigned it ChittyID [CHITTY_ID]. A member of our intake team will review your message and respond within 24 hours. For urgent legal matters, please call (555) 123-4567.\n\nBest regards,\nIntake Team"
    });

    // Mock document analysis responses
    this.responses.set('document_analysis_contract', {
      response: JSON.stringify({
        category: "contract",
        importance: "high",
        requires_attention: true,
        case_relevance: "direct",
        compliance_requirements: ["signature_verification", "date_validation"]
      })
    });

    this.responses.set('document_analysis_evidence', {
      response: JSON.stringify({
        category: "evidence",
        importance: "critical",
        requires_attention: true,
        case_relevance: "direct",
        compliance_requirements: ["chain_of_custody", "authentication"]
      })
    });

    // Mock case pattern extraction
    this.responses.set('case_pattern_lawsuit', {
      response: JSON.stringify({
        has_case_pattern: true,
        pattern_type: "lawsuit",
        extracted_pattern: "SMITH_v_JONES",
        case_number: "2024D007847",
        confidence: 0.95
      })
    });

    this.responses.set('case_pattern_none', {
      response: JSON.stringify({
        has_case_pattern: false,
        pattern_type: "none",
        extracted_pattern: null,
        case_number: null,
        confidence: 0.1
      })
    });

    // Health check response
    this.responses.set('health_check', {
      response: "AI system operational"
    });

    // Agent orchestrator responses
    this.responses.set('agent_legal_analysis', {
      response: "Based on the case documentation, this appears to be a personal injury matter with strong liability factors. The opposing party's insurance coverage is adequate. Recommend proceeding with settlement negotiations while preparing for potential litigation. Key evidence includes medical records, witness statements, and expert accident reconstruction. Timeline suggests resolution within 6-9 months."
    });

    this.responses.set('agent_document_processing', {
      response: "Document classification complete. Identified: 3 medical records (critical), 2 witness statements (high importance), 1 police report (high importance), 4 correspondence items (normal). All documents properly formatted and ready for case file integration. No compliance issues detected."
    });

    this.responses.set('agent_timeline_building', {
      response: "Chronological analysis complete. Key dates: Incident (2024-01-15), Medical treatment (2024-01-15 to 2024-03-20), Insurance claim filed (2024-02-01), Legal representation retained (2024-03-25), Discovery period (2024-04-01 to 2024-07-01), Mediation scheduled (2024-08-15). No statute of limitations concerns."
    });
  }

  /**
   * Mock AI run method
   */
  async run(model, options) {
    this.callCount++;

    // Extract the user message content
    const userMessage = options.messages?.find(m => m.role === 'user')?.content || '';

    // Determine response type based on content
    const responseKey = this.determineResponseType(userMessage);
    const response = this.responses.get(responseKey) || this.getDefaultResponse();

    // Add some realistic delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    return response;
  }

  /**
   * Determine which mock response to use based on input
   */
  determineResponseType(content) {
    const lowerContent = content.toLowerCase();

    // Analysis requests
    if (lowerContent.includes('analyze this email')) {
      if (lowerContent.includes('lawsuit') || lowerContent.includes('litigation')) {
        return 'analysis_lawsuit';
      }
      if (lowerContent.includes('emergency') || lowerContent.includes('critical')) {
        return 'analysis_emergency';
      }
      if (lowerContent.includes('document') || lowerContent.includes('submission')) {
        return 'analysis_document_submission';
      }
      return 'analysis_inquiry';
    }

    // Routing requests
    if (lowerContent.includes('routing')) {
      if (lowerContent.includes('lawsuit') || lowerContent.includes('litigation')) {
        return 'routing_lawsuit';
      }
      if (lowerContent.includes('emergency')) {
        return 'routing_emergency';
      }
      return 'routing_documents';
    }

    // Response generation
    if (lowerContent.includes('generate') && lowerContent.includes('response')) {
      if (lowerContent.includes('lawsuit')) {
        return 'response_lawsuit';
      }
      if (lowerContent.includes('document')) {
        return 'response_document';
      }
      return 'response_general';
    }

    // Document analysis
    if (lowerContent.includes('document attachment')) {
      if (lowerContent.includes('contract')) {
        return 'document_analysis_contract';
      }
      return 'document_analysis_evidence';
    }

    // Case pattern extraction
    if (lowerContent.includes('case information') || lowerContent.includes('case pattern')) {
      if (lowerContent.includes('smith-v-jones') || lowerContent.includes('plaintiff-v-defendant')) {
        return 'case_pattern_lawsuit';
      }
      return 'case_pattern_none';
    }

    // Agent responses
    if (lowerContent.includes('legal analysis specialist')) {
      return 'agent_legal_analysis';
    }
    if (lowerContent.includes('document processing specialist')) {
      return 'agent_document_processing';
    }
    if (lowerContent.includes('timeline specialist')) {
      return 'agent_timeline_building';
    }

    // Health check
    if (lowerContent.includes('test ai health')) {
      return 'health_check';
    }

    return 'analysis_inquiry'; // Default fallback
  }

  /**
   * Get default response for unmatched requests
   */
  getDefaultResponse() {
    return {
      response: JSON.stringify({
        category: "inquiry",
        priority: "NORMAL",
        urgency_score: 0.5,
        case_related: false,
        case_pattern: null,
        legal_entities: [],
        action_required: "acknowledgment",
        routing_recommendation: "intake@example.com",
        auto_response_needed: false,
        key_topics: ["general"],
        sentiment: "neutral",
        compliance_flags: [],
        reasoning: "Mock AI response - content not matched to specific pattern"
      })
    };
  }

  /**
   * Add custom response for testing
   */
  addMockResponse(key, response) {
    this.responses.set(key, response);
  }

  /**
   * Get call statistics
   */
  getStats() {
    return {
      totalCalls: this.callCount,
      availableResponses: this.responses.size,
      responses: Array.from(this.responses.keys())
    };
  }

  /**
   * Reset call counter
   */
  reset() {
    this.callCount = 0;
  }

  /**
   * Simulate AI failure for testing error handling
   */
  async runWithFailure() {
    await new Promise(resolve => setTimeout(resolve, 100));
    throw new Error('Mock AI failure for testing');
  }
}

// Export singleton instance
export const mockAI = new MockAI();