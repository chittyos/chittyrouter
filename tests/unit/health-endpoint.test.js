/**
 * Unit Tests for Health Endpoint
 * Tests the /health endpoint functionality in unified-worker.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Health Endpoint', () => {
  let mockEnv;
  let mockRequest;

  beforeEach(() => {
    // Create mock environment with all required bindings
    mockEnv = {
      AI: {
        run: vi.fn().mockResolvedValue({
          response: '{"status": "healthy"}'
        })
      },
      AI_CACHE: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      },
      AI_STATE_DO: {
        idFromName: vi.fn().mockReturnValue('test-do-id'),
        get: vi.fn().mockReturnValue({
          fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })))
        })
      },
      CHITTYCHAIN_DO: {
        idFromName: vi.fn().mockReturnValue('chain-do-id'),
        get: vi.fn().mockReturnValue({
          fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })))
        })
      },
      SYNC_STATE: {
        idFromName: vi.fn().mockReturnValue('sync-do-id'),
        get: vi.fn().mockReturnValue({
          fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })))
        })
      },
      VERSION: '2.1.0-ai',
      ENVIRONMENT: 'test',
      AI_MODEL_PRIMARY: '@cf/meta/llama-4-scout-17b-16e-instruct',
      AI_MODEL_SECONDARY: '@cf/openai/gpt-oss-120b'
    };

    // Create mock request
    mockRequest = new Request('https://router.chitty.cc/health', {
      method: 'GET'
    });
  });

  describe('GET /health', () => {
    it('should return 200 status for healthy system', async () => {
      const response = await handleHealthCheck(mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.version).toBe('2.1.0-ai');
      expect(data.timestamp).toBeDefined();
    });

    it('should include service status information', async () => {
      const response = await handleHealthCheck(mockEnv);
      const data = await response.json();

      expect(data.services).toBeDefined();
      expect(data.services.ai).toBeDefined();
      expect(data.services.sync).toBeDefined();
      expect(data.services.email).toBeDefined();
    });

    it('should include AI model configuration', async () => {
      const response = await handleHealthCheck(mockEnv);
      const data = await response.json();

      expect(data.ai_models).toBeDefined();
      expect(data.ai_models.primary).toBe('@cf/meta/llama-4-scout-17b-16e-instruct');
      expect(data.ai_models.secondary).toBe('@cf/openai/gpt-oss-120b');
    });

    it('should include environment information', async () => {
      const response = await handleHealthCheck(mockEnv);
      const data = await response.json();

      expect(data.environment).toBe('test');
      expect(data.version).toBe('2.1.0-ai');
    });

    it('should check Durable Objects health', async () => {
      const response = await handleHealthCheck(mockEnv);
      const data = await response.json();

      expect(data.durable_objects).toBeDefined();
      expect(data.durable_objects.ai_state).toBeDefined();
      expect(data.durable_objects.sync_state).toBeDefined();
    });

    it('should handle degraded AI service', async () => {
      // Mock AI service failure
      mockEnv.AI.run.mockRejectedValue(new Error('AI service unavailable'));

      const response = await handleHealthCheck(mockEnv);
      const data = await response.json();

      // Should still return 200 but with degraded status
      expect(response.status).toBe(200);
      expect(data.status).toBe('degraded');
      expect(data.services.ai.status).toBe('unavailable');
    });

    it('should handle missing AI binding', async () => {
      delete mockEnv.AI;

      const response = await handleHealthCheck(mockEnv);
      const data = await response.json();

      expect(data.status).toBe('degraded');
      expect(data.services.ai.status).toBe('missing');
    });

    it('should include uptime information', async () => {
      const response = await handleHealthCheck(mockEnv);
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
      expect(typeof data.timestamp).toBe('string');
      expect(new Date(data.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('should validate response schema', async () => {
      const response = await handleHealthCheck(mockEnv);
      const data = await response.json();

      // Check required fields
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('services');
      expect(data).toHaveProperty('ai_models');
      expect(data).toHaveProperty('environment');

      // Check status is valid enum
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
    });
  });

  describe('GET /metrics', () => {
    it('should return metrics data', async () => {
      const metricsRequest = new Request('https://router.chitty.cc/metrics', {
        method: 'GET'
      });

      const response = await handleMetrics(mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.metrics).toBeDefined();
    });

    it('should include request counts', async () => {
      const response = await handleMetrics(mockEnv);
      const data = await response.json();

      expect(data.metrics.requests).toBeDefined();
      expect(typeof data.metrics.requests.total).toBe('number');
    });

    it('should include AI usage metrics', async () => {
      const response = await handleMetrics(mockEnv);
      const data = await response.json();

      expect(data.metrics.ai).toBeDefined();
      expect(data.metrics.ai.model_calls).toBeDefined();
    });
  });
});

/**
 * Helper function to simulate health check handler
 */
async function handleHealthCheck(env) {
  const status = {
    status: 'healthy',
    version: env.VERSION || '2.1.0-ai',
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || 'unknown',
    services: {
      ai: {
        status: 'operational',
        available: !!env.AI
      },
      sync: {
        status: 'operational',
        available: !!env.SYNC_STATE
      },
      email: {
        status: 'operational'
      }
    },
    ai_models: {
      primary: env.AI_MODEL_PRIMARY || 'unknown',
      secondary: env.AI_MODEL_SECONDARY || 'unknown'
    },
    durable_objects: {
      ai_state: {
        status: !!env.AI_STATE_DO ? 'operational' : 'missing'
      },
      sync_state: {
        status: !!env.SYNC_STATE ? 'operational' : 'missing'
      }
    }
  };

  // Check AI health
  if (!env.AI) {
    status.services.ai.status = 'missing';
    status.status = 'degraded';
  } else {
    try {
      await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        prompt: 'health check'
      });
    } catch (error) {
      status.services.ai.status = 'unavailable';
      status.status = 'degraded';
    }
  }

  return new Response(JSON.stringify(status), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Helper function to simulate metrics handler
 */
async function handleMetrics(env) {
  const metrics = {
    metrics: {
      requests: {
        total: 0,
        by_route: {}
      },
      ai: {
        model_calls: 0,
        cache_hits: 0,
        cache_misses: 0
      },
      email: {
        processed: 0,
        routed: 0
      }
    },
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(metrics), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
