/**
 * NotionAtomicFactsSync - Hardened sync worker for AtomicFacts → Notion
 * ChittyRouter → EvidenceEnvelope → AtomicFacts → Notion Database
 */

// Workers-compatible Notion client (uses fetch instead of SDK)
class NotionClient {
  constructor(options) {
    this.auth = options.auth;
    this.baseUrl = 'https://api.notion.com/v1';
  }

  get databases() {
    return {
      query: async (params) => {
        const response = await fetch(`${this.baseUrl}/databases/${params.database_id}/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.auth}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
          },
          body: JSON.stringify({
            filter: params.filter,
            page_size: params.page_size || 100
          })
        });
        return response.json();
      }
    };
  }

  get pages() {
    return {
      create: async (params) => {
        const response = await fetch(`${this.baseUrl}/pages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.auth}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
          },
          body: JSON.stringify(params)
        });
        return response.json();
      },
      update: async (params) => {
        const response = await fetch(`${this.baseUrl}/pages/${params.page_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.auth}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
          },
          body: JSON.stringify(params)
        });
        return response.json();
      }
    };
  }
}

// These are set from env in the constructor
let NOTION_DB_ATOMIC_FACTS = null;
let NOTION_TOKEN = null;
const MAX_RETRIES = 5;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 200;
const MAX_TEXT_LENGTH = 2000; // Notion text limit

// Schema mapping: AtomicFacts → Notion properties
const FIELD_MAP = {
  factId: 'Fact ID',
  parentArtifactId: 'Parent Document',
  factText: 'Fact Text',
  factType: 'Fact Type',
  locationRef: 'Location in Document',
  classification: 'Classification Level',
  weight: 'Weight',
  credibility: 'Credibility Factors',
  chainStatus: 'ChittyChain Status',
  verifiedAt: 'Verification Date',
  verificationMethod: 'Verification Method',
  externalId: 'External ID'
};

// Valid enum values for select fields
const ENUMS = {
  factType: ['DATE', 'AMOUNT', 'ADMISSION', 'IDENTITY', 'LOCATION', 'RELATIONSHIP', 'ACTION', 'STATUS'],
  classification: ['FACT', 'SUPPORTED_CLAIM', 'ASSERTION', 'ALLEGATION', 'CONTRADICTION'],
  chainStatus: ['Minted', 'Pending', 'Rejected'],
  credibility: ['DIRECT_EVIDENCE', 'WITNESS_TESTIMONY', 'EXPERT_OPINION', 'DOCUMENTARY', 'CIRCUMSTANTIAL', 'BLOCKCHAIN_VERIFIED']
};

// Metrics collector
class SyncMetrics {
  constructor() {
    this.counters = {
      notion_ok: 0,
      notion_429: 0,
      notion_5xx: 0,
      schema_mismatch: 0,
      upsert_skipped: 0,
      dlq_pushed: 0
    };
  }

  increment(metric) {
    this.counters[metric] = (this.counters[metric] || 0) + 1;
  }

  get summary() {
    return { ...this.counters, timestamp: new Date().toISOString() };
  }
}

export class NotionAtomicFactsSync {
  constructor(env) {
    this.env = env;
    this.notion = new NotionClient({ auth: env.NOTION_TOKEN || NOTION_TOKEN });
    this.databaseId = env.NOTION_DATABASE_ID_ATOMIC_FACTS || NOTION_DB_ATOMIC_FACTS;
    this.metrics = new SyncMetrics();
    this.dlq = [];
  }

  /**
   * Main sync entry point
   */
  async sync(facts, options = {}) {
    const { dryRun = false, validateOnly = false } = options;
    const results = {
      created: [],
      updated: [],
      skipped: [],
      errors: []
    };

    // Validate configuration
    if (!this.databaseId || !this.notion.auth) {
      throw new Error('Missing Notion configuration: database_id or token');
    }

    // Validate database exists and get schema
    const schema = await this.fetchDatabaseSchema();
    if (!schema) {
      throw new Error('Cannot access Notion database');
    }

    // Process facts in batches
    for (let i = 0; i < facts.length; i += BATCH_SIZE) {
      const batch = facts.slice(i, i + BATCH_SIZE);

      for (const fact of batch) {
        try {
          // Validate and transform fact
          const validation = this.validateFact(fact, schema);
          if (!validation.valid) {
            this.metrics.increment('schema_mismatch');
            results.errors.push({
              factId: fact.factId,
              error: validation.error,
              fact
            });
            continue;
          }

          if (validateOnly) {
            results.skipped.push(fact.factId);
            continue;
          }

          // Transform to Notion payload
          const payload = this.transformToNotion(fact, schema);

          if (dryRun) {
            console.log('DRY RUN:', JSON.stringify(payload, null, 2));
            results.skipped.push(fact.factId);
            continue;
          }

          // Upsert with idempotency
          const result = await this.upsertFact(payload, fact.factId);

          if (result.created) {
            results.created.push(fact.factId);
            this.metrics.increment('notion_ok');
          } else if (result.updated) {
            results.updated.push(fact.factId);
            this.metrics.increment('notion_ok');
          } else {
            results.skipped.push(fact.factId);
            this.metrics.increment('upsert_skipped');
          }
        } catch (error) {
          await this.handleError(error, fact, results);
        }
      }

      // Rate limit protection
      if (i + BATCH_SIZE < facts.length) {
        await this.delay(BATCH_DELAY_MS);
      }
    }

    return {
      ...results,
      metrics: this.metrics.summary,
      dlq: this.dlq
    };
  }

  /**
   * Fetch and validate database schema
   */
  async fetchDatabaseSchema() {
    try {
      const database = await this.notion.databases.retrieve({
        database_id: this.databaseId
      });

      const properties = {};
      for (const [key, config] of Object.entries(database.properties)) {
        properties[key] = {
          type: config.type,
          options: config[config.type]?.options || []
        };
      }

      return { properties, title: database.title };
    } catch (error) {
      console.error('Failed to fetch database schema:', error);
      return null;
    }
  }

  /**
   * Validate fact against schema
   */
  validateFact(fact, schema) {
    const errors = [];
    const requiredFields = ['factId', 'factText', 'factType'];

    // Check required fields
    for (const field of requiredFields) {
      if (!fact[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate enum values
    if (fact.factType && !ENUMS.factType.includes(fact.factType)) {
      errors.push(`Invalid factType: ${fact.factType}`);
    }

    if (fact.classification && !ENUMS.classification.includes(fact.classification)) {
      errors.push(`Invalid classification: ${fact.classification}`);
    }

    if (fact.chainStatus && !ENUMS.chainStatus.includes(fact.chainStatus)) {
      errors.push(`Invalid chainStatus: ${fact.chainStatus}`);
    }

    // Validate schema properties exist
    for (const [sourceField, notionField] of Object.entries(FIELD_MAP)) {
      if (fact[sourceField] !== undefined && !schema.properties[notionField]) {
        errors.push(`Notion property missing: ${notionField}`);
      }
    }

    return {
      valid: errors.length === 0,
      error: errors.join('; ')
    };
  }

  /**
   * Transform fact to Notion page properties
   */
  transformToNotion(fact, schema) {
    const properties = {};

    // Title property (Fact ID)
    properties[FIELD_MAP.factId] = {
      title: [{
        text: { content: fact.factId }
      }]
    };

    // Rich text properties
    if (fact.parentArtifactId) {
      properties[FIELD_MAP.parentArtifactId] = {
        rich_text: [{
          text: { content: fact.parentArtifactId }
        }]
      };
    }

    if (fact.factText) {
      const text = fact.factText.substring(0, MAX_TEXT_LENGTH);
      properties[FIELD_MAP.factText] = {
        rich_text: [{
          text: { content: text }
        }]
      };
    }

    // Select properties
    if (fact.factType) {
      properties[FIELD_MAP.factType] = {
        select: { name: fact.factType }
      };
    }

    if (fact.classification) {
      properties[FIELD_MAP.classification] = {
        select: { name: fact.classification }
      };
    }

    if (fact.chainStatus) {
      properties[FIELD_MAP.chainStatus] = {
        select: { name: fact.chainStatus }
      };
    }

    // Multi-select property
    if (fact.credibility && Array.isArray(fact.credibility)) {
      properties[FIELD_MAP.credibility] = {
        multi_select: fact.credibility
          .filter(c => ENUMS.credibility.includes(c))
          .map(name => ({ name }))
      };
    }

    // Number property
    if (fact.weight !== undefined) {
      properties[FIELD_MAP.weight] = {
        number: Math.max(0, Math.min(1, fact.weight))
      };
    }

    // Date property
    if (fact.verifiedAt) {
      properties[FIELD_MAP.verifiedAt] = {
        date: { start: new Date(fact.verifiedAt).toISOString() }
      };
    }

    // Text properties
    if (fact.locationRef) {
      properties[FIELD_MAP.locationRef] = {
        rich_text: [{
          text: { content: fact.locationRef }
        }]
      };
    }

    if (fact.verificationMethod) {
      properties[FIELD_MAP.verificationMethod] = {
        rich_text: [{
          text: { content: fact.verificationMethod }
        }]
      };
    }

    // External ID for deduplication
    properties[FIELD_MAP.externalId] = {
      rich_text: [{
        text: { content: fact.factId }
      }]
    };

    return { properties };
  }

  /**
   * Upsert fact with idempotency
   */
  async upsertFact(payload, factId) {
    // Check if page exists
    const existing = await this.findFactByExternalId(factId);

    if (existing) {
      // Update existing page
      const updated = await this.retryWithBackoff(async () => {
        return await this.notion.pages.update({
          page_id: existing.id,
          ...payload
        });
      }, factId);

      return { updated: !!updated, id: existing.id };
    } else {
      // Create new page
      const created = await this.retryWithBackoff(async () => {
        return await this.notion.pages.create({
          parent: { database_id: this.databaseId },
          ...payload
        });
      }, factId);

      return { created: !!created, id: created?.id };
    }
  }

  /**
   * Find existing fact by external ID
   */
  async findFactByExternalId(factId) {
    try {
      const response = await this.notion.databases.query({
        database_id: this.databaseId,
        filter: {
          property: FIELD_MAP.externalId,
          rich_text: { equals: factId }
        },
        page_size: 1
      });

      return response.results[0] || null;
    } catch (error) {
      console.error('Failed to find fact:', error);
      return null;
    }
  }

  /**
   * Retry with exponential backoff and jitter
   */
  async retryWithBackoff(operation, factId, attempt = 1) {
    try {
      return await operation();
    } catch (error) {
      const status = error.status || error.code;

      // Track error metrics
      if (status === 429) {
        this.metrics.increment('notion_429');
      } else if (status >= 500) {
        this.metrics.increment('notion_5xx');
      }

      if (attempt >= MAX_RETRIES) {
        // Push to DLQ
        this.dlq.push({
          factId,
          error: error.message,
          status,
          attempts: attempt,
          retry_at: new Date(Date.now() + 3600000).toISOString()
        });
        this.metrics.increment('dlq_pushed');
        throw error;
      }

      // Exponential backoff with jitter
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;

      console.log(`Retry ${attempt}/${MAX_RETRIES} for ${factId} after ${delay}ms`);
      await this.delay(delay);

      return this.retryWithBackoff(operation, factId, attempt + 1);
    }
  }

  /**
   * Handle sync errors
   */
  async handleError(error, fact, results) {
    console.error(`Sync error for fact ${fact.factId}:`, error);

    results.errors.push({
      factId: fact.factId,
      error: error.message,
      status: error.status || error.code
    });

    // Check if we should push to DLQ
    if (error.status === 429 || error.status >= 500) {
      this.dlq.push({
        fact,
        error: error.message,
        status: error.status,
        retry_at: new Date(Date.now() + 3600000).toISOString()
      });
      this.metrics.increment('dlq_pushed');
    }
  }

  /**
   * Process DLQ items
   */
  async processDLQ() {
    const now = Date.now();
    const ready = this.dlq.filter(item =>
      new Date(item.retry_at).getTime() <= now
    );

    if (ready.length === 0) {
      return { processed: 0, remaining: this.dlq.length };
    }

    const facts = ready.map(item => item.fact || { factId: item.factId });
    const results = await this.sync(facts);

    // Remove successfully processed items from DLQ
    const succeeded = new Set([
      ...results.created,
      ...results.updated
    ]);

    this.dlq = this.dlq.filter(item =>
      !succeeded.has(item.factId || item.fact?.factId)
    );

    return {
      processed: succeeded.size,
      remaining: this.dlq.length,
      results
    };
  }

  /**
   * Utility: delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      metrics: this.metrics.summary,
      dlq_depth: this.dlq.length,
      config: {
        database_id: this.databaseId,
        batch_size: BATCH_SIZE,
        max_retries: MAX_RETRIES
      }
    };
  }
}

// Cloudflare Worker handler
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sync = new NotionAtomicFactsSync(env);

    try {
      // Sync endpoint
      if (url.pathname === '/sync/notion/atomic-facts' && request.method === 'POST') {
        const body = await request.json();
        const results = await sync.sync(body.facts || [], body.options || {});

        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        });
      }

      // DLQ processing
      if (url.pathname === '/sync/notion/dlq' && request.method === 'POST') {
        const results = await sync.processDLQ();

        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        });
      }

      // Status endpoint
      if (url.pathname === '/sync/notion/status' && request.method === 'GET') {
        const status = sync.getStatus();

        return new Response(JSON.stringify(status), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({
        error: error.message
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      });
    }
  }
};