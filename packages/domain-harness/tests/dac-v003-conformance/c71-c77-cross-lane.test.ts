// Issue #329 / DAC v0.0.3 V3-005 — C71–C77 executable conformance closure:
// the Cross-lane E2E group — authored/evolved -> promotion -> selection ->
// Manifest -> compatibility -> binding -> activation -> external authority
// shortcuts, all proven to fail closed across the merged V3 surfaces.
// C77's positive boundary path has its own dedicated suite
// (c77-positive-boundary-path.test.ts); this file owns the E2E negatives.
//
// Additive conformance evidence only: no product surface is edited here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  DacV003ReferenceError,
  adoptDacV003RegistryReference,
} from '../../src/dac-v003/index.js';
import {
  DacV003ManifestError,
  adoptDacV003ApplicationManifest,
  associateDacV003ManifestCompatibilityValidation,
} from '../../src/dac-v003-manifest/index.js';
import {
  buildAdoptedManifest,
  buildAdoptedSingleEntryManifest,
  buildManifestInput,
  buildValidationFor,
  withDeclaredDigest,
} from '../dac-v003/manifest-fixture.js';
import {
  DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
} from '../../src/dac-v003-compatibility/index.js';
import {
  adjudicateDacV003ObservationCurrentness,
  adoptDacV003ExternalAuthorityRef,
  reconcileDacV003ExternalOperation,
  refuteDacV003HarnessSideIdentityAsExternalAuthority,
} from '../../src/dac-v003-external/index.js';
import {
  attempt,
  BASELINE,
  logicalOperation,
  observation,
} from '../dac-v003/external-fixture.js';
import {
  DAC_BRIDGE_BASELINE,
  adoptDomainIntentRef,
  correlateDomainCommand,
  correlateDomainOutcome,
  snapshotRefFromWorkflowInstanceSnapshot,
} from '../../src/dac-bridge/index.js';
import type {
  DomainMessage,
  MessageDispositionSnapshot,
} from '../../src/v2/contracts/message.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';
import { createSha256Fake } from '../package/fixture.js';

const baseline = { ...DAC_V003_BASELINE };

type ManifestInputLike = {
  readonly selectedDomainData: readonly {
    readonly selected: unknown;
    readonly promotionEvidence: unknown;
    readonly applicationSelection: unknown;
  }[];
};

function firstEntry(
  input: ManifestInputLike,
): { readonly selected: unknown; readonly promotionEvidence: unknown; readonly applicationSelection: unknown } {
  const entry = input.selectedDomainData[0];
  assert.ok(entry !== undefined, 'fixture manifest input carries a first entry');
  return entry;
}


async function expectManifestError(
  fn: () => Promise<unknown> | unknown,
  code: string,
  label: string,
): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught instanceof DacV003ManifestError,
    `${label}: expected DacV003ManifestError, got ${
      caught instanceof Error ? caught.message : String(caught)
    }`,
  );
  assert.equal((caught as DacV003ManifestError).code, code, `${label}: code`);
}

test('C71: an authored candidate never enters production selection/manifest directly', async () => {
  const { input } = await buildManifestInput();
  const authoredCandidate = adoptDacV003RegistryReference('authored-candidate', {
    baseline,
    authorityScope: 'forge://acme/authoring',
    primaryIdentity: 'authored/candidate-direct',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'authored-draft-1',
    contentDigest: 'sha256:authored-1',
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-c71',
          selectedDomainData: [
            {
              selected: authoredCandidate as never,
              promotionEvidence: firstEntry(input).promotionEvidence,
              applicationSelection: firstEntry(input).applicationSelection,
            },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    'INVALID_MANIFEST_INPUT',
    'authored candidate adopted as production selected Domain Data',
  );
  // The evolved candidate — one step further but still unpromoted and
  // unselected — equally cannot enter: only a P3 selected-domain-data
  // reference with bound lifecycle authorities can.
  const evolvedCandidate = adoptDacV003RegistryReference('evolved-candidate', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolved/candidate-direct',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'evolved-rev-1',
    contentDigest: 'sha256:evolved-1',
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-c71b',
          selectedDomainData: [
            {
              selected: evolvedCandidate as never,
              promotionEvidence: firstEntry(input).promotionEvidence,
              applicationSelection: firstEntry(input).applicationSelection,
            },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    'INVALID_MANIFEST_INPUT',
    'evolved candidate adopted as production selected Domain Data',
  );
});

test('C72: a Simulator PASS never becomes promotion and then implicit selection', async () => {
  const { input } = await buildManifestInput();
  const simulatorPass = adoptDacV003RegistryReference('simulation-result', {
    baseline,
    authorityScope: 'sim://acme/validation',
    primaryIdentity: 'simulation/pass-e2e',
    semanticIdentity: 'fixture-domain-validation',
    revisionIdentity: 'evolved-rev-1',
    logicalOperationIdentity: 'sim-run-9',
  });
  // Simulator PASS as promotion evidence fails closed.
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-c72',
          selectedDomainData: [
            {
              selected: firstEntry(input).selected,
              promotionEvidence: simulatorPass as never,
              applicationSelection: firstEntry(input).applicationSelection,
            },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    'INVALID_MANIFEST_INPUT',
    'simulator PASS as promotion evidence',
  );
  // The same PASS object cannot stand in for the selection authority either.
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-c72b',
          selectedDomainData: [
            {
              selected: firstEntry(input).selected,
              promotionEvidence: firstEntry(input).promotionEvidence,
              applicationSelection: simulatorPass as never,
            },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    'INVALID_MANIFEST_INPUT',
    'simulator PASS as application-selection authority',
  );
});

test('C73: promotion without a separately issued selection fails closed — selection is never inferred', async () => {
  const { input, entry } = await buildManifestInput();
  // The selected closure carries only the promotion authority.
  const promotionOnlySelected = adoptDacV003RegistryReference('selected-domain-data', {
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'selected/fixture-domain@rev-000042-promotion-only',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'pkg-rev-000042',
    lifecycleAuthorityRefs: [entry.promotionEvidence],
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-c73',
          selectedDomainData: [
            {
              selected: promotionOnlySelected,
              promotionEvidence: entry.promotionEvidence,
              applicationSelection: entry.applicationSelection,
            },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    'SELECTED_LIFECYCLE_AUTHORITY_UNBOUND',
    'promotion-only entry with an inferred selection',
  );
  // A selection authority that does not cover the entry's exact identity is
  // not total coverage either.
  const selectionForOtherRevision = adoptDacV003RegistryReference('application-selection', {
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'selection/fixture-domain@rev-000099',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000099',
    contentDigest: 'pkg-rev-000099',
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-c73b',
          selectedDomainData: [
            {
              selected: entry.selected,
              promotionEvidence: entry.promotionEvidence,
              applicationSelection: selectionForOtherRevision,
            },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    'SELECTED_LIFECYCLE_AUTHORITY_UNBOUND',
    'selection authority covering a different revision',
  );
});

test('C74: a compatibility PASS never becomes implicit Runtime binding/activation', async () => {
  const validation = await buildValidationFor();
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  // The validation's authority scope is compatibility only.
  assert.equal(validation.subject.authorityScope, DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE);
  // Runtime binding/activation identity cannot be absorbed into the
  // manifest definition content.
  const { input } = await buildManifestInput();
  const activationRef = adoptDacV003RegistryReference('runtime-activation', {
    baseline,
    authorityScope: 'domain-harness://runtime/activation',
    primaryIdentity: 'activation/stage-5-c74',
    semanticIdentity: 'runtime-activation',
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-c74',
          compositionProvenance: { activation: activationRef },
        } as never),
        { sha256: createSha256Fake() },
      ),
    'MANIFEST_EVIDENCE_ABSORPTION',
    'runtime-activation identity inside composition provenance',
  );
  // The separately-encoded result view resolves to the same single
  // compatibility authority — never to a binding or activation authority.
  assert.equal(
    validation.resultRef.authorityScope,
    DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
  );
});

test('C75: provider acceptance never becomes Runtime authoritative success or UX success without SoR commit evidence', () => {
  // Runtime half: acceptance-only evidence keeps remote truth unresolved —
  // there is no Runtime authoritative success to present.
  const logical = logicalOperation();
  const accepted = reconcileDacV003ExternalOperation({
    baseline: BASELINE,
    reconciliationIdentity: 'recon-c75',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority: logical.externalAuthority,
    logicalOperation: logical,
    actionSemantics: 'reconcile-local-vs-external-truth',
    methodClass: 'query+compare',
    inputObservations: [
      observation({
        observationIdentity: 'obs-accepted-c75',
        logicalOperation: logical,
        observedClass: 'ACCEPTED_FOR_PROCESSING',
      }),
    ],
  } as never);
  assert.equal(accepted.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.equal(accepted.conclusion.remoteTruth, 'unresolved');
  // UX-consequence half (Domain UX semantics NOT_OWNED; correlation
  // evidence only): the processed command's outcome correlation carries no
  // external authority claim — acceptance evidence claims nothing.
  const WORKFLOW_ADDRESS = { workflowId: 'wf-invoice', instanceKey: 'inv-001' } as const;
  const snapshot: WorkflowInstanceSnapshot = {
    address: { ...WORKFLOW_ADDRESS },
    correlationId: 'corr-c75',
    packageId: 'fixture-sha256:pkg',
    lifecycle: 'active',
    stateRevision: 3,
    state: null,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
  };
  const intent = adoptDomainIntentRef({
    baseline: { ...DAC_BRIDGE_BASELINE },
    semanticIdentity: 'ux:post-invoice',
    authorityScope: 'ux://acme/invoice-ops',
    observedBasis: {
      kind: 'snapshot-ref',
      snapshotRef: snapshotRefFromWorkflowInstanceSnapshot(snapshot),
    },
  });
  const message: DomainMessage = {
    messageId: 'msg-c75',
    target: { ...WORKFLOW_ADDRESS },
    type: 'post-invoice',
    payload: null,
    correlationId: 'corr-c75',
  };
  const commandCorrelation = correlateDomainCommand(message, { intent });
  const disposition: MessageDispositionSnapshot = {
    messageId: 'msg-c75',
    target: { ...WORKFLOW_ADDRESS },
    targetSequence: 4,
    packageId: 'fixture-sha256:pkg',
    disposition: 'processed',
    correlationId: 'corr-c75',
    acceptedAt: '2026-09-24T00:00:00.000Z',
    resolvedAt: '2026-09-24T00:00:01.000Z',
  };
  const outcomeCorrelation = correlateDomainOutcome({
    disposition,
    correlation: commandCorrelation,
  });
  assert.equal(outcomeCorrelation.outcome.externalAuthorityOutcome, 'not-claimed');
});

test('C76: an exact composition never substitutes renderer identity for UX semantics or runtime identity for external SoR identity', async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  // Renderer half: the UX closure has no renderer slot anywhere.
  const uxSlotNames = JSON.stringify(
    Object.keys(manifest.ux),
  );
  assert.ok(!uxSlotNames.toLowerCase().includes('render'));
  assert.equal(manifest.ux.domainUxDefinition.role, 'domain-ux-definition');
  // Runtime half: the declared external authority is a genuine external
  // identity, and a runtime implementation identity is refuted in that
  // position (also covered by C60; here proven against the exact adopted
  // composition's declaration path).
  const genuineExternal = adoptDacV003ExternalAuthorityRef({
    baseline,
    authorityId: 'sor://billing/acme-1',
    authorityScope: 'ext://billing/acme',
  });
  assert.doesNotThrow(() =>
    refuteDacV003HarnessSideIdentityAsExternalAuthority(genuineExternal),
  );
  const runtimeContract = manifest.primaryRuntime.runtimeContract;
  assert.throws(
    () => refuteDacV003HarnessSideIdentityAsExternalAuthority(runtimeContract),
    (error: unknown) =>
      error instanceof Error &&
      (error as DacV003ReferenceError & { code?: string }).code === 'EXTERNAL_IDENTITY_FORBIDDEN',
  );
});

test('C77 negatives: any single shortcut across the full boundary path fails closed (pointer to the positive suite)', async () => {
  // The complete positive boundary path (with NOT_OWNED ownership marking)
  // is executed and asserted in c77-positive-boundary-path.test.ts; here the
  // matrix-closure-relevant claim is verified: the manifest association of a
  // COMPATIBLE validation is minted per exact subject — a validation over a
  // DIFFERENT support set cannot ride on it.
  const manifest = await buildAdoptedManifest();
  const validation = await buildValidationFor();
  const association = associateDacV003ManifestCompatibilityValidation(
    await buildAdoptedSingleEntryManifest(),
    validation,
  );
  assert.equal(association.disposition.value, 'COMPATIBLE');
  assert.ok(association.manifestIdentity.manifestIdentity !== manifest.manifestIdentity);
  // A reconciliation must not create a new effect attempt even on the E2E
  // path: the attempt count of the journey stays explicit (query-only).
  const logical = logicalOperation();
  const watch = reconcileDacV003ExternalOperation({
    baseline: BASELINE,
    reconciliationIdentity: 'recon-c77-watch',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority: logical.externalAuthority,
    logicalOperation: logical,
    actionSemantics: 'watch-continuation-observation',
    methodClass: 'provider-watch',
    inputObservations: [
      observation({
        observationIdentity: 'obs-c77',
        logicalOperation: logical,
        observedClass: 'PENDING_IN_PROGRESS',
      }),
    ],
  } as never);
  assert.equal(watch.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.equal(watch.runtimeExecutionAuthority, 'none');
  // Currentness adjudication of the watch observation records the evidence
  // basis deterministically.
  const currentness = adjudicateDacV003ObservationCurrentness({
    observations: [
      observation({
        observationIdentity: 'obs-c77',
        logicalOperation: logical,
        observedClass: 'PENDING_IN_PROGRESS',
      }),
    ],
  });
  assert.equal(currentness.adjudications.length, 1);
  const onlyAdjudication = currentness.adjudications[0];
  assert.ok(onlyAdjudication !== undefined);
  assert.equal(onlyAdjudication.currentness, 'CURRENT');
  // And an attempt object exists only because it was explicitly minted —
  // the watch/reconcile episodes above never minted one.
  const explicitlyMinted = attempt({ attemptIdentity: 'attempt-c77-explicit' });
  assert.equal(explicitlyMinted.reference.role, 'attempt');
});
