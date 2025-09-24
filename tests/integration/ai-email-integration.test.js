/**
 * Integration Tests for ChittyRouter AI Email Processing
 * Tests the complete AI pipeline from email intake to routing decisions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChittyRouterAI } from '../../src/ai/intelligent-router.js';
import { EmailProcessor } from '../../src/ai/email-processor.js';
import { AgentOrchestrator } from '../../src/ai/agent-orchestrator.js';
import { intelligentTriage } from '../../src/ai/triage-agent.js';
import { priorityClassifier } from '../../src/ai/priority-agent.js';
import { autoResponder } from '../../src/ai/response-agent.js';
import { documentAnalyzer } from '../../src/ai/document-agent.js';

// Mock Cloudflare AI
const mockAI = {
  run: vi.fn().mockImplementation(async (model, options) => {
    // Simulate AI responses based on input
    const prompt = options.messages?.[0]?.content || '';

    if (prompt.includes('Classify this legal email')) {
      return {
        response: JSON.stringify({
          category: 'lawsuit_communication',
          confidence: 0.95,
          keywords: ['case', 'legal', 'matter'],
          urgency_indicators: ['court date'],
          reasoning: 'Email contains legal case references'
        })
      };
    }

    if (prompt.includes('Determine the priority level')) {
      return {
        response: JSON.stringify({
          level: 'HIGH',
          score: 0.9,
          factors: ['court deadline', 'legal matter'],
          reasoning: 'High priority due to court-related content'
        })
      };
    }

    if (prompt.includes('Generate a professional auto-response')) {
      return {
        response: 'Thank you for your legal communication. We have received your message and will respond within 24 hours. Your reference ID will be provided shortly.\n\nBest regards,\nLegal Team'
      };
    }

    if (prompt.includes('Analyze this legal document')) {
      return {
        response: JSON.stringify({
          document_type: 'contract',
          importance: 'high',
          compliance_flags: ['confidential'],
          contains_pii: false,
          requires_review: true,
          processing_priority: 'immediate',
          estimated_pages: 5,
          keywords: ['agreement', 'terms'],
          reasoning: 'Contract document requiring legal review'
        })
      };
    }

    if (prompt.includes('comprehensive routing intelligence')) {
      return {
        response: JSON.stringify({
          category: 'lawsuit',
          priority: 'HIGH',
          urgency_score: 0.9,
          case_related: true,
          case_pattern: 'SMITH_v_JONES',
          legal_entities: ['Smith Legal', 'Jones Corp'],
          action_required: 'immediate',
          routing_recommendation: 'case-management@example.com',
          auto_response_needed: true,
          key_topics: ['court hearing', 'motion filing'],
          sentiment: 'urgent',
          compliance_flags: ['time_sensitive'],
          reasoning: 'High priority legal matter requiring immediate attention'
        })
      };
    }

    return { response: 'AI processing completed' };
  })
};

// Mock environment
const mockEnv = {
  AI: mockAI,
  AI_STATE_DO: {
    idFromName: vi.fn().mockReturnValue('test-id'),
    get: vi.fn().mockReturnValue({
      fetch: vi.fn().mockResolvedValue(new Response('{"success": true}'))
    })
  }
};

describe('AI Email Integration Tests', () => {
  let router;
  let processor;
  let orchestrator;

  beforeEach(() => {
    router = new ChittyRouterAI(mockAI, mockEnv);
    processor = new EmailProcessor(mockAI, mockEnv);
    orchestrator = new AgentOrchestrator(mockAI, mockEnv);
    vi.clearAllMocks();
  });

  describe('Complete Email Processing Pipeline', () => {
    it('should process a legal case email end-to-end', async () => {
      const emailData = {
        from: 'client@example.com',
        to: 'smith-v-jones@example.com',
        subject: 'Urgent: Court hearing scheduled for tomorrow',
        content: 'We need to discuss the motion filing for the court hearing scheduled for tomorrow morning. Please confirm receipt.',
        attachments: [{
          name: 'motion-filing.pdf',
          size: 1024000,
          type: 'application/pdf'
        }],
        timestamp: new Date().toISOString(),
        messageId: 'test-message-123'
      };

      const result = await router.intelligentRoute(emailData);

      expect(result).toBeDefined();
      expect(result.chittyId).toMatch(/^CE-[a-f0-9]{8}-EMAIL-\d+$/);
      expect(result.ai.analysis.category).toBe('lawsuit');
      expect(result.ai.analysis.priority).toBe('HIGH');
      expect(result.ai.analysis.case_related).toBe(true);
      expect(result.ai.routing.primary_route).toBe('case-management@example.com');
      expect(result.actions).toContainEqual(
        expect.objectContaining({
          type: 'ROUTE_EMAIL',
          destination: 'case-management@example.com'
        })
      );
    });

    it('should handle document submission emails', async () => {
      const emailData = {
        from: 'client@lawfirm.com',
        to: 'documents@example.com',
        subject: 'Document submission for case ABC123',
        content: 'Please find attached the contract documents for review.',
        attachments: [{
          name: 'contract-agreement.pdf',
          size: 2048000,
          type: 'application/pdf'
        }]
      };

      const result = await router.intelligentRoute(emailData);

      expect(result.ai.analysis.category).toBe('lawsuit');
      expect(result.ai.attachments.has_attachments).toBe(true);
      expect(result.ai.attachments.count).toBe(1);
    });

    it('should escalate critical emergency emails', async () => {
      const emailData = {
        from: 'emergency@court.gov',
        to: 'emergency@example.com',
        subject: 'EMERGENCY: Subpoena served - immediate response required',
        content: 'This is an emergency notification. A subpoena has been served and requires immediate legal response.',
        attachments: []
      };

      const result = await router.intelligentRoute(emailData);

      expect(result.ai.analysis.priority).toBe('HIGH');
      expect(result.actions).toContainEqual(
        expect.objectContaining({
          type: 'ESCALATE',
          level: 'immediate_attention'
        })
      );
    });
  });

  describe('AI Agent Coordination', () => {
    it('should coordinate multiple agents for case analysis', async () => {
      const taskData = {
        type: 'case_analysis',
        caseId: 'SMITH_v_JONES',
        documents: ['contract.pdf', 'evidence.jpg'],
        priority: 'HIGH'
      };

      const result = await orchestrator.executeTask(taskData);

      expect(result.success).toBe(true);
      expect(result.agents_used).toContain('legal_analyzer');
      expect(result.agents_used).toContain('document_processor');
      expect(result.result.completed_steps).toBeGreaterThan(0);
    });

    it('should handle agent failures gracefully', async () => {
      // Mock AI failure for one agent
      mockAI.run.mockRejectedValueOnce(new Error('AI service unavailable'));

      const taskData = {
        type: 'document_review',
        documents: ['test.pdf']
      };

      const result = await orchestrator.executeTask(taskData);

      expect(result.success).toBe(true); // Should still succeed with partial results
      expect(result.result.success_rate).toBeLessThan(1); // Should show some failures
    });
  });

  describe('Individual AI Components', () => {
    it('should classify emails correctly with triage agent', async () => {
      const emailData = {
        subject: 'Contract review needed',
        from: 'business@company.com',
        content: 'Please review the attached contract for our business agreement.'
      };

      const result = await intelligentTriage(mockAI, emailData);

      expect(result.category).toBe('lawsuit_communication');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.keywords).toContain('case');
    });

    it('should determine priority levels accurately', async () => {
      const emailData = {
        subject: 'Urgent court filing deadline',
        content: 'We have a court filing deadline tomorrow that requires immediate attention.'
      };

      const triageResult = { category: 'court_notice', confidence: 0.9 };
      const result = await priorityClassifier(mockAI, emailData, triageResult);

      expect(result.level).toBe('HIGH');
      expect(result.score).toBeGreaterThan(0.8);
    });

    it('should generate appropriate auto-responses', async () => {
      const emailData = {
        subject: 'Question about my case',
        from: 'client@example.com',
        content: 'I have a question about the status of my legal case.'
      };

      const triageResult = { category: 'general_inquiry', confidence: 0.8 };
      const priorityResult = { level: 'NORMAL', score: 0.7 };

      const result = await autoResponder(mockAI, emailData, triageResult, priorityResult);

      expect(result.shouldRespond).toBe(true);
      expect(result.subject).toBe('Re: Question about my case');
      expect(result.body).toContain('Thank you');
      expect(result.body).toContain('Legal Team');
    });

    it('should analyze document attachments', async () => {
      const attachment = {
        name: 'contract-agreement.pdf',
        size: 1024000,
        type: 'application/pdf'
      };

      const emailContext = {
        subject: 'Contract review',
        from: 'business@company.com',
        category: 'document_submission'
      };

      const result = await documentAnalyzer(mockAI, attachment, emailContext);

      expect(result.analyzed).toBe(true);
      expect(result.analysis.document_type).toBe('contract');
      expect(result.analysis.importance).toBe('high');
      expect(result.chittyId).toMatch(/^CD-[a-f0-9]{8}-DOC-\d+$/);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should use fallback routing when AI fails', async () => {
      // Mock complete AI failure
      mockAI.run.mockRejectedValue(new Error('AI service completely unavailable'));

      const emailData = {
        from: 'test@example.com',
        to: 'test@example.com',
        subject: 'Test email',
        content: 'Test content'
      };

      const result = await router.intelligentRoute(emailData);

      expect(result.fallback).toBe(true);
      expect(result.routing.primary_route).toBe('intake@example.com');
      expect(result.error).toContain('AI analysis failed');
    });

    it('should handle malformed AI responses gracefully', async () => {
      // Mock malformed response
      mockAI.run.mockResolvedValue({ response: 'Invalid JSON response' });

      const emailData = {
        subject: 'Test email',
        content: 'Test content'
      };

      const result = await intelligentTriage(mockAI, emailData);

      expect(result.category).toBe('general_inquiry'); // Should use fallback
      expect(result.reasoning).toContain('classification');
    });
  });

  describe('Performance and Reliability', () => {
    it('should process emails within reasonable time limits', async () => {
      const emailData = {
        from: 'test@example.com',
        to: 'test@example.com',
        subject: 'Performance test email',
        content: 'Testing processing speed and reliability.',
        attachments: []
      };

      const startTime = Date.now();
      const result = await router.intelligentRoute(emailData);
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      expect(result).toBeDefined();
      expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds
    });

    it('should handle concurrent email processing', async () => {
      const emails = Array.from({ length: 5 }, (_, i) => ({
        from: `test${i}@example.com`,
        to: 'test@example.com',
        subject: `Test email ${i}`,
        content: `Test content for email ${i}`,
        attachments: []
      }));

      const promises = emails.map(email => router.intelligentRoute(email));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.chittyId).toBeDefined();
        expect(result.ai.analysis).toBeDefined();
      });
    });
  });

  describe('Security and Compliance', () => {
    it('should sanitize email data for logging', async () => {
      const emailData = {
        from: 'client@example.com',
        to: 'lawyer@example.com',
        subject: 'Confidential legal matter',
        content: 'This contains sensitive legal information and PII: SSN 123-45-6789',
        attachments: []
      };

      const result = await router.intelligentRoute(emailData);

      // Check that sensitive data is not exposed in logs
      expect(result.emailData).toBeUndefined();
      expect(result.sanitizedData).toBeDefined();
    });

    it('should flag documents requiring special handling', async () => {
      const attachment = {
        name: 'medical-records-confidential.pdf',
        size: 5120000,
        type: 'application/pdf'
      };

      const emailContext = {
        subject: 'Medical records submission',
        from: 'hospital@medical.com',
        category: 'document_submission'
      };

      const result = await documentAnalyzer(mockAI, attachment, emailContext);

      expect(result.analysis.compliance_flags).toContain('confidential');
      expect(result.processing_recommendations).toContain(
        expect.stringContaining('Confidential handling required')
      );
    });
  });
});

describe('Email Worker Integration', () => {
  let processor;

  beforeEach(() => {
    processor = new EmailProcessor(mockAI, mockEnv);
  });

  it('should process incoming email messages from Cloudflare Email Worker', async () => {
    const mockMessage = {
      from: 'client@example.com',
      to: 'case-manager@example.com',
      headers: new Map([
        ['subject', 'Case update needed'],
        ['message-id', 'test-message-123']
      ]),
      raw: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('Email content here'));
          controller.close();
        }
      }),
      attachments: [],
      reply: vi.fn().mockResolvedValue(true),
      forward: vi.fn().mockResolvedValue(true)
    };

    const mockContext = {};

    const result = await processor.processIncomingEmail(mockMessage, mockContext);

    expect(result.success).toBe(true);
    expect(result.ai_processed).toBe(true);
    expect(result.chittyId).toBeDefined();
    expect(mockMessage.forward).toHaveBeenCalled();
  });
});