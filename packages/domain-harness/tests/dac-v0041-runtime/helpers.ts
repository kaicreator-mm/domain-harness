// Issue #359 / A41-005 — shared deterministic fixtures for the focused
// Runtime binding/activation suites. Pure data builders over the A41-001
// foundation minting core and the A41-002 designation-chain fact shapes;
// every adversarial variation is expressed as an explicit override so each
// test's facts stay fully recoverable. The composition-intake and
// compatibility builders mirror the canonical A41-004 / A41-003 fixture
// shapes so the positive composition -> compatibility -> binding ->
// activation path is exercised against genuinely valid upstream evidence.
import {
  DAC_V0041_BASELINE,
  adoptDacV0041RegistryReference,
  mintCompatibilityValidationRequestRef,
  mintRuntimeBindingRequestRef,
  type DacV0041Reference,
} from '../../src/dac-v0041/index.js';
import {
  DAC_V0041_DESIGNATION_ISSUANCE_ROLE,
  type DacV0041DesignationChainInput,
  type DacV0041DesignationLinkFacts,
} from '../../src/dac-v0041/authority/index.js';
import type {
  DacV0041ApplicationSelectionFacts,
  DacV0041CompositionIntakeInput,
  DacV0041IdentityEstablishmentFacts,
  DacV0041ManifestEvidenceFacts,
  DacV0041RequestlessInitiationEvidence,
  DacV0041ReuseCurrentnessFacts,
  DacV0041SelectedDomainDataFacts,
} from '../../src/dac-v0041/composition-intake/index.js';
import type {
  DacV0041CompatibilityPrecedenceFacts,
  DacV0041CompatibilityResultViewFacts,
  DacV0041CompatibilitySubjectFacts,
  DacV0041CompatibilityValidationViewFacts,
} from '../../src/dac-v0041/compatibility/index.js';
import type {
  DacV0041RuntimeActivationVerificationInput,
  DacV0041RuntimeBindingVerificationInput,
  DacV0041RuntimeCompatibilityEvidenceFacts,
  DacV0041RuntimeMaterialArtifactFacts,
  DacV0041RuntimeSodFacts,
} from '../../src/dac-v0041/runtime/index.js';

export const IDENTITY = {
  owner: 'id/owner-scope-a',
  delegate: 'id/delegate-a',
  establishmentIssuer: 'id/establishment-issuer',
  selectionIssuer: 'id/selection-issuer',
  manifestIssuer: 'id/manifest-issuer',
  compatibilityValidator: 'id/compat-validator',
  bindingIssuer: 'id/binding-issuer',
  activationIssuer: 'id/activation-issuer',
  witness: 'id/registry-witness',
  composer: 'id/composer-x',
  producer: 'id/subject-producer',
  outsider: 'id/outsider',
} as const;

export const SCOPE = {
  app: 'scope/app-alpha',
  other: 'scope/app-beta',
} as const;

export const PROFILE = {
  v0041: 'dac-profile/v0041-a',
  requirements: 'profile/compat-req-a',
  other: 'dac-profile/other',
} as const;

export const ROLE = {
  establishment: 'application-identity-establishment',
  selection: 'application-selection',
  manifestIssuance: 'manifest-issuance',
  compatibilityValidation: 'compatibility-validation',
  runtimeBinding: 'runtime-binding',
  runtimeActivation: 'runtime-activation',
} as const;

export const SUBJECTS = ['subject/selected-alpha', 'subject/selected-beta'] as const;

const SUBJECT_EXACT_MATERIAL = {
  'subject/selected-alpha': {
    semanticIdentity: 'semantic/alpha-s1',
    revisionIdentity: 'revision/alpha-r1',
    contentDigest: 'digest/alpha-d1',
  },
  'subject/selected-beta': {
    semanticIdentity: 'semantic/beta-s1',
    revisionIdentity: 'revision/beta-r1',
    contentDigest: 'digest/beta-d1',
  },
} as const;

/** Owner-rooted designation-issuance link covering every seam role used here. */
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
    declaredEffectiveEnd: 200,
    issuanceEvidence: { point: 10, assertedBy: [IDENTITY.witness] },
    delegationEnvelope: {
      delegableRoles: [
        ROLE.establishment,
        ROLE.selection,
        ROLE.manifestIssuance,
        ROLE.compatibilityValidation,
        ROLE.runtimeBinding,
        ROLE.runtimeActivation,
      ],
      delegableScopes: [SCOPE.app],
      mandatoryConstraints: [],
      permittedDacProfiles: [PROFILE.v0041],
      delegableSodPermissions: ['sod/colocated-host'],
      redelegationDepth: 1,
    },
    ...overrides,
  };
}

/** Delegated leaf grant for one Runtime-seam issuing role. */
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
    declaredEffectiveEnd: 190,
    issuanceEvidence: { point: 20, assertedBy: [IDENTITY.witness] },
    parentLinkIdentity: 'link/root-iss',
    ...overrides,
  };
}

/** Valid two-link chain input for one issuing role at an evaluation point. */
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
    contractProfileIdentity?: string;
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
    ...(overrides.contractProfileIdentity === undefined
      ? {}
      : { contractProfileIdentity: overrides.contractProfileIdentity }),
    opaque: {},
  });
}

/** Mint a `selected-domain-data` reference with the COMPLETE exact tuple. */
export function buildSelectedSubjectRef(
  subjectIdentity: string,
): DacV0041Reference {
  const canonical =
    SUBJECT_EXACT_MATERIAL[subjectIdentity as keyof typeof SUBJECT_EXACT_MATERIAL];
  const short = subjectIdentity.replace(/^.*\//u, '');
  const material = canonical ?? {
    semanticIdentity: `semantic/${short}-s1`,
    revisionIdentity: `revision/${short}-r1`,
    contentDigest: `digest/${short}-d1`,
  };
  return buildRef('selected-domain-data', subjectIdentity, material);
}

/** Default §8.2 current-authoritative-reuse determination covering point 75+. */
export function buildReuseCurrentness(
  overrides: Partial<DacV0041ReuseCurrentnessFacts> = {},
): DacV0041ReuseCurrentnessFacts {
  return {
    state: 'current',
    establishedAt: 75,
    assertedBy: [IDENTITY.witness],
    ...overrides,
  };
}

/** Valid F-04 §4.1 requestless initiation record (provenance at 28 < 30). */
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

/** Valid establishment facts (issued at point 30, requestless seam). */
export function buildEstablishmentFacts(
  overrides: Partial<DacV0041IdentityEstablishmentFacts> = {},
): DacV0041IdentityEstablishmentFacts {
  return {
    establishmentRef: buildRef(ROLE.establishment, 'establishment/record-1'),
    applicationSemanticIdentityRef: buildRef('application-semantic', 'app/semantic-alpha'),
    requestlessInitiation: buildRequestlessInitiation(),
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
    selectedDomainDataRefs: SUBJECTS.map((subject) => buildSelectedSubjectRef(subject)),
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
    selectedDomainDataRefs: SUBJECTS.map((subject) => buildSelectedSubjectRef(subject)),
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
    subjectRef: buildSelectedSubjectRef(subjectIdentity),
    promotionCoverageRef: buildRef('promotion-decision', `promotion/${subjectIdentity}`),
    promotionCurrentness: 'current',
    selectionCoverageRef: buildRef(ROLE.selection, 'selection/record-1'),
    ...overrides,
  };
}

/** Fully valid composition-intake input (verified INTAKE_VERIFIED at 60). */
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

/**
 * The compatibility subject / request material shared by the abstract
 * (non-implementation-specific) fixtures. The Manifest material input of
 * the C89 request carries the same digest identity as the intake Manifest
 * digest reference, so the binding subject closes exactly over both.
 */
const MANIFEST_MATERIAL = {
  manifestIdentity: 'manifest/record-1',
  manifestContentDigest: 'digest/manifest-1',
  targetIdentity: 'target/host-profile-a',
} as const;

/** Material refs of the C89 request, in the §8 closure order. */
function compatibilityMaterialInputRefs(
  implementationRef?: DacV0041Reference,
  hostBindingRef?: DacV0041Reference,
): DacV0041Reference[] {
  return [
    buildRef('manifest', MANIFEST_MATERIAL.manifestIdentity, {
      contentDigest: MANIFEST_MATERIAL.manifestContentDigest,
    }),
    ...(implementationRef === undefined ? [] : [implementationRef]),
    ...(hostBindingRef === undefined ? [] : [hostBindingRef]),
  ];
}

/** The exact §8 compatibility subject for the given material refs. */
function buildCompatibilitySubject(
  materialRefs: readonly DacV0041Reference[],
  implementationRef?: DacV0041Reference,
  hostBindingRef?: DacV0041Reference,
): DacV0041CompatibilitySubjectFacts {
  return {
    manifestIdentity: MANIFEST_MATERIAL.manifestIdentity,
    manifestContentDigest: MANIFEST_MATERIAL.manifestContentDigest,
    targetIdentities: [MANIFEST_MATERIAL.targetIdentity],
    requirementsProfileIdentity: PROFILE.requirements,
    ...(implementationRef === undefined
      ? {}
      : { runtimeImplementationIdentity: implementationRef.primaryIdentity }),
    ...(hostBindingRef === undefined
      ? {}
      : { runtimeHostBindingIdentity: hostBindingRef.primaryIdentity }),
    dacProfileIdentity: PROFILE.v0041,
    materialManifestRefs: materialRefs.map((material) => ({
      role: material.role,
      authorityScope: material.authorityScope,
      primaryIdentity: material.primaryIdentity,
      ...(material.semanticIdentity === undefined
        ? {}
        : { semanticIdentity: material.semanticIdentity }),
      ...(material.revisionIdentity === undefined
        ? {}
        : { revisionIdentity: material.revisionIdentity }),
      ...(material.contentDigest === undefined
        ? {}
        : { contentDigest: material.contentDigest }),
      ...(material.contractProfileIdentity === undefined
        ? {}
        : { contractProfileIdentity: material.contractProfileIdentity }),
    })),
  };
}

/**
 * Fully valid A41-003 compatibility evidence bundle (VALID_TWO_VIEW +
 * COMPATIBLE_VERDICT). `implementation`/`hostBinding` switch the whole
 * bundle to the implementation-specific §11 shape in lockstep, so the
 * subject, the request material inputs and the precedence facts always
 * describe the same exact claim.
 */
export function buildCompatibilityEvidence(
  overrides: {
    validatorIdentity?: string;
    implementationRef?: DacV0041Reference;
    hostBindingRef?: DacV0041Reference;
    validationView?: Partial<DacV0041CompatibilityValidationViewFacts>;
    resultView?: Partial<DacV0041CompatibilityResultViewFacts>;
    precedenceFacts?: Partial<DacV0041CompatibilityPrecedenceFacts>;
  } = {},
): DacV0041RuntimeCompatibilityEvidenceFacts {
  const validatorIdentity = overrides.validatorIdentity ?? IDENTITY.compatibilityValidator;
  const materialRefs = compatibilityMaterialInputRefs(
    overrides.implementationRef,
    overrides.hostBindingRef,
  );
  const subject = buildCompatibilitySubject(
    materialRefs,
    overrides.implementationRef,
    overrides.hostBindingRef,
  );
  const request = mintCompatibilityValidationRequestRef({
    baseline: DAC_V0041_BASELINE,
    authorityScope: SCOPE.app,
    primaryIdentity: 'request/compat-1',
    requesterIdentity: 'id/compat-requester',
    providerIdentity: validatorIdentity,
    requestedCapabilityKind: 'compatibility-validation',
    materialInputRefs: materialRefs,
    bindingTargetRef: buildRef('compatibility-target', MANIFEST_MATERIAL.targetIdentity, {
      contractProfileIdentity: PROFILE.requirements,
    }),
    contractProfileIdentity: PROFILE.v0041,
  });
  const validationView: DacV0041CompatibilityValidationViewFacts = {
    validationViewIdentity: 'validation/compat-1',
    boundRequestIdentity: 'request/compat-1',
    validatorIdentity,
    validatorDesignated: true,
    subject,
    ...overrides.validationView,
  };
  const resultView: DacV0041CompatibilityResultViewFacts = {
    resultViewIdentity: 'result/compat-1',
    boundValidationViewIdentity: 'validation/compat-1',
    validatorIdentity,
    subject,
    disposition: 'COMPATIBLE',
    currentness: 'current',
    ...overrides.resultView,
  };
  const precedenceFacts: DacV0041CompatibilityPrecedenceFacts = {
    capabilityExchange: {
      currentDescriptorEstablished: true,
      currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
      requestedCapabilityKind: 'compatibility-validation',
      requiredInputsStructurallyValid: true,
      materialStaleness: false,
      bindingTargetState: { presence: 'missing' },
    },
    bindingTimeCheckReliedAsCompatibilityResult: false,
    authoritativeResults: [
      {
        resultViewIdentity: resultView.resultViewIdentity,
        validatorIdentity,
        validatorDesignated: true,
        disposition: 'COMPATIBLE',
        currentness: 'current',
      },
    ],
    refusalEvidence: [],
    assertedDisposition: 'COMPATIBLE',
    ...overrides.precedenceFacts,
  };
  return { requestRef: request, validationView, resultView, precedenceFacts };
}

/** Default F-07 SoD facts: no subject contributors, no co-hosting. */
export function buildSodFacts(
  overrides: Partial<DacV0041RuntimeSodFacts> = {},
): DacV0041RuntimeSodFacts {
  return {
    subjectContributingIdentities: [],
    coHostingGroups: [],
    explicitSodPermissionEstablished: false,
    coLocationDisclosed: false,
    ...overrides,
  };
}

/** Material Runtime implementation / Host Binding artifact facts. */
export function buildMaterialArtifact(
  role: 'runtime-implementation' | 'runtime-host-binding',
  primaryIdentity: string,
  overrides: Partial<DacV0041RuntimeMaterialArtifactFacts> = {},
): DacV0041RuntimeMaterialArtifactFacts {
  return {
    artifactRef: buildRef(role, primaryIdentity),
    issuancePoint: 55,
    reuseCurrentness: buildReuseCurrentness(),
    ...overrides,
  };
}

/**
 * Fully valid Runtime binding verification input (BINDING_VERIFIED at 75).
 * The default bundle is the abstract claim; passing implementation/host
 * artifacts switches every layer (compatibility subject, request material
 * inputs, binding evidence) to the implementation-specific §11 shape.
 * The minted RuntimeBindingRequestRef carries the COMPLETE §3.1 closure:
 * exact authority scope + DAC profile, the §4.1 binding explicit target
 * (identity + requirements profile) and the exact material input set
 * (Manifest identity+digest plus the full implementation/Host Binding
 * envelopes when material).
 */
export function buildValidBindingInput(
  overrides: {
    bindingIssuerIdentity?: string;
    implementation?: DacV0041RuntimeMaterialArtifactFacts;
    hostBindings?: DacV0041RuntimeMaterialArtifactFacts[];
    compatibilityValidatorIdentity?: string;
  } & Partial<DacV0041RuntimeBindingVerificationInput> = {},
): DacV0041RuntimeBindingVerificationInput {
  const {
    bindingIssuerIdentity,
    implementation,
    hostBindings,
    compatibilityValidatorIdentity,
    ...inputOverrides
  } = overrides;
  const bindingIssuer = bindingIssuerIdentity ?? IDENTITY.bindingIssuer;
  const compatibility = buildCompatibilityEvidence({
    ...(compatibilityValidatorIdentity === undefined
      ? {}
      : { validatorIdentity: compatibilityValidatorIdentity }),
    ...(implementation === undefined
      ? {}
      : { implementationRef: implementation.artifactRef as DacV0041Reference }),
    ...(hostBindings === undefined || hostBindings.length === 0
      ? {}
      : { hostBindingRef: hostBindings[0]!.artifactRef as DacV0041Reference }),
  });
  return {
    bindingRequestRef: mintRuntimeBindingRequestRef({
      baseline: DAC_V0041_BASELINE,
      authorityScope: SCOPE.app,
      primaryIdentity: 'request/binding-1',
      requesterIdentity: 'id/binding-requester',
      providerIdentity: 'id/runtime-provider',
      requestedCapabilityKind: 'runtime-binding',
      materialInputRefs: [
        buildRef('manifest', MANIFEST_MATERIAL.manifestIdentity, {
          contentDigest: MANIFEST_MATERIAL.manifestContentDigest,
        }),
        ...(implementation === undefined
          ? []
          : [implementation.artifactRef as DacV0041Reference]),
        ...(hostBindings === undefined
          ? []
          : hostBindings.map((host) => host.artifactRef as DacV0041Reference)),
      ],
      bindingTargetRef: buildRef(
        'compatibility-target',
        MANIFEST_MATERIAL.targetIdentity,
        { contractProfileIdentity: PROFILE.requirements },
      ),
      contractProfileIdentity: PROFILE.v0041,
    }),
    bindingResultRef: buildRef('runtime-binding', 'binding/record-1'),
    boundRequestIdentity: 'request/binding-1',
    subject: {
      manifestIdentity: MANIFEST_MATERIAL.manifestIdentity,
      manifestContentDigest: MANIFEST_MATERIAL.manifestContentDigest,
      dacProfileIdentity: PROFILE.v0041,
    },
    compositionIntake: buildValidIntakeInput(),
    compatibility,
    ...(implementation === undefined ? {} : { implementationEvidence: implementation }),
    ...(hostBindings === undefined ? {} : { hostBindingEvidence: hostBindings }),
    bindingIssuer: {
      issuerIdentity: bindingIssuer,
      requiredIssuingRole: ROLE.runtimeBinding,
      issuerDesignationChain: buildChainInput(
        'link/binding-leaf',
        bindingIssuer,
        ROLE.runtimeBinding,
        70,
      ),
    },
    bindingIssuanceEvidence: { point: 70, assertedBy: [IDENTITY.witness] },
    sod: buildSodFacts(),
    evaluationPoint: 75,
    ...inputOverrides,
  };
}

/**
 * Fully valid Runtime activation verification input (ACTIVATION_VERIFIED
 * at 85) over the canonical binding bundle. The activation request
 * envelope carries the exact bound scope/profile and the §3.1 subject
 * facts (exact binding + Manifest identity/digest + the relied §8.2
 * currentness determination), derived coherently from the resolved
 * `bound*` / `bindingReuseCurrentness` values unless explicitly overridden.
 */
export function buildValidActivationInput(
  overrides: Partial<DacV0041RuntimeActivationVerificationInput> & {
    binding?: DacV0041RuntimeBindingVerificationInput;
  } = {},
): DacV0041RuntimeActivationVerificationInput {
  const { binding, activationRequestSubject, ...inputOverrides } = overrides;
  const resolved: DacV0041RuntimeActivationVerificationInput = {
    activationRequestRef: buildRef('runtime-activation-request', 'request/activation-1', {
      contractProfileIdentity: PROFILE.v0041,
    }),
    activationResultRef: buildRef('runtime-activation', 'activation/record-1'),
    boundRequestIdentity: 'request/activation-1',
    boundBindingIdentity: 'binding/record-1',
    boundManifestIdentity: 'manifest/record-1',
    boundManifestContentDigest: 'digest/manifest-1',
    activationRequestSubject: {
      targetBindingIdentity: 'binding/record-1',
      targetManifestIdentity: 'manifest/record-1',
      targetManifestContentDigest: 'digest/manifest-1',
      reliedBindingCurrentness: {
        state: 'current',
        establishedAt: 85,
        assertedBy: [IDENTITY.witness],
      },
    },
    binding: binding ?? buildValidBindingInput(),
    activationIssuer: {
      issuerIdentity: IDENTITY.activationIssuer,
      requiredIssuingRole: ROLE.runtimeActivation,
      issuerDesignationChain: buildChainInput(
        'link/activation-leaf',
        IDENTITY.activationIssuer,
        ROLE.runtimeActivation,
        80,
      ),
    },
    activationIssuanceEvidence: { point: 80, assertedBy: [IDENTITY.witness] },
    bindingReuseCurrentness: {
      state: 'current',
      establishedAt: 85,
      assertedBy: [IDENTITY.witness],
    },
    sod: buildSodFacts(),
    evaluationPoint: 85,
    ...inputOverrides,
  };
  return {
    ...resolved,
    activationRequestSubject:
      activationRequestSubject === undefined
        ? {
            targetBindingIdentity: resolved.boundBindingIdentity,
            targetManifestIdentity: resolved.boundManifestIdentity,
            targetManifestContentDigest: resolved.boundManifestContentDigest,
            reliedBindingCurrentness: resolved.bindingReuseCurrentness,
          }
        : activationRequestSubject,
  };
}
