// Issue #360 / A41-006 — the connected positive successor boundary
// journey required by #360:
//
//   valid designation/adoption
//     -> exact composition intake
//     -> compatibility
//     -> Runtime binding
//     -> Runtime activation
//     -> Runtime consequence
//
// One connected chain of real verifications over genuinely valid upstream
// evidence (the canonical runtime fixture bundle in its implementation-
// specific §11 shape, so every concrete Runtime implementation / Host
// Binding exactness dimension is on the path), with every identity
// cross-checked between stages, plus tamper probes proving the chain is
// really connected: coherently corrupting ONE upstream fact must flip the
// downstream verdict (no authority collapse anywhere on the path).
import assert from 'node:assert/strict';
import test from 'node:test';

import { isRuntimeBindingRequestRef } from '../../src/dac-v0041/index.js';
import {
  classifyDacV0041HistoricAuthorityArtifactUse,
  verifyDacV0041AuthorityAdoption,
  verifyDacV0041DesignationChain,
} from '../../src/dac-v0041/authority/index.js';
import {
  classifyDacV0041CompatibilityPrecedence,
  verifyDacV0041CompatibilityViewAssociation,
} from '../../src/dac-v0041/compatibility/index.js';
import { verifyDacV0041CompositionIntake } from '../../src/dac-v0041/composition-intake/index.js';
import {
  classifyDacV0041BusinessSorTruthSource,
  verifyDacV0041RuntimeActivation,
  verifyDacV0041RuntimeBinding,
} from '../../src/dac-v0041/runtime/index.js';
import * as authorityFixtures from '../dac-v0041-authority/helpers.js';
import * as runtimeFixtures from '../dac-v0041-runtime/helpers.js';

/**
 * The full connected journey in its implementation-specific form. Every
 * stage consumes the previous stage's verified identities.
 */
function connectedJourney() {
  // §8.2 reuse determinations must cover the ACTIVATION point (85), because
  // activation re-verifies the complete binding bundle there (A41-005R1.3).
  const activationCoveringCurrentness = {
    state: 'current' as const,
    establishedAt: 85,
    assertedBy: [runtimeFixtures.IDENTITY.witness],
  };
  const implementation = runtimeFixtures.buildMaterialArtifact(
    'runtime-implementation',
    'impl/node-22-a',
    { reuseCurrentness: activationCoveringCurrentness },
  );
  const hostBinding = runtimeFixtures.buildMaterialArtifact(
    'runtime-host-binding',
    'host-binding/node-22-a',
    { reuseCurrentness: activationCoveringCurrentness },
  );
  const bindingInput = runtimeFixtures.buildValidBindingInput({
    implementation,
    hostBindings: [hostBinding],
  });
  return { implementation, hostBinding, bindingInput };
}

test('journey stage 0: every issuer designation on the path is chain-current and the predecessor artifact is adoptable', () => {
  const { bindingInput } = connectedJourney();
  const chains = [
    bindingInput.compositionIntake.applicationIdentityEstablishment.issuerDesignationChain,
    bindingInput.compositionIntake.applicationSelection.issuerDesignationChain,
    bindingInput.compositionIntake.manifest.issuerDesignationChain,
    bindingInput.bindingIssuer.issuerDesignationChain,
  ];
  for (const chain of chains) {
    const result = verifyDacV0041DesignationChain(chain);
    assert.equal(result.outcome, 'CHAIN_CURRENT');
  }
  // Brownfield boundary leg: the historic predecessor promotion artifact
  // needs adoption, and a valid adoption turns it prospective-only.
  const historic = authorityFixtures.buildHistoricPromotionArtifactRef();
  assert.equal(
    classifyDacV0041HistoricAuthorityArtifactUse({
      artifactRef: historic,
      historicChainSatisfiesV0041: false,
    }).outcome,
    'ADOPTION_REQUIRED',
  );
  const adoption = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts(),
  );
  assert.ok(adoption.outcome === 'ADOPTED_PROSPECTIVE');
  assert.ok(adoption.effectiveFrom >= 60);
});

test('journey stage 1: exact composition intake verifies the establishment -> selection -> Manifest chain', () => {
  const { bindingInput } = connectedJourney();
  const intake = verifyDacV0041CompositionIntake(bindingInput.compositionIntake);
  assert.equal(intake.outcome, 'INTAKE_VERIFIED');
  assert.equal(intake.establishmentIdentity, 'establishment/record-1');
  assert.equal(intake.selectionIdentity, 'selection/record-1');
  assert.equal(intake.manifestIdentity, 'manifest/record-1');
  assert.deepEqual(intake.coveredSubjectIdentities, [
    'subject/selected-alpha',
    'subject/selected-beta',
  ]);
});

test('journey stage 2: compatibility verifies as one designated two-view authority with a bounded COMPATIBLE verdict', () => {
  const { bindingInput } = connectedJourney();
  const compatibility = bindingInput.compatibility;
  const association = verifyDacV0041CompatibilityViewAssociation({
    requestRef: compatibility.requestRef,
    validationView: compatibility.validationView,
    resultView: compatibility.resultView,
  });
  assert.equal(association.outcome, 'VALID_TWO_VIEW');
  assert.equal(association.singleAuthority, true);
  const verdict = classifyDacV0041CompatibilityPrecedence(
    compatibility.precedenceFacts,
  );
  assert.equal(verdict.outcome, 'COMPATIBLE_VERDICT');
  assert.equal(verdict.impliesRuntimeBinding, false);
  // The compatibility subject closes exactly over the journey's concrete
  // implementation / Host Binding identities (§11 shape).
  assert.equal(
    compatibility.validationView.subject.runtimeImplementationIdentity,
    'impl/node-22-a',
  );
  assert.equal(
    compatibility.validationView.subject.runtimeHostBindingIdentity,
    'host-binding/node-22-a',
  );
});

test('journey stage 3: Runtime binding verifies over the exact intake + compatibility evidence with no activation implication', () => {
  const { bindingInput } = connectedJourney();
  const binding = verifyDacV0041RuntimeBinding(bindingInput);
  assert.equal(binding.outcome, 'BINDING_VERIFIED');
  assert.ok(isRuntimeBindingRequestRef(bindingInput.bindingRequestRef));
  assert.equal(binding.requestIdentity, bindingInput.bindingRequestRef.primaryIdentity);
  assert.equal(binding.bindingIdentity, 'binding/record-1');
  assert.equal(binding.manifestIdentity, 'manifest/record-1');
  assert.equal(binding.manifestContentDigest, 'digest/manifest-1');
  assert.equal(
    binding.compatibilityResultViewIdentity,
    bindingInput.compatibility.resultView.resultViewIdentity,
  );
  assert.equal(binding.impliesRuntimeActivation, false);
  assert.equal(binding.impliesApplicationSelection, false);
  assert.equal(binding.isExternalBusinessSorTruth, false);
});

test('journey stage 4: Runtime activation verifies the complete binding bundle at the activation point as a separate seam decision', () => {
  const { bindingInput } = connectedJourney();
  const activation = verifyDacV0041RuntimeActivation(
    runtimeFixtures.buildValidActivationInput({ binding: bindingInput }),
  );
  assert.equal(activation.outcome, 'ACTIVATION_VERIFIED');
  assert.equal(activation.requestIdentity, 'request/activation-1');
  assert.equal(activation.activationIdentity, 'activation/record-1');
  assert.equal(activation.boundBindingIdentity, 'binding/record-1');
  assert.equal(activation.manifestIdentity, 'manifest/record-1');
  assert.equal(activation.manufacturesUpstreamAuthority, false);
  assert.equal(activation.isExternalBusinessSorTruth, false);
});

test('journey stage 5: the Runtime consequence stays evidence at the external Business SoR boundary', () => {
  const activated = classifyDacV0041BusinessSorTruthSource({
    presentedStateClass: 'activation-state',
  });
  assert.ok(activated.outcome === 'RUNTIME_STATE_NOT_SOR_TRUTH');
  assert.equal(activated.canManufactureBusinessSorTruth, false);
  const observed = classifyDacV0041BusinessSorTruthSource({
    presentedStateClass: 'external-sor-reconciliation',
  });
  assert.ok(observed.outcome === 'EXTERNAL_SOR_EVIDENCE_ONLY');
  assert.equal(observed.governedByExternalAuthoritySemantics, true);
});

test('journey connectivity probe A: revoking one promotion coverage upstream flips the whole chain fail-closed', () => {
  const { bindingInput } = connectedJourney();
  const tamperedIntake = {
    ...bindingInput.compositionIntake,
    selectedDomainData: bindingInput.compositionIntake.selectedDomainData.map(
      (coverage, index) =>
        index === 0 ? { ...coverage, promotionCurrentness: 'revoked' } : coverage,
    ),
  };
  const intake = verifyDacV0041CompositionIntake(tamperedIntake);
  assert.ok(intake.outcome === 'FAIL_CLOSED');
  assert.equal(intake.code, 'COVERAGE_INVALIDATED');
  const binding = verifyDacV0041RuntimeBinding({
    ...bindingInput,
    compositionIntake: tamperedIntake,
  });
  assert.ok(binding.outcome === 'FAIL_CLOSED');
  assert.equal(binding.intakeCode, 'COVERAGE_INVALIDATED');
});

test('journey connectivity probe B: an INCOMPATIBLE upstream verdict cannot reach a verified binding', () => {
  const { bindingInput } = connectedJourney();
  const tamperedCompatibility = {
    ...bindingInput.compatibility,
    precedenceFacts: {
      ...bindingInput.compatibility.precedenceFacts,
      authoritativeResults:
        bindingInput.compatibility.precedenceFacts.authoritativeResults.map((result) => ({
          ...result,
          disposition: 'INCOMPATIBLE' as const,
        })),
      assertedDisposition: 'INCOMPATIBLE' as const,
    },
  };
  const verdict = classifyDacV0041CompatibilityPrecedence(
    tamperedCompatibility.precedenceFacts,
  );
  assert.equal(verdict.outcome, 'INCOMPATIBLE');
  const binding = verifyDacV0041RuntimeBinding({
    ...bindingInput,
    compatibility: tamperedCompatibility,
  });
  assert.ok(binding.outcome === 'FAIL_CLOSED');
  assert.equal(binding.precedenceOutcome, 'INCOMPATIBLE');
});

test('journey connectivity probe C: a binding revoked before activation never activates', () => {
  const { bindingInput } = connectedJourney();
  const activation = verifyDacV0041RuntimeActivation(
    runtimeFixtures.buildValidActivationInput({
      binding: bindingInput,
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
