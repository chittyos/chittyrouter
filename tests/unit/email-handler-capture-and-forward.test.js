/**
 * CFDXN-197 Tier 1 — raw capture before classification, env-resolved default
 * forward, and the court-sender urgency floor (src/email/cloudflare-email-handler.js).
 *
 * Background: unrouted mail (including Tyler eFileIL "Courtesy Copy of Service"
 * notices for 2024D007847) fell through to `message.forward('<literal>')`. The
 * literal was not a verified Email Routing destination, the forward was
 * rejected inside the catch path, and the only trace was a KV queue preview.
 * These tests pin the three fixes:
 *   1. non-privileged mail is written to R2 (raw/<date>/<id>.eml) BEFORE the AI
 *      model runs; privileged mail is never written to R2 (F-L10 preserved)
 *   2. the default forward is env.FORWARD_DEFAULT — no source literal; when it
 *      is unset or the forward is rejected, an unforwarded marker is recorded
 *      instead of a silent drop
 *   3. court / e-service senders floor urgency at CRITICAL + caseRelevant
 *
 * Synthetic *.test addresses only; no real mailbox PII.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudflareEmailHandler } from '../../src/email/cloudflare-email-handler.js';
import { _clearAliasCache } from '../../src/config/alias-registry.js';

beforeEach(() => {
  _clearAliasCache();
  // sendRoutingConfirmation posts to Notion — never hit the network in unit tests.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, text: async () => '' });
});
afterEach(() => { vi.restoreAllMocks(); });

function makeKv() {
  return {
    _store: new Map(),
    async get(k, type) {
      const v = this._store.get(k);
      return v === undefined ? null : (type === 'json' ? JSON.parse(v) : v);
    },
    async put(k, v) { this._store.set(k, v); },
  };
}

function makeR2(sequence) {
  return {
    _objects: new Map(),
    async put(key, data, opts) {
      sequence?.push(`r2:${key}`);
      this._objects.set(key, { data, opts });
    },
    async get(key) { return this._objects.get(key) ?? null; },
    async delete(key) { this._objects.delete(key); },
  };
}

function makeAi(sequence, classification) {
  return {
    run: vi.fn(async () => {
      sequence?.push('ai:run');
      return { response: JSON.stringify(classification) };
    }),
  };
}

const INFO_CLASSIFICATION = {
  category: 'ops', urgency: 'INFO', reasons: ['model-said-so'],
  case_relevant: false, entity: 'chittyos', action_needed: false, summary: 'noise',
};

function rawStream(text) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
}

function makeMessage({ from, to, subject, body = 'body text', messageId = `<${Date.now()}@test>`, forwardImpl } = {}) {
  const headers = new Map([
    ['subject', subject],
    ['message-id', messageId],
    ['date', 'Tue, 13 Oct 2026 16:33:00 +0000'],
  ]);
  const raw = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMessage-ID: ${messageId}\r\n\r\n${body}`;
  const forwards = [];
  return {
    from, to, forwards, rawText: raw,
    headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null },
    raw: rawStream(raw),
    forward: forwardImpl ?? (async (dest) => { forwards.push(dest); }),
  };
}

function makeEnv(overrides = {}) {
  return {
    AI_CACHE: makeKv(),
    FORWARD_DEFAULT: 'default@aribia.test',
    ...overrides,
  };
}

const COURT_FROM = 'no-reply@mail.efilingmail.tylertech.cloud';
const COURT_SUBJECT = 'Courtesy Copy of Service for Case: 2024D007847 — Amended Notice Filed, Envelope 40440434';

describe('handleEmail: raw capture before classification', () => {
  it('writes the raw .eml to R2 BEFORE the AI model runs, records rawKey on the queue item, and forwards to FORWARD_DEFAULT', async () => {
    const sequence = [];
    const env = makeEnv({ DOCUMENT_STORAGE: makeR2(sequence), AI: makeAi(sequence, INFO_CLASSIFICATION) });
    const handler = new CloudflareEmailHandler(env);
    const message = makeMessage({ from: COURT_FROM, to: '20261701274@chitty.test', subject: COURT_SUBJECT });

    const result = await handler.handleEmail(message, env, {});

    expect(result.success).toBe(true);
    // Order: raw archive first, model second.
    const rawIdx = sequence.findIndex(s => s.startsWith('r2:raw/'));
    const aiIdx = sequence.indexOf('ai:run');
    expect(rawIdx).toBeGreaterThanOrEqual(0);
    expect(aiIdx).toBeGreaterThan(rawIdx);

    // Byte-for-byte archive with sha256 + rfc822 content type.
    const rawKey = sequence[rawIdx].slice('r2:'.length);
    const obj = env.DOCUMENT_STORAGE._objects.get(rawKey);
    expect(new TextDecoder().decode(obj.data)).toBe(message.rawText);
    expect(obj.opts.httpMetadata.contentType).toBe('message/rfc822');
    expect(obj.opts.customMetadata.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(obj.opts.customMetadata.emailMessageId).toBe(message.headers.get('message-id'));

    // Queue item carries the raw key so the review UI / recovery can find it.
    const stored = await env.AI_CACHE.get(`email_queue_${result.queueId}`, 'json');
    expect(stored.rawKey).toBe(rawKey);

    // No route for this recipient → env-resolved default, never a literal.
    expect(message.forwards).toEqual(['default@aribia.test']);
  });

  it('does NOT write privileged mail to R2 (F-L10) but still forwards it', async () => {
    const sequence = [];
    const env = makeEnv({
      DOCUMENT_STORAGE: makeR2(sequence),
      AI: makeAi(sequence, INFO_CLASSIFICATION),
      PRIVILEGED_SENDER_DOMAINS: 'firm.test',
    });
    const handler = new CloudflareEmailHandler(env);
    const message = makeMessage({ from: 'counsel@firm.test', to: 'someone@chitty.test', subject: 'Privileged strategy', body: 'privileged body' });

    const result = await handler.handleEmail(message, env, {});

    expect(result.success).toBe(true);
    expect(sequence.some(s => s.startsWith('r2:'))).toBe(false);
    expect(env.AI.run).not.toHaveBeenCalled();
    const stored = await env.AI_CACHE.get(`email_queue_${result.queueId}`, 'json');
    expect(stored.rawKey).toBeNull();
    expect(message.forwards).toEqual(['default@aribia.test']);
  });

  it('archiveRawMessage fails open when the R2 binding is absent', async () => {
    const handler = new CloudflareEmailHandler(makeEnv());
    const res = await handler.archiveRawMessage(new TextEncoder().encode('x'), { id: 'a' });
    expect(res).toBeNull();
  });
});

describe('court-sender urgency floor', () => {
  it('floors a model INFO classification to CRITICAL / legal / caseRelevant for an e-service sender', async () => {
    const sequence = [];
    const env = makeEnv({ DOCUMENT_STORAGE: makeR2(sequence), AI: makeAi(sequence, INFO_CLASSIFICATION) });
    const handler = new CloudflareEmailHandler(env);
    const message = makeMessage({ from: COURT_FROM, to: '20261701274@chitty.test', subject: COURT_SUBJECT });

    const result = await handler.handleEmail(message, env, {});
    expect(result.urgencyLevel).toBe('CRITICAL');
    const stored = await env.AI_CACHE.get(`email_queue_${result.queueId}`, 'json');
    expect(stored.aiClassification.urgency).toBe('CRITICAL');
    expect(stored.aiClassification.caseRelevant).toBe(true);
    expect(stored.aiClassification.category).toBe('legal');
    expect(stored.aiClassification.reasons).toContain('court_sender_floor');
  });

  it('applies to the clerk domain (suffix match) and to env-extended domains; leaves other senders untouched', () => {
    const handler = new CloudflareEmailHandler(makeEnv({ COURT_SENDER_DOMAINS: ' @courts.example.test ,' }));
    const low = { urgencyLevel: 'LOW', urgencyScore: 10, category: 'ops', reasons: [], caseRelevant: false };

    expect(handler.applyCourtSenderFloor({ from: 'Clerk <ccc.domrel@cookcountyil.gov>' }, low).urgencyLevel).toBe('CRITICAL');
    expect(handler.applyCourtSenderFloor({ from: 'x@sub.courts.example.test' }, low).urgencyLevel).toBe('CRITICAL');
    expect(handler.applyCourtSenderFloor({ from: 'x@notcookcountyil.gov' }, low)).toBe(low);
    expect(handler.applyCourtSenderFloor({ from: 'billing@github.test' }, low)).toBe(low);
    expect(handler.applyCourtSenderFloor({ from: '' }, low)).toBe(low);
  });

  it('keeps an existing case category and never lowers an already-CRITICAL score', () => {
    const handler = new CloudflareEmailHandler(makeEnv());
    const out = handler.applyCourtSenderFloor({ from: COURT_FROM }, { urgencyLevel: 'CRITICAL', urgencyScore: 95, category: 'case', reasons: ['court'] });
    expect(out.category).toBe('case');
    expect(out.urgencyScore).toBe(95);
    expect(out.reasons).toEqual(['court', 'court_sender_floor']);
  });
});

describe('default forward is env-resolved and never silent', () => {
  it('routeEmail forwards unrouted mail to FORWARD_DEFAULT', async () => {
    const handler = new CloudflareEmailHandler(makeEnv({ FORWARD_DEFAULT: ' catchall@aribia.test ' }));
    const message = makeMessage({ from: 'a@b.test', to: 'unknown@chitty.test', subject: 's' });
    await handler.routeEmail(message, { id: '<m1@test>', to: 'unknown@chitty.test', aliasDecision: null }, {});
    expect(message.forwards).toEqual(['catchall@aribia.test']);
  });

  it('with FORWARD_DEFAULT unset: no forward, an unforwarded marker is recorded (metadata only, with rawKey)', async () => {
    const env = makeEnv({ FORWARD_DEFAULT: '' });
    const handler = new CloudflareEmailHandler(env);
    const message = makeMessage({ from: 'a@b.test', to: 'unknown@chitty.test', subject: 'Important' });
    const emailData = { id: '<m2@test>', from: 'a@b.test', to: 'unknown@chitty.test', subject: 'Important', aliasDecision: null, rawArchive: { key: 'raw/2026-10-22/m2test.eml' } };

    await handler.routeEmail(message, emailData, {});

    expect(message.forwards).toEqual([]);
    const index = await env.AI_CACHE.get('email_unforwarded_index', 'json');
    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({ id: '<m2@test>', reason: 'no_route_match:no_default', rawKey: 'raw/2026-10-22/m2test.eml', subject: 'Important' });
    const single = await env.AI_CACHE.get('email_unforwarded_<m2@test>', 'json');
    expect(single.reason).toBe('no_route_match:no_default');
  });

  it('when Email Routing rejects the forward (unverified destination): swallowed, marker records forward_failed', async () => {
    const env = makeEnv();
    const handler = new CloudflareEmailHandler(env);
    const message = makeMessage({ from: 'a@b.test', to: 'unknown@chitty.test', subject: 's', forwardImpl: async () => { throw new Error('destination address not verified'); } });

    const ok = await handler.forwardToDefault(message, { id: '<m3@test>', from: 'a@b.test', to: 'unknown@chitty.test', subject: 's' }, 'no_route_match');

    expect(ok).toBe(false);
    const index = await env.AI_CACHE.get('email_unforwarded_index', 'json');
    expect(index[0].reason).toBe('no_route_match:forward_failed:destination address not verified');
  });

  it('privileged mail gets a redacted subject in the unforwarded marker', async () => {
    const env = makeEnv({ FORWARD_DEFAULT: '' });
    const handler = new CloudflareEmailHandler(env);
    await handler.recordUnforwarded({ id: '<m4@test>', from: 'c@firm.test', to: 'x@chitty.test', subject: 'Settlement strategy', privileged: true }, 'test');
    const index = await env.AI_CACHE.get('email_unforwarded_index', 'json');
    expect(index[0].subject).toBe('[REDACTED — privileged_legal]');
    expect(JSON.stringify(index)).not.toContain('Settlement strategy');
  });

  it('handler-error path forwards via FORWARD_DEFAULT (no literal) and never throws', async () => {
    const env = makeEnv();
    const handler = new CloudflareEmailHandler(env);
    // A message whose raw stream throws forces the outer catch path.
    const message = makeMessage({ from: 'a@b.test', to: 'unknown@chitty.test', subject: 's' });
    message.raw = new ReadableStream({ start(c) { c.error(new Error('stream broke')); } });

    const result = await handler.handleEmail(message, env, {});

    expect(result.success).toBe(false);
    expect(message.forwards).toEqual(['default@aribia.test']);
  });

  it('the handler source contains no literal forward destination', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../src/email/cloudflare-email-handler.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/message\.forward\(\s*['"][^'"]+@[^'"]+['"]\s*\)/);
  });
});
