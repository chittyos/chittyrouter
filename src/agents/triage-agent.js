/**
 * TriageAgent — Classifies inbound communications by org, type, and urgency.
 * Migrated from src/ai/triage-agent.js to Agents SDK stateful agent.
 * Provides multi-org classification with persistent pattern learning.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from './base-agent.js';

// Classification categories (expanded from original for multi-org)
const CATEGORIES = [
  'lawsuit_communication',
  'document_submission',
  'appointment_request',
  'emergency_legal',
  'general_inquiry',
  'court_notice',
  'billing_matter',
  'property_management',
  'tenant_communication',
  'permit_application',
  'grant_management',
  'service_incident',
  'support_ticket',
  'security_incident',
];

// Keyword fallback patterns per category
const FALLBACK_PATTERNS = {
  lawsuit_communication: ['case', 'plaintiff', 'defendant', 'litigation', 'legal action'],
  document_submission: ['attached', 'document', 'contract', 'evidence', 'filing'],
  appointment_request: ['meeting', 'appointment', 'schedule', 'consultation', 'availability'],
  emergency_legal: ['urgent', 'emergency', 'asap', 'immediate', 'deadline'],
  court_notice: ['court', 'hearing', 'judge', 'motion', 'subpoena'],
  billing_matter: ['invoice', 'payment', 'bill', 'retainer', 'fee'],
  property_management: ['property', 'unit', 'building', 'maintenance', 'repair'],
  tenant_communication: ['tenant', 'lease', 'rent', 'move-in', 'move-out'],
  permit_application: ['permit', 'inspection', 'violation', 'zoning', 'building code'],
  grant_management: ['grant', 'proposal', 'funding', 'disbursement', 'reporting'],
  service_incident: ['outage', 'deployment', 'incident', 'worker', 'error 5'],
  support_ticket: ['ticket', 'bug', 'feature request', 'support', 'help'],
  security_incident: [
    'vulnerability',
    'cve',
    'exploit',
    'disclosure',
    'security advisory',
    'rce',
    'sql injection',
    'xss',
    'credential leak',
    'breach',
    'unauthorized access',
    'attestation bypass',
    'cvss',
  ],
};

export class TriageAgent extends ChittyRouterBaseAgent {
  async onStart() {
    await super.onStart();
    this.ensureTriageTables();
  }

  ensureTriageTables() {
    this.rawSql.exec(`
      CREATE TABLE IF NOT EXISTS classifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org TEXT NOT NULL,
        category TEXT NOT NULL,
        sender TEXT,
        subject TEXT,
        confidence REAL NOT NULL,
        ai_model TEXT,
        fallback INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.rawSql.exec(`
      CREATE TABLE IF NOT EXISTS org_routing_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org TEXT NOT NULL,
        pattern TEXT NOT NULL,
        target_category TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname.endsWith('/classify')) {
      return this.handleClassify(request);
    }

    if (request.method === 'GET' && url.pathname.endsWith('/stats')) {
      return this.handleStats();
    }

    if (request.method === 'GET' && url.pathname.endsWith('/status')) {
      return this.handleStatus();
    }

    // Default: return agent info
    return this.jsonResponse({
      agent: 'TriageAgent',
      status: 'active',
      endpoints: ['/classify', '/stats', '/status'],
    });
  }

  /**
   * Classify an inbound communication.
   * POST body: { sender, subject, content, channel?, metadata? }
   */
  async handleClassify(request) {
    const body = await request.json();
    const { sender, subject, content, channel, metadata } = body;

    // Step 1: Detect org
    const orgResult = this.detectOrg({ sender, content, metadata });

    // Step 2: AI classification
    let classification;
    try {
      classification = await this.aiClassify({ sender, subject, content, channel }, orgResult);
    } catch (err) {
      this.error('AI triage failed, using fallback', { error: err.message });
      classification = this.fallbackClassify({ sender, subject, content });
    }

    // Step 3: Persist
    this.rawSql.exec(
      `INSERT INTO classifications (org, category, sender, subject, confidence, ai_model, fallback)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      orgResult.org,
      classification.category,
      sender || null,
      subject || null,
      classification.confidence,
      classification.aiModel || null,
      classification.fallback ? 1 : 0
    );

    const result = {
      org: orgResult.org,
      orgConfidence: orgResult.confidence,
      orgSignals: orgResult.signals,
      category: classification.category,
      confidence: classification.confidence,
      keywords: classification.keywords,
      urgencyIndicators: classification.urgencyIndicators,
      reasoning: classification.reasoning,
      fallback: classification.fallback || false,
      timestamp: new Date().toISOString(),
    };

    this.info('classified', { org: result.org, category: result.category, confidence: result.confidence });
    return this.jsonResponse(result);
  }

  /**
   * AI-powered classification using Cloudflare AI.
   */
  async aiClassify(emailData, orgResult) {
    const categoryList = CATEGORIES.map((c) => `  - ${c}`).join('\n');

    const prompt = `Classify this communication for the ${orgResult.org} organization.

CATEGORIES:
${categoryList}

COMMUNICATION:
From: ${emailData.sender || 'unknown'}
Subject: ${emailData.subject || 'none'}
Channel: ${emailData.channel || 'email'}
Content: ${(emailData.content || '').substring(0, 800)}

Respond with JSON only:
{
  "category": "category_name",
  "confidence": 0.95,
  "keywords": ["keyword1", "keyword2"],
  "urgency_indicators": ["indicator1"],
  "reasoning": "brief explanation"
}`;

    const response = await this.runAIWithPrompt(prompt, {
      promptId: 'triage.classify',
      variables: { org: orgResult.org, categories: categoryList },
    });

    // Environment gate returned passthrough
    if (response === null) return this.fallbackClassify(emailData);

    const parsed = this.parseAIJson(response);

    if (parsed && parsed.category && CATEGORIES.includes(parsed.category)) {
      return {
        category: parsed.category,
        confidence: parsed.confidence || 0.7,
        keywords: parsed.keywords || [],
        urgencyIndicators: parsed.urgency_indicators || [],
        reasoning: parsed.reasoning || 'AI classification',
        aiModel: this.env.AI_MODEL_PRIMARY,
        fallback: false,
      };
    }

    // AI returned something but not a valid category — fall back
    return this.fallbackClassify(emailData);
  }

  /**
   * Keyword-based fallback classification.
   */
  fallbackClassify(emailData) {
    const text = ((emailData.subject || '') + ' ' + (emailData.content || '')).toLowerCase();

    for (const [category, keywords] of Object.entries(FALLBACK_PATTERNS)) {
      const matches = keywords.filter((kw) => text.includes(kw));
      if (matches.length > 0) {
        return {
          category,
          confidence: Math.min(0.8, matches.length * 0.2 + 0.4),
          keywords: matches,
          urgencyIndicators: [],
          reasoning: `Keyword-based classification: ${matches.join(', ')}`,
          fallback: true,
        };
      }
    }

    return {
      category: 'general_inquiry',
      confidence: 0.5,
      keywords: [],
      urgencyIndicators: [],
      reasoning: 'No clear classification patterns found',
      fallback: true,
    };
  }

  /**
   * Classification statistics.
   */
  handleStats() {
    const rows = this.rawSql.exec(
      `SELECT org, category, COUNT(*) as count, AVG(confidence) as avg_confidence
       FROM classifications
       GROUP BY org, category
       ORDER BY count DESC
       LIMIT 50`
    ).toArray();

    const total = this.rawSql.exec('SELECT COUNT(*) as total FROM classifications').toArray();

    return this.jsonResponse({
      totalClassifications: total[0]?.total || 0,
      breakdown: rows,
    });
  }

  handleStatus() {
    const recent = this.rawSql.exec(
      'SELECT COUNT(*) as count FROM classifications WHERE created_at > datetime(\'now\', \'-1 hour\')'
    ).toArray();

    return this.jsonResponse({
      agent: 'TriageAgent',
      status: 'active',
      classificationsLastHour: recent[0]?.count || 0,
      categories: CATEGORIES.length,
      orgs: 6,
    });
  }
}
