/**
 * MCP (Model Context Protocol) Server for ChittyRouter
 * Main orchestration hub running on port 3000
 * Coordinates all ChittyRouter services and integrations
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { ChittyIdClient } from '../utils/chittyid-integration.js';
import { ChittySecurityManager } from '../utils/chittyos-security-integration.js';
import { ChittyBeaconClient } from '../utils/chittybeacon-integration.js';

/**
 * MCP Server for ChittyRouter orchestration
 */
export class ChittyRouterMCPServer {
  constructor(env) {
    this.env = env;
    this.port = parseInt(env.MCP_PORT || '3000');
    this.server = null;
    this.wss = null;
    this.clients = new Map();
    this.services = new Map();
    this.chittyId = null;
    this.securityManager = null;
    this.beacon = null;
    this.initialized = false;
  }

  /**
   * Initialize MCP server with ChittyOS integration
   */
  async initialize() {
    try {
      console.log('🔄 Initializing ChittyRouter MCP Server...');

      // Get ChittyID for server
      this.chittyId = await ChittyIdClient.ensure(this.env, 'chittyrouter-mcp');
      console.log(`🆔 MCP Server ChittyID: ${this.chittyId}`);

      // Initialize security
      this.securityManager = new ChittySecurityManager(this.env, 'chittyrouter-mcp');
      await this.securityManager.initialize();

      // Initialize telemetry
      this.beacon = new ChittyBeaconClient(this.env, 'chittyrouter-mcp');
      await this.beacon.initialize();

      // Create HTTP server
      this.server = createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Create WebSocket server
      this.wss = new WebSocketServer({
        server: this.server,
        path: '/mcp'
      });

      // Handle WebSocket connections
      this.wss.on('connection', (ws, req) => {
        this.handleWebSocketConnection(ws, req);
      });

      // Start server
      this.server.listen(this.port, () => {
        console.log(`🚀 ChittyRouter MCP Server listening on port ${this.port}`);
        console.log(`📡 WebSocket endpoint: ws://localhost:${this.port}/mcp`);
      });

      this.initialized = true;
      await this.registerServices();

      return { initialized: true, port: this.port, chittyId: this.chittyId };

    } catch (error) {
      console.error('❌ Failed to initialize MCP server:', error);
      throw error;
    }
  }

  /**
   * Handle HTTP requests to MCP server
   */
  async handleHttpRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);

    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-ChittyID');
    res.setHeader('X-ChittyID', this.chittyId);
    res.setHeader('X-Service', 'chittyrouter-mcp');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // Security check for protected endpoints
      if (url.pathname !== '/health' && url.pathname !== '/status') {
        const authResult = await this.securityManager?.validateRequest(req);
        if (!authResult?.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }));
          return;
        }
      }

      switch (url.pathname) {
        case '/health':
          await this.handleHealthCheck(req, res);
          break;
        case '/status':
          await this.handleStatus(req, res);
          break;
        case '/services':
          await this.handleServices(req, res);
          break;
        case '/orchestrate':
          await this.handleOrchestration(req, res);
          break;
        case '/agents':
          await this.handleAgentCoordination(req, res);
          break;
        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
      }

    } catch (error) {
      console.error('MCP HTTP error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Handle WebSocket connections
   */
  async handleWebSocketConnection(ws, req) {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`📡 MCP WebSocket client connected: ${clientId}`);

    // Store client
    this.clients.set(clientId, {
      id: clientId,
      ws,
      connected: Date.now(),
      authenticated: false
    });

    // Handle messages
    ws.on('message', async (data) => {
      await this.handleWebSocketMessage(clientId, data);
    });

    // Handle disconnect
    ws.on('close', () => {
      console.log(`📡 MCP WebSocket client disconnected: ${clientId}`);
      this.clients.delete(clientId);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      server: 'chittyrouter-mcp',
      chittyId: this.chittyId,
      clientId,
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * Handle WebSocket messages
   */
  async handleWebSocketMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);

      if (!client) {
        return;
      }

      console.log(`📨 MCP message from ${clientId}:`, message.type);

      switch (message.type) {
        case 'authenticate':
          await this.handleClientAuthentication(clientId, message);
          break;
        case 'subscribe':
          await this.handleSubscription(clientId, message);
          break;
        case 'orchestrate':
          await this.handleWebSocketOrchestration(clientId, message);
          break;
        case 'agent_command':
          await this.handleAgentCommand(clientId, message);
          break;
        case 'ping':
          client.ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
        default:
          client.ws.send(JSON.stringify({
            type: 'error',
            error: 'Unknown message type',
            receivedType: message.type
          }));
      }

    } catch (error) {
      console.error(`WebSocket message error for ${clientId}:`, error);
      const client = this.clients.get(clientId);
      if (client) {
        client.ws.send(JSON.stringify({
          type: 'error',
          error: error.message
        }));
      }
    }
  }

  /**
   * Handle client authentication
   */
  async handleClientAuthentication(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // Validate ChittyAuth token
      const authResult = await this.securityManager?.validateToken(message.token);

      if (authResult?.valid) {
        client.authenticated = true;
        client.chittyId = message.chittyId;

        client.ws.send(JSON.stringify({
          type: 'authenticated',
          success: true,
          clientId,
          timestamp: new Date().toISOString()
        }));

        console.log(`🔑 Client ${clientId} authenticated with ChittyID: ${message.chittyId}`);
      } else {
        client.ws.send(JSON.stringify({
          type: 'authentication_failed',
          error: 'Invalid token or ChittyID',
          timestamp: new Date().toISOString()
        }));
      }

    } catch (error) {
      console.error(`Authentication error for ${clientId}:`, error);
      client.ws.send(JSON.stringify({
        type: 'authentication_failed',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  }

  /**
   * Handle health check endpoint
   */
  async handleHealthCheck(req, res) {
    const health = {
      service: 'chittyrouter-mcp',
      status: 'healthy',
      port: this.port,
      chittyId: this.chittyId,
      initialized: this.initialized,
      connections: this.clients.size,
      services: Array.from(this.services.keys()),
      security: this.securityManager?.getSecurityStatus() || null,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  }

  /**
   * Handle status endpoint
   */
  async handleStatus(req, res) {
    const status = {
      server: {
        chittyId: this.chittyId,
        port: this.port,
        uptime: process.uptime(),
        initialized: this.initialized
      },
      websocket: {
        clients: this.clients.size,
        authenticatedClients: Array.from(this.clients.values()).filter(c => c.authenticated).length
      },
      services: Object.fromEntries(this.services),
      security: this.securityManager?.getSecurityStatus(),
      beacon: await this.beacon?.getStatus(),
      timestamp: new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  }

  /**
   * Handle services endpoint
   */
  async handleServices(req, res) {
    const services = {
      mcp: {
        status: 'active',
        port: this.port,
        chittyId: this.chittyId,
        connections: this.clients.size
      },
      ...Object.fromEntries(this.services)
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(services, null, 2));
  }

  /**
   * Handle orchestration endpoint
   */
  async handleOrchestration(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const orchestrationRequest = JSON.parse(body);
        const result = await this.orchestrateServices(orchestrationRequest);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }

  /**
   * Handle agent coordination endpoint
   */
  async handleAgentCoordination(req, res) {
    const agents = {
      available: [
        'intelligent-router',
        'email-processor',
        'agent-orchestrator',
        'triage-agent',
        'priority-agent',
        'response-agent',
        'document-agent'
      ],
      active: Array.from(this.services.keys()).filter(s => s.includes('agent')),
      mcp_coordination: true,
      websocket_control: true
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(agents, null, 2));
  }

  /**
   * Register available services
   */
  async registerServices() {
    // Register core ChittyRouter services
    this.services.set('chittyrouter-ai', {
      status: 'available',
      endpoint: '/process',
      description: 'AI-powered email routing'
    });

    this.services.set('agent-orchestrator', {
      status: 'available',
      endpoint: '/agents',
      description: 'Multi-agent coordination'
    });

    this.services.set('email-worker', {
      status: 'available',
      endpoint: '/email',
      description: 'Email processing worker'
    });

    this.services.set('unified-sync', {
      status: 'available',
      endpoint: '/sync',
      description: 'Unified sync orchestration'
    });

    console.log('📋 Registered services:', Array.from(this.services.keys()));
  }

  /**
   * Orchestrate multiple services
   */
  async orchestrateServices(request) {
    const { services, operation, data, options = {} } = request;

    console.log('🎭 Orchestrating services:', services, 'operation:', operation);

    const results = {};
    const errors = {};

    // Execute services in parallel or sequence based on options
    if (options.sequential) {
      for (const service of services) {
        try {
          results[service] = await this.executeServiceOperation(service, operation, data);
        } catch (error) {
          errors[service] = error.message;
        }
      }
    } else {
      const promises = services.map(async (service) => {
        try {
          const result = await this.executeServiceOperation(service, operation, data);
          return { service, result, success: true };
        } catch (error) {
          return { service, error: error.message, success: false };
        }
      });

      const outcomes = await Promise.allSettled(promises);

      outcomes.forEach((outcome) => {
        if (outcome.status === 'fulfilled') {
          const { service, result, error, success } = outcome.value;
          if (success) {
            results[service] = result;
          } else {
            errors[service] = error;
          }
        } else {
          errors['unknown'] = outcome.reason?.message || 'Unknown error';
        }
      });
    }

    // Broadcast results to WebSocket clients
    this.broadcastToClients({
      type: 'orchestration_result',
      operation,
      results,
      errors,
      timestamp: new Date().toISOString()
    });

    return {
      orchestration_id: `orch_${Date.now()}`,
      operation,
      results,
      errors,
      success: Object.keys(errors).length === 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Execute operation on specific service
   */
  async executeServiceOperation(service, operation, data) {
    // This would typically make HTTP requests to service endpoints
    // For now, return mock results based on service type

    const serviceConfig = this.services.get(service);
    if (!serviceConfig) {
      throw new Error(`Service ${service} not found`);
    }

    console.log(`⚡ Executing ${operation} on ${service}`);

    // Mock execution - replace with actual service calls
    return {
      service,
      operation,
      data: data || {},
      executed_at: new Date().toISOString(),
      mock: true
    };
  }

  /**
   * Broadcast message to all authenticated WebSocket clients
   */
  broadcastToClients(message) {
    const authenticatedClients = Array.from(this.clients.values())
      .filter(client => client.authenticated);

    authenticatedClients.forEach(client => {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Failed to send message to client ${client.id}:`, error);
      }
    });

    console.log(`📡 Broadcast to ${authenticatedClients.length} clients`);
  }

  /**
   * Stop MCP server
   */
  async stop() {
    if (this.server) {
      console.log('🛑 Stopping ChittyRouter MCP Server...');

      // Close all WebSocket connections
      this.clients.forEach((client) => {
        client.ws.close();
      });
      this.clients.clear();

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
      }

      // Close HTTP server
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('✅ ChittyRouter MCP Server stopped');
          resolve();
        });
      });
    }
  }
}

/**
 * Initialize and start MCP server
 */
export async function startMCPServer(env) {
  const server = new ChittyRouterMCPServer(env);
  await server.initialize();
  return server;
}

/**
 * MCP Server factory for different environments
 */
export class MCPServerFactory {
  static async createServer(env, options = {}) {
    const server = new ChittyRouterMCPServer(env);

    if (options.autoStart !== false) {
      await server.initialize();
    }

    return server;
  }

  static async createTestServer(env) {
    return this.createServer({
      ...env,
      MCP_PORT: '3001' // Use different port for testing
    }, { autoStart: false });
  }
}