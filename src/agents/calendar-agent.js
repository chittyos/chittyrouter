/**
 * CalendarAgent — Deadlines, court dates, lease renewals, scheduled events.
 * Tracks critical dates across all 6 orgs with escalation on approaching deadlines.
 * Phase 7 of Agents SDK migration.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from './base-agent.js';

const EVENT_TYPES = [
  'court_date', 'filing_deadline', 'lease_renewal', 'lease_expiry',
  'payment_due', 'inspection', 'meeting', 'review',
  'permit_deadline', 'grant_deadline', 'other',
];

const URGENCY_THRESHOLDS = {
  court_date: 7,
  filing_deadline: 5,
  lease_renewal: 30,
  lease_expiry: 60,
  payment_due: 3,
  inspection: 7,
  permit_deadline: 14,
  grant_deadline: 14,
  default: 7,
};

export class CalendarAgent extends ChittyRouterBaseAgent {
  // Note: all sql.exec calls below use the built-in SQLite API, not child_process
  async onStart() {
    await super.onStart();
    this.rawSql.exec(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_date TEXT NOT NULL,
        event_end_date TEXT,
        org TEXT,
        case_id TEXT,
        entity_id TEXT,
        description TEXT,
        location TEXT,
        is_recurring INTEGER NOT NULL DEFAULT 0,
        recurrence_rule TEXT,
        reminder_sent INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.rawSql.exec(`
      CREATE TABLE IF NOT EXISTS calendar_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        remind_at TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'email',
        sent INTEGER NOT NULL DEFAULT 0,
        sent_at TEXT,
        FOREIGN KEY (event_id) REFERENCES calendar_events(id)
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname.endsWith('/create')) return this.handleCreate(request);
    if (request.method === 'POST' && url.pathname.endsWith('/update')) return this.handleUpdate(request);
    if (request.method === 'GET' && url.pathname.endsWith('/upcoming')) return this.handleUpcoming(url);
    if (request.method === 'GET' && url.pathname.endsWith('/urgent')) return this.handleUrgent(url);
    if (request.method === 'GET' && url.pathname.endsWith('/stats')) return this.handleStats();
    if (request.method === 'GET' && url.pathname.endsWith('/status')) return this.handleStatus();

    return this.jsonResponse({
      agent: 'CalendarAgent', status: 'active',
      endpoints: ['/create', '/update', '/upcoming', '/urgent', '/stats', '/status'],
    });
  }

  async handleCreate(request) {
    const body = await request.json();
    const { title, event_type, event_date, event_end_date, org, case_id, entity_id,
            description, location, is_recurring, recurrence_rule, reminders, metadata } = body;

    if (!title || !event_date) return this.jsonResponse({ error: 'title and event_date are required' }, 400);
    if (event_type && !EVENT_TYPES.includes(event_type)) {
      return this.jsonResponse({ error: `event_type must be one of: ${EVENT_TYPES.join(', ')}` }, 400);
    }

    this.rawSql.exec(
      `INSERT INTO calendar_events (title, event_type, event_date, event_end_date, org, case_id,
       entity_id, description, location, is_recurring, recurrence_rule, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      title, event_type || 'other', event_date, event_end_date || null,
      org || null, case_id || null, entity_id || null,
      description || null, location || null,
      is_recurring ? 1 : 0, recurrence_rule || null,
      metadata ? JSON.stringify(metadata) : null,
    );

    const created = this.rawSql.exec('SELECT last_insert_rowid() as id').toArray();
    const eventId = created[0]?.id;

    if (reminders && Array.isArray(reminders)) {
      for (const r of reminders) {
        this.rawSql.exec('INSERT INTO calendar_reminders (event_id, remind_at, channel) VALUES (?, ?, ?)', eventId, r.remind_at, r.channel || 'email');
      }
    }

    const daysUntil = this.daysUntilEvent(event_date);
    const urgencyThreshold = URGENCY_THRESHOLDS[event_type || 'default'] || URGENCY_THRESHOLDS.default;
    this.info('Calendar event created', { eventId, event_type, daysUntil });

    return this.jsonResponse({ id: eventId, title, event_type: event_type || 'other', event_date, daysUntil, isUrgent: daysUntil >= 0 && daysUntil <= urgencyThreshold, org: org || null });
  }

  async handleUpdate(request) {
    const { id, title, event_date, status, description } = await request.json();
    if (!id) return this.jsonResponse({ error: 'id is required' }, 400);

    const rows = this.rawSql.exec('SELECT * FROM calendar_events WHERE id = ?', id).toArray();
    if (rows.length === 0) return this.jsonResponse({ error: 'Event not found' }, 404);

    if (title) this.rawSql.exec('UPDATE calendar_events SET title = ?, updated_at = datetime(\'now\') WHERE id = ?', title, id);
    if (event_date) this.rawSql.exec('UPDATE calendar_events SET event_date = ?, updated_at = datetime(\'now\') WHERE id = ?', event_date, id);
    if (status) this.rawSql.exec('UPDATE calendar_events SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', status, id);
    if (description) this.rawSql.exec('UPDATE calendar_events SET description = ?, updated_at = datetime(\'now\') WHERE id = ?', description, id);

    const updated = this.rawSql.exec('SELECT * FROM calendar_events WHERE id = ?', id).toArray();
    return this.jsonResponse(updated[0]);
  }

  handleUpcoming(url) {
    const days = Math.max(1, Math.min(parseInt(url.searchParams.get('days') || '30'), 365));
    const offset = `+${days} days`;
    let query = 'SELECT * FROM calendar_events WHERE status = \'active\' AND event_date >= datetime(\'now\') AND event_date <= datetime(\'now\', ?)';
    const params = [offset];

    const org = url.searchParams.get('org');
    if (org) { query += ' AND org = ?'; params.push(org); }
    const eventType = url.searchParams.get('event_type');
    if (eventType) { query += ' AND event_type = ?'; params.push(eventType); }

    query += ' ORDER BY event_date ASC LIMIT 100';
    const rows = this.rawSql.exec(query, ...params).toArray();
    return this.jsonResponse({ count: rows.length, events: rows.map((r) => ({ ...r, daysUntil: this.daysUntilEvent(r.event_date), isUrgent: this.isUrgent(r) })) });
  }

  handleUrgent(url) {
    const rows = this.rawSql.exec('SELECT * FROM calendar_events WHERE status = \'active\' AND event_date >= datetime(\'now\') ORDER BY event_date ASC').toArray();
    const org = url.searchParams.get('org');
    const urgent = rows
      .filter((r) => (!org || r.org === org) && this.isUrgent(r))
      .map((r) => ({ ...r, daysUntil: this.daysUntilEvent(r.event_date), urgencyThreshold: URGENCY_THRESHOLDS[r.event_type] || URGENCY_THRESHOLDS.default }));
    return this.jsonResponse({ count: urgent.length, urgentEvents: urgent });
  }

  daysUntilEvent(eventDate) {
    return Math.ceil((new Date(eventDate) - new Date()) / (1000 * 60 * 60 * 24));
  }

  isUrgent(event) {
    const days = this.daysUntilEvent(event.event_date);
    return days >= 0 && days <= (URGENCY_THRESHOLDS[event.event_type] || URGENCY_THRESHOLDS.default);
  }

  handleStats() {
    const byType = this.rawSql.exec('SELECT event_type, status, COUNT(*) as count FROM calendar_events GROUP BY event_type, status ORDER BY count DESC').toArray();
    const total = this.rawSql.exec('SELECT COUNT(*) as total FROM calendar_events').toArray();
    return this.jsonResponse({ totalEvents: total[0]?.total || 0, breakdown: byType });
  }

  handleStatus() {
    const upcoming = this.rawSql.exec('SELECT COUNT(*) as count FROM calendar_events WHERE status = \'active\' AND event_date >= datetime(\'now\') AND event_date <= datetime(\'now\', \'+7 days\')').toArray();
    return this.jsonResponse({ agent: 'CalendarAgent', status: 'active', eventsNext7Days: upcoming[0]?.count || 0, eventTypes: EVENT_TYPES.length });
  }
}
