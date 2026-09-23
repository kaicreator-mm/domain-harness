// Issue #306 / A2 I-003 focused conformance + negative tests for the DAC-aware
// composition intake: accepts already-decided exact composition/selection
// evidence and validates it against the concrete compiled package/runtime
// target WITHOUT ever selecting a package. Every fail-closed dimension of the
// L2 A2 §6.2 Boundary B validation sequence is pinned here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_REFERENCE_BASELINE,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeBindingRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
  isApplicationSelectionRef,
  isCompatibilityTargetRef,
  isSelectedDomainDataRef,
} from '../../src/dac/index.js';
import {
  COMPOSITION_INTAKE_ADAPTER_VERSION,
  CompositionIntakeError,
  computeCompatibilityTargetDigest,
  validateSelectedComposition,
  type RuntimeCompatibilityEnvironment,
  type SelectedCompositionRequest,
} from '../../src/composition-intake/index.js';
import { createCompiledPackage, createSha256Fake } from '../package/fixture.js';

const baseline = { ...DAC_REFERENCE_BASELINE };

const ENV_CONTRACT_MAJOR = 2;
const ENV_ENGINE_MAJOR = 1;
const ENV_FORMAT = '1';
const ENV_PROFILE = 'node-test';
const ENV_CAPS = ['tool.host-local@1'] as const;
const ENV_IMPLEMENTATION = {
  identity: 'domain-harness-runtime',
  version: '0.3.0',
  build: 'build-9f2c1',
} as const;

function environment(
  overrides: Partial<RuntimeCompatibilityEnvironment> = {},
): RuntimeCompatibilityEnvironment {
  return {
    formatVersion: ENV_FORMAT,
    runtimeContractMajor: ENV_CONTRACT_MAJOR,
    executionEngineMajor: ENV_ENGINE_MAJOR,
    targetProfileId: ENV_PROFILE,
    hostCapabilities: [...ENV_CAPS],
    implementation: { ...ENV_IMPLEMENTATION },
    sha256: createSha256Fake(),
    ...overrides,
  };
}

interface CompositionRefs {
  readonly promotionDecision: ReturnType<typeof adoptPromotionDecisionRef>;
  readonly applicationSelection: ReturnType<typeof adoptApplicationSelectionRef>;
  readonly selectedDomainData: ReturnType<typeof adoptSelectedDomainDataRef>;
  readonly runtimeContract: ReturnType<typeof adoptRuntimeContractRef>;
  readonly runtimeImplementation: ReturnType<typeof adoptRuntimeImplementationRef>;
  readonly compatibilityTarget: ReturnType<typeof adoptCompatibilityTargetRef>;
}

function compositionRefs(
  domainId: string,
  revision: string,
  digest: string,
  overrides: Partial<CompositionRefs> = {},
): CompositionRefs {
  return {
    promotionDecision: adoptPromotionDecisionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://governance/promotion',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    applicationSelection: adoptApplicationSelectionRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    selectedDomainData: adoptSelectedDomainDataRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: 'dac://app-composition/acme',
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    runtimeContract: adoptRuntimeContractRef({
      baseline,
      semanticIdentity: 'domain-harness/runtime-contract',
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: String(ENV_CONTRACT_MAJOR),
    }),
    runtimeImplementation: adoptRuntimeImplementationRef({
      baseline,
      semanticIdentity: ENV_IMPLEMENTATION.identity,
      authorityScope: 'domain-harness://runtime',
      revisionIdentity: ENV_IMPLEMENTATION.version,
      contentDigest: ENV_IMPLEMENTATION.build,
    }),
    compatibilityTarget: adoptCompatibilityTargetRef({
      baseline,
      semanticIdentity: `domain-harness/compatibility-target/${ENV_PROFILE}`,
      authorityScope: 'domain-harness://runtime/compatibility',
      revisionIdentity: ENV_PROFILE,
    }),
    ...overrides,
  };
}

async function nominalRequest(
  overrides: {
    readonly refs?: Partial<CompositionRefs>;
    readonly environment?: RuntimeCompatibilityEnvironment;
  } = {},
): Promise<SelectedCompositionRequest & { readonly refs: CompositionRefs }> {
  const compiled = await createCompiledPackage('rev-000042');
  const refs = compositionRefs(
    compiled.manifest.domainId,
    compiled.manifest.domainVersion,
    compiled.manifest.packageId,
    overrides.refs,
  );
  return {
    promotionDecision: refs.promotionDecision,
    applicationSelection: refs.applicationSelection,
    selectedDomainData: refs.selectedDomainData,
    runtimeContract: refs.runtimeContract,
    runtimeImplementation: refs.runtimeImplementation,
    compatibilityTarget: refs.compatibilityTarget,
    compiledPackage: compiled,
    environment: overrides.environment ?? environment(),
    refs,
  };
}

async function assertIntakeError(
  run: () => Promise<unknown>,
  code: string,
  label: string,
): Promise<CompositionIntakeError> {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof CompositionIntakeError, `${label}: expected CompositionIntakeError`);
  assert.equal((caught as CompositionIntakeError).code, code, `${label}: code ${code}`);
  return caught as CompositionIntakeError;
}

test('composition intake: nominal exact composition validates against the concrete package and target', async () => {
  const request = await nominalRequest();

  const verdict = await validateSelectedComposition(request);

  assert.equal(verdict.intake, COMPOSITION_INTAKE_ADAPTER_VERSION);
  assert.equal(verdict.validatedPackageId, request.compiledPackage.manifest.packageId);
  assert.equal(verdict.validatedPackage, request.compiledPackage);

  // Pass-through provenance: the exact upstream-adopted objects, never reminted.
  assert.equal(verdict.selectedDomainData, request.refs.selectedDomainData);
  assert.equal(verdict.provenance.promotionDecision, request.refs.promotionDecision);
  assert.equal(verdict.provenance.applicationSelection, request.refs.applicationSelection);
  assert.equal(verdict.declared.runtimeContract, request.refs.runtimeContract);
  assert.equal(verdict.declared.runtimeImplementation, request.refs.runtimeImplementation);
  assert.ok(isSelectedDomainDataRef(verdict.selectedDomainData));
  assert.ok(Object.isFrozen(verdict));

  // Emitted explicit compatibility-target evidence for the validated target.
  assert.ok(isCompatibilityTargetRef(verdict.compatibilityTarget));
  assert.equal(verdict.compatibilityTarget.revisionIdentity, ENV_PROFILE);
  assert.equal(
    verdict.compatibilityTarget.contentDigest,
    await computeCompatibilityTargetDigest(request.environment),
  );
  assert.deepEqual(verdict.compatibilityTarget.opaque, {
    formatVersion: ENV_FORMAT,
    runtimeContractMajor: ENV_CONTRACT_MAJOR,
    executionEngineMajor: ENV_ENGINE_MAJOR,
    hostCapabilities: [...ENV_CAPS],
  });

  assert.deepEqual(verdict.compatibility, {
    formatVersion: ENV_FORMAT,
    runtimeContractMajor: ENV_CONTRACT_MAJOR,
    executionEngineMajor: ENV_ENGINE_MAJOR,
    targetProfileId: ENV_PROFILE,
    requiredCapabilities: [],
    providedCapabilities: [...ENV_CAPS],
    runtimeImplementation: { ...ENV_IMPLEMENTATION },
  });
});

test('composition intake: selected ref -> package mapping fails closed on every identity dimension (N02/C03)', async () => {
  const base = await nominalRequest();

  const wrongSemantic = compositionRefs(
    'other-domain',
    base.compiledPackage.manifest.domainVersion,
    base.compiledPackage.manifest.packageId,
  );
  await assertIntakeError(
    () =>
      validateSelectedComposition({
        ...base,
        promotionDecision: wrongSemantic.promotionDecision,
        applicationSelection: wrongSemantic.applicationSelection,
        selectedDomainData: wrongSemantic.selectedDomainData,
      }),
    'SELECTED_IDENTITY_MISMATCH',
    'semantic identity != domainId',
  );

  const wrongRevision = compositionRefs(
    base.compiledPackage.manifest.domainId,
    'rev-000099',
    base.compiledPackage.manifest.packageId,
  );
  await assertIntakeError(
    () =>
      validateSelectedComposition({
        ...base,
        promotionDecision: wrongRevision.promotionDecision,
        applicationSelection: wrongRevision.applicationSelection,
        selectedDomainData: wrongRevision.selectedDomainData,
      }),
    'SELECTED_IDENTITY_MISMATCH',
    'revision identity != domainVersion',
  );

  const wrongDigest = compositionRefs(
    base.compiledPackage.manifest.domainId,
    base.compiledPackage.manifest.domainVersion,
    'sha256:drifted',
  );
  const digestError = await assertIntakeError(
    () =>
      validateSelectedComposition({
        ...base,
        promotionDecision: wrongDigest.promotionDecision,
        applicationSelection: wrongDigest.applicationSelection,
        selectedDomainData: wrongDigest.selectedDomainData,
      }),
    'SELECTED_IDENTITY_MISMATCH',
    'content digest != packageId',
  );
  assert.ok(
    digestError.details.some((detail) => detail.includes('contentDigest')),
    'mismatch detail must name the failing dimension',
  );
});

test('composition intake: tampered package content fails closed on package integrity (N02)', async () => {
  const request = await nominalRequest();
  // Tamper manifest content WITHOUT touching the declared identity fields the
  // selected ref maps onto, so the failure must come from package integrity
  // itself (recomputed packageId != declared packageId).
  const tampered = {
    manifest: {
      ...request.compiledPackage.manifest,
      schemas: { injected: { type: 'object' } },
    },
    bindings: request.compiledPackage.bindings,
  };

  const error = await assertIntakeError(
    () => validateSelectedComposition({ ...request, compiledPackage: tampered }),
    'INVALID_COMPOSITION_PACKAGE',
    'recomputed package identity mismatch',
  );
  assert.ok(error.details.some((detail) => detail.includes('PACKAGE_ID_MISMATCH')));
});

test('composition intake: provenance chain contradictions fail closed', async () => {
  const base = await nominalRequest();
  const { domainId, domainVersion, packageId } = base.compiledPackage.manifest;

  const selectionWithoutDigest = adoptApplicationSelectionRef({
    baseline,
    semanticIdentity: domainId,
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: domainVersion,
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, applicationSelection: selectionWithoutDigest }),
    'PROVENANCE_CHAIN_MISMATCH',
    'selection must pin the exact digest',
  );

  const selectionWrongDigest = adoptApplicationSelectionRef({
    baseline,
    semanticIdentity: domainId,
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: domainVersion,
    contentDigest: 'sha256:other',
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, applicationSelection: selectionWrongDigest }),
    'PROVENANCE_CHAIN_MISMATCH',
    'selection digest != selected digest',
  );

  const promotionWrongRevision = adoptPromotionDecisionRef({
    baseline,
    semanticIdentity: domainId,
    authorityScope: 'dac://governance/promotion',
    revisionIdentity: 'rev-000001',
    contentDigest: packageId,
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, promotionDecision: promotionWrongRevision }),
    'PROVENANCE_CHAIN_MISMATCH',
    'promotion revision != selected revision',
  );

  const promotionWrongDigest = adoptPromotionDecisionRef({
    baseline,
    semanticIdentity: domainId,
    authorityScope: 'dac://governance/promotion',
    revisionIdentity: domainVersion,
    contentDigest: 'sha256:mismatch',
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, promotionDecision: promotionWrongDigest }),
    'PROVENANCE_CHAIN_MISMATCH',
    'promotion digest != selected digest when present',
  );

  const promotionWithoutRevision = adoptPromotionDecisionRef({
    baseline,
    semanticIdentity: domainId,
    authorityScope: 'dac://governance/promotion',
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, promotionDecision: promotionWithoutRevision }),
    'PROVENANCE_CHAIN_MISMATCH',
    'promotion must pin the exact revision',
  );

  const selectionWrongSemantic = adoptApplicationSelectionRef({
    baseline,
    semanticIdentity: 'other-domain',
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: domainVersion,
    contentDigest: packageId,
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, applicationSelection: selectionWrongSemantic }),
    'PROVENANCE_CHAIN_MISMATCH',
    'selection semantic identity != selected semantic identity',
  );
});

test('composition intake: explicit runtime contract/implementation/target checks (C23/N08/N09)', async () => {
  const base = await nominalRequest();

  const wrongContractMajor = adoptRuntimeContractRef({
    baseline,
    semanticIdentity: 'domain-harness/runtime-contract',
    authorityScope: 'domain-harness://runtime',
    revisionIdentity: String(ENV_CONTRACT_MAJOR + 1),
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, runtimeContract: wrongContractMajor }),
    'RUNTIME_CONTRACT_MISMATCH',
    'declared contract revision != concrete runtime contract major',
  );

  const contractWithoutRevision = adoptRuntimeContractRef({
    baseline,
    semanticIdentity: 'domain-harness/runtime-contract',
    authorityScope: 'domain-harness://runtime',
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, runtimeContract: contractWithoutRevision }),
    'RUNTIME_CONTRACT_MISMATCH',
    'contract ref must pin the contract revision',
  );

  const wrongImplementation = adoptRuntimeImplementationRef({
    baseline,
    semanticIdentity: ENV_IMPLEMENTATION.identity,
    authorityScope: 'domain-harness://runtime',
    revisionIdentity: '9.9.9',
    contentDigest: ENV_IMPLEMENTATION.build,
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, runtimeImplementation: wrongImplementation }),
    'RUNTIME_IMPLEMENTATION_MISMATCH',
    'implementation version != concrete environment version',
  );

  const implementationWithoutBuild = adoptRuntimeImplementationRef({
    baseline,
    semanticIdentity: ENV_IMPLEMENTATION.identity,
    authorityScope: 'domain-harness://runtime',
    revisionIdentity: ENV_IMPLEMENTATION.version,
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, runtimeImplementation: implementationWithoutBuild }),
    'RUNTIME_IMPLEMENTATION_MISMATCH',
    'implementation ref must pin the concrete build (N09)',
  );

  const wrongTargetProfile = adoptCompatibilityTargetRef({
    baseline,
    semanticIdentity: `domain-harness/compatibility-target/other-profile`,
    authorityScope: 'domain-harness://runtime/compatibility',
    revisionIdentity: 'other-profile',
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, compatibilityTarget: wrongTargetProfile }),
    'COMPATIBILITY_TARGET_MISMATCH',
    'declared target profile != concrete target profile',
  );

  const targetWithoutProfile = adoptCompatibilityTargetRef({
    baseline,
    semanticIdentity: `domain-harness/compatibility-target/${ENV_PROFILE}`,
    authorityScope: 'domain-harness://runtime/compatibility',
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, compatibilityTarget: targetWithoutProfile }),
    'COMPATIBILITY_TARGET_MISMATCH',
    'target ref must pin the concrete target profile',
  );
});

test('composition intake: compatibility-target digest expectation is enforced when supplied', async () => {
  const base = await nominalRequest();
  const expectedDigest = await computeCompatibilityTargetDigest(base.environment);

  const targetWithWrongDigest = adoptCompatibilityTargetRef({
    baseline,
    semanticIdentity: `domain-harness/compatibility-target/${ENV_PROFILE}`,
    authorityScope: 'domain-harness://runtime/compatibility',
    revisionIdentity: ENV_PROFILE,
    contentDigest: 'sha256:not-the-target',
  });
  await assertIntakeError(
    () => validateSelectedComposition({ ...base, compatibilityTarget: targetWithWrongDigest }),
    'COMPATIBILITY_TARGET_MISMATCH',
    'declared target digest != canonical target digest',
  );

  const targetWithExactDigest = adoptCompatibilityTargetRef({
    baseline,
    semanticIdentity: `domain-harness/compatibility-target/${ENV_PROFILE}`,
    authorityScope: 'domain-harness://runtime/compatibility',
    revisionIdentity: ENV_PROFILE,
    contentDigest: expectedDigest,
  });
  const verdict = await validateSelectedComposition({
    ...base,
    compatibilityTarget: targetWithExactDigest,
  });
  assert.equal(verdict.validatedPackageId, base.compiledPackage.manifest.packageId);
});

test('composition intake: contract/implementation identity collapse is rejected (N08)', async () => {
  // Same full identity tuple used for both the contract and implementation
  // roles is the collapse smell N08 forbids, even when each value separately
  // satisfies its binding rule.
  const collapsedEnv = environment({
    implementation: { identity: 'shared-identity', version: '2', build: 'shared-build' },
  });
  const collapsedRef = adoptRuntimeContractRef({
    baseline,
    semanticIdentity: 'shared-identity',
    authorityScope: 'shared://authority',
    revisionIdentity: '2',
    contentDigest: 'shared-build',
  });
  const collapsedImplementation = adoptRuntimeImplementationRef({
    baseline,
    semanticIdentity: 'shared-identity',
    authorityScope: 'shared://authority',
    revisionIdentity: '2',
    contentDigest: 'shared-build',
  });

  const request = await nominalRequest({
    environment: collapsedEnv,
    refs: {
      runtimeContract: collapsedRef,
      runtimeImplementation: collapsedImplementation,
    },
  });
  await assertIntakeError(
    () => validateSelectedComposition(request),
    'ROLE_IDENTITY_COLLAPSE',
    'contract and implementation refs share one identity tuple',
  );
});

test('composition intake: incompatible package fails closed and demands explicit reselection (C32/C37/N07)', async () => {
  const incompatible = await createCompiledPackage('rev-000042', {
    runtimeContractMajor: ENV_CONTRACT_MAJOR + 1,
  });
  const refs = compositionRefs(
    incompatible.manifest.domainId,
    incompatible.manifest.domainVersion,
    incompatible.manifest.packageId,
  );
  const request: SelectedCompositionRequest = {
    promotionDecision: refs.promotionDecision,
    applicationSelection: refs.applicationSelection,
    selectedDomainData: refs.selectedDomainData,
    runtimeContract: refs.runtimeContract,
    runtimeImplementation: refs.runtimeImplementation,
    compatibilityTarget: refs.compatibilityTarget,
    compiledPackage: incompatible,
    environment: environment(),
  };

  const error = await assertIntakeError(
    () => validateSelectedComposition(request),
    'INCOMPATIBLE_SELECTED_COMPOSITION',
    'package contract major != environment contract major',
  );
  assert.ok(error.details.length > 0, 'incompatibility details must name the failing dimension');
  assert.match(error.message, /explicit (upstream )?reselection/i);
  // The message states the C37 prohibition (never substitutes); details must
  // not offer any alternative package/dimension resolution.
  assert.match(error.message, /never substitutes/i);
  assert.ok(
    error.details.every((detail) => !/latest|fallback/i.test(detail)),
    'details must not suggest any alternative',
  );

  const missingCapability = await createCompiledPackage('rev-000043', {
    requiredCapabilities: ['tool.missing@7'],
  });
  const capRefs = compositionRefs(
    missingCapability.manifest.domainId,
    missingCapability.manifest.domainVersion,
    missingCapability.manifest.packageId,
  );
  await assertIntakeError(
    () =>
      validateSelectedComposition({
        promotionDecision: capRefs.promotionDecision,
        applicationSelection: capRefs.applicationSelection,
        selectedDomainData: capRefs.selectedDomainData,
        runtimeContract: capRefs.runtimeContract,
        runtimeImplementation: capRefs.runtimeImplementation,
        compatibilityTarget: capRefs.compatibilityTarget,
        compiledPackage: missingCapability,
        environment: environment(),
      }),
    'INCOMPATIBLE_SELECTED_COMPOSITION',
    'missing required host capability',
  );
});

test('composition intake: malformed environment declarations fail closed (N09)', async () => {
  const base = await nominalRequest();

  await assertIntakeError(
    () =>
      validateSelectedComposition({
        ...base,
        environment: environment({ implementation: { identity: 'x', version: '0.3.0' } as never }),
      }),
    'INVALID_COMPOSITION_INTAKE',
    'implementation build is mandatory',
  );

  await assertIntakeError(
    () => validateSelectedComposition({ ...base, environment: environment({ formatVersion: '' }) }),
    'INVALID_COMPOSITION_INTAKE',
    'formatVersion must be non-empty',
  );

  await assertIntakeError(
    () =>
      validateSelectedComposition({
        ...base,
        environment: environment({ runtimeContractMajor: 2.5 }),
      }),
    'INVALID_COMPOSITION_INTAKE',
    'runtimeContractMajor must be an integer',
  );

  await assertIntakeError(
    () =>
      validateSelectedComposition({
        ...base,
        environment: environment({ targetProfileId: '' }),
      }),
    'INVALID_COMPOSITION_INTAKE',
    'targetProfileId must be non-empty',
  );

  await assertIntakeError(
    () =>
      validateSelectedComposition({
        ...base,
        environment: environment({ hostCapabilities: ['not-a-capability' as never] }),
      }),
    'INVALID_COMPOSITION_INTAKE',
    'capability ids must be name@major',
  );

  await assertIntakeError(
    () =>
      validateSelectedComposition({
        ...base,
        environment: environment({ sha256: undefined as never }),
      }),
    'INVALID_COMPOSITION_INTAKE',
    'sha256 port is mandatory',
  );
});

test('composition intake: non-adopted or wrong-role lifecycle refs fail closed at the boundary', async () => {
  const base = await nominalRequest();

  const bindingRef = adoptRuntimeBindingRef({
    baseline,
    semanticIdentity: 'domain:billing:invoice-rules',
    authorityScope: 'dac://app-composition/acme',
  });
  await assert.rejects(
    () => validateSelectedComposition({ ...base, runtimeContract: bindingRef as never }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: unknown }).code, 'ROLE_MISMATCH');
      return true;
    },
    'runtime-binding ref can never satisfy the runtime-contract role',
  );

  const forged = {
    adapter: 'dac-reference-adapter/1',
    baseline,
    role: 'selected-domain-data',
    semanticIdentity: base.compiledPackage.manifest.domainId,
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: base.compiledPackage.manifest.domainVersion,
    contentDigest: base.compiledPackage.manifest.packageId,
    opaque: {},
  };
  await assert.rejects(
    () => validateSelectedComposition({ ...base, selectedDomainData: forged as never }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: unknown }).code, 'ROLE_MISMATCH');
      return true;
    },
    'forged selected-domain-data object fails the adoption registry',
  );
});

test('composition intake: canonical target digest is order-stable and dimension-sensitive', async () => {
  const digest = await computeCompatibilityTargetDigest(environment());

  const withExtra: readonly ['tool.host-local@1', 'query.inline@1'] = [
    ...ENV_CAPS,
    'query.inline@1',
  ];
  const reordered = await computeCompatibilityTargetDigest(
    environment({ hostCapabilities: [...withExtra].reverse() }),
  );
  const addedCapability = await computeCompatibilityTargetDigest(
    environment({ hostCapabilities: withExtra }),
  );
  const otherProfile = await computeCompatibilityTargetDigest(
    environment({ targetProfileId: 'expo-android' }),
  );
  const otherContractMajor = await computeCompatibilityTargetDigest(
    environment({ runtimeContractMajor: 3 }),
  );

  assert.equal(
    await computeCompatibilityTargetDigest(environment()),
    digest,
    'same environment -> same digest',
  );
  assert.notEqual(reordered, digest);
  assert.equal(
    await computeCompatibilityTargetDigest(
      environment({ hostCapabilities: [...ENV_CAPS, 'query.inline@1'] }),
    ),
    addedCapability,
    'same capability set in any order -> same digest',
  );
  assert.notEqual(otherProfile, digest);
  assert.notEqual(otherContractMajor, digest);
});

test('composition intake: verdict records the concrete required capabilities it validated', async () => {
  const compiled = await createCompiledPackage('rev-000044', {
    requiredCapabilities: ['tool.host-local@1'],
  });
  const refs = compositionRefs(
    compiled.manifest.domainId,
    compiled.manifest.domainVersion,
    compiled.manifest.packageId,
  );

  const verdict = await validateSelectedComposition({
    promotionDecision: refs.promotionDecision,
    applicationSelection: refs.applicationSelection,
    selectedDomainData: refs.selectedDomainData,
    runtimeContract: refs.runtimeContract,
    runtimeImplementation: refs.runtimeImplementation,
    compatibilityTarget: refs.compatibilityTarget,
    compiledPackage: compiled,
    environment: environment(),
  });

  assert.deepEqual(verdict.compatibility.requiredCapabilities, ['tool.host-local@1']);
  assert.ok(!('applicationSelectionRef' in verdict));
  assert.equal(isApplicationSelectionRef(verdict), false);
});
