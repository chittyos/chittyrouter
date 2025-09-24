/**
 * Cloudflare Email Worker Integration
 * Handles incoming emails and processes them through the AI pipeline
 */

import { EmailProcessor } from '../ai/email-processor.js';
import { Ai } from '@cloudflare/ai';
import { ChittyIDValidator } from '../chittyid/chittyid-validator.js';
import { logEmailToChain } from '../utils/chain-logger.js';

/**
 * Cloudflare Email Worker Handler
 * This is the main entry point for processing incoming emails
 */
export default {
  async email(message, env, ctx) {
    console.log('📧 Cloudflare Email Worker received message from:', message.from);

    try {
      // Initialize AI and processor
      const ai = new Ai(env.AI);
      const processor = new EmailProcessor(ai, env);

      // Process the email through AI pipeline
      const result = await processor.processIncomingEmail(message, ctx);

      // Log processing result
      await logEmailToChain(env, {
        type: 'EMAIL_WORKER_PROCESSING',
        chittyId: result.chittyId,
        success: result.success,
        ai_processed: result.ai_processed,
        routing: result.routing,
        timestamp: new Date().toISOString()
      });

      console.log('✅ Email processing completed:', result.chittyId);
      return result;

    } catch (error) {
      console.error('❌ Email worker processing failed:', error);

      // Emergency fallback processing
      return await emergencyFallbackProcessing(message, env, error);
    }
  }
};

/**
 * Emergency fallback when all AI processing fails
 * Ensures emails are never lost even if AI systems are down
 */
async function emergencyFallbackProcessing(message, env, originalError) {
  console.log('🚨 Emergency fallback processing activated');

  try {
    // Generate basic ChittyID
    const chittyId = `FALLBACK-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;

    // Determine basic routing based on email address patterns
    const routingDestination = determineBasicRouting(message.to);

    // Forward to determined destination
    await message.forward(routingDestination);

    // Send basic acknowledgment
    await message.reply({
      subject: `Re: ${message.headers.get('subject') || 'Your message'}`,
      text: generateBasicAcknowledgment(chittyId)
    });

    // Log fallback processing
    await logEmailToChain(env, {
      type: 'EMERGENCY_FALLBACK_PROCESSING',
      chittyId,
      error: originalError.message,
      routing_destination: routingDestination,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      chittyId,
      fallback: true,
      error: originalError.message,
      routing: { primary_route: routingDestination }
    };

  } catch (fallbackError) {
    console.error('💥 Even fallback processing failed:', fallbackError);

    // Last resort: forward to emergency inbox
    try {
      await message.forward('emergency@example.com');
    } catch (forwardError) {
      console.error('🔥 Complete system failure - email may be lost:', forwardError);
    }

    return {
      success: false,
      complete_failure: true,
      original_error: originalError.message,
      fallback_error: fallbackError.message
    };
  }
}

/**
 * Determine basic routing without AI
 * Uses simple pattern matching as last resort
 */
function determineBasicRouting(emailAddress) {
  const address = emailAddress.toLowerCase();

  // Case pattern matching
  if (address.match(/[a-z]+-v-[a-z]+@/)) {
    return 'case-management@example.com';
  }

  // Emergency indicators
  if (address.includes('emergency') || address.includes('urgent')) {
    return 'emergency@example.com';
  }

  // Document submissions
  if (address.includes('document') || address.includes('filing')) {
    return 'documents@example.com';
  }

  // Billing
  if (address.includes('billing') || address.includes('payment')) {
    return 'billing@example.com';
  }

  // Default to intake
  return 'intake@example.com';
}

/**
 * Generate basic acknowledgment message
 */
function generateBasicAcknowledgment(chittyId) {
  return `Thank you for your email. We have received your message and it has been forwarded to the appropriate team.

Your reference ID: ${chittyId}

Due to temporary system maintenance, this is an automated acknowledgment. Our team will review your message and respond appropriately.

For urgent matters, please contact our main office directly.

Best regards,
Legal Team

---
This message was processed by ChittyRouter Emergency Fallback System`;
}

/**
 * Middleware for email preprocessing
 * Validates and sanitizes incoming emails before AI processing
 */
export class EmailPreprocessor {
  constructor(env) {
    this.env = env;
    this.maxEmailSize = 25 * 1024 * 1024; // 25MB limit
    this.maxAttachments = 10;
  }

  async preprocess(message) {
    const validationResult = this.validateEmail(message);
    if (!validationResult.valid) {
      throw new Error(`Email validation failed: ${validationResult.reason}`);
    }

    const sanitizedMessage = await this.sanitizeEmail(message);
    return sanitizedMessage;
  }

  validateEmail(message) {
    // Check sender
    if (!message.from || !this.isValidEmailAddress(message.from)) {
      return { valid: false, reason: 'Invalid sender address' };
    }

    // Check recipient
    if (!message.to || !this.isValidEmailAddress(message.to)) {
      return { valid: false, reason: 'Invalid recipient address' };
    }

    // Check for suspicious patterns
    if (this.containsSuspiciousContent(message)) {
      return { valid: false, reason: 'Suspicious content detected' };
    }

    // Check attachment limits
    if (message.attachments && message.attachments.length > this.maxAttachments) {
      return { valid: false, reason: 'Too many attachments' };
    }

    return { valid: true };
  }

  isValidEmailAddress(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length < 254;
  }

  containsSuspiciousContent(message) {
    const subject = message.headers.get('subject') || '';
    const suspiciousPatterns = [
      /\$\$\$|\bfree money\b|\bclick here\b/i,
      /\bnigerian prince\b|\binheritance\b|\blottery winner\b/i,
      /\bphishing\b|\bscam\b|\bfraud\b/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(subject));
  }

  async sanitizeEmail(message) {
    // Create sanitized version
    const sanitized = {
      from: this.sanitizeAddress(message.from),
      to: this.sanitizeAddress(message.to),
      subject: this.sanitizeSubject(message.headers.get('subject')),
      messageId: message.headers.get('message-id'),
      timestamp: new Date().toISOString(),
      attachments: await this.sanitizeAttachments(message.attachments || []),
      raw: message.raw
    };

    return sanitized;
  }

  sanitizeAddress(address) {
    return address.toLowerCase().trim();
  }

  sanitizeSubject(subject) {
    if (!subject) return '';

    // Remove potentially dangerous characters
    return subject
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .substring(0, 200)
      .trim();
  }

  async sanitizeAttachments(attachments) {
    const safe = [];

    for (const attachment of attachments) {
      if (this.isSafeAttachment(attachment)) {
        safe.push({
          name: this.sanitizeFilename(attachment.name),
          size: attachment.size,
          type: attachment.type
        });
      }
    }

    return safe;
  }

  isSafeAttachment(attachment) {
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js'];
    const extension = attachment.name.toLowerCase().match(/\.[^.]+$/)?.[0];

    return !dangerousExtensions.includes(extension);
  }

  sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .substring(0, 100);
  }
}

/**
 * Email routing analytics collector
 * Collects metrics for improving AI routing accuracy
 */
export class EmailAnalytics {
  constructor(env) {
    this.env = env;
  }

  async recordEmailProcessing(result) {
    if (!this.env.AI_ANALYTICS) return;

    const analyticsData = {
      timestamp: new Date().toISOString(),
      chittyId: result.chittyId,
      category: result.ai_processed ? result.routing?.category : 'fallback',
      priority: result.ai_processed ? result.routing?.priority : 'unknown',
      processing_time: result.processing_time || 0,
      success: result.success,
      ai_confidence: result.ai_processed ? result.routing?.confidence : 0,
      fallback_used: !!result.fallback
    };

    try {
      await this.env.AI_ANALYTICS.writeDataPoint(analyticsData);
    } catch (error) {
      console.error('Failed to record analytics:', error);
    }
  }

  async recordRoutingAccuracy(chittyId, actualOutcome, predictedOutcome) {
    if (!this.env.AI_ANALYTICS) return;

    const accuracyData = {
      timestamp: new Date().toISOString(),
      chittyId,
      predicted_category: predictedOutcome.category,
      actual_category: actualOutcome.category,
      predicted_priority: predictedOutcome.priority,
      actual_priority: actualOutcome.priority,
      accuracy_score: this.calculateAccuracyScore(predictedOutcome, actualOutcome)
    };

    try {
      await this.env.AI_ANALYTICS.writeDataPoint(accuracyData);
    } catch (error) {
      console.error('Failed to record accuracy metrics:', error);
    }
  }

  calculateAccuracyScore(predicted, actual) {
    let score = 0;
    if (predicted.category === actual.category) score += 0.5;
    if (predicted.priority === actual.priority) score += 0.5;
    return score;
  }
}

/**
 * Email Worker Configuration and Setup
 */
export const EMAIL_WORKER_CONFIG = {
  // Supported email patterns
  patterns: [
    '*@example.com',                    // General emails
    '*-v-*@example.com',               // Case emails (plaintiff-v-defendant)
    'case-*@example.com',              // Case management
    'matter-*@example.com',            // Matter management
    'document-*@example.com',          // Document submissions
    'emergency@example.com',           // Emergency communications
    'intake@example.com',              // New client intake
    'billing@example.com'              // Billing inquiries
  ],

  // Processing limits
  limits: {
    maxEmailSize: 25 * 1024 * 1024,   // 25MB
    maxAttachments: 10,                // 10 files per email
    maxProcessingTime: 30000,          // 30 seconds
    maxConcurrentEmails: 100           // 100 simultaneous emails
  },

  // AI model preferences
  models: {
    primary: '@cf/meta/llama-3.1-8b-instruct',
    fallback: '@cf/openai/gpt-3.5-turbo',
    vision: '@cf/microsoft/resnet-50',
    audio: '@cf/openai/whisper'
  },

  // Routing destinations
  routes: {
    'lawsuit_communication': 'case-management@example.com',
    'document_submission': 'documents@example.com',
    'appointment_request': 'calendar@example.com',
    'emergency_legal': 'emergency@example.com',
    'general_inquiry': 'intake@example.com',
    'court_notice': 'case-management@example.com',
    'billing_matter': 'billing@example.com',
    'fallback': 'intake@example.com'
  }
};