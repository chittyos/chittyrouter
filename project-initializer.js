#!/usr/bin/env node

/**
 * ChittyOS Project Initializer
 * Comprehensive project setup when switching between projects
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class ProjectInitializer {
  constructor(projectPath, projectName) {
    this.projectPath = projectPath;
    this.projectName = projectName;
    this.checks = [];
    this.todos = [];
    this.warnings = [];
    this.metadata = {};
    this.startTime = Date.now();
  }

  async initialize() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}🚀 Initializing ${this.projectName}${colors.reset}\n`);

    // Run all initialization steps
    await this.loadEnvironment();
    await this.syncProject();
    await this.analyzeProjectState();
    await this.performSystemChecks();
    await this.generateSmartTodos();
    await this.displayDashboard();

    return {
      success: true,
      projectPath: this.projectPath,
      checks: this.checks,
      todos: this.todos,
      warnings: this.warnings
    };
  }

  async loadEnvironment() {
    this.logStep('Loading Environment');

    try {
      // Check for .env files
      const envFiles = ['.env', '.env.local', '.env.op'];
      let envLoaded = false;

      for (const file of envFiles) {
        const envPath = path.join(this.projectPath, file);
        if (fs.existsSync(envPath)) {
          this.logSuccess(`Found ${file}`);
          envLoaded = true;
        }
      }

      // Check for 1Password integration
      if (fs.existsSync(path.join(this.projectPath, '.env.op'))) {
        try {
          execSync('which op', { stdio: 'pipe' });
          this.logSuccess('1Password CLI available');
          this.checks.push({ name: '1Password', status: 'active' });
        } catch {
          this.logWarning('1Password CLI not found');
        }
      }

      // Load package.json if exists
      const packagePath = path.join(this.projectPath, 'package.json');
      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        this.metadata.package = pkg;
        this.logSuccess(`Loaded ${pkg.name} v${pkg.version || '0.0.0'}`);
      }

      // Check CLAUDE.md for project context
      const claudePath = path.join(this.projectPath, 'CLAUDE.md');
      if (fs.existsSync(claudePath)) {
        this.metadata.hasClaudeInstructions = true;
        this.logSuccess('Found CLAUDE.md instructions');
      }

      if (!envLoaded) {
        this.logInfo('No environment files found');
      }

    } catch (error) {
      this.logError('Environment loading failed: ' + error.message);
    }
  }

  async syncProject() {
    this.logStep('Syncing Project');

    try {
      // Git sync
      if (fs.existsSync(path.join(this.projectPath, '.git'))) {
        const status = execSync('git status --porcelain', {
          cwd: this.projectPath,
          encoding: 'utf8'
        });

        if (status) {
          const changes = status.split('\n').filter(Boolean).length;
          this.logWarning(`${changes} uncommitted changes`);
          this.todos.push({
            priority: 'high',
            action: 'Commit or stash changes',
            reason: `${changes} files have uncommitted changes`
          });
        } else {
          this.logSuccess('Git repository clean');
        }

        // Check for remote updates
        try {
          execSync('git fetch --dry-run 2>&1', {
            cwd: this.projectPath,
            encoding: 'utf8'
          });
          this.logSuccess('Remote repository checked');
        } catch {
          this.logInfo('No remote repository');
        }
      }

      // ChittyChat session sync
      const sessionSyncPath = '/Users/nb/jumpoff/chittychat-repo/cross-session-sync/start-project-sync.mjs';
      if (fs.existsSync(sessionSyncPath)) {
        this.logSuccess('ChittyChat session sync available');
        this.checks.push({ name: 'Session Sync', status: 'ready' });
      }

      // Check for Notion sync
      if (this.metadata.package?.dependencies?.['@notionhq/client']) {
        this.logSuccess('Notion integration detected');
        this.checks.push({ name: 'Notion', status: 'configured' });
      }

    } catch (error) {
      this.logError('Sync failed: ' + error.message);
    }
  }

  async analyzeProjectState() {
    this.logStep('Analyzing Project State');

    try {
      // Analyze recent commits
      if (fs.existsSync(path.join(this.projectPath, '.git'))) {
        const recentCommits = execSync('git log --oneline -5 2>/dev/null', {
          cwd: this.projectPath,
          encoding: 'utf8'
        }).trim();

        if (recentCommits) {
          const commits = recentCommits.split('\n');
          this.metadata.recentWork = commits[0].substring(8); // Skip SHA
          this.logSuccess(`Last commit: ${this.metadata.recentWork}`);
        }
      }

      // Check for test results
      const testDirs = ['test', 'tests', '__tests__', 'spec'];
      for (const dir of testDirs) {
        if (fs.existsSync(path.join(this.projectPath, dir))) {
          this.logInfo(`Test directory found: ${dir}`);
          this.todos.push({
            priority: 'medium',
            action: 'Run test suite',
            reason: 'Verify project stability'
          });
          break;
        }
      }

      // Check for documentation
      const docs = ['README.md', 'DOCS.md', 'API.md'];
      const foundDocs = docs.filter(doc =>
        fs.existsSync(path.join(this.projectPath, doc))
      );

      if (foundDocs.length > 0) {
        this.logSuccess(`Documentation: ${foundDocs.join(', ')}`);
      }

      // Analyze file changes in last 24 hours
      const recentFiles = this.getRecentlyModifiedFiles();
      if (recentFiles.length > 0) {
        this.metadata.recentFiles = recentFiles;
        this.logInfo(`${recentFiles.length} files modified today`);
      }

    } catch (error) {
      this.logError('Analysis failed: ' + error.message);
    }
  }

  async performSystemChecks() {
    this.logStep('System Health Checks');

    const checks = [
      {
        name: 'Date & Time',
        check: () => {
          const date = new Date();
          const timeString = date.toLocaleString();
          this.logSuccess(`System time: ${timeString}`);
          return true;
        }
      },
      {
        name: 'MCP Servers',
        check: () => {
          // Check for MCP configuration
          const mcpConfig = path.join(process.env.HOME, '.config', 'claude', 'config.json');
          if (fs.existsSync(mcpConfig)) {
            const config = JSON.parse(fs.readFileSync(mcpConfig, 'utf8'));
            const serverCount = Object.keys(config.mcpServers || {}).length;
            if (serverCount > 0) {
              this.logSuccess(`${serverCount} MCP servers configured`);
              this.checks.push({ name: 'MCP', status: 'active', count: serverCount });
              return true;
            }
          }
          this.logWarning('No MCP servers configured');
          return false;
        }
      },
      {
        name: 'Security',
        check: () => {
          // Check SSH agent
          try {
            execSync('ssh-add -l', { stdio: 'pipe' });
            this.logSuccess('SSH keys loaded');
            return true;
          } catch {
            this.logWarning('SSH agent not running');
            return false;
          }
        }
      },
      {
        name: 'ChittyOS Services',
        check: () => {
          // Check for ChittyOS integration
          const chittyFiles = [
            'CLAUDE.md',
            '.chittychat',
            'chittyos.config.js'
          ];
          const found = chittyFiles.filter(file =>
            fs.existsSync(path.join(this.projectPath, file))
          );
          if (found.length > 0) {
            this.logSuccess(`ChittyOS integrated (${found.join(', ')})`);
            return true;
          }
          this.logInfo('ChittyOS integration available');
          return false;
        }
      },
      {
        name: 'Node/NPM',
        check: () => {
          if (fs.existsSync(path.join(this.projectPath, 'package.json'))) {
            try {
              const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
              this.logSuccess(`Node ${nodeVersion}`);
              return true;
            } catch {
              this.logError('Node.js not available');
              return false;
            }
          }
          return null; // Not applicable
        }
      },
      {
        name: 'Cloudflare',
        check: () => {
          if (fs.existsSync(path.join(this.projectPath, 'wrangler.toml'))) {
            this.logSuccess('Cloudflare Workers project');
            this.todos.push({
              priority: 'low',
              action: 'Check worker deployment status',
              reason: 'Cloudflare Workers configuration detected'
            });
            return true;
          }
          return null;
        }
      }
    ];

    for (const { name, check } of checks) {
      const result = await check();
      if (result !== null) {
        this.checks.push({
          name,
          status: result ? 'pass' : 'fail'
        });
      }
    }
  }

  async generateSmartTodos() {
    this.logStep('Generating Smart Actions');

    // Add context-aware todos based on project analysis
    if (this.metadata.package) {
      const scripts = this.metadata.package.scripts || {};

      if (scripts.dev) {
        this.todos.push({
          priority: 'medium',
          action: 'Start development server',
          command: 'npm run dev',
          reason: 'Development script available'
        });
      }

      if (scripts.test) {
        this.todos.push({
          priority: 'high',
          action: 'Run tests',
          command: 'npm test',
          reason: 'Ensure code quality'
        });
      }

      if (scripts.build && !fs.existsSync(path.join(this.projectPath, 'dist'))) {
        this.todos.push({
          priority: 'medium',
          action: 'Build project',
          command: 'npm run build',
          reason: 'No build output found'
        });
      }
    }

    // Add todos based on recent activity
    if (this.metadata.recentFiles && this.metadata.recentFiles.length > 5) {
      this.todos.push({
        priority: 'high',
        action: 'Review recent changes',
        reason: `${this.metadata.recentFiles.length} files modified recently`
      });
    }

    // Sort todos by priority
    this.todos.sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return priority[a.priority] - priority[b.priority];
    });
  }

  async displayDashboard() {
    console.log('\n' + '═'.repeat(60));
    console.log(`${colors.cyan}${colors.bright}📊 PROJECT DASHBOARD${colors.reset}`);
    console.log('═'.repeat(60));

    // Project Info
    console.log(`\n${colors.green}▶ Project:${colors.reset} ${this.projectName}`);
    console.log(`${colors.green}▶ Path:${colors.reset} ${this.projectPath}`);
    if (this.metadata.recentWork) {
      console.log(`${colors.green}▶ Recent:${colors.reset} ${this.metadata.recentWork}`);
    }

    // System Status
    console.log(`\n${colors.blue}🔧 System Status${colors.reset}`);
    const passedChecks = this.checks.filter(c => c.status === 'pass' || c.status === 'active');
    const failedChecks = this.checks.filter(c => c.status === 'fail');

    console.log(`  ✅ ${passedChecks.length} systems operational`);
    if (failedChecks.length > 0) {
      console.log(`  ⚠️  ${failedChecks.length} systems need attention`);
    }

    // Recommended Actions
    if (this.todos.length > 0) {
      console.log(`\n${colors.magenta}📋 Recommended Actions${colors.reset}`);
      this.todos.slice(0, 5).forEach((todo, i) => {
        const icon = todo.priority === 'high' ? '🔴' : todo.priority === 'medium' ? '🟡' : '🟢';
        console.log(`  ${i + 1}. ${icon} ${todo.action}`);
        if (todo.command) {
          console.log(`     ${colors.dim}$ ${todo.command}${colors.reset}`);
        }
        console.log(`     ${colors.dim}${todo.reason}${colors.reset}`);
      });
    }

    // Warnings
    if (this.warnings.length > 0) {
      console.log(`\n${colors.yellow}⚠️ Warnings${colors.reset}`);
      this.warnings.forEach(warning => {
        console.log(`  • ${warning}`);
      });
    }

    // Initialization time
    const elapsed = Date.now() - this.startTime;
    console.log(`\n${colors.dim}Initialized in ${elapsed}ms${colors.reset}`);
    console.log('═'.repeat(60));
  }

  getRecentlyModifiedFiles() {
    try {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const files = [];

      const checkDir = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else {
            const stats = fs.statSync(fullPath);
            if (stats.mtime.getTime() > oneDayAgo) {
              files.push(path.relative(this.projectPath, fullPath));
            }
          }
        }
      };

      checkDir(this.projectPath);
      return files.slice(0, 10); // Limit to 10 most recent

    } catch {
      return [];
    }
  }

  logStep(message) {
    console.log(`\n${colors.blue}▶ ${message}...${colors.reset}`);
  }

  logSuccess(message) {
    console.log(`  ${colors.green}✓${colors.reset} ${message}`);
  }

  logError(message) {
    console.log(`  ${colors.red}✗${colors.reset} ${message}`);
    this.warnings.push(message);
  }

  logWarning(message) {
    console.log(`  ${colors.yellow}⚠${colors.reset} ${message}`);
    this.warnings.push(message);
  }

  logInfo(message) {
    console.log(`  ${colors.dim}ℹ${colors.reset} ${message}`);
  }
}

// Export for use in menu
export { ProjectInitializer };

// Command line usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectPath = process.argv[2] || process.cwd();
  const projectName = path.basename(projectPath);

  const initializer = new ProjectInitializer(projectPath, projectName);
  initializer.initialize()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Initialization failed:', err);
      process.exit(1);
    });
}