/**
 * Cost-driven tier-degrade unit tests.
 *
 * These exercise the REAL degrade logic and the REAL HMAC-authenticated
 * endpoint handler — no mocks of the cost-control path. The only fixture is an
 * in-memory KV store that implements the real Cloudflare KV get/put surface the
 * code uses; all crypto (HMAC sign/verify) runs against the real WebCrypto API,
 * and all chain/expiry decisions run against real AIModelConfig methods.
 *
 * The live KV-binding + HMAC path is additionally proven end-to-end via
 * `wrangler dev` + curl (see PR body) — this file locks the pure logic so a
 * regression cannot silently break cost throttling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AIModelConfig } from '../../src/utils/ai-model-config.js';
import { handleTierDegrade } from '../../src/admin/tier-degrade.js';

// Minimal in-memory KV implementing the real CF KV surface the code calls.
function makeKV() {
  const store = new Map();
  return {
    store,
    async get(key) {
      const e = store.get(key);
      if (!e) return null;
      return e.value;
    },
    async put(key, value, opts = {}) {
      store.set(key, { value, opts });
    }
  };
}

const HMAC_KEY = 'comptroller-shared-secret-c0ffee-deadbeef-2026';

// Sign exactly like chittyops comptroller signHmac(): HMAC-SHA256 lowercase hex
// over JSON.stringify(payload). The body sent is that SAME string.
async function signComptroller(secret, payloadObj) {
  const body = JSON.stringify(payloadObj);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { body, hex };
}

function degradeSignal(overrides = {}) {
  return {
    from_tier: 'T2_haiku',
    to_tier: 'T0',
    reason: 'anomaly_detected:test-anomaly-1',
    scope: 'service',
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    ...overrides
  };
}

describe('AIModelConfig cost-degrade chain', () => {
  let cfg;
  beforeEach(() => {
    cfg = new AIModelConfig({});
  });

  it('default chain (no override) starts at the task model, not the cheapest', () => {
    const chain = cfg.getFallbackChain('triage');
    expect(chain[0]).toBe(cfg.models.primary);
    // pricey secondary present in the un-degraded chain
    expect(chain).toContain(cfg.models.secondary);
  });

  it('cost-sorted models are ascending by input cost, cheapest first', () => {
    const sorted = cfg.getCostSortedModels();
    expect(sorted[0]).toBe(cfg.models.legacy); // @cf/.../llama-3.1-8b == cheapest
    for (let i = 1; i < sorted.length; i++) {
      expect(cfg.getModelCost(sorted[i]).input).toBeGreaterThanOrEqual(
        cfg.getModelCost(sorted[i - 1]).input
      );
    }
  });

  it('to_tier=T0 (deepest degrade) yields a single cheapest-model chain', () => {
    const override = { to_tier: 'T0' };
    const chain = cfg.getFallbackChain('triage', override);
    expect(chain[0]).toBe(cfg.models.legacy); // cheapest first
    // the pricey secondary must NOT be reachable on success
    expect(chain).not.toContain(cfg.models.secondary);
  });

  it('shallow degrade (T3_sonnet) keeps more headroom than deep degrade (T0)', () => {
    const shallow = cfg.getFallbackChain('triage', { to_tier: 'T3_sonnet' });
    const deep = cfg.getFallbackChain('triage', { to_tier: 'T0' });
    // Both lead with the cheapest model (cost-first ordering)...
    expect(shallow[0]).toBe(cfg.models.legacy);
    expect(deep[0]).toBe(cfg.models.legacy);
    // ...but a shallower degrade climbs further (longer chain, more fallback
    // headroom toward pricier models), while T0 is the tightest cut.
    expect(shallow.length).toBeGreaterThan(deep.length);
    expect(deep.length).toBe(1); // T0 == only the cheapest model
  });

  it('unknown tier fails safe to the cheapest model', () => {
    const chain = cfg.getFallbackChain('triage', { to_tier: 'WAT_UNKNOWN' });
    expect(chain[0]).toBe(cfg.models.legacy);
  });
});

describe('AIModelConfig.getActiveOverride (KV + expiry)', () => {
  it('returns active override before expiry, null after expiry (read-time check)', async () => {
    const kv = makeKV();
    const cfg = new AIModelConfig({ AI_CACHE: kv });
    const t0 = Date.now();
    const rec = {
      to_tier: 'T0',
      scope: 'service',
      expires_at: new Date(t0 + 1000).toISOString()
    };
    await kv.put('tier_override:chittyrouter', JSON.stringify(rec));

    // active now
    const active = await cfg.getActiveOverride({ AI_CACHE: kv }, t0);
    expect(active).not.toBeNull();
    expect(active.to_tier).toBe('T0');

    // expired 1ms after expires_at — auto-revert
    const afterExpiry = await cfg.getActiveOverride({ AI_CACHE: kv }, t0 + 1001);
    expect(afterExpiry).toBeNull();
  });

  it('service-specific override wins over global', async () => {
    const kv = makeKV();
    const cfg = new AIModelConfig({ AI_CACHE: kv });
    const future = new Date(Date.now() + 3600_000).toISOString();
    await kv.put('tier_override:global', JSON.stringify({ to_tier: 'T3_sonnet', expires_at: future }));
    await kv.put('tier_override:chittyrouter', JSON.stringify({ to_tier: 'T0', expires_at: future }));
    const active = await cfg.getActiveOverride({ AI_CACHE: kv });
    expect(active.to_tier).toBe('T0'); // service wins
  });

  it('falls back to global when no service override', async () => {
    const kv = makeKV();
    const cfg = new AIModelConfig({ AI_CACHE: kv });
    const future = new Date(Date.now() + 3600_000).toISOString();
    await kv.put('tier_override:global', JSON.stringify({ to_tier: 'T1_workspace', expires_at: future }));
    const active = await cfg.getActiveOverride({ AI_CACHE: kv });
    expect(active.to_tier).toBe('T1_workspace');
  });
});

describe('handleTierDegrade endpoint (real HMAC)', () => {
  let env;
  beforeEach(() => {
    env = { COMPTROLLER_HMAC_KEY: HMAC_KEY, AI_CACHE: makeKV() };
  });

  it('rejects a bad signature with 401 and writes nothing', async () => {
    const signal = degradeSignal();
    const req = new Request('https://router.chitty.cc/admin/tier-degrade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Comptroller-Signature': 'deadbeef'.repeat(8) // wrong
      },
      body: JSON.stringify(signal)
    });
    const resp = await handleTierDegrade(req, env);
    expect(resp.status).toBe(401);
    expect(env.AI_CACHE.store.size).toBe(0);
  });

  it('rejects a tampered body (sig valid for different payload) with 401', async () => {
    const signed = await signComptroller(HMAC_KEY, degradeSignal({ to_tier: 'T3_sonnet' }));
    const req = new Request('https://router.chitty.cc/admin/tier-degrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Comptroller-Signature': signed.hex },
      // body differs from what was signed
      body: JSON.stringify(degradeSignal({ to_tier: 'T0' }))
    });
    const resp = await handleTierDegrade(req, env);
    expect(resp.status).toBe(401);
    expect(env.AI_CACHE.store.size).toBe(0);
  });

  it('accepts a valid signal, writes the KV override, returns applied:true', async () => {
    const signal = degradeSignal({ to_tier: 'T0' });
    const signed = await signComptroller(HMAC_KEY, signal);
    const req = new Request('https://router.chitty.cc/admin/tier-degrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Comptroller-Signature': signed.hex },
      body: signed.body
    });
    const resp = await handleTierDegrade(req, env);
    expect(resp.status).toBe(200);
    const out = await resp.json();
    expect(out.applied).toBe(true);
    expect(out.key).toBe('tier_override:chittyrouter');

    const stored = JSON.parse(await env.AI_CACHE.get('tier_override:chittyrouter'));
    expect(stored.to_tier).toBe('T0');
    expect(stored.source).toBe('chittycomptroller-L2');
  });

  it('end-to-end: valid signal degrades the chain, expiry reverts it', async () => {
    // 1. POST signed signal
    const expires = new Date(Date.now() + 2000).toISOString();
    const signal = degradeSignal({ to_tier: 'T0', expires_at: expires });
    const signed = await signComptroller(HMAC_KEY, signal);
    const resp = await handleTierDegrade(
      new Request('https://router.chitty.cc/admin/tier-degrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Comptroller-Signature': signed.hex },
        body: signed.body
      }),
      env
    );
    expect(resp.status).toBe(200);

    // 2. getFallbackChain via the stored override is degraded to cheapest
    const cfg = new AIModelConfig(env);
    const expMs = Date.parse(expires);
    const active = await cfg.getActiveOverride(env, expMs - 1000);
    expect(active).not.toBeNull();
    const degraded = cfg.getFallbackChain('triage', active);
    expect(degraded[0]).toBe(cfg.models.legacy);
    expect(degraded).not.toContain(cfg.models.secondary);

    // 3. after expiry, override is gone → chain reverts to normal
    const afterActive = await cfg.getActiveOverride(env, expMs + 1);
    expect(afterActive).toBeNull();
    const reverted = cfg.getFallbackChain('triage', afterActive);
    expect(reverted[0]).toBe(cfg.models.primary); // back to normal
    expect(reverted).toContain(cfg.models.secondary);
  });

  it('rejects an already-expired signal with 400', async () => {
    const signal = degradeSignal({ expires_at: new Date(Date.now() - 1000).toISOString() });
    const signed = await signComptroller(HMAC_KEY, signal);
    const resp = await handleTierDegrade(
      new Request('https://router.chitty.cc/admin/tier-degrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Comptroller-Signature': signed.hex },
        body: signed.body
      }),
      env
    );
    expect(resp.status).toBe(400);
  });

  it('fails closed (503) when COMPTROLLER_HMAC_KEY is unset', async () => {
    const signal = degradeSignal();
    const signed = await signComptroller(HMAC_KEY, signal);
    const resp = await handleTierDegrade(
      new Request('https://router.chitty.cc/admin/tier-degrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Comptroller-Signature': signed.hex },
        body: signed.body
      }),
      { AI_CACHE: makeKV() } // no key
    );
    expect(resp.status).toBe(503);
  });
});
