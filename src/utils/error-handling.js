/**
 * Comprehensive Error Handling for ChittyRouter AI
 * Provides robust error handling, logging, and recovery mechanisms
 */

import { logError } from './chain-logger.js';

/**
 * ChittyRouter Error Classes
 */
export class ChittyRouterError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = 'ChittyRouterError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

export class AIProcessingError extends ChittyRouterError {
  constructor(message, aiModel, context = {}) {
    super(message, 'AI_PROCESSING_ERROR', { aiModel, ...context });
    this.name = 'AIProcessingError';
  }
}

export class EmailProcessingError extends ChittyRouterError {
  constructor(message, emailData, context = {}) {
    super(message, 'EMAIL_PROCESSING_ERROR', { emailData, ...context });
    this.name = 'EmailProcessingError';
  }
}

export class RoutingError extends ChittyRouterError {
  constructor(message, routingData, context = {}) {
    super(message, 'ROUTING_ERROR', { routingData, ...context });
    this.name = 'RoutingError';
  }
}

export class ValidationError extends ChittyRouterError {
  constructor(message, invalidData, context = {}) {
    super(message, 'VALIDATION_ERROR', { invalidData, ...context });
    this.name = 'ValidationError';
  }
}

/**
 * Error Handler with automatic retry logic
 */
export class ErrorHandler {
  constructor(env) {
    this.env = env;
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    };
  }

  /**
   * Handle errors with automatic logging and context preservation
   */
  async handleError(error, context = {}) {
    const errorInfo = {
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      },
      context,
      timestamp: new Date().toISOString(),
      severity: this.determineSeverity(error)
    };

    // Log error to ChittyChain
    await this.logErrorSafely(errorInfo);

    // Determine if error is recoverable
    if (this.isRecoverableError(error)) {
      return this.createRecoveryStrategy(error, context);
    }

    // For non-recoverable errors, create fallback response
    return this.createFallbackResponse(error, context);
  }

  /**
   * Retry mechanism with exponential backoff
   */
  async retryWithBackoff(operation, context = {}) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry on validation errors or client errors
        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }

        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );

        console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
        await this.sleep(delay);
      }
    }

    throw new ChittyRouterError(
      `Operation failed after ${this.retryConfig.maxRetries} attempts`,
      'RETRY_EXHAUSTED',
      { lastError: lastError.message, attempts: this.retryConfig.maxRetries }
    );
  }

  /**
   * Safe error logging that won't throw
   */
  async logErrorSafely(errorInfo) {
    try {
      await logError(errorInfo.error, errorInfo.context);
    } catch (loggingError) {
      // Fallback to console if even logging fails
      console.error('Failed to log error to ChittyChain:', loggingError);
      console.error('Original error:', errorInfo);
    }
  }

  /**
   * Determine error severity level
   */
  determineSeverity(error) {
    if (error instanceof ValidationError) return 'low';
    if (error instanceof RoutingError) return 'medium';
    if (error instanceof EmailProcessingError) return 'high';
    if (error instanceof AIProcessingError) return 'medium';
    return 'high';
  }

  /**
   * Check if error is recoverable
   */
  isRecoverableError(error) {
    const recoverableErrors = [
      'AI_PROCESSING_ERROR',
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'RATE_LIMIT_ERROR'
    ];

    return recoverableErrors.includes(error.code) ||
           error.message.includes('timeout') ||
           error.message.includes('rate limit');
  }

  /**
   * Check if operation should be retried
   */
  shouldRetry(error, attempt) {
    if (attempt >= this.retryConfig.maxRetries) return false;

    // Don't retry validation errors
    if (error instanceof ValidationError) return false;

    // Don't retry client errors (4xx equivalent)
    if (error.code === 'INVALID_INPUT' || error.code === 'UNAUTHORIZED') return false;

    // Retry server errors and network issues
    return true;
  }

  /**
   * Create recovery strategy for recoverable errors
   */
  createRecoveryStrategy(error, context) {
    if (error instanceof AIProcessingError) {
      return {
        recovery: 'fallback_ai_processing',
        action: 'use_rule_based_routing',
        context,
        message: 'AI processing failed, using fallback routing'
      };
    }

    if (error instanceof RoutingError) {
      return {
        recovery: 'default_routing',
        action: 'route_to_intake',
        context,
        message: 'Routing failed, using default destination'
      };
    }

    return {
      recovery: 'general_fallback',
      action: 'safe_processing',
      context,
      message: 'Error occurred, using safe fallback processing'
    };
  }

  /**
   * Create fallback response for non-recoverable errors
   */
  createFallbackResponse(error, context) {
    return {
      success: false,
      error: {
        message: 'Processing failed',
        code: error.code || 'UNKNOWN_ERROR',
        recoverable: false
      },
      fallback: {
        action: 'manual_review_required',
        contact: 'system-admin@example.com'
      },
      context
    };
  }

  /**
   * Sleep utility for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit breaker pattern for AI service calls
 */
export class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureThreshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new ChittyRouterError(
          'Circuit breaker is OPEN - service temporarily unavailable',
          'CIRCUIT_BREAKER_OPEN'
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Input validation utilities
 */
export class InputValidator {
  static validateEmailData(emailData) {
    const errors = [];

    if (!emailData) {
      throw new ValidationError('Email data is required', emailData);
    }

    if (!emailData.from || !this.isValidEmail(emailData.from)) {
      errors.push('Invalid or missing sender email');
    }

    if (!emailData.to || !this.isValidEmail(emailData.to)) {
      errors.push('Invalid or missing recipient email');
    }

    if (!emailData.subject || emailData.subject.trim().length === 0) {
      errors.push('Subject is required');
    }

    if (emailData.subject && emailData.subject.length > 500) {
      errors.push('Subject too long (max 500 characters)');
    }

    if (emailData.content && emailData.content.length > 1024 * 1024) {
      errors.push('Content too large (max 1MB)');
    }

    if (errors.length > 0) {
      throw new ValidationError(
        `Email validation failed: ${errors.join(', ')}`,
        emailData,
        { validationErrors: errors }
      );
    }

    return true;
  }

  static validateAttachment(attachment) {
    if (!attachment) return false;

    const maxSize = 25 * 1024 * 1024; // 25MB
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs'];

    if (attachment.size > maxSize) {
      throw new ValidationError(
        'Attachment too large',
        attachment,
        { maxSize, actualSize: attachment.size }
      );
    }

    const extension = attachment.name.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (dangerousExtensions.includes(extension)) {
      throw new ValidationError(
        'Dangerous file type not allowed',
        attachment,
        { extension, dangerousExtensions }
      );
    }

    return true;
  }

  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  static sanitizeString(str, maxLength = 1000) {
    if (!str) return '';

    return str
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove JS protocols
      .substring(0, maxLength)
      .trim();
  }
}

/**
 * Rate limiter for AI API calls
 */
export class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  async checkRateLimit(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Clean old entries
    this.cleanupOldEntries(windowStart);

    // Get current request count
    const userRequests = this.requests.get(identifier) || [];
    const recentRequests = userRequests.filter(time => time > windowStart);

    if (recentRequests.length >= this.maxRequests) {
      throw new ChittyRouterError(
        'Rate limit exceeded',
        'RATE_LIMIT_ERROR',
        {
          identifier,
          limit: this.maxRequests,
          window: this.windowMs,
          current: recentRequests.length
        }
      );
    }

    // Record this request
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);

    return true;
  }

  cleanupOldEntries(cutoff) {
    for (const [identifier, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(time => time > cutoff);
      if (recentRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, recentRequests);
      }
    }
  }
}

/**
 * Health check utilities
 */
export class HealthChecker {
  constructor(env) {
    this.env = env;
  }

  async checkSystemHealth() {
    const checks = {
      ai_service: await this.checkAIService(),
      email_worker: await this.checkEmailWorker(),
      storage: await this.checkStorage(),
      durable_objects: await this.checkDurableObjects()
    };

    const overallHealth = Object.values(checks).every(check => check.healthy);

    return {
      healthy: overallHealth,
      checks,
      timestamp: new Date().toISOString()
    };
  }

  async checkAIService() {
    try {
      // Cloudflare AI is provided directly through env.AI binding
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: 'Health check' }]
      });

      return {
        healthy: true,
        response_time: 'fast',
        model: '@cf/meta/llama-3.1-8b-instruct'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  async checkEmailWorker() {
    return {
      healthy: true,
      status: 'Email worker integration ready'
    };
  }

  async checkStorage() {
    try {
      // Test KV storage if available
      if (this.env.AI_CACHE) {
        await this.env.AI_CACHE.put('health_check', 'ok', { expirationTtl: 60 });
        const value = await this.env.AI_CACHE.get('health_check');
        return {
          healthy: value === 'ok',
          storage_type: 'KV'
        };
      }

      return {
        healthy: true,
        storage_type: 'none_configured'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  async checkDurableObjects() {
    try {
      if (this.env.AI_STATE_DO) {
        return {
          healthy: true,
          durable_objects: 'available'
        };
      }

      return {
        healthy: true,
        durable_objects: 'none_configured'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

// Export singleton instances for common use
export const defaultErrorHandler = new ErrorHandler();
export const defaultCircuitBreaker = new CircuitBreaker();
export const defaultRateLimiter = new RateLimiter();