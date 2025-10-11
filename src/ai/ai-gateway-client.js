/**
 * ChittyOS AI Gateway Client
 * Universal proxy for all AI providers with caching, fallback, and cost tracking
 */

export class AIGatewayClient {
  constructor(env) {
    this.env = env;
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID || '0bc21e3a5a9de1a4cc843be9c3e98121';
    this.gatewayId = env.AI_GATEWAY_ID || 'chittyos-ai-gateway';
    this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${this.accountId}/${this.gatewayId}`;

    // Provider configurations
    this.providers = {
      openai: {
        url: `${this.baseUrl}/openai`,
        apiKey: env.OPENAI_API_KEY,
        models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        costPer1kTokens: { input: 0.03, output: 0.06 }, // GPT-4
      },
      anthropic: {
        url: `${this.baseUrl}/anthropic`,
        apiKey: env.ANTHROPIC_API_KEY,
        models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
        costPer1kTokens: { input: 0.015, output: 0.075 }, // Claude-3-Opus
      },
      google: {
        url: `${this.baseUrl}/google-ai`,
        apiKey: env.GOOGLE_AI_API_KEY,
        models: ['gemini-pro', 'gemini-pro-vision'],
        costPer1kTokens: { input: 0.0005, output: 0.0015 }, // Gemini Pro
      },
      huggingface: {
        url: `${this.baseUrl}/huggingface`,
        apiKey: env.HUGGINGFACE_API_KEY,
        models: ['mistralai/Mixtral-8x7B-Instruct-v0.1'],
        costPer1kTokens: { input: 0.0002, output: 0.0002 },
      },
      mistral: {
        url: `${this.baseUrl}/mistral`,
        apiKey: env.MISTRAL_API_KEY,
        models: ['mistral-large', 'mistral-medium', 'mistral-small'],
        costPer1kTokens: { input: 0.008, output: 0.024 }, // Mistral Large
      },
      workersai: {
        url: 'direct', // Direct Workers AI binding
        apiKey: null, // No key needed - uses binding
        models: [
          '@cf/meta/llama-4-scout-17b-16e-instruct',
          '@cf/openai/gpt-oss-120b',
          '@cf/google/gemma-3-12b-it',
        ],
        costPer1kTokens: { input: 0, output: 0 }, // Free tier
      },
    };

    // Task complexity routing
    this.taskRouting = {
      simple: ['workersai'],
      moderate: ['workersai', 'mistral', 'google'],
      complex: ['anthropic', 'openai'],
      vision: ['google', 'workersai'],
      specialized: ['huggingface', 'workersai'],
    };
  }

  /**
   * Route AI request through gateway with intelligent provider selection
   */
  async complete(prompt, options = {}) {
    const {
      complexity = 'moderate',
      maxTokens = 1000,
      temperature = 0.7,
      preferredProvider = null,
      cacheKey = null,
      fallbackChain = true,
    } = options;

    // Determine provider based on task complexity
    const providers = preferredProvider
      ? [preferredProvider]
      : this.taskRouting[complexity] || this.taskRouting.moderate;

    let lastError = null;

    // Try providers in order (fallback chain)
    for (const providerName of providers) {
      try {
        console.log(`🤖 Trying provider: ${providerName}`);

        const result = await this._callProvider(providerName, prompt, {
          maxTokens,
          temperature,
          cacheKey,
        });

        // Track successful call
        await this._trackUsage(providerName, result.usage);

        return {
          success: true,
          provider: providerName,
          response: result.response,
          usage: result.usage,
          cost: this._calculateCost(providerName, result.usage),
          cached: result.cached || false,
        };
      } catch (error) {
        console.warn(`⚠️ Provider ${providerName} failed:`, error.message);
        lastError = error;

        if (!fallbackChain) {
          throw error;
        }

        // Continue to next provider in fallback chain
        continue;
      }
    }

    // All providers failed
    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Call specific provider through gateway
   */
  async _callProvider(providerName, prompt, options) {
    const provider = this.providers[providerName];

    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    // Workers AI - direct binding (no gateway)
    if (providerName === 'workersai') {
      return await this._callWorkersAI(prompt, options);
    }

    // External providers - route through AI Gateway
    return await this._callGateway(providerName, prompt, options);
  }

  /**
   * Call Cloudflare Workers AI directly (free tier)
   */
  async _callWorkersAI(prompt, options) {
    const model = options.model || '@cf/meta/llama-4-scout-17b-16e-instruct';

    const response = await this.env.AI.run(model, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens,
      temperature: options.temperature || 0.7,
    });

    return {
      response: response.response,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
      cached: false,
    };
  }

  /**
   * Call external provider through AI Gateway
   */
  async _callGateway(providerName, prompt, options) {
    const provider = this.providers[providerName];
    const url = provider.url;

    // Build provider-specific request format
    const requestBody = this._buildProviderRequest(providerName, prompt, options);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
        'cf-aig-cache-key': options.cacheKey || null, // Enable caching
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${providerName} API error: ${error}`);
    }

    const data = await response.json();
    const cached = response.headers.get('cf-aig-cache-status') === 'HIT';

    return {
      response: this._extractResponse(providerName, data),
      usage: this._extractUsage(providerName, data),
      cached,
    };
  }

  /**
   * Build provider-specific request format
   */
  _buildProviderRequest(providerName, prompt, options) {
    switch (providerName) {
      case 'openai':
        return {
          model: options.model || 'gpt-4-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens,
          temperature: options.temperature,
        };

      case 'anthropic':
        return {
          model: options.model || 'claude-3-sonnet-20240229',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens,
          temperature: options.temperature,
        };

      case 'google':
        return {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: options.maxTokens,
            temperature: options.temperature,
          },
        };

      case 'mistral':
        return {
          model: options.model || 'mistral-medium',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens,
          temperature: options.temperature,
        };

      case 'huggingface':
        return {
          inputs: prompt,
          parameters: {
            max_new_tokens: options.maxTokens,
            temperature: options.temperature,
          },
        };

      default:
        throw new Error(`Unknown provider format: ${providerName}`);
    }
  }

  /**
   * Extract response from provider-specific format
   */
  _extractResponse(providerName, data) {
    switch (providerName) {
      case 'openai':
        return data.choices[0].message.content;
      case 'anthropic':
        return data.content[0].text;
      case 'google':
        return data.candidates[0].content.parts[0].text;
      case 'mistral':
        return data.choices[0].message.content;
      case 'huggingface':
        return data[0].generated_text;
      default:
        return data;
    }
  }

  /**
   * Extract usage from provider-specific format
   */
  _extractUsage(providerName, data) {
    switch (providerName) {
      case 'openai':
      case 'mistral':
        return {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
        };
      case 'anthropic':
        return {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        };
      case 'google':
        return {
          inputTokens: data.usageMetadata.promptTokenCount,
          outputTokens: data.usageMetadata.candidatesTokenCount,
        };
      default:
        return { inputTokens: 0, outputTokens: 0 };
    }
  }

  /**
   * Calculate cost for provider call
   */
  _calculateCost(providerName, usage) {
    const provider = this.providers[providerName];
    const inputCost = (usage.inputTokens / 1000) * provider.costPer1kTokens.input;
    const outputCost = (usage.outputTokens / 1000) * provider.costPer1kTokens.output;
    return inputCost + outputCost;
  }

  /**
   * Track usage for analytics and cost optimization
   */
  async _trackUsage(providerName, usage) {
    // Store in KV or Durable Object for analytics
    const key = `ai_usage:${providerName}:${new Date().toISOString().split('T')[0]}`;

    try {
      const current = await this.env.AI_USAGE_KV?.get(key, 'json') || {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
      };

      await this.env.AI_USAGE_KV?.put(key, JSON.stringify({
        calls: current.calls + 1,
        inputTokens: current.inputTokens + usage.inputTokens,
        outputTokens: current.outputTokens + usage.outputTokens,
      }));
    } catch (error) {
      console.warn('Failed to track usage:', error);
    }
  }

  /**
   * Get usage analytics
   */
  async getUsageStats(days = 7) {
    const stats = {};
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      for (const providerName of Object.keys(this.providers)) {
        const key = `ai_usage:${providerName}:${dateStr}`;
        const data = await this.env.AI_USAGE_KV?.get(key, 'json');

        if (data) {
          if (!stats[providerName]) {
            stats[providerName] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
          }
          stats[providerName].calls += data.calls;
          stats[providerName].inputTokens += data.inputTokens;
          stats[providerName].outputTokens += data.outputTokens;
          stats[providerName].cost += this._calculateCost(providerName, data);
        }
      }
    }

    return stats;
  }
}
