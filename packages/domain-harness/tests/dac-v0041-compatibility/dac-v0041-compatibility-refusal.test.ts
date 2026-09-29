// Issue #357 / A41-003 (R1 repair per #378 comment 5852943693 / #376 P1-3)
// — focused refusal / negative-evidence suite
// (LIFECYCLE_REFERENCE_REPAIRS §4.2; C142/C143; C156-family): an
// AuthorityRefusalRef binds the COMPLETE §4.2 closure (exact
// request/initiation, exact subject/scope/profile, refusing issuer and its
// designation, seam kind, negative decision, issuance provenance and
// issuance point), can verify and report incompatibility at its own seam
// but can NEVER manufacture a target, selection, binding or activation
// authority, and — per C142 — can never be reclassified as (or back)
// compatibility INCOMPATIBLE: no success-style or compatibility-disposition
// outcome is derivable from refusal evidence alone.
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

test('a41-003 refusal §4.2 (R1): the complete closure is mandatory — every missing element fails closed', () => {
  for (const overrides of [
    { issuerDesignationIdentity: '' },
    { refusedSubjectIdentity: '' },
    { dacProfileIdentity: '' },
    { issuanceProvenanceIdentity: '' },
    { issuancePointIdentity: '' },
    { boundRequestIdentity: '' },
  ]) {
    const result = verifyDacV0041AuthorityRefusalEvidence(buildRefusalEvidence(overrides));
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.ok(result.outcome === 'FAIL_CLOSED');
    assert.equal(result.code, 'INVALID_FACTS');
    assert.match(result.detail, /§4.2 closure/u);
  }
});

test('a41-003 refusal §4.2 (R1): mutable aliases are rejected on every closure identity, including the bound request', () => {
  for (const overrides of [
    { boundRequestIdentity: 'latest' },
    { issuerDesignationIdentity: 'current' },
    { refusedSubjectIdentity: 'head' },
    { dacProfileIdentity: 'main' },
    { issuanceProvenanceIdentity: 'default' },
    { issuancePointIdentity: 'tip' },
  ]) {
    const result = verifyDacV0041AuthorityRefusalEvidence(buildRefusalEvidence(overrides));
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.ok(result.outcome === 'FAIL_CLOSED');
    assert.equal(result.code, 'MUTABLE_ALIAS_IDENTITY');
  }
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

test('a41-003 refusal ceiling (R1/C142): refusal evidence never becomes a compatibility INCOMPATIBLE disposition', () => {
  // A41-003R1 P1-3: the failed HEAD let any non-empty refusalEvidence array
  // satisfy an asserted INCOMPATIBLE claim, reclassifying a seam-typed
  // refusal as compatibility INCOMPATIBLE — frozen §4.2/C142 forbids this.
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

  const empty = classifyDacV0041CompatibilityPrecedence(
    buildPrecedenceFacts({
      authoritativeResults: [],
      refusalEvidence: [],
      assertedDisposition: 'INCOMPATIBLE',
    }),
  );
  assert.equal(empty.outcome, 'FAIL_CLOSED');
  assert.ok(empty.outcome === 'FAIL_CLOSED');
  assert.equal(empty.code, 'FAVORABLE_CLAIM_UNBACKED');
});

test('a41-003 refusal C143: material refusal evidence coexisting with a favorable result blocks the favorable close', () => {
  // The refusal is never omitted from claim closure merely because a later
  // favorable result exists; the claim must be re-established after
  // reconciliation at the refusing seam.
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

test('a41-003 refusal C143-family: material refusal evidence coexisting with contradictory results surfaces the contradiction (C98), never a favorable-only selection', () => {
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
