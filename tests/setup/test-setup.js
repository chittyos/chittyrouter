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

// Mock fetch globally to prevent external network calls in tests.
// Uses a regular function (not vi.fn()) so restoreMocks: true in vitest config
// does not reset the implementation between tests.
globalThis.fetch = async function mockFetch(url, options) {
  const urlStr = url?.toString() || '';

  // Mock ChittyID validate/details — return 404 so code falls through to local logic
  if (urlStr.includes('id.chitty.cc/api/v1/validate') || urlStr.includes('id.chitty.cc/api/v1/details')) {
    return new Response('{}', { status: 404 });
  }

  // Mock ChittyID generation — return type-appropriate IDs
  if (urlStr.includes('id.chitty.cc')) {
    let type = 'EMAIL';
    let source = 'MEDIA';
    if (options?.body) {
      try {
        const body = JSON.parse(options.body);
        type = body.type || 'EMAIL';
        source = body.metadata?.source || 'MEDIA';
      } catch (e) { /* ignore parse errors */ }
    }
    const ts = Date.now();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const hash = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    let chittyId;
    switch (type) {
      case 'MEDIA':    chittyId = `CHITTY-${source}-${ts}-${hash}`; break;
      case 'DOCUMENT': chittyId = `CD-${hash.substring(0, 8)}-DOC-${ts}`; break;
      case 'CASE':     chittyId = `CC-${hash.substring(0, 8)}-CASE-${ts}`; break;
      case 'PARTICIPANT': chittyId = `CP-${hash.substring(0, 8)}-PERSON-${ts}`; break;
      default:         chittyId = `CE-${hash.substring(0, 8)}-EMAIL-${ts}`; break;
    }
    return new Response(JSON.stringify({ chittyId, valid: true }), { status: 200 });
  }

  // Mock schema validation service
  if (urlStr.includes('schema.chitty.cc')) {
    return new Response(JSON.stringify({ valid: true, errors: [], warnings: [], normalizedData: null }), { status: 200 });
  }

  // Mock registry — return empty services so ServiceDiscovery uses fallback endpoints
  if (urlStr.includes('registry.chitty.cc')) {
    return new Response(JSON.stringify({ services: [] }), { status: 200 });
  }

  // Mock ChittyChain / storage calls
  if (urlStr.includes('chain') || urlStr.includes('storage') || urlStr.includes('evidence')) {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  // Mock ChittyChat / sync calls
  if (urlStr.includes('chitty') || urlStr.includes('sync')) {
    return new Response(JSON.stringify({ success: true, synced: true, syncId: 'mock-sync', projectUpdate: true }), { status: 200 });
  }

  // Default: return success
  return new Response(JSON.stringify({ success: true }), { status: 200 });
};

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