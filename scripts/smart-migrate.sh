#!/bin/bash
# Smart Migration Script - Tracks copies and marks for deletion
# Prevents scattered duplicates and chaos directories

set -e

# Configuration
MIGRATION_LOG="/tmp/migration-$(date +%Y%m%d_%H%M%S).log"
DELETION_QUEUE="/tmp/deletion-queue-$(date +%Y%m%d).txt"
HASH_CACHE="/tmp/hash-cache.txt"

echo "Migration Log: $MIGRATION_LOG"
echo "Deletion Queue: $DELETION_QUEUE"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$MIGRATION_LOG"
}

# Calculate MD5 hash for deduplication
get_hash() {
    local remote="$1"
    local path="$2"
    rclone md5sum "$remote:$path" 2>/dev/null | awk '{print $1}' || echo "no_hash"
}

# Check if file exists at destination
file_exists() {
    local remote="$1"
    local path="$2"
    rclone lsf "$remote:$path" --max-depth 1 2>/dev/null | grep -q "$(basename "$path")"
}

# Smart copy with verification
smart_copy() {
    local source_remote="$1"
    local source_path="$2"
    local dest_remote="$3"
    local dest_path="$4"

    log "PLAN: $source_remote:$source_path -> $dest_remote:$dest_path"

    # Get source hash
    local source_hash=$(get_hash "$source_remote" "$source_path")

    # Check if destination exists
    if file_exists "$dest_remote" "$dest_path"; then
        local dest_hash=$(get_hash "$dest_remote" "$dest_path")
        if [ "$source_hash" == "$dest_hash" ]; then
            log "SKIP: Already exists with matching hash"
            # Mark source for deletion since duplicate confirmed
            echo "DUPLICATE:$source_remote:$source_path|EXISTING:$dest_remote:$dest_path" >> "$DELETION_QUEUE"
            return 0
        else
            log "WARNING: Different file exists at destination"
            return 1
        fi
    fi

    # Perform copy
    log "COPYING: $source_remote:$source_path"
    if rclone copy "$source_remote:$source_path" "$dest_remote:$(dirname "$dest_path")/" --progress 2>&1 | tee -a "$MIGRATION_LOG"; then
        # Verify copy
        local copied_hash=$(get_hash "$dest_remote" "$dest_path")
        if [ "$source_hash" == "$copied_hash" ]; then
            log "VERIFIED: Copy successful, hash matches"
            # Mark source for deletion
            echo "COPIED:$source_remote:$source_path|TO:$dest_remote:$dest_path|HASH:$source_hash" >> "$DELETION_QUEUE"
            return 0
        else
            log "ERROR: Hash mismatch after copy!"
            return 1
        fi
    else
        log "ERROR: Copy failed"
        return 1
    fi
}

# Migrate entire folder
migrate_folder() {
    local source_remote="$1"
    local source_folder="$2"
    local dest_remote="$3"
    local dest_folder="$4"

    log "=== Migrating folder: $source_remote:$source_folder ==="
    log "=== Destination: $dest_remote:$dest_folder ==="

    # List all files recursively
    rclone lsf "$source_remote:$source_folder" -R --files-only 2>/dev/null | while read -r file; do
        smart_copy "$source_remote" "$source_folder/$file" "$dest_remote" "$dest_folder/$file"
    done

    # After successful migration, mark source folder for deletion
    echo "FOLDER:$source_remote:$source_folder|MIGRATED_TO:$dest_remote:$dest_folder" >> "$DELETION_QUEUE"

    log "=== Folder migration complete ==="
}

# Review deletion queue
review_deletions() {
    echo ""
    echo "=== DELETION QUEUE REVIEW ==="
    echo "These sources are marked for deletion after verified copy:"
    echo ""

    if [ -f "$DELETION_QUEUE" ]; then
        cat "$DELETION_QUEUE" | while read -r line; do
            echo "  $line"
        done

        local count=$(wc -l < "$DELETION_QUEUE")
        echo ""
        echo "Total items marked for deletion: $count"
        echo ""
        echo "To execute deletions, run: ./smart-migrate.sh --execute-deletions"
    else
        echo "No items in deletion queue"
    fi
}

# Execute deletions
execute_deletions() {
    echo "=== EXECUTING DELETIONS ==="
    echo "WARNING: This will permanently delete source files that have been verified copied"
    read -p "Are you sure? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo "Aborted"
        return 1
    fi

    if [ ! -f "$DELETION_QUEUE" ]; then
        echo "No deletion queue found"
        return 1
    fi

    cat "$DELETION_QUEUE" | while read -r line; do
        if [[ "$line" == COPIED:* ]]; then
            local source=$(echo "$line" | cut -d'|' -f1 | sed 's/COPIED://')
            local remote=$(echo "$source" | cut -d':' -f1)
            local path=$(echo "$source" | cut -d':' -f2-)

            log "DELETING: $remote:$path"
            rclone delete "$remote:$path" 2>&1 | tee -a "$MIGRATION_LOG"
        elif [[ "$line" == DUPLICATE:* ]]; then
            local source=$(echo "$line" | cut -d'|' -f1 | sed 's/DUPLICATE://')
            local remote=$(echo "$source" | cut -d':' -f1)
            local path=$(echo "$source" | cut -d':' -f2-)

            log "DELETING DUPLICATE: $remote:$path"
            rclone delete "$remote:$path" 2>&1 | tee -a "$MIGRATION_LOG"
        fi
    done

    # Archive the deletion queue
    mv "$DELETION_QUEUE" "${DELETION_QUEUE}.executed"
    log "Deletions complete. Queue archived to ${DELETION_QUEUE}.executed"
}

# Main execution
case "$1" in
    --review)
        review_deletions
        ;;
    --execute-deletions)
        execute_deletions
        ;;
    --migrate)
        if [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ] || [ -z "$5" ]; then
            echo "Usage: $0 --migrate <source_remote> <source_folder> <dest_remote> <dest_folder>"
            exit 1
        fi
        migrate_folder "$2" "$3" "$4" "$5"
        ;;
    *)
        echo "Smart Migration Tool"
        echo ""
        echo "Usage:"
        echo "  $0 --migrate <source_remote> <source_path> <dest_remote> <dest_path>"
        echo "      Migrate folder with hash verification and deletion tracking"
        echo ""
        echo "  $0 --review"
        echo "      Review items marked for deletion"
        echo ""
        echo "  $0 --execute-deletions"
        echo "      Execute deletions of verified copies"
        echo ""
        echo "Example:"
        echo "  $0 --migrate gdrive 'ARIBIA LLC' sd_aribia_llc 'FROM_MYDRIVE/ARIBIA_LLC'"
        ;;
esac
