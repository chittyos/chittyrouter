/**
 * Document Classifier - NLP/ML-based document classification
 * Uses Cloudflare AI for intelligent categorization
 */

/**
 * FACT TYPES - Aligned with ChittySchema (chittyledger.fact_type enum)
 * Used for extracting atomic facts from documents
 */
const FACT_TYPES = {
  DATE: { patterns: ['date', 'when', 'on', 'dated', 'filed', 'effective'], description: 'Temporal facts' },
  AMOUNT: { patterns: ['$', 'amount', 'paid', 'owed', 'balance', 'sum'], description: 'Monetary amounts' },
  ADMISSION: { patterns: ['admitted', 'acknowledged', 'confirmed', 'agreed'], description: 'Party admissions' },
  IDENTITY: { patterns: ['name', 'party', 'plaintiff', 'defendant', 'llc', 'inc', 'member'], description: 'People/Entities' },
  LOCATION: { patterns: ['address', 'located', 'property', 'premises', 'apt', 'unit'], description: 'Places' },
  RELATIONSHIP: { patterns: ['owner', 'member', 'manager', 'spouse', 'parent', 'related'], description: 'Relationships' },
  ACTION: { patterns: ['did', 'performed', 'signed', 'transferred', 'paid'], description: 'Actions taken' },
  STATUS: { patterns: ['status', 'state', 'condition', 'current', 'pending'], description: 'Current state' }
};

/**
 * CLASSIFICATION LEVELS - Aligned with ChittySchema (chittyledger.classification_level enum)
 */
const CLASSIFICATION_LEVELS = {
  FACT: { weight: 1.0, description: 'Verified objective fact' },
  SUPPORTED_CLAIM: { weight: 0.8, description: 'Claim with supporting evidence' },
  ASSERTION: { weight: 0.6, description: 'Stated without direct evidence' },
  ALLEGATION: { weight: 0.4, description: 'Disputed or unverified claim' },
  CONTRADICTION: { weight: 0.2, description: 'Conflicts with other facts' }
};

/**
 * EVIDENCE TIERS - Aligned with ChittySchema (chittyledger.evidence_tier enum)
 */
const EVIDENCE_TIERS = {
  SELF_AUTHENTICATING: { weight: 1.0, patterns: ['notarized', 'certified', 'apostille'] },
  GOVERNMENT: { weight: 0.95, patterns: ['court', 'filed', 'state of', 'irs', 'sos'] },
  FINANCIAL_INSTITUTION: { weight: 0.90, patterns: ['bank statement', 'wire', 'usaa', 'chase', 'mercury'] },
  INDEPENDENT_THIRD_PARTY: { weight: 0.85, patterns: ['appraiser', 'expert', 'independent'] },
  BUSINESS_RECORDS: { weight: 0.80, patterns: ['invoice', 'receipt', 'ledger', 'quickbooks'] },
  FIRST_PARTY_ADVERSE: { weight: 0.75, patterns: ['admission', 'against interest'] },
  FIRST_PARTY_FRIENDLY: { weight: 0.60, patterns: ['my records', 'internal'] },
  UNCORROBORATED_PERSON: { weight: 0.40, patterns: ['claimed', 'stated', 'alleged'] }
};

// Document type patterns - used as hints, not definitive
const TYPE_HINTS = {
  legal: {
    patterns: ['court', 'filed', 'motion', 'petition', 'order', 'judgment', 'summons', 'subpoena'],
    extensions: ['.pdf'],
    weight: 0.3
  },
  financial: {
    patterns: ['statement', 'bank', 'invoice', 'receipt', 'tax', 'ledger', 'payment'],
    extensions: ['.pdf', '.csv', '.xlsx'],
    weight: 0.3
  },
  corporate: {
    patterns: ['agreement', 'resolution', 'consent', 'amendment', 'operating', 'articles', 'formation'],
    extensions: ['.pdf', '.docx'],
    weight: 0.3
  },
  correspondence: {
    patterns: ['email', 're:', 'fwd:', 'letter', 'notice', 'demand'],
    extensions: ['.pdf', '.eml', '.msg'],
    weight: 0.2
  },
  evidence: {
    patterns: ['exhibit', 'evidence', 'screenshot', 'photo', 'image'],
    extensions: ['.pdf', '.png', '.jpg', '.jpeg'],
    weight: 0.2
  }
};

// Entity extraction patterns
const ENTITY_PATTERNS = {
  'ARIBIA_LLC': ['aribia llc', 'aribia, llc', 'aribia'],
  'IT_CAN_BE_LLC': ['it can be llc', 'it can be, llc', 'itcanbellc'],
  'JEAN_ARLENE_VENTURING_LLC': ['jean arlene venturing', 'jav llc', 'j.a.v.'],
  'CHITTYCORP_LLC': ['chittycorp', 'chitty corp', 'chittycorp llc']
};

// Case patterns
const CASE_PATTERNS = {
  'ARIAS_V_BIANCHI_2024D007847': ['2024d007847', 'arias v bianchi', 'arias vs bianchi', 'arias v. bianchi'],
  'BIANCHI_V_SCHATZ': ['bianchi v schatz', 'bianchi vs schatz', 'schatz'],
  'COLOMBIA_EVICTION': ['morada mami', 'medellin property', 'colombia eviction']
};

export class DocumentClassifier {
  constructor(env) {
    this.env = env;
    this.ai = env.AI;
  }

  /**
   * Classify a document using multiple signals
   */
  async classify(document) {
    const { filename, content, path, mimeType, size } = document;

    // Gather all classification signals
    const signals = {
      filename: this.analyzeFilename(filename),
      content: content ? await this.analyzeContent(content) : null,
      path: this.analyzePath(path),
      metadata: this.analyzeMetadata({ mimeType, size })
    };

    // Determine document type
    const documentType = await this.determineType(signals);

    // Determine entity association
    const entity = this.determineEntity(signals);

    // Determine case association
    const caseRef = this.determineCase(signals);

    // Determine document status
    const status = this.determineStatus(signals, filename);

    // Calculate confidence
    const confidence = this.calculateConfidence(signals);

    return {
      documentType,
      entity,
      caseRef,
      status,
      confidence,
      signals,
      suggestedPath: this.suggestCanonicalPath(documentType, entity, caseRef, filename),
      flags: this.identifyFlags(signals, filename)
    };
  }

  /**
   * Analyze filename for classification signals
   */
  analyzeFilename(filename) {
    const lower = filename.toLowerCase();
    const signals = {
      hasDate: this.extractDate(filename),
      typeHints: [],
      entityHints: [],
      caseHints: [],
      isDraft: /draft|wip|v\d+|copy|backup/.test(lower),
      isAiGenerated: /chatgpt|claude|ai.generated|llm/.test(lower),
      isOcr: /ocr|extracted|parsed|readable/.test(lower)
    };

    // Check type hints
    for (const [type, config] of Object.entries(TYPE_HINTS)) {
      for (const pattern of config.patterns) {
        if (lower.includes(pattern)) {
          signals.typeHints.push({ type, pattern, confidence: config.weight });
        }
      }
    }

    // Check entity patterns
    for (const [entity, patterns] of Object.entries(ENTITY_PATTERNS)) {
      for (const pattern of patterns) {
        if (lower.includes(pattern)) {
          signals.entityHints.push({ entity, pattern, confidence: 0.8 });
        }
      }
    }

    // Check case patterns
    for (const [caseId, patterns] of Object.entries(CASE_PATTERNS)) {
      for (const pattern of patterns) {
        if (lower.includes(pattern)) {
          signals.caseHints.push({ caseId, pattern, confidence: 0.8 });
        }
      }
    }

    return signals;
  }

  /**
   * Analyze document content using AI
   */
  async analyzeContent(content) {
    if (!this.ai || !content) return null;

    try {
      // Truncate content for AI processing
      const truncated = content.substring(0, 8000);

      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{
          role: 'system',
          content: `You are a document classification assistant. Analyze the document and return JSON only.

Extract:
- document_type: one of [legal_filing, contract, financial_statement, correspondence, evidence, corporate_document, property_document, draft, other]
- entities: array of business entity names mentioned
- case_references: array of case numbers or case names
- key_dates: array of significant dates
- key_parties: array of people/organizations mentioned
- is_draft: boolean
- is_signed: boolean
- potential_errors: array of any obvious errors or inconsistencies
- summary: one sentence summary

Return valid JSON only, no explanation.`
        }, {
          role: 'user',
          content: truncated
        }]
      });

      try {
        return JSON.parse(response.response);
      } catch {
        // AI didn't return valid JSON, extract what we can
        return { raw_response: response.response };
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      return null;
    }
  }

  /**
   * Analyze file path for classification signals
   */
  analyzePath(path) {
    if (!path) return null;
    const lower = path.toLowerCase();

    return {
      isInOriginals: /original|source|canonical/.test(lower),
      isInDrafts: /draft|wip|workspace/.test(lower),
      isInArchive: /archive|old|deprecated|decaying/.test(lower),
      folderHints: path.split('/').filter(p => p.length > 2)
    };
  }

  /**
   * Analyze file metadata
   */
  analyzeMetadata({ mimeType, size }) {
    return {
      isPdf: mimeType === 'application/pdf',
      isImage: mimeType?.startsWith('image/'),
      isSpreadsheet: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mimeType),
      isLargeFile: size > 10 * 1024 * 1024, // > 10MB
      isEmptyOrTiny: size < 1024 // < 1KB
    };
  }

  /**
   * Determine document type from all signals
   */
  async determineType(signals) {
    // AI content analysis takes precedence if available
    if (signals.content?.document_type) {
      return signals.content.document_type;
    }

    // Score each type based on filename hints
    const scores = {};
    for (const hint of signals.filename?.typeHints || []) {
      scores[hint.type] = (scores[hint.type] || 0) + hint.confidence;
    }

    // Find highest scoring type
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0 && sorted[0][1] > 0.3) {
      return sorted[0][0];
    }

    return 'unclassified';
  }

  /**
   * Determine entity association
   */
  determineEntity(signals) {
    // AI content analysis takes precedence
    if (signals.content?.entities?.length > 0) {
      // Map to standard entity names
      const normalized = signals.content.entities.map(e => this.normalizeEntity(e)).filter(Boolean);
      if (normalized.length > 0) return normalized[0];
    }

    // Use filename hints
    if (signals.filename?.entityHints?.length > 0) {
      return signals.filename.entityHints[0].entity;
    }

    return null;
  }

  /**
   * Normalize entity name to standard form
   */
  normalizeEntity(entityName) {
    const lower = entityName.toLowerCase();
    for (const [standard, patterns] of Object.entries(ENTITY_PATTERNS)) {
      for (const pattern of patterns) {
        if (lower.includes(pattern)) {
          return standard;
        }
      }
    }
    return null;
  }

  /**
   * Determine case association
   */
  determineCase(signals) {
    // AI content analysis
    if (signals.content?.case_references?.length > 0) {
      return signals.content.case_references[0];
    }

    // Filename hints
    if (signals.filename?.caseHints?.length > 0) {
      return signals.filename.caseHints[0].caseId;
    }

    return null;
  }

  /**
   * Determine document status
   */
  determineStatus(signals, filename) {
    const lower = filename.toLowerCase();
    const content = signals.content;

    // Check for signed documents
    if (content?.is_signed || /signed|executed|notarized/.test(lower)) {
      return 'ORIGINAL_SIGNED';
    }

    // Check for filed documents
    if (/filed|submitted|court/.test(lower) || content?.document_type === 'legal_filing') {
      return 'ORIGINAL_FILED';
    }

    // Check for drafts
    if (signals.filename?.isDraft || content?.is_draft) {
      return 'DRAFT_CONTEMPORANEOUS';
    }

    // Check for OCR/readable copies
    if (signals.filename?.isOcr) {
      return 'COPY_READABLE';
    }

    return 'ORIGINAL_GENERATED';
  }

  /**
   * Calculate confidence in classification
   */
  calculateConfidence(signals) {
    let score = 0;
    let factors = 0;

    // AI content analysis is most reliable
    if (signals.content?.document_type && signals.content.document_type !== 'other') {
      score += 0.8;
      factors++;
    }

    // Filename hints
    if (signals.filename?.typeHints?.length > 0) {
      score += 0.5;
      factors++;
    }

    // Entity hints
    if (signals.filename?.entityHints?.length > 0 || signals.content?.entities?.length > 0) {
      score += 0.3;
      factors++;
    }

    // Date in filename
    if (signals.filename?.hasDate) {
      score += 0.2;
      factors++;
    }

    if (factors === 0) return 0;
    return Math.min(1, score / factors);
  }

  /**
   * Suggest canonical path for document
   */
  suggestCanonicalPath(type, entity, caseRef, filename) {
    let basePath = '/ORIGINALS';

    if (caseRef) {
      basePath += `/CASES/${caseRef}`;
    } else if (entity) {
      basePath += `/${entity}`;
    } else {
      basePath += '/UNSORTED';
    }

    // Add type subfolder
    const typeFolder = {
      legal_filing: 'COURT_FILINGS',
      contract: 'LEGAL',
      financial_statement: 'FINANCIAL',
      correspondence: 'CORRESPONDENCE',
      evidence: 'EVIDENCE',
      corporate_document: 'CORPORATE',
      property_document: 'PROPERTY'
    }[type] || 'GENERAL';

    basePath += `/${typeFolder}`;

    // Normalize filename
    const normalizedFilename = this.normalizeFilename(filename);

    return `${basePath}/${normalizedFilename}`;
  }

  /**
   * Normalize filename for storage
   */
  normalizeFilename(filename) {
    // Extract date if present
    const date = this.extractDate(filename);
    const cleanName = filename
      .replace(/\s+/g, '_')
      .replace(/[^\w\-_.]/g, '')
      .replace(/_+/g, '_');

    if (date && !cleanName.startsWith(date)) {
      return `${date}_${cleanName}`;
    }

    return cleanName;
  }

  /**
   * Extract date from filename
   */
  extractDate(filename) {
    // Match various date formats
    const patterns = [
      /(\d{4}[-_]\d{2}[-_]\d{2})/,           // 2024-03-01, 2024_03_01
      /(\d{4}\s+\d{2}\s+\d{2})/,              // 2024 03 01
      /(\d{2}[-_]\d{2}[-_]\d{4})/,           // 03-01-2024
      /(\d{2}[-_]\d{2}[-_]\d{2})/            // 03-01-24
    ];

    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        return match[1].replace(/\s+/g, '-');
      }
    }

    return null;
  }

  /**
   * Identify flags/warnings for document
   */
  identifyFlags(signals, filename) {
    const flags = [];

    // AI-generated content
    if (signals.filename?.isAiGenerated) {
      flags.push({
        type: 'AI_GENERATED',
        severity: 'warning',
        message: 'Document appears to be AI-generated, may contain errors'
      });
    }

    // Potential duplicate
    if (/copy|backup|\(\d+\)|v\d+/.test(filename.toLowerCase())) {
      flags.push({
        type: 'POTENTIAL_DUPLICATE',
        severity: 'info',
        message: 'Filename suggests this may be a duplicate or version'
      });
    }

    // Content-identified errors
    if (signals.content?.potential_errors?.length > 0) {
      flags.push({
        type: 'CONTENT_ERRORS',
        severity: 'warning',
        message: 'AI analysis identified potential errors',
        details: signals.content.potential_errors
      });
    }

    // Draft in archive
    if (signals.path?.isInArchive && signals.filename?.isDraft) {
      flags.push({
        type: 'ARCHIVED_DRAFT',
        severity: 'info',
        message: 'Draft document in archive - verify if still needed'
      });
    }

    return flags;
  }
}

// Worker handler for classification requests
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('POST required', { status: 405 });
    }

    const url = new URL(request.url);

    if (url.pathname === '/classify') {
      const classifier = new DocumentClassifier(env);
      const body = await request.json();

      const result = await classifier.classify(body);

      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};
