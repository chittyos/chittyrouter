/**
 * ScrapeAgent — Job queue for browser scraping with retry, dead-letter, and fan-out.
 * Owns scrape orchestration: enqueue, execute via ChittyScrape, fan-out results
 * to Intelligence/Calendar/Triage agents and ChittyLedger.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from "./base-agent.js";

const VALID_JOB_TYPES = ["court_docket", "cook_county_tax", "mr_cooper", "portal_scrape"];
const VALID_STATUSES = ["queued", "running", "completed", "failed", "retrying", "dead_letter"];

export class ScrapeAgent extends ChittyRouterBaseAgent {
  async onStart() {
    await super.onStart();
    this.ensureScrapeTables();
  }

  ensureScrapeTables() {
    this.rawSql.exec(`
      CREATE TABLE IF NOT EXISTS scrape_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT NOT NULL,
        target TEXT NOT NULL,
        chitty_id TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        attempt INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT,
        result TEXT,
        error_message TEXT,
        parent_job_id INTEGER REFERENCES scrape_jobs(id),
        cron_source TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.rawSql.exec(`
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status, scheduled_at)
    `);
    this.rawSql.exec(`
      CREATE INDEX IF NOT EXISTS idx_scrape_jobs_type ON scrape_jobs(job_type)
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // POST endpoints
    if (request.method === "POST") {
      if (path.endsWith("/enqueue")) return this.handleEnqueue(request);
      if (path.endsWith("/process")) return this.handleProcess(request);
      // POST /jobs/:id/retry
      const retryMatch = path.match(/\/jobs\/(\d+)\/retry$/);
      if (retryMatch) return this.handleRetry(retryMatch[1]);
    }

    // GET endpoints
    if (request.method === "GET") {
      if (path.endsWith("/status")) return this.handleStatus();
      if (path.endsWith("/dead-letters")) return this.handleDeadLetters(url);
      // GET /jobs/:id
      const jobMatch = path.match(/\/jobs\/(\d+)$/);
      if (jobMatch) return this.handleGetJob(jobMatch[1]);
      if (path.endsWith("/jobs")) return this.handleListJobs(url);
    }

    return this.jsonResponse({
      agent: "ScrapeAgent",
      status: "active",
      endpoints: [
        "POST /enqueue", "POST /process", "POST /jobs/:id/retry",
        "GET /jobs", "GET /jobs/:id", "GET /dead-letters", "GET /status",
      ],
    });
  }

  // ── Enqueue ────────────────────────────────────────────────

  async handleEnqueue(request) {
    const { data, error } = await this.safeParseBody(request);
    if (error) return error;

    const { jobType, target, chittyId, maxAttempts, scheduledAt, cronSource, parentJobId } = data;

    if (!jobType || !target) {
      return this.jsonResponse({ error: "jobType and target are required" }, 400);
    }
    if (!VALID_JOB_TYPES.includes(jobType)) {
      return this.jsonResponse({ error: `Invalid jobType. Must be one of: ${VALID_JOB_TYPES.join(", ")}` }, 400);
    }

    const targetJson = typeof target === "string" ? target : JSON.stringify(target);
    const schedAt = scheduledAt || new Date().toISOString();

    this.rawSql.exec(
      `INSERT INTO scrape_jobs (job_type, target, chitty_id, max_attempts, scheduled_at, cron_source, parent_job_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      jobType, targetJson, chittyId || null, maxAttempts || 3, schedAt, cronSource || null, parentJobId || null
    );

    const [row] = this.sql`SELECT last_insert_rowid() AS id`;
    const id = row?.id;

    this.info("enqueued", { id, jobType, cronSource });
    return this.jsonResponse({ id, status: "queued" }, 201);
  }

  // ── Process Queue ──────────────────────────────────────────

  async handleProcess(request) {
    let limit = 10;
    try {
      const body = await request.json();
      if (body.limit) limit = Math.min(body.limit, 50);
    } catch { /* use default */ }

    const now = new Date().toISOString();
    const jobs = [...this.sql`
      SELECT id, job_type, target, chitty_id, attempt, max_attempts
      FROM scrape_jobs
      WHERE status IN ('queued', 'retrying') AND scheduled_at <= ${now}
      ORDER BY scheduled_at
      LIMIT ${limit}
    `];

    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        const result = await this.executeJob(job);
        if (result.success) succeeded++;
        else failed++;
      } catch (err) {
        console.error(`[scrape-agent] Job ${job.id} threw:`, err);
        failed++;
      }
    }

    return this.jsonResponse({ processed: jobs.length, succeeded, failed });
  }

  // ── Execute Single Job ─────────────────────────────────────

  async executeJob(job) {
    const attempt = (job.attempt || 0) + 1;
    const maxAttempts = job.max_attempts || 3;
    const target = typeof job.target === "string" ? JSON.parse(job.target) : job.target;

    // Mark running
    this.rawSql.exec(
      `UPDATE scrape_jobs SET status = 'running', attempt = ?, started_at = datetime('now') WHERE id = ?`,
      attempt, job.id
    );

    try {
      const result = await this.executeScrape(job.job_type, target);

      // Mark completed
      this.rawSql.exec(
        `UPDATE scrape_jobs SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?`,
        JSON.stringify(result.data), job.id
      );

      // Fan out to sibling agents (fire-and-forget)
      this.fanOut({
        jobId: job.id,
        jobType: job.job_type,
        target,
        chittyId: job.chitty_id,
        result: result.data,
        recordsSynced: result.recordsSynced,
      }).catch((err) => console.error("[scrape-agent] fan-out error:", err));

      return { success: true, recordsSynced: result.recordsSynced };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (attempt < maxAttempts) {
        const backoffMs = 30000 * Math.pow(2, attempt - 1);
        const retryAt = new Date(Date.now() + backoffMs).toISOString();
        this.rawSql.exec(
          `UPDATE scrape_jobs SET status = 'retrying', error_message = ?, scheduled_at = ? WHERE id = ?`,
          errorMsg, retryAt, job.id
        );
        this.warn("retrying", { jobId: job.id, attempt, retryAt });
      } else {
        this.rawSql.exec(
          `UPDATE scrape_jobs SET status = 'dead_letter', error_message = ?, completed_at = datetime('now') WHERE id = ?`,
          errorMsg, job.id
        );
        this.warn("dead_letter", { jobId: job.id, attempt, error: errorMsg });
      }

      return { success: false, recordsSynced: 0 };
    }
  }

  // ── Scrape Execution ───────────────────────────────────────

  async executeScrape(jobType, target) {
    const scrapeUrl = this.env.CHITTYSCRAPE_URL;
    if (!scrapeUrl) throw new Error("CHITTYSCRAPE_URL not configured");

    const token = this.env.SCRAPE_SERVICE_TOKEN;
    if (!token) {
      // Try KV fallback
      const kvToken = this.env.AI_CACHE ? await this.env.AI_CACHE.get("scrape:service_token") : null;
      if (!kvToken) throw new Error("No scrape service token available");
      return this.callScrapeApi(scrapeUrl, jobType, target, kvToken);
    }

    return this.callScrapeApi(scrapeUrl, jobType, target, token);
  }

  async callScrapeApi(baseUrl, jobType, target, token) {
    const routes = {
      court_docket: { path: "/api/scrape/court-docket", body: { caseNumber: target.case_number } },
      cook_county_tax: { path: "/api/scrape/cook-county-tax", body: { pin: target.pin } },
      mr_cooper: { path: "/api/scrape/mr-cooper", body: { property: target.property } },
      portal_scrape: { path: "/route/scrape", body: { target: target.portal, params: target.params } },
    };

    const route = routes[jobType];
    if (!route) throw new Error(`Unknown job type: ${jobType}`);

    // portal_scrape uses ChittyRouter's own /route/scrape, others use ChittyScrape
    const url = jobType === "portal_scrape"
      ? `${this.env.CHITTYROUTER_URL || "https://router.chitty.cc"}${route.path}`
      : `${baseUrl}${route.path}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Source-Service": "chittyrouter/scrape-agent",
      },
      body: JSON.stringify(route.body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Scrape API ${route.path} failed: ${res.status} ${errText.slice(0, 200)}`);
    }

    const result = await res.json();
    if (result.success === false) throw new Error(result.error || "Scrape returned failure");

    return { data: result.data || result, recordsSynced: result.recordsSynced || 0 };
  }

  // ── Fan-out to Sibling Agents ──────────────────────────────

  async fanOut(ctx) {
    const results = await Promise.allSettled([
      this.fanOutToIntelligence(ctx),
      this.fanOutToCalendar(ctx),
      this.fanOutToTriage(ctx),
      this.fanOutToLedger(ctx),
    ]);

    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[scrape-agent:fan-out] downstream error:", r.reason);
      }
    }
  }

  async fanOutToIntelligence(ctx) {
    const stub = await this.getAgentStub("INTELLIGENCE_AGENT");
    if (!stub) return;

    await stub.fetch(new Request("https://agent/observe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        observation_type: "scrape_result",
        source_agent: "scrape-agent",
        org: "personal",
        title: `${ctx.jobType} scrape completed`,
        description: `Job ${ctx.jobId}: ${ctx.recordsSynced} records synced`,
        severity: "info",
        data: {
          jobId: ctx.jobId,
          jobType: ctx.jobType,
          target: ctx.target,
          recordCount: ctx.recordsSynced,
          timestamp: new Date().toISOString(),
        },
      }),
    }));
  }

  async fanOutToCalendar(ctx) {
    if (ctx.jobType !== "court_docket") return;
    if (!ctx.result?.nextHearing && !ctx.result?.entries) return;

    const stub = await this.getAgentStub("CALENDAR_AGENT");
    if (!stub) return;

    if (ctx.result.nextHearing) {
      await stub.fetch(new Request("https://agent/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Court Hearing: ${ctx.target?.case_number || "Unknown"}`,
          date: ctx.result.nextHearing,
          type: "court_date",
          urgency: "high",
          metadata: { source: "scrape_fan_out", jobId: ctx.jobId, caseNumber: ctx.target?.case_number },
        }),
      }));
    }

    const entries = ctx.result.entries;
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (!entry.date) continue;
        await stub.fetch(new Request("https://agent/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Docket: ${entry.description || entry.type || "Entry"}`,
            date: entry.date,
            type: "docket_entry",
            urgency: "medium",
            metadata: { source: "scrape_fan_out", jobId: ctx.jobId, caseNumber: ctx.target?.case_number },
          }),
        }));
      }
    }
  }

  async fanOutToTriage(ctx) {
    const entries = ctx.result?.entries;
    if (!Array.isArray(entries) || entries.length === 0) return;

    const stub = await this.getAgentStub("TRIAGE_AGENT");
    if (!stub) return;

    await stub.fetch(new Request("https://agent/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_id: String(ctx.jobId),
        entity_type: "dispute",
        title: `Scrape findings: ${ctx.jobType}`,
        dispute_type: ctx.jobType,
        description: `${entries.length} new entries from ${ctx.jobType} scrape`,
      }),
    }));
  }

  async fanOutToLedger(ctx) {
    const ledgerUrl = this.env.CHITTYLEDGER_URL;
    if (!ledgerUrl) return;

    try {
      await fetch(`${ledgerUrl}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Source-Service": "chittyrouter/scrape-agent" },
        body: JSON.stringify({
          entityType: "scrape",
          entityId: String(ctx.jobId),
          action: "completed",
          actor: ctx.chittyId || "chittyrouter/scrape-agent",
          actorType: ctx.chittyId ? "entity" : "service",
          metadata: {
            jobType: ctx.jobType,
            target: ctx.target,
            recordsSynced: ctx.recordsSynced,
            completedAt: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      console.error("[scrape-agent:fan-out:ledger]", err);
    }
  }

  // ── DO-to-DO stub helper ───────────────────────────────────

  async getAgentStub(bindingName) {
    const binding = this.env[bindingName];
    if (!binding) return null;
    const id = binding.idFromName(bindingName);
    const stub = binding.get(id);
    const setupReq = new Request("http://dummy-example.cloudflare.com/cdn-cgi/partyserver/set-name/");
    setupReq.headers.set("x-partykit-room", bindingName);
    await stub.fetch(setupReq).then((r) => r.text());
    return stub;
  }

  // ── Read Endpoints ─────────────────────────────────────────

  handleStatus() {
    const [stats] = [...this.sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'retrying' THEN 1 ELSE 0 END) AS retrying,
        SUM(CASE WHEN status = 'dead_letter' THEN 1 ELSE 0 END) AS dead_letter
      FROM scrape_jobs
    `];

    return this.jsonResponse({
      agent: "ScrapeAgent",
      status: "active",
      queue: stats || { total: 0, queued: 0, running: 0, completed: 0, retrying: 0, dead_letter: 0 },
    });
  }

  handleGetJob(jobId) {
    const rows = [...this.sql`SELECT * FROM scrape_jobs WHERE id = ${Number(jobId)}`];
    if (rows.length === 0) return this.jsonResponse({ error: "Job not found" }, 404);
    return this.jsonResponse(this.mapJob(rows[0]));
  }

  handleListJobs(url) {
    const status = url.searchParams.get("status");
    const jobType = url.searchParams.get("type");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let rows;
    if (status && jobType) {
      rows = [...this.sql`
        SELECT * FROM scrape_jobs WHERE status = ${status} AND job_type = ${jobType}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `];
    } else if (status) {
      rows = [...this.sql`
        SELECT * FROM scrape_jobs WHERE status = ${status}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `];
    } else if (jobType) {
      rows = [...this.sql`
        SELECT * FROM scrape_jobs WHERE job_type = ${jobType}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `];
    } else {
      rows = [...this.sql`
        SELECT * FROM scrape_jobs ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `];
    }

    const [countRow] = [...this.sql`SELECT COUNT(*) AS total FROM scrape_jobs`];
    return this.jsonResponse({ jobs: rows.map((r) => this.mapJob(r)), total: countRow?.total || 0 });
  }

  handleDeadLetters(url) {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const rows = [...this.sql`
      SELECT * FROM scrape_jobs WHERE status = 'dead_letter'
      ORDER BY completed_at DESC LIMIT ${limit}
    `];
    return this.jsonResponse({ jobs: rows.map((r) => this.mapJob(r)), total: rows.length });
  }

  handleRetry(jobId) {
    const id = Number(jobId);
    const rows = [...this.sql`
      SELECT id FROM scrape_jobs WHERE id = ${id} AND status IN ('failed', 'dead_letter')
    `];
    if (rows.length === 0) {
      return this.jsonResponse({ error: "Job not found or not in retryable state" }, 404);
    }

    this.rawSql.exec(
      `UPDATE scrape_jobs SET status = 'queued', attempt = 0, error_message = NULL,
       scheduled_at = datetime('now'), started_at = NULL, completed_at = NULL, result = NULL
       WHERE id = ?`,
      id
    );

    this.info("retried", { jobId: id });
    return this.jsonResponse({ status: "queued", message: "Job re-queued for retry" });
  }

  // ── Helpers ────────────────────────────────────────────────

  mapJob(row) {
    let target = row.target;
    let result = row.result;
    try { if (typeof target === "string") target = JSON.parse(target); } catch { /* keep string */ }
    try { if (typeof result === "string") result = JSON.parse(result); } catch { /* keep string */ }

    return {
      id: row.id,
      jobType: row.job_type,
      target,
      chittyId: row.chitty_id,
      status: row.status,
      attempt: row.attempt,
      maxAttempts: row.max_attempts,
      scheduledAt: row.scheduled_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      result,
      errorMessage: row.error_message,
      parentJobId: row.parent_job_id,
      cronSource: row.cron_source,
      createdAt: row.created_at,
    };
  }
}
