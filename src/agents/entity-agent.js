/**
 * EntityAgent — Universal lifecycle tracker using P/L/T/E/A entity types.
 * Tracks entities across all 6 orgs (cases, properties, leases, grants, permits, contacts).
 * Phase 5 of Agents SDK migration.
 *
 * @service chittycanon://core/services/chittyrouter
 * @canon chittycanon://gov/governance#core-types
 */
import { ChittyRouterBaseAgent } from "./base-agent.js";

// @canon: chittycanon://gov/governance#core-types
// All five types MUST be present — never omit Authority (A).
const ENTITY_TYPES = ["P", "L", "T", "E", "A"];
const ENTITY_TYPE_NAMES = {
  P: "Person",   // Actor with agency (Natural / Synthetic / Legal)
  L: "Location", // Context in space (jurisdiction, venue, place)
  T: "Thing",    // Object without agency (document, asset, artifact)
  E: "Event",    // Occurrence in time (transaction, decision, action)
  A: "Authority" // Source of weight (credential, certification, decision)
};

const ENTITY_SUBTYPES = {
  P: ["Natural", "Synthetic", "Legal"],
  L: ["Jurisdiction", "Venue", "Address", "Virtual"],
  T: ["Document", "Asset", "Artifact", "Account"],
  E: ["Transaction", "Decision", "Action", "Filing", "Hearing"],
  A: ["Granted", "Earned", "Credential", "Certification"],
};

const STATUS_TRANSITIONS = {
  draft: ["active"],
  active: ["suspended", "closed", "archived"],
  suspended: ["active", "closed"],
  closed: ["archived"],
  archived: [],
};

export class EntityAgent extends ChittyRouterBaseAgent {
  // Note: all sql.exec calls below use the built-in SQLite API, not child_process
  async onStart() {
    await super.onStart();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('P','L','T','E','A')),
        subtype TEXT,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        org TEXT,
        chitty_id TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS entity_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        link_type TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (source_id) REFERENCES entities(id),
        FOREIGN KEY (target_id) REFERENCES entities(id)
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS entity_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        description TEXT,
        actor TEXT,
        metadata TEXT,
        occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (entity_id) REFERENCES entities(id)
      )
    `);
  }

  async onRequest(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/create")) {
      return this.handleCreate(request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/update")) {
      return this.handleUpdate(request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/link")) {
      return this.handleLink(request);
    }
    if (request.method === "POST" && url.pathname.endsWith("/timeline")) {
      return this.handleAddTimeline(request);
    }
    if (request.method === "GET" && url.pathname.endsWith("/get")) {
      return this.handleGet(url);
    }
    if (request.method === "GET" && url.pathname.endsWith("/search")) {
      return this.handleSearch(url);
    }
    if (request.method === "GET" && url.pathname.endsWith("/stats")) {
      return this.handleStats();
    }
    if (request.method === "GET" && url.pathname.endsWith("/status")) {
      return this.handleStatus();
    }

    return this.jsonResponse({
      agent: "EntityAgent",
      status: "active",
      entityTypes: ENTITY_TYPES,
      entityTypeNames: ENTITY_TYPE_NAMES,
      endpoints: ["/create", "/update", "/link", "/timeline", "/get", "/search", "/stats", "/status"],
    });
  }

  /**
   * Create a new entity.
   * POST body: { entity_type, subtype?, name, org?, chitty_id?, metadata? }
   */
  async handleCreate(request) {
    const body = await request.json();
    const { entity_type, subtype, name, org, chitty_id, metadata } = body;

    if (!entity_type || !ENTITY_TYPES.includes(entity_type)) {
      return this.jsonResponse({ error: `entity_type must be one of: ${ENTITY_TYPES.join(", ")}` }, 400);
    }
    if (!name) {
      return this.jsonResponse({ error: "name is required" }, 400);
    }
    if (subtype && ENTITY_SUBTYPES[entity_type] && !ENTITY_SUBTYPES[entity_type].includes(subtype)) {
      return this.jsonResponse({ error: `Invalid subtype for ${entity_type}. Valid: ${ENTITY_SUBTYPES[entity_type].join(", ")}` }, 400);
    }

    this.sql.exec(
      `INSERT INTO entities (entity_type, subtype, name, org, chitty_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      entity_type, subtype || null, name, org || null,
      chitty_id || null, metadata ? JSON.stringify(metadata) : null,
    );

    const created = this.sql.exec("SELECT last_insert_rowid() as id").toArray();
    const entityId = created[0]?.id;

    this.sql.exec(
      `INSERT INTO entity_timeline (entity_id, event_type, description, actor)
       VALUES (?, 'created', ?, ?)`,
      entityId, `Entity created: ${ENTITY_TYPE_NAMES[entity_type]} "${name}"`, "system",
    );

    this.info("Entity created", { entityId, entity_type, name, org });

    return this.jsonResponse({
      id: entityId,
      entity_type,
      entity_type_name: ENTITY_TYPE_NAMES[entity_type],
      subtype: subtype || null,
      name,
      status: "draft",
      org: org || null,
      chitty_id: chitty_id || null,
    });
  }

  /**
   * Update an existing entity (status transition, metadata, name).
   * POST body: { id, status?, name?, metadata? }
   */
  async handleUpdate(request) {
    const body = await request.json();
    const { id, status, name, metadata } = body;

    if (!id) return this.jsonResponse({ error: "id is required" }, 400);

    const rows = this.sql.exec("SELECT * FROM entities WHERE id = ?", id).toArray();
    if (rows.length === 0) return this.jsonResponse({ error: "Entity not found" }, 404);

    const entity = rows[0];

    if (status) {
      const allowed = STATUS_TRANSITIONS[entity.status] || [];
      if (!allowed.includes(status)) {
        return this.jsonResponse({
          error: `Cannot transition from "${entity.status}" to "${status}". Allowed: ${allowed.join(", ") || "none"}`,
        }, 400);
      }
      this.sql.exec("UPDATE entities SET status = ?, updated_at = datetime('now') WHERE id = ?", status, id);
      this.sql.exec(
        `INSERT INTO entity_timeline (entity_id, event_type, description, actor)
         VALUES (?, 'status_change', ?, 'system')`,
        id, `Status: ${entity.status} → ${status}`,
      );
    }

    if (name) {
      this.sql.exec("UPDATE entities SET name = ?, updated_at = datetime('now') WHERE id = ?", name, id);
    }

    if (metadata) {
      const existingMeta = entity.metadata ? JSON.parse(entity.metadata) : {};
      const merged = { ...existingMeta, ...metadata };
      this.sql.exec("UPDATE entities SET metadata = ?, updated_at = datetime('now') WHERE id = ?", JSON.stringify(merged), id);
    }

    const updated = this.sql.exec("SELECT * FROM entities WHERE id = ?", id).toArray();
    return this.jsonResponse(this.formatEntity(updated[0]));
  }

  /**
   * Create a link between two entities.
   * POST body: { source_id, target_id, link_type, metadata? }
   */
  async handleLink(request) {
    const { source_id, target_id, link_type, metadata } = await request.json();
    if (!source_id || !target_id || !link_type) {
      return this.jsonResponse({ error: "source_id, target_id, and link_type are required" }, 400);
    }

    this.sql.exec(
      `INSERT INTO entity_links (source_id, target_id, link_type, metadata) VALUES (?, ?, ?, ?)`,
      source_id, target_id, link_type, metadata ? JSON.stringify(metadata) : null,
    );

    this.sql.exec(
      `INSERT INTO entity_timeline (entity_id, event_type, description, actor)
       VALUES (?, 'linked', ?, 'system')`,
      source_id, `Linked to entity ${target_id} via "${link_type}"`,
    );

    return this.jsonResponse({ source_id, target_id, link_type, status: "linked" });
  }

  /**
   * Add a timeline event to an entity.
   * POST body: { entity_id, event_type, description, actor?, metadata? }
   */
  async handleAddTimeline(request) {
    const { entity_id, event_type, description, actor, metadata } = await request.json();
    if (!entity_id || !event_type) {
      return this.jsonResponse({ error: "entity_id and event_type are required" }, 400);
    }

    this.sql.exec(
      `INSERT INTO entity_timeline (entity_id, event_type, description, actor, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      entity_id, event_type, description || null, actor || "system",
      metadata ? JSON.stringify(metadata) : null,
    );

    return this.jsonResponse({ entity_id, event_type, status: "recorded" });
  }

  /**
   * Get an entity by ID, including links and timeline.
   * GET /get?id=N
   */
  handleGet(url) {
    const id = url.searchParams.get("id");
    if (!id) return this.jsonResponse({ error: "id query param is required" }, 400);

    const rows = this.sql.exec("SELECT * FROM entities WHERE id = ?", parseInt(id)).toArray();
    if (rows.length === 0) return this.jsonResponse({ error: "Entity not found" }, 404);

    const links = this.sql.exec(
      `SELECT * FROM entity_links WHERE source_id = ? OR target_id = ?`, parseInt(id), parseInt(id),
    ).toArray();

    const timeline = this.sql.exec(
      `SELECT * FROM entity_timeline WHERE entity_id = ? ORDER BY occurred_at DESC LIMIT 50`, parseInt(id),
    ).toArray();

    return this.jsonResponse({
      ...this.formatEntity(rows[0]),
      links,
      timeline,
    });
  }

  /**
   * Search entities by type, org, status, or name.
   * GET /search?entity_type=P&org=ChittyOS&status=active&q=name
   */
  handleSearch(url) {
    let query = "SELECT * FROM entities WHERE 1=1";
    const params = [];

    const entityType = url.searchParams.get("entity_type");
    if (entityType) { query += " AND entity_type = ?"; params.push(entityType); }

    const org = url.searchParams.get("org");
    if (org) { query += " AND org = ?"; params.push(org); }

    const status = url.searchParams.get("status");
    if (status) { query += " AND status = ?"; params.push(status); }

    const q = url.searchParams.get("q");
    if (q) { query += " AND name LIKE ?"; params.push(`%${q}%`); }

    query += " ORDER BY updated_at DESC LIMIT 100";

    const rows = this.sql.exec(query, ...params).toArray();
    return this.jsonResponse({ count: rows.length, entities: rows.map((r) => this.formatEntity(r)) });
  }

  formatEntity(row) {
    return {
      ...row,
      entity_type_name: ENTITY_TYPE_NAMES[row.entity_type],
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }

  handleStats() {
    const byType = this.sql.exec(
      `SELECT entity_type, status, COUNT(*) as count FROM entities GROUP BY entity_type, status ORDER BY count DESC`
    ).toArray();
    const total = this.sql.exec("SELECT COUNT(*) as total FROM entities").toArray();
    const linkCount = this.sql.exec("SELECT COUNT(*) as total FROM entity_links").toArray();
    return this.jsonResponse({
      totalEntities: total[0]?.total || 0,
      totalLinks: linkCount[0]?.total || 0,
      breakdown: byType,
    });
  }

  handleStatus() {
    const recent = this.sql.exec(
      "SELECT COUNT(*) as count FROM entities WHERE created_at > datetime('now', '-1 hour')"
    ).toArray();
    return this.jsonResponse({
      agent: "EntityAgent", status: "active",
      entitiesLastHour: recent[0]?.count || 0,
      entityTypes: ENTITY_TYPES.length,
    });
  }
}

export { ENTITY_TYPES, ENTITY_TYPE_NAMES };
