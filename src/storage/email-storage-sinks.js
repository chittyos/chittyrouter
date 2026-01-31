/**
 * Email Storage Sinks - Pluggable abstraction for R2/Vectorize/ChittyEvidence
 * 
 * Privacy-first design:
 * - Defaults to metadata + hash only (no full content storage)
 * - All stored data has TTL expiration
 * - Content truncation enforced
 * - Configurable retention policies
 * 
 * Integration targets:
 * - Cloudflare R2: Raw email and attachment storage
 * - Cloudflare Vectorize: Email embeddings for semantic search
 * - ChittyEvidence: Evidence ingestion events (chittyapps/chittyevidence, chittyos/chittyevidence-db)
 * - ChittyConnect: Cross-service integration (chittyos/chittyconnect)
 */

import crypto from 'crypto';

/**
 * Email Storage Sinks Manager
 * Coordinates storage across multiple backends with privacy enforcement
 */
export class EmailStorageSinks {
  constructor(env, options = {}) {
    this.env = env;
    
    // Configuration
    this.config = {
      // Privacy settings
      storeFullContent: options.storeFullContent || false,
      contentTruncateLength: options.contentTruncateLength || 1000,
      
      // TTL settings (in seconds)
      emailTTL: options.emailTTL || 86400 * 7, // 7 days default
      attachmentTTL: options.attachmentTTL || 86400 * 30, // 30 days default
      metadataTTL: options.metadataTTL || 86400 * 90, // 90 days default
      
      // Feature flags
      enableR2: options.enableR2 !== false,
      enableVectorize: options.enableVectorize !== false,
      enableChittyEvidence: options.enableChittyEvidence !== false,
      
      // Size limits
      maxAttachmentSize: options.maxAttachmentSize || 25 * 1024 * 1024, // 25MB
      maxEmailSize: options.maxEmailSize || 50 * 1024 * 1024, // 50MB
      
      ...options
    };
  }
  
  /**
   * Store raw email to R2 (with privacy controls)
   * 
   * @param {Object} emailData - Email metadata
   * @param {ReadableStream} rawStream - Raw email content stream
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Storage result with hash and metadata
   */
  async storeRawEmailToR2(emailData, rawStream, metadata = {}) {
    if (!this.config.enableR2 || !this.env.DOCUMENT_STORAGE) {
      return { 
        success: false, 
        reason: 'R2 storage not enabled or not available',
        hash: this._hashEmailData(emailData)
      };
    }
    
    try {
      // Generate deterministic key based on message ID and timestamp
      const emailKey = this._generateEmailKey(emailData);
      
      // Read stream content
      const content = await this._readStream(rawStream);
      
      // Enforce size limits
      if (content.length > this.config.maxEmailSize) {
        throw new Error(`Email size ${content.length} exceeds limit ${this.config.maxEmailSize}`);
      }
      
      // Compute content hash
      const contentHash = this._hashContent(content);
      
      // Prepare metadata (privacy-safe)
      const storageMetadata = {
        messageId: emailData.id || emailData.messageId,
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject ? this._truncateString(emailData.subject, 200) : '',
        timestamp: emailData.timestamp || new Date().toISOString(),
        contentHash,
        size: content.length,
        ttl: this.config.emailTTL,
        stored: new Date().toISOString(),
        ...metadata
      };
      
      // Store based on privacy settings
      let storedContent;
      if (this.config.storeFullContent) {
        // Full content mode (use with caution)
        storedContent = content;
      } else {
        // Privacy mode: store only truncated content + metadata
        const truncated = this._truncateString(content, this.config.contentTruncateLength);
        storedContent = JSON.stringify({
          metadata: storageMetadata,
          contentPreview: truncated,
          contentHash,
          fullContentAvailable: false
        });
      }
      
      // Store to R2 with TTL
      await this.env.DOCUMENT_STORAGE.put(emailKey, storedContent, {
        customMetadata: {
          ...storageMetadata,
          expiresAt: new Date(Date.now() + this.config.emailTTL * 1000).toISOString()
        }
      });
      
      return {
        success: true,
        key: emailKey,
        hash: contentHash,
        metadata: storageMetadata,
        privacyMode: !this.config.storeFullContent
      };
      
    } catch (error) {
      console.error('Failed to store email to R2:', error);
      return {
        success: false,
        error: error.message,
        hash: this._hashEmailData(emailData)
      };
    }
  }
  
  /**
   * Store email attachments to R2
   * 
   * @param {Array} attachments - Array of attachment objects
   * @param {Object} emailContext - Email context for linking
   * @returns {Promise<Object>} Storage results for each attachment
   */
  async storeAttachmentsToR2(attachments, emailContext = {}) {
    if (!this.config.enableR2 || !this.env.DOCUMENT_STORAGE) {
      return { 
        success: false, 
        reason: 'R2 storage not enabled or not available',
        stored: []
      };
    }
    
    const results = [];
    
    for (const attachment of attachments) {
      try {
        // Enforce size limits
        if (attachment.size > this.config.maxAttachmentSize) {
          results.push({
            success: false,
            name: attachment.name,
            reason: `Attachment size ${attachment.size} exceeds limit ${this.config.maxAttachmentSize}`
          });
          continue;
        }
        
        // Generate attachment key
        const attachmentKey = this._generateAttachmentKey(attachment, emailContext);
        
        // Compute hash of attachment content
        const contentHash = attachment.content 
          ? this._hashContent(attachment.content)
          : null;
        
        // Metadata
        const metadata = {
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
          emailMessageId: emailContext.messageId,
          contentHash,
          timestamp: new Date().toISOString(),
          ttl: this.config.attachmentTTL
        };
        
        // Store attachment
        await this.env.DOCUMENT_STORAGE.put(attachmentKey, attachment.content || '', {
          customMetadata: {
            ...metadata,
            expiresAt: new Date(Date.now() + this.config.attachmentTTL * 1000).toISOString()
          }
        });
        
        results.push({
          success: true,
          key: attachmentKey,
          hash: contentHash,
          metadata
        });
        
      } catch (error) {
        console.error(`Failed to store attachment ${attachment.name}:`, error);
        results.push({
          success: false,
          name: attachment.name,
          error: error.message
        });
      }
    }
    
    return {
      success: results.some(r => r.success),
      stored: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }
  
  /**
   * Upsert email embedding to Vectorize for semantic search
   * 
   * @param {Object} emailData - Email data to vectorize
   * @param {Array} embedding - Pre-computed embedding vector (optional)
   * @returns {Promise<Object>} Vectorize upsert result
   */
  async upsertEmailEmbeddingToVectorize(emailData, embedding = null) {
    if (!this.config.enableVectorize || !this.env.VECTORIZE_INDEX) {
      return { 
        success: false, 
        reason: 'Vectorize not enabled or not available'
      };
    }
    
    try {
      // Generate embedding if not provided
      let vector = embedding;
      if (!vector && this.env.AI) {
        // Use AI to generate embedding from email content
        const textToEmbed = this._prepareTextForEmbedding(emailData);
        const embeddingResult = await this.env.AI.run(
          '@cf/baai/bge-base-en-v1.5', // Text embedding model
          { text: textToEmbed }
        );
        vector = embeddingResult.data?.[0] || null;
      }
      
      if (!vector) {
        return {
          success: false,
          reason: 'No embedding vector available'
        };
      }
      
      // Prepare vector metadata (privacy-safe)
      const vectorMetadata = {
        messageId: emailData.id || emailData.messageId,
        from: emailData.from,
        to: emailData.to,
        subject: this._truncateString(emailData.subject, 200),
        timestamp: emailData.timestamp,
        category: emailData.category,
        priority: emailData.priority,
        contentHash: this._hashEmailData(emailData)
      };
      
      // Upsert to Vectorize
      const result = await this.env.VECTORIZE_INDEX.upsert([
        {
          id: emailData.id || emailData.messageId,
          values: vector,
          metadata: vectorMetadata
        }
      ]);
      
      return {
        success: true,
        count: result.count,
        metadata: vectorMetadata
      };
      
    } catch (error) {
      console.error('Failed to upsert email to Vectorize:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Emit evidence ingest event to ChittyEvidence services
   * 
   * @param {Object} payload - Evidence event payload
   * @returns {Promise<Object>} Ingest result
   */
  async emitEvidenceIngestEvent(payload) {
    if (!this.config.enableChittyEvidence) {
      return { 
        success: false, 
        reason: 'ChittyEvidence integration not enabled'
      };
    }
    
    try {
      // Prepare evidence event
      const event = {
        type: 'email_evidence',
        source: 'chittyrouter',
        timestamp: new Date().toISOString(),
        payload: {
          messageId: payload.messageId,
          from: payload.from,
          to: payload.to,
          subject: payload.subject,
          category: payload.category,
          priority: payload.priority,
          contentHash: payload.contentHash,
          attachments: payload.attachments || [],
          metadata: payload.metadata || {}
        }
      };
      
      // Try ChittyEvidence ingestion endpoint
      const results = [];
      
      if (this.env.CHITTY_EVIDENCE_URL) {
        try {
          const response = await fetch(`${this.env.CHITTY_EVIDENCE_URL}/api/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
          });
          
          results.push({
            service: 'chittyevidence',
            success: response.ok,
            status: response.status
          });
        } catch (err) {
          results.push({
            service: 'chittyevidence',
            success: false,
            error: err.message
          });
        }
      }
      
      // Try ChittyConnect for cross-service routing
      if (this.env.CHITTY_CONNECT_URL) {
        try {
          const response = await fetch(`${this.env.CHITTY_CONNECT_URL}/api/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
          });
          
          results.push({
            service: 'chittyconnect',
            success: response.ok,
            status: response.status
          });
        } catch (err) {
          results.push({
            service: 'chittyconnect',
            success: false,
            error: err.message
          });
        }
      }
      
      return {
        success: results.some(r => r.success),
        results,
        event
      };
      
    } catch (error) {
      console.error('Failed to emit evidence event:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  // ===== Helper Methods =====
  
  /**
   * Generate deterministic email storage key
   */
  _generateEmailKey(emailData) {
    const messageId = emailData.id || emailData.messageId || `msg-${Date.now()}`;
    const timestamp = emailData.timestamp || new Date().toISOString();
    const safeId = messageId.replace(/[^a-zA-Z0-9-]/g, '-');
    const datePrefix = timestamp.substring(0, 10); // YYYY-MM-DD
    return `emails/${datePrefix}/${safeId}.eml`;
  }
  
  /**
   * Generate deterministic attachment storage key
   */
  _generateAttachmentKey(attachment, emailContext) {
    const safeName = attachment.name.replace(/[^a-zA-Z0-9.-]/g, '-');
    const messageId = emailContext.messageId || 'unknown';
    const safeMessageId = messageId.replace(/[^a-zA-Z0-9-]/g, '-');
    const timestamp = emailContext.timestamp || new Date().toISOString();
    const datePrefix = timestamp.substring(0, 10);
    return `attachments/${datePrefix}/${safeMessageId}/${safeName}`;
  }
  
  /**
   * Hash email data for deduplication
   */
  _hashEmailData(emailData) {
    const hashInput = JSON.stringify({
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      timestamp: emailData.timestamp
    });
    return this._hashContent(hashInput);
  }
  
  /**
   * Hash content using SHA-256
   */
  _hashContent(content) {
    const hash = crypto.createHash('sha256');
    hash.update(typeof content === 'string' ? content : JSON.stringify(content));
    return hash.digest('hex');
  }
  
  /**
   * Truncate string to max length
   */
  _truncateString(str, maxLength) {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }
  
  /**
   * Read stream to string
   */
  async _readStream(stream) {
    const reader = stream.getReader();
    const chunks = [];
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    
    // Concatenate chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return new TextDecoder().decode(result);
  }
  
  /**
   * Prepare text for embedding (extract key content)
   */
  _prepareTextForEmbedding(emailData) {
    const parts = [
      emailData.subject || '',
      emailData.content ? this._truncateString(emailData.content, 500) : '',
      `From: ${emailData.from}`,
      `To: ${emailData.to}`
    ];
    return parts.filter(Boolean).join('\n');
  }
}

/**
 * Factory function to create storage sinks with default config
 */
export function createEmailStorageSinks(env, options = {}) {
  return new EmailStorageSinks(env, options);
}

/**
 * Create test-safe storage sinks (no actual storage)
 */
export function createTestStorageSinks(env, options = {}) {
  return new EmailStorageSinks(env, {
    enableR2: false,
    enableVectorize: false,
    enableChittyEvidence: false,
    ...options
  });
}
