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
