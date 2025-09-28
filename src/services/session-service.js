/**
 * ChittyRouter Session Service
 * Provides session management and cross-platform sync as a service
 */

export class SessionService {
  constructor(env) {
    this.env = env;
    this.kv = env.CHITTYROUTER_KV;
    this.memoryStore = new Map(); // Fallback for when KV is not available
  }

  /**
   * Storage abstraction layer
   */
  async get(key) {
    if (this.kv) {
      return await this.get(key);
    }
    return this.memoryStore.get(key) || null;
  }

  async put(key, value) {
    if (this.kv) {
      return await this.put(key, value);
    }
    this.memoryStore.set(key, value);
    return Promise.resolve();
  }

  async list(options = {}) {
    if (this.kv) {
      return await this.list(options);
    }
    // Simple memory store list implementation
    const keys = Array.from(this.memoryStore.keys())
      .filter((key) => !options.prefix || key.startsWith(options.prefix))
      .map((name) => ({ name }));
    return { keys };
  }

  /**
   * Handle session management requests
   */
  async handleRequest(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Session CRUD operations
    if (pathname === "/session/create" && request.method === "POST") {
      return await this.createSession(request);
    }

    if (pathname.startsWith("/session/") && request.method === "GET") {
      const sessionId = pathname.split("/")[2];
      return await this.getSession(sessionId);
    }

    if (pathname.startsWith("/session/") && request.method === "PUT") {
      const sessionId = pathname.split("/")[2];
      return await this.updateSession(sessionId, request);
    }

    if (pathname === "/session/sync" && request.method === "POST") {
      return await this.syncSession(request);
    }

    if (pathname === "/session/handoff" && request.method === "POST") {
      return await this.createHandoff(request);
    }

    if (pathname === "/session/list" && request.method === "GET") {
      return await this.listSessions(request);
    }

    if (pathname === "/session/status" && request.method === "GET") {
      return await this.getStatus();
    }

    return new Response("Session endpoint not found", { status: 404 });
  }

  /**
   * Create new session
   */
  async createSession(request) {
    try {
      const sessionData = await request.json();
      const sessionId = `session-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

      const session = {
        id: sessionId,
        startTime: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        context: sessionData.context || "",
        intent: sessionData.intent || "",
        platform: sessionData.platform || "unknown",
        files: {},
        todos: [],
        nextSteps: [],
        parentSession: sessionData.parentSession || null,
        childSessions: [],
      };

      // Store in storage
      await this.put(`session:${sessionId}`, JSON.stringify(session));

      // Store in session index
      await this.addToSessionIndex(sessionId, session);

      return new Response(
        JSON.stringify({
          success: true,
          sessionId,
          session,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    try {
      const sessionData = await this.get(`session:${sessionId}`);

      if (!sessionData) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Session not found",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const session = JSON.parse(sessionData);

      return new Response(
        JSON.stringify({
          success: true,
          session,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Update session
   */
  async updateSession(sessionId, request) {
    try {
      const updates = await request.json();
      const existingData = await this.get(`session:${sessionId}`);

      if (!existingData) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Session not found",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const session = JSON.parse(existingData);

      // Apply updates
      if (updates.context) session.context = updates.context;
      if (updates.intent) session.intent = updates.intent;
      if (updates.files) {
        session.files = { ...session.files, ...updates.files };
      }
      if (updates.todos) {
        session.todos.push(...updates.todos);
      }
      if (updates.nextSteps) {
        session.nextSteps = updates.nextSteps;
      }

      session.lastActivity = new Date().toISOString();

      // Store updated session
      await this.put(`session:${sessionId}`, JSON.stringify(session));

      // Sync to GitHub if configured
      if (this.env.GITHUB_TOKEN) {
        await this.syncToGitHub(session);
      }

      return new Response(
        JSON.stringify({
          success: true,
          session,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Sync session across platforms
   */
  async syncSession(request) {
    try {
      const { sessionId, platforms } = await request.json();
      const sessionData = await this.get(`session:${sessionId}`);

      if (!sessionData) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Session not found",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const session = JSON.parse(sessionData);
      const syncResults = {};

      // Sync to GitHub
      if (platforms?.includes("github") && this.env.GITHUB_TOKEN) {
        syncResults.github = await this.syncToGitHub(session);
      }

      // Sync to Notion
      if (platforms?.includes("notion") && this.env.NOTION_TOKEN) {
        syncResults.notion = await this.syncToNotion(session);
      }

      // Always sync to KV (local backup)
      syncResults.kv = await this.syncToKV(session);

      return new Response(
        JSON.stringify({
          success: true,
          syncResults,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Create cross-platform handoff
   */
  async createHandoff(request) {
    try {
      const { sessionId, targetPlatform, reason } = await request.json();
      const sessionData = await this.get(`session:${sessionId}`);

      if (!sessionData) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Session not found",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const session = JSON.parse(sessionData);

      // Create handoff context
      const handoffId = `handoff-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const handoffContext = {
        handoffId,
        sessionId,
        targetPlatform,
        reason: reason || "Cross-platform handoff",
        context: session.context,
        intent: session.intent,
        recentFiles: Object.values(session.files).slice(-5),
        pendingTodos: session.todos.filter((t) => !t.completed),
        nextSteps: session.nextSteps,
        timestamp: new Date().toISOString(),
        instructions: `Continue work from ${session.platform} on ${targetPlatform}. Context: ${session.context}`,
      };

      // Store handoff
      await this.put(`handoff:${handoffId}`, JSON.stringify(handoffContext));

      // Update original session
      session.childSessions.push(handoffId);
      await this.put(`session:${sessionId}`, JSON.stringify(session));

      return new Response(
        JSON.stringify({
          success: true,
          handoffId,
          handoffContext,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * List recent sessions
   */
  async listSessions(request) {
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get("limit") || "10");
      const platform = url.searchParams.get("platform");

      const indexData = await this.get("session:index");
      const sessionIndex = indexData ? JSON.parse(indexData) : [];

      let sessions = sessionIndex
        .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
        .slice(0, limit);

      // Filter by platform if specified
      if (platform) {
        sessions = sessions.filter((s) => s.platform === platform);
      }

      return new Response(
        JSON.stringify({
          success: true,
          sessions,
          total: sessionIndex.length,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Get service status
   */
  async getStatus() {
    try {
      const indexData = await this.get("session:index");
      const sessionIndex = indexData ? JSON.parse(indexData) : [];

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const activeSessions = sessionIndex.filter(
        (s) => new Date(s.lastActivity) > oneHourAgo,
      );

      const status = {
        service: "ChittyRouter Session Service",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        sessions: {
          total: sessionIndex.length,
          active: activeSessions.length,
          platforms: [...new Set(sessionIndex.map((s) => s.platform))],
        },
        sync: {
          github: !!this.env.GITHUB_TOKEN,
          notion: !!this.env.NOTION_TOKEN,
          kv: true,
        },
      };

      return new Response(JSON.stringify(status), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Sync to GitHub
   */
  async syncToGitHub(session) {
    try {
      const owner = "chittyos";
      const repo = "chittychat-sessions";
      const path = `sessions/${session.id}.json`;

      const syncData = {
        session,
        lastSync: new Date().toISOString(),
        syncSource: "chittyrouter",
      };

      const content = btoa(JSON.stringify(syncData, null, 2));

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${this.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Sync session ${session.id} from ChittyRouter`,
            content,
            committer: {
              name: "ChittyRouter",
              email: "router@chitty.cc",
            },
          }),
        },
      );

      if (response.ok) {
        return { success: true, platform: "github" };
      } else {
        const error = await response.text();
        return { success: false, platform: "github", error };
      }
    } catch (error) {
      return { success: false, platform: "github", error: error.message };
    }
  }

  /**
   * Sync to KV (backup)
   */
  async syncToKV(session) {
    try {
      const backupKey = `backup:${session.id}:${Date.now()}`;
      await this.put(backupKey, JSON.stringify(session));

      return { success: true, platform: "kv" };
    } catch (error) {
      return { success: false, platform: "kv", error: error.message };
    }
  }

  /**
   * Add session to index
   */
  async addToSessionIndex(sessionId, session) {
    try {
      const indexData = await this.get("session:index");
      const sessionIndex = indexData ? JSON.parse(indexData) : [];

      const sessionSummary = {
        id: sessionId,
        platform: session.platform,
        context: session.context?.substring(0, 100),
        lastActivity: session.lastActivity,
        filesCount: Object.keys(session.files).length,
      };

      sessionIndex.push(sessionSummary);

      // Keep only last 1000 sessions
      if (sessionIndex.length > 1000) {
        sessionIndex.splice(0, sessionIndex.length - 1000);
      }

      await this.put("session:index", JSON.stringify(sessionIndex));
    } catch (error) {
      console.error("Failed to update session index:", error);
    }
  }
}

export default SessionService;
