// Issue #399 / A41-006R1 — test-only connected brownfield conformance journey.
//
// This helper is deliberately outside production source. It sequences the real
// successor classifiers/verifiers while preserving the A41-004 boundary:
// AuthorityAdoption is a separate A41-002 path and composition intake consumes
// only successor-native externally issued authority evidence. The transition
// between those seams is therefore an explicit TEST-LEVEL continuity gate; it
// does not mint product authority or make intake consume AuthorityAdoptionRef.
import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_BASELINES,
  adoptDacV0041RegistryReference,
} from '../../src/dac-v0041/index.js';
import {
  DAC_V0041_DESIGNATION_ISSUANCE_ROLE,
  classifyDacV0041HistoricAuthorityArtifactUse,
  verifyDacV0041AuthorityAdoption,
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

export type DacV0041BrownfieldJourneyStage =
  | 'historic-use'
  | 'adoption'
  | 'transition'
  | 'intake'
  | 'compatibility'
  | 'binding'
  | 'activation'
  | 'consequence';

export interface DacV0041BrownfieldJourneyOptions {
  readonly successorPrimaryIdentity?: string;
  readonly successorScope?: string;
  /**
   * Test-level evidence point at which the externally issued successor
   * PromotionDecisionRef becomes available for authoritative successor use.
   */
  readonly successorAuthorityPoint?: number;
  readonly adoption?: Partial<Parameters<typeof verifyDacV0041AuthorityAdoption>[0]>;
}

const ADOPTION_POINT = 60;
const ACTIVATION_POINT = 85;
const ADOPTED_SUBJECT_IDENTITY = runtimeFixtures.SUBJECTS[0];
const PROMOTION_PRIMARY_IDENTITY = `promotion/${ADOPTED_SUBJECT_IDENTITY}`;

function fail(stage: DacV0041BrownfieldJourneyStage, code: string) {
  return { outcome: 'FAIL_CLOSED', stage, code } as const;
}

function resultCode(value: unknown, fallback: string): string {
  if (value !== null && typeof value === 'object') {
    if ('code' in value && typeof (value as { code?: unknown }).code === 'string') {
      return (value as { code: string }).code;
    }
    if ('outcome' in value && typeof (value as { outcome?: unknown }).outcome === 'string') {
      return (value as { outcome: string }).outcome;
    }
  }
  return fallback;
}

/**
 * Runs one exact brownfield authority subject through the whole successor
 * conformance chain. The same `bindingInput` produced after the adoption /
 * successor-evidence continuity gate is consumed by intake, compatibility,
 * Runtime binding and Runtime activation; a failed stage returns immediately.
 */
export function runDacV0041BrownfieldConnectedJourney(
  options: DacV0041BrownfieldJourneyOptions = {},
) {
  const predecessor = DAC_V0041_PREDECESSOR_BASELINES[0];
  if (predecessor === undefined) {
    return fail('historic-use', 'PREDECESSOR_EVIDENCE_MISSING');
  }

  // Historic v0.0.3-origin authority for the SAME selected subject that will
  // later be represented by externally issued successor-native promotion
  // evidence. This exact ref is never passed directly to composition intake.
  const historicArtifact = adoptDacV0041RegistryReference({
    role: 'promotion-decision',
    baseline: DAC_V0041_BASELINE,
    authorityScope: runtimeFixtures.SCOPE.app,
    primaryIdentity: PROMOTION_PRIMARY_IDENTITY,
    contractProfileIdentity: authorityFixtures.PROFILE.v003,
    predecessorOrigin: predecessor,
    opaque: {},
  });

  const historicUse = classifyDacV0041HistoricAuthorityArtifactUse({
    artifactRef: historicArtifact,
    historicChainSatisfiesV0041: false,
  });
  if (historicUse.outcome !== 'ADOPTION_REQUIRED') {
    return fail('historic-use', resultCode(historicUse, 'ADOPTION_NOT_REQUIRED'));
  }

  // A test-specific app-scope promotion chain. The root envelope explicitly
  // delegates `promotion`; the ordinary Runtime root fixture intentionally
  // does not, so using it unchanged would make the adoption fixture invalid.
  const promotionRoot = runtimeFixtures.buildRootIssuanceLink({
    delegationEnvelope: {
      delegableRoles: ['promotion', DAC_V0041_DESIGNATION_ISSUANCE_ROLE],
      delegableScopes: [runtimeFixtures.SCOPE.app],
      mandatoryConstraints: [],
      permittedDacProfiles: [runtimeFixtures.PROFILE.v0041],
      delegableSodPermissions: [],
      redelegationDepth: 1,
    },
  });
  const promotionLeaf = runtimeFixtures.buildLeafLink(
    'link/brownfield-promotion-leaf',
    authorityFixtures.IDENTITY.promoter,
    'promotion',
    {
      authorityScope: runtimeFixtures.SCOPE.app,
      dacProfileIdentity: runtimeFixtures.PROFILE.v0041,
      holderConstraints: [],
      sodPermissions: [],
    },
  );
  const promotionChain = runtimeFixtures.buildChainInput(
    'link/brownfield-promotion-leaf',
    authorityFixtures.IDENTITY.promoter,
    'promotion',
    ADOPTION_POINT,
    { links: [promotionLeaf, promotionRoot] },
  );

  const adoptionFacts = authorityFixtures.buildValidAdoptionFacts({
    adoptionActIdentity: 'adoption/promotion-alpha-1',
    adoptionIssuerIdentity: authorityFixtures.IDENTITY.promoter,
    adoptedArtifactClass: 'promotion-decision',
    adoptedArtifactRef: historicArtifact,
    originDacProfileIdentity: authorityFixtures.PROFILE.v003,
    requiredIssuingRole: 'promotion',
    issuerDesignationChain: promotionChain,
    issuanceEvidence: {
      point: ADOPTION_POINT,
      assertedBy: [runtimeFixtures.IDENTITY.witness],
    },
    subjectConstraintTokens: [],
    adoptionDacProfileIdentity: runtimeFixtures.PROFILE.v0041,
    sodReliedPermissions: [],
    classPreconditions: {},
    ...(options.adoption ?? {}),
  });

  // Prevent an override from silently turning the adoption check into a
  // different source artifact while downstream still uses this journey's
  // historic subject.
  if (adoptionFacts.adoptedArtifactRef !== historicArtifact) {
    return fail('transition', 'ADOPTION_SOURCE_CONTINUITY_MISMATCH');
  }

  const adoption = verifyDacV0041AuthorityAdoption(adoptionFacts);
  if (adoption.outcome !== 'ADOPTED_PROSPECTIVE') {
    return fail('adoption', resultCode(adoption, 'ADOPTION_FAILED'));
  }

  // Externally issued successor representation AFTER the valid adoption. It
  // is successor-native: no predecessorOrigin wrapper is carried forward.
  const successorPromotion = runtimeFixtures.buildRef(
    'promotion-decision',
    options.successorPrimaryIdentity ?? historicArtifact.primaryIdentity,
    {
      authorityScope: options.successorScope ?? historicArtifact.authorityScope,
      contractProfileIdentity: runtimeFixtures.PROFILE.v0041,
    },
  );
  const successorAuthorityPoint =
    options.successorAuthorityPoint ?? adoption.newAuthoritativeIssuancePoint;

  // Test-only adoption -> successor evidence continuity gate. This proves the
  // external successor representation is for the SAME adopted authority
  // class, exact primary subject identity and scope, and cannot become usable
  // before adoption issuance/effect. It does not issue authority itself.
  if (
    successorPromotion.role !== adoptionFacts.adoptedArtifactClass ||
    successorPromotion.primaryIdentity !== historicArtifact.primaryIdentity ||
    successorPromotion.authorityScope !== historicArtifact.authorityScope ||
    successorAuthorityPoint < adoption.newAuthoritativeIssuancePoint ||
    successorAuthorityPoint < adoption.effectiveFrom
  ) {
    return fail('transition', 'ADOPTION_SUCCESSOR_CONTINUITY_MISMATCH');
  }

  // Build one implementation-specific §11 Runtime bundle, then replace only
  // the adopted subject's promotion coverage with the exact successor ref.
  // All downstream stages consume this same bindingInput object graph.
  const activationCoveringCurrentness = {
    state: 'current' as const,
    establishedAt: ACTIVATION_POINT,
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
  const base = runtimeFixtures.buildValidBindingInput({
    implementation,
    hostBindings: [hostBinding],
  });
  const compositionIntake = {
    ...base.compositionIntake,
    selectedDomainData: base.compositionIntake.selectedDomainData.map((coverage, index) =>
      index === 0 ? { ...coverage, promotionCoverageRef: successorPromotion } : coverage,
    ),
  };
  const bindingInput = { ...base, compositionIntake };

  const intake = verifyDacV0041CompositionIntake(bindingInput.compositionIntake);
  if (intake.outcome !== 'INTAKE_VERIFIED') {
    return fail('intake', resultCode(intake, 'INTAKE_FAILED'));
  }

  const association = verifyDacV0041CompatibilityViewAssociation({
    requestRef: bindingInput.compatibility.requestRef,
    validationView: bindingInput.compatibility.validationView,
    resultView: bindingInput.compatibility.resultView,
  });
  if (association.outcome !== 'VALID_TWO_VIEW') {
    return fail('compatibility', resultCode(association, 'ASSOCIATION_FAILED'));
  }

  const compatibilityVerdict = classifyDacV0041CompatibilityPrecedence(
    bindingInput.compatibility.precedenceFacts,
  );
  if (compatibilityVerdict.outcome !== 'COMPATIBLE_VERDICT') {
    return fail(
      'compatibility',
      resultCode(compatibilityVerdict, 'COMPATIBILITY_FAILED'),
    );
  }

  const binding = verifyDacV0041RuntimeBinding(bindingInput);
  if (binding.outcome !== 'BINDING_VERIFIED') {
    return fail('binding', resultCode(binding, 'BINDING_FAILED'));
  }

  const activation = verifyDacV0041RuntimeActivation(
    runtimeFixtures.buildValidActivationInput({ binding: bindingInput }),
  );
  if (activation.outcome !== 'ACTIVATION_VERIFIED') {
    return fail('activation', resultCode(activation, 'ACTIVATION_FAILED'));
  }

  const runtimeConsequence = classifyDacV0041BusinessSorTruthSource({
    presentedStateClass: 'activation-state',
  });
  const externalConsequence = classifyDacV0041BusinessSorTruthSource({
    presentedStateClass: 'external-sor-reconciliation',
  });
  if (
    runtimeConsequence.outcome !== 'RUNTIME_STATE_NOT_SOR_TRUTH' ||
    externalConsequence.outcome !== 'EXTERNAL_SOR_EVIDENCE_ONLY'
  ) {
    return fail('consequence', 'BUSINESS_SOR_BOUNDARY_MISMATCH');
  }

  return {
    outcome: 'PASS',
    historicUse,
    historicArtifact,
    adoption,
    successorPromotion,
    successorAuthorityPoint,
    bindingInput,
    intake,
    association,
    compatibilityVerdict,
    binding,
    activation,
    runtimeConsequence,
    externalConsequence,
  } as const;
}
