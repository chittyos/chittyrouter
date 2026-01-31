/**
 * Unit Tests for Email Storage Sinks
 * Tests R2, Vectorize, and ChittyEvidence integration sinks
 * Validates privacy enforcement, TTL, and forgetability
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  EmailStorageSinks,
  createEmailStorageSinks,
  createTestStorageSinks
} from '../../src/storage/email-storage-sinks.js';
import { createMockEmailEnvironment } from '../harness/email-worker-simulator.js';

describe('EmailStorageSinks', () => {
  let sinks;
  let mockEnv;
  
  beforeEach(() => {
    mockEnv = createMockEmailEnvironment();
  });
  
  describe('Constructor and Configuration', () => {
    it('should create sinks with default configuration', () => {
      sinks = new EmailStorageSinks(mockEnv);
      
      expect(sinks.config.storeFullContent).toBe(false); // Privacy-first default
      expect(sinks.config.contentTruncateLength).toBe(1000);
      expect(sinks.config.emailTTL).toBe(86400 * 7); // 7 days
      expect(sinks.config.attachmentTTL).toBe(86400 * 30); // 30 days
      expect(sinks.config.enableR2).toBe(true);
      expect(sinks.config.enableVectorize).toBe(true);
      expect(sinks.config.enableChittyEvidence).toBe(true);
    });
    
    it('should accept custom configuration', () => {
      sinks = new EmailStorageSinks(mockEnv, {
        storeFullContent: true,
        contentTruncateLength: 500,
        emailTTL: 3600,
        enableR2: false
      });
      
      expect(sinks.config.storeFullContent).toBe(true);
      expect(sinks.config.contentTruncateLength).toBe(500);
      expect(sinks.config.emailTTL).toBe(3600);
      expect(sinks.config.enableR2).toBe(false);
    });
    
    it('should create test-safe sinks', () => {
      sinks = createTestStorageSinks(mockEnv);
      
      expect(sinks.config.enableR2).toBe(false);
      expect(sinks.config.enableVectorize).toBe(false);
      expect(sinks.config.enableChittyEvidence).toBe(false);
    });
  });
  
  describe('storeRawEmailToR2', () => {
    beforeEach(() => {
      sinks = new EmailStorageSinks(mockEnv);
    });
    
    it('should store email with privacy mode (default)', async () => {
      const emailData = {
        id: 'test-message-123',
        from: 'sender@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Test Email',
        content: 'This is test content',
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const rawStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('Raw email content here'));
          controller.close();
        }
      });
      
      const result = await sinks.storeRawEmailToR2(emailData, rawStream);
      
      expect(result.success).toBe(true);
      expect(result.privacyMode).toBe(true);
      expect(result.key).toContain('emails/2024-01-15/');
      expect(result.hash).toBeDefined();
      expect(result.metadata).toHaveProperty('contentHash');
      expect(result.metadata).toHaveProperty('ttl', 86400 * 7);
      
      // Verify R2 put was called
      expect(mockEnv.DOCUMENT_STORAGE.put).toHaveBeenCalled();
      
      // Verify stored content is truncated/metadata only
      const putCall = mockEnv.DOCUMENT_STORAGE.put.mock.calls[0];
      const storedContent = putCall[1];
      const parsed = JSON.parse(storedContent);
      expect(parsed).toHaveProperty('metadata');
      expect(parsed).toHaveProperty('contentPreview');
      expect(parsed.fullContentAvailable).toBe(false);
    });
    
    it('should store full content when enabled', async () => {
      sinks = new EmailStorageSinks(mockEnv, { storeFullContent: true });
      
      const emailData = {
        id: 'test-123',
        from: 'sender@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Test',
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const rawContent = 'Full raw email content here with all details';
      const rawStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(rawContent));
          controller.close();
        }
      });
      
      const result = await sinks.storeRawEmailToR2(emailData, rawStream);
      
      expect(result.success).toBe(true);
      expect(result.privacyMode).toBe(false);
      
      const putCall = mockEnv.DOCUMENT_STORAGE.put.mock.calls[0];
      const storedContent = putCall[1];
      expect(storedContent).toBe(rawContent);
    });
    
    it('should enforce size limits', async () => {
      sinks = new EmailStorageSinks(mockEnv, { maxEmailSize: 100 });
      
      const emailData = {
        id: 'test-123',
        from: 'sender@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Test',
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const largeContent = 'x'.repeat(200);
      const rawStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(largeContent));
          controller.close();
        }
      });
      
      const result = await sinks.storeRawEmailToR2(emailData, rawStream);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds limit');
    });
    
    it('should set TTL metadata on R2 objects', async () => {
      const emailData = {
        id: 'test-123',
        from: 'sender@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Test',
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const rawStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('content'));
          controller.close();
        }
      });
      
      await sinks.storeRawEmailToR2(emailData, rawStream);
      
      const putCall = mockEnv.DOCUMENT_STORAGE.put.mock.calls[0];
      const options = putCall[2];
      
      expect(options.customMetadata).toHaveProperty('ttl');
      expect(options.customMetadata).toHaveProperty('expiresAt');
      expect(options.customMetadata.ttl).toBe(86400 * 7);
    });
    
    it('should return hash when R2 disabled', async () => {
      sinks = new EmailStorageSinks(mockEnv, { enableR2: false });
      
      const emailData = {
        id: 'test-123',
        from: 'sender@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Test',
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const rawStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('content'));
          controller.close();
        }
      });
      
      const result = await sinks.storeRawEmailToR2(emailData, rawStream);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('not enabled');
      expect(result.hash).toBeDefined(); // Still returns hash
    });
    
    it('should truncate subject in metadata', async () => {
      const longSubject = 'A'.repeat(300);
      const emailData = {
        id: 'test-123',
        from: 'sender@example.com',
        to: 'recipient@chitty.cc',
        subject: longSubject,
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const rawStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('content'));
          controller.close();
        }
      });
      
      const result = await sinks.storeRawEmailToR2(emailData, rawStream);
      
      expect(result.metadata.subject.length).toBeLessThanOrEqual(203); // 200 + "..."
    });
  });
  
  describe('storeAttachmentsToR2', () => {
    beforeEach(() => {
      sinks = new EmailStorageSinks(mockEnv);
    });
    
    it('should store multiple attachments', async () => {
      const attachments = [
        { name: 'doc1.pdf', size: 1024, type: 'application/pdf', content: 'PDF content' },
        { name: 'doc2.xlsx', size: 2048, type: 'application/vnd.ms-excel', content: 'Excel content' }
      ];
      
      const emailContext = {
        messageId: 'test-msg-123',
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const result = await sinks.storeAttachmentsToR2(attachments, emailContext);
      
      expect(result.success).toBe(true);
      expect(result.stored).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results.length).toBe(2);
      
      // Verify each attachment stored
      result.results.forEach((r, idx) => {
        expect(r.success).toBe(true);
        expect(r.key).toContain('attachments/2024-01-15/');
        expect(r.key).toContain(attachments[idx].name);
        expect(r.metadata.ttl).toBe(86400 * 30);
      });
    });
    
    it('should enforce attachment size limits', async () => {
      sinks = new EmailStorageSinks(mockEnv, { maxAttachmentSize: 1000 });
      
      const attachments = [
        { name: 'small.pdf', size: 500, type: 'application/pdf', content: 'OK' },
        { name: 'large.pdf', size: 2000, type: 'application/pdf', content: 'TOO BIG' }
      ];
      
      const result = await sinks.storeAttachmentsToR2(attachments, {});
      
      expect(result.stored).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].reason).toContain('exceeds limit');
    });
    
    it('should set TTL on attachments', async () => {
      const attachments = [
        { name: 'doc.pdf', size: 1024, type: 'application/pdf', content: 'content' }
      ];
      
      await sinks.storeAttachmentsToR2(attachments, { messageId: 'test' });
      
      const putCall = mockEnv.DOCUMENT_STORAGE.put.mock.calls[0];
      const options = putCall[2];
      
      expect(options.customMetadata).toHaveProperty('ttl', 86400 * 30);
      expect(options.customMetadata).toHaveProperty('expiresAt');
    });
    
    it('should handle empty attachments array', async () => {
      const result = await sinks.storeAttachmentsToR2([], {});
      
      expect(result.success).toBe(false);
      expect(result.stored).toBe(0);
      expect(result.results.length).toBe(0);
    });
    
    it('should return failure when R2 disabled', async () => {
      sinks = new EmailStorageSinks(mockEnv, { enableR2: false });
      
      const result = await sinks.storeAttachmentsToR2([{ name: 'test.pdf' }], {});
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('not enabled');
    });
  });
  
  describe('upsertEmailEmbeddingToVectorize', () => {
    beforeEach(() => {
      sinks = new EmailStorageSinks(mockEnv);
      
      // Mock AI embedding generation
      mockEnv.AI.run.mockResolvedValue({
        data: [[0.1, 0.2, 0.3, 0.4, 0.5]] // Mock embedding vector
      });
    });
    
    it('should upsert email embedding with AI-generated vector', async () => {
      const emailData = {
        id: 'test-msg-123',
        messageId: 'test-msg-123',
        from: 'sender@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Important legal matter',
        content: 'This is the email content for embedding',
        timestamp: '2024-01-15T10:00:00Z',
        category: 'legal',
        priority: 'HIGH'
      };
      
      const result = await sinks.upsertEmailEmbeddingToVectorize(emailData);
      
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.metadata).toHaveProperty('messageId');
      expect(result.metadata).toHaveProperty('contentHash');
      
      // Verify AI was called for embedding
      expect(mockEnv.AI.run).toHaveBeenCalledWith(
        '@cf/baai/bge-base-en-v1.5',
        expect.objectContaining({
          text: expect.stringContaining('Important legal matter')
        })
      );
      
      // Verify Vectorize upsert
      expect(mockEnv.VECTORIZE_INDEX.upsert).toHaveBeenCalled();
      const upsertCall = mockEnv.VECTORIZE_INDEX.upsert.mock.calls[0][0];
      expect(upsertCall[0]).toHaveProperty('id', 'test-msg-123');
      expect(upsertCall[0]).toHaveProperty('values');
      expect(upsertCall[0]).toHaveProperty('metadata');
    });
    
    it('should use pre-computed embedding if provided', async () => {
      const emailData = {
        id: 'test-123',
        messageId: 'test-123',
        from: 'test@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Test',
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const precomputedEmbedding = [0.9, 0.8, 0.7, 0.6, 0.5];
      
      const result = await sinks.upsertEmailEmbeddingToVectorize(emailData, precomputedEmbedding);
      
      expect(result.success).toBe(true);
      
      // Should NOT call AI when embedding provided
      expect(mockEnv.AI.run).not.toHaveBeenCalled();
      
      // Should use provided embedding
      const upsertCall = mockEnv.VECTORIZE_INDEX.upsert.mock.calls[0][0];
      expect(upsertCall[0].values).toEqual(precomputedEmbedding);
    });
    
    it('should truncate subject in metadata', async () => {
      const longSubject = 'A'.repeat(300);
      const emailData = {
        id: 'test-123',
        messageId: 'test-123',
        from: 'test@example.com',
        to: 'recipient@chitty.cc',
        subject: longSubject,
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      await sinks.upsertEmailEmbeddingToVectorize(emailData);
      
      const upsertCall = mockEnv.VECTORIZE_INDEX.upsert.mock.calls[0][0];
      expect(upsertCall[0].metadata.subject.length).toBeLessThanOrEqual(203);
    });
    
    it('should return failure when Vectorize disabled', async () => {
      sinks = new EmailStorageSinks(mockEnv, { enableVectorize: false });
      
      const result = await sinks.upsertEmailEmbeddingToVectorize({ id: 'test' });
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('not enabled');
    });
    
    it('should handle embedding generation failure', async () => {
      mockEnv.AI.run.mockResolvedValue({ data: null });
      
      const emailData = {
        id: 'test-123',
        messageId: 'test-123',
        from: 'test@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Test',
        timestamp: '2024-01-15T10:00:00Z'
      };
      
      const result = await sinks.upsertEmailEmbeddingToVectorize(emailData);
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('No embedding vector');
    });
  });
  
  describe('emitEvidenceIngestEvent', () => {
    beforeEach(() => {
      sinks = new EmailStorageSinks(mockEnv);
      
      // Mock fetch for HTTP requests
      global.fetch = vi.fn();
    });
    
    it('should emit event to ChittyEvidence', async () => {
      global.fetch.mockResolvedValue({ ok: true, status: 200 });
      
      const payload = {
        messageId: 'test-msg-123',
        from: 'sender@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Evidence submission',
        category: 'evidence',
        priority: 'HIGH',
        contentHash: 'abc123',
        attachments: ['doc1.pdf', 'doc2.pdf']
      };
      
      const result = await sinks.emitEvidenceIngestEvent(payload);
      
      expect(result.success).toBe(true);
      expect(result.event).toHaveProperty('type', 'email_evidence');
      expect(result.event).toHaveProperty('source', 'chittyrouter');
      expect(result.results.length).toBeGreaterThan(0);
      
      // Verify fetch was called
      expect(global.fetch).toHaveBeenCalled();
      const fetchCalls = global.fetch.mock.calls;
      
      // Should call ChittyEvidence
      expect(fetchCalls.some(call => 
        call[0].includes('evidence.chitty.cc')
      )).toBe(true);
    });
    
    it('should emit to ChittyConnect for cross-service routing', async () => {
      global.fetch.mockResolvedValue({ ok: true, status: 200 });
      
      const payload = {
        messageId: 'test-123',
        from: 'test@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Test',
        contentHash: 'hash123'
      };
      
      const result = await sinks.emitEvidenceIngestEvent(payload);
      
      expect(result.success).toBe(true);
      
      // Should call ChittyConnect
      const fetchCalls = global.fetch.mock.calls;
      expect(fetchCalls.some(call => 
        call[0].includes('connect.chitty.cc')
      )).toBe(true);
    });
    
    it('should handle partial service failures', async () => {
      // First call succeeds, second fails
      global.fetch
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockRejectedValueOnce(new Error('Service unavailable'));
      
      const payload = {
        messageId: 'test-123',
        from: 'test@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Test',
        contentHash: 'hash'
      };
      
      const result = await sinks.emitEvidenceIngestEvent(payload);
      
      expect(result.success).toBe(true); // At least one succeeded
      expect(result.results.length).toBe(2);
      expect(result.results.some(r => r.success)).toBe(true);
      expect(result.results.some(r => !r.success)).toBe(true);
    });
    
    it('should return failure when ChittyEvidence disabled', async () => {
      sinks = new EmailStorageSinks(mockEnv, { enableChittyEvidence: false });
      
      const result = await sinks.emitEvidenceIngestEvent({});
      
      expect(result.success).toBe(false);
      expect(result.reason).toContain('not enabled');
    });
    
    it('should include all required event fields', async () => {
      global.fetch.mockResolvedValue({ ok: true, status: 200 });
      
      const payload = {
        messageId: 'test-123',
        from: 'sender@example.com',
        to: 'recipient@chitty.cc',
        subject: 'Test',
        category: 'legal',
        priority: 'HIGH',
        contentHash: 'hash123',
        attachments: ['doc.pdf'],
        metadata: { caseId: 'CASE-001' }
      };
      
      const result = await sinks.emitEvidenceIngestEvent(payload);
      
      expect(result.event).toHaveProperty('type', 'email_evidence');
      expect(result.event).toHaveProperty('source', 'chittyrouter');
      expect(result.event).toHaveProperty('timestamp');
      expect(result.event.payload).toHaveProperty('messageId');
      expect(result.event.payload).toHaveProperty('contentHash');
      expect(result.event.payload.attachments).toEqual(['doc.pdf']);
      expect(result.event.payload.metadata.caseId).toBe('CASE-001');
    });
  });
  
  describe('Privacy and Forgetability', () => {
    it('should default to privacy-first mode', () => {
      sinks = createEmailStorageSinks(mockEnv);
      
      expect(sinks.config.storeFullContent).toBe(false);
    });
    
    it('should truncate content by default', () => {
      sinks = createEmailStorageSinks(mockEnv);
      
      const longText = 'A'.repeat(2000);
      const truncated = sinks._truncateString(longText, 1000);
      
      expect(truncated.length).toBeLessThanOrEqual(1003); // 1000 + "..."
    });
    
    it('should compute content hashes', () => {
      sinks = createEmailStorageSinks(mockEnv);
      
      const content1 = 'test content';
      const content2 = 'test content';
      const content3 = 'different content';
      
      const hash1 = sinks._hashContent(content1);
      const hash2 = sinks._hashContent(content2);
      const hash3 = sinks._hashContent(content3);
      
      expect(hash1).toBe(hash2); // Same content = same hash
      expect(hash1).not.toBe(hash3); // Different content = different hash
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });
    
    it('should enforce TTL on all storage operations', () => {
      sinks = createEmailStorageSinks(mockEnv);
      
      expect(sinks.config.emailTTL).toBeGreaterThan(0);
      expect(sinks.config.attachmentTTL).toBeGreaterThan(0);
      expect(sinks.config.metadataTTL).toBeGreaterThan(0);
    });
  });
});
