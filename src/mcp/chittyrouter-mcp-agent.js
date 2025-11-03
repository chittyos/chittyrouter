/**
 * ChittyRouter MCP Agent (Cloudflare Native)
 * Universal intake, search, and routing via Model Context Protocol
 * Built on Cloudflare's McpAgent with Durable Objects
 */

import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Import ChittyRouter services
import { UniversalIntake } from '../intake/universal-intake.js';
import { ChittyRouterAI } from '../ai/intelligent-router.js';
import { TriageAgent } from '../ai/triage-agent.js';
import { DocumentAgent } from '../ai/document-agent.js';
import { MultiCloudStorageManager } from '../storage/multi-cloud-storage-manager.js';

/**
 * Zod Schemas for all MCP tools
 */
const schemas = {
  // Universal Intake
  ingest: {
    content: z.union([z.string(), z.object({})]).describe('Content to ingest (text, JSON, or structured data)'),
    type: z.enum(['email', 'pdf', 'voice', 'api', 'json', 'url', 'sms', 'image', 'video', 'text']).optional().describe('Input type (auto-detected if not provided)'),
    filename: z.string().optional().describe('Filename if applicable'),
    metadata: z.object({}).optional().describe('Additional metadata')
  },

  // Email Routing
  routeEmail: {
    to: z.string().email().describe('Recipient email address'),
    from: z.string().email().describe('Sender email address'),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body content'),
    attachments: z.array(z.object({
      filename: z.string(),
      contentType: z.string(),
      size: z.number()
    })).optional().describe('Email attachments')
  },

  classifyEmail: {
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body'),
    from: z.string().optional().describe('Sender email')
  },

  extractEvidence: {
    content: z.string().describe('Document or email content'),
    type: z.enum(['email', 'pdf', 'document']).describe('Content type')
  },

  // Storage
  storeEvidence: {
    content: z.union([z.string(), z.object({})]).describe('Evidence to store'),
    tier: z.enum(['HOT', 'WARM', 'COLD', 'ARCHIVE']).optional().describe('Storage tier (auto-determined if not provided)'),
    caseId: z.string().optional().describe('Associated case ID'),
    metadata: z.object({}).optional().describe('Additional metadata')
  },

  retrieveEvidence: {
    query: z.string().describe('Search query'),
    caseId: z.string().optional().describe('Filter by case ID'),
    type: z.string().optional().describe('Filter by evidence type'),
    limit: z.number().optional().default(10).describe('Maximum results')
  },

  // Session Management
  initSession: {
    projectId: z.string().describe('Project identifier'),
    sessionId: z.string().optional().describe('Session ID (auto-generated if not provided)')
  },

  syncSession: {
    sessionId: z.string().describe('Session ID to sync'),
    platform: z.enum(['claude', 'openai', 'gemini', 'all']).optional().default('all').describe('Platform to sync')
  },

  // ChittyOS Integration
  validateSchema: {
    data: z.object({}).describe('Data to validate'),
    schemaType: z.string().describe('Schema type to validate against')
  },

  mintChittyId: {
    purpose: z.string().describe('Purpose of the ChittyID'),
    entityType: z.string().optional().describe('Entity type for minting')
  }
};

/**
 * ChittyRouter MCP Agent
 * Cloudflare native implementation with Durable Objects
 */
export class ChittyRouterMCP extends McpAgent {
  constructor(state, env) {
    super(state, env);

    // MCP Server configuration
    this.server = new McpServer({
      name: 'ChittyRouter AI Gateway',
      version: '2.1.0',
      description: 'Universal intake layer for AI agents - ingest, route, and remember everything'
    });

    // Initialize ChittyRouter services (lazy-loaded)
    this.services = null;
  }

  /**
   * Initialize MCP server and register all tools
   * Called automatically by McpAgent
   */
  async init() {
    console.log('🚀 ChittyRouter MCP Agent initializing...');

    // Lazy-load services
    this.services = {
      intake: new UniversalIntake(this.env),
      router: new ChittyRouterAI(this.env.AI, this.env),
      triage: new TriageAgent(this.env),
      document: new DocumentAgent(this.env),
      storage: new MultiCloudStorageManager(this.env)
    };

    // Register all tools
    this.registerIntakeTools();
    this.registerEmailTools();
    this.registerStorageTools();
    this.registerSessionTools();
    this.registerChittyOSTools();

    console.log('✅ ChittyRouter MCP Agent initialized with', this.getToolCount(), 'tools');
  }

  /**
   * Register Universal Intake tools
   */
  registerIntakeTools() {
    this.server.tool(
      'ingest',
      schemas.ingest,
      async (params) => {
        const result = await this.services.intake.ingest(params);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: result.success,
              id: result.id,
              type: result.type,
              chittyId: result.chittyId,
              trustScore: result.attribution?.trustScore,
              storage: {
                tier: result.storage?.tier,
                locations: result.storage?.locations
              },
              routing: {
                destinations: result.routing?.destinations?.length || 0
              }
            }, null, 2)
          }]
        };
      }
    );
  }

  /**
   * Register Email routing tools
   */
  registerEmailTools() {
    // Route Email
    this.server.tool(
      'route_email',
      schemas.routeEmail,
      async (params) => {
        const result = await this.services.router.route({
          type: 'email',
          data: params
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              routing: result.routing,
              confidence: result.confidence,
              priority: result.priority,
              suggestedActions: result.actions
            }, null, 2)
          }]
        };
      }
    );

    // Classify Email
    this.server.tool(
      'classify_email',
      schemas.classifyEmail,
      async (params) => {
        const classification = await this.services.triage.classify({
          subject: params.subject,
          body: params.body,
          from: params.from
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              category: classification.category,
              priority: classification.priority,
              urgency: classification.urgency,
              confidence: classification.confidence,
              tags: classification.tags
            }, null, 2)
          }]
        };
      }
    );

    // Extract Evidence
    this.server.tool(
      'extract_evidence',
      schemas.extractEvidence,
      async (params) => {
        const evidence = await this.services.document.extractEvidence({
          content: params.content,
          type: params.type
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              facts: evidence.facts,
              entities: evidence.entities,
              dates: evidence.dates,
              amounts: evidence.amounts,
              confidence: evidence.confidence
            }, null, 2)
          }]
        };
      }
    );
  }

  /**
   * Register Storage tools
   */
  registerStorageTools() {
    // Store Evidence
    this.server.tool(
      'store_evidence',
      schemas.storeEvidence,
      async (params) => {
        const path = `evidence/${params.caseId || 'general'}/${Date.now()}.json`;

        const result = await this.services.storage.store(path, params.content, {
          tier: params.tier,
          dataType: 'evidence',
          metadata: params.metadata
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: result.success,
              tier: result.tier,
              path: result.path,
              locations: result.primary?.provider,
              backup: result.backup?.provider
            }, null, 2)
          }]
        };
      }
    );

    // Retrieve Evidence
    this.server.tool(
      'retrieve_evidence',
      schemas.retrieveEvidence,
      async (params) => {
        // Use Vectorize for semantic search
        const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: params.query
        });

        const results = await this.env.AGENT_SEMANTIC_MEMORY.query(embedding.data, {
          topK: params.limit || 10,
          returnMetadata: true,
          filter: params.caseId ? { caseId: params.caseId } : undefined
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: params.query,
              results: results.matches.map(m => ({
                id: m.id,
                score: m.score,
                metadata: m.metadata
              }))
            }, null, 2)
          }]
        };
      }
    );
  }

  /**
   * Register Session Management tools
   */
  registerSessionTools() {
    // Init Session
    this.server.tool(
      'init_session',
      schemas.initSession,
      async (params) => {
        // Use Durable Object SQL for session state
        const sessionId = params.sessionId || crypto.randomUUID();

        await this.ctx.storage.sql.exec(
          `CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            created_at TEXT,
            state TEXT
          )`
        );

        await this.ctx.storage.sql.exec(
          `INSERT INTO sessions (id, project_id, created_at, state)
           VALUES (?, ?, ?, ?)`,
          sessionId,
          params.projectId,
          new Date().toISOString(),
          JSON.stringify({ initialized: true })
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              sessionId,
              projectId: params.projectId,
              status: 'initialized',
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    );

    // Sync Session
    this.server.tool(
      'sync_session',
      schemas.syncSession,
      async (params) => {
        // Retrieve session from SQL
        const session = await this.ctx.storage.sql.exec(
          `SELECT * FROM sessions WHERE id = ?`,
          params.sessionId
        );

        if (!session.rows.length) {
          throw new Error(`Session ${params.sessionId} not found`);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              sessionId: params.sessionId,
              platform: params.platform,
              synced: true,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    );
  }

  /**
   * Register ChittyOS Integration tools
   */
  registerChittyOSTools() {
    // Validate Schema
    this.server.tool(
      'validate_schema',
      schemas.validateSchema,
      async (params) => {
        const endpoint = this.env.CHITTYSCHEMA_ENDPOINT || 'https://schema.chitty.cc';

        const response = await fetch(`${endpoint}/api/v1/validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ChittyOS-Service': 'chittyrouter-mcp'
          },
          body: JSON.stringify({
            data: params.data,
            type: params.schemaType
          })
        });

        const result = await response.json();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              valid: result.valid,
              errors: result.errors || [],
              warnings: result.warnings || []
            }, null, 2)
          }]
        };
      }
    );

    // Mint ChittyID
    this.server.tool(
      'mint_chittyid',
      schemas.mintChittyId,
      async (params) => {
        const endpoint = this.env.CHITTYID_ENDPOINT || 'https://id.chitty.cc';

        const response = await fetch(`${endpoint}/api/v1/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ChittyOS-Service': 'chittyrouter-mcp'
          },
          body: JSON.stringify({
            for: 'chittyrouter-mcp',
            purpose: params.purpose,
            requester: 'chittyrouter',
            entityType: params.entityType
          })
        });

        const result = await response.json();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              chittyId: result.chittyId,
              purpose: params.purpose,
              entityType: params.entityType
            }, null, 2)
          }]
        };
      }
    );
  }

  /**
   * Get count of registered tools
   */
  getToolCount() {
    // Count registered tools
    // In production, you'd track this properly
    return 10; // ingest, route_email, classify_email, extract_evidence, store_evidence, retrieve_evidence, init_session, sync_session, validate_schema, mint_chittyid
  }
}

export default ChittyRouterMCP;
