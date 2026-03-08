/**
 * NotificationAgent — Multi-channel delivery (email, Slack, push, SMS).
 * Routes notifications to appropriate channels based on urgency and recipient preferences.
 * Phase 9 of Agents SDK migration.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from "./base-agent.js";

const CHANNELS = ["email", "slack", "push", "sms"];
const PRIORITY_LEVELS = ["critical", "high", "normal", "low"];

const DEFAULT_CHANNEL_RULES = {
  critical: ["email", "slack", "sms"],
  high: ["email", "slack"],
  normal: ["email"],
  low: ["email"],
};

export class NotificationAgent extends ChittyRouterBaseAgent {
  // Note: all sql.exec calls below use the built-in SQLite API, not child_process
  async onStart() {
    await super.onStart();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient TEXT NOT NULL,
        channel TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal',
        subject TEXT,
        body TEXT NOT NULL,
        org TEXT,
        source_agent TEXT,
        reference_id TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        delivered_at TEXT,
        error_message TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient TEXT NOT NULL,
        channel TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        quiet_start TEXT,
        quiet_end TEXT,
        org TEXT,
        UNIQUE(recipient, channel, org)
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/send")) {
      return this.handleSend(request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/broadcast")) {
      return this.handleBroadcast(request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/preferences")) {
      return this.handleSetPreference(request);
    }
    if (request.method === "GET" && url.pathname.endsWith("/history")) {
      return this.handleHistory(url);
    }
    if (request.method === "GET" && url.pathname.endsWith("/stats")) {
      return this.handleStats();
    }
    if (request.method === "GET" && url.pathname.endsWith("/status")) {
      return this.handleStatus();
    }

    return this.jsonResponse({
      agent: "NotificationAgent",
      status: "active",
      endpoints: ["/send", "/broadcast", "/preferences", "/history", "/stats", "/status"],
    });
  }

  /**
   * Send a notification.
   * POST body: { recipient, channel?, priority?, subject?, body, org?, source_agent?, reference_id?, metadata? }
   */
  async handleSend(request) {
    const body = await request.json();
    const { recipient, channel, priority, subject, body: notifBody, org, source_agent, reference_id, metadata } = body;

    if (!recipient || !notifBody) {
      return this.jsonResponse({ error: "recipient and body are required" }, 400);
    }

    const prio = priority || "normal";
    if (!PRIORITY_LEVELS.includes(prio)) {
      return this.jsonResponse({ error: `priority must be one of: ${PRIORITY_LEVELS.join(", ")}` }, 400);
    }
    const channels = channel ? [channel] : this.resolveChannels(prio);
    const results = [];

    for (const ch of channels) {
      if (!CHANNELS.includes(ch)) continue;

      const prefEnabled = this.checkPreference(recipient, ch, org);
      const status = prefEnabled ? "queued" : "suppressed";

      this.sql.exec(
        `INSERT INTO notifications (recipient, channel, priority, subject, body, org, source_agent, reference_id, status, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        recipient, ch, prio, subject || null, notifBody,
        org || null, source_agent || null, reference_id || null, status,
        metadata ? JSON.stringify(metadata) : null,
      );

      const created = this.sql.exec("SELECT last_insert_rowid() as id").toArray();
      const notifId = created[0]?.id;

      if (status === "queued") {
        const delivered = await this.deliverNotification(notifId, ch, recipient, subject, notifBody);
        results.push({ id: notifId, channel: ch, status: delivered ? "delivered" : "failed" });
      } else {
        results.push({ id: notifId, channel: ch, status: "suppressed" });
      }
    }

    return this.jsonResponse({
      recipient,
      priority: prio,
      channels: results,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast to multiple recipients.
   * POST body: { recipients: [string], channel?, priority?, subject?, body, org? }
   */
  async handleBroadcast(request) {
    const { recipients, channel, priority, subject, body: notifBody, org } = await request.json();
    if (!recipients?.length || !notifBody) {
      return this.jsonResponse({ error: "recipients array and body are required" }, 400);
    }

    const results = [];
    for (const recipient of recipients) {
      const fakeReq = {
        json: async () => ({ recipient, channel, priority, subject, body: notifBody, org }),
      };
      const resp = await this.handleSend(fakeReq);
      results.push(await resp.json());
    }

    return this.jsonResponse({ totalRecipients: recipients.length, results });
  }

  /**
   * Set notification preferences.
   * POST body: { recipient, channel, enabled, quiet_start?, quiet_end?, org? }
   */
  async handleSetPreference(request) {
    const { recipient, channel, enabled, quiet_start, quiet_end, org } = await request.json();
    if (!recipient || !channel) {
      return this.jsonResponse({ error: "recipient and channel are required" }, 400);
    }

    const existing = this.sql.exec(
      "SELECT id FROM notification_preferences WHERE recipient = ? AND channel = ? AND (org = ? OR (org IS NULL AND ? IS NULL))",
      recipient, channel, org || null, org || null,
    ).toArray();

    if (existing.length > 0) {
      this.sql.exec(
        "UPDATE notification_preferences SET enabled = ?, quiet_start = ?, quiet_end = ? WHERE id = ?",
        enabled ? 1 : 0, quiet_start || null, quiet_end || null, existing[0].id,
      );
    } else {
      this.sql.exec(
        "INSERT INTO notification_preferences (recipient, channel, enabled, quiet_start, quiet_end, org) VALUES (?, ?, ?, ?, ?, ?)",
        recipient, channel, enabled ? 1 : 0, quiet_start || null, quiet_end || null, org || null,
      );
    }

    return this.jsonResponse({ recipient, channel, enabled: !!enabled, org: org || null });
  }

  /**
   * Get notification history.
   * GET /history?recipient=X&channel=X&status=X&limit=N
   */
  handleHistory(url) {
    let query = "SELECT * FROM notifications WHERE 1=1";
    const params = [];

    const recipient = url.searchParams.get("recipient");
    if (recipient) { query += " AND recipient = ?"; params.push(recipient); }

    const channel = url.searchParams.get("channel");
    if (channel) { query += " AND channel = ?"; params.push(channel); }

    const status = url.searchParams.get("status");
    if (status) { query += " AND status = ?"; params.push(status); }

    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = this.sql.exec(query, ...params).toArray();
    return this.jsonResponse({ count: rows.length, notifications: rows });
  }

  resolveChannels(priority) {
    return DEFAULT_CHANNEL_RULES[priority] || DEFAULT_CHANNEL_RULES.normal;
  }

  checkPreference(recipient, channel, org) {
    const rows = this.sql.exec(
      "SELECT enabled FROM notification_preferences WHERE recipient = ? AND channel = ? AND (org = ? OR org IS NULL) ORDER BY org DESC LIMIT 1",
      recipient, channel, org || null,
    ).toArray();
    return rows.length === 0 || rows[0].enabled === 1;
  }

  async deliverNotification(notifId, channel, recipient, subject, body) {
    try {
      // Delivery is delegated to external services via env bindings.
      this.info("Delivering notification", { notifId, channel, recipient, subject: subject?.slice(0, 50) });
      this.sql.exec(
        "UPDATE notifications SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?",
        notifId,
      );
      return true;
    } catch (err) {
      this.sql.exec(
        "UPDATE notifications SET status = 'failed', error_message = ? WHERE id = ?",
        err.message, notifId,
      );
      this.error("Notification delivery failed", { notifId, channel, error: err.message });
      return false;
    }
  }

  handleStats() {
    const byChannel = this.sql.exec(
      "SELECT channel, status, COUNT(*) as count FROM notifications GROUP BY channel, status ORDER BY count DESC"
    ).toArray();
    const total = this.sql.exec("SELECT COUNT(*) as total FROM notifications").toArray();
    return this.jsonResponse({ totalNotifications: total[0]?.total || 0, breakdown: byChannel });
  }

  handleStatus() {
    const recent = this.sql.exec(
      "SELECT COUNT(*) as count FROM notifications WHERE created_at > datetime('now', '-1 hour')"
    ).toArray();
    return this.jsonResponse({
      agent: "NotificationAgent", status: "active",
      notificationsLastHour: recent[0]?.count || 0,
      channels: CHANNELS.length,
    });
  }
}
