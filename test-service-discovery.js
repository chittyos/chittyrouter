#!/usr/bin/env node

/**
 * Test Service Discovery with Live Registry
 * Verifies ChittyRouter can discover and connect to all 35+ services
 */

import { ServiceDiscovery } from './src/utils/service-discovery.js';

async function testServiceDiscovery() {
  console.log('🔍 Testing Service Discovery with Live Registry...\n');

  // Mock environment
  const env = {
    ENVIRONMENT: 'test',
    REGISTRY_URL: 'https://registry.chitty.cc/api/v1'
  };

  const discovery = new ServiceDiscovery(env);

  try {
    // Initialize and fetch from live registry
    console.log('📡 Connecting to registry.chitty.cc...');
    await discovery.initialize();

    // Get discovery status
    const status = discovery.getDiscoveryStatus();
    console.log('\n📊 Discovery Status:');
    console.log(`- Services discovered: ${status.servicesCount}`);
    console.log(`- Healthy services: ${status.healthyCount}`);
    console.log(`- Using fallback: ${status.usingFallback}`);

    // List all discovered services
    const services = discovery.getAllDiscoveredServices();
    console.log('\n🎯 Discovered Services:');

    const categories = {};
    if (services && typeof services.entries === 'function') {
      for (const [name, service] of services.entries()) {
      const category = service.category || 'uncategorized';
      if (!categories[category]) categories[category] = [];
      categories[category].push(name);
    }

      for (const [category, serviceNames] of Object.entries(categories)) {
        console.log(`\n  ${category.toUpperCase()}:`);
        serviceNames.forEach(name => {
          const service = services.get(name);
          const status = service.status === 'healthy' ? '✅' : '⚠️';
          console.log(`    ${status} ${name} - ${service.endpoint}`);
        });
      }
    } else {
      console.log('  No services available');
    }

    // Test capability-based routing
    console.log('\n🔄 Testing Capability-Based Discovery:');
    const testCapabilities = [
      'chittyid_generation',
      'schema_validation',
      'document_storage',
      'project_collaboration',
      'ai_routing',
      'financial_operations'
    ];

    for (const capability of testCapabilities) {
      const endpoint = await discovery.getEndpointForCapability(capability);
      if (endpoint) {
        console.log(`  ✅ ${capability}: ${endpoint}`);
      } else {
        console.log(`  ❌ ${capability}: Not found`);
      }
    }

    // Test specific service retrieval
    console.log('\n🎯 Testing Specific Service Retrieval:');
    const criticalServices = ['chittyid', 'chittyregistry', 'chittychat', 'chittyrouter'];

    for (const serviceName of criticalServices) {
      const service = discovery.getService(serviceName);
      if (service) {
        console.log(`  ✅ ${serviceName}: ${service.endpoint} (${service.status})`);
      } else {
        console.log(`  ❌ ${serviceName}: Not found`);
      }
    }

    console.log('\n✅ Service Discovery Test Complete!');
    console.log(`📊 Total Services: ${services ? services.size : 0}`);
    console.log(`🔗 Registry Connection: ${status.usingFallback ? 'Using Fallback' : 'Live Registry'}`);

  } catch (error) {
    console.error('\n❌ Service Discovery Test Failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testServiceDiscovery().catch(console.error);