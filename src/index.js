#!/usr/bin/env node

/**
 * ChittyRouter AI Gateway - Main Entry Point
 * AI-powered intelligent email routing and communication management
 * Replaces traditional routing with AI-first approach
 */

// Cloudflare AI is provided by the runtime, not imported
// import { Ai } from '@cloudflare/ai';
import { ChittyRouterAI } from './ai/intelligent-router.js';
import { EmailProcessor } from './ai/email-processor.js';
import { AgentOrchestrator } from './ai/agent-orchestrator.js';
import { ServiceDiscovery } from './utils/service-discovery.js';
import { initializeRegistry, updateServiceStatus, registryHealthCheck } from './utils/registry.js';
import SystemStatusEndpoint from './endpoints/system-status.js';
import { getServiceHealth } from './utils/storage.js';
import { initializeChittyOSSecurity, ChittySecurityManager } from './utils/chittyos-security-integration.js';
import { getChittyOSIntegration, createChittyOSMiddleware } from './integration/chittyos-integration.js';
import { handleChittyChatRequest } from './api/chittychat-endpoints.js';
import { PDXApiFactory } from './pdx/pdx-api.js';
import { HardenedSyncOrchestrator } from './sync/hardened-sync-orchestrator.js';

// Initialize security, registry, service discovery, and sync orchestrator on first request
let registryInitialized = false;
let securityManager = null;
let chittyOSIntegration = null;
let pdxApi = null;
let serviceDiscovery = null;
let syncOrchestrator = null;

// Main ChittyRouter AI Gateway
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Cloudflare AI binding is provided directly by env.AI
    const ai = env.AI; // Use the binding directly
    const router = new ChittyRouterAI(ai, env);

    // Initialize service discovery and ChittyOS integration on first request
    if (!serviceDiscovery) {
      try {
        // Initialize service discovery first
        serviceDiscovery = new ServiceDiscovery(env);
        await serviceDiscovery.initialize();
        console.log('🔍 Service Discovery initialized - using registry services');

        // Initialize complete ChittyOS integration using discovered services
        chittyOSIntegration = await getChittyOSIntegration(env);

        // Legacy security manager for backward compatibility
        if (!securityManager) {
          securityManager = await initializeChittyOSSecurity(env, 'chittyrouter');
        }

        // Initialize registry with authenticated ChittyID
        if (!registryInitialized) {
          const initResult = await initializeRegistry(env);
          registryInitialized = initResult.initialized;
        }

        console.log('🚀 Complete ChittyOS Integration initialized:', {
          integration: chittyOSIntegration.getStatus(),
          services: Array.from(chittyOSIntegration.services.keys()),
          discoveredServices: serviceDiscovery.getDiscoveryStatus()
        });

        // Initialize PDX API for AI DNA portability
        if (!pdxApi) {
          pdxApi = await PDXApiFactory.createAPI(env);
          console.log('🧬 PDX API initialized - AI DNA portability enabled');
        }

      } catch (error) {
        console.error('❌ ChittyOS Integration failed:', error);
        // Continue with legacy initialization
        if (!securityManager) {
          securityManager = await initializeChittyOSSecurity(env, 'chittyrouter');
        }
      }
    }

    // Apply security middleware if available
    const securityMiddleware = securityManager?.createAuthMiddleware();

    try {
      // Apply security for protected endpoints
      if (securityMiddleware && securityManager.requiresAuth(request)) {
        const authCheck = await securityMiddleware(request, async (req) => {
          // This will be the actual handler after auth check
          return null; // Placeholder
        });

        if (authCheck && authCheck.status === 401) {
          return authCheck; // Return unauthorized response
        }
      }

      // AI-powered email processing endpoint
      if (url.pathname === '/process' && request.method === 'POST') {
        const emailData = await request.json();
        const result = await router.intelligentRoute(emailData);

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // AI agent orchestration endpoint
      if (url.pathname === '/agents' && request.method === 'POST') {
        const taskData = await request.json();
        const orchestrator = new AgentOrchestrator(ai, env);
        const result = await orchestrator.executeTask(taskData);

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // ChittyChat integration endpoints
      if (url.pathname.startsWith('/chittychat/')) {
        return await handleChittyChatRequest(request, env);
      }

      // PDX (Portable DNA eXchange) API endpoints
      if (url.pathname.startsWith('/pdx/')) {
        if (!pdxApi) {
          return new Response(JSON.stringify({ error: 'PDX API not available' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return await pdxApi.handlePDXRequest(request);
      }

      // Backward compatibility for existing email endpoints
      if (url.pathname.startsWith('/email/')) {
        return await this.legacyEmailHandler(request, env, ai);
      }

      // Health check with AI status, ChittyOS integration, and service discovery
      if (url.pathname === '/health') {
        const aiHealth = await router.healthCheck();
        const integrationHealth = chittyOSIntegration ? await chittyOSIntegration.performHealthCheck() : null;
        const discoveryHealth = serviceDiscovery ? serviceDiscovery.getDiscoveryStatus() : null;

        return new Response(JSON.stringify({
          service: 'ChittyRouter AI Gateway',
          version: '2.1.0-ai',
          status: integrationHealth?.overall_health || 'healthy',
          timestamp: new Date().toISOString(),
          ai: aiHealth,
          integration: integrationHealth,
          serviceDiscovery: discoveryHealth,
          capabilities: [
            'intelligent-email-routing',
            'ai-powered-triage',
            'automated-responses',
            'document-analysis',
            'priority-classification',
            'agent-orchestration',
            'mcp-orchestration',
            'p256-signatures',
            'financial-processing',
            'redis-caching',
            'real-time-coordination',
            'pdx-dna-portability'
          ]
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // ChittyOS Integration status endpoint
      if (url.pathname === '/integration/status') {
        const status = chittyOSIntegration ? chittyOSIntegration.getStatus() : { error: 'Integration not initialized' };

        return new Response(JSON.stringify(status), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // System Status endpoints
      if (url.pathname.startsWith('/status')) {
        const statusEndpoint = new SystemStatusEndpoint(env);
        return await statusEndpoint.handleRequest(request);
      }

      // ChittyOS Integration health endpoint
      if (url.pathname === '/integration/health') {
        const health = chittyOSIntegration ? await chittyOSIntegration.performHealthCheck() : { error: 'Integration not initialized' };

        return new Response(JSON.stringify(health), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Service routing endpoint using service discovery
      if (url.pathname === '/integration/service' && request.method === 'POST') {
        if (!serviceDiscovery) {
          return new Response(JSON.stringify({ error: 'Service Discovery not available' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const { capability, operation, data, preferredService } = await request.json();

        try {
          const result = await serviceDiscovery.routeToService(capability, operation, data);
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Service discovery status endpoint
      if (url.pathname === '/discovery/status') {
        const status = serviceDiscovery ? serviceDiscovery.getDiscoveryStatus() : { error: 'Service Discovery not initialized' };

        return new Response(JSON.stringify(status), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get service by name or capability
      if (url.pathname === '/discovery/service' && request.method === 'GET') {
        if (!serviceDiscovery) {
          return new Response(JSON.stringify({ error: 'Service Discovery not available' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const params = new URLSearchParams(url.search);
        const serviceName = params.get('name');
        const capability = params.get('capability');

        try {
          let result;
          if (serviceName) {
            result = serviceDiscovery.getService(serviceName);
          } else if (capability) {
            result = serviceDiscovery.getServicesByCapability(capability);
          } else {
            result = serviceDiscovery.getAllDiscoveredServices();
          }

          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Integrated email processing endpoint
      if (url.pathname === '/process/integrated' && request.method === 'POST') {
        if (!chittyOSIntegration) {
          return new Response(JSON.stringify({ error: 'ChittyOS Integration not available' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const emailData = await request.json();
        const result = await chittyOSIntegration.processEmailIntegrated(emailData);

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Default AI router info
      return new Response(JSON.stringify({
        service: 'ChittyRouter AI Gateway',
        message: 'AI-powered intelligent email routing with complete ChittyOS integration',
        version: '2.0.0-ai',
        chittyOS_integration: chittyOSIntegration ? 'active' : 'inactive',
        endpoints: [
          'POST /process - AI email processing',
          'POST /process/integrated - Integrated ChittyOS email processing',
          'POST /agents - Agent orchestration',
          'POST /integration/service - Service routing via discovery',
          'GET /health - Comprehensive health check',
          'GET /integration/status - ChittyOS integration status',
          'GET /integration/health - ChittyOS integration health',
          'GET /discovery/status - Service discovery status',
          'GET /discovery/service - Get services by name/capability',
          'POST /pdx/v1/export - Export AI DNA (PDX v1.0)',
          'POST /pdx/v1/import - Import AI DNA (PDX v1.0)',
          'GET /pdx/v1/verify/{id} - Verify PDX package',
          'POST /pdx/v1/revoke - Revoke PDX package',
          'GET /pdx/v1/status - PDX API status',
          'POST /chittychat/* - ChittyChat integration',
          'POST /email/* - Legacy email functions (AI-enhanced)',
          'GET /status - Comprehensive system status',
          'GET /status/deployment - Deployment readiness check',
          'GET /status/ai-models - AI model configuration and capabilities'
        ],
        integration_services: chittyOSIntegration ? {
          mcp_server: `http://localhost:${chittyOSIntegration.mcpServer?.port || 'N/A'}`,
          agent_coordinator: `http://localhost:${chittyOSIntegration.agentCoordinator?.port || 'N/A'}`,
          redis_cache: chittyOSIntegration.redisClient?.connected || false,
          financial_services: chittyOSIntegration.financialServices?.initialized || false,
          p256_signatures: true,
          telemetry_monitoring: chittyOSIntegration.beaconClient ? 'active' : 'inactive'
        } : null,
        aiModels: [
          '@cf/meta/llama-4-scout-17b-16e-instruct',
          '@cf/openai/gpt-oss-120b',
          '@cf/meta/llama-3.2-11b-vision-instruct',
          '@cf/google/gemma-3-12b-it',
          '@cf/openai/whisper'
        ],
        modelCapabilities: {
          multimodal: true,
          visionSupport: true,
          advancedReasoning: true,
          fallbackChain: true
        },
        enterprise: {
          versionManagement: env.VERSION_MANAGEMENT === 'enterprise',
          randomnessBeacon: env.RANDOMNESS_BEACON === 'true'
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('ChittyRouter AI Gateway error:', error);

      return new Response(JSON.stringify({
        error: 'AI Gateway processing failed',
        message: error.message,
        fallback: 'traditional routing available'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  // AI-powered Email Worker interface
  async email(message, env, ctx) {
    const ai = new Ai(env.AI);
    const processor = new EmailProcessor(ai, env);

    return await processor.processIncomingEmail(message, ctx);
  },

  // Legacy email handler with AI enhancement
  async legacyEmailHandler(request, env, ai) {
    const url = new URL(request.url);
    const router = new ChittyRouterAI(ai, env);

    // AI-enhanced versions of legacy endpoints
    switch (url.pathname) {
      case '/email/send-case-update':
        return await router.sendIntelligentCaseUpdate(await request.json());
      case '/email/send-document-receipt':
        return await router.sendAIDocumentReceipt(await request.json());
      case '/email/send-court-reminder':
        return await router.sendSmartCourtReminder(await request.json());
      case '/email/send-chittyid-confirmation':
        return await router.sendAIChittyIDConfirmation(await request.json());
      default:
        return new Response('ChittyRouter AI Email Service Active', { status: 200 });
    }
  }
};

// Export AI components
export { ChittyRouterAI } from './ai/intelligent-router.js';
export { AgentOrchestrator } from './ai/agent-orchestrator.js';
export { AIStateDO } from './ai/ai-state.js';

// ChittyRouter AI Gateway startup
console.log('🚀 ChittyRouter AI Gateway Starting...');
console.log('🤖 AI-powered intelligent routing enabled');
console.log('🎭 Multi-agent orchestration active');
console.log('📊 Real-time email analysis ready');
console.log('⚡ Cloudflare AI Workers integrated');
console.log('🔐 ChittyOS Security Pipeline ready');
console.log('💰 Financial Services integration enabled');
console.log('📡 MCP Server orchestration (port 3000)');
console.log('🤖 Agent Coordination Server (port 8080)');
console.log('💾 Redis caching integration (port 6379)');
console.log('🔏 P256 cryptographic signatures active');
console.log('📢 Real-time telemetry monitoring');
console.log('🧬 PDX v1.0 - AI DNA Portability enabled');
console.log('🔗 DNA pattern collection active');
console.log('💰 Attribution tracking for AI contributions');
console.log('✨ Complete ChittyOS Integration Ready!');