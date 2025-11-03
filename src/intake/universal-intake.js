/**
 * Universal Intake Layer for ChittyRouter
 * Captures EVERYTHING: email, PDF, voice, API, URL, SMS
 * Normalizes to canonical format, attributes source, routes intelligently
 */

import { ChittyRouterAI } from '../ai/intelligent-router.js';
import { DocumentAgent } from '../ai/document-agent.js';
import { MultiCloudStorageManager } from '../storage/multi-cloud-storage-manager.js';
import { TrustEngine } from '../attribution/trust-engine.js';

/**
 * Input types supported by universal intake
 */
export const INPUT_TYPES = {
  EMAIL: 'email',
  PDF: 'pdf',
  VOICE: 'voice',
  API: 'api',
  JSON: 'json',
  URL: 'url',
  SMS: 'sms',
  IMAGE: 'image',
  VIDEO: 'video',
  TEXT: 'text'
};

/**
 * Canonical data format after normalization
 */
export class CanonicalData {
  constructor(data) {
    this.id = data.id;
    this.type = data.type;
    this.content = data.content;
    this.metadata = data.metadata || {};
    this.attribution = data.attribution || {};
    this.timestamp = data.timestamp || new Date().toISOString();
    this.chittyId = data.chittyId;
  }
}

/**
 * Universal Intake Coordinator
 * Main entry point for all data ingestion
 */
export class UniversalIntake {
  constructor(env) {
    this.env = env;
    this.storage = new MultiCloudStorageManager(env);
    this.trustEngine = new TrustEngine(env);
    this.ai = new ChittyRouterAI(env.AI, env);
    this.documentAgent = new DocumentAgent(env);
  }

  /**
   * Main ingestion method - accepts anything
   */
  async ingest(input, options = {}) {
    try {
      console.log('📥 Universal Intake: Starting ingestion', {
        type: input.type || 'unknown',
        size: this.estimateSize(input)
      });

      // Step 1: Detect input type
      const type = await this.detectType(input);
      console.log(`🔍 Detected type: ${type}`);

      // Step 2: Normalize to canonical format
      const normalized = await this.normalize(type, input, options);
      console.log('✅ Normalized to canonical format');

      // Step 3: Extract attribution and trust metadata
      const attributed = await this.attribute(normalized);
      console.log('🔐 Attribution complete', {
        source: attributed.attribution.source,
        trustScore: attributed.attribution.trustScore
      });

      // Step 4: Store in multi-cloud with tier routing
      const stored = await this.store(attributed, options);
      console.log('💾 Stored in multi-cloud', {
        tier: stored.tier,
        locations: stored.locations
      });

      // Step 5: Route to appropriate services
      const routed = await this.route(stored, options);
      console.log('⚙️ Routing complete', {
        destinations: routed.destinations.length
      });

      return {
        success: true,
        id: attributed.id,
        type: attributed.type,
        chittyId: attributed.chittyId,
        attribution: attributed.attribution,
        storage: stored,
        routing: routed,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Universal Intake failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Detect input type from various signals
   */
  async detectType(input) {
    // Explicit type provided
    if (input.type && INPUT_TYPES[input.type.toUpperCase()]) {
      return input.type.toLowerCase();
    }

    // Content-Type header
    if (input.headers?.['content-type']) {
      const contentType = input.headers['content-type'];
      if (contentType.includes('application/json')) return INPUT_TYPES.JSON;
      if (contentType.includes('application/pdf')) return INPUT_TYPES.PDF;
      if (contentType.includes('message/rfc822')) return INPUT_TYPES.EMAIL;
      if (contentType.includes('audio/')) return INPUT_TYPES.VOICE;
      if (contentType.includes('image/')) return INPUT_TYPES.IMAGE;
      if (contentType.includes('video/')) return INPUT_TYPES.VIDEO;
      if (contentType.includes('text/')) return INPUT_TYPES.TEXT;
    }

    // File extension
    if (input.filename) {
      const ext = input.filename.split('.').pop().toLowerCase();
      if (ext === 'pdf') return INPUT_TYPES.PDF;
      if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return INPUT_TYPES.VOICE;
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return INPUT_TYPES.IMAGE;
      if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return INPUT_TYPES.VIDEO;
      if (['json'].includes(ext)) return INPUT_TYPES.JSON;
      if (['txt', 'md', 'csv'].includes(ext)) return INPUT_TYPES.TEXT;
    }

    // URL detection
    if (input.url || (typeof input === 'string' && input.startsWith('http'))) {
      return INPUT_TYPES.URL;
    }

    // Email structure detection
    if (input.to || input.from || input.subject) {
      return INPUT_TYPES.EMAIL;
    }

    // Default to API/JSON for structured data
    if (typeof input === 'object' && !Array.isArray(input)) {
      return INPUT_TYPES.API;
    }

    // Fallback to TEXT
    return INPUT_TYPES.TEXT;
  }

  /**
   * Normalize different input types to canonical format
   */
  async normalize(type, input, options) {
    const normalizers = {
      [INPUT_TYPES.EMAIL]: () => this.normalizeEmail(input),
      [INPUT_TYPES.PDF]: () => this.normalizePDF(input),
      [INPUT_TYPES.VOICE]: () => this.normalizeVoice(input),
      [INPUT_TYPES.API]: () => this.normalizeAPI(input),
      [INPUT_TYPES.JSON]: () => this.normalizeJSON(input),
      [INPUT_TYPES.URL]: () => this.normalizeURL(input),
      [INPUT_TYPES.SMS]: () => this.normalizeSMS(input),
      [INPUT_TYPES.IMAGE]: () => this.normalizeImage(input),
      [INPUT_TYPES.VIDEO]: () => this.normalizeVideo(input),
      [INPUT_TYPES.TEXT]: () => this.normalizeText(input)
    };

    const normalizer = normalizers[type];
    if (!normalizer) {
      throw new Error(`No normalizer found for type: ${type}`);
    }

    const normalized = await normalizer();

    // Generate ChittyID
    normalized.chittyId = await this.generateChittyId(type, normalized);

    return new CanonicalData(normalized);
  }

  /**
   * Normalize email to canonical format
   */
  async normalizeEmail(input) {
    return {
      id: input.messageId || `email-${Date.now()}`,
      type: INPUT_TYPES.EMAIL,
      content: {
        subject: input.subject,
        body: input.body || input.text || input.html,
        from: input.from,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        attachments: input.attachments || []
      },
      metadata: {
        receivedAt: input.receivedAt || new Date().toISOString(),
        headers: input.headers,
        size: this.estimateSize(input)
      }
    };
  }

  /**
   * Normalize PDF to canonical format
   */
  async normalizePDF(input) {
    // Use document agent to extract text and metadata
    const extracted = await this.documentAgent.analyzePDF({
      content: input.content || input.buffer,
      filename: input.filename
    });

    return {
      id: `pdf-${Date.now()}`,
      type: INPUT_TYPES.PDF,
      content: {
        text: extracted.text,
        pages: extracted.pages,
        metadata: extracted.metadata,
        tables: extracted.tables,
        images: extracted.images
      },
      metadata: {
        filename: input.filename,
        size: input.size || this.estimateSize(input),
        pageCount: extracted.pages?.length || 0
      }
    };
  }

  /**
   * Normalize voice/audio to canonical format
   */
  async normalizeVoice(input) {
    // Use Cloudflare AI Whisper model for transcription
    const transcription = await this.env.AI.run('@cf/openai/whisper', {
      audio: input.audio || input.buffer || input.content
    });

    return {
      id: `voice-${Date.now()}`,
      type: INPUT_TYPES.VOICE,
      content: {
        transcription: transcription.text,
        language: transcription.language,
        duration: input.duration,
        confidence: transcription.confidence
      },
      metadata: {
        filename: input.filename,
        format: input.format || 'unknown',
        size: input.size || this.estimateSize(input)
      }
    };
  }

  /**
   * Normalize API/structured data to canonical format
   */
  async normalizeAPI(input) {
    return {
      id: input.id || `api-${Date.now()}`,
      type: INPUT_TYPES.API,
      content: input.data || input.payload || input,
      metadata: {
        endpoint: input.endpoint,
        method: input.method,
        headers: input.headers,
        timestamp: input.timestamp || new Date().toISOString()
      }
    };
  }

  /**
   * Normalize JSON data to canonical format
   */
  async normalizeJSON(input) {
    const data = typeof input === 'string' ? JSON.parse(input) : input;

    return {
      id: data.id || `json-${Date.now()}`,
      type: INPUT_TYPES.JSON,
      content: data,
      metadata: {
        schema: this.inferSchema(data),
        size: this.estimateSize(data)
      }
    };
  }

  /**
   * Normalize URL/web content to canonical format
   */
  async normalizeURL(input) {
    const url = input.url || input;

    // Fetch URL content
    const response = await fetch(url);
    const html = await response.text();

    // Basic HTML parsing (in production, use proper HTML parser)
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      id: `url-${Date.now()}`,
      type: INPUT_TYPES.URL,
      content: {
        url,
        title: this.extractTitle(html),
        text,
        html
      },
      metadata: {
        fetchedAt: new Date().toISOString(),
        contentType: response.headers.get('content-type'),
        size: html.length
      }
    };
  }

  /**
   * Normalize SMS/text message to canonical format
   */
  async normalizeSMS(input) {
    return {
      id: input.id || `sms-${Date.now()}`,
      type: INPUT_TYPES.SMS,
      content: {
        body: input.body || input.text,
        from: input.from,
        to: input.to
      },
      metadata: {
        receivedAt: input.receivedAt || new Date().toISOString(),
        provider: input.provider
      }
    };
  }

  /**
   * Normalize image to canonical format
   */
  async normalizeImage(input) {
    // Use Cloudflare AI vision model for description
    const description = await this.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
      image: input.image || input.buffer || input.content,
      prompt: 'Describe this image in detail, including any text visible.'
    });

    return {
      id: `image-${Date.now()}`,
      type: INPUT_TYPES.IMAGE,
      content: {
        description: description.text,
        width: input.width,
        height: input.height,
        format: input.format
      },
      metadata: {
        filename: input.filename,
        size: input.size || this.estimateSize(input)
      }
    };
  }

  /**
   * Normalize video to canonical format
   */
  async normalizeVideo(input) {
    return {
      id: `video-${Date.now()}`,
      type: INPUT_TYPES.VIDEO,
      content: {
        duration: input.duration,
        format: input.format,
        resolution: input.resolution
      },
      metadata: {
        filename: input.filename,
        size: input.size || this.estimateSize(input)
      }
    };
  }

  /**
   * Normalize plain text to canonical format
   */
  async normalizeText(input) {
    const text = typeof input === 'string' ? input : input.text || input.content;

    return {
      id: `text-${Date.now()}`,
      type: INPUT_TYPES.TEXT,
      content: {
        text
      },
      metadata: {
        length: text.length,
        wordCount: text.split(/\s+/).length
      }
    };
  }

  /**
   * Extract attribution metadata and trust score
   */
  async attribute(normalized) {
    // Calculate trust score
    const trustScore = await this.trustEngine.scoreInput(normalized);

    // Add attribution metadata
    normalized.attribution = {
      source: this.extractSource(normalized),
      author: this.extractAuthor(normalized),
      timestamp: normalized.timestamp,
      trustScore: trustScore.trustScore,
      trustDimensions: trustScore.dimensions,
      verified: trustScore.verified,
      confidence: trustScore.confidence
    };

    return normalized;
  }

  /**
   * Store in multi-cloud with tier routing
   */
  async store(data, options) {
    const storageOptions = {
      accessPattern: options.accessPattern || this.predictAccessPattern(data),
      retentionDays: options.retentionDays || this.calculateRetention(data),
      dataType: data.type,
      ...options
    };

    const result = await this.storage.store(
      `intake/${data.type}/${data.id}.json`,
      data,
      storageOptions
    );

    return {
      ...result,
      locations: this.extractLocations(result)
    };
  }

  /**
   * Route to appropriate services based on content and context
   */
  async route(data, options) {
    // Use AI to determine routing
    const routingDecision = await this.ai.route({
      type: data.type,
      content: data.content,
      attribution: data.attribution,
      metadata: data.metadata
    });

    const destinations = [];

    // Always route to registry
    destinations.push({
      service: 'registry',
      endpoint: `${this.env.REGISTRY_ENDPOINT}/api/v1/register-intake`,
      data: {
        id: data.id,
        type: data.type,
        chittyId: data.chittyId,
        timestamp: data.timestamp
      }
    });

    // Route based on AI decision
    if (routingDecision.routes) {
      destinations.push(...routingDecision.routes);
    }

    // Execute routing
    const results = await Promise.allSettled(
      destinations.map(dest => this.invokeDestination(dest))
    );

    return {
      destinations: destinations.map((d, i) => ({
        ...d,
        result: results[i].status === 'fulfilled' ? results[i].value : results[i].reason
      }))
    };
  }

  // ============ Helper Methods ============

  async generateChittyId(type, data) {
    try {
      const response = await fetch(`${this.env.CHITTYID_ENDPOINT || 'https://id.chitty.cc'}/api/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ChittyOS-Service': 'chittyrouter-intake'
        },
        body: JSON.stringify({
          for: 'chittyrouter-intake',
          purpose: `Universal intake: ${type}`,
          requester: 'chittyrouter'
        })
      });

      if (response.ok) {
        const result = await response.json();
        return result.chittyId;
      }
    } catch (error) {
      console.warn('⚠️ ChittyID generation failed:', error.message);
    }

    // Fallback
    return `INTAKE-${type.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }

  extractSource(data) {
    if (data.type === INPUT_TYPES.EMAIL) {
      return data.content.from;
    }
    if (data.type === INPUT_TYPES.URL) {
      return data.content.url;
    }
    if (data.metadata?.endpoint) {
      return data.metadata.endpoint;
    }
    return 'unknown';
  }

  extractAuthor(data) {
    if (data.content?.from) return data.content.from;
    if (data.content?.author) return data.content.author;
    return 'unknown';
  }

  predictAccessPattern(data) {
    // Recent data = frequent access
    const age = Date.now() - new Date(data.timestamp).getTime();
    if (age < 24 * 60 * 60 * 1000) return 'frequent'; // < 1 day
    if (age < 7 * 24 * 60 * 60 * 1000) return 'moderate'; // < 1 week
    return 'infrequent';
  }

  calculateRetention(data) {
    // Default retention policies by type
    const retentionPolicies = {
      [INPUT_TYPES.EMAIL]: 365,
      [INPUT_TYPES.PDF]: 1825, // 5 years
      [INPUT_TYPES.VOICE]: 90,
      [INPUT_TYPES.API]: 30,
      [INPUT_TYPES.JSON]: 30,
      [INPUT_TYPES.URL]: 90,
      [INPUT_TYPES.SMS]: 365,
      [INPUT_TYPES.IMAGE]: 365,
      [INPUT_TYPES.VIDEO]: 90,
      [INPUT_TYPES.TEXT]: 365
    };

    return retentionPolicies[data.type] || 365;
  }

  extractLocations(storageResult) {
    const locations = [];
    if (storageResult.primary) locations.push(storageResult.primary.provider);
    if (storageResult.backup) locations.push(storageResult.backup.provider);
    return locations;
  }

  async invokeDestination(destination) {
    const response = await fetch(destination.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ChittyOS-Service': 'chittyrouter-intake'
      },
      body: JSON.stringify(destination.data)
    });

    return {
      status: response.status,
      ok: response.ok,
      data: response.ok ? await response.json() : null
    };
  }

  estimateSize(input) {
    if (input.size) return input.size;
    if (input.length) return input.length;
    if (typeof input === 'string') return Buffer.byteLength(input, 'utf8');
    return Buffer.byteLength(JSON.stringify(input), 'utf8');
  }

  inferSchema(data) {
    const schema = {};
    for (const key in data) {
      schema[key] = typeof data[key];
    }
    return schema;
  }

  extractTitle(html) {
    const match = html.match(/<title>(.*?)<\/title>/i);
    return match ? match[1] : 'Untitled';
  }
}

export default UniversalIntake;
