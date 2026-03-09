/**
 * ChittyRouter Base Agent
 * Shared base class for all Agents SDK agents.
 * Provides: org detection, AI model access, SQL helpers, logging.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { Agent } from "agents";

// Organization detection patterns
const ORG_PATTERNS = [
  { org: "Furnished-Condos", domains: ["furnished-condos.com"], keywords: ["property", "tenant", "lease", "maintenance", "condo"] },
  { org: "ChittyCounsel", domains: ["chittycounsel.com"], keywords: ["case", "court", "filing", "hearing", "motion", "counsel"] },
  { org: "ChittyFoundation", domains: ["chittyfoundation.org"], keywords: ["grant", "donation", "board", "governance", "foundation"] },
  { org: "ChittyOS", domains: ["chitty.cc"], keywords: ["service", "deployment", "incident", "worker", "api"] },
  { org: "ChittyApps", domains: ["chittyapps.com"], keywords: ["ticket", "feature", "support", "app"] },
  { org: "ChicagoApps", domains: ["chicagoapps.com"], keywords: ["permit", "inspection", "violation", "zoning"] },
];

export class ChittyRouterBaseAgent extends Agent {
  /**
   * Called when agent first starts or wakes from hibernation.
   * Subclasses should call super.onStart() then do their own init.
   */
  async onStart() {
    this.ensureBaseTables();
  }

  /**
   * Create shared metadata tables if they don't exist.
   */
  ensureBaseTables() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS agent_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // -- Org Detection --

  /**
   * Detect which organization a communication belongs to.
   * @param {{ sender?: string, content?: string, domain?: string, metadata?: object }} ctx
   * @returns {{ org: string, confidence: number, signals: string[] }}
   */
  detectOrg(ctx) {
    let bestOrg = "ChittyOS"; // default
    let bestScore = 0;
    let bestSignals = [];

    for (const pattern of ORG_PATTERNS) {
      let score = 0;
      const patternSignals = [];

      // Domain match (strongest signal)
      if (ctx.sender) {
        const senderDomain = ctx.sender.split("@")[1]?.toLowerCase() || "";
        if (pattern.domains.some((d) => senderDomain.includes(d))) {
          score += 3;
          patternSignals.push(`domain:${senderDomain}`);
        }
      }

      if (ctx.domain && pattern.domains.some((d) => ctx.domain.includes(d))) {
        score += 3;
        patternSignals.push(`explicit-domain:${ctx.domain}`);
      }

      // Keyword match
      const text = ((ctx.content || "") + " " + (ctx.sender || "")).toLowerCase();
      for (const kw of pattern.keywords) {
        if (text.includes(kw)) {
          score += 1;
          patternSignals.push(`keyword:${kw}`);
        }
      }

      // Metadata org hint
      if (ctx.metadata?.org === pattern.org) {
        score += 5;
        patternSignals.push("metadata-hint");
      }

      if (score > bestScore) {
        bestScore = score;
        bestOrg = pattern.org;
        bestSignals = patternSignals;
      }
    }

    return {
      org: bestOrg,
      confidence: Math.min(1, bestScore / 5),
      signals: bestSignals,
    };
  }

  // -- AI Helpers --

  /**
   * Run an AI inference call using the worker's AI binding.
   */
  async runAI(prompt, opts = {}) {
    const model = opts.model || this.env.AI_MODEL_PRIMARY || "@cf/meta/llama-4-scout-17b-16e-instruct";
    const messages = [];
    if (opts.systemPrompt) {
      messages.push({ role: "system", content: opts.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const response = await this.env.AI.run(model, {
      messages,
      max_tokens: opts.maxTokens || 1024,
    });

    return response.response;
  }

  /**
   * Parse a JSON object from an AI response string.
   */
  parseAIJson(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.error("parseAIJson failed", { error: err.message, responseLength: (response || "").length });
    }
    return null;
  }

  /**
   * Safely parse request JSON body, returning a 400 Response on failure.
   * @returns {{ data: object } | { error: Response }}
   */
  async safeParseBody(request) {
    try {
      const data = await request.json();
      return { data };
    } catch (err) {
      return { error: this.jsonResponse({ error: "Invalid JSON body", detail: err.message }, 400) };
    }
  }

  // -- SQL Helpers --

  get sql() {
    return this.ctx.storage.sql;
  }

  // -- Logging --

  log(level, message, metadata) {
    const meta = metadata ? JSON.stringify(metadata) : null;
    this.sql.exec(
      "INSERT INTO agent_log (level, message, metadata) VALUES (?, ?, ?)",
      level,
      message,
      meta
    );
  }

  info(message, metadata) {
    this.log("info", message, metadata);
  }

  warn(message, metadata) {
    this.log("warn", message, metadata);
  }

  error(message, metadata) {
    this.log("error", message, metadata);
  }

  // -- HTTP Helpers --

  jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export { ORG_PATTERNS };
