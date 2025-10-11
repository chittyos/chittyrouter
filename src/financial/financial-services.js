/**
 * Financial Services Integration for ChittyRouter
 * Handles account management, transactions, and billing
 */

import { ChittyIdClient } from '../utils/chittyid-integration.js';
import { ChittySecurityManager } from '../utils/chittyos-security-integration.js';
import { ServiceDiscovery } from '../utils/service-discovery.js';

/**
 * Financial Services Manager
 */
export class ChittyFinancialServices {
  constructor(env) {
    this.env = env;
    this.chittyId = null;
    this.securityManager = null;
    this.serviceDiscovery = null;
    this.accounts = new Map();
    this.transactions = new Map();
    this.subscriptions = new Map();
    this.initialized = false;

    // Endpoints will be discovered dynamically
    this.endpoints = {};
  }

  /**
   * Initialize financial services
   */
  async initialize() {
    try {
      console.log('💰 Initializing ChittyRouter Financial Services...');

      // Initialize service discovery first
      this.serviceDiscovery = new ServiceDiscovery(this.env);
      await this.serviceDiscovery.initialize();
      console.log('🔍 Financial service discovery initialized');

      // Discover financial service endpoints
      await this.discoverFinancialEndpoints();

      // Get ChittyID for financial service
      this.chittyId = await ChittyIdClient.ensure(this.env, 'chittyrouter-financial');
      console.log(`🆔 Financial Service ChittyID: ${this.chittyId}`);

      // Initialize security
      this.securityManager = new ChittySecurityManager(this.env, 'chittyrouter-financial');
      await this.securityManager.initialize();

      // Initialize account for ChittyRouter service
      await this.initializeServiceAccount();

      this.initialized = true;
      console.log('✅ Financial Services initialized');

      return { initialized: true, chittyId: this.chittyId };

    } catch (error) {
      console.error('❌ Failed to initialize Financial Services:', error);
      throw error;
    }
  }

  /**
   * Discover financial service endpoints from registry
   */
  async discoverFinancialEndpoints() {
    try {
      // Discover accounts service
      const accountsEndpoint = await this.serviceDiscovery.getEndpointForCapability('account_management', 'chitty-accounts');
      if (accountsEndpoint) {
        this.endpoints.accounts = `${accountsEndpoint}/api/v1`;
      }

      // Discover payments service
      const paymentsEndpoint = await this.serviceDiscovery.getEndpointForCapability('payment_processing', 'chitty-payments');
      if (paymentsEndpoint) {
        this.endpoints.payments = `${paymentsEndpoint}/api/v1`;
      }

      // Discover billing service
      const billingEndpoint = await this.serviceDiscovery.getEndpointForCapability('billing_management', 'chitty-billing');
      if (billingEndpoint) {
        this.endpoints.billing = `${billingEndpoint}/api/v1`;
      }

      // Discover treasury service
      const treasuryEndpoint = await this.serviceDiscovery.getEndpointForCapability('treasury_management', 'chitty-treasury');
      if (treasuryEndpoint) {
        this.endpoints.treasury = `${treasuryEndpoint}/api/v1`;
      }

      console.log('💰 Discovered financial endpoints:', this.endpoints);

      // Fallback to environment variables if discovery fails
      if (!this.endpoints.accounts) {
        this.endpoints.accounts = this.env.CHITTY_ACCOUNTS_API || 'https://accounts.chitty.cc/api/v1';
      }
      if (!this.endpoints.payments) {
        this.endpoints.payments = this.env.CHITTY_PAYMENTS_API || 'https://payments.chitty.cc/api/v1';
      }
      if (!this.endpoints.billing) {
        this.endpoints.billing = this.env.CHITTY_BILLING_API || 'https://billing.chitty.cc/api/v1';
      }
      if (!this.endpoints.treasury) {
        this.endpoints.treasury = this.env.CHITTY_TREASURY_API || 'https://treasury.chitty.cc/api/v1';
      }

    } catch (error) {
      console.warn('⚠️ Failed to discover financial endpoints:', error.message);
      // Use fallback endpoints
      this.endpoints = {
        accounts: this.env.CHITTY_ACCOUNTS_API || 'https://accounts.chitty.cc/api/v1',
        payments: this.env.CHITTY_PAYMENTS_API || 'https://payments.chitty.cc/api/v1',
        billing: this.env.CHITTY_BILLING_API || 'https://billing.chitty.cc/api/v1',
        treasury: this.env.CHITTY_TREASURY_API || 'https://treasury.chitty.cc/api/v1'
      };
    }
  }

  /**
   * Initialize service account for ChittyRouter
   */
  async initializeServiceAccount() {
    try {
      // Check if service account exists
      const existingAccount = await this.getServiceAccount();

      if (!existingAccount) {
        // Create new service account
        console.log('💼 Creating ChittyRouter service account...');
        const account = await this.createServiceAccount();
        console.log(`✅ Service account created: ${account.accountId}`);
        return account;
      }

      console.log(`💼 Using existing service account: ${existingAccount.accountId}`);
      return existingAccount;

    } catch (error) {
      console.error('Failed to initialize service account:', error);
      throw error;
    }
  }

  /**
   * Get existing service account
   */
  async getServiceAccount() {
    try {
      const response = await fetch(`${this.endpoints.accounts}/accounts/service/${this.chittyId}`, {
        method: 'GET',
        headers: await this.getAuthenticatedHeaders()
      });

      if (response.status === 404) {
        return null; // Account doesn't exist
      }

      if (!response.ok) {
        throw new Error(`Failed to get service account: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      if (error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create new service account
   */
  async createServiceAccount() {
    try {
      const accountData = {
        chittyId: this.chittyId,
        accountType: 'SERVICE',
        serviceName: 'chittyrouter',
        description: 'ChittyRouter AI Gateway Service Account',
        capabilities: [
          'email_processing',
          'ai_routing',
          'document_analysis',
          'agent_orchestration'
        ],
        billingSettings: {
          plan: 'enterprise',
          paymentMethod: 'corporate',
          billingCycle: 'monthly'
        },
        limits: {
          maxTransactionsPerMonth: 100000,
          maxStorageGB: 1000,
          maxAIRequests: 50000
        }
      };

      const response = await fetch(`${this.endpoints.accounts}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.getAuthenticatedHeaders())
        },
        body: JSON.stringify(accountData)
      });

      if (!response.ok) {
        throw new Error(`Failed to create service account: ${response.status}`);
      }

      const account = await response.json();
      this.accounts.set(account.accountId, account);

      return account;

    } catch (error) {
      console.error('Failed to create service account:', error);
      throw error;
    }
  }

  /**
   * Process email-related transaction
   */
  async processEmailTransaction(transactionData) {
    const { operation, emailId, userId, metadata = {} } = transactionData;

    try {
      const transaction = {
        transactionId: `email_${Date.now()}`,
        type: 'EMAIL_PROCESSING',
        operation,
        chittyId: this.chittyId,
        userId,
        emailId,
        amount: this.calculateEmailProcessingCost(operation, metadata),
        currency: 'USD',
        metadata: {
          ...metadata,
          service: 'chittyrouter',
          emailOperation: operation,
          timestamp: new Date().toISOString()
        }
      };

      const result = await this.createTransaction(transaction);
      console.log(`💳 Email transaction processed: ${transaction.transactionId}`);

      return result;

    } catch (error) {
      console.error('Failed to process email transaction:', error);
      throw error;
    }
  }

  /**
   * Process AI operation transaction
   */
  async processAITransaction(transactionData) {
    const { model, operation, inputTokens, outputTokens, userId, metadata = {} } = transactionData;

    try {
      const transaction = {
        transactionId: `ai_${Date.now()}`,
        type: 'AI_PROCESSING',
        operation,
        chittyId: this.chittyId,
        userId,
        amount: this.calculateAICost(model, inputTokens, outputTokens),
        currency: 'USD',
        metadata: {
          ...metadata,
          service: 'chittyrouter',
          aiModel: model,
          inputTokens,
          outputTokens,
          aiOperation: operation,
          timestamp: new Date().toISOString()
        }
      };

      const result = await this.createTransaction(transaction);
      console.log(`🤖 AI transaction processed: ${transaction.transactionId}`);

      return result;

    } catch (error) {
      console.error('Failed to process AI transaction:', error);
      throw error;
    }
  }

  /**
   * Process storage transaction
   */
  async processStorageTransaction(transactionData) {
    const { operation, storageType, sizeBytes, userId, metadata = {} } = transactionData;

    try {
      const transaction = {
        transactionId: `storage_${Date.now()}`,
        type: 'STORAGE',
        operation,
        chittyId: this.chittyId,
        userId,
        amount: this.calculateStorageCost(storageType, sizeBytes, operation),
        currency: 'USD',
        metadata: {
          ...metadata,
          service: 'chittyrouter',
          storageType,
          sizeBytes,
          storageOperation: operation,
          timestamp: new Date().toISOString()
        }
      };

      const result = await this.createTransaction(transaction);
      console.log(`💾 Storage transaction processed: ${transaction.transactionId}`);

      return result;

    } catch (error) {
      console.error('Failed to process storage transaction:', error);
      throw error;
    }
  }

  /**
   * Create transaction record
   */
  async createTransaction(transaction) {
    try {
      const response = await fetch(`${this.endpoints.payments}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.getAuthenticatedHeaders())
        },
        body: JSON.stringify(transaction)
      });

      if (!response.ok) {
        throw new Error(`Failed to create transaction: ${response.status}`);
      }

      const result = await response.json();
      this.transactions.set(result.transactionId, result);

      return result;

    } catch (error) {
      console.error('Failed to create transaction:', error);
      throw error;
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(filters = {}) {
    try {
      const params = new URLSearchParams({
        chittyId: this.chittyId,
        limit: filters.limit || '50',
        offset: filters.offset || '0',
        ...filters
      });

      const response = await fetch(`${this.endpoints.payments}/transactions?${params}`, {
        method: 'GET',
        headers: await this.getAuthenticatedHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to get transaction history: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Failed to get transaction history:', error);
      throw error;
    }
  }

  /**
   * Get billing information
   */
  async getBillingInfo() {
    try {
      const response = await fetch(`${this.endpoints.billing}/billing/${this.chittyId}`, {
        method: 'GET',
        headers: await this.getAuthenticatedHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to get billing info: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Failed to get billing info:', error);
      throw error;
    }
  }

  /**
   * Create subscription for recurring billing
   */
  async createSubscription(subscriptionData) {
    try {
      const subscription = {
        chittyId: this.chittyId,
        plan: subscriptionData.plan || 'enterprise',
        interval: subscriptionData.interval || 'monthly',
        features: subscriptionData.features || [],
        metadata: {
          service: 'chittyrouter',
          ...subscriptionData.metadata
        }
      };

      const response = await fetch(`${this.endpoints.billing}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await this.getAuthenticatedHeaders())
        },
        body: JSON.stringify(subscription)
      });

      if (!response.ok) {
        throw new Error(`Failed to create subscription: ${response.status}`);
      }

      const result = await response.json();
      this.subscriptions.set(result.subscriptionId, result);

      console.log(`📅 Subscription created: ${result.subscriptionId}`);
      return result;

    } catch (error) {
      console.error('Failed to create subscription:', error);
      throw error;
    }
  }

  /**
   * Calculate email processing cost
   */
  calculateEmailProcessingCost(operation, metadata) {
    const baseCosts = {
      'receive': 0.001,
      'send': 0.002,
      'analyze': 0.005,
      'route': 0.001,
      'attachment_process': 0.010
    };

    let cost = baseCosts[operation] || 0.001;

    // Add AI processing cost if applicable
    if (metadata.aiProcessed) {
      cost += 0.005;
    }

    // Add attachment processing cost
    if (metadata.attachmentCount > 0) {
      cost += metadata.attachmentCount * 0.002;
    }

    return parseFloat(cost.toFixed(4));
  }

  /**
   * Calculate AI processing cost
   */
  calculateAICost(model, inputTokens, outputTokens) {
    const modelRates = {
      '@cf/meta/llama-3.1-8b-instruct': {
        input: 0.000002,
        output: 0.000004
      },
      '@cf/microsoft/resnet-50': {
        input: 0.000001,
        output: 0.000001
      },
      '@cf/openai/whisper': {
        input: 0.000003,
        output: 0.000005
      }
    };

    const rates = modelRates[model] || { input: 0.000002, output: 0.000004 };

    const inputCost = (inputTokens || 0) * rates.input;
    const outputCost = (outputTokens || 0) * rates.output;

    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  /**
   * Calculate storage cost
   */
  calculateStorageCost(storageType, sizeBytes, operation) {
    const storageCosts = {
      'kv': {
        'write': 0.000001,
        'read': 0.0000005,
        'delete': 0.0000002
      },
      'r2': {
        'write': 0.000005,
        'read': 0.000001,
        'delete': 0.000001
      },
      'durable_object': {
        'write': 0.000010,
        'read': 0.000002,
        'delete': 0.000003
      }
    };

    const rates = storageCosts[storageType] || storageCosts['kv'];
    const baseRate = rates[operation] || rates['write'];

    // Calculate cost based on size (per MB)
    const sizeMB = sizeBytes / (1024 * 1024);
    const cost = baseRate * Math.max(sizeMB, 0.001); // Minimum 0.001 MB

    return parseFloat(cost.toFixed(6));
  }

  /**
   * Get financial metrics
   */
  async getFinancialMetrics(period = 'month') {
    try {
      const params = new URLSearchParams({
        chittyId: this.chittyId,
        period
      });

      const response = await fetch(`${this.endpoints.billing}/metrics?${params}`, {
        method: 'GET',
        headers: await this.getAuthenticatedHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to get financial metrics: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Failed to get financial metrics:', error);
      return {
        totalSpent: 0,
        transactionCount: 0,
        topOperations: [],
        costBreakdown: {}
      };
    }
  }

  /**
   * Get authenticated headers for API requests
   */
  async getAuthenticatedHeaders() {
    const headers = {
      'X-ChittyID': this.chittyId,
      'X-Service': 'chittyrouter-financial',
      'User-Agent': 'ChittyRouter-Financial/2.0.0'
    };

    // Add authentication token if available
    if (this.securityManager?.authToken) {
      headers['Authorization'] = `Bearer ${this.securityManager.authToken}`;
    }

    return headers;
  }

  /**
   * Get financial status
   */
  getFinancialStatus() {
    return {
      initialized: this.initialized,
      chittyId: this.chittyId,
      accounts: this.accounts.size,
      transactions: this.transactions.size,
      subscriptions: this.subscriptions.size,
      endpoints: this.endpoints,
      serviceDiscovery: this.serviceDiscovery ? this.serviceDiscovery.getDiscoveryStatus() : null,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Process batch transactions
   */
  async processBatchTransactions(transactions) {
    try {
      const results = [];
      const errors = [];

      for (const transaction of transactions) {
        try {
          const result = await this.createTransaction(transaction);
          results.push(result);
        } catch (error) {
          errors.push({
            transaction: transaction.transactionId || 'unknown',
            error: error.message
          });
        }
      }

      console.log(`💳 Batch processed: ${results.length} transactions, ${errors.length} errors`);

      return {
        success: results.length,
        errorCount: errors.length,
        results,
        errors: errors
      };

    } catch (error) {
      console.error('Failed to process batch transactions:', error);
      throw error;
    }
  }
}

/**
 * Transaction Builder for easier transaction creation
 */
export class TransactionBuilder {
  constructor(chittyId) {
    this.chittyId = chittyId;
    this.transaction = {
      chittyId,
      timestamp: new Date().toISOString()
    };
  }

  setType(type) {
    this.transaction.type = type;
    return this;
  }

  setOperation(operation) {
    this.transaction.operation = operation;
    return this;
  }

  setAmount(amount) {
    this.transaction.amount = amount;
    return this;
  }

  setCurrency(currency) {
    this.transaction.currency = currency;
    return this;
  }

  setUserId(userId) {
    this.transaction.userId = userId;
    return this;
  }

  setMetadata(metadata) {
    this.transaction.metadata = { ...this.transaction.metadata, ...metadata };
    return this;
  }

  build() {
    this.transaction.transactionId = `${this.transaction.type.toLowerCase()}_${Date.now()}`;
    return { ...this.transaction };
  }
}

/**
 * Financial Services Factory
 */
export class FinancialServicesFactory {
  static async createService(env) {
    const service = new ChittyFinancialServices(env);
    await service.initialize();
    return service;
  }

  static createTransactionBuilder(chittyId) {
    return new TransactionBuilder(chittyId);
  }
}
