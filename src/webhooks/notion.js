/**
 * Notion webhook handler — verifies signature, fetches full page data,
 * and indexes to R2 + Neon.
 */
import { verifyHmacSHA256, indexToR2AndNeon, json } from './webhook-handler.js';

export async function handleNotionWebhook(request, env) {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const rawBody = await request.text();

  // Signature verification
  const sigHeader = (
    request.headers.get('X-Notion-Signature') ||
    request.headers.get('Notion-Signature') ||
    ''
  ).trim();

  if (!sigHeader) return json({ error: 'missing_signature' }, 401);
  if (!env.NOTION_WEBHOOK_SECRET) return json({ error: 'server_misconfig' }, 500);

  const ok = await verifyHmacSHA256(env.NOTION_WEBHOOK_SECRET, rawBody, sigHeader);
  if (!ok) return json({ error: 'signature_mismatch' }, 401);

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const pageId = extractNotionPageId(payload);
  if (!pageId) return json({ error: 'no_page_id_in_event' }, 422);

  try {
    const page = await fetchNotionPage(env.NOTION_TOKEN, pageId);
    const blocks = await fetchNotionBlocks(env.NOTION_TOKEN, pageId);

    const document = {
      page_id: pageId,
      captured_at: new Date().toISOString(),
      page,
      blocks,
      raw_event: payload,
    };

    const { r2Path, sha256 } = await indexToR2AndNeon(env, 'notion', pageId, document);
    return json({ ok: true, page_id: pageId, r2_path: r2Path, sha256 });
  } catch (err) {
    console.error('notion webhook error', String(err));
    return json({ error: 'processing_error', detail: String(err) }, 500);
  }
}

function extractNotionPageId(payload) {
  if (!payload) return null;
  if (payload.record?.id) return payload.record.id;
  if (payload.data?.id) return payload.data.id;
  if (payload.page?.id) return payload.page.id;
  for (const k of Object.keys(payload)) {
    if (typeof payload[k] === 'object' && payload[k]?.id) return payload[k].id;
  }
  return null;
}

async function fetchNotionPage(token, pageId) {
  const resp = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      Accept: 'application/json',
    },
  });
  if (!resp.ok) throw new Error('failed_fetch_page: ' + (await resp.text()));
  return resp.json();
}

async function fetchNotionBlocks(token, blockId) {
  let results = [];
  let cursor = null;
  const base = `https://api.notion.com/v1/blocks/${blockId}/children`;

  do {
    const url = cursor
      ? `${base}?page_size=100&start_cursor=${cursor}`
      : `${base}?page_size=100`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        Accept: 'application/json',
      },
    });
    if (!r.ok) throw new Error('failed_fetch_blocks: ' + (await r.text()));
    const data = await r.json();
    results = results.concat(data.results || []);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results;
}
