/**
 * AI Priority Classification Agent
 * Enhances existing priority logic with AI insights
 */

/**
 * AI-powered priority classification
 * Works alongside existing priority determination
 */
export async function priorityClassifier(ai, emailData, triageResult) {
  const prompt = `
  Determine the priority level for this legal email:

  PRIORITY LEVELS:
  - CRITICAL (immediate attorney attention required)
  - HIGH (requires attention within hours)
  - NORMAL (standard business priority)
  - LOW (can wait, informational)

  EMAIL INFO:
  Subject: ${emailData.subject}
  From: ${emailData.from}
  Category: ${triageResult.category}
  AI Confidence: ${triageResult.confidence}
  Content Preview: ${emailData.content.substring(0, 500)}

  CONTEXT:
  - Court deadlines are CRITICAL
  - Emergency legal matters are CRITICAL
  - Document submissions are typically HIGH
  - General inquiries are usually NORMAL
  - Billing matters are typically LOW

  Respond with JSON:
  {
    "level": "PRIORITY_LEVEL",
    "score": 0.95,
    "factors": ["factor1", "factor2"],
    "reasoning": "explanation"
  }
  `;

  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }]
    });

    const parsed = parseAIPriorityResponse(response.response);

    return {
      level: parsed.level || determineFallbackPriority(emailData, triageResult),
      score: parsed.score || 0.7,
      factors: parsed.factors || [],
      reasoning: parsed.reasoning || 'AI priority classification',
      aiEnhanced: true,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('AI Priority classification failed:', error);
    return fallbackPriorityClassification(emailData, triageResult);
  }
}

/**
 * Parse AI priority response
 */
function parseAIPriorityResponse(response) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Extract priority from natural language
    const priorityLevels = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
    const foundLevel = priorityLevels.find(level =>
      response.toUpperCase().includes(level)
    );

    return {
      level: foundLevel || 'NORMAL',
      reasoning: response.substring(0, 200)
    };
  } catch (error) {
    console.error('Priority response parsing failed:', error);
    return {};
  }
}

/**
 * Determine fallback priority based on existing logic
 */
function determineFallbackPriority(emailData, triageResult) {
  // Use existing ChittyRouter priority logic as fallback
  const urgentKeywords = [
    'urgent', 'emergency', 'asap', 'immediate',
    'court date', 'deadline', 'subpoena', 'motion'
  ];

  const content = (emailData.subject + ' ' + emailData.content).toLowerCase();

  // Critical indicators
  if (triageResult.category === 'emergency_legal' ||
      triageResult.category === 'court_notice') {
    return 'CRITICAL';
  }

  // High priority indicators
  if (urgentKeywords.some(keyword => content.includes(keyword)) ||
      triageResult.category === 'document_submission') {
    return 'HIGH';
  }

  // Low priority indicators
  if (triageResult.category === 'billing_matter' ||
      triageResult.category === 'general_inquiry') {
    return 'LOW';
  }

  return 'NORMAL';
}

/**
 * Fallback priority classification
 */
function fallbackPriorityClassification(emailData, triageResult) {
  const level = determineFallbackPriority(emailData, triageResult);

  return {
    level,
    score: 0.6,
    factors: ['fallback_classification'],
    reasoning: 'Using fallback priority logic due to AI failure',
    aiEnhanced: false,
    fallback: true,
    timestamp: new Date().toISOString()
  };
}

/**
 * Convert priority level to numeric score for sorting
 */
export function priorityToScore(priority) {
  const scores = {
    'CRITICAL': 4,
    'HIGH': 3,
    'NORMAL': 2,
    'LOW': 1
  };

  return scores[priority] || 2;
}

/**
 * Combine AI priority with existing priority logic
 */
export function combinePrioritySignals(aiPriority, existingPriority) {
  const aiScore = priorityToScore(aiPriority.level);
  const existingScore = priorityToScore(existingPriority);

  // Weight AI prediction based on confidence
  const aiWeight = aiPriority.score || 0.7;
  const combinedScore = (aiScore * aiWeight) + (existingScore * (1 - aiWeight));

  // Convert back to priority level
  if (combinedScore >= 3.5) return 'CRITICAL';
  if (combinedScore >= 2.5) return 'HIGH';
  if (combinedScore >= 1.5) return 'NORMAL';
  return 'LOW';
}