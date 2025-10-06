/**
 * Performance Tests - Email Volume Handling
 * Tests ChittyRouter AI Gateway performance under various email loads
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailProcessor } from '../../src/ai/email-processor.js';
import { ChittyRouterAI } from '../../src/ai/intelligent-router.js';
import { AgentOrchestrator } from '../../src/ai/agent-orchestrator.js';
import { mockAI } from '../mocks/ai-responses.js';
import { testEmails, createMockMessage, getRandomTestEmail } from '../data/test-emails.js';

// Mock utilities for performance testing
vi.mock('../../src/utils/chittyid-generator.js', () => ({
  generateEmailChittyID: vi.fn().mockImplementation(() => {
    return Promise.resolve(`CHITTY-PERF-${Date.now()}`);
  })
}));

vi.mock('../../src/utils/storage.js', () => ({
  storeInChittyChain: vi.fn().mockResolvedValue({ success: true }),
  logEmailToChain: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock('../../src/utils/chain-logger.js', () => ({
  logEmailToChain: vi.fn().mockResolvedValue({ success: true })
}));

describe('Performance Tests - Email Volume Handling', () => {
  let processor;
  let router;
  let orchestrator;
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      CHITTY_CHAIN_URL: 'https://test-chain.example.com',
      AI_MODEL: '@cf/meta/llama-3.1-8b-instruct'
    };

    router = new ChittyRouterAI(mockAI, mockEnv);
    processor = new EmailProcessor(mockAI, mockEnv);
    orchestrator = new AgentOrchestrator(mockAI, mockEnv);

    mockAI.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Single Email Processing Performance', () => {
    it('should process single email within 2 seconds', async () => {
      const message = createMockMessage('lawsuit_urgent');

      const startTime = performance.now();
      const result = await processor.processIncomingEmail(message, {});
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(2000); // 2 seconds
      console.log(`Single email processing time: ${processingTime.toFixed(2)}ms`);
    });

    it('should process complex email with attachments within 3 seconds', async () => {
      const message = createMockMessage('document_evidence');

      const startTime = performance.now();
      const result = await processor.processIncomingEmail(message, {});
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(3000); // 3 seconds
      console.log(`Complex email processing time: ${processingTime.toFixed(2)}ms`);
    });

    it('should process emergency email within 1 second', async () => {
      const message = createMockMessage('emergency_injunction');

      const startTime = performance.now();
      const result = await processor.processIncomingEmail(message, {});
      const endTime = performance.now();

      const processingTime = endTime - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(1000); // 1 second for emergencies
      console.log(`Emergency email processing time: ${processingTime.toFixed(2)}ms`);
    });
  });

  describe('Concurrent Email Processing', () => {
    it('should handle 10 concurrent emails efficiently', async () => {
      const emailCount = 10;
      const emails = Array.from({ length: emailCount }, () => {
        const { key } = getRandomTestEmail();
        return createMockMessage(key);
      });

      const startTime = performance.now();

      // Process all emails concurrently
      const promises = emails.map(message =>
        processor.processIncomingEmail(message, {})
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const averageTime = totalTime / emailCount;

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.chittyId).toBeDefined();
      });

      expect(totalTime).toBeLessThan(5000); // Total under 5 seconds
      expect(averageTime).toBeLessThan(1000); // Average under 1 second per email

      console.log(`Concurrent processing: ${emailCount} emails in ${totalTime.toFixed(2)}ms`);
      console.log(`Average time per email: ${averageTime.toFixed(2)}ms`);
    });

    it('should handle 25 concurrent emails under load', async () => {
      const emailCount = 25;
      const emails = Array.from({ length: emailCount }, () => {
        const { key } = getRandomTestEmail();
        return createMockMessage(key);
      });

      const startTime = performance.now();

      const promises = emails.map(message =>
        processor.processIncomingEmail(message, {})
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const averageTime = totalTime / emailCount;
      const throughput = (emailCount / totalTime) * 1000; // emails per second

      // At least 80% should succeed under load
      const successCount = results.filter(r => r.success).length;
      const successRate = successCount / emailCount;

      expect(successRate).toBeGreaterThan(0.8); // 80% success rate minimum
      expect(averageTime).toBeLessThan(2000); // Average under 2 seconds per email

      console.log(`Load test: ${emailCount} emails in ${totalTime.toFixed(2)}ms`);
      console.log(`Success rate: ${(successRate * 100).toFixed(1)}%`);
      console.log(`Throughput: ${throughput.toFixed(2)} emails/second`);
    });

    it('should maintain performance with mixed email types', async () => {
      const emailTypes = [
        'lawsuit_urgent', 'lawsuit_settlement',
        'document_evidence', 'document_filing',
        'emergency_injunction', 'emergency_subpoena',
        'client_consultation', 'client_update_request',
        'general_question', 'appointment_request'
      ];

      const emails = [];
      for (let i = 0; i < 20; i++) {
        const emailType = emailTypes[i % emailTypes.length];
        emails.push(createMockMessage(emailType));
      }

      const startTime = performance.now();

      const promises = emails.map(message =>
        processor.processIncomingEmail(message, {})
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const successCount = results.filter(r => r.success).length;

      expect(successCount).toBe(20); // All should succeed
      expect(totalTime).toBeLessThan(10000); // Under 10 seconds total

      console.log(`Mixed types: 20 emails in ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('AI Routing Performance', () => {
    it('should route 50 emails within acceptable time limits', async () => {
      const emailCount = 50;
      const routingPromises = [];

      const startTime = performance.now();

      for (let i = 0; i < emailCount; i++) {
        const { email } = getRandomTestEmail();
        routingPromises.push(router.intelligentRoute(email));
      }

      const results = await Promise.all(routingPromises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const averageTime = totalTime / emailCount;

      // All routing should succeed
      results.forEach(result => {
        expect(result.chittyId).toBeDefined();
        expect(result.ai.analysis).toBeDefined();
        expect(result.ai.routing).toBeDefined();
      });

      expect(averageTime).toBeLessThan(500); // Under 500ms per routing decision

      console.log(`AI Routing: ${emailCount} emails routed in ${totalTime.toFixed(2)}ms`);
      console.log(`Average routing time: ${averageTime.toFixed(2)}ms`);
    });

    it('should handle routing under memory pressure', async () => {
      const emailCount = 100;
      const batchSize = 10;
      const results = [];

      const startTime = performance.now();

      // Process in batches to simulate memory pressure
      for (let i = 0; i < emailCount; i += batchSize) {
        const batch = [];

        for (let j = 0; j < batchSize && (i + j) < emailCount; j++) {
          const { email } = getRandomTestEmail();
          batch.push(router.intelligentRoute(email));
        }

        const batchResults = await Promise.all(batch);
        results.push(...batchResults);

        // Small delay to simulate real-world conditions
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Most should succeed
      const successCount = results.filter(r => r.chittyId).length;
      const successRate = successCount / emailCount;

      expect(successRate).toBeGreaterThan(0.9); // 90% success rate

      console.log(`Memory pressure test: ${emailCount} emails, ${successRate * 100}% success`);
      console.log(`Total time: ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('Agent Orchestration Performance', () => {
    it('should orchestrate agents efficiently for multiple tasks', async () => {
      const taskCount = 20;
      const tasks = [
        { type: 'case_analysis', caseId: 'CASE_001' },
        { type: 'document_review', documents: ['doc1.pdf'] },
        { type: 'client_communication', clientId: 'CLIENT_001' },
        { type: 'intake_processing', emailData: {} }
      ];

      const promises = [];
      const startTime = performance.now();

      for (let i = 0; i < taskCount; i++) {
        const task = { ...tasks[i % tasks.length], id: `TASK_${i}` };
        promises.push(orchestrator.executeTask(task));
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const averageTime = totalTime / taskCount;

      // Most should succeed
      const successCount = results.filter(r => r.success).length;
      const successRate = successCount / taskCount;

      expect(successRate).toBeGreaterThan(0.8); // 80% success rate
      expect(averageTime).toBeLessThan(1000); // Under 1 second per task

      console.log(`Agent orchestration: ${taskCount} tasks in ${totalTime.toFixed(2)}ms`);
      console.log(`Success rate: ${(successRate * 100).toFixed(1)}%`);
    });
  });

  describe('Memory Usage and Resource Management', () => {
    it('should not accumulate memory during processing', async () => {
      const initialMemory = process.memoryUsage();
      const emailCount = 50;

      // Process emails in sequence to test memory management
      for (let i = 0; i < emailCount; i++) {
        const { key } = getRandomTestEmail();
        const message = createMockMessage(key);

        const result = await processor.processIncomingEmail(message, {});
        expect(result.success).toBe(true);

        // Force garbage collection periodically
        if (i % 10 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePerEmail = memoryIncrease / emailCount;

      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB total`);
      console.log(`Memory per email: ${(memoryIncreasePerEmail / 1024).toFixed(2)}KB`);

      // Memory should not grow excessively
      expect(memoryIncreasePerEmail).toBeLessThan(100 * 1024); // Less than 100KB per email
    });

    it('should handle resource cleanup properly', async () => {
      const emailCount = 30;
      const startTime = performance.now();

      for (let i = 0; i < emailCount; i++) {
        const { key } = getRandomTestEmail();
        const message = createMockMessage(key);

        await processor.processIncomingEmail(message, {});

        // Test that resources are cleaned up
        expect(processor.activeRequests).toBeUndefined(); // No tracking by default
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds

      console.log(`Resource cleanup test: ${emailCount} emails in ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('Error Rate Under Load', () => {
    it('should maintain low error rate under normal load', async () => {
      const emailCount = 40;
      const emails = Array.from({ length: emailCount }, () => {
        const { key } = getRandomTestEmail();
        return createMockMessage(key);
      });

      const promises = emails.map(message =>
        processor.processIncomingEmail(message, {}).catch(error => ({ error: error.message }))
      );

      const results = await Promise.all(promises);

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => r.error).length;
      const fallbackCount = results.filter(r => r.fallback).length;

      const errorRate = errorCount / emailCount;
      const successRate = successCount / emailCount;

      expect(errorRate).toBeLessThan(0.05); // Less than 5% errors
      expect(successRate + (fallbackCount / emailCount)).toBeGreaterThan(0.95); // 95% processed

      console.log(`Error rate test: ${errorRate * 100}% errors, ${successRate * 100}% success`);
    });

    it('should gracefully degrade under extreme load', async () => {
      const emailCount = 100;
      const emails = Array.from({ length: emailCount }, () => {
        const { key } = getRandomTestEmail();
        return createMockMessage(key);
      });

      // Simulate high load with short timeouts
      const promises = emails.map(message =>
        Promise.race([
          processor.processIncomingEmail(message, {}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 3000)
          )
        ]).catch(error => ({ error: error.message }))
      );

      const results = await Promise.all(promises);

      const processedCount = results.filter(r => r.success || r.fallback).length;
      const processingRate = processedCount / emailCount;

      // Should still process most emails even under extreme load
      expect(processingRate).toBeGreaterThan(0.7); // 70% processing rate minimum

      console.log(`Extreme load test: ${processingRate * 100}% processed successfully`);
    });
  });

  describe('Throughput Benchmarks', () => {
    it('should achieve target throughput for production workload', async () => {
      const testDuration = 5000; // 5 seconds
      const targetThroughput = 10; // emails per second

      const emails = [];
      const startTime = performance.now();
      let processedCount = 0;

      // Generate continuous load for test duration
      const loadTest = async () => {
        while (performance.now() - startTime < testDuration) {
          const { key } = getRandomTestEmail();
          const message = createMockMessage(key);

          try {
            const result = await processor.processIncomingEmail(message, {});
            if (result.success || result.fallback) {
              processedCount++;
            }
          } catch (error) {
            // Count errors but continue
          }

          // Small delay to prevent overwhelming
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      };

      await loadTest();

      const actualDuration = performance.now() - startTime;
      const actualThroughput = (processedCount / actualDuration) * 1000;

      expect(actualThroughput).toBeGreaterThan(targetThroughput * 0.8); // 80% of target

      console.log(`Throughput benchmark: ${actualThroughput.toFixed(2)} emails/second`);
      console.log(`Target: ${targetThroughput} emails/second`);
      console.log(`Processed: ${processedCount} emails in ${actualDuration.toFixed(2)}ms`);
    });
  });

  describe('Scalability Tests', () => {
    it('should scale processing time linearly with email count', async () => {
      const emailCounts = [5, 10, 20];
      const timings = [];

      for (const count of emailCounts) {
        const emails = Array.from({ length: count }, () => {
          const { key } = getRandomTestEmail();
          return createMockMessage(key);
        });

        const startTime = performance.now();

        const promises = emails.map(message =>
          processor.processIncomingEmail(message, {})
        );

        await Promise.all(promises);

        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const timePerEmail = totalTime / count;

        timings.push({ count, totalTime, timePerEmail });

        console.log(`${count} emails: ${totalTime.toFixed(2)}ms total, ${timePerEmail.toFixed(2)}ms per email`);
      }

      // Processing time per email should not increase significantly with scale
      const firstTimePerEmail = timings[0].timePerEmail;
      const lastTimePerEmail = timings[timings.length - 1].timePerEmail;

      expect(lastTimePerEmail).toBeLessThan(firstTimePerEmail * 2); // No more than 2x slower
    });
  });
});
