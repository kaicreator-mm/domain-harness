// Issue #327 / DAC v0.0.3 V3-003 — §10 recovery / external capability
// declarations: declaration != proven satisfaction (bare declarations fail
// the satisfaction closure), the two capability roles stay distinct from a
// composition capability-requirement reference, cancel/abort is a REQUEST
// semantic only and never implies rollback/non-commit/reversal, and the
// provider-private proof protocol ownership stays OPEN_NOT_OWNED.
import assert from 'node:assert/strict';
import test from 'node:test';
import { adoptDacV003RegistryReference, DAC_V003_BASELINE as FOUNDATION_BASELINE } from '../../src/dac-v003/index.js';
import {
  DAC_V003_PROVIDER_PROOF_PROTOCOL_OWNERSHIP,
  DAC_V003_RECOVERY_CAPABILITY_FAMILIES,
  DacV003ExternalError,
  assertDacV003CapabilitySatisfaction,
  declareDacV003ExternalCapability,
  declareDacV003RecoveryCapability,
  expectDacV003ExternalCapabilityRef,
  expectDacV003RecoveryCapabilityRef,
  isDacV003ExternalCapabilityRef,
  isDacV003RecoveryCapabilityRef,
  refuteDacV003LocalCauseAsRemoteTruth,
} from '../../src/dac-v003-external/index.js';
import {
  assertErrorCode,
  externalAuthority,
  externalCapability,
  recoveryCapability,
  BASELINE,
} from './external-fixture.js';

test('v3-003 §10: capability declarations carry the closed family vocabulary', () => {
  assert.deepEqual([...DAC_V003_RECOVERY_CAPABILITY_FAMILIES], [
    'query-status',
    'watch-poll-subscription',
    'resume-existing-provider-operation',
    'safe-same-operation-retry',
    'idempotent-replay',
    'reconciliation',
    'cancel-abort-request',
  ]);
  const recovery = recoveryCapability();
  const external = externalCapability();
  assert.equal(recovery.reference.role, 'recovery-capability');
  assert.equal(external.reference.role, 'external-capability');
  assert.ok(isDacV003RecoveryCapabilityRef(recovery));
  assert.ok(isDacV003ExternalCapabilityRef(external));
  expectDacV003RecoveryCapabilityRef(recovery);
  expectDacV003ExternalCapabilityRef(external);
  // The two nominal roles are not interchangeable.
  assert.equal(isDacV003ExternalCapabilityRef(recovery), false);
  assert.equal(isDacV003RecoveryCapabilityRef(external), false);
  assert.throws(
    () => expectDacV003RecoveryCapabilityRef(external),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'ROLE_MISMATCH',
  );
  assertErrorCode(
    () => declareDacV003RecoveryCapability({
      baseline: BASELINE,
      capabilityFamily: 'rollback-committed-effects' as never,
      externalAuthority: externalAuthority(),
      capabilityIdentity: 'cap-x',
      issuer: 'adapter',
    }),
    'INVALID_EXTERNAL_BINDING',
    'an invented capability family fails closed (rollback is not a declarable meaning)',
  );
});

test('v3-003 §10: declared capability != proven satisfaction', () => {
  const bare = recoveryCapability();
  assert.equal(bare.satisfactionEvidenceRefs.length, 0);
  assertErrorCode(
    () => assertDacV003CapabilitySatisfaction([bare], 'query-status'),
    'CAPABILITY_DECLARATION_NOT_PROVEN',
    'a bare declaration never proves the provider satisfies the capability',
  );
  const proven = recoveryCapability({
    satisfactionEvidenceRefs: [
      adoptDacV003RegistryReference('conformance-evidence', {
        baseline: FOUNDATION_BASELINE,
        authorityScope: 'adapter/capability-conformance',
        primaryIdentity: 'cap-evidence',
      }),
    ],
  });
  assertDacV003CapabilitySatisfaction([bare, proven], 'query-status');
  // A declaration of ANOTHER family proves nothing for the required family.
  const otherFamily = externalCapability({ capabilityFamily: 'idempotent-replay' });
  assertErrorCode(
    () => assertDacV003CapabilitySatisfaction([otherFamily], 'query-status'),
    'CAPABILITY_DECLARATION_NOT_PROVEN',
    'capability families do not cross-satisfy',
  );
  // Foreign/forged declarations fail closed.
  assertErrorCode(
    () =>
      assertDacV003CapabilitySatisfaction(
        [{ capabilityFamily: 'query-status' } as never],
        'query-status',
      ),
    'ROLE_MISMATCH',
    'a forged declaration object is rejected',
  );
});

test('v3-003 §10: capability declarations never collapse with composition capability requirements', () => {
  const compositionRequirement = adoptDacV003RegistryReference('capability-requirement', {
    baseline: BASELINE,
    authorityScope: 'composition/example-app',
    primaryIdentity: 'cap-req-1',
  });
  assert.throws(
    () => expectDacV003RecoveryCapabilityRef(compositionRequirement),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'ROLE_MISMATCH',
    'a composition capability-requirement envelope is not a recovery capability declaration',
  );
  assert.equal(isDacV003RecoveryCapabilityRef(compositionRequirement), false);
  assert.equal(isDacV003ExternalCapabilityRef(compositionRequirement), false);
});

test('v3-003 §10: cancel/abort is a request semantic only — never rollback/non-commit', () => {
  const cancelCapability = declareDacV003ExternalCapability({
    baseline: BASELINE,
    capabilityFamily: 'cancel-abort-request',
    externalAuthority: externalAuthority(),
    capabilityIdentity: 'cap-cancel-1',
    issuer: 'payment-adapter',
    applicabilityConditions: ['before-provider-settlement'],
  });
  assert.equal(cancelCapability.capabilityFamily, 'cancel-abort-request');
  // No surface turns the declaration into a remote truth claim, and a local
  // cancel can never be presented as remote rollback / non-commit.
  assert.throws(
    () =>
      refuteDacV003LocalCauseAsRemoteTruth({
        cause: 'local-cancel',
        claimedRemoteTruth: 'rollback',
      }),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'LOCAL_CAUSE_FORBIDDEN',
  );
  assert.throws(
    () =>
      refuteDacV003LocalCauseAsRemoteTruth({
        cause: 'local-interrupt',
        claimedRemoteTruth: 'RECONCILED_NOT_COMMITTED',
      }),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'LOCAL_CAUSE_FORBIDDEN',
  );
});

test('v3-003 §16: provider-private proof protocols stay OPEN_NOT_OWNED', () => {
  assert.equal(DAC_V003_PROVIDER_PROOF_PROTOCOL_OWNERSHIP, 'OPEN_NOT_OWNED');
  // The surface offers no provider-proof parsing/validation: the only way a
  // known-non-commit enters is a caller-adopted attempt evidence class or an
  // authoritative observation class — never a locally invented proof token.
  const surface = String(declareDacV003RecoveryCapability);
  assert.ok(!/verifyProviderProof|parseProviderProof|decodeProviderAttestation/.test(surface));
});
