/**
 * Cloudflare Email Worker Message Simulator
 * Provides mock email message objects for testing without real Cloudflare infrastructure
 * 
 * Simulates the Cloudflare Email Worker message interface:
 * - message.from, message.to
 * - message.headers (Map-like interface with .get(name))
 * - message.raw (ReadableStream)
 * - message.rawSize
 * - message.attachments array
 * - message.forward(address)
 * - message.reply({subject, text, html})
 */

import { vi } from 'vitest';

/**
 * Create a mock Cloudflare Email Worker message object
 */
export class EmailWorkerSimulator {
  constructor(emailData = {}) {
    this.from = emailData.from || 'test@example.com';
    this.to = emailData.to || 'destination@chitty.cc';
    this.rawSize = emailData.rawSize || 5000;
    this.attachments = emailData.attachments || [];
    
    // Create headers map
    this.headers = this._createHeadersMap(emailData.headers || {});
    
    // Create readable stream for raw content
    this.raw = this._createRawStream(emailData.rawContent || this._generateDefaultRawContent(emailData));
    
    // Track calls to forward() and reply()
    this.forwardCalls = [];
    this.replyCalls = [];
    
    // Bind methods to preserve context
    this.forward = this.forward.bind(this);
    this.reply = this.reply.bind(this);
  }
  
  /**
   * Create headers map with .get() method
   */
  _createHeadersMap(headersObj) {
    const headers = new Map();
    
    // Set default headers
    headers.set('subject', headersObj.subject || '(No subject)');
    headers.set('message-id', headersObj['message-id'] || `<test-${Date.now()}@test.example.com>`);
    headers.set('date', headersObj.date || new Date().toUTCString());
    headers.set('from', headersObj.from || this.from);
    headers.set('to', headersObj.to || this.to);
    headers.set('content-type', headersObj['content-type'] || 'text/plain; charset=utf-8');
    
    // Add any custom headers
    for (const [key, value] of Object.entries(headersObj)) {
      headers.set(key.toLowerCase(), value);
    }
    
    return headers;
  }
  
  /**
   * Generate default raw email content
   */
  _generateDefaultRawContent(emailData) {
    const subject = emailData.subject || this.headers.get('subject');
    const content = emailData.content || 'Test email content';
    
    return `From: ${this.from}
To: ${this.to}
Subject: ${subject}
Date: ${this.headers.get('date')}
Message-ID: ${this.headers.get('message-id')}
Content-Type: ${this.headers.get('content-type')}

${content}`;
  }
  
  /**
   * Create ReadableStream for raw email content
   */
  _createRawStream(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    
    return new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
  }
  
  /**
   * Mock forward() method - captures calls for assertions
   */
  async forward(address) {
    this.forwardCalls.push({
      address,
      timestamp: Date.now()
    });
    
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return { success: true };
  }
  
  /**
   * Mock reply() method - captures calls for assertions
   */
  async reply(options) {
    this.replyCalls.push({
      subject: options.subject,
      text: options.text,
      html: options.html,
      timestamp: Date.now()
    });
    
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return { success: true };
  }
  
  /**
   * Get all forward calls for assertions
   */
  getForwardCalls() {
    return [...this.forwardCalls];
  }
  
  /**
   * Get all reply calls for assertions
   */
  getReplyCalls() {
    return [...this.replyCalls];
  }
  
  /**
   * Check if message was forwarded to a specific address
   */
  wasForwardedTo(address) {
    return this.forwardCalls.some(call => call.address === address);
  }
  
  /**
   * Check if a reply was sent
   */
  wasReplied() {
    return this.replyCalls.length > 0;
  }
  
  /**
   * Reset call tracking
   */
  reset() {
    this.forwardCalls = [];
    this.replyCalls = [];
  }
}

/**
 * Factory function to create email worker message simulators
 */
export function createEmailWorkerMessage(emailData = {}) {
  return new EmailWorkerSimulator(emailData);
}

/**
 * Create a batch of test messages for different scenarios
 */
export function createTestMessageBatch() {
  return {
    // Case pattern: specific case email
    ariasVBianchi: createEmailWorkerMessage({
      from: 'opposing@lawfirm.com',
      to: 'arias-v-bianchi@chitty.cc',
      subject: 'Discovery Request - Arias v. Bianchi',
      content: 'Requesting production of documents related to the contract dispute.',
      headers: {
        'x-priority': 'high'
      }
    }),
    
    // Case pattern: generic plaintiff-v-defendant
    genericCase: createEmailWorkerMessage({
      from: 'clerk@court.gov',
      to: 'plaintiff-v-defendant@chitty.cc',
      subject: 'Court Hearing Notice',
      content: 'Your hearing is scheduled for next Thursday at 10:00 AM.',
      headers: {
        'x-case-number': '2024CV12345'
      }
    }),
    
    // Urgent: court deadline
    urgentCourtDeadline: createEmailWorkerMessage({
      from: 'judge@superior-court.gov',
      to: 'legal@chitty.cc',
      subject: 'URGENT: Response Due Tomorrow - Motion to Compel',
      content: 'Your response to the motion to compel discovery is due by 5:00 PM tomorrow. Failure to respond may result in sanctions.',
      headers: {
        'importance': 'high',
        'x-priority': '1'
      }
    }),
    
    // High priority: legal matter
    legalMatter: createEmailWorkerMessage({
      from: 'attorney@biglaw.com',
      to: 'intake@chitty.cc',
      subject: 'New Case Consultation - Personal Injury',
      content: 'Client involved in serious accident. Opposing counsel already retained. Need immediate consultation.',
    }),
    
    // Medium priority: evidence submission
    evidenceSubmission: createEmailWorkerMessage({
      from: 'client@company.com',
      to: 'evidence@chitty.cc',
      subject: 'Document Submission - Financial Records',
      content: 'Attached are the financial records you requested for the case.',
      attachments: [
        { name: 'financials.pdf', size: 1024000, type: 'application/pdf' },
        { name: 'bank-statements.xlsx', size: 512000, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      ]
    }),
    
    // Low priority: general inquiry
    generalInquiry: createEmailWorkerMessage({
      from: 'info@potential-client.com',
      to: 'chittyos@chitty.cc',
      subject: 'General Legal Question',
      content: 'I have a general question about contract law. Do you offer consultations?',
    }),
    
    // Creditor/collections
    creditorNotice: createEmailWorkerMessage({
      from: 'collections@debt-agency.com',
      to: 'legal@chitty.cc',
      subject: 'Final Notice - Account Past Due',
      content: 'This is a final notice that your account is 90 days past due. Payment of $5,000 is required immediately to avoid legal action.',
    }),
    
    // Compliance matter
    complianceFiling: createEmailWorkerMessage({
      from: 'secretary-of-state@state.gov',
      to: 'compliance@chitty.cc',
      subject: 'Annual Report Filing Deadline - 30 Days',
      content: 'Your annual report for XYZ Corporation is due in 30 days. Failure to file will result in administrative dissolution.',
    })
  };
}

/**
 * Create mock environment for email handler testing
 */
export function createMockEmailEnvironment() {
  return {
    AI_CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [] })
    },
    
    DOCUMENT_STORAGE: {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      head: vi.fn().mockResolvedValue(null)
    },
    
    VECTORIZE_INDEX: {
      insert: vi.fn().mockResolvedValue({ count: 1 }),
      query: vi.fn().mockResolvedValue({ matches: [] }),
      upsert: vi.fn().mockResolvedValue({ count: 1 }),
      getByIds: vi.fn().mockResolvedValue([])
    },
    
    AI: {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({
          category: 'general',
          priority: 'MEDIUM',
          urgency_score: 0.5
        })
      })
    },
    
    // Service URLs for ChittyEvidence integration
    CHITTY_EVIDENCE_URL: 'https://evidence.chitty.cc',
    CHITTY_EVIDENCE_DB_URL: 'https://evidence-db.chitty.cc',
    CHITTY_CONNECT_URL: 'https://connect.chitty.cc',
    
    // Environment config
    ENVIRONMENT: 'test',
    VERSION_MANAGEMENT: 'enterprise'
  };
}

/**
 * Assert helper for email routing
 */
export function assertEmailRouting(message, expectedAddress) {
  if (!message.wasForwardedTo(expectedAddress)) {
    throw new Error(
      `Expected email to be forwarded to "${expectedAddress}", ` +
      `but was forwarded to: ${message.getForwardCalls().map(c => c.address).join(', ') || 'none'}`
    );
  }
}

/**
 * Assert helper for email replies
 */
export function assertEmailReplied(message, expectedContent) {
  const replies = message.getReplyCalls();
  
  if (replies.length === 0) {
    throw new Error('Expected email to receive a reply, but none was sent');
  }
  
  if (expectedContent) {
    const hasMatchingContent = replies.some(reply => 
      (reply.text && reply.text.includes(expectedContent)) ||
      (reply.html && reply.html.includes(expectedContent))
    );
    
    if (!hasMatchingContent) {
      throw new Error(
        `Expected reply to contain "${expectedContent}", ` +
        `but reply content was: ${JSON.stringify(replies[0])}`
      );
    }
  }
}

/**
 * Extract case pattern from email address
 * Helper for test assertions
 */
export function extractCasePattern(address) {
  const caseMatch = address.match(/([a-zA-Z]+)-v-([a-zA-Z]+)@/i);
  if (caseMatch) {
    return `${caseMatch[1]}_v_${caseMatch[2]}`;
  }
  return null;
}
