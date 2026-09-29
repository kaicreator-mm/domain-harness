// Issue #360 / A41-006 — cumulative DAC v0.0.4 + v0.0.4.1 conformance
// closure: executable per-row mapping of every additive v0.0.4 row
// C78–C117 exactly as frozen by spec/v0.0.4.1/CONFORMANCE_MATRIX.md §§2–3
// at the semantic freeze 75fee75b…, with the dispositions of the reviewed
// #348 audit (comment 5836333294) preserved verbatim:
//
//   [NOT_OWNED]          the authority belongs to Forge/Simulator/Composer/
//                        external Business SoR/other external issuer; the
//                        row is proven as a consumption boundary (fail
//                        closed when the artifact is presented to a
//                        Harness-owned seam) plus registry vocabulary
//                        containment — Harness never takes the authority.
//   [CONFORMANCE_ONLY]   semantics already materially present; new
//                        successor-bound executable evidence (this suite).
//   [IMPLEMENTATION_DELTA]
//                        the A41-002…A41-005 successor surface implemented
//                        the row; this suite proves it at the cumulative
//                        level on top of the focused per-seam suites.
//
// Every row executes real production functions over deterministic fixtures
// (the canonical per-seam builders, shared read-only); no row is satisfied
// by a comment-only mapping. Historical C01–C77 remain bound to the frozen
// v0.0.3 matrix and are NOT restated here.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_BASELINES,
  DacV0041ReferenceError,
  adoptDacV0041RegistryReference,
  classifyDacV0041CapabilityExchange,
  classifyDacV0041CurrentnessUse,
  dacV0041OutcomeProducesResult,
  isRuntimeBindingRequestRef,
  verifyDacV0041RequestResultSeparation,
} from '../../src/dac-v0041/index.js';
import {
  classifyDacV0041HistoricAuthorityArtifactUse,
  verifyDacV0041DesignationChain,
} from '../../src/dac-v0041/authority/index.js';
import {
  classifyDacV0041CompatibilityPrecedence,
  verifyDacV0041CompatibilityViewAssociation,
} from '../../src/dac-v0041/compatibility/index.js';
import { verifyDacV0041CompositionIntake } from '../../src/dac-v0041/composition-intake/index.js';
import { verifyDacV0041RuntimeBinding } from '../../src/dac-v0041/runtime/index.js';
import * as authorityFixtures from '../dac-v0041-authority/helpers.js';
import * as compatibilityFixtures from '../dac-v0041-compatibility/helpers.js';
import * as compositionIntakeFixtures from '../dac-v0041-composition-intake/helpers.js';
import * as runtimeFixtures from '../dac-v0041-runtime/helpers.js';
import { runDacV0041BrownfieldConnectedJourney } from './brownfield-connected-journey.js';

function assertAliasRejected(request: Parameters<typeof verifyDacV0041RequestResultSeparation>[0], counterpart: Parameters<typeof verifyDacV0041RequestResultSeparation>[1][number]): void {
  assert.throws(
    () => verifyDacV0041RequestResultSeparation(request, [counterpart]),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError && error.code === 'REQUEST_RESULT_ALIAS',
  );
}

// ---------------------------------------------------------------------------
// C78–C80 — Composer/Simulator/selection inference authority: NOT_OWNED.
// Harness consumes promotion/selection evidence only; substituting the
// foreign artifact for the required authority position fails closed.
// ---------------------------------------------------------------------------

test('C78 [NOT_OWNED] an AuthoredCandidateRef presented as promoted coverage is rejected at composition intake', () => {
  const authoredCandidate = adoptDacV0041RegistryReference({
    role: 'authored-candidate',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/app-alpha',
    primaryIdentity: 'authored/candidate-1',
    opaque: {},
  });
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      selectedDomainData: [
        compositionIntakeFixtures.buildCoverage('subject/selected-alpha', {
          promotionCoverageRef: authoredCandidate,
        }),
        compositionIntakeFixtures.buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('C79 [NOT_OWNED] a Simulator PASS result presented as a PromotionDecisionRef is rejected at composition intake', () => {
  const simulationResult = adoptDacV0041RegistryReference({
    role: 'simulation-result',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/app-alpha',
    primaryIdentity: 'simulation/pass-1',
    opaque: {},
  });
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      selectedDomainData: [
        compositionIntakeFixtures.buildCoverage('subject/selected-alpha', {
          promotionCoverageRef: simulationResult,
        }),
        compositionIntakeFixtures.buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('C80 [NOT_OWNED] selection cannot be inferred: an application-selection position occupied by a non-selection reference fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      applicationSelection: compositionIntakeFixtures.buildSelectionFacts({
        selectionRef: compositionIntakeFixtures.buildRef(
          'application-semantic',
          'app/semantic-alpha',
        ),
      }),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

// ---------------------------------------------------------------------------
// C81–C86 — exact Manifest/target/capability vocabulary.
// ---------------------------------------------------------------------------

test('C81 [CONFORMANCE_ONLY] a mutable/latest identity can never substitute an exact selected reference identity', () => {
  assert.throws(
    () =>
      adoptDacV0041RegistryReference({
        role: 'selected-domain-data',
        baseline: DAC_V0041_BASELINE,
        authorityScope: 'scope/app-alpha',
        primaryIdentity: 'latest',
        opaque: {},
      }),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError && error.code === 'MUTABLE_ALIAS_REJECTED',
  );
});

test('C82 [CONFORMANCE_ONLY] a compatibility subject without its required exact target list fails closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    compatibilityFixtures.buildAssociationInput({
      validationView: compatibilityFixtures.buildValidationView({
        subject: compatibilityFixtures.buildSubject({ targetIdentities: [] }),
      }),
      resultView: compatibilityFixtures.buildResultView({
        subject: compatibilityFixtures.buildSubject({ targetIdentities: [] }),
      }),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('C83 [CONFORMANCE_ONLY] a binding explicit target judged unsupported classifies INCOMPATIBLE', () => {
  const classification = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: false,
    bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
  });
  assert.deepEqual(classification, {
    phase: 'target-support',
    disposition: 'INCOMPATIBLE',
  });
});

test('C84 [IMPLEMENTATION_DELTA] capability-kind absence blocks before any target judgment, even with an advisory target hint carried', () => {
  const request = compatibilityFixtures.buildRequestRef({
    advisoryTargetHints: ['target-hint/preferred-profile'],
  });
  const classification = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: [],
    requestedCapabilityKind: request.requestedCapabilityKind,
    requiredInputsStructurallyValid: true,
    materialStaleness: false,
    bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
  });
  assert.deepEqual(classification, {
    phase: 'capability-kind',
    outcome: 'blocked/missing-capability',
    targetNotJudged: true,
  });
  // An advisory hint can never occupy the binding explicit target slot: a
  // non-compatibility-target reference in that slot fails closed.
  assert.throws(
    () =>
      compatibilityFixtures.buildRequestRef({
        bindingTargetRef: adoptDacV0041RegistryReference({
          role: 'runtime-contract',
          baseline: DAC_V0041_BASELINE,
          authorityScope: 'scope/domain-a',
          primaryIdentity: 'target/hint-as-target',
          opaque: {},
        }),
      }),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError &&
      error.code === 'ADVISORY_HINT_NOT_BINDING_TARGET',
  );
});

test('C85 [IMPLEMENTATION_DELTA] stale material input/result classifies STALE at the exactness-currentness phase', () => {
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

test('C86 [CONFORMANCE_ONLY] a request that does not bind the exact DAC/reference profile fails the §8 subject closure', () => {
  const result = verifyDacV0041CompatibilityViewAssociation({
    requestRef: compatibilityFixtures.buildRequestRefWithoutDacProfile(),
    validationView: compatibilityFixtures.buildValidationView(),
    resultView: compatibilityFixtures.buildResultView(),
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
});

// ---------------------------------------------------------------------------
// C87–C88, C97 — capability evaluation / Manifest issuance: NOT_OWNED.
// ---------------------------------------------------------------------------

test('C87 [NOT_OWNED] capability evaluation polarity stays external: only produced-result proves a result exists and refusal stays a separate negative authority decision', () => {
  assert.equal(dacV0041OutcomeProducesResult('produced-result'), true);
  assert.equal(dacV0041OutcomeProducesResult('accepted-for-evaluation'), false);
  assert.equal(dacV0041OutcomeProducesResult('pending/in-progress'), false);
  const refusal = compatibilityFixtures.buildRefusalEvidence();
  const verdict = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({
      refusalEvidence: [refusal],
    }),
  );
  assert.ok(verdict.outcome === 'FAIL_CLOSED');
  assert.equal(verdict.code, 'MATERIAL_REFUSAL_PRESENT');
});

test('C88 [NOT_OWNED] a ManifestIssuanceRequestRef aliasing the Manifest identity is rejected by the frozen anti-alias chain', () => {
  assertAliasRejected(
    adoptDacV0041RegistryReference({
      role: 'manifest-issuance-request',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/app-alpha',
      primaryIdentity: 'manifest/record-1',
      opaque: {},
    }),
    adoptDacV0041RegistryReference({
      role: 'manifest',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/app-alpha',
      primaryIdentity: 'manifest/record-1',
      opaque: {},
    }),
  );
});

// ---------------------------------------------------------------------------
// C89–C96, C98–C100, C105–C106, C108, C113 — the Harness-owned successor
// designation / compatibility / binding authority gates.
// ---------------------------------------------------------------------------

test('C89 [IMPLEMENTATION_DELTA] a CompatibilityValidationRequestRef aliasing a compatibility validation/result view identity is rejected', () => {
  assertAliasRejected(
    compatibilityFixtures.buildRequestRef(),
    adoptDacV0041RegistryReference({
      role: 'compatibility-validation',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/domain-a',
      primaryIdentity: compatibilityFixtures.VIEW.request,
      opaque: {},
    }),
  );
  const result = verifyDacV0041CompatibilityViewAssociation(
    compatibilityFixtures.buildAssociationInput({
      validationView: compatibilityFixtures.buildValidationView({
        validationViewIdentity: compatibilityFixtures.VIEW.request,
      }),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_VIEW_ALIAS');
});

test('C90 [IMPLEMENTATION_DELTA] provider self-designation fails closed at the designation chain', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink(),
        authorityFixtures.buildRootIssuanceLink({
          designatedIssuerIdentity: authorityFixtures.IDENTITY.owner,
        }),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SELF_DESIGNATION');
});

test('C91 [IMPLEMENTATION_DELTA] a designation chain deriving from a Composer-role identity fails closed', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          designatorIdentity: authorityFixtures.IDENTITY.composer,
        }),
        authorityFixtures.buildRootIssuanceLink({
          designatorIdentity: authorityFixtures.IDENTITY.composer,
        }),
      ],
      composerRoleIdentities: [authorityFixtures.IDENTITY.composer],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'COMPOSER_DESIGNATOR');
});

test('C92 [IMPLEMENTATION_DELTA] a co-hosted binding issuer deciding a subject-contributing identity without explicit SoD permission fails closed', () => {
  const result = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      sod: runtimeFixtures.buildSodFacts({
        subjectContributingIdentities: ['id/subject-producer'],
        coHostingGroups: [[runtimeFixtures.IDENTITY.bindingIssuer, 'id/subject-producer']],
        explicitSodPermissionEstablished: false,
        coLocationDisclosed: true,
      }),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SOD_PERMISSION_MISSING');
});

test('C93 [IMPLEMENTATION_DELTA] a co-hosted distinct issuer with explicit SoD permission AND co-location disclosure is allowed', () => {
  const result = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      sod: runtimeFixtures.buildSodFacts({
        subjectContributingIdentities: ['id/subject-producer'],
        coHostingGroups: [[runtimeFixtures.IDENTITY.bindingIssuer, 'id/subject-producer']],
        explicitSodPermissionEstablished: true,
        coLocationDisclosed: true,
      }),
    }),
  );
  assert.equal(result.outcome, 'BINDING_VERIFIED');
});

test('C94 [IMPLEMENTATION_DELTA] a designation link whose effective-from precedes its evidenced issuance point fails closed (no backdating)', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({ effectiveFrom: 19 }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'BACKDATED_EFFECTIVE_FROM');
});

test('C95 [IMPLEMENTATION_DELTA] ordinary expiry is prospective: a chain-current window passes and a post-expiry use is STALE, not rewritten', () => {
  const duringWindow = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(50),
  );
  assert.equal(duringWindow.outcome, 'CHAIN_CURRENT');
  const afterExpiry = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(95),
  );
  assert.ok(afterExpiry.outcome === 'STALE');
  assert.equal(afterExpiry.reason, 'expired');
});

test('C96 [IMPLEMENTATION_DELTA] an authorized retroactive void makes the chain unusable from the void point while history stays untouched', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(70, {
      links: [
        authorityFixtures.buildPromotionLeafLink(),
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
    result.code === 'CHAIN_VOIDED' || result.code === 'VOID_INVALIDATES_DESCENDANT',
  );
});

test('C97 [NOT_OWNED] an omitted unfavorable material invocation cannot close the claim: incomplete disclosure fails closed and a standing refusal blocks the favorable close', () => {
  const intakeResult = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({ refusalDisclosureComplete: false }),
  );
  assert.ok(intakeResult.outcome === 'FAIL_CLOSED');
  assert.equal(intakeResult.code, 'MATERIAL_REFUSAL_OMITTED');
  const precedence = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({
      refusalEvidence: [compatibilityFixtures.buildRefusalEvidence()],
    }),
  );
  assert.ok(precedence.outcome === 'FAIL_CLOSED');
  assert.equal(precedence.code, 'MATERIAL_REFUSAL_PRESENT');
});

test('C98 [IMPLEMENTATION_DELTA] contradictory authoritative compatibility results cannot be resolved by favorable-only selection', () => {
  const verdict = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({
      authoritativeResults: [
        compatibilityFixtures.buildFavorableResult(),
        compatibilityFixtures.buildFavorableResult({
          resultViewIdentity: compatibilityFixtures.VIEW.resultB,
          disposition: 'INCOMPATIBLE',
        }),
      ],
    }),
  );
  assert.ok(verdict.outcome === 'FAIL_CLOSED');
  assert.equal(verdict.code, 'CONTRADICTORY_AUTHORITATIVE_RESULTS');
});

test('C99 [IMPLEMENTATION_DELTA] a Harness binding-time check relied as a compatibility result is rejected as a classification and stays binding-authority evidence', () => {
  const verdict = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({
      bindingTimeCheckReliedAsCompatibilityResult: true,
    }),
  );
  assert.ok(verdict.outcome === 'FAIL_CLOSED');
  assert.equal(verdict.code, 'BINDING_CHECK_MISCLASSIFIED');
});

test('C100 [IMPLEMENTATION_DELTA] a Composer-role identity issuing a RuntimeBindingRef without separate designation fails closed', () => {
  const result = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      bindingIssuer: {
        issuerIdentity: runtimeFixtures.IDENTITY.composer,
        requiredIssuingRole: 'runtime-binding',
        issuerDesignationChain: runtimeFixtures.buildChainInput(
          'link/binding-leaf',
          runtimeFixtures.IDENTITY.composer,
          'runtime-binding',
          70,
          {
            links: [
              runtimeFixtures.buildLeafLink(
                'link/binding-leaf',
                runtimeFixtures.IDENTITY.composer,
                'runtime-binding',
              ),
              runtimeFixtures.buildRootIssuanceLink({
                designatorIdentity: runtimeFixtures.IDENTITY.composer,
              }),
            ],
            // Anchor the Composer identity as scope owner so the failure is
            // attributable to the Composer-role designator bar itself.
            scopeOwnerAnchors: [
              { ownerIdentity: runtimeFixtures.IDENTITY.composer, provedScopes: [runtimeFixtures.SCOPE.app] },
            ],
            composerRoleIdentities: [runtimeFixtures.IDENTITY.composer],
          },
        ),
      },
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_BINDING_ISSUER');
  assert.equal(result.chainCode, 'COMPOSER_DESIGNATOR');
});

// ---------------------------------------------------------------------------
// C101–C104 — AssemblyPlan / brownfield / legacy Domain Data / business
// instance records: NOT_OWNED authority shapes rejected at intake.
// ---------------------------------------------------------------------------

test('C101 [NOT_OWNED] a DomainApplicationAssemblyPlanRef cited as selection authority is rejected at composition intake', () => {
  const assemblyPlan = adoptDacV0041RegistryReference({
    role: 'domain-application-assembly-plan',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/app-alpha',
    primaryIdentity: 'plan/assembly-1',
    opaque: {},
  });
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      selectedDomainData: [
        compositionIntakeFixtures.buildCoverage('subject/selected-alpha', {
          selectionCoverageRef: assemblyPlan,
        }),
        compositionIntakeFixtures.buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('C102 [NOT_OWNED] Harness consumer boundary rejects inferred brownfield promotion authority without an owner-established scope anchor', () => {
  const result = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, { scopeOwnerAnchors: [] }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROOT_ANCHOR_UNESTABLISHED');
});

test('C103 [NOT_OWNED] legacy Domain Data cannot be grandfathered as promoted coverage: it must enter through normal promotion', () => {
  const legacyDomainData = adoptDacV0041RegistryReference({
    role: 'domain-data-revision',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/app-alpha',
    primaryIdentity: 'domain-data/legacy-1',
    opaque: {},
  });
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      selectedDomainData: [
        compositionIntakeFixtures.buildCoverage('subject/selected-alpha', {
          promotionCoverageRef: legacyDomainData,
        }),
        compositionIntakeFixtures.buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('C104 [NOT_OWNED] business instance records are not Domain Data: a non-selected-domain-data subject reference fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      applicationSelection: compositionIntakeFixtures.buildSelectionFacts({
        selectedDomainDataRefs: [
          compositionIntakeFixtures.buildRef('observation', 'subject/selected-alpha'),
        ],
      }),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.ok(result.code === 'ROLE_MISMATCH' || result.code === 'INCOMPLETE_SELECTED_TUPLE');
});

// ---------------------------------------------------------------------------
// C105–C108, C113 — predecessor wrapping, non-designated issuers, the
// C108 Runtime binding anti-alias.
// ---------------------------------------------------------------------------

test('C105 [IMPLEMENTATION_DELTA] an older incompatible DAC ref cannot be consumer-wrapped into successor authority: adoption is required and the predecessor freeze is never the successor pin', () => {
  const classification = classifyDacV0041HistoricAuthorityArtifactUse({
    artifactRef: authorityFixtures.buildHistoricPromotionArtifactRef(),
    historicChainSatisfiesV0041: false,
  });
  assert.equal(classification.outcome, 'ADOPTION_REQUIRED');
  const v004Predecessor = DAC_V0041_PREDECESSOR_BASELINES[1];
  assert.ok(v004Predecessor !== undefined);
  assert.throws(
    () =>
      adoptDacV0041RegistryReference({
        role: 'promotion-decision',
        baseline: v004Predecessor,
        authorityScope: 'scope/domain-a',
        primaryIdentity: 'artifact/wrapped-v004-1',
        opaque: {},
      }),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError && error.code === 'UNSUPPORTED_DAC_BASELINE',
  );
});

test('C106 [IMPLEMENTATION_DELTA] an undesignated semantic issuer cannot drive an authority verdict at a consumed seam', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    compatibilityFixtures.buildAssociationInput({
      validationView: compatibilityFixtures.buildValidationView({
        validatorDesignated: false,
      }),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'NON_DESIGNATED_VALIDATOR');
});

test('C107 [CONFORMANCE_ONLY] compatibility PASS never becomes selection, binding or activation: the bounded verdict and the verified binding both carry the structural non-implication markers', () => {
  const verdict = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts(),
  );
  assert.ok(verdict.outcome === 'COMPATIBLE_VERDICT');
  assert.equal(verdict.boundedToCompatibility, true);
  assert.equal(verdict.impliesApplicationSelection, false);
  assert.equal(verdict.impliesRuntimeBinding, false);
  assert.equal(verdict.impliesRuntimeActivation, false);
  const binding = verifyDacV0041RuntimeBinding(runtimeFixtures.buildValidBindingInput());
  assert.equal(binding.outcome, 'BINDING_VERIFIED');
  assert.equal(binding.impliesRuntimeActivation, false);
  assert.equal(binding.impliesApplicationSelection, false);
  assert.equal(binding.isExternalBusinessSorTruth, false);
});

test('C108 [IMPLEMENTATION_DELTA] a RuntimeBindingRequestRef aliasing a binding or host-binding identity is rejected', () => {
  const request = runtimeFixtures.buildValidBindingInput().bindingRequestRef;
  assert.ok(isRuntimeBindingRequestRef(request));
  assertAliasRejected(
    request,
    adoptDacV0041RegistryReference({
      role: 'runtime-binding',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/app-alpha',
      primaryIdentity: request.primaryIdentity,
      opaque: {},
    }),
  );
  // A binding result aliasing the request identity is rejected at the
  // request/result anti-alias rung of the binding ladder.
  const result = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      bindingResultRef: runtimeFixtures.buildRef('runtime-binding', 'request/binding-1'),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_RESULT_ALIAS');
});

test('C113 [IMPLEMENTATION_DELTA] an issuer lacking valid in-scope designation cannot emit a consumed authority result', () => {
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

// ---------------------------------------------------------------------------
// C109–C110, C114–C115 — request/verdict/authoring anti-alias and
// superseded-plan currentness (registry-authority boundaries).
// ---------------------------------------------------------------------------

test('C109 [NOT_OWNED] an AuthorityDesignationRequestRef aliasing the designation result is rejected by the frozen chain', () => {
  assertAliasRejected(
    adoptDacV0041RegistryReference({
      role: 'authority-designation-request',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/domain-a',
      primaryIdentity: 'designation/root-1',
      opaque: {},
    }),
    adoptDacV0041RegistryReference({
      role: 'authority-designation',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/domain-a',
      primaryIdentity: 'designation/root-1',
      opaque: {},
    }),
  );
});

test('C110 [NOT_OWNED] a ConformanceRequestRef aliasing the conformance verdict is rejected by the frozen chain', () => {
  assertAliasRejected(
    adoptDacV0041RegistryReference({
      role: 'conformance-request',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/domain-a',
      primaryIdentity: 'verdict/conformance-1',
      opaque: {},
    }),
    adoptDacV0041RegistryReference({
      role: 'conformance-verdict',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/domain-a',
      primaryIdentity: 'verdict/conformance-1',
      opaque: {},
    }),
  );
});

test('C114 [NOT_OWNED] a DomainAuthoringRequestRef aliased to an authored/evolved candidate identity is rejected by the frozen chain', () => {
  assertAliasRejected(
    adoptDacV0041RegistryReference({
      role: 'domain-authoring-request',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/domain-a',
      primaryIdentity: 'authored/candidate-1',
      opaque: {},
    }),
    adoptDacV0041RegistryReference({
      role: 'authored-candidate',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/domain-a',
      primaryIdentity: 'authored/candidate-1',
      opaque: {},
    }),
  );
});

test('C115 [NOT_OWNED] a superseded AssemblyPlan is STALE for authoritative handoff and cannot be silently reused', () => {
  assert.deepEqual(classifyDacV0041CurrentnessUse('superseded'), {
    state: 'superseded',
    disposition: 'STALE',
  });
});

// ---------------------------------------------------------------------------
// C116–C117 — external promotion currentness consumption boundary; the
// alias-resolution positive path. Promotion issuance/currentness remains
// NOT_OWNED even though Harness intake fails closed when it is revoked.
// ---------------------------------------------------------------------------

test('C116 [NOT_OWNED] Harness consumer boundary rejects a revoked external PromotionDecisionRef carried into authoritative intake', () => {
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      selectedDomainData: [
        compositionIntakeFixtures.buildCoverage('subject/selected-alpha', {
          promotionCurrentness: 'revoked',
        }),
        compositionIntakeFixtures.buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'COVERAGE_INVALIDATED');
});

test('C117 [NOT_OWNED] alias-resolution positive path: a mutable alias is refused, the exact identity resolves and stays pinned', () => {
  assert.throws(
    () =>
      adoptDacV0041RegistryReference({
        role: 'promotion-decision',
        baseline: DAC_V0041_BASELINE,
        authorityScope: 'scope/domain-a',
        primaryIdentity: 'head',
        opaque: {},
      }),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError && error.code === 'MUTABLE_ALIAS_REJECTED',
  );
  const resolved = adoptDacV0041RegistryReference({
    role: 'promotion-decision',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity: 'promotion/exact-1',
    opaque: {},
  });
  assert.equal(resolved.primaryIdentity, 'promotion/exact-1');
  assert.ok(Object.isFrozen(resolved));
  const repinned = adoptDacV0041RegistryReference({
    role: 'promotion-decision',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity: 'promotion/exact-1',
    opaque: {},
  });
  assert.notEqual(resolved, repinned);
  assert.equal(resolved.primaryIdentity, repinned.primaryIdentity);
});

// ---------------------------------------------------------------------------
// C111–C112 — the complete greenfield / brownfield flows (compact matrix
// anchors; C112 invokes the SAME test-local connected brownfield orchestrator
// used by the dedicated positive journey and root closure anchor).
// ---------------------------------------------------------------------------

test('C111 [CONFORMANCE_ONLY] a complete greenfield flow preserves every authority/identity seam end to end', () => {
  const bindingInput = runtimeFixtures.buildValidBindingInput();
  const intake = verifyDacV0041CompositionIntake(bindingInput.compositionIntake);
  assert.equal(intake.outcome, 'INTAKE_VERIFIED');
  const association = verifyDacV0041CompatibilityViewAssociation({
    requestRef: bindingInput.compatibility.requestRef,
    validationView: bindingInput.compatibility.validationView,
    resultView: bindingInput.compatibility.resultView,
  });
  assert.equal(association.outcome, 'VALID_TWO_VIEW');
  const verdict = classifyDacV0041CompatibilityPrecedence(
    bindingInput.compatibility.precedenceFacts,
  );
  assert.equal(verdict.outcome, 'COMPATIBLE_VERDICT');
  const binding = verifyDacV0041RuntimeBinding(bindingInput);
  assert.equal(binding.outcome, 'BINDING_VERIFIED');
  assert.equal(binding.manifestIdentity, intake.manifestIdentity);
  assert.ok(isRuntimeBindingRequestRef(bindingInput.bindingRequestRef));
  assert.equal(binding.requestIdentity, bindingInput.bindingRequestRef.primaryIdentity);
});

test('C112 [CONFORMANCE_ONLY] the complete brownfield flow carries the exact adopted subject through successor promotion coverage and downstream intake', () => {
  const journey = runDacV0041BrownfieldConnectedJourney();
  assert.equal(journey.outcome, 'PASS');
  assert.equal(journey.historicUse.outcome, 'ADOPTION_REQUIRED');
  assert.equal(journey.adoption.outcome, 'ADOPTED_PROSPECTIVE');
  assert.equal(journey.adoption.effectiveFrom, 60);
  const adoptedCoverage = journey.bindingInput.compositionIntake.selectedDomainData[0];
  assert.ok(adoptedCoverage !== undefined);
  assert.equal(adoptedCoverage.promotionCoverageRef, journey.successorPromotion);
  assert.equal(
    adoptedCoverage.promotionCoverageRef.primaryIdentity,
    journey.historicArtifact.primaryIdentity,
  );
  assert.equal(journey.intake.outcome, 'INTAKE_VERIFIED');
});
