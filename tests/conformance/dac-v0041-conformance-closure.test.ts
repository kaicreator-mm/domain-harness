// Issue #360 / A41-006 — root-suite anchor for the cumulative DAC v0.0.4 +
// v0.0.4.1 conformance closure. The exhaustive per-row C78–C172 / F-01..F-08
// executable mapping, the connected positive boundary journey, the
// adversarial closure battery and the NOT_OWNED boundary suites live in
// `packages/domain-harness/tests/dac-v0041-conformance/` next to the
// per-seam A41 suites they close. This file binds the closure into the root
// deterministic conformance corpus with the three facts the root suite must
// be able to prove on its own:
//
//   1. the exact successor baseline pin (freeze commit AND tree) plus the
//      evidence-only predecessor identities (no fabricated intermediate
//      v0.0.4 release, historical v0.0.3 separately version-bound);
//   2. the connected successor chain (intake -> two-view compatibility ->
//      bounded verdict -> Runtime binding -> Runtime activation -> Runtime
//      consequence boundary) executes green end to end;
//   3. the two structural authority ceilings hold at the boundary result
//      level (compatibility/binding/activation never imply each other and
//      never manufacture external Business SoR truth).
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_BASELINES,
  DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
} from '../../packages/domain-harness/src/dac-v0041/index.js';
import { DAC_V003_BASELINE } from '../../packages/domain-harness/src/dac-v003/index.js';
import {
  classifyDacV0041CompatibilityPrecedence,
  verifyDacV0041CompatibilityViewAssociation,
} from '../../packages/domain-harness/src/dac-v0041/compatibility/index.js';
import { verifyDacV0041CompositionIntake } from '../../packages/domain-harness/src/dac-v0041/composition-intake/index.js';
import {
  classifyDacV0041BusinessSorTruthSource,
  verifyDacV0041RuntimeActivation,
  verifyDacV0041RuntimeBinding,
} from '../../packages/domain-harness/src/dac-v0041/runtime/index.js';
// The canonical runtime fixture bundle (read-only, shared with the focused
// per-seam suites): the standard verified composition -> compatibility ->
// binding -> activation input shapes at the pinned successor baseline.
import {
  buildValidActivationInput,
  buildValidBindingInput,
} from '../../packages/domain-harness/tests/dac-v0041-runtime/helpers.js';

test('dac-v0041 cumulative closure: the successor baseline pin is exact and the predecessors stay evidence-only', () => {
  assert.equal(DAC_V0041_BASELINE.version, 'v0.0.4.1');
  assert.equal(DAC_V0041_BASELINE.semanticFreezeCommit, '75fee75b782ac229720dccd18d2a4ca54b285e51');
  assert.equal(DAC_V0041_BASELINE.semanticFreezeTree, 'c74cf5e3a0e6745da3eda6999836b61ee8103c60');
  assert.equal(DAC_V003_BASELINE.version, 'v0.0.3');
  assert.notEqual(DAC_V003_BASELINE.semanticFreezeCommit, DAC_V0041_BASELINE.semanticFreezeCommit);
  const versions = DAC_V0041_PREDECESSOR_BASELINES.map((baseline) => baseline.version);
  assert.deepEqual([...versions].sort(), ['v0.0.3', 'v0.0.4']);
  for (const baseline of DAC_V0041_PREDECESSOR_BASELINES) {
    assert.equal(baseline.purpose, DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE);
  }
});

test('dac-v0041 cumulative closure: the connected successor chain verifies end to end', () => {
  const bindingInput = buildValidBindingInput();
  const intake = verifyDacV0041CompositionIntake(bindingInput.compositionIntake);
  assert.equal(intake.outcome, 'INTAKE_VERIFIED');
  const association = verifyDacV0041CompatibilityViewAssociation({
    requestRef: bindingInput.compatibility.requestRef,
    validationView: bindingInput.compatibility.validationView,
    resultView: bindingInput.compatibility.resultView,
  });
  assert.equal(association.outcome, 'VALID_TWO_VIEW');
  const verdict = classifyDacV0041CompatibilityPrecedence(
    bindingInput.compatibility.precedenceFacts,
  );
  assert.equal(verdict.outcome, 'COMPATIBLE_VERDICT');
  const binding = verifyDacV0041RuntimeBinding(bindingInput);
  assert.equal(binding.outcome, 'BINDING_VERIFIED');
  const activation = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({ binding: bindingInput }),
  );
  assert.equal(activation.outcome, 'ACTIVATION_VERIFIED');
});

test('dac-v0041 cumulative closure: authority ceilings hold at the boundary results', () => {
  assert.equal(classifyDacV0041CompatibilityPrecedence(
    buildValidBindingInput().compatibility.precedenceFacts,
  ).outcome, 'COMPATIBLE_VERDICT');
  const binding = verifyDacV0041RuntimeBinding(buildValidBindingInput());
  assert.equal(binding.impliesRuntimeActivation, false);
  assert.equal(binding.impliesApplicationSelection, false);
  assert.equal(binding.isExternalBusinessSorTruth, false);
  const activation = verifyDacV0041RuntimeActivation(buildValidActivationInput());
  assert.equal(activation.manufacturesUpstreamAuthority, false);
  assert.equal(activation.isExternalBusinessSorTruth, false);
  const consequence = classifyDacV0041BusinessSorTruthSource({
    presentedStateClass: 'activation-state',
  });
  assert.ok(consequence.outcome === 'RUNTIME_STATE_NOT_SOR_TRUTH');
  assert.equal(consequence.canManufactureBusinessSorTruth, false);
});
