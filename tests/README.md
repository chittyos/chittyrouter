# Email Processing Evaluation & Test Harness

This directory contains a comprehensive test harness for evaluating and validating email processing in ChittyRouter AI Gateway.

## Overview

The test harness simulates Cloudflare Email Workers without requiring actual Cloudflare infrastructure. It validates:

1. **Routing**: Address-based routing and case pattern extraction
2. **Traceability**: Event logging and proof records
3. **Forgetability**: Content retention policies (TTL, size caps, truncation)
4. **Integration**: R2 storage, Vectorize embeddings, ChittyEvidence ingestion

## Test Structure

### Test Harness (`tests/harness/`)

**`email-worker-simulator.js`**
- Mock Cloudflare Email Worker message objects
- Simulates `message.forward()` and `message.reply()`
- Captures calls for assertions
- Provides test message batch generation

### Integration Tests (`tests/integration/`)

**`email-processing-simulation.test.js`**
- End-to-end email processing scenarios
- Case pattern extraction (e.g., `arias-v-bianchi@chitty.cc`, `plaintiff-v-defendant@chitty.cc`)
- Urgency triage scoring validation
- Routing decision verification
- KV logging behavior (`email_log_recent`, `email_urgent_items`, `email_stats`)
- Forgetability enforcement (TTL, caps, truncation)

### Unit Tests (`tests/unit/`)

**`email-storage-sinks.test.js`**
- R2 raw email storage with privacy controls
- Attachment storage with size limits
- Vectorize embedding upserts
- ChittyEvidence event emission
- Privacy and forgetability validation

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Integration Tests (Email Simulation)
```bash
npm run test:integration
```

### Run Unit Tests (Storage Sinks)
```bash
npm run test:unit
```

### Run Specific Test File
```bash
npm test tests/integration/email-processing-simulation.test.js
```

### Watch Mode for Development
```bash
npm run test:watch
```

### Generate Coverage Report
```bash
npm run test:coverage
```

## Test Scenarios

### Case Pattern Extraction

Tests validate extraction of case information from email addresses:

- **Specific cases**: `arias-v-bianchi@chitty.cc` → `arias_v_bianchi`
- **Generic patterns**: `plaintiff-v-defendant@chitty.cc` → `plaintiff_v_defendant`
- **No pattern**: Standard addresses like `legal@chitty.cc`

### Urgency Triage Scoring

Tests validate urgency scoring based on:

- **Court keywords**: "court", "hearing", "motion", "deadline" → HIGH/CRITICAL
- **Legal keywords**: "attorney", "lawyer", "case" → MEDIUM/HIGH
- **Creditor/collections**: "debt", "payment due", "collection" → MEDIUM
- **Compliance**: "annual report", "filing deadline" → MEDIUM
- **Urgent markers**: "URGENT", "ASAP", "time-sensitive" → Score boost
- **Important senders**: Court, judge, attorney domains → Score boost
- **Date patterns**: Detected dates → Score boost

### Forgetability Enforcement

Tests validate privacy and data retention:

- **List caps**: Recent emails (100 max), Urgent items (50 max)
- **TTL enforcement**: All KV writes have expiration (7 days, 3 days, 1 day)
- **Content truncation**: Email content limited to 2000 chars
- **No full body storage**: Only metadata + truncated preview stored
- **Privacy mode**: R2 storage defaults to hash + metadata only

### Storage Sinks

Tests validate pluggable storage abstractions:

#### R2 Storage
- Raw email storage with privacy controls
- Attachment storage with size limits
- TTL metadata on all objects
- Deterministic key generation

#### Vectorize
- Email embedding generation via AI
- Metadata-only vector storage
- Subject truncation (200 chars)
- Semantic search capability

#### ChittyEvidence Integration
- Event emission to evidence ingestion endpoints
- Cross-service routing via ChittyConnect
- Graceful handling of service failures

## Mock Environment

The test harness provides a complete mock environment:

```javascript
import { createMockEmailEnvironment } from '../harness/email-worker-simulator.js';

const mockEnv = createMockEmailEnvironment();
// Includes: AI_CACHE, DOCUMENT_STORAGE, VECTORIZE_INDEX, AI
```

All mocks are instrumented with Vitest's `vi.fn()` for assertion and verification.

## Creating Test Messages

Use the harness to create realistic test messages:

```javascript
import { createEmailWorkerMessage, createTestMessageBatch } from '../harness/email-worker-simulator.js';

// Single message
const message = createEmailWorkerMessage({
  from: 'sender@example.com',
  to: 'arias-v-bianchi@chitty.cc',
  subject: 'Discovery Request',
  content: 'Requesting production of documents...',
  attachments: [{ name: 'request.pdf', size: 1024000 }]
});

// Pre-built batch for common scenarios
const batch = createTestMessageBatch();
// Contains: ariasVBianchi, genericCase, urgentCourtDeadline, etc.
```

## Assertions

The harness provides helper functions for common assertions:

```javascript
import { assertEmailRouting, assertEmailReplied } from '../harness/email-worker-simulator.js';

// Assert routing
assertEmailRouting(message, 'expected@address.com');

// Assert reply was sent
assertEmailReplied(message, 'expected content');

// Manual checks
expect(message.wasForwardedTo('address@example.com')).toBe(true);
expect(message.wasReplied()).toBe(true);
```

## Privacy-First Design

All storage operations enforce privacy by default:

1. **No full content storage** unless explicitly enabled
2. **Content truncation** to configurable limits
3. **TTL on all stored data** (no permanent storage)
4. **Hash-based deduplication** for privacy
5. **Metadata-only** by default

Example:
```javascript
import { createEmailStorageSinks } from '../../src/storage/email-storage-sinks.js';

// Privacy-first (default)
const sinks = createEmailStorageSinks(env);
// storeFullContent: false
// contentTruncateLength: 1000
// emailTTL: 7 days

// Test-safe (no actual storage)
const testSinks = createTestStorageSinks(env);
// All storage disabled
```

## Test Data

Test messages are created dynamically via the harness in `tests/harness/email-worker-simulator.js` using the `createTestMessageBatch()` function.

Additional test email data can be found in `tests/data/test-emails.js` for specific scenarios.

## CI/CD Integration

Tests are designed to run in CI environments:

```bash
# CI mode with JUnit output
npm run test:ci

# With coverage reporting
npm run test:coverage
```

No external services required - all tests use mocks.

## Extending the Harness

### Adding New Test Scenarios

1. Create test message in `email-worker-simulator.js`:
```javascript
myScenario: createEmailWorkerMessage({
  from: 'sender@example.com',
  to: 'target@chitty.cc',
  subject: 'My Test Scenario',
  content: 'Test content...'
})
```

2. Add test in appropriate suite:
```javascript
it('should handle my scenario', async () => {
  const message = messages.myScenario;
  const result = await handler.handleEmail(message, mockEnv, {});
  expect(result.success).toBe(true);
});
```

### Adding New Storage Sinks

1. Extend `EmailStorageSinks` class in `src/storage/email-storage-sinks.js`
2. Add tests in `tests/unit/email-storage-sinks.test.js`
3. Document integration in this README

## Troubleshooting

### Tests Timing Out

Increase timeout in `vitest.config.js` if needed (default: 30s for AI operations).

### Mock Not Working

Ensure mocks are set up in `beforeEach()` and cleared in `afterEach()`:
```javascript
beforeEach(() => {
  mockEnv = createMockEmailEnvironment();
});

afterEach(() => {
  vi.clearAllMocks();
});
```

### Stream Errors

ReadableStream may need polyfill in some Node environments. The test setup in `tests/setup/test-setup.js` handles this automatically.

## Related Files

- `src/email/cloudflare-email-handler.js` - Email processing implementation
- `src/storage/email-storage-sinks.js` - Storage abstractions
- `tests/mocks/ai-responses.js` - Mock AI responses
- `tests/data/test-emails.js` - Test email data
- `vitest.config.js` - Test configuration

## Support

For questions or issues with the test harness, see:
- Project README: `/README.md`
- CLAUDE.md: Development guidelines
- Test setup: `tests/setup/test-setup.js`
