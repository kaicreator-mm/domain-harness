// Issue #323 / DAC v0.0.3 V3-001 — foundation suite: exact baseline binding,
// Base Reference Obligations (role/kind + authority scope + role-specific
// primary identity, each exactly 1), locator-hint non-authority, opaque
// verbatim preservation, freezing, and the exported surface freeze for the
// serialized V3 lane (later V3 tasks must not silently reshape this surface).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  DAC_V003_REFERENCE_ADAPTER_VERSION,
  DacV003ReferenceError,
  adoptDacV003RegistryReference,
  adoptRuntimeHostBindingRequirementRef,
  getDacV003ReferenceRole,
  isDacV003Reference,
  verifyDacV003ReferenceIdentity,
} from '../../src/dac-v003/index.js';
import * as surface from '../../src/dac-v003/index.js';

const baseline = { ...DAC_V003_BASELINE };

function input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    baseline,
    authorityScope: 'composition/example-app',
    primaryIdentity: 'req-host-binding-0001',
    ...overrides,
  };
}

function assertErrorCode(fn: () => void, code: string, label: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003ReferenceError, `${label}: expected DacV003ReferenceError`);
  assert.equal((caught as DacV003ReferenceError).code, code, `${label}: code ${code}`);
}

test('v3-001 baseline identity is the exact DAC v0.0.3 semantic freeze', () => {
  assert.equal(baseline.contract, 'domain-application-contract');
  assert.equal(baseline.version, 'v0.0.3');
  assert.equal(baseline.semanticFreezeCommit, '3322b2152253b3c60f254c23a4f9ab1a14e063d1');
  assert.equal(baseline.semanticFreezeTree, '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06');
  assert.equal(DAC_V003_REFERENCE_ADAPTER_VERSION, 'dac-v003-reference-adapter/1');
});

test('v3-001 adoption fails closed on every non-exact baseline (commit AND tree)', () => {
  assertErrorCode(
    () => adoptDacV003RegistryReference('evidence', input({
      baseline: { ...baseline, semanticFreezeCommit: 'deadbeef'.padEnd(40, '0') },
    }) as never),
    'UNSUPPORTED_DAC_BASELINE',
    'wrong freeze commit',
  );
  assertErrorCode(
    () => adoptDacV003RegistryReference('evidence', input({
      baseline: { ...baseline, semanticFreezeTree: 'deadbeef'.padEnd(40, '0') },
    }) as never),
    'UNSUPPORTED_DAC_BASELINE',
    'wrong freeze tree',
  );
  assertErrorCode(
    () => adoptDacV003RegistryReference('evidence', input({
      baseline: { ...baseline, version: 'v0.0.2' },
    }) as never),
    'UNSUPPORTED_DAC_BASELINE',
    'v0.0.2 version under v0.0.3 adapter',
  );
  assertErrorCode(
    () => adoptDacV003RegistryReference('evidence', input({
      baseline: { ...baseline, contract: 'some-other-contract' },
    }) as never),
    'UNSUPPORTED_DAC_BASELINE',
    'wrong contract',
  );
});

test('v3-001 Base Reference Obligations: role, authority scope and primary identity are each exactly 1', () => {
  // role must be a canonical registry role
  assertErrorCode(
    () => adoptDacV003RegistryReference('not-a-registry-role' as never, input() as never),
    'INVALID_REFERENCE',
    'unknown role',
  );
  // authorityScope / primaryIdentity must be present, non-empty, non-alias
  for (const field of ['authorityScope', 'primaryIdentity']) {
    assertErrorCode(
      () => adoptDacV003RegistryReference('evidence', input({ [field]: '' }) as never),
      'INVALID_REFERENCE',
      `${field} empty`,
    );
    assertErrorCode(
      () => adoptDacV003RegistryReference('evidence', input({ [field]: '  ' }) as never),
      'INVALID_REFERENCE',
      `${field} blank`,
    );
    assertErrorCode(
      () => adoptDacV003RegistryReference('evidence', input({ [field]: 'latest' }) as never),
      'MUTABLE_ALIAS_REJECTED',
      `${field} alias token`,
    );
  }
  // Happy path: obligations minted, role recoverable, structure frozen.
  const ref = adoptDacV003RegistryReference('evidence', input() as never);
  assert.ok(isDacV003Reference(ref));
  assert.equal(getDacV003ReferenceRole(ref), 'evidence');
  assert.equal(ref.role, 'evidence');
  assert.equal(ref.authorityScope, 'composition/example-app');
  assert.equal(ref.primaryIdentity, 'req-host-binding-0001');
  assert.ok(Object.isFrozen(ref));
  assert.deepEqual(ref.locatorHints, []);
  assert.deepEqual({ ...ref.opaque }, {});
});

test('v3-001 alias rejection is exact whole-token only (C39): ids containing alias words pass', () => {
  for (const token of ['LATEST', ' current ', 'Head', 'main', 'master', 'default', 'stable', 'tip']) {
    assertErrorCode(
      () => adoptDacV003RegistryReference('evidence', input({ revisionIdentity: token }) as never),
      'MUTABLE_ALIAS_REJECTED',
      `revisionIdentity "${token}"`,
    );
  }
  const ref = adoptDacV003RegistryReference('evidence', input({
    revisionIdentity: 'rev-latest-snapshot-2026-09-24-0001',
    semanticIdentity: 'sem-current-state-rules',
  }) as never);
  assert.equal(ref.revisionIdentity, 'rev-latest-snapshot-2026-09-24-0001');
  assert.equal(ref.semanticIdentity, 'sem-current-state-rules');
});

test('v3-001 locator hints are preserved verbatim but never authoritative identity', () => {
  const ref = adoptDacV003RegistryReference('evidence', input({
    locatorHints: ['registry://example/invoices', 'https://registry.example/evidence/0001'],
  }) as never);
  assert.deepEqual(ref.locatorHints, [
    'registry://example/invoices',
    'https://registry.example/evidence/0001',
  ]);
  // Hints never become identity: the exact Base Reference Obligations stay
  // on the exact fields even when a locator hint is present.
  assert.equal(ref.primaryIdentity, 'req-host-binding-0001');
  assert.equal(ref.authorityScope, 'composition/example-app');
  // Identity verification never consults locator hints: identical identity
  // expectations pass regardless of hint content.
  verifyDacV003ReferenceIdentity(ref, {
    authorityScope: 'composition/example-app',
    primaryIdentity: 'req-host-binding-0001',
  });
  // A locator hint equal to an expected identity does not become one.
  const other = adoptDacV003RegistryReference('evidence', input({
    primaryIdentity: 'https://registry.example/evidence/0001',
  }) as never);
  assert.notEqual(other.primaryIdentity, ref.primaryIdentity);
  // Malformed hint collections fail closed.
  assertErrorCode(
    () => adoptDacV003RegistryReference('evidence', input({ locatorHints: 'not-an-array' }) as never),
    'INVALID_REFERENCE',
    'locatorHints not an array',
  );
  assertErrorCode(
    () => adoptDacV003RegistryReference('evidence', input({ locatorHints: [''] }) as never),
    'INVALID_REFERENCE',
    'empty locator hint',
  );
});

test('v3-001 opaque fields round-trip verbatim and nested foreign refs fail closed', () => {
  const opaque = { provisionalWireField: { keep: ['me', 42] }, freezeStatus: 'PROVISIONAL' };
  const ref = adoptDacV003RegistryReference('evidence', input({ opaque }) as never);
  assert.deepEqual({ ...ref.opaque }, opaque);
  // Forged structurally-identical objects are never adopted references.
  const forged = { ...ref, role: 'compatibility-result' };
  assert.equal(isDacV003Reference(forged), false);
  assert.equal(getDacV003ReferenceRole(forged), undefined);
  // Nested refs must be genuinely adopted v0.0.3 references.
  assertErrorCode(
    () => adoptDacV003RegistryReference('evidence', input({
      provenanceRefs: [{ adapter: DAC_V003_REFERENCE_ADAPTER_VERSION, role: 'provenance' }],
    }) as never),
    'INVALID_REFERENCE',
    'forged nested ref',
  );
  assertErrorCode(
    () => adoptDacV003RegistryReference('evidence', input({
      derivationOperationRef: { role: 'evolution-operation' },
    }) as never),
    'INVALID_REFERENCE',
    'forged derivation ref',
  );
});

test('v3-001 exported surface freeze (serialized V3 lane single-owner guard)', () => {
  assert.deepEqual(Object.keys(surface).sort(), [
    'DAC_V003_BASELINE',
    'DAC_V003_DISPOSITION_NAMESPACE',
    'DAC_V003_EXACTNESS_PROFILES',
    'DAC_V003_FOUNDATION_ROLES',
    'DAC_V003_PROFILE_REQUIREMENTS',
    'DAC_V003_REFERENCE_ADAPTER_VERSION',
    'DAC_V003_REFERENCE_DISPOSITIONS',
    'DAC_V003_REQUIRED_ROLE_INEQUALITIES',
    'DAC_V003_ROLE_REGISTRY',
    'DAC_V003_UNSAFE_ALIAS_GROUPS',
    'DacV003ReferenceError',
    'adoptDacV003RegistryReference',
    'adoptRuntimeHostBindingRef',
    'adoptRuntimeHostBindingRequirementRef',
    'adoptRuntimeInteractionContractRef',
    'assertDacV003ExactnessProfile',
    'assertDacV003RevisionDigestConsistency',
    'classifyDacV003RequiredTargetState',
    'dacV003ReferenceDisposition',
    'expectRuntimeHostBindingRef',
    'expectRuntimeHostBindingRequirementRef',
    'expectRuntimeInteractionContractRef',
    'getDacV003ReferenceRole',
    'isDacV003Reference',
    'isDacV003ReferenceDisposition',
    'isRuntimeHostBindingRef',
    'isRuntimeHostBindingRequirementRef',
    'isRuntimeInteractionContractRef',
    'refuteDacV003ExternalBusinessSoRIdentity',
    'verifyDacV003ReferenceIdentity',
  ]);
});

test('v3-001 exact-identity verification: mismatch and absence never pass', () => {
  const ref = adoptRuntimeHostBindingRequirementRef(input({
    requiredHostBindingRole: 'durable-store-port',
    semanticIdentity: 'host-binding-requirement/durable-store',
  }) as never);
  verifyDacV003ReferenceIdentity(ref, { semanticIdentity: 'host-binding-requirement/durable-store' });
  assertErrorCode(
    () => verifyDacV003ReferenceIdentity(ref, { semanticIdentity: 'other' }),
    'IDENTITY_MISMATCH',
    'semantic identity mismatch',
  );
  assertErrorCode(
    () => verifyDacV003ReferenceIdentity(ref, { revisionIdentity: 'rev-1' }),
    'IDENTITY_MISMATCH',
    'expected revision on absent field',
  );
});
