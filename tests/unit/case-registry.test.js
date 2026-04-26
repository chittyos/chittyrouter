/**
 * Unit tests for the canonical case registry.
 *
 * These tests lock in the security-relevant invariants of
 * src/config/case-registry.js so a future regression cannot silently
 * re-introduce a default case (the historical cause of cross-case
 * evidence contamination).
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

describe('case-registry: resolveCase fails closed', () => {
  it('returns undefined for null / empty / whitespace identifier', () => {
    expect(resolveCase(undefined)).toBeUndefined();
    expect(resolveCase(null)).toBeUndefined();
    expect(resolveCase('')).toBeUndefined();
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

describe('case-registry: derived lookups are consistent', () => {
  it('CASE_BY_SLUG indexes every entry', () => {
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

  it('EMAIL_ALIAS_TO_CASE indexes every alias, lowercased', () => {
    for (const entry of CASE_REGISTRY) {
      for (const alias of entry.emailAliases ?? []) {
        const lower = alias.toLowerCase();
        expect(EMAIL_ALIAS_TO_CASE[lower]).toBe(entry);
      }
    }
  });

  it('EMAIL_ALIAS_TO_CASE has no untracked aliases', () => {
    const allEntryAliases = new Set(
      CASE_REGISTRY.flatMap((c) => (c.emailAliases ?? []).map((a) => a.toLowerCase())),
    );
    expect(Object.keys(EMAIL_ALIAS_TO_CASE).length).toBe(allEntryAliases.size);
  });

  it('CLASSIFIER_PATTERNS only includes cases with non-empty patterns', () => {
    for (const slug of Object.keys(CLASSIFIER_PATTERNS)) {
      const entry = CASE_BY_SLUG[slug];
      expect(entry).toBeDefined();
      expect(entry.filenamePatterns).toBeDefined();
      expect(entry.filenamePatterns.length).toBeGreaterThan(0);
      expect(CLASSIFIER_PATTERNS[slug].length).toBe(entry.filenamePatterns.length);
    }
  });

  it('CASE_EMAIL_ROUTES only includes cases with BOTH aliases AND routing', () => {
    for (const [addr, route] of Object.entries(CASE_EMAIL_ROUTES)) {
      const entry = CASE_BY_SLUG[route.caseSlug];
      expect(entry).toBeDefined();
      expect(entry.emailAliases).toBeDefined();
      expect(entry.emailAliases.map((a) => a.toLowerCase())).toContain(addr.toLowerCase());
      expect(entry.routing).toBeDefined();
      expect(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).toContain(entry.routing.priority);
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
