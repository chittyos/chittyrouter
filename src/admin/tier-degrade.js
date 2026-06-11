/**
 * Cost-driven tier-degrade endpoint.
 *
 * Closes the ChittyComptroller cost-throttle loop: Comptroller's L2 monitor
 * POSTs a signed DegradeSignal to this service's `tier_degrade_endpoint`
 * (advertised in the chittyregistry record). On a valid signal we persist a
 * cost-degrade override in KV; ChittyRouter's AIModelConfig.getActiveOverride
 * reads it and starts the model fallback chain at a cheaper tier until it
 * expires.
 *
 * Signature contract (must match chittyops/services/comptroller/worker.ts
 * signHmac + emitL2Signal):
 *   - header:    X-Comptroller-Signature
 *   - algorithm: HMAC-SHA256, lowercase hex
 *   - signed bytes: the EXACT request body string (Comptroller signs
 *     JSON.stringify(signal) and sends that same string as the body)
 *   - shared secret: COMPTROLLER_HMAC_KEY (same value on both workers)
 *
 * DegradeSignal body shape:
 *   { from_tier, to_tier, reason, scope, expires_at }   // expires_at ISO-8601
 */

import { verifyHmacSHA256 } from '../webhooks/webhook-handler.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Handle POST /admin/tier-degrade.
 *
 * @param {Request} request
 * @param {object} env - Worker env (needs COMPTROLLER_HMAC_KEY + AI_CACHE)
 */
export async function handleTierDegrade(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const secret = env.COMPTROLLER_HMAC_KEY;
  if (!secret) {
    // Fail closed — never accept an unverifiable cost-control signal.
    return json({ error: 'comptroller_hmac_key_not_configured' }, 503);
  }

  const sigHeader = request.headers.get('X-Comptroller-Signature');
  if (!sigHeader) {
    return json({ error: 'missing_signature' }, 401);
  }

  // Read the raw body ONCE — HMAC is over the exact bytes Comptroller signed.
  // Do not JSON.parse-then-re-stringify before verifying (key reordering would
  // break the signature).
  const rawBody = await request.text();

  const valid = await verifyHmacSHA256(secret, rawBody, sigHeader);
  if (!valid) {
    return json({ error: 'invalid_signature' }, 401);
  }

  let signal;
  try {
    signal = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { to_tier, from_tier, reason, scope, expires_at } = signal;
  if (!to_tier || !expires_at) {
    return json({ error: 'missing_fields', required: ['to_tier', 'expires_at'] }, 400);
  }

  const expMs = Date.parse(expires_at);
  if (!Number.isFinite(expMs)) {
    return json({ error: 'invalid_expires_at' }, 400);
  }
  if (expMs <= Date.now()) {
    return json({ error: 'already_expired', expires_at }, 400);
  }

  if (!env.AI_CACHE) {
    return json({ error: 'kv_unavailable' }, 503);
  }

  // scope "service" → chittyrouter-specific override; anything else → global.
  const kvKey = scope === 'service'
    ? 'tier_override:chittyrouter'
    : 'tier_override:global';

  const record = {
    to_tier,
    from_tier: from_tier ?? null,
    reason: reason ?? null,
    scope: scope ?? 'global',
    expires_at,
    received_at: new Date().toISOString(),
    source: 'chittycomptroller-L2'
  };

  // Self-cleaning KV via expirationTtl (read-time expiry is still authoritative).
  const ttlSeconds = Math.max(60, Math.ceil((expMs - Date.now()) / 1000));
  await env.AI_CACHE.put(kvKey, JSON.stringify(record), { expirationTtl: ttlSeconds });

  // Structured record for chittytrack tail consumer.
  console.log(JSON.stringify({
    kind: 'tier_degrade_applied',
    key: kvKey,
    to_tier,
    from_tier: from_tier ?? null,
    expires_at,
    ts: new Date().toISOString()
  }));

  return json({
    applied: true,
    key: kvKey,
    to_tier,
    expires_at,
    ttl_seconds: ttlSeconds
  });
}

export default handleTierDegrade;
