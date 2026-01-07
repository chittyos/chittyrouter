/**
 * ChittyOS Schema Validation Service Integration
 * Connects to schema.chitty.cc for data validation and schema management
 */

const SCHEMA_SERVICE_URL = 'https://schema.chitty.cc/api/v1';

/**
 * Validate email data against ChittyOS schema
 */
export async function validateEmailSchema(emailData) {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/validate/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: emailData,
        schemaVersion: '2.0',
        strict: true
      })
    });

    if (!response.ok) {
      throw new Error(`Schema validation failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      valid: result.valid,
      errors: result.errors || [],
      warnings: result.warnings || [],
      normalizedData: result.normalizedData
    };

  } catch (error) {
    console.error('Email schema validation failed:', error);
    return {
      valid: false,
      errors: [`Schema service error: ${error.message}`],
      warnings: [],
      normalizedData: emailData
    };
  }
}

/**
 * Validate ChittyID format against schema
 */
export async function validateChittyIDSchema(chittyId, type) {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/validate/chittyid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chittyId: chittyId,
        expectedType: type,
        schemaVersion: '2.0'
      })
    });

    if (!response.ok) {
      throw new Error(`ChittyID validation failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      valid: result.valid,
      type: result.detectedType,
      format: result.format,
      metadata: result.metadata,
      errors: result.errors || []
    };

  } catch (error) {
    console.error('ChittyID schema validation failed:', error);
    return {
      valid: false,
      type: 'unknown',
      format: 'unknown',
      metadata: null,
      errors: [`Schema service error: ${error.message}`]
    };
  }
}

/**
 * Validate AI agent response schema
 */
export async function validateAIResponseSchema(responseData, agentType) {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/validate/ai-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: responseData,
        agentType: agentType,
        schemaVersion: '2.0'
      })
    });

    if (!response.ok) {
      throw new Error(`AI response validation failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      valid: result.valid,
      confidence: result.confidence,
      requiredFields: result.requiredFields,
      errors: result.errors || [],
      suggestions: result.suggestions || []
    };

  } catch (error) {
    console.error('AI response schema validation failed:', error);
    return {
      valid: false,
      confidence: 0,
      requiredFields: [],
      errors: [`Schema service error: ${error.message}`],
      suggestions: []
    };
  }
}

/**
 * Validate document metadata schema
 */
export async function validateDocumentSchema(documentData) {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/validate/document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: documentData,
        schemaVersion: '2.0',
        includeMetadata: true
      })
    });

    if (!response.ok) {
      throw new Error(`Document validation failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      valid: result.valid,
      documentType: result.documentType,
      classification: result.classification,
      extractedFields: result.extractedFields,
      complianceFlags: result.complianceFlags,
      errors: result.errors || []
    };

  } catch (error) {
    console.error('Document schema validation failed:', error);
    return {
      valid: false,
      documentType: 'unknown',
      classification: 'unclassified',
      extractedFields: {},
      complianceFlags: [],
      errors: [`Schema service error: ${error.message}`]
    };
  }
}

/**
 * Get schema definition for a specific type
 */
export async function getSchemaDefinition(schemaType, version = '2.0') {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/schema/${schemaType}?version=${version}`);

    if (!response.ok) {
      throw new Error(`Schema fetch failed: ${response.status}`);
    }

    const schema = await response.json();
    return {
      schema: schema.definition,
      version: schema.version,
      lastUpdated: schema.lastUpdated,
      description: schema.description
    };

  } catch (error) {
    console.error('Failed to fetch schema definition:', error);
    return null;
  }
}

/**
 * Validate case data against legal schema
 */
export async function validateCaseSchema(caseData) {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/validate/legal-case`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: caseData,
        schemaVersion: '2.0',
        jurisdiction: caseData.jurisdiction || 'US',
        caseType: caseData.caseType || 'civil'
      })
    });

    if (!response.ok) {
      throw new Error(`Case validation failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      valid: result.valid,
      casePattern: result.casePattern,
      parties: result.identifiedParties,
      jurisdiction: result.jurisdiction,
      caseType: result.caseType,
      complianceIssues: result.complianceIssues,
      errors: result.errors || []
    };

  } catch (error) {
    console.error('Case schema validation failed:', error);
    return {
      valid: false,
      casePattern: null,
      parties: [],
      jurisdiction: 'unknown',
      caseType: 'unknown',
      complianceIssues: [],
      errors: [`Schema service error: ${error.message}`]
    };
  }
}

/**
 * Validate service registration data
 */
export async function validateServiceSchema(serviceData) {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/validate/service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: serviceData,
        schemaVersion: '2.0',
        serviceType: serviceData.type || 'AI_GATEWAY'
      })
    });

    if (!response.ok) {
      throw new Error(`Service validation failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      valid: result.valid,
      serviceType: result.serviceType,
      requiredCapabilities: result.requiredCapabilities,
      endpoints: result.validatedEndpoints,
      dependencies: result.validatedDependencies,
      errors: result.errors || []
    };

  } catch (error) {
    console.error('Service schema validation failed:', error);
    return {
      valid: false,
      serviceType: 'unknown',
      requiredCapabilities: [],
      endpoints: {},
      dependencies: [],
      errors: [`Schema service error: ${error.message}`]
    };
  }
}

/**
 * Register a new schema with the service
 */
export async function registerCustomSchema(schemaDefinition, schemaType) {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: schemaType,
        definition: schemaDefinition,
        version: '1.0',
        description: `Custom schema for ${schemaType}`,
        namespace: 'chittyrouter'
      })
    });

    if (!response.ok) {
      throw new Error(`Schema registration failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      registered: true,
      schemaId: result.schemaId,
      version: result.version
    };

  } catch (error) {
    console.error('Failed to register custom schema:', error);
    return {
      registered: false,
      error: error.message
    };
  }
}

/**
 * Batch validate multiple items
 */
export async function batchValidate(items) {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/validate/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: items,
        schemaVersion: '2.0',
        continueOnError: true
      })
    });

    if (!response.ok) {
      throw new Error(`Batch validation failed: ${response.status}`);
    }

    const result = await response.json();
    return {
      results: result.results,
      summary: {
        total: result.total,
        valid: result.validCount,
        invalid: result.invalidCount,
        errors: result.totalErrors
      }
    };

  } catch (error) {
    console.error('Batch validation failed:', error);
    return {
      results: [],
      summary: {
        total: items.length,
        valid: 0,
        invalid: items.length,
        errors: items.length
      }
    };
  }
}

/**
 * Get schema health status
 */
export async function getSchemaServiceHealth() {
  try {
    const response = await fetch(`${SCHEMA_SERVICE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    return {
      status: response.ok ? 'healthy' : 'unhealthy',
      statusCode: response.status,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    return {
      status: 'unreachable',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}