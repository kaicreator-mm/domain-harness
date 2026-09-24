// Issue #329 / DAC v0.0.3 V3-005 — the reviewed C77 COMPLETE positive
// boundary path, repaired per review 5813257460 P1-1 into ONE CONNECTED
// executable journey over the merged #323/#325/#327/#328 surfaces plus the
// A2 #306/#307/#308/#309 lanes they consume:
//
//   authored/evolved lineage evidence (NOT_OWNED producer)
//     -> [asserted exact transformation relation] the promoted/selected
//        subject actually consumed by the Manifest
//     -> effective promotion evidence (NOT_OWNED authority)
//     -> exact ApplicationSelection evidence (NOT_OWNED authority)
//     -> immutable Manifest consumption
//     -> exact DAC v0.0.3 compatibility validation + external association
//        correlated (same verdict instance) to
//     -> Runtime binding
//     -> Runtime activation
//     -> logical external operation / ExternalAuthority evidence
//     -> authoritative external observation + reconciliation evidence
//        (external truth NOT_OWNED)
//     -> executed Runtime consequence/outcome: the journey's activated
//        package pin is registered and DRIVEN through the existing public
//        v0.2 Runtime assembly (createDomainRuntime.openInstance/send), the
//        mailbox drain executes the pinned workflow, and the resulting
//        Runtime-owned processed disposition + committed instance state are
//        READ from the Runtime store and asserted (commit-claim predicates +
//        runtime-logical outcome correlation over that READ result — never a
//        hand-written Runtime disposition/state)
//     -> UX consequence/correlation evidence correlated to that Runtime
//        outcome (Domain UX semantics NOT_OWNED)
//
// Every transition between segments is ASSERTED by exact identity
// (object-instance identity and identity tuples) — never inferred from
// reused primary-identity strings in opaque data. The three journey
// negatives prove: foreign/unlinked lineage cannot traverse into the
// Manifest; unrelated/incompatible compatibility evidence cannot gate the
// binding/activation path; acceptance-only/ambiguous external evidence
// without authoritative reconciliation cannot reach the same
// Runtime-outcome/UX success path.
//
// Ownership marking is mandatory and asserted below: the NOT_OWNED lanes are
// boundary fixtures (upstream evidence the Harness consumes, never mints);
// every Harness-owned segment is actually executed and asserted. The test
// proves CORRELATION across the boundaries without making the Harness
// authoritative for any non-owned lane.
//
// Additive conformance evidence only: no product surface is edited here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  adoptDacV003RegistryReference,
  assertDacV003ExactnessProfile,
  verifyDacV003ReferenceIdentity,
} from '../../src/dac-v003/index.js';
import {
  adoptDacV003CompatibilityTargetRef,
  validateDacV003Compatibility,
} from '../../src/dac-v003-compatibility/index.js';
import type { DacV003CompatibilityValidationRequest } from '../../src/dac-v003-compatibility/index.js';
import {
  DacV003ManifestError,
  adoptDacV003ApplicationManifest,
  associateDacV003ManifestCompatibilityValidation,
  computeDacV003ApplicationManifestDigest,
  isDacV003ManifestCompatibilityAssociation,
} from '../../src/dac-v003-manifest/index.js';
import type {
  DacV003ApplicationManifestAdoptionInput,
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
  RuntimeBindingError,
} from '../../src/runtime-binding/index.js';
import { createDomainRuntime } from '../../src/runtime/index.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
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
  maxClaimableForExternalObservation,
  observationSupportsCommitClaim,
  verifyExternalEffectCorrelation,
} from '../../src/external-authority/index.js';
import type { DomainMessage } from '../../src/v2/contracts/message.js';
import {
  buildIntakeVerdictFor,
  buildManifestInput,
  buildValidationFor,
  buildV003Entry,
  entryTuplesFor,
  withDeclaredDigest,
} from '../dac-v003/manifest-fixture.js';
import { buildV003Refs, V003_TARGET_PROFILE } from '../dac-v003/compatibility-fixture.js';
import { createSha256Fake } from '../package/fixture.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';
import { InMemoryControlRuntimeStore } from '../control/in-memory-control-runtime-store.js';
import {
  JOURNEY_ADDRESS,
  JOURNEY_COMMAND_TYPE,
  JOURNEY_TERMINAL_STATE,
  buildJourneyVerdict,
} from './journey-runtime-fixture.js';

const baseline = { ...DAC_V003_BASELINE };
const sha256 = createSha256Fake();

const OWNERSHIP = {
  authoredEvolvedProducer: 'NOT_OWNED',
  promotionAuthority: 'NOT_OWNED',
  applicationSelectionAuthority: 'NOT_OWNED',
  externalBusinessSoRTruth: 'NOT_OWNED',
  domainUxSemantics: 'NOT_OWNED',
} as const;

/** The journey's exact external Business SoR identity declaration. */
function journeyExternalAuthority() {
  return adoptDacV003ExternalAuthorityRef({
    baseline: { ...DAC_V003_BASELINE },
    authorityId: 'sor://billing/acme-c77',
    authorityScope: 'ext://billing/acme',
    contractProfileIdentity: 'billing-authority/v1',
  });
}

async function expectManifestErrorAsync(
  fn: () => Promise<unknown>,
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

async function expectBindingErrorAsync(
  fn: () => Promise<unknown>,
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
    caught instanceof RuntimeBindingError,
    `${label}: expected RuntimeBindingError, got ${
      caught instanceof Error ? caught.message : String(caught)
    }`,
  );
  assert.equal((caught as RuntimeBindingError).code, code, `${label}: code`);
}

test('C77: the complete positive boundary path is one connected exact identity/provenance story from authored/evolved lineage to UX consequence', async () => {
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
  // The journey's compiled subject: a genuine #306 stage-3 verdict over the
  // compiled package of revision rev-000042. Built FIRST so the evolved
  // fixture is constructed from the verdict's exact identity tuples. The
  // journey package carries ONE executable workflow, so the SAME package the
  // verdict pins is what the public Runtime assembly later executes (segment
  // 7) — the journey never swaps in a different artifact for execution.
  const verdict = await buildJourneyVerdict('rev-000042', sha256);
  const { domainId, revision, digest } = entryTuplesFor(verdict);
  const evolvedCandidate = adoptDacV003RegistryReference('evolved-candidate', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolved/candidate-c77',
    semanticIdentity: domainId,
    revisionIdentity: revision,
    contentDigest: 'sha256:evolved-c77',
    parentRefs: [authoredCandidate],
    provenanceRefs: [evolutionOperation, authoredCandidate],
    derivationOperationRef: evolutionOperation,
  });
  assert.doesNotThrow(() => assertDacV003ExactnessProfile(evolvedCandidate, 'P4'));
  assert.equal(OWNERSHIP.authoredEvolvedProducer, 'NOT_OWNED');

  // ---------------------------------------------------------------------
  // The DECLARED EXACT TRANSFORMATION/PROVENANCE RELATION — asserted, never
  // inferred from reused primary-identity strings in opaque data. The
  // evolved candidate is the exact upstream Domain Data subject whose
  // COMPILED artifact the journey pins: subject semantic identity and
  // revision continue exactly from the evolved candidate through promotion,
  // selection and the Manifest entry; the content-digest axis is the digest
  // of the compiled artifact of that exact revision (compilation is the
  // declared transformation — the frozen model does NOT require the
  // evolved-candidate digest to equal the compiled-package digest).
  // ---------------------------------------------------------------------
  verifyDacV003ReferenceIdentity(evolvedCandidate, {
    semanticIdentity: domainId,
    revisionIdentity: revision,
  });
  assert.notEqual(evolvedCandidate.contentDigest, digest);
  const upstreamEntry = buildV003Entry(revision, digest, domainId);
  assert.equal(upstreamEntry.selected.semanticIdentity, evolvedCandidate.semanticIdentity);
  assert.equal(upstreamEntry.selected.revisionIdentity, evolvedCandidate.revisionIdentity);
  assert.equal(upstreamEntry.selected.contentDigest, digest);
  assert.equal(verdict.selectedDomainData.revisionIdentity, revision);
  assert.equal(verdict.selectedDomainData.contentDigest, digest);
  // The lineage closure of that exact subject is P4-complete and the
  // derivation authority is the Simulator operation (executed verification,
  // not string reuse).
  assert.ok(evolvedCandidate.parentRefs.includes(authoredCandidate));
  assert.equal(evolvedCandidate.derivationOperationRef, evolutionOperation);

  // ---------------------------------------------------------------------
  // Lanes 2+3 — effective promotion evidence [NOT_OWNED authority] and
  // exact ApplicationSelection evidence [NOT_OWNED authority]: upstream
  // boundary fixtures covering EXACTLY the compiled subject asserted above
  // (promotion/selection revision === the evolved candidate's revision).
  // ---------------------------------------------------------------------
  assert.equal(upstreamEntry.promotionEvidence.revisionIdentity, revision);
  assert.equal(upstreamEntry.applicationSelection.revisionIdentity, revision);
  assert.equal(
    upstreamEntry.promotionEvidence.revisionIdentity,
    evolvedCandidate.revisionIdentity,
  );
  assert.equal(
    upstreamEntry.applicationSelection.revisionIdentity,
    evolvedCandidate.revisionIdentity,
  );
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
          authority: journeyExternalAuthority(),
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
        evolvedRevision: evolvedCandidate.revisionIdentity,
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
  // The manifest carries the lineage fixtures ONLY as declared composition
  // provenance — they never became selection/promotion authority (that
  // linkage is the asserted identity continuity above, not this record).
  const provenance = manifest.compositionProvenance as {
    lineage?: { evolvedCandidate?: string; evolvedRevision?: string };
  };
  assert.ok(provenance.lineage !== undefined);
  assert.equal(provenance.lineage.evolvedCandidate, 'evolved/candidate-c77');
  assert.equal(provenance.lineage.evolvedRevision, revision);
  const journeyEntry = manifest.selectedDomainData[0];
  assert.ok(journeyEntry !== undefined);
  assert.equal(journeyEntry.selected.role, 'selected-domain-data');
  assert.equal(journeyEntry.selected.semanticIdentity, domainId);
  assert.equal(journeyEntry.selected.revisionIdentity, revision);
  assert.equal(journeyEntry.selected.contentDigest, digest);

  // ---------------------------------------------------------------------
  // Harness-owned segment 2 — exact compatibility validation of the exact
  // declared closure, plus its EXTERNAL association with the manifest
  // (never content, never digest-covered). The validation consumes the SAME
  // verdict instance the journey later binds — the correlation is asserted
  // by object identity below.
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
  // EXACT correlation to the journey's subject: the validated subject IS the
  // #306 verdict instance this journey selected, and the validated target IS
  // the manifest's declared compatibility target profile.
  assert.equal(
    validation.subject.upstreamSelectionValidation,
    verdict,
    'the v0.0.3 validation consumed the exact journey verdict instance',
  );
  assert.equal(validation.subject.targetProfile, V003_TARGET_PROFILE);
  assert.equal(manifest.primaryRuntime.compatibilityTarget, refs.target);
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
  // gated on the exact verdict the compatible validation correlated: the
  // binding consumes the SAME verdict instance (asserted), the activation
  // consumes that exact binding instance, and the activated package pin is
  // the verdict's validated package id end to end.
  // ---------------------------------------------------------------------
  const binding = await bindValidatedComposition(verdict, { sha256 });
  assert.equal(
    binding.validation,
    verdict,
    'the binding bound the exact verdict instance the compatible validation covers',
  );
  assert.equal(
    binding.validation,
    validation.subject.upstreamSelectionValidation,
    'binding subject === validation subject (one exact subject, not a same-shaped copy)',
  );
  const activation = await activateRuntimeBinding(binding, {
    sha256,
    activationInstanceId: 'activation-instance-c77',
  });
  assert.equal(activation.binding, binding);
  assert.equal(activation.activatedPackageId, verdict.validatedPackageId);
  assert.equal(
    binding.validation.validatedPackageId,
    verdict.validatedPackageId,
    'the binding carries the exact stage-3 verdict pin',
  );

  // ---------------------------------------------------------------------
  // Harness-owned segment 5 — logical external operation bound to the EXACT
  // ExternalAuthority declaration the adopted manifest carries [external
  // Business SoR truth stays NOT_OWNED]: proven idempotency, an ambiguous
  // first attempt, and the safe-retry rule authorizing replay only under the
  // proven guarantee.
  // ---------------------------------------------------------------------
  const externalAuthorityPath = manifest.externalAuthority;
  if (externalAuthorityPath.applicability !== 'APPLICABLE') {
    assert.fail('the journey manifest must declare an applicable external-authority path');
  }
  const declaredAuthority = externalAuthorityPath.declarations[0]?.authority;
  assert.ok(
    declaredAuthority !== undefined,
    'the journey manifest declares its external authority',
  );
  assert.equal(
    declaredAuthority.reference.primaryIdentity,
    'sor://billing/acme-c77',
    'the journey external operation must bind the manifest\'s exact declared authority',
  );
  const externalAuthority = declaredAuthority;
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
  // basis preserved. The runtime<->external correlation is verified by the
  // #309 exact-correlation surface (executed), not by string reuse.
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
  verifyExternalEffectCorrelation(v002Correlation, {
    correlationId: 'corr-c77',
    effectId: 'logical-op-c77-0001',
    authorityId: 'sor://billing/acme-c77',
    providerOperationId: 'provider-job-c77',
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
  // Harness-owned segment 7 — Runtime consequence/outcome, actually
  // EXECUTED by the existing public v0.2 Runtime assembly and read back
  // from the Runtime store: (a) the #309 Runtime-consequence predicates
  // decide what the Runtime may claim from the journey's own commit
  // evidence; (b) the journey's activated package pin is registered and the
  // exact command (message id / correlation id / package pin) is DRIVEN
  // through `createDomainRuntime.openInstance/send` — the mailbox drain
  // executes the pinned workflow and commits the disposition + instance
  // state transition itself; (c) the resulting Runtime-owned
  // `MessageDispositionSnapshot` and committed `WorkflowInstanceSnapshot`
  // are READ from the Runtime store and only THEN feed the runtime-logical
  // outcome -> UX correlation. No Runtime result is hand-written here.
  // ---------------------------------------------------------------------
  assert.equal(
    observationSupportsCommitClaim(commitEvidence),
    true,
    'a Business-SoR commit observation is the only commit-claim basis',
  );
  assert.equal(
    maxClaimableForExternalObservation('commit-observed'),
    'commit-observed-within-authority-scope',
  );
  const registry = new StaticPackageRegistry(
    [verdict.validatedPackage],
    activation.activatedPackageId,
  );
  const runtimeStore = new InMemoryControlRuntimeStore();
  const runtime = await createDomainRuntime({
    packageRegistry: registry,
    store: runtimeStore,
    bindings: createRuntimeHostFake({ sha256 }),
  });
  const openedInstance = await runtime.openInstance({
    address: { ...JOURNEY_ADDRESS },
    correlationId: v002Correlation.correlationId,
    packageId: activation.activatedPackageId,
    input: { invoice: 'inv-77' },
  });
  assert.equal(
    openedInstance.packageId,
    activation.activatedPackageId,
    'the executed instance pins the exact activated package of the journey',
  );
  const message: DomainMessage = {
    messageId: 'msg-c77',
    target: { ...JOURNEY_ADDRESS },
    type: JOURNEY_COMMAND_TYPE,
    payload: null,
    correlationId: v002Correlation.correlationId,
  };
  const acceptedAck = await runtime.send(message);
  assert.equal(acceptedAck.status, 'accepted');
  await runtime.awaitIdle();
  const runtimeDisposition = await runtimeStore.getMessageDisposition(
    JOURNEY_ADDRESS,
    'msg-c77',
  );
  assert.ok(
    runtimeDisposition !== null,
    'the executed Runtime owns the disposition consequence evidence',
  );
  const committedInstance = await runtimeStore.getInstance(JOURNEY_ADDRESS);
  assert.ok(
    committedInstance !== null,
    'the executed Runtime owns the instance state consequence evidence',
  );
  await runtime.dispose();
  // The READ Runtime consequence is asserted exactly: the Runtime's own
  // processing turn produced the `processed` disposition under the exact
  // activated package pin and the exact runtime<->external correlation id,
  // and the state consequence is the workflow's real committed transition
  // (open -> charged, terminal, revision advanced by exactly one turn).
  assert.equal(runtimeDisposition.disposition, 'processed');
  assert.equal(runtimeDisposition.packageId, activation.activatedPackageId);
  assert.equal(runtimeDisposition.correlationId, v002Correlation.correlationId);
  assert.equal(runtimeDisposition.targetSequence, acceptedAck.targetSequence);
  assert.ok(
    runtimeDisposition.resolvedAt !== undefined && runtimeDisposition.resolvedAt.length > 0,
    'the executed turn resolved the command terminally',
  );
  assert.equal(committedInstance.lifecycle, 'completed');
  assert.equal(committedInstance.packageId, activation.activatedPackageId);
  assert.equal(committedInstance.correlationId, v002Correlation.correlationId);
  assert.equal(
    committedInstance.stateRevision,
    openedInstance.stateRevision + 1,
    'exactly one committed Runtime turn advanced the instance state',
  );
  const committedState = committedInstance.state as { stateId?: unknown };
  assert.equal(committedState.stateId, JOURNEY_TERMINAL_STATE);
  assert.deepEqual(committedInstance.output, { invoice: 'inv-77' });
  const intent = adoptDomainIntentRef({
    baseline: { ...DAC_BRIDGE_BASELINE },
    semanticIdentity: 'ux:post-invoice',
    authorityScope: 'ux://acme/invoice-ops',
    observedBasis: {
      kind: 'snapshot-ref',
      snapshotRef: snapshotRefFromWorkflowInstanceSnapshot(committedInstance),
    },
  });
  const commandCorrelation = correlateDomainCommand(message, { intent });
  assert.equal(
    commandCorrelation.command.correlationId,
    v002Correlation.correlationId,
    'the runtime command carries the exact runtime<->external correlation id',
  );
  const runtimeOutcome = correlateDomainOutcome({
    disposition: runtimeDisposition,
    correlation: commandCorrelation,
  });
  // The resulting Runtime outcome is READ and asserted: the runtime-logical
  // outcome resolves the exact command under the exact activated package,
  // and claims no external authority itself — the committed truth stays in
  // the authoritative evidence predicates + reconciliation above.
  assert.equal(runtimeOutcome.outcome.messageId, 'msg-c77');
  assert.equal(runtimeOutcome.outcome.disposition, 'processed');
  assert.equal(runtimeOutcome.outcome.packageId, activation.activatedPackageId);
  assert.equal(runtimeOutcome.outcome.correlationId, 'corr-c77');
  assert.equal(runtimeOutcome.outcome.externalAuthorityOutcome, 'not-claimed');
  assert.equal(
    reconciliation.conclusion.outcomeClass,
    'RECONCILED_COMMITTED',
    'the Runtime outcome external-truth basis is the executed reconciliation',
  );
  // The ambiguous first attempt stays immutable historical evidence (never
  // rewritten by the later commit conclusion).
  assert.ok(
    reconciliation.inputAttempts.some(
      (a) =>
        a.reference.primaryIdentity === 'attempt-c77-0001' &&
        a.evidenceClass === 'dispatch-outcome-ambiguous',
    ),
  );

  // ---------------------------------------------------------------------
  // Lane 5 — UX consequence/correlation evidence [Domain UX semantics
  // NOT_OWNED], correlated to the RESULTING Runtime outcome above: the UX
  // intent's observed basis is the committed Runtime instance the executed
  // turn produced, the processed command correlates to that intent on a
  // CURRENT basis, and the outcome correlation carries that intent as
  // evidence only — the UX lane never becomes Runtime transition authority
  // and the external authority claim is exactly what the evidence supports.
  // ---------------------------------------------------------------------
  assert.equal(
    classifyObservedBasis(
      commandCorrelation,
      { kind: 'workflow-instance', snapshot: committedInstance },
      { requireBasis: true },
    ).status,
    'CURRENT',
  );
  assert.equal(runtimeOutcome.intent, intent);
  assert.equal(runtimeOutcome.command, commandCorrelation.command);
  assert.equal(runtimeOutcome.outcome.externalAuthorityOutcome, 'not-claimed');
  assert.equal(OWNERSHIP.domainUxSemantics, 'NOT_OWNED');

  // ---------------------------------------------------------------------
  // Cross-boundary identity correlation summary: one exact identity story —
  // the evolved subject's revision continuity into the compiled package pin
  // preserved from selection validation through binding to activation; the
  // manifest digest unchanged by every downstream step; the validation
  // target identical to the manifest's declared target.
  // ---------------------------------------------------------------------
  assert.equal(activation.activatedPackageId, verdict.validatedPackageId);
  assert.equal(binding.validation, verdict);
  assert.equal(validation.subject.upstreamSelectionValidation, verdict);
  assert.equal(
    manifest.manifestContentDigest,
    association.manifestIdentity.manifestContentDigest,
  );
  assert.equal(validation.subject.targetProfile, V003_TARGET_PROFILE);
});

test("C77 foreign-lineage negative: a candidate unlinked to the journey's promotion/selection coverage cannot traverse into the Manifest", async () => {
  const { input, entry } = await buildManifestInput();
  // A P4-complete evolved candidate of a FOREIGN revision (its own valid
  // lineage) — not the subject the journey's promotion/selection covers.
  const foreignAuthored = adoptDacV003RegistryReference('authored-candidate', {
    baseline,
    authorityScope: 'forge://acme/authoring',
    primaryIdentity: 'authored/candidate-foreign',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'authored-draft-foreign',
    contentDigest: 'sha256:authored-foreign',
  });
  const foreignEvolution = adoptDacV003RegistryReference('evolution-operation', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolution/op-foreign',
    semanticIdentity: 'simulator-evolve',
    logicalOperationIdentity: 'sim-evolution-run-foreign',
  });
  const foreignEvolved = adoptDacV003RegistryReference('evolved-candidate', {
    baseline,
    authorityScope: 'sim://acme/evolution',
    primaryIdentity: 'evolved/candidate-foreign',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000099',
    contentDigest: 'sha256:evolved-foreign',
    parentRefs: [foreignAuthored],
    provenanceRefs: [foreignEvolution, foreignAuthored],
    derivationOperationRef: foreignEvolution,
  });
  assert.doesNotThrow(() => assertDacV003ExactnessProfile(foreignEvolved, 'P4'));
  // (a) The evolved-candidate role itself has no selected-slot authority:
  await expectManifestErrorAsync(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-c77-n1a',
          selectedDomainData: [
            {
              selected: foreignEvolved as never,
              promotionEvidence: entry.promotionEvidence,
              applicationSelection: entry.applicationSelection,
            },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    'INVALID_MANIFEST_INPUT',
    'foreign evolved candidate directly in the selected slot',
  );
  // (b) The foreign candidate's exact subject tuple behind a genuine
  // selected-domain-data reference while promotion+selection cover only the
  // journey's revision: the lifecycle coverage fails closed — the foreign
  // lineage cannot traverse even when dressed as the right role.
  const foreignSelected = adoptDacV003RegistryReference('selected-domain-data', {
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'selected/fixture-domain@rev-000099',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000099',
    contentDigest: 'pkg-rev-000099',
    lifecycleAuthorityRefs: [entry.promotionEvidence, entry.applicationSelection],
  });
  await expectManifestErrorAsync(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-c77-n1b',
          selectedDomainData: [
            {
              selected: foreignSelected,
              promotionEvidence: entry.promotionEvidence,
              applicationSelection: entry.applicationSelection,
            },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    'SELECTED_PROMOTION_EVIDENCE_NOT_EFFECTIVE',
    'foreign-revision selected entry covered only by the journey promotion/selection',
  );
});

test("C77 unrelated-validation negative: an unrelated/incompatible compatibility result cannot gate the journey's binding/activation path", async () => {
  const sha256Local = createSha256Fake();
  const fixture = await buildManifestInput();
  const manifest = await adoptDacV003ApplicationManifest(
    await withDeclaredDigest({
      ...fixture.input,
      manifestIdentity: 'manifest://acme/tally-ledger/7-c77-journey-n2',
      selectedDomainData: [fixture.entry as never],
    } as never),
    { sha256: sha256Local },
  );
  // (a) An INCOMPATIBLE validation of a foreign explicit target cannot even
  // associate with the journey manifest — there is no compatible gate to ride.
  const foreignTarget = adoptDacV003CompatibilityTargetRef({
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'compat-target/other-9',
    contractProfileIdentity: 'some-other-runtime',
    revisionIdentity: 'profile/other-9',
  });
  const incompatible = await buildValidationFor({
    compatibilityTarget: foreignTarget,
  });
  assert.equal(incompatible.disposition.value, 'INCOMPATIBLE');
  await expectManifestErrorAsync(
    async () =>
      associateDacV003ManifestCompatibilityValidation(manifest, incompatible),
    'ASSOCIATION_SUBJECT_MISMATCH',
    'INCOMPATIBLE foreign-target validation associated to the journey manifest',
  );
  // (b) Compatibility evidence of ANY disposition is not a binding input: a
  // COMPATIBLE v0.0.3 validation object (and the adopted manifest itself)
  // both fail the binding gate — only a genuine #306 verdict binds.
  const compatible = await buildValidationFor();
  assert.equal(compatible.disposition.value, 'COMPATIBLE');
  await expectBindingErrorAsync(
    () => bindValidatedComposition(compatible as never, { sha256: sha256Local }),
    'NOT_A_VALIDATED_COMPOSITION',
    'COMPATIBLE validation object as binding input',
  );
  await expectBindingErrorAsync(
    () => bindValidatedComposition(manifest as never, { sha256: sha256Local }),
    'NOT_A_VALIDATED_COMPOSITION',
    'adopted manifest as binding input',
  );
  // (c) A genuine verdict over a FOREIGN package does bind — but only that
  // foreign package: it cannot silently pass the journey's correlation gate
  // (the journey's success path requires the exact same verdict instance /
  // package pin, asserted unequal here).
  const foreignVerdict = await buildIntakeVerdictFor('rev-000043');
  const foreignBinding = await bindValidatedComposition(foreignVerdict, {
    sha256: sha256Local,
  });
  // The journey's OWN verdict (the same workflow-bearing package the
  // positive path executes) is the only genuine pin the journey accepts.
  const journeyVerdict = await buildJourneyVerdict('rev-000042', sha256Local);
  const journeyBinding = await bindValidatedComposition(journeyVerdict, {
    sha256: sha256Local,
  });
  assert.notEqual(foreignBinding.validation, journeyBinding.validation);
  assert.notEqual(
    foreignBinding.validation.validatedPackageId,
    journeyBinding.validation.validatedPackageId,
  );
  assert.notEqual(
    foreignBinding.validation.validatedPackageId,
    manifest.selectedDomainData[0]?.selected.contentDigest,
    'a foreign package pin never correlates to the journey manifest entry',
  );
  // (d) Activation refuses every non-genuine binding basis: a forged
  // lookalike of the journey binding fails the mint-registry gate.
  await expectBindingErrorAsync(
    () =>
      activateRuntimeBinding(
        { ...journeyBinding } as never,
        { sha256: sha256Local, activationInstanceId: 'activation-forged' },
      ),
    'NOT_A_RUNTIME_BINDING',
    'forged binding lookalike as activation basis',
  );
  // The genuine activation still follows only from the genuine binding:
  const genuineActivation = await activateRuntimeBinding(journeyBinding, {
    sha256: sha256Local,
    activationInstanceId: 'activation-instance-c77-n2',
  });
  assert.equal(
    genuineActivation.activatedPackageId,
    journeyVerdict.validatedPackageId,
  );
});

test("C77 acceptance-only negative: ambiguous/acceptance external evidence without authoritative reconciliation cannot reach the journey's Runtime-outcome/UX success path", async () => {
  const sha256Local = createSha256Fake();
  const externalAuthority = journeyExternalAuthority();
  const logicalOperation = adoptDacV003LogicalOperationRef({
    baseline,
    runtimeAuthorityScope: 'app/checkout',
    logicalOperationIdentity: 'logical-op-c77-0002',
    externalAuthority,
    operationSemanticIdentity: 'charge-order',
  });
  const v002Baseline = { ...EXTERNAL_AUTHORITY_BASELINE };
  const correlation = correlateExternalEffect({
    correlationId: 'corr-c77-acceptance',
    runtimeOperation: adoptRuntimeLogicalOperationRef({
      baseline: v002Baseline,
      effectId: 'logical-op-c77-0002',
    }),
    externalAuthority: adoptV002ExternalAuthorityRef({
      baseline: v002Baseline,
      authorityId: 'sor://billing/acme-c77',
      authorityScope: 'ext://billing/acme',
    }),
  });
  // Acceptance-only external evidence: the provider accepted the request but
  // the Business SoR never observed a commit.
  const acceptanceEvidence = adoptV002ObservationEvidence({
    correlation,
    observation: adoptV002ObservationRef({
      baseline: v002Baseline,
      observationId: 'obs-c77-acceptance',
    }),
    classification: 'accepted-pending',
    rawStatement: 'billing provider queued: inv-77',
    observedAt: '2026-09-24T00:00:03.000Z',
  });
  // Step 1 — the Runtime-consequence predicates refuse a commit claim:
  assert.equal(observationSupportsCommitClaim(acceptanceEvidence), false);
  assert.notEqual(
    maxClaimableForExternalObservation('accepted-pending'),
    'commit-observed-within-authority-scope',
  );
  // Step 2 — the v0.0.3 reconciliation stays unresolved:
  const acceptanceObservation = adoptDacV003ObservationFromV002Evidence(
    acceptanceEvidence,
    {
      baseline,
      observationIdentity: 'obs-c77-acceptance',
      externalAuthority,
      logicalOperation,
      producer: 'billing-adapter/callback',
      providerCurrentness: { sequence: '2' },
    },
  );
  assert.equal(acceptanceObservation.observedClass, 'ACCEPTED_FOR_PROCESSING');
  const episode = reconcileDacV003ExternalOperation({
    baseline,
    reconciliationIdentity: 'recon-c77-acceptance',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority,
    logicalOperation,
    actionSemantics: 'reconcile-local-vs-external-truth',
    methodClass: 'query+compare',
    inputObservations: [acceptanceObservation],
  });
  assert.equal(episode.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.notEqual(episode.conclusion.outcomeClass, 'RECONCILED_COMMITTED');
  // Step 3 — the REAL executed Runtime outcome under that unresolved truth
  // still claims nothing external, so the correlated UX consequence can
  // never present the journey's committed-success path on acceptance alone:
  // the public Runtime assembly executes the journey's exact package, the
  // processed disposition is READ from the Runtime store (not hand-written),
  // and even that genuinely-executed outcome claims no external authority.
  const journeyVerdict = await buildJourneyVerdict('rev-000042', sha256Local);
  const activation = await activateRuntimeBinding(
    await bindValidatedComposition(journeyVerdict, { sha256: sha256Local }),
    { sha256: sha256Local, activationInstanceId: 'activation-instance-c77-n3' },
  );
  const runtimeStore = new InMemoryControlRuntimeStore();
  const runtime = await createDomainRuntime({
    packageRegistry: new StaticPackageRegistry(
      [journeyVerdict.validatedPackage],
      activation.activatedPackageId,
    ),
    store: runtimeStore,
    bindings: createRuntimeHostFake({ sha256: sha256Local }),
  });
  await runtime.openInstance({
    address: { ...JOURNEY_ADDRESS },
    correlationId: correlation.correlationId,
    packageId: activation.activatedPackageId,
    input: { invoice: 'inv-77' },
  });
  const message: DomainMessage = {
    messageId: 'msg-c77-n3',
    target: { ...JOURNEY_ADDRESS },
    type: JOURNEY_COMMAND_TYPE,
    payload: null,
    correlationId: correlation.correlationId,
  };
  await runtime.send(message);
  await runtime.awaitIdle();
  const disposition = await runtimeStore.getMessageDisposition(
    JOURNEY_ADDRESS,
    'msg-c77-n3',
  );
  assert.ok(disposition !== null);
  await runtime.dispose();
  assert.equal(disposition.disposition, 'processed');
  const commandCorrelation = correlateDomainCommand(message);
  const outcome = correlateDomainOutcome({ disposition, correlation: commandCorrelation });
  assert.equal(outcome.outcome.externalAuthorityOutcome, 'not-claimed');
  assert.equal(episode.conclusion.remoteTruth, 'unresolved');
  assert.equal(OWNERSHIP.externalBusinessSoRTruth, 'NOT_OWNED');
  assert.equal(OWNERSHIP.domainUxSemantics, 'NOT_OWNED');
});

test('C77 ownership boundary: no NOT_OWNED lane can be smuggled into a Harness authority position on the path', async () => {
  const { input } = await buildManifestInput();
  // The lineage fixture rides ONLY as declared composition provenance: with
  // a genuine declared digest the manifest still adopts, and the authored
  // candidate stays a verbatim opaque value — it never becomes entry
  // authority.
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
  const externalAuthority = journeyExternalAuthority();
  const logicalOperation = adoptDacV003LogicalOperationRef({
    baseline,
    runtimeAuthorityScope: 'app/checkout',
    logicalOperationIdentity: 'logical-op-c77-0003',
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
