#!/usr/bin/env node

/**
 * Advanced Project Intelligence System
 * PM & Developer insights for ChittyOS projects
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

class ProjectIntelligence {
  constructor(projectPath, projectName) {
    this.projectPath = projectPath;
    this.projectName = projectName;
    this.insights = [];
    this.metrics = {};
    this.risks = [];
    this.opportunities = [];
    this.blockers = [];
  }

  async analyze() {
    await this.analyzeProjectHealth();
    await this.analyzeDevelopmentVelocity();
    await this.analyzeCodeQuality();
    await this.analyzeDependencies();
    await this.analyzeArchitecture();
    await this.identifyRisksAndOpportunities();
    await this.generateStrategicRecommendations();

    return {
      insights: this.insights,
      metrics: this.metrics,
      risks: this.risks,
      opportunities: this.opportunities,
      blockers: this.blockers
    };
  }

  async analyzeProjectHealth() {
    const health = {
      score: 100,
      factors: []
    };

    // Check CI/CD pipeline
    if (fs.existsSync(path.join(this.projectPath, '.github/workflows'))) {
      health.factors.push({ name: 'CI/CD', score: 10, status: 'configured' });
    } else {
      health.score -= 15;
      this.risks.push({
        type: 'infrastructure',
        severity: 'medium',
        issue: 'No CI/CD pipeline detected',
        action: 'Set up GitHub Actions or similar CI/CD'
      });
    }

    // Check test coverage
    const coverageFile = path.join(this.projectPath, 'coverage/coverage-summary.json');
    if (fs.existsSync(coverageFile)) {
      try {
        const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
        const lines = coverage.total?.lines?.pct || 0;
        health.factors.push({ name: 'Test Coverage', score: lines, status: `${lines}%` });

        if (lines < 80) {
          this.risks.push({
            type: 'quality',
            severity: lines < 60 ? 'high' : 'medium',
            issue: `Test coverage at ${lines}%`,
            action: 'Increase test coverage to at least 80%'
          });
        }
      } catch {}
    } else {
      health.score -= 20;
      this.blockers.push({
        type: 'quality',
        issue: 'No test coverage data',
        action: 'Run tests with coverage: npm test -- --coverage',
        impact: 'Cannot assess code quality'
      });
    }

    // Check documentation freshness
    try {
      const readmeStat = fs.statSync(path.join(this.projectPath, 'README.md'));
      const daysSinceUpdate = (Date.now() - readmeStat.mtime.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate > 30) {
        health.score -= 10;
        this.risks.push({
          type: 'documentation',
          severity: 'low',
          issue: `README not updated in ${Math.floor(daysSinceUpdate)} days`,
          action: 'Review and update project documentation'
        });
      }
    } catch {}

    // Check for security issues
    if (this.hasPackageJson()) {
      try {
        execSync('npm audit --json', { cwd: this.projectPath, stdio: 'pipe' });
      } catch (auditOutput) {
        try {
          const audit = JSON.parse(auditOutput.stdout);
          const vulnerabilities = audit.metadata?.vulnerabilities;
          if (vulnerabilities) {
            const total = Object.values(vulnerabilities).reduce((a, b) => a + b, 0);
            if (total > 0) {
              health.score -= Math.min(30, total * 5);
              this.blockers.push({
                type: 'security',
                issue: `${total} security vulnerabilities detected`,
                action: 'Run: npm audit fix',
                impact: 'Security risk in production'
              });
            }
          }
        } catch {}
      }
    }

    this.metrics.health = health;
  }

  async analyzeDevelopmentVelocity() {
    const velocity = {
      commitsPerWeek: 0,
      activeDays: 0,
      momentum: 'unknown',
      lastActivity: null
    };

    if (this.hasGit()) {
      try {
        // Get commit frequency
        const commits = execSync('git log --since="1 week ago" --oneline', {
          cwd: this.projectPath,
          encoding: 'utf8'
        }).trim().split('\n').filter(Boolean);

        velocity.commitsPerWeek = commits.length;

        // Get active development days
        const activeDays = execSync('git log --since="1 week ago" --format="%cd" --date=short', {
          cwd: this.projectPath,
          encoding: 'utf8'
        }).trim().split('\n').filter(Boolean);

        velocity.activeDays = new Set(activeDays).size;

        // Determine momentum
        if (velocity.commitsPerWeek > 20) {
          velocity.momentum = 'high';
          this.insights.push({
            type: 'velocity',
            message: 'High development activity - ensure quality isn\'t sacrificed',
            recommendation: 'Consider more frequent code reviews'
          });
        } else if (velocity.commitsPerWeek > 5) {
          velocity.momentum = 'steady';
        } else if (velocity.commitsPerWeek > 0) {
          velocity.momentum = 'low';
          this.opportunities.push({
            type: 'productivity',
            opportunity: 'Increase development velocity',
            action: 'Break down large tasks into smaller commits'
          });
        } else {
          velocity.momentum = 'stalled';
          this.risks.push({
            type: 'velocity',
            severity: 'high',
            issue: 'No commits in the last week',
            action: 'Review project priorities and unblock development'
          });
        }

        // Get last activity
        const lastCommit = execSync('git log -1 --format="%cr"', {
          cwd: this.projectPath,
          encoding: 'utf8'
        }).trim();
        velocity.lastActivity = lastCommit;

      } catch {}
    }

    this.metrics.velocity = velocity;
  }

  async analyzeCodeQuality() {
    const quality = {
      lintIssues: 0,
      complexity: 'unknown',
      techDebt: []
    };

    // Check for linting setup
    const eslintConfig = ['.eslintrc.js', '.eslintrc.json', '.eslintrc'].find(file =>
      fs.existsSync(path.join(this.projectPath, file))
    );

    if (eslintConfig) {
      quality.hasLinter = true;

      // Try to run eslint
      try {
        execSync('npx eslint . --format=json', {
          cwd: this.projectPath,
          stdio: 'pipe'
        });
      } catch (lintOutput) {
        try {
          const results = JSON.parse(lintOutput.stdout);
          const issues = results.reduce((sum, file) =>
            sum + file.errorCount + file.warningCount, 0
          );
          quality.lintIssues = issues;

          if (issues > 50) {
            this.blockers.push({
              type: 'quality',
              issue: `${issues} linting issues detected`,
              action: 'Run: npm run lint --fix',
              impact: 'Code quality degradation'
            });
          }
        } catch {}
      }
    } else {
      quality.techDebt.push('No linter configured');
      this.opportunities.push({
        type: 'quality',
        opportunity: 'Improve code consistency',
        action: 'Set up ESLint: npx eslint --init'
      });
    }

    // Check for TypeScript
    if (fs.existsSync(path.join(this.projectPath, 'tsconfig.json'))) {
      quality.hasTypeScript = true;
      this.insights.push({
        type: 'quality',
        message: 'TypeScript enabled for type safety',
        recommendation: 'Ensure strict mode is enabled'
      });
    }

    // Analyze file sizes and complexity
    const largeFiles = this.findLargeFiles();
    if (largeFiles.length > 0) {
      quality.techDebt.push(`${largeFiles.length} files over 500 lines`);
      this.risks.push({
        type: 'maintainability',
        severity: 'medium',
        issue: 'Large files detected',
        action: 'Consider refactoring: ' + largeFiles[0]
      });
    }

    this.metrics.quality = quality;
  }

  async analyzeDependencies() {
    const deps = {
      total: 0,
      outdated: 0,
      security: 0,
      unused: []
    };

    if (this.hasPackageJson()) {
      const pkg = JSON.parse(fs.readFileSync(path.join(this.projectPath, 'package.json'), 'utf8'));

      deps.total = Object.keys(pkg.dependencies || {}).length +
                   Object.keys(pkg.devDependencies || {}).length;

      // Check for outdated packages
      try {
        const outdated = execSync('npm outdated --json', {
          cwd: this.projectPath,
          encoding: 'utf8',
          stdio: 'pipe'
        });

        if (outdated) {
          const packages = JSON.parse(outdated);
          deps.outdated = Object.keys(packages).length;

          if (deps.outdated > 10) {
            this.risks.push({
              type: 'dependencies',
              severity: 'medium',
              issue: `${deps.outdated} outdated dependencies`,
              action: 'Update dependencies: npm update'
            });
          }
        }
      } catch {}

      // Check for common issues
      if (!pkg.engines) {
        this.opportunities.push({
          type: 'compatibility',
          opportunity: 'Define Node version requirements',
          action: 'Add "engines" field to package.json'
        });
      }

      if (!pkg.scripts?.start && !pkg.scripts?.dev) {
        this.blockers.push({
          type: 'developer-experience',
          issue: 'No start script defined',
          action: 'Add start or dev script to package.json',
          impact: 'Unclear how to run the project'
        });
      }
    }

    this.metrics.dependencies = deps;
  }

  async analyzeArchitecture() {
    const architecture = {
      pattern: 'unknown',
      structure: [],
      recommendations: []
    };

    // Detect project structure
    const dirs = ['src', 'lib', 'app', 'components', 'services', 'utils', 'api'];
    const found = dirs.filter(dir =>
      fs.existsSync(path.join(this.projectPath, dir))
    );

    architecture.structure = found;

    // Detect architecture pattern
    if (found.includes('components') && found.includes('services')) {
      architecture.pattern = 'component-based';
    } else if (found.includes('app') && found.includes('api')) {
      architecture.pattern = 'full-stack';
    } else if (found.includes('src')) {
      architecture.pattern = 'standard';
    }

    // Check for best practices
    if (!found.includes('tests') && !found.includes('test') && !found.includes('__tests__')) {
      architecture.recommendations.push('Add test directory structure');
      this.blockers.push({
        type: 'testing',
        issue: 'No test directory found',
        action: 'Create test structure: mkdir -p tests/unit tests/integration',
        impact: 'Cannot maintain code quality'
      });
    }

    if (!fs.existsSync(path.join(this.projectPath, '.gitignore'))) {
      this.blockers.push({
        type: 'security',
        issue: 'No .gitignore file',
        action: 'Create .gitignore to prevent committing sensitive files',
        impact: 'Risk of exposing sensitive data'
      });
    }

    this.metrics.architecture = architecture;
  }

  async identifyRisksAndOpportunities() {
    // Performance opportunities
    if (this.hasPackageJson()) {
      const pkg = JSON.parse(fs.readFileSync(path.join(this.projectPath, 'package.json'), 'utf8'));

      if (!pkg.scripts?.build) {
        this.opportunities.push({
          type: 'performance',
          opportunity: 'Add production build process',
          action: 'Configure build script for optimized output'
        });
      }

      // Check for monitoring
      if (!pkg.dependencies?.['@sentry/node'] && !pkg.dependencies?.['winston']) {
        this.opportunities.push({
          type: 'observability',
          opportunity: 'Add logging and monitoring',
          action: 'Install logging library (winston) or error tracking (Sentry)'
        });
      }
    }

    // Check for deployment configuration
    const hasDeployment = ['Dockerfile', 'docker-compose.yml', 'vercel.json', 'wrangler.toml']
      .some(file => fs.existsSync(path.join(this.projectPath, file)));

    if (!hasDeployment) {
      this.opportunities.push({
        type: 'deployment',
        opportunity: 'Configure deployment pipeline',
        action: 'Add containerization or cloud deployment configuration'
      });
    }
  }

  async generateStrategicRecommendations() {
    const priority = {
      immediate: [],
      shortTerm: [],
      longTerm: []
    };

    // Prioritize blockers
    this.blockers.forEach(blocker => {
      priority.immediate.push({
        action: blocker.action,
        reason: blocker.issue,
        impact: blocker.impact
      });
    });

    // High severity risks
    this.risks.filter(r => r.severity === 'high').forEach(risk => {
      priority.immediate.push({
        action: risk.action,
        reason: risk.issue
      });
    });

    // Medium severity risks and opportunities
    this.risks.filter(r => r.severity === 'medium').forEach(risk => {
      priority.shortTerm.push({
        action: risk.action,
        reason: risk.issue
      });
    });

    this.opportunities.slice(0, 3).forEach(opp => {
      priority.shortTerm.push({
        action: opp.action,
        reason: opp.opportunity
      });
    });

    // Long term improvements
    this.opportunities.slice(3).forEach(opp => {
      priority.longTerm.push({
        action: opp.action,
        reason: opp.opportunity
      });
    });

    this.metrics.recommendations = priority;
  }

  // Helper methods
  hasGit() {
    return fs.existsSync(path.join(this.projectPath, '.git'));
  }

  hasPackageJson() {
    return fs.existsSync(path.join(this.projectPath, 'package.json'));
  }

  findLargeFiles() {
    const large = [];
    const checkDir = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            checkDir(fullPath);
          } else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n').length;
            if (lines > 500) {
              large.push(path.relative(this.projectPath, fullPath));
            }
          }
        }
      } catch {}
    };

    checkDir(this.projectPath);
    return large;
  }
}

export { ProjectIntelligence };

// Command line testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectPath = process.argv[2] || process.cwd();
  const projectName = path.basename(projectPath);

  const intelligence = new ProjectIntelligence(projectPath, projectName);
  intelligence.analyze().then(result => {
    console.log('\n📊 PROJECT INTELLIGENCE REPORT');
    console.log('═'.repeat(60));

    // Show metrics
    if (result.metrics.health) {
      console.log(`\n🏥 Health Score: ${result.metrics.health.score}/100`);
    }

    if (result.metrics.velocity) {
      console.log(`\n📈 Development Velocity:`);
      console.log(`  Commits this week: ${result.metrics.velocity.commitsPerWeek}`);
      console.log(`  Momentum: ${result.metrics.velocity.momentum}`);
      console.log(`  Last activity: ${result.metrics.velocity.lastActivity}`);
    }

    if (result.blockers.length > 0) {
      console.log(`\n🚫 Blockers (${result.blockers.length}):`);
      result.blockers.forEach(b => {
        console.log(`  • ${b.issue}`);
        console.log(`    Action: ${b.action}`);
      });
    }

    if (result.risks.length > 0) {
      console.log(`\n⚠️  Risks (${result.risks.length}):`);
      result.risks.forEach(r => {
        console.log(`  • [${r.severity}] ${r.issue}`);
      });
    }

    if (result.opportunities.length > 0) {
      console.log(`\n💡 Opportunities (${result.opportunities.length}):`);
      result.opportunities.slice(0, 3).forEach(o => {
        console.log(`  • ${o.opportunity}`);
      });
    }

    console.log('\n' + '═'.repeat(60));
  }).catch(console.error);
}