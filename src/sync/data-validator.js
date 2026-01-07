/**
 * Data Validator - Ensures data integrity and consistency
 * Validates atomic facts, evidence, and session data before storage
 */

import crypto from 'crypto';

// Schema definitions for different data types
const SCHEMAS = {
  atomicFact: {
    required: ['factId', 'factText', 'factType'],
    optional: ['parentArtifactId', 'locationRef', 'classification', 'weight', 'credibility'],
    types: {
      factId: 'string',
      factText: 'string',
      factType: 'enum',
      weight: 'number',
      credibility: 'array'
    },
    enums: {
      factType: ['DATE', 'AMOUNT', 'ADMISSION', 'IDENTITY', 'LOCATION', 'RELATIONSHIP', 'ACTION', 'STATUS'],
      classification: ['FACT', 'SUPPORTED_CLAIM', 'ASSERTION', 'ALLEGATION', 'CONTRADICTION']
    }
  },
  evidence: {
    required: ['id', 'type', 'title', 'content'],
    optional: ['hash', 'signature', 'metadata'],
    types: {
      id: 'string',
      type: 'string',
      title: 'string',
      content: 'object'
    }
  },
  sessionData: {
    required: ['sessionId', 'projectId', 'timestamp'],
    optional: ['state', 'metadata'],
    types: {
      sessionId: 'string',
      projectId: 'string',
      timestamp: 'string'
    }
  }
};

export class DataValidator {
  constructor() {
    this.validationCache = new Map();
    this.cacheExpiry = 300000; // 5 minutes
  }

  /**
   * Validate data against schema
   */
  validate(data, dataType) {
    const cacheKey = this.getCacheKey(data, dataType);
    const cached = this.validationCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return cached.result;
    }

    const result = this.performValidation(data, dataType);

    // Cache result
    this.validationCache.set(cacheKey, {
      result,
      expiry: Date.now() + this.cacheExpiry
    });

    return result;
  }

  /**
   * Perform actual validation
   */
  performValidation(data, dataType) {
    const schema = SCHEMAS[dataType];
    if (!schema) {
      return {
        valid: false,
        errors: [`Unknown data type: ${dataType}`]
      };
    }

    const errors = [];

    // Check required fields
    for (const field of schema.required) {
      if (!(field in data) || data[field] === null || data[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate field types
    for (const [field, expectedType] of Object.entries(schema.types || {})) {
      if (field in data && data[field] !== null && data[field] !== undefined) {
        const validType = this.validateFieldType(data[field], expectedType, field, schema);
        if (!validType.valid) {
          errors.push(...validType.errors);
        }
      }
    }

    // Validate enum values
    for (const [field, enumValues] of Object.entries(schema.enums || {})) {
      if (field in data && data[field] !== null && data[field] !== undefined) {
        if (!enumValues.includes(data[field])) {
          errors.push(`Invalid value for ${field}: ${data[field]}. Must be one of: ${enumValues.join(', ')}`);
        }
      }
    }

    // Custom validations
    const customErrors = this.performCustomValidations(data, dataType);
    errors.push(...customErrors);

    return {
      valid: errors.length === 0,
      errors,
      dataType,
      validatedAt: new Date().toISOString()
    };
  }

  /**
   * Validate field type
   */
  validateFieldType(value, expectedType, field, schema) {
    const errors = [];

    switch (expectedType) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`Field ${field} must be a string, got ${typeof value}`);
        } else if (value.length === 0) {
          errors.push(`Field ${field} cannot be empty`);
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`Field ${field} must be a valid number, got ${typeof value}`);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`Field ${field} must be an array, got ${typeof value}`);
        }
        break;

      case 'object':
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          errors.push(`Field ${field} must be an object, got ${typeof value}`);
        }
        break;

      case 'enum':
        // Enum validation is handled separately
        break;

      default:
        errors.push(`Unknown type validation: ${expectedType}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Custom validations for specific data types
   */
  performCustomValidations(data, dataType) {
    const errors = [];

    switch (dataType) {
      case 'atomicFact':
        // Validate fact text length
        if (data.factText && data.factText.length > 5000) {
          errors.push('Fact text exceeds maximum length of 5000 characters');
        }

        // Validate weight range
        if (data.weight && (data.weight < 0 || data.weight > 1)) {
          errors.push('Weight must be between 0 and 1');
        }

        // Validate credibility factors
        if (data.credibility && Array.isArray(data.credibility)) {
          const validCredibility = ['DIRECT_EVIDENCE', 'WITNESS_TESTIMONY', 'EXPERT_OPINION', 'DOCUMENTARY', 'CIRCUMSTANTIAL', 'BLOCKCHAIN_VERIFIED'];
          for (const cred of data.credibility) {
            if (!validCredibility.includes(cred)) {
              errors.push(`Invalid credibility factor: ${cred}`);
            }
          }
        }
        break;

      case 'evidence':
        // Validate evidence hash if present
        if (data.hash && !this.isValidHash(data.hash)) {
          errors.push('Invalid hash format');
        }

        // Validate content structure
        if (data.content && typeof data.content === 'object') {
          if (!data.content.text && !data.content.binary && !data.content.reference) {
            errors.push('Evidence content must have text, binary, or reference field');
          }
        }
        break;

      case 'sessionData':
        // Validate timestamp format
        if (data.timestamp && !this.isValidTimestamp(data.timestamp)) {
          errors.push('Invalid timestamp format');
        }

        // Validate session ID format
        if (data.sessionId && !this.isValidSessionId(data.sessionId)) {
          errors.push('Invalid session ID format');
        }
        break;
    }

    return errors;
  }

  /**
   * Validate hash format (SHA-256)
   */
  isValidHash(hash) {
    return /^[a-f0-9]{64}$/i.test(hash);
  }

  /**
   * Validate timestamp format (ISO 8601)
   */
  isValidTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date instanceof Date && !isNaN(date) && date.toISOString() === timestamp;
  }

  /**
   * Validate session ID format
   */
  isValidSessionId(sessionId) {
    // Should be in format: timestamp-random or similar
    return /^[a-zA-Z0-9\-_]{10,}$/.test(sessionId);
  }

  /**
   * Generate cache key for validation result
   */
  getCacheKey(data, dataType) {
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(`${dataType}:${dataString}`).digest('hex');
  }

  /**
   * Validate batch of data
   */
  validateBatch(items, dataType) {
    const results = [];
    let validCount = 0;

    for (let i = 0; i < items.length; i++) {
      const result = this.validate(items[i], dataType);
      results.push({
        index: i,
        item: items[i],
        ...result
      });

      if (result.valid) {
        validCount++;
      }
    }

    return {
      totalItems: items.length,
      validItems: validCount,
      invalidItems: items.length - validCount,
      results,
      batchValid: validCount === items.length
    };
  }

  /**
   * Get validation statistics
   */
  getStats() {
    return {
      cacheSize: this.validationCache.size,
      cacheHitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0,
      totalValidations: this.totalValidations || 0
    };
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.validationCache.clear();
  }
}

// Export singleton instance
let validatorInstance = null;

export function getValidator() {
  if (!validatorInstance) {
    validatorInstance = new DataValidator();
  }
  return validatorInstance;
}

export default getValidator;