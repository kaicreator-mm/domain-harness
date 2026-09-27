// Issue #358 / A41-004 — F-04 §4.2 AuthorityRefusal intake (C142/C143):
// seam-typed refusal evidence is consumed as material evidence only; a
// refusal is never reclassified as an invocation failure or INCOMPATIBLE,
// binding refusal is never conflated with activation refusal, and a material
// refusal omitted behind a later favorable result cannot close the claim.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  verifyDacV0041AuthorityRefusalEvidence,
  verifyDacV0041CompositionIntake,
} from '../../src/dac-v0041/composition-intake/index.js';
import {
  buildBindingRefusalFacts,
  buildRef,
  buildValidIntakeInput,
} from './helpers.js';

test('a41-004 refusal: a valid seam-typed Runtime-binding refusal verifies as material evidence', () => {
  const result = verifyDacV0041AuthorityRefusalEvidence(buildBindingRefusalFacts());
  assert.equal(result.outcome, 'REFUSAL_VERIFIED');
  assert.equal(result.seamKind, 'runtime-binding');
  assert.equal(result.refusalIdentity, 'refusal/binding-1');
});

test('a41-004 refusal: intake accepts a claim that discloses its material refusals completely', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      materialRefusals: [buildBindingRefusalFacts()],
      refusalDisclosureComplete: true,
    }),
  );
  assert.equal(result.outcome, 'INTAKE_VERIFIED');
});

test('a41-004 refusal: C143 — incomplete refusal disclosure fails closed (later favorable result cannot close the claim)', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      refusalDisclosureComplete: false,
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'MATERIAL_REFUSAL_OMITTED');
});

test('a41-004 refusal: C142 — a refusal presented as an invocation transport outcome fails closed', () => {
  for (const outcomeClass of [
    'rejected/invalid-input',
    'failed-known-no-result',
    'blocked/missing-capability',
  ] as const) {
    const result = verifyDacV0041AuthorityRefusalEvidence(
      buildBindingRefusalFacts({ presentedOutcomeClass: outcomeClass }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'REFUSAL_RECLASSIFIED');
  }
});

test('a41-004 refusal: C142 — INCOMPATIBLE is not a refusal either (cross-namespace conflation)', () => {
  const result = verifyDacV0041AuthorityRefusalEvidence(
    buildBindingRefusalFacts({ presentedOutcomeClass: 'unknown/ambiguous-production' }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REFUSAL_RECLASSIFIED');
});

test('a41-004 refusal: C142 — a Runtime-binding refusal binding a Runtime-activation request fails closed (binding != activation)', () => {
  const result = verifyDacV0041AuthorityRefusalEvidence(
    buildBindingRefusalFacts({
      exactRequestRef: buildRef('runtime-activation-request', 'request/activation-1'),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REFUSAL_SEAM_CONFLATED');
});

test('a41-004 refusal: unknown seam kind fails closed', () => {
  const result = verifyDacV0041AuthorityRefusalEvidence(
    buildBindingRefusalFacts({ seamKind: 'runtime-invocation' }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REFUSAL_SEAM_UNKNOWN');
});

test('a41-004 refusal: refusal identity aliasing its bound request fails closed', () => {
  const result = verifyDacV0041AuthorityRefusalEvidence(
    buildBindingRefusalFacts({
      refusalRef: buildRef('authority-refusal', 'request/binding-1'),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_REFUSAL_ALIAS');
});

test('a41-004 refusal: unauthorized refusing issuer fails closed', () => {
  const result = verifyDacV0041AuthorityRefusalEvidence(
    buildBindingRefusalFacts({ refusingIssuerIdentity: 'id/outsider' }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_REFUSER');
});

test('a41-004 refusal: unevidenced refusal issuance point fails closed', () => {
  const result = verifyDacV0041AuthorityRefusalEvidence(
    buildBindingRefusalFacts({ issuanceEvidence: { point: 35, assertedBy: [] } }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'EVIDENCE_UNESTABLISHED');
});

test('a41-004 refusal: intake rejects a claim carrying reclassified refusal evidence', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      materialRefusals: [
        buildBindingRefusalFacts({ presentedOutcomeClass: 'rejected/invalid-input' }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REFUSAL_RECLASSIFIED');
});

test('a41-004 refusal: refusal evidence stays external — consuming it creates no refusal/selection/Manifest authority', () => {
  const standalone = verifyDacV0041AuthorityRefusalEvidence(buildBindingRefusalFacts());
  assert.equal(standalone.outcome, 'REFUSAL_VERIFIED');
  // The verified result names the external record; it mints nothing.
  assert.deepEqual(Object.keys(standalone).sort(), ['detail', 'outcome', 'refusalIdentity', 'seamKind']);
});
