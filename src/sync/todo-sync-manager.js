/**
 * TodoSyncManager - Bidirectional todo synchronization manager
 * Extends SessionSyncManager with todo-specific sync logic
 * Integrates with ChittyOS Todo Hub (sync.chitty.cc) for cross-platform sync
 */

import { SessionSyncManager } from "./session-sync-manager.js";
import { VectorClock } from "./distributed-session-sync.js";
import { mintId } from "../utils/chittyid-adapter.js";

export class TodoSyncManager extends SessionSyncManager {
  constructor(env) {
    super(env);

    // Todo-specific configuration
    this.todoHubUrl = env.TODO_HUB_URL || "https://sync.chitty.cc";
    this.platform = env.PLATFORM || "chittyrouter";
    this.vectorClock = new VectorClock(this.platform);
    this.conflictResolutionStrategy =
      env.CONFLICT_STRATEGY || "last_write_wins";

    // Cache for local todos
    this.localTodos = new Map();
    this.lastSyncTimestamp = 0;
  }

  /**
   * Sync todos to the central hub
   * @param {Array} todos - Array of todo objects
   * @returns {Object} Sync result with created/updated/conflicts
   */
  async syncToHub(todos) {
    try {
      // 1. Mint ChittyIDs for new todos
      const todosWithIds = await Promise.all(
        todos.map(async (todo) => {
          if (!todo.id || todo.id.startsWith("pending-")) {
            const sanitizedContent = todo.content
              .slice(0, 50)
              .replace(/[^a-zA-Z0-9\s-]/g, "");
            todo.id = await mintId(
              "INFO",
              `todo-${sanitizedContent}`,
              this.env,
            );
          }
          return todo;
        }),
      );

      // 2. Add/update vector clock for each todo
      this.vectorClock.tick();
      const vectorClockData = this.vectorClock.clock;

      const todosWithClock = todosWithIds.map((todo) => ({
        ...todo,
        vectorClock: todo.vectorClock || vectorClockData,
        platform: this.platform,
        updatedAt: Date.now(),
      }));

      // 3. Push to hub
      const response = await fetch(`${this.todoHubUrl}/api/todos/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN || this.env.SECRET_CHITTY_ID_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          todos: todosWithClock,
          platform: this.platform,
          sessionId: this.sessionId,
          projectId: this.projectId,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Hub sync failed: ${response.status} ${response.statusText}`,
        );
      }

      const result = await response.json();

      // Update local cache
      todosWithClock.forEach((todo) => {
        this.localTodos.set(todo.id, todo);
      });

      return {
        success: true,
        synced: todosWithClock.length,
        results: result.results || [],
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("syncToHub failed:", error);
      return {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Pull todos from the central hub
   * @param {number} since - Timestamp to fetch updates since (optional)
   * @returns {Array} Array of todos from hub
   */
  async pullFromHub(since = null) {
    try {
      const timestamp = since || this.lastSyncTimestamp || 0;
      const url = `${this.todoHubUrl}/api/todos/since/${timestamp}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN || this.env.SECRET_CHITTY_ID_TOKEN}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Hub pull failed: ${response.status} ${response.statusText}`,
        );
      }

      const remoteTodos = await response.json();

      // Update last sync timestamp
      if (remoteTodos.length > 0) {
        this.lastSyncTimestamp = Math.max(
          ...remoteTodos.map((t) => t.updatedAt || t.updated_at || 0),
        );
      }

      return remoteTodos;
    } catch (error) {
      console.error("pullFromHub failed:", error);
      return [];
    }
  }

  /**
   * Merge local and remote todos with conflict resolution
   * @param {Array} localTodos - Local todo array
   * @param {Array} remoteTodos - Remote todo array from hub
   * @returns {Object} Merged todos and conflicts
   */
  mergeWithConflictResolution(localTodos, remoteTodos) {
    const merged = [];
    const conflicts = [];
    const remoteById = new Map(remoteTodos.map((t) => [t.id, t]));
    const localById = new Map(localTodos.map((t) => [t.id, t]));

    // Process remote todos
    for (const remote of remoteTodos) {
      const local = localById.get(remote.id);

      if (!local) {
        // New todo from remote
        merged.push(remote);
        continue;
      }

      // Conflict resolution using vector clocks
      const localClock = new VectorClock(
        this.platform,
        local.vectorClock || {},
      );
      const remoteClock = new VectorClock(
        remote.platform,
        remote.vectorClock || {},
      );

      const comparison = localClock.compare(remoteClock.clock);

      switch (comparison) {
        case "after":
          // Local is newer
          merged.push(local);
          break;

        case "before":
          // Remote is newer
          merged.push(remote);
          break;

        case "equal":
          // Same version, prefer local
          merged.push(local);
          break;

        case "concurrent": {
          // True conflict - concurrent edits
          conflicts.push({
            id: `${remote.id}-conflict`,
            local: {
              ...local,
              id: `${local.id}-local`,
              conflictWith: `${remote.id}-remote`,
            },
            remote: {
              ...remote,
              id: `${remote.id}-remote`,
              conflictWith: `${local.id}-local`,
            },
            detectedAt: Date.now(),
          });

          // Apply conflict resolution strategy
          if (this.conflictResolutionStrategy === "last_write_wins") {
            // Use timestamp as tiebreaker
            const winner =
              (local.updatedAt || 0) >
              (remote.updatedAt || remote.updated_at || 0)
                ? local
                : remote;
            merged.push(winner);
          } else if (this.conflictResolutionStrategy === "status_priority") {
            // Status priority: completed > in_progress > pending
            const statusPriority = { completed: 3, in_progress: 2, pending: 1 };
            const localPriority = statusPriority[local.status] || 0;
            const remotePriority = statusPriority[remote.status] || 0;
            const winner = localPriority >= remotePriority ? local : remote;
            merged.push(winner);
          } else {
            // Keep both with conflict markers
            merged.push({ ...local, conflictWith: `${remote.id}-remote` });
            merged.push({ ...remote, conflictWith: `${local.id}-local` });
          }
          break;
        }
      }

      // Mark as processed
      localById.delete(remote.id);
    }

    // Add remaining local todos (not in remote)
    for (const local of localById.values()) {
      merged.push(local);
    }

    return {
      merged,
      conflicts,
      stats: {
        totalMerged: merged.length,
        conflictsDetected: conflicts.length,
        localOnly: localById.size,
        remoteOnly: remoteTodos.filter(
          (r) => !localTodos.find((l) => l.id === r.id),
        ).length,
      },
    };
  }

  /**
   * Perform bidirectional sync: pull from hub, merge, push updates
   * @returns {Object} Sync result
   */
  async bidirectionalSync() {
    try {
      // 1. Pull remote todos
      const remoteTodos = await this.pullFromHub();

      // 2. Get local todos (from cache or load)
      const localTodos = Array.from(this.localTodos.values());

      // 3. Merge with conflict resolution
      const { merged, conflicts, stats } = this.mergeWithConflictResolution(
        localTodos,
        remoteTodos,
      );

      // 4. Update local cache
      this.localTodos.clear();
      merged.forEach((todo) => {
        this.localTodos.set(todo.id, todo);
      });

      // 5. If there are new local changes, push to hub
      const hasLocalChanges = localTodos.some((local) => {
        const remote = remoteTodos.find((r) => r.id === local.id);
        if (!remote) return true;
        return (
          (local.updatedAt || 0) > (remote.updatedAt || remote.updated_at || 0)
        );
      });

      let pushResult = null;
      if (hasLocalChanges) {
        pushResult = await this.syncToHub(merged);
      }

      return {
        success: true,
        pulled: remoteTodos.length,
        merged: merged.length,
        conflicts: conflicts.length,
        conflictDetails: conflicts,
        pushed: pushResult?.synced || 0,
        stats,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("bidirectionalSync failed:", error);
      return {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Subscribe to real-time updates via WebSocket
   * @param {Function} onUpdate - Callback for todo updates
   * @returns {WebSocket} WebSocket connection
   */
  async subscribeToUpdates(onUpdate) {
    try {
      const ws = new WebSocket(
        `${this.todoHubUrl.replace("https://", "wss://")}/api/todos/watch`,
        {
          headers: {
            Authorization: `Bearer ${this.env.CHITTY_ID_TOKEN || this.env.SECRET_CHITTY_ID_TOKEN}`,
          },
        },
      );

      ws.on("open", () => {
        console.log("WebSocket connected to todo hub");
      });

      ws.on("message", (data) => {
        try {
          const update = JSON.parse(data);

          // Update local cache
          if (update.action === "create" || update.action === "update") {
            this.localTodos.set(update.todo.id, update.todo);
          } else if (update.action === "delete") {
            this.localTodos.delete(update.todo.id);
          }

          // Call user callback
          if (onUpdate) {
            onUpdate(update);
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
      });

      ws.on("close", () => {
        console.log("WebSocket disconnected from todo hub");
      });

      return ws;
    } catch (error) {
      console.error("subscribeToUpdates failed:", error);
      return null;
    }
  }

  /**
   * Load todos from local storage/cache
   * @returns {Array} Array of local todos
   */
  async loadLocalTodos() {
    // This would be implemented to load from local storage
    // For now, return cached todos
    return Array.from(this.localTodos.values());
  }

  /**
   * Save todos to local storage/cache
   * @param {Array} todos - Todos to save
   */
  async saveLocalTodos(todos) {
    todos.forEach((todo) => {
      this.localTodos.set(todo.id, todo);
    });
  }

  /**
   * Get sync status
   * @returns {Object} Sync status information
   */
  getSyncStatus() {
    return {
      platform: this.platform,
      sessionId: this.sessionId,
      projectId: this.projectId,
      lastSyncTimestamp: this.lastSyncTimestamp,
      localTodoCount: this.localTodos.size,
      vectorClock: this.vectorClock.toJSON(),
      hubUrl: this.todoHubUrl,
    };
  }
}

export default TodoSyncManager;
