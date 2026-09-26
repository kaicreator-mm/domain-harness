// Issue #356 / A41-002 — shared deterministic fixtures for the focused
// authority verifier suites. Pure data builders over the A41-001 foundation;
// every adversarial variation is expressed as an explicit override so each
// test's facts stay fully recoverable.
import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_BASELINES,
  adoptDacV0041RegistryReference,
  type DacV0041PredecessorBaseline,
  type DacV0041Reference,
  type DacV0041RegistryRole,
} from '../../src/dac-v0041/index.js';
import {
  DAC_V0041_DESIGNATION_ISSUANCE_ROLE,
  type DacV0041AuthorityAdoptionFacts,
  type DacV0041DesignationChainInput,
  type DacV0041DesignationLinkFacts,
  type DacV0041EndActFacts,
} from '../../src/dac-v0041/authority/index.js';

export const IDENTITY = {
  owner: 'id/owner-scope-a',
  ownerB: 'id/owner-scope-b',
  delegate: 'id/delegate-a',
  midDelegate: 'id/delegate-c',
  promoter: 'id/promoter-b',
  promoterC: 'id/promoter-c',
  dualRole: 'id/dual-role',
  witness: 'id/registry-witness',
  outsider: 'id/outsider',
  composer: 'id/composer-x',
} as const;

export const SCOPE = {
  domainA: 'scope/domain-a',
  domainB: 'scope/domain-b',
} as const;

export const PROFILE = {
  v0041a: 'dac-profile/v0041-a',
  other: 'dac-profile/other',
  v003: 'dac-profile/v003-a',
} as const;

export const CONSTRAINT = {
  tenantAlpha: 'constraint/tenant-alpha-only',
  euOnly: 'constraint/eu-region-only',
} as const;

export const SOD_PERMISSION = {
  cohostComposer: 'sod/cohost-composer',
  admin: 'sod/admin',
} as const;

/** Owner-rooted designation-issuance link (depth 1 by default). */
export function buildRootIssuanceLink(
  overrides: Partial<DacV0041DesignationLinkFacts> = {},
): DacV0041DesignationLinkFacts {
  return {
    linkIdentity: 'link/root-iss',
    designatorIdentity: IDENTITY.owner,
    designatedIssuerIdentity: IDENTITY.delegate,
    authorityRole: DAC_V0041_DESIGNATION_ISSUANCE_ROLE,
    authorityScope: SCOPE.domainA,
    dacProfileIdentity: PROFILE.v0041a,
    holderConstraints: [],
    sodPermissions: [],
    effectiveFrom: 10,
    declaredEffectiveEnd: 100,
    issuanceEvidence: { point: 10, assertedBy: [IDENTITY.witness] },
    delegationEnvelope: {
      delegableRoles: [
        'promotion',
        'selection',
        'compatibility-validation',
        'runtime-binding',
        'external-authority',
        DAC_V0041_DESIGNATION_ISSUANCE_ROLE,
      ],
      delegableScopes: [SCOPE.domainA],
      mandatoryConstraints: [CONSTRAINT.tenantAlpha],
      permittedDacProfiles: [PROFILE.v0041a],
      delegableSodPermissions: [SOD_PERMISSION.cohostComposer],
      redelegationDepth: 1,
    },
    ...overrides,
  };
}

/** Depth-1 delegated promotion grant (the C132/C146 workhorse leaf). */
export function buildPromotionLeafLink(
  overrides: Partial<DacV0041DesignationLinkFacts> = {},
): DacV0041DesignationLinkFacts {
  return {
    linkIdentity: 'link/promotion-b',
    designatorIdentity: IDENTITY.delegate,
    designatedIssuerIdentity: IDENTITY.promoter,
    authorityRole: 'promotion',
    authorityScope: SCOPE.domainA,
    dacProfileIdentity: PROFILE.v0041a,
    holderConstraints: [CONSTRAINT.tenantAlpha],
    sodPermissions: [],
    effectiveFrom: 20,
    declaredEffectiveEnd: 90,
    issuanceEvidence: { point: 20, assertedBy: [IDENTITY.witness] },
    parentLinkIdentity: 'link/root-iss',
    ...overrides,
  };
}

/** Owner-direct designation of a promotion issuer (C131 single-link chain). */
export function buildOwnerDirectPromotionLink(
  overrides: Partial<DacV0041DesignationLinkFacts> = {},
): DacV0041DesignationLinkFacts {
  return {
    linkIdentity: 'link/owner-direct-promotion',
    designatorIdentity: IDENTITY.owner,
    designatedIssuerIdentity: IDENTITY.promoter,
    authorityRole: 'promotion',
    authorityScope: SCOPE.domainA,
    dacProfileIdentity: PROFILE.v0041a,
    holderConstraints: [CONSTRAINT.tenantAlpha],
    sodPermissions: [],
    effectiveFrom: 15,
    declaredEffectiveEnd: 100,
    issuanceEvidence: { point: 15, assertedBy: [IDENTITY.witness] },
    ...overrides,
  };
}

/** Middle designation-issuance link for the C159 depth-1 chain. */
export function buildMiddleIssuanceLink(
  overrides: Partial<DacV0041DesignationLinkFacts> = {},
): DacV0041DesignationLinkFacts {
  return {
    linkIdentity: 'link/mid-iss',
    designatorIdentity: IDENTITY.delegate,
    designatedIssuerIdentity: IDENTITY.midDelegate,
    authorityRole: DAC_V0041_DESIGNATION_ISSUANCE_ROLE,
    authorityScope: SCOPE.domainA,
    dacProfileIdentity: PROFILE.v0041a,
    holderConstraints: [CONSTRAINT.tenantAlpha],
    sodPermissions: [],
    effectiveFrom: 20,
    declaredEffectiveEnd: 95,
    issuanceEvidence: { point: 20, assertedBy: [IDENTITY.witness] },
    parentLinkIdentity: 'link/root-iss',
    delegationEnvelope: {
      delegableRoles: ['promotion', DAC_V0041_DESIGNATION_ISSUANCE_ROLE],
      delegableScopes: [SCOPE.domainA],
      mandatoryConstraints: [CONSTRAINT.tenantAlpha],
      permittedDacProfiles: [PROFILE.v0041a],
      delegableSodPermissions: [SOD_PERMISSION.cohostComposer],
      redelegationDepth: 0,
    },
    ...overrides,
  };
}

/** Deepest promotion grant under the middle link (C159 grandchild). */
export function buildGrandchildPromotionLink(
  overrides: Partial<DacV0041DesignationLinkFacts> = {},
): DacV0041DesignationLinkFacts {
  return {
    linkIdentity: 'link/grandchild-promotion',
    designatorIdentity: IDENTITY.midDelegate,
    designatedIssuerIdentity: IDENTITY.promoterC,
    authorityRole: 'promotion',
    authorityScope: SCOPE.domainA,
    dacProfileIdentity: PROFILE.v0041a,
    holderConstraints: [CONSTRAINT.tenantAlpha],
    sodPermissions: [],
    effectiveFrom: 30,
    declaredEffectiveEnd: 85,
    issuanceEvidence: { point: 30, assertedBy: [IDENTITY.witness] },
    parentLinkIdentity: 'link/mid-iss',
    ...overrides,
  };
}

/** Standard two-link chain input (root issuance + promotion leaf). */
export function buildPromotionChainInput(
  evaluationPoint: number,
  overrides: Partial<DacV0041DesignationChainInput> = {},
): DacV0041DesignationChainInput {
  return {
    links: [buildPromotionLeafLink(), buildRootIssuanceLink()],
    leafLinkIdentity: 'link/promotion-b',
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] },
    ],
    evaluationPoint,
    ...overrides,
  };
}

/** Three-link depth-1 chain input (C159). Root depth must be >= 2. */
export function buildDepthOneChainInput(
  evaluationPoint: number,
  overrides: Partial<DacV0041DesignationChainInput> = {},
): DacV0041DesignationChainInput {
  return {
    links: [
      buildGrandchildPromotionLink(),
      buildMiddleIssuanceLink(),
      buildRootIssuanceLink({
        declaredEffectiveEnd: 100,
        delegationEnvelope: {
          delegableRoles: ['promotion', DAC_V0041_DESIGNATION_ISSUANCE_ROLE],
          delegableScopes: [SCOPE.domainA],
          mandatoryConstraints: [CONSTRAINT.tenantAlpha],
          permittedDacProfiles: [PROFILE.v0041a],
          delegableSodPermissions: [SOD_PERMISSION.cohostComposer],
          redelegationDepth: 2,
        },
      }),
    ],
    leafLinkIdentity: 'link/grandchild-promotion',
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.domainA] },
    ],
    evaluationPoint,
    ...overrides,
  };
}

/** Well-formed end act against a target link. */
export function buildEndAct(
  overrides: Partial<DacV0041EndActFacts> = {},
): DacV0041EndActFacts {
  return {
    actIdentity: 'act/end-1',
    kind: 'prospective-revocation',
    issuerIdentity: IDENTITY.owner,
    issuanceEvidence: { point: 70, assertedBy: [IDENTITY.witness] },
    effectivePoint: 70,
    ...overrides,
  };
}

/** Exact historic v0.0.3-origin artifact reference of the given registry role. */
export function buildHistoricArtifactRef(
  role: DacV0041RegistryRole,
  authorityScope: string = SCOPE.domainA,
): DacV0041Reference {
  const v003Predecessor = DAC_V0041_PREDECESSOR_BASELINES[0] as DacV0041PredecessorBaseline;
  return adoptDacV0041RegistryReference({
    role,
    baseline: DAC_V0041_BASELINE,
    authorityScope,
    primaryIdentity: `artifact/historic-${role}-v003-1`,
    predecessorOrigin: v003Predecessor,
    opaque: {},
  });
}

/** Exact historic v0.0.3-origin promotion-decision artifact reference. */
export function buildHistoricPromotionArtifactRef(): DacV0041Reference {
  return buildHistoricArtifactRef('promotion-decision');
}

/** Valid adoption fact set for the C146/C165 positive path. */
export function buildValidAdoptionFacts(
  overrides: Partial<DacV0041AuthorityAdoptionFacts> = {},
): DacV0041AuthorityAdoptionFacts {
  return {
    adoptionActIdentity: 'adoption/act-1',
    adoptionIssuerIdentity: IDENTITY.promoter,
    adoptedArtifactClass: 'promotion-decision',
    adoptedArtifactRef: buildHistoricPromotionArtifactRef(),
    originDacProfileIdentity: PROFILE.v003,
    requiredIssuingRole: 'promotion',
    issuerDesignationChain: buildPromotionChainInput(60),
    issuanceEvidence: { point: 60, assertedBy: [IDENTITY.witness] },
    reEvaluation: {
      sourceAuthenticityEstablished: true,
      sourceProvenanceRecoverable: true,
      subjectExactnessEstablished: true,
      sourceCurrentnessEstablished: true,
      evidenceClosureRecoverable: true,
      classSpecificObligationsSatisfied: true,
    },
    subjectConstraintTokens: [CONSTRAINT.tenantAlpha],
    adoptionDacProfileIdentity: PROFILE.v0041a,
    sodReliedPermissions: [],
    classPreconditions: {},
    ...overrides,
  };
}
