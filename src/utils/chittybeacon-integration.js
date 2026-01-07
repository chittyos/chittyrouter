/**
 * ChittyBeacon Integration
 * Central telemetry and monitoring hub for all ChittyOS workers
 * Routes all telemetry through beacon.chitty.cc
 */

import { ChittyIdClient } from "./chittyid-integration.js";

const CHITTYBEACON_API = "https://beacon.chitty.cc/api/v1";
const BEACON_WEBSOCKET = "wss://beacon.chitty.cc/ws";

/**
 * ChittyBeacon Client for real-time telemetry
 */
export class ChittyBeaconClient {
  constructor(env, workerName) {
    this.env = env;
    this.workerName = workerName;
    this.chittyId = env.WORKER_CHITTYID || null;
    this.beaconId = null;
    this.sessionId = null; // Will be set in init()
    this.startTime = Date.now();

    // Real-time connection
    this.websocket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    // Telemetry buffers
    this.metricsBuffer = [];
    this.eventsBuffer = [];
    this.logsBuffer = [];
    this.tracesBuffer = [];

    // Performance tracking
    this.requestTracker = new Map();
    this.operationCounter = 0;

    // Beacon registration
    this.registered = false;
  }

  /**
   * Initialize ChittyBeacon connection
   */
  async initialize() {
    try {
      // Ensure worker has ChittyID
      if (!this.chittyId) {
        this.chittyId = await ChittyIdClient.ensure(this.env, this.workerName);
      }

      // Register with ChittyBeacon
      await this.registerWithBeacon();

      // Establish WebSocket connection for real-time telemetry
      await this.connectWebSocket();

      // Start telemetry collection
      this.startTelemetryCollection();

      // Send initialization beacon
      await this.sendBeacon("worker.initialized", {
        workerName: this.workerName,
        chittyId: this.chittyId,
        beaconId: this.beaconId,
        environment: this.env.ENVIRONMENT,
        version: this.env.VERSION,
        capabilities: this.getWorkerCapabilities(),
      });

      console.log(
        `ChittyBeacon initialized: ${this.workerName} → ${this.beaconId}`,
      );
      return true;
    } catch (error) {
      console.error("ChittyBeacon initialization failed:", error);
      // Continue without telemetry rather than failing
      return false;
    }
  }

  /**
   * Register worker with ChittyBeacon hub
   */
  async registerWithBeacon() {
    const registration = {
      chittyId: this.chittyId,
      workerName: this.workerName,
      sessionId: this.sessionId,
      type: "CLOUDFLARE_WORKER",
      environment: this.env.ENVIRONMENT || "production",
      version: this.env.VERSION || "1.0.0",
      capabilities: this.getWorkerCapabilities(),
      dependencies: this.getWorkerDependencies(),
      resources: {
        kv: this.env.AI_CACHE ? ["AI_CACHE"] : [],
        r2: this.env.DOCUMENT_STORAGE ? ["DOCUMENT_STORAGE"] : [],
        durable_objects: this.getDurableObjects(),
        ai: !!this.env.AI,
      },
      endpoints: {
        health: `${this.getWorkerUrl()}/health`,
        metrics: `${this.getWorkerUrl()}/metrics`,
        status: `${this.getWorkerUrl()}/status`,
      },
      metadata: {
        region: this.env.CF_RAY?.split("-")[1] || "unknown",
        colo: this.env.CF_COLO || "unknown",
        country: this.env.CF_IPCOUNTRY || "unknown",
      },
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(`${CHITTYBEACON_API}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ChittyID": this.chittyId,
        "X-Worker-Name": this.workerName,
        Authorization: this.env.BEACON_TOKEN
          ? `Bearer ${this.env.BEACON_TOKEN}`
          : undefined,
      },
      body: JSON.stringify(registration),
    });

    if (!response.ok) {
      throw new Error(`Beacon registration failed: ${response.status}`);
    }

    const result = await response.json();
    this.beaconId = result.beaconId;
    this.registered = true;

    return result;
  }

  /**
   * Establish WebSocket connection for real-time telemetry
   */
  async connectWebSocket() {
    if (typeof WebSocket === "undefined") {
      console.log("WebSocket not available, using HTTP-only telemetry");
      return;
    }

    try {
      this.websocket = new WebSocket(
        `${BEACON_WEBSOCKET}?chittyId=${this.chittyId}&beaconId=${this.beaconId}`,
      );

      this.websocket.onopen = () => {
        console.log("ChittyBeacon WebSocket connected");
        this.reconnectAttempts = 0;
      };

      this.websocket.onclose = () => {
        console.log("ChittyBeacon WebSocket disconnected");
        this.scheduleReconnect();
      };

      this.websocket.onerror = (error) => {
        console.error("ChittyBeacon WebSocket error:", error);
      };

      this.websocket.onmessage = (event) => {
        this.handleBeaconMessage(JSON.parse(event.data));
      };
    } catch (error) {
      console.error("WebSocket connection failed:", error);
    }
  }

  /**
   * Send telemetry beacon (event/metric/log)
   */
  async sendBeacon(type, data, priority = "normal") {
    const beacon = {
      type,
      chittyId: this.chittyId,
      beaconId: this.beaconId,
      workerName: this.workerName,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      sequence: ++this.operationCounter,
      data,
      priority,
      metadata: {
        region: this.env.CF_RAY?.split("-")[1] || "unknown",
        requestId: this.env.REQUEST_ID || null,
      },
    };

    // Send immediately via WebSocket for high-priority events
    if (priority === "high" && this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(beacon));
      return;
    }

    // Buffer for batch sending
    this.eventsBuffer.push(beacon);

    // Auto-flush if buffer is full or high priority
    if (this.eventsBuffer.length >= 50 || priority === "high") {
      await this.flushBuffers();
    }
  }

  /**
   * Track HTTP request through ChittyBeacon
   */
  async trackRequest(request, response, duration, metadata = {}) {
    const url = new URL(request.url);
    const requestId =
      response?.headers.get("x-request-id") || crypto.randomUUID();

    await this.sendBeacon("http.request", {
      requestId,
      method: request.method,
      url: request.url,
      path: url.pathname,
      query: url.search,
      status: response?.status || 0,
      duration,
      size: {
        request: request.headers.get("content-length") || 0,
        response: response?.headers.get("content-length") || 0,
      },
      headers: {
        userAgent: request.headers.get("user-agent"),
        referer: request.headers.get("referer"),
        origin: request.headers.get("origin"),
      },
      geo: {
        country: request.cf?.country,
        city: request.cf?.city,
        colo: request.cf?.colo,
      },
      ...metadata,
    });

    // Track performance metrics
    await this.recordMetric("http_requests_total", 1, {
      method: request.method,
      status: response?.status || 0,
      path: url.pathname,
    });

    await this.recordMetric("http_request_duration", duration, {
      method: request.method,
      path: url.pathname,
    });
  }

  /**
   * Track AI operations through ChittyBeacon
   */
  async trackAIOperation(
    operation,
    model,
    input,
    output,
    duration,
    success = true,
    metadata = {},
  ) {
    const inputTokens = this.estimateTokens(input);
    const outputTokens = this.estimateTokens(output);
    const cost = this.estimateCost(model, inputTokens, outputTokens);

    await this.sendBeacon("ai.operation", {
      operation,
      model,
      input: {
        tokens: inputTokens,
        length: input?.length || 0,
        type: typeof input,
      },
      output: {
        tokens: outputTokens,
        length: output?.length || 0,
        type: typeof output,
      },
      performance: {
        duration,
        tokensPerSecond: outputTokens / (duration / 1000),
        success,
      },
      cost: {
        estimated: cost,
        currency: "USD",
        inputCost: cost * 0.6,
        outputCost: cost * 0.4,
      },
      ...metadata,
    });

    // Track AI metrics
    await this.recordMetric("ai_operations_total", 1, {
      operation,
      model,
      success: success.toString(),
    });

    await this.recordMetric("ai_operation_duration", duration, {
      operation,
      model,
    });
    await this.recordMetric("ai_tokens_processed", inputTokens + outputTokens, {
      model,
    });
    await this.recordMetric("ai_cost_usd", cost, { model });
  }

  /**
   * Track errors through ChittyBeacon
   */
  async trackError(error, context = {}) {
    await this.sendBeacon(
      "error.occurred",
      {
        error: {
          name: error.name || "Error",
          message: error.message,
          stack: error.stack,
          code: error.code || "UNKNOWN",
        },
        context: {
          ...context,
          url: context.request?.url,
          method: context.request?.method,
          userAgent: context.request?.headers?.get("user-agent"),
        },
        severity: this.getErrorSeverity(error),
        fingerprint: this.generateErrorFingerprint(error),
      },
      "high",
    );

    // Track error metrics
    await this.recordMetric("errors_total", 1, {
      type: error.name || "Error",
      code: error.code || "UNKNOWN",
    });
  }

  /**
   * Record metric through ChittyBeacon
   */
  async recordMetric(name, value, labels = {}) {
    const metric = {
      name,
      value,
      type: this.getMetricType(name),
      labels: {
        worker: this.workerName,
        environment: this.env.ENVIRONMENT,
        ...labels,
      },
      timestamp: Date.now(),
    };

    this.metricsBuffer.push(metric);
  }

  /**
   * Send structured logs through ChittyBeacon
   */
  async log(level, message, data = {}) {
    const logEntry = {
      level,
      message,
      data,
      source: this.workerName,
      timestamp: new Date().toISOString(),
      trace: {
        chittyId: this.chittyId,
        sessionId: this.sessionId,
        sequence: this.operationCounter,
      },
    };

    this.logsBuffer.push(logEntry);

    // Send high-priority logs immediately
    if (level === "error" || level === "fatal") {
      await this.flushBuffers();
    }
  }

  /**
   * Start distributed trace
   */
  async startTrace(operation, metadata = {}) {
    const traceId = crypto.randomUUID();
    const span = {
      traceId,
      spanId: crypto.randomUUID(),
      parentId: null,
      operation,
      startTime: Date.now(),
      metadata: {
        chittyId: this.chittyId,
        worker: this.workerName,
        ...metadata,
      },
    };

    this.requestTracker.set(traceId, span);
    return traceId;
  }

  /**
   * End distributed trace
   */
  async endTrace(traceId, success = true, metadata = {}) {
    const span = this.requestTracker.get(traceId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.success = success;
    span.metadata = { ...span.metadata, ...metadata };

    this.tracesBuffer.push(span);
    this.requestTracker.delete(traceId);

    await this.sendBeacon("trace.completed", span);
  }

  /**
   * Start telemetry collection timers
   */
  startTelemetryCollection() {
    // Flush buffers every 10 seconds
    setInterval(async () => {
      await this.flushBuffers();
    }, 10000);

    // Send heartbeat every 30 seconds
    setInterval(async () => {
      await this.sendHeartbeat();
    }, 30000);

    // Collect system metrics every 60 seconds
    setInterval(async () => {
      await this.collectSystemMetrics();
    }, 60000);
  }

  /**
   * Flush all telemetry buffers
   */
  async flushBuffers() {
    if (!this.registered) return;

    try {
      const payload = {
        chittyId: this.chittyId,
        beaconId: this.beaconId,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        events: [...this.eventsBuffer],
        metrics: [...this.metricsBuffer],
        logs: [...this.logsBuffer],
        traces: [...this.tracesBuffer],
      };

      // Clear buffers
      this.eventsBuffer = [];
      this.metricsBuffer = [];
      this.logsBuffer = [];
      this.tracesBuffer = [];

      // Skip if no data to send
      if (
        payload.events.length === 0 &&
        payload.metrics.length === 0 &&
        payload.logs.length === 0 &&
        payload.traces.length === 0
      ) {
        return;
      }

      // Send to ChittyBeacon
      await fetch(`${CHITTYBEACON_API}/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ChittyID": this.chittyId,
          "X-Beacon-ID": this.beaconId,
          Authorization: this.env.BEACON_TOKEN
            ? `Bearer ${this.env.BEACON_TOKEN}`
            : undefined,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Failed to flush telemetry buffers:", error);
    }
  }

  /**
   * Send heartbeat to ChittyBeacon
   */
  async sendHeartbeat() {
    const uptime = Date.now() - this.startTime;

    await this.sendBeacon("worker.heartbeat", {
      uptime,
      health: "healthy",
      performance: {
        requestsProcessed: this.operationCounter,
        memoryUsage: this.getMemoryUsage(),
        cpuUsage: this.getCPUUsage(),
      },
      connections: {
        websocket: this.websocket?.readyState === WebSocket.OPEN,
        durable_objects: !!this.env.AI_STATE_DO,
        kv: !!this.env.AI_CACHE,
        ai: !!this.env.AI,
      },
    });
  }

  /**
   * Collect system metrics
   */
  async collectSystemMetrics() {
    const uptime = Date.now() - this.startTime;

    await this.recordMetric("worker_uptime_seconds", uptime / 1000);
    await this.recordMetric("worker_operations_total", this.operationCounter);

    if (this.env.AI_CACHE) {
      await this.recordMetric("kv_connected", 1);
    }

    if (this.env.AI) {
      await this.recordMetric("ai_service_connected", 1);
    }
  }

  /**
   * Handle incoming beacon messages
   */
  handleBeaconMessage(message) {
    switch (message.type) {
      case "config_update":
        this.handleConfigUpdate(message.data);
        break;
      case "health_check":
        this.respondToHealthCheck(message.data);
        break;
      case "metrics_request":
        this.sendMetricsSnapshot();
        break;
      default:
        console.log("Unknown beacon message:", message.type);
    }
  }

  /**
   * Utility functions
   */
  getWorkerCapabilities() {
    const capabilities = [];
    if (this.env.AI) capabilities.push("ai");
    if (this.env.AI_CACHE) capabilities.push("kv");
    if (this.env.DOCUMENT_STORAGE) capabilities.push("r2");
    if (this.env.AI_STATE_DO) capabilities.push("durable_objects");
    return capabilities;
  }

  getWorkerDependencies() {
    const deps = {
      chittyrouter: ["chittyid", "chittychat", "chittychain"],
      chittychat: ["chittyid"],
      chittychain: ["chittyid"],
      chittyid: [],
    };
    return deps[this.workerName] || [];
  }

  getDurableObjects() {
    const objects = [];
    if (this.env.AI_STATE_DO) objects.push("AI_STATE_DO");
    if (this.env.CHITTYCHAIN_DO) objects.push("CHITTYCHAIN_DO");
    if (this.env.SYNC_STATE) objects.push("SYNC_STATE");
    return objects;
  }

  getWorkerUrl() {
    const urls = {
      chittyrouter: "https://router.chitty.cc",
      chittychat: "https://chat.chitty.cc",
      chittyid: "https://id.chitty.cc",
    };
    return urls[this.workerName] || `https://${this.workerName}.chitty.cc`;
  }

  getMetricType(name) {
    if (name.includes("_total")) return "counter";
    if (name.includes("_duration")) return "histogram";
    if (name.includes("_ratio") || name.includes("_percent")) return "gauge";
    return "gauge";
  }

  estimateTokens(text) {
    return Math.ceil((text?.length || 0) / 4);
  }

  estimateCost(model, inputTokens, outputTokens) {
    const costs = {
      "@cf/meta/llama-3.1-8b-instruct": { input: 0.0001, output: 0.0002 },
    };
    const modelCost = costs[model] || costs["@cf/meta/llama-3.1-8b-instruct"];
    return inputTokens * modelCost.input + outputTokens * modelCost.output;
  }

  getErrorSeverity(error) {
    if (error.name === "AIProcessingError") return "high";
    if (error.message?.includes("timeout")) return "medium";
    if (error.message?.includes("rate limit")) return "low";
    return "medium";
  }

  generateErrorFingerprint(error) {
    return btoa(`${error.name}:${error.message?.substring(0, 100)}`);
  }

  getMemoryUsage() {
    return typeof process !== "undefined" && process.memoryUsage
      ? process.memoryUsage().heapUsed
      : 0;
  }

  getCPUUsage() {
    return typeof process !== "undefined" && process.cpuUsage
      ? process.cpuUsage().user
      : 0;
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    const delay = Math.pow(2, this.reconnectAttempts) * 1000;
    this.reconnectAttempts++;

    setTimeout(() => {
      console.log(
        `Reconnecting to ChittyBeacon (attempt ${this.reconnectAttempts})`,
      );
      this.connectWebSocket();
    }, delay);
  }

  /**
   * Cleanup on worker shutdown
   */
  async cleanup() {
    await this.flushBuffers();
    await this.sendBeacon("worker.shutdown", {
      uptime: Date.now() - this.startTime,
      totalOperations: this.operationCounter,
    });

    if (this.websocket) {
      this.websocket.close();
    }
  }
}

/**
 * ChittyBeacon middleware for automatic request tracking
 */
export function chittyBeaconMiddleware(beacon) {
  return async (request, handler) => {
    const traceId = beacon.startTrace("http_request", {
      method: request.method,
      url: request.url,
    });

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

      // Track through ChittyBeacon
      await beacon.trackRequest(request, response, duration);

      if (error) {
        await beacon.trackError(error, { request, traceId });
      }

      await beacon.endTrace(traceId, !error, {
        status: response?.status,
        duration,
      });
    }
  };
}

// ChittyBeaconClient is already exported as a class above
