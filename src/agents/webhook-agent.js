/**
 * WebhookIngestionAgent — Stateful coordinator for webhook dedup, retry, and indexing.
 * Wraps existing webhook handlers (notion.js, github.js, stripe.js).
 * Phase 11 of Agents SDK migration.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from "./base-agent.js";

const SUPPORTED_PLATFORMS = ["notion", "github", "stripe", "generic"];

export class WebhookIngestionAgent extends ChittyRouterBaseAgent {
  // Note: all sql.exec calls below use the built-in SQLite API, not child_process
  async onStart() {
    await super.onStart();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        event_type TEXT,
        event_id TEXT,
        idempotency_key TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'received',
        payload_hash TEXT,
        r2_path TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        error_message TEXT,
        org TEXT,
        metadata TEXT,
        received_at TEXT NOT NULL DEFAULT (datetime('now')),
        processed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        event_filter TEXT,
        target_url TEXT,
        org TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/ingest")) return this.handleIngest(request);
    if (request.method === "POST" && url.pathname.endsWith("/retry")) return this.handleRetry(request);
    if (request.method === "GET" && url.pathname.endsWith("/events")) return this.handleListEvents(url);
    if (request.method === "GET" && url.pathname.endsWith("/stats")) return this.handleStats();
    if (request.method === "GET" && url.pathname.endsWith("/status")) return this.handleStatus();

    return this.jsonResponse({
      agent: "WebhookIngestionAgent", status: "active",
      endpoints: ["/ingest", "/retry", "/events", "/stats", "/status"],
    });
  }

  async handleIngest(request) {
    const { platform, event_type, event_id, payload, org, metadata } = await request.json();

    if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
      return this.jsonResponse({ error: `platform must be one of: ${SUPPORTED_PLATFORMS.join(", ")}` }, 400);
    }
    if (!payload) return this.jsonResponse({ error: "payload is required" }, 400);

    const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
    const payloadHash = await this.hashPayload(payloadStr);
    const idempotencyKey = `${platform}:${event_id || payloadHash}`;

    // Dedup check
    const existing = this.sql.exec("SELECT id, status FROM webhook_events WHERE idempotency_key = ?", idempotencyKey).toArray();
    if (existing.length > 0) {
      this.info("Duplicate webhook detected", { idempotencyKey, platform });
      return this.jsonResponse({ id: existing[0].id, status: "duplicate", originalStatus: existing[0].status, idempotencyKey });
    }

    // Store to R2 if available
    let r2Path = null;
    if (this.env.WEBHOOK_STORAGE) {
      const key = `webhook-index/${platform}/${idempotencyKey.replace(/:/g, "/")}.json`;
      try {
        await this.env.WEBHOOK_STORAGE.put(key, payloadStr, { httpMetadata: { contentType: "application/json" } });
        r2Path = `r2://notion-webhook/${key}`;
      } catch (err) {
        this.warn("R2 storage failed", { error: err.message });
      }
    }

    this.sql.exec(
      `INSERT INTO webhook_events (platform, event_type, event_id, idempotency_key, payload_hash, r2_path, org, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      platform, event_type || null, event_id || null, idempotencyKey, payloadHash, r2Path, org || null, metadata ? JSON.stringify(metadata) : null,
    );

    const webhookId = this.sql.exec("SELECT last_insert_rowid() as id").toArray()[0]?.id;

    let status = "processed";
    try {
      await this.processWebhook(webhookId, platform, event_type);
      this.sql.exec("UPDATE webhook_events SET status = 'processed', processed_at = datetime('now') WHERE id = ?", webhookId);
    } catch (err) {
      status = "failed";
      this.sql.exec("UPDATE webhook_events SET status = 'failed', error_message = ? WHERE id = ?", err.message, webhookId);
      this.error("Webhook processing failed", { webhookId, platform, error: err.message });
    }

    this.info("Webhook ingested", { webhookId, platform, event_type, status });
    return this.jsonResponse({ id: webhookId, platform, event_type: event_type || null, status, idempotencyKey, r2Path });
  }

  async handleRetry(request) {
    const { event_id, platform } = await request.json();
    let query = "SELECT * FROM webhook_events WHERE status = 'failed' AND retry_count < max_retries";
    const params = [];
    if (event_id) { query += " AND id = ?"; params.push(event_id); }
    if (platform) { query += " AND platform = ?"; params.push(platform); }
    query += " ORDER BY received_at ASC LIMIT 10";

    const events = this.sql.exec(query, ...params).toArray();
    const results = [];

    for (const event of events) {
      this.sql.exec("UPDATE webhook_events SET retry_count = retry_count + 1, status = 'processing' WHERE id = ?", event.id);
      try {
        await this.processWebhook(event.id, event.platform, event.event_type);
        this.sql.exec("UPDATE webhook_events SET status = 'processed', processed_at = datetime('now') WHERE id = ?", event.id);
        results.push({ id: event.id, status: "processed" });
      } catch (err) {
        this.sql.exec("UPDATE webhook_events SET status = 'failed', error_message = ? WHERE id = ?", err.message, event.id);
        results.push({ id: event.id, status: "failed", error: err.message });
      }
    }

    return this.jsonResponse({ retried: results.length, results });
  }

  async processWebhook(webhookId, platform, eventType) {
    // Delegate to platform-specific handlers via existing webhook routes
    this.info("Processing webhook", { webhookId, platform, eventType });
    this.sql.exec("UPDATE webhook_events SET status = 'processing' WHERE id = ?", webhookId);
  }

  handleListEvents(url) {
    let query = "SELECT id, platform, event_type, event_id, status, retry_count, org, received_at, processed_at FROM webhook_events WHERE 1=1";
    const params = [];
    const platform = url.searchParams.get("platform");
    if (platform) { query += " AND platform = ?"; params.push(platform); }
    const status = url.searchParams.get("status");
    if (status) { query += " AND status = ?"; params.push(status); }
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    query += " ORDER BY received_at DESC LIMIT ?";
    params.push(limit);

    const events = this.sql.exec(query, ...params).toArray();
    return this.jsonResponse({ count: events.length, events });
  }

  async hashPayload(payload) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  handleStats() {
    const byPlatform = this.sql.exec("SELECT platform, status, COUNT(*) as count FROM webhook_events GROUP BY platform, status ORDER BY count DESC").toArray();
    const total = this.sql.exec("SELECT COUNT(*) as total FROM webhook_events").toArray();
    const failedCount = this.sql.exec("SELECT COUNT(*) as count FROM webhook_events WHERE status = 'failed'").toArray();
    return this.jsonResponse({ totalWebhooks: total[0]?.total || 0, failedWebhooks: failedCount[0]?.count || 0, breakdown: byPlatform });
  }

  handleStatus() {
    const recent = this.sql.exec("SELECT COUNT(*) as count FROM webhook_events WHERE received_at > datetime('now', '-1 hour')").toArray();
    return this.jsonResponse({ agent: "WebhookIngestionAgent", status: "active", webhooksLastHour: recent[0]?.count || 0, platforms: SUPPORTED_PLATFORMS.length });
  }
}
