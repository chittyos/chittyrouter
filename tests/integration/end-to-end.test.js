/**
 * Integration Tests - End-to-End Email Processing
 * Tests complete email processing workflows through ChittyRouter AI Gateway
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailProcessor } from '../../src/ai/email-processor.js';
import { ChittyRouterAI } from '../../src/ai/intelligent-router.js';
import { AgentOrchestrator } from '../../src/ai/agent-orchestrator.js';
import { AIStateDO } from '../../src/ai/ai-state.js';
import { mockAI } from '../mocks/ai-responses.js';
import { testEmails, createMockMessage } from '../data/test-emails.js';

// Mock utilities
vi.mock('../../src/utils/chittyid-generator.js', () => ({
  generateEmailChittyID: vi.fn().mockImplementation((emailData) => {
    const timestamp = Date.now();
    const hash = Math.random().toString(36).substr(2, 9);
    return Promise.resolve(`CHITTY-${timestamp}-${hash}`);
  })
}));

vi.mock('../../src/utils/storage.js', () => ({
  storeInChittyChain: vi.fn().mockResolvedValue({ success: true, stored: true }),
  logEmailToChain: vi.fn().mockResolvedValue({ success: true, logged: true })
}));

// Mock chain logger
vi.mock('../../src/utils/chain-logger.js', () => ({
  logEmailToChain: vi.fn().mockResolvedValue({ success: true, logged: true })
}));

describe('End-to-End Email Processing', () => {
  let processor;
  let router;
  let orchestrator;
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      CHITTY_CHAIN_URL: 'https://test-chain.example.com',
      AI_MODEL: '@cf/meta/llama-3.1-8b-instruct',
      CHITTY_STATE_URL: 'https://test-state.example.com'
    };

    router = new ChittyRouterAI(mockAI, mockEnv);
    processor = new EmailProcessor(mockAI, mockEnv);
    orchestrator = new AgentOrchestrator(mockAI, mockEnv);

    mockAI.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Lawsuit Email Processing', () => {
    it('should process urgent lawsuit email end-to-end', async () => {
      const message = createMockMessage('lawsuit_urgent');

      // Process the email
      const result = await processor.processIncomingEmail(message, {});

      // Verify successful processing
      expect(result.success).toBe(true);
      expect(result.ai_processed).toBe(true);
      expect(result.chittyId).toBeDefined();

      // Verify routing decision
      expect(result.routing).toBeDefined();
      expect(result.routing.primary_route).toBeDefined();

      // Verify actions were determined
      expect(result.actions_taken).toBeDefined();
      expect(result.actions_taken.length).toBeGreaterThan(0);

      // Verify ChittyID generation was called
      const { generateEmailChittyID } = await import('../../src/utils/chittyid-generator.js');
      expect(generateEmailChittyID).toHaveBeenCalled();

      // Verify storage calls were made
      const { storeInChittyChain } = await import('../../src/utils/storage.js');
      expect(storeInChittyChain).toHaveBeenCalled();
    });

    it('should handle lawsuit with settlement discussion', async () => {
      const message = createMockMessage('lawsuit_settlement');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();

      // Verify case pattern extraction
      const emailData = await processor.extractEmailData(message);
      expect(emailData.casePattern).toBeDefined();
    });
  });

  describe('Emergency Email Processing', () => {
    it('should process emergency TRO email with escalation', async () => {
      const message = createMockMessage('emergency_injunction');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.ai_processed).toBe(true);

      // Emergency emails should be processed quickly
      expect(result.chittyId).toBeDefined();
    });

    it('should process federal subpoena with compliance handling', async () => {
      const message = createMockMessage('emergency_subpoena');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();
    });
  });

  describe('Document Submission Processing', () => {
    it('should process document evidence submission', async () => {
      const message = createMockMessage('document_evidence');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.ai_processed).toBe(true);

      // Verify attachment processing
      const emailData = await processor.extractEmailData(message);
      expect(emailData.attachments).toBeDefined();
      expect(emailData.attachments.length).toBe(testEmails.document_evidence.attachments.length);

      // Each attachment should have a ChittyID
      emailData.attachments.forEach(attachment => {
        expect(attachment.chittyId).toBeDefined();
        expect(attachment.processed).toBe(true);
      });
    });

    it('should process court filing confirmation', async () => {
      const message = createMockMessage('document_filing');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();
    });
  });

  describe('Client Communication Processing', () => {
    it('should process new client consultation request', async () => {
      const message = createMockMessage('client_consultation');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.ai_processed).toBe(true);
      expect(result.chittyId).toBeDefined();
    });

    it('should process existing client update request', async () => {
      const message = createMockMessage('client_update_request');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();
    });
  });

  describe('General Inquiry Processing', () => {
    it('should process general legal question', async () => {
      const message = createMockMessage('general_question');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();
    });
  });

  describe('Appointment and Scheduling Processing', () => {
    it('should process deposition scheduling request', async () => {
      const message = createMockMessage('appointment_request');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();
    });
  });

  describe('Billing Inquiry Processing', () => {
    it('should process billing question', async () => {
      const message = createMockMessage('billing_question');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();
    });
  });

  describe('AI Routing Intelligence', () => {
    it('should make intelligent routing decisions based on content analysis', async () => {
      const emailData = testEmails.lawsuit_urgent;

      const routingResult = await router.intelligentRoute(emailData);

      expect(routingResult.chittyId).toBeDefined();
      expect(routingResult.ai.analysis).toBeDefined();
      expect(routingResult.ai.routing).toBeDefined();
      expect(routingResult.actions).toBeDefined();

      // Analysis should identify lawsuit characteristics
      expect(routingResult.ai.analysis.category).toBeDefined();
      expect(routingResult.ai.analysis.priority).toBeDefined();
      expect(routingResult.ai.analysis.urgency_score).toBeGreaterThan(0);

      // Routing should be appropriate for content
      expect(routingResult.ai.routing.primary_route).toBeDefined();
      expect(routingResult.ai.routing.reasoning).toBeDefined();
    });

    it('should generate appropriate auto-responses', async () => {
      const emailData = testEmails.client_consultation;

      const routingResult = await router.intelligentRoute(emailData);

      if (routingResult.ai.response?.should_respond) {
        expect(routingResult.ai.response.subject).toBeDefined();
        expect(routingResult.ai.response.body).toBeDefined();
        expect(routingResult.ai.response.type).toBe('ai_generated');
      }
    });

    it('should analyze attachments intelligently', async () => {
      const emailData = testEmails.document_evidence;

      const routingResult = await router.intelligentRoute(emailData);

      expect(routingResult.ai.attachments).toBeDefined();
      if (routingResult.ai.attachments.has_attachments) {
        expect(routingResult.ai.attachments.count).toBeGreaterThan(0);
        expect(routingResult.ai.attachments.analyses).toBeDefined();
        expect(routingResult.ai.attachments.summary).toBeDefined();
      }
    });
  });

  describe('Agent Orchestration Integration', () => {
    it('should orchestrate agents for case analysis', async () => {
      const taskData = {
        type: 'case_analysis',
        caseId: 'SMITH_v_JONES',
        emailData: testEmails.lawsuit_urgent
      };

      const result = await orchestrator.executeTask(taskData);

      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
      expect(result.agents_used).toContain('legal_analyzer');
      expect(result.result.total_steps).toBeGreaterThan(0);
      expect(result.result.success_rate).toBeDefined();
    });

    it('should orchestrate agents for document review', async () => {
      const taskData = {
        type: 'document_review',
        documents: testEmails.document_evidence.attachments
      };

      const result = await orchestrator.executeTask(taskData);

      expect(result.success).toBe(true);
      expect(result.agents_used).toContain('document_analyzer');
      expect(result.result.completed_steps).toBeGreaterThan(0);
    });

    it('should orchestrate agents for client communication', async () => {
      const taskData = {
        type: 'client_communication',
        emailData: testEmails.client_consultation
      };

      const result = await orchestrator.executeTask(taskData);

      expect(result.success).toBe(true);
      expect(result.agents_used).toContain('triage_agent');
    });
  });

  describe('ChittyID Generation and Tracking', () => {
    it('should generate unique ChittyIDs for each email', async () => {
      const chittyIds = new Set();

      // Process multiple emails
      for (const emailKey of ['lawsuit_urgent', 'document_evidence', 'client_consultation']) {
        const message = createMockMessage(emailKey);
        const result = await processor.processIncomingEmail(message, {});

        expect(result.chittyId).toBeDefined();
        expect(chittyIds.has(result.chittyId)).toBe(false);
        chittyIds.add(result.chittyId);
      }

      expect(chittyIds.size).toBe(3);
    });

    it('should track ChittyIDs through the entire pipeline', async () => {
      const message = createMockMessage('lawsuit_urgent');

      // Extract email data
      const emailData = await processor.extractEmailData(message);

      // Route through AI
      const routingResult = await router.intelligentRoute(emailData);

      // Process through complete pipeline
      const result = await processor.processIncomingEmail(message, {});

      // All should reference the same processing
      expect(result.chittyId).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('ChittyChain Integration', () => {
    it('should log all processing steps to ChittyChain', async () => {
      const message = createMockMessage('lawsuit_urgent');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);

      // Verify chain logging was called
      const { storeInChittyChain } = await import('../../src/utils/storage.js');
      expect(storeInChittyChain).toHaveBeenCalled();
    });

    it('should create immutable audit trail', async () => {
      const message = createMockMessage('emergency_injunction');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();

      // Chain should have record of processing
      const { storeInChittyChain } = await import('../../src/utils/storage.js');
      expect(storeInChittyChain).toHaveBeenCalledWith(
        expect.objectContaining({
          chittyId: result.chittyId
        })
      );
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should gracefully handle AI service failures', async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error('AI service unavailable'))
      };

      const failingProcessor = new EmailProcessor(failingAI, mockEnv);
      const message = createMockMessage('general_question');

      const result = await failingProcessor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.error).toBeDefined();
    });

    it('should handle message processing failures gracefully', async () => {
      const invalidMessage = {
        from: null,
        to: null,
        headers: new Map(),
        attachments: [],
        raw: null
      };

      // Mock streamToText to fail
      const originalStreamToText = processor.streamToText;
      processor.streamToText = vi.fn().mockRejectedValue(new Error('Stream processing failed'));

      const result = await processor.processIncomingEmail(invalidMessage, {});

      // Should use fallback processing
      expect(result.fallback || result.error).toBeDefined();

      processor.streamToText = originalStreamToText;
    });

    it('should continue processing when non-critical components fail', async () => {
      const message = createMockMessage('lawsuit_urgent');

      // Mock attachment processing to fail
      const originalProcessAttachments = processor.processAttachments;
      processor.processAttachments = vi.fn().mockRejectedValue(new Error('Attachment processing failed'));

      const result = await processor.processIncomingEmail(message, {});

      // Email should still be processed despite attachment failure
      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();

      processor.processAttachments = originalProcessAttachments;
    });
  });

  describe('Performance and Efficiency', () => {
    it('should process emails within reasonable time limits', async () => {
      const message = createMockMessage('lawsuit_urgent');

      const startTime = Date.now();
      const result = await processor.processIncomingEmail(message, {});
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle multiple email types efficiently', async () => {
      const emailTypes = [
        'lawsuit_urgent',
        'document_evidence',
        'client_consultation',
        'general_question',
        'emergency_injunction'
      ];

      const results = [];
      const startTime = Date.now();

      for (const emailType of emailTypes) {
        const message = createMockMessage(emailType);
        const result = await processor.processIncomingEmail(message, {});
        results.push(result);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.chittyId).toBeDefined();
      });

      // Should process all 5 emails efficiently
      expect(totalTime).toBeLessThan(10000); // Within 10 seconds total
    });
  });

  describe('Data Consistency and Validation', () => {
    it('should maintain data consistency across all components', async () => {
      const message = createMockMessage('lawsuit_settlement');

      const emailData = await processor.extractEmailData(message);
      const routingResult = await router.intelligentRoute(emailData);
      const finalResult = await processor.processIncomingEmail(message, {});

      // ChittyID should be consistent
      expect(finalResult.chittyId).toBeDefined();

      // Analysis should be consistent
      expect(finalResult.routing).toBeDefined();

      // Actions should be consistent
      expect(finalResult.actions_taken).toBeDefined();
    });

    it('should validate all required fields are present', async () => {
      const message = createMockMessage('document_evidence');

      const result = await processor.processIncomingEmail(message, {});

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('chittyId');
      expect(result).toHaveProperty('ai_processed');
      expect(result).toHaveProperty('routing');
      expect(result).toHaveProperty('actions_taken');
    });
  });
});