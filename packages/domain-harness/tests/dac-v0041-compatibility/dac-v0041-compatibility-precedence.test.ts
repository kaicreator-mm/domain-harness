// Issue #357 / A41-003 (R1 repair per #378 comment 5852943693 / #376
// P1-3/P1-4/P1-5) — focused deterministic precedence suite
// (ASSEMBLY_CAPABILITY_EXCHANGE §5 + §13; APPLICATION_MANIFEST §11;
// CONFORMANCE_MATRIX C84/C85/C98/C99 + C150–C153/C170/C171; F-08): every
// adversarial combination of capability/currentness/unsupported/invalid/
// stale fact dimensions maps to exactly one outcome under the frozen
// 15-rung ladder. R1: C157 currentness and C113 designation apply to every
// relied-upon authoritative result regardless of polarity; refusal evidence
// must verify as a complete §4.2 closure, can never back compatibility
// INCOMPATIBLE (C142) and blocks a favorable close while it stands (C143).
import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDacV0041CompatibilityPrecedence } from '../../src/dac-v0041/compatibility/index.js';
import {
  buildFavorableResult,
  buildPrecedenceFacts,
  buildRefusalEvidence,
} from './helpers.js';

test('a41-003 precedence §13.1/C153: no current exact descriptor => FAIL_CLOSED before any kind judgment', () => {
  const result = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      capabilityExchange: {
        currentDescriptorEstablished: false,
        currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
        requestedCapabilityKind: 'compatibility-validation',
        requiredInputsStructurallyValid: false,
        materialStaleness: true,
        bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'DESCRIPTOR_UNESTABLISHED');
});

test('a41-003 precedence C84/C150/C170: capability kind absent => blocked/missing-capability with target not judged, dominating every later dimension', () => {
  for (const later of [
    {},
    { requiredInputsStructurallyValid: false },
    { materialStaleness: true },
    { bindingTargetState: { presence: 'explicit' as const, declaredSupport: 'unsupported' as const } },
  ]) {
    const result = classifyDacV0041CompatibilityPrecedence(
      buildPrecedenceFacts({
        capabilityExchange: {
          currentDescriptorEstablished: true,
          currentDescriptorOfferedCapabilityKinds: ['authoring'],
          requestedCapabilityKind: 'compatibility-validation',
          requiredInputsStructurallyValid: true,
          materialStaleness: false,
          bindingTargetState: { presence: 'missing' },
          ...later,
        },
      }),
    );
    assert.equal(result.outcome, 'BLOCKED_MISSING_CAPABILITY');
    assert.ok(result.outcome === 'BLOCKED_MISSING_CAPABILITY');
    assert.equal(result.targetNotJudged, true);
  }
});

test('a41-003 precedence C152/C153/C171: structural invalidity dominates coexisting staleness and an unsupported target', () => {
  const result = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      capabilityExchange: {
        currentDescriptorEstablished: true,
        currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
        requestedCapabilityKind: 'compatibility-validation',
        requiredInputsStructurallyValid: false,
        materialStaleness: true,
        bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'STRUCTURALLY_INVALID_INPUT');
});

test('a41-003 precedence C85/C151/C171: staleness dominates a binding-explicit unsupported target => STALE', () => {
  const result = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      capabilityExchange: {
        currentDescriptorEstablished: true,
        currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
        requestedCapabilityKind: 'compatibility-validation',
        requiredInputsStructurallyValid: true,
        materialStaleness: true,
        bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
      },
    }),
  );
  assert.equal(result.outcome, 'STALE');
});

test('a41-003 precedence §5 Step 3: a binding explicit unsupported target (Steps 0–2 clean) => INCOMPATIBLE', () => {
  const result = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      capabilityExchange: {
        currentDescriptorEstablished: true,
        currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
        requestedCapabilityKind: 'compatibility-validation',
        requiredInputsStructurallyValid: true,
        materialStaleness: false,
        bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
      },
    }),
  );
  assert.equal(result.outcome, 'INCOMPATIBLE');
});

test('a41-003 precedence C99: a binding-time check relied as compatibility result => REJECT-class FAIL_CLOSED', () => {
  const result = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({ bindingTimeCheckReliedAsCompatibilityResult: true }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'BINDING_CHECK_MISCLASSIFIED');
  assert.match(result.detail, /binding-authority evidence only/u);
});

test('a41-003 precedence §4.2 (R1): a refusal-evidence entry that does not verify as a complete closure fails closed, never silently dropped', () => {
  for (const malformed of [
    buildRefusalEvidence({ negativeDecision: false }),
    buildRefusalEvidence({ producedResult: false }),
    buildRefusalEvidence({ refusingIssuerDesignated: false }),
    { refusalIdentity: 'refusal/x' } as never,
    buildRefusalEvidence({ issuancePointIdentity: '' }),
  ]) {
    const result = classifyDacV0041CompatibilityPrecedence(
      buildPrecedenceFacts({
        refusalEvidence: [malformed],
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.ok(result.outcome === 'FAIL_CLOSED');
    assert.equal(result.code, 'INVALID_REFUSAL_EVIDENCE');
  }
});

test('a41-003 precedence C98: contradictory authoritative results => FAIL_CLOSED even with a favorable one present', () => {
  const result = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [
        buildFavorableResult(),
        buildFavorableResult({
          resultViewIdentity: 'compat-result/res-neg',
          disposition: 'INCOMPATIBLE',
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'CONTRADICTORY_AUTHORITATIVE_RESULTS');
});

test('a41-003 precedence C157: a revoked/voided relied-upon result => FAIL_CLOSED; stale/superseded => STALE', () => {
  const revoked = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [buildFavorableResult({ currentness: 'revoked' })],
    }),
  );
  assert.equal(revoked.outcome, 'FAIL_CLOSED');
  assert.ok(revoked.outcome === 'FAIL_CLOSED');
  assert.equal(revoked.code, 'INVALIDATED_RESULT');

  const stale = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [buildFavorableResult({ currentness: 'superseded' })],
    }),
  );
  assert.equal(stale.outcome, 'STALE');
});

test('a41-003 precedence C157 (R1): currentness is polarity-neutral — a stale unfavorable result cannot support a current INCOMPATIBLE', () => {
  for (const currentness of ['stale', 'superseded'] as const) {
    const stale = classifyDacV0041CompatibilityPrecedence(
      buildPrecedenceFacts({
        authoritativeResults: [
          buildFavorableResult({
            resultViewIdentity: 'compat-result/res-neg',
            disposition: 'INCOMPATIBLE',
            currentness,
          }),
        ],
        assertedDisposition: 'INCOMPATIBLE',
      }),
    );
    assert.equal(stale.outcome, 'STALE');
  }

  const revoked = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [
        buildFavorableResult({
          resultViewIdentity: 'compat-result/res-neg',
          disposition: 'INCOMPATIBLE',
          currentness: 'voided',
        }),
      ],
      assertedDisposition: 'INCOMPATIBLE',
    }),
  );
  assert.equal(revoked.outcome, 'FAIL_CLOSED');
  assert.ok(revoked.outcome === 'FAIL_CLOSED');
  assert.equal(revoked.code, 'INVALIDATED_RESULT');
});

test('a41-003 precedence C113: an undesignated favorable validator => FAIL_CLOSED', () => {
  const result = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [buildFavorableResult({ validatorDesignated: false })],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'NON_DESIGNATED_VALIDATOR');
});

test('a41-003 precedence C113 (R1): designation is polarity-neutral — an undesignated validator cannot drive INCOMPATIBLE either', () => {
  const result = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [
        buildFavorableResult({
          resultViewIdentity: 'compat-result/res-neg',
          disposition: 'INCOMPATIBLE',
          validatorDesignated: false,
        }),
      ],
      assertedDisposition: 'INCOMPATIBLE',
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'NON_DESIGNATED_VALIDATOR');
  assert.match(result.detail, /neither COMPATIBLE nor INCOMPATIBLE/u);
});

test('a41-003 precedence C143 (R1): substantive refusal evidence standing in the closure blocks a favorable close', () => {
  const result = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [buildFavorableResult()],
      refusalEvidence: [buildRefusalEvidence()],
      assertedDisposition: 'COMPATIBLE',
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'MATERIAL_REFUSAL_PRESENT');
});

test('a41-003 precedence: the clean favorable path => bounded COMPATIBLE verdict', () => {
  const result = classifyDacV0041CompatibilityPrecedence(buildPrecedenceFacts());
  assert.equal(result.outcome, 'COMPATIBLE_VERDICT');
  assert.ok(result.outcome === 'COMPATIBLE_VERDICT');
  assert.equal(result.boundedToCompatibility, true);
  assert.equal(result.impliesApplicationSelection, false);
  assert.equal(result.impliesRuntimeBinding, false);
  assert.equal(result.impliesRuntimeActivation, false);
});

test('a41-003 precedence (R1): asserted INCOMPATIBLE is backed only by compatibility-owned unfavorable results', () => {
  const withUnfavorableResult = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [
        buildFavorableResult({ resultViewIdentity: 'compat-result/res-neg', disposition: 'INCOMPATIBLE' }),
      ],
      assertedDisposition: 'INCOMPATIBLE',
    }),
  );
  assert.equal(withUnfavorableResult.outcome, 'INCOMPATIBLE');

  // C142: an AuthorityRefusalRef is distinct from compatibility INCOMPATIBLE
  // and can never back this disposition — refusal-only evidence fails closed.
  const refusalOnly = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [],
      refusalEvidence: [buildRefusalEvidence()],
      assertedDisposition: 'INCOMPATIBLE',
    }),
  );
  assert.equal(refusalOnly.outcome, 'FAIL_CLOSED');
  assert.ok(refusalOnly.outcome === 'FAIL_CLOSED');
  assert.equal(refusalOnly.code, 'FAVORABLE_CLAIM_UNBACKED');
  assert.match(refusalOnly.detail, /C142/u);
});

test('a41-003 precedence: malformed facts fail closed as INVALID_FACTS, never throw', () => {
  for (const facts of [
    null,
    {},
    buildPrecedenceFacts({
      capabilityExchange: {
        currentDescriptorEstablished: true,
        currentDescriptorOfferedCapabilityKinds: [''],
        requestedCapabilityKind: 'compatibility-validation',
        requiredInputsStructurallyValid: true,
        materialStaleness: false,
        bindingTargetState: { presence: 'missing' },
      },
    }),
    buildPrecedenceFacts({
      authoritativeResults: 'nope' as never,
    }),
    buildPrecedenceFacts({ assertedDisposition: 'MAYBE' as 'COMPATIBLE' }),
    buildPrecedenceFacts({
      authoritativeResults: [{ resultViewIdentity: 'x', disposition: 'COMPATIBLE' } as never],
    }),
    buildPrecedenceFacts({
      refusalEvidence: 'nope' as never,
    }),
  ]) {
    const result = classifyDacV0041CompatibilityPrecedence(facts as never);
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.ok(result.outcome === 'FAIL_CLOSED');
    assert.equal(result.code, 'INVALID_FACTS');
  }
});

test('a41-003 precedence determinism: identical facts always classify identically', () => {
  const facts = buildPrecedenceFacts({
    authoritativeResults: [
      buildFavorableResult(),
      buildFavorableResult({
        resultViewIdentity: 'compat-result/res-neg',
        disposition: 'INCOMPATIBLE',
        refusalEvidenceIdentities: ['refusal/runtime-binding-1'],
      }),
    ],
    refusalEvidence: [buildRefusalEvidence()],
  });
  const first = classifyDacV0041CompatibilityPrecedence(facts);
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(classifyDacV0041CompatibilityPrecedence(facts), first);
  }
});
