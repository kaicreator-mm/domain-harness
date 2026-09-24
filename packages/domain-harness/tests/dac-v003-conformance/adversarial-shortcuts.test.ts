// Issue #329 / DAC v0.0.3 V3-005 — the dispatch-mandated adversarial suite:
// every shortcut attempt from the #329 execution package (comment
// 5812041865 Step 5) is materialized as a distinct executable attack and
// must fail closed or produce the frozen non-success disposition. These are
// adversarial NEGATIVES on top of the per-case conformance suites.
//
// Additive conformance evidence only: no product surface is edited here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  DacV003ReferenceError,
  adoptDacV003RegistryReference,
  adoptRuntimeInteractionContractRef,
  assertDacV003RevisionDigestConsistency,
} from '../../src/dac-v003/index.js';
import {
  DacV003CompatibilityError,
  adoptDacV003CompatibilityTargetRef,
  adoptDacV003RequirementSatisfactionEvidence,
  validateDacV003Compatibility,
  adoptDomainUXDefinitionRef,
} from '../../src/dac-v003-compatibility/index.js';
import {
  DacV003ManifestError,
  adoptDacV003ApplicationManifest,
  associateDacV003ManifestCompatibilityValidation,
} from '../../src/dac-v003-manifest/index.js';
import {
  DacV003ExternalError,
  adoptDacV003AttemptRef,
  adoptDacV003ExternalAuthorityRef,
  adoptDacV003LogicalOperationRef,
  adjudicateDacV003ObservationCurrentness,
  assertDacV003AttemptIdentitiesDistinct,
  assertDacV003IdempotencyReuseForLogicalEffect,
  assertDacV003LogicalOperationContinuity,
  evaluateDacV003SafeRetry,
  reconcileDacV003ExternalOperation,
  refuteDacV003HarnessSideIdentityAsExternalAuthority,
  refuteDacV003LocalCauseAsRemoteTruth,
  refuteDacV003ProviderOperationAsAuthoritativeEffectRecord,
} from '../../src/dac-v003-external/index.js';
import {
  adoptDomainIntentRef,
  DAC_BRIDGE_BASELINE,
} from '../../src/dac-bridge/index.js';
import {
  buildAdoptedManifest,
  buildAdoptedSingleEntryManifest,
  buildManifestInput,
  buildValidationFor,
  withDeclaredDigest,
} from '../dac-v003/manifest-fixture.js';
import {
  buildCompatibleRequest,
  buildV003Refs,
  V003_TARGET_PROFILE,
} from '../dac-v003/compatibility-fixture.js';
import {
  attempt,
  BASELINE,
  logicalOperation,
  observation,
  provenIdempotency,
  providerOperation,
} from '../dac-v003/external-fixture.js';
import { createSha256Fake } from '../package/fixture.js';

const baseline = { ...DAC_V003_BASELINE };

async function expectManifestError(
  fn: () => Promise<unknown> | unknown,
  codes: readonly string[],
  label: string,
): Promise<DacV003ManifestError> {
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
  assert.ok(
    codes.includes((caught as DacV003ManifestError).code),
    `${label}: expected one of ${codes.join('|')}, got ${
      (caught as DacV003ManifestError).code
    }`,
  );
  return caught as DacV003ManifestError;
}

test('adversarial 1 (floating identity substitution): mutable aliases are rejected at the exact-identity manifest fields', async () => {
  const { input } = await buildManifestInput();
  // The reviewed #328 surface enforces exact immutable identity on the
  // revision-like manifest identity fields (applicationRevisionIdentity,
  // manifestIdentity). The application SEMANTIC identity is a stable
  // application name, not a revision/locator-sensitive identity — recorded
  // as a P3 observation in the PR evidence, not widened here.
  for (const field of [
    'applicationRevisionIdentity',
    'manifestIdentity',
  ] as const) {
    await expectManifestError(
      () =>
        adoptDacV003ApplicationManifest(
          { ...input, [field]: 'latest' } as never,
          { sha256: createSha256Fake() },
        ),
      ['MUTABLE_ALIAS_REJECTED'],
      `manifest field "${field}" = latest`,
    );
  }
});

test('adversarial 2 (same semantic identity, foreign revision/digest): a selected entry covered for its semantic name but a foreign revision is not adopted', async () => {
  const { input } = await buildManifestInput();
  // Promotion covers the right semantic identity but a foreign revision.
  const foreignRevisionPromotion = adoptDacV003RegistryReference('promotion-decision', {
    baseline,
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: 'promotion/fixture-domain@rev-000099',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000099',
    contentDigest: 'pkg-rev-000099',
  });
  const selected = adoptDacV003RegistryReference('selected-domain-data', {
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'selected/fixture-domain@rev-000042',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'pkg-rev-000042',
    lifecycleAuthorityRefs: [foreignRevisionPromotion],
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-adv2',
          selectedDomainData: [
            { selected, promotionEvidence: foreignRevisionPromotion },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    ['INVALID_MANIFEST_INPUT'],
    'entry with only a foreign-revision promotion authority',
  );
  // Same revision but a foreign digest inside ONE authority scope is a
  // revision/digest contradiction.
  const foreignDigestPromotion = adoptDacV003RegistryReference('promotion-decision', {
    baseline,
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: 'promotion/fixture-domain@rev-000042',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'sha256:foreign-digest',
  });
  const trueDigestPromotion = adoptDacV003RegistryReference('promotion-decision', {
    baseline,
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: 'promotion/fixture-domain@rev-000042-true',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'pkg-rev-000042',
  });
  assert.throws(
    () =>
      assertDacV003RevisionDigestConsistency([foreignDigestPromotion, trueDigestPromotion]),
    (error: unknown) =>
      error instanceof DacV003ReferenceError &&
      error.code === 'REVISION_DIGEST_CONTRADICTION',
  );
});

test('adversarial 3 (role substitution): wrong-role references fail in every manifest authority slot', async () => {
  const { input } = await buildManifestInput();
  const scenario = adoptDacV003RegistryReference('scenario', {
    baseline,
    authorityScope: 'sim://acme/validation',
    primaryIdentity: 'scenario/role-sub-1',
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-adv3',
          primaryRuntime: {
            runtimeContract: scenario as never,
            compatibilityTarget: input.primaryRuntime.compatibilityTarget,
          },
        } as never),
        { sha256: createSha256Fake() },
      ),
    ['INVALID_MANIFEST_INPUT', 'PRIMARY_RUNTIME_CARDINALITY'],
    'scenario ref in the runtime-contract slot',
  );
});

test('adversarial 4 (scope substitution): a UX closure adopted under a foreign authority scope cannot associate with the exact manifest', async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  // Same semantic/revision identity, different authority scope: a different
  // exact closure, so the COMPATIBLE validation over it cannot associate.
  const foreignScopedUx = adoptDomainUXDefinitionRef({
    baseline,
    authorityScope: 'dac://other-org/domain-ux',
    primaryIdentity: 'ux-def/tally-ledger-1',
    semanticIdentity: 'tally-ledger-ux',
    revisionIdentity: 'ux-rev-3',
  });
  assert.notEqual(
    foreignScopedUx.authorityScope,
    manifest.ux.domainUxDefinition.authorityScope,
  );
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({ domainUxDefinition: foreignScopedUx }),
  );
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  await expectManifestError(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation),
    ['ASSOCIATION_SUBJECT_MISMATCH'],
    'COMPATIBLE validation over a foreign-scoped UX closure',
  );
});

test('adversarial 5 (promotion without selection) and 6 (selection without effective promotion) both fail', async () => {
  const { input, entry } = await buildManifestInput();
  // Promotion-only lifecycle closure.
  const promotionOnly = adoptDacV003RegistryReference('selected-domain-data', {
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'selected/fixture-domain@rev-000042-adv5',
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
          manifestIdentity: 'manifest://acme/tally-ledger/7-adv5',
          selectedDomainData: [
            { selected: promotionOnly, promotionEvidence: entry.promotionEvidence },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    ['INVALID_MANIFEST_INPUT'],
    'promotion-only entry',
  );
  // Selection authority present but promotion evidence not covering the
  // entry's exact identity.
  const foreignDigestPromotion = adoptDacV003RegistryReference('promotion-decision', {
    baseline,
    authorityScope: 'dac://governance/promotion',
    primaryIdentity: 'promotion/fixture-domain@rev-000042-foreign',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'sha256:other-digest',
  });
  const selectedWithBoth = adoptDacV003RegistryReference('selected-domain-data', {
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'selected/fixture-domain@rev-000042-adv6',
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'pkg-rev-000042',
    lifecycleAuthorityRefs: [foreignDigestPromotion, entry.applicationSelection],
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-adv6',
          selectedDomainData: [
            {
              selected: selectedWithBoth,
              promotionEvidence: foreignDigestPromotion,
              applicationSelection: entry.applicationSelection,
            },
          ],
        } as never),
        { sha256: createSha256Fake() },
      ),
    ['SELECTED_PROMOTION_EVIDENCE_NOT_EFFECTIVE'],
    'selection present, promotion not effective for the exact digest',
  );
});

test('adversarial 7 (wrong subject/target binding): a validation over a different explicit target cannot associate with the exact manifest', async () => {
  const manifest = await buildAdoptedSingleEntryManifest();
  const foreignTarget = adoptDacV003CompatibilityTargetRef({
    baseline,
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'compat-target/other-9',
    contractProfileIdentity: 'some-other-runtime',
    revisionIdentity: 'profile/other-9',
  });
  const validation = await buildValidationFor({
    compatibilityTarget: foreignTarget,
  });
  assert.equal(validation.disposition.value, 'INCOMPATIBLE');
  assert.equal(validation.subject.targetProfile, 'some-other-runtime@profile/other-9');
  await expectManifestError(
    () => associateDacV003ManifestCompatibilityValidation(manifest, validation),
    ['ASSOCIATION_SUBJECT_MISMATCH'],
    'INCOMPATIBLE validation of a foreign explicit target',
  );
});

test('adversarial 8 (manifest partial selected-set coverage): the multi-entry manifest cannot ride on a single-entry verdict validation', async () => {
  const multiEntryManifest = await buildAdoptedManifest();
  assert.equal(multiEntryManifest.selectedDomainData.length, 2);
  const validation = await buildValidationFor();
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  await expectManifestError(
    () =>
      associateDacV003ManifestCompatibilityValidation(multiEntryManifest, validation),
    ['ASSOCIATION_SUBJECT_MISMATCH'],
    'two-entry manifest with a validation covering only one entry',
  );
});

test('adversarial 9 (self-referential compatibility result): a validation/result inside manifest content fails closed', async () => {
  const { input } = await buildManifestInput();
  const validation = await buildValidationFor();
  const result = {
    ...validation,
  };
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-adv9',
          opaque: { validationResult: result },
        } as never),
        { sha256: createSha256Fake() },
      ),
    ['MANIFEST_EVIDENCE_ABSORPTION'],
    'compatibility validation result inside manifest opaque content',
  );
});

test('adversarial 10 (live-state insertion): recognized instance-state vocabulary inside manifest content fails closed', async () => {
  const { input } = await buildManifestInput();
  for (const field of ['currentWorkflowStep', 'uxDraft', 'executionState']) {
    await expectManifestError(
      async () =>
        adoptDacV003ApplicationManifest(
          await withDeclaredDigest({
            ...input,
            manifestIdentity: `manifest://acme/tally-ledger/7-adv10-${field}`,
            opaque: { ui: { [field]: 'step-3' } },
          } as never),
          { sha256: createSha256Fake() },
        ),
      ['INSTANCE_STATE_LEAKAGE'],
      `instance-state field "${field}" inside opaque content`,
    );
  }
});

test('adversarial 11 (binding/activation evidence insertion): #307 evidence never enters manifest content', async () => {
  const { input } = await buildManifestInput();
  const bindingRef = adoptDacV003RegistryReference('runtime-binding', {
    baseline,
    authorityScope: 'domain-harness://runtime/binding',
    primaryIdentity: 'binding/adv-11',
    semanticIdentity: 'runtime-binding',
  });
  const activationRef = adoptDacV003RegistryReference('runtime-activation', {
    baseline,
    authorityScope: 'domain-harness://runtime/activation',
    primaryIdentity: 'activation/adv-11',
    semanticIdentity: 'runtime-activation',
  });
  for (const [label, evidence] of [
    ['runtime-binding ref', bindingRef],
    ['runtime-activation ref', activationRef],
  ] as const) {
    await expectManifestError(
      async () =>
        adoptDacV003ApplicationManifest(
          await withDeclaredDigest({
            ...input,
            manifestIdentity: `manifest://acme/tally-ledger/7-adv11-${label.split(' ')[0]}`,
            compositionProvenance: { evidence },
          } as never),
          { sha256: createSha256Fake() },
        ),
      ['MANIFEST_EVIDENCE_ABSORPTION'],
      `${label} inside composition provenance`,
    );
  }
});

test('adversarial 12 (accepted mistaken for committed): acceptance evidence cannot drive a commit conclusion anywhere', () => {
  const logical = logicalOperation();
  const episode = reconcileDacV003ExternalOperation({
    baseline: BASELINE,
    reconciliationIdentity: 'recon-adv12',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority: logical.externalAuthority,
    logicalOperation: logical,
    actionSemantics: 'reconcile-local-vs-external-truth',
    methodClass: 'query+compare',
    inputObservations: [
      observation({
        observationIdentity: 'obs-adv12',
        logicalOperation: logical,
        observedClass: 'ACCEPTED_FOR_PROCESSING',
      }),
    ],
  } as never);
  assert.equal(episode.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.equal(episode.conclusion.remoteTruth, 'unresolved');
});

test('adversarial 13 (timeout as non-commit): local timeout material cannot claim remote non-commit', () => {
  assert.throws(
    () =>
      refuteDacV003LocalCauseAsRemoteTruth({
        cause: 'local-timeout',
        claimedRemoteTruth: 'RECONCILED_NOT_COMMITTED',
      }),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'LOCAL_CAUSE_FORBIDDEN',
  );
});

test('adversarial 14 (retry under a different logical operation when the same is required): continuity fails closed', () => {
  const prior = logicalOperation();
  assert.throws(
    () =>
      assertDacV003LogicalOperationContinuity(prior, {
        externalAuthority: prior.externalAuthority,
        operationSemanticIdentity: 'different-effect',
        semanticTargetRefs: prior.semanticTargetRefs,
      }),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'IDENTITY_MISMATCH',
  );
});

test('adversarial 15 (same attempt reused when a new attempt is required): replayed attempt identity fails', () => {
  const first = attempt({ attemptIdentity: 'attempt-adv15' });
  const replayed = attempt({ attemptIdentity: 'attempt-adv15' });
  assert.throws(
    () => assertDacV003AttemptIdentitiesDistinct([first, replayed]),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'IDENTITY_MISMATCH',
  );
});

test('adversarial 16 (idempotency issuer/scope/effect mismatch): every mismatch axis fails', () => {
  const idem = provenIdempotency();
  const logical = logicalOperation();
  // Effect mismatch.
  assert.throws(
    () => assertDacV003IdempotencyReuseForLogicalEffect(idem, logical, 'void-order'),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'IDEMPOTENCY_REUSE_FORBIDDEN',
  );
  // Scope mismatch: same key shape under a different authority.
  const otherAuthority = adoptDacV003ExternalAuthorityRef({
    baseline,
    authorityId: 'other-sor',
    authorityScope: 'other/truth',
  });
  const otherScopedLogical = adoptDacV003LogicalOperationRef({
    baseline,
    runtimeAuthorityScope: 'app/checkout',
    logicalOperationIdentity: 'logical-op-adv16',
    externalAuthority: otherAuthority,
    operationSemanticIdentity: 'charge-order',
  });
  assert.throws(
    () =>
      assertDacV003IdempotencyReuseForLogicalEffect(idem, otherScopedLogical, 'charge-order'),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'IDEMPOTENCY_REUSE_FORBIDDEN',
  );
});

test('adversarial 17 (stale observation): superseded provider operations are STALE for current truth while staying historical evidence', () => {
  const logical = logicalOperation();
  const newer = observation({
    observationIdentity: 'obs-adv17-newer',
    logicalOperation: logical,
    observedClass: 'AUTHORITATIVE_COMMITTED',
    providerCurrentness: { sequence: '2' },
  });
  const older = observation({
    observationIdentity: 'obs-adv17-older',
    logicalOperation: logical,
    observedClass: 'REJECTED',
    providerCurrentness: { sequence: '1' },
  });
  const result = adjudicateDacV003ObservationCurrentness({
    observations: [older, newer],
    supersededProviderOperationIds: [],
  });
  const currentness = new Map(
    result.adjudications.map((a) => [a.observation.reference.primaryIdentity, a.currentness]),
  );
  assert.equal(currentness.get('obs-adv17-newer'), 'CURRENT');
  assert.equal(currentness.get('obs-adv17-older'), 'STALE');
  // The stale observation object itself is untouched immutable evidence.
  assert.equal(older.observedClass, 'REJECTED');
});

test('adversarial 18 (conflicting observations without reconciliation evidence): truth stays unknown', () => {
  const logical = logicalOperation();
  const committed = observation({
    observationIdentity: 'obs-adv18-a',
    logicalOperation: logical,
    observedClass: 'AUTHORITATIVE_COMMITTED',
    providerCurrentness: { sequence: '4' },
  });
  const failed = observation({
    observationIdentity: 'obs-adv18-b',
    logicalOperation: logical,
    observedClass: 'KNOWN_FAILED_BEFORE_COMMIT',
    providerCurrentness: { sequence: '4' },
  });
  const episode = reconcileDacV003ExternalOperation({
    baseline: BASELINE,
    reconciliationIdentity: 'recon-adv18',
    localReconciliationAuthorityScope: 'app/checkout/reconciliation',
    externalAuthority: logical.externalAuthority,
    logicalOperation: logical,
    actionSemantics: 'reconcile-local-vs-external-truth',
    methodClass: 'query+compare',
    inputObservations: [committed, failed],
  } as never);
  assert.equal(episode.conclusion.outcomeClass, 'STILL_UNKNOWN');
  assert.equal(episode.conclusion.unresolvedConflictPresent, true);
});

test('adversarial 19 (query/watch/reconcile creating an effect attempt): effectful semantics fail closed', () => {
  const logical = logicalOperation();
  assert.throws(
    () =>
      reconcileDacV003ExternalOperation({
        baseline: BASELINE,
        reconciliationIdentity: 'recon-adv19',
        localReconciliationAuthorityScope: 'app/checkout/reconciliation',
        externalAuthority: logical.externalAuthority,
        logicalOperation: logical,
        actionSemantics: 'new-independent-operation',
        methodClass: 'retry',
      } as never),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'INVALID_ACTION_SEMANTICS',
  );
  // Safe-retry is the ONLY authorization path for a new attempt, and it
  // refuses ambiguity without proof.
  const decision = evaluateDacV003SafeRetry({
    logicalOperation: logical,
    priorAttempts: [
      attempt({ evidenceClass: 'dispatch-outcome-ambiguous', attemptIdentity: 'att-adv19' }),
    ],
    intendedCommandSemanticIdentity: 'charge-order',
  });
  assert.equal(decision.decision, 'NOT_AUTHORIZED_AMBIGUITY_PRESERVED');
});

test('adversarial 20 (runtime identity as external authority): Harness-side identity is refuted in the external lane', () => {
  const runtimeBinding = adoptDacV003RegistryReference('runtime-binding', {
    baseline,
    authorityScope: 'domain-harness://runtime/binding',
    primaryIdentity: 'binding/adv-20',
    semanticIdentity: 'runtime-binding',
  });
  for (const harnessSide of [runtimeBinding, buildV003Refs().hostBinding]) {
    assert.throws(
      () => refuteDacV003HarnessSideIdentityAsExternalAuthority(harnessSide),
      (error: unknown) =>
        error instanceof DacV003ExternalError && error.code === 'EXTERNAL_IDENTITY_FORBIDDEN',
    );
  }
});

test('adversarial 21 (renderer as UX semantic definition): renderer identity has no UX semantic authority slot', async () => {
  const { input } = await buildManifestInput();
  // A #308 domain-intent ref (UX-lane semantic object) cannot fill the UX
  // definition slot, and renderer-shaped identities stay non-authoritative.
  const intentRef = adoptDomainIntentRef({
    baseline: { ...DAC_BRIDGE_BASELINE },
    semanticIdentity: 'ux:post-invoice',
    authorityScope: 'ux://acme/invoice-ops',
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-adv21',
          ux: {
            domainUxDefinition: intentRef as never,
            runtimeInteractionContract: input.ux.runtimeInteractionContract,
          },
        } as never),
        { sha256: createSha256Fake() },
      ),
    ['INVALID_MANIFEST_INPUT', 'UX_CLOSURE_CARDINALITY'],
    'UX intent ref in the Domain UX definition slot',
  );
});

test('adversarial 22 (UX intent as Runtime transition authority): intent identity cannot fill the interaction-contract slot', async () => {
  const { input } = await buildManifestInput();
  const intentRef = adoptDomainIntentRef({
    baseline: { ...DAC_BRIDGE_BASELINE },
    semanticIdentity: 'ux:post-invoice',
    authorityScope: 'ux://acme/invoice-ops',
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          manifestIdentity: 'manifest://acme/tally-ledger/7-adv22',
          ux: {
            domainUxDefinition: input.ux.domainUxDefinition,
            runtimeInteractionContract: intentRef as never,
          },
        } as never),
        { sha256: createSha256Fake() },
      ),
    ['INVALID_MANIFEST_INPUT', 'UX_CLOSURE_CARDINALITY'],
    'UX intent ref in the Runtime interaction-contract slot',
  );
  // The genuine interaction contract is a distinct immutable semantic
  // contract with its own revision — not a UX-lane object.
  const genuine = adoptRuntimeInteractionContractRef({
    baseline,
    authorityScope: 'domain-harness://runtime/interaction',
    primaryIdentity: 'interaction/adv-22',
    semanticIdentity: 'tally-semantic-interaction',
    revisionIdentity: 'interaction-rev-2',
  });
  assert.equal(genuine.role, 'runtime-interaction-contract');
  assert.notEqual(genuine.role, 'domain-intent');
});

test('adversarial 23 (provider job as authoritative record): the substitution is refuted everywhere', () => {
  const job = providerOperation({ providerOperationId: 'provider-job-adv23' });
  assert.throws(
    () => refuteDacV003ProviderOperationAsAuthoritativeEffectRecord(job),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'ROLE_MISMATCH',
  );
});

test('adversarial 24 (compatibility evidence absorption via satisfaction slot): validation objects cannot enter requirement evidence', async () => {
  const validation = await buildValidationFor();
  const refs = buildV003Refs();
  assert.throws(
    () =>
      adoptDacV003RequirementSatisfactionEvidence({
        baseline,
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: 'evidence/adv24',
        satisfies: refs.hostBindingRequirement,
        provider: refs.hostBinding,
        validForTargetProfile: V003_TARGET_PROFILE,
        provenance: [validation as never],
      } as never),
    (error: unknown) =>
      (error instanceof DacV003CompatibilityError ||
        error instanceof DacV003ReferenceError) &&
      /INVALID|ROLE/.test((error as Error & { code?: string }).code ?? ''),
    'validation object smuggled as satisfaction provenance',
  );
});

test('adversarial 25 (attempt identity collapse at adoption): an attempt cannot be minted with its operation identity', () => {
  const logical = logicalOperation();
  assert.throws(
    () =>
      adoptDacV003AttemptRef({
        baseline,
        deliveryAuthorityScope: 'app/checkout/integration',
        attemptIdentity: logical.reference.primaryIdentity,
        logicalOperation: logical,
        evidenceClass: 'dispatch-attempted',
      } as never),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'IDENTITY_MISMATCH',
  );
});
