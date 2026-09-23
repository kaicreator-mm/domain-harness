// Issue #310 / A2 I-007 focused conformance + negative tests for adopting a
// PROVISIONAL Application Manifest: acceptance ONLY of already-selected
// composition metadata under the exact frozen baseline/contract version,
// fail-closed on every identity/declaration/evidence dimension of DAC
// v0.0.2 APPLICATION_MANIFEST §§1-4, 8-12 and L2 A2 §7 / PRD A2 §7.
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
  DacReferenceError,
  isApplicationSelectionRef,
  isPromotionDecisionRef,
  isSelectedDomainDataRef,
  adoptRuntimeBindingRef,
} from '../../src/dac/index.js';
import {
  adoptExternalAuthorityRef,
  adoptRuntimeLogicalOperationRef,
  ExternalAuthorityError,
} from '../../src/external-authority/index.js';
import { validateSelectedComposition } from '../../src/composition-intake/index.js';
import type { SelectedCompositionValidation } from '../../src/composition-intake/index.js';
import {
  bindValidatedComposition,
  isRuntimeBindingEvidence,
} from '../../src/runtime-binding/index.js';
import {
  APPLICATION_MANIFEST_ADAPTER_VERSION,
  APPLICATION_MANIFEST_CONTRACT_VERSION,
  ApplicationManifestError,
  MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY,
  MANIFEST_UX_CONTRACT_ROLES,
  adoptApplicationManifest,
  computeApplicationManifestDigest,
  isApplicationManifest,
  isManifestCompositionEvidence,
  manifestIdentityOf,
  type ApplicationManifestAdoptionInput,
} from '../../src/application-manifest/index.js';
import { createCompiledPackage, createSha256Fake } from '../package/fixture.js';

const baseline = { ...DAC_REFERENCE_BASELINE };
const sha256 = createSha256Fake();

const ENV = {
  formatVersion: '1',
  runtimeContractMajor: 2,
  executionEngineMajor: 1,
  targetProfileId: 'node-test',
  hostCapabilities: [],
  implementation: { identity: 'domain-harness-runtime', version: '0.3.0', build: 'build-1' },
} as const;

function identityInput(
  domainId: string,
  revision: string,
  digest: string,
): { baseline: typeof baseline; semanticIdentity: string; authorityScope: string; revisionIdentity: string; contentDigest: string } {
  return {
    baseline,
    semanticIdentity: domainId,
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: revision,
    contentDigest: digest,
  };
}

/** Compiled-package-backed selected entries like the #306/#307 suites use. */
async function entryFixture(
  domainVersion: string,
  domainId = 'fixture-domain',
): Promise<{
  compiled: Awaited<ReturnType<typeof createCompiledPackage>>;
  promotionDecision: ReturnType<typeof adoptPromotionDecisionRef>;
  applicationSelection: ReturnType<typeof adoptApplicationSelectionRef>;
  selectedDomainData: ReturnType<typeof adoptSelectedDomainDataRef>;
}> {
  const compiled = await createCompiledPackage(domainVersion);
  const input = identityInput(
    domainId,
    compiled.manifest.domainVersion,
    compiled.manifest.packageId,
  );
  return {
    compiled,
    promotionDecision: adoptPromotionDecisionRef(input),
    applicationSelection: adoptApplicationSelectionRef(input),
    selectedDomainData: adoptSelectedDomainDataRef(input),
  };
}

function declaredRefs() {
  return {
    runtimeContract: adoptRuntimeContractRef({
      baseline,
      semanticIdentity: 'runtime-contract',
      authorityScope: 'domain-harness://runtime/contract',
      revisionIdentity: String(ENV.runtimeContractMajor),
    }),
    runtimeImplementation: adoptRuntimeImplementationRef({
      baseline,
      semanticIdentity: ENV.implementation.identity,
      authorityScope: 'domain-harness://runtime/implementation',
      revisionIdentity: ENV.implementation.version,
      contentDigest: ENV.implementation.build,
    }),
    compatibilityTarget: adoptCompatibilityTargetRef({
      baseline,
      semanticIdentity: `domain-harness/compatibility-target/${ENV.targetProfileId}`,
      authorityScope: 'domain-harness://runtime/compatibility',
      revisionIdentity: ENV.targetProfileId,
    }),
  };
}

interface ManifestFixtureOptions {
  readonly manifestIdentity?: string;
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Builds a fully valid adoption input (digest computed over its own exact
 * content) so positive/negative deltas are one field away. Each fixture gets
 * a unique manifest identity: the adapter's identity→digest conflict
 * registry is process-global by design, so only the deliberate conflict
 * test may share identities across adoptions.
 */
let fixtureCounter = 0;

async function manifestFixture(
  options: ManifestFixtureOptions = {},
): Promise<{ input: ApplicationManifestAdoptionInput; entries: Awaited<ReturnType<typeof entryFixture>>[] }> {
  fixtureCounter += 1;
  const first = await entryFixture('rev-000042');
  const second = await entryFixture('rev-000043');
  const declared = declaredRefs();
  const draft: Omit<ApplicationManifestAdoptionInput, 'manifestContentDigest'> = {
    baseline,
    contractVersion: APPLICATION_MANIFEST_CONTRACT_VERSION,
    applicationSemanticIdentity: 'app:acme:pricing',
    applicationRevisionIdentity: 'app-rev-7',
    manifestIdentity:
      options.manifestIdentity ?? `manifest:acme:pricing:7:${String(fixtureCounter)}`,
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
    ...(options.opaque === undefined ? {} : { opaque: options.opaque }),
  };
  const manifestContentDigest = await computeApplicationManifestDigest(
    draft as unknown as ApplicationManifestAdoptionInput,
    { sha256 },
  );
  return {
    input: { ...draft, manifestContentDigest },
    entries: [first, second],
  };
}

function adoptionError(
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

// ------------------------------------------------------------- positive path

test('I-007 adoption: a fully valid already-selected manifest is adopted as frozen composition metadata', async () => {
  const { input } = await manifestFixture();
  const manifest = await adoptApplicationManifest(input, { sha256 });

  assert.ok(isApplicationManifest(manifest));
  assert.equal(manifest.adapter, APPLICATION_MANIFEST_ADAPTER_VERSION);
  assert.equal(manifest.contractVersion, APPLICATION_MANIFEST_CONTRACT_VERSION);
  assert.equal(manifest.baseline, DAC_REFERENCE_BASELINE);
  assert.equal(manifest.selectedDomainData.length, 2);
  assert.ok(isSelectedDomainDataRef(manifest.selectedDomainData[0]!.selected));
  assert.ok(isPromotionDecisionRef(manifest.selectedDomainData[0]!.promotionDecision));
  assert.ok(isApplicationSelectionRef(manifest.selectedDomainData[0]!.applicationSelection));
  assert.deepEqual(manifestIdentityOf(manifest), {
    applicationSemanticIdentity: 'app:acme:pricing',
    applicationRevisionIdentity: 'app-rev-7',
    manifestIdentity: input.manifestIdentity,
    manifestContentDigest: manifest.manifestContentDigest,
  });

  // A structurally identical forged copy never passes the guard.
  assert.equal(isApplicationManifest({ ...manifest }), false);
  assert.equal(isApplicationManifest(null), false);
});

test('I-007 adoption: unknown PROVISIONAL fields are preserved opaquely and verbatim', async () => {
  const { input } = await manifestFixture({
    opaque: { 'x-custom-field': { deep: [1, 2, { three: true }] }, wireFormat: 'unknown-v9' },
  });
  const manifest = await adoptApplicationManifest(input, { sha256 });
  assert.deepEqual(manifest.opaque, {
    'x-custom-field': { deep: [1, 2, { three: true }] },
    wireFormat: 'unknown-v9',
  });
});

test('I-007 adoption: re-presenting the identical manifest content is idempotent', async () => {
  const { input } = await manifestFixture();
  const first = await adoptApplicationManifest(input, { sha256 });
  const second = await adoptApplicationManifest(input, { sha256 });
  assert.equal(first.manifestIdentity, second.manifestIdentity);
  assert.equal(first.manifestContentDigest, second.manifestContentDigest);
});

// ------------------------------------------------------- baseline / contract

test('I-007 adoption: a foreign baseline is rejected (no parallel manifest authority)', async () => {
  const { input } = await manifestFixture();
  await adoptionError(
    () =>
      adoptApplicationManifest(
        {
          ...input,
          baseline: { contract: 'other-contract', version: 'v9.9.9', baselineCommit: '0000' },
        },
        { sha256 },
      ),
    'UNSUPPORTED_MANIFEST_BASELINE',
    'foreign baseline',
  );
});

test('I-007 adoption: a different manifest contract version is rejected', async () => {
  const { input } = await manifestFixture();
  await adoptionError(
    () =>
      adoptApplicationManifest(
        { ...input, contractVersion: 'dac-application-manifest/v0.0.3' },
        { sha256 },
      ),
    'UNSUPPORTED_MANIFEST_CONTRACT_VERSION',
    'contract drift',
  );
});

// -------------------------------------------------------------- identity set

test('I-007 adoption: mutable aliases are rejected for every immutable manifest identity', async () => {
  for (const alias of ['latest', 'current', 'head', 'main', 'master', 'default', 'stable', 'tip']) {
    for (const field of ['applicationRevisionIdentity', 'manifestIdentity'] as const) {
      const { input } = await manifestFixture();
      await adoptionError(
        () => adoptApplicationManifest({ ...input, [field]: alias }, { sha256 }),
        'MUTABLE_ALIAS_REJECTED',
        `${field}=${alias}`,
      );
    }
  }
});

test('I-007 adoption: manifest alias vocabulary matches the #305 adapter alias rejection', () => {
  // Cross-pin: every alias the manifest rejects for its identities is also
  // rejected by the #305 core for selected revision identities — one frozen
  // vocabulary, no drift between the two surfaces.
  for (const alias of ['latest', 'current', 'head', 'main', 'master', 'default', 'stable', 'tip']) {
    assert.throws(
      () =>
        adoptSelectedDomainDataRef({
          baseline,
          semanticIdentity: 'domain:x',
          authorityScope: 'dac://x',
          revisionIdentity: alias,
          contentDigest: 'digest-x',
        }),
      (error: unknown) =>
        error instanceof DacReferenceError && error.code === 'MUTABLE_ALIAS_REJECTED',
      `#305 must reject ${alias}`,
    );
  }
});

test('I-007 adoption: exact identities that merely contain alias words are accepted', async () => {
  const { input } = await manifestFixture({
    manifestIdentity: 'manifest:acme:latest-pricing-model:7',
  });
  const manifest = await adoptApplicationManifest(input, { sha256 });
  assert.equal(manifest.manifestIdentity, 'manifest:acme:latest-pricing-model:7');
});

// ----------------------------------------------------------------- integrity

test('I-007 adoption: declared digest drifting from the canonical content digest fails closed', async () => {
  const { input } = await manifestFixture();
  await adoptionError(
    () =>
      adoptApplicationManifest(
        { ...input, manifestContentDigest: 'tampered-digest-0000' },
        { sha256 },
      ),
    'MANIFEST_DIGEST_MISMATCH',
    'digest drift',
  );
});

test('I-007 adoption: content change under a declared digest fails closed (content and digest adopt together)', async () => {
  const { input } = await manifestFixture();
  const tampered = { ...input, applicationRevisionIdentity: 'app-rev-8' };
  await adoptionError(
    () => adoptApplicationManifest(tampered, { sha256 }),
    'MANIFEST_DIGEST_MISMATCH',
    'content changed under old digest',
  );
});

test('I-007 adoption: the same immutable manifest identity resolving to a different authoritative digest fails closed', async () => {
  const { input } = await manifestFixture({ manifestIdentity: 'manifest:acme:conflict:1' });
  await adoptApplicationManifest(input, { sha256 });

  // Same identity, semantically different content, honestly re-digested:
  // the identity now resolves to two authoritative digests => fail closed.
  const drifted = { ...input, applicationRevisionIdentity: 'app-rev-8' };
  const driftedDigest = await computeApplicationManifestDigest(drifted, { sha256 });
  await adoptionError(
    () => adoptApplicationManifest({ ...drifted, manifestContentDigest: driftedDigest }, { sha256 }),
    'MANIFEST_IDENTITY_DIGEST_CONFLICT',
    'identity/digest conflict',
  );
});

// ------------------------------------------------------------ selected entry

test('I-007 adoption: a manifest with no selected entries is rejected (it selects nothing)', async () => {
  const { input } = await manifestFixture();
  await adoptionError(
    () => adoptApplicationManifest({ ...input, selectedDomainData: [] }, { sha256 }),
    'INVALID_MANIFEST',
    'no selected entries',
  );
});

test('I-007 adoption: collapsing promotion and application selection into one ref fails closed (DAC §13.1 case 4)', async () => {
  const { input } = await manifestFixture();
  const collapsed = {
    ...input,
    selectedDomainData: [
      {
        selected: input.selectedDomainData[0]!.selected,
        // promotion slot carries the selection ref: promotion != selection
        // are distinct authority steps and no role stands in for the other.
        promotionDecision: input.selectedDomainData[0]!.applicationSelection as never,
        applicationSelection: input.selectedDomainData[0]!.applicationSelection,
      },
    ],
  };
  await assert.rejects(
    () => adoptApplicationManifest(collapsed as unknown as ApplicationManifestAdoptionInput, { sha256 }),
    (error: unknown) => error instanceof DacReferenceError && error.code === 'ROLE_MISMATCH',
  );
});

test('I-007 adoption: a forged selected ref (wrong role) fails closed as DacReferenceError', async () => {
  const { input } = await manifestFixture();
  const forged = {
    ...input,
    selectedDomainData: [
      {
        selected: input.selectedDomainData[0]!.applicationSelection as never,
        promotionDecision: input.selectedDomainData[0]!.promotionDecision,
        applicationSelection: input.selectedDomainData[0]!.applicationSelection,
      },
    ],
  };
  await assert.rejects(
    () => adoptApplicationManifest(forged as unknown as ApplicationManifestAdoptionInput, { sha256 }),
    (error: unknown) => error instanceof DacReferenceError && error.code === 'ROLE_MISMATCH',
  );
});

// ------------------------------------------------------ instance-state (N17)

test('I-007 adoption: recognized live instance-state fields are rejected in every opaque area', async () => {
  for (const field of MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY) {
    const { input } = await manifestFixture();
    await adoptionError(
      () => adoptApplicationManifest({ ...input, opaque: { [field]: 'live-value' } }, { sha256 }),
      'INSTANCE_STATE_LEAKAGE',
      `opaque.${field}`,
    );
    await adoptionError(
      () =>
        adoptApplicationManifest(
          { ...input, compositionProvenance: { [field]: { step: 3 } } },
          { sha256 },
        ),
      'INSTANCE_STATE_LEAKAGE',
      `compositionProvenance.${field}`,
    );
  }
});

// --------------------------------------------------- evidence absorption N18

async function verdictFixture(): Promise<SelectedCompositionValidation> {
  const entry = await entryFixture('rev-000042');
  const declared = declaredRefs();
  return validateSelectedComposition({
    promotionDecision: entry.promotionDecision,
    applicationSelection: entry.applicationSelection,
    selectedDomainData: entry.selectedDomainData,
    ...declared,
    compiledPackage: entry.compiled,
    environment: { ...ENV, hostCapabilities: [], sha256 },
  });
}

test('I-007 adoption: #306/#307 evidence objects are rejected as manifest definition content', async () => {
  const verdict = await verdictFixture();
  const binding = await bindValidatedComposition(verdict, { sha256 });
  const bindingRef = adoptRuntimeBindingRef({
    baseline,
    semanticIdentity: 'domain-harness/runtime-binding/x',
    authorityScope: 'domain-harness://runtime/binding',
    revisionIdentity: 'rev-1',
    contentDigest: 'digest-1',
  });

  const carriers: readonly [string, unknown][] = [
    ['a #306 verdict', verdict],
    ['#307 binding evidence', binding],
    ['#307 binding ref', bindingRef],
  ];
  for (const [label, evidence] of carriers) {
    const { input } = await manifestFixture();
    await adoptionError(
      () =>
        adoptApplicationManifest(
          { ...input, opaque: { smuggledEvidence: evidence } },
          { sha256 },
        ),
      'MANIFEST_EVIDENCE_ABSORPTION',
      `opaque carries ${label}`,
    );
    const { input: withSlot } = await manifestFixture();
    await adoptionError(
      () =>
        adoptApplicationManifest(
          {
            ...withSlot,
            selectedDomainData: [
              {
                selected: evidence as never,
                promotionDecision: withSlot.selectedDomainData[0]!.promotionDecision,
                applicationSelection: withSlot.selectedDomainData[0]!.applicationSelection,
              },
            ],
          },
          { sha256 },
        ),
      'MANIFEST_EVIDENCE_ABSORPTION',
      `selected slot carries ${label}`,
    );
  }
});

test('I-007 adoption: the adopted manifest record has no evidence/instance-state field at all', async () => {
  const { input } = await manifestFixture();
  const manifest = await adoptApplicationManifest(input, { sha256 });
  const keys = Object.keys(manifest).sort();
  assert.deepEqual(keys, [
    'adapter',
    'applicationRevisionIdentity',
    'applicationSemanticIdentity',
    'baseline',
    'compositionProvenance',
    'contractVersion',
    'declared',
    'externalAuthorityDeclarations',
    'manifestContentDigest',
    'manifestIdentity',
    'opaque',
    'requiredCapabilities',
    'selectedDomainData',
    'uxContractRequirements',
  ]);
  for (const nested of [
    ...manifest.selectedDomainData,
    ...manifest.uxContractRequirements,
    ...manifest.externalAuthorityDeclarations,
  ]) {
    assert.equal(Object.isFrozen(nested), true);
  }
});

test('I-007 adoption: post-adoption mutation attempts throw (definition is immutable)', async () => {
  const { input } = await manifestFixture();
  const manifest = await adoptApplicationManifest(input, { sha256 });
  assert.throws(() => {
    (manifest as { manifestIdentity?: string }).manifestIdentity = 'manifest:mutated';
  }, TypeError);
  assert.throws(() => {
    (manifest.selectedDomainData as unknown as { push(x: unknown): void }).push({} as never);
  }, TypeError);
  assert.throws(() => {
    (manifest.opaque as Record<string, unknown>)['injected'] = true;
  }, TypeError);
});

// -------------------------------------------------------- UX requirements

test('I-007 adoption: UX interaction-contract requirements preserve the closed role vocabulary and PROVISIONAL descriptors opaquely', async () => {
  const { input } = await manifestFixture();
  const withUx = {
    ...input,
    uxContractRequirements: [
      {
        contractRole: 'view',
        semanticIdentity: 'ux-contract:pricing:main-view',
        revisionIdentity: 'ux-rev-3',
        opaque: { descriptorShape: 'provisional', interactions: ['read', 'refresh'] },
      },
    ],
  } as unknown as ApplicationManifestAdoptionInput;
  const digest = await computeApplicationManifestDigest(withUx, { sha256 });
  const manifest = await adoptApplicationManifest(
    { ...withUx, manifestContentDigest: digest },
    { sha256 },
  );
  assert.equal(manifest.uxContractRequirements.length, 1);
  assert.equal(manifest.uxContractRequirements[0]!.contractRole, 'view');
  assert.deepEqual(manifest.uxContractRequirements[0]!.opaque, {
    descriptorShape: 'provisional',
    interactions: ['read', 'refresh'],
  });

  await adoptionError(
    () =>
      adoptApplicationManifest(
        {
          ...input,
          uxContractRequirements: [
            { contractRole: 'dom-node-tree', semanticIdentity: 'ux:renderer' },
          ],
        } as unknown as ApplicationManifestAdoptionInput,
        { sha256 },
      ),
    'INVALID_MANIFEST',
    'renderer role vocabulary',
  );
  assert.equal(MANIFEST_UX_CONTRACT_ROLES.includes('dom-node-tree' as never), false);
});

test('I-007 adoption: a non-bridge anchor object is rejected as a UX contract anchor', async () => {
  const { input } = await manifestFixture();
  const forged = {
    ...input,
    uxContractRequirements: [
      {
        contractRole: 'view',
        semanticIdentity: 'ux-contract:pricing',
        bridgeReference: { adapter: 'dac-bridge-adapter/1', role: 'view', forged: true } as never,
      },
    ],
  } as unknown as ApplicationManifestAdoptionInput;
  await adoptionError(
    () => adoptApplicationManifest(forged, { sha256 }),
    'INVALID_MANIFEST',
    'forged bridge anchor',
  );
});

// ------------------------------------------------- external authority (N16)

test('I-007 adoption: external-authority declarations accept only #309-adopted ExternalAuthorityRef identities', async () => {
  const authority = adoptExternalAuthorityRef({
    baseline: {
      contract: 'domain-application-contract',
      version: 'v0.0.2',
      baselineCommit: DAC_REFERENCE_BASELINE.baselineCommit,
    },
    authorityId: 'soR:acme:billing',
    authorityScope: 'external://acme/billing',
    opaque: { reconciliation: true, watch: true },
  });
  const { input } = await manifestFixture();
  const withDeclaration = {
    ...input,
    externalAuthorityDeclarations: [
      {
        authority,
        capabilityRequirements: { requiresReconciliation: true, requiresIdempotency: true },
      },
    ],
  } as unknown as ApplicationManifestAdoptionInput;
  const digest = await computeApplicationManifestDigest(withDeclaration, { sha256 });
  const manifest = await adoptApplicationManifest(
    { ...withDeclaration, manifestContentDigest: digest },
    { sha256 },
  );
  assert.equal(manifest.externalAuthorityDeclarations.length, 1);
  assert.deepEqual(manifest.externalAuthorityDeclarations[0]!.capabilityRequirements, {
    requiresReconciliation: true,
    requiresIdempotency: true,
  });
});

test('I-007 adoption: a DAC Runtime identity substituting external SoR identity fails closed (N16)', async () => {
  const { input } = await manifestFixture();
  const runtimeSubstitute = declaredRefs().runtimeImplementation;
  const substituted = {
    ...input,
    externalAuthorityDeclarations: [{ authority: runtimeSubstitute as never }],
  } as unknown as ApplicationManifestAdoptionInput;
  await assert.rejects(
    () => adoptApplicationManifest(substituted, { sha256 }),
    (error: unknown) =>
      error instanceof DacReferenceError && error.code === 'EXTERNAL_IDENTITY_FORBIDDEN',
  );
});

test('I-007 adoption: a #309 non-authority ref substituting external identity fails closed', async () => {
  const { input } = await manifestFixture();
  const operationRef = adoptRuntimeLogicalOperationRef({
    baseline: {
      contract: 'domain-application-contract',
      version: 'v0.0.2',
      baselineCommit: DAC_REFERENCE_BASELINE.baselineCommit,
    },
    effectId: 'effect-1',
  });
  const substituted = {
    ...input,
    externalAuthorityDeclarations: [{ authority: operationRef as never }],
  } as unknown as ApplicationManifestAdoptionInput;
  await assert.rejects(
    () => adoptApplicationManifest(substituted, { sha256 }),
    (error: unknown) =>
      error instanceof ExternalAuthorityError && error.code === 'IDENTITY_MISMATCH',
  );
});

test('I-007 adoption: a provider URL alone is not an authority contract', async () => {
  const { input } = await manifestFixture();
  const urlOnly = {
    ...input,
    externalAuthorityDeclarations: [{ authority: 'https://provider.acme.example/api' as never }],
  } as unknown as ApplicationManifestAdoptionInput;
  await adoptionError(
    () => adoptApplicationManifest(urlOnly, { sha256 }),
    'EXTERNAL_IDENTITY_SUBSTITUTION',
    'URL-only declaration',
  );
});

// ------------------------------------------------------------ capabilities

test('I-007 adoption: malformed capability declarations fail closed at adoption', async () => {
  const { input } = await manifestFixture();
  const bad = {
    ...input,
    requiredCapabilities: ['tool.host-local'],
  } as unknown as ApplicationManifestAdoptionInput;
  await adoptionError(
    () => adoptApplicationManifest(bad, { sha256 }),
    'INVALID_MANIFEST',
    'capability without @major',
  );
});

test('I-007 adoption: options without a sha256 port fail closed', async () => {
  const { input } = await manifestFixture();
  await adoptionError(
    () => adoptApplicationManifest(input, {} as never),
    'INVALID_MANIFEST',
    'missing digest port',
  );
});

// ------------------------------------------------------ guard surfaces misc

test('I-007 guards: evidence guards reject foreign objects and projection requires adoption', async () => {
  assert.equal(isManifestCompositionEvidence({ manifestComposition: 'manifest-composition/1' }), false);
  const { input } = await manifestFixture();
  const manifest = await adoptApplicationManifest(input, { sha256 });
  assert.throws(
    () => manifestIdentityOf({ ...manifest } as never),
    (error: unknown) =>
      error instanceof ApplicationManifestError &&
      error.code === 'NOT_AN_ADOPTED_APPLICATION_MANIFEST',
  );
});

test('I-007 adoption: #307 binding evidence stays guardable outside the manifest (separation is structural)', async () => {
  const verdict = await verdictFixture();
  const binding = await bindValidatedComposition(verdict, { sha256 });
  assert.ok(isRuntimeBindingEvidence(binding));
  // The manifest carries no binding evidence anywhere, and the binding
  // carries no manifest field: separation holds on both sides.
  const serialized = JSON.stringify(binding);
  assert.equal(serialized.includes('manifestIdentity'), false);
});
