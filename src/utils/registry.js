/**
 * ChittyOS Registry Service Integration
 * Connects to registry.chitty.cc for service registration and discovery
 */

const REGISTRY_URL = 'https://registry.chitty.cc/api/v1';

/**
 * Register ChittyRouter service with the registry
 */
export async function registerService(env, serviceInfo = {}) {
  try {
    const registration = {
      service: 'chittyrouter',
      version: env.AI_GATEWAY_VERSION || '2.0.0-ai',
      type: 'AI_GATEWAY',
      endpoints: {
        main: env.CHITTYROUTER_URL || 'https://router.chitty.cc',
        health: `${env.CHITTYROUTER_URL}/health`,
        api: `${env.CHITTYROUTER_URL}/api/v1`,

        // Core AI endpoints
        aiProcessing: `${env.CHITTYROUTER_URL}/process`,
        agentOrchestration: `${env.CHITTYROUTER_URL}/agents`,

        // Email endpoints
        emailWorker: `${env.CHITTYROUTER_URL}/email`,
        sendCaseUpdate: `${env.CHITTYROUTER_URL}/email/send-case-update`,
        sendDocumentReceipt: `${env.CHITTYROUTER_URL}/email/send-document-receipt`,
        sendCourtReminder: `${env.CHITTYROUTER_URL}/email/send-court-reminder`,
        sendChittyIdConfirmation: `${env.CHITTYROUTER_URL}/email/send-chittyid-confirmation`,

        // ChittyChat integration endpoints
        chittyChatWebhook: `${env.CHITTYROUTER_URL}/chittychat/webhook`,
        chittyChatStatus: `${env.CHITTYROUTER_URL}/chittychat/status`,
        chittyChatSync: `${env.CHITTYROUTER_URL}/chittychat/sync`,
        chittyChatSubscribe: `${env.CHITTYROUTER_URL}/chittychat/subscribe`,
        chittyChatMetrics: `${env.CHITTYROUTER_URL}/chittychat/metrics`,

        // PDX API endpoints (AI DNA Portability)
        pdxExport: `${env.CHITTYROUTER_URL}/pdx/v1/export`,
        pdxImport: `${env.CHITTYROUTER_URL}/pdx/v1/import`,
        pdxVerify: `${env.CHITTYROUTER_URL}/pdx/v1/verify`,
        pdxRevoke: `${env.CHITTYROUTER_URL}/pdx/v1/revoke`,
        pdxStatus: `${env.CHITTYROUTER_URL}/pdx/v1/status`,

        // Sync endpoints
        unifiedSync: `${env.CHITTYROUTER_URL}/sync/unified`,
        atomicFacts: `${env.CHITTYROUTER_URL}/atomic-facts`,

        // Webhook endpoint
        webhook: `${env.CHITTYROUTER_URL}/webhook`
      },
      capabilities: [
        'email_routing',
        'ai_processing',
        'document_analysis',
        'chittyid_generation',
        'case_management',
        'media_handling',
        'intelligent_triage',
        'priority_classification',
        'automated_responses',
        'agent_orchestration',
        'attachment_processing',
        'case_pattern_recognition',
        'entity_extraction',
        'sentiment_analysis',
        'compliance_checking',
        'unified_sync',
        'atomic_facts_storage',
        'chittychat_integration',
        'project_synchronization',
        'pdx_dna_portability',
        'ai_dna_export',
        'ai_dna_import',
        'pattern_attribution',
        'mcp_orchestration',
        'p256_signatures',
        'financial_processing',
        'redis_caching',
        'real_time_coordination'
      ],
      aiModels: [
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/microsoft/resnet-50',
        '@cf/openai/whisper'
      ],
      dependencies: [
        'id.chitty.cc',
        'chittyos.com',
        'chittychat.api.com',
        'evidence.chittyos.com',
        'registry.chitty.cc',
        'schema.chitty.cc',
        'pdx.chitty.cc'
      ],
      durableObjects: [
        'AIStateDO',
        'ChittyChainDO',
        'UnifiedSyncDO',
        'ChittyChatSyncDO',
        'PDXStateDO'
      ],
      storage: {
        kv: ['CHITTYROUTER_CACHE', 'CHITTYCHAT_SYNC_CACHE', 'PDX_DNA_CACHE'],
        r2: ['EMAIL_ATTACHMENTS', 'PDX_DNA_STORAGE'],
        durableObjects: ['AI_STATE', 'CHITTYCHAIN_DO', 'CHITTYCHAT_SYNC', 'PDX_STATE'],
        redis: ['CHITTYOS_REDIS']
      },
      integrations: {
        chittychat: {
          enabled: true,
          projectSync: true,
          webhookSupport: true,
          realTimeUpdates: true
        },
        pdx: {
          enabled: true,
          version: '1.0',
          dnaPortability: true,
          attributionTracking: true,
          patternCollection: true
        },
        chittyos: {
          mcpOrchestration: true,
          agentCoordination: true,
          financialServices: true,
          securityPipeline: true,
          distributedSession: true
        }
      },
      metadata: {
        aiModel: env.AI_MODEL_ENDPOINT || '@cf/meta/llama-3.1-8b-instruct',
        environment: env.ENVIRONMENT || 'production',
        region: env.REGION || 'us-west',
        ...serviceInfo
      },
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`${REGISTRY_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.REGISTRY_API_KEY ? `Bearer ${env.REGISTRY_API_KEY}` : undefined
      },
      body: JSON.stringify(registration)
    });

    if (!response.ok) {
      throw new Error(`Registry registration failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('Service registered with ChittyOS Registry:', result.registrationId);
    return result;

  } catch (error) {
    console.error('Failed to register with ChittyOS Registry:', error);
    return {
      registered: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Discover services from the registry
 */
export async function discoverService(env, serviceName) {
  try {
    const response = await fetch(`${REGISTRY_URL}/discover/${serviceName}`, {
      headers: {
        'Authorization': env.REGISTRY_API_KEY ? `Bearer ${env.REGISTRY_API_KEY}` : undefined
      }
    });

    if (!response.ok) {
      throw new Error(`Service discovery failed: ${response.status}`);
    }

    const services = await response.json();
    return services;

  } catch (error) {
    console.error(`Failed to discover service ${serviceName}:`, error);

    // Return fallback service endpoints
    const fallbacks = {
      'chittyid': { endpoint: 'https://id.chitty.cc' },
      'chittyos': { endpoint: 'https://chittyos.com' },
      'chittychat': { endpoint: 'https://chittychat.api.com' },
      'evidence': { endpoint: 'https://evidence.chittyos.com' }
    };

    return fallbacks[serviceName] || null;
  }
}

/**
 * Get all available services from registry
 */
export async function getAllServices(env) {
  try {
    const response = await fetch(`${REGISTRY_URL}/services`, {
      headers: {
        'Authorization': env.REGISTRY_API_KEY ? `Bearer ${env.REGISTRY_API_KEY}` : undefined
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch services: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    console.error('Failed to fetch services from registry:', error);
    return [];
  }
}

/**
 * Update service status in registry
 */
export async function updateServiceStatus(env, status) {
  try {
    const update = {
      service: 'chittyrouter',
      status: status, // 'healthy', 'degraded', 'unhealthy', 'maintenance'
      metrics: {
        uptime: process.uptime ? process.uptime() : 0,
        requestsProcessed: env.REQUEST_COUNT || 0,
        averageResponseTime: env.AVG_RESPONSE_TIME || 0,
        lastActivity: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`${REGISTRY_URL}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.REGISTRY_API_KEY ? `Bearer ${env.REGISTRY_API_KEY}` : undefined
      },
      body: JSON.stringify(update)
    });

    if (!response.ok) {
      throw new Error(`Status update failed: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    console.error('Failed to update service status:', error);
    return { updated: false, error: error.message };
  }
}

/**
 * Deregister service from registry (for graceful shutdown)
 */
export async function deregisterService(env) {
  try {
    const response = await fetch(`${REGISTRY_URL}/deregister/chittyrouter`, {
      method: 'DELETE',
      headers: {
        'Authorization': env.REGISTRY_API_KEY ? `Bearer ${env.REGISTRY_API_KEY}` : undefined
      }
    });

    if (!response.ok) {
      throw new Error(`Deregistration failed: ${response.status}`);
    }

    console.log('Service deregistered from ChittyOS Registry');
    return await response.json();

  } catch (error) {
    console.error('Failed to deregister from registry:', error);
    return { deregistered: false, error: error.message };
  }
}

/**
 * Get service configuration from registry
 */
export async function getServiceConfig(env, serviceName = 'chittyrouter') {
  try {
    const response = await fetch(`${REGISTRY_URL}/config/${serviceName}`, {
      headers: {
        'Authorization': env.REGISTRY_API_KEY ? `Bearer ${env.REGISTRY_API_KEY}` : undefined
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status}`);
    }

    const config = await response.json();

    // Merge with local config
    return {
      ...config,
      local: {
        aiModel: env.AI_MODEL_ENDPOINT,
        environment: env.ENVIRONMENT,
        chittyosEndpoint: env.CHITTYOS_ENDPOINT,
        chittychatApi: env.CHITTYCHAT_API,
        evidenceVaultUrl: env.EVIDENCE_VAULT_URL
      }
    };

  } catch (error) {
    console.error('Failed to fetch service config from registry:', error);

    // Return local config as fallback
    return {
      aiModel: env.AI_MODEL_ENDPOINT || '@cf/meta/llama-3.1-8b-instruct',
      environment: env.ENVIRONMENT || 'production',
      endpoints: {
        chittyos: env.CHITTYOS_ENDPOINT || 'https://chittyos.com',
        chittychat: env.CHITTYCHAT_API || 'https://chittychat.api.com',
        evidence: env.EVIDENCE_VAULT_URL || 'https://evidence.chittyos.com',
        chittyid: 'https://id.chitty.cc'
      }
    };
  }
}

/**
 * Subscribe to registry events
 */
export async function subscribeToRegistryEvents(env, eventTypes = ['service_update', 'config_change']) {
  try {
    const subscription = {
      service: 'chittyrouter',
      events: eventTypes,
      callback: env.WEBHOOK_URL || `${env.CHITTYROUTER_URL}/webhook`
    };

    const response = await fetch(`${REGISTRY_URL}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.REGISTRY_API_KEY ? `Bearer ${env.REGISTRY_API_KEY}` : undefined
      },
      body: JSON.stringify(subscription)
    });

    if (!response.ok) {
      throw new Error(`Event subscription failed: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    console.error('Failed to subscribe to registry events:', error);
    return { subscribed: false, error: error.message };
  }
}

/**
 * Perform health check via registry
 */
export async function registryHealthCheck(env) {
  try {
    const response = await fetch(`${REGISTRY_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    return {
      registry: response.ok ? 'healthy' : 'unhealthy',
      statusCode: response.status,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    return {
      registry: 'unreachable',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Initialize registry connection on service start
 */
export async function initializeRegistry(env) {
  console.log('Initializing ChittyOS Registry connection...');

  // Check registry health
  const health = await registryHealthCheck(env);
  if (health.registry !== 'healthy') {
    console.warn('Registry is not healthy:', health);
    return { initialized: false, ...health };
  }

  // Register service
  const registration = await registerService(env);
  if (!registration.registered && registration.registered !== undefined) {
    console.warn('Failed to register service:', registration);
    return { initialized: false, ...registration };
  }

  // Subscribe to events
  const subscription = await subscribeToRegistryEvents(env);

  // Get initial configuration
  const config = await getServiceConfig(env);

  return {
    initialized: true,
    registration,
    subscription,
    config,
    timestamp: new Date().toISOString()
  };
}