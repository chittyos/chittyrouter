#!/usr/bin/env node

/**
 * /project command implementation
 * Simple wrapper for interactive project selection
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const menuScript = path.join(__dirname, 'interactive-project-menu.js');

// Launch interactive menu
const menu = spawn('node', [menuScript], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: '' }
});

menu.on('error', (err) => {
  console.error('Failed to launch project menu:', err);
  process.exit(1);
});

menu.on('exit', (code) => {
  process.exit(code || 0);
});