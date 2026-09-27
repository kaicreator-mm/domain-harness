// Issue #359 / A41-005 — external Business SoR boundary suite
// (ASSEMBLY_LIFECYCLE §17; EXTERNAL_AUTHORITY evidence-not-truth stance):
// Runtime accepted/send-dispatched/provider-acknowledged/execution-success/
// activation state never manufactures external authoritative commit truth,
// external SoR observation/reconciliation material stays externally owned
// evidence, and unknown provenance classes fail closed.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDacV0041BusinessSorTruthSource,
  verifyDacV0041RuntimeActivation,
  verifyDacV0041RuntimeBinding,
} from '../../src/dac-v0041/runtime/index.js';
import { buildValidActivationInput, buildValidBindingInput } from './helpers.js';

test('a41-005 sor boundary: every Runtime-side state class is Runtime mechanics evidence, never Business SoR truth', () => {
  for (const stateClass of [
    'runtime-accepted',
    'runtime-send-dispatched',
    'provider-acknowledged',
    'runtime-execution-success',
    'activation-state',
  ] as const) {
    const result = classifyDacV0041BusinessSorTruthSource({ presentedStateClass: stateClass });
    assert.ok(result.outcome === 'RUNTIME_STATE_NOT_SOR_TRUTH', stateClass);
    assert.equal(result.stateClass, stateClass);
    assert.equal(result.canManufactureBusinessSorTruth, false);
    assert.equal(result.governedByExternalAuthoritySemantics, false);
  }
});

test('a41-005 sor boundary: external SoR observation/reconciliation stays externally owned evidence', () => {
  for (const stateClass of [
    'external-sor-observation',
    'external-sor-reconciliation',
  ] as const) {
    const result = classifyDacV0041BusinessSorTruthSource({ presentedStateClass: stateClass });
    assert.ok(result.outcome === 'EXTERNAL_SOR_EVIDENCE_ONLY', stateClass);
    assert.equal(result.stateClass, stateClass);
    assert.equal(result.canManufactureBusinessSorTruth, false);
    assert.equal(result.governedByExternalAuthoritySemantics, true);
  }
});

test('a41-005 sor boundary: an unknown/undecidable provenance class fails closed', () => {
  const result = classifyDacV0041BusinessSorTruthSource({
    presentedStateClass: 'definitely-a-commit-trust-me',
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'UNKNOWN_STATE_CLASS');
});

test('a41-005 sor boundary: malformed facts fail closed', () => {
  const result = classifyDacV0041BusinessSorTruthSource({
    presentedStateClass: '',
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
  const nullFacts = classifyDacV0041BusinessSorTruthSource(null as unknown as {
    presentedStateClass: string;
  });
  assert.ok(nullFacts.outcome === 'FAIL_CLOSED');
  assert.equal(nullFacts.code, 'INVALID_FACTS');
});

test('a41-005 sor boundary: verified binding/activation results structurally carry no external Business SoR truth', () => {
  const binding = verifyDacV0041RuntimeBinding(buildValidBindingInput());
  assert.ok(binding.outcome === 'BINDING_VERIFIED');
  assert.equal(binding.isExternalBusinessSorTruth, false);
  const activation = verifyDacV0041RuntimeActivation(buildValidActivationInput());
  assert.ok(activation.outcome === 'ACTIVATION_VERIFIED');
  assert.equal(activation.isExternalBusinessSorTruth, false);
  assert.equal(activation.manufacturesUpstreamAuthority, false);
});
