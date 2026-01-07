#!/usr/bin/env node

/**
 * Interactive Claude Code Project Navigator
 * Provides an interactive menu for selecting and navigating between projects
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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

class ProjectNavigator {
  constructor() {
    this.projects = [];
    this.currentSelection = 0;
    this.isRunning = true;
  }

  async initialize() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}🚀 Claude Code Project Navigator${colors.reset}\n`);

    await this.scanProjects();
    this.displayMenu();
    this.setupKeyListeners();
  }

  async scanProjects() {
    try {
      const items = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith('.')) {
          const projectPath = path.join(PROJECTS_DIR, item.name);
          const project = await this.analyzeProject(projectPath, item.name);
          this.projects.push(project);
        }
      }

      // Sort by last modified (most recent first)
      this.projects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    } catch (error) {
      console.error(`${colors.red}Error scanning projects: ${error.message}${colors.reset}`);
    }
  }

  async analyzeProject(projectPath, name) {
    const project = {
      name,
      path: projectPath,
      hasGit: false,
      lastCommit: null,
      lastModified: null,
      description: '',
      type: this.getProjectType(name)
    };

    try {
      // Check Git status
      const gitPath = path.join(projectPath, '.git');
      if (fs.existsSync(gitPath)) {
        project.hasGit = true;
        try {
          const lastCommit = execSync('git log -1 --format="%s" 2>/dev/null', {
            cwd: projectPath,
            encoding: 'utf8'
          }).trim();
          project.lastCommit = lastCommit.substring(0, 50) + (lastCommit.length > 50 ? '...' : '');
        } catch (e) {
          project.lastCommit = 'No commits';
        }
      }

      // Get modification time
      const stats = fs.statSync(projectPath);
      project.lastModified = stats.mtime.toISOString().split('T')[0];

      // Try to get description from README or CLAUDE.md
      const readmePath = path.join(projectPath, 'README.md');
      const claudePath = path.join(projectPath, 'CLAUDE.md');

      if (fs.existsSync(claudePath)) {
        const content = fs.readFileSync(claudePath, 'utf8');
        const match = content.match(/##\s*Project Overview\s*\n\n(.*?)(?:\n\n|\n#)/s);
        if (match) {
          project.description = match[1].trim().substring(0, 100) + '...';
        }
      } else if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf8');
        const lines = content.split('\n');
        const descLine = lines.find(line => line.length > 20 && !line.startsWith('#'));
        if (descLine) {
          project.description = descLine.trim().substring(0, 100) + '...';
        }
      }

    } catch (error) {
      // Silent fail for inaccessible projects
    }

    return project;
  }

  getProjectType(name) {
    const types = {
      'chittyrouter': '🤖 AI Gateway',
      'chittychat': '💬 Communication',
      'chittyid': '🆔 Identity',
      'chittyregistry': '📋 Registry',
      'chittyschema': '📄 Schema',
      'chittydashboard': '📊 Dashboard',
      'chittycases': '⚖️ Legal Cases',
      'chittyauth': '🔐 Authentication',
      'chittyos': '🏢 Core Platform',
      'connectors': '🔌 Integrations',
      'tools': '🛠️ Utilities'
    };
    return types[name] || '📁 Project';
  }

  displayMenu() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}🚀 Claude Code Project Navigator${colors.reset}`);
    console.log(`${colors.dim}Use ↑/↓ to navigate, Enter to select, q to quit${colors.reset}\n`);

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
    console.log(`${colors.dim}Controls: ↑/↓ Navigate | Enter Select | q Quit${colors.reset}`);
  }

  setupKeyListeners() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key) => {
      switch (key) {
        case '\u0003': // Ctrl+C
        case 'q':
        case 'Q':
          this.quit();
          break;

        case '\u001b[A': // Up arrow
          this.currentSelection = Math.max(0, this.currentSelection - 1);
          this.displayMenu();
          break;

        case '\u001b[B': // Down arrow
          this.currentSelection = Math.min(this.projects.length - 1, this.currentSelection + 1);
          this.displayMenu();
          break;

        case '\r': // Enter
          this.selectProject();
          break;

        case 'h':
        case 'H':
          this.showHelp();
          break;
      }
    });
  }

  selectProject() {
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

    } catch (error) {
      console.log(`${colors.red}❌ Error navigating to project: ${error.message}${colors.reset}`);
    }

    this.quit();
  }

  showHelp() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}📖 Project Navigator Help${colors.reset}\n`);
    console.log(`${colors.green}Navigation:${colors.reset}`);
    console.log(`  ↑/↓     Navigate up/down through projects`);
    console.log(`  Enter   Select and navigate to project`);
    console.log(`  h       Show this help`);
    console.log(`  q       Quit navigator\n`);

    console.log(`${colors.blue}Project Types:${colors.reset}`);
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
    console.log(`\n${colors.cyan}👋 Thanks for using Claude Code Project Navigator!${colors.reset}`);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.exit(0);
  }
}

// Run the navigator
const navigator = new ProjectNavigator();
navigator.initialize().catch(console.error);