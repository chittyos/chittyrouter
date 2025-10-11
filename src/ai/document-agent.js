/**
 * AI Document Analysis Agent - Intelligent Document Processing
 * Analyzes legal documents, contracts, and evidence with AI
 * Integrated with ChittyOS Evidence Analysis Service
 */

import { generateChittyID } from "../../../chittychat/src/lib/chittyid-service.js";

/**
 * AI-powered document analysis
 * Analyzes attachments and documents for legal relevance and classification
 */
export async function documentAnalyzer(ai, attachment, emailContext) {
  if (!attachment || !attachment.name) {
    return {
      analyzed: false,
      error: "No valid attachment provided",
    };
  }

  const prompt = `
  Analyze this legal document attachment:

  EMAIL CONTEXT:
  Subject: ${emailContext.subject}
  From: ${emailContext.from}
  Category: ${emailContext.category || "unknown"}

  DOCUMENT INFO:
  Filename: ${attachment.name}
  Size: ${attachment.size || 0} bytes
  Type: ${attachment.type || "unknown"}

  Based on the filename and context, determine:

  DOCUMENT CLASSIFICATION:
  - contract (agreements, terms, legal contracts)
  - evidence (photos, recordings, proof documents)
  - legal_filing (motions, pleadings, court documents)
  - correspondence (letters, communications)
  - financial (invoices, receipts, billing)
  - identification (licenses, certifications, IDs)
  - medical (medical records, reports)
  - other (miscellaneous documents)

  IMPORTANCE LEVELS:
  - critical (immediate legal action required)
  - high (important for case progression)
  - normal (standard documentation)
  - low (informational only)

  COMPLIANCE REQUIREMENTS:
  - chain_of_custody (evidence handling required)
  - confidential (privacy protection needed)
  - time_sensitive (deadline implications)
  - verification_required (authenticity check needed)
  - none (standard processing)

  Respond with JSON:
  {
    "document_type": "classification",
    "importance": "level",
    "compliance_flags": ["flag1", "flag2"],
    "contains_pii": true|false,
    "requires_review": true|false,
    "processing_priority": "immediate|standard|low",
    "estimated_pages": 0,
    "keywords": ["keyword1", "keyword2"],
    "reasoning": "brief explanation"
  }
  `;

  try {
    const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
    });

    const analysis = parseDocumentAnalysis(response.response, attachment);

    // Add file security analysis
    const securityCheck = analyzeFileSecurity(attachment);

    // Enhanced analysis via ChittyOS Evidence Analysis Service
    let enhancedAnalysis = null;
    if (attachment.text) {
      enhancedAnalysis = await enhancedEvidenceAnalysis(
        attachment.text,
        analysis.document_type,
        emailContext,
      );
    }

    return {
      filename: attachment.name,
      filesize: attachment.size,
      filetype: attachment.type,
      analysis,
      enhanced_analysis: enhancedAnalysis,
      security: securityCheck,
      processing_recommendations: generateProcessingRecommendations(analysis),
      chittyId: await generateChittyID("INFO", {
        filename: attachment.name,
        filesize: attachment.size,
        filetype: attachment.type,
        document_type: analysis.document_type,
        source: "chittyrouter_document_analysis",
      }),
      analyzed: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Document analysis failed:", error);
    return fallbackDocumentAnalysis(attachment, emailContext);
  }
}

/**
 * Parse AI document analysis response
 */
function parseDocumentAnalysis(response, attachment) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Ensure required fields with defaults
      return {
        document_type:
          parsed.document_type || classifyByFilename(attachment.name),
        importance: parsed.importance || "normal",
        compliance_flags: parsed.compliance_flags || [],
        contains_pii: parsed.contains_pii || false,
        requires_review: parsed.requires_review || false,
        processing_priority: parsed.processing_priority || "standard",
        estimated_pages: parsed.estimated_pages || 0,
        keywords: parsed.keywords || [],
        reasoning: parsed.reasoning || "AI document analysis",
        confidence: 0.8,
      };
    }

    // Fallback to pattern matching
    return fallbackAnalysis(attachment.name);
  } catch (error) {
    console.error("Document analysis parsing failed:", error);
    return fallbackAnalysis(attachment.name);
  }
}

/**
 * Classify document by filename patterns
 */
function classifyByFilename(filename) {
  const patterns = {
    contract: /\b(contract|agreement|terms|nda|mou)\b/i,
    evidence: /\b(evidence|proof|photo|recording|screenshot)\b/i,
    legal_filing: /\b(motion|pleading|filing|brief|petition|complaint)\b/i,
    correspondence: /\b(letter|email|communication|memo)\b/i,
    financial: /\b(invoice|receipt|bill|payment|financial)\b/i,
    identification: /\b(license|id|certificate|passport|permit)\b/i,
    medical: /\b(medical|health|doctor|hospital|prescription)\b/i,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(filename)) {
      return type;
    }
  }

  return "other";
}

/**
 * Analyze file security and safety
 */
function analyzeFileSecurity(attachment) {
  const securityAnalysis = {
    is_safe: true,
    risk_level: "low",
    warnings: [],
    scan_timestamp: new Date().toISOString(),
  };

  // Check file extension
  const dangerousExtensions = [
    ".exe",
    ".bat",
    ".cmd",
    ".scr",
    ".vbs",
    ".js",
    ".jar",
  ];
  const suspiciousExtensions = [".zip", ".rar", ".7z"];

  const extension = attachment.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";

  if (dangerousExtensions.includes(extension)) {
    securityAnalysis.is_safe = false;
    securityAnalysis.risk_level = "high";
    securityAnalysis.warnings.push(`Dangerous file extension: ${extension}`);
  } else if (suspiciousExtensions.includes(extension)) {
    securityAnalysis.risk_level = "medium";
    securityAnalysis.warnings.push(
      `Compressed file requires additional scanning: ${extension}`,
    );
  }

  // Check file size
  if (attachment.size > 50 * 1024 * 1024) {
    // 50MB
    securityAnalysis.warnings.push(
      "Large file size - may require special handling",
    );
  }

  // Check for suspicious naming patterns
  const suspiciousPatterns = [
    /invoice.*\.(exe|scr|bat)$/i,
    /urgent.*\.(zip|rar)$/i,
    /\.pdf\.(exe|scr)$/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(attachment.name)) {
      securityAnalysis.is_safe = false;
      securityAnalysis.risk_level = "high";
      securityAnalysis.warnings.push("Suspicious filename pattern detected");
      break;
    }
  }

  return securityAnalysis;
}

/**
 * Generate processing recommendations
 */
function generateProcessingRecommendations(analysis) {
  const recommendations = [];

  // Priority-based recommendations
  if (analysis.processing_priority === "immediate") {
    recommendations.push("Process immediately - high priority document");
  }

  // Compliance-based recommendations
  if (analysis.compliance_flags.includes("chain_of_custody")) {
    recommendations.push(
      "Maintain chain of custody - evidence handling protocol required",
    );
  }

  if (analysis.compliance_flags.includes("confidential")) {
    recommendations.push("Confidential handling required - restrict access");
  }

  if (analysis.compliance_flags.includes("time_sensitive")) {
    recommendations.push("Time-sensitive document - check for deadlines");
  }

  if (analysis.contains_pii) {
    recommendations.push("Contains PII - apply privacy protection measures");
  }

  if (analysis.requires_review) {
    recommendations.push("Attorney review required before processing");
  }

  // Document type recommendations
  if (analysis.document_type === "contract") {
    recommendations.push(
      "Contract document - legal review and signature tracking needed",
    );
  }

  if (analysis.document_type === "evidence") {
    recommendations.push(
      "Evidence document - secure storage and verification required",
    );
  }

  if (analysis.document_type === "legal_filing") {
    recommendations.push("Legal filing - court deadline verification needed");
  }

  return recommendations;
}

/**
 * Enhanced Evidence Analysis using ChittyOS Evidence Analysis Service
 * Calls the ChittyChat platform's analysis.chitty.cc service for deep analysis
 */
export async function enhancedEvidenceAnalysis(
  documentText,
  documentType,
  emailContext,
) {
  try {
    const CHITTYOS_ANALYSIS_URL =
      process.env.CHITTYOS_ANALYSIS_URL || "http://localhost:52911";

    const analysisRequest = {
      document_text: documentText,
      document_type: documentType,
      analysis_type: determineAnalysisType(documentType),
      context: {
        email_subject: emailContext?.subject,
        email_from: emailContext?.from,
        source: "chittyrouter",
      },
    };

    const response = await fetch(
      `${CHITTYOS_ANALYSIS_URL}/api/analysis/analyze`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Host: "analysis.chitty.cc",
        },
        body: JSON.stringify(analysisRequest),
      },
    );

    if (!response.ok) {
      console.warn(
        "ChittyOS analysis service unavailable, using local analysis",
      );
      return null;
    }

    const analysisResult = await response.json();

    return {
      enhanced_analysis: analysisResult.analysis,
      analysis_timestamp: analysisResult.timestamp,
      cache_key: analysisResult.cache_key,
      source: "chittyos_evidence_service",
    };
  } catch (error) {
    console.error("Enhanced evidence analysis failed:", error);
    return null;
  }
}

/**
 * Extract entities from document using ChittyOS Evidence Analysis Service
 */
export async function extractEntitiesFromDocument(documentText) {
  try {
    const CHITTYOS_ANALYSIS_URL =
      process.env.CHITTYOS_ANALYSIS_URL || "http://localhost:52911";

    const response = await fetch(
      `${CHITTYOS_ANALYSIS_URL}/api/analysis/entities`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Host: "analysis.chitty.cc",
        },
        body: JSON.stringify({ document_text: documentText }),
      },
    );

    if (!response.ok) {
      return null;
    }

    const entityResult = await response.json();
    return entityResult.entities;
  } catch (error) {
    console.error("Entity extraction failed:", error);
    return null;
  }
}

/**
 * Determine the appropriate analysis type for ChittyOS service
 */
function determineAnalysisType(documentType) {
  const analysisTypeMap = {
    legal_filing: "court_order",
    contract: "property",
    financial: "financial",
    evidence: "comprehensive",
    correspondence: "comprehensive",
  };

  return analysisTypeMap[documentType] || "comprehensive";
}

/**
 * Fallback document analysis when AI fails
 */
async function fallbackDocumentAnalysis(attachment, emailContext) {
  const filename = attachment.name.toLowerCase();

  // Basic classification by extension
  const documentType = classifyByFilename(filename);

  // Basic importance assessment
  let importance = "normal";
  if (filename.includes("urgent") || filename.includes("emergency")) {
    importance = "high";
  }
  if (filename.includes("contract") || filename.includes("agreement")) {
    importance = "high";
  }

  return {
    filename: attachment.name,
    filesize: attachment.size,
    filetype: attachment.type,
    analysis: {
      document_type: documentType,
      importance,
      compliance_flags: [],
      contains_pii: false,
      requires_review: ["contract", "legal_filing"].includes(documentType),
      processing_priority: importance === "high" ? "immediate" : "standard",
      estimated_pages: 0,
      keywords: [],
      reasoning: "Fallback classification based on filename patterns",
      confidence: 0.6,
    },
    security: analyzeFileSecurity(attachment),
    processing_recommendations: [
      "Review document classification",
      "Verify document type",
    ],
    chittyId: await generateDocumentChittyID(attachment),
    fallback: true,
    analyzed: true,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fallback analysis when parsing fails
 */
function fallbackAnalysis(filename) {
  return {
    document_type: classifyByFilename(filename),
    importance: "normal",
    compliance_flags: [],
    contains_pii: false,
    requires_review: false,
    processing_priority: "standard",
    estimated_pages: 0,
    keywords: [],
    reasoning: "Fallback pattern matching analysis",
    confidence: 0.5,
  };
}

/**
 * Generate document ChittyID using official service
 */
async function generateDocumentChittyID(attachment) {
  try {
    return await generateChittyID("INFO", {
      filename: attachment.name,
      filesize: attachment.size,
      filetype: attachment.type,
      source: "chittyrouter_document_analysis",
    });
  } catch (error) {
    console.error("ChittyID generation failed:", error);
    // NO LOCAL GENERATION - Throw error instead of generating placeholder ID
    throw new Error(
      "Cannot proceed without valid ChittyID from id.chitty.cc. ChittyID service unavailable.",
    );
  }
}

/**
 * Extract text content from common document types
 */
export async function extractDocumentText(attachment) {
  // This would integrate with document processing services
  // For now, return a placeholder implementation

  const fileType = attachment.type || "";

  if (fileType.includes("text/plain")) {
    // Handle plain text files
    return {
      success: true,
      text: "Text extraction would happen here",
      wordCount: 0,
    };
  }

  if (fileType.includes("application/pdf")) {
    // Handle PDF files
    return {
      success: true,
      text: "PDF text extraction would happen here",
      pages: 0,
      wordCount: 0,
    };
  }

  return {
    success: false,
    error: "Unsupported file type for text extraction",
    supportedTypes: ["text/plain", "application/pdf", "application/msword"],
  };
}

/**
 * Batch analyze multiple documents
 */
export async function batchDocumentAnalysis(ai, attachments, emailContext) {
  const results = [];
  const entityPromises = [];

  for (const attachment of attachments) {
    try {
      const analysis = await documentAnalyzer(ai, attachment, emailContext);
      results.push(analysis);

      // Extract entities from documents with text content
      if (attachment.text) {
        entityPromises.push(
          extractEntitiesFromDocument(attachment.text).then((entities) => ({
            filename: attachment.name,
            entities,
          })),
        );
      }
    } catch (error) {
      results.push({
        filename: attachment.name,
        error: error.message,
        analyzed: false,
      });
    }
  }

  // Wait for all entity extractions to complete
  const allEntities = await Promise.all(entityPromises);

  return {
    total_documents: attachments.length,
    analyzed_successfully: results.filter((r) => r.analyzed).length,
    results,
    entities: allEntities.filter((e) => e.entities),
    summary: generateBatchSummary(results),
  };
}

/**
 * Generate summary of batch analysis
 */
function generateBatchSummary(results) {
  const types = {};
  const priorities = {};
  let requiresReview = 0;

  results.forEach((result) => {
    if (result.analysis) {
      types[result.analysis.document_type] =
        (types[result.analysis.document_type] || 0) + 1;
      priorities[result.analysis.importance] =
        (priorities[result.analysis.importance] || 0) + 1;

      if (result.analysis.requires_review) {
        requiresReview++;
      }
    }
  });

  return {
    document_types: types,
    importance_levels: priorities,
    requires_review: requiresReview,
    high_priority_count: priorities.high || 0,
    critical_count: priorities.critical || 0,
  };
}
