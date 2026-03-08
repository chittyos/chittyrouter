---
uri: chittycanon://docs/ops/policy/chittyrouter-charter
namespace: chittycanon://docs/ops
type: policy
version: 2.1.0
status: CERTIFIED
registered_with: chittycanon://core/services/canon
title: "ChittyRouter Charter"
certifier: chittycanon://core/services/chittycertify
visibility: PUBLIC
---

# ChittyRouter Charter

## Classification
- **Tier**: 2 (Core Infrastructure)
- **Organization**: CHITTYOS
- **Domain**: router.chitty.cc

## Mission

ChittyRouter is an **AI-powered intelligent inbound gateway** (AI Gateway v2.1.0-ai) for the ChittyOS legal platform. It handles all inbound data flows — email and external webhooks — using multiple AI agents to analyze, classify, route, and respond to communications automatically, replacing traditional rule-based routing with AI-first decision making.

## Scope

### IS Responsible For
- AI-powered email ingestion and analysis
- Multi-agent email processing orchestration
- Intelligent email classification and routing
- Automated response generation for legal communications
- Document and attachment analysis
- Priority assessment and urgency scoring
- External webhook ingestion and signature verification (Notion, GitHub, Stripe)
- Webhook payload indexing to R2 + Neon
- Session state management (GitHub-based persistence)
- Cross-session synthesis for projects and topics
- Service routing via dynamic service discovery
- Enterprise version management (blue-green, canary deployments)
- Cloudflare randomness beacon integration

### IS NOT Responsible For
- Identity generation (ChittyID)
- Token provisioning (ChittyAuth)
- Service registration (ChittyRegister)
- Evidence storage (ChittyLedger)
- Case management (ChittyCases)

## AI-Powered Pipeline

```
Email Ingestion → AI Analysis → Multi-Agent Processing → Intelligent Routing → State Persistence → ChittyOS Integration
```

### Agents SDK (12 Stateful Durable Object Agents)
| Agent | Purpose |
|-------|---------|
| TriageAgent | Email classification and categorization |
| PriorityAgent | Urgency assessment and priority scoring |
| ResponseAgent | Automated response generation |
| DocumentAgent | Attachment analysis and document intelligence |
| EntityAgent | P/L/T/E/A entity lifecycle tracking |
| EvidenceAgent | Chain of custody, integrity verification |
| CalendarAgent | Deadlines, court dates, lease renewals |
| FinanceAgent | Transaction tracking, invoicing, ledger |
| NotificationAgent | Multi-channel delivery (email/slack/sms) |
| IntelligenceAgent | Pattern observation, gap detection, recommendations |
| WebhookIngestionAgent | Webhook dedup, retry, R2 indexing |
| MessagingAgent | WebSocket-native conversations |

### AI Models (Cloudflare AI)
- `@cf/meta/llama-4-scout-17b-16e-instruct` - Primary multimodal
- `@cf/openai/gpt-oss-120b` - Secondary/reasoning
- `@cf/meta/llama-3.2-11b-vision-instruct` - Vision/document analysis
- `@cf/google/gemma-3-12b-it` - Advanced reasoning
- `@cf/openai/whisper` - Audio/voice processing

## Dependencies

| Type | Service | Purpose |
|------|---------|---------|
| Upstream | ChittyAuth | Token validation |
| Peer | ChittyRegistry | Service discovery |
| Peer | ChittyConnect | Integration hub |
| Peer | ChittyChronicle | Event logging |
| External | Cloudflare AI | Model inference |
| External | Cloudflare Email Workers | Inbound email |
| Storage | Durable Objects | AI state, sync state |
| Storage | KV | Response caching |
| Storage | R2 | Document storage |

## API Contract

**Base URL**: https://router.chitty.cc

### AI Services
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/process` | POST | AI-powered email analysis |
| `/agents` | POST | Multi-agent task orchestration |
| `/process/integrated` | POST | Integrated ChittyOS processing |

### Health & Status
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | AI Gateway health with model status |
| `/api/v1/status` | GET | Service metadata (version, tier, agents, models) |
| `/status` | GET | Comprehensive system status |
| `/status/ai-models` | GET | AI model configuration |
| `/integration/status` | GET | ChittyOS integration status |
| `/discovery/status` | GET | Service discovery health |

### Agents SDK
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/agents/triage/*` | POST/GET | Email classification |
| `/agents/priority/*` | POST/GET | Priority scoring |
| `/agents/response/*` | POST/GET | Response drafting |
| `/agents/document/*` | POST/GET | Document analysis |
| `/agents/entity/*` | POST/GET | Entity lifecycle (P/L/T/E/A) |
| `/agents/evidence/*` | POST/GET | Evidence chain of custody |
| `/agents/calendar/*` | POST/GET | Calendar and deadlines |
| `/agents/finance/*` | POST/GET | Transactions and ledger |
| `/agents/notification/*` | POST/GET | Notification delivery |
| `/agents/intelligence/*` | POST/GET | Intelligence analysis |
| `/agents/webhook/*` | POST/GET | Webhook ingestion |
| `/agents/messaging/*` | POST/GET/WS | Messaging and conversations |
| `/agents/status` | GET | Aggregate agent status |

### Webhook Ingestion
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webhook/notion` | POST | Notion webhook receiver (HMAC-SHA256 verified) |
| `/webhook/github` | POST | GitHub webhook receiver (X-Hub-Signature-256 verified) |
| `/webhook/stripe` | POST | Stripe webhook receiver (Stripe-Signature verified) |
| `/webhook/status` | GET | Webhook handler configuration status |

### Session Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/session/init` | POST | Initialize session |
| `/session/state` | POST | Save state |
| `/session/atomic-facts` | POST | Sync atomic facts |
| `/session/status` | GET | Session status |

## Required Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `AI` | Cloudflare AI | Model access |
| `AI_CACHE` | KV | Response caching |
| `DOCUMENT_STORAGE` | R2 | Attachments |
| `WEBHOOK_STORAGE` | R2 | Webhook payload snapshots |
| `AI_STATE_DO` | Durable Object | AI processing state (legacy) |
| `SYNC_STATE` | Durable Object | Sync state (legacy) |
| `*_AGENT` (x12) | Durable Object (SQLite) | Agents SDK stateful agents |

## Enterprise Features

- **Version Management**: Blue-green deployment, automatic rollback
- **Randomness Beacon**: Cryptographically secure RNG for ChittyID
- **Traffic Shifting**: Canary deployment and validation

## Ownership

| Role | Owner |
|------|-------|
| Service Owner | ChittyOS |
| Technical Lead | @chittyos-infrastructure |
| Security Contact | security@chitty.cc |

## Three Aspects (TY VY RY)

Source: `chittycanon://gov/governance#three-aspects`

| Aspect | Abbrev | Question | ChittyRouter Answer |
|--------|--------|----------|--------------------|
| **Identity** | TY | What IS it? | AI-powered email routing gateway — uses multiple AI agents to analyze, classify, route, and respond to legal communications automatically |
| **Connectivity** | VY | How does it ACT? | Cloudflare Email Workers → AI analysis pipeline (Triage, Priority, Response, Document agents) → intelligent routing → Durable Objects state; session sync via GitHub persistence; service discovery for cross-platform routing |
| **Authority** | RY | Where does it SIT? | Tier 2 Platform — routing decisions are authoritative for email processing; delegates identity to ChittyID, evidence storage to ChittyLedger, case management to ChittyCases |

## Document Triad

This charter is part of a synchronized documentation triad. Changes to shared fields must propagate.

| Field | Canonical Source | Also In |
|-------|-----------------|---------|
| Canonical URI | CHARTER.md (Classification) | CHITTY.md (blockquote) |
| Tier | CHARTER.md (Classification) | CHITTY.md (blockquote) |
| Domain | CHARTER.md (Classification) | CHITTY.md (blockquote), CLAUDE.md (header) |
| Endpoints | CHARTER.md (API Contract) | CHITTY.md (Endpoints table), CLAUDE.md (API section) |
| Dependencies | CHARTER.md (Dependencies) | CHITTY.md (Dependencies table), CLAUDE.md (Architecture) |
| Certification badge | CHITTY.md (Certification) | CHARTER.md frontmatter `status` |

**Related docs**: [CHITTY.md](CHITTY.md) (badge/one-pager) | [CLAUDE.md](CLAUDE.md) (developer guide)

## Compliance

- [x] Service registered in ChittyRegistry
- [x] Health endpoint operational at /health
- [x] CLAUDE.md development guide present
- [x] AI models configured and accessible
- [x] Durable Objects configured (2 legacy + 12 Agents SDK)
- [x] Session sync operational
- [x] Agents SDK migration complete (12 stateful agents)
- [x] Webhook ingestion operational (Notion, GitHub, Stripe)
- [x] `[[tail_consumers]]` configured for ChittyTrack

---
*Charter Version: 2.1.0 | Last Updated: 2026-03-07*
