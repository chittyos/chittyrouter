/**
 * MCP Gateway Authentication
 * Validates X-ChittyOS-API-Key against MCP_API_KEYS KV namespace.
 * Mirrors ChittyConnect's established auth pattern (mcp-auth.js).
 *
 * @service chittycanon://core/services/chittyrouter
 */

/**
 * Authenticate an inbound MCP request.
 * Returns a Response (401/403) on failure, or null to proceed.
 *
 * When MCP_API_KEYS KV is not bound (development), auth is bypassed.
 *
 * @param {Request} request
 * @param {object} env - Worker environment bindings
 * @returns {Promise<Response|null>}
 */
export async function authenticateMcpRequest(request, env) {
  // If MCP_API_KEYS KV not bound (development), bypass auth
  if (!env.MCP_API_KEYS) {
    return null;
  }

  const apiKey = request.headers.get('X-ChittyOS-API-Key')
    ?? request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'Authentication required',
        message: 'Provide X-ChittyOS-API-Key header or Authorization: Bearer <key>',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const keyJson = await env.MCP_API_KEYS.get(`key:${apiKey}`);

  if (!keyJson) {
    return new Response(
      JSON.stringify({ error: 'Invalid or revoked API key' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let keyData;
  try {
    keyData = JSON.parse(keyJson);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Malformed key data' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (keyData.status !== 'active') {
    return new Response(
      JSON.stringify({ error: `API key is ${keyData.status}` }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
    return new Response(
      JSON.stringify({ error: 'API key expired' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Authenticated — proceed
  return null;
}
