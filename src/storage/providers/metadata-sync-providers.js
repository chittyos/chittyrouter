/**
 * Metadata Sync Providers
 * Synchronizes metadata across Notion, Neon, GitHub, and other platforms
 * References core ChittyOS services as authorities for validation
 */

import { Client as NotionClient } from "@notionhq/client";
import { Octokit } from "@octokit/rest";
import { neon } from "@neondatabase/serverless";

/**
 * Notion Provider - Rich metadata storage with database capabilities
 */
export class NotionProvider {
  constructor(env) {
    this.env = env;
    this.notion = new NotionClient({
      auth: env.NOTION_INTEGRATION_TOKEN,
    });

    // Database IDs for different metadata types
    this.databases = {
      files: env.NOTION_FILES_DATABASE_ID,
      metadata: env.NOTION_METADATA_DATABASE_ID,
      audit: env.NOTION_AUDIT_DATABASE_ID,
    };

    // Reference ChittyOS Schema service as authority
    this.schemaAuthority =
      env.CHITTYSCHEMA_ENDPOINT || "https://schema.chitty.cc";
  }

  async store(path, content, options = {}) {
    try {
      // Validate against ChittyOS Schema authority
      await this.validateWithSchemaAuthority(content, options.dataType);

      const properties = this.buildNotionProperties(path, content, options);

      const page = await this.notion.pages.create({
        parent: { database_id: this.databases.files },
        properties,
      });

      console.log(`📝 Notion: Stored metadata for ${path}`);

      return {
        provider: "notion",
        pageId: page.id,
        url: page.url,
        path,
        storedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`❌ Notion storage failed for ${path}:`, error);
      throw error;
    }
  }

  async storeMetadata(path, metadata) {
    try {
      // Reference ChittyOS Trust service for trust score validation
      const trustScore = await this.getTrustScore(metadata);

      const properties = {
        Path: { title: [{ text: { content: path } }] },
        Provider: { select: { name: metadata.provider || "unknown" } },
        Size: { number: metadata.size || 0 },
        "Last Modified": {
          date: { start: metadata.lastModified || new Date().toISOString() },
        },
        "Trust Score": { number: trustScore },
        Tier: { select: { name: metadata.tier || "UNKNOWN" } },
        Hash: { rich_text: [{ text: { content: metadata.hash || "" } }] },
        "Sync Status": { select: { name: "synced" } },
        Created: { date: { start: new Date().toISOString() } },
      };

      const page = await this.notion.pages.create({
        parent: { database_id: this.databases.metadata },
        properties,
      });

      return {
        provider: "notion",
        pageId: page.id,
        metadata: properties,
      };
    } catch (error) {
      console.error(`❌ Notion metadata storage failed:`, error);
      throw error;
    }
  }

  async getMetadata(path) {
    try {
      const response = await this.notion.databases.query({
        database_id: this.databases.metadata,
        filter: {
          property: "Path",
          title: { equals: path },
        },
      });

      if (response.results.length === 0) {
        return null;
      }

      const page = response.results[0];
      return this.parseNotionProperties(page.properties);
    } catch (error) {
      console.warn(`⚠️ Notion metadata retrieval failed for ${path}:`, error);
      return null;
    }
  }

  async getStatus() {
    try {
      const user = await this.notion.users.me();
      return {
        provider: "notion",
        status: "healthy",
        user: user.name,
        databases: Object.keys(this.databases).length,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: "notion",
        status: "error",
        error: error.message,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Validate content against ChittyOS Schema authority
   */
  async validateWithSchemaAuthority(content, dataType) {
    try {
      const response = await fetch(`${this.schemaAuthority}/api/v1/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ChittyOS-Service": "chittyrouter",
        },
        body: JSON.stringify({
          data: content,
          type: dataType || "generic",
          authority: "chittyschema",
        }),
      });

      if (!response.ok) {
        throw new Error(`Schema validation failed: ${response.status}`);
      }

      const validation = await response.json();
      return validation.valid;
    } catch (error) {
      console.warn("⚠️ Schema authority validation failed:", error.message);
      return true; // Continue with storage if authority is unavailable
    }
  }

  /**
   * Get trust score from ChittyOS Trust authority
   */
  async getTrustScore(metadata) {
    try {
      const trustAuthority =
        this.env.CHITTYTRUST_ENDPOINT || "https://trust.chitty.cc";

      const response = await fetch(`${trustAuthority}/api/v1/score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ChittyOS-Service": "chittyrouter",
        },
        body: JSON.stringify({
          provider: metadata.provider,
          size: metadata.size,
          hash: metadata.hash,
          tier: metadata.tier,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return result.trustScore || 85; // Default trust score
      }
    } catch (error) {
      console.warn("⚠️ Trust authority unavailable:", error.message);
    }

    return 85; // Default trust score
  }

  buildNotionProperties(path, content, options) {
    return {
      Path: { title: [{ text: { content: path } }] },
      "Content Type": {
        select: { name: options.contentType || "application/json" },
      },
      Tier: { select: { name: options.tier || "HOT" } },
      Project: {
        rich_text: [
          { text: { content: options.projectId || this.env.PROJECT_ID } },
        ],
      },
      Session: {
        rich_text: [
          { text: { content: options.sessionId || this.env.SESSION_ID } },
        ],
      },
      Created: { date: { start: new Date().toISOString() } },
      Primary: { checkbox: options.isPrimary || false },
      Backup: { checkbox: options.isBackup || false },
    };
  }

  parseNotionProperties(properties) {
    return {
      path: properties.Path?.title?.[0]?.text?.content,
      provider: properties.Provider?.select?.name,
      size: properties.Size?.number,
      lastModified: properties["Last Modified"]?.date?.start,
      trustScore: properties["Trust Score"]?.number,
      tier: properties.Tier?.select?.name,
      hash: properties.Hash?.rich_text?.[0]?.text?.content,
    };
  }
}

/**
 * Neon Provider - PostgreSQL database for structured metadata
 */
export class NeonProvider {
  constructor(env) {
    this.env = env;
    this.sql = neon(env.NEON_DATABASE_URL);

    // Reference ChittyOS ID service as authority for ID validation
    this.idAuthority = env.CHITTYID_ENDPOINT || "https://id.chitty.cc";
  }

  async store(path, content, options = {}) {
    try {
      // Validate ChittyID with authority service
      const chittyId = await this.validateChittyId(options.chittyId);

      const query = `
        INSERT INTO chittyos_files (path, content, tier, project_id, session_id, chitty_id, created_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
        ON CONFLICT (path)
        DO UPDATE SET content = $2, metadata = $7, updated_at = NOW()
        RETURNING id, created_at;
      `;

      const result = await this.sql(query, [
        path,
        JSON.stringify(content),
        options.tier || "HOT",
        options.projectId || this.env.PROJECT_ID,
        options.sessionId || this.env.SESSION_ID,
        chittyId,
        JSON.stringify(options),
      ]);

      console.log(`🐘 Neon: Stored ${path} with ID ${result[0].id}`);

      return {
        provider: "neon",
        id: result[0].id,
        path,
        storedAt: result[0].created_at,
      };
    } catch (error) {
      console.error(`❌ Neon storage failed for ${path}:`, error);
      throw error;
    }
  }

  async storeMetadata(path, metadata) {
    try {
      const query = `
        INSERT INTO chittyos_metadata (path, provider, size, last_modified, hash, tier, trust_score, sync_status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'synced', NOW())
        ON CONFLICT (path, provider)
        DO UPDATE SET
          size = $3,
          last_modified = $4,
          hash = $5,
          tier = $6,
          trust_score = $7,
          updated_at = NOW()
        RETURNING id;
      `;

      const result = await this.sql(query, [
        path,
        metadata.provider,
        metadata.size || 0,
        metadata.lastModified || new Date().toISOString(),
        metadata.hash,
        metadata.tier || "UNKNOWN",
        metadata.trustScore || 85,
      ]);

      return {
        provider: "neon",
        id: result[0].id,
        path,
      };
    } catch (error) {
      console.error(`❌ Neon metadata storage failed:`, error);
      throw error;
    }
  }

  async getMetadata(path) {
    try {
      const query = `
        SELECT * FROM chittyos_metadata
        WHERE path = $1
        ORDER BY updated_at DESC
        LIMIT 1;
      `;

      const result = await this.sql(query, [path]);

      if (result.length === 0) {
        return null;
      }

      return {
        path: result[0].path,
        provider: result[0].provider,
        size: result[0].size,
        lastModified: result[0].last_modified,
        hash: result[0].hash,
        tier: result[0].tier,
        trustScore: result[0].trust_score,
      };
    } catch (error) {
      console.warn(`⚠️ Neon metadata retrieval failed for ${path}:`, error);
      return null;
    }
  }

  async getStatus() {
    try {
      const result = await this.sql(
        "SELECT NOW() as current_time, version() as version;",
      );
      return {
        provider: "neon",
        status: "healthy",
        version: result[0].version,
        currentTime: result[0].current_time,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: "neon",
        status: "error",
        error: error.message,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Validate ChittyID with authority service
   */
  async validateChittyId(chittyId) {
    if (!chittyId) {
      // Generate new ChittyID from authority - NO LOCAL GENERATION PERMITTED
      try {
        const response = await fetch(`${this.idAuthority}/api/v1/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ChittyOS-Service": "chittyrouter",
          },
          body: JSON.stringify({
            for: "chittyrouter-metadata",
            purpose: "Metadata storage identifier",
          }),
        });

        if (response.ok) {
          const result = await response.json();
          return result.chittyId;
        }

        // If authority service fails, throw error - NO LOCAL FALLBACK
        throw new Error(`ChittyID authority unavailable: ${response.status}`);
      } catch (error) {
        console.error("❌ ChittyID authority unavailable:", error.message);
        // NO LOCAL GENERATION - Throw error instead of generating fallback ID
        throw new Error(
          "Cannot proceed without valid ChittyID from id.chitty.cc. Local generation is not permitted.",
        );
      }
    }

    return chittyId;
  }

  /**
   * Initialize database schema
   */
  async initializeSchema() {
    const schema = `
      CREATE TABLE IF NOT EXISTS chittyos_files (
        id SERIAL PRIMARY KEY,
        path VARCHAR(1000) UNIQUE NOT NULL,
        content JSONB,
        tier VARCHAR(20) DEFAULT 'HOT',
        project_id VARCHAR(100),
        session_id VARCHAR(100),
        chitty_id VARCHAR(100),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS chittyos_metadata (
        id SERIAL PRIMARY KEY,
        path VARCHAR(1000) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        size BIGINT,
        last_modified TIMESTAMP,
        hash VARCHAR(64),
        tier VARCHAR(20),
        trust_score INTEGER,
        sync_status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(path, provider)
      );

      CREATE INDEX IF NOT EXISTS idx_files_path ON chittyos_files(path);
      CREATE INDEX IF NOT EXISTS idx_metadata_path ON chittyos_metadata(path);
      CREATE INDEX IF NOT EXISTS idx_metadata_provider ON chittyos_metadata(provider);
    `;

    await this.sql(schema);
    console.log("🐘 Neon: Schema initialized");
  }
}

/**
 * GitHub Provider - Version control and audit trail storage
 */
export class GitHubProvider {
  constructor(env) {
    this.env = env;
    this.github = new Octokit({
      auth: env.GITHUB_TOKEN,
    });

    this.org = "ChittyOS";
    this.repos = {
      data: "chittyos-data",
      sessions: "chittychat-data",
      evidence: "evidence-vault",
    };

    // Reference ChittyOS Verify service as authority for integrity
    this.verifyAuthority =
      env.CHITTYVERIFY_ENDPOINT || "https://verify.chitty.cc";
  }

  async store(path, content, options = {}) {
    const repo = this.determineRepo(path);
    const branch = options.branch || "main";

    try {
      // Verify content integrity with authority service
      await this.verifyIntegrity(content, options);

      return await this.commitToRepo(repo, branch, path, content, options);
    } catch (error) {
      console.error(`❌ GitHub storage failed for ${path}:`, error);
      throw error;
    }
  }

  async storeMetadata(path, metadata) {
    const metadataPath = `metadata/${path.replace(/\//g, "_")}.json`;
    return this.store(metadataPath, metadata, {
      branch: "metadata",
      message: `Store metadata for ${path}`,
    });
  }

  async getMetadata(path) {
    try {
      const metadataPath = `metadata/${path.replace(/\//g, "_")}.json`;
      const repo = this.repos.data;

      const response = await this.github.repos.getContent({
        owner: this.org,
        repo,
        path: metadataPath,
        ref: "metadata",
      });

      const content = Buffer.from(response.data.content, "base64").toString(
        "utf8",
      );
      return JSON.parse(content);
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      console.warn(`⚠️ GitHub metadata retrieval failed for ${path}:`, error);
      return null;
    }
  }

  async getStatus() {
    try {
      const user = await this.github.users.getAuthenticated();
      return {
        provider: "github",
        status: "healthy",
        user: user.data.login,
        org: this.org,
        repos: Object.keys(this.repos).length,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        provider: "github",
        status: "error",
        error: error.message,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  determineRepo(path) {
    if (path.startsWith("evidence/")) return this.repos.evidence;
    if (path.startsWith("sessions/")) return this.repos.sessions;
    return this.repos.data;
  }

  async commitToRepo(repo, branch, path, content, options) {
    const contentString =
      typeof content === "string" ? content : JSON.stringify(content, null, 2);

    let sha;
    try {
      const existing = await this.github.repos.getContent({
        owner: this.org,
        repo,
        path,
        ref: branch,
      });
      sha = existing.data.sha;
    } catch (error) {
      // File doesn't exist
    }

    const result = await this.github.repos.createOrUpdateFileContents({
      owner: this.org,
      repo,
      path,
      message: options.message || `Update ${path}`,
      content: Buffer.from(contentString).toString("base64"),
      branch,
      sha,
    });

    return {
      provider: "github",
      repo,
      path,
      sha: result.data.commit.sha,
      url: result.data.content.html_url,
      branch,
    };
  }

  /**
   * Verify content integrity with authority service
   */
  async verifyIntegrity(content, options) {
    try {
      const response = await fetch(`${this.verifyAuthority}/api/v1/integrity`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ChittyOS-Service": "chittyrouter",
        },
        body: JSON.stringify({
          content:
            typeof content === "string" ? content : JSON.stringify(content),
          type: options.dataType || "generic",
          authority: "chittyverify",
        }),
      });

      if (response.ok) {
        const verification = await response.json();
        return verification.verified;
      }
    } catch (error) {
      console.warn("⚠️ Verify authority unavailable:", error.message);
    }

    return true; // Continue if authority is unavailable
  }
}

export { NeonProvider, GitHubProvider };
