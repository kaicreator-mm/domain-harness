// Issue #358 / A41-004 — shared deterministic fixtures for the focused
// composition-intake suites. Pure data builders over the A41-001 foundation
// and the A41-002 designation-chain fact shapes; every adversarial
// variation is expressed as an explicit override so each test's facts stay
// fully recoverable.
import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_BASELINES,
  adoptDacV0041RegistryReference,
  mintRuntimeBindingRequestRef,
  type DacV0041PredecessorBaseline,
  type DacV0041Reference,
} from '../../src/dac-v0041/index.js';
import {
  DAC_V0041_DESIGNATION_ISSUANCE_ROLE,
  type DacV0041DesignationChainInput,
  type DacV0041DesignationLinkFacts,
} from '../../src/dac-v0041/authority/index.js';
import type {
  DacV0041ApplicationSelectionFacts,
  DacV0041AuthorityRefusalFacts,
  DacV0041CompositionIntakeInput,
  DacV0041IdentityEstablishmentFacts,
  DacV0041ManifestEvidenceFacts,
  DacV0041RequestlessInitiationEvidence,
  DacV0041ReuseCurrentnessFacts,
  DacV0041SelectedDomainDataFacts,
} from '../../src/dac-v0041/composition-intake/index.js';

export const IDENTITY = {
  owner: 'id/owner-scope-a',
  delegate: 'id/delegate-a',
  establishmentIssuer: 'id/establishment-issuer',
  selectionIssuer: 'id/selection-issuer',
  manifestIssuer: 'id/manifest-issuer',
  refusingIssuer: 'id/binding-refuser',
  witness: 'id/registry-witness',
  composer: 'id/composer-x',
  outsider: 'id/outsider',
} as const;

export const SCOPE = {
  app: 'scope/app-alpha',
  other: 'scope/app-beta',
} as const;

export const PROFILE = {
  v0041: 'dac-profile/v0041-a',
  other: 'dac-profile/other',
  v003: 'dac-profile/v003-a',
} as const;

export const ROLE = {
  establishment: 'application-identity-establishment',
  selection: 'application-selection',
  manifestIssuance: 'manifest-issuance',
  runtimeBinding: 'runtime-binding',
} as const;

const DELEGABLE_ROLES = [
  ROLE.establishment,
  ROLE.selection,
  ROLE.manifestIssuance,
  ROLE.runtimeBinding,
] as const;

/** Owner-rooted designation-issuance link covering every intake role. */
export function buildRootIssuanceLink(
  overrides: Partial<DacV0041DesignationLinkFacts> = {},
): DacV0041DesignationLinkFacts {
  return {
    linkIdentity: 'link/root-iss',
    designatorIdentity: IDENTITY.owner,
    designatedIssuerIdentity: IDENTITY.delegate,
    authorityRole: DAC_V0041_DESIGNATION_ISSUANCE_ROLE,
    authorityScope: SCOPE.app,
    dacProfileIdentity: PROFILE.v0041,
    holderConstraints: [],
    sodPermissions: [],
    effectiveFrom: 10,
    declaredEffectiveEnd: 100,
    issuanceEvidence: { point: 10, assertedBy: [IDENTITY.witness] },
    delegationEnvelope: {
      delegableRoles: [...DELEGABLE_ROLES],
      delegableScopes: [SCOPE.app],
      mandatoryConstraints: [],
      permittedDacProfiles: [PROFILE.v0041],
      delegableSodPermissions: [],
      redelegationDepth: 1,
    },
    ...overrides,
  };
}

/** Delegated leaf grant for one intake issuing role. */
export function buildLeafLink(
  linkIdentity: string,
  designatedIssuerIdentity: string,
  authorityRole: string,
  overrides: Partial<DacV0041DesignationLinkFacts> = {},
): DacV0041DesignationLinkFacts {
  return {
    linkIdentity,
    designatorIdentity: IDENTITY.delegate,
    designatedIssuerIdentity,
    authorityRole,
    authorityScope: SCOPE.app,
    dacProfileIdentity: PROFILE.v0041,
    holderConstraints: [],
    sodPermissions: [],
    effectiveFrom: 20,
    declaredEffectiveEnd: 95,
    issuanceEvidence: { point: 20, assertedBy: [IDENTITY.witness] },
    parentLinkIdentity: 'link/root-iss',
    ...overrides,
  };
}

/** Valid two-link chain input for one intake role at an evaluation point. */
export function buildChainInput(
  linkIdentity: string,
  designatedIssuerIdentity: string,
  authorityRole: string,
  evaluationPoint: number,
  overrides: Partial<DacV0041DesignationChainInput> = {},
): DacV0041DesignationChainInput {
  return {
    links: [
      buildLeafLink(linkIdentity, designatedIssuerIdentity, authorityRole),
      buildRootIssuanceLink(),
    ],
    leafLinkIdentity: linkIdentity,
    scopeOwnerAnchors: [
      { ownerIdentity: IDENTITY.owner, provedScopes: [SCOPE.app] },
    ],
    evaluationPoint,
    ...overrides,
  };
}

/** Mint a successor evidence reference of the given registry role. */
export function buildRef(
  role: string,
  primaryIdentity: string,
  overrides: {
    authorityScope?: string;
    semanticIdentity?: string;
    revisionIdentity?: string;
    contentDigest?: string;
    predecessorOrigin?: DacV0041PredecessorBaseline;
  } = {},
): DacV0041Reference {
  return adoptDacV0041RegistryReference({
    role: role as Parameters<typeof adoptDacV0041RegistryReference>[0]['role'],
    baseline: DAC_V0041_BASELINE,
    authorityScope: overrides.authorityScope ?? SCOPE.app,
    primaryIdentity,
    ...(overrides.semanticIdentity === undefined
      ? {}
      : { semanticIdentity: overrides.semanticIdentity }),
    ...(overrides.revisionIdentity === undefined
      ? {}
      : { revisionIdentity: overrides.revisionIdentity }),
    ...(overrides.contentDigest === undefined
      ? {}
      : { contentDigest: overrides.contentDigest }),
    ...(overrides.predecessorOrigin === undefined
      ? {}
      : { predecessorOrigin: overrides.predecessorOrigin }),
    opaque: {},
  });
}

/** The exact frozen v0.0.3 predecessor baseline (wrap-negatives only). */
export function v003Predecessor(): DacV0041PredecessorBaseline {
  return DAC_V0041_PREDECESSOR_BASELINES[0] as DacV0041PredecessorBaseline;
}

export const SUBJECTS = ['subject/selected-alpha', 'subject/selected-beta'] as const;

/** Default §8.2 current-authoritative-reuse determination (covers point 60). */
export function buildReuseCurrentness(
  overrides: Partial<DacV0041ReuseCurrentnessFacts> = {},
): DacV0041ReuseCurrentnessFacts {
  return {
    state: 'current',
    establishedAt: 60,
    assertedBy: [IDENTITY.witness],
    ...overrides,
  };
}

/**
 * Valid F-04 §4.1 requestless initiation record (externally recoverable):
 * minted `evidence`-role reference bound to the establishment application
 * scope, initiating subject, evidenced issuer covered by the attested
 * provenance, provenance strictly before the establishment issuance (30).
 */
export function buildRequestlessInitiation(
  overrides: Partial<DacV0041RequestlessInitiationEvidence> = {},
): DacV0041RequestlessInitiationEvidence {
  return {
    initiationRef: buildRef('evidence', 'initiation/establishment-1'),
    initiatedBy: 'id/app-initiator',
    initiationIssuerIdentity: IDENTITY.witness,
    initiationProvenance: { point: 28, assertedBy: [IDENTITY.witness] },
    ...overrides,
  };
}

/** Valid establishment facts (issued at point 30, request seam). */
export function buildEstablishmentFacts(
  overrides: Partial<DacV0041IdentityEstablishmentFacts> = {},
): DacV0041IdentityEstablishmentFacts {
  return {
    establishmentRef: buildRef(ROLE.establishment, 'establishment/record-1'),
    establishmentRequestRef: buildRef(
      'application-identity-establishment-request',
      'request/establishment-1',
    ),
    applicationSemanticIdentityRef: buildRef('application-semantic', 'app/semantic-alpha'),
    issuerIdentity: IDENTITY.establishmentIssuer,
    issuerDesignationChain: buildChainInput(
      'link/establishment-leaf',
      IDENTITY.establishmentIssuer,
      ROLE.establishment,
      30,
    ),
    requiredIssuingRole: ROLE.establishment,
    applicationScope: SCOPE.app,
    dacProfileIdentity: PROFILE.v0041,
    issuanceEvidence: { point: 30, assertedBy: [IDENTITY.witness] },
    ...overrides,
  };
}

/** Valid selection facts (issued at point 40, after establishment). */
export function buildSelectionFacts(
  overrides: Partial<DacV0041ApplicationSelectionFacts> = {},
): DacV0041ApplicationSelectionFacts {
  return {
    selectionRef: buildRef(ROLE.selection, 'selection/record-1'),
    applicationSemanticIdentityRef: buildRef('application-semantic', 'app/semantic-alpha'),
    selectedDomainDataRefs: SUBJECTS.map((subject) =>
      buildRef('selected-domain-data', subject),
    ),
    issuerIdentity: IDENTITY.selectionIssuer,
    issuerDesignationChain: buildChainInput(
      'link/selection-leaf',
      IDENTITY.selectionIssuer,
      ROLE.selection,
      40,
    ),
    requiredIssuingRole: ROLE.selection,
    applicationScope: SCOPE.app,
    dacProfileIdentity: PROFILE.v0041,
    issuanceEvidence: { point: 40, assertedBy: [IDENTITY.witness] },
    reuseCurrentness: buildReuseCurrentness(),
    ...overrides,
  };
}

/** Valid Manifest successor-evidence facts (issued at point 50). */
export function buildManifestFacts(
  overrides: Partial<DacV0041ManifestEvidenceFacts> = {},
): DacV0041ManifestEvidenceFacts {
  return {
    manifestRef: buildRef('manifest', 'manifest/record-1'),
    manifestContentDigestRef: buildRef('manifest-content-digest', 'digest/manifest-1'),
    applicationRevisionRef: buildRef('application-revision', 'app-revision/rev-1'),
    applicationSemanticIdentityRef: buildRef('application-semantic', 'app/semantic-alpha'),
    selectedDomainDataRefs: SUBJECTS.map((subject) =>
      buildRef('selected-domain-data', subject),
    ),
    issuerIdentity: IDENTITY.manifestIssuer,
    issuerDesignationChain: buildChainInput(
      'link/manifest-leaf',
      IDENTITY.manifestIssuer,
      ROLE.manifestIssuance,
      50,
    ),
    requiredIssuingRole: ROLE.manifestIssuance,
    applicationScope: SCOPE.app,
    dacProfileIdentity: PROFILE.v0041,
    issuanceEvidence: { point: 50, assertedBy: [IDENTITY.witness] },
    reuseCurrentness: buildReuseCurrentness(),
    ...overrides,
  };
}

/** Coverage record for one selected subject (promotion + selection). */
export function buildCoverage(
  subjectIdentity: string,
  overrides: Partial<DacV0041SelectedDomainDataFacts> = {},
): DacV0041SelectedDomainDataFacts {
  return {
    subjectRef: buildRef('selected-domain-data', subjectIdentity),
    promotionCoverageRef: buildRef('promotion-decision', `promotion/${subjectIdentity}`),
    promotionCurrentness: 'current',
    selectionCoverageRef: buildRef(ROLE.selection, 'selection/record-1'),
    ...overrides,
  };
}

/** Valid seam-typed Runtime-binding refusal facts (issued at point 35). */
export function buildBindingRefusalFacts(
  overrides: Partial<DacV0041AuthorityRefusalFacts> = {},
): DacV0041AuthorityRefusalFacts {
  return {
    refusalRef: buildRef('authority-refusal', 'refusal/binding-1'),
    seamKind: 'runtime-binding',
    // The C108 Runtime-binding request role has a dedicated nominal
    // constructor in the foundation; mint it properly so the refusal binds
    // a genuine request identity of its own seam.
    exactRequestRef: mintRuntimeBindingRequestRef({
      baseline: DAC_V0041_BASELINE,
      authorityScope: SCOPE.app,
      primaryIdentity: 'request/binding-1',
      requesterIdentity: 'id/binding-requester',
      providerIdentity: 'id/runtime-provider',
      requestedCapabilityKind: 'runtime-binding',
    }),
    refusingIssuerIdentity: IDENTITY.refusingIssuer,
    issuerDesignationChain: buildChainInput(
      'link/binding-leaf',
      IDENTITY.refusingIssuer,
      ROLE.runtimeBinding,
      35,
    ),
    requiredIssuingRole: ROLE.runtimeBinding,
    subjectScope: SCOPE.app,
    dacProfileIdentity: PROFILE.v0041,
    issuanceEvidence: { point: 35, assertedBy: [IDENTITY.witness] },
    presentedOutcomeClass: 'produced-result',
    ...overrides,
  };
}

/** Fully valid composition-intake input (the C140 positive path). */
export function buildValidIntakeInput(
  overrides: Partial<DacV0041CompositionIntakeInput> = {},
): DacV0041CompositionIntakeInput {
  return {
    applicationIdentityEstablishment: buildEstablishmentFacts(),
    applicationSelection: buildSelectionFacts(),
    manifest: buildManifestFacts(),
    materialRefusals: [],
    selectedDomainData: SUBJECTS.map((subject) => buildCoverage(subject)),
    refusalDisclosureComplete: true,
    evaluationPoint: 60,
    ...overrides,
  };
}
