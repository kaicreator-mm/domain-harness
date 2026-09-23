// Issue #311 / A2 I-008 FINAL matrix — I-007 / #310 application-manifest layer.
// Executes the deferred C38/N17/N18 cases: the Manifest definition never
// absorbs live instance state (N17), #306 verdicts and #307 binding/
// activation evidence never become manifest definition content and only ever
// exist as separate evidence referencing the exact manifest identity/digest
// (C38/N18), plus the manifest-level pins for mutable aliases (C02), exact
// digest/identity binding, no order/default selection (N04) and external
// identity substitution (N16).
//
// Test/doc-only: no product semantics changed, no DAC v0.0.3 V3 scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DacReferenceError } from '../../src/dac/index.js';
import {
  ApplicationManifestError,
  adoptApplicationManifest,
  composeSelectedApplicationManifest,
  computeApplicationManifestDigest,
  correlateManifestRuntimeActivation,
  correlateManifestRuntimeBinding,
  isApplicationManifest,
  manifestIdentityOf,
} from '../../src/application-manifest/index.js';
import { validateSelectedComposition } from '../../src/composition-intake/index.js';
import {
  activateRuntimeBinding,
  bindValidatedComposition,
} from '../../src/runtime-binding/index.js';
import {
  EXTERNAL_AUTHORITY_BASELINE,
  adoptExternalAuthorityRef,
} from '../../src/external-authority/index.js';
import { createSha256Fake } from '../package/fixture.js';
import {
  FINAL_BASELINE,
  assertErrorCode,
  finalComposition,
  finalEnvironment,
  manifestInputFor,
} from './final-matrix-fixtures.js';

async function adoptedManifest(overrides: Record<string, unknown> = {}) {
  const composition = await finalComposition();
  const input = await manifestInputFor(composition, overrides);
  const manifestContentDigest = await computeApplicationManifestDigest(input, {
    sha256: createSha256Fake(),
  });
  const manifest = await adoptApplicationManifest(
    { ...input, manifestContentDigest } as never,
    { sha256: createSha256Fake() },
  );
  return { composition, input, manifestContentDigest, manifest };
}

async function composedJourney() {
  const { composition, manifest } = await adoptedManifest();
  const evidence = await composeSelectedApplicationManifest({
    manifest,
    exactSelected: {
      semanticIdentity: composition.refs.selectedDomainData.semanticIdentity,
      revisionIdentity: composition.refs.selectedDomainData.revisionIdentity,
      contentDigest: composition.refs.selectedDomainData.contentDigest,
    },
    compiledPackage: composition.compiled,
    environment: finalEnvironment(),
  });
  // The genuine downstream flow: binding minted from THE verdict this manifest
  // composition produced (object identity — that is what correlation checks).
  const validation = evidence.validation;
  const binding = await bindValidatedComposition(validation, { sha256: createSha256Fake() });
  const activation = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-instance-0001',
  });
  return { composition, manifest, evidence, validation, binding, activation };
}

// ------------------------------------------------------- N17 (live state)

test('final N17: live instance-state fields never enter the Manifest definition', async () => {
  for (const field of [
    'currentWorkflowStep',
    'businessRecordState',
    'currentEffectOutcome',
    'retryState',
    'localUxSelection',
    'uxDraft',
    'recoveryProgress',
    'liveInstanceState',
    'executionState',
  ] as const) {
    await assertErrorCode(
      () => adoptedManifest({ opaque: { [field]: 'anything' } }),
      ApplicationManifestError,
      'INSTANCE_STATE_LEAKAGE',
      `opaque.${field}`,
    );
    await assertErrorCode(
      () => adoptedManifest({ compositionProvenance: { [field]: 'anything' } }),
      ApplicationManifestError,
      'INSTANCE_STATE_LEAKAGE',
      `compositionProvenance.${field}`,
    );
  }
});

test('final N17 (negative space): novel state-shaped fields stay inert opaque content — preserved, never state', async () => {
  const { manifest } = await adoptedManifest({
    opaque: { rendererExperimentFlag: true, novelFutureStateField: { maybe: 1 } },
  });
  assert.deepEqual(manifest.opaque.rendererExperimentFlag, true);
  assert.deepEqual(manifest.opaque.novelFutureStateField, { maybe: 1 });
  // The adopted manifest is deeply frozen: no live fact can be written into
  // the definition after adoption either.
  assert.ok(Object.isFrozen(manifest));
  assert.ok(Object.isFrozen(manifest.opaque));
  assert.throws(
    () => {
      (manifest.opaque as Record<string, unknown>).currentWorkflowStep = 'step-3';
    },
    TypeError,
    'post-adoption instance-state write must fail',
  );
});

// ------------------------------------------ C38 / N18 (evidence absorption)

test('final C38/N18: #306 verdicts and #307 binding/activation evidence are never manifest definition content', async () => {
  const journey = await composedJourney();

  // Direct absorption attempts in every definition slot.
  const absorptionAttempts = [
    ['selected entry slot', { selectedDomainData: [{ selected: journey.validation as never }] }],
    ['declared slot', { runtimeContract: journey.validation as never }],
    ['opaque value', { opaque: { compatibility: journey.validation } }],
    ['ux bridgeReference', {
      uxContractRequirements: [{
        contractRole: 'runtime-interaction-contract',
        semanticIdentity: 'ux:contract',
        bridgeReference: journey.binding as never,
      }],
    }],
  ] as const;
  for (const [label, overrides] of absorptionAttempts) {
    await assertErrorCode(
      () => adoptedManifest(overrides as never),
      ApplicationManifestError,
      'MANIFEST_EVIDENCE_ABSORPTION',
      label,
    );
  }

  // Binding evidence, activation evidence and bare binding/activation DAC
  // refs are all rejected as definition content.
  await assertErrorCode(
    () => adoptedManifest({ opaque: { theBinding: journey.binding } }),
    ApplicationManifestError,
    'MANIFEST_EVIDENCE_ABSORPTION',
    'binding evidence in opaque',
  );
  await assertErrorCode(
    () => adoptedManifest({ opaque: { theActivation: journey.activation } }),
    ApplicationManifestError,
    'MANIFEST_EVIDENCE_ABSORPTION',
    'activation evidence in opaque',
  );
  await assertErrorCode(
    () => adoptedManifest({ opaque: { theBindingRef: journey.binding.bindingRef } }),
    ApplicationManifestError,
    'MANIFEST_EVIDENCE_ABSORPTION',
    'bare RuntimeBindingRef in opaque',
  );
  await assertErrorCode(
    () => adoptedManifest({ opaque: { theActivationRef: journey.activation.activationRef } }),
    ApplicationManifestError,
    'MANIFEST_EVIDENCE_ABSORPTION',
    'bare RuntimeActivationRef in opaque',
  );
});

test('final C38/N18: binding/activation correlations exist only as separate evidence referencing the exact manifest identity', async () => {
  const journey = await composedJourney();

  // The genuine correlations reference the exact manifest identity/digest.
  const bindingCorrelation = correlateManifestRuntimeBinding(journey.evidence, journey.binding);
  const identity = manifestIdentityOf(journey.manifest);
  assert.deepEqual(bindingCorrelation.manifestIdentity, identity);
  const activationCorrelation = correlateManifestRuntimeActivation(
    bindingCorrelation,
    journey.activation,
  );
  assert.deepEqual(activationCorrelation.manifestIdentity, identity);
  assert.equal(activationCorrelation.activatedPackageId, journey.validation.validatedPackageId);

  // The manifest definition structurally has no slot for any of it and was
  // not mutated by correlation.
  assert.ok(!('compositionEvidence' in journey.manifest));
  assert.ok(!('binding' in journey.manifest));
  assert.ok(!('activation' in journey.manifest));
  assert.ok(isApplicationManifest(journey.manifest));

  // A binding minted from a DIFFERENT verdict object never correlates — even
  // when that verdict is a structurally identical revalidation of the SAME
  // request (correlation is object-identity, not structural equality).
  const revalidated = await validateSelectedComposition(journey.composition.request);
  const revalidatedBinding = await bindValidatedComposition(revalidated, {
    sha256: createSha256Fake(),
  });
  await assertErrorCode(
    () => correlateManifestRuntimeBinding(journey.evidence, revalidatedBinding),
    ApplicationManifestError,
    'CORRELATION_MISMATCH',
    'binding from a structurally identical revalidated verdict',
  );

  // A binding minted from a different package's verdict never correlates.
  const otherComposition = await finalComposition('rev-000043');
  const otherValidation = await validateSelectedComposition(otherComposition.request);
  const otherBinding = await bindValidatedComposition(otherValidation, {
    sha256: createSha256Fake(),
  });
  await assertErrorCode(
    () => correlateManifestRuntimeBinding(journey.evidence, otherBinding),
    ApplicationManifestError,
    'CORRELATION_MISMATCH',
    'binding from a different verdict',
  );

  // Forged composition evidence / foreign objects never correlate.
  await assertErrorCode(
    () => correlateManifestRuntimeBinding({ ...journey.evidence } as never, journey.binding),
    ApplicationManifestError,
    'NOT_A_MANIFEST_COMPOSITION',
    'forged composition evidence clone',
  );
  await assertErrorCode(
    () => correlateManifestRuntimeBinding(journey.evidence, journey.validation as never),
    ApplicationManifestError,
    'NOT_A_RUNTIME_BINDING_EVIDENCE',
    'verdict as binding correlation input',
  );

  // An activation minted under a different binding never correlates.
  const foreignActivation = await activateRuntimeBinding(otherBinding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-instance-0001',
  });
  await assertErrorCode(
    () => correlateManifestRuntimeActivation(bindingCorrelation, foreignActivation),
    ApplicationManifestError,
    'CORRELATION_MISMATCH',
    'activation under a different binding',
  );
});

// ------------------------------------- C02 / digest / identity (manifest ids)

test('final C02/digest: manifest identities are exact — aliases, digest drift and identity/digest conflicts fail closed', async () => {
  // Mutable alias identities.
  for (const field of ['applicationRevisionIdentity', 'manifestIdentity'] as const) {
    await assertErrorCode(
      () => adoptedManifest({ [field]: 'latest' }),
      ApplicationManifestError,
      'MUTABLE_ALIAS_REJECTED',
      `${field} alias`,
    );
  }

  // Declared digest != canonical digest of the presented content.
  const { input } = await adoptedManifest();
  await assertErrorCode(
    () =>
      adoptApplicationManifest(
        { ...input, manifestContentDigest: 'fixture-sha256:wrong' } as never,
        { sha256: createSha256Fake() },
      ),
    ApplicationManifestError,
    'MANIFEST_DIGEST_MISMATCH',
    'digest drift',
  );

  // The same immutable manifestIdentity resolving to different authoritative
  // digest fails closed: adopt real content under a used identity, then
  // different content under the same identity (digest derived from the drifted
  // content INCLUDING the pinned identity, so only the conflict remains).
  const first = await adoptedManifest();
  assert.ok(first.manifest.manifestIdentity);
  const driftedInput = await manifestInputFor(first.composition, {
    applicationRevisionIdentity: 'app-rev-0008',
    manifestIdentity: first.manifest.manifestIdentity,
  });
  const driftedDigest = await computeApplicationManifestDigest(driftedInput, {
    sha256: createSha256Fake(),
  });
  await assertErrorCode(
    () =>
      adoptApplicationManifest(
        { ...driftedInput, manifestContentDigest: driftedDigest } as never,
        { sha256: createSha256Fake() },
      ),
    ApplicationManifestError,
    'MANIFEST_IDENTITY_DIGEST_CONFLICT',
    'same identity, different authoritative digest',
  );
});

// ------------------------------------------------ N04 (no order/default pick)

test('final N04 (manifest half): the exact stated entry resolves or nothing does — no order/default fallback', async () => {
  const second = await finalComposition('rev-000043');
  const base = await finalComposition();
  const input = await manifestInputFor(base, {
    selectedDomainData: [
      {
        selected: base.refs.selectedDomainData,
        promotionDecision: base.refs.promotionDecision,
        applicationSelection: base.refs.applicationSelection,
      },
      {
        selected: second.refs.selectedDomainData,
        promotionDecision: second.refs.promotionDecision,
        applicationSelection: second.refs.applicationSelection,
      },
    ],
  });
  const digest = await computeApplicationManifestDigest(input, { sha256: createSha256Fake() });
  const manifest = await adoptApplicationManifest(
    { ...input, manifestContentDigest: digest } as never,
    { sha256: createSha256Fake() },
  );

  // Exact triple of the SECOND entry resolves (order is irrelevant).
  const evidence = await composeSelectedApplicationManifest({
    manifest,
    exactSelected: {
      semanticIdentity: second.refs.selectedDomainData.semanticIdentity,
      revisionIdentity: second.refs.selectedDomainData.revisionIdentity,
      contentDigest: second.refs.selectedDomainData.contentDigest,
    },
    compiledPackage: second.compiled,
    environment: finalEnvironment(),
  });
  assert.equal(evidence.validation.validatedPackage, second.compiled);

  // Partial / drifted / alias triples never resolve — not even to a
  // "close" entry, never to the first entry by default.
  for (const [label, exactSelected] of [
    ['wrong digest', {
      semanticIdentity: base.refs.selectedDomainData.semanticIdentity,
      revisionIdentity: base.refs.selectedDomainData.revisionIdentity,
      contentDigest: 'fixture-sha256:no-such-digest',
    }],
    ['alias revision', {
      semanticIdentity: base.refs.selectedDomainData.semanticIdentity,
      revisionIdentity: 'latest',
      contentDigest: base.refs.selectedDomainData.contentDigest,
    }],
    ['mixed-identity default probe (no partial match)', {
      semanticIdentity: base.refs.selectedDomainData.semanticIdentity,
      revisionIdentity: base.refs.selectedDomainData.revisionIdentity,
      contentDigest: second.refs.selectedDomainData.contentDigest,
    }],
  ] as const) {
    await assertErrorCode(
      () =>
        composeSelectedApplicationManifest({
          manifest,
          exactSelected,
          compiledPackage: base.compiled,
          environment: finalEnvironment(),
        }),
      ApplicationManifestError,
      'SELECTED_ENTRY_NOT_FOUND',
      label,
    );
  }

  // A forged manifest object never composes at all.
  await assertErrorCode(
    () =>
      composeSelectedApplicationManifest({
        manifest: { ...manifest } as never,
        exactSelected: {
          semanticIdentity: base.refs.selectedDomainData.semanticIdentity,
          revisionIdentity: base.refs.selectedDomainData.revisionIdentity,
          contentDigest: base.refs.selectedDomainData.contentDigest,
        },
        compiledPackage: base.compiled,
        environment: finalEnvironment(),
      }),
    ApplicationManifestError,
    'NOT_AN_ADOPTED_APPLICATION_MANIFEST',
    'forged manifest clone',
  );
});

// -------------------------------------------- N16 (external identity, C33 part)

test('final N16 (manifest half): external Business SoR identity cannot be substituted inside the manifest', async () => {
  const genuine = adoptExternalAuthorityRef({
    baseline: { ...EXTERNAL_AUTHORITY_BASELINE },
    authorityId: 'sor://acme/erp',
    authorityScope: 'invoice-posting',
  });

  // Genuine declaration adopts.
  const { manifest } = await adoptedManifest({
    externalAuthorityDeclarations: [{ authority: genuine }],
  });
  assert.equal(manifest.externalAuthorityDeclarations.length, 1);
  assert.equal(manifest.externalAuthorityDeclarations[0]?.authority, genuine);

  // A provider URL alone is not an authority contract.
  await assertErrorCode(
    () =>
      adoptedManifest({
        externalAuthorityDeclarations: [{ authority: 'https://erp.acme.example/api' as never }],
      }),
    ApplicationManifestError,
    'EXTERNAL_IDENTITY_SUBSTITUTION',
    'bare provider URL as authority',
  );

  // A DAC lifecycle ref and a Runtime implementation ref never substitute it:
  // per the frozen contract these propagate UN-WRAPPED as DacReferenceError so
  // the failing authority stays identifiable.
  const composition = await finalComposition();
  await assertErrorCode(
    () =>
      adoptedManifest({
        externalAuthorityDeclarations: [
          { authority: composition.refs.promotionDecision as never },
        ],
      }),
    DacReferenceError,
    'EXTERNAL_IDENTITY_FORBIDDEN',
    'DAC promotion decision as authority',
  );
  await assertErrorCode(
    () =>
      adoptedManifest({
        externalAuthorityDeclarations: [
          { authority: composition.refs.runtimeImplementation as never },
        ],
      }),
    DacReferenceError,
    'EXTERNAL_IDENTITY_FORBIDDEN',
    'runtime implementation as authority',
  );

  // A renderer/presentation object is not a UX contract anchor (C33 at the
  // manifest layer).
  await assertErrorCode(
    () =>
      adoptedManifest({
        uxContractRequirements: [
          {
            contractRole: 'view',
            semanticIdentity: 'ux:invoice-card',
            bridgeReference: {
              kind: 'react-component',
              componentId: 'InvoiceCard',
              props: { theme: 'dark' },
            } as never,
          },
        ],
      }),
    ApplicationManifestError,
    'INVALID_MANIFEST',
    'presentation component as UX contract anchor',
  );

  // Mutable alias in a UX requirement revision fails closed.
  await assertErrorCode(
    () =>
      adoptedManifest({
        uxContractRequirements: [
          { contractRole: 'view', semanticIdentity: 'ux:invoice-card', revisionIdentity: 'current' },
        ],
      }),
    ApplicationManifestError,
    'MUTABLE_ALIAS_REJECTED',
    'UX requirement revision alias',
  );
});

// ------------------------------------------- capability declarations (DAC §9)

test('final capability declarations: a declared-but-unprovided capability blocks composition, never activates anyway', async () => {
  const { manifest, composition } = await adoptedManifest({
    requiredCapabilities: ['tool.host-local@1', 'analytics.experimental@9'],
  });
  await assertErrorCode(
    () =>
      composeSelectedApplicationManifest({
        manifest,
        exactSelected: {
          semanticIdentity: composition.refs.selectedDomainData.semanticIdentity,
          revisionIdentity: composition.refs.selectedDomainData.revisionIdentity,
          contentDigest: composition.refs.selectedDomainData.contentDigest,
        },
        compiledPackage: composition.compiled,
        environment: finalEnvironment(),
      }),
    ApplicationManifestError,
    'CAPABILITY_DECLARATION_UNSATISFIED',
    'unprovided declared capability',
  );
});

// -------------------------------------------------- baseline/contract freeze

test('final baseline/contract: the manifest binds to exactly one DAC baseline and one contract version', async () => {
  await assertErrorCode(
    () =>
      adoptedManifest({
        baseline: { contract: 'domain-application-contract', version: 'v0.0.3', baselineCommit: '9c3ef91b8b40d893e4fe2b0370200e765816ec2b' },
      }),
    ApplicationManifestError,
    'UNSUPPORTED_MANIFEST_BASELINE',
    'v0.0.3 baseline rejected (no DAC V3 scope)',
  );
  await assertErrorCode(
    () => adoptedManifest({ contractVersion: 'dac-application-manifest/v0.0.3' }),
    ApplicationManifestError,
    'UNSUPPORTED_MANIFEST_CONTRACT_VERSION',
    'v0.0.3 contract version rejected (no DAC V3 scope)',
  );
  void FINAL_BASELINE;
});
