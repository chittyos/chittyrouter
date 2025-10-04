#!/usr/bin/env node

/**
 * Interactive Project Menu with Arrow Key Navigation
 * Uses cached data - no repeated searches
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { ProjectCache } from './project-cache.js';

const CACHE_FILE = '/tmp/claude-projects-menu.json';

// ANSI escape codes
const ESC = '\x1b';
const CSI = `${ESC}[`;
const colors = {
  reset: `${CSI}0m`,
  bright: `${CSI}1m`,
  dim: `${CSI}2m`,
  reverse: `${CSI}7m`,
  cyan: `${CSI}36m`,
  green: `${CSI}32m`,
  yellow: `${CSI}33m`
};

class InteractiveMenu {
  constructor() {
    this.projectCache = new ProjectCache();
    this.projects = [];
    this.selectedIndex = 0;
    this.menuHeight = process.stdout.rows - 4; // Leave space for header/footer
  }

  async start() {
    // Load projects from cache ONCE
    await this.loadProjects();

    if (this.projects.length === 0) {
      console.log('No projects found');
      process.exit(0);
    }

    // Setup terminal for interactive mode
    this.setupTerminal();

    // Draw initial menu
    this.render();

    // Setup keyboard input
    this.setupKeyboard();
  }

  async loadProjects() {
    // Check if we have a recent menu cache
    if (fs.existsSync(CACHE_FILE)) {
      try {
        const stats = fs.statSync(CACHE_FILE);
        const age = Date.now() - stats.mtime.getTime();

        // Use menu cache if less than 5 minutes old
        if (age < 5 * 60 * 1000) {
          const cached = fs.readFileSync(CACHE_FILE, 'utf8');
          this.projects = JSON.parse(cached);
          return;
        }
      } catch {}
    }

    // Load from project cache (which itself uses background updates)
    this.projects = await this.projectCache.getProjects();

    // Save to menu cache for next time
    fs.writeFileSync(CACHE_FILE, JSON.stringify(this.projects, null, 2));
  }

  setupTerminal() {
    // Clear screen and hide cursor
    process.stdout.write(`${CSI}2J${CSI}H${CSI}?25l`);

    // Raw mode for keyboard input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    // Restore on exit
    process.on('exit', () => {
      process.stdout.write(`${CSI}?25h${CSI}0m`); // Show cursor, reset colors
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    });
  }

  render() {
    // Clear screen and move to top
    process.stdout.write(`${CSI}H`);

    // Header
    console.log(`${colors.cyan}${colors.bright}📁 Projects (${this.projects.length} total)${colors.reset}`);
    console.log(`${colors.dim}↑/↓ Navigate • Enter Select • q Quit${colors.reset}\n`);

    // Calculate visible range
    const startIdx = Math.max(0, this.selectedIndex - Math.floor(this.menuHeight / 2));
    const endIdx = Math.min(this.projects.length, startIdx + this.menuHeight);

    // Render visible projects
    for (let i = startIdx; i < endIdx; i++) {
      const project = this.projects[i];
      const isSelected = i === this.selectedIndex;

      if (isSelected) {
        // Highlighted selection
        process.stdout.write(`${colors.reverse}`);
        console.log(`▶ ${project.name.padEnd(20)} ${project.path}${colors.reset}`);
      } else {
        // Normal item
        const icon = this.getProjectIcon(project.name);
        console.log(`  ${icon} ${colors.green}${project.name.padEnd(18)}${colors.reset} ${colors.dim}${project.path}${colors.reset}`);
      }
    }

    // Footer with current selection info
    const selected = this.projects[this.selectedIndex];
    process.stdout.write(`${CSI}${process.stdout.rows - 1};1H`); // Move to bottom
    console.log(`${colors.yellow}[${this.selectedIndex + 1}/${this.projects.length}] ${selected.name}${colors.reset}`);
  }

  getProjectIcon(name) {
    const icons = {
      'chittyrouter': '🤖',
      'chittychat': '💬',
      'chittyid': '🆔',
      'chittyregistry': '📋',
      'chittyschema': '📄',
      'chittydashboard': '📊',
      'chittycases': '⚖️',
      'chittyauth': '🔐',
      'chittyos': '🏢',
      'connectors': '🔌',
      'tools': '🛠️'
    };
    return icons[name] || '📁';
  }

  setupKeyboard() {
    process.stdin.on('data', (key) => {
      switch (key) {
        case '\u001b[A': // Up arrow
        case 'k': // vim style
          if (this.selectedIndex > 0) {
            this.selectedIndex--;
            this.render();
          }
          break;

        case '\u001b[B': // Down arrow
        case 'j': // vim style
          if (this.selectedIndex < this.projects.length - 1) {
            this.selectedIndex++;
            this.render();
          }
          break;

        case '\r': // Enter
        case '\n':
          this.selectProject();
          break;

        case 'q':
        case '\u0003': // Ctrl+C
        case '\u001b': // Escape
          this.quit();
          break;

        case 'g': // Go to top
          this.selectedIndex = 0;
          this.render();
          break;

        case 'G': // Go to bottom
          this.selectedIndex = this.projects.length - 1;
          this.render();
          break;

        // Number keys for quick jump
        default:
          const num = parseInt(key);
          if (!isNaN(num) && num >= 1 && num <= 9) {
            const idx = num - 1;
            if (idx < this.projects.length) {
              this.selectedIndex = idx;
              this.render();
            }
          }
      }
    });
  }

  async selectProject() {
    const project = this.projects[this.selectedIndex];

    // Clear screen and show selection
    process.stdout.write(`${CSI}2J${CSI}H`);
    console.log(`${colors.green}✓ Selected: ${project.name}${colors.reset}`);
    console.log(`${colors.dim}${project.path}${colors.reset}\n`);

    // Change to project directory
    try {
      process.chdir(project.path);
      console.log(`${colors.cyan}Initializing project environment...${colors.reset}\n`);

      // Run comprehensive project initialization
      const { ProjectInitializer } = await import('./project-initializer.js');
      const { ProjectIntelligence } = await import('./project-intelligence.js');

      // Initialize project
      const initializer = new ProjectInitializer(project.path, project.name);
      await initializer.initialize();

      // Run deep intelligence analysis
      console.log(`\n${colors.cyan}Running project intelligence analysis...${colors.reset}`);
      const intelligence = new ProjectIntelligence(project.path, project.name);
      const analysis = await intelligence.analyze();

      // Display strategic recommendations
      if (analysis.metrics.recommendations) {
        const recs = analysis.metrics.recommendations;

        if (recs.immediate.length > 0) {
          console.log(`\n${colors.red}${colors.bright}🚨 IMMEDIATE ACTIONS REQUIRED${colors.reset}`);
          recs.immediate.forEach((rec, i) => {
            console.log(`  ${i + 1}. ${rec.action}`);
            console.log(`     ${colors.dim}${rec.reason}${colors.reset}`);
            if (rec.impact) {
              console.log(`     ${colors.yellow}Impact: ${rec.impact}${colors.reset}`);
            }
          });
        }

        if (recs.shortTerm.length > 0) {
          console.log(`\n${colors.yellow}📋 SHORT-TERM PRIORITIES${colors.reset}`);
          recs.shortTerm.slice(0, 3).forEach((rec, i) => {
            console.log(`  ${i + 1}. ${rec.action}`);
            console.log(`     ${colors.dim}${rec.reason}${colors.reset}`);
          });
        }
      }

      // Display key metrics
      if (analysis.metrics.velocity) {
        const v = analysis.metrics.velocity;
        console.log(`\n${colors.cyan}📈 Development Metrics${colors.reset}`);
        console.log(`  Momentum: ${v.momentum}`);
        console.log(`  Activity: ${v.commitsPerWeek} commits this week`);
        console.log(`  Last: ${v.lastActivity || 'unknown'}`);
      }

      console.log(`\n${colors.green}✅ Project environment ready!${colors.reset}`);
      console.log(`${colors.dim}Type 'npm run dev' or check recommendations above${colors.reset}`);

    } catch (error) {
      console.log(`\n${colors.red}Initialization error: ${error.message}${colors.reset}`);
    }

    // Exit
    process.exit(0);
  }

  quit() {
    process.stdout.write(`${CSI}2J${CSI}H`);
    console.log('👋 Bye!');
    process.exit(0);
  }
}

// Run the menu
const menu = new InteractiveMenu();
menu.start().catch(console.error);