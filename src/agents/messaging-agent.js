/**
 * MessagingAgent — WebSocket-native conversations (iMessage, SMS, chat).
 * Manages conversation threads with message persistence and real-time sync.
 * Phase 10 of Agents SDK migration.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from "./base-agent.js";

export class MessagingAgent extends ChittyRouterBaseAgent {
  // Note: all sql.exec calls below use the built-in SQLite API, not child_process
  async onStart() {
    await super.onStart();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL UNIQUE,
        subject TEXT,
        participants TEXT NOT NULL,
        org TEXT,
        channel TEXT NOT NULL DEFAULT 'chat',
        status TEXT NOT NULL DEFAULT 'active',
        last_message_at TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text',
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/conversation")) return this.handleCreateConversation(request);
    if (request.method === "POST" && url.pathname.endsWith("/message")) return this.handleSendMessage(request);
    if (request.method === "GET" && url.pathname.endsWith("/thread")) return this.handleGetThread(url);
    if (request.method === "GET" && url.pathname.endsWith("/conversations")) return this.handleListConversations(url);
    if (request.method === "GET" && url.pathname.endsWith("/stats")) return this.handleStats();
    if (request.method === "GET" && url.pathname.endsWith("/status")) return this.handleStatus();

    return this.jsonResponse({
      agent: "MessagingAgent", status: "active",
      endpoints: ["/conversation", "/message", "/thread", "/conversations", "/stats", "/status"],
    });
  }

  async onConnect(connection) {
    connection.accept();
    this.info("WebSocket client connected");
  }

  async onMessage(connection, message) {
    try {
      const data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));

      if (data.type === "send_message") {
        const result = await this.persistMessage(data.thread_id, data.sender, data.content, data.message_type);
        connection.send(JSON.stringify({ type: "message_ack", ...result }));
      } else if (data.type === "get_thread") {
        const msgs = this.getThreadMessages(data.thread_id, data.limit);
        connection.send(JSON.stringify({ type: "thread_messages", thread_id: data.thread_id, messages: msgs }));
      }
    } catch (err) {
      connection.send(JSON.stringify({ type: "error", error: err.message }));
    }
  }

  async handleCreateConversation(request) {
    const { thread_id, subject, participants, org, channel, metadata } = await request.json();
    if (!participants?.length) return this.jsonResponse({ error: "participants array is required" }, 400);

    const tid = thread_id || `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sql.exec(
      "INSERT INTO conversations (thread_id, subject, participants, org, channel, metadata) VALUES (?, ?, ?, ?, ?, ?)",
      tid, subject || null, JSON.stringify(participants), org || null, channel || "chat", metadata ? JSON.stringify(metadata) : null,
    );

    const id = this.sql.exec("SELECT last_insert_rowid() as id").toArray()[0]?.id;
    this.info("Conversation created", { thread_id: tid, participants: participants.length });
    return this.jsonResponse({ id, thread_id: tid, participants, channel: channel || "chat", status: "active" });
  }

  async handleSendMessage(request) {
    const { thread_id, sender, content, message_type } = await request.json();
    if (!thread_id || !sender || !content) return this.jsonResponse({ error: "thread_id, sender, and content are required" }, 400);
    return this.jsonResponse(await this.persistMessage(thread_id, sender, content, message_type));
  }

  async persistMessage(threadId, sender, content, messageType) {
    const convRows = this.sql.exec("SELECT id FROM conversations WHERE thread_id = ?", threadId).toArray();
    if (convRows.length === 0) throw new Error(`Conversation ${threadId} not found`);

    this.sql.exec("INSERT INTO messages (conversation_id, sender, message_type, content) VALUES (?, ?, ?, ?)", convRows[0].id, sender, messageType || "text", content);
    this.sql.exec("UPDATE conversations SET last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", convRows[0].id);
    const msgId = this.sql.exec("SELECT last_insert_rowid() as id").toArray()[0]?.id;
    return { id: msgId, thread_id: threadId, sender, message_type: messageType || "text", timestamp: new Date().toISOString() };
  }

  handleGetThread(url) {
    const threadId = url.searchParams.get("thread_id");
    if (!threadId) return this.jsonResponse({ error: "thread_id query param required" }, 400);

    const conv = this.sql.exec("SELECT * FROM conversations WHERE thread_id = ?", threadId).toArray();
    const messages = this.getThreadMessages(threadId, parseInt(url.searchParams.get("limit") || "50"));
    return this.jsonResponse({
      thread_id: threadId,
      conversation: conv.length > 0 ? { ...conv[0], participants: JSON.parse(conv[0].participants || "[]") } : null,
      messages, count: messages.length,
    });
  }

  getThreadMessages(threadId, limit) {
    const convRows = this.sql.exec("SELECT id FROM conversations WHERE thread_id = ?", threadId).toArray();
    if (convRows.length === 0) return [];
    const safeLimit = Math.min(limit || 50, 500);
    return this.sql.exec("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?", convRows[0].id, safeLimit).toArray();
  }

  handleListConversations(url) {
    let query = "SELECT * FROM conversations WHERE 1=1";
    const params = [];
    const org = url.searchParams.get("org");
    if (org) { query += " AND org = ?"; params.push(org); }
    const status = url.searchParams.get("status");
    if (status) { query += " AND status = ?"; params.push(status); }
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    query += " ORDER BY last_message_at DESC NULLS LAST LIMIT ?";
    params.push(limit);

    const rows = this.sql.exec(query, ...params).toArray();
    return this.jsonResponse({ count: rows.length, conversations: rows.map((r) => ({ ...r, participants: JSON.parse(r.participants || "[]") })) });
  }

  handleStats() {
    const convCount = this.sql.exec("SELECT COUNT(*) as count FROM conversations").toArray();
    const msgCount = this.sql.exec("SELECT COUNT(*) as count FROM messages").toArray();
    const byChannel = this.sql.exec("SELECT channel, COUNT(*) as count FROM conversations GROUP BY channel ORDER BY count DESC").toArray();
    return this.jsonResponse({ totalConversations: convCount[0]?.count || 0, totalMessages: msgCount[0]?.count || 0, byChannel });
  }

  handleStatus() {
    const recentConv = this.sql.exec("SELECT COUNT(*) as count FROM conversations WHERE created_at > datetime('now', '-1 hour')").toArray();
    const recentMsg = this.sql.exec("SELECT COUNT(*) as count FROM messages WHERE created_at > datetime('now', '-1 hour')").toArray();
    return this.jsonResponse({ agent: "MessagingAgent", status: "active", conversationsLastHour: recentConv[0]?.count || 0, messagesLastHour: recentMsg[0]?.count || 0 });
  }
}
