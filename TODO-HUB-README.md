# ChittyOS Todo Hub - Omnidirectional Todo Synchronization

Central hub for bidirectional todo synchronization across multiple AI platforms (Claude Code, Claude Desktop, ChatGPT, Gemini, Cursor).

## Architecture

- **Hub-and-Spoke Model**: Central authority at `sync.chitty.cc` with platform adapters
- **Vector Clock Conflict Resolution**: Distributed consistency with automatic conflict detection
- **Real-Time Updates**: WebSocket support for instant synchronization
- **ChittyID Integration**: Every todo has unique ChittyID from `id.chitty.cc`

## Components

### 1. TodoSyncManager (`src/sync/todo-sync-manager.js`)
Extends SessionSyncManager with todo-specific sync logic:
- `syncToHub(todos)` - Push todos to central hub
- `pullFromHub(since)` - Fetch updates since timestamp
- `mergeWithConflictResolution()` - Vector clock-based merging
- `bidirectionalSync()` - Complete pull-merge-push cycle
- `subscribeToUpdates(onUpdate)` - WebSocket real-time subscription

### 2. REST API (`src/routing/todo-hub.js`)
Comprehensive todo management endpoints:
- `GET /api/todos` - List todos with filtering
- `POST /api/todos` - Create new todo
- `GET /api/todos/:id` - Get specific todo
- `PUT /api/todos/:id` - Update todo
- `DELETE /api/todos/:id` - Soft delete todo
- `POST /api/todos/sync` - Bulk sync (Claude Code)
- `GET /api/todos/since/:timestamp` - Delta sync
- `WS /api/todos/watch` - WebSocket subscription
- `GET /health` - Health check

### 3. Database Schema (`schema/todos.sql`)
Cloudflare D1 SQLite database:
- `todos` - Main todo storage with ChittyIDs and vector clocks
- `sync_metadata` - Platform sync state tracking
- `ws_subscriptions` - Active WebSocket connections
- `conflict_log` - Audit trail for conflicts

### 4. Worker (`src/todo-hub-worker.js`)
Cloudflare Workers entry point with CORS support and scheduled tasks.

## Deployment

### Prerequisites

```bash
# Authenticate with Cloudflare
wrangler login

# Verify account
wrangler whoami
```

### Step 1: Create D1 Database

```bash
# Create production database
wrangler d1 create chittyos-todos

# Note the database_id output and update wrangler-todo-hub.toml
# Example output: database_id = "abc123-def456-ghi789"
```

Update `wrangler-todo-hub.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "chittyos-todos"
database_id = "abc123-def456-ghi789"  # <-- Replace with your ID
```

### Step 2: Initialize Database Schema

```bash
# Apply schema to production database
wrangler d1 execute chittyos-todos --file=schema/todos.sql

# Verify tables were created
wrangler d1 execute chittyos-todos --command="SELECT name FROM sqlite_master WHERE type='table'"
```

Expected output:
```
todos
sync_metadata
ws_subscriptions
conflict_log
```

### Step 3: Create KV Namespace (Optional)

```bash
# Create KV namespace for caching
wrangler kv:namespace create "TODO_CACHE"

# Create preview namespace for testing
wrangler kv:namespace create "TODO_CACHE" --preview

# Update wrangler-todo-hub.toml with IDs from output
```

### Step 4: Configure Secrets

```bash
# Set ChittyID service token
wrangler secret put CHITTY_ID_TOKEN

# Paste your token when prompted
# Get token from: https://id.chitty.cc/dashboard or env.CHITTY_ID_TOKEN
```

### Step 5: Deploy to Production

```bash
# Deploy to sync.chitty.cc
wrangler deploy --config wrangler-todo-hub.toml --env production

# Or use staging first
wrangler deploy --config wrangler-todo-hub.toml --env staging
```

### Step 6: Verify Deployment

```bash
# Test health endpoint
curl https://sync.chitty.cc/health

# Expected response:
# {
#   "status": "healthy",
#   "service": "chittyos-todo-hub",
#   "timestamp": 1696800000000,
#   "version": "1.0.0"
# }
```

### Step 7: Test API Endpoints

```bash
# Set your ChittyID token
export CHITTY_TOKEN="your-token-here"

# Create a test todo
curl -X POST https://sync.chitty.cc/api/todos \
  -H "Authorization: Bearer $CHITTY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test omnidirectional sync",
    "activeForm": "Testing omnidirectional sync",
    "platform": "claude_code",
    "status": "pending"
  }'

# List todos
curl https://sync.chitty.cc/api/todos \
  -H "Authorization: Bearer $CHITTY_TOKEN"

# Test delta sync
curl https://sync.chitty.cc/api/todos/since/0 \
  -H "Authorization: Bearer $CHITTY_TOKEN"
```

## Usage in Claude Code

### TodoSyncManager Integration

```javascript
import TodoSyncManager from './src/sync/todo-sync-manager.js';

// Initialize
const syncManager = new TodoSyncManager(env);
await syncManager.initSession({ projectId: 'chittyrouter' });

// Push local todos to hub
const todos = [
  {
    id: 'CHITTY-INFO-001-ABC',
    content: 'Deploy ChittyRouter',
    status: 'in_progress',
    activeForm: 'Deploying ChittyRouter',
    platform: 'claude_code'
  }
];

const result = await syncManager.syncToHub(todos);
console.log('Synced:', result.synced, 'todos');

// Pull remote updates
const remoteTodos = await syncManager.pullFromHub();
console.log('Pulled:', remoteTodos.length, 'remote todos');

// Bidirectional sync (pull + merge + push)
const syncResult = await syncManager.bidirectionalSync();
console.log('Sync result:', syncResult);

// Subscribe to real-time updates
const ws = await syncManager.subscribeToUpdates((update) => {
  console.log('Todo update:', update.action, update.todo);
});
```

### Conflict Resolution

The system uses vector clocks to detect and resolve conflicts:

```javascript
// Concurrent edits detected
{
  "conflicts": [
    {
      "id": "CHITTY-INFO-001-ABC-conflict",
      "local": {
        "id": "CHITTY-INFO-001-ABC-local",
        "content": "Fix bug in router",
        "status": "pending",
        "conflictWith": "CHITTY-INFO-001-ABC-remote"
      },
      "remote": {
        "id": "CHITTY-INFO-001-ABC-remote",
        "content": "Fix bug in router and add tests",
        "status": "in_progress",
        "conflictWith": "CHITTY-INFO-001-ABC-local"
      },
      "detectedAt": 1696800000000
    }
  ]
}
```

Conflict resolution strategies:
- `last_write_wins` (default) - Use timestamp as tiebreaker
- `status_priority` - Prefer higher status (completed > in_progress > pending)
- `keep_both` - Create separate todos with conflict markers

## Platform Integration

### Claude Desktop (MCP)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chittyos-todos": {
      "command": "node",
      "args": ["/path/to/chittymcp/dist/index.js"],
      "env": {
        "CHITTY_ID_TOKEN": "${CHITTY_ID_TOKEN}",
        "TODO_HUB_URL": "https://sync.chitty.cc"
      }
    }
  }
}
```

### ChatGPT (Custom GPT Actions)

Upload OpenAPI schema to Custom GPT:

```yaml
openapi: 3.0.0
info:
  title: ChittyOS Todo Sync
  version: 1.0.0
servers:
  - url: https://sync.chitty.cc
paths:
  /api/todos:
    get:
      operationId: listTodos
      # ... (see agent design doc for full schema)
```

### Gemini (Function Calling)

Configure function declarations in Google AI Studio with adapter at `gemini-adapter.chitty.cc`.

## Monitoring

### Check Sync Status

```bash
# List active WebSocket subscriptions
wrangler d1 execute chittyos-todos --command="SELECT * FROM ws_subscriptions"

# Check sync metadata
wrangler d1 execute chittyos-todos --command="SELECT * FROM sync_metadata"

# View recent conflicts
wrangler d1 execute chittyos-todos --command="SELECT * FROM conflict_log ORDER BY created_at DESC LIMIT 10"
```

### View Logs

```bash
# Tail worker logs
wrangler tail chittyos-todo-hub-production

# Filter for errors only
wrangler tail chittyos-todo-hub-production --format pretty | grep ERROR
```

### Scheduled Tasks

Cleanup runs every 30 minutes via scheduled handler:
- Removes stale WebSocket subscriptions (>24 hours old)
- Future: Archive old completed todos, cleanup conflict logs

## Troubleshooting

### Database Issues

```bash
# Check database connectivity
wrangler d1 execute chittyos-todos --command="SELECT 1"

# List all tables
wrangler d1 execute chittyos-todos --command="SELECT name FROM sqlite_master WHERE type='table'"

# Check row counts
wrangler d1 execute chittyos-todos --command="SELECT 'todos' as table_name, COUNT(*) as count FROM todos UNION SELECT 'sync_metadata', COUNT(*) FROM sync_metadata"
```

### Authentication Errors

```bash
# Verify token is set
wrangler secret list

# Update token if expired
wrangler secret put CHITTY_ID_TOKEN

# Test token with ChittyID service
curl -X POST https://id.chitty.cc/v1/validate \
  -H "Authorization: Bearer $CHITTY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"'$CHITTY_TOKEN'"}'
```

### WebSocket Issues

```bash
# Check active subscriptions
wrangler d1 execute chittyos-todos --command="SELECT id, user_id, connected_at, last_ping FROM ws_subscriptions"

# Manual cleanup if needed
wrangler d1 execute chittyos-todos --command="DELETE FROM ws_subscriptions WHERE last_ping < $(date -u -d '24 hours ago' +%s)000"
```

## Performance Optimization

### Database Indexing

Indexes are created automatically by schema:
- `idx_todos_user_status` - User + status queries
- `idx_todos_user_updated` - User + timestamp for delta sync
- `idx_todos_session` - Session-based filtering
- `idx_sync_metadata_platform` - Platform sync tracking

### Caching Strategy

Use TODO_CACHE KV namespace for:
- Frequent todo lists by user
- Recent sync results
- Vector clock states

```javascript
// Example caching
const cacheKey = `user:${userId}:todos:${status}`;
const cached = await env.TODO_CACHE.get(cacheKey, 'json');

if (cached) {
  return cached;
}

// ... fetch from D1 ...

await env.TODO_CACHE.put(cacheKey, JSON.stringify(todos), {
  expirationTtl: 300 // 5 minutes
});
```

## Security Considerations

- **Authentication**: All endpoints require valid ChittyID bearer token
- **Authorization**: Users can only access their own todos (enforced by `user_id` in queries)
- **Soft Deletes**: Todos are soft-deleted (`deleted_at`) not physically removed
- **Rate Limiting**: Cloudflare Workers automatic rate limiting applies
- **CORS**: Configured for cross-origin requests from all platforms

## Next Steps

- [ ] Implement Durable Objects for WebSocket broadcasting
- [ ] Add ChittyMCP todo tools for Claude Desktop
- [ ] Create ChatGPT Custom GPT with OpenAPI actions
- [ ] Build Gemini adapter worker
- [ ] Add conflict resolution UI/notifications
- [ ] Implement todo archival (completed >30 days)
- [ ] Add metrics and analytics dashboard

## Support

- **Documentation**: https://docs.chitty.cc/todo-hub
- **Issues**: https://github.com/ChittyOS/chittyrouter/issues
- **ChittyOS Hub**: https://sync.chitty.cc/health
- **ChittyID Service**: https://id.chitty.cc

---

**Version**: 1.0.0
**Status**: Phase 1 Complete (Hub API + TodoSyncManager)
**Last Updated**: 2025-10-11
