#!/usr/bin/env node

/**
 * Claude Code Project Selector
 * Interactive project navigator with background caching
 * Addresses user feedback: interactive menu + background updates
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ProjectCache } from './project-cache.js';

const PROJECTS_DIR = '/Users/nb/.claude/projects/-';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

class ProjectSelector {
  constructor() {
    this.projectCache = new ProjectCache();
    this.projects = [];
    this.currentSelection = 0;
    this.isRunning = true;
    this.isLoading = true;
  }

  async initialize(interactive = true) {
    console.clear();
    this.showLoadingScreen();

    // Load projects using background cache
    await this.loadProjects();

    this.isLoading = false;

    if (interactive && process.stdin.isTTY) {
      this.displayMenu();
      this.setupKeyListeners();
    } else {
      // Non-interactive mode - show numbered list
      this.displayProjectList();
    }
  }

  showLoadingScreen() {
    // Silent loading for non-interactive mode
  }

  async loadProjects() {
    try {
      // Use ProjectCache for background updates - silently
      this.projects = await this.projectCache.getProjects();
    } catch (error) {
      this.projects = [];
    }
  }

  displayMenu() {
    if (this.isLoading) return;

    console.clear();
    console.log(`${colors.cyan}${colors.bright}🚀 Claude Code Project Navigator${colors.reset}`);
    console.log(`${colors.dim}Background caching enabled • Use ↑/↓ to navigate, Enter to select, q to quit${colors.reset}\n`);

    // Show cache info
    const cacheStats = this.projectCache.getCacheStats();
    console.log(`${colors.dim}📊 Cache: ${cacheStats.projectCount} projects | Last update: ${cacheStats.lastUpdate ? new Date(cacheStats.lastUpdate).toLocaleTimeString() : 'updating...'}${colors.reset}\n`);

    if (this.projects.length === 0) {
      console.log(`${colors.yellow}No projects available. Press 'r' to refresh or 'q' to quit.${colors.reset}`);
      return;
    }

    this.projects.forEach((project, index) => {
      const isSelected = index === this.currentSelection;
      const prefix = isSelected ? `${colors.cyan}▶ ` : '  ';
      const highlight = isSelected ? colors.bright : colors.reset;
      const gitIcon = project.hasGit ? '🔗' : '📄';

      console.log(`${prefix}${highlight}${project.type} ${colors.green}${project.name}${colors.reset}`);
      console.log(`${isSelected ? '  ' : '    '}${colors.dim}📂 ${project.path}${colors.reset}`);

      if (project.hasGit && project.lastCommit) {
        console.log(`${isSelected ? '  ' : '    '}${colors.dim}${gitIcon} ${project.lastCommit}${colors.reset}`);
      }

      console.log(`${isSelected ? '  ' : '    '}${colors.dim}🕒 Modified: ${project.lastModified}${colors.reset}`);

      if (project.description) {
        console.log(`${isSelected ? '  ' : '    '}${colors.dim}💡 ${project.description}${colors.reset}`);
      }

      console.log('');
    });

    console.log(`${colors.yellow}Currently in: ${process.cwd()}${colors.reset}\n`);
    console.log(`${colors.dim}Controls: ↑/↓ Navigate | Enter Select | r Refresh | c Clear Cache | q Quit${colors.reset}`);
  }

  displayProjectList() {
    if (this.projects.length === 0) return;

    this.projects.forEach((project, index) => {
      const number = (index + 1).toString().padStart(2, ' ');
      console.log(`${colors.cyan}${number}.${colors.reset} ${project.type} ${colors.green}${project.name}${colors.reset} ${colors.dim}${project.path}${colors.reset}`);
    });
  }

  setupKeyListeners() {
    if (!process.stdin.isTTY) {
      console.log('Not running in interactive terminal');
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', async (key) => {
      switch (key) {
        case '\u0003': // Ctrl+C
        case 'q':
        case 'Q':
          this.quit();
          break;

        case '\u001b[A': // Up arrow
          if (this.projects.length > 0) {
            this.currentSelection = Math.max(0, this.currentSelection - 1);
            this.displayMenu();
          }
          break;

        case '\u001b[B': // Down arrow
          if (this.projects.length > 0) {
            this.currentSelection = Math.min(this.projects.length - 1, this.currentSelection + 1);
            this.displayMenu();
          }
          break;

        case '\r': // Enter
          if (this.projects.length > 0) {
            await this.selectProject();
          }
          break;

        case 'r':
        case 'R':
          await this.refreshProjects();
          break;

        case 'c':
        case 'C':
          await this.clearCache();
          break;

        case 'h':
        case 'H':
          this.showHelp();
          break;
      }
    });
  }

  async selectProject() {
    const selectedProject = this.projects[this.currentSelection];

    console.clear();
    console.log(`${colors.green}${colors.bright}✅ Selected: ${selectedProject.name}${colors.reset}`);
    console.log(`${colors.cyan}📂 Path: ${selectedProject.path}${colors.reset}`);
    console.log(`${colors.yellow}🔄 Navigating to project...${colors.reset}\n`);

    try {
      process.chdir(selectedProject.path);
      console.log(`${colors.green}✅ Successfully navigated to ${selectedProject.name}${colors.reset}`);
      console.log(`${colors.dim}Current directory: ${process.cwd()}${colors.reset}`);

      // Show project info
      if (selectedProject.description) {
        console.log(`\n${colors.cyan}📋 Description:${colors.reset}`);
        console.log(`${selectedProject.description}`);
      }

      if (selectedProject.hasGit) {
        console.log(`\n${colors.blue}🔗 Git Status:${colors.reset}`);
        console.log(`Last commit: ${selectedProject.lastCommit}`);
      }

      // Show available commands
      console.log(`\n${colors.cyan}💡 Available Commands:${colors.reset}`);
      console.log(`${colors.dim}  npm run dev     - Start development server${colors.reset}`);
      console.log(`${colors.dim}  npm test        - Run tests${colors.reset}`);
      console.log(`${colors.dim}  code .          - Open in VS Code${colors.reset}`);

    } catch (error) {
      console.log(`${colors.red}❌ Error navigating to project: ${error.message}${colors.reset}`);
    }

    this.quit();
  }

  async refreshProjects() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}🔄 Refreshing project cache...${colors.reset}\n`);

    // Force refresh of cache
    this.projects = await this.projectCache.getProjects(true);

    console.log(`${colors.green}✅ Cache refreshed with ${this.projects.length} projects${colors.reset}`);
    setTimeout(() => this.displayMenu(), 1000);
  }

  async clearCache() {
    console.clear();
    console.log(`${colors.yellow}🗑️ Clearing project cache...${colors.reset}\n`);

    this.projectCache.clearCache();
    this.projects = [];

    console.log(`${colors.green}✅ Cache cleared. Reloading projects...${colors.reset}`);
    setTimeout(async () => {
      await this.loadProjects();
      this.displayMenu();
    }, 1000);
  }

  showHelp() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}📖 Project Navigator Help${colors.reset}\n`);
    console.log(`${colors.green}Navigation:${colors.reset}`);
    console.log(`  ↑/↓     Navigate up/down through projects`);
    console.log(`  Enter   Select and navigate to project`);
    console.log(`  r       Refresh project cache`);
    console.log(`  c       Clear cache and reload`);
    console.log(`  h       Show this help`);
    console.log(`  q       Quit navigator\n`);

    console.log(`${colors.blue}Background Caching:${colors.reset}`);
    console.log(`  • Projects are cached for 5 minutes for faster loading`);
    console.log(`  • Cache updates automatically in background`);
    console.log(`  • Use 'r' to force immediate refresh`);
    console.log(`  • Use 'c' to clear cache and start fresh\n`);

    console.log(`${colors.magenta}Project Types:${colors.reset}`);
    console.log(`  🤖 AI Gateway     - ChittyRouter`);
    console.log(`  💬 Communication  - ChittyChat`);
    console.log(`  🆔 Identity       - ChittyID`);
    console.log(`  ⚖️ Legal Cases    - ChittyCases`);
    console.log(`  📋 Registry       - Service discovery`);
    console.log(`  🛠️ Utilities      - Development tools\n`);

    console.log(`${colors.dim}Press any key to return to main menu...${colors.reset}`);

    process.stdin.once('data', () => {
      this.displayMenu();
    });
  }

  quit() {
    console.log(`\n${colors.cyan}👋 Project Navigator closed!${colors.reset}`);
    console.log(`${colors.dim}Background cache maintained for next use.${colors.reset}`);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.exit(0);
  }
}

// Command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const interactive = !process.argv.includes('--list') && !process.argv.includes('--test') && process.stdin.isTTY;
  const selector = new ProjectSelector();

  // For command usage, assume list mode unless explicitly interactive
  const isCommandMode = process.argv.some(arg => arg.includes('/project') || arg.includes('project-selector'));
  const mode = isCommandMode ? false : interactive;

  selector.initialize(mode).catch(console.error);
}

export { ProjectSelector };