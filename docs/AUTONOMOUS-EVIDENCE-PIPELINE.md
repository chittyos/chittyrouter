# Autonomous Evidence Pipeline Design

**Version**: 1.0
**Date**: 2025-10-12
**Mission**: Self-improving evidence discovery, analysis, and organization without human routing

## Problem Statement

Current evidence intake requires manual classification:
```
Human: "This is evidence" → evidence-intake.sh → Manual processing
```

**Failure**: Cannot scale, learn, or adapt. Antithetical to ChittyOS mission of autonomous intelligence.

## Core Principle: Schrödinger's Evidence

**The Reality**: Not everything IS evidence, but anything COULD BE evidence.

- A receipt today might be irrelevant
- That same receipt in 6 months could be critical evidence in an undiscovered case
- A casual email becomes evidence when litigation emerges
- Evidence value is contextual, temporal, and unpredictable

**Therefore**: Treat EVERYTHING as potential evidence with probabilistic scoring, not binary classification.

**Architecture Shift**:
```
Input → "Is this evidence?" (❌ WRONG)
Input → "What's the probability this becomes evidence?" (✅ CORRECT)
      → Store with metadata
      → Reindex periodically as context changes
      → Elevate to evidence when probability threshold crossed
```

## Solution: AI-First Evidence Pipeline

### Architecture

```
ANY Input (email, file, API, webhook)
    ↓
ChittyRouter AI Probabilistic Analysis (Llama 4)
    ├─ Evidence probability? (0.0-1.0 continuous score)
    ├─ What type IF evidence? (document, communication, financial, testimony)
    ├─ Potential cases? (vector similarity to known cases)
    ├─ Temporal relevance? (immediate vs future value)
    ├─ Entity extraction? (PEO, PLACE, PROP regardless of evidence status)
    └─ Preservation priority? (critical/high/medium/low)
    ↓
Universal Ingestion Agent (everything preserved)
    ├─ ALWAYS mint ChittyID (INFO entity for general, EVNT if prob > 0.7)
    ├─ ALWAYS extract entities (PEO, PLACE, PROP, dates, amounts)
    ├─ ALWAYS generate hash + cryptographic proof
    ├─ ALWAYS store in ChittyLedger with probability metadata
    ├─ Queue for blockchain based on probability + priority
    └─ Index in vector database for similarity search
    ↓
Continuous Reindexing Loop
    ├─ Periodic re-evaluation as context changes (new cases, new relationships)
    ├─ Elevate probability when similar items become evidence
    ├─ Link previously-unlinked items when patterns emerge
    ├─ Track probability drift over time
    └─ Learn which low-probability items became critical evidence
```

### Implementation

**1. Evidence Classification Agent** (`src/ai/evidence-agent.js`)

```javascript
export class EvidenceAgent {
  async classifyEvidence(input) {
    // Multi-model AI analysis
    const analysis = await this.ai.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
      messages: [{
        role: 'system',
        content: `You are an evidence classification expert. Analyze if this is legal evidence and extract:
- Evidence type (document/communication/financial/testimony/physical)
- Case relevance (case ID or "unknown")
- Key entities (people, places, properties, dates)
- Relevance score (0-100)
- Suggested actions (ChittyID minting, entity extraction, etc.)`
      }, {
        role: 'user',
        content: this.formatInput(input)
      }]
    });

    return {
      isEvidence: analysis.confidence > 0.7,
      type: analysis.type,
      caseId: analysis.caseId,
      entities: analysis.entities,
      relevance: analysis.relevance,
      actions: analysis.actions
    };
  }

  async processAutonomously(classification) {
    if (!classification.isEvidence) {
      return this.routeToAppropriateService(classification);
    }

    // Autonomous evidence processing
    const chittyId = await this.mintChittyID('EVNT', classification);
    const entities = await this.extractEntities(classification);
    const hash = await this.generateCryptographicProof(classification);

    await this.storeInLedger({
      chittyId,
      entities,
      hash,
      metadata: classification
    });

    await this.queueForBlockchain(chittyId);

    return { success: true, chittyId, autonomous: true };
  }
}
```

**2. Evidence Router Integration** (`src/routing/evidence-router.js`)

```javascript
// Route ALL inputs through evidence classification first
export async function routeWithEvidenceCheck(request, env, ctx) {
  const input = await parseInput(request);

  // AI-powered evidence detection
  const evidenceAgent = new EvidenceAgent(env);
  const classification = await evidenceAgent.classifyEvidence(input);

  if (classification.isEvidence) {
    // Autonomous evidence pipeline
    return evidenceAgent.processAutonomously(classification);
  }

  // Not evidence - route to appropriate service
  return routeToService(classification.suggestedService, request, env, ctx);
}
```

**3. Continuous Learning System**

```javascript
export class EvidenceLearningLoop {
  async recordClassification(input, classification, humanFeedback) {
    // Store for model retraining
    await env.EVIDENCE_TRAINING_DATA.put(
      `training-${Date.now()}`,
      JSON.stringify({
        input,
        classification,
        humanFeedback,
        timestamp: new Date().toISOString()
      })
    );

    // Track accuracy metrics
    await this.updateAccuracyMetrics(classification, humanFeedback);
  }

  async retrainModels() {
    // Quarterly: Fetch training data, retrain models
    const trainingData = await this.fetchTrainingData();
    const improvedModel = await this.finetuneLlama(trainingData);

    // Deploy improved model
    await this.deployModel(improvedModel);
  }
}
```

### Evidence Types & Auto-Actions

| Evidence Type | Auto-Actions |
|---------------|--------------|
| **Email** | Mint ChittyID (EVNT), extract sender/recipient (PEO), parse dates, detect attachments → recursive classification |
| **Document (PDF/DOCX)** | OCR + entity extraction, mint ChittyID (PROP if deed/title, EVNT otherwise), generate hash, extract signatures |
| **Financial (statements/receipts)** | Parse transactions, extract amounts/dates/parties, link to case entities, flag suspicious patterns |
| **Communication (texts/calls)** | Timestamp analysis, participant extraction, sentiment analysis, relationship mapping |
| **Physical Evidence** | Photo hash, metadata extraction (GPS, timestamp), chain of custody initialization |

### Integration Points

**ChittyRouter** (`router.chitty.cc`):
- **Route**: `POST /api/evidence/classify`
- **Route**: `POST /api/evidence/process`
- **Route**: `GET /api/evidence/stats` (accuracy metrics)

**ChittyLedger** (`ledger.chitty.cc`):
- Evidence storage with ChittyID
- Blockchain anchoring queue
- Audit trail with timestamps

**ChittySchema** (`schema.chitty.cc`):
- Entity relationship mapping
- Case-evidence linking
- Cross-reference detection

**ChittyID** (`id.chitty.cc`):
- EVNT minting for evidence
- PEO/PLACE/PROP minting for entities
- Cryptographic verification

### Example: Email Evidence Auto-Processing

```
1. Email arrives: evidence@chitty.cc
   ↓
2. ChittyRouter AI: "This is evidence (97% confidence)"
   ↓
3. Evidence Agent:
   - Detects case: 2024D007847 (Arias v Bianchi)
   - Extracts entities: Nicholas Bianchi (sender), Ale Arias (mentioned)
   - Finds 2 attachments: PDF lease agreement, bank statement
   ↓
4. Autonomous Actions:
   - Mint EVNT-ChittyID for email
   - Recursively classify attachments (2 more EVNT-ChittyIDs)
   - Extract entities: Mint PEO-ChittyIDs if new
   - Link to case in ChittyLedger
   - Queue for blockchain anchoring
   - Generate cryptographic proofs
   ↓
5. Result: 3 ChittyIDs, 2 entities linked, blockchain queued
   - Zero human intervention
   - Full audit trail
   - Continuous learning data captured
```

### Human-in-the-Loop (Optional)

- Low confidence (<70%): Flag for human review
- Contradictions detected: Request human adjudication
- New case detected: Suggest case creation
- Always allow human override with feedback loop

### Metrics & KPIs

- **Classification Accuracy**: Track true positive/negative rates
- **Entity Extraction Precision**: Verify extracted entities match reality
- **Processing Time**: Measure end-to-end pipeline speed
- **Human Intervention Rate**: Target <5% of evidence needs human routing
- **Model Improvement Rate**: Track quarterly accuracy gains

## Migration Plan

### Phase 1: Parallel Processing (Week 1-2)
- Deploy Evidence Agent alongside existing manual intake
- Run both systems, compare results
- Build confidence in AI classification

### Phase 2: AI-First with Human Review (Week 3-4)
- Route all evidence through AI first
- Flag low-confidence for human review
- Capture feedback for retraining

### Phase 3: Fully Autonomous (Week 5+)
- Remove manual routing requirement
- Human intervention only on flags
- Continuous learning loop active

## Success Criteria

- ✅ 95%+ classification accuracy
- ✅ <5% human intervention rate
- ✅ <30s average processing time
- ✅ Zero manual routing steps
- ✅ Quarterly model improvements measurable

## Implementation Checklist

- [ ] Create Evidence Agent (`src/ai/evidence-agent.js`)
- [ ] Integrate with ChittyRouter (`src/routing/evidence-router.js`)
- [ ] Deploy evidence classification endpoints
- [ ] Set up continuous learning KV storage
- [ ] Create retraining pipeline
- [ ] Migrate existing evidence intake to API calls
- [ ] Deploy monitoring dashboard
- [ ] Document API endpoints
- [ ] Train team on override procedures

---

**Mission Alignment**: Evidence discovery, analysis, and organization that grows, evolves, and improves autonomously—without human routing bottlenecks.

**Generated**: 2025-10-12
**ChittyOS Framework**: v1.0.1
