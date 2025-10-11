/**
 * ChittyOS Telemetry & Monitoring System
 * Comprehensive observability for all workers with ChittyID tracking
 */

import { ChittyIdClient } from "./chittyid-integration.js";

const TELEMETRY_ENDPOINTS = {
  analytics: "https://analytics.chitty.cc/api/v1",
  metrics: "https://metrics.chitty.cc/api/v1",
  logs: "https://logs.chitty.cc/api/v1",
  traces: "https://traces.chitty.cc/api/v1",
  alerts: "https://alerts.chitty.cc/api/v1",
};

/**
 * Telemetry Client with ChittyID integration
 */
export class ChittyTelemetry {
  constructor(env, workerName) {
    this.env = env;
    this.workerName = workerName;
    this.chittyId = env.WORKER_CHITTYID || null;
    this.sessionId = null; // Will be set by init()
    this.startTime = Date.now();

    // Metrics collectors
    this.metrics = new Map();
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();

    // Event buffer for batch sending
    this.eventBuffer = [];
    this.bufferTimer = null;
  }

  /**
   * Initialize telemetry with ChittyID
   */
  async initialize() {
    if (!this.chittyId) {
      this.chittyId = await ChittyIdClient.ensure(this.env, this.workerName);
    }

    // Set sessionId
    if (!this.sessionId) {
      this.sessionId = await this.generateChittyId();
    }

    // Send initialization event
    await this.trackEvent("worker.initialized", {
      workerName: this.workerName,
      chittyId: this.chittyId,
      environment: this.env.ENVIRONMENT,
      version: this.env.VERSION,
      sessionId: this.sessionId,
    });

    // Start periodic metrics collection
    this.startMetricsCollection();

    console.log(
      `Telemetry initialized for ${this.workerName} (${this.chittyId})`,
    );
  }

  /**
   * Generate a ChittyID for this session
   */
  async generateChittyId() {
    try {
      return await ChittyIdClient.mint(this.env, "telemetry-session");
    } catch (error) {
      // Fallback to basic ID
      return `session-${Date.now()}`;
    }
  }

  /**
   * Track events with ChittyID context
   */
  async trackEvent(eventName, properties = {}) {
    const event = {
      event: eventName,
      chittyId: this.chittyId,
      workerName: this.workerName,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      properties: {
        ...properties,
        environment: this.env.ENVIRONMENT,
        region: this.env.CF_RAY?.split("-")[1] || "unknown",
      },
    };

    // Buffer events for batch sending
    this.eventBuffer.push(event);

    // Send immediately for critical events
    if (this.isCriticalEvent(eventName)) {
      await this.flushEvents();
    } else if (this.eventBuffer.length >= 50) {
      // Auto-flush when buffer is full
      await this.flushEvents();
    }
  }

  /**
   * Track HTTP requests with full context
   */
  async trackRequest(request, response, duration) {
    const url = new URL(request.url);

    await this.trackEvent("http.request", {
      method: request.method,
      path: url.pathname,
      search: url.search,
      status: response?.status || 0,
      duration,
      userAgent: request.headers.get("user-agent"),
      referer: request.headers.get("referer"),
      contentLength: response?.headers.get("content-length") || 0,
      requestId: response?.headers.get("x-request-id"),
    });

    // Update metrics
    this.incrementCounter("http.requests.total");
    this.incrementCounter(
      `http.requests.status.${response?.status || "unknown"}`,
    );
    this.recordHistogram("http.request.duration", duration);
  }

  /**
   * Track AI operations
   */
  async trackAIOperation(
    operation,
    model,
    input,
    output,
    duration,
    success = true,
  ) {
    await this.trackEvent("ai.operation", {
      operation,
      model,
      inputTokens: this.estimateTokens(input),
      outputTokens: this.estimateTokens(output),
      duration,
      success,
      cost: this.estimateCost(model, input, output),
    });

    this.incrementCounter("ai.operations.total");
    this.incrementCounter(`ai.operations.${operation}`);
    this.recordHistogram("ai.operation.duration", duration);
  }

  /**
   * Track sync operations
   */
  async trackSyncOperation(syncType, itemCount, duration, success = true) {
    await this.trackEvent("sync.operation", {
      syncType,
      itemCount,
      duration,
      success,
      throughput: itemCount / (duration / 1000), // items per second
    });

    this.incrementCounter("sync.operations.total");
    this.incrementCounter(`sync.operations.${syncType}`);
    this.setGauge("sync.last_batch_size", itemCount);
  }

  /**
   * Track errors with context
   */
  async trackError(error, context = {}) {
    const errorEvent = {
      error: error.name || "Error",
      message: error.message,
      stack: error.stack,
      code: error.code,
      context: {
        ...context,
        url: context.request?.url,
        method: context.request?.method,
      },
    };

    await this.trackEvent("error.occurred", errorEvent);

    // Send to alerting system for critical errors
    if (this.isCriticalError(error)) {
      await this.sendAlert("critical_error", errorEvent);
    }

    this.incrementCounter("errors.total");
    this.incrementCounter(`errors.${error.name || "unknown"}`);
  }

  /**
   * Record performance metrics
   */
  incrementCounter(name, value = 1) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  setGauge(name, value) {
    this.gauges.set(name, value);
  }

  recordHistogram(name, value) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name).push({
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    const now = Date.now();
    const uptime = now - this.startTime;

    return {
      chittyId: this.chittyId,
      workerName: this.workerName,
      sessionId: this.sessionId,
      uptime,
      timestamp: new Date().toISOString(),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: this.getHistogramStats(),
    };
  }

  /**
   * Start periodic metrics collection
   */
  startMetricsCollection() {
    // Collect metrics every 30 seconds
    setInterval(async () => {
      await this.collectSystemMetrics();
      await this.sendMetrics();
    }, 30000);

    // Flush events every 10 seconds
    this.bufferTimer = setInterval(async () => {
      if (this.eventBuffer.length > 0) {
        await this.flushEvents();
      }
    }, 10000);
  }

  /**
   * Collect system-level metrics
   */
  async collectSystemMetrics() {
    // Memory usage (if available)
    if (typeof process !== "undefined" && process.memoryUsage) {
      const memory = process.memoryUsage();
      this.setGauge("memory.heap.used", memory.heapUsed);
      this.setGauge("memory.heap.total", memory.heapTotal);
    }

    // Cloudflare-specific metrics
    if (this.env.AI_ANALYTICS) {
      // Worker invocation count
      this.incrementCounter("cf.worker.invocations");
    }

    // KV operations
    if (this.env.AI_CACHE) {
      this.setGauge("kv.namespace.connected", 1);
    }

    // Durable Objects health
    if (this.env.AI_STATE_DO) {
      this.setGauge("durable_objects.connected", 1);
    }
  }

  /**
   * Send metrics to telemetry backend
   */
  async sendMetrics() {
    try {
      const metrics = this.getMetrics();

      // Send to Cloudflare Analytics Engine if available
      if (this.env.AI_ANALYTICS) {
        const dataPoints = this.convertToDataPoints(metrics);
        await this.env.AI_ANALYTICS.writeDataPoints(dataPoints);
      }

      // Send to external metrics endpoint
      await fetch(`${TELEMETRY_ENDPOINTS.metrics}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ChittyID": this.chittyId,
          "X-Worker-Name": this.workerName,
        },
        body: JSON.stringify(metrics),
      });
    } catch (error) {
      console.error("Failed to send metrics:", error);
    }
  }

  /**
   * Flush event buffer
   */
  async flushEvents() {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      // Send to analytics endpoint
      await fetch(`${TELEMETRY_ENDPOINTS.analytics}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ChittyID": this.chittyId,
          "X-Worker-Name": this.workerName,
          "X-Batch-Size": events.length.toString(),
        },
        body: JSON.stringify({ events }),
      });
    } catch (error) {
      console.error("Failed to send events:", error);
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...events);
    }
  }

  /**
   * Send alert for critical issues
   */
  async sendAlert(severity, details) {
    try {
      const alert = {
        severity,
        chittyId: this.chittyId,
        workerName: this.workerName,
        timestamp: new Date().toISOString(),
        details,
      };

      await fetch(`${TELEMETRY_ENDPOINTS.alerts}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ChittyID": this.chittyId,
        },
        body: JSON.stringify(alert),
      });
    } catch (error) {
      console.error("Failed to send alert:", error);
    }
  }

  /**
   * Convert metrics to Cloudflare Analytics Engine format
   */
  convertToDataPoints(metrics) {
    const dataPoints = [];
    const timestamp = Date.now();

    // Counters
    for (const [name, value] of Object.entries(metrics.counters)) {
      dataPoints.push({
        timestamp,
        indexes: [this.chittyId, this.workerName, name],
        doubles: [value],
      });
    }

    // Gauges
    for (const [name, value] of Object.entries(metrics.gauges)) {
      dataPoints.push({
        timestamp,
        indexes: [this.chittyId, this.workerName, name],
        doubles: [value],
      });
    }

    return dataPoints;
  }

  /**
   * Calculate histogram statistics
   */
  getHistogramStats() {
    const stats = {};

    for (const [name, values] of this.histograms) {
      const nums = values.map((v) => v.value).sort((a, b) => a - b);
      if (nums.length > 0) {
        stats[name] = {
          count: nums.length,
          min: nums[0],
          max: nums[nums.length - 1],
          mean: nums.reduce((a, b) => a + b, 0) / nums.length,
          p50: this.percentile(nums, 0.5),
          p95: this.percentile(nums, 0.95),
          p99: this.percentile(nums, 0.99),
        };
      }
    }

    return stats;
  }

  /**
   * Helper functions
   */
  percentile(sorted, p) {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sorted.length) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  isCriticalEvent(eventName) {
    return ["error.occurred", "worker.crashed", "ai.operation.failed"].includes(
      eventName,
    );
  }

  isCriticalError(error) {
    return (
      error.name === "AIProcessingError" ||
      error.message?.includes("timeout") ||
      error.message?.includes("memory")
    );
  }

  estimateTokens(text) {
    return Math.ceil((text?.length || 0) / 4);
  }

  estimateCost(model, input, output) {
    const inputTokens = this.estimateTokens(input);
    const outputTokens = this.estimateTokens(output);

    // Rough cost estimates (adjust based on actual pricing)
    const costs = {
      "@cf/meta/llama-3.1-8b-instruct": { input: 0.0001, output: 0.0002 },
    };

    const modelCost = costs[model] || costs["@cf/meta/llama-3.1-8b-instruct"];
    return inputTokens * modelCost.input + outputTokens * modelCost.output;
  }

  /**
   * Cleanup on worker shutdown
   */
  async cleanup() {
    clearInterval(this.bufferTimer);
    await this.flushEvents();
    await this.trackEvent("worker.shutdown");
  }
}

/**
 * Request middleware with telemetry
 */
export function telemetryMiddleware(telemetry) {
  return async (request, handler) => {
    const startTime = Date.now();
    let response;
    let error;

    try {
      response = await handler(request);
      return response;
    } catch (err) {
      error = err;
      throw err;
    } finally {
      const duration = Date.now() - startTime;

      // Track the request
      await telemetry.trackRequest(request, response, duration);

      // Track error if occurred
      if (error) {
        await telemetry.trackError(error, { request });
      }
    }
  };
}

/**
 * Health check endpoint with telemetry
 */
export function createHealthEndpoint(telemetry) {
  return async () => {
    const metrics = telemetry.getMetrics();
    const health = {
      status: "healthy",
      chittyId: telemetry.chittyId,
      workerName: telemetry.workerName,
      uptime: metrics.uptime,
      version: telemetry.env.VERSION,
      environment: telemetry.env.ENVIRONMENT,
      metrics: {
        requests: metrics.counters["http.requests.total"] || 0,
        errors: metrics.counters["errors.total"] || 0,
        ai_operations: metrics.counters["ai.operations.total"] || 0,
        last_error: metrics.gauges.last_error_timestamp,
      },
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(health), {
      headers: {
        "Content-Type": "application/json",
        "X-ChittyID": telemetry.chittyId,
        "X-Health-Status": "healthy",
      },
    });
  };
}
