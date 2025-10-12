# Rewind Recovery Checkpoint

**Created**: 2025-10-12
**Purpose**: Restore context after `/compact` rewind

---

## WHERE WE ARE

**Status**: Research complete → Ready to implement blockchain queue consumer

**Problem Solved**:
- BLOCKCHAIN_QUEUE orphaned (sends to void)
- Evidence with priority > 0.7 never reaches blockchain
- Architecture mismatch: queue-based vs API-based

**Architecture Mapped**:
1. ✅ Soft/hard minting system (`src/minting/soft-hard-minting-integration.js`)
2. ✅ Pipeline orchestration (`src/pipeline-system.js`)
3. ✅ Evidence ingestion (`src/litigation/evidence-ingestion-orchestrator.js`)

---

## NEXT ACTION

**Implement**: `src/consumers/blockchain-queue-consumer.js`

**Consumer Logic**:
```javascript
// 1. Read BLOCKCHAIN_QUEUE
const message = await env.BLOCKCHAIN_QUEUE.receive();
// message: {chittyId, priority, timestamp}

// 2. Route to minting service
if (priority === 'critical' || probability > 0.9) {
  await mintingService.processDocument(doc, {forceHard: true});
} else {
  await mintingService.processDocument(doc); // Auto soft/hard
}

// 3. Store in ChittyChain
await storeInChittyChain(env, {
  chittyId,
  blockHash: result.transactionHash || result.documentHash,
  mintType: result.mintType
});
```

**Integration Points**:
- SoftHardMintingService (existing)
- EvidenceIngestionOrchestrator (existing)
- ChittyChain storage API (existing)
- Cloudflare Queues consumer pattern

**Wrangler bindings needed**:
```toml
[[queues.consumers]]
queue = "blockchain-queue"
max_batch_size = 10
max_batch_timeout = 30

[env.production.vars]
LEDGER_API = "https://ledger.chitty.cc"
EVIDENCE_API = "https://evidence.chitty.cc"
```

---

## FILES TO REFERENCE

1. **Minting**: `/Users/nb/.claude/projects/-/CHITTYOS/chittyos-services/chittyrouter/src/minting/soft-hard-minting-integration.js`
2. **Pipeline**: `/Users/nb/.claude/projects/-/CHITTYOS/chittyos-services/chittyrouter/src/pipeline-system.js`
3. **Evidence**: `/Users/nb/.claude/projects/-/CHITTYOS/chittyos-services/chittyrouter/src/litigation/evidence-ingestion-orchestrator.js`
4. **Universal Ingestion**: `/Users/nb/.claude/projects/-/CHITTYOS/chittyos-services/chittyrouter/src/ai/universal-ingestion-agent.js` (line 277 - BLOCKCHAIN_QUEUE.send())

---

## RECOVERY COMMAND

After rewind, tell Claude:

> "Read REWIND-RECOVERY-CHECKPOINT.md and SESSION-SUMMARY.md, then continue with blockchain queue consumer implementation"

---

## CONTEXT PRESERVED

**Bullshit Detector Update**: ✅ Inline-first, ask-for-docs-second pattern
**Token Usage**: ~89K/200K (44%) before rewind
**Background Processes**: 3 bash jobs running (can ignore)

**Key Discovery**: User wants frequent compacts for project/topic synthesis (not just token management)

---

## IMPLEMENTATION READY

All research done. No additional reading needed. Ready to code.
