/**
 * Test Setup for ChittyRouter AI Tests
 * Global test configuration and mocks
 */

import { vi } from 'vitest';

// Global test environment setup
globalThis.process = globalThis.process || {
  env: {
    NODE_ENV: 'test',
    ENVIRONMENT: 'test'
  }
};

// Mock crypto for Node.js environment
if (!globalThis.crypto) {
  const { webcrypto } = await import('crypto');
  globalThis.crypto = webcrypto;
}

// Mock TextEncoder/TextDecoder if not available
if (!globalThis.TextEncoder) {
  const { TextEncoder, TextDecoder } = await import('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// Mock fetch for environments that don't have it
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn();
}

// Mock ReadableStream
if (!globalThis.ReadableStream) {
  globalThis.ReadableStream = class MockReadableStream {
    constructor(options = {}) {
      this.options = options;
    }

    getReader() {
      return {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn()
      };
    }
  };
}

// Mock Response
if (!globalThis.Response) {
  globalThis.Response = class MockResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.statusText = init.statusText || 'OK';
      this.headers = new Map(Object.entries(init.headers || {}));
    }

    async json() {
      return JSON.parse(this.body);
    }

    async text() {
      return this.body.toString();
    }
  };
}

// Mock Request
if (!globalThis.Request) {
  globalThis.Request = class MockRequest {
    constructor(url, init = {}) {
      this.url = url;
      this.method = init.method || 'GET';
      this.headers = new Map(Object.entries(init.headers || {}));
      this.body = init.body;
    }

    async json() {
      return JSON.parse(this.body);
    }
  };
}

// Mock FormData
if (!globalThis.FormData) {
  globalThis.FormData = class MockFormData {
    constructor() {
      this.data = new Map();
    }

    append(key, value) {
      this.data.set(key, value);
    }

    get(key) {
      return this.data.get(key);
    }
  };
}

// Test utilities
export const testUtils = {
  // Create mock email message
  createMockEmailMessage(overrides = {}) {
    return {
      from: 'test@example.com',
      to: 'destination@example.com',
      headers: new Map([
        ['subject', 'Test Email'],
        ['message-id', 'test-123']
      ]),
      raw: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('Test email content'));
          controller.close();
        }
      }),
      attachments: [],
      reply: vi.fn().mockResolvedValue(true),
      forward: vi.fn().mockResolvedValue(true),
      ...overrides
    };
  },

  // Create mock AI environment
  createMockAIEnvironment() {
    return {
      AI: {
        run: vi.fn().mockResolvedValue({
          response: JSON.stringify({
            category: 'general_inquiry',
            priority: 'NORMAL',
            confidence: 0.8
          })
        })
      },
      AI_STATE_DO: {
        idFromName: vi.fn().mockReturnValue('test-id'),
        get: vi.fn().mockReturnValue({
          fetch: vi.fn().mockResolvedValue(new Response('{"success": true}'))
        })
      },
      AI_CACHE: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined)
      },
      ENVIRONMENT: 'test'
    };
  },

  // Create mock email data
  createMockEmailData(overrides = {}) {
    return {
      from: 'client@example.com',
      to: 'legal@example.com',
      subject: 'Legal matter inquiry',
      content: 'This is a test email about a legal matter.',
      attachments: [],
      timestamp: new Date().toISOString(),
      messageId: 'test-message-123',
      ...overrides
    };
  },

  // Create mock attachment
  createMockAttachment(overrides = {}) {
    return {
      name: 'document.pdf',
      size: 1024000,
      type: 'application/pdf',
      ...overrides
    };
  },

  // Wait for async operations
  async waitFor(ms = 100) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Assert that a function throws a specific error
  async assertThrows(fn, expectedError) {
    try {
      await fn();
      throw new Error('Function did not throw');
    } catch (error) {
      if (expectedError) {
        expect(error.message).toContain(expectedError);
      }
      return error;
    }
  }
};

// Global test configuration
export const testConfig = {
  ai: {
    models: {
      llm: '@cf/meta/llama-3.1-8b-instruct',
      vision: '@cf/microsoft/resnet-50',
      audio: '@cf/openai/whisper'
    },
    timeout: 30000
  },
  email: {
    maxSize: 25 * 1024 * 1024,
    maxAttachments: 10
  },
  routing: {
    defaultDestination: 'intake@example.com',
    emergencyDestination: 'emergency@example.com'
  }
};

// Export global mocks
export const globalMocks = {
  console: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
};

// Setup test environment
export function setupTestEnvironment() {
  // Reset all mocks before each test
  vi.clearAllMocks();

  // Set test-specific console mocks if needed
  if (process.env.SILENT_TESTS === 'true') {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  }
}

// Run setup
setupTestEnvironment();