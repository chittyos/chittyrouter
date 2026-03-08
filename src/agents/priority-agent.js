/**
 * PriorityAgent — Scores urgency and manages escalation rules per org.
 * Migrated from src/ai/priority-agent.js to Agents SDK stateful agent.
 * Tracks priority decisions and org-specific escalation thresholds.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from "./base-agent.js";

const PRIORITY_LEVELS = ["CRITICAL", "HIGH", "NORMAL", "LOW"];

const PRIORITY_SCORES = { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 };

// Default escalation rules per org
const DEFAULT_ESCALATION_RULES = {
  "Furnished-Condos": {
    autoEscalate: ["emergency_legal", "tenant_communication"],
    criticalKeywords: ["flood", "fire", "water damage", "lockout", "eviction"],
  },
  ChittyCounsel: {
    autoEscalate: ["court_notice", "emergency_legal"],
    criticalKeywords: ["court date", "deadline", "subpoena", "motion", "filing due"],
  },
  ChittyFoundation: {
    autoEscalate: ["grant_management"],
    criticalKeywords: ["deadline", "compliance", "audit", "reporting due"],
  },
  ChittyOS: {
    autoEscalate: ["service_incident"],
    criticalKeywords: ["outage", "p0", "production down", "data loss"],
  },
  ChittyApps: {
    autoEscalate: ["support_ticket"],
    criticalKeywords: ["data loss", "security", "breach", "billing error"],
  },
  ChicagoApps: {
    autoEscalate: ["permit_application"],
    criticalKeywords: ["violation", "citation", "hearing date", "deadline"],
  },
};

export class PriorityAgent extends ChittyRouterBaseAgent {
  async onStart() {
    await super.onStart();
    this.ensurePriorityTables();
  }

  ensurePriorityTables() {
    // Note: sql.exec here is SQLite exec, not child_process
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS priority_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org TEXT NOT NULL,
        category TEXT NOT NULL,
        level TEXT NOT NULL,
        score REAL NOT NULL,
        factors TEXT,
        ai_model TEXT,
        fallback INTEGER NOT NULL DEFAULT 0,
        escalated INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS escalation_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org TEXT NOT NULL,
        category TEXT NOT NULL,
        min_level TEXT NOT NULL DEFAULT 'HIGH',
        notify_channel TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/score")) {
      return this.handleScore(request);
    }

    if (request.method === "GET" && url.pathname.endsWith("/stats")) {
      return this.handleStats();
    }

    if (request.method === "GET" && url.pathname.endsWith("/status")) {
      return this.handleStatus();
    }

    return this.jsonResponse({
      agent: "PriorityAgent",
      status: "active",
      endpoints: ["/score", "/stats", "/status"],
    });
  }

  /**
   * Score priority for a classified communication.
   * POST body: { sender, subject, content, category, org, triageConfidence }
   */
  async handleScore(request) {
    const body = await request.json();
    const { category, org, content } = body;

    let priority;
    try {
      priority = await this.aiPrioritize(body);
    } catch (err) {
      this.error("AI priority failed, using fallback", { error: err.message });
      priority = this.fallbackPrioritize(body);
    }

    // Check escalation rules
    const shouldEscalate = this.checkEscalation(org, category, priority.level, content);

    // Persist decision
    this.sql.exec(
      `INSERT INTO priority_decisions (org, category, level, score, factors, ai_model, fallback, escalated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      org || "ChittyOS",
      category || "general_inquiry",
      priority.level,
      priority.score,
      JSON.stringify(priority.factors),
      priority.aiModel || null,
      priority.fallback ? 1 : 0,
      shouldEscalate ? 1 : 0
    );

    const result = {
      level: priority.level,
      score: priority.score,
      numericScore: PRIORITY_SCORES[priority.level] || 2,
      factors: priority.factors,
      reasoning: priority.reasoning,
      escalated: shouldEscalate,
      fallback: priority.fallback || false,
      timestamp: new Date().toISOString(),
    };

    this.info("prioritized", { org, category, level: result.level, escalated: shouldEscalate });
    return this.jsonResponse(result);
  }

  /**
   * AI-powered priority scoring.
   */
  async aiPrioritize(data) {
    const prompt = `Determine the priority level for this ${data.org || "unknown"} communication:

PRIORITY LEVELS:
- CRITICAL (immediate attention required)
- HIGH (requires attention within hours)
- NORMAL (standard business priority)
- LOW (can wait, informational)

COMMUNICATION:
Subject: ${data.subject || "none"}
From: ${data.sender || "unknown"}
Category: ${data.category || "unknown"}
Classification Confidence: ${data.triageConfidence || 0.7}
Content Preview: ${(data.content || "").substring(0, 500)}

CONTEXT:
- Court deadlines and emergencies are CRITICAL
- Document submissions and escalations are typically HIGH
- General inquiries are NORMAL
- Informational and billing matters are LOW

Respond with JSON only:
{
  "level": "PRIORITY_LEVEL",
  "score": 0.95,
  "factors": ["factor1", "factor2"],
  "reasoning": "explanation"
}`;

    const response = await this.runAI(prompt);
    const parsed = this.parseAIJson(response);

    if (parsed && parsed.level && PRIORITY_LEVELS.includes(parsed.level)) {
      return {
        level: parsed.level,
        score: parsed.score || 0.7,
        factors: parsed.factors || [],
        reasoning: parsed.reasoning || "AI priority classification",
        aiModel: this.env.AI_MODEL_PRIMARY,
        fallback: false,
      };
    }

    return this.fallbackPrioritize(data);
  }

  /**
   * Keyword/rule-based fallback priority.
   */
  fallbackPrioritize(data) {
    const content = ((data.subject || "") + " " + (data.content || "")).toLowerCase();
    const category = data.category || "";

    // Critical categories
    if (["emergency_legal", "court_notice"].includes(category)) {
      return { level: "CRITICAL", score: 0.9, factors: ["category-escalation"], reasoning: "Category implies critical priority", fallback: true };
    }

    // Urgent keyword check
    const urgentKeywords = ["urgent", "emergency", "asap", "immediate", "court date", "deadline", "subpoena"];
    const urgentMatches = urgentKeywords.filter((kw) => content.includes(kw));
    if (urgentMatches.length > 0) {
      return { level: "HIGH", score: 0.8, factors: urgentMatches, reasoning: `Urgent keywords: ${urgentMatches.join(", ")}`, fallback: true };
    }

    // Document submissions
    if (category === "document_submission") {
      return { level: "HIGH", score: 0.7, factors: ["document-submission"], reasoning: "Document submissions are high priority", fallback: true };
    }

    // Low priority categories
    if (["billing_matter", "general_inquiry"].includes(category)) {
      return { level: "LOW", score: 0.6, factors: ["low-priority-category"], reasoning: "Category is typically low priority", fallback: true };
    }

    return { level: "NORMAL", score: 0.6, factors: ["default"], reasoning: "Default priority", fallback: true };
  }

  /**
   * Check if communication should be escalated based on org rules.
   */
  checkEscalation(org, category, level, content) {
    const rules = DEFAULT_ESCALATION_RULES[org];
    if (!rules) return level === "CRITICAL";

    // Auto-escalate certain categories
    if (rules.autoEscalate.includes(category) && PRIORITY_SCORES[level] >= PRIORITY_SCORES.HIGH) {
      return true;
    }

    // Check critical keywords
    const text = (content || "").toLowerCase();
    if (rules.criticalKeywords.some((kw) => text.includes(kw))) {
      return true;
    }

    return level === "CRITICAL";
  }

  handleStats() {
    const rows = this.sql.exec(
      `SELECT org, level, COUNT(*) as count, AVG(score) as avg_score,
              SUM(escalated) as escalated_count
       FROM priority_decisions
       GROUP BY org, level
       ORDER BY count DESC
       LIMIT 50`
    ).toArray();

    const total = this.sql.exec("SELECT COUNT(*) as total FROM priority_decisions").toArray();

    return this.jsonResponse({
      totalDecisions: total[0]?.total || 0,
      breakdown: rows,
    });
  }

  handleStatus() {
    const recent = this.sql.exec(
      "SELECT COUNT(*) as count, SUM(escalated) as escalated FROM priority_decisions WHERE created_at > datetime('now', '-1 hour')"
    ).toArray();

    return this.jsonResponse({
      agent: "PriorityAgent",
      status: "active",
      decisionsLastHour: recent[0]?.count || 0,
      escalationsLastHour: recent[0]?.escalated || 0,
      priorityLevels: PRIORITY_LEVELS.length,
      orgs: Object.keys(DEFAULT_ESCALATION_RULES).length,
    });
  }
}

/**
 * Combine AI priority with existing priority logic (utility export).
 */
export function combinePrioritySignals(aiLevel, existingLevel, aiScore = 0.7) {
  const aiNumeric = PRIORITY_SCORES[aiLevel] || 2;
  const existingNumeric = PRIORITY_SCORES[existingLevel] || 2;
  const combined = aiNumeric * aiScore + existingNumeric * (1 - aiScore);

  if (combined >= 3.5) return "CRITICAL";
  if (combined >= 2.5) return "HIGH";
  if (combined >= 1.5) return "NORMAL";
  return "LOW";
}
