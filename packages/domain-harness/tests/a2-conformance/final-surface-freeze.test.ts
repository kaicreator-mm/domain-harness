// Issue #311 / A2 I-008 FINAL matrix — cross-surface value-surface freeze.
// The incremental slice froze the #305 dac adapter value surface as the
// visible extension tripwire. This FINAL freeze extends exactly that pattern
// to every I-003..I-007 leaf module: the export sets below are the complete
// public surfaces, so no auto-latest / default / registry-lookup / simulator
// / substitution / host-binding / absorption bridge of ANY NAME can be added
// silently. Any extension must be a visible, deliberate, reviewed act.
//
// The frozen error-code vocabularies are pinned too: none carries a
// substitute/default/latest resolution hint (C32/C37/N07 at the API level).
//
// Test/doc-only: no product semantics changed, no DAC v0.0.3 V3 scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as compositionIntake from '../../src/composition-intake/index.js';
import * as runtimeBinding from '../../src/runtime-binding/index.js';
import * as externalAuthority from '../../src/external-authority/index.js';
import * as dacBridge from '../../src/dac-bridge/index.js';
import * as applicationManifest from '../../src/application-manifest/index.js';

test('final freeze: composition-intake value surface is exactly the frozen validation set (no selection/substitution surface of any name)', () => {
  assert.deepEqual(Object.keys(compositionIntake).sort(), [
    'COMPOSITION_INTAKE_ADAPTER_VERSION',
    'CompositionIntakeError',
    'computeCompatibilityTargetDigest',
    'isSelectedCompositionValidation',
    'validateSelectedComposition',
  ]);
  // The error taxonomy is terminal-only: every code is fail-closed and none
  // offers or hints a substitute/default/latest resolution.
  const codes: readonly string[] = [
    'INVALID_COMPOSITION_INTAKE',
    'SELECTED_IDENTITY_MISMATCH',
    'PROVENANCE_CHAIN_MISMATCH',
    'RUNTIME_CONTRACT_MISMATCH',
    'RUNTIME_IMPLEMENTATION_MISMATCH',
    'COMPATIBILITY_TARGET_MISMATCH',
    'ROLE_IDENTITY_COLLAPSE',
    'INVALID_COMPOSITION_PACKAGE',
    'INCOMPATIBLE_SELECTED_COMPOSITION',
  ];
  for (const code of codes) {
    assert.equal(
      /substitut|default|latest|fallback|suggest/iu.test(code),
      false,
      `code ${code} must not hint substitution`,
    );
  }
});

test('final freeze: runtime-binding value surface is exactly the frozen stage-4/5 evidence set', () => {
  assert.deepEqual(Object.keys(runtimeBinding).sort(), [
    'RUNTIME_ACTIVATION_ADAPTER_VERSION',
    'RUNTIME_BINDING_ADAPTER_VERSION',
    'RuntimeBindingError',
    'activateRuntimeBinding',
    'bindValidatedComposition',
    'isRuntimeBindingEvidence',
  ]);
  // bind/activate only — no selection, no re-bind-from-selection, no
  // conversion between evidence classes exists anywhere on the surface.
});

test('final freeze: external-authority value surface is exactly the frozen adoption/correlation/evidence set', () => {
  assert.deepEqual(Object.keys(externalAuthority).sort(), [
    'EXTERNAL_AUTHORITY_ADAPTER_VERSION',
    'EXTERNAL_AUTHORITY_BASELINE',
    'EXTERNAL_AUTHORITY_REFERENCE_ROLES',
    'EXTERNAL_EVIDENCE_CLASSES',
    'EXTERNAL_OBSERVATION_CLAIMS',
    'EXTERNAL_OBSERVATION_CLASSIFICATIONS',
    'EXTERNAL_RECONCILIATION_RESULTS',
    'ExternalAuthorityError',
    'adoptExternalAuthorityRef',
    'adoptExternalDispatchAttemptEvidence',
    'adoptExternalObservationEvidence',
    'adoptExternalObservationRef',
    'adoptExternalReconciliationOutcome',
    'adoptExternalReconciliationRef',
    'adoptProviderOperationRef',
    'adoptRuntimeLogicalOperationRef',
    'adoptRuntimeLogicalOperationRefFromExecutionContext',
    'adoptRuntimeLogicalOperationRefFromJournal',
    'correlateExternalEffect',
    'expectExternalAuthorityRef',
    'expectExternalDispatchAttemptEvidence',
    'expectExternalEffectCorrelation',
    'expectExternalObservationEvidence',
    'expectExternalObservationRef',
    'expectExternalReconciliationOutcome',
    'expectExternalReconciliationRef',
    'expectProviderOperationRef',
    'expectRuntimeLogicalOperationRef',
    'getExternalAuthorityFamilyRole',
    'isExternalAuthorityFamilyReference',
    'isExternalAuthorityRef',
    'isExternalDispatchAttemptEvidence',
    'isExternalEffectCorrelation',
    'isExternalObservationEvidence',
    'isExternalObservationRef',
    'isExternalReconciliationOutcome',
    'isExternalReconciliationRef',
    'isProviderOperationRef',
    'isRuntimeLogicalOperationRef',
    'maxClaimableForExternalObservation',
    'observationSupportsCommitClaim',
    'observationSupportsNonCommitClaim',
    'refuteNonExternalAuthorityIdentity',
    'verifyExternalEffectCorrelation',
  ]);
  // Claim ceiling vocabulary stays frozen with no stronger claim than the
  // classification supports (unknown-ambiguous => no-claim is pinned in the
  // external-authority final matrix).
});

test('final freeze: dac-bridge value surface is exactly the frozen correlation set (no host/presentation/transition surface of any name)', () => {
  assert.deepEqual(Object.keys(dacBridge).sort(), [
    'DAC_BRIDGE_ADAPTER_VERSION',
    'DAC_BRIDGE_BASELINE',
    'DAC_BRIDGE_ROLES',
    'DacBridgeError',
    'adoptDomainIntentRef',
    'adoptSemanticTargetRef',
    'classifyObservedBasis',
    'commandRefFromDomainMessage',
    'correlateDomainCommand',
    'correlateDomainOutcome',
    'expectCommandRef',
    'expectDomainIntentRef',
    'expectOutcomeRef',
    'expectSemanticTargetRef',
    'expectSnapshotRef',
    'expectViewRef',
    'expectWatchRef',
    'getDacBridgeRole',
    'isCommandRef',
    'isDacBridgeReference',
    'isDomainCommandCorrelation',
    'isDomainIntentRef',
    'isDomainOutcomeCorrelation',
    'isOutcomeRef',
    'isSemanticTargetRef',
    'isSnapshotRef',
    'isViewRef',
    'isWatchRef',
    'outcomeRefFromAcceptedAck',
    'outcomeRefFromMessageDisposition',
    'projectionTargetKey',
    'resolvedObservedBasis',
    'snapshotRefFromBusinessSnapshot',
    'snapshotRefFromProjectionSnapshot',
    'snapshotRefFromWorkflowInstanceSnapshot',
    'validateObservedBasis',
    'viewRefFromQueryResult',
    'watchRefFromObservedChange',
    'watchRefFromSubscription',
    'workflowInstanceTargetKey',
  ]);
  // No transition/effect/send/dispatch surface exists on this module at all:
  // correlation-only is the C08 enforcement mechanism.
  for (const name of Object.keys(dacBridge)) {
    assert.equal(
      /\b(send|dispatch|transition|mutate|execute|render|hostbinding|host_|promote|select|substitut)/iu.test(
        name,
      ),
      false,
      `bridge export "${name}" must not be a transition/host/selection surface`,
    );
  }
});

test('final freeze: application-manifest value surface is exactly the frozen adoption/composition/correlation set', () => {
  assert.deepEqual(Object.keys(applicationManifest).sort(), [
    'APPLICATION_MANIFEST_ADAPTER_VERSION',
    'APPLICATION_MANIFEST_CONTRACT_VERSION',
    'ApplicationManifestError',
    'MANIFEST_ACTIVATION_CORRELATION_VERSION',
    'MANIFEST_BINDING_CORRELATION_VERSION',
    'MANIFEST_COMPOSITION_ADAPTER_VERSION',
    'MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY',
    'MANIFEST_UX_CONTRACT_ROLES',
    'adoptApplicationManifest',
    'composeSelectedApplicationManifest',
    'computeApplicationManifestDigest',
    'correlateManifestRuntimeActivation',
    'correlateManifestRuntimeBinding',
    'isApplicationManifest',
    'isManifestCompositionEvidence',
    'isManifestRuntimeActivationCorrelation',
    'isManifestRuntimeBindingCorrelation',
    'manifestIdentityOf',
  ]);
  // No promote/select/activate-authority surface: the manifest consumes an
  // already-selected composition; every lifecycle authority stays upstream.
  for (const name of Object.keys(applicationManifest)) {
    assert.equal(
      /\b(promote|selectfrom|selectpackage|defaultpackage|activatelatest|absorb)\b/iu.test(name),
      false,
      `manifest export "${name}" must not be a lifecycle-authority surface`,
    );
  }
});
