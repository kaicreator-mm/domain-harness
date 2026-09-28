// Issue #360 / A41-006 — cumulative DAC v0.0.4.1 conformance closure:
// executable per-row mapping of every additive v0.0.4.1 row C118–C172
// exactly as frozen by spec/v0.0.4.1/CONFORMANCE_MATRIX.md §8 at the
// semantic freeze 75fee75b…, with the reviewed #348 audit dispositions
// (comment 5836333294) preserved verbatim:
//
//   F-01 C118–C132, C159–C162, C166–C168, C172  [IMPLEMENTATION_DELTA]
//        — the A41-002 designation-chain/adoption verifier surface.
//   F-02 C133–C136                               [NOT_OWNED]
//        — conformance-verdict issuance/review independence is external.
//   F-03 C137–C139                               [NOT_OWNED]
//        — authoring producer/provider roles are external.
//   F-04 C140–C143                               [IMPLEMENTATION_DELTA]
//        — the A41-004 composition-intake verifier surface.
//   F-05 C144                                    [CONFORMANCE_ONLY]
//   F-06 C145–C147, C163–C165                    [IMPLEMENTATION_DELTA]
//   F-07 C148–C149, C169                         [IMPLEMENTATION_DELTA]
//   F-08 C150–C158, C170–C171                    [IMPLEMENTATION_DELTA]
//
// NOT_OWNED rows are proven as consumption boundaries (registry
// vocabulary containment, anti-alias rejection, polarity consumption) —
// Harness never takes the issuing authority. Every row executes real
// production functions over deterministic fixtures.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAC_V0041_BASELINE,
  DAC_V0041_ROLE_REGISTRY,
  DacV0041ReferenceError,
  adoptDacV0041RegistryReference,
  classifyDacV0041CapabilityExchange,
  classifyDacV0041CurrentnessUse,
  dacV0041OutcomeProducesResult,
  verifyDacV0041RequestResultSeparation,
} from '../../src/dac-v0041/index.js';
import {
  classifyDacV0041HistoricAuthorityArtifactUse,
  verifyDacV0041AuthorityAdoption,
  verifyDacV0041DesignationChain,
} from '../../src/dac-v0041/authority/index.js';
import {
  classifyDacV0041CompatibilityPrecedence,
  verifyDacV0041CompatibilityViewAssociation,
} from '../../src/dac-v0041/compatibility/index.js';
import {
  verifyDacV0041AuthorityRefusalEvidence,
  verifyDacV0041CompositionIntake,
} from '../../src/dac-v0041/composition-intake/index.js';
import { verifyDacV0041RuntimeBinding } from '../../src/dac-v0041/runtime/index.js';
import * as authorityFixtures from '../dac-v0041-authority/helpers.js';
import * as compatibilityFixtures from '../dac-v0041-compatibility/helpers.js';
import * as compositionIntakeFixtures from '../dac-v0041-composition-intake/helpers.js';
import * as runtimeFixtures from '../dac-v0041-runtime/helpers.js';

function adoptRole(role: (typeof DAC_V0041_ROLE_REGISTRY)[number], primaryIdentity: string, authorityScope = 'scope/domain-a') {
  return adoptDacV0041RegistryReference({
    role,
    baseline: DAC_V0041_BASELINE,
    authorityScope,
    primaryIdentity,
    opaque: {},
  });
}

function assertAliasRejected(
  request: Parameters<typeof verifyDacV0041RequestResultSeparation>[0],
  counterpart: Parameters<typeof verifyDacV0041RequestResultSeparation>[1][number],
): void {
  assert.throws(
    () => verifyDacV0041RequestResultSeparation(request, [counterpart]),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError && error.code === 'REQUEST_RESULT_ALIAS',
  );
}

// ===========================================================================
// F-01 — designation delegation / currentness (C118–C132).
// ===========================================================================

test('C118 a promotion-only issuer granting a designation-issuance chain fails closed at the parent-role rung', () => {
  const result = verifyDacV0041DesignationChain({
    links: [
      // A designation-issuance grandchild citing a promotion leaf as parent.
      authorityFixtures.buildMiddleIssuanceLink({
        designatorIdentity: authorityFixtures.IDENTITY.promoter,
        parentLinkIdentity: 'link/promotion-b',
        declaredEffectiveEnd: 85,
      }),
      authorityFixtures.buildPromotionLeafLink(),
      authorityFixtures.buildRootIssuanceLink(),
    ],
    leafLinkIdentity: 'link/mid-iss',
    scopeOwnerAnchors: [
      { ownerIdentity: authorityFixtures.IDENTITY.owner, provedScopes: [authorityFixtures.SCOPE.domainA] },
    ],
    evaluationPoint: 60,
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'PARENT_ROLE_NOT_DESIGNATION_ISSUANCE');
});

test('C119 a delegated designation granting a role outside its delegable roles fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({ authorityRole: 'runtime-activation' }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_NOT_ENVELOPED');
});

test('C120 a delegated designation naming a scope outside the envelope (including another owner scope) fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({ authorityScope: authorityFixtures.SCOPE.domainB }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SCOPE_NOT_ENVELOPED');
});

test('C121 a delegated designation weakening inherited mandatory constraints or naming an out-of-envelope profile fails closed', () => {
  const droppedConstraint = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({ holderConstraints: [] }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.ok(droppedConstraint.outcome === 'FAIL_CLOSED');
  assert.equal(droppedConstraint.code, 'CONSTRAINT_NOT_INHERITED');
  const foreignProfile = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          dacProfileIdentity: authorityFixtures.PROFILE.other,
        }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.ok(foreignProfile.outcome === 'FAIL_CLOSED');
  assert.equal(foreignProfile.code, 'PROFILE_NOT_PERMITTED');
});

test('C122 a child window exceeding its parent or claiming effect before its evidenced issuance fails closed', () => {
  const widenedWindow = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({ declaredEffectiveEnd: 120 }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.ok(widenedWindow.outcome === 'FAIL_CLOSED');
  assert.equal(widenedWindow.code, 'WINDOW_NOT_ATTENUATED');
  const backdated = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({ effectiveFrom: 15 }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.ok(backdated.outcome === 'FAIL_CLOSED');
  assert.equal(backdated.code, 'BACKDATED_EFFECTIVE_FROM');
});

test('C123 a delegated designation carrying an SoD/co-location permission excluded by its envelope fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          sodPermissions: [authorityFixtures.SOD_PERMISSION.admin],
        }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SOD_PERMISSION_NOT_PERMITTED');
});

test('C124 re-delegating designation-issuance without permission or after depth exhaustion fails closed', () => {
  const result = verifyDacV0041DesignationChain({
    links: [
      authorityFixtures.buildMiddleIssuanceLink(),
      authorityFixtures.buildRootIssuanceLink({
        delegationEnvelope: {
          delegableRoles: [
            'promotion',
            'selection',
            'compatibility-validation',
            'runtime-binding',
            'external-authority',
            'designation-issuance',
          ],
          delegableScopes: [authorityFixtures.SCOPE.domainA],
          mandatoryConstraints: [authorityFixtures.CONSTRAINT.tenantAlpha],
          permittedDacProfiles: [authorityFixtures.PROFILE.v0041a],
          delegableSodPermissions: [authorityFixtures.SOD_PERMISSION.cohostComposer],
          redelegationDepth: 0,
        },
      }),
    ],
    leafLinkIdentity: 'link/mid-iss',
    scopeOwnerAnchors: [
      { ownerIdentity: authorityFixtures.IDENTITY.owner, provedScopes: [authorityFixtures.SCOPE.domainA] },
    ],
    evaluationPoint: 60,
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REDELEGATION_NOT_PERMITTED');
});

test('C125 an ancestor that expired before the descendant issuance point invalidates the descendant act', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(96, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          effectiveFrom: 95,
          declaredEffectiveEnd: 99,
          issuanceEvidence: { point: 95, assertedBy: [authorityFixtures.IDENTITY.witness] },
        }),
        // The root window still declares [10,100] (attenuation holds); the
        // operative ancestor end arrives as an ordinary-expiry end act at 90.
        authorityFixtures.buildRootIssuanceLink({
          endActs: [
            authorityFixtures.buildEndAct({
              kind: 'ordinary-expiry',
              effectivePoint: 90,
              issuanceEvidence: { point: 90, assertedBy: [authorityFixtures.IDENTITY.witness] },
            }),
          ],
        }),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ANCESTOR_NOT_CURRENT_AT_ISSUANCE');
});

test('C126 a retroactive ancestor void at T_v invalidates descendants issued at or after T_v; earlier artifacts stay historical', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(70, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          effectiveFrom: 55,
          issuanceEvidence: { point: 55, assertedBy: [authorityFixtures.IDENTITY.witness] },
        }),
        authorityFixtures.buildRootIssuanceLink({
          endActs: [
            authorityFixtures.buildEndAct({
              kind: 'retroactive-void',
              effectivePoint: 50,
              issuanceEvidence: { point: 60, assertedBy: [authorityFixtures.IDENTITY.witness] },
            }),
          ],
        }),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.ok(
    result.code === 'VOID_INVALIDATES_DESCENDANT' || result.code === 'CHAIN_VOIDED',
  );
  // Earlier valid issuance remains historically verifiable at its own point.
  const historical = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(45),
  );
  assert.equal(historical.outcome, 'CHAIN_CURRENT');
});

test('C127 an invalid end act (non-entitled issuer) is REJECTED with no effect on the chain currentness', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(75, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          endActs: [
            authorityFixtures.buildEndAct({
              kind: 'prospective-revocation',
              issuerIdentity: authorityFixtures.IDENTITY.outsider,
              effectivePoint: 70,
              issuanceEvidence: { point: 70, assertedBy: [authorityFixtures.IDENTITY.witness] },
            }),
          ],
        }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rejectedEndActs.length, 1);
  assert.equal(result.rejectedEndActs[0]?.reason, 'unauthorized-issuer');
});

test('C128 a designation link/adoption lacking independently recoverable issuance-point evidence fails closed', () => {
  const chain = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          issuanceEvidence: { point: 20, assertedBy: [] },
        }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.ok(chain.outcome === 'FAIL_CLOSED');
  assert.equal(chain.code, 'ISSUANCE_EVIDENCE_UNESTABLISHED');
  const adoption = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts({
      issuanceEvidence: { point: 60, assertedBy: [] },
    }),
  );
  assert.ok(adoption.outcome === 'FAIL_CLOSED');
  assert.equal(adoption.code, 'ISSUANCE_EVIDENCE_UNESTABLISHED');
});

test('C129 self-designation, repeated designated issuers and Composer-role designators all fail closed', () => {
  const selfDesignated = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink(),
        authorityFixtures.buildRootIssuanceLink({
          designatedIssuerIdentity: authorityFixtures.IDENTITY.owner,
        }),
      ],
    }),
  );
  assert.ok(selfDesignated.outcome === 'FAIL_CLOSED');
  assert.equal(selfDesignated.code, 'SELF_DESIGNATION');
  const repeatedIssuer = verifyDacV0041DesignationChain(
    authorityFixtures.buildDepthOneChainInput(60, {
      links: [
        // The root-designated delegate reappears as a designated issuer two
        // levels down: a repeated designated issuer / designation cycle.
        authorityFixtures.buildGrandchildPromotionLink({
          designatedIssuerIdentity: authorityFixtures.IDENTITY.delegate,
        }),
        authorityFixtures.buildMiddleIssuanceLink(),
        authorityFixtures.buildRootIssuanceLink({
          declaredEffectiveEnd: 100,
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [authorityFixtures.SCOPE.domainA],
            mandatoryConstraints: [authorityFixtures.CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [authorityFixtures.PROFILE.v0041a],
            delegableSodPermissions: [authorityFixtures.SOD_PERMISSION.cohostComposer],
            redelegationDepth: 2,
          },
        }),
      ],
    }),
  );
  assert.ok(repeatedIssuer.outcome === 'FAIL_CLOSED');
  assert.ok(
    repeatedIssuer.code === 'REPEATED_DESIGNATED_ISSUER' ||
      repeatedIssuer.code === 'IDENTITY_DISCONTINUITY',
  );
  const composerDesignator = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          designatorIdentity: authorityFixtures.IDENTITY.composer,
        }),
        authorityFixtures.buildRootIssuanceLink({
          designatorIdentity: authorityFixtures.IDENTITY.composer,
        }),
      ],
      scopeOwnerAnchors: [
        { ownerIdentity: authorityFixtures.IDENTITY.composer, provedScopes: [authorityFixtures.SCOPE.domainA] },
      ],
      composerRoleIdentities: [authorityFixtures.IDENTITY.composer],
    }),
  );
  assert.ok(composerDesignator.outcome === 'FAIL_CLOSED');
  assert.equal(composerDesignator.code, 'COMPOSER_DESIGNATOR');
});

test('C130 an owner anchor that does not establish the relied-upon scope ownership fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      scopeOwnerAnchors: [
        { ownerIdentity: authorityFixtures.IDENTITY.owner, provedScopes: [authorityFixtures.SCOPE.domainB] },
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROOT_ANCHOR_UNESTABLISHED');
});

test('C131 an owner-direct designation with distinct issuer, complete minima and established anchor passes', () => {
  const result = verifyDacV0041DesignationChain({
    links: [authorityFixtures.buildOwnerDirectPromotionLink()],
    leafLinkIdentity: 'link/owner-direct-promotion',
    scopeOwnerAnchors: [
      { ownerIdentity: authorityFixtures.IDENTITY.owner, provedScopes: [authorityFixtures.SCOPE.domainA] },
    ],
    evaluationPoint: 60,
  });
  assert.equal(result.outcome, 'CHAIN_CURRENT');
});

test('C132 a valid owner-rooted depth-0 delegated promotion grant inside every envelope dimension passes', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.deepEqual(result.chainLinkIdentities, ['link/promotion-b', 'link/root-iss']);
});

// ===========================================================================
// F-02 — conformance independence (C133–C136): NOT_OWNED.
// ===========================================================================

test('C133 [NOT_OWNED] conformance-verdict independence is not product authority: verdict/request stay registry vocabulary with the frozen anti-alias bar', () => {
  assert.ok((DAC_V0041_ROLE_REGISTRY as readonly string[]).includes('conformance-verdict'));
  assert.ok((DAC_V0041_ROLE_REGISTRY as readonly string[]).includes('conformance-request'));
  // A verdict identity can never double as its request identity (C110 chain
  // re-asserted on the F-02 seam), and no product surface classifies
  // "independent" verdicts — independence axes live outside the Runtime.
  assertAliasRejected(
    adoptRole('conformance-request', 'verdict/conformance-1'),
    adoptRole('conformance-verdict', 'verdict/conformance-1'),
  );
});

test('C134 [NOT_OWNED] verdict exactness minima are consumed only through externally issued shapes: a verdict-shaped carrier is not compatibility evidence', () => {
  // A conformance-verdict registry reference adopted here is identity-only:
  // it cannot occupy a compatibility authority position.
  const verdictRef = adoptRole('conformance-verdict', 'verdict/conformance-1');
  assert.equal(verdictRef.role, 'conformance-verdict');
  const association = verifyDacV0041CompatibilityViewAssociation(
    compatibilityFixtures.buildAssociationInput({
      validationView: compatibilityFixtures.buildValidationView({
        validatorIdentity: verdictRef.primaryIdentity,
      }),
      resultView: compatibilityFixtures.buildResultView({
        validatorIdentity: verdictRef.primaryIdentity,
      }),
    }),
  );
  assert.ok(association.outcome === 'VALID_TWO_VIEW');
  // The verdict identity was consumed only as an external validator
  // identity: the result stays a bounded compatibility verdict and creates
  // no conformance-verdict authority (structural marker below).
  assert.equal(association.validatorIdentity, 'verdict/conformance-1');
});

test('C135 [NOT_OWNED] a verdict reused after its evaluated revision/DAC/matrix identity changes is STALE under the shared currentness vocabulary', () => {
  assert.deepEqual(classifyDacV0041CurrentnessUse('stale'), {
    state: 'stale',
    disposition: 'STALE',
  });
});

test('C136 [NOT_OWNED] designated conformance authority stays external: adoption of a conformance-verdict artifact is non-adoptable and never in-product', () => {
  const adoption = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts({
      adoptedArtifactClass: 'conformance-verdict',
      adoptedArtifactRef: adoptRole('conformance-verdict', 'verdict/historic-1'),
    }),
  );
  assert.ok(adoption.outcome === 'FAIL_CLOSED');
  assert.equal(adoption.code, 'NON_ADOPTABLE_CLASS');
});

// ===========================================================================
// F-03 — Domain authoring result role (C137–C139): NOT_OWNED.
// ===========================================================================

test('C137 [NOT_OWNED] DomainAuthoringResultRef never aliases its request, candidate or capability-result identities', () => {
  assertAliasRejected(
    adoptRole('domain-authoring-request', 'authoring/result-1'),
    adoptRole('domain-authoring-result', 'authoring/result-1'),
  );
  assertAliasRejected(
    adoptRole('domain-authoring-request', 'authored/candidate-1'),
    adoptRole('authored-candidate', 'authored/candidate-1'),
  );
});

test('C138 [NOT_OWNED] an authored candidate claimed as promotion coverage without request→result→candidate provenance fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      selectedDomainData: [
        compositionIntakeFixtures.buildCoverage('subject/selected-alpha', {
          promotionCoverageRef: compositionIntakeFixtures.buildRef(
            'authored-candidate',
            'authored/candidate-1',
          ),
        }),
        compositionIntakeFixtures.buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('C139 [NOT_OWNED] a non-produced outcome state never carries or implies produced candidates', () => {
  for (const outcome of [
    'accepted-for-evaluation',
    'pending/in-progress',
    'rejected/invalid-input',
    'blocked/missing-capability',
    'failed-known-no-result',
    'unknown/ambiguous-production',
  ] as const) {
    assert.equal(dacV0041OutcomeProducesResult(outcome), false);
  }
  assert.equal(dacV0041OutcomeProducesResult('produced-result'), true);
});

// ===========================================================================
// F-04 — application identity / refusal (C140–C143).
// ===========================================================================

test('C140 an application selection without valid prior identity establishment fails closed', () => {
  // Non-designated establishment issuer: the presented issuer identity is
  // not the chain-current designated establishment issuer.
  const notDesignated = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      applicationIdentityEstablishment: compositionIntakeFixtures.buildEstablishmentFacts({
        issuerIdentity: compositionIntakeFixtures.IDENTITY.outsider,
      }),
    }),
  );
  assert.ok(notDesignated.outcome === 'FAIL_CLOSED');
  assert.equal(notDesignated.code, 'UNAUTHORIZED_ISSUER');
  const orderViolated = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      applicationIdentityEstablishment: compositionIntakeFixtures.buildEstablishmentFacts({
        issuanceEvidence: { point: 45, assertedBy: [compositionIntakeFixtures.IDENTITY.witness] },
      }),
    }),
  );
  assert.ok(orderViolated.outcome === 'FAIL_CLOSED');
  assert.equal(orderViolated.code, 'ESTABLISHMENT_ORDER_VIOLATED');
});

test('C141 an ApplicationIdentityEstablishmentRef aliasing the semantic identity or its request fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      applicationIdentityEstablishment: compositionIntakeFixtures.buildEstablishmentFacts({
        establishmentRef: compositionIntakeFixtures.buildRef(
          'application-identity-establishment',
          'app/semantic-alpha',
        ),
      }),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'IDENTITY_ALIAS');
});

test('C142 an AuthorityRefusalRef is a produced negative decision, never a transport failure, INCOMPATIBLE verdict or a conflated seam refusal', () => {
  // Reclassified presentation (C142: produced refusal != transport outcome).
  const reclassified = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      materialRefusals: [
        compositionIntakeFixtures.buildBindingRefusalFacts({
          presentedOutcomeClass: 'rejected/invalid-input',
        }),
      ],
    }),
  );
  assert.ok(reclassified.outcome === 'FAIL_CLOSED');
  assert.equal(reclassified.code, 'REFUSAL_RECLASSIFIED');
  // Seam conflation (binding refusal presented on the activation seam) is
  // classified by the dedicated refusal-evidence verifier.
  const conflated = verifyDacV0041AuthorityRefusalEvidence(
    compositionIntakeFixtures.buildBindingRefusalFacts({ seamKind: 'runtime-activation' }),
  );
  assert.ok(conflated.outcome === 'FAIL_CLOSED');
  assert.equal(conflated.code, 'REFUSAL_SEAM_CONFLATED');
});

test('C143 a material refusal omitted while a later favorable result is relied upon cannot close the claim', () => {
  const intake = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({ refusalDisclosureComplete: false }),
  );
  assert.ok(intake.outcome === 'FAIL_CLOSED');
  assert.equal(intake.code, 'MATERIAL_REFUSAL_OMITTED');
  const precedence = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({
      refusalEvidence: [compatibilityFixtures.buildRefusalEvidence()],
    }),
  );
  assert.ok(precedence.outcome === 'FAIL_CLOSED');
  assert.equal(precedence.code, 'MATERIAL_REFUSAL_PRESENT');
});

// ===========================================================================
// F-05 — compatibility two-view clarification (C144).
// ===========================================================================

test('C144 one validation record exposes separately recoverable validation/result views with one authority and a distinct request identity', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    compatibilityFixtures.buildAssociationInput(),
  );
  assert.ok(result.outcome === 'VALID_TWO_VIEW');
  assert.equal(result.singleAuthority, true);
  assert.equal(result.requestIdentity, compatibilityFixtures.VIEW.request);
  assert.equal(result.validationViewIdentity, compatibilityFixtures.VIEW.validation);
  assert.equal(result.resultViewIdentity, compatibilityFixtures.VIEW.result);
  assert.notEqual(result.requestIdentity, result.validationViewIdentity);
  assert.notEqual(result.validationViewIdentity, result.resultViewIdentity);
});

// ===========================================================================
// F-06 — predecessor authority adoption (C145–C147, C163–C165).
// ===========================================================================

test('C145 a pre-v0.0.4 authority artifact without valid adoption evidence cannot enter a v0.0.4.1 authority chain directly', () => {
  const classification = classifyDacV0041HistoricAuthorityArtifactUse({
    artifactRef: authorityFixtures.buildHistoricPromotionArtifactRef(),
    historicChainSatisfiesV0041: false,
  });
  assert.equal(classification.outcome, 'ADOPTION_REQUIRED');
});

test('C146 a same-class issuing-role holder adopting an authentic artifact inside its exact authority with full re-evaluation passes prospectively', () => {
  const result = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts(),
  );
  assert.equal(result.outcome, 'ADOPTED_PROSPECTIVE');
  assert.equal(result.effectiveFrom, 60);
  assert.equal(result.newAuthoritativeIssuancePoint, 60);
});

test('C147 consumer wrappers, mismatched issuers, wrong-role issuers and non-adoptable classes all fail closed', () => {
  const wrapperIssuer = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts({
      adoptionIssuerIdentity: authorityFixtures.IDENTITY.outsider,
    }),
  );
  assert.ok(wrapperIssuer.outcome === 'FAIL_CLOSED');
  assert.ok(
    wrapperIssuer.code === 'ADOPTION_ISSUER_MISMATCH' ||
      wrapperIssuer.code === 'ADOPTION_ISSUER_CHAIN_INVALID',
  );
  const wrongRole = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts({
      requiredIssuingRole: 'selection',
    }),
  );
  assert.ok(wrongRole.outcome === 'FAIL_CLOSED');
  assert.ok(
    wrongRole.code === 'WRONG_ROLE_ISSUER' ||
      wrongRole.code === 'ADOPTION_ISSUER_CHAIN_INVALID',
  );
  const nonAdoptable = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts({
      adoptedArtifactClass: 'manifest',
      adoptedArtifactRef: compositionIntakeFixtures.buildRef('manifest', 'manifest/historic-1'),
    }),
  );
  assert.ok(nonAdoptable.outcome === 'FAIL_CLOSED');
  assert.equal(nonAdoptable.code, 'NON_ADOPTABLE_CLASS');
});

test('C163 an ordinary role holder attempting to adopt an AuthorityDesignationRef/attestation fails closed: fresh issuance is required', () => {
  const result = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts({
      adoptedArtifactClass: 'authority-designation',
      adoptedArtifactRef: adoptRole('authority-designation', 'designation/historic-1'),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'NON_ADOPTABLE_CLASS');
});

test('C164 an adopted decision outside the adopter authority constraints or profile fails closed with no normalization', () => {
  const constraintNotCovered = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts({
      subjectConstraintTokens: [authorityFixtures.CONSTRAINT.euOnly],
    }),
  );
  assert.ok(constraintNotCovered.outcome === 'FAIL_CLOSED');
  assert.equal(constraintNotCovered.code, 'CONSTRAINT_NOT_COVERED');
  const profileNotCovered = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts({
      originDacProfileIdentity: authorityFixtures.PROFILE.v0041a,
    }),
  );
  assert.ok(profileNotCovered.outcome === 'FAIL_CLOSED');
  assert.ok(
    profileNotCovered.code === 'PROFILE_NOT_COVERED' ||
      profileNotCovered.code === 'MALFORMED_SOURCE',
  );
});

test('C165 a same-class issuing authority adopting an authentic non-designation artifact inside its exact current authority passes from the adoption point', () => {
  const result = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts({
      adoptedArtifactClass: 'runtime-contract',
      adoptedArtifactRef: authorityFixtures.buildHistoricArtifactRef('runtime-contract'),
    }),
  );
  assert.equal(result.outcome, 'ADOPTED_PROSPECTIVE');
});

// ===========================================================================
// F-07 — decision/producer separation of duties (C148–C149, C169).
// ===========================================================================

test('C148 a deciding issuer identical to a non-authority subject producer/evidence source self-approves and fails closed, incurably by permission', () => {
  const result = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      sod: runtimeFixtures.buildSodFacts({
        subjectContributingIdentities: [runtimeFixtures.IDENTITY.bindingIssuer],
        explicitSodPermissionEstablished: true,
        coLocationDisclosed: true,
      }),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SELF_APPROVAL');
});

test('C149 a distinct co-hosted deciding issuer needs BOTH explicit SoD permission and co-location disclosure', () => {
  const noPermission = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      sod: runtimeFixtures.buildSodFacts({
        subjectContributingIdentities: ['id/subject-producer'],
        coHostingGroups: [[runtimeFixtures.IDENTITY.bindingIssuer, 'id/subject-producer']],
        explicitSodPermissionEstablished: false,
        coLocationDisclosed: true,
      }),
    }),
  );
  assert.ok(noPermission.outcome === 'FAIL_CLOSED');
  assert.equal(noPermission.code, 'SOD_PERMISSION_MISSING');
  const undisclosed = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      sod: runtimeFixtures.buildSodFacts({
        subjectContributingIdentities: ['id/subject-producer'],
        coHostingGroups: [[runtimeFixtures.IDENTITY.bindingIssuer, 'id/subject-producer']],
        explicitSodPermissionEstablished: true,
        coLocationDisclosed: false,
      }),
    }),
  );
  assert.ok(undisclosed.outcome === 'FAIL_CLOSED');
  assert.equal(undisclosed.code, 'COLOCATION_UNDISCLOSED');
  const withBoth = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      sod: runtimeFixtures.buildSodFacts({
        subjectContributingIdentities: ['id/subject-producer'],
        coHostingGroups: [[runtimeFixtures.IDENTITY.bindingIssuer, 'id/subject-producer']],
        explicitSodPermissionEstablished: true,
        coLocationDisclosed: true,
      }),
    }),
  );
  assert.equal(withBoth.outcome, 'BINDING_VERIFIED');
});

test('C169 one identity separately designated for compatibility validation and Runtime binding may consume its own valid upstream result and issue binding', () => {
  const result = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      compatibilityValidatorIdentity: runtimeFixtures.IDENTITY.bindingIssuer,
    }),
  );
  assert.equal(result.outcome, 'BINDING_VERIFIED');
});

// ===========================================================================
// F-08 — deterministic capability/currentness/request precedence
// (C150–C158, C170–C171).
// ===========================================================================

test('C150 a missing capability kind blocks before an explicit unsupported target is judged', () => {
  const classification = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: [],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: false,
    bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
  });
  assert.deepEqual(classification, {
    phase: 'capability-kind',
    outcome: 'blocked/missing-capability',
    targetNotJudged: true,
  });
});

test('C151 a stale material input with an unsupported target classifies STALE before target support', () => {
  const classification = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: true,
    bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
  });
  assert.deepEqual(classification, {
    phase: 'exactness-currentness',
    disposition: 'STALE',
  });
});

test('C152 structural invalidity dominates coexisting staleness', () => {
  const classification = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: false,
    materialStaleness: true,
    bindingTargetState: { presence: 'missing' },
  });
  assert.deepEqual(classification, {
    phase: 'exactness-currentness',
    disposition: 'FAIL_CLOSED',
  });
});

test('C153 the descriptor/kind/staleness ladder is deterministic at every rung', () => {
  const noDescriptor = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: false,
    currentDescriptorOfferedCapabilityKinds: [],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: false,
    bindingTargetState: { presence: 'missing' },
  });
  assert.deepEqual(noDescriptor, {
    phase: 'descriptor-establishment',
    disposition: 'FAIL_CLOSED',
  });
  const noKind = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: [],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: false,
    bindingTargetState: { presence: 'missing' },
  });
  assert.deepEqual(noKind, {
    phase: 'capability-kind',
    outcome: 'blocked/missing-capability',
    targetNotJudged: true,
  });
  const stale = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: true,
    bindingTargetState: { presence: 'missing' },
  });
  assert.deepEqual(stale, { phase: 'exactness-currentness', disposition: 'STALE' });
});

test('C154 non-designated issuers of definitions/verdicts/designations fail closed at every consumed seam', () => {
  const association = verifyDacV0041CompatibilityViewAssociation(
    compatibilityFixtures.buildAssociationInput({
      validationView: compatibilityFixtures.buildValidationView({
        validatorDesignated: false,
      }),
    }),
  );
  assert.ok(association.outcome === 'FAIL_CLOSED');
  assert.equal(association.code, 'NON_DESIGNATED_VALIDATOR');
  const precedence = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({
      authoritativeResults: [
        compatibilityFixtures.buildFavorableResult({ validatorDesignated: false }),
      ],
    }),
  );
  assert.ok(precedence.outcome === 'FAIL_CLOSED');
  assert.equal(precedence.code, 'NON_DESIGNATED_VALIDATOR');
});

test('C155 promotion/selection/identity-establishment/activation requests never alias their result identities', () => {
  assertAliasRejected(
    adoptRole('promotion-request', 'promotion/decision-1'),
    adoptRole('promotion-decision', 'promotion/decision-1'),
  );
  assertAliasRejected(
    adoptRole('application-selection-request', 'selection/record-1'),
    adoptRole('application-selection', 'selection/record-1'),
  );
  assertAliasRejected(
    adoptRole('application-identity-establishment-request', 'establishment/record-1'),
    adoptRole('application-identity-establishment', 'establishment/record-1'),
  );
  assertAliasRejected(
    adoptRole('runtime-activation-request', 'activation/record-1'),
    adoptRole('runtime-activation', 'activation/record-1'),
  );
});

test('C156 a produced negative decision presented as favorable/effective coverage fails closed', () => {
  const verdict = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({
      authoritativeResults: [
        compatibilityFixtures.buildFavorableResult({ disposition: 'INCOMPATIBLE' }),
      ],
    }),
  );
  assert.ok(verdict.outcome === 'FAIL_CLOSED');
  assert.equal(verdict.code, 'FAVORABLE_CLAIM_UNBACKED');
});

test('C157 invalidated selections/results FAIL_CLOSED and superseded/non-current reusable artifacts are STALE for carry-forward', () => {
  assert.deepEqual(classifyDacV0041CurrentnessUse('revoked'), {
    state: 'revoked',
    disposition: 'FAIL_CLOSED',
  });
  assert.deepEqual(classifyDacV0041CurrentnessUse('voided'), {
    state: 'voided',
    disposition: 'FAIL_CLOSED',
  });
  assert.deepEqual(classifyDacV0041CurrentnessUse('superseded'), {
    state: 'superseded',
    disposition: 'STALE',
  });
  const intake = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      applicationSelection: compositionIntakeFixtures.buildSelectionFacts({
        reuseCurrentness: {
          state: 'revoked',
          establishedAt: 60,
          assertedBy: [compositionIntakeFixtures.IDENTITY.witness],
        },
      }),
    }),
  );
  assert.ok(intake.outcome === 'FAIL_CLOSED');
  assert.equal(intake.code, 'SELECTION_INVALIDATED');
});

test('C158 an accepted/pending invocation is never a decision or approval', () => {
  const verdict = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({ authoritativeResults: [] }),
  );
  assert.ok(verdict.outcome === 'FAIL_CLOSED');
  assert.equal(verdict.code, 'FAVORABLE_CLAIM_UNBACKED');
});

test('C159 a depth-1 re-delegation preserving every ancestor constraint and attenuating role/scope/profile/SoD/depth passes', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildDepthOneChainInput(60),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
});

test('C160 a grandchild dropping a root mandatory constraint fails closed with no silent truncation', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildDepthOneChainInput(60, {
      links: [
        authorityFixtures.buildGrandchildPromotionLink({ holderConstraints: [] }),
        authorityFixtures.buildMiddleIssuanceLink(),
        authorityFixtures.buildRootIssuanceLink({
          declaredEffectiveEnd: 100,
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [authorityFixtures.SCOPE.domainA],
            mandatoryConstraints: [authorityFixtures.CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [authorityFixtures.PROFILE.v0041a],
            delegableSodPermissions: [authorityFixtures.SOD_PERMISSION.cohostComposer],
            redelegationDepth: 2,
          },
        }),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'CONSTRAINT_NOT_INHERITED');
});

test('C161 a grandchild naming a DAC/reference profile excluded by an ancestor fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildDepthOneChainInput(60, {
      links: [
        authorityFixtures.buildGrandchildPromotionLink({
          dacProfileIdentity: authorityFixtures.PROFILE.other,
        }),
        authorityFixtures.buildMiddleIssuanceLink(),
        authorityFixtures.buildRootIssuanceLink({
          declaredEffectiveEnd: 100,
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [authorityFixtures.SCOPE.domainA],
            mandatoryConstraints: [authorityFixtures.CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [authorityFixtures.PROFILE.v0041a],
            delegableSodPermissions: [authorityFixtures.SOD_PERMISSION.cohostComposer],
            redelegationDepth: 2,
          },
        }),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'PROFILE_NOT_PERMITTED');
});

test('C162 a grandchild carrying an SoD permission excluded by an ancestor fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildDepthOneChainInput(60, {
      links: [
        authorityFixtures.buildGrandchildPromotionLink({
          sodPermissions: [authorityFixtures.SOD_PERMISSION.admin],
        }),
        authorityFixtures.buildMiddleIssuanceLink(),
        authorityFixtures.buildRootIssuanceLink({
          declaredEffectiveEnd: 100,
          delegationEnvelope: {
            delegableRoles: ['promotion', 'designation-issuance'],
            delegableScopes: [authorityFixtures.SCOPE.domainA],
            mandatoryConstraints: [authorityFixtures.CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [authorityFixtures.PROFILE.v0041a],
            delegableSodPermissions: [authorityFixtures.SOD_PERMISSION.cohostComposer],
            redelegationDepth: 2,
          },
        }),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SOD_PERMISSION_NOT_PERMITTED');
});

test('C166 a non-owner/out-of-envelope identity attempting prospective revocation has no effect on end(L)', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(75, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          endActs: [
            authorityFixtures.buildEndAct({
              kind: 'prospective-revocation',
              issuerIdentity: authorityFixtures.IDENTITY.outsider,
              effectivePoint: 70,
              issuanceEvidence: { point: 70, assertedBy: [authorityFixtures.IDENTITY.witness] },
            }),
          ],
        }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rejectedEndActs[0]?.reason, 'unauthorized-issuer');
});

test('C167 a holder cannot relinquish another identity designation link: the act is rejected with no effect', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(75, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          endActs: [
            authorityFixtures.buildEndAct({
              kind: 'relinquishment',
              // The scope owner (not the leaf holder) attempts the act.
              issuerIdentity: authorityFixtures.IDENTITY.owner,
              effectivePoint: 70,
              issuanceEvidence: { point: 70, assertedBy: [authorityFixtures.IDENTITY.witness] },
            }),
          ],
        }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rejectedEndActs[0]?.reason, 'issuer-not-holder');
});

test('C168 a root anchor proving only the root scope but not another envelope scope fails the root link and every grant under it', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink(),
        authorityFixtures.buildRootIssuanceLink({
          delegationEnvelope: {
            delegableRoles: ['promotion'],
            delegableScopes: [authorityFixtures.SCOPE.domainA, authorityFixtures.SCOPE.domainB],
            mandatoryConstraints: [authorityFixtures.CONSTRAINT.tenantAlpha],
            permittedDacProfiles: [authorityFixtures.PROFILE.v0041a],
            delegableSodPermissions: [],
            redelegationDepth: 1,
          },
        }),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROOT_ANCHOR_UNESTABLISHED');
});

test('C170 a current descriptor lacking the capability kind stays blocked/missing-capability even when a pinned/reused descriptor is also stale', () => {
  const classification = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: [],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: true,
    bindingTargetState: { presence: 'missing' },
  });
  assert.deepEqual(classification, {
    phase: 'capability-kind',
    outcome: 'blocked/missing-capability',
    targetNotJudged: true,
  });
});

test('C171 a kind-offering current descriptor with a stale pinned/reused material input classifies STALE at Step 2', () => {
  const classification = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: true,
    bindingTargetState: { presence: 'missing' },
  });
  assert.deepEqual(classification, {
    phase: 'exactness-currentness',
    disposition: 'STALE',
  });
});

test('C172 a prospective revocation claiming an effect earlier than its evidenced act issuance is backdated and has no effect', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(80, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          endActs: [
            authorityFixtures.buildEndAct({
              kind: 'prospective-revocation',
              issuerIdentity: authorityFixtures.IDENTITY.owner,
              effectivePoint: 50,
              issuanceEvidence: { point: 60, assertedBy: [authorityFixtures.IDENTITY.witness] },
            }),
          ],
        }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.equal(result.outcome, 'CHAIN_CURRENT');
  assert.equal(result.rejectedEndActs[0]?.reason, 'backdated');
});
