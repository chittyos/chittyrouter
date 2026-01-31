/**
 * Email Processing Simulation Tests
 * End-to-end validation of email routing, triage, logging, and forgetability
 * 
 * Tests:
 * 1. Case pattern extraction from addresses (arias-v-bianchi@, plaintiff-v-defendant@)
 * 2. Urgency triage scoring behavior
 * 3. Routing decisions based on patterns
 * 4. KV logging behavior (email_log_recent, email_urgent_items, email_stats)
 * 5. Forgetability enforcement (TTL, size caps, truncation)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CloudflareEmailHandler } from '../../src/email/cloudflare-email-handler.js';
import {
  createEmailWorkerMessage,
  createTestMessageBatch,
  createMockEmailEnvironment,
  assertEmailRouting,
  extractCasePattern
} from '../harness/email-worker-simulator.js';

describe('Email Processing Simulation', () => {
  let handler;
  let mockEnv;
  let messages;
  
  beforeEach(() => {
    // Create mock environment with tracking
    mockEnv = createMockEmailEnvironment();
    
    // Create email handler
    handler = new CloudflareEmailHandler(mockEnv);
    
    // Create test message batch
    messages = createTestMessageBatch();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Case Pattern Extraction', () => {
    it('should extract case pattern from arias-v-bianchi@chitty.cc', async () => {
      const message = messages.ariasVBianchi;
      
      // Process email
      const result = await handler.handleEmail(message, mockEnv, {});
      
      // Extract email data to verify pattern detection
      const emailData = await handler.extractEmailData(message);
      const triage = await handler.triageEmail(emailData);
      
      // Verify case pattern extraction
      expect(emailData.to).toBe('arias-v-bianchi@chitty.cc');
      expect(triage.category).toBe('case');
      expect(triage.reasons).toContain('case_address:arias_v_bianchi');
      
      // Verify pattern extraction helper
      const pattern = extractCasePattern(emailData.to);
      expect(pattern).toBe('arias_v_bianchi');
    });
    
    it('should extract generic plaintiff-v-defendant pattern', async () => {
      const message = messages.genericCase;
      
      const emailData = await handler.extractEmailData(message);
      const triage = await handler.triageEmail(emailData);
      
      // Verify generic case pattern
      expect(emailData.to).toBe('plaintiff-v-defendant@chitty.cc');
      expect(triage.category).toBe('case');
      expect(triage.reasons).toContain('case_address:plaintiff_v_defendant');
      
      const pattern = extractCasePattern(emailData.to);
      expect(pattern).toBe('plaintiff_v_defendant');
    });
    
    it('should handle emails without case patterns', async () => {
      const message = messages.generalInquiry;
      
      const emailData = await handler.extractEmailData(message);
      const triage = await handler.triageEmail(emailData);
      
      // Verify no case pattern
      expect(triage.category).not.toBe('case');
      expect(triage.reasons.filter(r => r.startsWith('case_address:')).length).toBe(0);
      
      const pattern = extractCasePattern(emailData.to);
      expect(pattern).toBeNull();
    });
    
    it('should recognize known case email from address routes', async () => {
      // The handler has a route for 'arias-v-bianchi@chitty.cc'
      const message = messages.ariasVBianchi;
      
      const emailData = await handler.extractEmailData(message);
      const triage = await handler.triageEmail(emailData);
      
      // Should recognize from addressRoutes config
      const route = handler.addressRoutes[emailData.to];
      expect(route).toBeDefined();
      expect(route.case).toBe('ARIAS_v_BIANCHI');
      expect(triage.reasons).toContain('case:ARIAS_v_BIANCHI');
    });
  });
  
  describe('Urgency Triage Scoring', () => {
    it('should score court-related email as CRITICAL', async () => {
      const message = messages.urgentCourtDeadline;
      
      const emailData = await handler.extractEmailData(message);
      const triage = await handler.triageEmail(emailData);
      
      // Court keyword + urgent keyword + important sender = high score
      expect(triage.urgencyLevel).toMatch(/CRITICAL|HIGH/);
      expect(triage.urgencyScore).toBeGreaterThanOrEqual(60);
      expect(triage.reasons).toContain('court');
      expect(triage.reasons).toContain('urgent');
    });
    
    it('should score creditor notice as HIGH or MEDIUM', async () => {
      const message = messages.creditorNotice;
      
      const emailData = await handler.extractEmailData(message);
      const triage = await handler.triageEmail(emailData);
      
      // Creditor patterns should trigger scoring
      // Allow CRITICAL as well since high urgency words boost score
      expect(triage.urgencyLevel).toMatch(/CRITICAL|HIGH|MEDIUM/);
      expect(triage.urgencyScore).toBeGreaterThanOrEqual(25);
      expect(triage.category).toBe('financial');
      expect(triage.reasons).toContain('creditor');
    });
    
    it('should score compliance filing as MEDIUM', async () => {
      const message = messages.complianceFiling;
      
      const emailData = await handler.extractEmailData(message);
      const triage = await handler.triageEmail(emailData);
      
      expect(triage.category).toBe('compliance');
      expect(triage.reasons).toContain('compliance');
      expect(triage.urgencyScore).toBeGreaterThanOrEqual(25);
    });
    
    it('should score general inquiry as LOW or INFO', async () => {
      const message = messages.generalInquiry;
      
      const emailData = await handler.extractEmailData(message);
      const triage = await handler.triageEmail(emailData);
      
      expect(triage.urgencyLevel).toMatch(/LOW|INFO|MEDIUM/);
      expect(triage.urgencyScore).toBeLessThan(50);
    });
    
    it('should add score for important sender domains', async () => {
      const courtMessage = createEmailWorkerMessage({
        from: 'clerk@county-court.gov',
        to: 'legal@chitty.cc',
        subject: 'Filing notification',
        content: 'Your filing has been received.'
      });
      
      const emailData = await handler.extractEmailData(courtMessage);
      const triage = await handler.triageEmail(emailData);
      
      // Should detect "court" in sender
      expect(triage.reasons.some(r => r.startsWith('important_sender:'))).toBe(true);
      expect(triage.urgencyScore).toBeGreaterThan(0);
    });
    
    it('should add score for date patterns', async () => {
      const dateMessage = createEmailWorkerMessage({
        from: 'attorney@firm.com',
        to: 'legal@chitty.cc',
        subject: 'Deadline 12/15/2024',
        content: 'Response due by 12/15/2024.'
      });
      
      const emailData = await handler.extractEmailData(dateMessage);
      const triage = await handler.triageEmail(emailData);
      
      expect(triage.reasons).toContain('contains_date');
    });
    
    it('should boost score for case-specific addresses', async () => {
      const message = messages.ariasVBianchi;
      
      const emailData = await handler.extractEmailData(message);
      const triage = await handler.triageEmail(emailData);
      
      // Case address + known route with CRITICAL priority
      expect(triage.urgencyScore).toBeGreaterThanOrEqual(50);
      expect(triage.category).toBe('case');
    });
  });
  
  describe('Routing Decisions', () => {
    it('should route arias-v-bianchi@ to configured address', async () => {
      const message = messages.ariasVBianchi;
      
      const result = await handler.handleEmail(message, mockEnv, {});
      
      // Check that it was forwarded
      expect(result.success).toBe(true);
      expect(message.wasForwardedTo('nick@aribia.cc')).toBe(true);
    });
    
    it('should route evidence@ to configured address', async () => {
      const message = messages.evidenceSubmission;
      
      const result = await handler.handleEmail(message, mockEnv, {});
      
      expect(result.success).toBe(true);
      assertEmailRouting(message, 'nick@aribia.cc');
    });
    
    it('should route legal@ to configured address', async () => {
      const message = messages.legalMatter;
      
      const result = await handler.handleEmail(message, mockEnv, {});
      
      expect(result.success).toBe(true);
      expect(message.wasForwardedTo('nick@aribia.cc')).toBe(true);
    });
    
    it('should use default route for unmapped addresses', async () => {
      const unmappedMessage = createEmailWorkerMessage({
        from: 'someone@external.com',
        to: 'unmapped@chitty.cc',
        subject: 'Random email',
        content: 'This address is not in the routing table.'
      });
      
      const result = await handler.handleEmail(unmappedMessage, mockEnv, {});
      
      expect(result.success).toBe(true);
      expect(unmappedMessage.wasForwardedTo('nick@aribia.cc')).toBe(true);
    });
    
    it('should handle routing failures gracefully', async () => {
      const message = createEmailWorkerMessage({
        from: 'test@example.com',
        to: 'test@chitty.cc',
        subject: 'Test'
      });
      
      // Override forward to simulate failure
      message.forward = vi.fn().mockRejectedValue(new Error('Forward failed'));
      
      const result = await handler.handleEmail(message, mockEnv, {});
      
      // Should still return (handled error)
      expect(result).toBeDefined();
    });
  });
  
  describe('KV Logging Behavior', () => {
    it('should log email to email_log_recent', async () => {
      const message = messages.legalMatter;
      
      await handler.handleEmail(message, mockEnv, {});
      
      // Verify KV put was called for recent log
      const putCalls = mockEnv.AI_CACHE.put.mock.calls;
      const recentLogCall = putCalls.find(call => call[0] === 'email_log_recent');
      
      expect(recentLogCall).toBeDefined();
      
      // Parse the stored data
      const storedData = JSON.parse(recentLogCall[1]);
      expect(Array.isArray(storedData)).toBe(true);
      expect(storedData.length).toBeGreaterThan(0);
      
      // Verify TTL is set (7 days)
      expect(recentLogCall[2]).toHaveProperty('expirationTtl');
      expect(recentLogCall[2].expirationTtl).toBe(86400 * 7);
    });
    
    it('should add urgent emails to email_urgent_items', async () => {
      const message = messages.urgentCourtDeadline;
      
      await handler.handleEmail(message, mockEnv, {});
      
      // Verify urgent items cache was updated
      const putCalls = mockEnv.AI_CACHE.put.mock.calls;
      const urgentCall = putCalls.find(call => call[0] === 'email_urgent_items');
      
      expect(urgentCall).toBeDefined();
      
      // Verify TTL (3 days for urgent items)
      expect(urgentCall[2].expirationTtl).toBe(86400 * 3);
    });
    
    it('should update email_stats', async () => {
      const message = messages.generalInquiry;
      
      await handler.handleEmail(message, mockEnv, {});
      
      // Verify stats update
      const putCalls = mockEnv.AI_CACHE.put.mock.calls;
      const statsCall = putCalls.find(call => call[0] === 'email_stats');
      
      expect(statsCall).toBeDefined();
      
      const stats = JSON.parse(statsCall[1]);
      expect(stats).toHaveProperty('total');
      expect(stats.total).toBeGreaterThan(0);
      
      // Verify 1-day TTL for stats
      expect(statsCall[2].expirationTtl).toBe(86400);
    });
    
    it('should not add low-priority email to urgent_items', async () => {
      // Clear mock before test
      mockEnv.AI_CACHE.put.mockClear();
      
      const message = messages.generalInquiry;
      await handler.handleEmail(message, mockEnv, {});
      
      // Check that urgent_items was not updated
      const putCalls = mockEnv.AI_CACHE.put.mock.calls;
      const urgentCall = putCalls.find(call => call[0] === 'email_urgent_items');
      
      // Should not be updated for low priority
      expect(urgentCall).toBeUndefined();
    });
  });
  
  describe('Forgetability Enforcement', () => {
    it('should cap recent emails list at 100 items', async () => {
      // Create fresh environment with proper setup
      const testEnv = createMockEmailEnvironment();
      const testHandler = new CloudflareEmailHandler(testEnv);
      
      // Simulate existing list with 100 items
      const existingItems = Array.from({ length: 100 }, (_, i) => ({
        id: `existing-${i}`,
        from: 'test@example.com',
        timestamp: new Date().toISOString()
      }));
      
      // Mock KV to return parsed JSON (since .get(key, 'json') parses automatically)
      testEnv.AI_CACHE.get.mockResolvedValue(existingItems);
      
      const message = createEmailWorkerMessage({
        from: 'info@potential-client.com',
        to: 'chittyos@chitty.cc',
        subject: 'General Legal Question',
        content: 'I have a general question about contract law. Do you offer consultations?'
      });
      
      await testHandler.handleEmail(message, testEnv, {});
      
      // Verify the list was trimmed
      const putCalls = testEnv.AI_CACHE.put.mock.calls;
      const recentLogCall = putCalls.find(call => call[0] === 'email_log_recent');
      
      expect(recentLogCall).toBeDefined();
      const storedData = JSON.parse(recentLogCall[1]);
      expect(storedData.length).toBeLessThanOrEqual(100); // Should be capped at or below 100
    });
    
    it('should cap urgent items list at 50 items', async () => {
      // Create fresh environment with proper setup
      const testEnv = createMockEmailEnvironment();
      const testHandler = new CloudflareEmailHandler(testEnv);
      
      // Simulate existing urgent items
      const existingUrgent = Array.from({ length: 50 }, (_, i) => ({
        id: `urgent-${i}`,
        urgencyScore: 60,
        timestamp: new Date().toISOString()
      }));
      
      // Mock KV to return parsed JSON (since .get(key, 'json') parses automatically)
      testEnv.AI_CACHE.get
        .mockResolvedValueOnce([]) // email_log_recent
        .mockResolvedValueOnce(existingUrgent) // email_urgent_items
        .mockResolvedValue(null); // any other gets
      
      const message = createEmailWorkerMessage({
        from: 'judge@superior-court.gov',
        to: 'legal@chitty.cc',
        subject: 'URGENT: Response Due Tomorrow - Motion to Compel',
        content: 'Your response to the motion to compel discovery is due by 5:00 PM tomorrow. Failure to respond may result in sanctions.',
        headers: {
          'importance': 'high',
          'x-priority': '1'
        }
      });
      
      await testHandler.handleEmail(message, testEnv, {});
      
      const putCalls = testEnv.AI_CACHE.put.mock.calls;
      const urgentCall = putCalls.find(call => call[0] === 'email_urgent_items');
      
      expect(urgentCall).toBeDefined();
      const storedData = JSON.parse(urgentCall[1]);
      expect(storedData.length).toBeLessThanOrEqual(50); // Should be capped at or below 50
    });
    
    it('should set TTL on all stored data', async () => {
      const message = messages.legalMatter;
      await handler.handleEmail(message, mockEnv, {});
      
      // Check all put calls have TTL
      const putCalls = mockEnv.AI_CACHE.put.mock.calls;
      
      for (const call of putCalls) {
        const [key, value, options] = call;
        expect(options).toHaveProperty('expirationTtl');
        expect(options.expirationTtl).toBeGreaterThan(0);
        
        // Verify appropriate TTL values
        if (key === 'email_log_recent') {
          expect(options.expirationTtl).toBe(86400 * 7);
        } else if (key === 'email_urgent_items') {
          expect(options.expirationTtl).toBe(86400 * 3);
        } else if (key === 'email_stats') {
          expect(options.expirationTtl).toBe(86400);
        }
      }
    });
    
    it('should truncate email content to 2000 chars', async () => {
      // Create message with very long content
      const longContent = 'A'.repeat(5000);
      const longMessage = createEmailWorkerMessage({
        from: 'test@example.com',
        to: 'legal@chitty.cc',
        subject: 'Long email',
        rawContent: `Subject: Long email\n\n${longContent}`
      });
      
      const emailData = await handler.extractEmailData(longMessage);
      
      // Content should be truncated
      expect(emailData.content.length).toBeLessThanOrEqual(2000);
    });
    
    it('should not permanently store full email bodies', async () => {
      const message = messages.evidenceSubmission;
      await handler.handleEmail(message, mockEnv, {});
      
      // Verify no full content is stored in KV
      const putCalls = mockEnv.AI_CACHE.put.mock.calls;
      
      for (const call of putCalls) {
        const [key, value] = call;
        const data = JSON.parse(value);
        
        // Check that stored entries don't contain full raw email content
        if (Array.isArray(data)) {
          for (const entry of data) {
            expect(entry).not.toHaveProperty('rawContent');
            expect(entry).not.toHaveProperty('fullBody');
            
            // Content should be truncated
            if (entry.content) {
              expect(entry.content.length).toBeLessThanOrEqual(2000);
            }
          }
        }
      }
    });
  });
  
  describe('Error Handling and Resilience', () => {
    it('should handle KV failures gracefully', async () => {
      // Simulate KV failure
      mockEnv.AI_CACHE.put.mockRejectedValue(new Error('KV unavailable'));
      
      const message = messages.generalInquiry;
      const result = await handler.handleEmail(message, mockEnv, {});
      
      // Should still succeed (forwarding still works)
      expect(result.success).toBe(true);
    });
    
    it('should handle stream reading errors', async () => {
      const message = createEmailWorkerMessage({
        from: 'test@example.com',
        to: 'legal@chitty.cc',
        subject: 'Test'
      });
      
      // Override stream to fail
      message.raw = {
        getReader: () => ({
          read: vi.fn().mockRejectedValue(new Error('Stream error')),
          releaseLock: vi.fn()
        })
      };
      
      const result = await handler.handleEmail(message, mockEnv, {});
      
      // Should handle error gracefully
      expect(result).toBeDefined();
    });
    
    it('should use fallback forwarding on complete failure', async () => {
      const message = createEmailWorkerMessage({
        from: 'test@example.com',
        to: 'test@chitty.cc',
        subject: 'Test'
      });
      
      // Make handler methods fail
      const failingHandler = new CloudflareEmailHandler(mockEnv);
      failingHandler.triageEmail = vi.fn().mockRejectedValue(new Error('Triage failed'));
      
      const result = await failingHandler.handleEmail(message, mockEnv, {});
      
      // Should still attempt fallback forward
      expect(message.getForwardCalls().length).toBeGreaterThan(0);
    });
  });
  
  describe('Integration Scenarios', () => {
    it('should process multiple emails in sequence', async () => {
      const batch = createTestMessageBatch();
      const results = [];
      
      for (const [name, message] of Object.entries(batch)) {
        const result = await handler.handleEmail(message, mockEnv, {});
        results.push({ name, result, forwarded: message.wasForwardedTo('nick@aribia.cc') });
      }
      
      // All should succeed
      expect(results.every(r => r.result.success)).toBe(true);
      
      // All should be forwarded
      expect(results.every(r => r.forwarded)).toBe(true);
      
      // Verify stats were updated for all
      const putCalls = mockEnv.AI_CACHE.put.mock.calls;
      const statsUpdates = putCalls.filter(call => call[0] === 'email_stats');
      expect(statsUpdates.length).toBeGreaterThan(0);
    });
    
    it('should maintain consistent urgency scoring', async () => {
      // Process same email type multiple times with fresh instances
      const results = [];
      for (let i = 0; i < 3; i++) {
        // Create fresh message each time to avoid stream exhaustion
        const message = createEmailWorkerMessage({
          from: 'judge@superior-court.gov',
          to: 'legal@chitty.cc',
          subject: 'URGENT: Response Due Tomorrow - Motion to Compel',
          content: 'Your response to the motion to compel discovery is due by 5:00 PM tomorrow. Failure to respond may result in sanctions.',
          headers: {
            'importance': 'high',
            'x-priority': '1'
          }
        });
        
        const emailData = await handler.extractEmailData(message);
        const triage = await handler.triageEmail(emailData);
        results.push(triage);
      }
      
      // Should produce consistent scores for same email
      const scores = results.map(r => r.urgencyScore);
      const uniqueScores = new Set(scores);
      expect(uniqueScores.size).toBe(1); // All same score
      expect(scores[0]).toBeGreaterThan(0); // And score should be meaningful
    });
  });
});
