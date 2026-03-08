---
uri: chittycanon://docs/ops/architecture/chittyrouter-badge
namespace: chittycanon://docs/ops
type: architecture
version: 2.1.0
status: CERTIFIED
registered_with: chittycanon://core/services/canon
title: "ChittyRouter Service Badge"
certifier: chittycanon://core/services/chittycertify
visibility: PUBLIC
---

# ChittyRouter

> `chittycanon://core/services/chittyrouter` | Tier 2 (Platform) | router.chitty.cc

## What It Does

AI Gateway for ChittyOS. Routes requests to Workers AI models, handles MCP protocol, syncs sessions to GitHub, processes chitty.cc email, ingests external webhooks, and orchestrates 12 stateful Agents SDK agents — all from one Worker.

## How It Works

```
router.chitty.cc ──→ Unified Worker
    │
    ├── /health             → health check + AI model status
    ├── /process            → AI-powered email analysis
    ├── /agents/triage/*    → email classification (Agents SDK DO)
    ├── /agents/priority/*  → urgency scoring (Agents SDK DO)
    ├── /agents/response/*  → automated response drafts (Agents SDK DO)
    ├── /agents/document/*  → attachment analysis (Agents SDK DO)
    ├── /agents/entity/*    → P/L/T/E/A lifecycle (Agents SDK DO)
    ├── /agents/evidence/*  → chain of custody (Agents SDK DO)
    ├── /agents/calendar/*  → deadlines & scheduling (Agents SDK DO)
    ├── /agents/finance/*   → transactions & ledger (Agents SDK DO)
    ├── /agents/notification/* → multi-channel alerts (Agents SDK DO)
    ├── /agents/intelligence/* → pattern analysis (Agents SDK DO)
    ├── /agents/webhook/*   → webhook dedup & retry (Agents SDK DO)
    ├── /agents/messaging/* → WebSocket conversations (Agents SDK DO)
    ├── /agents/status      → aggregate agent health
    ├── /webhook/*          → external webhook ingestion
    ├── /session/*          → GitHub session sync (via ChittyConnect)
    ├── email()             → chitty.cc email processing
    └── scheduled()         → cron jobs (cache, metrics, DLQ, inbox)
```

## AI Models

5 models available via Workers AI binding:

| Model | Use |
|-------|-----|
| llama-4-scout-17b | Primary — general AI + multimodal |
| gpt-oss-120b | Secondary — reasoning fallback |
| llama-3.2-11b-vision | Vision — document/image analysis |
| whisper | Audio — transcription |
| gemma-3-12b-it | Reasoning — complex tasks |

## Agents SDK (12 Stateful Agents)

All agents extend `ChittyRouterBaseAgent` (from `agents` npm package), use SQLite-backed Durable Objects, and expose HTTP endpoints via `/agents/<name>/*`.

| Agent | Purpose | Key Endpoints |
|-------|---------|---------------|
| TriageAgent | Email classification and categorization | `/classify`, `/stats` |
| PriorityAgent | Urgency assessment and scoring | `/score`, `/stats` |
| ResponseAgent | Automated response generation | `/draft`, `/validate` |
| DocumentAgent | Attachment analysis and intelligence | `/analyze`, `/stats` |
| EntityAgent | P/L/T/E/A entity lifecycle tracking | `/create`, `/search` |
| EvidenceAgent | Chain of custody, integrity verification | `/ingest`, `/verify`, `/seal` |
| CalendarAgent | Deadlines, court dates, lease renewals | `/create`, `/upcoming`, `/urgent` |
| FinanceAgent | Transactions, invoicing, ledger | `/transaction`, `/invoice`, `/summary` |
| NotificationAgent | Multi-channel delivery (email/slack/sms) | `/send`, `/broadcast` |
| IntelligenceAgent | Pattern observation, gap detection | `/observe`, `/analyze`, `/recommend` |
| WebhookIngestionAgent | Webhook dedup, retry, R2 indexing | `/ingest`, `/retry` |
| MessagingAgent | WebSocket-native conversations | `/conversation`, `/message` |

Serves 6 orgs: Furnished-Condos, ChittyCounsel, ChittyFoundation, ChittyOS, ChittyApps, ChicagoApps.

## Session Sync

Sessions sync to `chittychat-sessions` repo on GitHub via ChittyConnect's GitHubClientProxy. No direct GitHub token storage — credentials route through `connect.chitty.cc`.

## Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| AI | Workers AI | Multi-model inference |
| AI_CACHE | KV | Response caching |
| AI_STATE_DO | Durable Object | Conversation state (legacy) |
| SYNC_STATE | Durable Object | Sync state (legacy) |
| DOCUMENT_STORAGE | R2 | Document attachments (prod) |
| WEBHOOK_STORAGE | R2 | Webhook payload snapshots |
| *_AGENT (x12) | Durable Object (SQLite) | Agents SDK stateful agents |

## Cron Schedule

Every 15m: inbox monitoring. Every 30m: DLQ. Every 2h: session reconcile. Every 6h: cache cleanup. Daily: metrics.
