// Issue #311 / A2 I-008 FINAL matrix — I-004 / #307 runtime-binding layer.
// Executes the deferred flow-level C22/C31 separation cases and the dispatch
// vectors "Simulator PASS -> promotion/selection shortcut" and
// "selection/binding/activation collapse" against the landed surface:
// binding consumes ONLY a genuine #306 verdict, activation consumes ONLY a
// genuine binding of this module plus an exact activation instance identity,
// and no conversion exists in either direction.
//
// Test/doc-only: no product semantics changed, no DAC v0.0.3 V3 scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DacReferenceError } from '../../src/dac/index.js';
import { validateSelectedComposition } from '../../src/composition-intake/index.js';
import {
  RuntimeBindingError,
  activateRuntimeBinding,
  bindValidatedComposition,
  isRuntimeBindingEvidence,
} from '../../src/runtime-binding/index.js';
import { createSha256Fake } from '../package/fixture.js';
import { assertErrorCode, finalComposition } from './final-matrix-fixtures.js';

async function fullJourney() {
  const composition = await finalComposition();
  const validation = await validateSelectedComposition(composition.request);
  const binding = await bindValidatedComposition(validation, { sha256: createSha256Fake() });
  const activation = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-instance-0001',
  });
  return { composition, validation, binding, activation };
}

function forgedVerdictOf<T extends object>(value: T): T {
  // A structurally identical clone: every enumerable own field copied, so only
  // the private minting registry can distinguish it from the genuine verdict.
  return { ...value } as T;
}

// --------------------------------------------- C22 / C31 (flow separation)

test('final C22/C31: binding exists only from a genuine #306 verdict — forged lookalikes and foreign stages fail closed', async () => {
  const { composition, validation } = await fullJourney();

  // Structurally identical clone of a PASSING verdict: not minted by the
  // intake, so compatibility PASS cannot be claimed through it.
  await assertErrorCode(
    () => bindValidatedComposition(forgedVerdictOf(validation), { sha256: createSha256Fake() }),
    RuntimeBindingError,
    'NOT_A_VALIDATED_COMPOSITION',
    'structurally identical forged verdict',
  );

  // A Simulator-PASS-shaped object asserting compatibility is not a verdict.
  const simulatorCompatibility = {
    intake: 'composition-intake/1',
    validatedPackageId: composition.compiled.manifest.packageId,
    validatedPackage: composition.compiled,
    selectedDomainData: composition.refs.selectedDomainData,
    provenance: {
      promotionDecision: composition.refs.promotionDecision,
      applicationSelection: composition.refs.applicationSelection,
    },
    declared: {
      runtimeContract: composition.refs.runtimeContract,
      runtimeImplementation: composition.refs.runtimeImplementation,
    },
    compatibilityTarget: validation.compatibilityTarget,
    compatibility: validation.compatibility,
    simulator: { verdict: 'PASS', note: 'simulated compatibility' },
  };
  await assertErrorCode(
    () => bindValidatedComposition(simulatorCompatibility as never, { sha256: createSha256Fake() }),
    RuntimeBindingError,
    'NOT_A_VALIDATED_COMPOSITION',
    'simulator compatibility PASS claim',
  );

  // Raw upstream lifecycle refs are not binding bases either: a selection, a
  // promotion decision or the selected identity never stand in for a verdict.
  for (const [slot, label] of [
    [composition.refs.applicationSelection, 'application-selection as bind input'],
    [composition.refs.promotionDecision, 'promotion-decision as bind input'],
    [composition.refs.selectedDomainData, 'selected-domain-data as bind input'],
  ] as const) {
    await assertErrorCode(
      () => bindValidatedComposition(slot as never, { sha256: createSha256Fake() }),
      RuntimeBindingError,
      'NOT_A_VALIDATED_COMPOSITION',
      label,
    );
  }
});

test('final C22/C31: activation exists only from a genuine binding of this module — nothing else', async () => {
  const { validation, binding } = await fullJourney();

  const activationOptions = { sha256: createSha256Fake(), activationInstanceId: 'act-0002' };

  // A verdict is not a binding (compatibility PASS is not activation basis).
  await assertErrorCode(
    () => activateRuntimeBinding(validation as never, activationOptions),
    RuntimeBindingError,
    'NOT_A_RUNTIME_BINDING',
    'verdict as activation basis',
  );

  // A bare binding reference is not binding evidence.
  await assertErrorCode(
    () => activateRuntimeBinding(binding.bindingRef as never, activationOptions),
    RuntimeBindingError,
    'NOT_A_RUNTIME_BINDING',
    'bare RuntimeBindingRef as activation basis',
  );

  // A structurally identical clone of genuine binding evidence is not genuine.
  await assertErrorCode(
    () => activateRuntimeBinding(forgedVerdictOf(binding) as never, activationOptions),
    RuntimeBindingError,
    'NOT_A_RUNTIME_BINDING',
    'forged binding evidence clone',
  );

  // An activation can never re-enter as a binding basis.
  const { activation } = await fullJourney();
  await assertErrorCode(
    () => activateRuntimeBinding(activation as never, activationOptions),
    RuntimeBindingError,
    'NOT_A_RUNTIME_BINDING',
    'activation evidence as binding basis',
  );

  // Malformed options fail closed before any minting.
  await assertErrorCode(
    () => activateRuntimeBinding(binding, { sha256: createSha256Fake() } as never),
    RuntimeBindingError,
    'INVALID_RUNTIME_BINDING_INPUT',
    'missing activationInstanceId',
  );
});

// ------------------------------------------------- C31 (identity separation)

test('final C31: selection != binding != activation stays structural across the genuine flow', async () => {
  const { composition, validation, binding, activation } = await fullJourney();

  // Each stage is separately referrable and references its exact basis.
  assert.equal(binding.validation, validation, 'binding carries the exact verdict object');
  assert.equal(activation.binding, binding, 'activation carries the exact binding object');
  assert.ok(isRuntimeBindingEvidence(binding));
  assert.ok(!isRuntimeBindingEvidence(validation));
  assert.ok(!isRuntimeBindingEvidence(activation));

  // The three role refs are content-distinct: binding digest is derived from
  // the validated composition material, activation digest additionally from
  // the exact instance identity — never equal, never interchangeable.
  assert.notEqual(
    binding.bindingRef.contentDigest,
    composition.refs.applicationSelection.contentDigest,
  );
  assert.notEqual(activation.activationRef.contentDigest, binding.bindingRef.contentDigest);
  assert.equal(activation.activatedPackageId, validation.validatedPackageId);
  assert.equal(activation.activationInstanceId, 'activation-instance-0001');

  // Different exact activation instances produce different activation refs
  // (no "current activation" float).
  const second = await activateRuntimeBinding(binding, {
    sha256: createSha256Fake(),
    activationInstanceId: 'activation-instance-0002',
  });
  assert.notEqual(second.activationRef.contentDigest, activation.activationRef.contentDigest);
});

// ------------------------------------------ C02/N01 (activation aliases)

test('final C02/N01 at stage 5: a mutable alias activation instance identity fails closed', async () => {
  const { binding } = await fullJourney();

  for (const alias of ['latest', 'current', 'head'] as const) {
    await assertErrorCode(
      () =>
        activateRuntimeBinding(binding, {
          sha256: createSha256Fake(),
          activationInstanceId: alias,
        }),
      DacReferenceError,
      'MUTABLE_ALIAS_REJECTED',
      `activationInstanceId "${alias}"`,
    );
  }
});
