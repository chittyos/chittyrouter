/**
 * Canonical case registry for ChittyRouter.
 *
 * Single source of truth for every case the router is aware of. All case
 * attribution — email routing, classifier patterns, AI prompt defaults —
 * MUST derive from this registry. Never hardcode a case_number or case slug
 * outside this file.
 *
 * Adding a new case: append one entry to CASE_REGISTRY. Retiring a case: set
 * status to 'closed' or 'archived' — do not delete, to preserve historical
 * attribution lookups.
 *
 * @typedef {'active' | 'closed' | 'archived'} CaseStatus
 * @typedef {'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'} RoutingPriority
 *
 * @typedef {Object} CaseRoutingConfig
 * @property {string} forward       - Destination email address for inbound routing
 * @property {RoutingPriority} priority
 *
 * @typedef {Object} CaseRegistryEntry
 * @property {string} slug          - Kebab-case canonical identifier (e.g. 'arias-v-bianchi')
 * @property {string} caseNumber    - Court case number or structured identifier
 * @property {string} displayName   - Human-readable name
 * @property {CaseStatus} status
 * @property {string} [chittyThread] - ChittyOS thread identifier if allocated
 * @property {string[]} [emailAliases]    - Inbound email addresses mapped to this case
 * @property {string[]} [filenamePatterns] - Lowercase substrings that imply this case when seen in filenames/content
 * @property {string[]} [attorneys]       - Attorney contact addresses (routing / cc)
 * @property {CaseRoutingConfig} [routing]
 */

/** @type {readonly CaseRegistryEntry[]} */
export const CASE_REGISTRY = Object.freeze([
  {
    slug: 'arias-v-bianchi',
    caseNumber: '2024D007847',
    displayName: 'Arias v. Bianchi',
    status: 'active',
    chittyThread: 'ARIAS_v_BIANCHI_2024',
    emailAliases: ['arias-v-bianchi@chitty.cc'],
    filenamePatterns: ['2024d007847', 'arias v bianchi', 'arias vs bianchi', 'arias v. bianchi'],
    routing: { forward: 'nick@aribia.cc', priority: 'CRITICAL' },
  },
  {
    slug: 'bianchi-v-schatz',
    caseNumber: 'UNKNOWN',
    displayName: 'Bianchi v. Schatz',
    status: 'active',
    filenamePatterns: ['bianchi v schatz', 'bianchi vs schatz', 'schatz'],
  },
  {
    slug: 'colombia-eviction',
    caseNumber: 'UNKNOWN',
    displayName: 'Colombia Eviction (Medellín)',
    status: 'active',
    filenamePatterns: ['morada mami', 'medellin property', 'colombia eviction'],
  },
  {
    slug: 'clarendon-1610',
    caseNumber: 'UNKNOWN',
    displayName: 'Clarendon 1610 HOA',
    status: 'active',
    filenamePatterns: ['clarendon 1610', '1610 clarendon', '4343 clarendon', 'aribia llc apt arlene'],
  },
  {
    slug: 'fox-hoa',
    caseNumber: 'UNKNOWN',
    displayName: 'Fox HOA',
    status: 'active',
    filenamePatterns: ['fox hoa', 'smc complaint', 'surf refund'],
  },
]);

// ===== Derived lookup tables (computed once at module load) =====

/** @type {Readonly<Record<string, CaseRegistryEntry>>} */
export const CASE_BY_SLUG = Object.freeze(
  Object.fromEntries(CASE_REGISTRY.map(c => [c.slug, c])),
);

/** @type {Readonly<Record<string, CaseRegistryEntry>>} */
export const CASE_BY_NUMBER = Object.freeze(
  Object.fromEntries(
    CASE_REGISTRY
      .filter(c => c.caseNumber && c.caseNumber !== 'UNKNOWN')
      .map(c => [c.caseNumber, c]),
  ),
);

/**
 * Email address → case entry. Built from every case's emailAliases.
 * @type {Readonly<Record<string, CaseRegistryEntry>>}
 */
export const EMAIL_ALIAS_TO_CASE = Object.freeze(
  Object.fromEntries(
    CASE_REGISTRY.flatMap(c => (c.emailAliases ?? []).map(email => [email.toLowerCase(), c])),
  ),
);

/**
 * Classifier pattern map: case slug → lowercase substring patterns.
 * Shape kept compatible with the old CASE_PATTERNS in document-classifier.js
 * so the classifier loop doesn't need structural changes.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const CLASSIFIER_PATTERNS = Object.freeze(
  Object.fromEntries(
    CASE_REGISTRY
      .filter(c => c.filenamePatterns && c.filenamePatterns.length > 0)
      .map(c => [c.slug, Object.freeze([...c.filenamePatterns])]),
  ),
);

/**
 * Email routes derived from CASE_REGISTRY entries that have emailAliases + routing.
 * Shape matches EMAIL_ROUTES entries in routes.js.
 * @type {Readonly<Record<string, Object>>}
 */
export const CASE_EMAIL_ROUTES = Object.freeze(
  Object.fromEntries(
    CASE_REGISTRY.flatMap(c => {
      if (!c.emailAliases || c.emailAliases.length === 0 || !c.routing) return [];
      return c.emailAliases.map(addr => [
        addr,
        Object.freeze({
          caseNumber: c.caseNumber,
          caseSlug: c.slug,
          chittyThread: c.chittyThread,
          priority: c.routing.priority,
          forward: c.routing.forward,
          attorneys: c.attorneys ?? [],
        }),
      ]);
    }),
  ),
);

/**
 * Resolve a case slug OR case number to a registry entry. Returns undefined if
 * not found — callers must handle this explicitly (never default to a specific
 * case).
 *
 * @param {string} identifier - Either a case slug or a case number
 * @returns {CaseRegistryEntry | undefined}
 */
export function resolveCase(identifier) {
  if (!identifier) return undefined;
  return CASE_BY_SLUG[identifier] ?? CASE_BY_NUMBER[identifier];
}
