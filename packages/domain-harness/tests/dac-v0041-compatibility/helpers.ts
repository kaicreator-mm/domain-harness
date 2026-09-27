// Issue #357 / A41-003 — shared deterministic fixtures for the focused
// compatibility verifier suites. Pure data builders over the A41-001
// foundation; every adversarial variation is expressed as an explicit
// override so each test's facts stay fully recoverable.
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
} as const;

export const VIEW = {
  request: 'compat-request/req-1',
  validation: 'compat-validation/val-1',
  result: 'compat-result/res-1',
  resultB: 'compat-result/res-2',
} as const;

/** Exact binding explicit target reference (foundation-minted, role-gated). */
export function buildTargetRef(
  primaryIdentity: string = SUBJECT.target,
): DacV0041Reference {
  return adoptDacV0041RegistryReference({
    role: 'compatibility-target',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity,
    opaque: {},
  });
}

/** The C89 request reference (minted; binding explicit target included). */
export function buildRequestRef(
  overrides: Parameters<typeof mintCompatibilityValidationRequestRef>[0] = {},
): ReturnType<typeof mintCompatibilityValidationRequestRef> {
  return mintCompatibilityValidationRequestRef({
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity: VIEW.request,
    requesterIdentity: IDENTITY.requester,
    providerIdentity: IDENTITY.provider,
    requestedCapabilityKind: 'compatibility-validation',
    bindingTargetRef: buildTargetRef(),
    materialInputRefs: [],
    advisoryTargetHints: [],
    opaque: {},
    ...overrides,
  });
}

/** Exact compatibility subject closure (APPLICATION_MANIFEST §8). */
export function buildSubject(
  overrides: Partial<DacV0041CompatibilitySubjectFacts> = {},
): DacV0041CompatibilitySubjectFacts {
  return {
    manifestIdentity: SUBJECT.manifest,
    manifestContentDigest: SUBJECT.digest,
    targetIdentities: [SUBJECT.target],
    requirementsProfileIdentity: SUBJECT.requirements,
    dacProfileIdentity: SUBJECT.dacProfile,
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

/** Well-formed substantive refusal evidence (LIFECYCLE_REFERENCE_REPAIRS §4.2). */
export function buildRefusalEvidence(
  overrides: Partial<DacV0041AuthorityRefusalEvidenceFacts> = {},
): DacV0041AuthorityRefusalEvidenceFacts {
  return {
    refusalIdentity: 'refusal/runtime-binding-1',
    refusingIssuerIdentity: IDENTITY.bindingAuthority,
    refusingIssuerDesignated: true,
    seamKind: 'runtime-binding',
    boundRequestIdentity: 'binding-request/req-1',
    negativeDecision: true,
    producedResult: true,
    ...overrides,
  };
}
