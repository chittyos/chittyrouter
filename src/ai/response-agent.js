/**
 * AI Response Agent - Intelligent Auto-Response Generation
 * Generates contextual, professional responses for legal communications
 */

/**
 * AI-powered auto-response generation
 * Creates professional, contextual responses for legal emails
 */
export async function autoResponder(ai, emailData, triageResult, priorityResult) {
  const prompt = `
  Generate a professional auto-response for this legal email:

  CONTEXT:
  Subject: ${emailData.subject}
  From: ${emailData.from}
  Category: ${triageResult.category}
  Priority: ${priorityResult.level}
  Content Preview: ${emailData.content.substring(0, 400)}

  RESPONSE REQUIREMENTS:
  - Professional legal tone
  - Acknowledge receipt of communication
  - Set appropriate expectations for response time
  - Include relevant next steps based on category
  - Mention ChittyID for tracking
  - Keep under 200 words
  - Be helpful but legally conservative

  RESPONSE TEMPLATES BY CATEGORY:
  - lawsuit_communication: Acknowledge case-related communication, legal review needed
  - document_submission: Confirm receipt, verification process, expected timeline
  - appointment_request: Acknowledge request, scheduling process
  - emergency_legal: Immediate attention notice, escalation confirmed
  - general_inquiry: Professional acknowledgment, routing to appropriate team
  - court_notice: Receipt confirmed, legal team notified immediately
  - billing_matter: Financial team notification, billing inquiry process

  Generate only the email body text, no subject line.
  Be warm but professional. Include actual next steps.
  `;

  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }]
    });

    const responseText = cleanResponseText(response.response);

    return {
      shouldRespond: shouldGenerateResponse(triageResult, priorityResult),
      subject: generateResponseSubject(emailData.subject),
      body: responseText,
      responseType: 'ai_generated',
      category: triageResult.category,
      priority: priorityResult.level,
      aiModel: '@cf/meta/llama-3.1-8b-instruct',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('AI Response generation failed:', error);
    return fallbackResponse(emailData, triageResult, priorityResult);
  }
}

/**
 * Determine if auto-response should be sent
 */
function shouldGenerateResponse(triageResult, priorityResult) {
  // Don't auto-respond to certain categories
  const noResponseCategories = ['billing_matter'];

  if (noResponseCategories.includes(triageResult.category)) {
    return false;
  }

  // Always respond to high priority items
  if (priorityResult.level === 'CRITICAL' || priorityResult.level === 'HIGH') {
    return true;
  }

  // Respond to document submissions and inquiries
  if (['document_submission', 'general_inquiry', 'appointment_request'].includes(triageResult.category)) {
    return true;
  }

  return false;
}

/**
 * Generate appropriate response subject line
 */
function generateResponseSubject(originalSubject) {
  if (originalSubject.toLowerCase().startsWith('re:')) {
    return originalSubject;
  }

  return `Re: ${originalSubject}`;
}

/**
 * Clean and format AI response text
 */
function cleanResponseText(responseText) {
  // Remove any unwanted formatting or artifacts
  let cleaned = responseText
    .replace(/^["']|["']$/g, '') // Remove surrounding quotes
    .replace(/\n{3,}/g, '\n\n') // Reduce excessive line breaks
    .trim();

  // Ensure professional closing if missing
  if (!cleaned.includes('Best regards') &&
      !cleaned.includes('Sincerely') &&
      !cleaned.includes('Thank you')) {
    cleaned += '\n\nBest regards,\nLegal Team';
  }

  return cleaned;
}

/**
 * Fallback response when AI fails
 */
function fallbackResponse(emailData, triageResult, priorityResult) {
  const templates = {
    lawsuit_communication: `Thank you for your communication regarding this legal matter. We have received your message and it will be reviewed by our legal team. You will hear from us within 24 hours.

Your reference ID: [ChittyID will be provided]

Best regards,
Legal Team`,

    document_submission: `We have received your document submission. Our team will review the materials and confirm receipt within 2 business days. If any additional documentation is required, we will contact you promptly.

Your reference ID: [ChittyID will be provided]

Best regards,
Legal Team`,

    general_inquiry: `Thank you for contacting our firm. We have received your inquiry and will respond within 2 business days. For urgent matters, please call our main office.

Your reference ID: [ChittyID will be provided]

Best regards,
Legal Team`,

    emergency_legal: `We have received your urgent communication and it has been escalated to our legal team for immediate attention. You will hear from us within 2 hours.

Your reference ID: [ChittyID will be provided]

Best regards,
Legal Team`,

    court_notice: `We acknowledge receipt of this court-related communication. Our legal team has been notified immediately and will take appropriate action.

Your reference ID: [ChittyID will be provided]

Best regards,
Legal Team`,

    appointment_request: `Thank you for your appointment request. Our scheduling team will review your availability and contact you within 1 business day to confirm scheduling details.

Your reference ID: [ChittyID will be provided]

Best regards,
Legal Team`
  };

  const template = templates[triageResult.category] || templates.general_inquiry;

  return {
    shouldRespond: true,
    subject: generateResponseSubject(emailData.subject),
    body: template,
    responseType: 'fallback_template',
    category: triageResult.category,
    priority: priorityResult.level,
    fallback: true,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate response content for legal compliance
 */
export function validateResponseContent(responseText) {
  const warnings = [];

  // Check for potentially problematic content
  const problematicPhrases = [
    'legal advice',
    'we guarantee',
    'certainly will',
    'definitely',
    'promised outcome'
  ];

  const lowerText = responseText.toLowerCase();

  for (const phrase of problematicPhrases) {
    if (lowerText.includes(phrase)) {
      warnings.push(`Potentially problematic phrase: "${phrase}"`);
    }
  }

  // Check for missing disclaimers on certain content
  if (lowerText.includes('advice') && !lowerText.includes('not legal advice')) {
    warnings.push('Consider adding legal advice disclaimer');
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    reviewRequired: warnings.length > 0
  };
}

/**
 * Add legal disclaimers where appropriate
 */
export function addLegalDisclaimers(responseText, category) {
  let disclaimer = '';

  if (category === 'general_inquiry') {
    disclaimer = '\n\nPlease note: This correspondence does not constitute legal advice and does not create an attorney-client relationship.';
  }

  return responseText + disclaimer;
}