// Issue #310 / A2 I-007 focused conformance + negative tests for the
// manifest composition path: exact-entry consumption through the #306
// intake, capability-declaration verification, and separate #307
// binding/activation correlation (DAC APPLICATION_MANIFEST §§4-5,9-10,13;
// L2 A2 §6.2-§6.3/§7; PRD A2 §7 / negative cases 15-16 / C36-C38).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_REFERENCE_BASELINE,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
  isApplicationSelectionRef,
  isRuntimeActivationRef,
  isRuntimeBindingRef,
} from '../../src/dac/index.js';
import {
  type RuntimeCompatibilityEnvironment,
  type SelectedCompositionValidation,
} from '../../src/composition-intake/index.js';
import type { CapabilityId } from '../../src/v2/contracts/capability.js';
import {
  CompositionIntakeError,
} from '../../src/composition-intake/index.js';
import {
  activateRuntimeBinding,
  bindValidatedComposition,
  isRuntimeBindingEvidence,
} from '../../src/runtime-binding/index.js';
import {
  ApplicationManifestError,
  APPLICATION_MANIFEST_CONTRACT_VERSION,
  adoptApplicationManifest,
  composeSelectedApplicationManifest,
  correlateManifestRuntimeActivation,
  correlateManifestRuntimeBinding,
  isManifestCompositionEvidence,
  isManifestRuntimeActivationCorrelation,
  isManifestRuntimeBindingCorrelation,
  type ApplicationManifestAdoptionInput,
} from '../../src/application-manifest/index.js';
import { createCompiledPackage, createSha256Fake } from '../package/fixture.js';

const baseline = { ...DAC_REFERENCE_BASELINE };
const sha256 = createSha256Fake();

function environment(
  overrides: Partial<RuntimeCompatibilityEnvironment> = {},
): RuntimeCompatibilityEnvironment {
  return {
    formatVersion: '1',
    runtimeContractMajor: 2,
    executionEngineMajor: 1,
    targetProfileId: 'node-test',
    hostCapabilities: [],
    implementation: { identity: 'domain-harness-runtime', version: '0.3.0', build: 'build-1' },
    sha256,
    ...overrides,
  };
}

function declaredRefs() {
  return {
    runtimeContract: adoptRuntimeContractRef({
      baseline,
      semanticIdentity: 'runtime-contract',
      authorityScope: 'domain-harness://runtime/contract',
      revisionIdentity: '2',
    }),
    runtimeImplementation: adoptRuntimeImplementationRef({
      baseline,
      semanticIdentity: 'domain-harness-runtime',
      authorityScope: 'domain-harness://runtime/implementation',
      revisionIdentity: '0.3.0',
      contentDigest: 'build-1',
    }),
    compatibilityTarget: adoptCompatibilityTargetRef({
      baseline,
      semanticIdentity: 'domain-harness/compatibility-target/node-test',
      authorityScope: 'domain-harness://runtime/compatibility',
      revisionIdentity: 'node-test',
    }),
  };
}

interface EntryBundle {
  readonly compiled: Awaited<ReturnType<typeof createCompiledPackage>>;
  readonly promotionDecision: ReturnType<typeof adoptPromotionDecisionRef>;
  readonly applicationSelection: ReturnType<typeof adoptApplicationSelectionRef>;
  readonly selectedDomainData: ReturnType<typeof adoptSelectedDomainDataRef>;
}

async function entryBundle(domainVersion: string, domainId = 'fixture-domain'): Promise<EntryBundle> {
  const compiled = await createCompiledPackage(domainVersion, {
    ...(domainId === 'fixture-domain' ? {} : {}),
  });
  const input = {
    baseline,
    semanticIdentity: compiled.manifest.domainId,
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: compiled.manifest.domainVersion,
    contentDigest: compiled.manifest.packageId,
  };
  return {
    compiled,
    promotionDecision: adoptPromotionDecisionRef(input),
    applicationSelection: adoptApplicationSelectionRef(input),
    selectedDomainData: adoptSelectedDomainDataRef(input),
  };
}

let manifestCounter = 0;

interface JourneyOptions {
  readonly requiredCapabilities?: readonly CapabilityId[];
}

/**
 * Full positive journey fixture: two-entry manifest adopted, then composed
 * against entry [0]'s exact package/environment (DAC §13.1 case 10).
 */
async function journey(
  options: JourneyOptions = {},
): Promise<{
  manifest: Awaited<ReturnType<typeof adoptApplicationManifest>>;
  entries: EntryBundle[];
  compose: (exact: {
    semanticIdentity: string;
    revisionIdentity: string;
    contentDigest: string;
  }, compiled?: EntryBundle['compiled'], env?: RuntimeCompatibilityEnvironment) => Promise<Awaited<ReturnType<typeof composeSelectedApplicationManifest>>>;
}> {
  manifestCounter += 1;
  const first = await entryBundle('rev-000042');
  const second = await entryBundle('rev-000043');
  const declared = declaredRefs();
  const draft: Omit<ApplicationManifestAdoptionInput, 'manifestContentDigest'> = {
    baseline,
    contractVersion: APPLICATION_MANIFEST_CONTRACT_VERSION,
    applicationSemanticIdentity: 'app:acme:pricing',
    applicationRevisionIdentity: 'app-rev-7',
    manifestIdentity: `manifest:compose:${String(manifestCounter)}`,
    selectedDomainData: [
      {
        selected: first.selectedDomainData,
        promotionDecision: first.promotionDecision,
        applicationSelection: first.applicationSelection,
      },
      {
        selected: second.selectedDomainData,
        promotionDecision: second.promotionDecision,
        applicationSelection: second.applicationSelection,
      },
    ],
    ...declared,
    ...(options.requiredCapabilities === undefined
      ? {}
      : { requiredCapabilities: options.requiredCapabilities }),
  };
  // Digest must be computed over exactly the presented content.
  const { computeApplicationManifestDigest } = await import(
    '../../src/application-manifest/index.js'
  );
  const digest = await computeApplicationManifestDigest(
    draft as unknown as ApplicationManifestAdoptionInput,
    { sha256 },
  );
  const manifest = await adoptApplicationManifest(
    { ...draft, manifestContentDigest: digest },
    { sha256 },
  );
  const entries = [first, second];
  return {
    manifest,
    entries,
    compose: (exact, compiled?, env = environment()) =>
      composeSelectedApplicationManifest({
        manifest,
        exactSelected: exact,
        compiledPackage:
          compiled ??
          (entries.find((entry) => entry.selectedDomainData.contentDigest === exact.contentDigest) ??
            entries[0]!).compiled,
        environment: env,
      }),
  };
}

function composeError(
  fn: () => unknown | Promise<unknown>,
  code: string,
  label: string,
): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(
      () => assert.fail(`${label}: expected ApplicationManifestError ${code}`),
      (error: unknown) => {
        assert.ok(
          error instanceof ApplicationManifestError,
          `${label}: expected ApplicationManifestError, got ${String(error)}`,
        );
        assert.equal((error as ApplicationManifestError).code, code, `${label}: code`);
      },
    );
}

// ------------------------------------------------------------ positive C36

test('I-007 compose: DAC §13.1 case 10 — exact promoted+selected+compatible manifest composition passes through the #306 intake', async () => {
  const { manifest, entries, compose } = await journey();
  const evidence = await compose({
    semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
    revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
    contentDigest: entries[0]!.selectedDomainData.contentDigest,
  });

  assert.ok(isManifestCompositionEvidence(evidence));
  assert.equal(evidence.validation.validatedPackageId, entries[0]!.compiled.manifest.packageId);
  assert.deepEqual(evidence.manifestIdentity, {
    applicationSemanticIdentity: manifest.applicationSemanticIdentity,
    applicationRevisionIdentity: manifest.applicationRevisionIdentity,
    manifestIdentity: manifest.manifestIdentity,
    manifestContentDigest: manifest.manifestContentDigest,
  });
  // The verdict's selection provenance is the upstream pass-through ref —
  // the manifest adapter minted no selection of its own.
  assert.ok(isApplicationSelectionRef(evidence.validation.provenance.applicationSelection));
  assert.equal(
    evidence.validation.provenance.applicationSelection,
    manifest.selectedDomainData[0]!.applicationSelection,
  );
});

// ------------------------------------------------- exact-entry consumption

test('I-007 compose: entry order/defaults never choose — the exact stated identity resolves or fails closed', async () => {
  const { entries, compose } = await journey();
  // Entry [1] is NOT first, yet the exact identity consumes it.
  const evidence = await compose({
    semanticIdentity: entries[1]!.selectedDomainData.semanticIdentity,
    revisionIdentity: entries[1]!.selectedDomainData.revisionIdentity,
    contentDigest: entries[1]!.selectedDomainData.contentDigest,
  });
  assert.equal(evidence.validation.validatedPackageId, entries[1]!.compiled.manifest.packageId);

  // No entry matches a wrong digest: fail closed, available identities listed.
  await composeError(
    () =>
      compose({
        semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
        revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
        contentDigest: 'drifted-digest-0000',
      }),
    'SELECTED_ENTRY_NOT_FOUND',
    'digest drift',
  );
  await composeError(
    () =>
      compose({
        semanticIdentity: 'domain:not-carried',
        revisionIdentity: 'rev-x',
        contentDigest: 'digest-x',
      }),
    'SELECTED_ENTRY_NOT_FOUND',
    'unknown semantic identity',
  );
});

test('I-007 compose: a partial exact identity never resolves an entry', async () => {
  const { manifest, entries } = await journey();
  await composeError(
    () =>
      composeSelectedApplicationManifest({
        manifest,
        exactSelected: {
          semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
        } as never,
        compiledPackage: entries[0]!.compiled,
        environment: environment(),
      }),
    'INVALID_MANIFEST_COMPOSITION_REQUEST',
    'partial identity',
  );
  await composeError(
    () => composeSelectedApplicationManifest(null as never),
    'INVALID_MANIFEST_COMPOSITION_REQUEST',
    'non-object request',
  );
});

test('I-007 compose: only an adopted manifest can be composed (forged copies fail)', async () => {
  const { manifest, entries } = await journey();
  await composeError(
    () =>
      composeSelectedApplicationManifest({
        manifest: { ...manifest } as never,
        exactSelected: {
          semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
          revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
          contentDigest: entries[0]!.selectedDomainData.contentDigest,
        },
        compiledPackage: entries[0]!.compiled,
        environment: environment(),
      }),
    'NOT_AN_ADOPTED_APPLICATION_MANIFEST',
    'forged manifest copy',
  );
});

// ----------------------------------------------- fail-closed compatibility

test('I-007 compose: an incompatible target fails closed exactly like the #306 intake — no substitution ever', async () => {
  const { entries, compose } = await journey();
  await assert.rejects(
    () =>
      compose(
        {
          semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
          revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
          contentDigest: entries[0]!.selectedDomainData.contentDigest,
        },
        entries[0]!.compiled,
        environment({ targetProfileId: 'mismatched-profile' }),
      ),
    (error: unknown) =>
      error instanceof CompositionIntakeError && error.code === 'INCOMPATIBLE_SELECTED_COMPOSITION',
  );
  // A different revision of the same domain exists in the manifest and was
  // never auto-selected as a fallback: the wrong package mapping also fails
  // closed instead of resolving to the other entry.
  const swapped = await entryBundle('rev-000044');
  await assert.rejects(
    () =>
      compose(
        {
          semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
          revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
          contentDigest: entries[0]!.selectedDomainData.contentDigest,
        },
        swapped.compiled,
      ),
    (error: unknown) =>
      error instanceof CompositionIntakeError && error.code === 'SELECTED_IDENTITY_MISMATCH',
  );
});

// ---------------------------------------------------- capability declarations

test('I-007 compose: an unsatisfied manifest capability declaration blocks composition (declaration != availability)', async () => {
  const { entries, compose } = await journey({ requiredCapabilities: ['tool.host-local@1'] });
  // environment provides no capabilities => declaration unsatisfied.
  await composeError(
    () =>
      compose({
        semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
        revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
        contentDigest: entries[0]!.selectedDomainData.contentDigest,
      }),
    'CAPABILITY_DECLARATION_UNSATISFIED',
    'missing capability',
  );
});

test('I-007 compose: a satisfied capability declaration passes exactly against the validated target', async () => {
  const { entries, compose } = await journey({ requiredCapabilities: ['tool.host-local@1'] });
  const evidence = await compose(
    {
      semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
      revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
      contentDigest: entries[0]!.selectedDomainData.contentDigest,
    },
    entries[0]!.compiled,
    environment({ hostCapabilities: ['tool.host-local@1'] }),
  );
  assert.ok(isManifestCompositionEvidence(evidence));
});

// ----------------------------------------------- binding/activation evidence

test('I-007 correlation: #307 binding/activation correlate with the manifest composition as SEPARATE evidence (C38)', async () => {
  const { entries, compose } = await journey();
  const evidence = await compose({
    semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
    revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
    contentDigest: entries[0]!.selectedDomainData.contentDigest,
  });
  const binding = await bindValidatedComposition(evidence.validation, { sha256 });
  const correlation = correlateManifestRuntimeBinding(evidence, binding);
  const activation = await activateRuntimeBinding(binding, {
    sha256,
    activationInstanceId: 'activation-i007-1',
  });
  const activationCorrelation = correlateManifestRuntimeActivation(correlation, activation);

  assert.ok(isManifestRuntimeBindingCorrelation(correlation));
  assert.ok(isManifestRuntimeActivationCorrelation(activationCorrelation));
  assert.ok(isRuntimeBindingRef(correlation.bindingRef));
  assert.ok(isRuntimeActivationRef(activationCorrelation.activationRef));
  assert.equal(activationCorrelation.activatedPackageId, entries[0]!.compiled.manifest.packageId);
  // All three records are distinct objects that reference the manifest
  // identity/digest; the manifest itself never changed.
  assert.equal(JSON.stringify(evidence).includes('bindingRef'), false);
  assert.deepEqual(correlation.manifestIdentity, evidence.manifestIdentity);
  assert.deepEqual(activationCorrelation.manifestIdentity, evidence.manifestIdentity);
  // Forged lookalikes fail the guards.
  assert.equal(isManifestRuntimeBindingCorrelation({ ...correlation }), false);
  assert.equal(isManifestRuntimeActivationCorrelation({ ...activationCorrelation }), false);
});

test('I-007 correlation: a binding minted from a different verdict object never correlates (C38 exact chain)', async () => {
  const { entries, compose } = await journey();
  const evidence = await compose({
    semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
    revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
    contentDigest: entries[0]!.selectedDomainData.contentDigest,
  });

  // A structurally identical but separately-minted verdict (same manifest
  // composed twice): the second evidence's binding must NOT correlate with
  // the first evidence object.
  const second = await compose({
    semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
    revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
    contentDigest: entries[0]!.selectedDomainData.contentDigest,
  });
  assert.notEqual(second.validation, evidence.validation);
  const foreignBinding = await bindValidatedComposition(second.validation, { sha256 });
  await composeError(
    () => correlateManifestRuntimeBinding(evidence, foreignBinding),
    'CORRELATION_MISMATCH',
    'foreign verdict chain',
  );

  // Non-evidence inputs fail closed.
  await composeError(
    () => correlateManifestRuntimeBinding(evidence.validation as never, foreignBinding),
    'NOT_A_MANIFEST_COMPOSITION',
    'verdict is not composition evidence',
  );
  await composeError(
    () => correlateManifestRuntimeBinding(evidence, evidence.validation as never),
    'NOT_A_RUNTIME_BINDING_EVIDENCE',
    'verdict is not binding evidence',
  );
});

test('I-007 correlation: an activation minted under a different binding never correlates', async () => {
  const { entries, compose } = await journey();
  const evidence = await compose({
    semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
    revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
    contentDigest: entries[0]!.selectedDomainData.contentDigest,
  });
  const binding = await bindValidatedComposition(evidence.validation, { sha256 });
  const correlation = correlateManifestRuntimeBinding(evidence, binding);

  // A second composition of the SAME manifest content mints its own verdict,
  // binding and activation: exact-object chain required.
  const secondEvidence = await compose({
    semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
    revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
    contentDigest: entries[0]!.selectedDomainData.contentDigest,
  });
  const secondBinding = await bindValidatedComposition(secondEvidence.validation, { sha256 });
  const secondActivation = await activateRuntimeBinding(secondBinding, {
    sha256,
    activationInstanceId: 'activation-i007-2',
  });
  await composeError(
    () => correlateManifestRuntimeActivation(correlation, secondActivation),
    'CORRELATION_MISMATCH',
    'foreign activation chain',
  );
  await composeError(
    () => correlateManifestRuntimeActivation(binding as never, secondActivation),
    'NOT_A_MANIFEST_BINDING_CORRELATION',
    'binding is not a manifest correlation',
  );

  const genuineActivation = await activateRuntimeBinding(binding, {
    sha256,
    activationInstanceId: 'activation-i007-3',
  });
  await composeError(
    () => correlateManifestRuntimeActivation(correlation, genuineActivation.binding as never),
    'NOT_A_RUNTIME_ACTIVATION_EVIDENCE',
    'binding is not activation evidence',
  );
});

test('I-007 compose: the manifest composition evidence chain stays re-derivable but never mutates the manifest', async () => {
  const { manifest, entries, compose } = await journey();
  const before = JSON.stringify(manifest);
  const evidence = await compose({
    semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
    revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
    contentDigest: entries[0]!.selectedDomainData.contentDigest,
  });
  const binding = await bindValidatedComposition(evidence.validation, { sha256 });
  correlateManifestRuntimeBinding(evidence, binding);
  assert.equal(JSON.stringify(manifest), before);
  assert.throws(() => {
    (manifest as { selectedDomainData?: unknown }).selectedDomainData = [];
  }, TypeError);
});

test('I-007 compose: composition evidence transitively carries the full #306 correlation set', async () => {
  const { entries, compose } = await journey();
  const evidence = await compose({
    semanticIdentity: entries[0]!.selectedDomainData.semanticIdentity,
    revisionIdentity: entries[0]!.selectedDomainData.revisionIdentity,
    contentDigest: entries[0]!.selectedDomainData.contentDigest,
  });
  const verdict: SelectedCompositionValidation = evidence.validation;
  // L2 A2 §6.3 correlation set: selected data, selection provenance,
  // compatibility target, runtime contract, implementation — plus the
  // manifest identity/digest on the composition evidence itself.
  assert.ok(verdict.selectedDomainData);
  assert.ok(verdict.provenance.applicationSelection);
  assert.ok(verdict.provenance.promotionDecision);
  assert.ok(verdict.compatibilityTarget);
  assert.ok(verdict.declared.runtimeContract);
  assert.ok(verdict.declared.runtimeImplementation);
  assert.equal(evidence.manifestIdentity.manifestContentDigest, manifest_digest(evidence));
  assert.ok(isRuntimeBindingEvidence(await bindValidatedComposition(verdict, { sha256 })));
});

function manifest_digest(evidence: {
  manifestIdentity: { manifestContentDigest: string };
}): string {
  return evidence.manifestIdentity.manifestContentDigest;
}
