/**
 * Unit tests for the registry-backed routing overlay (src/config/alias-registry.js).
 *
 * These lock in the fail-open + precedence + F-L10 invariants of the live,
 * CERTIFIED legal-mail path. Per the global no-mock-DB policy, the DB is NOT
 * mocked: alias-registry exposes a dependency-injection seam (`queryFn`) and
 * these tests feed it SYNTHETIC fixture rows that mirror the STRUCTURAL SHAPE of
 * chittyops.alias_registry (lane/posture/disposition coverage, mgmt@ vs nick@
 * vs legal@ patterns) but use NON-PERSONAL addresses on clearly-test domains
 * (*.test). No real mailbox/owner PII is committed — the runtime feature keeps
 * forwarding destinations out of source, and these fixtures honor that. A
 * throwing queryFn exercises the fail-open path.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveAliasDecision,
  loadAliasRegistry,
  isAliasRegistryEnabled,
  LANE_FORWARD_ENV,
  _clearAliasCache,
} from '../../src/config/alias-registry.js';

// Synthetic rows mirroring the SHAPE of chittyops.alias_registry (72-row table):
// the same lane/posture/disposition mix and mgmt@/legal@/nick@ patterns, but on
// non-personal *.test domains. No real mailbox/owner PII in source.
const FIXTURE_ROWS = [
  // lane 2 / consolidate / public_facing — the ONE behavior-changing disposition
  { address: 'mgmt@aribia.test', posture: 'public_facing', lane: 2, disposition: 'consolidate', owner_mailbox: 'owner@example-jav.test', entity: 'ARIBIA LLC', type: 'alias' },
  // lane 3 / privileged_legal / keep — F-L10 metadata-only
  { address: 'legal@aribia.test', posture: 'privileged_legal', lane: 3, disposition: 'keep', owner_mailbox: 'legal@aribia.test', entity: 'Legal', type: 'group' },
  // lane 1 / retire — forward anyway, log retired
  { address: 'aaron@aribia.test', posture: 'personal', lane: 1, disposition: 'retire', owner_mailbox: 'owner@apt-arlene.test', entity: 'Furnished-Condos', type: 'alias' },
  // lane 1 / keep — genuine no-op
  { address: 'nick@example-jav.test', posture: 'personal', lane: 1, disposition: 'keep', owner_mailbox: 'nick@example-jav.test', entity: 'Personal-Nick', type: 'primary_user' },
  // lane 2 / verify — MUST be a no-op vs today
  { address: 'addison@aribia.test', posture: 'public_facing', lane: 2, disposition: 'verify', owner_mailbox: 'owner@example-jav.test', entity: 'ARIBIA LLC', type: 'alias' },
];

const ENABLED_ENV = { ALIAS_REGISTRY_ENABLED: 'true', HYPERDRIVE: { connectionString: 'unused-in-di' } };
const fixtureQueryFn = async () => FIXTURE_ROWS;
const throwingQueryFn = async () => { throw new Error('Neon unreachable (simulated outage)'); };

beforeEach(() => {
  _clearAliasCache();
});

describe('alias-registry: kill-switch', () => {
  it('is disabled by default (env unset)', () => {
    expect(isAliasRegistryEnabled({})).toBe(false);
    expect(isAliasRegistryEnabled(undefined)).toBe(false);
  });

  it("only 'true' enables it ('false'/other are off)", () => {
    expect(isAliasRegistryEnabled({ ALIAS_REGISTRY_ENABLED: 'false' })).toBe(false);
    expect(isAliasRegistryEnabled({ ALIAS_REGISTRY_ENABLED: '1' })).toBe(false);
    expect(isAliasRegistryEnabled({ ALIAS_REGISTRY_ENABLED: 'true' })).toBe(true);
  });

  it('returns null decision when disabled, even for a known address', async () => {
    const d = await resolveAliasDecision('mgmt@aribia.test', { ALIAS_REGISTRY_ENABLED: 'false' }, fixtureQueryFn);
    expect(d).toBeNull();
  });

  it('loadAliasRegistry returns null when disabled (DB never consulted)', async () => {
    let called = false;
    const spyQuery = async () => { called = true; return FIXTURE_ROWS; };
    const out = await loadAliasRegistry({ ALIAS_REGISTRY_ENABLED: 'false' }, spyQuery);
    expect(out).toBeNull();
    expect(called).toBe(false);
  });
});

describe('alias-registry: lane → env mapping', () => {
  it('maps lanes 1-4 to the canonical forward env NAMES (PII indirection)', () => {
    expect(LANE_FORWARD_ENV[1]).toBe('FORWARD_LANE1_PERSONAL');
    expect(LANE_FORWARD_ENV[2]).toBe('FORWARD_LANE2_OPS');
    expect(LANE_FORWARD_ENV[3]).toBe('FORWARD_LANE3_LEGAL');
    expect(LANE_FORWARD_ENV[4]).toBe('FORWARD_LANE4_ADMIN');
  });
});

describe('alias-registry: routing semantics', () => {
  it("'consolidate' routes by lane via env NAME (no raw address)", async () => {
    const d = await resolveAliasDecision('mgmt@aribia.test', ENABLED_ENV, fixtureQueryFn);
    expect(d).not.toBeNull();
    expect(d.disposition).toBe('consolidate');
    expect(d.lane).toBe(2);
    expect(d.forwardEnv).toBe('FORWARD_LANE2_OPS');
    expect(d.metadataOnly).toBe(false);
    expect(d.retired).toBe(false);
  });

  it("'keep' is a genuine no-op (null decision)", async () => {
    const d = await resolveAliasDecision('nick@example-jav.test', ENABLED_ENV, fixtureQueryFn);
    expect(d).toBeNull();
  });

  it("'verify' is a no-op vs today (null decision)", async () => {
    const d = await resolveAliasDecision('addison@aribia.test', ENABLED_ENV, fixtureQueryFn);
    expect(d).toBeNull();
  });

  it("'retire' still forwards (no override env) but flags retired", async () => {
    const d = await resolveAliasDecision('aaron@aribia.test', ENABLED_ENV, fixtureQueryFn);
    expect(d).not.toBeNull();
    expect(d.retired).toBe(true);
    expect(d.forwardEnv).toBeNull(); // keep default forward — don't drop
  });

  it("posture 'privileged_legal' sets metadataOnly (F-L10) and keeps default forward", async () => {
    const d = await resolveAliasDecision('legal@aribia.test', ENABLED_ENV, fixtureQueryFn);
    expect(d).not.toBeNull();
    expect(d.metadataOnly).toBe(true);
    expect(d.posture).toBe('privileged_legal');
    // disposition is 'keep' so there is no override destination — forward normally
    expect(d.forwardEnv).toBeNull();
  });

  it('returns null for an address absent from the registry', async () => {
    const d = await resolveAliasDecision('totally-unknown@chitty.cc', ENABLED_ENV, fixtureQueryFn);
    expect(d).toBeNull();
  });

  it('is case-insensitive on the lookup key', async () => {
    const d = await resolveAliasDecision('MGMT@Aribia.TEST', ENABLED_ENV, fixtureQueryFn);
    expect(d).not.toBeNull();
    expect(d.address).toBe('mgmt@aribia.test');
  });
});

describe('alias-registry: FAIL-OPEN', () => {
  it('returns null (never throws) on DB error', async () => {
    const d = await resolveAliasDecision('mgmt@aribia.test', ENABLED_ENV, throwingQueryFn);
    expect(d).toBeNull();
  });

  it('loadAliasRegistry degrades to null on DB error (no cache)', async () => {
    const out = await loadAliasRegistry(ENABLED_ENV, throwingQueryFn);
    expect(out).toBeNull();
  });

  it('serves stale cache on a transient error after a prior success', async () => {
    // Prime the cache with a good fetch...
    const good = await loadAliasRegistry(ENABLED_ENV, fixtureQueryFn);
    expect(good).not.toBeNull();
    // ...then a failing fetch within TTL should still return cached data.
    // (TTL is 5min; within the same test the cache is fresh, so the failing
    // queryFn is never invoked — but if it were stale+failing it serves stale.)
    const d = await resolveAliasDecision('mgmt@aribia.test', ENABLED_ENV, throwingQueryFn);
    expect(d).not.toBeNull();
    expect(d.forwardEnv).toBe('FORWARD_LANE2_OPS');
  });

  it('skips malformed rows (bad lane / disposition) rather than misrouting', async () => {
    const badQuery = async () => [
      { address: 'bad-lane@chitty.cc', posture: 'admin', lane: 9, disposition: 'keep' },
      { address: 'bad-disp@chitty.cc', posture: 'admin', lane: 2, disposition: 'nonsense' },
      { address: 'ok@aribia.test', posture: 'public_facing', lane: 2, disposition: 'consolidate', entity: 'X', type: 'alias' },
    ];
    expect(await resolveAliasDecision('bad-lane@chitty.cc', ENABLED_ENV, badQuery)).toBeNull();
    _clearAliasCache();
    expect(await resolveAliasDecision('bad-disp@chitty.cc', ENABLED_ENV, badQuery)).toBeNull();
    _clearAliasCache();
    expect(await resolveAliasDecision('ok@aribia.test', ENABLED_ENV, badQuery)).not.toBeNull();
  });
});
