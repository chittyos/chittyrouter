/**
 * Auto-Classification Agent
 *
 * Automatically labels, categorizes, and schematicizes EVERYTHING that enters the system.
 * No human intervention required for classification.
 *
 * Philosophy:
 * - Every input gets labeled (descriptive tags)
 * - Every input gets categorized (hierarchical taxonomy)
 * - Every input gets schematicized (mapped to ChittySchema entities)
 */

import { UniversalIngestionAgent } from "./universal-ingestion-agent.js";

export class AutoClassificationAgent {
  constructor(env) {
    this.env = env;
    this.ai = env.AI;
    this.schema = env.PLATFORM_STORAGE;
    this.ingestionAgent = new UniversalIngestionAgent(env);
  }

  /**
   * Comprehensive auto-classification pipeline
   * Returns labels, categories, and schema mappings for any input
   */
  async classify(input) {
    // Run all classification tasks in parallel
    const [labels, categories, schema, entities, temporal] = await Promise.all([
      this.generateLabels(input),
      this.categorizeHierarchical(input),
      this.mapToSchema(input),
      this.extractEntities(input),
      this.analyzeTemporalContext(input),
    ]);

    return {
      labels,
      categories,
      schema,
      entities,
      temporal,
      classification: {
        confidence: this.calculateConfidence(labels, categories, schema),
        timestamp: new Date().toISOString(),
        version: "v1.0",
      },
    };
  }

  /**
   * Generate descriptive labels
   * Examples: "financial-document", "legal-correspondence", "property-deed"
   */
  async generateLabels(input) {
    const prompt = `Generate precise, descriptive labels for this input.

Input: ${this.formatInput(input)}

Provide 5-10 labels covering:
1. Content type (email, pdf, image, text, etc.)
2. Domain (legal, financial, personal, business, etc.)
3. Purpose (evidence, reference, communication, transaction, etc.)
4. Sensitivity (public, private, confidential, privileged, etc.)
5. Temporal relevance (urgent, current, historical, archived, etc.)

Return ONLY comma-separated labels, no explanations.`;

    const response = await this.ai.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          {
            role: "system",
            content:
              "You are a precise labeling system. Generate accurate, searchable labels.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    );

    // Parse comma-separated labels
    const labelsText = response.response || response;
    const labels = labelsText
      .split(",")
      .map((l) =>
        l
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-"),
      )
      .filter((l) => l.length > 2);

    return {
      primary: labels[0] || "uncategorized",
      secondary: labels.slice(1, 5),
      all: labels,
      generated: new Date().toISOString(),
    };
  }

  /**
   * Hierarchical categorization
   * Uses taxonomy tree: Domain → Type → Subtype → Specific
   */
  async categorizeHierarchical(input) {
    const prompt = `Categorize this input using hierarchical taxonomy.

Input: ${this.formatInput(input)}

Provide hierarchical categories in format:
Domain → Type → Subtype → Specific

Examples:
- Legal → Litigation → Civil → Property Dispute
- Financial → Transaction → Payment → Rent Payment
- Communication → Email → Business → Contract Negotiation
- Document → Government → Court → Filing

Return ONLY the category path, one per line.`;

    const response = await this.ai.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          {
            role: "system",
            content:
              "You are a hierarchical classification system. Use precise taxonomy.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    );

    const lines = (response.response || response)
      .split("\n")
      .filter((l) => l.includes("→"));
    const primary = lines[0] || "Uncategorized → Unknown → Unknown → Unknown";
    const parts = primary.split("→").map((p) => p.trim());

    return {
      domain: parts[0] || "Uncategorized",
      type: parts[1] || "Unknown",
      subtype: parts[2] || "Unknown",
      specific: parts[3] || "Unknown",
      path: primary,
      alternatives: lines.slice(1).map((line) => {
        const altParts = line.split("→").map((p) => p.trim());
        return {
          domain: altParts[0],
          type: altParts[1],
          subtype: altParts[2],
          specific: altParts[3],
          path: line,
        };
      }),
    };
  }

  /**
   * Map to ChittySchema entities
   * Determines which ChittySchema tables/entities this maps to
   */
  async mapToSchema(input) {
    const prompt = `Map this input to ChittySchema entity types.

Input: ${this.formatInput(input)}

ChittySchema Entity Types:
- PEO (People): individuals, organizations, entities with agency
- PLACE (Places): addresses, locations, geographic entities
- PROP (Property): real property, assets, owned things
- EVNT (Events): transactions, occurrences, temporal happenings
- INFO (Information): documents, communications, data
- FACT (Facts): verified statements, claims, assertions
- AUTH (Authorities): governing bodies, regulators, courts
- CONTEXT (Context): relationships, connections, patterns

Return:
1. Primary entity type (required)
2. Secondary entity types (related entities)
3. Schema fields to populate
4. Relationships to other entities

Format as JSON.`;

    const response = await this.ai.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          {
            role: "system",
            content:
              "You are a ChittySchema mapping expert. Map inputs to entity types precisely.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    );

    try {
      const mapping = JSON.parse(response.response || response);
      return {
        primary: mapping.primary || "INFO",
        secondary: mapping.secondary || [],
        fields: mapping.fields || {},
        relationships: mapping.relationships || [],
        confidence: mapping.confidence || 0.8,
      };
    } catch (error) {
      // Fallback parsing
      return {
        primary: "INFO",
        secondary: [],
        fields: {},
        relationships: [],
        confidence: 0.5,
        parseError: error.message,
      };
    }
  }

  /**
   * Extract entities (PEO, PLACE, PROP)
   * Identifies specific entities that need ChittyIDs
   */
  async extractEntities(input) {
    const prompt = `Extract all entities from this input that need ChittyIDs.

Input: ${this.formatInput(input)}

Extract:
1. People (PEO): names, titles, roles
2. Places (PLACE): addresses, locations, jurisdictions
3. Properties (PROP): real estate, assets, specific items
4. Organizations (PEO-ORG): companies, LLCs, corporations
5. Dates/Times: specific temporal references
6. Amounts: money, quantities, measurements

Return as JSON array with format:
[
  { "type": "PEO", "name": "...", "role": "...", "confidence": 0.95 },
  { "type": "PLACE", "address": "...", "confidence": 0.9 }
]`;

    const response = await this.ai.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          {
            role: "system",
            content:
              "You are an entity extraction specialist. Extract ALL entities precisely.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    );

    try {
      const entities = JSON.parse(response.response || response);
      return Array.isArray(entities) ? entities : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Analyze temporal context
   * When was this created? When does it become relevant? Expiration?
   */
  async analyzeTemporalContext(input) {
    const prompt = `Analyze temporal context for this input.

Input: ${this.formatInput(input)}

Determine:
1. Creation date (when was this created?)
2. Relevant period (when is this relevant?)
3. Expiration (when does this become irrelevant?)
4. Events referenced (specific dates mentioned)
5. Temporal urgency (immediate, short-term, long-term, historical)

Return as JSON.`;

    const response = await this.ai.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          {
            role: "system",
            content:
              "You are a temporal analysis expert. Identify all time-related aspects.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    );

    try {
      return JSON.parse(response.response || response);
    } catch (error) {
      return {
        creation: new Date().toISOString(),
        relevantPeriod: "indefinite",
        expiration: null,
        events: [],
        urgency: "medium",
      };
    }
  }

  /**
   * Store classification in ChittySchema
   * Creates structured records with full classification metadata
   */
  async storeClassification(chittyId, input, classification) {
    const record = {
      chittyId,
      input: this.formatInput(input),
      classification: {
        labels: classification.labels,
        categories: classification.categories,
        schema: classification.schema,
        entities: classification.entities,
        temporal: classification.temporal,
        metadata: {
          classified_at: new Date().toISOString(),
          classifier_version: "v1.0",
          confidence: classification.classification.confidence,
        },
      },
    };

    // Store in ChittySchema-compatible format
    await this.schema.put(`classification:${chittyId}`, JSON.stringify(record));

    // Index for search
    await this.indexClassification(chittyId, classification);

    return record;
  }

  /**
   * Index classification for fast search
   * Creates searchable index by labels, categories, entities
   */
  async indexClassification(chittyId, classification) {
    // Index by primary label
    const primaryKey = `index:label:${classification.labels.primary}`;
    const labelIndex = await this.schema.get(primaryKey);
    const labelList = labelIndex ? JSON.parse(labelIndex) : [];
    labelList.push(chittyId);
    await this.schema.put(primaryKey, JSON.stringify(labelList));

    // Index by category domain
    const categoryKey = `index:category:${classification.categories.domain}`;
    const categoryIndex = await this.schema.get(categoryKey);
    const categoryList = categoryIndex ? JSON.parse(categoryIndex) : [];
    categoryList.push(chittyId);
    await this.schema.put(categoryKey, JSON.stringify(categoryList));

    // Index by schema type
    const schemaKey = `index:schema:${classification.schema.primary}`;
    const schemaIndex = await this.schema.get(schemaKey);
    const schemaList = schemaIndex ? JSON.parse(schemaIndex) : [];
    schemaList.push(chittyId);
    await this.schema.put(schemaKey, JSON.stringify(schemaList));
  }

  /**
   * Search by classification
   * Query by label, category, or schema type
   */
  async search(query) {
    const results = [];

    // Search by label
    const labelKey = `index:label:${query.label}`;
    const labelResults = await this.schema.get(labelKey);
    if (labelResults) {
      results.push(...JSON.parse(labelResults));
    }

    // Search by category
    if (query.category) {
      const categoryKey = `index:category:${query.category}`;
      const categoryResults = await this.schema.get(categoryKey);
      if (categoryResults) {
        results.push(...JSON.parse(categoryResults));
      }
    }

    // Search by schema type
    if (query.schemaType) {
      const schemaKey = `index:schema:${query.schemaType}`;
      const schemaResults = await this.schema.get(schemaKey);
      if (schemaResults) {
        results.push(...JSON.parse(schemaResults));
      }
    }

    // Deduplicate
    return [...new Set(results)];
  }

  // Helper methods
  formatInput(input) {
    if (typeof input === "string") return input;
    if (input.subject)
      return `Subject: ${input.subject}\nBody: ${input.body || ""}`;
    if (input.filename)
      return `File: ${input.filename}\nType: ${input.type || "unknown"}`;
    return JSON.stringify(input);
  }

  calculateConfidence(labels, categories, schema) {
    // Average confidence from all classification methods
    const labelConf = labels.all.length > 0 ? 0.9 : 0.5;
    const categoryConf = categories.domain !== "Uncategorized" ? 0.9 : 0.5;
    const schemaConf = schema.confidence || 0.7;

    return (labelConf + categoryConf + schemaConf) / 3;
  }
}
