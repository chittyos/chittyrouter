/**
 * Agent Coordination Server for ChittyRouter
 * Manages multi-agent workflows and coordination on port 8080
 */

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { ChittyIdClient } from '../utils/chittyid-integration.js';
import { ChittySecurityManager } from '../utils/chittyos-security-integration.js';

/**
 * Agent Coordination Server
 */
export class AgentCoordinationServer {
  constructor(env) {
    this.env = env;
    this.port = parseInt(env.AGENT_COORDINATION_PORT || '8080');
    this.server = null;
    this.wss = null;
    this.agents = new Map();
    this.workflows = new Map();
    this.activeCoordinations = new Map();
    this.chittyId = null;
    this.securityManager = null;
    this.initialized = false;
  }

  /**
   * Initialize agent coordination server
   */
  async initialize() {
    try {
      console.log('🤖 Initializing Agent Coordination Server...');

      // Get ChittyID for coordination server
      this.chittyId = await ChittyIdClient.ensure(this.env, 'agent-coordinator');
      console.log(`🆔 Agent Coordinator ChittyID: ${this.chittyId}`);

      // Initialize security
      this.securityManager = new ChittySecurityManager(this.env, 'agent-coordinator');
      await this.securityManager.initialize();

      // Create HTTP server
      this.server = createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Create WebSocket server for real-time coordination
      this.wss = new WebSocketServer({
        server: this.server,
        path: '/coordination'
      });

      // Handle WebSocket connections
      this.wss.on('connection', (ws, req) => {
        this.handleAgentConnection(ws, req);
      });

      // Start server
      this.server.listen(this.port, () => {
        console.log(`🚀 Agent Coordination Server listening on port ${this.port}`);
        console.log(`🤖 Agent WebSocket endpoint: ws://localhost:${this.port}/coordination`);
      });

      // Register default agents
      await this.registerDefaultAgents();

      this.initialized = true;
      return { initialized: true, port: this.port, chittyId: this.chittyId };

    } catch (error) {
      console.error('❌ Failed to initialize Agent Coordination Server:', error);
      throw error;
    }
  }

  /**
   * Handle HTTP requests
   */
  async handleHttpRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);

    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-ChittyID');
    res.setHeader('X-ChittyID', this.chittyId);
    res.setHeader('X-Service', 'agent-coordinator');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // Security check for protected endpoints
      if (url.pathname !== '/health' && url.pathname !== '/agents/status') {
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
        case '/agents':
          await this.handleAgentsEndpoint(req, res);
          break;
        case '/agents/status':
          await this.handleAgentsStatus(req, res);
          break;
        case '/workflows':
          await this.handleWorkflowsEndpoint(req, res);
          break;
        case '/coordinate':
          await this.handleCoordinationEndpoint(req, res);
          break;
        case '/execute':
          await this.handleExecutionEndpoint(req, res);
          break;
        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not Found' }));
      }

    } catch (error) {
      console.error('Agent Coordination HTTP error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Handle agent WebSocket connections
   */
  async handleAgentConnection(ws, req) {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`🤖 Agent connected: ${agentId}`);

    // Store agent connection
    const agent = {
      id: agentId,
      ws,
      connected: Date.now(),
      authenticated: false,
      capabilities: [],
      status: 'connected'
    };

    this.agents.set(agentId, agent);

    // Handle messages from agent
    ws.on('message', async (data) => {
      await this.handleAgentMessage(agentId, data);
    });

    // Handle agent disconnect
    ws.on('close', () => {
      console.log(`🤖 Agent disconnected: ${agentId}`);
      this.agents.delete(agentId);
      this.broadcastAgentStatus();
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      coordinator: 'chittyrouter-agent-coordinator',
      chittyId: this.chittyId,
      agentId,
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * Handle messages from agents
   */
  async handleAgentMessage(agentId, data) {
    try {
      const message = JSON.parse(data.toString());
      const agent = this.agents.get(agentId);

      if (!agent) {
        return;
      }

      console.log(`📨 Agent message from ${agentId}:`, message.type);

      switch (message.type) {
        case 'register':
          await this.handleAgentRegistration(agentId, message);
          break;
        case 'status_update':
          await this.handleAgentStatusUpdate(agentId, message);
          break;
        case 'task_complete':
          await this.handleTaskCompletion(agentId, message);
          break;
        case 'task_failed':
          await this.handleTaskFailure(agentId, message);
          break;
        case 'request_coordination':
          await this.handleCoordinationRequest(agentId, message);
          break;
        case 'heartbeat':
          agent.ws.send(JSON.stringify({
            type: 'heartbeat_ack',
            timestamp: new Date().toISOString()
          }));
          break;
        default:
          agent.ws.send(JSON.stringify({
            type: 'error',
            error: 'Unknown message type',
            receivedType: message.type
          }));
      }

    } catch (error) {
      console.error(`Agent message error for ${agentId}:`, error);
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.ws.send(JSON.stringify({
          type: 'error',
          error: error.message
        }));
      }
    }
  }

  /**
   * Handle agent registration
   */
  async handleAgentRegistration(agentId, message) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    try {
      // Validate agent registration
      const { name, capabilities, version, chittyId } = message;

      if (!name || !capabilities || !Array.isArray(capabilities)) {
        throw new Error('Invalid registration: name and capabilities required');
      }

      // Update agent info
      agent.name = name;
      agent.capabilities = capabilities;
      agent.version = version;
      agent.chittyId = chittyId;
      agent.authenticated = true;
      agent.status = 'ready';
      agent.registeredAt = new Date().toISOString();

      // Send registration confirmation
      agent.ws.send(JSON.stringify({
        type: 'registered',
        agentId,
        coordinator: this.chittyId,
        assigned_capabilities: capabilities,
        timestamp: new Date().toISOString()
      }));

      console.log(`✅ Agent registered: ${name} with capabilities:`, capabilities);

      // Broadcast updated agent status
      this.broadcastAgentStatus();

    } catch (error) {
      console.error(`Agent registration error for ${agentId}:`, error);
      agent.ws.send(JSON.stringify({
        type: 'registration_failed',
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
      service: 'agent-coordinator',
      status: 'healthy',
      port: this.port,
      chittyId: this.chittyId,
      agents: {
        total: this.agents.size,
        authenticated: Array.from(this.agents.values()).filter(a => a.authenticated).length,
        ready: Array.from(this.agents.values()).filter(a => a.status === 'ready').length
      },
      workflows: {
        total: this.workflows.size,
        active: Array.from(this.workflows.values()).filter(w => w.status === 'running').length
      },
      coordinations: this.activeCoordinations.size,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  }

  /**
   * Handle agents endpoint
   */
  async handleAgentsEndpoint(req, res) {
    if (req.method === 'GET') {
      const agents = Array.from(this.agents.values()).map(agent => ({
        id: agent.id,
        name: agent.name,
        capabilities: agent.capabilities,
        status: agent.status,
        version: agent.version,
        chittyId: agent.chittyId,
        connected: agent.connected,
        registeredAt: agent.registeredAt
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents, total: agents.length }));
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
  }

  /**
   * Handle agent status endpoint
   */
  async handleAgentsStatus(req, res) {
    const status = {
      coordinator: {
        chittyId: this.chittyId,
        port: this.port,
        uptime: process.uptime()
      },
      agents: {
        total: this.agents.size,
        by_status: this.getAgentsByStatus(),
        by_capability: this.getAgentsByCapability()
      },
      workflows: {
        total: this.workflows.size,
        active: Array.from(this.workflows.values()).filter(w => w.status === 'running').length,
        completed: Array.from(this.workflows.values()).filter(w => w.status === 'completed').length,
        failed: Array.from(this.workflows.values()).filter(w => w.status === 'failed').length
      },
      timestamp: new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  }

  /**
   * Handle coordination endpoint
   */
  async handleCoordinationEndpoint(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const coordinationRequest = JSON.parse(body);
        const result = await this.coordinateAgents(coordinationRequest);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }

  /**
   * Coordinate multiple agents for a workflow
   */
  async coordinateAgents(coordinationRequest) {
    const { workflow, agents, data, options = {} } = coordinationRequest;
    const coordinationId = `coord_${Date.now()}`;

    console.log(`🎭 Starting agent coordination: ${coordinationId}`);

    // Create coordination instance
    const coordination = {
      id: coordinationId,
      workflow,
      requestedAgents: agents,
      data,
      options,
      status: 'running',
      results: {},
      errors: {},
      startTime: Date.now(),
      assignedAgents: []
    };

    this.activeCoordinations.set(coordinationId, coordination);

    try {
      // Find available agents with required capabilities
      const availableAgents = this.findAgentsWithCapabilities(agents);

      if (availableAgents.length < agents.length) {
        const missingCapabilities = agents.filter(cap =>
          !availableAgents.some(agent => agent.capabilities.includes(cap))
        );

        throw new Error(`Missing agents with capabilities: ${missingCapabilities.join(', ')}`);
      }

      coordination.assignedAgents = availableAgents;

      // Execute coordination based on workflow type
      let results;
      if (options.sequential) {
        results = await this.executeSequentialCoordination(coordination);
      } else {
        results = await this.executeParallelCoordination(coordination);
      }

      coordination.status = 'completed';
      coordination.results = results;
      coordination.endTime = Date.now();
      coordination.duration = coordination.endTime - coordination.startTime;

      // Broadcast completion
      this.broadcastCoordinationUpdate(coordination);

      return {
        coordinationId,
        status: 'completed',
        results,
        duration: coordination.duration,
        assignedAgents: coordination.assignedAgents.map(a => ({
          id: a.id,
          name: a.name,
          capabilities: a.capabilities
        })),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Coordination failed: ${coordinationId}:`, error);

      coordination.status = 'failed';
      coordination.error = error.message;
      coordination.endTime = Date.now();

      this.broadcastCoordinationUpdate(coordination);

      return {
        coordinationId,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute parallel agent coordination
   */
  async executeParallelCoordination(coordination) {
    const { assignedAgents, data, workflow } = coordination;
    const promises = [];

    assignedAgents.forEach(agent => {
      const promise = this.executeAgentTask(agent, {
        workflow,
        data,
        coordinationId: coordination.id,
        taskType: 'parallel'
      });
      promises.push(promise);
    });

    const results = await Promise.allSettled(promises);
    const coordinationResults = {};
    const errors = {};

    results.forEach((result, index) => {
      const agent = assignedAgents[index];

      if (result.status === 'fulfilled') {
        coordinationResults[agent.name] = result.value;
      } else {
        errors[agent.name] = result.reason?.message || 'Unknown error';
      }
    });

    if (Object.keys(errors).length > 0) {
      coordination.errors = errors;
    }

    return coordinationResults;
  }

  /**
   * Execute sequential agent coordination
   */
  async executeSequentialCoordination(coordination) {
    const { assignedAgents, data, workflow } = coordination;
    const results = {};
    let currentData = data;

    for (const agent of assignedAgents) {
      try {
        const result = await this.executeAgentTask(agent, {
          workflow,
          data: currentData,
          coordinationId: coordination.id,
          taskType: 'sequential',
          previousResults: results
        });

        results[agent.name] = result;

        // Pass results to next agent
        currentData = {
          ...currentData,
          previousResults: results
        };

      } catch (error) {
        coordination.errors[agent.name] = error.message;
        throw error;
      }
    }

    return results;
  }

  /**
   * Execute task on specific agent
   */
  async executeAgentTask(agent, taskData) {
    return new Promise((resolve, reject) => {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Set timeout
      const timeout = setTimeout(() => {
        reject(new Error(`Agent task timeout: ${agent.name}`));
      }, 30000); // 30 second timeout

      // Create task execution listener
      const messageHandler = (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.taskId === taskId) {
            clearTimeout(timeout);

            if (message.type === 'task_complete') {
              resolve(message.result);
            } else if (message.type === 'task_failed') {
              reject(new Error(message.error));
            }
          }
        } catch (error) {
          // Ignore parsing errors for other messages
        }
      };

      agent.ws.on('message', messageHandler);

      // Send task to agent
      agent.ws.send(JSON.stringify({
        type: 'execute_task',
        taskId,
        ...taskData,
        timestamp: new Date().toISOString()
      }));
    });
  }

  /**
   * Find agents with required capabilities
   */
  findAgentsWithCapabilities(requiredCapabilities) {
    const availableAgents = Array.from(this.agents.values()).filter(agent =>
      agent.authenticated && agent.status === 'ready'
    );

    return requiredCapabilities.map(capability =>
      availableAgents.find(agent => agent.capabilities.includes(capability))
    ).filter(Boolean);
  }

  /**
   * Register default ChittyRouter agents
   */
  async registerDefaultAgents() {
    // This would typically register known agents
    // For now, just log that we're ready for agent connections
    console.log('🤖 Agent Coordinator ready for agent registrations');
    console.log('📋 Expected capabilities:', [
      'email-processing',
      'ai-routing',
      'document-analysis',
      'priority-assessment',
      'response-generation',
      'triage',
      'attachment-processing'
    ]);
  }

  /**
   * Get agents grouped by status
   */
  getAgentsByStatus() {
    const statusGroups = {};

    Array.from(this.agents.values()).forEach(agent => {
      const status = agent.status || 'unknown';
      if (!statusGroups[status]) {
        statusGroups[status] = [];
      }
      statusGroups[status].push(agent.name || agent.id);
    });

    return statusGroups;
  }

  /**
   * Get agents grouped by capability
   */
  getAgentsByCapability() {
    const capabilityGroups = {};

    Array.from(this.agents.values()).forEach(agent => {
      if (agent.capabilities && Array.isArray(agent.capabilities)) {
        agent.capabilities.forEach(capability => {
          if (!capabilityGroups[capability]) {
            capabilityGroups[capability] = [];
          }
          capabilityGroups[capability].push(agent.name || agent.id);
        });
      }
    });

    return capabilityGroups;
  }

  /**
   * Broadcast agent status to all connected agents
   */
  broadcastAgentStatus() {
    const statusUpdate = {
      type: 'agent_status_update',
      total_agents: this.agents.size,
      authenticated_agents: Array.from(this.agents.values()).filter(a => a.authenticated).length,
      timestamp: new Date().toISOString()
    };

    Array.from(this.agents.values()).forEach(agent => {
      if (agent.authenticated) {
        try {
          agent.ws.send(JSON.stringify(statusUpdate));
        } catch (error) {
          console.error(`Failed to send status update to agent ${agent.id}:`, error);
        }
      }
    });
  }

  /**
   * Broadcast coordination update
   */
  broadcastCoordinationUpdate(coordination) {
    const update = {
      type: 'coordination_update',
      coordinationId: coordination.id,
      status: coordination.status,
      duration: coordination.duration,
      timestamp: new Date().toISOString()
    };

    coordination.assignedAgents.forEach(agent => {
      try {
        agent.ws.send(JSON.stringify(update));
      } catch (error) {
        console.error(`Failed to send coordination update to agent ${agent.id}:`, error);
      }
    });
  }

  /**
   * Stop agent coordination server
   */
  async stop() {
    if (this.server) {
      console.log('🛑 Stopping Agent Coordination Server...');

      // Close all agent connections
      this.agents.forEach((agent) => {
        agent.ws.close();
      });
      this.agents.clear();

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
      }

      // Close HTTP server
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('✅ Agent Coordination Server stopped');
          resolve();
        });
      });
    }
  }
}

/**
 * Start Agent Coordination Server
 */
export async function startAgentCoordinationServer(env) {
  const server = new AgentCoordinationServer(env);
  await server.initialize();
  return server;
}

/**
 * Agent Coordination Factory
 */
export class AgentCoordinationFactory {
  static async createServer(env, options = {}) {
    const server = new AgentCoordinationServer(env);

    if (options.autoStart !== false) {
      await server.initialize();
    }

    return server;
  }
}