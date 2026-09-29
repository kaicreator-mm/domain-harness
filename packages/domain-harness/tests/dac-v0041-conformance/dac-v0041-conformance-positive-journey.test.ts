// Issue #399 / A41-006R1 — one genuinely connected brownfield successor
// boundary journey:
//
//   historic PromotionDecisionRef
//     -> ADOPTION_REQUIRED
//     -> ADOPTED_PROSPECTIVE
//     -> exact test-level adoption/successor continuity gate
//     -> successor-native external PromotionDecisionRef for the SAME subject
//     -> exact composition intake
//     -> compatibility
//     -> Runtime binding
//     -> Runtime activation
//     -> Runtime consequence boundary
//
// The shared orchestrator sequences real production classifiers/verifiers and
// stops on the first failed stage. It never makes composition intake consume
// AuthorityAdoptionRef and never mints production authority on Runtime's behalf.
import assert from 'node:assert/strict';
import test from 'node:test';

import { isRuntimeBindingRequestRef } from '../../src/dac-v0041/index.js';
import { classifyDacV0041CompatibilityPrecedence } from '../../src/dac-v0041/compatibility/index.js';
import { verifyDacV0041CompositionIntake } from '../../src/dac-v0041/composition-intake/index.js';
import {
  verifyDacV0041RuntimeActivation,
  verifyDacV0041RuntimeBinding,
} from '../../src/dac-v0041/runtime/index.js';
import * as runtimeFixtures from '../dac-v0041-runtime/helpers.js';
import { runDacV0041BrownfieldConnectedJourney } from './brownfield-connected-journey.js';

function requireConnectedPass() {
  const journey = runDacV0041BrownfieldConnectedJourney();
  assert.equal(journey.outcome, 'PASS');
  return journey;
}

test('journey stage 0: historic use -> prospective adoption -> successor-native transition preserves the exact adopted subject', () => {
  const journey = requireConnectedPass();
  assert.equal(journey.historicUse.outcome, 'ADOPTION_REQUIRED');
  assert.equal(journey.adoption.outcome, 'ADOPTED_PROSPECTIVE');
  assert.equal(journey.adoption.effectiveFrom, 60);
  assert.equal(journey.adoption.newAuthoritativeIssuancePoint, 60);
  assert.equal(
    journey.successorPromotion.primaryIdentity,
    journey.historicArtifact.primaryIdentity,
  );
  assert.equal(
    journey.successorPromotion.authorityScope,
    journey.historicArtifact.authorityScope,
  );
  assert.equal(journey.successorPromotion.role, journey.historicArtifact.role);
  assert.equal(journey.successorPromotion.predecessorOrigin, undefined);
  assert.ok(journey.successorAuthorityPoint >= journey.adoption.effectiveFrom);
  assert.ok(
    journey.successorAuthorityPoint >= journey.adoption.newAuthoritativeIssuancePoint,
  );
});

test('journey stage 1: the exact successor promotion ref from the adoption transition is the intake coverage consumed for the same subject', () => {
  const journey = requireConnectedPass();
  assert.equal(journey.intake.outcome, 'INTAKE_VERIFIED');
  const adoptedCoverage = journey.bindingInput.compositionIntake.selectedDomainData[0];
  assert.ok(adoptedCoverage !== undefined);
  assert.equal(adoptedCoverage.promotionCoverageRef, journey.successorPromotion);
  assert.equal(
    adoptedCoverage.promotionCoverageRef.primaryIdentity,
    journey.historicArtifact.primaryIdentity,
  );
  assert.equal(adoptedCoverage.subjectRef.primaryIdentity, 'subject/selected-alpha');
  assert.equal(journey.intake.establishmentIdentity, 'establishment/record-1');
  assert.equal(journey.intake.selectionIdentity, 'selection/record-1');
  assert.equal(journey.intake.manifestIdentity, 'manifest/record-1');
  assert.deepEqual(journey.intake.coveredSubjectIdentities, [
    'subject/selected-alpha',
    'subject/selected-beta',
  ]);
});

test('journey stage 2: compatibility verifies over the same bindingInput as one designated two-view authority with a bounded COMPATIBLE verdict', () => {
  const journey = requireConnectedPass();
  assert.equal(journey.association.outcome, 'VALID_TWO_VIEW');
  assert.equal(journey.association.singleAuthority, true);
  assert.equal(journey.compatibilityVerdict.outcome, 'COMPATIBLE_VERDICT');
  assert.equal(journey.compatibilityVerdict.impliesRuntimeBinding, false);
  assert.equal(
    journey.bindingInput.compatibility.validationView.subject
      .runtimeImplementationIdentity,
    'impl/node-22-a',
  );
  assert.equal(
    journey.bindingInput.compatibility.validationView.subject
      .runtimeHostBindingIdentity,
    'host-binding/node-22-a',
  );
});

test('journey stage 3: Runtime binding verifies over the exact connected intake + compatibility evidence with no activation implication', () => {
  const journey = requireConnectedPass();
  const binding = journey.binding;
  assert.equal(binding.outcome, 'BINDING_VERIFIED');
  assert.ok(isRuntimeBindingRequestRef(journey.bindingInput.bindingRequestRef));
  assert.equal(
    binding.requestIdentity,
    journey.bindingInput.bindingRequestRef.primaryIdentity,
  );
  assert.equal(binding.bindingIdentity, 'binding/record-1');
  assert.equal(binding.manifestIdentity, journey.intake.manifestIdentity);
  assert.equal(binding.manifestContentDigest, 'digest/manifest-1');
  assert.equal(
    binding.compatibilityResultViewIdentity,
    journey.bindingInput.compatibility.resultView.resultViewIdentity,
  );
  assert.equal(binding.impliesRuntimeActivation, false);
  assert.equal(binding.impliesApplicationSelection, false);
  assert.equal(binding.isExternalBusinessSorTruth, false);
});

test('journey stage 4: Runtime activation verifies the complete connected binding bundle as a separate seam decision', () => {
  const journey = requireConnectedPass();
  const activation = journey.activation;
  assert.equal(activation.outcome, 'ACTIVATION_VERIFIED');
  assert.equal(activation.requestIdentity, 'request/activation-1');
  assert.equal(activation.activationIdentity, 'activation/record-1');
  assert.equal(activation.boundBindingIdentity, journey.binding.bindingIdentity);
  assert.equal(activation.manifestIdentity, journey.binding.manifestIdentity);
  assert.equal(activation.manufacturesUpstreamAuthority, false);
  assert.equal(activation.isExternalBusinessSorTruth, false);
});

test('journey stage 5: the connected Runtime consequence remains evidence at the external Business SoR boundary', () => {
  const journey = requireConnectedPass();
  assert.equal(journey.runtimeConsequence.outcome, 'RUNTIME_STATE_NOT_SOR_TRUTH');
  assert.equal(journey.runtimeConsequence.canManufactureBusinessSorTruth, false);
  assert.equal(journey.externalConsequence.outcome, 'EXTERNAL_SOR_EVIDENCE_ONLY');
  assert.equal(journey.externalConsequence.governedByExternalAuthoritySemantics, true);
});

test('journey adoption-transition negatives: subject, scope, or pre-adoption successor authority stops before intake', () => {
  for (const result of [
    runDacV0041BrownfieldConnectedJourney({
      successorPrimaryIdentity: 'promotion/subject/different',
    }),
    runDacV0041BrownfieldConnectedJourney({
      successorScope: runtimeFixtures.SCOPE.other,
    }),
    runDacV0041BrownfieldConnectedJourney({ successorAuthorityPoint: 59 }),
  ]) {
    assert.equal(result.outcome, 'FAIL_CLOSED');
    if (result.outcome !== 'FAIL_CLOSED') assert.fail('transition negative passed');
    assert.equal(result.stage, 'transition');
    assert.equal(result.code, 'ADOPTION_SUCCESSOR_CONTINUITY_MISMATCH');
  }
});

test('journey adoption negatives: invalid issuer and backdated adoption stop the SAME orchestrator before any downstream success', () => {
  const wrongIssuer = runDacV0041BrownfieldConnectedJourney({
    adoption: { adoptionIssuerIdentity: runtimeFixtures.IDENTITY.outsider },
  });
  assert.equal(wrongIssuer.outcome, 'FAIL_CLOSED');
  if (wrongIssuer.outcome !== 'FAIL_CLOSED') assert.fail('invalid adoption passed');
  assert.equal(wrongIssuer.stage, 'adoption');
  assert.equal(wrongIssuer.code, 'ADOPTION_ISSUER_MISMATCH');

  const backdated = runDacV0041BrownfieldConnectedJourney({
    adoption: { effectivePoint: 59 },
  });
  assert.equal(backdated.outcome, 'FAIL_CLOSED');
  if (backdated.outcome !== 'FAIL_CLOSED') assert.fail('backdated adoption passed');
  assert.equal(backdated.stage, 'adoption');
  assert.equal(backdated.code, 'BACKDATED_ADOPTION');
});

test('journey connectivity probe A: revoking the connected successor promotion coverage flips intake and binding fail-closed', () => {
  const journey = requireConnectedPass();
  const tamperedIntake = {
    ...journey.bindingInput.compositionIntake,
    selectedDomainData: journey.bindingInput.compositionIntake.selectedDomainData.map(
      (coverage, index) =>
        index === 0 ? { ...coverage, promotionCurrentness: 'revoked' } : coverage,
    ),
  };
  const intake = verifyDacV0041CompositionIntake(tamperedIntake);
  assert.ok(intake.outcome === 'FAIL_CLOSED');
  assert.equal(intake.code, 'COVERAGE_INVALIDATED');
  const binding = verifyDacV0041RuntimeBinding({
    ...journey.bindingInput,
    compositionIntake: tamperedIntake,
  });
  assert.ok(binding.outcome === 'FAIL_CLOSED');
  assert.equal(binding.intakeCode, 'COVERAGE_INVALIDATED');
});

test('journey connectivity probe B: an INCOMPATIBLE verdict on the same connected bindingInput cannot reach verified binding', () => {
  const journey = requireConnectedPass();
  const tamperedCompatibility = {
    ...journey.bindingInput.compatibility,
    precedenceFacts: {
      ...journey.bindingInput.compatibility.precedenceFacts,
      authoritativeResults:
        journey.bindingInput.compatibility.precedenceFacts.authoritativeResults.map(
          (result) => ({ ...result, disposition: 'INCOMPATIBLE' as const }),
        ),
      assertedDisposition: 'INCOMPATIBLE' as const,
    },
  };
  const verdict = classifyDacV0041CompatibilityPrecedence(
    tamperedCompatibility.precedenceFacts,
  );
  assert.equal(verdict.outcome, 'INCOMPATIBLE');
  const binding = verifyDacV0041RuntimeBinding({
    ...journey.bindingInput,
    compatibility: tamperedCompatibility,
  });
  assert.ok(binding.outcome === 'FAIL_CLOSED');
  assert.equal(binding.precedenceOutcome, 'INCOMPATIBLE');
});

test('journey connectivity probe C: the connected binding revoked before activation never activates', () => {
  const journey = requireConnectedPass();
  const activation = verifyDacV0041RuntimeActivation(
    runtimeFixtures.buildValidActivationInput({
      binding: journey.bindingInput,
      bindingReuseCurrentness: {
        state: 'revoked',
        establishedAt: 85,
        assertedBy: [runtimeFixtures.IDENTITY.witness],
      },
      activationRequestSubject: {
        targetBindingIdentity: 'binding/record-1',
        targetManifestIdentity: 'manifest/record-1',
        targetManifestContentDigest: 'digest/manifest-1',
        reliedBindingCurrentness: {
          state: 'revoked',
          establishedAt: 85,
          assertedBy: [runtimeFixtures.IDENTITY.witness],
        },
      },
    }),
  );
  assert.ok(activation.outcome === 'FAIL_CLOSED');
  assert.equal(activation.code, 'BINDING_INVALIDATED');
});
