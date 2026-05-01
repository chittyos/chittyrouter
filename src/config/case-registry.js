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
 * attribution lookups (CASE_BY_SLUG / CASE_BY_NUMBER still see retired
 * entries; active-routing tables EMAIL_ALIAS_TO_CASE, CLASSIFIER_PATTERNS,
 * and CASE_EMAIL_ROUTES filter to status === 'active').
 *
 * PII policy: real forwarding addresses NEVER live in this file. Use
 * `routing.forwardEnv` to name the env var that holds the destination.
 * The router resolves env vars at construction time.
 *
 * @typedef {'active' | 'closed' | 'archived'} CaseStatus
 * @typedef {'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'} RoutingPriority
 *
 * @typedef {Object} CaseRoutingConfig
 * @property {string} forwardEnv    - Name of env var holding the destination email
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

/**
 * Recursively freeze a plain object/array tree. Safe to call on primitives
 * and already-frozen values.
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/**
 * Build a null-prototype frozen map from key/value pairs. Used for all
 * lookup tables to prevent prototype-chain pollution
 * (`map['__proto__']`, `map['toString']`, etc. return undefined).
 */
function nullProtoMap(entries) {
  const target = Object.create(null);
  for (const [key, value] of entries) {
    target[key] = value;
  }
  return Object.freeze(target);
}

/** @type {readonly CaseRegistryEntry[]} */
export const CASE_REGISTRY = deepFreeze([
  {
    slug: 'arias-v-bianchi',
    caseNumber: '2024D007847',
    displayName: 'Arias v. Bianchi',
    status: 'active',
    chittyThread: 'ARIAS_v_BIANCHI_2024',
    emailAliases: ['arias-v-bianchi@chitty.cc'],
    filenamePatterns: ['2024d007847', 'arias v bianchi', 'arias vs bianchi', 'arias v. bianchi'],
    routing: { forwardEnv: 'CASE_FORWARD_ARIAS_V_BIANCHI', priority: 'CRITICAL' },
  },
  {
    slug: 'bianchi-v-schatz',
    caseNumber: 'UNKNOWN',
    displayName: 'Bianchi v. Schatz',
    status: 'active',
    filenamePatterns: ['bianchi v schatz', 'bianchi vs schatz', 'schatz'],
  },
  {
    // Formal matter name. See detailed matter brief in private evidence-db
    // at docs/cases/aribia-v-camilo-arias/matter-brief.md — not repeated here
    // (public repo). Keep this entry to routing/classification keywords only.
    slug: 'aribia-v-camilo-arias',
    caseNumber: 'UNKNOWN',
    displayName: 'ARIBIA LLC v. Camilo Arias (Colombia — Medellín)',
    status: 'active',
    filenamePatterns: [
      // Property identifiers (public, already in public cadastro records)
      'plaza de colores', 'morada mami',
      'carrera 76 a', '53-215', 'apartment 1112', 'apt 1112',
      '01n-5270691', '01n-5270572',
      // Legal-form file types common for this matter
      'promesa de compraventa', 'otrosi', 'otrosí', 'formulario 4',
      // Generic descriptors
      'medellin property', 'colombia eviction', 'aribia colombia',
    ],
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

/**
 * Slug → entry. Includes ALL entries (active + retired) so historical
 * attribution lookups still resolve.
 * @type {Readonly<Record<string, CaseRegistryEntry>>}
 */
export const CASE_BY_SLUG = nullProtoMap(
  CASE_REGISTRY.map(c => [c.slug, c]),
);

/**
 * Case number → entry. Includes ALL entries (active + retired) for the same
 * historical-lookup reason as CASE_BY_SLUG.
 * @type {Readonly<Record<string, CaseRegistryEntry>>}
 */
export const CASE_BY_NUMBER = nullProtoMap(
  CASE_REGISTRY
    .filter(c => c.caseNumber && c.caseNumber !== 'UNKNOWN')
    .map(c => [c.caseNumber, c]),
);

/**
 * Email address → case entry. Built from every ACTIVE case's emailAliases.
 * Closed/archived cases do not appear here so retired aliases stop routing.
 * @type {Readonly<Record<string, CaseRegistryEntry>>}
 */
export const EMAIL_ALIAS_TO_CASE = nullProtoMap(
  CASE_REGISTRY
    .filter(c => c.status === 'active')
    .flatMap(c => (c.emailAliases ?? []).map(email => [email.toLowerCase(), c])),
);

/**
 * Classifier pattern map: case slug → lowercase substring patterns. Active
 * cases only — retired cases stop matching new documents but still appear in
 * CASE_BY_SLUG for historical attribution.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const CLASSIFIER_PATTERNS = nullProtoMap(
  CASE_REGISTRY
    .filter(c => c.status === 'active' && c.filenamePatterns?.length > 0)
    .map(c => [c.slug, c.filenamePatterns]),
);

/**
 * Email routes derived from ACTIVE CASE_REGISTRY entries that have
 * emailAliases + routing. Carries `forwardEnv` (the name of the env var
 * holding the destination address) — callers must resolve it against their
 * env at runtime. `attorneys` is preserved as undefined when absent so
 * downstream callers can use truthy checks for the fallback path.
 * @type {Readonly<Record<string, Object>>}
 */
export const CASE_EMAIL_ROUTES = nullProtoMap(
  CASE_REGISTRY.flatMap(c => {
    if (c.status !== 'active' || !c.emailAliases?.length || !c.routing) return [];
    return c.emailAliases.map(addr => [
      addr,
      {
        caseNumber: c.caseNumber,
        caseSlug: c.slug,
        chittyThread: c.chittyThread,
        priority: c.routing.priority,
        forwardEnv: c.routing.forwardEnv,
        attorneys: c.attorneys,
      },
    ]);
  }),
);

/**
 * Resolve a case slug OR case number to a registry entry. Returns undefined
 * for anything not explicitly registered — callers must handle undefined
 * (never default to a specific case).
 *
 * Hardened against prototype-chain lookups: `resolveCase('toString')`,
 * `resolveCase('__proto__')`, `resolveCase('constructor')` etc. all return
 * undefined.
 *
 * @param {string} identifier - Either a case slug or a case number
 * @returns {CaseRegistryEntry | undefined}
 */
export function resolveCase(identifier) {
  if (typeof identifier !== 'string' || !identifier) return undefined;
  if (Object.hasOwn(CASE_BY_SLUG, identifier)) return CASE_BY_SLUG[identifier];
  if (Object.hasOwn(CASE_BY_NUMBER, identifier)) return CASE_BY_NUMBER[identifier];
  return undefined;
}
