// Issue #311 / A2 I-008 FINAL matrix — the C36 full positive journey across
// EVERY landed A2 surface (I-002..I-007) in one coherent identity story, with
// the dispatch's collapse attacks re-run against the completed chain:
//
//   #305 promotion/selection/selected/contract/implementation/target refs
//     -> #306 compatibility validation (stage 3)
//     -> #307 runtime binding (stage 4) + technical activation (stage 5)
//     -> #310 manifest adoption -> composition -> binding/activation
//        correlations (separate evidence)
//     -> #308 UX intent/command/outcome correlation with a CURRENT basis
//     -> #309 external effect correlation -> dispatch -> commit observation
//        -> reconciliation
//
// Test/doc-only: no product semantics changed, no DAC v0.0.3 V3 scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAC_BRIDGE_BASELINE,
  adoptDomainIntentRef,
  classifyObservedBasis,
  correlateDomainCommand,
  correlateDomainOutcome,
  snapshotRefFromWorkflowInstanceSnapshot,
} from '../../src/dac-bridge/index.js';
import type {
  DomainMessage,
  MessageDispositionSnapshot,
} from '../../src/v2/contracts/message.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';
import { validateSelectedComposition } from '../../src/composition-intake/index.js';
import {
  activateRuntimeBinding,
  bindValidatedComposition,
} from '../../src/runtime-binding/index.js';
import {
  EXTERNAL_AUTHORITY_BASELINE,
  adoptExternalAuthorityRef,
  adoptExternalDispatchAttemptEvidence,
  adoptExternalObservationEvidence,
  adoptExternalObservationRef,
  adoptExternalReconciliationOutcome,
  adoptExternalReconciliationRef,
  adoptProviderOperationRef,
  adoptRuntimeLogicalOperationRef,
  correlateExternalEffect,
} from '../../src/external-authority/index.js';
import {
  adoptApplicationManifest,
  composeSelectedApplicationManifest,
  computeApplicationManifestDigest,
  correlateManifestRuntimeActivation,
  correlateManifestRuntimeBinding,
} from '../../src/application-manifest/index.js';
import { createSha256Fake } from '../package/fixture.js';
import {
  assertErrorCode,
  finalComposition,
  finalEnvironment,
  manifestInputFor,
} from './final-matrix-fixtures.js';
import { ApplicationManifestError } from '../../src/application-manifest/index.js';

const WORKFLOW_ADDRESS = { workflowId: 'wf-invoice', instanceKey: 'inv-001' } as const;

function workflowSnapshot(stateRevision: number): WorkflowInstanceSnapshot {
  return {
    address: { ...WORKFLOW_ADDRESS },
    correlationId: 'corr-0001',
    packageId: 'fixture-sha256:pkg',
    lifecycle: 'active',
    stateRevision,
    state: null,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
  };
}

test('final C36 (full scope): the complete coherent journey stays separately referrable at every landed stage', async () => {
  const sha256 = createSha256Fake();
  const composition = await finalComposition();

  // Stage 3: compatibility validation of the exact selected composition.
  const validation = await validateSelectedComposition(composition.request);
  assert.equal(validation.validatedPackage, composition.compiled);

  // Stage 4 + 5: binding and technical activation.
  const binding = await bindValidatedComposition(validation, { sha256 });
  const activation = await activateRuntimeBinding(binding, {
    sha256,
    activationInstanceId: 'activation-instance-0042',
  });

  // #310: the same exact composition presented as manifest metadata.
  const manifestInput = await manifestInputFor(composition);
  const manifestContentDigest = await computeApplicationManifestDigest(manifestInput, { sha256 });
  const manifest = await adoptApplicationManifest(
    { ...manifestInput, manifestContentDigest } as never,
    { sha256 },
  );
  const manifestEvidence = await composeSelectedApplicationManifest({
    manifest,
    exactSelected: {
      semanticIdentity: composition.refs.selectedDomainData.semanticIdentity,
      revisionIdentity: composition.refs.selectedDomainData.revisionIdentity,
      contentDigest: composition.refs.selectedDomainData.contentDigest,
    },
    compiledPackage: composition.compiled,
    environment: finalEnvironment(),
  });
  // Manifest composition revalidates through #306 — its verdict is a distinct
  // minted object, and the binding correlated with it must come from IT.
  assert.notEqual(manifestEvidence.validation, validation);
  const manifestBinding = await bindValidatedComposition(manifestEvidence.validation, { sha256 });
  const bindingCorrelation = correlateManifestRuntimeBinding(manifestEvidence, manifestBinding);
  const manifestActivation = await activateRuntimeBinding(manifestBinding, {
    sha256,
    activationInstanceId: 'activation-instance-0042',
  });
  const activationCorrelation = correlateManifestRuntimeActivation(
    bindingCorrelation,
    manifestActivation,
  );
  assert.equal(activationCorrelation.activatedPackageId, validation.validatedPackageId);

  // The standalone binding (from the standalone validation) correlates with
  // NOTHING here: it was not minted from the manifest composition's verdict.
  await assertErrorCode(
    () => correlateManifestRuntimeBinding(manifestEvidence, binding),
    ApplicationManifestError,
    'CORRELATION_MISMATCH',
    'standalone binding cannot piggyback on manifest composition',
  );

  // #308: UX correlation over the same business moment, on a CURRENT basis.
  const snapshot = workflowSnapshot(7);
  const snapshotRef = snapshotRefFromWorkflowInstanceSnapshot(snapshot);
  const intent = adoptDomainIntentRef({
    baseline: { ...DAC_BRIDGE_BASELINE },
    semanticIdentity: 'ux:post-invoice',
    authorityScope: 'ux://acme/invoice-ops',
    observedBasis: { kind: 'snapshot-ref', snapshotRef },
  });
  const message: DomainMessage = {
    messageId: 'msg-0042',
    target: { ...WORKFLOW_ADDRESS },
    type: 'post-invoice',
    payload: null,
    correlationId: 'corr-0001',
  };
  const commandCorrelation = correlateDomainCommand(message, { intent });
  assert.equal(
    classifyObservedBasis(commandCorrelation, { kind: 'workflow-instance', snapshot }, { requireBasis: true }).status,
    'CURRENT',
  );
  const disposition: MessageDispositionSnapshot = {
    messageId: 'msg-0042',
    target: { ...WORKFLOW_ADDRESS },
    targetSequence: 9,
    packageId: validation.validatedPackageId,
    disposition: 'processed',
    correlationId: 'corr-0001',
    acceptedAt: '2026-09-24T00:00:00.000Z',
    resolvedAt: '2026-09-24T00:00:01.000Z',
  };
  const outcomeCorrelation = correlateDomainOutcome({
    disposition,
    correlation: commandCorrelation,
  });
  assert.equal(outcomeCorrelation.outcome.externalAuthorityOutcome, 'not-claimed');
  assert.equal(outcomeCorrelation.command?.messageId, 'msg-0042');
  assert.equal(outcomeCorrelation.intent, intent);

  // #309: the durable external effect of that processed moment.
  const xaBaseline = { ...EXTERNAL_AUTHORITY_BASELINE };
  const correlation = correlateExternalEffect({
    correlationId: 'corr-0001',
    runtimeOperation: adoptRuntimeLogicalOperationRef({
      baseline: xaBaseline,
      effectId: 'effect-0042',
      attempt: 1,
      effectSemantics: 'idempotent',
      idempotencyKey: 'idem-0042',
    }),
    externalAuthority: adoptExternalAuthorityRef({
      baseline: xaBaseline,
      authorityId: 'sor://acme/erp',
      authorityScope: 'invoice-posting',
    }),
    providerOperation: adoptProviderOperationRef({
      baseline: xaBaseline,
      providerOperationId: 'prov-op-0042',
      idempotencyKey: 'idem-0042',
    }),
  });
  const dispatch = adoptExternalDispatchAttemptEvidence({
    correlation,
    attempt: 1,
    dispatchedAt: '2026-09-24T00:00:02.000Z',
  });
  assert.equal(dispatch.proves, 'dispatch-attempt-only');
  const commitObservation = adoptExternalObservationEvidence({
    correlation,
    observation: adoptExternalObservationRef({ baseline: xaBaseline, observationId: 'obs-0042' }),
    classification: 'commit-observed',
    rawStatement: 'ERP invoice POST completed: doc-77',
    observedAt: '2026-09-24T00:00:03.000Z',
  });
  const reconciled = adoptExternalReconciliationOutcome({
    correlation,
    reconciliation: adoptExternalReconciliationRef({
      baseline: xaBaseline,
      reconciliationId: 'recon-0042',
    }),
    result: 'RECONCILED_COMMITTED',
    basis: [commitObservation],
    reconciledAt: '2026-09-24T00:00:04.000Z',
  });
  assert.equal(reconciled.remoteTruth, 'committed');

  // Cross-stage identity: one exact identity story end to end — the package
  // pin is identical at validation, activation and manifest correlation.
  assert.equal(activation.activatedPackageId, validation.validatedPackageId);
  assert.equal(activationCorrelation.activatedPackageId, validation.validatedPackageId);
  assert.equal(
    manifest.manifestContentDigest,
    manifestEvidence.manifestIdentity.manifestContentDigest,
  );
});
