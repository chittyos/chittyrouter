#!/bin/bash

###############################################################################
# Bidirectional Todo Sync Script
# Pull todos from hub → merge with local → push back to hub
# Can be run manually or via cron (every 30 minutes recommended)
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TODOS_DIR="$HOME/.claude/todos"
CONSOLIDATED_FILE="$HOME/.claude/projects/-/CHITTYOS/chittyos-services/chittychat/todos.json"
LAST_SYNC_FILE="$HOME/.chittychat/last_sync_timestamp.txt"
TEMP_DIR="/tmp/chittyos-todo-sync"
HUB_URL="${TODO_HUB_URL:-https://todohub.chitty.cc}"
PLATFORM="claude_code"

# Ensure required directories exist
mkdir -p "$TODOS_DIR"
mkdir -p "$TEMP_DIR"
mkdir -p "$(dirname "$LAST_SYNC_FILE")"

###############################################################################
# Helper Functions
###############################################################################

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_token() {
  if [ -z "$CHITTY_ID_TOKEN" ]; then
    log_error "CHITTY_ID_TOKEN not set. Export it first:"
    log_error "  export CHITTY_ID_TOKEN='your-token-here'"
    exit 1
  fi
}

###############################################################################
# Step 1: Pull remote todos from hub
###############################################################################

pull_from_hub() {
  log_info "Pulling todos from hub..."

  # Get last sync timestamp (or 0 for first sync)
  local last_sync=0
  if [ -f "$LAST_SYNC_FILE" ]; then
    last_sync=$(cat "$LAST_SYNC_FILE")
  fi

  log_info "Last sync: $last_sync ($(date -r $((last_sync / 1000)) 2>/dev/null || echo 'never'))"

  # Fetch todos from hub
  local response
  response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $CHITTY_ID_TOKEN" \
    -H "Content-Type: application/json" \
    "$HUB_URL/api/todos/since/$last_sync")

  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | head -n-1)

  if [ "$http_code" != "200" ]; then
    log_error "Failed to pull from hub (HTTP $http_code)"
    echo "$body" | head -5
    return 1
  fi

  # Save remote todos to temp file
  echo "$body" > "$TEMP_DIR/remote_todos.json"

  local todo_count=$(echo "$body" | jq '. | length' 2>/dev/null || echo "0")
  log_success "Pulled $todo_count remote todos"

  return 0
}

###############################################################################
# Step 2: Merge remote todos into local imports
###############################################################################

merge_remote_todos() {
  log_info "Merging remote todos..."

  if [ ! -f "$TEMP_DIR/remote_todos.json" ]; then
    log_warning "No remote todos to merge"
    return 0
  fi

  # Use Node.js merge script
  if [ -f "$SCRIPT_DIR/merge-remote-todos.js" ]; then
    node "$SCRIPT_DIR/merge-remote-todos.js" "$TEMP_DIR/remote_todos.json"
  else
    log_error "merge-remote-todos.js not found"
    return 1
  fi

  return 0
}

###############################################################################
# Step 3: Consolidate all todos (local + imports)
###############################################################################

consolidate_todos() {
  log_info "Consolidating todos..."

  # Find all todo JSON files
  local todo_files=()
  while IFS= read -r -d '' file; do
    todo_files+=("$file")
  done < <(find "$TODOS_DIR" -name "*.json" -type f -print0)

  if [ ${#todo_files[@]} -eq 0 ]; then
    log_warning "No todo files found in $TODOS_DIR"
    echo "[]" > "$TEMP_DIR/consolidated.json"
    return 0
  fi

  log_info "Found ${#todo_files[@]} todo files"

  # Merge all JSON files using jq
  local consolidated="[]"
  for file in "${todo_files[@]}"; do
    # Read and merge, handling both array and single object formats
    local content=$(jq -s 'flatten | unique_by(.id)' "$file" 2>/dev/null || echo "[]")
    consolidated=$(echo "$consolidated" "$content" | jq -s 'flatten | unique_by(.id)')
  done

  # Save consolidated todos
  echo "$consolidated" > "$TEMP_DIR/consolidated.json"

  local todo_count=$(echo "$consolidated" | jq '. | length')
  log_success "Consolidated $todo_count unique todos"

  # Save to chittychat directory for persistence
  if [ -n "$CONSOLIDATED_FILE" ]; then
    mkdir -p "$(dirname "$CONSOLIDATED_FILE")"
    echo "$consolidated" > "$CONSOLIDATED_FILE"
    log_success "Saved consolidated todos to $CONSOLIDATED_FILE"
  fi

  return 0
}

###############################################################################
# Step 4: Push consolidated todos back to hub
###############################################################################

push_to_hub() {
  log_info "Pushing todos to hub..."

  if [ ! -f "$TEMP_DIR/consolidated.json" ]; then
    log_warning "No consolidated todos to push"
    return 0
  fi

  # Prepare sync payload
  local payload=$(jq -n \
    --argjson todos "$(cat $TEMP_DIR/consolidated.json)" \
    --arg platform "$PLATFORM" \
    '{
      todos: $todos,
      platform: $platform
    }')

  # Push to hub
  local response
  response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $CHITTY_ID_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$HUB_URL/api/todos/sync")

  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | head -n-1)

  if [ "$http_code" != "200" ]; then
    log_error "Failed to push to hub (HTTP $http_code)"
    echo "$body" | head -5
    return 1
  fi

  # Parse results
  local created=$(echo "$body" | jq '[.results[] | select(.action == "created")] | length' 2>/dev/null || echo "0")
  local updated=$(echo "$body" | jq '[.results[] | select(.action == "updated")] | length' 2>/dev/null || echo "0")
  local conflicts=$(echo "$body" | jq '[.results[] | select(.action == "conflict")] | length' 2>/dev/null || echo "0")
  local skipped=$(echo "$body" | jq '[.results[] | select(.action == "skipped")] | length' 2>/dev/null || echo "0")

  log_success "Push complete: $created created, $updated updated, $skipped skipped"

  if [ "$conflicts" -gt 0 ]; then
    log_warning "$conflicts conflicts detected"
    echo "$body" | jq '.results[] | select(.action == "conflict")' 2>/dev/null || true
  fi

  return 0
}

###############################################################################
# Step 5: Update sync timestamp
###############################################################################

update_sync_timestamp() {
  local timestamp=$(date +%s)000  # Milliseconds
  echo "$timestamp" > "$LAST_SYNC_FILE"
  log_success "Updated sync timestamp: $timestamp"
}

###############################################################################
# Cleanup
###############################################################################

cleanup() {
  log_info "Cleaning up..."
  # Keep temp files for debugging
  # rm -rf "$TEMP_DIR"
  log_success "Cleanup complete (temp files kept in $TEMP_DIR)"
}

###############################################################################
# Main Execution
###############################################################################

main() {
  local start_time=$(date +%s)

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "ChittyOS Bidirectional Todo Sync"
  log_info "Hub: $HUB_URL"
  log_info "Platform: $PLATFORM"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Check prerequisites
  check_token

  # Execute sync steps
  local failed=0

  # Step 1: Pull from hub
  if ! pull_from_hub; then
    log_error "Pull failed, aborting sync"
    failed=1
  fi

  # Step 2: Merge remote todos
  if [ $failed -eq 0 ]; then
    if ! merge_remote_todos; then
      log_warning "Merge failed, continuing with local todos only"
    fi
  fi

  # Step 3: Consolidate
  if [ $failed -eq 0 ]; then
    if ! consolidate_todos; then
      log_error "Consolidation failed"
      failed=1
    fi
  fi

  # Step 4: Push to hub
  if [ $failed -eq 0 ]; then
    if ! push_to_hub; then
      log_warning "Push failed, local changes not synced"
    fi
  fi

  # Step 5: Update timestamp
  if [ $failed -eq 0 ]; then
    update_sync_timestamp
  fi

  # Cleanup
  cleanup

  # Summary
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [ $failed -eq 0 ]; then
    log_success "Bidirectional sync complete! (${duration}s)"
  else
    log_error "Sync completed with errors (${duration}s)"
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  exit $failed
}

# Run main function
main "$@"
