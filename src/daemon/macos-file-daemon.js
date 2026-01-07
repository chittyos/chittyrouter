#!/usr/bin/env node

/**
 * ChittyRouter macOS File System Daemon
 * Leverages native macOS FSEvents and Spotlight for intelligent file ingestion
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { ChittyIdClient } from '../utils/chittyid-integration.js';

const execAsync = promisify(exec);

/**
 * ChittyRouter File System Daemon using native macOS APIs
 */
export class ChittyRouterFileSystemDaemon {
  constructor(env, options = {}) {
    this.env = env;
    this.chittyId = null;
    this.watchPaths = options.watchPaths || [
      '~/Documents',
      '~/Downloads',
      '~/Desktop',
      '~/Library/Mobile Documents/com~apple~CloudDocs', // iCloud Drive
      '/Volumes' // External drives
    ];
    this.fileTypes = options.fileTypes || [
      'pdf', 'doc', 'docx', 'txt', 'rtf', 'pages',
      'jpg', 'jpeg', 'png', 'tiff', 'heic',
      'mp3', 'mp4', 'mov', 'wav', 'm4a',
      'json', 'xml', 'csv', 'xlsx'
    ];
    this.fseventsProcess = null;
    this.spotlightProcess = null;
    this.running = false;
  }

  /**
   * Initialize daemon with ChittyID
   */
  async initialize() {
    try {
      console.log('🍎 Initializing ChittyRouter macOS File Daemon...');

      // Get ChittyID for daemon
      this.chittyId = await ChittyIdClient.ensure(this.env, 'macos-file-daemon');
      console.log(`🆔 File Daemon ChittyID: ${this.chittyId}`);

      // Check macOS native tools availability
      await this.checkNativeTools();

      console.log('✅ macOS File Daemon initialized');
      return { initialized: true, chittyId: this.chittyId };

    } catch (error) {
      console.error('❌ Failed to initialize File Daemon:', error);
      throw error;
    }
  }

  /**
   * Check if native macOS tools are available
   */
  async checkNativeTools() {
    try {
      // Check FSEvents availability (built into macOS)
      await execAsync('which mdfind');
      console.log('✅ Spotlight (mdfind) available');

      // Check if we can use launchd for file monitoring
      await execAsync('which launchctl');
      console.log('✅ launchd available for file monitoring');

    } catch (error) {
      throw new Error('Required macOS native tools not available');
    }
  }

  /**
   * Start file system monitoring using native macOS FSEvents
   */
  async startFileMonitoring() {
    if (this.running) {
      console.log('📂 File monitoring already running');
      return;
    }

    try {
      console.log('📂 Starting native macOS file monitoring...');

      // Start FSEvents monitoring using native macOS tools
      await this.startFSEventsMonitoring();

      // Start Spotlight indexing monitoring
      await this.startSpotlightMonitoring();

      this.running = true;
      console.log('🍎 Native macOS file monitoring active');

    } catch (error) {
      console.error('❌ Failed to start file monitoring:', error);
      throw error;
    }
  }

  /**
   * Use native macOS FSEvents through shell integration
   */
  async startFSEventsMonitoring() {
    // Create AppleScript to monitor file changes
    const appleScript = `
      on adding folder items to this_folder after receiving added_items
        repeat with this_item in added_items
          set file_path to POSIX path of this_item
          do shell script "curl -X POST http://localhost:3000/daemon/file-added -H 'Content-Type: application/json' -d '{\\\"path\\\":\\\"" & file_path & "\\\",\\\"source\\\":\\\"fsevents\\\"}'"
        end repeat
      end adding folder items
    `;

    // Use native macOS folder actions for monitoring
    for (const watchPath of this.watchPaths) {
      const expandedPath = watchPath.replace('~', process.env.HOME);

      try {
        // Check if path exists
        await stat(expandedPath);

        // Set up folder action using native macOS
        const script = `
          tell application "System Events"
            make new folder action at end of folder actions with properties {name:"ChittyRouter-${path.basename(expandedPath)}", path:"${expandedPath}"}
          end tell
        `;

        await execAsync(`osascript -e '${script}'`);
        console.log(`📁 Monitoring: ${expandedPath}`);

      } catch (error) {
        console.warn(`⚠️ Cannot monitor ${expandedPath}:`, error.message);
      }
    }
  }

  /**
   * Use native Spotlight (mdfind) for content-based file discovery
   */
  async startSpotlightMonitoring() {
    // Use mdfind (Spotlight) to find files by content and metadata
    const spotlightQuery = this.fileTypes.map(ext => `kMDItemDisplayName = "*.${ext}"`).join(' || ');

    // Monitor for new files using Spotlight
    this.spotlightProcess = spawn('mdfind', [
      '-onlyin', process.env.HOME,
      '-live', // Live updates
      spotlightQuery
    ]);

    this.spotlightProcess.stdout.on('data', async (data) => {
      const filePaths = data.toString().trim().split('\n').filter(Boolean);

      for (const filePath of filePaths) {
        await this.handleFileDiscovered(filePath, 'spotlight');
      }
    });

    this.spotlightProcess.stderr.on('data', (data) => {
      console.error('Spotlight monitoring error:', data.toString());
    });

    console.log('🔍 Spotlight monitoring active');
  }

  /**
   * Handle discovered file using intelligent ingestion
   */
  async handleFileDiscovered(filePath, source) {
    try {
      // Check if file should be ingested
      const shouldIngest = await this.shouldIngestFile(filePath);
      if (!shouldIngest) {
        return;
      }

      console.log(`📄 Discovered file: ${filePath} (via ${source})`);

      // Get file metadata using native macOS tools
      const metadata = await this.getFileMetadata(filePath);

      // Assign ChittyID for this file
      const fileChittyId = await ChittyIdClient.ensure(this.env, `file-${path.basename(filePath)}`);

      // Send to ChittyRouter for processing
      await this.sendToChittyRouter({
        filePath,
        chittyId: fileChittyId,
        metadata,
        source,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Error processing file ${filePath}:`, error);
    }
  }

  /**
   * Get file metadata using native macOS mdls command
   */
  async getFileMetadata(filePath) {
    try {
      // Use native macOS mdls (metadata list) command
      const { stdout } = await execAsync(`mdls "${filePath}"`);

      // Parse mdls output
      const metadata = {};
      const lines = stdout.split('\n');

      for (const line of lines) {
        const match = line.match(/(\w+)\s+=\s+(.+)/);
        if (match) {
          let [, key, value] = match;

          // Clean up value
          value = value.replace(/^["']|["']$/g, '').trim();
          if (value !== '(null)') {
            metadata[key] = value;
          }
        }
      }

      // Add basic file stats
      const stats = await stat(filePath);
      metadata.fileSize = stats.size;
      metadata.created = stats.birthtime;
      metadata.modified = stats.mtime;
      metadata.accessed = stats.atime;

      return metadata;

    } catch (error) {
      console.error(`Error getting metadata for ${filePath}:`, error);
      return {};
    }
  }

  /**
   * Intelligent decision on whether to ingest file
   */
  async shouldIngestFile(filePath) {
    try {
      // Check file extension
      const ext = path.extname(filePath).toLowerCase().slice(1);
      if (!this.fileTypes.includes(ext)) {
        return false;
      }

      // Skip system files and temp files
      if (filePath.includes('/.') || filePath.includes('/tmp/') || filePath.includes('/.Trash/')) {
        return false;
      }

      // Check file size (skip very large files > 100MB)
      const stats = await stat(filePath);
      if (stats.size > 100 * 1024 * 1024) {
        console.log(`⚠️ Skipping large file: ${filePath} (${Math.round(stats.size / 1024 / 1024)}MB)`);
        return false;
      }

      // Use Spotlight to check if file contains relevant content
      const contentQuery = `(kMDItemDisplayName = "${path.basename(filePath)}") && (kMDItemTextContent = "*case*" || kMDItemTextContent = "*legal*" || kMDItemTextContent = "*contract*" || kMDItemTextContent = "*court*")`;

      try {
        const { stdout } = await execAsync(`mdfind '${contentQuery}'`);
        const hasRelevantContent = stdout.trim().includes(filePath);

        if (hasRelevantContent) {
          console.log(`📋 Found relevant legal content in: ${filePath}`);
          return true;
        }
      } catch (error) {
        // If content search fails, ingest anyway for manual review
        console.log(`📄 Content search failed, ingesting for review: ${filePath}`);
        return true;
      }

      return true;

    } catch (error) {
      console.error(`Error checking file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Send file to ChittyRouter for processing
   */
  async sendToChittyRouter(fileData) {
    try {
      const routerUrl = this.env.CHITTYROUTER_URL || 'http://localhost:8787';

      // Read file content for text files
      let content = null;
      if (['txt', 'json', 'xml', 'csv'].includes(path.extname(fileData.filePath).slice(1).toLowerCase())) {
        try {
          content = await readFile(fileData.filePath, 'utf8');
        } catch (error) {
          console.warn(`Cannot read file content: ${fileData.filePath}`);
        }
      }

      const payload = {
        ...fileData,
        content,
        daemon: {
          chittyId: this.chittyId,
          version: '2.0.0-ai',
          platform: 'macOS',
          nativeTools: ['FSEvents', 'Spotlight', 'mdls']
        }
      };

      // Send to ChittyRouter document processing endpoint
      const response = await fetch(`${routerUrl}/process/document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ChittyID': this.chittyId,
          'X-Source': 'macos-daemon'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ File processed: ${fileData.filePath} → ChittyID: ${result.chittyId}`);
      } else {
        console.error(`❌ Failed to process file: ${response.status} ${response.statusText}`);
      }

    } catch (error) {
      console.error('❌ Error sending to ChittyRouter:', error);
    }
  }

  /**
   * Stop file monitoring
   */
  async stopFileMonitoring() {
    if (!this.running) {
      return;
    }

    console.log('🛑 Stopping file monitoring...');

    // Stop Spotlight monitoring
    if (this.spotlightProcess) {
      this.spotlightProcess.kill();
      this.spotlightProcess = null;
    }

    // Remove folder actions
    try {
      await execAsync('osascript -e \'tell application \"System Events\" to delete every folder action whose name contains \"ChittyRouter\"\'');
    } catch (error) {
      console.warn('Warning: Could not remove all folder actions');
    }

    this.running = false;
    console.log('✅ File monitoring stopped');
  }

  /**
   * Get daemon status
   */
  getStatus() {
    return {
      chittyId: this.chittyId,
      running: this.running,
      watchPaths: this.watchPaths,
      fileTypes: this.fileTypes,
      nativeTools: ['FSEvents', 'Spotlight', 'mdls', 'mdfind'],
      platform: 'macOS',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * CLI interface for the daemon
 */
async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
ChittyRouter macOS File System Daemon

Usage: node macos-file-daemon.js [options]

Options:
  --start         Start the file monitoring daemon
  --stop          Stop the file monitoring daemon
  --status        Show daemon status
  --help, -h      Show this help message

The daemon uses native macOS tools:
  - FSEvents for real-time file system monitoring
  - Spotlight (mdfind) for content-based file discovery
  - mdls for extracting file metadata
  - Folder Actions for directory monitoring
    `);
    return;
  }

  const env = {
    CHITTYROUTER_URL: process.env.CHITTYROUTER_URL || 'http://localhost:8787',
    CHITTY_ID_ENDPOINT: process.env.CHITTY_ID_ENDPOINT || 'https://id.chitty.cc'
  };

  const daemon = new ChittyRouterFileSystemDaemon(env);

  try {
    await daemon.initialize();

    if (process.argv.includes('--start')) {
      await daemon.startFileMonitoring();
      console.log('🍎 ChittyRouter File Daemon running...');

      // Keep process alive
      process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down daemon...');
        await daemon.stopFileMonitoring();
        process.exit(0);
      });

      // Keep alive
      setInterval(() => {}, 1000);
    }

    if (process.argv.includes('--stop')) {
      await daemon.stopFileMonitoring();
    }

    if (process.argv.includes('--status')) {
      console.log('Daemon Status:', JSON.stringify(daemon.getStatus(), null, 2));
    }

  } catch (error) {
    console.error('❌ Daemon error:', error);
    process.exit(1);
  }
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}