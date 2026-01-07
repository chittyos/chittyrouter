#!/usr/bin/env node

/**
 * Project Cache Manager
 * Maintains a cached list of projects and updates in background
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PROJECTS_DIR = '/Users/nb/.claude/projects/-';
const CACHE_FILE = '/tmp/claude-projects-cache.json';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

export class ProjectCache {
  constructor() {
    this.cache = null;
    this.lastUpdate = null;
    this.isUpdating = false;
  }

  async getProjects(forceRefresh = false) {
    // Try to load from cache first
    if (!forceRefresh && this.isValidCache()) {
      return this.loadFromCache();
    }

    // If cache is invalid, start background update
    if (!this.isUpdating) {
      this.updateCacheInBackground();
    }

    // Return cached data while updating, or scan fresh if no cache
    return this.cache || await this.scanProjectsSync();
  }

  isValidCache() {
    if (!fs.existsSync(CACHE_FILE)) return false;

    try {
      const stats = fs.statSync(CACHE_FILE);
      const age = Date.now() - stats.mtime.getTime();
      return age < CACHE_EXPIRY;
    } catch {
      return false;
    }
  }

  loadFromCache() {
    try {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      this.cache = JSON.parse(data);
      this.lastUpdate = new Date();
      return this.cache;
    } catch {
      return null;
    }
  }

  async updateCacheInBackground() {
    if (this.isUpdating) return;

    this.isUpdating = true;
    console.log('🔄 Updating project cache in background...');

    try {
      const projects = await this.scanProjectsSync();
      this.cache = projects;

      // Save to disk cache
      fs.writeFileSync(CACHE_FILE, JSON.stringify(projects, null, 2));
      this.lastUpdate = new Date();

      console.log(`✅ Project cache updated (${projects.length} projects)`);
    } catch (error) {
      console.error('❌ Cache update failed:', error.message);
    } finally {
      this.isUpdating = false;
    }
  }

  async scanProjectsSync() {
    const projects = [];

    try {
      const items = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith('.')) {
          const projectPath = path.join(PROJECTS_DIR, item.name);
          const project = await this.analyzeProject(projectPath, item.name);
          projects.push(project);
        }
      }

      // Sort by last modified (most recent first)
      projects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    } catch (error) {
      console.error('Error scanning projects:', error.message);
    }

    return projects;
  }

  async analyzeProject(projectPath, name) {
    const project = {
      name,
      path: projectPath,
      hasGit: false,
      lastCommit: null,
      lastModified: null,
      description: '',
      type: this.getProjectType(name),
      size: 0,
      fileCount: 0
    };

    try {
      // Quick stat check
      const stats = fs.statSync(projectPath);
      project.lastModified = stats.mtime.toISOString().split('T')[0];

      // Count files (quick estimate)
      try {
        const files = fs.readdirSync(projectPath);
        project.fileCount = files.length;
      } catch { }

      // Check Git status (fast)
      const gitPath = path.join(projectPath, '.git');
      if (fs.existsSync(gitPath)) {
        project.hasGit = true;
        try {
          const lastCommit = execSync('git log -1 --format="%s" 2>/dev/null', {
            cwd: projectPath,
            encoding: 'utf8',
            timeout: 2000 // 2 second timeout
          }).trim();
          project.lastCommit = lastCommit.substring(0, 50) + (lastCommit.length > 50 ? '...' : '');
        } catch {
          project.lastCommit = 'Git error';
        }
      }

      // Get description (cached)
      project.description = this.getProjectDescription(projectPath);

    } catch (error) {
      // Silent fail for inaccessible projects
      project.description = 'Access denied';
    }

    return project;
  }

  getProjectDescription(projectPath) {
    try {
      // Quick description lookup
      const claudePath = path.join(projectPath, 'CLAUDE.md');
      const readmePath = path.join(projectPath, 'README.md');

      if (fs.existsSync(claudePath)) {
        const content = fs.readFileSync(claudePath, 'utf8');
        const match = content.match(/##\s*Project Overview\s*\n\n(.*?)(?:\n\n|\n#)/s);
        if (match) {
          return match[1].trim().substring(0, 100) + '...';
        }
      }

      if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf8');
        const lines = content.split('\n');
        const descLine = lines.find(line => line.length > 20 && !line.startsWith('#'));
        if (descLine) {
          return descLine.trim().substring(0, 100) + '...';
        }
      }
    } catch { }

    return this.getDefaultDescription(path.basename(projectPath));
  }

  getDefaultDescription(name) {
    const descriptions = {
      'chittyrouter': 'AI Gateway and Orchestration for ChittyOS ecosystem',
      'chittychat': 'Project Management and Communication platform',
      'chittyid': 'Identity and JWT Service for authentication',
      'chittyregistry': 'Service Registry and Discovery system',
      'chittyschema': 'Schema Registry and Validation service',
      'chittydashboard': 'Analytics and monitoring dashboard',
      'chittycases': 'Legal case management and court filing system',
      'chittyauth': 'Authentication and Authorization service',
      'chittyos': 'Core ChittyOS platform and framework',
      'connectors': 'Integration connectors and adapters',
      'tools': 'Development tools and utilities'
    };
    return descriptions[name] || 'ChittyOS project';
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

  getCacheStats() {
    return {
      cached: !!this.cache,
      projectCount: this.cache?.length || 0,
      lastUpdate: this.lastUpdate,
      isUpdating: this.isUpdating,
      cacheFile: CACHE_FILE,
      cacheExists: fs.existsSync(CACHE_FILE)
    };
  }

  clearCache() {
    this.cache = null;
    this.lastUpdate = null;
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  }
}

// Singleton instance
export const projectCache = new ProjectCache();