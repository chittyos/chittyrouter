/**
 * ChittyOS Service Discovery
 * Dynamically discovers and connects to all services in registry.chitty.cc
 */

import { discoverService, getAllServices } from './registry.js';

export class ServiceDiscovery {
  constructor(env) {
    this.env = env;
    this.services = new Map();
    this.lastDiscovery = null;
    this.discoveryInterval = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize service discovery - fetch all registered services from live registry
   */
  async initialize() {
    try {
      console.log('🔍 Discovering ChittyOS services from live registry...');

      // Fetch from live registry at registry.chitty.cc
      const allServices = await this.fetchFromLiveRegistry();

      if (!allServices || allServices.length === 0) {
        console.warn('⚠️ No services found in live registry, using fallback endpoints');
        this.loadFallbackServices();
        return;
      }

      console.log(`📡 Discovered ${allServices.length} services in ChittyOS registry`);

      // Index services by name and capabilities
      for (const service of allServices) {
        this.services.set(service.name, {
          ...service,
          lastHealthCheck: null,
          status: 'unknown'
        });

        // Index by capabilities for easy lookup
        if (service.capabilities) {
          for (const capability of service.capabilities) {
            const capabilityKey = `capability:${capability}`;
            if (!this.services.has(capabilityKey)) {
              this.services.set(capabilityKey, []);
            }
            this.services.get(capabilityKey).push(service.name);
          }
        }
      }

      this.lastDiscovery = new Date();
      console.log('✅ Service discovery complete');

      // Start periodic health checks
      this.startHealthChecks();

    } catch (error) {
      console.error('❌ Live registry discovery failed:', error);
      console.log('🔄 Falling back to canonical service definitions');
      this.loadFallbackServices();
    }
  }

  /**
   * Fetch services from live registry.chitty.cc
   */
  async fetchFromLiveRegistry() {
    try {
      const response = await fetch('https://registry.chitty.cc/api/v1/services', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ChittyRouter/2.1.0-ai'
        }
      });

      if (!response.ok) {
        throw new Error(`Registry API returned ${response.status}`);
      }

      const data = await response.json();
      console.log(`📡 Fetched ${data.services?.length || 0} services from live registry`);

      return data.services || [];

    } catch (error) {
      console.error('Failed to fetch from live registry:', error.message);
      return null;
    }
  }

  /**
   * Get service endpoint by name
   */
  getService(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) {
      console.warn(`⚠️ Service ${serviceName} not found in registry`);
      return this.getFallbackEndpoint(serviceName);
    }

    return {
      name: service.name,
      endpoint: service.endpoints?.main || service.endpoint,
      apiEndpoint: service.endpoints?.api,
      healthEndpoint: service.endpoints?.health,
      capabilities: service.capabilities || [],
      status: service.status,
      metadata: service.metadata
    };
  }

  /**
   * Get services by capability
   */
  getServicesByCapability(capability) {
    const serviceNames = this.services.get(`capability:${capability}`) || [];
    return serviceNames.map(name => this.getService(name)).filter(Boolean);
  }

  /**
   * Get specific service endpoint for a capability
   */
  async getEndpointForCapability(capability, preferredService = null) {
    // Try preferred service first
    if (preferredService) {
      const service = this.getService(preferredService);
      if (service && service.capabilities.includes(capability)) {
        return service.endpoint;
      }
    }

    // Find any service with this capability
    const services = this.getServicesByCapability(capability);
    if (services.length === 0) {
      console.warn(`⚠️ No services found for capability: ${capability}`);
      return this.getFallbackEndpointForCapability(capability);
    }

    // Return the first healthy service, or first service if none are healthy
    const healthyServices = services.filter(s => s.status === 'healthy');
    const selectedService = healthyServices[0] || services[0];

    return selectedService.endpoint;
  }

  /**
   * Smart service routing based on capabilities and health
   */
  async routeToService(capability, operation, data) {
    const services = this.getServicesByCapability(capability);

    if (services.length === 0) {
      throw new Error(`No services available for capability: ${capability}`);
    }

    // Try healthy services first
    const healthyServices = services.filter(s => s.status === 'healthy');
    const servicesToTry = healthyServices.length > 0 ? healthyServices : services;

    for (const service of servicesToTry) {
      try {
        const endpoint = service.apiEndpoint || service.endpoint;
        const response = await fetch(`${endpoint}/${operation}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ChittyOS-Service': 'chittyrouter',
            'X-ChittyOS-Capability': capability
          },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          // Mark service as healthy
          this.updateServiceHealth(service.name, 'healthy');
          return await response.json();
        }

      } catch (error) {
        console.warn(`⚠️ Service ${service.name} failed for ${capability}:`, error.message);
        this.updateServiceHealth(service.name, 'unhealthy');
        continue;
      }
    }

    throw new Error(`All services failed for capability: ${capability}`);
  }

  /**
   * Update service health status
   */
  updateServiceHealth(serviceName, status) {
    const service = this.services.get(serviceName);
    if (service) {
      service.status = status;
      service.lastHealthCheck = new Date();
    }
  }

  /**
   * Perform health checks on all services
   */
  async performHealthChecks() {
    const healthPromises = [];

    for (const [name, service] of this.services) {
      if (name.startsWith('capability:')) continue;

      const healthEndpoint = service.endpoints?.health || `${service.endpoint}/health`;

      const healthPromise = fetch(healthEndpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      .then(response => {
        this.updateServiceHealth(name, response.ok ? 'healthy' : 'unhealthy');
      })
      .catch(() => {
        this.updateServiceHealth(name, 'unreachable');
      });

      healthPromises.push(healthPromise);
    }

    await Promise.allSettled(healthPromises);
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    // Initial health check
    this.performHealthChecks();

    // Periodic health checks every 2 minutes
    setInterval(() => {
      this.performHealthChecks();
    }, 2 * 60 * 1000);

    // Periodic service discovery refresh every 5 minutes
    setInterval(() => {
      this.refreshServiceDiscovery();
    }, this.discoveryInterval);
  }

  /**
   * Refresh service discovery
   */
  async refreshServiceDiscovery() {
    try {
      const allServices = await getAllServices(this.env);

      if (allServices && allServices.length > 0) {
        // Update service registry
        const newServices = new Map();

        for (const service of allServices) {
          const existingService = this.services.get(service.name);
          newServices.set(service.name, {
            ...service,
            status: existingService?.status || 'unknown',
            lastHealthCheck: existingService?.lastHealthCheck
          });
        }

        this.services = newServices;
        this.lastDiscovery = new Date();
        console.log(`🔄 Service discovery refreshed: ${allServices.length} services`);
      }

    } catch (error) {
      console.error('❌ Service discovery refresh failed:', error);
    }
  }

  /**
   * Get all discovered services
   */
  getAllDiscoveredServices() {
    return this.services;
  }

  /**
   * Load fallback services when registry is unavailable
   */
  loadFallbackServices() {
    const fallbackServices = [
      // Core Identity and Registry
      {
        name: 'chittyid',
        endpoint: 'https://id.chitty.cc',
        capabilities: ['chittyid_generation', 'id_validation']
      },
      {
        name: 'registry',
        endpoint: 'https://registry.chitty.cc',
        capabilities: ['service_discovery', 'service_registry']
      },
      {
        name: 'schema-service',
        endpoint: 'https://schema.chitty.cc',
        capabilities: ['schema_validation', 'data_validation']
      },

      // Core ChittyOS Platform
      {
        name: 'chittyos-core',
        endpoint: 'https://chittyos.com',
        capabilities: ['business_formation', 'legal_automation']
      },
      {
        name: 'chittychat',
        endpoint: 'https://chittychat.api.com',
        capabilities: ['project_collaboration', 'messaging']
      },
      {
        name: 'evidence-vault',
        endpoint: 'https://evidence.chittyos.com',
        capabilities: ['document_storage', 'evidence_management']
      },

      // Financial Services
      {
        name: 'chitty-accounts',
        endpoint: 'https://accounts.chitty.cc',
        capabilities: ['account_management', 'user_accounts']
      },
      {
        name: 'chitty-payments',
        endpoint: 'https://payments.chitty.cc',
        capabilities: ['payment_processing', 'transactions']
      },
      {
        name: 'chitty-billing',
        endpoint: 'https://billing.chitty.cc',
        capabilities: ['billing_management', 'subscriptions']
      },
      {
        name: 'chitty-treasury',
        endpoint: 'https://treasury.chitty.cc',
        capabilities: ['treasury_management', 'financial_operations']
      },

      // Security and Trust Services
      {
        name: 'chitty-score',
        endpoint: 'https://score.chitty.cc',
        capabilities: ['credit_scoring', 'risk_assessment']
      },
      {
        name: 'chitty-trust',
        endpoint: 'https://trust.chitty.cc',
        capabilities: ['trust_verification', 'reputation_management']
      },
      {
        name: 'chitty-verify',
        endpoint: 'https://verify.chitty.cc',
        capabilities: ['identity_verification', 'document_verification']
      },
      {
        name: 'chitty-auth',
        endpoint: 'https://auth.chitty.cc',
        capabilities: ['authentication', 'authorization']
      },
      {
        name: 'chitty-beacon',
        endpoint: 'https://beacon.chitty.cc',
        capabilities: ['telemetry', 'monitoring', 'alerts']
      },

      // Analytics and Observability
      {
        name: 'chitty-analytics',
        endpoint: 'https://analytics.chitty.cc',
        capabilities: ['data_analytics', 'business_intelligence']
      },
      {
        name: 'chitty-metrics',
        endpoint: 'https://metrics.chitty.cc',
        capabilities: ['metrics_collection', 'performance_monitoring']
      },
      {
        name: 'chitty-logs',
        endpoint: 'https://logs.chitty.cc',
        capabilities: ['log_aggregation', 'log_analysis']
      },
      {
        name: 'chitty-traces',
        endpoint: 'https://traces.chitty.cc',
        capabilities: ['distributed_tracing', 'request_tracking']
      },
      {
        name: 'chitty-alerts',
        endpoint: 'https://alerts.chitty.cc',
        capabilities: ['alerting', 'notification_management']
      },

      // AI and Processing
      {
        name: 'chittyrouter',
        endpoint: 'https://router.chitty.cc',
        capabilities: ['ai_routing', 'email_processing', 'agent_orchestration']
      },
      {
        name: 'chitty-chat',
        endpoint: 'https://chat.chitty.cc',
        capabilities: ['real_time_chat', 'instant_messaging']
      },

      // Specialized Services
      {
        name: 'chitty-intake',
        endpoint: 'https://intake.chitty.cc',
        capabilities: ['email_intake', 'case_intake']
      },
      {
        name: 'chitty-emergency',
        endpoint: 'https://emergency.chitty.cc',
        capabilities: ['emergency_routing', 'urgent_escalation']
      },
      {
        name: 'chitty-pdx',
        endpoint: 'https://pdx.chitty.cc',
        capabilities: ['ai_dna_portability', 'pattern_transfer']
      }
    ];

    for (const service of fallbackServices) {
      this.services.set(service.name, {
        ...service,
        status: 'fallback',
        lastHealthCheck: null
      });
    }

    console.log('📦 Loaded fallback services');
  }

  /**
   * Get fallback endpoint for a service
   */
  getFallbackEndpoint(serviceName) {
    const fallbacks = {
      // Core Services
      'chittyid': 'https://id.chitty.cc',
      'chittyos': 'https://chittyos.com',
      'chittychat': 'https://chittychat.api.com',
      'evidence': 'https://evidence.chittyos.com',
      'schema': 'https://schema.chitty.cc',
      'registry': 'https://registry.chitty.cc',

      // Financial Services
      'chitty-accounts': 'https://accounts.chitty.cc',
      'chitty-payments': 'https://payments.chitty.cc',
      'chitty-billing': 'https://billing.chitty.cc',
      'chitty-treasury': 'https://treasury.chitty.cc',

      // Security Services
      'chitty-score': 'https://score.chitty.cc',
      'chitty-trust': 'https://trust.chitty.cc',
      'chitty-verify': 'https://verify.chitty.cc',
      'chitty-auth': 'https://auth.chitty.cc',
      'chitty-beacon': 'https://beacon.chitty.cc',

      // Analytics Services
      'chitty-analytics': 'https://analytics.chitty.cc',
      'chitty-metrics': 'https://metrics.chitty.cc',
      'chitty-logs': 'https://logs.chitty.cc',
      'chitty-traces': 'https://traces.chitty.cc',
      'chitty-alerts': 'https://alerts.chitty.cc',

      // Specialized Services
      'chittyrouter': 'https://router.chitty.cc',
      'chitty-chat': 'https://chat.chitty.cc',
      'chitty-intake': 'https://intake.chitty.cc',
      'chitty-emergency': 'https://emergency.chitty.cc',
      'chitty-pdx': 'https://pdx.chitty.cc'
    };

    return fallbacks[serviceName] || null;
  }

  /**
   * Get fallback endpoint for a capability
   */
  getFallbackEndpointForCapability(capability) {
    const capabilityMap = {
      // Core Platform Capabilities
      'chittyid_generation': 'https://id.chitty.cc',
      'id_validation': 'https://id.chitty.cc',
      'schema_validation': 'https://schema.chitty.cc',
      'data_validation': 'https://schema.chitty.cc',
      'document_storage': 'https://evidence.chittyos.com',
      'evidence_management': 'https://evidence.chittyos.com',
      'project_collaboration': 'https://chittychat.api.com',
      'messaging': 'https://chittychat.api.com',
      'business_formation': 'https://chittyos.com',
      'legal_automation': 'https://chittyos.com',
      'service_discovery': 'https://registry.chitty.cc',
      'service_registry': 'https://registry.chitty.cc',

      // Financial Capabilities
      'account_management': 'https://accounts.chitty.cc',
      'user_accounts': 'https://accounts.chitty.cc',
      'payment_processing': 'https://payments.chitty.cc',
      'transactions': 'https://payments.chitty.cc',
      'billing_management': 'https://billing.chitty.cc',
      'subscriptions': 'https://billing.chitty.cc',
      'treasury_management': 'https://treasury.chitty.cc',
      'financial_operations': 'https://treasury.chitty.cc',

      // Security Capabilities
      'credit_scoring': 'https://score.chitty.cc',
      'risk_assessment': 'https://score.chitty.cc',
      'trust_verification': 'https://trust.chitty.cc',
      'reputation_management': 'https://trust.chitty.cc',
      'identity_verification': 'https://verify.chitty.cc',
      'document_verification': 'https://verify.chitty.cc',
      'authentication': 'https://auth.chitty.cc',
      'authorization': 'https://auth.chitty.cc',

      // Observability Capabilities
      'telemetry': 'https://beacon.chitty.cc',
      'monitoring': 'https://beacon.chitty.cc',
      'alerts': 'https://alerts.chitty.cc',
      'data_analytics': 'https://analytics.chitty.cc',
      'business_intelligence': 'https://analytics.chitty.cc',
      'metrics_collection': 'https://metrics.chitty.cc',
      'performance_monitoring': 'https://metrics.chitty.cc',
      'log_aggregation': 'https://logs.chitty.cc',
      'log_analysis': 'https://logs.chitty.cc',
      'distributed_tracing': 'https://traces.chitty.cc',
      'request_tracking': 'https://traces.chitty.cc',
      'alerting': 'https://alerts.chitty.cc',
      'notification_management': 'https://alerts.chitty.cc',

      // AI and Processing Capabilities
      'ai_routing': 'https://router.chitty.cc',
      'email_processing': 'https://router.chitty.cc',
      'agent_orchestration': 'https://router.chitty.cc',
      'real_time_chat': 'https://chat.chitty.cc',
      'instant_messaging': 'https://chat.chitty.cc',

      // Specialized Capabilities
      'email_intake': 'https://intake.chitty.cc',
      'case_intake': 'https://intake.chitty.cc',
      'emergency_routing': 'https://emergency.chitty.cc',
      'urgent_escalation': 'https://emergency.chitty.cc',
      'ai_dna_portability': 'https://pdx.chitty.cc',
      'pattern_transfer': 'https://pdx.chitty.cc'
    };

    return capabilityMap[capability] || null;
  }

  /**
   * Get service discovery status
   */
  getDiscoveryStatus() {
    const totalServices = Array.from(this.services.keys()).filter(k => !k.startsWith('capability:')).length;
    const healthyServices = Array.from(this.services.values()).filter(s => s.status === 'healthy').length;

    return {
      totalServices,
      healthyServices,
      lastDiscovery: this.lastDiscovery,
      discoveryAge: this.lastDiscovery ? Date.now() - this.lastDiscovery.getTime() : null,
      services: this.getAllDiscoveredServices()
    };
  }
}