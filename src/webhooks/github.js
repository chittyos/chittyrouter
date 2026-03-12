/**
 * GitHub webhook handler — stub.
 * Verifies X-Hub-Signature-256 and indexes event to R2 + Neon.
 */
import { verifyHmacSHA256, indexToR2AndNeon, json } from './webhook-handler.js';

/**
 * Process a GitHub webhook payload (no signature verification).
 * Indexes event to R2 + Neon.
 * Called by WebhookIngestionAgent for platform delegation.
 *
 * @param {object} env - Worker env bindings
 * @param {object} payload - Parsed webhook payload
 * @param {{ event_type?: string, event_id?: string }} meta - Event metadata
 * @returns {Promise<{ ok: boolean, event?: string, delivery_id?: string, r2_path?: string, sha256?: string }>}
 */
export async function processGithubWebhook(env, payload, meta = {}) {
  const event = meta.event_type || payload.action || 'unknown';
  const deliveryId = meta.event_id || payload.delivery_id || crypto.randomUUID();

  const document = {
    delivery_id: deliveryId,
    event,
    captured_at: new Date().toISOString(),
    payload,
  };

  const { r2Path, sha256 } = await indexToR2AndNeon(env, 'github', deliveryId, document);
  return { ok: true, event, delivery_id: deliveryId, r2_path: r2Path, sha256 };
}

export async function handleGithubWebhook(request, env) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const rawBody = await request.text();
  const sigHeader = (request.headers.get('X-Hub-Signature-256') || '').trim();

  if (!sigHeader) return json({ error: 'missing_signature' }, 401);
  if (!env.GITHUB_WEBHOOK_SECRET) return json({ error: 'server_misconfig' }, 500);

  const ok = await verifyHmacSHA256(env.GITHUB_WEBHOOK_SECRET, rawBody, sigHeader);
  if (!ok) return json({ error: 'signature_mismatch' }, 401);

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const event = request.headers.get('X-GitHub-Event') || 'unknown';
  const deliveryId = request.headers.get('X-GitHub-Delivery') || crypto.randomUUID();

  try {
    const document = {
      delivery_id: deliveryId,
      event,
      captured_at: new Date().toISOString(),
      payload,
    };

    const { r2Path, sha256 } = await indexToR2AndNeon(env, 'github', deliveryId, document);
    return json({ ok: true, event, delivery_id: deliveryId, r2_path: r2Path, sha256 });
  } catch (err) {
    console.error('github webhook error', String(err));
    return json({ error: 'processing_error' }, 500);
  }
}
