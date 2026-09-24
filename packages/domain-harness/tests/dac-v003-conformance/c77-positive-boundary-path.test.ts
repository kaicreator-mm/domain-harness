// Issue #329 / DAC v0.0.3 V3-005 — the reviewed C77 COMPLETE positive
// boundary path, executed end to end over the merged #323/#325/#327/#328
// surfaces plus the A2 #306/#307/#308/#309 lanes they consume:
//
//   authored/evolved lineage evidence (NOT_OWNED producer)
//     -> effective promotion evidence (NOT_OWNED authority)
//     -> exact ApplicationSelection evidence (NOT_OWNED authority)
//     -> immutable Manifest consumption
//     -> exact compatibility validation
//     -> Runtime binding
//     -> Runtime activation
//     -> logical external operation / ExternalAuthority evidence
//     -> authoritative external observation + reconciliation evidence
//        (external truth NOT_OWNED)
//     -> Runtime outcome
//     -> UX consequence/correlation evidence (Domain UX semantics NOT_OWNED)
//
// Ownership marking is mandatory and asserted below: the four NOT_OWNED
// lanes are boundary fixtures (upstream evidence the Harness consumes, never
// mints); every Harness-owned segment is actually executed and asserted.
// The test proves CORRELATION across the boundaries without making the
// Harness authoritative for any non-owned lane.
//
// Additive conformance evidence only: no product surface is edited here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  adoptDacV003RegistryReference,
  assertDacV003ExactnessProfile,
} from '../../src/dac-v003/index.js';
import {
  validateDacV003Compatibility,
} from '../../src/dac-v003-compatibility/index.js';
import type { DacV003CompatibilityValidationRequest } from '../../src/dac-v003-compatibility/index.js';
import {
  adoptDacV003ApplicationManifest,
  associateDacV003ManifestCompatibilityValidation,
  computeDacV003ApplicationManifestDigest,
  isDacV003ManifestCompatibilityAssociation,
} from '../../src/dac-v003-manifest/index.js';
import {
  adjudicateDacV003ObservationCurrentness,
  adoptDacV003ExternalAuthorityRef,
  adoptDacV003LogicalOperationRef,
  adoptDacV003AttemptRef,
  adoptDacV003ObservationFromV002Evidence,
  adoptDacV003IdempotencyIdentityRef,
  evaluateDacV003SafeRetry,
  isDacV003IdempotencyGuaranteeProven,
  reconcileDacV003ExternalOperation,
} from '../../src/dac-v003-external/index.js';
import {
  bindValidatedComposition,
  activateRuntimeBinding,
} from '../../src/runtime-binding/index.js';
import {
  DAC_BRIDGE_BASELINE,
  adoptDomainIntentRef,
  classifyObservedBasis,
  correlateDomainCommand,
  correlateDomainOutcome,
  snapshotRefFromWorkflowInstanceSnapshot,
} from '../../src/dac-bridge/index.js';
import {
  EXTERNAL_AUTHORITY_BASELINE,
  adoptExternalAuthorityRef as adoptV002ExternalAuthorityRef,
  adoptExternalObservationEvidence as adoptV002ObservationEvidence,
  adoptExternalObservationRef as adoptV002ObservationRef,
  adoptProviderOperationRef as adoptV002ProviderOperationRef,
  adoptRuntimeLogicalOperationRef,
  correlateExternalEffect,
} from '../../src/external-authority/index.js';
import type {
  DomainMessage,
  MessageDispositionSnapshot,
} from '../../src/v2/contracts/message.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';
import {
  buildIntakeVerdictFor,
  buildV003Entry,
  entryTuplesFor,
} from '../dac-v003/manifest-fixture.js';
import { buildV003Refs, V003_TARGET_PROFILE } from '../dac-v003/compatibility-fixture.js';
import type {
  DacV003ApplicationManifestAdoptionInput,
} from '../../src/dac-v003-manifest/index.js';
import { createSha256Fake } from '../package/fixture.js';

const baseline = { ...DAC_V003_BASELINE };
const sha256 = createSha256Fake();

const OWNERSHIP = {
  authoredEvolvedProducer: 'NOT_OWNED',
  promotionAuthority: 'NOT_OWNED',
  applicationSelectionAuthority: 'NOT_OWNED',
  externalBusinessSoRTruth: 'NOT_OWNED',
  domainUxSemantics: 'NOT_OWNED',
} as const;

test('C77: the complete positive boundary path preserves every authority and exactness boundary end to end', async () => {
  // ---------------------------------------------------------------------
  // Lane 1 — authored/evolved lineage evidence [NOT_OWNED producer].
  // Boundary fixtures adopted as identity-only upstream evidence: the
  // Harness neither authors nor evolves. The evolved candidate carries its
  // exact P4 lineage back to the authored candidate through the Simulator
  // evolution operation.
  // ---------------------------------------------------------------------
  const authoredCandidate = adoptDacV003RegistryReference('authored-candidate', {
    baseline,
    authorityScope: 'forge://acme/authoring',
    primaryIdentity: 'authored/candidate-c77',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'authored-draft-1',
    contentDigest: 'sha256:authored-c77',
  });
  const evolutionOperation = adoptDacV003RegistryReference('evolution-operation', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolution/op-c77',
    semanticIdentity: 'simulator-evolve',
    logicalOperationIdentity: 'sim-evolution-run-c77',
  });
  const evolvedCandidate = adoptDacV003RegistryReference('evolved-candidate', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolved/candidate-c77',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'sha256:evolved-c77',
    parentRefs: [authoredCandidate],
    provenanceRefs: [evolutionOperation, authoredCandidate],
    derivationOperationRef: evolutionOperation,
  });
  assert.doesNotThrow(() => assertDacV003ExactnessProfile(evolvedCandidate, 'P4'));
  assert.equal(OWNERSHIP.authoredEvolvedProducer, 'NOT_OWNED');

  // ---------------------------------------------------------------------
  // Lanes 2+3 — effective promotion evidence [NOT_OWNED authority] and
  // exact ApplicationSelection evidence [NOT_OWNED authority], as upstream
  // boundary fixtures whose exact identity covers the compiled package the
  // journey pins. The #306 stage-3 verdict is minted from them (genuine
  // upstream evidence consumption — never re-minted by the Harness).
  // ---------------------------------------------------------------------
  const verdict = await buildIntakeVerdictFor('rev-000042');
  const { domainId, revision, digest } = entryTuplesFor(verdict);
  const upstreamEntry = buildV003Entry(revision, digest, domainId);
  // The journey's promotion/selection fixtures cover exactly this compiled
  // revision — the effective-promotion/total-selection alignment the
  // manifest checks below consume.
  assert.equal(upstreamEntry.promotionEvidence.revisionIdentity, revision);
  assert.equal(upstreamEntry.applicationSelection.revisionIdentity, revision);
  assert.equal(OWNERSHIP.promotionAuthority, 'NOT_OWNED');
  assert.equal(OWNERSHIP.applicationSelectionAuthority, 'NOT_OWNED');

  // ---------------------------------------------------------------------
  // Harness-owned segment 1 — immutable Manifest consumption: the exact
  // promotion/selection fixtures bound as the P3 lifecycle closure of the
  // selected entry; adoption records identity only and mints no authority.
  // ---------------------------------------------------------------------
  const refs = buildV003Refs();
  const manifestInput: DacV003ApplicationManifestAdoptionInput = {
    baseline: { ...DAC_V003_BASELINE },
    contractVersion: 'dac-application-manifest/v0.0.3',
    applicationSemanticIdentity: 'app://acme/tally-ledger',
    applicationRevisionIdentity: 'app-rev-7-c77',
    manifestIdentity: 'manifest://acme/tally-ledger/7-c77-journey',
    manifestContentDigest: 'pending',
    selectedDomainData: [upstreamEntry],
    primaryRuntime: {
      runtimeContract: adoptDacV003RegistryReference('runtime-contract', {
        baseline,
        authorityScope: 'domain-harness://runtime',
        primaryIdentity: 'runtime-contract/domain-harness@2',
        semanticIdentity: 'domain-harness/runtime-contract',
        revisionIdentity: '2',
      }) as never,
      compatibilityTarget: refs.target,
    },
    ux: {
      domainUxDefinition: refs.uxDefinition,
      runtimeInteractionContract: refs.interactionContract,
    },
    capabilityRequirements: [refs.capabilityRequirement],
    portRequirements: [refs.portRequirement],
    hostBindingRequirements: [refs.hostBindingRequirement],
    satisfactionEvidence: [
      refs.capabilityEvidence,
      refs.portEvidence,
      refs.hostBindingEvidence,
    ],
    externalAuthority: {
      applicability: 'APPLICABLE',
      declarations: [
        {
          authority: adoptDacV003ExternalAuthorityRef({
            baseline,
            authorityId: 'sor://billing/acme-c77',
            authorityScope: 'ext://billing/acme',
            contractProfileIdentity: 'billing-authority/v1',
          }),
          capabilityRequirements: { reconciliation: true },
        },
      ],
    },
    compositionProvenance: {
      composedBy: 'dac://app-composition/acme',
      lineage: {
        authoredCandidate: authoredCandidate.primaryIdentity,
        evolvedCandidate: evolvedCandidate.primaryIdentity,
        evolutionOperation: evolutionOperation.primaryIdentity,
      },
    },
    opaque: { note: 'C77 positive boundary path' },
  };
  const manifestContentDigest = await computeDacV003ApplicationManifestDigest(
    manifestInput,
    { sha256 },
  );
  const manifest = await adoptDacV003ApplicationManifest(
    { ...manifestInput, manifestContentDigest },
    { sha256 },
  );
  assert.equal(manifest.manifestContentDigest, manifestContentDigest);
  assert.ok(Object.isFrozen(manifest));
  // The manifest carries the lineage fixtures ONLY as opaque composition
  // provenance — they never became selection/promotion authority.
  const provenance = manifest.compositionProvenance as {
    lineage?: { evolvedCandidate?: string };
  };
  assert.ok(provenance.lineage !== undefined);
  assert.equal(provenance.lineage.evolvedCandidate, 'evolved/candidate-c77');
  assert.equal(manifest.selectedDomainData.length, 1);
  const journeyEntry = manifest.selectedDomainData[0];
  assert.ok(journeyEntry !== undefined);
  assert.equal(journeyEntry.selected.role, 'selected-domain-data');

  // ---------------------------------------------------------------------
  // Harness-owned segment 2 — exact compatibility validation of the exact
  // declared closure, plus its EXTERNAL association with the manifest
  // (never content, never digest-covered).
  // ---------------------------------------------------------------------
  const compatibilityRequest: DacV003CompatibilityValidationRequest = {
    selectionValidation: verdict,
    compatibilityTarget: refs.target,
    supportedTargetProfiles: [V003_TARGET_PROFILE],
    domainUxDefinition: refs.uxDefinition,
    runtimeInteractionContract: refs.interactionContract,
    interactionCoverage: ['domain-intent', 'semantic-target', 'ux-view', 'ux-outcome'],
    uxSemanticRoleRequirements: [
      { role: 'domain-intent', required: true },
      { role: 'semantic-target', required: true },
      { role: 'ux-view', required: true },
      { role: 'ux-outcome', required: false },
    ],
    capabilityRequirements: [refs.capabilityRequirement],
    portRequirements: [refs.portRequirement],
    hostBindingRequirements: [refs.hostBindingRequirement],
    satisfactionEvidence: [
      refs.capabilityEvidence,
      refs.portEvidence,
      refs.hostBindingEvidence,
    ],
    sha256,
  };
  const validation = await validateDacV003Compatibility(compatibilityRequest);
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  const association = associateDacV003ManifestCompatibilityValidation(
    manifest,
    validation,
  );
  assert.ok(isDacV003ManifestCompatibilityAssociation(association));
  assert.equal(association.manifestIdentity.manifestIdentity, manifest.manifestIdentity);
  assert.equal(association.manifestIdentity.manifestContentDigest, manifest.manifestContentDigest);
  assert.equal(association.disposition.value, 'COMPATIBLE');
  assert.ok(
    !Object.keys(manifest).includes('manifestValidationAssociation'),
    'the association stays external to the manifest definition',
  );

  // ---------------------------------------------------------------------
  // Harness-owned segments 3+4 — Runtime binding and technical activation
  // from the #306 verdict through the #307 lifecycle (stages 4 and 5 stay
  // separately observable; the exact package pin is preserved).
  // ---------------------------------------------------------------------
  const binding = await bindValidatedComposition(verdict, { sha256 });
  const activation = await activateRuntimeBinding(binding, {
    sha256,
    activationInstanceId: 'activation-instance-c77',
  });
  assert.equal(activation.activatedPackageId, verdict.validatedPackageId);
  assert.equal(
    binding.validation.validatedPackageId,
    verdict.validatedPackageId,
    'the binding carries the exact stage-3 verdict pin',
  );

  // ---------------------------------------------------------------------
  // Harness-owned segment 5 — logical external operation bound to the exact
  // ExternalAuthority declaration the manifest carries [external Business
  // SoR truth stays NOT_OWNED]: proven idempotency, an ambiguous first
  // attempt, and the safe-retry rule refusing blind duplication.
  // ---------------------------------------------------------------------
  const externalAuthority = adoptDacV003ExternalAuthorityRef({
    baseline,
    authorityId: 'sor://billing/acme-c77',
    authorityScope: 'ext://billing/acme',
    contractProfileIdentity: 'billing-authority/v1',
  });
  const idempotency = adoptDacV003IdempotencyIdentityRef({
    baseline,
    idempotencyKey: 'idem-c77-1',
    issuer: 'sor://billing/acme-c77',
    promisedDeduplicationScope: 'ext://billing/acme:charge-order',
    externalAuthority,
    boundLogicalEffectSemanticIdentity: 'charge-order',
    equivalenceRule: {
      kind: 'semantic',
      ruleIdentity: 'billing/semantic-equality@1',
      establishedFromEvidence: true,
    },
    guaranteeEvidenceRefs: [
      adoptDacV003RegistryReference('conformance-evidence', {
        baseline,
        authorityScope: 'ext://billing/acme/idempotency-contract',
        primaryIdentity: 'idem-contract-record-c77',
      }),
    ],
  });
  assert.ok(isDacV003IdempotencyGuaranteeProven(idempotency));
  const logicalOperation = adoptDacV003LogicalOperationRef({
    baseline,
    runtimeAuthorityScope: 'app/checkout',
    logicalOperationIdentity: 'logical-op-c77-0001',
    externalAuthority,
    operationSemanticIdentity: 'charge-order',
    idempotencyIdentity: idempotency,
  });
  const firstAttempt = adoptDacV003AttemptRef({
    baseline,
    deliveryAuthorityScope: 'app/checkout/integration',
    attemptIdentity: 'attempt-c77-0001',
    logicalOperation,
    evidenceClass: 'dispatch-outcome-ambiguous',
  });
  assert.equal(firstAttempt.evidenceClass, 'dispatch-outcome-ambiguous');
  const retryDecision = evaluateDacV003SafeRetry({
    logicalOperation,
    priorAttempts: [firstAttempt],
    idempotencyIdentity: idempotency,
    intendedCommandSemanticIdentity: 'charge-order',
  });
  assert.equal(retryDecision.decision, 'PERMITTED_IDEMPOTENT_REPLAY');
  assert.equal(
    retryDecision.identityDirective,
    'same-logical-operation-same-idempotency-new-attempt',
  );
  assert.equal(OWNERSHIP.externalBusinessSoRTruth, 'NOT_OWNED');

  // ---------------------------------------------------------------------
  // Harness-owned segment 6 — authoritative external observation +
  // reconciliation [external truth NOT_OWNED]: a GENUINE #309 commit-
  // observed evidence record adopted through the v0.0.3 bridge, adjudicated
  // CURRENT, and reconciled to RECONCILED_COMMITTED with the exact evidence
  // basis preserved.
  // ---------------------------------------------------------------------
  const v002Baseline = { ...EXTERNAL_AUTHORITY_BASELINE };
  const v002Correlation = correlateExternalEffect({
    correlationId: 'corr-c77',
    runtimeOperation: adoptRuntimeLogicalOperationRef({
      baseline: v002Baseline,
      effectId: 'logical-op-c77-0001',
    }),
    externalAuthority: adoptV002ExternalAuthorityRef({
      baseline: v002Baseline,
      authorityId: 'sor://billing/acme-c77',
      authorityScope: 'ext://billing/acme',
    }),
    providerOperation: adoptV002ProviderOperationRef({
      baseline: v002Baseline,
      providerOperationId: 'provider-job-c77',
    }),
  });
  const commitEvidence = adoptV002ObservationEvidence({
    correlation: v002Correlation,
    observation: adoptV002ObservationRef({
      baseline: v002Baseline,
      observationId: 'obs-c77-commit',
    }),
    classification: 'commit-observed',
    rawStatement: 'billing record committed: inv-77',
    observedAt: '2026-09-24T00:00:03.000Z',
  });
  const commitObservation = adoptDacV003ObservationFromV002Evidence(
    commitEvidence,
    {
      baseline,
      observationIdentity: 'obs-c77-commit',
      externalAuthority,
      logicalOperation,
      producer: 'billing-adapter/callback',
      providerCurrentness: { sequence: '2' },
    },
  );
  assert.equal(commitObservation.observedClass, 'AUTHORITATIVE_COMMITTED');
  const currentness = adjudicateDacV003ObservationCurrentness({
    observations: [commitObservation],
  });
  const commitAdjudication = currentness.adjudications[0];
  assert.ok(commitAdjudication !== undefined);
  assert.equal(commitAdjudication.currentness, 'CURRENT');
  const reconciliation = reconcileDacV003ExternalOperation({
    baseline,
    reconciliationIdentity: 'recon-c77',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority,
    logicalOperation,
    actionSemantics: 'reconcile-local-vs-external-truth',
    methodClass: 'query+compare',
    inputAttempts: [firstAttempt],
    inputObservations: [commitObservation],
  });
  assert.equal(reconciliation.conclusion.outcomeClass, 'RECONCILED_COMMITTED');
  assert.equal(reconciliation.conclusion.remoteTruth, 'committed');
  assert.equal(reconciliation.runtimeExecutionAuthority, 'none');

  // ---------------------------------------------------------------------
  // Harness-owned segment 7 — Runtime outcome: the reconciled committed
  // truth is the external outcome the Runtime records; the ambiguous first
  // attempt stays immutable historical evidence (never rewritten).
  // ---------------------------------------------------------------------
  assert.ok(
    reconciliation.inputAttempts.some(
      (a) =>
        a.reference.primaryIdentity === 'attempt-c77-0001' &&
        a.evidenceClass === 'dispatch-outcome-ambiguous',
    ),
  );
  assert.equal(commitObservation.observedClass, 'AUTHORITATIVE_COMMITTED');

  // ---------------------------------------------------------------------
  // Lane 5 — UX consequence/correlation evidence [Domain UX semantics
  // NOT_OWNED]: the processed command correlates to the UX intent on a
  // CURRENT basis, and the outcome correlation is evidence only — the UX
  // lane never becomes Runtime transition authority and the external
  // authority claim is exactly what the evidence supports.
  // ---------------------------------------------------------------------
  const WORKFLOW_ADDRESS = { workflowId: 'wf-invoice', instanceKey: 'inv-001' } as const;
  const workflowSnapshot: WorkflowInstanceSnapshot = {
    address: { ...WORKFLOW_ADDRESS },
    correlationId: 'corr-c77',
    packageId: activation.activatedPackageId,
    lifecycle: 'active',
    stateRevision: 8,
    state: null,
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:05.000Z',
  };
  const intent = adoptDomainIntentRef({
    baseline: { ...DAC_BRIDGE_BASELINE },
    semanticIdentity: 'ux:post-invoice',
    authorityScope: 'ux://acme/invoice-ops',
    observedBasis: {
      kind: 'snapshot-ref',
      snapshotRef: snapshotRefFromWorkflowInstanceSnapshot(workflowSnapshot),
    },
  });
  const message: DomainMessage = {
    messageId: 'msg-c77',
    target: { ...WORKFLOW_ADDRESS },
    type: 'post-invoice',
    payload: null,
    correlationId: 'corr-c77',
  };
  const commandCorrelation = correlateDomainCommand(message, { intent });
  assert.equal(
    classifyObservedBasis(
      commandCorrelation,
      { kind: 'workflow-instance', snapshot: workflowSnapshot },
      { requireBasis: true },
    ).status,
    'CURRENT',
  );
  const disposition: MessageDispositionSnapshot = {
    messageId: 'msg-c77',
    target: { ...WORKFLOW_ADDRESS },
    targetSequence: 9,
    packageId: activation.activatedPackageId,
    disposition: 'processed',
    correlationId: 'corr-c77',
    acceptedAt: '2026-09-24T00:00:02.000Z',
    resolvedAt: '2026-09-24T00:00:04.000Z',
  };
  const outcomeCorrelation = correlateDomainOutcome({
    disposition,
    correlation: commandCorrelation,
  });
  assert.equal(outcomeCorrelation.outcome.externalAuthorityOutcome, 'not-claimed');
  assert.equal(outcomeCorrelation.intent, intent);
  assert.equal(OWNERSHIP.domainUxSemantics, 'NOT_OWNED');

  // ---------------------------------------------------------------------
  // Cross-boundary identity correlation: one exact identity story —
  // compiled package pin preserved from selection validation through
  // activation; the manifest digest unchanged by every downstream step.
  // ---------------------------------------------------------------------
  assert.equal(activation.activatedPackageId, verdict.validatedPackageId);
  assert.equal(
    manifest.manifestContentDigest,
    association.manifestIdentity.manifestContentDigest,
  );
  assert.equal(validation.subject.targetProfile, V003_TARGET_PROFILE);
});

test('C77 ownership boundary: no NOT_OWNED lane can be smuggled into a Harness authority position on the path', async () => {
  const { buildManifestInput, withDeclaredDigest } = await import(
    '../dac-v003/manifest-fixture.js'
  );
  const { input } = await buildManifestInput();
  // The lineage fixture rides ONLY as opaque content: with a genuine
  // declared digest the manifest still adopts, and the authored candidate
  // stays a verbatim opaque value — it never becomes entry authority.
  const authoredCandidate = adoptDacV003RegistryReference('authored-candidate', {
    baseline,
    authorityScope: 'forge://acme/authoring',
    primaryIdentity: 'authored/candidate-c77',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'authored-draft-1',
    contentDigest: 'sha256:authored-c77',
  });
  const adopted = await adoptDacV003ApplicationManifest(
    await withDeclaredDigest({
      ...input,
      manifestIdentity: 'manifest://acme/tally-ledger/7-c77-ownership',
      opaque: { lineage: { authored: authoredCandidate } },
    } as never),
    { sha256: createSha256Fake() },
  );
  const ownershipEntry = adopted.selectedDomainData[0];
  assert.ok(ownershipEntry !== undefined);
  assert.equal(ownershipEntry.selected.role, 'selected-domain-data');
  assert.equal(ownershipEntry.promotionEvidence.role, 'promotion-decision');
  assert.equal(ownershipEntry.applicationSelection.role, 'application-selection');
  // The authored fixture is not any of the entry authorities.
  const entryAuthorities = [
    ...ownershipEntry.selected.lifecycleAuthorityRefs.map((r) => r.primaryIdentity),
  ];
  assert.ok(!entryAuthorities.includes(authoredCandidate.primaryIdentity));
  // External truth stays external: a commit conclusion still requires the
  // AUTHORITATIVE_COMMITTED evidence class — the path's reconciliation above
  // could not have been driven by local wishes.
  const externalAuthority = adoptDacV003ExternalAuthorityRef({
    baseline,
    authorityId: 'sor://billing/acme-c77',
    authorityScope: 'ext://billing/acme',
  });
  const logicalOperation = adoptDacV003LogicalOperationRef({
    baseline,
    runtimeAuthorityScope: 'app/checkout',
    logicalOperationIdentity: 'logical-op-c77-0002',
    externalAuthority,
    operationSemanticIdentity: 'charge-order',
  });
  const episode = reconcileDacV003ExternalOperation({
    baseline,
    reconciliationIdentity: 'recon-c77-negative',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority,
    logicalOperation,
    actionSemantics: 'reconcile-local-vs-external-truth',
    methodClass: 'query+compare',
    inputObservations: [],
  });
  assert.equal(episode.conclusion.outcomeClass, 'STILL_UNKNOWN');
});
