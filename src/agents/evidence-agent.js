/**
 * EvidenceAgent — Chain of custody, integrity verification, exhibit management.
 * Delegates heavy storage to chittyevidence-db; tracks custody and verification locally.
 * Phase 6 of Agents SDK migration.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from './base-agent.js';

const EXHIBIT_CATEGORIES = [
  'financial', 'communication', 'identification',
  'photographic', 'contractual', 'legal_filing', 'other',
];

export class EvidenceAgent extends ChittyRouterBaseAgent {
  // Note: all sql.exec calls below use the built-in SQLite API, not child_process
  async onStart() {
    await super.onStart();
    this.rawSql.exec(`
      CREATE TABLE IF NOT EXISTS evidence_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exhibit_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ingested',
        source TEXT,
        case_id TEXT,
        org TEXT,
        sha256 TEXT,
        r2_path TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.rawSql.exec(`
      CREATE TABLE IF NOT EXISTS custody_chain (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evidence_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        description TEXT,
        integrity_hash TEXT,
        occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (evidence_id) REFERENCES evidence_items(id)
      )
    `);
    this.rawSql.exec(`
      CREATE TABLE IF NOT EXISTS verification_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evidence_id INTEGER NOT NULL,
        verification_type TEXT NOT NULL,
        result TEXT NOT NULL,
        verifier TEXT,
        notes TEXT,
        verified_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (evidence_id) REFERENCES evidence_items(id)
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname.endsWith('/ingest')) {
      return this.handleIngest(request);
    }
    if (request.method === 'POST' && url.pathname.endsWith('/verify')) {
      return this.handleVerify(request);
    }
    if (request.method === 'POST' && url.pathname.endsWith('/seal')) {
      return this.handleSeal(request);
    }
    if (request.method === 'POST' && url.pathname.endsWith('/dispute')) {
      return this.handleDispute(request);
    }
    if (request.method === 'GET' && url.pathname.endsWith('/custody')) {
      return this.handleCustody(url);
    }
    if (request.method === 'GET' && url.pathname.endsWith('/search')) {
      return this.handleSearch(url);
    }
    if (request.method === 'GET' && url.pathname.endsWith('/stats')) {
      return this.handleStats();
    }
    if (request.method === 'GET' && url.pathname.endsWith('/status')) {
      return this.handleStatus();
    }

    return this.jsonResponse({
      agent: 'EvidenceAgent',
      status: 'active',
      endpoints: ['/ingest', '/verify', '/seal', '/dispute', '/custody', '/search', '/stats', '/status'],
    });
  }

  async handleIngest(request) {
    const body = await request.json();
    const { exhibit_id, title, category, source, case_id, org, sha256, r2_path, metadata } = body;

    if (!exhibit_id || !title) {
      return this.jsonResponse({ error: 'exhibit_id and title are required' }, 400);
    }
    if (!EXHIBIT_CATEGORIES.includes(category || 'other')) {
      return this.jsonResponse({ error: `category must be one of: ${EXHIBIT_CATEGORIES.join(', ')}` }, 400);
    }

    const existing = this.rawSql.exec('SELECT id FROM evidence_items WHERE exhibit_id = ?', exhibit_id).toArray();
    if (existing.length > 0) {
      return this.jsonResponse({ error: `Exhibit ${exhibit_id} already exists` }, 409);
    }

    this.rawSql.exec(
      `INSERT INTO evidence_items (exhibit_id, title, category, source, case_id, org, sha256, r2_path, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      exhibit_id, title, category || 'other', source || null,
      case_id || null, org || null, sha256 || null, r2_path || null,
      metadata ? JSON.stringify(metadata) : null,
    );

    const created = this.rawSql.exec('SELECT last_insert_rowid() as id').toArray();
    const evidenceId = created[0]?.id;

    this.recordCustody(evidenceId, 'ingested', 'system', `Evidence "${title}" ingested as ${exhibit_id}`, sha256);
    this.info('Evidence ingested', { evidenceId, exhibit_id, category });

    return this.jsonResponse({
      id: evidenceId, exhibit_id, title,
      category: category || 'other', status: 'ingested',
      chain_of_custody: [{ action: 'ingested', actor: 'system', occurred_at: new Date().toISOString() }],
    });
  }

  async handleVerify(request) {
    const { exhibit_id, verification_type, verifier, expected_sha256, notes } = await request.json();
    if (!exhibit_id) return this.jsonResponse({ error: 'exhibit_id is required' }, 400);

    const rows = this.rawSql.exec('SELECT * FROM evidence_items WHERE exhibit_id = ?', exhibit_id).toArray();
    if (rows.length === 0) return this.jsonResponse({ error: 'Evidence not found' }, 404);

    const evidence = rows[0];
    let result = 'passed';
    if (expected_sha256 && evidence.sha256 && expected_sha256 !== evidence.sha256) {
      result = 'failed_integrity';
    }

    this.rawSql.exec(
      'INSERT INTO verification_log (evidence_id, verification_type, result, verifier, notes) VALUES (?, ?, ?, ?, ?)',
      evidence.id, verification_type || 'manual', result, verifier || 'system', notes || null,
    );

    if (result === 'passed' && evidence.status === 'ingested') {
      this.rawSql.exec('UPDATE evidence_items SET status = \'verified\', updated_at = datetime(\'now\') WHERE id = ?', evidence.id);
      this.recordCustody(evidence.id, 'verified', verifier || 'system', 'Verification passed');
    } else if (result === 'failed_integrity') {
      this.recordCustody(evidence.id, 'integrity_failed', verifier || 'system', 'SHA-256 mismatch detected');
    }

    return this.jsonResponse({ exhibit_id, verification_type: verification_type || 'manual', result, status: result === 'passed' ? 'verified' : evidence.status });
  }

  async handleSeal(request) {
    const { exhibit_id, sealed_by } = await request.json();
    if (!exhibit_id) return this.jsonResponse({ error: 'exhibit_id is required' }, 400);

    const rows = this.rawSql.exec('SELECT * FROM evidence_items WHERE exhibit_id = ?', exhibit_id).toArray();
    if (rows.length === 0) return this.jsonResponse({ error: 'Evidence not found' }, 404);

    if (rows[0].status !== 'verified') {
      return this.jsonResponse({ error: 'Evidence must be verified before sealing' }, 400);
    }

    this.rawSql.exec('UPDATE evidence_items SET status = \'sealed\', updated_at = datetime(\'now\') WHERE id = ?', rows[0].id);
    this.recordCustody(rows[0].id, 'sealed', sealed_by || 'system', 'Evidence sealed');

    return this.jsonResponse({ exhibit_id, status: 'sealed' });
  }

  async handleDispute(request) {
    const { exhibit_id, disputed_by, reason } = await request.json();
    if (!exhibit_id || !reason) return this.jsonResponse({ error: 'exhibit_id and reason required' }, 400);

    const rows = this.rawSql.exec('SELECT * FROM evidence_items WHERE exhibit_id = ?', exhibit_id).toArray();
    if (rows.length === 0) return this.jsonResponse({ error: 'Evidence not found' }, 404);

    this.rawSql.exec('UPDATE evidence_items SET status = \'disputed\', updated_at = datetime(\'now\') WHERE id = ?', rows[0].id);
    this.recordCustody(rows[0].id, 'disputed', disputed_by || 'unknown', `Dispute filed: ${reason}`);

    return this.jsonResponse({ exhibit_id, status: 'disputed', reason });
  }

  handleCustody(url) {
    const exhibit_id = url.searchParams.get('exhibit_id');
    if (!exhibit_id) return this.jsonResponse({ error: 'exhibit_id query param required' }, 400);

    const evidence = this.rawSql.exec('SELECT * FROM evidence_items WHERE exhibit_id = ?', exhibit_id).toArray();
    if (evidence.length === 0) return this.jsonResponse({ error: 'Evidence not found' }, 404);

    const chain = this.rawSql.exec('SELECT * FROM custody_chain WHERE evidence_id = ? ORDER BY occurred_at ASC', evidence[0].id).toArray();
    const verifications = this.rawSql.exec('SELECT * FROM verification_log WHERE evidence_id = ? ORDER BY verified_at ASC', evidence[0].id).toArray();

    return this.jsonResponse({ exhibit_id, title: evidence[0].title, status: evidence[0].status, chain_of_custody: chain, verifications });
  }

  handleSearch(url) {
    let query = 'SELECT * FROM evidence_items WHERE 1=1';
    const params = [];

    const category = url.searchParams.get('category');
    if (category) { query += ' AND category = ?'; params.push(category); }
    const status = url.searchParams.get('status');
    if (status) { query += ' AND status = ?'; params.push(status); }
    const case_id = url.searchParams.get('case_id');
    if (case_id) { query += ' AND case_id = ?'; params.push(case_id); }
    const q = url.searchParams.get('q');
    if (q) { query += ' AND (title LIKE ? OR exhibit_id LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

    query += ' ORDER BY updated_at DESC LIMIT 100';
    const rows = this.rawSql.exec(query, ...params).toArray();
    return this.jsonResponse({ count: rows.length, evidence: rows });
  }

  recordCustody(evidenceId, action, actor, description, integrityHash) {
    this.rawSql.exec(
      'INSERT INTO custody_chain (evidence_id, action, actor, description, integrity_hash) VALUES (?, ?, ?, ?, ?)',
      evidenceId, action, actor, description || null, integrityHash || null,
    );
  }

  handleStats() {
    const byCategory = this.rawSql.exec('SELECT category, status, COUNT(*) as count FROM evidence_items GROUP BY category, status ORDER BY count DESC').toArray();
    const total = this.rawSql.exec('SELECT COUNT(*) as total FROM evidence_items').toArray();
    const sealedCount = this.rawSql.exec('SELECT COUNT(*) as count FROM evidence_items WHERE status = \'sealed\'').toArray();
    return this.jsonResponse({ totalEvidence: total[0]?.total || 0, sealedEvidence: sealedCount[0]?.count || 0, breakdown: byCategory });
  }

  handleStatus() {
    const recent = this.rawSql.exec('SELECT COUNT(*) as count FROM evidence_items WHERE created_at > datetime(\'now\', \'-1 hour\')').toArray();
    return this.jsonResponse({ agent: 'EvidenceAgent', status: 'active', evidenceLastHour: recent[0]?.count || 0, categories: EXHIBIT_CATEGORIES.length });
  }
}
