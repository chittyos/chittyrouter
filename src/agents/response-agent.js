/**
 * ResponseAgent — Drafts context-aware replies for communications.
 * Migrated from src/ai/response-agent.js to Agents SDK stateful agent.
 * Phase 4 of Agents SDK migration.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from "./base-agent.js";

const PROBLEMATIC_PHRASES = [
  "legal advice", "we guarantee", "certainly will",
  "definitely", "promised outcome",
];

const NO_RESPONSE_CATEGORIES = ["billing_matter", "spam"];

const RESPONSE_TEMPLATES = {
  lawsuit_communication: `Thank you for your communication regarding this legal matter. We have received your message and it will be reviewed by our legal team. You will hear from us within 24 hours.\n\nBest regards,\nLegal Team`,
  document_submission: `We have received your document submission. Our team will review the materials and confirm receipt within 2 business days. If any additional documentation is required, we will contact you promptly.\n\nBest regards,\nLegal Team`,
  general_inquiry: `Thank you for contacting us. We have received your inquiry and will respond within 2 business days. For urgent matters, please call our main office.\n\nBest regards,\nLegal Team`,
  emergency_legal: `We have received your urgent communication and it has been escalated to our legal team for immediate attention. You will hear from us within 2 hours.\n\nBest regards,\nLegal Team`,
  court_notice: `We acknowledge receipt of this court-related communication. Our legal team has been notified immediately and will take appropriate action.\n\nBest regards,\nLegal Team`,
  appointment_request: `Thank you for your appointment request. Our scheduling team will review your availability and contact you within 1 business day to confirm scheduling details.\n\nBest regards,\nLegal Team`,
  property_management: `We have received your property management request. Our property management team will review and prioritize the issue. You can expect an update within 1 business day.\n\nBest regards,\nProperty Management Team`,
  tenant_communication: `Thank you for your communication. Our property management team will review your request and respond within 2 business days.\n\nBest regards,\nProperty Management Team`,
  permit_application: `We have received your permit-related inquiry. Our compliance team will review and respond within 3 business days.\n\nBest regards,\nCompliance Team`,
  grant_management: `Thank you for your grant-related inquiry. Our grants team will review your submission and respond within 5 business days.\n\nBest regards,\nGrants Team`,
  service_incident: `We have received your incident report and our operations team has been notified. We are investigating and will provide an update as soon as possible.\n\nBest regards,\nOperations Team`,
  support_ticket: `Thank you for contacting support. Your request has been logged and our team will respond within 1 business day.\n\nBest regards,\nSupport Team`,
};

const LEGAL_DISCLAIMERS = {
  general_inquiry: "\n\nPlease note: This correspondence does not constitute legal advice and does not create an attorney-client relationship.",
  lawsuit_communication: "\n\nThis is an automated acknowledgment. All legal matters will be handled by qualified attorneys.",
};

export class ResponseAgent extends ChittyRouterBaseAgent {
  // Note: all sql.exec calls below use the built-in SQLite API, not child_process
  async onStart() {
    await super.onStart();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS response_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_subject TEXT,
        email_from TEXT,
        category TEXT NOT NULL,
        priority TEXT NOT NULL,
        should_respond INTEGER NOT NULL DEFAULT 1,
        response_subject TEXT,
        response_body TEXT,
        response_type TEXT NOT NULL,
        org TEXT,
        validation_warnings TEXT,
        ai_model TEXT,
        fallback INTEGER NOT NULL DEFAULT 0,
        sent INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/draft")) {
      return this.handleDraft(request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/validate")) {
      return this.handleValidate(request);
    }
    if (request.method === "GET" && url.pathname.endsWith("/stats")) {
      return this.handleStats();
    }
    if (request.method === "GET" && url.pathname.endsWith("/status")) {
      return this.handleStatus();
    }

    return this.jsonResponse({
      agent: "ResponseAgent",
      status: "active",
      endpoints: ["/draft", "/validate", "/stats", "/status"],
    });
  }

  /**
   * Draft a response for an email.
   * POST body: { emailData: { subject, from, content }, triageResult: { category }, priorityResult: { level }, org? }
   */
  async handleDraft(request) {
    const body = await request.json();
    const { emailData, triageResult, priorityResult, org } = body;

    if (!emailData?.subject || !triageResult?.category) {
      return this.jsonResponse({ error: "emailData and triageResult required" }, 400);
    }

    const shouldRespond = this.shouldGenerateResponse(triageResult, priorityResult || {});
    const responseSubject = this.generateResponseSubject(emailData.subject);

    let result;
    try {
      result = await this.aiDraft(emailData, triageResult, priorityResult || {});
    } catch (err) {
      this.error("AI draft failed", { error: err.message });
      result = this.fallbackDraft(triageResult);
    }

    const validation = this.validateContent(result.body);
    const finalBody = this.addDisclaimer(result.body, triageResult.category);

    this.sql.exec(
      `INSERT INTO response_drafts (email_subject, email_from, category, priority, should_respond,
       response_subject, response_body, response_type, org, validation_warnings, ai_model, fallback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      emailData.subject,
      emailData.from || null,
      triageResult.category,
      priorityResult?.level || "NORMAL",
      shouldRespond ? 1 : 0,
      responseSubject,
      finalBody,
      result.responseType,
      org || null,
      JSON.stringify(validation.warnings),
      result.aiModel || null,
      result.fallback ? 1 : 0,
    );

    return this.jsonResponse({
      shouldRespond,
      subject: responseSubject,
      body: finalBody,
      responseType: result.responseType,
      category: triageResult.category,
      priority: priorityResult?.level || "NORMAL",
      validation,
      fallback: result.fallback || false,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Validate response text for legal compliance.
   * POST body: { text, category? }
   */
  async handleValidate(request) {
    const { text, category } = await request.json();
    if (!text) return this.jsonResponse({ error: "text is required" }, 400);

    const validation = this.validateContent(text);
    const withDisclaimer = category ? this.addDisclaimer(text, category) : text;

    return this.jsonResponse({
      validation,
      textWithDisclaimer: withDisclaimer,
    });
  }

  async aiDraft(emailData, triageResult, priorityResult) {
    const prompt = `Generate a professional auto-response for this email:

CONTEXT:
Subject: ${emailData.subject}
From: ${emailData.from || "unknown"}
Category: ${triageResult.category}
Priority: ${priorityResult.level || "NORMAL"}
Content Preview: ${(emailData.content || "").substring(0, 400)}

RESPONSE REQUIREMENTS:
- Professional tone appropriate to the category
- Acknowledge receipt of communication
- Set appropriate expectations for response time
- Include relevant next steps based on category
- Keep under 200 words
- Be helpful but legally conservative
- Do not provide legal advice
- End with professional closing

Generate only the email body text, no subject line.`;

    const response = await this.runAI(prompt);
    const cleaned = this.cleanResponseText(response);

    return {
      body: cleaned,
      responseType: "ai_generated",
      fallback: false,
      aiModel: this.env.AI_MODEL_PRIMARY,
    };
  }

  fallbackDraft(triageResult) {
    const template = RESPONSE_TEMPLATES[triageResult.category] || RESPONSE_TEMPLATES.general_inquiry;
    return {
      body: template,
      responseType: "fallback_template",
      fallback: true,
    };
  }

  shouldGenerateResponse(triageResult, priorityResult) {
    if (NO_RESPONSE_CATEGORIES.includes(triageResult.category)) return false;
    if (priorityResult.level === "CRITICAL" || priorityResult.level === "HIGH") return true;
    if (["document_submission", "general_inquiry", "appointment_request"].includes(triageResult.category)) return true;
    return false;
  }

  generateResponseSubject(originalSubject) {
    if (originalSubject.toLowerCase().startsWith("re:")) return originalSubject;
    return `Re: ${originalSubject}`;
  }

  cleanResponseText(text) {
    let cleaned = text
      .replace(/^["']|["']$/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!cleaned.includes("Best regards") && !cleaned.includes("Sincerely") && !cleaned.includes("Thank you")) {
      cleaned += "\n\nBest regards,\nTeam";
    }
    return cleaned;
  }

  validateContent(text) {
    const warnings = [];
    const lower = text.toLowerCase();
    for (const phrase of PROBLEMATIC_PHRASES) {
      if (lower.includes(phrase)) {
        warnings.push(`Potentially problematic phrase: "${phrase}"`);
      }
    }
    if (lower.includes("advice") && !lower.includes("not legal advice")) {
      warnings.push("Consider adding legal advice disclaimer");
    }
    return { isValid: warnings.length === 0, warnings, reviewRequired: warnings.length > 0 };
  }

  addDisclaimer(text, category) {
    return text + (LEGAL_DISCLAIMERS[category] || "");
  }

  handleStats() {
    const rows = this.sql.exec(
      `SELECT category, response_type, COUNT(*) as count, SUM(fallback) as fallback_count
       FROM response_drafts GROUP BY category, response_type ORDER BY count DESC LIMIT 50`
    ).toArray();
    const total = this.sql.exec("SELECT COUNT(*) as total FROM response_drafts").toArray();
    return this.jsonResponse({ totalDrafts: total[0]?.total || 0, breakdown: rows });
  }

  handleStatus() {
    const recent = this.sql.exec(
      "SELECT COUNT(*) as count FROM response_drafts WHERE created_at > datetime('now', '-1 hour')"
    ).toArray();
    return this.jsonResponse({
      agent: "ResponseAgent", status: "active",
      draftsLastHour: recent[0]?.count || 0,
      templateCount: Object.keys(RESPONSE_TEMPLATES).length,
    });
  }
}
