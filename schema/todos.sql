-- ChittyOS Todo Hub - D1 Database Schema
-- Omnidirectional todo synchronization across AI platforms

-- Todos table - stores all todos with ChittyIDs and vector clocks
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,              -- ChittyID (CHITTY-INFO-XXX-YYY)
  content TEXT NOT NULL,            -- Todo content
  status TEXT NOT NULL              -- pending|in_progress|completed
    CHECK(status IN ('pending', 'in_progress', 'completed')),
  active_form TEXT NOT NULL,        -- Active form (present continuous)
  platform TEXT NOT NULL,           -- claude_code|claude_desktop|chatgpt|gemini|cursor
  user_id TEXT NOT NULL,            -- ChittyID of user
  session_id TEXT,                  -- Session ID (optional)
  project_id TEXT,                  -- Project ID (optional)
  vector_clock TEXT NOT NULL,       -- JSON serialized vector clock
  created_at INTEGER NOT NULL,      -- Unix timestamp (milliseconds)
  updated_at INTEGER NOT NULL,      -- Unix timestamp (milliseconds)
  deleted_at INTEGER,               -- Soft delete timestamp
  conflict_with TEXT,               -- ChittyID of conflicting todo (if any)
  metadata TEXT                     -- JSON serialized metadata
);

-- Sync metadata table - tracks last sync timestamp per platform/user
CREATE TABLE IF NOT EXISTS sync_metadata (
  platform_user TEXT PRIMARY KEY,   -- {platform}:{user_id}
  last_sync INTEGER NOT NULL,       -- Unix timestamp (milliseconds)
  vector_clock TEXT NOT NULL,       -- JSON serialized vector clock
  total_syncs INTEGER DEFAULT 0,    -- Total number of syncs
  last_conflict INTEGER,            -- Timestamp of last conflict
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- WebSocket subscriptions table - tracks active WebSocket connections
CREATE TABLE IF NOT EXISTS ws_subscriptions (
  id TEXT PRIMARY KEY,              -- Subscription ID
  user_id TEXT NOT NULL,            -- ChittyID of user
  platform TEXT NOT NULL,           -- Platform identifier
  connected_at INTEGER NOT NULL,    -- Connection timestamp
  last_ping INTEGER NOT NULL,       -- Last ping timestamp
  metadata TEXT                     -- JSON serialized metadata
);

-- Conflict log table - tracks all conflicts for audit
CREATE TABLE IF NOT EXISTS conflict_log (
  id TEXT PRIMARY KEY,              -- Conflict ID (ChittyID)
  todo_id TEXT NOT NULL,            -- ChittyID of conflicting todo
  local_version TEXT NOT NULL,      -- JSON serialized local version
  remote_version TEXT NOT NULL,     -- JSON serialized remote version
  resolution TEXT,                  -- JSON serialized resolution
  resolved_at INTEGER,              -- Resolution timestamp
  created_at INTEGER NOT NULL,      -- Conflict detection timestamp
  FOREIGN KEY(todo_id) REFERENCES todos(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_todos_user_status
  ON todos(user_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_todos_user_updated
  ON todos(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_todos_session
  ON todos(session_id)
  WHERE deleted_at IS NULL AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_todos_project
  ON todos(project_id)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_todos_platform
  ON todos(platform, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sync_metadata_platform
  ON sync_metadata(platform_user, last_sync DESC);

CREATE INDEX IF NOT EXISTS idx_ws_subscriptions_user
  ON ws_subscriptions(user_id, connected_at DESC);

CREATE INDEX IF NOT EXISTS idx_conflict_log_todo
  ON conflict_log(todo_id, created_at DESC);

-- Cleanup stale WebSocket subscriptions (older than 24 hours)
-- This should be run periodically via a scheduled task
CREATE TRIGGER IF NOT EXISTS cleanup_stale_ws
  AFTER INSERT ON ws_subscriptions
  BEGIN
    DELETE FROM ws_subscriptions
    WHERE last_ping < (strftime('%s', 'now') - 86400) * 1000;
  END;

-- Update updated_at timestamp on todos update
CREATE TRIGGER IF NOT EXISTS update_todos_timestamp
  AFTER UPDATE ON todos
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE todos SET updated_at = (strftime('%s', 'now') * 1000)
    WHERE id = NEW.id;
  END;

-- Update updated_at timestamp on sync_metadata update
CREATE TRIGGER IF NOT EXISTS update_sync_metadata_timestamp
  AFTER UPDATE ON sync_metadata
  WHEN NEW.updated_at = OLD.updated_at
  BEGIN
    UPDATE sync_metadata SET updated_at = (strftime('%s', 'now') * 1000)
    WHERE platform_user = NEW.platform_user;
  END;
