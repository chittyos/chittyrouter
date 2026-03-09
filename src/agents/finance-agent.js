/**
 * FinanceAgent — Transaction tracking, invoicing, entity ledger.
 * Tracks financial flows across all 6 orgs with categorization and reconciliation.
 * Phase 8 of Agents SDK migration.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from "./base-agent.js";

const TRANSACTION_TYPES = [
  "income", "expense", "transfer", "refund",
  "invoice", "payment", "fee", "deposit",
];

export class FinanceAgent extends ChittyRouterBaseAgent {
  // Note: all sql.exec calls below use the built-in SQLite API, not child_process
  async onStart() {
    await super.onStart();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_type TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        description TEXT,
        from_entity TEXT,
        to_entity TEXT,
        org TEXT,
        case_id TEXT,
        reference_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        metadata TEXT,
        transaction_date TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        org TEXT,
        to_entity TEXT,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        line_items TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        due_date TEXT,
        paid_date TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT NOT NULL,
        org TEXT,
        debit REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0,
        balance REAL NOT NULL DEFAULT 0,
        description TEXT,
        transaction_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (transaction_id) REFERENCES transactions(id)
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/transaction")) return this.handleTransaction(request);
    if (request.method === "POST" && url.pathname.endsWith("/invoice")) return this.handleInvoice(request);
    if (request.method === "GET" && url.pathname.endsWith("/ledger")) return this.handleLedger(url);
    if (request.method === "GET" && url.pathname.endsWith("/summary")) return this.handleSummary(url);
    if (request.method === "GET" && url.pathname.endsWith("/stats")) return this.handleStats();
    if (request.method === "GET" && url.pathname.endsWith("/status")) return this.handleStatus();

    return this.jsonResponse({
      agent: "FinanceAgent", status: "active",
      endpoints: ["/transaction", "/invoice", "/ledger", "/summary", "/stats", "/status"],
    });
  }

  async handleTransaction(request) {
    const body = await request.json();
    const { transaction_type, category, amount, currency, description,
            from_entity, to_entity, org, case_id, reference_id, transaction_date, metadata } = body;

    if (!transaction_type || !TRANSACTION_TYPES.includes(transaction_type)) {
      return this.jsonResponse({ error: `transaction_type must be one of: ${TRANSACTION_TYPES.join(", ")}` }, 400);
    }
    if (amount === undefined || amount === null) return this.jsonResponse({ error: "amount is required" }, 400);

    this.sql.exec(
      `INSERT INTO transactions (transaction_type, category, amount, currency, description,
       from_entity, to_entity, org, case_id, reference_id, status, transaction_date, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
      transaction_type, category || "other", amount, currency || "USD",
      description || null, from_entity || null, to_entity || null,
      org || null, case_id || null, reference_id || null,
      transaction_date || new Date().toISOString(),
      metadata ? JSON.stringify(metadata) : null,
    );

    const txnId = this.sql.exec("SELECT last_insert_rowid() as id").toArray()[0]?.id;

    if (from_entity) this.recordLedgerEntry(from_entity, org, amount, 0, description, txnId);
    if (to_entity) this.recordLedgerEntry(to_entity, org, 0, amount, description, txnId);

    this.info("Transaction recorded", { txnId, transaction_type, amount, org });
    return this.jsonResponse({ id: txnId, transaction_type, amount, currency: currency || "USD", status: "completed", org: org || null });
  }

  async handleInvoice(request) {
    const { invoice_number, org, to_entity, amount, currency, line_items, due_date, metadata } = await request.json();
    if (!invoice_number || amount === undefined) return this.jsonResponse({ error: "invoice_number and amount are required" }, 400);

    this.sql.exec(
      "INSERT INTO invoices (invoice_number, org, to_entity, amount, currency, line_items, due_date, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      invoice_number, org || null, to_entity || null, amount, currency || "USD",
      line_items ? JSON.stringify(line_items) : null, due_date || null,
      metadata ? JSON.stringify(metadata) : null,
    );

    this.info("Invoice created", { invoice_number, amount, org });
    return this.jsonResponse({ invoice_number, amount, currency: currency || "USD", status: "draft" });
  }

  handleLedger(url) {
    const entity_id = url.searchParams.get("entity_id");
    if (!entity_id) return this.jsonResponse({ error: "entity_id query param required" }, 400);

    let query = "SELECT * FROM ledger_entries WHERE entity_id = ?";
    const params = [entity_id];
    const org = url.searchParams.get("org");
    if (org) { query += " AND org = ?"; params.push(org); }
    query += " ORDER BY created_at DESC LIMIT 200";

    const rows = this.sql.exec(query, ...params).toArray();
    const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
    const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);
    return this.jsonResponse({ entity_id, entries: rows, totalDebit, totalCredit, netBalance: totalCredit - totalDebit });
  }

  handleSummary(url) {
    let query = "SELECT transaction_type, category, SUM(amount) as total, COUNT(*) as count FROM transactions WHERE 1=1";
    const params = [];

    const org = url.searchParams.get("org");
    if (org) { query += " AND org = ?"; params.push(org); }
    const from = url.searchParams.get("from");
    if (from) { query += " AND transaction_date >= ?"; params.push(from); }
    const to = url.searchParams.get("to");
    if (to) { query += " AND transaction_date <= ?"; params.push(to); }

    query += " GROUP BY transaction_type, category ORDER BY total DESC";
    const rows = this.sql.exec(query, ...params).toArray();

    const totalIncome = rows.filter((r) => r.transaction_type === "income").reduce((s, r) => s + r.total, 0);
    const totalExpense = rows.filter((r) => r.transaction_type === "expense").reduce((s, r) => s + r.total, 0);

    return this.jsonResponse({
      org: org || "all", period: { from: from || "all-time", to: to || "now" },
      totalIncome, totalExpense, netCashFlow: totalIncome - totalExpense, breakdown: rows,
    });
  }

  recordLedgerEntry(entityId, org, debit, credit, description, transactionId) {
    const last = this.sql.exec("SELECT balance FROM ledger_entries WHERE entity_id = ? ORDER BY created_at DESC LIMIT 1", entityId).toArray();
    const newBalance = (last.length > 0 ? last[0].balance : 0) + credit - debit;
    this.sql.exec(
      "INSERT INTO ledger_entries (entity_id, org, debit, credit, balance, description, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      entityId, org || null, debit, credit, newBalance, description || null, transactionId,
    );
  }

  handleStats() {
    const byType = this.sql.exec("SELECT transaction_type, COUNT(*) as count, SUM(amount) as total FROM transactions GROUP BY transaction_type ORDER BY total DESC").toArray();
    const total = this.sql.exec("SELECT COUNT(*) as count, SUM(amount) as total FROM transactions").toArray();
    const invoiceCount = this.sql.exec("SELECT COUNT(*) as count FROM invoices").toArray();
    return this.jsonResponse({ totalTransactions: total[0]?.count || 0, totalVolume: total[0]?.total || 0, totalInvoices: invoiceCount[0]?.count || 0, breakdown: byType });
  }

  handleStatus() {
    const recent = this.sql.exec("SELECT COUNT(*) as count, SUM(amount) as total FROM transactions WHERE created_at > datetime('now', '-1 hour')").toArray();
    return this.jsonResponse({ agent: "FinanceAgent", status: "active", transactionsLastHour: recent[0]?.count || 0, volumeLastHour: recent[0]?.total || 0 });
  }
}
