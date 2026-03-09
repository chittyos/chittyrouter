/**
 * DocumentAgent — Extracts structured data from attachments.
 * Migrated from src/ai/document-agent.js to Agents SDK stateful agent.
 * Phase 3 of Agents SDK migration.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from "./base-agent.js";

const DOCUMENT_TYPES = [
  "contract", "evidence", "legal_filing", "correspondence",
  "financial", "identification", "medical", "other",
];

const FILENAME_PATTERNS = {
  contract: /\b(contract|agreement|terms|nda|mou)\b/i,
  evidence: /\b(evidence|proof|photo|recording|screenshot)\b/i,
  legal_filing: /\b(motion|pleading|filing|brief|petition|complaint)\b/i,
  correspondence: /\b(letter|email|communication|memo)\b/i,
  financial: /\b(invoice|receipt|bill|payment|financial)\b/i,
  identification: /\b(license|id|certificate|passport|permit)\b/i,
  medical: /\b(medical|health|doctor|hospital|prescription)\b/i,
};

const DANGEROUS_EXTENSIONS = [".exe", ".bat", ".cmd", ".scr", ".vbs", ".jar"];
const SUSPICIOUS_EXTENSIONS = [".zip", ".rar", ".7z"];

export class DocumentAgent extends ChittyRouterBaseAgent {
  // Note: all sql.exec calls below use the built-in SQLite API, not child_process
  async onStart() {
    await super.onStart();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS document_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        filetype TEXT,
        filesize INTEGER,
        document_type TEXT NOT NULL,
        importance TEXT NOT NULL DEFAULT 'normal',
        compliance_flags TEXT,
        contains_pii INTEGER NOT NULL DEFAULT 0,
        requires_review INTEGER NOT NULL DEFAULT 0,
        org TEXT,
        doc_hash TEXT,
        ai_model TEXT,
        fallback INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/analyze")) {
      return this.handleAnalyze(request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/batch")) {
      return this.handleBatch(request);
    }
    if (request.method === "GET" && url.pathname.endsWith("/stats")) {
      return this.handleStats();
    }
    if (request.method === "GET" && url.pathname.endsWith("/status")) {
      return this.handleStatus();
    }

    return this.jsonResponse({
      agent: "DocumentAgent",
      status: "active",
      endpoints: ["/analyze", "/batch", "/stats", "/status"],
    });
  }

  /**
   * Analyze a single document attachment.
   * POST body: { attachment: { name, size, type }, emailContext: { subject, from, category }, org? }
   */
  async handleAnalyze(request) {
    const body = await request.json();
    const { attachment, emailContext, org } = body;
    if (!attachment?.name) {
      return this.jsonResponse({ error: "No valid attachment provided" }, 400);
    }

    const security = this.analyzeFileSecurity(attachment);
    let analysis;
    try {
      analysis = await this.aiAnalyze(attachment, emailContext || {});
    } catch (err) {
      this.error("Document analysis failed", { error: err.message });
      analysis = this.fallbackAnalyze(attachment);
    }

    const docHash = await this.hashDocument(attachment);

    this.sql.exec(
      `INSERT INTO document_index (filename, filetype, filesize, document_type, importance,
       compliance_flags, contains_pii, requires_review, org, doc_hash, ai_model, fallback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      attachment.name,
      attachment.type || null,
      attachment.size || 0,
      analysis.document_type,
      analysis.importance,
      JSON.stringify(analysis.compliance_flags || []),
      analysis.contains_pii ? 1 : 0,
      analysis.requires_review ? 1 : 0,
      org || null,
      docHash,
      analysis.aiModel || null,
      analysis.fallback ? 1 : 0
    );

    return this.jsonResponse({
      filename: attachment.name,
      filesize: attachment.size,
      filetype: attachment.type,
      analysis,
      security,
      recommendations: this.generateRecommendations(analysis),
      docHash,
      timestamp: new Date().toISOString(),
    });
  }

  async handleBatch(request) {
    const { attachments, emailContext, org } = await request.json();
    const results = [];
    for (const attachment of (attachments || [])) {
      try {
        const fakeReq = { json: async () => ({ attachment, emailContext, org }) };
        const resp = await this.handleAnalyze(fakeReq);
        results.push(await resp.json());
      } catch (err) {
        results.push({ filename: attachment?.name, error: err.message });
      }
    }
    return this.jsonResponse({
      total: attachments?.length || 0,
      analyzed: results.filter((r) => !r.error).length,
      results,
    });
  }

  async aiAnalyze(attachment, emailContext) {
    const prompt = `Analyze this document attachment:

EMAIL CONTEXT:
Subject: ${emailContext.subject || "unknown"}
From: ${emailContext.from || "unknown"}
Category: ${emailContext.category || "unknown"}

DOCUMENT:
Filename: ${attachment.name}
Size: ${attachment.size || 0} bytes
Type: ${attachment.type || "unknown"}

CLASSIFICATIONS: ${DOCUMENT_TYPES.join(", ")}
IMPORTANCE: critical, high, normal, low
COMPLIANCE FLAGS: chain_of_custody, confidential, time_sensitive, verification_required, none

Respond with JSON only:
{
  "document_type": "classification",
  "importance": "level",
  "compliance_flags": ["flag1"],
  "contains_pii": false,
  "requires_review": false,
  "keywords": ["keyword1"],
  "reasoning": "brief explanation"
}`;

    const response = await this.runAI(prompt);
    const parsed = this.parseAIJson(response);

    if (parsed && parsed.document_type && DOCUMENT_TYPES.includes(parsed.document_type)) {
      return { ...parsed, fallback: false, aiModel: this.env.AI_MODEL_PRIMARY };
    }
    return this.fallbackAnalyze(attachment);
  }

  fallbackAnalyze(attachment) {
    const docType = this.classifyByFilename(attachment.name);
    const isHighPriority = ["contract", "legal_filing", "evidence"].includes(docType);
    return {
      document_type: docType,
      importance: isHighPriority ? "high" : "normal",
      compliance_flags: docType === "evidence" ? ["chain_of_custody"] : [],
      contains_pii: false,
      requires_review: isHighPriority,
      keywords: [],
      reasoning: "Fallback classification by filename pattern",
      fallback: true,
    };
  }

  classifyByFilename(filename) {
    for (const [type, pattern] of Object.entries(FILENAME_PATTERNS)) {
      if (pattern.test(filename)) return type;
    }
    return "other";
  }

  analyzeFileSecurity(attachment) {
    const ext = (attachment.name.toLowerCase().match(/\.[^.]+$/) || [""])[0];
    const warnings = [];
    let riskLevel = "low";

    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      riskLevel = "high";
      warnings.push(`Dangerous file extension: ${ext}`);
    } else if (SUSPICIOUS_EXTENSIONS.includes(ext)) {
      riskLevel = "medium";
      warnings.push(`Compressed file requires scanning: ${ext}`);
    }
    if ((attachment.size || 0) > 50 * 1024 * 1024) {
      warnings.push("Large file size — may require special handling");
    }

    return { is_safe: riskLevel !== "high", risk_level: riskLevel, warnings };
  }

  generateRecommendations(analysis) {
    const recs = [];
    if (analysis.importance === "critical") recs.push("Process immediately — high priority document");
    if (analysis.compliance_flags?.includes("chain_of_custody")) recs.push("Maintain chain of custody — evidence protocol required");
    if (analysis.compliance_flags?.includes("confidential")) recs.push("Confidential handling — restrict access");
    if (analysis.compliance_flags?.includes("time_sensitive")) recs.push("Time-sensitive — check for deadlines");
    if (analysis.contains_pii) recs.push("Contains PII — apply privacy protection");
    if (analysis.requires_review) recs.push("Attorney review required before processing");
    return recs;
  }

  async hashDocument(attachment) {
    const data = `${attachment.name}:${attachment.size || 0}:${attachment.type || ""}`;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  handleStats() {
    const rows = this.sql.exec(
      `SELECT document_type, importance, COUNT(*) as count, SUM(contains_pii) as pii_count
       FROM document_index GROUP BY document_type, importance ORDER BY count DESC LIMIT 50`
    ).toArray();
    const total = this.sql.exec("SELECT COUNT(*) as total FROM document_index").toArray();
    return this.jsonResponse({ totalDocuments: total[0]?.total || 0, breakdown: rows });
  }

  handleStatus() {
    const recent = this.sql.exec(
      "SELECT COUNT(*) as count FROM document_index WHERE created_at > datetime('now', '-1 hour')"
    ).toArray();
    return this.jsonResponse({
      agent: "DocumentAgent", status: "active",
      documentsLastHour: recent[0]?.count || 0,
      documentTypes: DOCUMENT_TYPES.length,
    });
  }
}
