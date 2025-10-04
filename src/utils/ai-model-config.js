/**
 * ChittyOS AI Model Configuration
 * Centralized configuration for latest Cloudflare Workers AI models
 */

export class AIModelConfig {
  constructor(env) {
    this.env = env;
    this.models = {
      primary: env.AI_MODEL_PRIMARY || '@cf/meta/llama-4-scout-17b-16e-instruct',
      secondary: env.AI_MODEL_SECONDARY || '@cf/openai/gpt-oss-120b',
      vision: env.AI_MODEL_VISION || '@cf/meta/llama-3.2-11b-vision-instruct',
      audio: env.AI_MODEL_AUDIO || '@cf/openai/whisper',
      reasoning: env.AI_MODEL_REASONING || '@cf/google/gemma-3-12b-it',
      // Fallback for legacy code
      legacy: '@cf/meta/llama-3.1-8b-instruct'
    };
  }

  /**
   * Get primary AI model for general tasks
   */
  getPrimaryModel() {
    return this.models.primary;
  }

  /**
   * Get secondary AI model for fallback
   */
  getSecondaryModel() {
    return this.models.secondary;
  }

  /**
   * Get vision model for image/document analysis
   */
  getVisionModel() {
    return this.models.vision;
  }

  /**
   * Get audio model for voice processing
   */
  getAudioModel() {
    return this.models.audio;
  }

  /**
   * Get reasoning model for complex logic
   */
  getReasoningModel() {
    return this.models.reasoning;
  }

  /**
   * Get best model for specific task type
   */
  getModelForTask(taskType) {
    const taskModels = {
      'email_routing': this.models.primary,
      'document_analysis': this.models.vision,
      'legal_reasoning': this.models.reasoning,
      'triage': this.models.primary,
      'priority_assessment': this.models.reasoning,
      'response_generation': this.models.secondary,
      'content_classification': this.models.primary,
      'vision_analysis': this.models.vision,
      'audio_processing': this.models.audio,
      'general': this.models.primary
    };

    return taskModels[taskType] || this.models.primary;
  }

  /**
   * Get model capabilities
   */
  getModelCapabilities(model) {
    const capabilities = {
      '@cf/meta/llama-4-scout-17b-16e-instruct': {
        multimodal: true,
        contextWindow: 128000,
        reasoning: 'high',
        speed: 'medium',
        languages: 'multilingual',
        features: ['function_calling', 'json_mode', 'vision']
      },
      '@cf/openai/gpt-oss-120b': {
        multimodal: false,
        contextWindow: 128000,
        reasoning: 'very_high',
        speed: 'medium',
        languages: 'multilingual',
        features: ['function_calling', 'json_mode', 'advanced_reasoning']
      },
      '@cf/meta/llama-3.2-11b-vision-instruct': {
        multimodal: true,
        contextWindow: 128000,
        reasoning: 'high',
        speed: 'fast',
        languages: 'multilingual',
        features: ['vision', 'document_analysis', 'image_understanding']
      },
      '@cf/google/gemma-3-12b-it': {
        multimodal: true,
        contextWindow: 128000,
        reasoning: 'very_high',
        speed: 'medium',
        languages: 'multilingual',
        features: ['advanced_reasoning', 'multimodal', 'json_mode']
      }
    };

    return capabilities[model] || capabilities[this.models.primary];
  }

  /**
   * Get cost estimation for model
   */
  getModelCost(model) {
    const costs = {
      '@cf/meta/llama-4-scout-17b-16e-instruct': { input: 0.0002, output: 0.0004 },
      '@cf/openai/gpt-oss-120b': { input: 0.0003, output: 0.0006 },
      '@cf/meta/llama-3.2-11b-vision-instruct': { input: 0.0002, output: 0.0004 },
      '@cf/google/gemma-3-12b-it': { input: 0.0002, output: 0.0004 },
      '@cf/openai/whisper': { input: 0.0001, output: 0.0001 },
      // Legacy fallback
      '@cf/meta/llama-3.1-8b-instruct': { input: 0.0001, output: 0.0002 }
    };

    return costs[model] || costs[this.models.primary];
  }

  /**
   * Validate model availability
   */
  async validateModel(ai, model) {
    try {
      const testResponse = await ai.run(model, {
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 1
      });
      return !!testResponse;
    } catch (error) {
      console.warn(`Model ${model} validation failed:`, error.message);
      return false;
    }
  }

  /**
   * Get fallback model chain
   */
  getFallbackChain(taskType) {
    const primary = this.getModelForTask(taskType);
    const fallbacks = [
      primary,
      this.models.secondary,
      this.models.primary,
      this.models.legacy
    ];

    // Remove duplicates while preserving order
    return [...new Set(fallbacks)];
  }

  /**
   * Execute with automatic fallback
   */
  async runWithFallback(ai, taskType, prompt, options = {}) {
    const fallbackChain = this.getFallbackChain(taskType);
    let lastError;

    for (const model of fallbackChain) {
      try {
        console.log(`🤖 Attempting ${taskType} with ${model}`);

        const response = await ai.run(model, {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.max_tokens || 1000,
          temperature: options.temperature || 0.1,
          ...options
        });

        if (response && response.response) {
          console.log(`✅ ${taskType} successful with ${model}`);
          return {
            response: response.response,
            model,
            success: true
          };
        }
      } catch (error) {
        console.warn(`❌ ${model} failed for ${taskType}:`, error.message);
        lastError = error;
        continue;
      }
    }

    throw new Error(`All models failed for ${taskType}. Last error: ${lastError?.message}`);
  }

  /**
   * Get model configuration summary
   */
  getConfigSummary() {
    return {
      version: '2.1.0-ai',
      models: this.models,
      features: {
        multimodal: true,
        visionSupport: true,
        audioSupport: true,
        advancedReasoning: true,
        functionCalling: true,
        jsonMode: true,
        fallbackChain: true
      },
      enterprise: {
        versionManagement: true,
        randomnessBeacon: true,
        costOptimization: true,
        performanceMonitoring: true
      }
    };
  }
}

export default AIModelConfig;