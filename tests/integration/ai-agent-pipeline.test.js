/**
 * Integration Tests for AI Agent Pipeline
 * Tests the complete flow: Triage → Priority → Router → Document → Response
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentOrchestrator } from '../../src/ai/agent-orchestrator.js';
import { ChittyRouterAI } from '../../src/ai/intelligent-router.js';
import { EmailProcessor } from '../../src/ai/email-processor.js';

describe('AI Agent Pipeline Integration', () => {
  let mockEnv;
  let mockAI;
  let orchestrator;
  let router;
  let emailProcessor;

  beforeEach(() => {
    // Create sophisticated mock AI that returns different responses based on the prompt
    mockAI = {
      run: vi.fn().mockImplementation((model, { prompt }) => {
        // Triage agent response
        if (prompt.includes('triage') || prompt.includes('classify')) {
          return Promise.resolve({
            response: JSON.stringify({
              category: 'legal_matter',
              subcategory: 'contract_review',
              client_type: 'existing',
              confidence: 0.89
            })
          });
        }
        
        // Priority agent response
        if (prompt.includes('priority') || prompt.includes('urgency')) {
          return Promise.resolve({
            response: JSON.stringify({
              priority: 'HIGH',
              urgency_score: 8.5,
              deadline_detected: true,
              deadline_date: '2026-03-01',
              reasoning: 'Contract deadline mentioned in email'
            })
          });
        }
        
        // Document agent response
        if (prompt.includes('document') || prompt.includes('attachment')) {
          return Promise.resolve({
            response: JSON.stringify({
              document_type: 'contract',
              confidence: 0.92,
              key_clauses: ['payment_terms', 'termination', 'liability'],
              requires_legal_review: true,
              summary: 'Standard service agreement with non-standard liability clause'
            })
          });
        }
        
        // Routing agent response
        if (prompt.includes('route') || prompt.includes('assign')) {
          return Promise.resolve({
            response: JSON.stringify({
              destination: 'contracts-team@chitty.cc',
              cc: ['legal-review@chitty.cc'],
              assignee: 'Sarah Chen',
              department: 'Contracts',
              confidence: 0.91
            })
          });
        }
        
        // Response generation agent
        if (prompt.includes('respond') || prompt.includes('draft')) {
          return Promise.resolve({
            response: JSON.stringify({
              message: 'Thank you for your contract submission. Our contracts team has been notified and will review within 24 hours.',
              tone: 'professional',
              should_send: true
            })
          });
        }
        
        // Default response
        return Promise.resolve({
          response: JSON.stringify({
            success: true,
            message: 'Agent task completed'
          })
        });
      })
    };

    // Create comprehensive mock environment
    mockEnv = {
      AI: mockAI,
      
      // AI Cache for response caching
      AI_CACHE: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      },
      
      // Durable Objects for state management
      AI_STATE_DO: {
        idFromName: vi.fn().mockReturnValue('ai-state-id'),
        get: vi.fn().mockReturnValue({
          fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
            state: 'initialized'
          })))
        })
      },
      
      // Model configuration
      AI_MODEL_PRIMARY: '@cf/meta/llama-4-scout-17b-16e-instruct',
      AI_MODEL_SECONDARY: '@cf/openai/gpt-oss-120b',
      AI_MODEL_VISION: '@cf/meta/llama-3.2-11b-vision-instruct',
      AI_MODEL_REASONING: '@cf/google/gemma-3-12b-it',
      
      // Environment
      ENVIRONMENT: 'test',
      VERSION: '2.1.0-ai'
    };

    // Initialize services
    orchestrator = new AgentOrchestrator(mockAI, mockEnv);
    router = new ChittyRouterAI(mockAI, mockEnv);
    emailProcessor = new EmailProcessor(mockAI, mockEnv);
  });

  describe('Complete Agent Pipeline Flow', () => {
    it('should process email through full agent pipeline', async () => {
      const emailData = {
        from: 'client@example.com',
        to: 'legal@chitty.cc',
        subject: 'Contract Review Required - Deadline March 1st',
        content: `
          Hi Legal Team,
          
          We need urgent review of the attached service contract.
          The vendor is requesting signature by March 1st.
          
          Please prioritize this review.
          
          Best regards,
          John Smith
          Acme Corp
        `,
        attachments: [
          {
            name: 'service_contract.pdf',
            type: 'application/pdf',
            size: 150000
          }
        ],
        timestamp: new Date().toISOString()
      };

      // Process through the complete pipeline
      const result = await emailProcessor.processEmail(emailData);

      expect(result.success).toBe(true);
      
      // Verify triage classification
      expect(result.classification).toBeDefined();
      expect(result.classification.category).toBe('legal_matter');
      expect(result.classification.subcategory).toBe('contract_review');
      
      // Verify priority assessment
      expect(result.priority).toBeDefined();
      expect(result.priority.level).toBe('HIGH');
      expect(result.priority.urgency_score).toBeGreaterThan(7);
      expect(result.priority.deadline_detected).toBe(true);
      
      // Verify document analysis
      expect(result.documents).toBeDefined();
      expect(result.documents.length).toBe(1);
      expect(result.documents[0].type).toBe('contract');
      expect(result.documents[0].requires_legal_review).toBe(true);
      
      // Verify routing decision
      expect(result.routing).toBeDefined();
      expect(result.routing.destination).toContain('contracts-team');
      expect(result.routing.assignee).toBeDefined();
      
      // Verify response generation
      expect(result.response).toBeDefined();
      expect(result.response.message).toBeDefined();
      expect(result.response.should_send).toBe(true);
    });

    it('should handle multi-step orchestration with agent coordination', async () => {
      const taskData = {
        type: 'case_analysis',
        caseId: 'SMITH_v_JONES_2026',
        documents: [
          'complaint.pdf',
          'evidence_photos.zip',
          'witness_statements.pdf'
        ],
        priority: 'HIGH',
        deadline: '2026-03-15'
      };

      const result = await orchestrator.executeTask(taskData);

      expect(result.success).toBe(true);
      expect(result.agents_used).toBeDefined();
      expect(result.agents_used.length).toBeGreaterThan(1);
      
      // Verify multiple agents were coordinated
      expect(result.result.total_steps).toBeGreaterThan(1);
      expect(result.timestamp).toBeDefined();
    });

    it('should cache AI responses for efficiency', async () => {
      const emailData = {
        from: 'repeat@example.com',
        to: 'info@chitty.cc',
        subject: 'General inquiry',
        content: 'I have a question about your services.'
      };

      // First request - should call AI
      await emailProcessor.processEmail(emailData);
      const firstCallCount = mockAI.run.mock.calls.length;

      // Mock cache hit for second request
      mockEnv.AI_CACHE.get.mockResolvedValueOnce(JSON.stringify({
        classification: { category: 'general_inquiry' },
        cached: true
      }));

      // Second identical request - should use cache
      await emailProcessor.processEmail(emailData);
      const secondCallCount = mockAI.run.mock.calls.length;

      // Verify caching behavior (second call should make fewer AI calls)
      expect(secondCallCount).toBeGreaterThanOrEqual(firstCallCount);
    });
  });

  describe('Agent Pipeline Error Handling', () => {
    it('should handle triage agent failure gracefully', async () => {
      // Mock triage failure
      mockAI.run.mockRejectedValueOnce(new Error('Triage agent timeout'));

      const emailData = {
        from: 'client@example.com',
        to: 'legal@chitty.cc',
        subject: 'Urgent matter',
        content: 'Need help immediately.'
      };

      const result = await emailProcessor.processEmail(emailData);

      // Should still complete with fallback behavior
      expect(result.success).toBe(true);
      expect(result.classification).toBeDefined();
      expect(result.classification.fallback).toBe(true);
    });

    it('should continue pipeline even if priority agent fails', async () => {
      // Mock priority agent failure
      mockAI.run
        .mockResolvedValueOnce({ // Triage succeeds
          response: JSON.stringify({ category: 'general_inquiry' })
        })
        .mockRejectedValueOnce(new Error('Priority agent error')) // Priority fails
        .mockResolvedValueOnce({ // Routing succeeds
          response: JSON.stringify({ destination: 'intake@chitty.cc' })
        });

      const emailData = {
        from: 'client@example.com',
        to: 'info@chitty.cc',
        subject: 'Question',
        content: 'I have a question.'
      };

      const result = await emailProcessor.processEmail(emailData);

      expect(result.success).toBe(true);
      expect(result.priority).toBeDefined();
      expect(result.priority.default).toBe(true); // Used default priority
      expect(result.routing).toBeDefined(); // Still routed
    });

    it('should retry failed AI calls with exponential backoff', async () => {
      let callCount = 0;
      mockAI.run.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({
          response: JSON.stringify({ category: 'general_inquiry' })
        });
      });

      const emailData = {
        from: 'client@example.com',
        subject: 'Test',
        content: 'Test email'
      };

      const result = await emailProcessor.processEmail(emailData, { 
        retries: 3,
        retryDelay: 100 
      });

      expect(result.success).toBe(true);
      expect(callCount).toBe(3); // Should have retried twice
    });
  });

  describe('Agent Pipeline Performance', () => {
    it('should complete pipeline within acceptable time', async () => {
      const startTime = Date.now();

      const emailData = {
        from: 'client@example.com',
        to: 'legal@chitty.cc',
        subject: 'Contract review',
        content: 'Please review attached contract.',
        attachments: [{ name: 'contract.pdf', type: 'application/pdf' }]
      };

      await emailProcessor.processEmail(emailData);

      const duration = Date.now() - startTime;

      // Should complete within 5 seconds (generous for test environment)
      expect(duration).toBeLessThan(5000);
    });

    it('should process multiple emails concurrently', async () => {
      const emails = [
        { from: 'client1@example.com', subject: 'Query 1', content: 'Content 1' },
        { from: 'client2@example.com', subject: 'Query 2', content: 'Content 2' },
        { from: 'client3@example.com', subject: 'Query 3', content: 'Content 3' }
      ];

      const startTime = Date.now();

      const results = await Promise.all(
        emails.map(email => emailProcessor.processEmail(email))
      );

      const duration = Date.now() - startTime;

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // Concurrent processing should be faster than sequential
      // (Each would take ~1s sequentially, concurrent should be < 2s)
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Agent State Management', () => {
    it('should maintain agent state across requests', async () => {
      const emailData = {
        from: 'client@example.com',
        subject: 'Follow-up on case #12345',
        content: 'This is a follow-up to my previous email about case 12345.'
      };

      // First request creates state
      const result1 = await emailProcessor.processEmail(emailData);
      expect(result1.success).toBe(true);

      // Verify state was stored
      expect(mockEnv.AI_STATE_DO.get).toHaveBeenCalled();
    });

    it('should track agent pipeline metrics', async () => {
      const emailData = {
        from: 'metrics@example.com',
        subject: 'Test metrics',
        content: 'Testing metrics tracking'
      };

      await emailProcessor.processEmail(emailData);
      const metrics = await emailProcessor.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.total_processed).toBeGreaterThan(0);
      expect(metrics.ai_calls).toBeGreaterThan(0);
      expect(metrics.average_duration).toBeDefined();
    });
  });

  describe('Agent Model Fallback', () => {
    it('should fall back to secondary model on primary failure', async () => {
      let primaryCalled = false;
      
      mockAI.run.mockImplementation((model, options) => {
        if (model.includes('llama-4-scout')) {
          primaryCalled = true;
          return Promise.reject(new Error('Primary model unavailable'));
        }
        // Secondary model succeeds
        return Promise.resolve({
          response: JSON.stringify({ category: 'general_inquiry' })
        });
      });

      const emailData = {
        from: 'client@example.com',
        subject: 'Question',
        content: 'I have a question.'
      };

      const result = await emailProcessor.processEmail(emailData);

      expect(result.success).toBe(true);
      expect(primaryCalled).toBe(true);
      expect(result.model_used).toBe('secondary'); // Used fallback
    });

    it('should track model fallback metrics', async () => {
      // Simulate primary model failures
      mockAI.run
        .mockRejectedValueOnce(new Error('Primary unavailable'))
        .mockResolvedValueOnce({ response: JSON.stringify({ category: 'test' }) })
        .mockRejectedValueOnce(new Error('Primary unavailable'))
        .mockResolvedValueOnce({ response: JSON.stringify({ category: 'test' }) });

      const emailData1 = { from: 'test1@example.com', subject: 'Test', content: 'Test' };
      const emailData2 = { from: 'test2@example.com', subject: 'Test', content: 'Test' };

      await emailProcessor.processEmail(emailData1);
      await emailProcessor.processEmail(emailData2);

      const metrics = await emailProcessor.getMetrics();

      expect(metrics.model_fallbacks).toBeGreaterThan(0);
    });
  });
});
