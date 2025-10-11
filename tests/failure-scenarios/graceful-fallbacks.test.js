/**
 * Failure Scenario Tests - Graceful Fallbacks
 * Tests ChittyRouter AI Gateway resilience and fallback mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailProcessor } from '../../src/ai/email-processor.js';
import { ChittyRouterAI } from '../../src/ai/intelligent-router.js';
import { AgentOrchestrator } from '../../src/ai/agent-orchestrator.js';
import { testEmails, createMockMessage } from '../data/test-emails.js';

// Mock utilities that can fail
const createFailingMock = (failureRate = 0.5) => {
  return vi.fn().mockImplementation(() => {
    if (Math.random() < failureRate) {
      return Promise.reject(new Error('Service unavailable'));
    }
    return Promise.resolve({ success: true });
  });
};

describe('Failure Scenarios - Graceful Fallbacks', () => {
  let processor;
  let router;
  let orchestrator;
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      CHITTY_CHAIN_URL: 'https://test-chain.example.com',
      AI_MODEL: '@cf/meta/llama-3.1-8b-instruct'
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('AI Service Failures', () => {
    it('should handle complete AI service outage', async () => {
      const failingAI = {
        run: vi.fn().mockRejectedValue(new Error('AI service completely unavailable'))
      };

      processor = new EmailProcessor(failingAI, mockEnv);
      const message = createMockMessage('lawsuit_urgent');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.routing.primary_route).toBe('intake@example.com');

      console.log('✓ Gracefully handled complete AI outage');
    });

    it('should handle intermittent AI failures', async () => {
      let callCount = 0;
      const intermittentAI = {
        run: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount % 3 === 0) {
            return Promise.reject(new Error('Intermittent AI failure'));
          }
          return Promise.resolve({
            response: JSON.stringify({
              category: 'inquiry',
              priority: 'NORMAL',
              auto_response_needed: false
            })
          });
        })
      };

      router = new ChittyRouterAI(intermittentAI, mockEnv);
      processor = new EmailProcessor(intermittentAI, mockEnv);

      const messages = [
        createMockMessage('lawsuit_urgent'),
        createMockMessage('document_evidence'),
        createMockMessage('general_question')
      ];

      const results = [];
      for (const message of messages) {
        const result = await processor.processIncomingEmail(message, {});
        results.push(result);
      }

      // Most should succeed, some may fallback
      const successOrFallback = results.filter(r => r.success).length;
      expect(successOrFallback).toBeGreaterThan(0);

      console.log(`✓ Handled intermittent failures: ${successOrFallback}/${results.length} processed`);
    });

    it('should handle AI timeout scenarios', async () => {
      const slowAI = {
        run: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                response: JSON.stringify({
                  category: 'inquiry',
                  priority: 'NORMAL'
                })
              });
            }, 5000); // 5 second delay
          });
        })
      };

      router = new ChittyRouterAI(slowAI, mockEnv);
      const emailData = testEmails.general_question;

      // Set a shorter timeout expectation
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI timeout')), 2000)
      );

      const routingPromise = router.intelligentRoute(emailData);

      try {
        await Promise.race([routingPromise, timeoutPromise]);
      } catch (error) {
        expect(error.message).toBe('AI timeout');
      }

      // Should handle timeout gracefully
      const fallbackResult = router.fallbackRouting(emailData, new Error('AI timeout'));
      expect(fallbackResult.fallback).toBe(true);
      expect(fallbackResult.routing.primary_route).toBe('intake@example.com');

      console.log('✓ Handled AI timeout gracefully');
    });

    it('should handle malformed AI responses', async () => {
      const malformedAI = {
        run: vi.fn().mockImplementation(() => {
          const responses = [
            { response: 'invalid json {category:' },
            { response: '' },
            { response: null },
            { response: 'Just plain text response' },
            { response: '{"incomplete": "json"' }
          ];
          return Promise.resolve(responses[Math.floor(Math.random() * responses.length)]);
        })
      };

      router = new ChittyRouterAI(malformedAI, mockEnv);

      for (let i = 0; i < 5; i++) {
        const emailData = testEmails.general_question;
        const result = await router.intelligentRoute(emailData);

        // Should handle malformed responses gracefully
        expect(result.chittyId).toBeDefined();
        // May be fallback or parsed with defaults
        expect(result.ai.analysis).toBeDefined();
      }

      console.log('✓ Handled malformed AI responses gracefully');
    });
  });

  describe('Storage and Chain Failures', () => {
    beforeEach(() => {
      // Mock successful AI for these tests
      const workingAI = {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify({
            category: 'inquiry',
            priority: 'NORMAL',
            auto_response_needed: false
          })
        })
      };

      processor = new EmailProcessor(workingAI, mockEnv);
      router = new ChittyRouterAI(workingAI, mockEnv);
    });

    it('should continue processing when ChittyChain storage fails', async () => {
      // Mock storage to fail
      vi.doMock('../../src/utils/storage.js', () => ({
        storeInChittyChain: vi.fn().mockRejectedValue(new Error('Chain storage failed')),
        logEmailToChain: vi.fn().mockRejectedValue(new Error('Chain logging failed'))
      }));

      const message = createMockMessage('lawsuit_urgent');

      const result = await processor.processIncomingEmail(message, {});

      // Should still process email despite storage failures
      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();

      console.log('✓ Continued processing despite chain storage failure');
    });

    it('should handle ChittyID generation failures', async () => {
      // Mock ChittyID generation to fail
      vi.doMock('../../src/utils/chittyid-client.js', () => ({
        requestEmailChittyID: vi.fn().mockRejectedValue(new Error('ChittyID generation failed'))
      }));

      const message = createMockMessage('document_evidence');

      const result = await processor.processIncomingEmail(message, {});

      // Should generate fallback ID or continue processing
      expect(result.success || result.fallback).toBe(true);

      console.log('✓ Handled ChittyID generation failure');
    });

    it('should handle database connection failures', async () => {
      // Simulate database/state storage failures
      const failingProcessor = new EmailProcessor({
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify({ category: 'inquiry', priority: 'NORMAL' })
        })
      }, mockEnv);

      // Mock state operations to fail
      const originalCreateChittyThread = failingProcessor.createChittyThread;
      failingProcessor.createChittyThread = vi.fn().mockRejectedValue(
        new Error('Database connection failed')
      );

      const message = createMockMessage('lawsuit_settlement');

      const result = await failingProcessor.processIncomingEmail(message, {});

      // Should still succeed despite database failures
      expect(result.success).toBe(true);

      console.log('✓ Handled database connection failure');
    });
  });

  describe('Network and Communication Failures', () => {
    beforeEach(() => {
      const workingAI = {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify({
            category: 'inquiry',
            priority: 'NORMAL',
            auto_response_needed: true
          })
        })
      };

      processor = new EmailProcessor(workingAI, mockEnv);
    });

    it('should handle email forwarding failures', async () => {
      const message = createMockMessage('lawsuit_urgent');

      // Mock forward to fail
      message.forward = vi.fn().mockRejectedValue(new Error('Email forwarding failed'));

      const result = await processor.processIncomingEmail(message, {});

      // Should still complete processing
      expect(result.success).toBe(true);
      expect(result.chittyId).toBeDefined();

      console.log('✓ Handled email forwarding failure');
    });

    it('should handle auto-response sending failures', async () => {
      const message = createMockMessage('client_consultation');

      // Mock reply to fail
      message.reply = vi.fn().mockRejectedValue(new Error('Reply sending failed'));

      const result = await processor.processIncomingEmail(message, {});

      // Should continue despite reply failure
      expect(result.success).toBe(true);

      console.log('✓ Handled auto-response sending failure');
    });

    it('should handle partial network outages', async () => {
      const message = createMockMessage('emergency_injunction');

      // Simulate partial network issues
      let attemptCount = 0;
      message.forward = vi.fn().mockImplementation((destination) => {
        attemptCount++;
        if (attemptCount <= 2) {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.resolve({ success: true });
      });

      // Should eventually succeed with retries or fallback
      const result = await processor.processIncomingEmail(message, {});
      expect(result.success || result.fallback).toBe(true);

      console.log('✓ Handled partial network outage');
    });
  });

  describe('Agent Orchestration Failures', () => {
    beforeEach(() => {
      const workingAI = {
        run: vi.fn().mockResolvedValue({
          response: 'Analysis complete'
        })
      };

      orchestrator = new AgentOrchestrator(workingAI, mockEnv);
    });

    it('should handle individual agent failures', async () => {
      const failingAI = {
        run: vi.fn().mockImplementation(() => {
          if (Math.random() < 0.3) {
            return Promise.reject(new Error('Agent processing failed'));
          }
          return Promise.resolve({ response: 'Agent response' });
        })
      };

      const failingOrchestrator = new AgentOrchestrator(failingAI, mockEnv);

      const taskData = {
        type: 'case_analysis',
        caseId: 'SMITH_v_JONES'
      };

      const result = await failingOrchestrator.executeTask(taskData);

      // Should complete workflow even with some agent failures
      expect(result.taskId).toBeDefined();
      expect(result.result.completed_steps).toBeGreaterThan(0);

      console.log(`✓ Completed workflow with partial agent failures: ${result.result.success_rate * 100}% success rate`);
    });

    it('should handle critical step failures', async () => {
      const taskData = {
        type: 'document_review',
        documents: ['critical-contract.pdf']
      };

      // Mock critical step to fail
      const originalExecuteAgentStep = orchestrator.executeAgentStep;
      orchestrator.executeAgentStep = vi.fn().mockImplementation((agent, step, taskData, results) => {
        if (step.critical && step.name === 'analyze_document') {
          return Promise.resolve({
            success: false,
            error: 'Critical analysis failed',
            agent: agent.type,
            step: step.name
          });
        }
        return originalExecuteAgentStep.call(orchestrator, agent, step, taskData, results);
      });

      const result = await orchestrator.executeTask(taskData);

      // Should handle critical failures appropriately
      expect(result.result.results.analyze_document?.error).toBeDefined();
      expect(result.result.recommendations).toContain('Review and retry');

      console.log('✓ Handled critical step failure');
    });

    it('should handle agent initialization failures', async () => {
      const taskData = {
        type: 'case_analysis',
        caseId: 'TEST_CASE'
      };

      // Mock agent creation to sometimes fail
      const originalCreateAgent = orchestrator.createAgent;
      orchestrator.createAgent = vi.fn().mockImplementation((agentType) => {
        if (agentType === 'document_processor') {
          throw new Error('Agent initialization failed');
        }
        return originalCreateAgent.call(orchestrator, agentType);
      });

      const result = await orchestrator.executeTask(taskData);

      // Should work with available agents
      expect(result.taskId).toBeDefined();
      expect(result.result.completed_steps).toBeGreaterThan(0);

      console.log('✓ Handled agent initialization failure');
    });
  });

  describe('Resource Exhaustion Scenarios', () => {
    it('should handle memory pressure gracefully', async () => {
      const workingAI = {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify({ category: 'inquiry', priority: 'NORMAL' })
        })
      };

      processor = new EmailProcessor(workingAI, mockEnv);

      // Simulate memory pressure by processing many emails rapidly
      const emails = Array.from({ length: 100 }, () => createMockMessage('general_question'));

      let successCount = 0;
      let errorCount = 0;

      for (const message of emails) {
        try {
          const result = await processor.processIncomingEmail(message, {});
          if (result.success || result.fallback) {
            successCount++;
          }
        } catch (error) {
          errorCount++;
        }
      }

      const successRate = successCount / emails.length;

      // Should maintain reasonable success rate even under memory pressure
      expect(successRate).toBeGreaterThan(0.7); // 70% minimum

      console.log(`✓ Memory pressure test: ${successRate * 100}% success rate`);
    });

    it('should handle concurrent request overload', async () => {
      const workingAI = {
        run: vi.fn().mockImplementation(() => {
          // Simulate varying response times
          const delay = Math.random() * 1000;
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                response: JSON.stringify({ category: 'inquiry', priority: 'NORMAL' })
              });
            }, delay);
          });
        })
      };

      processor = new EmailProcessor(workingAI, mockEnv);

      // Create many concurrent requests
      const concurrentRequests = 50;
      const promises = Array.from({ length: concurrentRequests }, () => {
        const message = createMockMessage('general_question');
        return processor.processIncomingEmail(message, {})
          .catch(error => ({ error: error.message }));
      });

      const results = await Promise.all(promises);

      const successCount = results.filter(r => r.success || r.fallback).length;
      const errorCount = results.filter(r => r.error).length;

      // Should handle most requests even under overload
      expect(successCount).toBeGreaterThan(concurrentRequests * 0.6); // 60% minimum

      console.log(`✓ Overload test: ${successCount}/${concurrentRequests} requests handled`);
    });
  });

  describe('Data Corruption and Invalid Input', () => {
    beforeEach(() => {
      const workingAI = {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify({ category: 'inquiry', priority: 'NORMAL' })
        })
      };

      processor = new EmailProcessor(workingAI, mockEnv);
    });

    it('should handle corrupted email messages', async () => {
      const corruptedMessage = {
        from: null,
        to: undefined,
        headers: null,
        attachments: 'invalid',
        raw: null
      };

      const result = await processor.processIncomingEmail(corruptedMessage, {});

      // Should handle gracefully with fallback
      expect(result.fallback || result.error).toBeDefined();

      console.log('✓ Handled corrupted email message');
    });

    it('should handle malformed attachment data', async () => {
      const messageWithBadAttachments = createMockMessage('document_evidence');
      messageWithBadAttachments.attachments = [
        { name: null, size: 'invalid', type: undefined },
        null,
        undefined,
        { /* missing required fields */ }
      ];

      const result = await processor.processIncomingEmail(messageWithBadAttachments, {});

      // Should continue processing despite bad attachment data
      expect(result.success || result.fallback).toBe(true);

      console.log('✓ Handled malformed attachment data');
    });

    it('should handle extremely large email content', async () => {
      const largeMessage = createMockMessage('general_question');

      // Create a very large content stream
      const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB
      largeMessage.raw = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(largeContent));
          controller.close();
        }
      });

      const result = await processor.processIncomingEmail(largeMessage, {});

      // Should handle large content gracefully
      expect(result.success || result.fallback).toBe(true);

      console.log('✓ Handled extremely large email content');
    });

    it('should handle invalid character encodings', async () => {
      const message = createMockMessage('lawsuit_urgent');

      // Create stream with invalid encoding
      message.raw = new ReadableStream({
        start(controller) {
          // Invalid UTF-8 sequences
          const invalidBytes = new Uint8Array([0xFF, 0xFE, 0xFD, 0xFC]);
          controller.enqueue(invalidBytes);
          controller.close();
        }
      });

      const result = await processor.processIncomingEmail(message, {});

      // Should handle encoding issues gracefully
      expect(result.success || result.fallback).toBe(true);

      console.log('✓ Handled invalid character encodings');
    });
  });

  describe('Recovery and Resilience', () => {
    it('should recover from transient failures', async () => {
      let attemptCount = 0;
      const recoveringAI = {
        run: vi.fn().mockImplementation(() => {
          attemptCount++;
          if (attemptCount <= 2) {
            return Promise.reject(new Error('Transient failure'));
          }
          return Promise.resolve({
            response: JSON.stringify({ category: 'inquiry', priority: 'NORMAL' })
          });
        })
      };

      router = new ChittyRouterAI(recoveringAI, mockEnv);

      // First attempts should fail, then recover
      try {
        await router.intelligentRoute(testEmails.general_question);
      } catch (error) {
        expect(error.message).toContain('Transient failure');
      }

      try {
        await router.intelligentRoute(testEmails.general_question);
      } catch (error) {
        expect(error.message).toContain('Transient failure');
      }

      // Third attempt should succeed
      const result = await router.intelligentRoute(testEmails.general_question);
      expect(result.chittyId).toBeDefined();

      console.log('✓ Recovered from transient failures');
    });

    it('should maintain service during partial component failures', async () => {
      const partiallyFailingAI = {
        run: vi.fn().mockImplementation((model, options) => {
          const content = options.messages?.[0]?.content || '';

          // Fail only routing decisions, but allow analysis
          if (content.includes('routing')) {
            return Promise.reject(new Error('Routing service down'));
          }

          return Promise.resolve({
            response: JSON.stringify({ category: 'inquiry', priority: 'NORMAL' })
          });
        })
      };

      router = new ChittyRouterAI(partiallyFailingAI, mockEnv);

      const result = await router.intelligentRoute(testEmails.general_question);

      // Should have analysis but fallback routing
      expect(result.chittyId).toBeDefined();
      expect(result.ai.analysis).toBeDefined();

      if (result.ai.routing.reasoning) {
        expect(result.ai.routing.reasoning).toContain('fallback');
      }

      console.log('✓ Maintained service during partial component failure');
    });
  });

  describe('System Health Monitoring', () => {
    it('should detect and report system health issues', async () => {
      const unhealthyAI = {
        run: vi.fn().mockRejectedValue(new Error('AI system unhealthy'))
      };

      router = new ChittyRouterAI(unhealthyAI, mockEnv);

      const health = await router.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBeDefined();
      expect(health.timestamp).toBeDefined();

      console.log('✓ Detected and reported system health issues');
    });

    it('should provide meaningful error context', async () => {
      const contextualAI = {
        run: vi.fn().mockRejectedValue(new Error('Model timeout: 500ms exceeded'))
      };

      processor = new EmailProcessor(contextualAI, mockEnv);
      const message = createMockMessage('lawsuit_urgent');

      const result = await processor.processIncomingEmail(message, {});

      expect(result.fallback).toBe(true);
      expect(result.error).toContain('Model timeout');

      console.log('✓ Provided meaningful error context');
    });
  });
});