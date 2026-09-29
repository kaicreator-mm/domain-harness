// Issue #357 / A41-003 (R1 repair per #378 comment 5852943693 / #376 P1s;
// R2 repair per #382 comment 5853969754 / #380 comment 5853882625 residual
// P1 — complete material-Manifest-ref subject closure) —
// shared deterministic fixtures for the focused compatibility verifier
// suites. Pure data builders over the A41-001 foundation; every adversarial
// variation is expressed as an explicit override so each test's facts stay
// fully recoverable.
import {
  DAC_V0041_BASELINE,
  adoptDacV0041RegistryReference,
  mintCompatibilityValidationRequestRef,
  type DacV0041Reference,
} from '../../src/dac-v0041/index.js';
import type {
  DacV0041AuthorityRefusalEvidenceFacts,
  DacV0041CompatibilityPrecedenceFacts,
  DacV0041CompatibilityResultViewFacts,
  DacV0041CompatibilitySubjectFacts,
  DacV0041CompatibilityValidationViewFacts,
  DacV0041CompatibilityViewAssociationInput,
  DacV0041MaterialManifestRefFacts,
} from '../../src/dac-v0041/compatibility/index.js';

export const IDENTITY = {
  requester: 'id/composer-requester',
  provider: 'id/runtime-provider-a',
  validator: 'id/compatibility-validator-1',
  validatorB: 'id/compatibility-validator-2',
  bindingAuthority: 'id/runtime-binding-authority',
  witness: 'id/registry-witness',
  outsider: 'id/outsider',
} as const;

export const SUBJECT = {
  manifest: 'manifest/app-x-r3',
  digest: 'sha256:digest-app-x-r3',
  target: 'compat-target/runtime-profile-t1',
  targetB: 'compat-target/runtime-profile-t2',
  requirements: 'req-profile/compat-checks-v2',
  implementation: 'impl/runtime-implementation-7',
  hostBinding: 'host-binding/concrete-hb-9',
  dacProfile: 'dac-profile/v0041-a',
  runtimeContract: 'runtime-contract/host-contract-11',
  runtimeContractRevision: 'revision/host-contract-11-r2',
  runtimeContractDigest: 'sha256:digest-host-contract-11',
  runtimeContractProfile: 'profile/host-contract-semantics-v3',
  domainUxDefinition: 'domain-ux/ux-definition-5',
  domainUxDefinitionRevision: 'revision/ux-definition-5-r1',
} as const;

export const VIEW = {
  request: 'compat-request/req-1',
  validation: 'compat-validation/val-1',
  result: 'compat-result/res-1',
  resultB: 'compat-result/res-2',
} as const;

/**
 * Exact binding explicit target/profile reference (foundation-minted,
 * role-gated; ACE §4.1 binds the target and its check profile as one slot).
 * Omit `contractProfileIdentity` to model a request that fails to bind the
 * exact requirements/check profile (§8 adversarial).
 */
export function buildTargetRef(
  primaryIdentity: string = SUBJECT.target,
  contractProfileIdentity?: string,
): DacV0041Reference {
  return adoptDacV0041RegistryReference({
    role: 'compatibility-target',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity,
    ...(contractProfileIdentity === undefined ? {} : { contractProfileIdentity }),
    opaque: {},
  });
}

/**
 * Exact Manifest material input (identity + contentDigest per §8). Omit
 * `contentDigest` to model a request that fails to bind the exact digest
 * (§8 adversarial).
 */
export function buildManifestRef(
  primaryIdentity: string = SUBJECT.manifest,
  contentDigest?: string,
): DacV0041Reference {
  return adoptDacV0041RegistryReference({
    role: 'manifest',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity,
    ...(contentDigest === undefined ? {} : { contentDigest }),
    opaque: {},
  });
}

/** Exact RuntimeImplementationRef material input (implementation-specific claims). */
export function buildImplementationRef(
  primaryIdentity: string = SUBJECT.implementation,
): DacV0041Reference {
  return adoptDacV0041RegistryReference({
    role: 'runtime-implementation',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity,
    opaque: {},
  });
}

/** Exact RuntimeHostBindingRef material input (concrete Host Binding claims). */
export function buildHostBindingRef(
  primaryIdentity: string = SUBJECT.hostBinding,
): DacV0041Reference {
  return adoptDacV0041RegistryReference({
    role: 'runtime-host-binding',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity,
    opaque: {},
  });
}

/**
 * Exact `runtime-contract` material Manifest ref (R2 §8 closure): carried by
 * the request and asserted by the subject with role + all material
 * exactness (semantic identity / revision / digest / profile).
 */
export function buildRuntimeContractRef(
  primaryIdentity: string = SUBJECT.runtimeContract,
): DacV0041Reference {
  return adoptDacV0041RegistryReference({
    role: 'runtime-contract',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity,
    semanticIdentity: `semantic/${primaryIdentity}`,
    revisionIdentity: SUBJECT.runtimeContractRevision,
    contentDigest: SUBJECT.runtimeContractDigest,
    contractProfileIdentity: SUBJECT.runtimeContractProfile,
    opaque: {},
  });
}

/**
 * Exact `domain-ux-definition` material Manifest ref (R2 §8 closure, second
 * material family outside the named subject fields).
 */
export function buildDomainUxDefinitionRef(
  primaryIdentity: string = SUBJECT.domainUxDefinition,
): DacV0041Reference {
  return adoptDacV0041RegistryReference({
    role: 'domain-ux-definition',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity,
    revisionIdentity: SUBJECT.domainUxDefinitionRevision,
    opaque: {},
  });
}

/**
 * Test-side derivation of the subject's material-Manifest-ref closure facts
 * from a foundation-minted reference (the verifier derives the same tuple
 * from the request independently; fixtures stay recoverable by hand).
 */
export function materialRefFacts(ref: DacV0041Reference): DacV0041MaterialManifestRefFacts {
  return {
    role: ref.role,
    authorityScope: ref.authorityScope,
    primaryIdentity: ref.primaryIdentity,
    ...(ref.semanticIdentity === undefined ? {} : { semanticIdentity: ref.semanticIdentity }),
    ...(ref.revisionIdentity === undefined ? {} : { revisionIdentity: ref.revisionIdentity }),
    ...(ref.contentDigest === undefined ? {} : { contentDigest: ref.contentDigest }),
    ...(ref.contractProfileIdentity === undefined
      ? {}
      : { contractProfileIdentity: ref.contractProfileIdentity }),
  };
}

/**
 * The C89 request reference (minted), closing over the exact §8 subject:
 * Manifest identity+digest material input, binding explicit target/profile,
 * and the request's own DAC/reference profile. A request minted WITHOUT the
 * DAC/reference profile is modelled by `buildRequestRefWithoutDacProfile`
 * (a destructuring default cannot distinguish "absent" from "unset").
 */
export function buildRequestRef(
  overrides: Partial<Parameters<typeof mintCompatibilityValidationRequestRef>[0]> = {},
): ReturnType<typeof mintCompatibilityValidationRequestRef> {
  const {
    baseline = DAC_V0041_BASELINE,
    authorityScope = 'scope/domain-a',
    primaryIdentity = VIEW.request,
    requesterIdentity = IDENTITY.requester,
    providerIdentity = IDENTITY.provider,
    requestedCapabilityKind = 'compatibility-validation',
    contractProfileIdentity = SUBJECT.dacProfile,
    materialInputRefs = [buildManifestRef(SUBJECT.manifest, SUBJECT.digest)],
    advisoryTargetHints = [],
    opaque = {},
    bindingTargetRef = buildTargetRef(SUBJECT.target, SUBJECT.requirements),
    ...rest
  } = overrides;
  return mintCompatibilityValidationRequestRef({
    ...rest,
    baseline,
    authorityScope,
    primaryIdentity,
    requesterIdentity,
    providerIdentity,
    requestedCapabilityKind,
    contractProfileIdentity,
    bindingTargetRef,
    materialInputRefs,
    advisoryTargetHints,
    opaque,
  });
}

/**
 * A request minted WITHOUT a DAC/reference profile — the §8 adversarial
 * carrier for "the request does not bind the exact DAC/reference profile".
 */
export function buildRequestRefWithoutDacProfile(): ReturnType<
  typeof mintCompatibilityValidationRequestRef
> {
  return mintCompatibilityValidationRequestRef({
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity: VIEW.request,
    requesterIdentity: IDENTITY.requester,
    providerIdentity: IDENTITY.provider,
    requestedCapabilityKind: 'compatibility-validation',
    bindingTargetRef: buildTargetRef(SUBJECT.target, SUBJECT.requirements),
    materialInputRefs: [buildManifestRef(SUBJECT.manifest, SUBJECT.digest)],
  });
}

/**
 * Exact compatibility subject closure (APPLICATION_MANIFEST §8), including
 * the COMPLETE material-Manifest-ref list matching the default request's
 * `materialInputRefs` (R2: the closure covers every material ref, not only
 * the named subject families).
 */
export function buildSubject(
  overrides: Partial<DacV0041CompatibilitySubjectFacts> = {},
): DacV0041CompatibilitySubjectFacts {
  return {
    manifestIdentity: SUBJECT.manifest,
    manifestContentDigest: SUBJECT.digest,
    targetIdentities: [SUBJECT.target],
    requirementsProfileIdentity: SUBJECT.requirements,
    dacProfileIdentity: SUBJECT.dacProfile,
    materialManifestRefs: [
      {
        role: 'manifest',
        authorityScope: 'scope/domain-a',
        primaryIdentity: SUBJECT.manifest,
        contentDigest: SUBJECT.digest,
      },
    ],
    ...overrides,
  };
}

/** Well-formed CompatibilityValidationRef view facts (C144 view 1). */
export function buildValidationView(
  overrides: Partial<DacV0041CompatibilityValidationViewFacts> = {},
): DacV0041CompatibilityValidationViewFacts {
  return {
    validationViewIdentity: VIEW.validation,
    boundRequestIdentity: VIEW.request,
    validatorIdentity: IDENTITY.validator,
    validatorDesignated: true,
    subject: buildSubject(),
    ...overrides,
  };
}

/** Well-formed CompatibilityResultRef view facts (C144 view 2). */
export function buildResultView(
  overrides: Partial<DacV0041CompatibilityResultViewFacts> = {},
): DacV0041CompatibilityResultViewFacts {
  return {
    resultViewIdentity: VIEW.result,
    boundValidationViewIdentity: VIEW.validation,
    validatorIdentity: IDENTITY.validator,
    subject: buildSubject(),
    disposition: 'COMPATIBLE',
    currentness: 'current',
    ...overrides,
  };
}

/** Valid two-view association input (the C144 positive path). */
export function buildAssociationInput(
  overrides: Partial<DacV0041CompatibilityViewAssociationInput> = {},
): DacV0041CompatibilityViewAssociationInput {
  return {
    requestRef: buildRequestRef(),
    validationView: buildValidationView(),
    resultView: buildResultView(),
    ...overrides,
  };
}

/** Steps 0–3 all satisfied: the evaluation-phase capability-exchange facts. */
export function buildPassingCapabilityExchangeFacts(): DacV0041CompatibilityPrecedenceFacts['capabilityExchange'] {
  return {
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: false,
    bindingTargetState: { presence: 'missing' },
  };
}

/** One current, designated, favorable authoritative produced result. */
export function buildFavorableResult(
  overrides: Partial<DacV0041CompatibilityPrecedenceFacts['authoritativeResults'][number]> = {},
): DacV0041CompatibilityPrecedenceFacts['authoritativeResults'][number] {
  return {
    resultViewIdentity: VIEW.result,
    validatorIdentity: IDENTITY.validator,
    validatorDesignated: true,
    disposition: 'COMPATIBLE',
    currentness: 'current',
    ...overrides,
  };
}

/** Valid precedence facts asserting COMPATIBLE with one favorable result. */
export function buildPrecedenceFacts(
  overrides: Partial<DacV0041CompatibilityPrecedenceFacts> = {},
): DacV0041CompatibilityPrecedenceFacts {
  return {
    capabilityExchange: buildPassingCapabilityExchangeFacts(),
    bindingTimeCheckReliedAsCompatibilityResult: false,
    authoritativeResults: [buildFavorableResult()],
    refusalEvidence: [],
    assertedDisposition: 'COMPATIBLE',
    ...overrides,
  };
}

/**
 * Well-formed substantive refusal evidence carrying the COMPLETE frozen
 * §4.2 closure (exact request/initiation, exact subject/scope/profile,
 * refusing issuer and its designation, seam kind, negative decision,
 * issuance provenance and issuance point).
 */
export function buildRefusalEvidence(
  overrides: Partial<DacV0041AuthorityRefusalEvidenceFacts> = {},
): DacV0041AuthorityRefusalEvidenceFacts {
  return {
    refusalIdentity: 'refusal/runtime-binding-1',
    refusingIssuerIdentity: IDENTITY.bindingAuthority,
    refusingIssuerDesignated: true,
    issuerDesignationIdentity: 'designation/binding-authority-role-1',
    seamKind: 'runtime-binding',
    boundRequestIdentity: 'binding-request/req-1',
    refusedSubjectIdentity: SUBJECT.manifest,
    dacProfileIdentity: SUBJECT.dacProfile,
    negativeDecision: true,
    producedResult: true,
    issuanceProvenanceIdentity: 'provenance/refusal-runtime-binding-1',
    issuancePointIdentity: 'issuance-point/refusal-runtime-binding-1',
    ...overrides,
  };
}
