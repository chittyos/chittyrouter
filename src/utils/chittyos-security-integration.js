/**
 * ChittyOS Complete Security Integration
 * Integrates ChittyScore, ChittyTrust, ChittyVerify, and ChittyAuth
 * Full security pipeline for worker authentication and validation
 */

import { ChittyBeaconClient } from "./chittybeacon-integration.js";
import { ChittyIdClient } from "./chittyid-integration.js";

const CHITTYOS_SERVICES = {
  score: "https://score.chitty.cc/api/v1",
  trust: "https://trust.chitty.cc/api/v1",
  verify: "https://verify.chitty.cc/api/v1",
  auth: "https://auth.chitty.cc/api/v1",
  beacon: "https://beacon.chitty.cc/api/v1",
};

/**
 * ChittyOS Security Manager
 * Orchestrates all security validations for workers
 */
export class ChittySecurityManager {
  constructor(env, workerName) {
    this.env = env;
    this.workerName = workerName;
    this.chittyId = null;
    this.authToken = null;
    this.verificationStatus = null;
    this.trustScore = 0;
    this.performanceScore = 0;

    // Security state
    this.authenticated = false;
    this.verified = false;
    this.trusted = false;
    this.lastSecurityCheck = null;
  }

  /**
   * Complete security initialization pipeline
   */
  async initializeSecurity() {
    try {
      console.log(
        `🔐 Initializing ChittyOS security for ${this.workerName}...`,
      );

      // Step 1: Get/Verify ChittyID
      this.chittyId = await this.ensureChittyId();

      // Step 2: Authenticate with ChittyAuth using ChittyID
      await this.authenticateWithChittyAuth();

      // Step 3: Verify code/version with ChittyVerify
      await this.verifyWithChittyVerify();

      // Step 4: Establish trust with ChittyTrust
      await this.establishTrust();

      // Step 5: Initialize performance scoring with ChittyScore
      await this.initializePerformanceScoring();

      // Step 6: Register with ChittyBeacon for monitoring
      await this.registerWithBeacon();

      console.log(`✅ Security initialization complete for ${this.workerName}`);
      console.log(`   ChittyID: ${this.chittyId}`);
      console.log(`   Authenticated: ${this.authenticated}`);
      console.log(`   Verified: ${this.verified}`);
      console.log(`   Trust Score: ${this.trustScore}`);

      return {
        success: true,
        chittyId: this.chittyId,
        authenticated: this.authenticated,
        verified: this.verified,
        trustScore: this.trustScore,
        performanceScore: this.performanceScore,
      };
    } catch (error) {
      console.error("❌ Security initialization failed:", error);
      throw new ChittySecurityError("Security initialization failed", error);
    }
  }

  /**
   * Step 1: Ensure worker has valid ChittyID
   */
  async ensureChittyId() {
    console.log("🆔 Ensuring ChittyID...");

    const chittyId = await ChittyIdClient.ensure(this.env, this.workerName);

    // Verify ChittyID is valid
    const verification = await ChittyIdClient.verify(chittyId);
    if (!verification.valid) {
      throw new Error(`Invalid ChittyID: ${chittyId}`);
    }

    console.log(`✅ ChittyID verified: ${chittyId}`);
    return chittyId;
  }

  /**
   * Step 2: Authenticate with ChittyAuth using ChittyID
   */
  async authenticateWithChittyAuth() {
    console.log("🔑 Authenticating with ChittyAuth...");

    const authRequest = {
      chittyId: this.chittyId,
      workerName: this.workerName,
      authType: "WORKER_SERVICE",
      capabilities: this.getWorkerCapabilities(),
      environment: this.env.ENVIRONMENT,
      version: this.env.VERSION,
      timestamp: new Date().toISOString(),
      // Include worker-specific proof
      proof: await this.generateWorkerProof(),
    };

    const response = await fetch(`${CHITTYOS_SERVICES.auth}/authenticate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ChittyID": this.chittyId,
        "X-Worker-Name": this.workerName,
      },
      body: JSON.stringify(authRequest),
    });

    if (!response.ok) {
      throw new Error(`ChittyAuth authentication failed: ${response.status}`);
    }

    const authResult = await response.json();
    this.authToken = authResult.token;
    this.authenticated = authResult.authenticated;

    // Store auth token for future requests
    this.env.CHITTY_AUTH_TOKEN = this.authToken;

    console.log(`✅ Authenticated with ChittyAuth: ${this.authenticated}`);
    return authResult;
  }

  /**
   * Step 3: Verify code/version with ChittyVerify
   */
  async verifyWithChittyVerify() {
    console.log("🔍 Verifying with ChittyVerify...");

    const verificationRequest = {
      chittyId: this.chittyId,
      workerName: this.workerName,
      version: this.env.VERSION,
      codeHash: await this.calculateCodeHash(),
      dependencies: this.getWorkerDependencies(),
      capabilities: this.getWorkerCapabilities(),
      environment: this.env.ENVIRONMENT,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(`${CHITTYOS_SERVICES.verify}/verify-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ChittyID": this.chittyId,
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(verificationRequest),
    });

    if (!response.ok) {
      throw new Error(`ChittyVerify verification failed: ${response.status}`);
    }

    const verifyResult = await response.json();
    this.verificationStatus = verifyResult.status;
    this.verified = verifyResult.verified;

    console.log(`✅ Verification status: ${this.verificationStatus}`);
    return verifyResult;
  }

  /**
   * Step 4: Establish trust with ChittyTrust
   */
  async establishTrust() {
    console.log("🤝 Establishing trust with ChittyTrust...");

    const trustRequest = {
      chittyId: this.chittyId,
      workerName: this.workerName,
      verificationStatus: this.verificationStatus,
      authToken: this.authToken,
      historicalPerformance: await this.getHistoricalPerformance(),
      securityCompliance: await this.getSecurityCompliance(),
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(`${CHITTYOS_SERVICES.trust}/establish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ChittyID": this.chittyId,
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(trustRequest),
    });

    if (!response.ok) {
      throw new Error(`ChittyTrust establishment failed: ${response.status}`);
    }

    const trustResult = await response.json();
    this.trustScore = trustResult.trustScore;
    this.trusted = trustResult.trusted;

    console.log(`✅ Trust established - Score: ${this.trustScore}/100`);
    return trustResult;
  }

  /**
   * Step 5: Initialize performance scoring with ChittyScore
   */
  async initializePerformanceScoring() {
    console.log("📊 Initializing ChittyScore performance tracking...");

    const scoreRequest = {
      chittyId: this.chittyId,
      workerName: this.workerName,
      baselineMetrics: await this.collectBaselineMetrics(),
      capabilities: this.getWorkerCapabilities(),
      expectedLoad: this.getExpectedLoad(),
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(`${CHITTYOS_SERVICES.score}/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ChittyID": this.chittyId,
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(scoreRequest),
    });

    if (!response.ok) {
      throw new Error(`ChittyScore initialization failed: ${response.status}`);
    }

    const scoreResult = await response.json();
    this.performanceScore = scoreResult.initialScore;

    console.log(
      `✅ Performance scoring initialized - Score: ${this.performanceScore}/100`,
    );
    return scoreResult;
  }

  /**
   * Step 6: Register with ChittyBeacon for monitoring
   */
  async registerWithBeacon() {
    console.log("📡 Registering with ChittyBeacon...");

    this.beacon = new ChittyBeaconClient(this.env, this.workerName);
    await this.beacon.initialize();

    // Send security status to beacon
    await this.beacon.sendBeacon("security.initialized", {
      chittyId: this.chittyId,
      authenticated: this.authenticated,
      verified: this.verified,
      trustScore: this.trustScore,
      performanceScore: this.performanceScore,
    });

    console.log("✅ ChittyBeacon registration complete");
  }

  /**
   * Middleware for request authentication
   */
  createAuthMiddleware() {
    return async (request, handler) => {
      // Verify authentication for each request
      if (!(await this.validateRequestAuth(request))) {
        return new Response("Unauthorized", {
          status: 401,
          headers: {
            "X-ChittyID": this.chittyId,
            "WWW-Authenticate": 'ChittyAuth realm="chittyos"',
          },
        });
      }

      // Track request through security pipeline
      const startTime = Date.now();
      const response = await handler(request);
      const duration = Date.now() - startTime;

      // Update performance score
      await this.updatePerformanceScore(request, response, duration);

      // Add security headers
      response.headers.set("X-ChittyID", this.chittyId);
      response.headers.set("X-Authenticated", this.authenticated.toString());
      response.headers.set("X-Verified", this.verified.toString());
      response.headers.set("X-Trust-Score", this.trustScore.toString());

      return response;
    };
  }

  /**
   * Validate request authentication
   */
  async validateRequestAuth(request) {
    try {
      // Check for valid auth token
      const authHeader = request.headers.get("Authorization");
      if (!authHeader && this.requiresAuth(request)) {
        return false;
      }

      // Validate with ChittyAuth
      const validation = await fetch(`${CHITTYOS_SERVICES.auth}/validate`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "X-ChittyID": this.chittyId,
        },
        body: JSON.stringify({
          chittyId: this.chittyId,
          requestPath: new URL(request.url).pathname,
        }),
      });

      return validation.ok;
    } catch (error) {
      console.error("Auth validation error:", error);
      return false;
    }
  }

  /**
   * Update performance score based on request handling
   */
  async updatePerformanceScore(request, response, duration) {
    try {
      const metrics = {
        chittyId: this.chittyId,
        requestPath: new URL(request.url).pathname,
        method: request.method,
        status: response.status,
        duration,
        timestamp: Date.now(),
      };

      await fetch(`${CHITTYOS_SERVICES.score}/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ChittyID": this.chittyId,
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify(metrics),
      });

      // Also track in beacon
      await this.beacon?.trackRequest(request, response, duration, {
        trustScore: this.trustScore,
        performanceScore: this.performanceScore,
      });
    } catch (error) {
      console.error("Performance score update failed:", error);
    }
  }

  /**
   * Periodic security checks
   */
  async performSecurityCheck() {
    console.log("🔒 Performing periodic security check...");

    try {
      // Re-verify trust score
      const trustCheck = await fetch(`${CHITTYOS_SERVICES.trust}/check`, {
        method: "POST",
        headers: {
          "X-ChittyID": this.chittyId,
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          chittyId: this.chittyId,
          lastCheck: this.lastSecurityCheck,
        }),
      });

      if (trustCheck.ok) {
        const trustResult = await trustCheck.json();
        this.trustScore = trustResult.trustScore;
      }

      // Get latest performance score
      const scoreCheck = await fetch(`${CHITTYOS_SERVICES.score}/current`, {
        headers: {
          "X-ChittyID": this.chittyId,
          Authorization: `Bearer ${this.authToken}`,
        },
      });

      if (scoreCheck.ok) {
        const scoreResult = await scoreCheck.json();
        this.performanceScore = scoreResult.currentScore;
      }

      this.lastSecurityCheck = new Date().toISOString();

      // Alert if scores drop below thresholds
      if (this.trustScore < 70 || this.performanceScore < 60) {
        await this.sendSecurityAlert();
      }

      console.log(
        `🔒 Security check complete - Trust: ${this.trustScore}, Performance: ${this.performanceScore}`,
      );
    } catch (error) {
      console.error("Security check failed:", error);
    }
  }

  /**
   * Send security alert
   */
  async sendSecurityAlert() {
    const alert = {
      type: "SECURITY_DEGRADATION",
      chittyId: this.chittyId,
      workerName: this.workerName,
      trustScore: this.trustScore,
      performanceScore: this.performanceScore,
      timestamp: new Date().toISOString(),
    };

    await this.beacon?.sendBeacon("security.alert", alert, "high");
  }

  /**
   * Helper functions
   */
  async generateWorkerProof() {
    // Generate proof that this is a legitimate worker
    // Use crypto.randomUUID() for secure nonce generation
    const nonce = crypto.randomUUID();

    const proof = {
      timestamp: Date.now(),
      environment: this.env.ENVIRONMENT,
      capabilities: this.getWorkerCapabilities().join(","),
      nonce: nonce,
    };

    // Simple hash as proof (in production, use proper cryptographic signature)
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(proof));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return { proof, hash: hashHex };
  }

  async calculateCodeHash() {
    // In a real implementation, this would hash the actual worker code
    // For now, use version + worker name as a simple hash
    const codeString = `${this.workerName}-${this.env.VERSION}-${this.env.ENVIRONMENT}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(codeString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

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

  async getHistoricalPerformance() {
    // Placeholder - would fetch from ChittyScore history
    return {
      averageResponseTime: 150,
      uptime: 99.9,
      errorRate: 0.1,
      throughput: 1000,
    };
  }

  async getSecurityCompliance() {
    return {
      encryptionEnabled: true,
      auditLogging: true,
      accessControls: true,
      dataProtection: true,
    };
  }

  async collectBaselineMetrics() {
    return {
      memoryUsage: 50, // MB
      cpuUsage: 10, // %
      networkLatency: 20, // ms
      diskUsage: 100, // MB
    };
  }

  getExpectedLoad() {
    return {
      requestsPerSecond: 100,
      concurrentUsers: 50,
      peakHours: ["09:00-12:00", "14:00-17:00"],
    };
  }

  requiresAuth(request) {
    const url = new URL(request.url);
    const publicPaths = ["/health", "/metrics", "/status"];
    return !publicPaths.includes(url.pathname);
  }

  /**
   * Get security status summary
   */
  getSecurityStatus() {
    return {
      chittyId: this.chittyId,
      authenticated: this.authenticated,
      verified: this.verified,
      trusted: this.trusted,
      trustScore: this.trustScore,
      performanceScore: this.performanceScore,
      lastSecurityCheck: this.lastSecurityCheck,
      authToken: this.authToken ? "***" : null,
    };
  }
}

/**
 * Custom error class for security issues
 */
export class ChittySecurityError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = "ChittySecurityError";
    this.originalError = originalError;
  }
}

/**
 * Initialize complete ChittyOS security for a worker
 */
export async function initializeChittyOSSecurity(env, workerName) {
  const securityManager = new ChittySecurityManager(env, workerName);
  await securityManager.initializeSecurity();

  // Start periodic security checks (every 5 minutes)
  setInterval(() => {
    securityManager.performSecurityCheck();
  }, 300000);

  return securityManager;
}

// ChittySecurityManager is already exported as a class above
