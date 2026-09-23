import type { Sha256Port } from '../contracts/identity.js';
import type { DomainIntentRef, OutcomeRef, SemanticTargetRef, SnapshotRef, ViewRef, WatchRef } from '../dac-bridge/contracts.js';
import type { SelectedCompositionValidation } from '../composition-intake/contracts.js';
import type { DacV003Reference, DacV003ReferenceDisposition, DacV003RegistryReference, RuntimeHostBindingRequirementRef, RuntimeInteractionContractRef } from '../dac-v003/contracts.js';
/**
 * A renderer-independent UX semantic-role anchor minted by the #308
 * correlation bridge. Anchors are correlation evidence only — the bridge's
 * own producer rule already forbids DOM/component identity as semantic
 * identity, so no renderer/presentation reference can ever appear here.
 */
export type DacV003UxRoleAnchor = DomainIntentRef | SemanticTargetRef | ViewRef | SnapshotRef | WatchRef | OutcomeRef;
/** Exact identity of this compatibility-validation authority surface. */
export declare const DAC_V003_COMPATIBILITY_AUTHORITY_VERSION: "dac-v003-compatibility-authority/1";
/**
 * The single compatibility-validation authority scope (CROSS_LAYER_REFERENCES
 * §6.3/§7.3, APPLICATION_MANIFEST §12.2). Every minted validation act
 * (`CompatibilityValidationRef`) and every separately-encoded result
 * (`CompatibilityResultRef`) carries exactly this scope, so both semantic
 * views always resolve to one and the same validation authority and no second
 * authority can be synthesized for the same exact subject/target.
 */
export declare const DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE: "domain-harness://dac-v003/compatibility-validation";
/**
 * UX semantic roles the interaction-contract closure can cover
 * (CROSS_LAYER_REFERENCES §5 UX family; APPLICATION_MANIFEST §9). This is a
 * COVERAGE vocabulary only: an application is not forced to use every role —
 * but every material role its UX definition requires must be covered.
 */
export declare const DAC_V003_UX_SEMANTIC_ROLES: readonly ["domain-intent", "semantic-target", "ux-view", "ux-snapshot", "ux-watch", "ux-outcome", "ux-recovery-correlation"];
export type DacV003UxSemanticRole = (typeof DAC_V003_UX_SEMANTIC_ROLES)[number];
/**
 * Requirement strength/cardinality semantics (APPLICATION_MANIFEST §8.1/§8.2):
 * exactly 1 per requirement descriptor. A conditional requirement is only
 * applicable when its auditable condition descriptor is declared to hold in
 * the validation request; applicability is recorded, never guessed.
 */
export declare const DAC_V003_REQUIREMENT_STRENGTHS: readonly ["required", "optional", "conditional"];
export type DacV003RequirementStrength = (typeof DAC_V003_REQUIREMENT_STRENGTHS)[number];
/**
 * The selected Domain UX semantic definition (exactly 1; APPLICATION_MANIFEST
 * §9): an immutable/versioned semantic contract — P1 exactness (semantic +
 * revision identity), never renderer/component/DOM identity. Renderer or
 * presentation identity has no nominal slot on this reference and can only
 * ever appear inside non-authoritative locator hints or opaque fields.
 */
export interface DomainUXDefinitionRef extends DacV003RegistryReference {
    readonly role: 'domain-ux-definition';
    readonly semanticIdentity: string;
    readonly revisionIdentity: string;
}
/**
 * The explicit DAC v0.0.3 runtime compatibility target (exactly 1 when
 * authoritative compatibility is evaluated; APPLICATION_MANIFEST §7.2):
 * P5 exactness — target semantic contract/profile identity plus exact
 * version/revision identity sufficient to forbid ambient "current". The
 * v0.0.2 `CompatibilityTargetRef` inside the #306 verdict is upstream
 * evidence; the v0.0.3 target is this separately-adopted explicit
 * declaration, and its absence is `FAIL_CLOSED`.
 */
export interface DacV003CompatibilityTargetRef extends DacV003RegistryReference {
    readonly role: 'compatibility-target';
    readonly contractProfileIdentity: string;
    readonly revisionIdentity: string;
}
/** Requirement kinds whose satisfaction this authority closes (§8). */
export declare const DAC_V003_REQUIREMENT_KINDS: readonly ["capability", "port", "host-binding"];
export type DacV003RequirementKind = (typeof DAC_V003_REQUIREMENT_KINDS)[number];
/**
 * A composition-declared Capability requirement (APPLICATION_MANIFEST §8.1).
 * The adopted envelope is the referrable requirement identity; the descriptor
 * carries the requiredness/cardinality semantics. A requirement is a
 * DECLARATION only — it is never satisfaction evidence (§8.3).
 */
export interface DacV003CapabilityRequirement {
    readonly kind: 'capability';
    readonly reference: DacV003RegistryReference & {
        readonly role: 'capability-requirement';
    };
    /** required/optional/conditional applicability (exactly 1). */
    readonly strength: DacV003RequirementStrength;
    /** Auditable condition descriptor; present exactly when strength is conditional. */
    readonly condition?: string;
    /** Material interoperable qualification constraints (0..n). */
    readonly qualifications: readonly string[];
}
/**
 * A composition-declared Port requirement (APPLICATION_MANIFEST §8.2): adds
 * the binding authority/owner role stating which boundary is allowed to
 * satisfy/bind the Port (it does not transfer external Business SoR
 * authority to Runtime).
 */
export interface DacV003PortRequirement {
    readonly kind: 'port';
    readonly reference: DacV003RegistryReference & {
        readonly role: 'port-requirement';
    };
    readonly strength: DacV003RequirementStrength;
    readonly condition?: string;
    /** Which boundary may satisfy/bind this Port (exactly 1). */
    readonly bindingAuthority: string;
    readonly qualifications: readonly string[];
}
/** Any closed requirement this authority can evaluate. */
export type DacV003CompositionRequirement = DacV003CapabilityRequirement | DacV003PortRequirement | {
    readonly kind: 'host-binding';
    readonly reference: RuntimeHostBindingRequirementRef;
};
/** The three roles whose references can be satisfied by evidence. */
export type DacV003SatisfiableReferenceRole = 'capability-requirement' | 'port-requirement' | 'runtime-host-binding-requirement';
/**
 * Exact satisfaction evidence for one requirement against one concrete
 * runtime-family provider and one explicit target profile (APPLICATION_MANIFEST
 * §8.3; P6 evidence exactness). The adopted envelope carries the full P6
 * closure (material inputs = the requirement + the provider; provenance =
 * how the satisfaction was established); this descriptor exposes the typed
 * views of those exact inputs. A presentation-only UX/web/native adapter can
 * never be the provider (APPLICATION_MANIFEST §7.4) — provider roles are
 * restricted to `runtime-host-binding` / `runtime-implementation` at adoption,
 * and UX-family roles fail closed.
 */
export interface DacV003RequirementSatisfactionEvidence {
    readonly reference: DacV003RegistryReference & {
        readonly role: 'capability-satisfaction-evidence';
    };
    /** The exact requirement this evidence satisfies (from material inputs). */
    readonly requirement: DacV003Reference & {
        readonly role: DacV003SatisfiableReferenceRole;
    };
    /** The concrete runtime-family provider (from material inputs). */
    readonly provider: DacV003Reference & {
        readonly role: 'runtime-host-binding' | 'runtime-implementation';
    };
    /** Exact target profile the evidence is valid for (no ambient validity). */
    readonly validForTargetProfile: string;
}
/**
 * One UX semantic-role requirement of the selected UX definition
 * (APPLICATION_MANIFEST §9): a coverage rule, not a mandate to implement
 * every primitive. `anchor`, when present, must be a reference actually
 * minted by the #308 correlation bridge with the matching renderer-
 * independent role — exact correlation evidence, never renderer identity.
 */
export interface DacV003UxSemanticRoleRequirement {
    readonly role: DacV003UxSemanticRole;
    readonly required: boolean;
    readonly anchor?: DacV003UxRoleAnchor;
}
/**
 * The compatibility-validation request: one exact subject (a genuine #306
 * stage-3 verdict for the already-decided composition) plus the explicit
 * v0.0.3 target, requirement closure, and UX interaction closure. Every
 * input is already-decided/declared evidence — this authority validates, it
 * never selects, substitutes, binds or activates.
 */
export interface DacV003CompatibilityValidationRequest {
    /** Genuine #306 stage-3 exact-selection validation (mandatory pass-through). */
    readonly selectionValidation: SelectedCompositionValidation;
    /**
     * Explicit v0.0.3 compatibility target. Absent => the validation fails
     * closed (`FAIL_CLOSED` disposition; CROSS_LAYER_REFERENCES §8) — an
     * ambient "current runtime" is never assumed from the #306 verdict.
     */
    readonly compatibilityTarget?: DacV003CompatibilityTargetRef;
    /**
     * Exact target profile keys (`contractProfileIdentity@revisionIdentity`)
     * this validator environment declares supported. An explicit target whose
     * key is not in this set is `INCOMPATIBLE` (explicit unsupported target).
     */
    readonly supportedTargetProfiles: readonly string[];
    /** The selected Domain UX semantic definition (exactly 1). */
    readonly domainUxDefinition: DomainUXDefinitionRef;
    /** The UX↔Runtime semantic interaction contract (exactly 1; #323 type). */
    readonly runtimeInteractionContract: RuntimeInteractionContractRef;
    /** UX semantic roles the interaction contract covers. */
    readonly interactionCoverage: readonly DacV003UxSemanticRole[];
    /** UX semantic-role requirements of the selected UX definition. */
    readonly uxSemanticRoleRequirements: readonly DacV003UxSemanticRoleRequirement[];
    /** Declared Capability requirements (0..n). */
    readonly capabilityRequirements: readonly DacV003CapabilityRequirement[];
    /** Declared Port requirements (0..n). */
    readonly portRequirements: readonly DacV003PortRequirement[];
    /** Declared Host Binding requirements (0..n; a declaration is required). */
    readonly hostBindingRequirements: readonly RuntimeHostBindingRequirementRef[];
    /** Exact satisfaction evidence for the declared requirements (0..n). */
    readonly satisfactionEvidence: readonly DacV003RequirementSatisfactionEvidence[];
    /** Condition descriptors that hold, making conditional requirements applicable. */
    readonly applicableConditions?: readonly string[];
    /** Portable digest capability for the deterministic validation identity. */
    readonly sha256: Sha256Port;
}
/**
 * The validation act (`CompatibilityValidationRef`, CROSS_LAYER_REFERENCES
 * §5/§7.3): P6 exact closure — the deterministic validation identity over
 * the full evaluated subject/target/requirement/evidence closure, in the
 * single authority scope.
 */
export interface DacV003CompatibilityValidationRef extends DacV003RegistryReference {
    readonly role: 'compatibility-validation';
    readonly authorityScope: typeof DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE;
}
/**
 * The result view (`CompatibilityResultRef`, CROSS_LAYER_REFERENCES §6.3/
 * APPLICATION_MANIFEST §12.2): encoded separately from the validation act,
 * but its FIRST material input links to exactly one
 * `DacV003CompatibilityValidationRef` in the same authority scope, so both
 * semantic views resolve to one and the same validation authority. It can
 * never stand alone and can never link a second validation.
 */
export interface DacV003CompatibilityResultRef extends DacV003RegistryReference {
    readonly role: 'compatibility-result';
    readonly authorityScope: typeof DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE;
}
/** The authority tuple every validation/result view must resolve to. */
export interface DacV003CompatibilityAuthority {
    readonly authorityScope: typeof DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE;
    readonly validationIdentity: string;
}
/** What the closure actually evaluated for each requirement. */
export interface DacV003RequirementClosureEntry {
    readonly kind: DacV003RequirementKind;
    readonly requirementIdentity: string;
    /** Effective strength after conditional applicability was applied. */
    readonly effectiveStrength: 'required' | 'optional' | 'not-applicable';
    readonly satisfiedBy: readonly string[];
}
/** The UX interaction-closure outcome the validation evaluated. */
export interface DacV003UxClosure {
    readonly domainUxDefinition: {
        readonly authorityScope: string;
        readonly semanticIdentity: string;
        readonly revisionIdentity: string;
    };
    readonly runtimeInteractionContract: {
        readonly authorityScope: string;
        readonly semanticIdentity: string;
        readonly revisionIdentity: string;
    };
    readonly coveredRoles: readonly DacV003UxSemanticRole[];
    readonly requiredRoles: readonly DacV003UxSemanticRole[];
    readonly missingRequiredRoles: readonly DacV003UxSemanticRole[];
}
/**
 * The minted compatibility validation: one validation act + its separately
 * encoded result view, one namespaced disposition, and the auditable closure
 * that produced it. COMPATIBLE makes the exact subject eligible for later
 * binding under its own authority — it never selects, binds or activates.
 */
export interface DacV003CompatibilityValidation {
    readonly compatibility: typeof DAC_V003_COMPATIBILITY_AUTHORITY_VERSION;
    readonly validationRef: DacV003CompatibilityValidationRef;
    readonly resultRef: DacV003CompatibilityResultRef;
    readonly disposition: DacV003ReferenceDisposition;
    readonly subject: {
        readonly authorityScope: typeof DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE;
        readonly validationIdentity: string;
        readonly targetProfile: string | undefined;
        readonly upstreamSelectionValidation: SelectedCompositionValidation;
    };
    readonly requirementClosure: readonly DacV003RequirementClosureEntry[];
    readonly ux: DacV003UxClosure;
    readonly findings: readonly string[];
}
/**
 * The separately-encoded result record (`deriveDacV003CompatibilityResult`):
 * the result view of exactly one validation, carrying the same authority
 * tuple. Encoding separation never becomes authority separation.
 */
export interface DacV003CompatibilityResult {
    readonly result: 'dac-v003-compatibility-result/1';
    readonly resultRef: DacV003CompatibilityResultRef;
    readonly validationRef: DacV003CompatibilityValidationRef;
    readonly disposition: DacV003ReferenceDisposition;
    readonly authorityScope: typeof DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE;
    readonly validationIdentity: string;
}
/**
 * Fail-closed error taxonomy (thrown for structurally non-interpretable
 * input; semantic outcomes are minted as dispositions instead):
 *
 * - `INVALID_COMPATIBILITY_REQUEST` — malformed request/fields, non-adopted or
 *   wrong-role references, conflicting requirement set, malformed target
 *   profile declarations;
 * - `NOT_A_SELECTED_COMPOSITION_VALIDATION` — the upstream evidence was not
 *   minted by the #306 composition intake;
 * - `UX_ROLE_IDENTITY_COLLAPSE` — UX definition and interaction contract share
 *   one identity tuple (roles must stay separately referrable);
 * - `PRESENTATION_ADAPTER_CANNOT_SATISFY` — a UX/presentation-family reference
 *   used as satisfaction provider (APPLICATION_MANIFEST §7.4);
 * - `INVALID_SATISFACTION_EVIDENCE` — evidence without exact requirement link,
 *   runtime-family provider, target binding, or P6 provenance;
 * - `LIFECYCLE_BINDING_INPUT_REJECTED` — a lifecycle RuntimeBinding/activation
 *   object presented into the compatibility path;
 * - `AUTHORITY_DIVERGENCE` — result/validation authority tuple mismatch;
 * - `INVALID_COMPATIBILITY_RESULT` — forged result records.
 *
 * No code carries or suggests a substitute/default/latest resolution.
 */
export type DacV003CompatibilityErrorCode = 'INVALID_COMPATIBILITY_REQUEST' | 'NOT_A_SELECTED_COMPOSITION_VALIDATION' | 'UX_ROLE_IDENTITY_COLLAPSE' | 'PRESENTATION_ADAPTER_CANNOT_SATISFY' | 'INVALID_SATISFACTION_EVIDENCE' | 'LIFECYCLE_BINDING_INPUT_REJECTED' | 'AUTHORITY_DIVERGENCE' | 'INVALID_COMPATIBILITY_RESULT';
/** Fail-closed error surface for the DAC v0.0.3 compatibility authority. */
export declare class DacV003CompatibilityError extends Error {
    readonly code: DacV003CompatibilityErrorCode;
    readonly details: readonly string[];
    constructor(code: DacV003CompatibilityErrorCode, message: string, details?: readonly string[]);
}
//# sourceMappingURL=contracts.d.ts.map