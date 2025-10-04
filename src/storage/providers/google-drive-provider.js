/**
 * Google Drive Storage Provider
 * Reliable cloud storage with collaboration features for warm/cold data
 */

import { google } from 'googleapis';

export class GoogleDriveProvider {
  constructor(env) {
    this.env = env;

    // Initialize Google Auth
    this.auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n'),
        project_id: env.GOOGLE_PROJECT_ID
      },
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    this.drive = google.drive({ version: 'v3', auth: this.auth });

    // ChittyOS folder structure
    this.folders = {
      root: env.GOOGLE_DRIVE_ROOT_FOLDER || 'ChittyOS',
      data: 'chittyos-data',
      evidence: 'evidence-vault',
      sessions: 'chittychat-data',
      metadata: 'metadata'
    };

    // Cache for folder IDs
    this.folderCache = new Map();
  }

  /**
   * Store file in Google Drive
   */
  async store(path, content, options = {}) {
    try {
      const fileName = this.getFileName(path);
      const folderPath = this.getFolderPath(path);
      const folderId = await this.ensureFolder(folderPath);

      const contentString = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

      // Prepare file metadata
      const fileMetadata = {
        name: fileName,
        parents: [folderId],
        properties: {
          'chitty-tier': options.tier || 'WARM',
          'chitty-project': options.projectId || this.env.PROJECT_ID,
          'chitty-session': options.sessionId || this.env.SESSION_ID,
          'chitty-path': path,
          'chitty-created': new Date().toISOString(),
          'chitty-primary': options.isPrimary ? 'true' : 'false',
          'chitty-backup': options.isBackup ? 'true' : 'false',
          'chitty-repair': options.isRepair ? 'true' : 'false'
        }
      };

      // Check if file exists and update or create
      const existingFile = await this.findFile(fileName, folderId);

      let result;
      if (existingFile) {
        // Update existing file
        result = await this.drive.files.update({
          fileId: existingFile.id,
          requestBody: fileMetadata,
          media: {
            mimeType: 'application/json',
            body: contentString
          }
        });
      } else {
        // Create new file
        result = await this.drive.files.create({
          requestBody: fileMetadata,
          media: {
            mimeType: 'application/json',
            body: contentString
          }
        });
      }

      console.log(`📁 Google Drive: Stored ${fileName} in ${folderPath}`);

      return {
        provider: 'google-drive',
        fileId: result.data.id,
        fileName,
        folderPath,
        size: contentString.length,
        url: `https://drive.google.com/file/d/${result.data.id}/view`,
        metadata: fileMetadata.properties,
        storedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Google Drive storage failed for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve file from Google Drive
   */
  async retrieve(path, options = {}) {
    try {
      const fileName = this.getFileName(path);
      const folderPath = this.getFolderPath(path);
      const folderId = await this.getFolderId(folderPath);

      if (!folderId) {
        throw new Error(`Folder not found: ${folderPath}`);
      }

      const file = await this.findFile(fileName, folderId);
      if (!file) {
        throw new Error(`File not found: ${fileName}`);
      }

      // Get file content
      const response = await this.drive.files.get({
        fileId: file.id,
        alt: 'media'
      });

      const content = response.data;

      // Try to parse as JSON
      try {
        return typeof content === 'string' ? JSON.parse(content) : content;
      } catch {
        return content;
      }

    } catch (error) {
      console.error(`❌ Google Drive retrieval failed for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async exists(path) {
    try {
      const fileName = this.getFileName(path);
      const folderPath = this.getFolderPath(path);
      const folderId = await this.getFolderId(folderPath);

      if (!folderId) {
        return false;
      }

      const file = await this.findFile(fileName, folderId);
      return file !== null;

    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(path) {
    try {
      const fileName = this.getFileName(path);
      const folderPath = this.getFolderPath(path);
      const folderId = await this.getFolderId(folderPath);

      if (!folderId) {
        return null;
      }

      const file = await this.findFile(fileName, folderId);
      if (!file) {
        return null;
      }

      // Get detailed file metadata
      const fileDetails = await this.drive.files.get({
        fileId: file.id,
        fields: 'id,name,size,modifiedTime,createdTime,properties,mimeType'
      });

      return {
        fileId: fileDetails.data.id,
        name: fileDetails.data.name,
        size: parseInt(fileDetails.data.size || '0'),
        lastModified: fileDetails.data.modifiedTime,
        created: fileDetails.data.createdTime,
        mimeType: fileDetails.data.mimeType,
        properties: fileDetails.data.properties || {},
        provider: 'google-drive'
      };

    } catch (error) {
      console.warn(`⚠️ Google Drive metadata retrieval failed for ${path}:`, error);
      return null;
    }
  }

  /**
   * Store metadata (creates a dedicated metadata file)
   */
  async storeMetadata(path, metadata) {
    const metadataPath = `metadata/${path.replace(/\//g, '_')}.json`;
    return this.store(metadataPath, metadata, { contentType: 'application/json' });
  }

  /**
   * List files in folder
   */
  async list(folderPath = '', options = {}) {
    try {
      const folderId = await this.getFolderId(folderPath);

      if (!folderId) {
        return { files: [], folders: [] };
      }

      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id,name,size,modifiedTime,mimeType,properties)',
        pageSize: options.limit || 100
      });

      const files = response.data.files || [];

      return {
        files: files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').map(f => ({
          id: f.id,
          name: f.name,
          size: parseInt(f.size || '0'),
          lastModified: f.modifiedTime,
          properties: f.properties || {}
        })),
        folders: files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').map(f => ({
          id: f.id,
          name: f.name
        })),
        path: folderPath
      };

    } catch (error) {
      console.error(`❌ Google Drive list failed for ${folderPath}:`, error);
      throw error;
    }
  }

  /**
   * Delete file
   */
  async delete(path) {
    try {
      const fileName = this.getFileName(path);
      const folderPath = this.getFolderPath(path);
      const folderId = await this.getFolderId(folderPath);

      if (!folderId) {
        throw new Error(`Folder not found: ${folderPath}`);
      }

      const file = await this.findFile(fileName, folderId);
      if (!file) {
        throw new Error(`File not found: ${fileName}`);
      }

      await this.drive.files.delete({
        fileId: file.id
      });

      console.log(`🗑️ Google Drive: Deleted ${fileName}`);
      return { success: true, fileId: file.id, fileName };

    } catch (error) {
      console.error(`❌ Google Drive deletion failed for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Get provider status
   */
  async getStatus() {
    try {
      // Test with getting user info
      const about = await this.drive.about.get({
        fields: 'user,storageQuota'
      });

      return {
        provider: 'google-drive',
        status: 'healthy',
        user: about.data.user?.emailAddress,
        storage: {
          used: about.data.storageQuota?.usage,
          limit: about.data.storageQuota?.limit
        },
        checkedAt: new Date().toISOString()
      };

    } catch (error) {
      return {
        provider: 'google-drive',
        status: 'error',
        error: error.message,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Ensure folder exists, create if necessary
   */
  async ensureFolder(folderPath) {
    const cacheKey = folderPath || 'root';
    const cached = this.folderCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      let parentId = null;

      // Handle root folder
      if (!folderPath || folderPath === '') {
        const rootFolder = await this.findOrCreateFolder(this.folders.root, null);
        this.folderCache.set('root', rootFolder.id);
        return rootFolder.id;
      }

      // Navigate through folder path
      const pathParts = folderPath.split('/').filter(p => p);
      let currentPath = '';

      for (const part of pathParts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        const cached = this.folderCache.get(currentPath);
        if (cached) {
          parentId = cached;
          continue;
        }

        const folder = await this.findOrCreateFolder(part, parentId);
        this.folderCache.set(currentPath, folder.id);
        parentId = folder.id;
      }

      return parentId;

    } catch (error) {
      console.error(`❌ Failed to ensure folder ${folderPath}:`, error);
      throw error;
    }
  }

  /**
   * Find or create a folder
   */
  async findOrCreateFolder(name, parentId) {
    // Search for existing folder
    const query = parentId
      ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

    const response = await this.drive.files.list({
      q: query,
      fields: 'files(id,name)'
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0];
    }

    // Create new folder
    const folderMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined
    };

    const folder = await this.drive.files.create({
      requestBody: folderMetadata,
      fields: 'id,name'
    });

    console.log(`📁 Google Drive: Created folder ${name}`);
    return folder.data;
  }

  /**
   * Find file in folder
   */
  async findFile(fileName, folderId) {
    const response = await this.drive.files.list({
      q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id,name)'
    });

    return response.data.files?.[0] || null;
  }

  /**
   * Get folder ID from cache or search
   */
  async getFolderId(folderPath) {
    if (!folderPath) {
      return this.folderCache.get('root');
    }

    return this.folderCache.get(folderPath);
  }

  /**
   * Extract file name from path
   */
  getFileName(path) {
    return path.split('/').pop() || 'untitled.json';
  }

  /**
   * Extract folder path from file path
   */
  getFolderPath(path) {
    const parts = path.split('/');
    parts.pop(); // Remove file name
    return parts.join('/');
  }

  /**
   * Create shareable link
   */
  async createShareableLink(path, options = {}) {
    try {
      const fileName = this.getFileName(path);
      const folderPath = this.getFolderPath(path);
      const folderId = await this.getFolderId(folderPath);

      if (!folderId) {
        throw new Error(`Folder not found: ${folderPath}`);
      }

      const file = await this.findFile(fileName, folderId);
      if (!file) {
        throw new Error(`File not found: ${fileName}`);
      }

      // Make file shareable
      await this.drive.permissions.create({
        fileId: file.id,
        requestBody: {
          role: options.role || 'reader',
          type: 'anyone'
        }
      });

      return `https://drive.google.com/file/d/${file.id}/view`;

    } catch (error) {
      console.error(`❌ Failed to create shareable link for ${path}:`, error);
      throw error;
    }
  }
}

export default GoogleDriveProvider;