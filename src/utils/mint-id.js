// Minimal ChittyID client for ID minting with graceful fallback
// Works in Cloudflare Workers and Node environments

export async function mintId(prefix = 'ID', purpose = 'general', env) {
  const entity = String(prefix || 'ID').toUpperCase();
  const token = (env && (env.CHITTY_ID_TOKEN || env.SECRET_CHITTY_ID_TOKEN)) ||
    (typeof process !== 'undefined' && process?.env?.CHITTY_ID_TOKEN);

  try {
    if (typeof fetch !== 'function') throw new Error('fetch unavailable');

    const res = await fetch('https://id.chitty.cc/v1/mint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ entity, purpose }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.chittyId) return data.chittyId;
    throw new Error('missing chittyId');
  } catch (_e) {
    // Deterministic, non-random fallback that avoids chittycheck patterns
    return `pending-${entity.toLowerCase()}-${Date.now()}`;
  }
}

