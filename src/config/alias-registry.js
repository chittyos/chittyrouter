/**
 * Alias registry — registry-backed routing overlay for ChittyRouter.
 *
 * This module is a STRICTLY ADDITIVE overlay on top of the canonical
 * case-registry (src/config/case-registry.js). It consults the Neon table
 * `chittyops.alias_registry` (72 rows; address PK) to drive lane/posture/
 * disposition-aware routing for addresses that are NOT already governed by
 * the case-registry or the handler's non-case routes.
 *
 * DESIGN PRINCIPLES (this is the live, CERTIFIED legal-mail path):
 *
 *   1. FAIL-OPEN. Every fetch is wrapped in try/catch + timeout. Any failure
 *      (DB down, timeout, absent address, malformed row, kill-switch off)
 *      degrades to `null`, and the caller falls back to EXACTLY today's
 *      behavior (case-registry / default forward). A DB outage must NEVER
 *      drop or misroute mail.
 *
 *   2. CASE-REGISTRY PRECEDENCE. The caller only consults this overlay for
 *      addresses absent from `addressRoutes` (case + non-case). Legal
 *      attribution always wins; this overlay never overrides a case route.
 *
 *   3. PII POLICY. This module returns a `forwardEnv` NAME (never a raw
 *      address), mirroring case-registry. The handler resolves the env var
 *      at routing time. No destination addresses live in this file.
 *
 *   4. KILL-SWITCH. `env.ALIAS_REGISTRY_ENABLED` must be the string 'true'
 *      to activate. Any other value (unset, 'false', etc.) disables the
 *      overlay entirely — safe default is OFF.
 *
 * @typedef {1|2|3|4} Lane
 * @typedef {'public_facing'|'privileged_legal'|'admin'|'personal'|'internal'} Posture
 * @typedef {'keep'|'consolidate'|'retire'|'verify'} Disposition
 *
 * @typedef {Object} AliasRow
 * @property {string} address
 * @property {Posture} posture
 * @property {Lane} lane
 * @property {Disposition} disposition
 * @property {string} owner_mailbox
 * @property {string} entity
 * @property {string} type
 *
 * @typedef {Object} AliasDecision
 * @property {string} address            - matched alias_registry address (lowercased)
 * @property {Lane} lane
 * @property {Posture} posture
 * @property {Disposition} disposition
 * @property {string} entity
 * @property {boolean} metadataOnly      - F-L10: true for privileged_legal — do NOT log subject/body
 * @property {boolean} retired           - disposition === 'retire' (forward anyway, log as retired)
 * @property {string|null} forwardEnv    - env var NAME for override destination, or null to keep default
 */

import { Client } from '@neondatabase/serverless';

/** Per-isolate cache. Survives across requests within the same isolate. */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 1500; // fail-open if Neon doesn't answer fast

/**
 * @type {{ at: number, byAddress: Record<string, AliasRow> } | null}
 */
let _cache = null;

/**
 * lane → env var NAME holding the override forward destination. Resolved by
 * the caller against env (PII never lives here). Only lane 2 is exercised by
 * current dispositions (consolidate); 1/3/4 are forward-looking.
 * @type {Readonly<Record<number, string>>}
 */
export const LANE_FORWARD_ENV = Object.freeze({
  1: 'FORWARD_LANE1_PERSONAL',
  2: 'FORWARD_LANE2_OPS',
  3: 'FORWARD_LANE3_LEGAL',
  4: 'FORWARD_LANE4_ADMIN',
});

const VALID_LANES = new Set([1, 2, 3, 4]);
const VALID_DISPOSITIONS = new Set(['keep', 'consolidate', 'retire', 'verify']);

/** True iff the overlay is enabled via the kill-switch (safe default: OFF). */
export function isAliasRegistryEnabled(env) {
  return env?.ALIAS_REGISTRY_ENABLED === 'true';
}

/** For tests: drop the per-isolate cache. */
export function _clearAliasCache() {
  _cache = null;
}

/**
 * Default query function: connect to Neon via the worker's HYPERDRIVE
 * binding and pull the alias_registry rows. Mirrors src/database.js's
 * `@neondatabase/serverless` Client(connectionString) pattern and reuses the
 * SAME binding name (`env.HYPERDRIVE`) the worker already uses for Neon.
 *
 * NOTE: the worker must bind a Hyperdrive resource named `HYPERDRIVE` pointing
 * at Neon project restless-grass-40598426 / db neondb. That binding is a DEPLOY
 * PREREQUISITE (not committed to wrangler.jsonc — no Hyperdrive resource id
 * available). Absent the binding, this throws and the caller fails open.
 *
 * @param {any} env
 * @returns {Promise<AliasRow[]>}
 */
async function defaultQueryFn(env) {
  const connectionString = env?.HYPERDRIVE?.connectionString;
  if (!connectionString) {
    throw new Error('HYPERDRIVE binding is not configured');
  }
  const client = new Client(connectionString);
  try {
    await client.connect();
    const result = await client.query(
      `SELECT address, posture, lane, disposition, owner_mailbox, entity, type
         FROM chittyops.alias_registry`,
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

/**
 * Race a promise against a timeout. On timeout the promise is abandoned
 * (its result is ignored) and we reject so the caller fails open.
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`alias_registry fetch timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Load the address→row map, using the per-isolate TTL cache. Returns null on
 * ANY failure (caller must fail open). Never throws.
 *
 * @param {any} env
 * @param {(env:any)=>Promise<AliasRow[]>} [queryFn] - injectable for tests
 * @returns {Promise<Record<string, AliasRow> | null>}
 */
export async function loadAliasRegistry(env, queryFn = defaultQueryFn) {
  if (!isAliasRegistryEnabled(env)) return null;

  const now = Date.now();
  if (_cache && now - _cache.at < CACHE_TTL_MS) {
    return _cache.byAddress;
  }

  try {
    const rows = await withTimeout(Promise.resolve(queryFn(env)), FETCH_TIMEOUT_MS);
    if (!Array.isArray(rows)) throw new Error('alias_registry query returned non-array');

    const byAddress = Object.create(null);
    for (const row of rows) {
      if (!row || typeof row.address !== 'string') continue;
      // Coerce/validate the routing-critical fields; skip malformed rows
      // rather than risk misrouting on garbage.
      const lane = Number(row.lane);
      if (!VALID_LANES.has(lane)) continue;
      if (!VALID_DISPOSITIONS.has(row.disposition)) continue;
      byAddress[row.address.toLowerCase()] = {
        address: row.address.toLowerCase(),
        posture: row.posture,
        lane,
        disposition: row.disposition,
        owner_mailbox: row.owner_mailbox,
        entity: row.entity,
        type: row.type,
      };
    }

    _cache = { at: now, byAddress };
    return byAddress;
  } catch (err) {
    // FAIL-OPEN: log and degrade to null. Keep a stale cache if we have one
    // (better to serve slightly-old routing than to fall back to default for
    // every email during a transient DB blip).
    console.error('[alias-registry] fetch failed, failing open:', err?.message ?? err);
    if (_cache) return _cache.byAddress;
    return null;
  }
}

/**
 * Resolve a single recipient address into an AliasDecision, or null if the
 * overlay does not apply (disabled, DB failure, address absent, or the row's
 * disposition is keep/verify — which must be a NO-OP vs today).
 *
 * Routing semantics:
 *   - 'consolidate'      → override forward to the lane's env destination.
 *   - 'keep' / 'verify'  → null (preserve current behavior; verify is a no-op).
 *   - 'retire'           → null forwardEnv (keep default forward — don't drop),
 *                          but flagged `retired: true` so the caller logs it.
 *   - posture 'privileged_legal' → metadataOnly=true (F-L10): forward normally,
 *                          but the caller must NOT log subject/body.
 *
 * @param {string} address
 * @param {any} env
 * @param {(env:any)=>Promise<AliasRow[]>} [queryFn] - injectable for tests
 * @returns {Promise<AliasDecision | null>}
 */
export async function resolveAliasDecision(address, env, queryFn = defaultQueryFn) {
  if (typeof address !== 'string' || !address) return null;
  let byAddress;
  try {
    byAddress = await loadAliasRegistry(env, queryFn);
  } catch {
    return null; // belt-and-suspenders; loadAliasRegistry already never throws
  }
  if (!byAddress) return null;

  const key = address.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(byAddress, key)) return null;
  const row = byAddress[key];

  const metadataOnly = row.posture === 'privileged_legal';
  const retired = row.disposition === 'retire';

  // Only 'consolidate' produces an override destination. keep/verify/retire
  // keep the default forward (forwardEnv = null). For consolidate we expose
  // the lane's env NAME; the caller resolves + validates it (and itself fails
  // open to default if that env is unset).
  let forwardEnv = null;
  if (row.disposition === 'consolidate') {
    forwardEnv = LANE_FORWARD_ENV[row.lane] ?? null;
  }

  // keep/verify with no privilege and no retire flag → genuine no-op. Return
  // null so the caller's code path is byte-for-byte identical to today.
  if (!forwardEnv && !metadataOnly && !retired) return null;

  return {
    address: key,
    lane: row.lane,
    posture: row.posture,
    disposition: row.disposition,
    entity: row.entity,
    metadataOnly,
    retired,
    forwardEnv,
  };
}
