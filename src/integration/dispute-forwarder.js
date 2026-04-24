/**
 * Dispute Intake Forwarder
 *
 * Fire-and-forget forwarder that posts qualifying email-triage results to
 * chittydispute's /api/intake endpoint. Invoked from the email-processing
 * pipeline after TriageAgent classifies a message.
 *
 * Contract:
 *  - Never throws. All failure modes are logged and swallowed so the
 *    primary email pipeline (triage → priority → response) is never blocked.
 *  - Gated on category membership (DISPUTE_WORTHY_CATEGORIES env var) and
 *    the presence of CHITTYDISPUTE_AUTH_TOKEN. If either is missing the
 *    call is skipped silently.
 *  - Maps the TriageAgent classification contract directly to the intake
 *    payload — same field names, same semantics.
 *
 * @service chittycanon://core/services/chittyrouter#dispute-forwarder
 * @canon   chittycanon://gov/governance#core-types
 */

const DEFAULT_DISPUTE_URL = 'https://dispute.chitty.cc';
const INTAKE_PATH = '/api/intake';

/**
 * Parse the DISPUTE_WORTHY_CATEGORIES env var into a lowercased Set.
 * Returns null when unset so callers can treat "unset" as "forward nothing"
 * explicitly.
 */
function parseWorthyCategories(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const set = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return set.size === 0 ? null : set;
}

/**
 * Decide whether a triage result qualifies for forwarding.
 * Exported for unit testing.
 */
export function isDisputeWorthy(triageResult, env) {
  if (!triageResult || typeof triageResult !== 'object') return false;
  const category = String(triageResult.category || '').toLowerCase();
  if (!category) return false;

  const worthy = parseWorthyCategories(env?.DISPUTE_WORTHY_CATEGORIES);
  if (!worthy) return false;
  return worthy.has(category);
}

/**
 * Build the /api/intake payload from the TriageAgent classification and
 * the source email metadata.
 */
export function buildIntakePayload(triageResult, emailData) {
  const messageId =
    emailData?.messageId ||
    emailData?.metadata?.messageId ||
    `chittyrouter-${Date.now()}`;

  return {
    source: 'chittyrouter',
    source_ref: messageId,
    received_at: emailData?.timestamp || new Date().toISOString(),
    email: {
      from: emailData?.from || null,
      to: emailData?.to || null,
      subject: emailData?.subject || null,
      content_preview:
        typeof emailData?.content === 'string'
          ? emailData.content.slice(0, 2000)
          : null,
    },
    triage: {
      org: triageResult.org ?? null,
      category: triageResult.category,
      confidence: triageResult.confidence ?? null,
      keywords: Array.isArray(triageResult.keywords)
        ? triageResult.keywords
        : [],
      urgencyIndicators: Array.isArray(triageResult.urgencyIndicators)
        ? triageResult.urgencyIndicators
        : [],
      reasoning: triageResult.reasoning ?? null,
      fallback: Boolean(triageResult.fallback),
      classified_at:
        triageResult.timestamp || new Date().toISOString(),
    },
  };
}

/**
 * Forward a triage result to the dispute intake endpoint.
 *
 * Returns a tagged result object describing the outcome. Never throws.
 * Intended usage: `ctx.waitUntil(forwardToDisputeIntake(env, triage, email))`.
 *
 * @param {object} env           Worker env bindings (reads CHITTYDISPUTE_URL,
 *                               CHITTYDISPUTE_AUTH_TOKEN, DISPUTE_WORTHY_CATEGORIES).
 * @param {object} triageResult  TriageAgent /classify response.
 * @param {object} emailData     { subject, from, to, content, messageId, timestamp, metadata }.
 * @returns {Promise<{ forwarded: boolean, reason?: string, status?: number }>}
 */
export async function forwardToDisputeIntake(env, triageResult, emailData) {
  try {
    if (!env) return { forwarded: false, reason: 'no-env' };

    const token = env.CHITTYDISPUTE_AUTH_TOKEN;
    if (!token) {
      return { forwarded: false, reason: 'missing-auth-token' };
    }

    if (!isDisputeWorthy(triageResult, env)) {
      return { forwarded: false, reason: 'category-not-worthy' };
    }

    const base = (env.CHITTYDISPUTE_URL || DEFAULT_DISPUTE_URL).replace(
      /\/+$/,
      '',
    );
    const url = `${base}${INTAKE_PATH}`;
    const payload = buildIntakePayload(triageResult, emailData);

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Chitty-Source': 'chittyrouter',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      console.warn(
        `[dispute-forwarder] intake rejected status=${resp.status}`,
      );
      return { forwarded: false, reason: 'intake-non-2xx', status: resp.status };
    }

    console.log(
      `[dispute-forwarder] forwarded category=${payload.triage.category}`,
    );
    return { forwarded: true, status: resp.status };
  } catch (error) {
    // Handle timeout/abort errors specifically
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      console.warn('[dispute-forwarder] request timed out after 15s');
      return { forwarded: false, reason: 'timeout' };
    }
    console.warn(
      `[dispute-forwarder] forward failed: ${error?.message || String(error)}`,
    );
    return { forwarded: false, reason: 'exception' };
  }
}
