/**
 * Pre-triage privilege gate (F-L10) tests.
 *
 * Two layers:
 *   1. Unit tests for the pure detection module (src/config/privilege-gate.js):
 *      address extraction, sender-domain allowlist, recipient-lane signals,
 *      fail-CLOSED on error, Neon-independence.
 *   2. End-to-end handler tests (src/email/cloudflare-email-handler.js
 *      handleEmail): privileged mail makes NO AI model call, writes NOTHING to
 *      R2, but STILL forwards + logs metadata-only; non-privileged mail still
 *      hits AI + R2.
 *
 * No DB mock and no fake PII: fixtures use real ChittyOS-shaped addresses
 * (case alias arias-v-bianchi@chitty.cc; the canonical privileged firm domains
 * are passed via env, exactly as deploy will set PRIVILEGED_SENDER_DOMAINS).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isPrivileged,
  extractAddress,
  extractAddresses,
  privilegedSenderDomains,
} from '../../src/config/privilege-gate.js';
import { CloudflareEmailHandler } from '../../src/email/cloudflare-email-handler.js';

// The privileged firm domains are DEPLOY-SET (never committed). Tests pass them
// the same way ops will — via env. These are the canonical three from
// studio-flows/aribia-daily-inbox-triage.json.
const PRIV_DOMAINS = 'ksnlaw.com,bertonring.com,vanguardadvocates.com';

describe('privilege-gate: address extraction', () => {
  it('extracts bare address', () => {
    expect(extractAddress('jane.doe@ksnlaw.com')).toBe('jane.doe@ksnlaw.com');
  });
  it('extracts address from display-name angle-bracket form', () => {
    expect(extractAddress('Jane Doe <Jane.Doe@KSNLAW.com>')).toBe('jane.doe@ksnlaw.com');
  });
  it('extracts the first address from a comma-separated list', () => {
    expect(extractAddress('a@ksnlaw.com, b@chitty.cc')).toBe('a@ksnlaw.com');
  });
  it('extractAddresses returns all recipients, lowercased', () => {
    expect(extractAddresses('Legal <legal@chitty.cc>, arias-v-bianchi@CHITTY.cc'))
      .toEqual(['legal@chitty.cc', 'arias-v-bianchi@chitty.cc']);
  });
  it('returns empty for junk', () => {
    expect(extractAddress('not-an-email')).toBe('');
    expect(extractAddresses('')).toEqual([]);
  });
});

describe('privilege-gate: sender-domain allowlist parsing', () => {
  it('parses comma-sep domains, tolerates @ and whitespace', () => {
    const set = privilegedSenderDomains({ PRIVILEGED_SENDER_DOMAINS: ' @ksnlaw.com , bertonring.com ,' });
    expect(set.has('ksnlaw.com')).toBe(true);
    expect(set.has('bertonring.com')).toBe(true);
    expect(set.size).toBe(2);
  });
  it('empty/unset → empty set', () => {
    expect(privilegedSenderDomains({}).size).toBe(0);
    expect(privilegedSenderDomains({ PRIVILEGED_SENDER_DOMAINS: '' }).size).toBe(0);
  });
});

describe('privilege-gate: isPrivileged (fail-closed static detection)', () => {
  const env = { PRIVILEGED_SENDER_DOMAINS: PRIV_DOMAINS };

  it('privileged SENDER domain → privileged (display-name form)', () => {
    expect(isPrivileged('Atty <atty@ksnlaw.com>', 'nick@aribia.llc', env)).toBe(true);
  });

  it('case-alias RECIPIENT → privileged (legal attribution, no registry needed)', () => {
    expect(isPrivileged('someone@example.com', 'arias-v-bianchi@chitty.cc', env)).toBe(true);
  });

  it('lane-3 / privileged_legal alias decision RECIPIENT → privileged (additive signal)', () => {
    const decision = { address: 'legal@aribia.llc', metadataOnly: true };
    expect(isPrivileged('someone@example.com', 'Legal <legal@aribia.llc>', env, decision)).toBe(true);
  });

  it('non-privileged sender + non-privileged recipient → NOT privileged', () => {
    expect(isPrivileged('guest@example.com', 'mgmt@aribia.llc', env)).toBe(false);
  });

  it('NEON-INDEPENDENT: static sender-domain match fires with NO alias decision (registry down)', () => {
    // aliasDecision === null simulates the registry being unavailable. The
    // static sender-domain signal must still gate.
    expect(isPrivileged('atty@bertonring.com', 'mgmt@aribia.llc', env, null)).toBe(true);
  });

  it('FAIL-CLOSED: detection error is treated as privileged', () => {
    // Force an internal throw: a `from` whose .match access explodes. We pass an
    // object with a throwing toString-ish path via a getter-bearing fake.
    const boom = { /* not a string → extractAddress returns '' safely */ };
    // Instead, force the error path by making env.PRIVILEGED_SENDER_DOMAINS a
    // throwing getter so privilegedSenderDomains() throws inside the try.
    const hostileEnv = {};
    Object.defineProperty(hostileEnv, 'PRIVILEGED_SENDER_DOMAINS', {
      get() { throw new Error('env access blew up'); },
    });
    expect(isPrivileged('guest@example.com', 'mgmt@aribia.llc', hostileEnv)).toBe(true);
    expect(isPrivileged(boom, 'x', { PRIVILEGED_SENDER_DOMAINS: PRIV_DOMAINS })).toBe(false);
  });
});

// ===== End-to-end handler gate behavior =====

/** Build a real raw MIME message (with a PDF attachment) the handler can parse. */
function makeRawMessage({ from, to, subject, body }) {
  const boundary = 'BOUND123';
  const raw =
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `Message-ID: <test-${Math.random().toString(36).slice(2)}@chitty.cc>\r\n` +
    `Date: Thu, 12 Jun 2026 10:00:00 +0000\r\n` +
    `Content-Type: multipart/mixed; boundary="${boundary}"\r\n` +
    `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/pdf\r\n` +
    `Content-Disposition: attachment; filename="exhibit.pdf"\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    // "PRIVILEGED-PDF-BYTES" base64 — non-trivial so it passes the size filter
    `UFJJVklMRUdFRC1QREYtQllURVMtUFJJVklMRUdFRC1QREYtQllURVMtUFJJVklMRUdFRC1QREYtQllURVM=\r\n` +
    `--${boundary}--\r\n`;
  const bytes = new TextEncoder().encode(raw);
  const forwards = [];
  return {
    forwards,
    from,
    to,
    rawSize: bytes.length,
    headers: new Map([
      ['subject', subject],
      ['message-id', `<test@chitty.cc>`],
      ['date', 'Thu, 12 Jun 2026 10:00:00 +0000'],
    ]),
    // Map.get matches the handler's message.headers.get(...) usage.
    raw: new ReadableStream({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    }),
    forward: async (dest) => { forwards.push(dest); },
  };
}

/** env with spies on AI + R2 + KV; ALIAS overlay OFF (proves Neon-independence). */
function makeGateEnv(overrides = {}) {
  const aiRun = vi.fn(async () => ({ response: '{"category":"legal","urgency":"HIGH","case_relevant":true}' }));
  const r2Put = vi.fn(async () => {});
  return {
    env: {
      AI: { run: aiRun },
      DOCUMENT_STORAGE: { put: r2Put },
      AI_CACHE: {
        _store: new Map(),
        async get(k, type) {
          const v = this._store.get(k);
          return v === undefined ? null : (type === 'json' ? JSON.parse(v) : v);
        },
        async put(k, v) { this._store.set(k, v); },
      },
      // routing mode 'auto' so logEmail runs (exercises the metadata-only sink)
      ...overrides,
    },
    aiRun,
    r2Put,
  };
}

async function setAutoMode(env) {
  await env.AI_CACHE.put('email_routing_mode', 'auto');
}

describe('handleEmail: pre-triage privilege GATE (F-L10 end-to-end)', () => {
  it('privileged SENDER domain → NO AI call, NO R2 write, STILL forwarded', async () => {
    const { env, aiRun, r2Put } = makeGateEnv({ PRIVILEGED_SENDER_DOMAINS: PRIV_DOMAINS });
    await setAutoMode(env);
    const handler = new CloudflareEmailHandler(env);
    const message = makeRawMessage({
      from: 'Counsel <counsel@ksnlaw.com>',
      to: 'nick@aribia.llc',
      subject: 'Re: settlement posture',
      body: 'CONFIDENTIAL attorney-client privileged body content here.',
    });

    const res = await handler.handleEmail(message, env, {});

    expect(aiRun).not.toHaveBeenCalled();         // body never sent to llama
    expect(r2Put).not.toHaveBeenCalled();          // attachment never written to R2
    expect(message.forwards.length).toBe(1);       // still forwarded (transit gateway)
    expect(res.success).toBe(true);
    expect(res.attachmentsStored).toBe(0);

    // metadata-only: privileged body/subject NOT in any KV sink
    const dump = JSON.stringify([...env.AI_CACHE._store.entries()]);
    expect(dump).not.toContain('attorney-client privileged body');
    expect(dump).not.toContain('settlement posture');
    expect(dump).toContain('[REDACTED — privileged_legal]');
  });

  it('privileged RECIPIENT (case alias) → NO AI call, NO R2 write, STILL forwarded', async () => {
    const { env, aiRun, r2Put } = makeGateEnv({ PRIVILEGED_SENDER_DOMAINS: PRIV_DOMAINS });
    await setAutoMode(env);
    const handler = new CloudflareEmailHandler(env);
    const message = makeRawMessage({
      from: 'opposing@some-firm.example',
      to: 'arias-v-bianchi@chitty.cc',
      subject: 'Discovery responses attached',
      body: 'Privileged discovery work product body.',
    });

    await handler.handleEmail(message, env, {});

    expect(aiRun).not.toHaveBeenCalled();
    expect(r2Put).not.toHaveBeenCalled();
    expect(message.forwards.length).toBe(1);
    const dump = JSON.stringify([...env.AI_CACHE._store.entries()]);
    expect(dump).not.toContain('discovery work product');
  });

  it('NON-privileged mail → AI IS called and R2 IS written (unchanged behavior)', async () => {
    const { env, aiRun, r2Put } = makeGateEnv({ PRIVILEGED_SENDER_DOMAINS: PRIV_DOMAINS });
    await setAutoMode(env);
    const handler = new CloudflareEmailHandler(env);
    const message = makeRawMessage({
      from: 'guest@example.com',
      to: 'nick@aribia.llc',
      subject: 'Question about my booking',
      body: 'Hi, what time is checkout on Friday?',
    });

    const res = await handler.handleEmail(message, env, {});

    expect(aiRun).toHaveBeenCalledTimes(1);        // body DID go to AI
    expect(r2Put).toHaveBeenCalledTimes(1);        // attachment DID hit R2
    expect(message.forwards.length).toBe(1);
    expect(res.attachmentsStored).toBe(1);
  });

  it('REGISTRY DOWN: static sender-domain gating still fires (no overlay needed)', async () => {
    // No ALIAS_REGISTRY_ENABLED, no HYPERDRIVE binding → aliasDecision is null
    // (registry effectively unavailable). The static sender-domain signal must
    // still gate privileged mail away from AI/R2.
    const { env, aiRun, r2Put } = makeGateEnv({ PRIVILEGED_SENDER_DOMAINS: PRIV_DOMAINS });
    await setAutoMode(env);
    const handler = new CloudflareEmailHandler(env);
    const message = makeRawMessage({
      from: 'paralegal@vanguardadvocates.com',
      to: 'nick@aribia.llc',
      subject: 'Filed motion copy',
      body: 'Privileged litigation body.',
    });

    await handler.handleEmail(message, env, {});

    expect(aiRun).not.toHaveBeenCalled();
    expect(r2Put).not.toHaveBeenCalled();
    expect(message.forwards.length).toBe(1);
  });
});
