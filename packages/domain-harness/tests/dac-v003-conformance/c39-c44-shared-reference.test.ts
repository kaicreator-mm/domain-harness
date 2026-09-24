// Issue #329 / DAC v0.0.3 V3-005 — C39–C44 executable conformance closure:
// the Shared Reference group (Base Reference / P0–P7 exactness and the
// repaired required-target disposition rule), proven against the merged
// #323 V3-001 foundation and the #325/#339 V3-002 compatibility authority.
//
// Additive conformance evidence only: no product surface is edited here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  DAC_V003_EXACTNESS_PROFILES,
  DAC_V003_REQUIRED_ROLE_INEQUALITIES,
  DAC_V003_UNSAFE_ALIAS_GROUPS,
  DacV003ReferenceError,
  adoptDacV003RegistryReference,
  adoptRuntimeHostBindingRef,
  adoptRuntimeHostBindingRequirementRef,
  adoptRuntimeInteractionContractRef,
  assertDacV003ExactnessProfile,
  assertDacV003RevisionDigestConsistency,
  classifyDacV003RequiredTargetState,
  verifyDacV003ReferenceIdentity,
} from '../../src/dac-v003/index.js';
import { validateDacV003Compatibility } from '../../src/dac-v003-compatibility/index.js';
import {
  buildCompatibleRequest,
  buildV003Refs,
} from '../dac-v003/compatibility-fixture.js';
import { adoptDacV003CompatibilityTargetRef } from '../../src/dac-v003-compatibility/index.js';

const baseline = { ...DAC_V003_BASELINE };

function expectReferenceError(fn: () => void, code: string, label: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught instanceof DacV003ReferenceError,
    `${label}: expected DacV003ReferenceError, got ${
      caught instanceof Error ? caught.message : String(caught)
    }`,
  );
  assert.equal((caught as DacV003ReferenceError).code, code, `${label}: code`);
}

test('C39: authoritative reference pinned to a latest/current/head alias fails closed at every identity slot', () => {
  for (const alias of ['latest', 'current', 'head']) {
    expectReferenceError(
      () =>
        adoptDacV003RegistryReference('promoted-domain-data', {
          baseline,
          authorityScope: 'dac://governance/promotion',
          primaryIdentity: alias,
        }),
      'MUTABLE_ALIAS_REJECTED',
      `primaryIdentity "${alias}"`,
    );
    expectReferenceError(
      () =>
        adoptDacV003RegistryReference('promoted-domain-data', {
          baseline,
          authorityScope: 'dac://governance/promotion',
          primaryIdentity: `promotion/${alias}-1`,
          semanticIdentity: alias,
          revisionIdentity: 'rev-1',
        }),
      'MUTABLE_ALIAS_REJECTED',
      `semanticIdentity "${alias}"`,
    );
    expectReferenceError(
      () =>
        adoptDacV003RegistryReference('promoted-domain-data', {
          baseline,
          authorityScope: 'dac://governance/promotion',
          primaryIdentity: 'promotion/exact-1',
          revisionIdentity: alias,
        }),
      'MUTABLE_ALIAS_REJECTED',
      `revisionIdentity "${alias}"`,
    );
  }
  // Locator hints MAY carry aliases (discovery only) and never become
  // authority identity: the exact identity of the adopted reference is the
  // exact slot values, not the hint.
  const adopted = adoptDacV003RegistryReference('promoted-domain-data', {
    baseline,
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: 'promotion/exact-1',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'pkg-rev-000042',
    locatorHints: ['latest', 'refs/heads/main'],
  });
  assert.equal(adopted.primaryIdentity, 'promotion/exact-1');
  assert.deepEqual([...adopted.locatorHints], ['latest', 'refs/heads/main']);
  // Identity verification never reads a locator hint as authority identity.
  assert.throws(
    () =>
      verifyDacV003ReferenceIdentity(adopted, {
        semanticIdentity: 'latest',
        revisionIdentity: 'rev-000042',
      }),
    (error: unknown) =>
      error instanceof DacV003ReferenceError && error.code === 'IDENTITY_MISMATCH',
  );
});

test('C40: same immutable revision identity with a different authoritative digest fails closed with no identity-preserving reconciliation', () => {
  const first = adoptDacV003RegistryReference('promoted-domain-data', {
    baseline,
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: 'promotion/exact-1',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'sha256:aaa',
  });
  const sameRevisionOtherDigest = adoptDacV003RegistryReference('promoted-domain-data', {
    baseline,
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: 'promotion/exact-1-again',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'sha256:bbb',
  });
  const differentRevision = adoptDacV003RegistryReference('promoted-domain-data', {
    baseline,
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: 'promotion/exact-2',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000043',
    contentDigest: 'sha256:bbb',
  });
  expectReferenceError(
    () => assertDacV003RevisionDigestConsistency([first, sameRevisionOtherDigest]),
    'REVISION_DIGEST_CONTRADICTION',
    'same revision, different digests',
  );
  // Order independence: the contradiction is symmetric.
  expectReferenceError(
    () => assertDacV003RevisionDigestConsistency([sameRevisionOtherDigest, first]),
    'REVISION_DIGEST_CONTRADICTION',
    'same revision, different digests (reversed)',
  );
  // Different revisions with different digests are ordinary distinct data.
  assert.doesNotThrow(() =>
    assertDacV003RevisionDigestConsistency([first, differentRevision]),
  );
});

test('C41: the same digest under a different authority/scope never merges authority — explicit adoption is required per scope', () => {
  const governanceAdopted = adoptDacV003RegistryReference('promoted-domain-data', {
    baseline,
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: 'promotion/governance-1',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'sha256:shared',
  });
  const foreignScopeAdopted = adoptDacV003RegistryReference('promoted-domain-data', {
    baseline,
    authorityScope: 'dac://other-org/governance',
    primaryIdentity: 'promotion/other-org-1',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'sha256:shared',
  });
  // Byte-identical content does not transfer authority: the two adopted
  // references stay distinct objects with distinct scopes, and scope is part
  // of identity verification.
  assert.notEqual(governanceAdopted, foreignScopeAdopted);
  assert.notEqual(governanceAdopted.authorityScope, foreignScopeAdopted.authorityScope);
  assert.throws(
    () =>
      verifyDacV003ReferenceIdentity(foreignScopeAdopted, {
        authorityScope: governanceAdopted.authorityScope,
      }),
    (error: unknown) =>
      error instanceof DacV003ReferenceError && error.code === 'IDENTITY_MISMATCH',
  );
  // The revision/digest consistency guard keys on (scope, revision), so the
  // same digest bytes under different scopes are NOT a contradiction —
  // they are two adoptions, each explicit.
  assert.doesNotThrow(() =>
    assertDacV003RevisionDigestConsistency([governanceAdopted, foreignScopeAdopted]),
  );
});

test('C42: evidence recorded for exact revision A is rejected for authoritative reuse against revision B', () => {
  const evidenceForA = adoptDacV003RegistryReference('evidence', {
    baseline,
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'evidence/eval-A',
    semanticIdentity: 'fixture-domain-evaluation',
    revisionIdentity: 'rev-000042',
    contentDigest: 'pkg-rev-000042',
    materialInputRefs: [
      adoptDacV003RegistryReference('domain-data-revision', {
        baseline,
        authorityScope: 'dac://governance/promotion',
        primaryIdentity: 'revision/rev-000042',
        semanticIdentity: 'fixture-domain',
        revisionIdentity: 'rev-000042',
      }),
    ],
    provenanceRefs: [
      adoptDacV003RegistryReference('provenance', {
        baseline,
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: 'provenance/validator-1',
      }),
    ],
  });
  // P6 exactness holds for the evidence as recorded — against revision A.
  assert.doesNotThrow(() => assertDacV003ExactnessProfile(evidenceForA, 'P6'));
  // Reusing it for revision B is an identity mismatch, never a pass —
  // for the revision slot, the digest slot, and the semantic name alone
  // (a matching semantic name does not make evidence transferable).
  for (const expectation of [
    { revisionIdentity: 'rev-000043' },
    { contentDigest: 'pkg-rev-000043' },
    { semanticIdentity: 'other-domain' },
  ]) {
    assert.throws(
      () => verifyDacV003ReferenceIdentity(evidenceForA, expectation),
      (error: unknown) =>
        error instanceof DacV003ReferenceError && error.code === 'IDENTITY_MISMATCH',
      `evidence reuse expectation ${JSON.stringify(expectation)}`,
    );
  }
  // A missing expectation slot against an absent field is also never a pass.
  assert.throws(
    () => verifyDacV003ReferenceIdentity(evidenceForA, { logicalOperationIdentity: 'op-1' }),
    (error: unknown) =>
      error instanceof DacV003ReferenceError && error.code === 'IDENTITY_MISMATCH',
  );
});

test('C43: missing required CompatibilityTargetRef fails closed and never infers an ambient runtime', async () => {
  // The frozen target-state rule itself.
  assert.deepEqual(
    classifyDacV003RequiredTargetState({ presence: 'missing' }),
    { namespace: 'dac-v003/reference-compatibility-disposition', value: 'FAIL_CLOSED' },
  );
  // The real compatibility authority over the full request closure.
  const request = await buildCompatibleRequest({ compatibilityTarget: undefined });
  const validation = await validateDacV003Compatibility(request);
  assert.equal(validation.disposition.value, 'FAIL_CLOSED');
  assert.ok(
    validation.findings.some((f) => f.includes('missing required compatibility target')),
    'the FAIL_CLOSED finding names the missing explicit target',
  );
  assert.equal(validation.subject.targetProfile, undefined);
  // FAIL_CLOSED is not COMPATIBLE: nothing downstream may treat the subject
  // as eligible for binding on this validation.
  assert.notEqual(validation.disposition.value, 'COMPATIBLE');
});

test('C44: an explicit but unsupported compatibility target is INCOMPATIBLE, never classified as missing/unknown', async () => {
  assert.deepEqual(
    classifyDacV003RequiredTargetState({
      presence: 'explicit',
      declaredSupport: 'unsupported',
    }),
    { namespace: 'dac-v003/reference-compatibility-disposition', value: 'INCOMPATIBLE' },
  );
  // The real authority: an exact target whose profile key is outside the
  // validator environment's declared support set.
  const refs = buildV003Refs();
  const explicitUnsupportedTarget = adoptDacV003CompatibilityTargetRef({
    baseline,
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'compat-target/other-runtime-9',
    contractProfileIdentity: 'some-other-runtime',
    revisionIdentity: 'profile/other-9',
  });
  assert.notEqual(explicitUnsupportedTarget.primaryIdentity, refs.target.primaryIdentity);
  const request = await buildCompatibleRequest({
    compatibilityTarget: explicitUnsupportedTarget,
  });
  const validation = await validateDacV003Compatibility(request);
  assert.equal(validation.disposition.value, 'INCOMPATIBLE');
  assert.equal(
    validation.subject.targetProfile,
    'some-other-runtime@profile/other-9',
    'the explicit target stays explicit in the subject closure',
  );
  assert.ok(
    validation.findings.some((f) => f.includes('declared but unsupported')),
    'the INCOMPATIBLE finding distinguishes unsupported from missing',
  );
  // The two dispositions are never collapsed: FAIL_CLOSED (C43) and
  // INCOMPATIBLE (C44) are distinct values of the frozen vocabulary.
  assert.notEqual(
    classifyDacV003RequiredTargetState({ presence: 'missing' }).value,
    classifyDacV003RequiredTargetState({
      presence: 'explicit',
      declaredSupport: 'unsupported',
    }).value,
  );
});

test('C39–C60 foundation: the three nominal reference roles and every frozen role inequality stay structurally distinct', () => {
  const requirement = adoptRuntimeHostBindingRequirementRef({
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'hb-req/sqlite-1',
    requiredHostBindingRole: 'runtime-port/sqlite-storage',
  });
  const hostBinding = adoptRuntimeHostBindingRef({
    baseline,
    authorityScope: 'domain-harness://host-bindings',
    primaryIdentity: 'hb/node-sqlite-1',
    semanticIdentity: 'node-sqlite-adapter',
  });
  const interactionContract = adoptRuntimeInteractionContractRef({
    baseline,
    authorityScope: 'domain-harness://runtime/interaction',
    primaryIdentity: 'interaction/tally-1',
    semanticIdentity: 'tally-semantic-interaction',
    revisionIdentity: 'interaction-rev-1',
  });
  assert.equal(requirement.role, 'runtime-host-binding-requirement');
  assert.equal(hostBinding.role, 'runtime-host-binding');
  assert.equal(interactionContract.role, 'runtime-interaction-contract');
  assert.notEqual(requirement.role, hostBinding.role);
  // The unsafe-alias group [requirement, host-binding, runtime-binding] and
  // the frozen role inequalities are data — asserted, not assumed.
  assert.ok(
    DAC_V003_UNSAFE_ALIAS_GROUPS.some(
      (group) =>
        (group as readonly string[]).includes('runtime-host-binding-requirement') &&
        (group as readonly string[]).includes('runtime-host-binding') &&
        (group as readonly string[]).includes('runtime-binding'),
    ),
  );
  assert.ok(
    DAC_V003_REQUIRED_ROLE_INEQUALITIES.includes('promotion-decision != application-selection'),
  );
  assert.ok(
    DAC_V003_REQUIRED_ROLE_INEQUALITIES.includes(
      'application-selection != compatibility-validation',
    ),
  );
  assert.ok(
    DAC_V003_REQUIRED_ROLE_INEQUALITIES.includes('compatibility-validation != runtime-binding'),
  );
  assert.ok(
    DAC_V003_REQUIRED_ROLE_INEQUALITIES.includes('runtime-binding != runtime-activation'),
  );
  assert.ok(
    DAC_V003_REQUIRED_ROLE_INEQUALITIES.includes('runtime-contract != runtime-implementation'),
  );
  // Every exactness profile P0–P7 is a frozen requirement primitive.
  assert.deepEqual([...DAC_V003_EXACTNESS_PROFILES], [
    'P0',
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
    'P6',
    'P7',
  ]);
});
