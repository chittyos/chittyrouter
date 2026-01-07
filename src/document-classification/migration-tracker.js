/**
 * Migration Tracker - Proper file migration with deletion tracking
 * Prevents scattered duplicates and chaos directories
 */

import { DocumentClassifier } from './document-classifier.js';

export class MigrationTracker {
  constructor(env) {
    this.env = env;
    this.classifier = new DocumentClassifier(env);

    // Migration state
    this.migrations = new Map(); // source -> { destination, hash, status, verified }
    this.deletionQueue = [];     // Sources marked for deletion
    this.duplicates = new Map(); // hash -> [paths]
    this.factGraph = {           // Extracted case facts
      parties: new Map(),
      entities: new Map(),
      claims: new Map(),
      accounts: new Map(),
      relationships: []
    };
  }

  /**
   * Plan a migration (doesn't execute yet)
   */
  async planMigration(source, destination, options = {}) {
    const { dryRun = true, extractFacts = true } = options;

    const plan = {
      source,
      destination,
      timestamp: new Date().toISOString(),
      actions: [],
      warnings: [],
      factsSummary: null
    };

    // Get file list from source
    const files = await this.listFiles(source);

    for (const file of files) {
      // Calculate hash for deduplication
      const hash = await this.calculateHash(file.path);

      // Check for duplicates
      const existingPaths = this.duplicates.get(hash) || [];
      if (existingPaths.length > 0) {
        plan.warnings.push({
          type: 'DUPLICATE_FOUND',
          file: file.path,
          existingLocations: existingPaths,
          recommendation: 'SKIP_COPY_MARK_FOR_DELETION'
        });
        plan.actions.push({
          type: 'SKIP',
          source: file.path,
          reason: 'duplicate',
          existingAt: existingPaths[0]
        });
        continue;
      }

      // Classify document
      const classification = await this.classifier.classify({
        filename: file.name,
        path: file.path,
        mimeType: file.mimeType,
        size: file.size
      });

      // Determine proper destination
      const targetPath = classification.suggestedPath ||
        `${destination}/${file.name}`;

      plan.actions.push({
        type: 'COPY',
        source: file.path,
        destination: targetPath,
        classification,
        hash,
        markSourceForDeletion: true
      });

      // Extract facts if requested
      if (extractFacts && file.size < 5 * 1024 * 1024) { // < 5MB
        const facts = await this.extractFacts(file);
        if (facts) {
          this.addFactsToGraph(facts, file.path);
        }
      }

      // Track for deduplication
      existingPaths.push(file.path);
      this.duplicates.set(hash, existingPaths);
    }

    // Generate facts summary
    plan.factsSummary = this.getFactsSummary();

    return plan;
  }

  /**
   * Execute a migration plan
   */
  async executeMigration(plan) {
    const results = {
      copied: [],
      skipped: [],
      failed: [],
      markedForDeletion: []
    };

    for (const action of plan.actions) {
      if (action.type === 'SKIP') {
        results.skipped.push(action);

        // Mark source for deletion since it's a duplicate
        if (action.reason === 'duplicate') {
          results.markedForDeletion.push({
            path: action.source,
            reason: `Duplicate of ${action.existingAt}`
          });
        }
        continue;
      }

      if (action.type === 'COPY') {
        try {
          // Perform the copy
          await this.copyFile(action.source, action.destination);

          // Verify the copy
          const verified = await this.verifyFile(action.destination, action.hash);

          if (verified) {
            results.copied.push({
              source: action.source,
              destination: action.destination,
              verified: true
            });

            // Track migration for later source deletion
            this.migrations.set(action.source, {
              destination: action.destination,
              hash: action.hash,
              status: 'completed',
              verified: true,
              timestamp: new Date().toISOString()
            });

            // Mark source for deletion
            if (action.markSourceForDeletion) {
              results.markedForDeletion.push({
                path: action.source,
                reason: `Copied to ${action.destination}`
              });
              this.deletionQueue.push({
                path: action.source,
                copiedTo: action.destination,
                hash: action.hash
              });
            }
          } else {
            results.failed.push({
              source: action.source,
              destination: action.destination,
              error: 'Verification failed'
            });
          }
        } catch (error) {
          results.failed.push({
            source: action.source,
            destination: action.destination,
            error: error.message
          });
        }
      }
    }

    return results;
  }

  /**
   * Extract case facts from document
   */
  async extractFacts(file) {
    if (!this.env.AI) return null;

    try {
      const content = await this.readFileContent(file.path);
      if (!content) return null;

      const truncated = content.substring(0, 10000);

      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{
          role: 'system',
          content: `You are a legal document analyzer. Extract structured facts from the document.

Return JSON with these fields:
{
  "parties": [{"name": "", "role": "plaintiff|defendant|witness|expert|other", "type": "individual|entity"}],
  "entities": [{"name": "", "type": "llc|corporation|trust|bank|other", "state": "", "ein": ""}],
  "claims": [{"type": "", "amount": null, "description": "", "date": ""}],
  "accounts": [{"institution": "", "last4": "", "type": "checking|savings|brokerage|other"}],
  "properties": [{"address": "", "type": "residential|commercial|land", "owner": ""}],
  "dates": [{"date": "", "event": ""}],
  "amounts": [{"amount": 0, "currency": "USD", "context": ""}],
  "relationships": [{"from": "", "to": "", "type": "owner|member|manager|officer|debtor|creditor"}]
}

Only include facts that are clearly stated. Return valid JSON only.`
        }, {
          role: 'user',
          content: truncated
        }]
      });

      try {
        return JSON.parse(response.response);
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Fact extraction failed:', error);
      return null;
    }
  }

  /**
   * Add extracted facts to the graph
   */
  addFactsToGraph(facts, sourcePath) {
    // Add parties
    for (const party of facts.parties || []) {
      const key = party.name.toLowerCase();
      const existing = this.factGraph.parties.get(key) || { mentions: [], roles: new Set() };
      existing.mentions.push(sourcePath);
      existing.roles.add(party.role);
      existing.type = party.type;
      this.factGraph.parties.set(key, existing);
    }

    // Add entities
    for (const entity of facts.entities || []) {
      const key = entity.name.toLowerCase();
      const existing = this.factGraph.entities.get(key) || { mentions: [], data: {} };
      existing.mentions.push(sourcePath);
      existing.data = { ...existing.data, ...entity };
      this.factGraph.entities.set(key, existing);
    }

    // Add claims
    for (const claim of facts.claims || []) {
      const key = `${claim.type}_${claim.date || 'unknown'}`;
      const existing = this.factGraph.claims.get(key) || { mentions: [], data: claim };
      existing.mentions.push(sourcePath);
      this.factGraph.claims.set(key, existing);
    }

    // Add accounts
    for (const account of facts.accounts || []) {
      const key = `${account.institution}_${account.last4 || 'unknown'}`;
      const existing = this.factGraph.accounts.get(key) || { mentions: [], data: account };
      existing.mentions.push(sourcePath);
      this.factGraph.accounts.set(key, existing);
    }

    // Add relationships
    for (const rel of facts.relationships || []) {
      this.factGraph.relationships.push({
        ...rel,
        source: sourcePath
      });
    }
  }

  /**
   * Get summary of extracted facts
   */
  getFactsSummary() {
    return {
      parties: {
        count: this.factGraph.parties.size,
        list: Array.from(this.factGraph.parties.entries()).map(([name, data]) => ({
          name,
          mentionCount: data.mentions.length,
          roles: Array.from(data.roles)
        }))
      },
      entities: {
        count: this.factGraph.entities.size,
        list: Array.from(this.factGraph.entities.entries()).map(([name, data]) => ({
          name,
          mentionCount: data.mentions.length,
          ...data.data
        }))
      },
      claims: {
        count: this.factGraph.claims.size,
        totalAmount: Array.from(this.factGraph.claims.values())
          .reduce((sum, c) => sum + (c.data.amount || 0), 0)
      },
      accounts: {
        count: this.factGraph.accounts.size
      },
      relationships: {
        count: this.factGraph.relationships.length
      }
    };
  }

  /**
   * Get deletion queue for review
   */
  getDeletionQueue() {
    return {
      count: this.deletionQueue.length,
      items: this.deletionQueue.map(item => ({
        ...item,
        verified: this.migrations.get(item.path)?.verified || false
      })),
      totalSize: 0 // Would need to sum file sizes
    };
  }

  /**
   * Execute deletions (only for verified migrations)
   */
  async executeDeletions(options = { dryRun: true, requireVerification: true }) {
    const results = {
      deleted: [],
      skipped: [],
      errors: []
    };

    for (const item of this.deletionQueue) {
      const migration = this.migrations.get(item.path);

      // Skip if not verified and verification required
      if (options.requireVerification && !migration?.verified) {
        results.skipped.push({
          path: item.path,
          reason: 'Copy not verified'
        });
        continue;
      }

      if (options.dryRun) {
        results.deleted.push({
          path: item.path,
          dryRun: true
        });
        continue;
      }

      try {
        await this.deleteFile(item.path);
        results.deleted.push({
          path: item.path,
          dryRun: false
        });
      } catch (error) {
        results.errors.push({
          path: item.path,
          error: error.message
        });
      }
    }

    return results;
  }

  // Placeholder methods - would integrate with rclone or Google Drive API
  async listFiles(path) {
    // Implementation would use rclone lsjson or Google Drive API
    return [];
  }

  async calculateHash(path) {
    // Implementation would use rclone md5sum or similar
    return `hash_${path}`;
  }

  async copyFile(source, destination) {
    // Implementation would use rclone copy
    console.log(`COPY: ${source} -> ${destination}`);
  }

  async verifyFile(path, expectedHash) {
    // Implementation would verify the file exists and hash matches
    return true;
  }

  async readFileContent(path) {
    // Implementation would read file content
    return null;
  }

  async deleteFile(path) {
    // Implementation would use rclone delete
    console.log(`DELETE: ${path}`);
  }
}

/**
 * Generate migration report
 */
export function generateMigrationReport(tracker) {
  const deletion = tracker.getDeletionQueue();
  const facts = tracker.getFactsSummary();

  return `
# Migration Report
Generated: ${new Date().toISOString()}

## Migration Summary
- Files migrated: ${tracker.migrations.size}
- Duplicates found: ${tracker.duplicates.size}
- Sources marked for deletion: ${deletion.count}

## Deletion Queue
${deletion.items.slice(0, 20).map(item =>
  `- [${item.verified ? '✓' : '!'}] ${item.path}\n  → ${item.copiedTo}`
).join('\n')}
${deletion.count > 20 ? `\n... and ${deletion.count - 20} more` : ''}

## Extracted Facts

### Parties (${facts.parties.count})
${facts.parties.list.slice(0, 10).map(p =>
  `- ${p.name} (${p.roles.join(', ')}) - ${p.mentionCount} mentions`
).join('\n')}

### Entities (${facts.entities.count})
${facts.entities.list.slice(0, 10).map(e =>
  `- ${e.name} (${e.type || 'unknown'}) - ${e.mentionCount} mentions`
).join('\n')}

### Claims (${facts.claims.count})
Total Amount: $${facts.claims.totalAmount.toLocaleString()}

### Accounts (${facts.accounts.count})
### Relationships (${facts.relationships.count})

## Next Steps
1. Review deletion queue above
2. Verify all copies are accessible
3. Run deletion with dryRun=false when ready
`;
}
