/**
 * Common AI Utilities
 * Consolidated from triage-agent.js, priority-agent.js, and other AI modules
 * Shared patterns for parsing, fallback, and error handling
 */

/**
 * Parse AI response with error handling
 * Attempts JSON extraction, falls back to natural language parsing
 */
export function parseAIResponse(response, defaultValue = {}) {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback to natural language parsing
    return {
      ...defaultValue,
      rawResponse: response.substring(0, 200),
    };
  } catch (error) {
    console.error("AI response parsing failed:", error);
    return defaultValue;
  }
}

/**
 * Extract category from natural language response
 */
export function extractCategory(response, categories = []) {
  const lowercaseResponse = response.toLowerCase();

  for (const category of categories) {
    if (lowercaseResponse.includes(category.replace("_", " "))) {
      return category;
    }
  }

  return categories[0] || "unknown";
}

/**
 * Extract confidence score from natural language response
 */
export function extractConfidence(response) {
  // Try percentage format
  const percentMatch = response.match(/(\d{1,3})%/);
  if (percentMatch) {
    return Math.min(parseInt(percentMatch[1]) / 100, 1.0);
  }

  // Try decimal format
  const decimalMatch = response.match(/0\.\d+/);
  if (decimalMatch) {
    return Math.min(parseFloat(decimalMatch[0]), 1.0);
  }

  // Default confidence based on certainty words
  const lowerResponse = response.toLowerCase();
  if (lowerResponse.includes("certain") || lowerResponse.includes("definitely"))
    return 0.9;
  if (lowerResponse.includes("likely") || lowerResponse.includes("probably"))
    return 0.8;
  if (lowerResponse.includes("possibly") || lowerResponse.includes("might"))
    return 0.6;

  return 0.7;
}

/**
 * Create AI prompt with consistent formatting
 */
export function createAIPrompt(template, variables = {}) {
  let prompt = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{${key}\\}`, "g");
    prompt = prompt.replace(placeholder, value);
  }

  return prompt;
}

/**
 * Execute AI call with automatic retry and fallback
 */
export async function executeAIWithFallback(ai, model, messages, fallbackFn) {
  try {
    const response = await ai.run(model, { messages });
    return {
      success: true,
      response: response.response,
      model,
      fallback: false,
    };
  } catch (error) {
    console.error(`AI model ${model} failed:`, error);

    if (fallbackFn) {
      const fallbackResult = await fallbackFn();
      return {
        success: true,
        response: fallbackResult,
        model: "fallback",
        fallback: true,
        error: error.message,
      };
    }

    throw error;
  }
}

/**
 * Validate AI response structure
 */
export function validateAIResponse(response, requiredFields = []) {
  const errors = [];

  for (const field of requiredFields) {
    if (!(field in response)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitize AI input to prevent prompt injection
 */
export function sanitizeAIInput(input, maxLength = 2000) {
  if (!input) return "";

  return input
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/javascript:/gi, "") // Remove JS protocols
    .replace(/on\w+=/gi, "") // Remove event handlers
    .substring(0, maxLength)
    .trim();
}

/**
 * Format AI error for logging
 */
export function formatAIError(error, context = {}) {
  return {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 3).join("\n"),
    },
    context,
    timestamp: new Date().toISOString(),
    type: "AI_ERROR",
  };
}

/**
 * Cache key generator for AI responses
 */
export function generateAICacheKey(model, prompt, options = {}) {
  const crypto = globalThis.crypto || require("crypto");
  const data = JSON.stringify({ model, prompt, options });

  if (crypto.subtle) {
    // Browser/Worker environment
    return crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(data))
      .then((hash) =>
        Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );
  } else {
    // Node environment
    return Promise.resolve(
      require("crypto").createHash("sha256").update(data).digest("hex"),
    );
  }
}

/**
 * AI response confidence threshold validator
 */
export function meetsConfidenceThreshold(confidence, threshold = 0.7) {
  return confidence >= threshold;
}

/**
 * Merge multiple AI responses with weighted confidence
 */
export function mergeAIResponses(responses, weights = null) {
  if (responses.length === 0) return null;
  if (responses.length === 1) return responses[0];

  const defaultWeights = weights || responses.map(() => 1 / responses.length);

  // Aggregate confidence scores
  const totalConfidence = responses.reduce((sum, resp, idx) => {
    return sum + (resp.confidence || 0.5) * defaultWeights[idx];
  }, 0);

  // Select highest confidence response as base
  const bestResponse = responses.reduce((best, current) => {
    return (current.confidence || 0) > (best.confidence || 0) ? current : best;
  });

  return {
    ...bestResponse,
    confidence: totalConfidence,
    merged: true,
    sources: responses.length,
  };
}
