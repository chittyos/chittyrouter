/**
 * Unit tests for the canonical case registry.
 *
 * These tests lock in the security-relevant invariants of
 * src/config/case-registry.js so a future regression cannot silently
 * re-introduce a default case (the historical cause of cross-case
 * evidence contamination), reintroduce mutable shared state, expose
 * lookup tables to prototype-chain pollution, leak PII via routing
 * literals, or let retired cases keep routing.
 */

import { describe, it, expect } from 'vitest';
import {
  CASE_REGISTRY,
  CASE_BY_SLUG,
  CASE_BY_NUMBER,
  EMAIL_ALIAS_TO_CASE,
  CLASSIFIER_PATTERNS,
  CASE_EMAIL_ROUTES,
  resolveCase,
} from '../../src/config/case-registry.js';

const ACTIVE_REGISTRY = CASE_REGISTRY.filter((c) => c.status === 'active');

describe('case-registry: structural invariants', () => {
  it('CASE_REGISTRY is non-empty', () => {
    expect(Array.isArray(CASE_REGISTRY)).toBe(true);
    expect(CASE_REGISTRY.length).toBeGreaterThan(0);
  });

  it('CASE_REGISTRY is frozen (no runtime mutation)', () => {
    expect(Object.isFrozen(CASE_REGISTRY)).toBe(true);
    expect(() => {
      CASE_REGISTRY.push({ slug: 'evil-default-case', caseNumber: 'X', displayName: 'X', status: 'active' });
    }).toThrow();
  });

  it('CASE_REGISTRY is DEEP-frozen — entries and nested arrays are immutable', () => {
    // Object.freeze alone is shallow; nested mutation (e.g. swapping the
    // forward target on a frozen entry) would silently taint every
    // downstream consumer that holds a reference. Deep freeze is required
    // for the "single source of truth" guarantee to hold.
    for (const entry of CASE_REGISTRY) {
      expect(Object.isFrozen(entry)).toBe(true);
      if (entry.routing) expect(Object.isFrozen(entry.routing)).toBe(true);
      if (entry.emailAliases) expect(Object.isFrozen(entry.emailAliases)).toBe(true);
      if (entry.filenamePatterns) expect(Object.isFrozen(entry.filenamePatterns)).toBe(true);
    }
    expect(() => {
      CASE_REGISTRY[0].routing.forwardEnv = 'CASE_FORWARD_PWNED';
    }).toThrow();
    expect(() => {
      CASE_REGISTRY[0].emailAliases.push('attacker@example.com');
    }).toThrow();
  });

  it('every entry has required fields', () => {
    for (const entry of CASE_REGISTRY) {
      expect(typeof entry.slug).toBe('string');
      expect(entry.slug).toMatch(/^[a-z0-9-]+$/);
      expect(typeof entry.caseNumber).toBe('string');
      expect(typeof entry.displayName).toBe('string');
      expect(['active', 'closed', 'archived']).toContain(entry.status);
    }
  });

  it('slugs are unique', () => {
    const slugs = CASE_REGISTRY.map((c) => c.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('case numbers (when not UNKNOWN) are unique', () => {
    const numbers = CASE_REGISTRY
      .map((c) => c.caseNumber)
      .filter((n) => n && n !== 'UNKNOWN');
    const unique = new Set(numbers);
    expect(unique.size).toBe(numbers.length);
  });
});

describe('case-registry: PII / public-repo safety', () => {
  it('no entry routing carries a literal email — only forwardEnv references', () => {
    // Live destination addresses must NEVER live in this public file.
    // Only env-var names are allowed (e.g. CASE_FORWARD_ARIAS_V_BIANCHI).
    for (const entry of CASE_REGISTRY) {
      if (!entry.routing) continue;
      expect(entry.routing.forward).toBeUndefined();
      expect(typeof entry.routing.forwardEnv).toBe('string');
      expect(entry.routing.forwardEnv).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(entry.routing.forwardEnv).not.toMatch(/@/);
    }
  });
});

describe('case-registry: resolveCase fails closed', () => {
  it('returns undefined for null / empty / whitespace identifier', () => {
    expect(resolveCase(undefined)).toBeUndefined();
    expect(resolveCase(null)).toBeUndefined();
    expect(resolveCase('')).toBeUndefined();
  });

  it('returns undefined for non-string identifiers (number, object, etc.)', () => {
    expect(resolveCase(42)).toBeUndefined();
    expect(resolveCase({})).toBeUndefined();
    expect(resolveCase([])).toBeUndefined();
    expect(resolveCase(true)).toBeUndefined();
  });

  it('returns undefined for prototype-chain identifiers', () => {
    // Defends against `resolveCase(userInput)` being abused as a trust
    // boundary where untrusted input like '__proto__' or 'toString' would
    // otherwise resolve to inherited Object.prototype properties on plain
    // lookup objects. Hardening: null-prototype maps + Object.hasOwn guard.
    expect(resolveCase('__proto__')).toBeUndefined();
    expect(resolveCase('toString')).toBeUndefined();
    expect(resolveCase('constructor')).toBeUndefined();
    expect(resolveCase('hasOwnProperty')).toBeUndefined();
    expect(resolveCase('valueOf')).toBeUndefined();
  });

  it('returns undefined for unknown slug', () => {
    expect(resolveCase('definitely-not-a-real-case-slug')).toBeUndefined();
  });

  it('returns undefined for unknown case number', () => {
    expect(resolveCase('9999X999999')).toBeUndefined();
  });

  it('NEVER returns a default — no fallback to "first" or "active"', () => {
    // This is the security-critical assertion: if any caller passes an
    // unknown identifier, the registry must not silently return any
    // entry. Historical contamination came from skills hardcoding a
    // default; the registry must never become a default-provider.
    const arbitraryUnknowns = ['', 'unknown', 'default', 'main', 'arias'];
    //                                                          ^ slug is 'arias-v-bianchi', not 'arias'
    for (const id of arbitraryUnknowns) {
      expect(resolveCase(id)).toBeUndefined();
    }
  });

  it('resolves a known slug exactly', () => {
    const entry = resolveCase('arias-v-bianchi');
    expect(entry).toBeDefined();
    expect(entry.slug).toBe('arias-v-bianchi');
  });

  it('resolves a known case number exactly', () => {
    const entry = resolveCase('2024D007847');
    expect(entry).toBeDefined();
    expect(entry.caseNumber).toBe('2024D007847');
  });

  it('slug and case number resolve to the same entry', () => {
    expect(resolveCase('arias-v-bianchi')).toBe(resolveCase('2024D007847'));
  });
});

describe('case-registry: lookup tables are prototype-safe', () => {
  it('CASE_BY_SLUG is a null-prototype dict', () => {
    expect(Object.getPrototypeOf(CASE_BY_SLUG)).toBeNull();
  });
  it('CASE_BY_NUMBER is a null-prototype dict', () => {
    expect(Object.getPrototypeOf(CASE_BY_NUMBER)).toBeNull();
  });
  it('EMAIL_ALIAS_TO_CASE is a null-prototype dict', () => {
    expect(Object.getPrototypeOf(EMAIL_ALIAS_TO_CASE)).toBeNull();
  });
  it('CLASSIFIER_PATTERNS is a null-prototype dict', () => {
    expect(Object.getPrototypeOf(CLASSIFIER_PATTERNS)).toBeNull();
  });
  it('CASE_EMAIL_ROUTES is a null-prototype dict', () => {
    expect(Object.getPrototypeOf(CASE_EMAIL_ROUTES)).toBeNull();
  });
});

describe('case-registry: derived lookups are consistent', () => {
  it('CASE_BY_SLUG indexes every entry (including retired) for historical lookup', () => {
    for (const entry of CASE_REGISTRY) {
      expect(CASE_BY_SLUG[entry.slug]).toBe(entry);
    }
    expect(Object.keys(CASE_BY_SLUG).length).toBe(CASE_REGISTRY.length);
  });

  it('CASE_BY_NUMBER excludes UNKNOWN case numbers', () => {
    for (const number of Object.keys(CASE_BY_NUMBER)) {
      expect(number).not.toBe('UNKNOWN');
      expect(number.length).toBeGreaterThan(0);
    }
  });

  it('CASE_BY_NUMBER values match registry entries', () => {
    for (const [number, entry] of Object.entries(CASE_BY_NUMBER)) {
      expect(entry.caseNumber).toBe(number);
      expect(CASE_REGISTRY).toContain(entry);
    }
  });

  it('EMAIL_ALIAS_TO_CASE indexes every ACTIVE alias, lowercased', () => {
    for (const entry of ACTIVE_REGISTRY) {
      for (const alias of entry.emailAliases ?? []) {
        const lower = alias.toLowerCase();
        expect(EMAIL_ALIAS_TO_CASE[lower]).toBe(entry);
      }
    }
  });

  it('EMAIL_ALIAS_TO_CASE has no untracked aliases (only active sources)', () => {
    const allActiveAliases = new Set(
      ACTIVE_REGISTRY.flatMap((c) => (c.emailAliases ?? []).map((a) => a.toLowerCase())),
    );
    expect(Object.keys(EMAIL_ALIAS_TO_CASE).length).toBe(allActiveAliases.size);
  });

  it('CLASSIFIER_PATTERNS only includes ACTIVE cases with non-empty patterns', () => {
    for (const slug of Object.keys(CLASSIFIER_PATTERNS)) {
      const entry = CASE_BY_SLUG[slug];
      expect(entry).toBeDefined();
      expect(entry.status).toBe('active');
      expect(entry.filenamePatterns).toBeDefined();
      expect(entry.filenamePatterns.length).toBeGreaterThan(0);
      expect(CLASSIFIER_PATTERNS[slug].length).toBe(entry.filenamePatterns.length);
    }
  });

  it('CASE_EMAIL_ROUTES only includes ACTIVE cases with BOTH aliases AND routing', () => {
    for (const [addr, route] of Object.entries(CASE_EMAIL_ROUTES)) {
      const entry = CASE_BY_SLUG[route.caseSlug];
      expect(entry).toBeDefined();
      expect(entry.status).toBe('active');
      expect(entry.emailAliases).toBeDefined();
      expect(entry.emailAliases.map((a) => a.toLowerCase())).toContain(addr.toLowerCase());
      expect(entry.routing).toBeDefined();
      expect(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).toContain(entry.routing.priority);
      // forwardEnv carries through, real address never does
      expect(typeof route.forwardEnv).toBe('string');
      expect(route.forward).toBeUndefined();
    }
  });

  it('CASE_EMAIL_ROUTES preserves attorneys as undefined when absent (does not default to [])', () => {
    // Defaulting to [] makes routes truthy-but-empty downstream, which
    // breaks `if (route && route.attorneys) { … } else { fallback }`
    // patterns: routes that should fall through to the fallback instead
    // forward to nobody, dropping the email.
    for (const route of Object.values(CASE_EMAIL_ROUTES)) {
      const entry = CASE_BY_SLUG[route.caseSlug];
      if (entry.attorneys === undefined) {
        expect(route.attorneys).toBeUndefined();
      } else {
        expect(route.attorneys).toEqual(entry.attorneys);
      }
    }
  });
});

describe('case-registry: status filtering retires routes without losing history', () => {
  it('retired cases (closed/archived) do NOT appear in EMAIL_ALIAS_TO_CASE', () => {
    for (const entry of CASE_REGISTRY) {
      if (entry.status === 'active') continue;
      for (const alias of entry.emailAliases ?? []) {
        expect(EMAIL_ALIAS_TO_CASE[alias.toLowerCase()]).toBeUndefined();
      }
    }
  });

  it('retired cases do NOT appear in CLASSIFIER_PATTERNS', () => {
    for (const entry of CASE_REGISTRY) {
      if (entry.status === 'active') continue;
      expect(CLASSIFIER_PATTERNS[entry.slug]).toBeUndefined();
    }
  });

  it('retired cases do NOT appear in CASE_EMAIL_ROUTES', () => {
    for (const route of Object.values(CASE_EMAIL_ROUTES)) {
      const entry = CASE_BY_SLUG[route.caseSlug];
      expect(entry.status).toBe('active');
    }
  });

  it('retired cases STILL appear in CASE_BY_SLUG and CASE_BY_NUMBER (historical lookup)', () => {
    // CASE_BY_SLUG / CASE_BY_NUMBER are deliberately not status-filtered so
    // that historical attribution lookups (e.g. "what case did this 2-year-
    // old document get tagged to?") still resolve.
    for (const entry of CASE_REGISTRY) {
      expect(CASE_BY_SLUG[entry.slug]).toBe(entry);
      if (entry.caseNumber && entry.caseNumber !== 'UNKNOWN') {
        expect(CASE_BY_NUMBER[entry.caseNumber]).toBe(entry);
      }
    }
  });
});

describe('case-registry: contamination defenses', () => {
  it("'arias' (bare) does NOT resolve — only the full slug 'arias-v-bianchi' does", () => {
    // Defends against partial-match shortcuts that historically caused
    // "any document mentioning Arias" to fall through to the arias case.
    expect(resolveCase('arias')).toBeUndefined();
    expect(resolveCase('bianchi')).toBeUndefined();
    expect(resolveCase('arias-v-bianchi')).toBeDefined();
  });

  it('classifier patterns do not collide across slugs', () => {
    // If two cases share a filename pattern, the classifier could
    // attribute the same doc to either case ambiguously. Each pattern
    // should be unique across all cases.
    const seen = new Map(); // pattern -> slug
    for (const [slug, patterns] of Object.entries(CLASSIFIER_PATTERNS)) {
      for (const pattern of patterns) {
        const key = pattern.toLowerCase();
        if (seen.has(key)) {
          throw new Error(
            `pattern "${pattern}" appears in both "${seen.get(key)}" and "${slug}" — would cause ambiguous classification`,
          );
        }
        seen.set(key, slug);
      }
    }
  });

  it('email aliases do not collide across cases', () => {
    const seen = new Map();
    for (const entry of CASE_REGISTRY) {
      for (const alias of entry.emailAliases ?? []) {
        const key = alias.toLowerCase();
        if (seen.has(key)) {
          throw new Error(
            `email alias "${alias}" appears in both "${seen.get(key)}" and "${entry.slug}"`,
          );
        }
        seen.set(key, entry.slug);
      }
    }
  });
});
