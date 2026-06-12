/**
 * Pre-triage privilege gate — F-L10 "body never crosses" enforcement.
 *
 * This module answers ONE question, FAIL-CLOSED: is an inbound email
 * privileged-legal, such that its BODY and ATTACHMENTS must NEVER be sent to
 * the Cloudflare AI model or written to R2?
 *
 * DESIGN PRINCIPLES (the deliberate inverse of alias-registry.js):
 *
 *   1. FAIL-CLOSED. alias-registry routing fails OPEN (a DB blip must never
 *      drop mail). Privilege detection fails CLOSED: if detection itself
 *      errors, OR a static signal matches, we treat the mail as privileged and
 *      suppress AI/R2. Over-suppressing AI/R2 for a stray non-privileged email
 *      is harmless (it still forwards); leaking a privileged body to an
 *      external model is not recoverable. When in doubt, suppress.
 *
 *   2. INDEPENDENT OF NEON. A privileged classification must hold even when the
 *      registry/Hyperdrive is unavailable. Detection is built from RELIABLE
 *      STATIC signals (a configured sender-domain allowlist + case-registry
 *      aliases). The alias_registry (lane-3 / posture='privileged_legal') is an
 *      ADDITIVE signal: if the already-loaded decision says privileged_legal we
 *      honor it, but its ABSENCE never downgrades a static match.
 *
 *   3. SIGNALS (privileged if ANY fires):
 *        a. Sender domain ∈ PRIVILEGED_SENDER_DOMAINS (env, comma-sep). The
 *           canonical privileged firms (ksnlaw.com, bertonring.com,
 *           vanguardadvocates.com) are DEPLOY-SET, never committed — mirrors
 *           studio-flows/aribia-daily-inbox-triage.json privileged_domains.
 *        b. Recipient is a known-privileged lane: any active case emailAlias
 *           (legal attribution), OR an alias_registry row the caller already
 *           resolved as posture='privileged_legal' (lane 3).
 *
 *   4. NO BODY. Address + (optionally) subject only. This module never reads
 *      email body content — that is the whole point.
 *
 * @typedef {import('./alias-registry.js').AliasDecision} AliasDecision
 */

import { EMAIL_ALIAS_TO_CASE } from './case-registry.js';

/**
 * Extract the bare, lowercased email address from a header value that may be in
 * any of: "a@b.com", "Display Name <a@b.com>", "<a@b.com>", or a comma-
 * separated list (returns the FIRST address). Returns '' if none found.
 *
 * Robustness matters here: a missed extraction on a privileged sender means the
 * body reaches the AI model. We therefore prefer the angle-bracket address when
 * present (the canonical form) and fall back to the first bare token.
 *
 * @param {string} raw
 * @returns {string}
 */
export function extractAddress(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  // Prefer the first <...> address if the header is a display-name form.
  const angle = raw.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  // Otherwise take the first bare addr-spec token anywhere in the value.
  const bare = raw.match(/[^\s,<>]+@[^\s,<>]+/);
  return bare ? bare[0].trim().toLowerCase() : '';
}

/**
 * Extract ALL bare lowercased addresses from a (possibly comma-separated,
 * possibly display-name) recipient header.
 * @param {string} raw
 * @returns {string[]}
 */
export function extractAddresses(raw) {
  if (typeof raw !== 'string' || !raw) return [];
  const matches = raw.match(/[^\s,<>]+@[^\s,<>]+/g);
  if (!matches) return [];
  return matches.map((m) => m.trim().toLowerCase());
}

/**
 * Parse PRIVILEGED_SENDER_DOMAINS (comma-separated) into a lowercased Set of
 * bare domains. Tolerates leading '@', surrounding whitespace, empty entries.
 * @param {any} env
 * @returns {Set<string>}
 */
export function privilegedSenderDomains(env) {
  const raw = env?.PRIVILEGED_SENDER_DOMAINS;
  const out = new Set();
  if (typeof raw !== 'string' || !raw) return out;
  for (const part of raw.split(',')) {
    const d = part.trim().replace(/^@/, '').toLowerCase();
    if (d) out.add(d);
  }
  return out;
}

/**
 * True iff `addr`'s domain is in the privileged sender-domain allowlist.
 * Exact-domain match only (a@ksnlaw.com matches 'ksnlaw.com'); does NOT match
 * lookalike parent domains.
 * @param {string} addr - bare lowercased address
 * @param {Set<string>} domains
 */
function senderDomainPrivileged(addr, domains) {
  if (!addr || domains.size === 0) return false;
  const at = addr.lastIndexOf('@');
  if (at < 0) return false;
  const domain = addr.slice(at + 1);
  return domains.has(domain);
}

/**
 * True iff `addr` is a known-privileged recipient lane:
 *   - an active case emailAlias (case-registry legal attribution), OR
 *   - flagged privileged_legal by the already-resolved alias_registry decision.
 *
 * @param {string} addr - bare lowercased recipient address
 * @param {AliasDecision | null | undefined} aliasDecision - #99's resolved decision
 */
function recipientPrivileged(addr, aliasDecision) {
  if (!addr) return false;
  // Case-registry alias = legal attribution. Static, Neon-independent.
  if (Object.prototype.hasOwnProperty.call(EMAIL_ALIAS_TO_CASE, addr)) return true;
  // alias_registry lane-3 / privileged_legal (additive; absence never downgrades).
  if (aliasDecision && aliasDecision.metadataOnly === true && addr === aliasDecision.address) {
    return true;
  }
  return false;
}

/**
 * FAIL-CLOSED privilege classification. Returns true when the email must be
 * treated as privileged-legal (suppress AI + R2; metadata-only logging).
 *
 * @param {string} fromHeader  - raw From header value
 * @param {string} toHeader    - raw To header value (may be a list)
 * @param {any} env            - worker env (PRIVILEGED_SENDER_DOMAINS, ...)
 * @param {AliasDecision | null} [aliasDecision] - #99's already-resolved decision
 * @returns {boolean}
 */
export function isPrivileged(fromHeader, toHeader, env, aliasDecision = null) {
  try {
    const domains = privilegedSenderDomains(env);

    // Signal (a): privileged SENDER domain.
    const fromAddr = extractAddress(fromHeader);
    if (senderDomainPrivileged(fromAddr, domains)) return true;

    // Signal (b): known-privileged RECIPIENT lane (any recipient in the list).
    for (const toAddr of extractAddresses(toHeader)) {
      if (recipientPrivileged(toAddr, aliasDecision)) return true;
    }

    return false;
  } catch (err) {
    // FAIL-CLOSED: if detection itself throws, treat as privileged. Safer to
    // over-suppress AI/R2 than to risk leaking a privileged body downstream.
    console.error('[privilege-gate] detection error — failing CLOSED (treating as privileged):', err?.message ?? err);
    return true;
  }
}
