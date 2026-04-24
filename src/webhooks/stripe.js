/**
 * Stripe webhook handler — stub.
 * Verifies Stripe-Signature (t=...,v1=...) and indexes event to R2 + Neon.
 */
import { indexToR2AndNeon, json } from './webhook-handler.js';

/**
 * Process a Stripe webhook payload (no signature verification).
 * Indexes event to R2 + Neon.
 * Called by WebhookIngestionAgent for platform delegation.
 *
 * @param {object} env - Worker env bindings
 * @param {object} payload - Parsed webhook payload
 * @param {{ event_id?: string }} meta - Event metadata
 * @returns {Promise<{ ok: boolean, event_id?: string, type?: string, r2_path?: string, sha256?: string }>}
 */
export async function processStripeWebhook(env, payload, meta = {}) {
  const eventId = meta.event_id || payload.id || crypto.randomUUID();

  const document = {
    event_id: eventId,
    type: payload.type || 'unknown',
    captured_at: new Date().toISOString(),
    payload,
  };

  const { r2Path, sha256 } = await indexToR2AndNeon(env, 'stripe', eventId, document);
  return { ok: true, event_id: eventId, type: payload.type, r2_path: r2Path, sha256 };
}

export async function handleStripeWebhook(request, env) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const rawBody = await request.text();
  const sigHeader = (request.headers.get('Stripe-Signature') || '').trim();

  if (!sigHeader) return json({ error: 'missing_signature' }, 401);
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'server_misconfig' }, 500);

  const ok = await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, rawBody, sigHeader);
  if (!ok) return json({ error: 'signature_mismatch' }, 401);

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const eventId = payload.id || crypto.randomUUID();

  try {
    const document = {
      event_id: eventId,
      type: payload.type || 'unknown',
      captured_at: new Date().toISOString(),
      payload,
    };

    const { r2Path, sha256 } = await indexToR2AndNeon(env, 'stripe', eventId, document);
    return json({ ok: true, event_id: eventId, type: payload.type, r2_path: r2Path, sha256 });
  } catch (err) {
    console.error('stripe webhook error', String(err));
    return json({ error: 'processing_error' }, 500);
  }
}

/**
 * Stripe uses `t=timestamp,v1=signature` format.
 * Signed payload = `${timestamp}.${rawBody}`
 */
async function verifyStripeSignature(secret, rawBody, sigHeader) {
  const parts = sigHeader.split(',').map((p) => {
    const [k, ...v] = p.split('=');
    return [k, v.join('=')];
  });

  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const v1Signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || v1Signatures.length === 0) return false;

  const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (isNaN(timestampAge) || timestampAge > 300 || timestampAge < -300) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const computedHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const compBuf = enc.encode(computedHex);
  for (const expectedSig of v1Signatures) {
    const expBuf = enc.encode(expectedSig);
    if (compBuf.byteLength !== expBuf.byteLength) continue;
    const isEqual = typeof crypto.subtle.timingSafeEqual === 'function'
      ? crypto.subtle.timingSafeEqual(compBuf, expBuf)
      : (() => { let d = 0; for (let i = 0; i < compBuf.byteLength; i++) d |= compBuf[i] ^ expBuf[i]; return d === 0; })();
    if (isEqual) {
      return true;
    }
  }
  return false;
}
