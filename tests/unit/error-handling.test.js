/**
 * Unit Tests for Error Handling System
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorHandler,
  CircuitBreaker,
  InputValidator,
  RateLimiter,
  ChittyRouterError,
  AIProcessingError,
  EmailProcessingError,
  RoutingError,
  ValidationError
} from '../../src/utils/error-handling.js';

describe('Error Handling System', () => {
  let errorHandler;
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      AI_CACHE: {
        put: vi.fn(),
        get: vi.fn()
      }
    };
    errorHandler = new ErrorHandler(mockEnv);
  });

  describe('Custom Error Classes', () => {
    it('should create ChittyRouterError with proper properties', () => {
      const error = new ChittyRouterError('Test error', 'TEST_CODE', { test: 'context' });

      expect(error.name).toBe('ChittyRouterError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.context.test).toBe('context');
      expect(error.timestamp).toBeDefined();
    });

    it('should create specialized error types', () => {
      const aiError = new AIProcessingError('AI failed', '@cf/meta/llama-3.1-8b-instruct');
      const emailError = new EmailProcessingError('Email failed', { from: 'test@example.com' });
      const routingError = new RoutingError('Routing failed', { route: 'test' });
      const validationError = new ValidationError('Invalid data', { field: 'email' });

      expect(aiError.name).toBe('AIProcessingError');
      expect(emailError.name).toBe('EmailProcessingError');
      expect(routingError.name).toBe('RoutingError');
      expect(validationError.name).toBe('ValidationError');
    });
  });

  describe('ErrorHandler', () => {
    it('should handle recoverable errors with recovery strategy', async () => {
      const error = new AIProcessingError('AI service timeout', '@cf/meta/llama-3.1-8b-instruct');
      const result = await errorHandler.handleError(error, { operation: 'email_classification' });

      expect(result.recovery).toBe('fallback_ai_processing');
      expect(result.action).toBe('use_rule_based_routing');
    });

    it('should handle non-recoverable errors with fallback', async () => {
      const error = new ValidationError('Invalid email format', { email: 'invalid' });
      const result = await errorHandler.handleError(error);

      expect(result.success).toBe(false);
      expect(result.fallback.action).toBe('manual_review_required');
    });

    it('should retry operations with exponential backoff', async () => {
      let attempts = 0;
      const operation = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await errorHandler.retryWithBackoff(operation);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should stop retrying after max attempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(errorHandler.retryWithBackoff(operation)).rejects.toThrow('Operation failed after 3 attempts');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry validation errors', async () => {
      const operation = vi.fn().mockRejectedValue(new ValidationError('Invalid input', {}));

      await expect(errorHandler.retryWithBackoff(operation)).rejects.toThrow('Invalid input');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('CircuitBreaker', () => {
    let circuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker(2, 1000); // threshold: 2, timeout: 1s
    });

    it('should allow operations when circuit is closed', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });

    it('should open circuit after threshold failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Service failure'));

      // First failure
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service failure');
      expect(circuitBreaker.getState().state).toBe('CLOSED');

      // Second failure - should open circuit
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service failure');
      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Third attempt should be blocked
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should transition to half-open after timeout', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Service failure'));

      // Trigger circuit opening
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
      expect(circuitBreaker.getState().state).toBe('OPEN');

      // Mock time passage
      circuitBreaker.lastFailureTime = Date.now() - 2000; // 2 seconds ago

      // Should transition to half-open
      const successOperation = vi.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(successOperation);

      expect(result).toBe('success');
      expect(circuitBreaker.getState().state).toBe('CLOSED');
    });
  });

  describe('InputValidator', () => {
    it('should validate valid email data', () => {
      const validEmailData = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        content: 'Test content'
      };

      expect(() => InputValidator.validateEmailData(validEmailData)).not.toThrow();
    });

    it('should reject invalid email addresses', () => {
      const invalidEmailData = {
        from: 'invalid-email',
        to: 'recipient@example.com',
        subject: 'Test Subject'
      };

      expect(() => InputValidator.validateEmailData(invalidEmailData)).toThrow(ValidationError);
    });

    it('should reject missing required fields', () => {
      const incompleteEmailData = {
        from: 'sender@example.com'
        // missing to and subject
      };

      expect(() => InputValidator.validateEmailData(incompleteEmailData)).toThrow(ValidationError);
    });

    it('should reject oversized content', () => {
      const oversizedEmailData = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        content: 'x'.repeat(1024 * 1024 + 1) // > 1MB
      };

      expect(() => InputValidator.validateEmailData(oversizedEmailData)).toThrow(ValidationError);
    });

    it('should validate safe attachments', () => {
      const safeAttachment = {
        name: 'document.pdf',
        size: 1024 * 1024, // 1MB
        type: 'application/pdf'
      };

      expect(InputValidator.validateAttachment(safeAttachment)).toBe(true);
    });

    it('should reject dangerous file types', () => {
      const dangerousAttachment = {
        name: 'malware.exe',
        size: 1024,
        type: 'application/octet-stream'
      };

      expect(() => InputValidator.validateAttachment(dangerousAttachment)).toThrow(ValidationError);
    });

    it('should reject oversized attachments', () => {
      const oversizedAttachment = {
        name: 'large-file.pdf',
        size: 30 * 1024 * 1024, // 30MB
        type: 'application/pdf'
      };

      expect(() => InputValidator.validateAttachment(oversizedAttachment)).toThrow(ValidationError);
    });

    it('should sanitize dangerous strings', () => {
      const dangerousString = '<script>alert("xss")</script>javascript:void(0)';
      const sanitized = InputValidator.sanitizeString(dangerousString);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('javascript:');
    });
  });

  describe('RateLimiter', () => {
    let rateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter(3, 1000); // 3 requests per second
    });

    it('should allow requests within limit', async () => {
      await expect(rateLimiter.checkRateLimit('user1')).resolves.toBe(true);
      await expect(rateLimiter.checkRateLimit('user1')).resolves.toBe(true);
      await expect(rateLimiter.checkRateLimit('user1')).resolves.toBe(true);
    });

    it('should reject requests exceeding limit', async () => {
      await rateLimiter.checkRateLimit('user2');
      await rateLimiter.checkRateLimit('user2');
      await rateLimiter.checkRateLimit('user2');

      await expect(rateLimiter.checkRateLimit('user2')).rejects.toThrow('Rate limit exceeded');
    });

    it('should reset limits after time window', async () => {
      // Fill the rate limit
      await rateLimiter.checkRateLimit('user3');
      await rateLimiter.checkRateLimit('user3');
      await rateLimiter.checkRateLimit('user3');

      // Mock time passage
      vi.useFakeTimers();
      vi.advanceTimersByTime(1100); // Advance past the window

      await expect(rateLimiter.checkRateLimit('user3')).resolves.toBe(true);

      vi.useRealTimers();
    });

    it('should handle different users independently', async () => {
      await rateLimiter.checkRateLimit('user4');
      await rateLimiter.checkRateLimit('user4');
      await rateLimiter.checkRateLimit('user4');

      // user4 is at limit, but user5 should still work
      await expect(rateLimiter.checkRateLimit('user5')).resolves.toBe(true);
    });
  });

  describe('Error Recovery Strategies', () => {
    it('should provide appropriate recovery for AI errors', async () => {
      const error = new AIProcessingError('Model timeout', '@cf/meta/llama-3.1-8b-instruct');
      const recovery = errorHandler.createRecoveryStrategy(error, {});

      expect(recovery.recovery).toBe('fallback_ai_processing');
      expect(recovery.action).toBe('use_rule_based_routing');
    });

    it('should provide appropriate recovery for routing errors', async () => {
      const error = new RoutingError('Destination unreachable', { route: 'case-management@example.com' });
      const recovery = errorHandler.createRecoveryStrategy(error, {});

      expect(recovery.recovery).toBe('default_routing');
      expect(recovery.action).toBe('route_to_intake');
    });

    it('should provide general fallback for unknown errors', async () => {
      const error = new Error('Unknown system error');
      const recovery = errorHandler.createRecoveryStrategy(error, {});

      expect(recovery.recovery).toBe('general_fallback');
      expect(recovery.action).toBe('safe_processing');
    });
  });

  describe('Error Severity Assessment', () => {
    it('should correctly assess error severity levels', () => {
      const lowSeverity = new ValidationError('Invalid input', {});
      const mediumSeverity = new RoutingError('Route failed', {});
      const highSeverity = new EmailProcessingError('Email processing failed', {});

      expect(errorHandler.determineSeverity(lowSeverity)).toBe('low');
      expect(errorHandler.determineSeverity(mediumSeverity)).toBe('medium');
      expect(errorHandler.determineSeverity(highSeverity)).toBe('high');
    });

    it('should default to high severity for unknown errors', () => {
      const unknownError = new Error('Unknown error');
      expect(errorHandler.determineSeverity(unknownError)).toBe('high');
    });
  });
});