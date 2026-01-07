/**
 * AI Triage Agent - Intelligent email classification
 * Enhances existing routing without duplicating logic
 */

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
  Subject: ${emailData.subject}
  From: ${emailData.from}
  Content: ${emailData.content.substring(0, 800)}

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
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }]
    });

    // Parse AI response
    const parsed = parseAIResponse(response.response);

    return {
      category: parsed.category || 'general_inquiry',
      confidence: parsed.confidence || 0.7,
      keywords: parsed.keywords || [],
      urgencyIndicators: parsed.urgency_indicators || [],
      reasoning: parsed.reasoning || 'AI classification',
      aiModel: '@cf/meta/llama-3.1-8b-instruct',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('AI Triage failed:', error);

    // Fallback to keyword-based classification
    return fallbackTriage(emailData);
  }
}

/**
 * Parse AI response with error handling
 */
function parseAIResponse(response) {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback parsing for non-JSON responses
    return {
      category: extractCategory(response),
      confidence: extractConfidence(response),
      reasoning: response.substring(0, 200)
    };
  } catch (error) {
    console.error('AI response parsing failed:', error);
    return {};
  }
}

/**
 * Extract category from natural language response
 */
function extractCategory(response) {
  const categories = [
    'lawsuit_communication',
    'document_submission',
    'appointment_request',
    'emergency_legal',
    'general_inquiry',
    'court_notice',
    'billing_matter'
  ];

  const lowercaseResponse = response.toLowerCase();

  for (const category of categories) {
    if (lowercaseResponse.includes(category.replace('_', ' '))) {
      return category;
    }
  }

  return 'general_inquiry';
}

/**
 * Extract confidence from natural language response
 */
function extractConfidence(response) {
  const confidenceMatch = response.match(/(\d{1,3})%/);
  if (confidenceMatch) {
    return parseInt(confidenceMatch[1]) / 100;
  }

  // Default confidence based on certainty words
  if (response.includes('certain') || response.includes('definitely')) return 0.9;
  if (response.includes('likely') || response.includes('probably')) return 0.8;
  if (response.includes('possibly') || response.includes('might')) return 0.6;

  return 0.7;
}

/**
 * Fallback triage when AI fails
 * Uses keyword matching as backup
 */
function fallbackTriage(emailData) {
  const content = (emailData.subject + ' ' + emailData.content).toLowerCase();

  const patterns = {
    lawsuit_communication: ['case', 'plaintiff', 'defendant', 'litigation', 'legal action'],
    document_submission: ['attached', 'document', 'contract', 'evidence', 'filing'],
    appointment_request: ['meeting', 'appointment', 'schedule', 'consultation', 'availability'],
    emergency_legal: ['urgent', 'emergency', 'asap', 'immediate', 'deadline'],
    court_notice: ['court', 'hearing', 'judge', 'motion', 'subpoena'],
    billing_matter: ['invoice', 'payment', 'bill', 'retainer', 'fee']
  };

  for (const [category, keywords] of Object.entries(patterns)) {
    const matches = keywords.filter(keyword => content.includes(keyword));
    if (matches.length > 0) {
      return {
        category,
        confidence: Math.min(0.8, matches.length * 0.2 + 0.4),
        keywords: matches,
        reasoning: `Keyword-based classification: ${matches.join(', ')}`,
        fallback: true,
        timestamp: new Date().toISOString()
      };
    }
  }

  return {
    category: 'general_inquiry',
    confidence: 0.5,
    keywords: [],
    reasoning: 'No clear classification patterns found',
    fallback: true,
    timestamp: new Date().toISOString()
  };
}