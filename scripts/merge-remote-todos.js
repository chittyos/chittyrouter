#!/usr/bin/env node

/**
 * Merge Remote Todos Script
 * Imports todos from ChittyOS Hub into Claude Code local storage
 * Creates import files in ~/.claude/todos/ for consolidation
 */

const fs = require("fs");
const path = require("path");

// Configuration
const TODOS_DIR = path.join(process.env.HOME, ".claude", "todos");
const LOCAL_PLATFORM = "claude_code";

/**
 * Ensure todos directory exists
 */
function ensureTodosDir() {
  if (!fs.existsSync(TODOS_DIR)) {
    fs.mkdirSync(TODOS_DIR, { recursive: true });
    console.log(`✅ Created todos directory: ${TODOS_DIR}`);
  }
}

/**
 * Read remote todos from file or stdin
 * @param {string} inputFile - Path to input file (optional)
 * @returns {Array} Array of remote todos
 */
function readRemoteTodos(inputFile) {
  try {
    let content;

    if (inputFile && inputFile !== "-") {
      // Read from file
      if (!fs.existsSync(inputFile)) {
        console.error(`❌ Input file not found: ${inputFile}`);
        process.exit(1);
      }
      content = fs.readFileSync(inputFile, "utf8");
    } else {
      // Read from stdin
      console.log("📥 Reading remote todos from stdin...");
      content = fs.readFileSync(0, "utf8"); // 0 = stdin
    }

    const data = JSON.parse(content);

    // Handle both array and object with todos property
    const todos = Array.isArray(data) ? data : data.todos || [];

    if (!Array.isArray(todos)) {
      throw new Error("Expected array of todos or object with todos property");
    }

    return todos;
  } catch (error) {
    console.error(`❌ Failed to parse input: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Filter and transform todos for import
 * @param {Array} remoteTodos - Array of remote todos
 * @returns {Object} Grouped todos by platform
 */
function processTodos(remoteTodos) {
  const grouped = {};
  let skipped = 0;

  for (const todo of remoteTodos) {
    const platform = todo.platform || "unknown";

    // Skip local platform todos
    if (platform === LOCAL_PLATFORM) {
      skipped++;
      continue;
    }

    // Ensure required fields
    if (!todo.id || !todo.content || !todo.status || !todo.activeForm) {
      console.warn(`⚠️  Skipping invalid todo: ${JSON.stringify(todo)}`);
      continue;
    }

    // Group by platform
    if (!grouped[platform]) {
      grouped[platform] = [];
    }

    // Transform to Claude Code format
    const transformed = {
      id: todo.id,
      content: todo.content,
      status: todo.status,
      activeForm: todo.activeForm || todo.active_form,
      platform: platform,
      userId: todo.userId || todo.user_id,
      sessionId: todo.sessionId || todo.session_id,
      projectId: todo.projectId || todo.project_id,
      vectorClock: todo.vectorClock || todo.vector_clock || {},
      createdAt: todo.createdAt || todo.created_at,
      updatedAt: todo.updatedAt || todo.updated_at,
      metadata: todo.metadata || {},
    };

    grouped[platform].push(transformed);
  }

  return { grouped, skipped };
}

/**
 * Write import files for each platform
 * @param {Object} groupedTodos - Todos grouped by platform
 * @returns {Array} Array of created file paths
 */
function writeImportFiles(groupedTodos) {
  const timestamp = Date.now();
  const createdFiles = [];

  for (const [platform, todos] of Object.entries(groupedTodos)) {
    // Create import filename: {platform}-import-{timestamp}.json
    const filename = `${platform}-import-${timestamp}.json`;
    const filepath = path.join(TODOS_DIR, filename);

    try {
      // Write import file
      fs.writeFileSync(filepath, JSON.stringify(todos, null, 2), "utf8");
      createdFiles.push(filepath);
      console.log(
        `✅ Created import file: ${filename} (${todos.length} todos)`,
      );
    } catch (error) {
      console.error(`❌ Failed to write ${filename}: ${error.message}`);
    }
  }

  return createdFiles;
}

/**
 * Generate sync summary
 * @param {Object} stats - Sync statistics
 */
function printSummary(stats) {
  console.log(
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log("📊 Remote Todo Import Summary");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log(`  Total Remote Todos: ${stats.total}`);
  console.log(`  Skipped (local):    ${stats.skipped}`);
  console.log(`  Imported:           ${stats.imported}`);
  console.log(`  Platforms:          ${stats.platforms}`);
  console.log(`  Files Created:      ${stats.filesCreated}`);
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  if (stats.filesCreated > 0) {
    console.log(
      "\n✅ Import complete! Run consolidation to merge these todos.",
    );
    console.log(
      "   Next: npm run consolidate-todos (or wait for auto-consolidation)",
    );
  } else {
    console.log(
      "\n⚠️  No todos imported. All todos may be from local platform.",
    );
  }
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0] || "-"; // Default to stdin

  console.log("🔄 ChittyOS Todo Hub - Remote Todo Merger");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
  );

  // Ensure directory exists
  ensureTodosDir();

  // Read remote todos
  const remoteTodos = readRemoteTodos(inputFile);
  console.log(`📥 Received ${remoteTodos.length} remote todos\n`);

  if (remoteTodos.length === 0) {
    console.log("⚠️  No remote todos to import.");
    process.exit(0);
  }

  // Process and group todos
  const { grouped, skipped } = processTodos(remoteTodos);
  const imported = remoteTodos.length - skipped;
  const platforms = Object.keys(grouped).length;

  // Write import files
  const createdFiles = writeImportFiles(grouped);

  // Print summary
  printSummary({
    total: remoteTodos.length,
    skipped,
    imported,
    platforms,
    filesCreated: createdFiles.length,
  });

  // Exit with success
  process.exit(0);
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  ensureTodosDir,
  readRemoteTodos,
  processTodos,
  writeImportFiles,
};
