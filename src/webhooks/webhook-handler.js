/**
 * Base webhook handler — shared HMAC verification, R2 storage, and Neon indexing.
 * Platform-specific handlers import these utilities.
 */

export async function verifyHmacSHA256(secret, rawBody, sigHeader) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const bytes = new Uint8Array(sigBuf);
  const computedHex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const computedBase64 = btoa(String.fromCharCode(...bytes));

  const header = sigHeader.trim();
  if (header === computedHex) return true;
  if (header === computedBase64) return true;
  if (header.startsWith('sha256=') && header.slice(7) === computedHex) return true;
  return false;
}

export async function hashSha256Hex(data) {
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Write a document to R2 and POST metadata to the indexing service.
 *
 * @param {object} env - Worker env bindings
 * @param {string} platform - e.g. "notion", "github", "stripe"
 * @param {string} docId - unique document identifier
 * @param {object} document - the full document to store
 * @returns {{ r2Path: string, sha256: string }}
 */
export async function indexToR2AndNeon(env, platform, docId, document) {
  const json = JSON.stringify(document, null, 2);
  const key = `webhook-index/${platform}/${docId}.json`;

  await env.WEBHOOK_STORAGE.put(key, json, {
    httpMetadata: { contentType: 'application/json' },
  });

  const r2Path = `r2://notion-webhook/${key}`;
  const sha256 = await hashSha256Hex(new TextEncoder().encode(json));

  if (env.WEBHOOK_INDEX_URL) {
    try {
      const resp = await fetch(env.WEBHOOK_INDEX_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(env.INGEST_SERVICE_TOKEN
            ? { authorization: `Bearer ${env.INGEST_SERVICE_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          platform,
          doc_id: docId,
          r2_path: r2Path,
          sha256,
          captured_at: new Date().toISOString(),
        }),
      });
      if (!resp.ok) {
        console.error(`webhook index failed [${platform}/${docId}]`, resp.status, await resp.text());
      }
    } catch (err) {
      console.error(`webhook index error [${platform}/${docId}]`, String(err));
    }
  }

  return { r2Path, sha256 };
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
