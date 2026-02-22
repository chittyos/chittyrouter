# ChittyRouter

> `chittycanon://core/services/chittyrouter` | Tier 2 (Platform) | router.chitty.cc

## What It Does

AI Gateway for ChittyOS. Routes requests to Workers AI models, handles MCP protocol, syncs sessions to GitHub, processes chitty.cc email, and runs scheduled maintenance — all from one Worker.

## How It Works

```
router.chitty.cc ──→ Unified Worker
    │
    ├── /health        → health check + AI model status
    ├── /process       → AI-powered email analysis
    ├── /agents        → multi-agent orchestration
    ├── /session/*     → GitHub session sync (via ChittyConnect)
    ├── email()        → chitty.cc email processing
    └── scheduled()    → cron jobs (cache, metrics, DLQ, inbox)
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

## Specialized Agents

| Agent | Purpose |
|-------|---------|
| Triage | Email classification and categorization |
| Priority | Urgency assessment and scoring |
| Response | Automated response generation |
| Document | Attachment analysis and intelligence |

## Session Sync

Sessions sync to `chittychat-sessions` repo on GitHub via ChittyConnect's GitHubClientProxy. No direct GitHub token storage — credentials route through `connect.chitty.cc`.

## Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| AI | Workers AI | Multi-model inference |
| AI_CACHE | KV | Response caching |
| AI_STATE_DO | Durable Object | Conversation state |
| SYNC_STATE | Durable Object | Sync state |
| DOCUMENT_STORAGE | R2 | Document attachments (prod) |

## Cron Schedule

Every 15m: inbox monitoring. Every 30m: DLQ. Every 2h: session reconcile. Every 6h: cache cleanup. Daily: metrics.
