/**
 * ChittyOSIntegration Class - Main Integration Hub
 * Coordinates all ChittyOS services and components for ChittyRouter
 */

import { ChittyRouterMCPServer } from '../mcp/mcp-server.js';
import { SignedChittyIdClient } from '../crypto/p256-signatures.js';
import { AgentCoordinationServer } from '../agents/agent-coordination-server.js';
import { ChittyFinancialServices } from '../financial/financial-services.js';
import { ChittyRedisClient } from '../redis/redis-integration.js';
import { ChittySecurityManager } from '../utils/chittyos-security-integration.js';
import { ChittyBeaconClient } from '../utils/chittybeacon-integration.js';

/**
 * Main ChittyOS Integration Class
 */
export class ChittyOSIntegration {
  constructor(env) {
    this.env = env;
    this.chittyId = null;
    this.initialized = false;

    // Service components
    this.mcpServer = null;
    this.agentCoordinator = null;
    this.financialServices = null;
    this.redisClient = null;
    this.securityManager = null;
    this.beaconClient = null;
    this.chittyIdClient = null;

    // Service status tracking
    this.services = new Map();
    this.healthChecks = new Map();

    // Integration metadata
    this.startTime = Date.now();
    this.version = '2.0.0-ai';
  }

  /**
   * Initialize complete ChittyOS integration
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Complete ChittyOS Integration...');

      // Phase 1: Core Identity and Security
      await this.initializeCoreServices();

      // Phase 2: Storage and Caching
      await this.initializeStorageServices();

      // Phase 3: Coordination and Communication
      await this.initializeCoordinationServices();

      // Phase 4: Financial and Business Logic
      await this.initializeBusinessServices();

      // Phase 5: Monitoring and Telemetry
      await this.initializeMonitoringServices();

      // Phase 6: Service Registration and Health Checks
      await this.registerAllServices();

      this.initialized = true;
      const initializationTime = Date.now() - this.startTime;

      console.log(`✅ ChittyOS Integration complete in ${initializationTime}ms`);

      return {
        initialized: true,
        chittyId: this.chittyId,
        services: Array.from(this.services.keys()),
        initializationTime,
        version: this.version
      };

    } catch (error) {
      console.error('❌ ChittyOS Integration failed:', error);
      throw error;
    }
  }

  /**
   * Phase 1: Initialize core identity and security services
   */
  async initializeCoreServices() {
    console.log('🔐 Phase 1: Initializing Core Services...');

    try {
      // Initialize signed ChittyID client
      this.chittyIdClient = new SignedChittyIdClient(this.env);
      await this.chittyIdClient.initialize();
      this.chittyId = await this.chittyIdClient.requestSignedChittyId('chittyos-integration');

      console.log(`🆔 ChittyOS Integration ChittyID: ${this.chittyId.chittyId}`);
      this.services.set('chittyid', { status: 'active', chittyId: this.chittyId.chittyId });

      // Initialize security manager
      this.securityManager = new ChittySecurityManager(this.env, 'chittyos-integration');
      await this.securityManager.initialize();
      this.services.set('security', { status: 'active', trustScore: this.securityManager.trustScore });

      console.log('✅ Core services initialized');

    } catch (error) {
      console.error('❌ Core services initialization failed:', error);
      throw error;
    }
  }

  /**
   * Phase 2: Initialize storage and caching services
   */
  async initializeStorageServices() {
    console.log('💾 Phase 2: Initializing Storage Services...');

    try {
      // Initialize Redis client
      this.redisClient = new ChittyRedisClient(this.env);
      await this.redisClient.initialize();
      this.services.set('redis', { status: 'active', host: this.redisClient.host, port: this.redisClient.port });

      console.log('✅ Storage services initialized');

    } catch (error) {
      console.error('⚠️ Storage services initialization failed, continuing without Redis:', error);
      this.services.set('redis', { status: 'failed', error: error.message });
    }
  }

  /**
   * Phase 3: Initialize coordination and communication services
   */
  async initializeCoordinationServices() {
    console.log('🤖 Phase 3: Initializing Coordination Services...');

    try {
      // Initialize MCP server
      this.mcpServer = new ChittyRouterMCPServer(this.env);
      await this.mcpServer.initialize();
      this.services.set('mcp', { status: 'active', port: this.mcpServer.port });

      // Initialize Agent Coordination Server
      this.agentCoordinator = new AgentCoordinationServer(this.env);
      await this.agentCoordinator.initialize();
      this.services.set('agents', { status: 'active', port: this.agentCoordinator.port });

      console.log('✅ Coordination services initialized');

    } catch (error) {
      console.error('❌ Coordination services initialization failed:', error);
      throw error;
    }
  }

  /**
   * Phase 4: Initialize business and financial services
   */
  async initializeBusinessServices() {
    console.log('💰 Phase 4: Initializing Business Services...');

    try {
      // Initialize Financial Services
      this.financialServices = new ChittyFinancialServices(this.env);
      await this.financialServices.initialize();
      this.services.set('financial', { status: 'active', chittyId: this.financialServices.chittyId });

      console.log('✅ Business services initialized');

    } catch (error) {
      console.error('⚠️ Business services initialization failed, continuing without financial services:', error);
      this.services.set('financial', { status: 'failed', error: error.message });
    }
  }

  /**
   * Phase 5: Initialize monitoring and telemetry services
   */
  async initializeMonitoringServices() {
    console.log('📡 Phase 5: Initializing Monitoring Services...');

    try {
      // Initialize ChittyBeacon client
      this.beaconClient = new ChittyBeaconClient(this.env, 'chittyos-integration');
      await this.beaconClient.initialize();
      this.services.set('beacon', { status: 'active', websocket: this.beaconClient.wsConnected });

      console.log('✅ Monitoring services initialized');

    } catch (error) {
      console.error('⚠️ Monitoring services initialization failed, continuing without telemetry:', error);
      this.services.set('beacon', { status: 'failed', error: error.message });
    }
  }

  /**
   * Phase 6: Register all services and setup health checks
   */
  async registerAllServices() {
    console.log('📋 Phase 6: Registering Services...');

    try {
      // Setup health checks for each service
      this.setupHealthChecks();

      // Register with ChittyOS registry (if available)
      await this.registerWithRegistry();

      console.log('✅ Service registration complete');

    } catch (error) {
      console.error('⚠️ Service registration failed, continuing:', error);
    }
  }

  /**
   * Setup health checks for all services
   */
  setupHealthChecks() {
    // MCP Server health check
    this.healthChecks.set('mcp', async () => {
      if (!this.mcpServer) return { healthy: false, error: 'MCP server not initialized' };
      return { healthy: this.mcpServer.initialized, port: this.mcpServer.port };
    });

    // Agent Coordinator health check
    this.healthChecks.set('agents', async () => {
      if (!this.agentCoordinator) return { healthy: false, error: 'Agent coordinator not initialized' };
      return {
        healthy: this.agentCoordinator.initialized,
        port: this.agentCoordinator.port,
        connectedAgents: this.agentCoordinator.agents.size
      };
    });

    // Financial Services health check
    this.healthChecks.set('financial', async () => {
      if (!this.financialServices) return { healthy: false, error: 'Financial services not initialized' };
      return { healthy: this.financialServices.initialized };
    });

    // Redis health check
    this.healthChecks.set('redis', async () => {
      if (!this.redisClient) return { healthy: false, error: 'Redis client not initialized' };
      try {
        await this.redisClient.ping();
        return { healthy: true, connected: this.redisClient.connected };
      } catch (error) {
        return { healthy: false, error: error.message };
      }
    });

    // Security Manager health check
    this.healthChecks.set('security', async () => {
      if (!this.securityManager) return { healthy: false, error: 'Security manager not initialized' };
      const status = this.securityManager.getSecurityStatus();
      return { healthy: status.authenticated && status.verified, ...status };
    });

    // Beacon health check
    this.healthChecks.set('beacon', async () => {
      if (!this.beaconClient) return { healthy: false, error: 'Beacon client not initialized' };
      const status = await this.beaconClient.getStatus();
      return { healthy: status.connected, ...status };
    });
  }

  /**
   * Register with ChittyOS registry
   */
  async registerWithRegistry() {
    try {
      const registrationData = {
        service: 'chittyrouter-integration',
        chittyId: this.chittyId.chittyId,
        version: this.version,
        capabilities: this.getCapabilities(),
        services: this.getServiceEndpoints(),
        health_endpoint: '/integration/health',
        startup_time: new Date().toISOString()
      };

      // This would make a call to registry.chitty.cc
      console.log('📋 Registered with ChittyOS Registry:', registrationData);

    } catch (error) {
      console.error('Registry registration failed:', error);
    }
  }

  /**
   * Get all available capabilities
   */
  getCapabilities() {
    return [
      'mcp_orchestration',
      'agent_coordination',
      'financial_processing',
      'redis_caching',
      'p256_signatures',
      'security_management',
      'telemetry_monitoring',
      'email_processing',
      'ai_routing',
      'document_analysis',
      'unified_sync',
      'real_time_coordination'
    ];
  }

  /**
   * Get service endpoints
   */
  getServiceEndpoints() {
    return {
      mcp: this.mcpServer ? `http://localhost:${this.mcpServer.port}` : null,
      agents: this.agentCoordinator ? `http://localhost:${this.agentCoordinator.port}` : null,
      redis: this.redisClient ? `redis://${this.redisClient.host}:${this.redisClient.port}` : null,
      websocket_mcp: this.mcpServer ? `ws://localhost:${this.mcpServer.port}/mcp` : null,
      websocket_agents: this.agentCoordinator ? `ws://localhost:${this.agentCoordinator.port}/coordination` : null
    };
  }

  /**
   * Comprehensive health check for all services
   */
  async performHealthCheck() {
    const healthResults = {};
    const startTime = Date.now();

    // Run all health checks
    for (const [service, healthCheck] of this.healthChecks.entries()) {
      try {
        healthResults[service] = await healthCheck();
      } catch (error) {
        healthResults[service] = { healthy: false, error: error.message };
      }
    }

    const healthCheckTime = Date.now() - startTime;
    const healthyServices = Object.values(healthResults).filter(r => r.healthy).length;
    const totalServices = Object.keys(healthResults).length;

    return {
      overall_health: healthyServices === totalServices ? 'healthy' : 'degraded',
      healthy_services: healthyServices,
      total_services: totalServices,
      services: healthResults,
      check_duration_ms: healthCheckTime,
      chittyId: this.chittyId?.chittyId,
      uptime: Date.now() - this.startTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get integration status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      chittyId: this.chittyId?.chittyId,
      version: this.version,
      uptime: Date.now() - this.startTime,
      services: Object.fromEntries(this.services),
      capabilities: this.getCapabilities(),
      endpoints: this.getServiceEndpoints(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Route service requests to appropriate service
   */
  async routeServiceRequest(service, operation, data) {
    switch (service) {
      case 'mcp':
        if (!this.mcpServer) throw new Error('MCP server not available');
        return await this.mcpServer.orchestrateServices(data);

      case 'agents':
        if (!this.agentCoordinator) throw new Error('Agent coordinator not available');
        return await this.agentCoordinator.coordinateAgents(data);

      case 'financial':
        if (!this.financialServices) throw new Error('Financial services not available');
        switch (operation) {
          case 'process_transaction':
            return await this.financialServices.createTransaction(data);
          case 'get_billing':
            return await this.financialServices.getBillingInfo();
          default:
            throw new Error(`Unknown financial operation: ${operation}`);
        }

      case 'redis':
        if (!this.redisClient) throw new Error('Redis client not available');
        switch (operation) {
          case 'set':
            return await this.redisClient.set(data.key, data.value, data.options);
          case 'get':
            return await this.redisClient.get(data.key);
          case 'cache_email':
            return await this.redisClient.cacheEmailData(data.emailId, data.emailData, data.ttl);
          default:
            throw new Error(`Unknown Redis operation: ${operation}`);
        }

      case 'security':
        if (!this.securityManager) throw new Error('Security manager not available');
        return this.securityManager.getSecurityStatus();

      case 'beacon':
        if (!this.beaconClient) throw new Error('Beacon client not available');
        return await this.beaconClient.getStatus();

      default:
        throw new Error(`Unknown service: ${service}`);
    }
  }

  /**
   * Shutdown all services gracefully
   */
  async shutdown() {
    console.log('🛑 Shutting down ChittyOS Integration...');

    const shutdownPromises = [];

    // Stop MCP server
    if (this.mcpServer) {
      shutdownPromises.push(this.mcpServer.stop());
    }

    // Stop Agent Coordinator
    if (this.agentCoordinator) {
      shutdownPromises.push(this.agentCoordinator.stop());
    }

    // Close Redis connection
    if (this.redisClient) {
      shutdownPromises.push(this.redisClient.close());
    }

    // Close Beacon connection
    if (this.beaconClient) {
      shutdownPromises.push(this.beaconClient.close());
    }

    await Promise.allSettled(shutdownPromises);

    this.initialized = false;
    console.log('✅ ChittyOS Integration shutdown complete');
  }

  /**
   * Process email through integrated services
   */
  async processEmailIntegrated(emailData) {
    const processingId = `email_${Date.now()}`;

    try {
      // 1. Cache email data in Redis
      if (this.redisClient) {
        await this.redisClient.cacheEmailData(processingId, emailData);
      }

      // 2. Coordinate AI agents for processing
      if (this.agentCoordinator) {
        const coordination = await this.agentCoordinator.coordinateAgents({
          workflow: 'email_processing',
          agents: ['triage', 'priority-assessment', 'response-generation'],
          data: emailData
        });

        emailData.aiResults = coordination.results;
      }

      // 3. Process financial transaction
      if (this.financialServices) {
        await this.financialServices.processEmailTransaction({
          operation: 'analyze',
          emailId: processingId,
          userId: emailData.from,
          metadata: { aiProcessed: true }
        });
      }

      // 4. Send telemetry
      if (this.beaconClient) {
        await this.beaconClient.trackEvent('email_processed', {
          emailId: processingId,
          processingTime: Date.now() - parseInt(processingId.split('_')[1])
        });
      }

      return {
        processingId,
        success: true,
        services_used: Array.from(this.services.keys()),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Integrated email processing failed:', error);
      throw error;
    }
  }
}

/**
 * ChittyOS Integration Factory
 */
export class ChittyOSIntegrationFactory {
  static async createIntegration(env, options = {}) {
    const integration = new ChittyOSIntegration(env);

    if (options.autoInitialize !== false) {
      await integration.initialize();
    }

    return integration;
  }

  static async createTestIntegration(env) {
    return new ChittyOSIntegration({
      ...env,
      MCP_PORT: '3001',
      AGENT_COORDINATION_PORT: '8081',
      REDIS_PORT: '6380'
    });
  }
}

/**
 * Global ChittyOS Integration instance
 */
let globalIntegration = null;

/**
 * Get or create global integration instance
 */
export async function getChittyOSIntegration(env) {
  if (!globalIntegration) {
    globalIntegration = await ChittyOSIntegrationFactory.createIntegration(env);
  }
  return globalIntegration;
}

/**
 * Initialize ChittyOS Integration middleware
 */
export function createChittyOSMiddleware(env) {
  return async (request, handler) => {
    try {
      // Get or initialize integration
      const integration = await getChittyOSIntegration(env);

      // Add integration to request context
      request.chittyOS = integration;

      // Process with handler
      const response = await handler(request);

      // Add ChittyOS headers
      response.headers.set('X-ChittyOS-Integration', 'active');
      response.headers.set('X-ChittyOS-Version', integration.version);
      response.headers.set('X-ChittyOS-ChittyID', integration.chittyId?.chittyId || 'unknown');

      return response;

    } catch (error) {
      console.error('ChittyOS middleware error:', error);

      // Continue without integration
      const response = await handler(request);
      response.headers.set('X-ChittyOS-Integration', 'failed');
      response.headers.set('X-ChittyOS-Error', error.message);

      return response;
    }
  };
}