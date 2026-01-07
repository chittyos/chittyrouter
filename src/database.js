// Neon + Hyperdrive Database Module for ChittyOS
import { Client } from "@neondatabase/serverless";

export class DatabaseService {
  constructor(env) {
    // Hyperdrive automatically manages connection pooling
    this.hyperdrive = env.HYPERDRIVE;
  }

  // Get database client through Hyperdrive
  getClient() {
    if (!this.hyperdrive) {
      throw new Error("Hyperdrive not configured");
    }

    // Hyperdrive provides the connection string with pooling
    return new Client(this.hyperdrive.connectionString);
  }

  // Execute query with automatic connection management
  async query(sql, params = []) {
    const client = this.getClient();

    try {
      await client.connect();
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      await client.end();
    }
  }

  // Batch queries for efficiency
  async transaction(queries) {
    const client = this.getClient();

    try {
      await client.connect();
      await client.query("BEGIN");

      const results = [];
      for (const { sql, params } of queries) {
        results.push(await client.query(sql, params));
      }

      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      await client.end();
    }
  }

  // Vector similarity search using pgvector
  async vectorSearch(embedding, tableName = "embeddings", limit = 10) {
    const sql = `
      SELECT *, embedding <-> $1 as distance
      FROM ${tableName}
      ORDER BY embedding <-> $1
      LIMIT $2
    `;

    return await this.query(sql, [embedding, limit]);
  }

  // Store embeddings with metadata
  async storeEmbedding(id, embedding, metadata = {}) {
    const sql = `
      INSERT INTO embeddings (id, embedding, metadata, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;

    return await this.query(sql, [id, embedding, metadata]);
  }

  // Multi-tenant data isolation
  async getTenantData(tenantId, tableName) {
    const sql = `
      SELECT * FROM ${tableName}
      WHERE tenant_id = $1
      ORDER BY created_at DESC
    `;

    return await this.query(sql, [tenantId]);
  }

  // AI agent memory storage
  async storeAgentMemory(sessionId, messages) {
    const sql = `
      INSERT INTO agent_sessions (session_id, messages, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (session_id)
      DO UPDATE SET
        messages = $2,
        updated_at = NOW()
    `;

    return await this.query(sql, [sessionId, JSON.stringify(messages)]);
  }

  // Get agent conversation history
  async getAgentMemory(sessionId) {
    const sql = `
      SELECT messages FROM agent_sessions
      WHERE session_id = $1
    `;

    const result = await this.query(sql, [sessionId]);
    return result[0]?.messages || [];
  }
}

// Database handler for API endpoints
export async function handleDatabase(request, env) {
  const db = new DatabaseService(env);
  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    // Health check
    if (pathname === "/api/db/health") {
      await db.query("SELECT 1");
      return new Response(JSON.stringify({ status: "healthy" }), {
        headers: { "content-type": "application/json" },
      });
    }

    // Vector search endpoint
    if (pathname === "/api/db/search") {
      const { embedding, limit } = await request.json();
      const results = await db.vectorSearch(embedding, "embeddings", limit);
      return new Response(JSON.stringify(results), {
        headers: { "content-type": "application/json" },
      });
    }

    // Store embedding
    if (pathname === "/api/db/embed") {
      const { id, embedding, metadata } = await request.json();
      await db.storeEmbedding(id, embedding, metadata);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    // Agent memory endpoints
    if (pathname === "/api/db/agent/memory") {
      if (request.method === "POST") {
        const { sessionId, messages } = await request.json();
        await db.storeAgentMemory(sessionId, messages);
        return new Response(JSON.stringify({ success: true }), {
          headers: { "content-type": "application/json" },
        });
      }

      if (request.method === "GET") {
        const sessionId = url.searchParams.get("sessionId");
        const memory = await db.getAgentMemory(sessionId);
        return new Response(JSON.stringify({ memory }), {
          headers: { "content-type": "application/json" },
        });
      }
    }

    return new Response("Database endpoint not found", { status: 404 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
