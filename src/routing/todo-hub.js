/**
 * ChittyOS Todo Hub - REST API Endpoints
 * Central hub for omnidirectional todo synchronization
 * Supports Claude Code, Claude Desktop, ChatGPT, Gemini, Cursor
 */

import { VectorClock } from "../sync/distributed-session-sync.js";
import { mintId } from "../utils/chittyid-adapter.js";

/**
 * Authenticate request and extract user ID from bearer token
 * @param {Request} request - Incoming request
 * @param {Object} env - Environment variables
 * @returns {string} User ID (ChittyID)
 */
async function authenticateRequest(request, env) {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.substring(7);

  // Validate token with ChittyID service to get real user ChittyID
  try {
    const validationResponse = await fetch(
      `https://id.chitty.cc/api/validate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      },
    );

    if (validationResponse.ok) {
      const validation = await validationResponse.json();
      if (validation.success && validation.userId) {
        // Return the actual user ChittyID from validation
        return validation.userId;
      }
    }

    // If validation failed, log details
    const errorBody = await validationResponse.text();
    console.error("ChittyID validation failed:", {
      status: validationResponse.status,
      body: errorBody,
    });
  } catch (err) {
    console.error("ChittyID service error:", err);
  }

  // No fallback to fake ChittyIDs - authentication must be real
  throw new Error(
    "Invalid authentication token - ChittyID validation required",
  );
}

/**
 * Serialize todo for database storage
 * @param {Object} todo - Todo object
 * @returns {Object} Serialized todo for D1
 */
function serializeTodo(todo) {
  return {
    id: todo.id,
    content: todo.content,
    status: todo.status,
    active_form: todo.activeForm || todo.active_form,
    platform: todo.platform,
    user_id: todo.userId || todo.user_id,
    session_id: todo.sessionId || todo.session_id || null,
    project_id: todo.projectId || todo.project_id || null,
    vector_clock: JSON.stringify(todo.vectorClock || {}),
    created_at: todo.createdAt || todo.created_at || Date.now(),
    updated_at: todo.updatedAt || todo.updated_at || Date.now(),
    deleted_at: todo.deletedAt || todo.deleted_at || null,
    conflict_with: todo.conflictWith || todo.conflict_with || null,
    metadata: JSON.stringify(todo.metadata || {}),
  };
}

/**
 * Deserialize todo from database
 * @param {Object} row - Database row
 * @returns {Object} Deserialized todo
 */
function deserializeTodo(row) {
  return {
    id: row.id,
    content: row.content,
    status: row.status,
    activeForm: row.active_form,
    platform: row.platform,
    userId: row.user_id,
    sessionId: row.session_id,
    projectId: row.project_id,
    vectorClock: JSON.parse(row.vector_clock || "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    conflictWith: row.conflict_with,
    metadata: JSON.parse(row.metadata || "{}"),
  };
}

/**
 * GET /api/todos - List all todos for authenticated user
 */
export async function listTodos(request, env) {
  try {
    const userId = await authenticateRequest(request, env);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const projectId = url.searchParams.get("projectId");
    const sessionId = url.searchParams.get("sessionId");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    let query = "SELECT * FROM todos WHERE user_id = ? AND deleted_at IS NULL";
    const params = [userId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }

    if (sessionId) {
      query += " AND session_id = ?";
      params.push(sessionId);
    }

    query += " ORDER BY updated_at DESC LIMIT ?";
    params.push(limit);

    const { results } = await env.DB.prepare(query)
      .bind(...params)
      .all();

    return new Response(JSON.stringify(results.map(deserializeTodo)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes("authentication") ? 401 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * POST /api/todos - Create new todo
 */
export async function createTodo(request, env) {
  try {
    const userId = await authenticateRequest(request, env);
    const body = await request.json();

    const {
      content,
      status = "pending",
      activeForm,
      platform,
      sessionId,
      projectId,
      metadata,
    } = body;

    if (!content || !activeForm || !platform) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: content, activeForm, platform",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Mint ChittyID for new todo - no fallback allowed for ChittyCheck compliance
    const sanitizedContent = content
      .slice(0, 50)
      .replace(/[^a-zA-Z0-9\s-]/g, "");

    let todoId;
    try {
      todoId = await mintId("INFO", `todo-${sanitizedContent}`, env);
    } catch (mintError) {
      console.error("ChittyID minting failed:", mintError.message);
      return new Response(
        JSON.stringify({
          error: "ChittyID service unavailable",
          message:
            "Cannot create todo without valid ChittyID. Please try again later.",
          details: mintError.message,
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Initialize vector clock
    const vectorClock = { [platform]: 1 };

    const todo = {
      id: todoId,
      content,
      status,
      activeForm,
      platform,
      userId,
      sessionId: sessionId || null,
      projectId: projectId || null,
      vectorClock,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: metadata || {},
    };

    const serialized = serializeTodo(todo);

    await env.DB.prepare(
      `
      INSERT INTO todos (id, content, status, active_form, platform, user_id, session_id, project_id, vector_clock, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
      .bind(
        serialized.id,
        serialized.content,
        serialized.status,
        serialized.active_form,
        serialized.platform,
        serialized.user_id,
        serialized.session_id,
        serialized.project_id,
        serialized.vector_clock,
        serialized.created_at,
        serialized.updated_at,
        serialized.metadata,
      )
      .run();

    // Broadcast to WebSocket subscribers
    await broadcastTodoUpdate(env, userId, { action: "create", todo });

    return new Response(JSON.stringify(todo), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes("authentication") ? 401 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * GET /api/todos/:id - Get specific todo
 */
export async function getTodo(request, env, id) {
  try {
    const userId = await authenticateRequest(request, env);

    const result = await env.DB.prepare(
      `
      SELECT * FROM todos WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `,
    )
      .bind(id, userId)
      .first();

    if (!result) {
      return new Response(JSON.stringify({ error: "Todo not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(deserializeTodo(result)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes("authentication") ? 401 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * PUT /api/todos/:id - Update todo
 */
export async function updateTodo(request, env, id) {
  try {
    const userId = await authenticateRequest(request, env);
    const body = await request.json();

    const { status, content, activeForm, vectorClock, platform } = body;

    // Get existing todo
    const existing = await env.DB.prepare(
      `
      SELECT * FROM todos WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `,
    )
      .bind(id, userId)
      .first();

    if (!existing) {
      return new Response(JSON.stringify({ error: "Todo not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Merge vector clocks
    const existingClock = JSON.parse(existing.vector_clock);
    const newClock = new VectorClock(
      platform || existing.platform,
      existingClock,
    );
    newClock.tick();

    if (vectorClock) {
      newClock.update(vectorClock);
    }

    // Update todo
    await env.DB.prepare(
      `
      UPDATE todos
      SET status = ?, content = ?, active_form = ?, vector_clock = ?, updated_at = ?
      WHERE id = ?
    `,
    )
      .bind(
        status || existing.status,
        content || existing.content,
        activeForm || existing.active_form,
        JSON.stringify(newClock.clock),
        Date.now(),
        id,
      )
      .run();

    // Fetch updated todo
    const updated = await env.DB.prepare(
      `
      SELECT * FROM todos WHERE id = ?
    `,
    )
      .bind(id)
      .first();

    const todo = deserializeTodo(updated);

    // Broadcast update
    await broadcastTodoUpdate(env, userId, { action: "update", todo });

    return new Response(JSON.stringify(todo), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes("authentication") ? 401 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * DELETE /api/todos/:id - Soft delete todo
 */
export async function deleteTodo(request, env, id) {
  try {
    const userId = await authenticateRequest(request, env);

    const existing = await env.DB.prepare(
      `
      SELECT * FROM todos WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `,
    )
      .bind(id, userId)
      .first();

    if (!existing) {
      return new Response(JSON.stringify({ error: "Todo not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    await env.DB.prepare(
      `
      UPDATE todos SET deleted_at = ? WHERE id = ?
    `,
    )
      .bind(Date.now(), id)
      .run();

    // Broadcast deletion
    await broadcastTodoUpdate(env, userId, {
      action: "delete",
      todo: deserializeTodo(existing),
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes("authentication") ? 401 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * POST /api/todos/sync - Bulk sync todos (used by Claude Code)
 */
export async function syncTodos(request, env) {
  try {
    const userId = await authenticateRequest(request, env);
    const body = await request.json();

    const { todos, platform, sessionId, projectId } = body;

    if (!todos || !Array.isArray(todos) || !platform) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: todos (array), platform",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const results = [];

    for (const todo of todos) {
      try {
        // Check if todo exists
        const existing = await env.DB.prepare(
          "SELECT * FROM todos WHERE id = ?",
        )
          .bind(todo.id)
          .first();

        if (!existing) {
          // New todo - insert
          const serialized = serializeTodo({
            ...todo,
            userId,
            sessionId: sessionId || todo.sessionId,
            projectId: projectId || todo.projectId,
            createdAt: todo.createdAt || Date.now(),
            updatedAt: Date.now(),
          });

          await env.DB.prepare(
            `
            INSERT INTO todos (id, content, status, active_form, platform, user_id, session_id, project_id, vector_clock, created_at, updated_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
            .bind(
              serialized.id,
              serialized.content,
              serialized.status,
              serialized.active_form,
              serialized.platform,
              serialized.user_id,
              serialized.session_id,
              serialized.project_id,
              serialized.vector_clock,
              serialized.created_at,
              serialized.updated_at,
              serialized.metadata,
            )
            .run();

          results.push({ id: todo.id, action: "created" });
        } else {
          // Conflict resolution
          const existingClock = new VectorClock(
            existing.platform,
            JSON.parse(existing.vector_clock),
          );
          const incomingClock = new VectorClock(
            todo.platform,
            todo.vectorClock || {},
          );

          const comparison = incomingClock.compare(existingClock.clock);

          if (comparison === "after") {
            // Incoming is newer - update
            await env.DB.prepare(
              `
              UPDATE todos
              SET content = ?, status = ?, active_form = ?, vector_clock = ?, updated_at = ?
              WHERE id = ?
            `,
            )
              .bind(
                todo.content,
                todo.status,
                todo.activeForm || todo.active_form,
                JSON.stringify(todo.vectorClock),
                Date.now(),
                todo.id,
              )
              .run();

            results.push({ id: todo.id, action: "updated" });
          } else if (comparison === "concurrent") {
            // Conflict detected
            const conflictId = await mintId("INFO", `conflict-${todo.id}`, env);

            await env.DB.prepare(
              `
              INSERT INTO conflict_log (id, todo_id, local_version, remote_version, created_at)
              VALUES (?, ?, ?, ?, ?)
            `,
            )
              .bind(
                conflictId,
                todo.id,
                JSON.stringify(deserializeTodo(existing)),
                JSON.stringify(todo),
                Date.now(),
              )
              .run();

            results.push({
              id: todo.id,
              action: "conflict",
              conflictId,
              existing: deserializeTodo(existing),
              incoming: todo,
            });
          } else {
            results.push({
              id: todo.id,
              action: "skipped",
              reason: "older_version",
            });
          }
        }
      } catch (error) {
        results.push({ id: todo.id, action: "error", error: error.message });
      }
    }

    // Update sync metadata
    const platformUser = `${platform}:${userId}`;
    await env.DB.prepare(
      `
      INSERT INTO sync_metadata (platform_user, last_sync, vector_clock, total_syncs, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(platform_user) DO UPDATE SET
        last_sync = ?,
        vector_clock = ?,
        total_syncs = total_syncs + 1,
        updated_at = ?
    `,
    )
      .bind(
        platformUser,
        Date.now(),
        JSON.stringify({}),
        Date.now(),
        Date.now(),
        Date.now(),
        JSON.stringify({}),
        Date.now(),
      )
      .run();

    return new Response(JSON.stringify({ results, timestamp: Date.now() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes("authentication") ? 401 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * GET /api/todos/since/:timestamp - Delta sync (fetch todos updated since timestamp)
 */
export async function getTodosSince(request, env, timestamp) {
  try {
    const userId = await authenticateRequest(request, env);
    const ts = parseInt(timestamp);

    if (isNaN(ts)) {
      return new Response(JSON.stringify({ error: "Invalid timestamp" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { results } = await env.DB.prepare(
      `
      SELECT * FROM todos
      WHERE user_id = ? AND updated_at > ? AND deleted_at IS NULL
      ORDER BY updated_at ASC
    `,
    )
      .bind(userId, ts)
      .all();

    return new Response(JSON.stringify(results.map(deserializeTodo)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes("authentication") ? 401 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * WebSocket handler - /api/todos/watch
 * Subscribe to real-time todo updates
 */
export async function handleWebSocket(request, env) {
  try {
    const userId = await authenticateRequest(request, env);

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Register subscriber
    const subscriptionId = await mintId("INFO", `ws-${userId}`, env);

    await env.DB.prepare(
      `
      INSERT INTO ws_subscriptions (id, user_id, platform, connected_at, last_ping)
      VALUES (?, ?, ?, ?, ?)
    `,
    )
      .bind(subscriptionId, userId, "websocket", Date.now(), Date.now())
      .run();

    // Accept WebSocket connection
    server.accept();

    // Handle incoming messages
    server.addEventListener("message", async (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "ping") {
          // Update last ping
          await env.DB.prepare(
            `
            UPDATE ws_subscriptions SET last_ping = ? WHERE id = ?
          `,
          )
            .bind(Date.now(), subscriptionId)
            .run();

          server.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    // Handle close
    server.addEventListener("close", async () => {
      await env.DB.prepare(
        `
        DELETE FROM ws_subscriptions WHERE id = ?
      `,
      )
        .bind(subscriptionId)
        .run();
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes("authentication") ? 401 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Broadcast todo update to all WebSocket subscribers
 * @param {Object} env - Environment variables
 * @param {string} userId - User ID to broadcast to
 * @param {Object} update - Update payload
 */
async function broadcastTodoUpdate(env, userId, update) {
  try {
    // Get active subscriptions for user
    const { results } = await env.DB.prepare(
      `
      SELECT * FROM ws_subscriptions WHERE user_id = ?
    `,
    )
      .bind(userId)
      .all();

    // Note: Actual WebSocket broadcasting would require Durable Objects
    // This is a placeholder for the broadcasting logic
    console.log(
      `Broadcasting update to ${results.length} subscribers:`,
      update,
    );

    // TODO: Implement actual WebSocket broadcasting via Durable Objects
  } catch (error) {
    console.error("Broadcast error:", error);
  }
}

/**
 * GET /api/todos/health - Health check endpoint
 */
export async function healthCheck(request, env) {
  try {
    // Check database connectivity
    await env.DB.prepare("SELECT 1").first();

    return new Response(
      JSON.stringify({
        status: "healthy",
        service: "chittyos-todo-hub",
        timestamp: Date.now(),
        version: "1.0.0",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: "unhealthy",
        error: error.message,
        timestamp: Date.now(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export default {
  listTodos,
  createTodo,
  getTodo,
  updateTodo,
  deleteTodo,
  syncTodos,
  getTodosSince,
  handleWebSocket,
  healthCheck,
};
