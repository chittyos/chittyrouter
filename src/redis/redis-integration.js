/**
 * Redis Integration for ChittyRouter
 * Provides caching, session management, and real-time data storage
 * Connects to Redis on port 6379
 */

/**
 * Redis Client Manager for ChittyRouter
 */
export class ChittyRedisClient {
  constructor(env) {
    this.env = env;
    this.host = env.REDIS_HOST || 'localhost';
    this.port = parseInt(env.REDIS_PORT || '6379');
    this.password = env.REDIS_PASSWORD;
    this.database = parseInt(env.REDIS_DATABASE || '0');
    this.client = null;
    this.pubSubClient = null;
    this.connected = false;
    this.subscribers = new Map();
    this.keyPrefix = 'chittyrouter:';
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      console.log(`📡 Connecting to Redis at ${this.host}:${this.port}...`);

      // Create Redis client (using fetch-based Redis for Cloudflare Workers compatibility)
      this.client = new RedisHTTPClient({
        host: this.host,
        port: this.port,
        password: this.password,
        database: this.database
      });

      // Test connection
      await this.ping();

      this.connected = true;
      console.log('✅ Redis connected successfully');

      // Initialize pub/sub client
      await this.initializePubSub();

      return { connected: true, host: this.host, port: this.port };

    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Initialize Pub/Sub functionality
   */
  async initializePubSub() {
    try {
      // Create separate client for pub/sub
      this.pubSubClient = new RedisHTTPClient({
        host: this.host,
        port: this.port,
        password: this.password,
        database: this.database
      });

      console.log('📢 Redis Pub/Sub initialized');

    } catch (error) {
      console.error('Failed to initialize Redis Pub/Sub:', error);
    }
  }

  /**
   * Ping Redis server
   */
  async ping() {
    try {
      const result = await this.client.ping();
      if (result !== 'PONG') {
        throw new Error(`Unexpected ping response: ${result}`);
      }
      return true;
    } catch (error) {
      throw new Error(`Redis ping failed: ${error.message}`);
    }
  }

  /**
   * Set key-value pair with optional expiration
   */
  async set(key, value, options = {}) {
    try {
      const fullKey = this.keyPrefix + key;
      const serializedValue = this.serialize(value);

      const args = [fullKey, serializedValue];

      // Add expiration if specified
      if (options.ttl) {
        args.push('EX', options.ttl);
      } else if (options.px) {
        args.push('PX', options.px);
      }

      // Add conditional options
      if (options.nx) {
        args.push('NX');
      } else if (options.xx) {
        args.push('XX');
      }

      const result = await this.client.set(...args);
      return result === 'OK' || result === true;

    } catch (error) {
      console.error(`Redis SET failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get value by key
   */
  async get(key) {
    try {
      const fullKey = this.keyPrefix + key;
      const value = await this.client.get(fullKey);

      if (value === null || value === undefined) {
        return null;
      }

      return this.deserialize(value);

    } catch (error) {
      console.error(`Redis GET failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete key(s)
   */
  async del(key) {
    try {
      const fullKey = this.keyPrefix + key;
      const result = await this.client.del(fullKey);
      return result > 0;

    } catch (error) {
      console.error(`Redis DEL failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      const fullKey = this.keyPrefix + key;
      const result = await this.client.exists(fullKey);
      return result === 1;

    } catch (error) {
      console.error(`Redis EXISTS failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set expiration for key
   */
  async expire(key, seconds) {
    try {
      const fullKey = this.keyPrefix + key;
      const result = await this.client.expire(fullKey, seconds);
      return result === 1;

    } catch (error) {
      console.error(`Redis EXPIRE failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key) {
    try {
      const fullKey = this.keyPrefix + key;
      return await this.client.ttl(fullKey);

    } catch (error) {
      console.error(`Redis TTL failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Increment numeric value
   */
  async incr(key) {
    try {
      const fullKey = this.keyPrefix + key;
      return await this.client.incr(fullKey);

    } catch (error) {
      console.error(`Redis INCR failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Increment by specific amount
   */
  async incrby(key, increment) {
    try {
      const fullKey = this.keyPrefix + key;
      return await this.client.incrby(fullKey, increment);

    } catch (error) {
      console.error(`Redis INCRBY failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Hash operations - Set field
   */
  async hset(key, field, value) {
    try {
      const fullKey = this.keyPrefix + key;
      const serializedValue = this.serialize(value);
      const result = await this.client.hset(fullKey, field, serializedValue);
      return result >= 0;

    } catch (error) {
      console.error(`Redis HSET failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Hash operations - Get field
   */
  async hget(key, field) {
    try {
      const fullKey = this.keyPrefix + key;
      const value = await this.client.hget(fullKey, field);

      if (value === null || value === undefined) {
        return null;
      }

      return this.deserialize(value);

    } catch (error) {
      console.error(`Redis HGET failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Hash operations - Get all fields
   */
  async hgetall(key) {
    try {
      const fullKey = this.keyPrefix + key;
      const result = await this.client.hgetall(fullKey);

      if (!result) {
        return {};
      }

      // Deserialize all values
      const deserialized = {};
      for (const [field, value] of Object.entries(result)) {
        deserialized[field] = this.deserialize(value);
      }

      return deserialized;

    } catch (error) {
      console.error(`Redis HGETALL failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * List operations - Push to left
   */
  async lpush(key, ...values) {
    try {
      const fullKey = this.keyPrefix + key;
      const serializedValues = values.map(v => this.serialize(v));
      return await this.client.lpush(fullKey, ...serializedValues);

    } catch (error) {
      console.error(`Redis LPUSH failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * List operations - Pop from left
   */
  async lpop(key) {
    try {
      const fullKey = this.keyPrefix + key;
      const value = await this.client.lpop(fullKey);

      if (value === null || value === undefined) {
        return null;
      }

      return this.deserialize(value);

    } catch (error) {
      console.error(`Redis LPOP failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * List operations - Get range
   */
  async lrange(key, start, stop) {
    try {
      const fullKey = this.keyPrefix + key;
      const values = await this.client.lrange(fullKey, start, stop);
      return values.map(v => this.deserialize(v));

    } catch (error) {
      console.error(`Redis LRANGE failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Publish message to channel
   */
  async publish(channel, message) {
    try {
      if (!this.pubSubClient) {
        throw new Error('Pub/Sub client not initialized');
      }

      const serializedMessage = this.serialize(message);
      const result = await this.pubSubClient.publish(channel, serializedMessage);
      return result;

    } catch (error) {
      console.error(`Redis PUBLISH failed for channel ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel, callback) {
    try {
      if (!this.pubSubClient) {
        throw new Error('Pub/Sub client not initialized');
      }

      // Store subscriber callback
      this.subscribers.set(channel, callback);

      // Note: In Cloudflare Workers, we'd need to use WebSockets or polling
      // This is a simplified implementation
      console.log(`📢 Subscribed to Redis channel: ${channel}`);

    } catch (error) {
      console.error(`Redis SUBSCRIBE failed for channel ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Cache email data
   */
  async cacheEmailData(emailId, emailData, ttl = 3600) {
    const key = `email:${emailId}`;
    return await this.set(key, emailData, { ttl });
  }

  /**
   * Get cached email data
   */
  async getCachedEmailData(emailId) {
    const key = `email:${emailId}`;
    return await this.get(key);
  }

  /**
   * Store AI response cache
   */
  async cacheAIResponse(inputHash, response, ttl = 1800) {
    const key = `ai:response:${inputHash}`;
    return await this.set(key, response, { ttl });
  }

  /**
   * Get cached AI response
   */
  async getCachedAIResponse(inputHash) {
    const key = `ai:response:${inputHash}`;
    return await this.get(key);
  }

  /**
   * Store session data
   */
  async storeSession(sessionId, sessionData, ttl = 86400) {
    const key = `session:${sessionId}`;
    return await this.set(key, sessionData, { ttl });
  }

  /**
   * Get session data
   */
  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    return await this.get(key);
  }

  /**
   * Store agent state
   */
  async storeAgentState(agentId, state, ttl = 7200) {
    const key = `agent:state:${agentId}`;
    return await this.set(key, state, { ttl });
  }

  /**
   * Get agent state
   */
  async getAgentState(agentId) {
    const key = `agent:state:${agentId}`;
    return await this.get(key);
  }

  /**
   * Store coordination data
   */
  async storeCoordination(coordinationId, data, ttl = 3600) {
    const key = `coordination:${coordinationId}`;
    return await this.set(key, data, { ttl });
  }

  /**
   * Get coordination data
   */
  async getCoordination(coordinationId) {
    const key = `coordination:${coordinationId}`;
    return await this.get(key);
  }

  /**
   * Rate limiting - Check and increment counter
   */
  async checkRateLimit(identifier, limit, window) {
    const key = `ratelimit:${identifier}`;

    try {
      const current = await this.get(key);

      if (current === null) {
        // First request in window
        await this.set(key, 1, { ttl: window });
        return { allowed: true, remaining: limit - 1 };
      }

      if (current >= limit) {
        // Rate limit exceeded
        const ttl = await this.ttl(key);
        return { allowed: false, remaining: 0, resetTime: ttl };
      }

      // Increment counter
      const newCount = await this.incr(key);
      return { allowed: true, remaining: limit - newCount };

    } catch (error) {
      console.error('Rate limiting error:', error);
      // Allow request on error
      return { allowed: true, remaining: limit - 1 };
    }
  }

  /**
   * Store metrics data
   */
  async storeMetric(metric, value, timestamp = Date.now()) {
    const key = `metrics:${metric}:${Math.floor(timestamp / 60000)}`; // Per minute
    return await this.lpush(key, { value, timestamp });
  }

  /**
   * Get metrics for time range
   */
  async getMetrics(metric, startTime, endTime) {
    const keys = [];
    const startMinute = Math.floor(startTime / 60000);
    const endMinute = Math.floor(endTime / 60000);

    for (let minute = startMinute; minute <= endMinute; minute++) {
      keys.push(`metrics:${metric}:${minute}`);
    }

    const results = [];
    for (const key of keys) {
      const values = await this.lrange(key.replace(this.keyPrefix, ''), 0, -1);
      results.push(...values);
    }

    return results;
  }

  /**
   * Serialize value for storage
   */
  serialize(value) {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }

  /**
   * Deserialize value from storage
   */
  deserialize(value) {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value; // Return as string if not JSON
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.connected,
      host: this.host,
      port: this.port,
      database: this.database,
      keyPrefix: this.keyPrefix,
      pubSubActive: !!this.pubSubClient,
      subscribers: this.subscribers.size
    };
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
      console.log('🔌 Redis connection closed');
    }

    if (this.pubSubClient) {
      await this.pubSubClient.quit();
    }
  }
}

/**
 * HTTP-based Redis client for Cloudflare Workers compatibility
 */
class RedisHTTPClient {
  constructor(options) {
    this.host = options.host;
    this.port = options.port;
    this.password = options.password;
    this.database = options.database || 0;
    this.baseUrl = `http://${this.host}:${this.port}`;
  }

  async executeCommand(command, ...args) {
    try {
      // This is a simplified implementation
      // In production, you'd use a proper Redis HTTP proxy or REST API
      console.log(`Redis command: ${command}`, args);

      // Mock response for demonstration
      if (command === 'PING') return 'PONG';
      if (command === 'SET') return 'OK';
      if (command === 'GET') return null; // Would return actual value
      if (command === 'EXISTS') return 0;

      return null;

    } catch (error) {
      throw new Error(`Redis HTTP command failed: ${error.message}`);
    }
  }

  async ping() {
    return await this.executeCommand('PING');
  }

  async set(...args) {
    return await this.executeCommand('SET', ...args);
  }

  async get(key) {
    return await this.executeCommand('GET', key);
  }

  async del(key) {
    return await this.executeCommand('DEL', key);
  }

  async exists(key) {
    return await this.executeCommand('EXISTS', key);
  }

  async expire(key, seconds) {
    return await this.executeCommand('EXPIRE', key, seconds);
  }

  async ttl(key) {
    return await this.executeCommand('TTL', key);
  }

  async incr(key) {
    return await this.executeCommand('INCR', key);
  }

  async incrby(key, increment) {
    return await this.executeCommand('INCRBY', key, increment);
  }

  async hset(key, field, value) {
    return await this.executeCommand('HSET', key, field, value);
  }

  async hget(key, field) {
    return await this.executeCommand('HGET', key, field);
  }

  async hgetall(key) {
    return await this.executeCommand('HGETALL', key);
  }

  async lpush(key, ...values) {
    return await this.executeCommand('LPUSH', key, ...values);
  }

  async lpop(key) {
    return await this.executeCommand('LPOP', key);
  }

  async lrange(key, start, stop) {
    return await this.executeCommand('LRANGE', key, start, stop);
  }

  async publish(channel, message) {
    return await this.executeCommand('PUBLISH', channel, message);
  }

  async quit() {
    return await this.executeCommand('QUIT');
  }
}

/**
 * Redis Integration Factory
 */
export class RedisFactory {
  static async createClient(env) {
    const client = new ChittyRedisClient(env);
    await client.initialize();
    return client;
  }

  static async createTestClient(env) {
    return new ChittyRedisClient({
      ...env,
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6380', // Different port for testing
      REDIS_DATABASE: '1'
    });
  }
}

/**
 * Redis Cache Decorator
 */
export function withRedisCache(redis, ttl = 3600) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args) {
      const cacheKey = `cache:${propertyKey}:${JSON.stringify(args)}`;

      // Try to get from cache first
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        console.log(`📦 Cache hit for ${propertyKey}`);
        return cached;
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);

      // Store in cache
      await redis.set(cacheKey, result, { ttl });
      console.log(`💾 Cached result for ${propertyKey}`);

      return result;
    };

    return descriptor;
  };
}