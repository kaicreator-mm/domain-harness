import type { DacV003ReferenceInput } from '../dac-v003/contracts.js';
import { type DacV003CapabilityRequirement, type DacV003CompatibilityAuthority, type DacV003CompatibilityResult, type DacV003CompatibilityResultRef, type DacV003CompatibilityTargetRef, type DacV003CompatibilityValidation, type DacV003CompatibilityValidationRef, type DacV003PortRequirement, type DacV003RequirementSatisfactionEvidence, type DacV003UxRoleAnchor, type DacV003UxSemanticRole, type DomainUXDefinitionRef } from './contracts.js';
/** Input for adopting the selected Domain UX semantic definition. */
export interface DomainUxDefinitionInput extends DacV003ReferenceInput {
    readonly semanticIdentity: string;
    readonly revisionIdentity: string;
}
/**
 * Adopt the exactly-1 Domain UX semantic definition: an immutable/versioned
 * semantic contract (P1 exactness). Renderer/component/DOM identity has no
 * slot here — it can only ever ride inside non-authoritative locator hints
 * or opaque fields, which this surface never reads for identity.
 */
export declare function adoptDomainUXDefinitionRef(input: DomainUxDefinitionInput): DomainUXDefinitionRef;
/** Input for adopting the explicit v0.0.3 compatibility target. */
export interface DacV003CompatibilityTargetInput extends DacV003ReferenceInput {
    readonly contractProfileIdentity: string;
    readonly revisionIdentity: string;
}
/**
 * Adopt the explicit DAC v0.0.3 runtime compatibility target (P5 exactness:
 * target contract/profile identity + exact version/revision identity — no
 * ambient "current"). The declared profile key used by the validator is
 * `contractProfileIdentity@revisionIdentity`.
 */
export declare function adoptDacV003CompatibilityTargetRef(input: DacV003CompatibilityTargetInput): DacV003CompatibilityTargetRef;
/** Exact target profile key of an adopted compatibility target. */
export declare function dacV003TargetProfileKey(target: DacV003CompatibilityTargetRef): string;
/** Requirement-descriptor fields shared by capability and Port requirements. */
interface RequirementDescriptorInput {
    readonly strength: 'required' | 'optional' | 'conditional';
    /** Present exactly when strength is 'conditional' (auditable descriptor). */
    readonly condition?: string;
    readonly qualifications?: readonly string[];
}
/** Input for adopting a composition-declared Capability requirement. */
export interface DacV003CapabilityRequirementInput extends DacV003ReferenceInput, RequirementDescriptorInput {
}
/**
 * Adopt a Capability requirement (APPLICATION_MANIFEST §8.1): the envelope is
 * the referrable requirement identity carrying the capability semantic
 * identity (`semanticIdentity`) and, when versioned, the required
 * contract/profile target (`contractProfileIdentity`). A declaration only —
 * never satisfaction evidence.
 */
export declare function adoptDacV003CapabilityRequirement(input: DacV003CapabilityRequirementInput): DacV003CapabilityRequirement;
/** Input for adopting a composition-declared Port requirement. */
export interface DacV003PortRequirementInput extends DacV003ReferenceInput, RequirementDescriptorInput {
    /** Which boundary is allowed to satisfy/bind this Port (exactly 1). */
    readonly bindingAuthority: string;
}
/**
 * Adopt a Port requirement (APPLICATION_MANIFEST §8.2): adds the binding
 * authority/owner role. The binding authority does not transfer external
 * Business SoR authority to Runtime.
 */
export declare function adoptDacV003PortRequirement(input: DacV003PortRequirementInput): DacV003PortRequirement;
/** Input for adopting exact satisfaction evidence for one requirement. */
export interface DacV003SatisfactionEvidenceInput extends DacV003ReferenceInput {
    /** The exact requirement reference being satisfied (adoption-checked). */
    readonly satisfies: unknown;
    /** The concrete runtime-family provider reference (adoption-checked). */
    readonly provider: unknown;
    /** Exact target profile the evidence is valid for. */
    readonly validForTargetProfile: string;
    /** Provenance establishing how satisfaction was determined (1..n). */
    readonly provenance: readonly unknown[];
}
/**
 * Adopt exact satisfaction evidence (APPLICATION_MANIFEST §8.3): P6 evidence
 * whose material inputs are exactly the satisfied requirement plus the
 * concrete provider, with provenance and an explicit valid-for target
 * profile. The provider MUST be runtime-family (`runtime-host-binding` /
 * `runtime-implementation`); a UX/presentation-family reference fails closed
 * with `PRESENTATION_ADAPTER_CANNOT_SATISFY` (§7.4: accessing the same host
 * platform never transfers Runtime effect authority to a renderer adapter).
 */
export declare function adoptDacV003RequirementSatisfactionEvidence(input: DacV003SatisfactionEvidenceInput): DacV003RequirementSatisfactionEvidence;
/** True only for references actually adopted as the Domain UX definition. */
export declare function isDomainUXDefinitionRefValue(value: unknown): value is DomainUXDefinitionRef;
/** True only for references actually adopted as the v0.0.3 compatibility target. */
export declare function isDacV003CompatibilityTargetRefValue(value: unknown): value is DacV003CompatibilityTargetRef;
/** True only for capability requirements minted by this module. */
export declare function isDacV003CapabilityRequirementValue(value: unknown): value is DacV003CapabilityRequirement;
/** True only for Port requirements minted by this module. */
export declare function isDacV003PortRequirementValue(value: unknown): value is DacV003PortRequirement;
/** True only for satisfaction evidence minted by this module. */
export declare function isDacV003RequirementSatisfactionEvidenceValue(value: unknown): value is DacV003RequirementSatisfactionEvidence;
/** True only for the compatibility validation act references this module mints. */
export declare function isDacV003CompatibilityValidationRefValue(value: unknown): value is DacV003CompatibilityValidationRef;
/** True only for the separately-encoded result references this module mints. */
export declare function isDacV003CompatibilityResultRefValue(value: unknown): value is DacV003CompatibilityResultRef;
/** True only for validation records actually minted by the validator. */
export declare function isDacV003CompatibilityValidationValue(value: unknown): value is DacV003CompatibilityValidation;
/** True only for result records actually minted by this module. */
export declare function isDacV003CompatibilityResultValue(value: unknown): value is DacV003CompatibilityResult;
/**
 * Refutes lifecycle RuntimeBinding/activation objects in the compatibility
 * path (C56: `RuntimeHostBindingRequirementRef != RuntimeHostBindingRef !=
 * RuntimeBindingRef`). Throws `LIFECYCLE_BINDING_INPUT_REJECTED` when any
 * value is a v0.0.2 `RuntimeBindingRef`/`RuntimeActivationRef`, a #307
 * binding evidence record, or a v0.0.3 reference of role
 * `runtime-binding`/`runtime-activation`: the lifecycle binding decision is
 * stage 4 and can never be presented as, or substituted for, a host-binding
 * requirement, a concrete host-binding input, or satisfaction evidence.
 */
export declare function refuteDacV003LifecycleBindingInput(...values: readonly unknown[]): void;
/**
 * Validate a UX semantic-role requirement anchor: when present it must be a
 * reference actually minted by the #308 correlation bridge with the matching
 * renderer-independent role. Anchors are correlation evidence only — the
 * bridge's own producer rule already forbids DOM/component identity as
 * semantic identity.
 */
export declare function expectDacV003UxRoleAnchor(role: DacV003UxSemanticRole, anchor: DacV003UxRoleAnchor | undefined): void;
/**
 * Resolve the validation authority of any view of one compatibility
 * validation — the validation act reference, the validation record, the
 * separately-encoded result reference, or the result record. Every view
 * resolves to the same `{ authorityScope, validationIdentity }` tuple; a
 * result that does not link exactly one validation in the single authority
 * scope fails closed.
 */
export declare function resolveDacV003CompatibilityAuthority(value: DacV003CompatibilityValidationRef | DacV003CompatibilityValidation | DacV003CompatibilityResultRef | DacV003CompatibilityResult): DacV003CompatibilityAuthority;
/**
 * Assert that a separately-encoded result and its validation act resolve to
 * one and the same validation authority (CROSS_LAYER_REFERENCES §6.3):
 * separate representations, never separate authorities.
 */
export declare function assertSameDacV003CompatibilityAuthority(validationView: Parameters<typeof resolveDacV003CompatibilityAuthority>[0], resultView: Parameters<typeof resolveDacV003CompatibilityAuthority>[0]): void;
/** Registers a validation record minted by the validator (module-internal). */
export declare function registerMintedCompatibilityValidation(validation: DacV003CompatibilityValidation): void;
/** Registers a result record minted by this module (module-internal). */
export declare function registerMintedCompatibilityResult(result: DacV003CompatibilityResult): void;
export {};
//# sourceMappingURL=guards.d.ts.map