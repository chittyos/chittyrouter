/**
 * Cloudflare R2 Storage Provider
 * High-performance object storage for hot data and frequently accessed content
 */

export class CloudflareR2Provider {
  constructor(env) {
    this.env = env;
    this.bucket = env.DOCUMENT_STORAGE; // R2 bucket binding
    this.baseUrl = env.R2_PUBLIC_URL || 'https://storage.chitty.cc';
  }

  /**
   * Store object in R2 bucket
   */
  async store(path, content, options = {}) {
    try {
      const key = this.normalizeKey(path);
      const contentString = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

      // Prepare metadata
      const metadata = {
        'chitty-tier': options.tier || 'HOT',
        'chitty-project': options.projectId || this.env.PROJECT_ID,
        'chitty-session': options.sessionId || this.env.SESSION_ID,
        'chitty-type': options.contentType || 'application/json',
        'chitty-created': new Date().toISOString(),
        'chitty-primary': options.isPrimary ? 'true' : 'false',
        'chitty-backup': options.isBackup ? 'true' : 'false'
      };

      // Store in R2
      await this.bucket.put(key, contentString, {
        httpMetadata: {
          contentType: metadata['chitty-type'],
          cacheControl: this.getCacheControl(options.tier)
        },
        customMetadata: metadata
      });

      console.log(`📦 R2: Stored ${key} (${contentString.length} bytes)`);

      return {
        provider: 'cloudflare-r2',
        key,
        size: contentString.length,
        url: `${this.baseUrl}/${key}`,
        metadata,
        storedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ R2 storage failed for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve object from R2
   */
  async retrieve(path, options = {}) {
    try {
      const key = this.normalizeKey(path);
      const object = await this.bucket.get(key);

      if (!object) {
        throw new Error(`Object not found: ${key}`);
      }

      const content = await object.text();

      // Try to parse as JSON
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }

    } catch (error) {
      console.error(`❌ R2 retrieval failed for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Check if object exists
   */
  async exists(path) {
    try {
      const key = this.normalizeKey(path);
      const object = await this.bucket.head(key);
      return object !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get object metadata
   */
  async getMetadata(path) {
    try {
      const key = this.normalizeKey(path);
      const object = await this.bucket.head(key);

      if (!object) {
        return null;
      }

      return {
        size: object.size,
        lastModified: object.uploaded.toISOString(),
        etag: object.etag,
        contentType: object.httpMetadata?.contentType,
        customMetadata: object.customMetadata || {},
        provider: 'cloudflare-r2'
      };

    } catch (error) {
      console.warn(`⚠️ R2 metadata retrieval failed for ${path}:`, error);
      return null;
    }
  }

  /**
   * Store metadata (for consistency with other providers)
   */
  async storeMetadata(path, metadata) {
    return this.store(path, metadata, { contentType: 'application/json' });
  }

  /**
   * List objects with prefix
   */
  async list(prefix = '', options = {}) {
    try {
      const objects = await this.bucket.list({
        prefix: this.normalizeKey(prefix),
        limit: options.limit || 1000
      });

      return {
        objects: objects.objects.map(obj => ({
          key: obj.key,
          size: obj.size,
          lastModified: obj.uploaded.toISOString(),
          etag: obj.etag
        })),
        truncated: objects.truncated,
        prefix
      };

    } catch (error) {
      console.error(`❌ R2 list failed for prefix ${prefix}:`, error);
      throw error;
    }
  }

  /**
   * Delete object
   */
  async delete(path) {
    try {
      const key = this.normalizeKey(path);
      await this.bucket.delete(key);

      console.log(`🗑️ R2: Deleted ${key}`);
      return { success: true, key };

    } catch (error) {
      console.error(`❌ R2 deletion failed for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Get provider status
   */
  async getStatus() {
    try {
      // Test with a simple HEAD request
      await this.bucket.head('__health_check__');

      return {
        provider: 'cloudflare-r2',
        status: 'healthy',
        bucket: this.bucket.name || 'default',
        baseUrl: this.baseUrl,
        checkedAt: new Date().toISOString()
      };

    } catch (error) {
      return {
        provider: 'cloudflare-r2',
        status: 'error',
        error: error.message,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Get cache control headers based on tier
   */
  getCacheControl(tier) {
    switch (tier) {
      case 'HOT':
        return 'public, max-age=300'; // 5 minutes
      case 'WARM':
        return 'public, max-age=3600'; // 1 hour
      case 'COLD':
        return 'public, max-age=86400'; // 1 day
      case 'ARCHIVE':
        return 'public, max-age=604800'; // 1 week
      default:
        return 'public, max-age=300';
    }
  }

  /**
   * Normalize path to R2 key
   */
  normalizeKey(path) {
    // Remove leading slash and ensure consistent format
    return path.replace(/^\/+/, '').replace(/\/+/g, '/');
  }

  /**
   * Create signed URL for temporary access
   */
  async createSignedUrl(path, options = {}) {
    const key = this.normalizeKey(path);
    const expiresIn = options.expiresIn || 3600; // 1 hour default

    // Note: R2 signed URLs require additional setup
    // This is a simplified implementation
    return `${this.baseUrl}/${key}?signed=true&expires=${Date.now() + expiresIn * 1000}`;
  }
}

export default CloudflareR2Provider;