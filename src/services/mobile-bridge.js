/**
 * Mobile Bridge API Service
 * Optimized endpoints for mobile AI platforms (Claude mobile, ChatGPT mobile)
 * Provides lightweight session handoff and sync capabilities
 */

export class MobileBridgeService {
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
   * Handle mobile bridge requests
   */
  async handleRequest(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Mobile-optimized endpoints
    if (pathname === "/mobile/quick-start" && request.method === "POST") {
      return await this.quickStart(request);
    }

    if (pathname === "/mobile/handoff" && request.method === "POST") {
      return await this.createMobileHandoff(request);
    }

    if (pathname === "/mobile/continue" && request.method === "POST") {
      return await this.continueMobileSession(request);
    }

    if (pathname === "/mobile/sync" && request.method === "GET") {
      return await this.getMobileSync(request);
    }

    if (pathname === "/mobile/status" && request.method === "GET") {
      return await this.getMobileStatus(request);
    }

    if (pathname === "/mobile/context" && request.method === "GET") {
      return await this.getMobileContext(request);
    }

    return new Response("Mobile endpoint not found", { status: 404 });
  }

  /**
   * Quick start for mobile - get immediate context
   */
  async quickStart(request) {
    try {
      const { platform, sessionHint } = await request.json();

      // Find most recent session or handoff
      let sessionData = null;

      if (sessionHint) {
        // Try to get specific session
        sessionData = await this.get(`session:${sessionHint}`);
        if (!sessionData) {
          sessionData = await this.get(`handoff:${sessionHint}`);
        }
      }

      if (!sessionData) {
        // Get most recent session
        const indexData = await this.get("session:index");
        const sessionIndex = indexData ? JSON.parse(indexData) : [];

        if (sessionIndex.length > 0) {
          const recentSession = sessionIndex.sort(
            (a, b) => new Date(b.lastActivity) - new Date(a.lastActivity),
          )[0];
          sessionData = await this.get(`session:${recentSession.id}`);
        }
      }

      if (!sessionData) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "No recent sessions found",
            quickStartData: {
              platform: platform || "mobile",
              context: "Starting fresh mobile session",
              nextSteps: ["Begin new work"],
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      const session = JSON.parse(sessionData);
      const mobileContext = this.optimizeForMobile(session);

      return new Response(
        JSON.stringify({
          success: true,
          quickStartData: mobileContext,
          sessionId: session.id,
          handoffInstructions: this.generateMobileInstructions(
            session,
            platform,
          ),
        }),
        { headers: { "Content-Type": "application/json" } },
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
   * Create mobile handoff context
   */
  async createMobileHandoff(request) {
    try {
      const { sessionId, mobilePlatform, deviceInfo } = await request.json();

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
      const handoffId = `mobile-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;

      const mobileHandoff = {
        handoffId,
        originalSessionId: sessionId,
        mobilePlatform: mobilePlatform || "unknown",
        deviceInfo: deviceInfo || {},
        mobileContext: this.optimizeForMobile(session),
        instructions: this.generateMobileInstructions(session, mobilePlatform),
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      };

      // Store mobile handoff
      await this.put(`mobile:${handoffId}`, JSON.stringify(mobileHandoff));

      // Update original session
      session.mobileHandoffs = session.mobileHandoffs || [];
      session.mobileHandoffs.push(handoffId);
      await this.put(`session:${sessionId}`, JSON.stringify(session));

      return new Response(
        JSON.stringify({
          success: true,
          mobileHandoff,
          quickAccessCode: handoffId.split("-").pop(), // Last part for easy entry
        }),
        { headers: { "Content-Type": "application/json" } },
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
   * Continue mobile session
   */
  async continueMobileSession(request) {
    try {
      const { handoffId, quickAccessCode, updates } = await request.json();

      let mobileHandoffData;

      if (handoffId) {
        mobileHandoffData = await this.get(`mobile:${handoffId}`);
      } else if (quickAccessCode) {
        // Find handoff by access code
        const allKeys = await this.list({ prefix: "mobile:" });
        for (const key of allKeys.keys) {
          if (key.name.endsWith(quickAccessCode)) {
            mobileHandoffData = await this.get(key.name);
            break;
          }
        }
      }

      if (!mobileHandoffData) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Mobile handoff not found or expired",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const mobileHandoff = JSON.parse(mobileHandoffData);

      // Check expiration
      if (new Date() > new Date(mobileHandoff.expiresAt)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Mobile handoff expired",
          }),
          {
            status: 410,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Apply any updates from mobile session
      if (updates) {
        const originalSession = JSON.parse(
          await this.get(`session:${mobileHandoff.originalSessionId}`),
        );

        if (updates.context)
          originalSession.context += ` [Mobile: ${updates.context}]`;
        if (updates.files) {
          originalSession.files = {
            ...originalSession.files,
            ...updates.files,
          };
        }
        if (updates.todos) {
          originalSession.todos.push(
            ...updates.todos.map((t) => ({ ...t, source: "mobile" })),
          );
        }
        if (updates.nextSteps) {
          originalSession.nextSteps = updates.nextSteps;
        }

        originalSession.lastActivity = new Date().toISOString();
        originalSession.mobileActivity = {
          lastUpdate: new Date().toISOString(),
          platform: mobileHandoff.mobilePlatform,
          updates: Object.keys(updates),
        };

        await this.put(
          `session:${mobileHandoff.originalSessionId}`,
          JSON.stringify(originalSession),
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          mobileHandoff,
          updated: !!updates,
          nextSteps: this.generateMobileContinuationSteps(mobileHandoff),
        }),
        { headers: { "Content-Type": "application/json" } },
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
   * Get mobile sync status
   */
  async getMobileSync(request) {
    try {
      const url = new URL(request.url);
      const sessionId = url.searchParams.get("sessionId");

      if (!sessionId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "sessionId parameter required",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

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
          sync: {
            lastActivity: session.lastActivity,
            mobileActivity: session.mobileActivity,
            mobileHandoffs: session.mobileHandoffs || [],
            filesCount: Object.keys(session.files || {}).length,
            todosCount: (session.todos || []).length,
            hasGitHubSync: !!this.env.GITHUB_TOKEN,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
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
   * Get mobile status
   */
  async getMobileStatus() {
    try {
      const indexData = await this.get("session:index");
      const sessionIndex = indexData ? JSON.parse(indexData) : [];

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const recentSessions = sessionIndex.filter(
        (s) => new Date(s.lastActivity) > oneHourAgo,
      );

      const mobileHandoffs = await this.list({ prefix: "mobile:" });

      return new Response(
        JSON.stringify({
          success: true,
          status: {
            service: "ChittyRouter Mobile Bridge",
            version: "1.0.0",
            timestamp: new Date().toISOString(),
            sessions: {
              total: sessionIndex.length,
              recent: recentSessions.length,
            },
            mobile: {
              activeHandoffs: mobileHandoffs.keys.length,
              supportedPlatforms: [
                "claude-mobile",
                "chatgpt-mobile",
                "mobile-browser",
              ],
            },
          },
        }),
        { headers: { "Content-Type": "application/json" } },
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
   * Get mobile-optimized context
   */
  async getMobileContext(request) {
    try {
      const url = new URL(request.url);
      const sessionId = url.searchParams.get("sessionId");
      const handoffId = url.searchParams.get("handoffId");

      let contextData;

      if (handoffId) {
        contextData = await this.get(`mobile:${handoffId}`);
        if (contextData) {
          const handoff = JSON.parse(contextData);
          return new Response(
            JSON.stringify({
              success: true,
              context: handoff.mobileContext,
              instructions: handoff.instructions,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
      }

      if (sessionId) {
        contextData = await this.get(`session:${sessionId}`);
        if (contextData) {
          const session = JSON.parse(contextData);
          const mobileContext = this.optimizeForMobile(session);

          return new Response(
            JSON.stringify({
              success: true,
              context: mobileContext,
              instructions: this.generateMobileInstructions(session, "mobile"),
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: "No context found for provided ID",
        }),
        {
          status: 404,
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
   * Optimize session data for mobile consumption
   */
  optimizeForMobile(session) {
    return {
      context:
        session.context?.substring(0, 300) +
        (session.context?.length > 300 ? "..." : ""),
      intent: session.intent,
      recentFiles: Object.entries(session.files || {})
        .slice(-3)
        .map(([path, content]) => ({
          path,
          preview:
            content.substring(0, 100) + (content.length > 100 ? "..." : ""),
        })),
      pendingTodos: (session.todos || [])
        .filter((t) => !t.completed)
        .slice(0, 5)
        .map((t) => ({
          text: t.text?.substring(0, 80) + (t.text?.length > 80 ? "..." : ""),
          priority: t.priority,
        })),
      nextSteps: (session.nextSteps || []).slice(0, 3),
      filesCount: Object.keys(session.files || {}).length,
      todosCount: (session.todos || []).length,
    };
  }

  /**
   * Generate mobile-specific instructions
   */
  generateMobileInstructions(session, platform) {
    const platformName =
      platform === "claude-mobile"
        ? "Claude mobile"
        : platform === "chatgpt-mobile"
          ? "ChatGPT mobile"
          : "mobile platform";

    return {
      greeting: `Continue work from desktop on ${platformName}`,
      context: session.context?.substring(0, 200),
      quickStart: [
        "Review the context and recent files",
        "Check pending todos for next actions",
        "Continue from where desktop session left off",
      ],
      mobileTips: [
        "Use voice input for faster updates",
        "Focus on planning and high-level decisions",
        "Sync back to desktop for detailed coding",
      ],
      returnInstructions:
        "Use the same handoff ID to sync changes back to desktop",
    };
  }

  /**
   * Generate mobile continuation steps
   */
  generateMobileContinuationSteps(mobileHandoff) {
    return [
      "Review updates made on mobile",
      "Continue detailed implementation on desktop",
      "Use desktop Claude for file editing and testing",
      `Mobile session: ${mobileHandoff.mobilePlatform}`,
    ];
  }
}

export default MobileBridgeService;
