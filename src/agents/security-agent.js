/**
 * SecurityAgent — Narrowly-scoped handler for security disclosure workflows.
 *
 * Activated by TriageAgent when an inbound communication is classified as
 * `security_incident` OR by PriorityAgent when recipient is an address
 * in CRITICAL_RECIPIENT_ADDRESSES (e.g. security@chitty.cc).
 *
 * Scope (intentionally narrow):
 *   - Acknowledge receipt within the 48h SLA declared in SECURITY.md
 *   - Create a CRITICAL task in chittyagent-tasks (priority 10)
 *   - Create an incident page in Notion Actions DB (Security Reports view)
 *   - Broadcast to #security-incidents via NotificationAgent
 *   - Track state: received → triaged → fix_in_progress → fix_shipped → disclosed
 *   - Monitor SLA breach; escalate on approach
 *
 * Explicitly out of scope:
 *   - Actual vulnerability remediation (that's the responder, not this agent)
 *   - Legal analysis (forwarded to ChittyCounsel if CRITICAL + involves PII)
 *   - Public disclosure drafting (human responder owns)
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 * @canon chittycanon://docs/gov/policy/security
 */
import { ChittyRouterBaseAgent } from './base-agent.js';

// Severity classes per SECURITY.md — adapted CVSS interpretation.
const SEVERITY_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

// SLA targets in milliseconds — from chittyentity/SECURITY.md response table.
const SLA_MS = {
  acknowledgement: 48 * 60 * 60 * 1000, // 48h
  triage: 5 * 24 * 60 * 60 * 1000, // 5 business days (approx as 5 days)
  fix_critical: 14 * 24 * 60 * 60 * 1000, // 14d
  fix_high: 30 * 24 * 60 * 60 * 1000, // 30d
};

// Valid incident states, in order.
const INCIDENT_STATES = [
  'received',
  'acknowledged',
  'triaged',
  'fix_in_progress',
  'fix_shipped',
  'disclosed',
  'closed',
];

export class SecurityAgent extends ChittyRouterBaseAgent {
  async onStart() {
    await super.onStart();
    this.ensureSecurityTables();
  }

  ensureSecurityTables() {
    this.rawSql.exec(`
      CREATE TABLE IF NOT EXISTS security_incidents (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        reporter TEXT,
        subject TEXT,
        content_snippet TEXT,
        state TEXT NOT NULL DEFAULT 'received',
        severity TEXT,
        acknowledged_at TEXT,
        triaged_at TEXT,
        fixed_at TEXT,
        disclosed_at TEXT,
        ack_sla_deadline TEXT NOT NULL,
        fix_sla_deadline TEXT,
        assignee TEXT,
        notion_page_id TEXT,
        task_id TEXT,
        escalated INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.rawSql.exec(`
      CREATE INDEX IF NOT EXISTS idx_incidents_state
        ON security_incidents(state)
    `);
    this.rawSql.exec(`
      CREATE INDEX IF NOT EXISTS idx_incidents_ack_deadline
        ON security_incidents(ack_sla_deadline)
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path.endsWith('/ingest')) {
      return this.handleIngest(request);
    }
    if (request.method === 'POST' && path.endsWith('/acknowledge')) {
      return this.handleAcknowledge(request);
    }
    if (request.method === 'POST' && path.endsWith('/triage')) {
      return this.handleTriage(request);
    }
    if (request.method === 'POST' && path.endsWith('/transition')) {
      return this.handleTransition(request);
    }
    if (request.method === 'GET' && path.endsWith('/open')) {
      return this.handleListOpen();
    }
    if (request.method === 'GET' && path.endsWith('/sla-breaches')) {
      return this.handleSlaBreaches();
    }
    if (request.method === 'GET' && /\/incident\/[^/]+$/.test(path)) {
      const id = path.split('/').pop();
      return this.handleGetIncident(id);
    }
    if (request.method === 'GET' && path.endsWith('/status')) {
      return this.handleStatus();
    }

    return this.jsonResponse({
      agent: 'SecurityAgent',
      status: 'active',
      canon: 'chittycanon://docs/gov/policy/security',
      endpoints: [
        '/ingest',
        '/acknowledge',
        '/triage',
        '/transition',
        '/open',
        '/sla-breaches',
        '/incident/:id',
        '/status',
      ],
    });
  }

  /**
   * Ingest a new security incident. Called by ChittyRouter when TriageAgent
   * returns category=security_incident OR PriorityAgent returns
   * recipientOverride=true for security@chitty.cc.
   *
   * Body: { reporter, subject, content, message_id, recipient }
   * Returns: { incident_id, state: "received", ack_sla_deadline }
   */
  async handleIngest(request) {
    const body = await request.json().catch(() => null);
    if (!body || !body.reporter || !body.subject) {
      return this.jsonResponse(
        {
          error: {
            code: 'BAD_INPUT',
            message: 'reporter and subject required',
            retryable: false,
          },
        },
        400,
      );
    }

    const id = `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const ackDeadline = new Date(now + SLA_MS.acknowledgement).toISOString();

    this.rawSql.exec(
      `INSERT INTO security_incidents (id, reporter, subject, content_snippet, state, ack_sla_deadline)
       VALUES (?, ?, ?, ?, 'received', ?)`,
      id,
      String(body.reporter),
      String(body.subject),
      String(body.content || '').slice(0, 500),
      ackDeadline,
    );

    this.info('security-incident-received', {
      id,
      reporterProvided: Boolean(body.reporter),
      ackDeadline,
    });

    // Fire the side-channels: task queue, Notion page, Slack broadcast.
    // All are best-effort — failure must not reject the ingest.
    const ctxPromises = [
      this.createSecurityTask(id, body).then(
        (task_id) => this.attachTaskId(id, task_id),
        (err) => this.error('security-task-create-failed', { id, error: err.message }),
      ),
      this.createNotionIncident(id, body).then(
        (page_id) => this.attachNotionPageId(id, page_id),
        (err) => this.error('security-notion-create-failed', { id, error: err.message }),
      ),
      this.broadcastSlack(id, body).catch((err) =>
        this.error('security-slack-broadcast-failed', { id, error: err.message }),
      ),
    ];
    // Hold open with waitUntil if available; else just fire and forget.
    if (this.env && this.ctx && typeof this.ctx.waitUntil === 'function') {
      this.ctx.waitUntil(Promise.allSettled(ctxPromises));
    }

    return this.jsonResponse({
      incident_id: id,
      state: 'received',
      ack_sla_deadline: ackDeadline,
      canon: 'chittycanon://docs/gov/policy/security',
    });
  }

  async handleAcknowledge(request) {
    const { id, acknowledger } = await request.json().catch(() => ({}));
    if (!id) return this.badInput('incident id required');
    const rows = this.rawSql.exec(
      'SELECT id, state FROM security_incidents WHERE id = ?',
      id,
    ).toArray();
    if (rows.length === 0) return this.notFound(`incident ${id}`);

    // Enforce forward-only state machine: acknowledge is only valid from "received"
    const currentState = rows[0].state;
    const disallowedStates = ['acknowledged', 'triaged', 'fix_in_progress', 'fix_shipped', 'disclosed', 'closed'];
    if (disallowedStates.includes(currentState)) {
      return this.jsonResponse(
        {
          error: {
            code: 'CONFLICT',
            message: `cannot acknowledge incident in state '${currentState}'; acknowledge only allowed from 'received'`,
            retryable: false,
          },
        },
        409,
      );
    }

    const now = new Date().toISOString();
    this.rawSql.exec(
      `UPDATE security_incidents
       SET state = 'acknowledged', acknowledged_at = ?, updated_at = ?, assignee = COALESCE(?, assignee)
       WHERE id = ?`,
      now,
      now,
      acknowledger || null,
      id,
    );
    this.info('security-incident-acknowledged', { id, acknowledgerProvided: Boolean(acknowledger) });
    return this.jsonResponse({ incident_id: id, state: 'acknowledged', acknowledged_at: now });
  }

  async handleTriage(request) {
    const { id, severity, assignee } = await request.json().catch(() => ({}));
    if (!id) return this.badInput('incident id required');
    if (!SEVERITY_LEVELS.includes(severity)) {
      return this.badInput(`severity must be one of ${SEVERITY_LEVELS.join(', ')}`);
    }
    const rows = this.rawSql.exec(
      'SELECT id, state FROM security_incidents WHERE id = ?',
      id,
    ).toArray();
    if (rows.length === 0) return this.notFound(`incident ${id}`);

    // Enforce forward-only state machine: triage is only valid from "received" or "acknowledged"
    const currentState = rows[0].state;
    const disallowedStates = ['triaged', 'fix_in_progress', 'fix_shipped', 'disclosed', 'closed'];
    if (disallowedStates.includes(currentState)) {
      return this.jsonResponse(
        {
          error: {
            code: 'CONFLICT',
            message: `cannot triage incident in state '${currentState}'; triage only allowed from 'received' or 'acknowledged'`,
            retryable: false,
          },
        },
        409,
      );
    }

    const now = Date.now();
    const fixMs = severity === 'CRITICAL' ? SLA_MS.fix_critical : SLA_MS.fix_high;
    const fixDeadline = severity === 'LOW' || severity === 'MEDIUM'
      ? null
      : new Date(now + fixMs).toISOString();
    const nowIso = new Date(now).toISOString();

    this.rawSql.exec(
      `UPDATE security_incidents
       SET state = 'triaged', severity = ?, triaged_at = ?, fix_sla_deadline = ?,
           assignee = COALESCE(?, assignee), updated_at = ?
       WHERE id = ?`,
      severity,
      nowIso,
      fixDeadline,
      assignee || null,
      nowIso,
      id,
    );
    this.info('security-incident-triaged', { id, severity, fixDeadline: fixDeadline || null });
    return this.jsonResponse({ incident_id: id, state: 'triaged', severity, fix_sla_deadline: fixDeadline });
  }

  /**
   * Move an incident through its state machine. Validates target state
   * is reachable from current state.
   */
  async handleTransition(request) {
    const { id, to, note } = await request.json().catch(() => ({}));
    if (!id) return this.badInput('incident id required');
    if (!INCIDENT_STATES.includes(to)) {
      return this.badInput(`invalid target state '${to}'`);
    }
    const rows = this.rawSql.exec(
      'SELECT state FROM security_incidents WHERE id = ?',
      id,
    ).toArray();
    if (rows.length === 0) return this.notFound(`incident ${id}`);
    const current = rows[0].state;
    const curIdx = INCIDENT_STATES.indexOf(current);
    const toIdx = INCIDENT_STATES.indexOf(to);
    if (toIdx <= curIdx) {
      return this.jsonResponse(
        {
          error: {
            code: 'CONFLICT',
            message: `cannot transition from '${current}' to '${to}'`,
            retryable: false,
          },
        },
        409,
      );
    }
    const now = new Date().toISOString();
    const column = to === 'fix_shipped' ? 'fixed_at'
      : to === 'disclosed' ? 'disclosed_at' : null;
    if (column) {
      this.rawSql.exec(
        `UPDATE security_incidents SET state = ?, ${column} = ?, updated_at = ? WHERE id = ?`,
        to,
        now,
        now,
        id,
      );
    } else {
      this.rawSql.exec(
        'UPDATE security_incidents SET state = ?, updated_at = ? WHERE id = ?',
        to,
        now,
        id,
      );
    }
    this.info('security-incident-transitioned', { id, from: current, to, noteProvided: Boolean(note) });
    return this.jsonResponse({ incident_id: id, from: current, to });
  }

  handleListOpen() {
    const rows = this.rawSql.exec(
      `SELECT id, reporter, subject, state, severity, ack_sla_deadline, fix_sla_deadline, assignee
       FROM security_incidents
       WHERE state NOT IN ('closed', 'disclosed')
       ORDER BY created_at DESC`,
    ).toArray();
    return this.jsonResponse({ count: rows.length, incidents: rows });
  }

  /**
   * List incidents where the ack SLA deadline is past OR fix SLA is past.
   * Consumers use this to drive escalation alerts.
   */
  handleSlaBreaches() {
    const now = new Date().toISOString();
    const ackBreached = this.rawSql.exec(
      `SELECT id, reporter, subject, state, severity, ack_sla_deadline
       FROM security_incidents
       WHERE state IN ('received')
         AND ack_sla_deadline < ?`,
      now,
    ).toArray();
    const fixBreached = this.rawSql.exec(
      `SELECT id, reporter, subject, state, severity, fix_sla_deadline
       FROM security_incidents
       WHERE state NOT IN ('fix_shipped', 'disclosed', 'closed')
         AND fix_sla_deadline IS NOT NULL
         AND fix_sla_deadline < ?`,
      now,
    ).toArray();
    return this.jsonResponse({
      now,
      ack_breached: ackBreached,
      fix_breached: fixBreached,
      total: ackBreached.length + fixBreached.length,
    });
  }

  handleGetIncident(id) {
    const rows = this.rawSql.exec(
      'SELECT * FROM security_incidents WHERE id = ?',
      id,
    ).toArray();
    if (rows.length === 0) return this.notFound(`incident ${id}`);
    return this.jsonResponse(rows[0]);
  }

  handleStatus() {
    const counts = this.rawSql.exec(
      'SELECT state, COUNT(*) as count FROM security_incidents GROUP BY state',
    ).toArray();
    return this.jsonResponse({
      agent: 'SecurityAgent',
      canon: 'chittycanon://docs/gov/policy/security',
      by_state: counts,
    });
  }

  // ── Side-channel integrations (real bindings, no stubs) ────────────────

  async createSecurityTask(id, body) {
    // Binding: AGENT_TASKS is a ChittyRouter → ChittyTasks service binding.
    // If not bound, this logs and returns — the incident is still recorded
    // in our own DO SQLite, so it is not lost.
    if (!this.env || !this.env.AGENT_TASKS) {
      this.warn('AGENT_TASKS binding absent; skipping task creation', { id });
      return null;
    }
    const res = await this.env.AGENT_TASKS.fetch(
      new Request('https://internal/api/v1/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-From': 'chittyrouter-security-agent',
          Authorization: `Bearer ${this.env.CHITTY_AUTH_SERVICE_TOKEN || ''}`,
        },
        body: JSON.stringify({
          title: `[SECURITY] ${body.subject}`,
          description: `Security disclosure from ${body.reporter}. Incident ${id}. See Notion for details.`,
          priority: 10,
          agent: 'chittyagent-security-responder',
          source_agent: 'chittyrouter-security-agent',
          payload: { incident_id: id, reporter: body.reporter, message_id: body.message_id },
        }),
      }),
    );
    if (!res.ok) {
      throw new Error(`AGENT_TASKS returned ${res.status}`);
    }
    const json = await res.json();
    return json?.task?.id || json?.id || null;
  }

  async createNotionIncident(id, body) {
    if (!this.env || !this.env.AGENT_NOTION) {
      this.warn('AGENT_NOTION binding absent; skipping Notion page', { id });
      return null;
    }
    const res = await this.env.AGENT_NOTION.fetch(
      new Request('https://internal/api/v1/security-incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-From': 'chittyrouter-security-agent',
        },
        body: JSON.stringify({
          incident_id: id,
          reporter: body.reporter,
          subject: body.subject,
          content_snippet: String(body.content || '').slice(0, 2000),
          state: 'received',
        }),
      }),
    );
    if (!res.ok) {
      throw new Error(`AGENT_NOTION returned ${res.status}`);
    }
    const json = await res.json();
    return json?.page_id || null;
  }

  async broadcastSlack(id, body) {
    // NotificationAgent is a sibling DO in this same worker; use its HTTP API.
    const stub = this.env && this.env.NOTIFICATION_AGENT
      ? this.env.NOTIFICATION_AGENT.get(this.env.NOTIFICATION_AGENT.idFromName('default'))
      : null;
    if (!stub) {
      this.warn('NOTIFICATION_AGENT binding absent; skipping Slack broadcast', { id });
      return;
    }
    const res = await stub.fetch(
      new Request('https://internal/agents/notification/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'slack:#security-incidents',
          priority: 'critical',
          title: `[SECURITY] ${body.subject}`,
          body: `Incident ${id} — reporter ${body.reporter}. 48h ACK SLA running.`,
        }),
      }),
    );
    if (!res.ok) {
      throw new Error(`NOTIFICATION_AGENT returned ${res.status}`);
    }
  }

  attachTaskId(id, taskId) {
    if (!taskId) return;
    this.rawSql.exec(
      'UPDATE security_incidents SET task_id = ? WHERE id = ?',
      String(taskId),
      id,
    );
  }

  attachNotionPageId(id, pageId) {
    if (!pageId) return;
    this.rawSql.exec(
      'UPDATE security_incidents SET notion_page_id = ? WHERE id = ?',
      String(pageId),
      id,
    );
  }

  // ── Response helpers ──────────────────────────────────────────────────

  badInput(message) {
    return this.jsonResponse(
      {
        error: {
          code: 'BAD_INPUT',
          message,
          retryable: false,
        },
      },
      400,
    );
  }

  notFound(what) {
    return this.jsonResponse(
      {
        error: {
          code: 'NOT_FOUND',
          message: `${what} not found`,
          retryable: false,
        },
      },
      404,
    );
  }
}
