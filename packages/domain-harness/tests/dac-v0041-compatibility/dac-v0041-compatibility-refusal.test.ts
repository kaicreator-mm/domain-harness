// Issue #357 / A41-003 — focused refusal / negative-evidence suite
// (LIFECYCLE_REFERENCE_REPAIRS §4.2; C142/C143; C156-family): an
// AuthorityRefusalRef can verify and report incompatibility but can NEVER
// manufacture a target, selection, binding or activation authority, and no
// success-style outcome is derivable from negative evidence alone.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDacV0041CompatibilityPrecedence,
  verifyDacV0041AuthorityRefusalEvidence,
} from '../../src/dac-v0041/compatibility/index.js';
import { buildFavorableResult, buildPrecedenceFacts, buildRefusalEvidence } from './helpers.js';

test('a41-003 refusal §4.2: a valid substantive refusal classifies as negative evidence, never as authority', () => {
  const result = verifyDacV0041AuthorityRefusalEvidence(buildRefusalEvidence());
  assert.equal(result.outcome, 'REFUSAL_EVIDENCE');
  assert.ok(result.outcome === 'REFUSAL_EVIDENCE');
  assert.equal(result.canManufactureAuthority, false);
  assert.equal(result.canProduceCompatibilityPass, false);
});

test('a41-003 refusal C142: binding refusal and activation refusal are distinct seam kinds and never conflate', () => {
  const binding = verifyDacV0041AuthorityRefusalEvidence(
    buildRefusalEvidence({ seamKind: 'runtime-binding', refusalIdentity: 'refusal/binding-1' }),
  );
  const activation = verifyDacV0041AuthorityRefusalEvidence(
    buildRefusalEvidence({ seamKind: 'runtime-activation', refusalIdentity: 'refusal/activation-1' }),
  );
  assert.ok(binding.outcome === 'REFUSAL_EVIDENCE' && activation.outcome === 'REFUSAL_EVIDENCE');
  assert.notEqual(binding.seamKind, activation.seamKind);
});

test('a41-003 refusal C142: compatibility is not a refusal seam kind — a compatibility "refusal" is malformed facts', () => {
  const result = verifyDacV0041AuthorityRefusalEvidence(
    buildRefusalEvidence({
      seamKind: 'compatibility-validation' as 'runtime-binding',
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'UNKNOWN_REFUSAL_SEAM_KIND');
});

test('a41-003 refusal §4.2: a "favorable refusal" or unproduced refusal is malformed facts', () => {
  for (const overrides of [
    { negativeDecision: false },
    { producedResult: false },
  ]) {
    const result = verifyDacV0041AuthorityRefusalEvidence(buildRefusalEvidence(overrides));
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.ok(result.outcome === 'FAIL_CLOSED');
  }
  const favorable = verifyDacV0041AuthorityRefusalEvidence(
    buildRefusalEvidence({ negativeDecision: false }),
  );
  assert.ok(favorable.outcome === 'FAIL_CLOSED');
  assert.equal(favorable.code, 'NOT_A_NEGATIVE_DECISION');
  const unproduced = verifyDacV0041AuthorityRefusalEvidence(
    buildRefusalEvidence({ producedResult: false }),
  );
  assert.ok(unproduced.outcome === 'FAIL_CLOSED');
  assert.equal(unproduced.code, 'NOT_A_PRODUCED_RESULT');
});

test('a41-003 refusal C113: a non-designated refusing issuer fails closed', () => {
  const result = verifyDacV0041AuthorityRefusalEvidence(
    buildRefusalEvidence({ refusingIssuerDesignated: false }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'NON_DESIGNATED_REFUSING_ISSUER');
});

test('a41-003 refusal: malformed facts and mutable aliases fail closed, never throw', () => {
  for (const facts of [
    null,
    {},
    buildRefusalEvidence({ refusalIdentity: '' }),
    buildRefusalEvidence({ refusalIdentity: 'latest' }),
    buildRefusalEvidence({ seamKind: 'nonsense' as 'runtime-binding' }),
  ]) {
    const result = verifyDacV0041AuthorityRefusalEvidence(facts as never);
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.ok(result.outcome === 'FAIL_CLOSED');
    assert.ok(
      result.code === 'INVALID_FACTS' ||
        result.code === 'MUTABLE_ALIAS_IDENTITY' ||
        result.code === 'UNKNOWN_REFUSAL_SEAM_KIND',
    );
  }
});

test('a41-003 refusal ceiling: refusal evidence alone can never satisfy a COMPATIBLE claim', () => {
  for (const favorableCount of [0, 2]) {
    const result = classifyDacV0041CompatibilityPrecedence(
      buildPrecedenceFacts({
        authoritativeResults:
          favorableCount === 0
            ? []
            : [
                buildFavorableResult(),
                buildFavorableResult({ resultViewIdentity: 'compat-result/res-2' }),
              ],
        refusalEvidence: [buildRefusalEvidence()],
        assertedDisposition: 'COMPATIBLE',
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.ok(result.outcome === 'FAIL_CLOSED');
    assert.equal(result.code, 'FAVORABLE_CLAIM_UNBACKED');
  }
});

test('a41-003 refusal ceiling: negative evidence verifies and reports INCOMPATIBLE, and an empty evidence set never guesses', () => {
  const reported = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [],
      refusalEvidence: [buildRefusalEvidence()],
      assertedDisposition: 'INCOMPATIBLE',
    }),
  );
  assert.equal(reported.outcome, 'INCOMPATIBLE');

  const guessed = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [],
      refusalEvidence: [],
      assertedDisposition: 'INCOMPATIBLE',
    }),
  );
  assert.equal(guessed.outcome, 'FAIL_CLOSED');
  assert.ok(guessed.outcome === 'FAIL_CLOSED');
  assert.equal(guessed.code, 'FAVORABLE_CLAIM_UNBACKED');
});

test('a41-003 refusal C143-family: material refusal evidence coexisting with a favorable result surfaces the contradiction (C98), never a favorable-only selection', () => {
  const result = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [
        buildFavorableResult(),
        buildFavorableResult({
          resultViewIdentity: 'compat-result/res-neg',
          disposition: 'INCOMPATIBLE',
          refusalEvidenceIdentities: ['refusal/runtime-binding-1'],
        }),
      ],
      refusalEvidence: [buildRefusalEvidence()],
      assertedDisposition: 'COMPATIBLE',
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'CONTRADICTORY_AUTHORITATIVE_RESULTS');
});
