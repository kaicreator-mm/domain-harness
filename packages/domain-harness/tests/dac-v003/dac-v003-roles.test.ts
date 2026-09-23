// Issue #323 / DAC v0.0.3 V3-001 — the three foundation-owned nominal refs
// (RuntimeHostBindingRequirementRef / RuntimeHostBindingRef /
// RuntimeInteractionContractRef): role-specific minimums, the exhaustive
// role-guard matrix, the frozen unsafe-alias grouping (requirement !=
// concrete host binding != lifecycle RuntimeBindingRef; conformance C56),
// the retained lifecycle inequalities, and external-SoR identity refutation
// (C60). No compatibility evaluation, binding or activation semantics exist
// here — those belong to V3-002+.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  DAC_V003_FOUNDATION_ROLES,
  DAC_V003_REQUIRED_ROLE_INEQUALITIES,
  DAC_V003_ROLE_REGISTRY,
  DAC_V003_UNSAFE_ALIAS_GROUPS,
  DacV003ReferenceError,
  adoptDacV003RegistryReference,
  adoptRuntimeHostBindingRef,
  adoptRuntimeHostBindingRequirementRef,
  adoptRuntimeInteractionContractRef,
  expectRuntimeHostBindingRef,
  expectRuntimeHostBindingRequirementRef,
  expectRuntimeInteractionContractRef,
  getDacV003ReferenceRole,
  isRuntimeHostBindingRef,
  isRuntimeHostBindingRequirementRef,
  isRuntimeInteractionContractRef,
  refuteDacV003ExternalBusinessSoRIdentity,
} from '../../src/dac-v003/index.js';
import type { DacV003Reference } from '../../src/dac-v003/index.js';

function input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'composition/example-app',
    primaryIdentity: 'p-0001',
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

test('v3-001 RuntimeHostBindingRequirementRef: declaration with requiredHostBindingRole, never binding evidence', () => {
  const requirement = adoptRuntimeHostBindingRequirementRef(input({
    requiredHostBindingRole: 'durable-store-port',
  }) as never);
  assert.equal(requirement.role, 'runtime-host-binding-requirement');
  assert.equal(requirement.requiredHostBindingRole, 'durable-store-port');
  assert.ok(isRuntimeHostBindingRequirementRef(requirement));
  // The declaration is impossible without the required host-binding role.
  assertErrorCode(
    () => adoptRuntimeHostBindingRequirementRef(input() as never),
    'INVALID_REFERENCE',
    'requirement without requiredHostBindingRole',
  );
  assertErrorCode(
    () => adoptRuntimeHostBindingRequirementRef(input({ requiredHostBindingRole: '' }) as never),
    'INVALID_REFERENCE',
    'empty requiredHostBindingRole',
  );
  // The generic registry path enforces the same minimum — no bypass.
  assertErrorCode(
    () => adoptDacV003RegistryReference('runtime-host-binding-requirement', input() as never),
    'INVALID_REFERENCE',
    'generic path without requiredHostBindingRole',
  );
  const generic = adoptDacV003RegistryReference('runtime-host-binding-requirement', input({
    requiredHostBindingRole: 'durable-store-port',
  }) as never);
  assert.ok(isRuntimeHostBindingRequirementRef(generic));
});

test('v3-001 RuntimeHostBindingRef: concrete adapter identity requires semanticIdentity', () => {
  const hostBinding = adoptRuntimeHostBindingRef(input({
    primaryIdentity: 'hb-sqlite-adapter-0001',
    semanticIdentity: 'host-binding/sqlite-durable-store',
    revisionIdentity: 'hb-1.4.0',
    contentDigest: 'sha256:cccc',
  }) as never);
  assert.equal(hostBinding.role, 'runtime-host-binding');
  assert.equal(hostBinding.semanticIdentity, 'host-binding/sqlite-durable-store');
  assert.ok(isRuntimeHostBindingRef(hostBinding));
  assertErrorCode(
    () => adoptRuntimeHostBindingRef(input() as never),
    'INVALID_REFERENCE',
    'host binding without semanticIdentity',
  );
  assertErrorCode(
    () => adoptDacV003RegistryReference('runtime-host-binding', input() as never),
    'INVALID_REFERENCE',
    'generic path without semanticIdentity',
  );
});

test('v3-001 RuntimeInteractionContractRef: immutable semantic contract, no floating current target', () => {
  const contract = adoptRuntimeInteractionContractRef(input({
    primaryIdentity: 'ric-intent-outcome-0001',
    semanticIdentity: 'runtime-interaction/intent-outcome-v1',
    revisionIdentity: 'ric-1.0.0',
  }) as never);
  assert.equal(contract.role, 'runtime-interaction-contract');
  assert.equal(contract.revisionIdentity, 'ric-1.0.0');
  assert.ok(isRuntimeInteractionContractRef(contract));
  assertErrorCode(
    () =>
      adoptRuntimeInteractionContractRef(input({
        primaryIdentity: 'ric-2',
        semanticIdentity: 'runtime-interaction/intent-outcome-v1',
      }) as never),
    'INVALID_REFERENCE',
    'interaction contract without revisionIdentity',
  );
  assertErrorCode(
    () =>
      adoptRuntimeInteractionContractRef(input({
        primaryIdentity: 'ric-3',
        semanticIdentity: 'runtime-interaction/intent-outcome-v1',
        revisionIdentity: 'latest',
      }) as never),
    'MUTABLE_ALIAS_REJECTED',
    'floating current interaction contract',
  );
});

test('v3-001 exhaustive guard matrix: no foundation role guard accepts any other role', () => {
  const requirement = adoptRuntimeHostBindingRequirementRef(input({
    primaryIdentity: 'm-req',
    requiredHostBindingRole: 'durable-store-port',
  }) as never);
  const hostBinding = adoptRuntimeHostBindingRef(input({
    primaryIdentity: 'm-hb',
    semanticIdentity: 'host-binding/sqlite-durable-store',
  }) as never);
  const interactionContract = adoptRuntimeInteractionContractRef(input({
    primaryIdentity: 'm-ric',
    semanticIdentity: 'runtime-interaction/intent-outcome-v1',
    revisionIdentity: 'ric-1.0.0',
  }) as never);
  const lifecycleBinding = adoptDacV003RegistryReference('runtime-binding', input({
    primaryIdentity: 'm-rb',
  }) as never);
  const matrix: ReadonlyArray<readonly [string, DacV003Reference]> = [
    ['runtime-host-binding-requirement', requirement],
    ['runtime-host-binding', hostBinding],
    ['runtime-interaction-contract', interactionContract],
    ['runtime-binding', lifecycleBinding],
  ];
  for (const [sourceRole, sourceRef] of matrix) {
    assert.equal(isRuntimeHostBindingRequirementRef(sourceRef), sourceRole === 'runtime-host-binding-requirement');
    assert.equal(isRuntimeHostBindingRef(sourceRef), sourceRole === 'runtime-host-binding');
    assert.equal(isRuntimeInteractionContractRef(sourceRef), sourceRole === 'runtime-interaction-contract');
  }
  // expect* guards: the matching role passes silently; every other role (and
  // the lifecycle runtime-binding role in particular) throws ROLE_MISMATCH.
  // Assertion guards are invoked directly — they cannot be called through a
  // union-typed binding (TS2775), which itself pins their nominal typing.
  expectRuntimeHostBindingRequirementRef(requirement);
  expectRuntimeHostBindingRef(hostBinding);
  expectRuntimeInteractionContractRef(interactionContract);
  assert.throws(() => expectRuntimeHostBindingRequirementRef(hostBinding), /ROLE_MISMATCH/);
  assert.throws(() => expectRuntimeHostBindingRequirementRef(interactionContract), /ROLE_MISMATCH/);
  assert.throws(() => expectRuntimeHostBindingRequirementRef(lifecycleBinding), /ROLE_MISMATCH/);
  assert.throws(() => expectRuntimeHostBindingRef(requirement), /ROLE_MISMATCH/);
  assert.throws(() => expectRuntimeHostBindingRef(interactionContract), /ROLE_MISMATCH/);
  assert.throws(() => expectRuntimeHostBindingRef(lifecycleBinding), /ROLE_MISMATCH/);
  assert.throws(() => expectRuntimeInteractionContractRef(requirement), /ROLE_MISMATCH/);
  assert.throws(() => expectRuntimeInteractionContractRef(hostBinding), /ROLE_MISMATCH/);
  assert.throws(() => expectRuntimeInteractionContractRef(lifecycleBinding), /ROLE_MISMATCH/);
  assert.equal(getDacV003ReferenceRole(lifecycleBinding), 'runtime-binding');
});

test('v3-001 frozen registry vocabulary: unsafe-alias groups and lifecycle inequalities (CROSS_LAYER_REFERENCES §6)', () => {
  // §6.2 — the three unsafe-alias groups verbatim.
  assert.deepEqual(DAC_V003_UNSAFE_ALIAS_GROUPS.map((g) => [...g]), [
    ['runtime-host-binding-requirement', 'runtime-host-binding', 'runtime-binding'],
    ['logical-operation', 'evolution-operation', 'authoring-capability-request'],
    [
      'domain-data-revision',
      'authored-candidate',
      'evolved-candidate',
      'selected-domain-data',
    ],
  ]);
  for (const group of DAC_V003_UNSAFE_ALIAS_GROUPS) {
    for (const role of group) {
      assert.ok(
        (DAC_V003_ROLE_REGISTRY as readonly string[]).includes(role),
        `registry must contain ${role}`,
      );
    }
  }
  // §6.5 — retained v0.0.2 lifecycle inequalities.
  assert.deepEqual([...DAC_V003_REQUIRED_ROLE_INEQUALITIES], [
    'application-selection != compatibility-validation',
    'compatibility-validation != runtime-binding',
    'runtime-binding != runtime-activation',
    'runtime-contract != runtime-implementation',
    'promotion-decision != application-selection',
  ]);
  // Every dedicated foundation role is registry vocabulary.
  assert.deepEqual([...DAC_V003_FOUNDATION_ROLES], [
    'runtime-host-binding-requirement',
    'runtime-host-binding',
    'runtime-interaction-contract',
  ]);
});

test('v3-001 C60: no v0.0.3 reference can substitute external Business SoR identity', () => {
  const refs = [
    adoptRuntimeHostBindingRequirementRef(input({
      primaryIdentity: 's-req',
      requiredHostBindingRole: 'durable-store-port',
    }) as never),
    adoptRuntimeHostBindingRef(input({
      primaryIdentity: 's-hb',
      semanticIdentity: 'host-binding/sqlite-durable-store',
    }) as never),
    adoptRuntimeInteractionContractRef(input({
      primaryIdentity: 's-ric',
      semanticIdentity: 'runtime-interaction/intent-outcome-v1',
      revisionIdentity: 'ric-1.0.0',
    }) as never),
    adoptDacV003RegistryReference('runtime-implementation', input({
      primaryIdentity: 's-ri',
    }) as never),
    adoptDacV003RegistryReference('external-authority', input({
      primaryIdentity: 's-ea',
    }) as never),
  ];
  for (const r of refs) {
    assert.throws(() => refuteDacV003ExternalBusinessSoRIdentity(r), /EXTERNAL_IDENTITY_FORBIDDEN/);
  }
  // Non-references pass through silently.
  refuteDacV003ExternalBusinessSoRIdentity({ some: 'object' });
  refuteDacV003ExternalBusinessSoRIdentity(null);
});
