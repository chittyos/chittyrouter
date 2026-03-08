/**
 * IntelligenceAgent — Meta-agent for pattern observation, gap detection, evolution proposals.
 * Analyzes cross-agent data to surface trends, anomalies, and system improvement opportunities.
 * Phase 12 of Agents SDK migration.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from "./base-agent.js";

const ANALYSIS_TYPES = [
  "volume_trend", "category_shift", "escalation_pattern",
  "org_distribution", "agent_performance", "anomaly_detection",
];

const RECOMMENDATION_TYPES = [
  "routing_optimization", "resource_allocation", "process_improvement",
  "risk_alert", "capacity_planning", "compliance_gap",
];

export class IntelligenceAgent extends ChittyRouterBaseAgent {
  // Note: all sql.exec calls below use the built-in SQLite API, not child_process
  async onStart() {
    await super.onStart();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS intelligence_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        observation_type TEXT NOT NULL,
        source_agent TEXT,
        org TEXT,
        title TEXT NOT NULL,
        description TEXT,
        severity TEXT NOT NULL DEFAULT 'info',
        data TEXT,
        acted_on INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS intelligence_recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recommendation_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        org TEXT,
        source_observations TEXT,
        status TEXT NOT NULL DEFAULT 'proposed',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS intelligence_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_type TEXT NOT NULL,
        org TEXT,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/observe")) return this.handleObserve(request);
    if (request.method === "POST" && url.pathname.endsWith("/analyze")) return this.handleAnalyze(request);
    if (request.method === "POST" && url.pathname.endsWith("/recommend")) return this.handleRecommend(request);
    if (request.method === "GET" && url.pathname.endsWith("/observations")) return this.handleListObservations(url);
    if (request.method === "GET" && url.pathname.endsWith("/recommendations")) return this.handleListRecommendations(url);
    if (request.method === "GET" && url.pathname.endsWith("/dashboard")) return this.handleDashboard(url);
    if (request.method === "GET" && url.pathname.endsWith("/stats")) return this.handleStats();
    if (request.method === "GET" && url.pathname.endsWith("/status")) return this.handleStatus();

    return this.jsonResponse({
      agent: "IntelligenceAgent", status: "active",
      endpoints: ["/observe", "/analyze", "/recommend", "/observations", "/recommendations", "/dashboard", "/stats", "/status"],
    });
  }

  async handleObserve(request) {
    const { observation_type, source_agent, org, title, description, severity, data } = await request.json();
    if (!title || !observation_type) return this.jsonResponse({ error: "title and observation_type are required" }, 400);

    this.sql.exec(
      "INSERT INTO intelligence_observations (observation_type, source_agent, org, title, description, severity, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
      observation_type, source_agent || null, org || null, title, description || null, severity || "info", data ? JSON.stringify(data) : null,
    );
    const id = this.sql.exec("SELECT last_insert_rowid() as id").toArray()[0]?.id;
    return this.jsonResponse({ id, observation_type, title, severity: severity || "info" });
  }

  async handleAnalyze(request) {
    const { analysis_type, org, timeframe_hours, context } = await request.json();
    if (!analysis_type || !ANALYSIS_TYPES.includes(analysis_type)) {
      return this.jsonResponse({ error: `analysis_type must be one of: ${ANALYSIS_TYPES.join(", ")}` }, 400);
    }

    const hours = Math.max(1, Math.min(timeframe_hours || 24, 8760));
    const offset = `-${hours} hours`;
    let query = "SELECT * FROM intelligence_observations WHERE created_at > datetime('now', ?)";
    const params = [offset];
    if (org) { query += " AND org = ?"; params.push(org); }
    query += " ORDER BY created_at DESC LIMIT 200";

    const observations = this.sql.exec(query, ...params).toArray();

    let analysis;
    try {
      analysis = await this.aiAnalyze(analysis_type, observations, context);
    } catch (err) {
      this.error("AI analysis failed", { error: err.message });
      analysis = this.fallbackAnalyze(observations);
    }

    this.sql.exec("INSERT INTO intelligence_snapshots (snapshot_type, org, data) VALUES (?, ?, ?)", analysis_type, org || null, JSON.stringify(analysis));

    return this.jsonResponse({
      analysis_type, org: org || "all", timeframeHours: hours,
      observationCount: observations.length, analysis, timestamp: new Date().toISOString(),
    });
  }

  async handleRecommend(request) {
    const { recommendation_type, title, description, priority, org, source_observation_ids } = await request.json();
    if (!title || !description || !recommendation_type) {
      return this.jsonResponse({ error: "recommendation_type, title, and description are required" }, 400);
    }
    if (!RECOMMENDATION_TYPES.includes(recommendation_type)) {
      return this.jsonResponse({ error: `recommendation_type must be one of: ${RECOMMENDATION_TYPES.join(", ")}` }, 400);
    }

    this.sql.exec(
      "INSERT INTO intelligence_recommendations (recommendation_type, title, description, priority, org, source_observations) VALUES (?, ?, ?, ?, ?, ?)",
      recommendation_type, title, description, priority || "normal", org || null, source_observation_ids ? JSON.stringify(source_observation_ids) : null,
    );

    if (source_observation_ids?.length) {
      for (const obsId of source_observation_ids) {
        this.sql.exec("UPDATE intelligence_observations SET acted_on = 1 WHERE id = ?", obsId);
      }
    }

    const id = this.sql.exec("SELECT last_insert_rowid() as id").toArray()[0]?.id;
    return this.jsonResponse({ id, recommendation_type, title, priority: priority || "normal", status: "proposed" });
  }

  async aiAnalyze(analysisType, observations, context) {
    const obsStr = observations.slice(0, 50).map((o) =>
      `[${o.severity}] ${o.title}: ${o.description || "no description"} (from: ${o.source_agent || "unknown"}, org: ${o.org || "unknown"})`
    ).join("\n");

    const prompt = `Analyze these system observations for ${analysisType}:

OBSERVATIONS (${observations.length} total, showing first 50):
${obsStr}

${context ? `ADDITIONAL CONTEXT: ${context}` : ""}

Respond with JSON only:
{
  "summary": "brief summary",
  "patterns": ["pattern1"],
  "anomalies": ["anomaly1"],
  "trends": { "direction": "up|down|stable", "description": "trend" },
  "risk_level": "low|medium|high",
  "recommended_actions": ["action1"]
}`;

    const response = await this.runAI(prompt);
    const parsed = this.parseAIJson(response);
    if (parsed?.summary) return { ...parsed, aiModel: this.env.AI_MODEL_PRIMARY, fallback: false };
    return this.fallbackAnalyze(observations);
  }

  fallbackAnalyze(observations) {
    const bySeverity = {};
    const byOrg = {};
    for (const obs of observations) {
      bySeverity[obs.severity] = (bySeverity[obs.severity] || 0) + 1;
      if (obs.org) byOrg[obs.org] = (byOrg[obs.org] || 0) + 1;
    }
    return {
      summary: `Statistical analysis of ${observations.length} observations`,
      bySeverity, byOrg, patterns: [], anomalies: [],
      trends: { direction: "stable", description: "Insufficient data" },
      risk_level: bySeverity.critical ? "high" : bySeverity.warning ? "medium" : "low",
      recommended_actions: ["Review high-severity observations manually"],
      fallback: true,
    };
  }

  handleListObservations(url) {
    let query = "SELECT * FROM intelligence_observations WHERE 1=1";
    const params = [];
    const org = url.searchParams.get("org");
    if (org) { query += " AND org = ?"; params.push(org); }
    const severity = url.searchParams.get("severity");
    if (severity) { query += " AND severity = ?"; params.push(severity); }
    query += " ORDER BY created_at DESC LIMIT 100";
    return this.jsonResponse({ count: 0, observations: this.sql.exec(query, ...params).toArray() });
  }

  handleListRecommendations(url) {
    let query = "SELECT * FROM intelligence_recommendations WHERE 1=1";
    const params = [];
    const status = url.searchParams.get("status");
    if (status) { query += " AND status = ?"; params.push(status); }
    const priority = url.searchParams.get("priority");
    if (priority) { query += " AND priority = ?"; params.push(priority); }
    query += " ORDER BY created_at DESC LIMIT 50";
    return this.jsonResponse({ count: 0, recommendations: this.sql.exec(query, ...params).toArray() });
  }

  handleDashboard(url) {
    const org = url.searchParams.get("org");
    let obsQuery = "SELECT severity, COUNT(*) as count FROM intelligence_observations WHERE created_at > datetime('now', '-24 hours')";
    const obsParams = [];
    if (org) { obsQuery += " AND org = ?"; obsParams.push(org); }
    obsQuery += " GROUP BY severity";

    const obsBySeverity = this.sql.exec(obsQuery, ...obsParams).toArray();
    const openRecs = this.sql.exec("SELECT COUNT(*) as count FROM intelligence_recommendations WHERE status = 'proposed'").toArray();
    const recentSnapshots = this.sql.exec("SELECT snapshot_type, org, created_at FROM intelligence_snapshots ORDER BY created_at DESC LIMIT 10").toArray();

    return this.jsonResponse({
      org: org || "all",
      last24Hours: { observationsBySeverity: obsBySeverity },
      openRecommendations: openRecs[0]?.count || 0,
      recentAnalyses: recentSnapshots,
    });
  }

  handleStats() {
    const obsTotal = this.sql.exec("SELECT COUNT(*) as count FROM intelligence_observations").toArray();
    const recTotal = this.sql.exec("SELECT COUNT(*) as count FROM intelligence_recommendations").toArray();
    const snapTotal = this.sql.exec("SELECT COUNT(*) as count FROM intelligence_snapshots").toArray();
    return this.jsonResponse({ totalObservations: obsTotal[0]?.count || 0, totalRecommendations: recTotal[0]?.count || 0, totalSnapshots: snapTotal[0]?.count || 0 });
  }

  handleStatus() {
    const recent = this.sql.exec("SELECT COUNT(*) as count FROM intelligence_observations WHERE created_at > datetime('now', '-1 hour')").toArray();
    return this.jsonResponse({ agent: "IntelligenceAgent", status: "active", observationsLastHour: recent[0]?.count || 0, analysisTypes: ANALYSIS_TYPES.length });
  }
}
