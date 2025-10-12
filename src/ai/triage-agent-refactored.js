/**
 * AI Triage Agent - Intelligent email classification (REFACTORED)
 * Enhances existing routing without duplicating logic
 * Uses common AI utilities for consistency
 */

import {
  parseAIResponse,
  extractConfidence,
  sanitizeAIInput,
  executeAIWithFallback,
} from "../common/ai-utils.js";

/**
 * Intelligent Email Triage using AI
 * Classifies emails to enhance existing routing decisions
 */
export async function intelligentTriage(ai, emailData) {
  const prompt = `
  Classify this legal email into one of these categories:

  CATEGORIES:
  - lawsuit_communication (case-related correspondence)
  - document_submission (evidence, contracts, filings)
  - appointment_request (meetings, consultations)
  - emergency_legal (urgent legal matters)
  - general_inquiry (questions, information requests)
  - court_notice (official court communications)
  - billing_matter (invoices, payment-related)

  EMAIL DATA:
  Subject: ${sanitizeAIInput(emailData.subject, 200)}
  From: ${sanitizeAIInput(emailData.from, 100)}
  Content: ${sanitizeAIInput(emailData.content, 800)}

  Respond with JSON format:
  {
    "category": "category_name",
    "confidence": 0.95,
    "keywords": ["keyword1", "keyword2"],
    "urgency_indicators": ["indicator1", "indicator2"],
    "reasoning": "brief explanation"
  }
  `;

  try {
    const result = await executeAIWithFallback(
      ai,
      "@cf/meta/llama-3.1-8b-instruct",
      [{ role: "user", content: prompt }],
      () => fallbackTriage(emailData),
    );

    if (result.fallback) {
      return result.response;
    }

    // Parse AI response using common utility
    const parsed = parseAIResponse(result.response, {
      category: "general_inquiry",
      confidence: 0.7,
      keywords: [],
      urgencyIndicators: [],
      reasoning: "Default classification",
    });

    return {
      category: parsed.category || "general_inquiry",
      confidence: parsed.confidence || extractConfidence(result.response),
      keywords: parsed.keywords || [],
      urgencyIndicators: parsed.urgency_indicators || [],
      reasoning: parsed.reasoning || "AI classification",
      aiModel: "@cf/meta/llama-3.1-8b-instruct",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("AI Triage failed:", error);
    return fallbackTriage(emailData);
  }
}

/**
 * Fallback triage when AI fails
 * Uses keyword matching as backup
 */
function fallbackTriage(emailData) {
  const content = (emailData.subject + " " + emailData.content).toLowerCase();

  const patterns = {
    lawsuit_communication: [
      "case",
      "plaintiff",
      "defendant",
      "litigation",
      "legal action",
    ],
    document_submission: [
      "attached",
      "document",
      "contract",
      "evidence",
      "filing",
    ],
    appointment_request: [
      "meeting",
      "appointment",
      "schedule",
      "consultation",
      "availability",
    ],
    emergency_legal: ["urgent", "emergency", "asap", "immediate", "deadline"],
    court_notice: ["court", "hearing", "judge", "motion", "subpoena"],
    billing_matter: ["invoice", "payment", "bill", "retainer", "fee"],
  };

  for (const [category, keywords] of Object.entries(patterns)) {
    const matches = keywords.filter((keyword) => content.includes(keyword));
    if (matches.length > 0) {
      return {
        category,
        confidence: Math.min(0.8, matches.length * 0.2 + 0.4),
        keywords: matches,
        reasoning: `Keyword-based classification: ${matches.join(", ")}`,
        fallback: true,
        timestamp: new Date().toISOString(),
      };
    }
  }

  return {
    category: "general_inquiry",
    confidence: 0.5,
    keywords: [],
    reasoning: "No clear classification patterns found",
    fallback: true,
    timestamp: new Date().toISOString(),
  };
}
