#!/usr/bin/env node

/**
 * ChittyOS Worker Cleanup Script
 * Safely removes development, test, and duplicate Workers
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';

const execAsync = promisify(exec);

class ChittyOSWorkerCleanup {
  constructor() {
    this.accounts = [
      {
        name: 'Chitty Corp',
        id: '84f0f32886f1d6196380fe6cbe9656a8',
        primary: true
      }
    ];

    this.safeToDelete = [
      // Development/Test Workers
      'chitty-dev',
      'chitty-test',
      'chitty-staging',
      'test-worker',
      'dev-worker',
      'chittyrouter-ai-development',
      'chittyrouter-ai-staging',

      // Duplicate workers (keep only in primary account)
      'chittyrouter-email',
      'chittyrouter-sync',
      'chittychain-worker',
      'chittychain-sync',
      'chittyid-service',
      'chittyid-generator',
      'chittychat-worker',
      'chittychat-sync',
      'chitty-financial',
      'evidence-worker',
      'legal-sync',
      'notion-sync',
      'session-sync',
      'unified-sync',
      'atomic-facts-sync',
      'chittyos-api',
      'chittyos-worker'
    ];

    this.criticalWorkers = [
      'chittyrouter-ai',
      'chittyrouter-ai-production',
      'chittyrouter',
      'chittychain',
      'chittyid',
      'chittychat',
      'chitty-accounts',
      'chitty-payments',
      'chitty-billing',
      'chitty-treasury',
      'evidence-vault',
      'chittyos-gateway'
    ];

    this.deletedWorkers = [];
    this.failedDeletions = [];
    this.skippedWorkers = [];
  }

  /**
   * Perform safe worker cleanup
   */
  async performCleanup(dryRun = true) {
    console.log('🧹 Starting ChittyOS Worker Cleanup...');
    console.log(`🔒 Mode: ${dryRun ? 'DRY RUN' : 'LIVE DELETION'}`);

    if (!dryRun) {
      console.log('⚠️  WARNING: This will permanently delete Workers!');
      console.log('⚠️  Make sure you have backups and are certain about deletions.');
    }

    // Clean up each account
    for (const account of this.accounts) {
      console.log(`\n🏢 Processing Account: ${account.name}`);
      await this.cleanupAccount(account, dryRun);
    }

    // Generate cleanup report
    this.generateCleanupReport();

    return {
      deleted: this.deletedWorkers.length,
      failed: this.failedDeletions.length,
      skipped: this.skippedWorkers.length,
      dryRun: dryRun,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup workers in specific account
   */
  async cleanupAccount(account, dryRun) {
    console.log(`   🔍 Scanning for Workers to clean up...`);

    // Clean up development/test workers (safe in all accounts)
    const devWorkers = [
      'chitty-dev',
      'chitty-test',
      'chitty-staging',
      'test-worker',
      'dev-worker',
      'chittyrouter-ai-development',
      'chittyrouter-ai-staging'
    ];

    for (const workerName of devWorkers) {
      await this.deleteWorkerIfExists(account, workerName, 'development', dryRun);
    }

    // Clean up duplicates (only in secondary account)
    if (!account.primary) {
      console.log(`   🔄 Cleaning up duplicate workers in secondary account...`);

      const duplicateWorkers = [
        'chittyrouter-email',
        'chittyrouter-sync',
        'chittychain-worker',
        'chittychain-sync',
        'chittyid-service',
        'chittyid-generator',
        'chittychat-worker',
        'chittychat-sync',
        'chitty-financial',
        'evidence-worker',
        'legal-sync',
        'notion-sync',
        'session-sync',
        'unified-sync',
        'atomic-facts-sync',
        'chittyos-api',
        'chittyos-worker'
      ];

      for (const workerName of duplicateWorkers) {
        await this.deleteWorkerIfExists(account, workerName, 'duplicate', dryRun);
      }
    }
  }

  /**
   * Delete worker if it exists
   */
  async deleteWorkerIfExists(account, workerName, reason, dryRun) {
    try {
      if (dryRun) {
        console.log(`   📋 [DRY RUN] Would delete: ${workerName} (${reason})`);
        this.deletedWorkers.push({
          name: workerName,
          account: account.name,
          reason: reason,
          dryRun: true
        });
        return;
      }

      // Check if worker exists before attempting deletion
      console.log(`   🔍 Checking if ${workerName} exists...`);

      try {
        const { stdout, stderr } = await execAsync(
          `env -u NODE_OPTIONS CLOUDFLARE_ACCOUNT_ID=${account.id} /opt/homebrew/bin/wrangler deployments list --name ${workerName} 2>/dev/null || echo "not_found"`
        );

        if (stdout.includes('not_found') || stderr.includes('does not exist')) {
          console.log(`   ℹ️  ${workerName} does not exist, skipping`);
          this.skippedWorkers.push({
            name: workerName,
            account: account.name,
            reason: 'not_found'
          });
          return;
        }
      } catch (checkError) {
        console.log(`   ⚠️  Cannot verify ${workerName} exists, skipping for safety`);
        this.skippedWorkers.push({
          name: workerName,
          account: account.name,
          reason: 'verification_failed'
        });
        return;
      }

      // Attempt deletion
      console.log(`   🗑️  Deleting ${workerName}...`);

      const { stdout, stderr } = await execAsync(
        `env -u NODE_OPTIONS CLOUDFLARE_ACCOUNT_ID=${account.id} /opt/homebrew/bin/wrangler delete ${workerName} --force`
      );

      if (stderr && !stderr.includes('deleted successfully')) {
        throw new Error(stderr);
      }

      console.log(`   ✅ Successfully deleted ${workerName}`);
      this.deletedWorkers.push({
        name: workerName,
        account: account.name,
        reason: reason,
        dryRun: false,
        deletedAt: new Date().toISOString()
      });

    } catch (error) {
      console.log(`   ❌ Failed to delete ${workerName}: ${error.message}`);
      this.failedDeletions.push({
        name: workerName,
        account: account.name,
        error: error.message,
        reason: reason
      });
    }
  }

  /**
   * Generate cleanup report
   */
  generateCleanupReport() {
    console.log('\n' + '='.repeat(60));
    console.log('🧹 CHITTYOS WORKER CLEANUP REPORT');
    console.log('='.repeat(60));

    console.log(`\n📊 SUMMARY:`);
    console.log(`   Workers Deleted: ${this.deletedWorkers.length}`);
    console.log(`   Failed Deletions: ${this.failedDeletions.length}`);
    console.log(`   Skipped Workers: ${this.skippedWorkers.length}`);

    if (this.deletedWorkers.length > 0) {
      console.log(`\n✅ SUCCESSFULLY DELETED:`);
      this.deletedWorkers.forEach((worker, index) => {
        const status = worker.dryRun ? '[DRY RUN]' : '[DELETED]';
        console.log(`   ${index + 1}. ${status} ${worker.name} (${worker.account}) - ${worker.reason}`);
      });
    }

    if (this.failedDeletions.length > 0) {
      console.log(`\n❌ FAILED DELETIONS:`);
      this.failedDeletions.forEach((worker, index) => {
        console.log(`   ${index + 1}. ${worker.name} (${worker.account}) - ${worker.error}`);
      });
    }

    if (this.skippedWorkers.length > 0) {
      console.log(`\n⏭️  SKIPPED WORKERS:`);
      this.skippedWorkers.forEach((worker, index) => {
        console.log(`   ${index + 1}. ${worker.name} (${worker.account}) - ${worker.reason}`);
      });
    }

    console.log(`\n💾 CRITICAL WORKERS PRESERVED:`);
    this.criticalWorkers.forEach((worker, index) => {
      console.log(`   ${index + 1}. ${worker} - Protected from deletion`);
    });

    console.log('\n🎯 IMPACT:');
    const potentialSavings = this.deletedWorkers.length;
    console.log(`   Worker Count Reduction: ${potentialSavings}`);
    console.log(`   Remaining Worker Limit Headroom: ${100 - (72 - potentialSavings)}/100`);

    console.log('\n' + '='.repeat(60));
  }

  /**
   * Verify critical workers are safe
   */
  verifyCriticalWorkersSafety() {
    console.log('\n🔒 VERIFYING CRITICAL WORKER SAFETY...');

    const toDelete = [...this.safeToDelete];
    const conflicts = toDelete.filter(worker => this.criticalWorkers.includes(worker));

    if (conflicts.length > 0) {
      console.log(`❌ SAFETY CHECK FAILED! Critical workers marked for deletion:`);
      conflicts.forEach(worker => console.log(`   - ${worker}`));
      return false;
    }

    console.log('✅ All critical workers are protected');
    return true;
  }
}

/**
 * Interactive confirmation for live deletion
 */
async function confirmDeletion() {
  console.log('\n⚠️  CONFIRMATION REQUIRED');
  console.log('This will permanently delete Workers. Type "CONFIRM DELETE" to proceed:');

  // In a real CLI, you'd use readline for input
  // For now, we'll require explicit --confirm flag
  return process.argv.includes('--confirm');
}

/**
 * Main execution
 */
async function main() {
  const cleanup = new ChittyOSWorkerCleanup();

  // Safety check
  if (!cleanup.verifyCriticalWorkersSafety()) {
    console.log('💥 Aborting cleanup due to safety check failure');
    process.exit(1);
  }

  try {
    // Determine if this is a dry run
    const isDryRun = !process.argv.includes('--live');

    if (!isDryRun) {
      const confirmed = await confirmDeletion();
      if (!confirmed) {
        console.log('🛑 Deletion not confirmed. Exiting safely.');
        process.exit(0);
      }
    }

    const result = await cleanup.performCleanup(isDryRun);

    console.log('\n✅ Worker cleanup completed');
    console.log(`📊 Result: ${JSON.stringify(result, null, 2)}`);

    if (isDryRun) {
      console.log('\n💡 To perform actual deletion, run with --live --confirm flags');
    }

  } catch (error) {
    console.error('💥 Worker cleanup failed:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ChittyOSWorkerCleanup };