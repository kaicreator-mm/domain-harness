/**
 * #1006 T-G BUILD/DAC B2 — optional v0.8 npm package verifier entry.
 *
 * Test imports the ACTUAL package-exported path, not private src leaves.
 * Its positive + negative use externally supplied DAC facts, with NO issuer,
 * Host or Kernel side effects. Existing R3 NF01–04 fixtures cover richer
 * compiler-derived external facts through the underlying pure verifiers.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { authority, compatibility, compositionIntake, runtime } from '@kaicreator/domain-harness/v8/dac';
import { IDENTITY, SCOPE, buildOwnerDirectPromotionLink } from '../dac-v0041-authority/helpers.js';
import {
  IDENTITY as COMPAT_IDENTITY,
  buildAssociationInput,
  buildResultView,
  buildValidationView,
} from '../dac-v0041-compatibility/helpers.js';
import {
  buildCoverage,
  buildValidIntakeInput,
} from '../dac-v0041-composition-intake/helpers.js';

test('V08-DAC-P public packed verifier entry accepts independently supplied designation chain', () => {
  assert.equal(typeof authority.verifyDacV0041DesignationChain, 'function');
  assert.equal(typeof compatibility.verifyDacV0041CompatibilityViewAssociation, 'function');
  assert.equal(typeof compositionIntake.verifyDacV0041CompositionIntake, 'function');
  assert.equal(typeof runtime.verifyDacV0041RuntimeBinding, 'function');
  assert.equal(typeof runtime.verifyDacV0041RuntimeActivation, 'function');

  const result = authority.verifyDacV0041DesignationChain({
    links: [buildOwnerDirectPromotionLink()],
    leafLinkIdentity: 'link/owner-direct-promotion',
    scopeOwnerAnchors: [{ ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] }],
    evaluationPoint: 40,
  });
  assert.equal(result.outcome, 'CHAIN_CURRENT');
});

test('V08-DAC-N exported verifiers reject missing external facts and mint no approval', () => {
  const invalid = null as never;
  assert.equal(authority.verifyDacV0041DesignationChain(invalid).outcome, 'FAIL_CLOSED');
  assert.equal(compatibility.verifyDacV0041CompatibilityViewAssociation(invalid).outcome, 'FAIL_CLOSED');
  assert.equal(compositionIntake.verifyDacV0041CompositionIntake(invalid).outcome, 'FAIL_CLOSED');
  assert.equal(runtime.verifyDacV0041RuntimeBinding(invalid).outcome, 'FAIL_CLOSED');
  assert.equal(runtime.verifyDacV0041RuntimeActivation(invalid).outcome, 'FAIL_CLOSED');
});


/**
 * NF01/NF02 (T-G B2): consume the already-shipped optional v0.8 public
 * DAC verifier entry, not the private source-imported legacy verifier.
 * These pure facts are EXTERNALLY supplied — the SDK mints no authority.
 * Reuse the historical 2-view, precedence, selection, manifest and refusal
 * detailed tests instead of copying their entire suites here.
 */
test('V08-NF01 public two-view P/N: exact verifier accepts one issuer and refuses foreign second issuer or contradictory views', () => {
  const good = compatibility.verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({ validationView: buildValidationView({ disposition: 'COMPATIBLE' }) }),
  );
  assert.equal(good.outcome, 'VALID_TWO_VIEW');
  const foreignIssuer = compatibility.verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({ resultView: buildResultView({ validatorIdentity: COMPAT_IDENTITY.validatorB }) }),
  );
  assert.equal(foreignIssuer.outcome, 'FAIL_CLOSED');
  assert.equal(foreignIssuer.code, 'SECOND_AUTHORITY');
  const contradiction = compatibility.verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      validationView: buildValidationView({ disposition: 'INCOMPATIBLE' }),
      resultView: buildResultView({ disposition: 'COMPATIBLE' }),
    }),
  );
  assert.equal(contradiction.outcome, 'FAIL_CLOSED');
  assert.equal(contradiction.code, 'CONTRADICTORY_DISPOSITIONS');
});

test('V08-NF02 public selection→Manifest P/N: current external facts verify; incomplete coverage denies without issuing selection', () => {
  const current = compositionIntake.verifyDacV0041CompositionIntake(buildValidIntakeInput());
  assert.equal(current.outcome, 'INTAKE_VERIFIED');
  assert.equal(current.selectionIdentity, 'selection/record-1');
  const incomplete = compositionIntake.verifyDacV0041CompositionIntake(
    buildValidIntakeInput({ selectedDomainData: [buildCoverage('subject/selected-alpha')] }),
  );
  assert.equal(incomplete.outcome, 'FAIL_CLOSED');
  assert.equal(incomplete.code, 'COVERAGE_INCOMPLETE');
});
