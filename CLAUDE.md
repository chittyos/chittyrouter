# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChittyRouter AI Gateway v2.0.0-ai - AI-powered intelligent email routing service for the ChittyOS legal platform. Built on Cloudflare Workers with AI capabilities, it uses multiple AI agents to analyze, classify, route, and respond to legal communications automatically.

## Essential Commands

### Development
```bash
npm run dev                # Start Wrangler dev server with AI bindings
npm start                 # Start Node.js server locally
npm run email:test         # Test email routing functionality
npm run chittyid:generate  # Generate test ChittyIDs
```

### Testing
```bash
npm test                  # Run all tests (vitest)
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests
npm run test:performance  # Performance benchmarks
npm run test:failure      # Failure scenario tests
npm run test:all          # All test suites combined
npm run test:coverage     # Generate coverage report
npm run test:ui          # Interactive test UI
npm run test:watch        # Watch mode for development
```

### Code Quality
```bash
npm run lint             # Run ESLint on src/
npm run format           # Format with Prettier
npm run validate         # Lint + test:all + build
npm run pre-commit       # Pre-commit validation
```

### Deployment
```bash
npm run deploy:staging     # Deploy to staging environment
npm run deploy:production  # Deploy to production
npm run build             # Build for production using esbuild
npm run tail              # Tail Cloudflare Worker logs
```

### Scripts
```bash
node scripts/audit-workers.js                      # Audit Cloudflare Workers
node scripts/cleanup-workers.js                    # Clean up unused Workers
node scripts/comprehensive-worker-audit.js         # Comprehensive audit
node scripts/chitty-sync.js                       # ChittyChat synchronization
```

## Architecture

### AI-Powered Email Processing Pipeline
The core architecture replaces traditional rule-based routing with AI-first decision making:

1. **Email Ingestion** → Cloudflare Email Workers receive messages
2. **AI Analysis** → `ChittyRouterAI` performs comprehensive analysis
3. **Multi-Agent Processing** → `AgentOrchestrator` coordinates specialized agents
4. **Intelligent Routing** → AI determines optimal routing and responses
5. **State Persistence** → Durable Objects maintain processing context
6. **ChittyOS Integration** → Results integrated across platform services

### Key Components

**Core AI Engine**:
- `src/ai/intelligent-router.js` - Main AI routing logic using Cloudflare AI models
- `src/ai/agent-orchestrator.js` - Coordinates multiple AI agents for complex workflows
- `src/ai/email-processor.js` - Email-specific AI processing pipeline
- `src/ai/ai-state.js` - Durable Object for AI processing state

**Specialized AI Agents**:
- `src/ai/triage-agent.js` - Email classification and categorization
- `src/ai/priority-agent.js` - Urgency assessment and priority scoring
- `src/ai/response-agent.js` - Automated response generation
- `src/ai/document-agent.js` - Attachment analysis and document intelligence

**Integration Layer**:
- `src/integration/chittyos-integration.js` - Complete ChittyOS platform integration
- `src/utils/service-discovery.js` - Dynamic service discovery and routing
- `src/utils/ai-model-config.js` - AI model configuration and fallback chains
- `src/sync/` - Various sync orchestrators for cross-platform coordination

**Session Management System**:
- `src/sync/session-sync-manager.js` - GitHub-based persistent session architecture
- `src/sync/enhanced-session-sync.js` - Production session sync with vector clocks
- `src/sync/distributed-session-sync.js` - Vector clock implementation for distributed consistency
- `src/synthesis/chittychat-project-synth.js` - AI-powered project and topic synthesis

### Runtime Environment
- **Cloudflare Workers** - Primary serverless runtime (see `wrangler.toml`)
- **Cloudflare AI** - AI model inference via `env.AI` binding
- **Durable Objects** - Persistent state for `AIStateDO`, `ChittyChainDO`, `SyncStateDO`
- **KV Storage** - Caching layer for AI responses and sync data
- **R2 Storage** - Document and attachment storage
- **Email Workers** - Inbound email processing

## AI Model Configuration

The system uses multiple AI models with automatic fallback chains (configured in `src/utils/ai-model-config.js`):

**Primary Models**:
- `@cf/meta/llama-4-scout-17b-16e-instruct` - Primary multimodal model
- `@cf/openai/gpt-oss-120b` - Secondary/reasoning model
- `@cf/meta/llama-3.2-11b-vision-instruct` - Vision/document analysis
- `@cf/google/gemma-3-12b-it` - Advanced reasoning tasks
- `@cf/openai/whisper` - Audio/voice processing

**Key Environment Variables**:
- `AI_MODEL_PRIMARY`, `AI_MODEL_SECONDARY`, `AI_MODEL_VISION`, `AI_MODEL_REASONING`, `AI_MODEL_AUDIO`
- `VERSION_MANAGEMENT="enterprise"` - Enable enterprise features
- `RANDOMNESS_BEACON="true"` - Enable Cloudflare randomness beacon

**Required Bindings**:
- `AI` - Cloudflare AI model access
- `AI_CACHE` - KV namespace for response caching
- `DOCUMENT_STORAGE` - R2 bucket for attachments
- `AI_STATE_DO`, `CHITTYCHAIN_DO`, `SYNC_STATE` - Durable Objects

## Testing Strategy

Comprehensive test coverage using Vitest across multiple dimensions:
- `tests/unit/` - Individual component testing
- `tests/integration/` - Agent coordination and end-to-end workflows
- `tests/performance/` - AI response time benchmarks
- `tests/failure-scenarios/` - Error handling and graceful fallbacks

**Running specific tests**: Use `npm run test:unit -- tests/unit/intelligent-router.test.js`

## Development Guidelines

### AI Development Patterns
- All AI operations include fallback mechanisms - check `src/ai/` for patterns
- AI model responses should be validated using `src/utils/schema-validation.js`
- Cache AI responses in KV storage when appropriate to optimize performance
- AI operations have 30-second timeout limits on Cloudflare Workers

### Adding New AI Agents
1. Create agent in `src/ai/` following existing patterns (triage-agent.js, etc.)
2. Register in `src/ai/agent-orchestrator.js`
3. Add unit tests in `tests/unit/`
4. Update integration tests if the agent interacts with others

### Modifying Routing Logic
Primary AI routing logic in `src/ai/intelligent-router.js` uses confidence scoring - maintain threshold checks when modifying.

### Session Sync Development
- Session state is persisted to GitHub via `src/sync/session-sync-manager.js`
- Vector clocks in `src/sync/enhanced-session-sync.js` handle concurrent modifications
- Cross-session synthesis available through `src/synthesis/chittychat-project-synth.js`

## Key API Endpoints

**AI Services**:
- `POST /process` - AI-powered email analysis and routing
- `POST /agents` - Multi-agent task orchestration
- `POST /process/integrated` - Integrated ChittyOS email processing

**Health & Status**:
- `GET /health` - AI Gateway health with model status
- `GET /status` - Comprehensive system status
- `GET /status/ai-models` - AI model configuration and capabilities
- `GET /integration/status` - ChittyOS integration status
- `GET /discovery/status` - Service discovery health

**ChittyOS Integration**:
- `POST /chittychat/*` - ChittyChat integration endpoints
- `POST /pdx/v1/*` - PDX AI DNA portability API
- `POST /integration/service` - Service routing via discovery

**Session Management**:
- `POST /session/init` - Initialize session
- `POST /session/state` - Save state
- `POST /session/atomic-facts` - Sync atomic facts
- `GET /session/status` - Get session status

## Development Environment Setup

### Local Development with Wrangler
```bash
npm run dev  # Starts Wrangler dev server with AI bindings
```

**Important**: Use `npm run dev` for AI-enabled local testing. Mock AI responses available in `tests/mocks/ai-responses.js` for unit testing.

### Testing AI Features
- Run `npm run email:test` to test email routing functionality
- Use `tests/data/test-emails.js` for test email data
- AI model fallback chains are automatically tested in integration tests

### Worker Management
- `node scripts/audit-workers.js` - Audit existing Cloudflare Workers
- `node scripts/cleanup-workers.js` - Clean up unused Workers (dry run by default)
- `node scripts/comprehensive-worker-audit.js` - Full cross-account audit

## Enterprise Features

**Version Management** (when `VERSION_MANAGEMENT="enterprise"`):
- Blue-green deployment strategy
- Automatic rollback capabilities
- Traffic shifting and canary deployment
- Deployment validation and health checks

**Randomness Beacon** (when `RANDOMNESS_BEACON="true"`):
- Cryptographically secure random number generation
- Integration with Cloudflare's randomness beacon service
- Enhanced security for ChittyID generation and cryptographic operations

**Comprehensive Monitoring**:
- System status endpoints with detailed capability reporting
- AI model performance and fallback chain monitoring
- Enterprise deployment readiness validation