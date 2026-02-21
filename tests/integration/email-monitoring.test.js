/**
 * Integration Tests for Email Monitoring System
 * Tests the inbox monitoring, Gmail integration, and email routing flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InboxMonitor } from '../../src/email/inbox-monitor.js';
import { testUtils } from '../setup/test-setup.js';

describe('Email Monitoring Integration', () => {
  let mockEnv;
  let inboxMonitor;

  beforeEach(() => {
    // Create comprehensive mock environment
    mockEnv = {
      // Gmail OAuth tokens (KV namespace)
      GMAIL_TOKENS: {
        get: vi.fn().mockResolvedValue(JSON.stringify({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_at: Date.now() + 3600000
        })),
        put: vi.fn().mockResolvedValue(undefined)
      },
      
      // Email routing configuration
      EMAIL_MONITOR_ENABLED: 'true',
      GMAIL_CLIENT_ID: 'test-client-id',
      GMAIL_CLIENT_SECRET: 'test-secret',
      INBOX_CHECK_INTERVAL: '900', // 15 minutes
      
      // AI bindings for email analysis
      AI: {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify({
            category: 'urgent_legal_matter',
            priority: 'HIGH',
            requires_immediate_attention: true,
            confidence: 0.92
          })
        })
      },
      
      // Notification system (for urgent emails)
      NOTIFICATION_WEBHOOK: 'https://notifications.chitty.cc/webhook',
      
      // Environment info
      ENVIRONMENT: 'test',
      VERSION: '2.1.0-ai'
    };

    // Mock global fetch for Gmail API calls
    globalThis.fetch = vi.fn();

    inboxMonitor = new InboxMonitor(mockEnv);
  });

  describe('Inbox Monitoring', () => {
    it('should check inbox for new messages', async () => {
      // Mock Gmail API response
      globalThis.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
        messages: [
          { id: 'msg-1', threadId: 'thread-1' },
          { id: 'msg-2', threadId: 'thread-2' }
        ]
      }), { status: 200 }));

      const result = await inboxMonitor.checkInbox();

      expect(result.success).toBe(true);
      expect(result.messages_found).toBe(2);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('gmail.googleapis.com/gmail/v1/users/me/messages'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-access-token'
          })
        })
      );
    });

    it('should handle empty inbox', async () => {
      globalThis.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
        messages: []
      }), { status: 200 }));

      const result = await inboxMonitor.checkInbox();

      expect(result.success).toBe(true);
      expect(result.messages_found).toBe(0);
    });

    it('should refresh expired OAuth token', async () => {
      // Mock expired token
      mockEnv.GMAIL_TOKENS.get.mockResolvedValueOnce(JSON.stringify({
        access_token: 'expired-token',
        refresh_token: 'test-refresh-token',
        expires_at: Date.now() - 1000 // Expired
      }));

      // Mock token refresh response
      globalThis.fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({
          access_token: 'new-access-token',
          expires_in: 3600
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          messages: []
        }), { status: 200 }));

      const result = await inboxMonitor.checkInbox();

      expect(result.success).toBe(true);
      expect(mockEnv.GMAIL_TOKENS.put).toHaveBeenCalledWith(
        'gmail_oauth_token',
        expect.stringContaining('new-access-token')
      );
    });

    it('should handle Gmail API errors gracefully', async () => {
      globalThis.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          code: 401,
          message: 'Invalid credentials'
        }
      }), { status: 401 }));

      const result = await inboxMonitor.checkInbox();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid credentials');
    });
  });

  describe('Email Analysis and Routing', () => {
    it('should analyze urgent email and trigger notifications', async () => {
      const mockEmail = {
        id: 'urgent-msg-1',
        payload: {
          headers: [
            { name: 'From', value: 'client@example.com' },
            { name: 'To', value: 'legal@chitty.cc' },
            { name: 'Subject', value: 'URGENT: Court deadline tomorrow' }
          ],
          body: {
            data: Buffer.from('This is an urgent legal matter requiring immediate attention.').toString('base64')
          }
        }
      };

      // Mock Gmail message fetch
      globalThis.fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({
          messages: [{ id: 'urgent-msg-1' }]
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockEmail), { status: 200 }))
        .mockResolvedValueOnce(new Response('OK', { status: 200 })); // Notification webhook

      const result = await inboxMonitor.processNewMessages();

      expect(result.processed).toBe(1);
      expect(result.urgent_count).toBe(1);
      
      // Verify AI was called for analysis
      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          prompt: expect.stringContaining('URGENT')
        })
      );

      // Verify notification was sent
      const notificationCalls = globalThis.fetch.mock.calls.filter(
        call => call[0].includes('notifications.chitty.cc')
      );
      expect(notificationCalls.length).toBe(1);
    });

    it('should handle normal priority emails without notifications', async () => {
      const mockEmail = {
        id: 'normal-msg-1',
        payload: {
          headers: [
            { name: 'From', value: 'inquiry@example.com' },
            { name: 'To', value: 'info@chitty.cc' },
            { name: 'Subject', value: 'General inquiry' }
          ],
          body: {
            data: Buffer.from('I have a question about your services.').toString('base64')
          }
        }
      };

      // Override AI response for normal priority
      mockEnv.AI.run.mockResolvedValueOnce({
        response: JSON.stringify({
          category: 'general_inquiry',
          priority: 'NORMAL',
          requires_immediate_attention: false,
          confidence: 0.85
        })
      });

      globalThis.fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({
          messages: [{ id: 'normal-msg-1' }]
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockEmail), { status: 200 }));

      const result = await inboxMonitor.processNewMessages();

      expect(result.processed).toBe(1);
      expect(result.urgent_count).toBe(0);
      
      // Verify no notification webhook was called
      const notificationCalls = globalThis.fetch.mock.calls.filter(
        call => call[0].includes('notifications.chitty.cc')
      );
      expect(notificationCalls.length).toBe(0);
    });

    it('should extract and analyze email attachments', async () => {
      const mockEmailWithAttachment = {
        id: 'msg-with-attachment',
        payload: {
          headers: [
            { name: 'From', value: 'client@example.com' },
            { name: 'Subject', value: 'Contract for review' }
          ],
          body: {
            data: Buffer.from('Please review the attached contract.').toString('base64')
          },
          parts: [
            {
              filename: 'contract.pdf',
              mimeType: 'application/pdf',
              body: {
                attachmentId: 'att-123',
                size: 50000
              }
            }
          ]
        }
      };

      globalThis.fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({
          messages: [{ id: 'msg-with-attachment' }]
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(mockEmailWithAttachment), { status: 200 }));

      const result = await inboxMonitor.processNewMessages();

      expect(result.processed).toBe(1);
      expect(result.attachments_found).toBeGreaterThan(0);
    });
  });

  describe('Scheduled Monitoring (Cron)', () => {
    it('should execute scheduled inbox check', async () => {
      const cronEvent = {
        type: 'scheduled',
        cron: '*/15 * * * *', // Every 15 minutes
        scheduledTime: Date.now()
      };

      globalThis.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
        messages: []
      }), { status: 200 }));

      const result = await inboxMonitor.handleScheduled(cronEvent);

      expect(result.success).toBe(true);
      expect(result.checked_at).toBeDefined();
    });

    it('should track last check timestamp', async () => {
      globalThis.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
        messages: []
      }), { status: 200 }));

      await inboxMonitor.checkInbox();
      const status = await inboxMonitor.getStatus();

      expect(status.last_check).toBeDefined();
      expect(typeof status.last_check).toBe('string');
      expect(new Date(status.last_check).toString()).not.toBe('Invalid Date');
    });

    it('should prevent concurrent monitoring runs', async () => {
      // Start two monitoring runs simultaneously
      const promise1 = inboxMonitor.checkInbox();
      const promise2 = inboxMonitor.checkInbox();

      globalThis.fetch.mockResolvedValue(new Response(JSON.stringify({
        messages: []
      }), { status: 200 }));

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, one should be skipped
      expect(result1.success || result2.success).toBe(true);
      if (result1.success && result2.success) {
        // If both succeeded, they should not overlap
        expect(result1.checked_at).not.toBe(result2.checked_at);
      }
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should retry failed Gmail API calls', async () => {
      // First call fails, second succeeds
      globalThis.fetch
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          messages: []
        }), { status: 200 }));

      const result = await inboxMonitor.checkInbox({ retries: 2 });

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle rate limiting gracefully', async () => {
      globalThis.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          code: 429,
          message: 'Rate limit exceeded'
        }
      }), { 
        status: 429,
        headers: { 'Retry-After': '60' }
      }));

      const result = await inboxMonitor.checkInbox();

      expect(result.success).toBe(false);
      expect(result.retry_after).toBe(60);
    });

    it('should log monitoring errors without crashing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      globalThis.fetch.mockRejectedValueOnce(new Error('Unexpected error'));

      const result = await inboxMonitor.checkInbox();

      expect(result.success).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Status and Health Monitoring', () => {
    it('should provide monitoring status', async () => {
      const status = await inboxMonitor.getStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('last_check');
      expect(status).toHaveProperty('messages_processed');
      expect(status).toHaveProperty('errors');
    });

    it('should track success rate metrics', async () => {
      // Perform multiple checks
      globalThis.fetch.mockResolvedValue(new Response(JSON.stringify({
        messages: []
      }), { status: 200 }));

      await inboxMonitor.checkInbox();
      await inboxMonitor.checkInbox();
      await inboxMonitor.checkInbox();

      const metrics = await inboxMonitor.getMetrics();

      expect(metrics.total_checks).toBeGreaterThan(0);
      expect(metrics.success_rate).toBeGreaterThan(0);
    });
  });
});
