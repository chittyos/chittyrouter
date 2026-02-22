# ChittyRouter: Four Pillars Architecture

ChittyRouter's core architecture is built upon four fundamental pillars that work in concert to enable secure, verifiable, privacy-preserving message delivery with built-in incentive mechanisms.

## The Four Pillars

### 1. Routing
**Get messages to the right recipient via the right channel**

ChittyRouter orchestrates message delivery across multiple channels (email, SMS, push, in-app) using intelligent routing decisions based on:

- **Recipient preferences**: Preferred contact methods and times
- **Message urgency**: Priority-based channel selection
- **Delivery confirmation requirements**: Channel selection based on verification needs
- **Fallback chains**: Automatic escalation when primary channels fail

```
Message → Channel Selection → Delivery Attempt → Confirmation
                ↓
        [email → sms → push → in-app]
```

### 2. Traceability
**Immutable proof of path and custody chain via ChittyChain**

Every message traversing ChittyRouter generates an immutable audit trail:

- **Custody Chain**: Each handler in the delivery path signs their receipt
- **Timestamp Anchoring**: Cryptographic proof of when events occurred
- **ChittyChain Integration**: Durable proof records anchored to ChittyChain
- **Chain of Custody**: Complete provenance from sender to recipient

```
Sender → Router → Channel → Delivery → Receipt
   ↓         ↓        ↓         ↓         ↓
 [sig]    [sig]    [sig]     [sig]     [sig]
   └─────────────────────────────────────┘
              ChittyChain Proof
```

**Integration Points:**
- chittycert - Certificate issuance for delivery proofs
- chittyverify - Verification of signatures and proofs
- chittychain - Immutable proof anchoring

### 3. Forgetability
**Ephemeral content, durable proofs only (GDPR-compliant)**

ChittyRouter implements privacy-by-design with content ephemerality:

- **Content Separation**: Message content is never stored long-term
- **Proof Persistence**: Only cryptographic proofs (hashes, signatures) are retained
- **TTL Controls**: Configurable time-to-live for all content
- **Right to Erasure**: Content can be forgotten while proofs remain valid

```
┌─────────────────────────────────────┐
│         Message Lifecycle           │
├─────────────────────────────────────┤
│  Content (ephemeral)                │
│  ├─ Body, attachments               │
│  ├─ TTL: configurable (default 30d) │
│  └─ Deleted after delivery + TTL    │
├─────────────────────────────────────┤
│  Proofs (durable)                   │
│  ├─ Content hash (SHA-256)          │
│  ├─ Delivery signatures             │
│  └─ ChittyChain anchors             │
└─────────────────────────────────────┘
```

**GDPR Compliance:**
- Content deletion on request
- Proof of delivery survives content deletion
- No PII in durable records

### 4. Incentivability
**Attribution flows to compensation**

ChittyRouter enables value attribution and compensation across the delivery chain:

- **Delivery Attribution**: Track who delivered what to whom
- **Verification Incentives**: Reward recipients for confirming delivery
- **Network Effects**: Build verified recipient networks
- **ChittyMint Integration**: Token-based compensation flows

```
Delivery Event → Attribution Record → Compensation Trigger
                        ↓
              [sender, router, recipient]
                        ↓
              ChittyMint Settlement
```

**Incentive Models:**
- Pay-per-verified-delivery
- Recipient opt-in rewards (ChittyDLVR)
- Sender priority access
- Network participation rewards

---

## Pillar Interactions

```
        ┌─────────────────────────────────────────┐
        │              ChittyRouter               │
        └─────────────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
    ▼                     ▼                     ▼
┌─────────┐         ┌──────────┐         ┌──────────────┐
│ Routing │ ──────► │Traceability│ ◄───── │ Forgetability│
└─────────┘         └──────────┘         └──────────────┘
    │                     │                     │
    │                     ▼                     │
    │              ┌──────────────┐             │
    └─────────────►│Incentivability│◄───────────┘
                   └──────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │  ChittyMint  │
                   └──────────────┘
```

## ChittyOS Ecosystem Integration

| Pillar | Primary Services |
|--------|------------------|
| Routing | ChittyConnect, ChittyAuth |
| Traceability | ChittyChain, ChittyCert, ChittyVerify |
| Forgetability | ChittyVault (ephemeral), ChittyTrust |
| Incentivability | ChittyMint, ChittyScore |

---

## Implementation Status

- [x] Core routing engine
- [x] Basic traceability (logging)
- [ ] ChittyChain proof anchoring
- [ ] Content TTL and deletion
- [ ] Incentive attribution layer
- [ ] ChittyMint integration

## Related Documents

- [ChittyProof Integration](./CHITTYPROOF.md)
- [ChittyDLVR Specification](./CHITTYDLVR.md)
- [Charter Compliance](../CHARTER.md)
