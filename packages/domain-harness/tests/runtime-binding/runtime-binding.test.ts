// Issue #307 / A2 I-004 focused conformance + negative tests for Runtime
// binding and technical activation evidence: stages 4+5 of the five-stage
// composition-to-runtime boundary (L2 A2 §5/§6.3). Binding consumes ONLY a
// genuine #306 stage-3 compatibility verdict and never manufactures selection
// (N05); activation consumes ONLY a genuine binding of this module and never
// manufactures selection or binding (N06/C22); the three refs stay separately
// referrable (C31); no default/latest/substitution path exists (C32/C37/N07).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_REFERENCE_BASELINE,
  DacReferenceError,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeBindingRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
  getDacReferenceRole,
  isApplicationSelectionRef,
  isRuntimeActivationRef,
  isRuntimeBindingRef,
  isSelectedDomainDataRef,
} from '../../src/dac/index.js';
import {
  CompositionIntakeError,
  validateSelectedComposition,
  type RuntimeCompatibilityEnvironment,
  type SelectedCompositionRequest,
  type SelectedCompositionValidation,
} from '../../src/composition-intake/index.js';
import {
  RUNTIME_ACTIVATION_ADAPTER_VERSION,
  RUNTIME_BINDING_ADAPTER_VERSION,
  RuntimeBindingError,
  activateRuntimeBinding,
  bindValidatedComposition,
  isRuntimeBindingEvidence,
  type RuntimeActivationEvidence,
  type RuntimeBindingEvidence,
} from '../../src/runtime-binding/index.js';
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
  selectionAuthority = 'dac://app-composition/acme',
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
      authorityScope: selectionAuthority,
      revisionIdentity: revision,
      contentDigest: digest,
    }),
    selectedDomainData: adoptSelectedDomainDataRef({
      baseline,
      semanticIdentity: domainId,
      authorityScope: selectionAuthority,
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
  };
}

async function validatedComposition(
  overrides: {
    readonly revision?: string;
    readonly selectionAuthority?: string;
  } = {},
): Promise<{ verdict: SelectedCompositionValidation; refs: CompositionRefs; packageId: string }> {
  const compiled = await createCompiledPackage(overrides.revision ?? 'rev-000042');
  const refs = compositionRefs(
    compiled.manifest.domainId,
    compiled.manifest.domainVersion,
    compiled.manifest.packageId,
    overrides.selectionAuthority,
  );
  const request: SelectedCompositionRequest = {
    promotionDecision: refs.promotionDecision,
    applicationSelection: refs.applicationSelection,
    selectedDomainData: refs.selectedDomainData,
    runtimeContract: refs.runtimeContract,
    runtimeImplementation: refs.runtimeImplementation,
    compatibilityTarget: refs.compatibilityTarget,
    compiledPackage: compiled,
    environment: environment(),
  };
  return {
    verdict: await validateSelectedComposition(request),
    refs,
    packageId: compiled.manifest.packageId,
  };
}

async function assertBindingError(
  run: () => Promise<unknown>,
  code: string,
  label: string,
): Promise<RuntimeBindingError> {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof RuntimeBindingError, `${label}: expected RuntimeBindingError`);
  assert.equal((caught as RuntimeBindingError).code, code, `${label}: code ${code}`);
  return caught as RuntimeBindingError;
}

test('runtime binding: a genuine stage-3 verdict binds to separately referrable binding evidence', async () => {
  const { verdict, refs, packageId } = await validatedComposition();

  const binding = await bindValidatedComposition(verdict, { sha256: createSha256Fake() });

  assert.equal(binding.binding, RUNTIME_BINDING_ADAPTER_VERSION);
  assert.ok(isRuntimeBindingEvidence(binding));
  assert.ok(isRuntimeBindingRef(binding.bindingRef));
  assert.equal(getDacReferenceRole(binding.bindingRef), 'runtime-binding');
  // Exact stage-3 verdict pass-through (=== identity, never reminted).
  assert.equal(binding.validation, verdict);
  // Correlation chain preserved transitively (L2 A2 §6.3).
  assert.equal(binding.validation.provenance.applicationSelection, refs.applicationSelection);
  assert.equal(binding.validation.selectedDomainData, refs.selectedDomainData);
  assert.equal(binding.validation.compatibilityTarget.contentDigest, verdict.compatibilityTarget.contentDigest);

  // Binding ref identity: exact bound revision, content-derived binding digest.
  assert.equal(binding.bindingRef.revisionIdentity, refs.selectedDomainData.revisionIdentity);
  assert.equal(
    binding.bindingRef.semanticIdentity,
    `domain-harness/runtime-binding/${refs.selectedDomainData.semanticIdentity}/${ENV_PROFILE}`,
  );
  assert.equal(binding.bindingRef.authorityScope, 'domain-harness://runtime/binding');
  assert.ok(binding.bindingRef.contentDigest && binding.bindingRef.contentDigest.length > 0);
  assert.deepEqual(binding.bindingRef.opaque, {
    intake: verdict.intake,
    validatedPackageId: packageId,
    targetProfileId: ENV_PROFILE,
    runtimeContractMajor: ENV_CONTRACT_MAJOR,
    executionEngineMajor: ENV_ENGINE_MAJOR,
  });
  assert.ok(Object.isFrozen(binding));
});

test('runtime binding: binding digest is deterministic and dimension-sensitive', async () => {
  const first = await validatedComposition();
  const repeat = await validatedComposition();
  const otherRevision = await validatedComposition({ revision: 'rev-000043' });
  const otherSelectionAuthority = await validatedComposition({
    selectionAuthority: 'dac://app-composition/other-party',
  });

  const a = await bindValidatedComposition(first.verdict, { sha256: createSha256Fake() });
  const b = await bindValidatedComposition(repeat.verdict, { sha256: createSha256Fake() });
  const c = await bindValidatedComposition(otherRevision.verdict, { sha256: createSha256Fake() });
  const d = await bindValidatedComposition(otherSelectionAuthority.verdict, {
    sha256: createSha256Fake(),
  });

  assert.equal(a.bindingRef.contentDigest, b.bindingRef.contentDigest, 'same inputs -> same digest');
  assert.notEqual(a.bindingRef.contentDigest, c.bindingRef.contentDigest, 'different bound revision -> different digest');
  assert.notEqual(
    a.bindingRef.contentDigest,
    d.bindingRef.contentDigest,
    'different selection authority scope -> different digest',
  );
  // Same digest does NOT merge the evidence objects: separately referrable facts.
  assert.notEqual(a, b);
});

test('runtime binding: technical activation under a binding is separately referrable (C22/C31)', async () => {
  const { verdict, refs, packageId } = await validatedComposition();
  const binding = await bindValidatedComposition(verdict, { sha256: createSha256Fake() });

  const activation: RuntimeActivationEvidence = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-7f3a9c',
  });

  assert.equal(activation.activation, RUNTIME_ACTIVATION_ADAPTER_VERSION);
  assert.ok(isRuntimeActivationRef(activation.activationRef));
  assert.equal(getDacReferenceRole(activation.activationRef), 'runtime-activation');
  assert.equal(activation.binding, binding, 'exact binding pass-through');
  assert.equal(activation.activationInstanceId, 'activation-7f3a9c');
  assert.equal(activation.activatedPackageId, packageId);
  assert.equal(activation.activationRef.revisionIdentity, 'activation-7f3a9c');
  assert.equal(typeof activation.activationRef.contentDigest, 'string');
  assert.ok(activation.activationRef.contentDigest!.length > 0);
  assert.ok(Object.isFrozen(activation));

  // C31: selection != binding != activation — three pairwise-distinct refs.
  const selection = refs.applicationSelection;
  const bindingRef = binding.bindingRef;
  const activationRef = activation.activationRef;
  assert.notEqual(selection, bindingRef);
  assert.notEqual(bindingRef, activationRef);
  assert.notEqual(selection, activationRef);
  assert.equal(isApplicationSelectionRef(bindingRef) || isApplicationSelectionRef(activationRef), false);
  assert.equal(isRuntimeBindingRef(selection) || isRuntimeBindingRef(activationRef), false);
  assert.equal(isRuntimeActivationRef(selection) || isRuntimeActivationRef(bindingRef), false);

  // Activation digest binds to this exact binding content + instance identity.
  const repeat = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-7f3a9c',
  });
  assert.equal(repeat.activationRef.contentDigest, activation.activationRef.contentDigest);
  const otherInstance = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-000111',
  });
  assert.notEqual(otherInstance.activationRef.contentDigest, activation.activationRef.contentDigest);
});

test('runtime binding: only a genuine #306 verdict can be bound (fail closed on forgeries)', async () => {
  const { verdict } = await validatedComposition();

  await assertBindingError(
    () => bindValidatedComposition(null as never, { sha256: createSha256Fake() }),
    'NOT_A_VALIDATED_COMPOSITION',
    'null verdict',
  );
  await assertBindingError(
    () => bindValidatedComposition({} as never, { sha256: createSha256Fake() }),
    'NOT_A_VALIDATED_COMPOSITION',
    'empty object',
  );
  // Structurally identical forged copy: every field spread from the real verdict
  // still fails the minting registry — compatibility PASS cannot be claimed.
  const forged: SelectedCompositionValidation = Object.freeze({
    ...verdict,
    provenance: { ...verdict.provenance },
    declared: { ...verdict.declared },
  });
  await assertBindingError(
    () => bindValidatedComposition(forged, { sha256: createSha256Fake() }),
    'NOT_A_VALIDATED_COMPOSITION',
    'forged copy of a real verdict',
  );
  // The raw intake REQUEST is not a verdict either.
  await assertBindingError(
    () =>
      bindValidatedComposition(
        { compiledPackage: verdict.validatedPackage } as never,
        { sha256: createSha256Fake() },
      ),
    'NOT_A_VALIDATED_COMPOSITION',
    'request object is not a verdict',
  );

  // An incompatible composition never reaches binding at all: stage 3 fails
  // closed first (C16/C32/C37) — the only resolution is explicit reselection.
  const incompatible = await createCompiledPackage('rev-000050', {
    runtimeContractMajor: ENV_CONTRACT_MAJOR + 1,
  });
  const refs = compositionRefs(
    incompatible.manifest.domainId,
    incompatible.manifest.domainVersion,
    incompatible.manifest.packageId,
  );
  let intakeFailure: unknown;
  try {
    await validateSelectedComposition({
      promotionDecision: refs.promotionDecision,
      applicationSelection: refs.applicationSelection,
      selectedDomainData: refs.selectedDomainData,
      runtimeContract: refs.runtimeContract,
      runtimeImplementation: refs.runtimeImplementation,
      compatibilityTarget: refs.compatibilityTarget,
      compiledPackage: incompatible,
      environment: environment(),
    });
  } catch (error) {
    intakeFailure = error;
  }
  assert.ok(intakeFailure instanceof CompositionIntakeError);
  assert.equal(intakeFailure.code, 'INCOMPATIBLE_SELECTED_COMPOSITION');
});

test('runtime binding: activation requires a genuine binding of this module (N06)', async () => {
  const { verdict } = await validatedComposition();
  const binding = await bindValidatedComposition(verdict, { sha256: createSha256Fake() });
  const activation = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-1',
  });
  const options = { sha256: createSha256Fake(), activationInstanceId: 'activation-2' };

  // Selection shortcut: the stage-3 verdict directly cannot activate (skipping binding).
  await assertBindingError(
    () => activateRuntimeBinding(verdict as never, options),
    'NOT_A_RUNTIME_BINDING',
    'verdict is not a binding',
  );
  // A bare #305-adopted binding REF (upstream correlation object) carries no
  // verified binding basis in this realm and cannot drive activation.
  const foreignBindingRef = adoptRuntimeBindingRef({
    baseline,
    semanticIdentity: 'domain-harness/runtime-binding/foreign',
    authorityScope: 'domain-harness://runtime/binding',
    revisionIdentity: 'rev-foreign',
    contentDigest: 'sha256:foreign',
  });
  await assertBindingError(
    () => activateRuntimeBinding(foreignBindingRef as never, options),
    'NOT_A_RUNTIME_BINDING',
    'bare adopted binding ref is not a verified binding',
  );
  // Rebinding an activation evidence object is refused too.
  await assertBindingError(
    () => activateRuntimeBinding(activation as never, options),
    'NOT_A_RUNTIME_BINDING',
    'activation evidence is not a binding',
  );
  // Forged structural copy of a real binding fails the minting registry.
  const forgedBinding: RuntimeBindingEvidence = Object.freeze({
    binding: RUNTIME_BINDING_ADAPTER_VERSION,
    bindingRef: binding.bindingRef,
    validation: verdict,
  });
  await assertBindingError(
    () => activateRuntimeBinding(forgedBinding, options),
    'NOT_A_RUNTIME_BINDING',
    'forged copy of a real binding',
  );
  await assertBindingError(
    () => activateRuntimeBinding(null as never, options),
    'NOT_A_RUNTIME_BINDING',
    'null binding',
  );
  // And binding cannot be re-derived from an activation (no reverse edge).
  await assertBindingError(
    () => bindValidatedComposition(activation as never, { sha256: createSha256Fake() }),
    'NOT_A_VALIDATED_COMPOSITION',
    'activation evidence is not a verdict',
  );
});

test('runtime binding: malformed inputs and options fail closed', async () => {
  const { verdict } = await validatedComposition();
  const binding = await bindValidatedComposition(verdict, { sha256: createSha256Fake() });

  await assertBindingError(
    () => bindValidatedComposition(verdict, {} as never),
    'INVALID_RUNTIME_BINDING_INPUT',
    'bind without a sha256 port',
  );
  await assertBindingError(
    () => bindValidatedComposition(verdict, { sha256: {} as never }),
    'INVALID_RUNTIME_BINDING_INPUT',
    'sha256 port without digestUtf8',
  );
  await assertBindingError(
    () => bindValidatedComposition(verdict, null as never),
    'INVALID_RUNTIME_BINDING_INPUT',
    'null bind options',
  );
  await assertBindingError(
    () => activateRuntimeBinding(binding, { sha256: createSha256Fake() } as never),
    'INVALID_RUNTIME_BINDING_INPUT',
    'activation without an instance identity',
  );
  await assertBindingError(
    () =>
      activateRuntimeBinding(binding, {
        sha256: createSha256Fake(),
        activationInstanceId: '  ',
      }),
    'INVALID_RUNTIME_BINDING_INPUT',
    'blank activation instance identity',
  );
  await assertBindingError(
    () =>
      activateRuntimeBinding(binding, {
        sha256: createSha256Fake(),
        activationInstanceId: 42 as never,
      }),
    'INVALID_RUNTIME_BINDING_INPUT',
    'non-string activation instance identity',
  );
  await assertBindingError(
    () => activateRuntimeBinding(binding, null as never),
    'INVALID_RUNTIME_BINDING_INPUT',
    'null activation options',
  );
});

test('runtime binding: mutable alias activation instance identities are rejected (N01/C02)', async () => {
  const { verdict } = await validatedComposition();
  const binding = await bindValidatedComposition(verdict, { sha256: createSha256Fake() });

  await assert.rejects(
    () =>
      activateRuntimeBinding(binding, {
        sha256: createSha256Fake(),
        activationInstanceId: 'latest',
      }),
    (error: unknown) => {
      assert.ok(error instanceof DacReferenceError);
      assert.equal(error.code, 'MUTABLE_ALIAS_REJECTED');
      return true;
    },
    'a floating latest instance identity can never be exact activation evidence',
  );

  // Whole-token semantics: an exact id that merely contains the word passes.
  const exact = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-latest-attempt-0007',
  });
  assert.equal(exact.activationRef.revisionIdentity, 'activation-latest-attempt-0007');
});

test('runtime binding: evidence never gains selection or foreign lifecycle roles', async () => {
  const { verdict, refs } = await validatedComposition();
  const binding = await bindValidatedComposition(verdict, { sha256: createSha256Fake() });
  const activation = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-3',
  });

  // The evidence records themselves are not DAC references of any role.
  assert.equal(getDacReferenceRole(binding), undefined);
  assert.equal(getDacReferenceRole(activation), undefined);
  assert.equal(isApplicationSelectionRef(binding), false);
  assert.equal(isApplicationSelectionRef(activation), false);
  assert.equal(isSelectedDomainDataRef(activation), false);
  // The refs they mint carry exactly the roles they claim.
  assert.equal(isRuntimeBindingRef(activation.activationRef), false);
  assert.equal(isRuntimeActivationRef(binding.bindingRef), false);
  // Upstream provenance stays pass-through and untouched.
  assert.equal(binding.validation.provenance.applicationSelection, refs.applicationSelection);
  assert.equal(activation.binding.validation.provenance.applicationSelection, refs.applicationSelection);
});
