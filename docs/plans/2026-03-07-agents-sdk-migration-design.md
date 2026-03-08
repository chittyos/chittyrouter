# ChittyRouter Agents SDK Migration Design

**Date**: 2026-03-07
**Status**: Approved
**Scope**: Migrate ChittyRouter's AI pipeline to Cloudflare Agents SDK

## Context

ChittyRouter currently uses stateless per-request AI agents coordinated by an `AgentOrchestrator`. The agents lose context between requests, coordination is manual, and there's no real-time visibility into agent activity. The Cloudflare Agents SDK (`@cloudflare/agents`) provides stateful Durable Object agents with built-in SQL storage, WebSocket real-time sync, MCP tool exposure, hibernation, and scheduled tasks — exactly what the AI pipeline needs.

This migration also expands ChittyRouter from email-only to a unified inbound gateway serving 6 organizations: Furnished-Condos, ChittyCounsel, ChittyFoundation, ChittyOS, ChittyApps, and ChicagoApps.

## Strategy: Incremental Migration

Keep `unified-worker.js` as the HTTP entry point. Add Agent classes one at a time as new Durable Object bindings. Migrate in order: TriageAgent first, then downstream agents. Each step is independently deployable and reversible.

## 11-Agent Architecture

### Agent Roster

| # | Agent | DO Binding | Purpose | Key State |
|---|-------|-----------|---------|-----------|
| 1 | **TriageAgent** | `TRIAGE_AGENT` | Classify inbound comms, detect org context | Classification patterns, org routing rules |
| 2 | **PriorityAgent** | `PRIORITY_AGENT` | Score urgency, escalate | Priority rules, thresholds per org |
| 3 | **ResponseAgent** | `RESPONSE_AGENT` | Draft context-aware replies | Template cache, draft history |
| 4 | **DocumentAgent** | `DOCUMENT_AGENT` | Extract structured data from attachments | Extraction cache, document index |
| 5 | **EntityAgent** | `ENTITY_AGENT` | Track lifecycle of any entity (cases, properties, leases, grants, permits, contacts) | Entity graph, lifecycle state, P/L/T/E/A types |
| 6 | **CalendarAgent** | `CALENDAR_AGENT` | Court dates, deadlines, lease renewals, reminders | Schedule DB, escalation rules |
| 7 | **NotificationAgent** | `NOTIFICATION_AGENT` | Deliver alerts across channels (email, Slack, push, SMS) | Delivery log, channel preferences |
| 8 | **FinanceAgent** | `FINANCE_AGENT` | Track transactions, property values, invoicing | Financial timeline, entity ledger |
| 9 | **IntelligenceAgent** | `INTELLIGENCE_AGENT` | Observe patterns, identify gaps, propose improvements, audit trail | Pattern DB, capability map, evolution log |
| 10 | **WebhookIngestionAgent** | `WEBHOOK_AGENT` | Dedup, retry, index inbound webhooks | Processing log, dedup SQL index |
| 11 | **MessagingAgent** | `MESSAGING_AGENT` | iMessage, SMS, chat, WebSocket conversations | Conversation threads, message history |
| 12 | **EvidenceAgent** | `EVIDENCE_AGENT` | Chain of custody, provenance, integrity verification, exhibit management | Custody chain (immutable), exhibit index, sha256 registry |

### Data Flow

```
Inbound:
  Email   -> TriageAgent -> PriorityAgent -> EntityAgent -> ResponseAgent
                                          \-> DocumentAgent (if attachments)
                                          \-> CalendarAgent (if dates detected)
                                          \-> FinanceAgent (if financial data)
                                          \-> EvidenceAgent (if evidentiary material)

  Message -> MessagingAgent -> TriageAgent -> (same pipeline)

  Webhook -> WebhookIngestionAgent -> EntityAgent (if entity-linked)
                                   \-> EvidenceAgent (if evidence-linked)

Outbound:
  ResponseAgent -> NotificationAgent -> Email/Slack/Push/SMS

Evidence:
  DocumentAgent -> EvidenceAgent (stamp with evidence ID, chain of custody)
  EvidenceAgent -> chittyevidence-db (SOT for storage/verification)

Meta:
  All agents -> (tail events) -> IntelligenceAgent -> Evolution proposals
```

### Inter-Agent Communication

Agents discover and call each other via **MCP tool exposure**. Each agent registers its tools in `init()`:

```typescript
class TriageAgent extends Agent {
  async init() {
    this.server.tool({
      name: 'classify_communication',
      description: 'Classify an inbound communication by org, type, and urgency',
      inputSchema: z.object({ content: z.string(), sender: z.string(), channel: z.string() }),
      handler: async (input) => { /* ... */ }
    });
  }
}
```

The `AgentOrchestrator` becomes a thin router: `env.TRIAGE_AGENT.get(id).fetch(request)`.

## Multi-Org Coverage

TriageAgent detects org context from sender domain, content, and metadata:

| Org | Detection signals | Entity types |
|-----|-------------------|-------------|
| Furnished-Condos | @furnished-condos.com, property addresses, tenant names | Properties, Leases, Tenants, Maintenance |
| ChittyCounsel | @chittycounsel.com, case numbers, court references | Cases, Filings, Hearings, Opposing Counsel |
| ChittyFoundation | @chittyfoundation.org, grant refs, governance | Grants, Donations, Board Actions |
| ChittyOS | @chitty.cc, service names, deployment refs | Services, Incidents, Deployments |
| ChittyApps | @chittyapps.com, support tickets, feature refs | Tickets, Feature Requests, Users |
| ChicagoApps | @chicagoapps.com, permit numbers, violation refs | Permits, Inspections, Violations |

Org context flows downstream as metadata on every agent-to-agent call.

## EntityAgent Design (Key Innovation)

EntityAgent replaces the narrow "CaseAgent" with a universal lifecycle tracker using ChittyCanon's P/L/T/E/A entity types:

| Org use case | Entity type | Lifecycle states |
|-------------|-------------|-----------------|
| Legal case | E (Event) | filed -> discovery -> trial -> judgment -> closed |
| Property | L (Location) | acquired -> leased -> vacant -> sold |
| Lease | T (Thing) | drafted -> signed -> active -> expired -> renewed |
| Grant | T (Thing) | applied -> awarded -> active -> reporting -> closed |
| Permit | T (Thing) | applied -> approved -> active -> expired |
| Contact | P (Person) | identified -> verified -> active -> inactive |

Built-in SQL storage tracks entity state, relationships, and history. Agent exposes tools:
- `create_entity`, `update_entity_state`, `link_entities`, `get_entity_timeline`

## EvidenceAgent Design

Coordinates chain-of-custody operations locally, delegates storage and cryptographic verification to `chittyevidence-db` as SOT.

**MCP tools exposed:**
- `collect_evidence(source, metadata)` — ingest evidence, stamp with evidence ID, record provenance
- `verify_integrity(evidence_id)` — re-verify sha256 against stored hash
- `record_custody_event(evidence_id, event)` — append to immutable custody chain
- `get_custody_chain(evidence_id)` — return full chain of custody
- `assign_exhibit(evidence_id, exhibit_number, case_id)` — link evidence to case exhibit
- `search_evidence(query)` — search evidence index by content, date, entity

**State (built-in SQL):**
- `custody_events` — immutable append-only log (evidence_id, actor, action, timestamp, metadata)
- `evidence_index` — evidence_id, sha256, source, captured_at, exhibit_number, entity_links
- `exhibit_map` — case_id, exhibit_number, evidence_id, status

**Integration pattern:**
- DocumentAgent extracts data → calls `collect_evidence()` to stamp and track
- EntityAgent links evidence to cases/properties via `assign_exhibit()`
- Crypto operations (signing, on-chain attestation) call ChittyChain/ChittyMint APIs externally

## WebhookIngestionAgent (Hybrid Pattern)

Not a full AI agent — a stateful coordinator for webhook processing:
- **Dedup**: Built-in SQL tracks `(platform, doc_id, sha256)` to prevent reprocessing
- **Retry**: `scheduleTask()` for failed indexing calls
- **Platform handlers**: Plain functions (notion.js, github.js, stripe.js) called by the agent
- **Real-time feed**: WebSocket broadcasts new webhook events to dashboard

## Migration Order

| Phase | Agent(s) | Estimated effort | Dependencies |
|-------|----------|-----------------|--------------|
| 0 | Add `@cloudflare/agents`, base Agent class | Setup | None |
| 1 | TriageAgent | Port `triage-agent.js` | Phase 0 |
| 2 | PriorityAgent | Port `priority-agent.js` | Phase 1 |
| 3 | DocumentAgent | Port `document-agent.js` | Phase 0 |
| 4 | ResponseAgent | Port `response-agent.js` | Phase 2 |
| 5 | EntityAgent | New (replaces ad-hoc case tracking) | Phase 1 |
| 6 | EvidenceAgent | New (chain of custody, delegates to chittyevidence-db) | Phase 3, 5 |
| 7 | CalendarAgent | New | Phase 5 |
| 8 | FinanceAgent | New | Phase 5 |
| 9 | NotificationAgent | New | Phase 4 |
| 10 | MessagingAgent | New (WebSocket-native) | Phase 1, 9 |
| 11 | WebhookIngestionAgent | Wrap existing webhook handlers | Phase 5, 6 |
| 12 | IntelligenceAgent | New (meta-agent, runs on schedule) | All above |

## Wrangler Bindings (New)

```toml
# Agents SDK Durable Objects
[[durable_objects.bindings]]
name = "TRIAGE_AGENT"
class_name = "TriageAgent"

[[durable_objects.bindings]]
name = "PRIORITY_AGENT"
class_name = "PriorityAgent"

[[durable_objects.bindings]]
name = "RESPONSE_AGENT"
class_name = "ResponseAgent"

[[durable_objects.bindings]]
name = "DOCUMENT_AGENT"
class_name = "DocumentAgent"

[[durable_objects.bindings]]
name = "ENTITY_AGENT"
class_name = "EntityAgent"

[[durable_objects.bindings]]
name = "CALENDAR_AGENT"
class_name = "CalendarAgent"

[[durable_objects.bindings]]
name = "NOTIFICATION_AGENT"
class_name = "NotificationAgent"

[[durable_objects.bindings]]
name = "FINANCE_AGENT"
class_name = "FinanceAgent"

[[durable_objects.bindings]]
name = "INTELLIGENCE_AGENT"
class_name = "IntelligenceAgent"

[[durable_objects.bindings]]
name = "WEBHOOK_AGENT"
class_name = "WebhookIngestionAgent"

[[durable_objects.bindings]]
name = "MESSAGING_AGENT"
class_name = "MessagingAgent"

[[durable_objects.bindings]]
name = "EVIDENCE_AGENT"
class_name = "EvidenceAgent"
```

## File Structure (Target)

```
src/
  agents/
    base-agent.js          # Shared Agent base class with common utilities
    triage-agent.js        # TriageAgent (migrated from ai/triage-agent.js)
    priority-agent.js      # PriorityAgent (migrated from ai/priority-agent.js)
    response-agent.js      # ResponseAgent (migrated from ai/response-agent.js)
    document-agent.js      # DocumentAgent (migrated from ai/document-agent.js)
    entity-agent.js        # EntityAgent (new)
    calendar-agent.js      # CalendarAgent (new)
    notification-agent.js  # NotificationAgent (new)
    finance-agent.js       # FinanceAgent (new)
    intelligence-agent.js  # IntelligenceAgent (new)
    evidence-agent.js      # EvidenceAgent (new, delegates to chittyevidence-db)
    webhook-agent.js       # WebhookIngestionAgent (wraps webhooks/)
    messaging-agent.js     # MessagingAgent (new)
  webhooks/                # Existing platform handlers (unchanged)
    webhook-handler.js
    notion.js
    github.js
    stripe.js
  ai/                      # Legacy (deprecated incrementally)
  ...existing files...
```

## Verification

1. After each phase: `npx wrangler dev` — verify no startup errors
2. Health check includes agent status: `curl router.chitty.cc/health`
3. Agent-specific status: `curl router.chitty.cc/webhook/status`
4. WebSocket dashboard connects and receives real-time updates
5. End-to-end test: send email, verify it flows through Triage -> Priority -> Entity -> Response -> Notification
