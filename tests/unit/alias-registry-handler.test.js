/**
 * Handler-level tests for registry-backed routing consumption in
 * CloudflareEmailHandler (src/email/cloudflare-email-handler.js).
 *
 * No DB mock: these drive the handler's routeEmail/logEmail/resolveAliasOverlay
 * directly with pre-resolved alias decisions (the SHAPE resolveAliasDecision
 * produces — synthetic *.test addresses, no real mailbox PII). This validates:
 *   - case-registry/non-case PRECEDENCE (overlay skipped when address known)
 *   - recipient CASE-NORMALIZATION (mixed-case routes identically to lowercase)
 *   - 'consolidate' override forward via lane env
 *   - 'retire' still forwards to default (no drop)
 *   - 'verify'/'keep' / absent → byte-for-byte today's default forward
 *   - privileged_legal metadataOnly redacts subject/summary in log + receipt
 *   - fail-open: unset override env falls back to default forward
 *
 * NOTE: DEFAULT_FORWARD below is intentionally a non-.test address — it is
 * PINNED to the handler's hardcoded source default (src/email/
 * cloudflare-email-handler.js: `message.forward('nick@aribia.llc')`). It is NOT
 * fixture PII we control; changing it here would diverge the assertion from the
 * real routing behavior under test. (Scrubbing that source default is a
 * separate, repo-wide follow-up — see PR #99 thread replies.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CloudflareEmailHandler } from '../../src/email/cloudflare-email-handler.js';
import { _clearAliasCache } from '../../src/config/alias-registry.js';

beforeEach(() => { _clearAliasCache(); });

// legal@chitty.cc is a non-case route in the handler's addressRoutes. We also
// place it in the fixture as privileged_legal to prove PRECEDENCE: the overlay
// is skipped (no redaction/override applied) for addresses already routed.
const PRECEDENCE_FIXTURE = async () => [
  { address: 'legal@chitty.cc', posture: 'privileged_legal', lane: 3, disposition: 'consolidate', owner_mailbox: 'legal@aribia.test', entity: 'Legal', type: 'group' },
  { address: 'mgmt@aribia.test', posture: 'public_facing', lane: 2, disposition: 'consolidate', owner_mailbox: 'owner@example-jav.test', entity: 'ARIBIA LLC', type: 'alias' },
];

function makeEnv(overrides = {}) {
  return {
    // KV stub — logEmail/sendRoutingConfirmation use AI_CACHE?. optional chaining
    AI_CACHE: {
      _store: new Map(),
      async get(k, type) {
        const v = this._store.get(k);
        return v === undefined ? null : (type === 'json' ? JSON.parse(v) : v);
      },
      async put(k, v) { this._store.set(k, v); },
    },
    ...overrides,
  };
}

function makeMessage() {
  const forwards = [];
  return {
    forwards,
    forward: async (dest) => { forwards.push(dest); },
  };
}

const DEFAULT_FORWARD = 'nick@aribia.llc';

describe('routeEmail: case-registry precedence (overlay never overrides)', () => {
  it('a known non-case address is skipped even with the overlay ENABLED and a matching fixture row', async () => {
    // Overlay enabled + a privileged_legal/consolidate fixture row exists for
    // legal@chitty.cc. PRECEDENCE means it must still be skipped (null) — the
    // case/non-case route wins and no DB-derived decision is applied.
    const handler = new CloudflareEmailHandler(makeEnv({ ALIAS_REGISTRY_ENABLED: 'true', HYPERDRIVE: { connectionString: 'x' } }));
    const decision = await handler.resolveAliasOverlay({ to: 'legal@chitty.cc' }, PRECEDENCE_FIXTURE);
    expect(decision).toBeNull();
  });

  it('an UNKNOWN address IS resolved when enabled (proves the fixture path is live)', async () => {
    // Control for the precedence test: same fixture, but an address NOT in
    // addressRoutes does get a decision — so the null above is precedence, not
    // a dead overlay.
    const handler = new CloudflareEmailHandler(makeEnv({ ALIAS_REGISTRY_ENABLED: 'true', HYPERDRIVE: { connectionString: 'x' } }));
    const decision = await handler.resolveAliasOverlay({ to: 'mgmt@aribia.test' }, PRECEDENCE_FIXTURE);
    expect(decision).not.toBeNull();
    expect(decision.forwardEnv).toBe('FORWARD_LANE2_OPS');
  });

  it('resolveAliasOverlay returns null when overlay disabled (default)', async () => {
    const handler = new CloudflareEmailHandler(makeEnv());
    const decision = await handler.resolveAliasOverlay({ to: 'someone-unknown@chitty.cc' });
    expect(decision).toBeNull(); // ALIAS_REGISTRY_ENABLED unset → off
  });
});

describe('routeEmail: recipient case-normalization', () => {
  // Regression for PR #99 CodeRabbit/codex MAJOR/P2: a mixed-case recipient
  // (e.g. `Legal@Chitty.cc`) must route IDENTICALLY to its lowercase form.
  // Route-table keys are lowercased at construction AND every recipient lookup
  // normalizes — so mixed-case mail can never miss its direct route, bypass the
  // precedence guard, or get a privileged lane misrouted/consolidated.
  it('routeEmail forwards a mixed-case recipient via the same direct route as lowercase', async () => {
    // legal@chitty.cc is a non-case route → forwards to source's nick@aribia.cc.
    const handler = new CloudflareEmailHandler(makeEnv());
    const lower = makeMessage();
    await handler.routeEmail(lower, { to: 'legal@chitty.cc', aliasDecision: null }, {});
    const mixed = makeMessage();
    await handler.routeEmail(mixed, { to: 'Legal@Chitty.cc', aliasDecision: null }, {});
    // Identical forward target, and NOT the catch-all default.
    expect(mixed.forwards).toEqual(lower.forwards);
    expect(mixed.forwards).not.toEqual([DEFAULT_FORWARD]);
  });

  it('resolveAliasOverlay applies precedence to a mixed-case recipient (skips overlay)', async () => {
    // Legal@Chitty.cc is governed by a non-case route → overlay must be SKIPPED
    // (null) even though a matching privileged_legal/consolidate fixture row
    // exists. Without normalization the precedence guard (lowercased key) would
    // miss and the overlay would wrongly fire.
    const handler = new CloudflareEmailHandler(makeEnv({ ALIAS_REGISTRY_ENABLED: 'true', HYPERDRIVE: { connectionString: 'x' } }));
    const decision = await handler.resolveAliasOverlay({ to: 'Legal@Chitty.cc' }, PRECEDENCE_FIXTURE);
    expect(decision).toBeNull();
  });
});

describe('routeEmail: alias overlay consumption', () => {
  let handler;
  beforeEach(() => {
    handler = new CloudflareEmailHandler(makeEnv({ FORWARD_LANE2_OPS: 'ops@aribia.test' }));
  });

  it("'consolidate' forwards to the lane-2 ops destination via env", async () => {
    const message = makeMessage();
    const emailData = {
      to: 'mgmt@aribia.test',
      aliasDecision: { address: 'mgmt@aribia.test', lane: 2, posture: 'public_facing', disposition: 'consolidate', entity: 'ARIBIA LLC', metadataOnly: false, retired: false, forwardEnv: 'FORWARD_LANE2_OPS' },
    };
    await handler.routeEmail(message, emailData, {});
    expect(message.forwards).toEqual(['ops@aribia.test']);
  });

  it("'consolidate' FAILS OPEN to default when the lane env is unset", async () => {
    const h2 = new CloudflareEmailHandler(makeEnv()); // no FORWARD_LANE2_OPS
    const message = makeMessage();
    const emailData = {
      to: 'mgmt@aribia.test',
      aliasDecision: { address: 'mgmt@aribia.test', lane: 2, posture: 'public_facing', disposition: 'consolidate', entity: 'ARIBIA LLC', metadataOnly: false, retired: false, forwardEnv: 'FORWARD_LANE2_OPS' },
    };
    await h2.routeEmail(message, emailData, {});
    expect(message.forwards).toEqual([DEFAULT_FORWARD]);
  });

  it("'retire' still forwards (to default — never drops)", async () => {
    const message = makeMessage();
    const emailData = {
      to: 'aaron@aribia.test',
      aliasDecision: { address: 'aaron@aribia.test', lane: 1, posture: 'personal', disposition: 'retire', entity: 'Furnished-Condos', metadataOnly: false, retired: true, forwardEnv: null },
    };
    await handler.routeEmail(message, emailData, {});
    expect(message.forwards).toEqual([DEFAULT_FORWARD]);
  });

  it('no alias decision (verify/keep/absent) → today\'s default forward unchanged', async () => {
    const message = makeMessage();
    await handler.routeEmail(message, { to: 'addison@aribia.test', aliasDecision: null }, {});
    expect(message.forwards).toEqual([DEFAULT_FORWARD]);
  });

  it('privileged_legal (keep) forwards normally to default', async () => {
    const message = makeMessage();
    const emailData = {
      to: 'legal@aribia.test',
      aliasDecision: { address: 'legal@aribia.test', lane: 3, posture: 'privileged_legal', disposition: 'keep', entity: 'Legal', metadataOnly: true, retired: false, forwardEnv: null },
    };
    await handler.routeEmail(message, emailData, {});
    expect(message.forwards).toEqual([DEFAULT_FORWARD]);
  });
});

describe('logEmail / sendRoutingConfirmation: F-L10 metadata-only redaction', () => {
  it('logEmail redacts subject + summary for privileged_legal', async () => {
    const env = makeEnv();
    const handler = new CloudflareEmailHandler(env);
    const emailData = {
      to: 'legal@aribia.test',
      from: 'opposing-counsel@example-firm.com',
      subject: 'Privileged: settlement strategy memo',
      aliasDecision: { metadataOnly: true },
    };
    const triage = { urgencyLevel: 'HIGH', urgencyScore: 60, summary: 'sensitive legal summary', reasons: ['legal'] };
    await handler.logEmail(emailData, triage);
    const recent = await env.AI_CACHE.get('email_log_recent', 'json');
    expect(recent[0].subject).toBe('[REDACTED — privileged_legal]');
    expect(recent[0].summary).toBe('');
    expect(recent[0].metadataOnly).toBe(true);
  });

  it('logEmail keeps subject for non-privileged mail', async () => {
    const env = makeEnv();
    const handler = new CloudflareEmailHandler(env);
    const emailData = { to: 'mgmt@aribia.test', from: 'guest@example.com', subject: 'Booking question', aliasDecision: null };
    const triage = { urgencyLevel: 'LOW', urgencyScore: 10, summary: 'guest asks about checkout', reasons: [] };
    await handler.logEmail(emailData, triage);
    const recent = await env.AI_CACHE.get('email_log_recent', 'json');
    expect(recent[0].subject).toBe('Booking question');
    expect(recent[0].metadataOnly).toBe(false);
  });

  it('enqueue redacts subject, bodyPreview and summary for privileged_legal', async () => {
    const env = makeEnv();
    const handler = new CloudflareEmailHandler(env);
    const emailData = {
      to: 'legal@aribia.test', from: 'opposing@firm.com', cc: '',
      subject: 'Privileged: deposition prep', date: 'now',
      content: 'Confidential body discussing privileged litigation strategy in detail.',
      attachmentNames: [],
      aliasDecision: { metadataOnly: true },
    };
    const triage = { category: 'legal', urgencyLevel: 'HIGH', caseRelevant: true, entity: null, summary: 'privileged strategy', reasons: ['legal'], aiClassified: false };
    const item = await handler.enqueue(emailData, triage, []);
    // returned item is redacted
    expect(item.email.subject).toBe('[REDACTED — privileged_legal]');
    expect(item.email.bodyPreview).toBe('');
    expect(item.aiClassification.summary).toBe('');
    // persisted store is redacted (no subject/body leak)
    const stored = await env.AI_CACHE.get(`email_queue_${item.id}`, 'json');
    expect(stored.email.bodyPreview).toBe('');
    expect(stored.email.subject).toBe('[REDACTED — privileged_legal]');
    const index = await env.AI_CACHE.get('email_queue_index', 'json');
    expect(index[0].subject).toBe('[REDACTED — privileged_legal]');
    // sanity: the privileged body text never appears anywhere in the store
    const allStored = JSON.stringify(stored) + JSON.stringify(index);
    expect(allStored).not.toContain('privileged litigation strategy');
  });

  it('enqueue keeps subject/body for non-privileged mail (no behavior change)', async () => {
    const env = makeEnv();
    const handler = new CloudflareEmailHandler(env);
    const emailData = {
      to: 'mgmt@aribia.test', from: 'guest@example.com', cc: '',
      subject: 'Checkout time?', date: 'now', content: 'When is checkout?',
      attachmentNames: [], aliasDecision: null,
    };
    const triage = { category: 'property', urgencyLevel: 'LOW', caseRelevant: false, entity: null, summary: 'checkout question', reasons: [], aiClassified: false };
    const item = await handler.enqueue(emailData, triage, []);
    expect(item.email.subject).toBe('Checkout time?');
    expect(item.email.bodyPreview).toBe('When is checkout?');
    expect(item.aiClassification.summary).toBe('checkout question');
  });

  it('sendRoutingConfirmation stores a redacted receipt for privileged_legal', async () => {
    const env = makeEnv();
    const handler = new CloudflareEmailHandler(env);
    // Avoid the live Notion fetch in unit tests.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: async () => '' });
    const emailData = {
      to: 'legal@aribia.test', from: 'x@firm.com',
      subject: 'Privileged matter detail', aliasDecision: { metadataOnly: true },
    };
    const triage = { urgencyLevel: 'HIGH', category: 'legal', caseRelevant: true, entity: null, summary: 'secret', reasons: ['legal'], aiClassified: false, actionNeeded: true };
    await handler.sendRoutingConfirmation(emailData, triage, []);
    const recent = await env.AI_CACHE.get('email_receipts_recent', 'json');
    expect(recent[0].subject).toBe('[REDACTED — privileged_legal]');
    expect(recent[0].classification.summary).toBe('');
    vi.restoreAllMocks();
  });
});
