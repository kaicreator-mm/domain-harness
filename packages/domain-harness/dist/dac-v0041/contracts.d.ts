/**
 * Exact identity of this adapter surface. Carried by every adopted/minted
 * reference so foreign/mis-tagged objects fail closed instead of being
 * guessed. A v0.0.2 or v0.0.3 adopted reference is structurally foreign to
 * this adapter version and is rejected by every guard here.
 */
export declare const DAC_V0041_REFERENCE_ADAPTER_VERSION: "dac-v0041-reference-adapter/1";
/**
 * The exact DAC v0.0.4.1 successor baseline this adapter is version-bound
 * to: the semantic freeze commit AND its tree, as fixed by audit #348 /
 * reviewed DAG #353 / task #355. The status-only descendants
 * (`192091e…` for v0.0.4, `07593ac…` for v0.0.4.1) are evidence/index
 * reconciliation only and are NOT substituted for these semantic freeze
 * identities. Any reference presented under a different baseline/contract is
 * rejected (`UNSUPPORTED_DAC_BASELINE`) rather than interpreted
 * optimistically.
 */
export declare const DAC_V0041_BASELINE: Readonly<{
    readonly contract: "domain-application-contract";
    readonly version: "v0.0.4.1";
    readonly semanticFreezeCommit: "75fee75b782ac229720dccd18d2a4ca54b285e51";
    readonly semanticFreezeTree: "c74cf5e3a0e6745da3eda6999836b61ee8103c60";
}>;
export type DacV0041Baseline = typeof DAC_V0041_BASELINE;
/** Baseline identity a caller presents when adopting a successor reference. */
export interface DacV0041BaselineInput {
    readonly contract: string;
    readonly version: string;
    readonly semanticFreezeCommit: string;
    readonly semanticFreezeTree: string;
}
/**
 * The ONLY purpose for which predecessor baseline identities are retained by
 * this foundation: transition/adoption evidence (LIFECYCLE_REFERENCE_
 * REPAIRS §6 — an authority-bearing artifact lacking v0.0.4.1-valid
 * issuance-time designation evidence must not be used directly in a
 * v0.0.4.1 authoritative chain; the only positive transition path for an
 * adoptable class is fresh issuance or a valid AuthorityAdoptionRef, which
 * A41-002 verifies). A predecessor identity carried here is never
 * interpreted as successor authority, never satisfies the successor pin and
 * never upgrades historical evidence into v0.0.4.1 conformance.
 */
export declare const DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE: "transition-or-adoption-evidence-only";
/**
 * Frozen predecessor baseline identities (F-06 / C105). Immutable history:
 * v0.0.3 is the released Harness conformance baseline (DAC freeze per
 * src/dac-v003/contracts.ts) and v0.0.4 is the frozen intermediate successor
 * this repository never shipped as a Harness release. Both are retained
 * exactly so later transition/adoption evidence (A41-002) can bind the
 * exact historic artifact and its origin DAC/reference profile; neither is
 * ever accepted as `DAC_V0041_BASELINE`.
 */
export declare const DAC_V0041_PREDECESSOR_BASELINES: readonly DacV0041PredecessorBaseline[];
/**
 * Frozen element type of {@link DAC_V0041_PREDECESSOR_BASELINES}: one exact
 * predecessor baseline identity plus its evidence-only purpose tag.
 */
export interface DacV0041PredecessorBaseline {
    readonly contract: 'domain-application-contract';
    readonly version: 'v0.0.3' | 'v0.0.4';
    readonly semanticFreezeCommit: string;
    readonly semanticFreezeTree: string;
    readonly purpose: typeof DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE;
}
/**
 * Canonical successor role registry as closed kebab-case vocabulary:
 * every predecessor v0.0.3 registry role is imported unchanged by exact
 * predecessor identity (CROSS_LAYER_REFERENCES §3), plus the v0.0.4/v0.0.4.1
 * additive roles material to assembly (§3.1 request roles, §3.2
 * authority/result/artifact roles, LIFECYCLE_REFERENCE_REPAIRS §3
 * DomainAuthoringResultRef, §4 ApplicationIdentityEstablishmentRef /
 * seam-typed AuthorityRefusalRef, §6 AuthorityAdoptionRef).
 *
 * This is shared VOCABULARY for later A41 consumers; only the roles listed
 * in `DAC_V0041_FOUNDATION_REQUEST_ROLES` get dedicated nominal
 * types/constructors in this foundation. Presence of a name here creates no
 * decision, evaluation, issuance or lifecycle authority — in particular
 * `authority-designation` and `authority-adoption` are registry names only
 * (their verification belongs to A41-002, their issuance is never owned by
 * this repository).
 */
export declare const DAC_V0041_ROLE_REGISTRY: readonly ["domain-data-semantic", "domain-data-revision", "promoted-domain-data", "selected-domain-data", "manifest", "application-semantic", "application-revision", "manifest-content-digest", "runtime-contract", "compatibility-target", "runtime-implementation", "runtime-host-binding-requirement", "runtime-host-binding", "runtime-binding", "runtime-activation", "domain-ux-definition", "runtime-interaction-contract", "domain-intent", "semantic-target", "ux-view", "ux-snapshot", "ux-watch", "ux-outcome", "ux-recovery-correlation", "promotion-decision", "application-selection", "compatibility-validation", "compatibility-result", "evidence", "conformance-evidence", "simulation-request", "simulation-result", "finding", "domain-finding", "counterexample", "domain-counterexample", "scenario", "regression-comparison", "parent-revision", "derivation", "provenance", "authored-candidate", "evolution-operation", "evolution-request", "authoring-capability-request", "authoring-capability-result", "evolved-candidate", "capability-requirement", "port-requirement", "capability-satisfaction-evidence", "external-authority", "logical-operation", "correlation", "observation", "external-observation", "attempt", "provider-operation", "idempotency-identity", "authoritative-effect-record", "reconciliation", "recovery-capability", "external-capability", "authority-designation-request", "domain-authoring-request", "domain-authoring-result", "application-identity-establishment-request", "application-identity-establishment", "promotion-request", "application-selection-request", "manifest-issuance-request", "compatibility-validation-request", "runtime-binding-request", "runtime-activation-request", "conformance-request", "authority-designation", "conformance-verdict", "provider-capability-descriptor", "domain-application-assembly-plan", "authority-refusal", "authority-adoption"];
export type DacV0041RegistryRole = (typeof DAC_V0041_ROLE_REGISTRY)[number];
/**
 * The request roles this foundation owns with dedicated nominal surfaces —
 * the two Harness-owned seam request roles whose absence the #348 audit
 * recorded against C89/C108:
 *
 *   - `compatibility-validation-request` (CompatibilityValidationRequestRef)
 *   - `runtime-binding-request` (RuntimeBindingRequestRef)
 *
 * The remaining request roles stay registry vocabulary until their owning
 * A41 concern materializes them.
 */
export declare const DAC_V0041_FOUNDATION_REQUEST_ROLES: readonly ["compatibility-validation-request", "runtime-binding-request"];
export type DacV0041FoundationRequestRole = (typeof DAC_V0041_FOUNDATION_REQUEST_ROLES)[number];
/**
 * Universal request/result anti-alias chains (CROSS_LAYER_REFERENCES §6,
 * tightened by LIFECYCLE_REFERENCE_REPAIRS §§3–5). Each chain lists roles
 * whose identities MUST remain pairwise distinct at every material seam:
 *
 *   request identity != result / decision / definition identity
 *
 * Data form so tests and later A41 consumers can assert the frozen chains.
 * The chains are semantic groups for identity separation, not authority
 * equivalence classes.
 */
export declare const DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS: readonly [readonly ["authority-designation-request", "authority-designation"], readonly ["domain-authoring-request", "domain-authoring-result", "authored-candidate"], readonly ["application-identity-establishment-request", "application-identity-establishment", "application-semantic"], readonly ["promotion-request", "promotion-decision"], readonly ["application-selection-request", "application-selection"], readonly ["manifest-issuance-request", "manifest"], readonly ["compatibility-validation-request", "compatibility-validation", "compatibility-result"], readonly ["runtime-binding-request", "runtime-binding", "runtime-host-binding"], readonly ["runtime-activation-request", "runtime-activation"], readonly ["conformance-request", "conformance-verdict"]];
export type DacV0041AliasChainRole = (typeof DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS)[number][number];
/**
 * Nominal base shared by every adopted/minted successor DAC v0.0.4.1
 * reference. Mirrors the Base Reference Obligations carried forward from the
 * predecessor (role/kind + authority/source scope + role-specific primary
 * identity, each exactly 1); `locatorHints` stays discovery-only and
 * `opaque` carries unknown/PROVISIONAL source fields verbatim, never
 * interpreted.
 *
 * `predecessorOrigin` is the only predecessor-facing slot: when present it
 * MUST name exactly one frozen predecessor baseline and exists solely as
 * transition/adoption evidence input for the A41-002 verifier. It never
 * makes this reference valid under the predecessor baseline and never
 * carries authority.
 */
export interface DacV0041ReferenceEnvelope {
    readonly adapter: typeof DAC_V0041_REFERENCE_ADAPTER_VERSION;
    readonly baseline: DacV0041Baseline;
    readonly role: DacV0041RegistryRole;
    readonly authorityScope: string;
    readonly primaryIdentity: string;
    readonly semanticIdentity?: string;
    readonly revisionIdentity?: string;
    readonly contentDigest?: string;
    /** Contract/profile version identity when interpretation depends on it. */
    readonly contractProfileIdentity?: string;
    readonly locatorHints: readonly string[];
    /**
     * Transition/adoption evidence input only (F-06): the exact predecessor
     * DAC baseline the referenced historic artifact originates from. Presence
     * grants no authority and never substitutes the successor baseline.
     */
    readonly predecessorOrigin?: DacV0041PredecessorBaseline;
    readonly opaque: Readonly<Record<string, unknown>>;
}
/** Generic registry-role reference adopted through the shared core. */
export interface DacV0041RegistryReference extends DacV0041ReferenceEnvelope {
    readonly role: DacV0041RegistryRole;
}
/**
 * Shared slots of the two foundation request-role references. A request
 * reference is a REQUEST record only (ASSEMBLY_CAPABILITY_EXCHANGE §3):
 * minting it records that an exact request identity exists and what it
 * carries — it never records that the request was accepted, evaluated or
 * decided, and no field here can occupy a result/decision position.
 */
export interface DacV0041RequestReferenceBase extends DacV0041ReferenceEnvelope {
    /** Identity of the requester that issued the request (exactly 1). */
    readonly requesterIdentity: string;
    /** Exact provider identity the request targets (exactly 1). */
    readonly providerIdentity: string;
    /** Exact capability kind requested (exactly 1). */
    readonly requestedCapabilityKind: string;
    /**
     * Exact descriptor/profile identity the request is bound to, when the
     * seam relies on one (0..1).
     */
    readonly descriptorRef?: DacV0041ReferenceEnvelope;
    /**
     * Exact material subject/input refs of the request (0..n). Carried for
     * identity only; the classifier facts are supplied separately by the
     * owning seam.
     */
    readonly materialInputRefs: readonly DacV0041ReferenceEnvelope[];
    /**
     * The binding explicit target/profile of the request under
     * ASSEMBLY_CAPABILITY_EXCHANGE §4.1 (0..1; MUST be an adopted
     * `compatibility-target` reference). Advisory target hints can NEVER
     * occupy this slot — they travel in `advisoryTargetHints`.
     */
    readonly bindingTargetRef?: DacV0041ReferenceEnvelope;
    /**
     * Advisory target/profile hints (§4.2): discovery/routing/preference
     * values, separately classified and never authoritative. The guards never
     * read them for classification.
     */
    readonly advisoryTargetHints: readonly string[];
}
/**
 * C89: the compatibility seam request role. Identity MUST remain distinct
 * from `compatibility-validation` and `compatibility-result` view identities
 * (one concrete record MAY carry both result views under F-05, but never the
 * request). Compatibility EVALUATION is not owned here (A41-003).
 */
export interface CompatibilityValidationRequestRef extends DacV0041RequestReferenceBase {
    readonly role: 'compatibility-validation-request';
}
/**
 * C108: the Runtime binding seam request role. Identity MUST remain distinct
 * from `runtime-binding` and `runtime-host-binding` identities. Runtime
 * binding/activation BEHAVIOR is not owned here (A41-005).
 */
export interface RuntimeBindingRequestRef extends DacV0041RequestReferenceBase {
    readonly role: 'runtime-binding-request';
}
export type DacV0041Reference = CompatibilityValidationRequestRef | RuntimeBindingRequestRef | DacV0041RegistryReference;
/** Input accepted when adopting any successor reference. */
export interface DacV0041ReferenceInput {
    readonly baseline: DacV0041BaselineInput;
    readonly authorityScope: string;
    readonly primaryIdentity: string;
    readonly semanticIdentity?: string;
    readonly revisionIdentity?: string;
    readonly contentDigest?: string;
    readonly contractProfileIdentity?: string;
    readonly locatorHints?: readonly string[];
    readonly predecessorOrigin?: DacV0041PredecessorBaseline;
    readonly opaque?: Readonly<Record<string, unknown>>;
}
/** Input accepted when minting one of the two foundation request roles. */
export interface DacV0041RequestReferenceInput extends DacV0041ReferenceInput {
    readonly requesterIdentity: string;
    readonly providerIdentity: string;
    readonly requestedCapabilityKind: string;
    readonly descriptorRef?: DacV0041Reference;
    readonly materialInputRefs?: readonly DacV0041Reference[];
    readonly bindingTargetRef?: DacV0041Reference;
    readonly advisoryTargetHints?: readonly string[];
}
/**
 * Reference / Compatibility Disposition namespace carried forward unchanged
 * (v0.0.3 CROSS_LAYER_REFERENCES §11; preserved by ASSEMBLY_CAPABILITY_
 * EXCHANGE §1). `COMPATIBLE` is vocabulary only: no function in this module
 * produces it — compatibility evaluation authority belongs to A41-003.
 */
export declare const DAC_V0041_REFERENCE_DISPOSITIONS: readonly ["FAIL_CLOSED", "STALE", "INCOMPATIBLE", "COMPATIBLE"];
export type DacV0041ReferenceDispositionValue = (typeof DAC_V0041_REFERENCE_DISPOSITIONS)[number];
/**
 * Authoring / Capability Exchange outcome namespace, preserved unchanged
 * from the v0.0.3/v0.0.4 surface (ASSEMBLY_CAPABILITY_EXCHANGE §1), plus the
 * `pending/in-progress` representation class permitted while an invocation
 * is incomplete. The namespace stays separate from the disposition
 * namespace above (cross-namespace anti-conflation §10).
 */
export declare const DAC_V0041_CAPABILITY_OUTCOME_CLASSES: readonly ["accepted-for-evaluation", "pending/in-progress", "produced-result", "rejected/invalid-input", "blocked/missing-capability", "failed-known-no-result", "unknown/ambiguous-production"];
export type DacV0041CapabilityOutcomeClass = (typeof DAC_V0041_CAPABILITY_OUTCOME_CLASSES)[number];
/**
 * Outcome polarity table (ASSEMBLY_CAPABILITY_EXCHANGE §6; C156/C158
 * foundation): only `produced-result` proves that a separately referrable
 * substantive result exists — and even then the decision may be favorable
 * OR negative (`produced-result != favorable result`). Every other class,
 * including `accepted-for-evaluation` and `pending/in-progress`, proves no
 * decision/result exists and can never be presented as approval.
 */
export declare const DAC_V0041_CAPABILITY_OUTCOME_PRODUCES_RESULT: Readonly<Record<DacV0041CapabilityOutcomeClass, boolean>>;
/**
 * Currentness-use states a consumer can present for an artifact/result it
 * intends to carry forward, with the vocabulary kept minimal and closed.
 * Unknown/undecidable currentness is NOT representable as a passing value —
 * the classifier fails closed on it.
 */
export declare const DAC_V0041_CURRENTNESS_USE_STATES: readonly ["current", "stale", "superseded", "revoked", "voided"];
export type DacV0041CurrentnessUseState = (typeof DAC_V0041_CURRENTNESS_USE_STATES)[number];
/**
 * Deterministic classification phases of the capability/currentness
 * precedence (ASSEMBLY_CAPABILITY_EXCHANGE §5 + v0.0.4.1 §13). The phase
 * order is frozen: descriptor establishment, capability kind, required
 * exactness/currentness, binding explicit target support, and only then the
 * provider capability evaluation namespace.
 */
export declare const DAC_V0041_CAPABILITY_EXCHANGE_PHASES: readonly ["descriptor-establishment", "capability-kind", "exactness-currentness", "target-support", "evaluation"];
export type DacV0041CapabilityExchangePhase = (typeof DAC_V0041_CAPABILITY_EXCHANGE_PHASES)[number];
/**
 * Externally recoverable request/descriptor facts the deterministic
 * classifier consumes (ASSEMBLY_CAPABILITY_EXCHANGE §5: classification MUST
 * use externally recoverable facts and MUST NOT depend on a provider's
 * internal evaluation order). The classifier never invents, infers or
 * defaults a fact: an absent/contradictory fact is supplied by the caller
 * as its explicit failure shape.
 */
export interface DacV0041CapabilityExchangeFacts {
    /**
     * Step 0 (§13.1): whether a role-valid current exact
     * ProviderCapabilityDescriptorRef has been established. When false, there
     * is no capability-kind judgment from a stale, mutable, inferred or
     * provider-default descriptor.
     */
    readonly currentDescriptorEstablished: boolean;
    /**
     * Step 1: capability kinds the CURRENT exact descriptor offers (empty
     * array allowed). Never read from a stale/reused descriptor.
     */
    readonly currentDescriptorOfferedCapabilityKinds: readonly string[];
    /** The exact capability kind the request asks for. */
    readonly requestedCapabilityKind: string;
    /**
     * Step 2a (§13.2): false when any role-required exact material input is
     * missing, contradictory, malformed or otherwise structurally invalid for
     * the request. Structural invalidity dominates coexisting staleness.
     */
    readonly requiredInputsStructurallyValid: boolean;
    /**
     * Step 2b (§13.2): whether a material input, exact target/profile,
     * current-descriptor-dependent fact, or relied-upon reusable result is
     * stale under the owning contract.
     */
    readonly materialStaleness: boolean;
    /**
     * Step 3 (§4): the binding explicit target/profile state of the request.
     * `presence: 'missing'` means the request carries no binding explicit
     * target (advisory hints are NOT represented here — they are
     * non-authoritative and can never satisfy or occupy this slot). Support
     * classification beyond `unsupported` belongs to the owning compatibility
     * evaluation (A41-003), so the explicit shape is restricted exactly like
     * the historical v0.0.3 foundation.
     */
    readonly bindingTargetState: {
        readonly presence: 'missing';
    } | {
        readonly presence: 'explicit';
        readonly declaredSupport: 'unsupported';
    };
}
/**
 * Terminal classification of one capability-exchange request under the
 * frozen precedence. `phase: 'evaluation'` means Steps 0–3 all passed and
 * the owning seam MAY proceed to its capability evaluation namespace; this
 * foundation still produces no evaluation outcome, no COMPATIBLE
 * disposition and no target/binding authority.
 */
export type DacV0041CapabilityExchangeClassification = {
    readonly phase: 'descriptor-establishment';
    readonly disposition: 'FAIL_CLOSED';
} | {
    readonly phase: 'capability-kind';
    readonly outcome: 'blocked/missing-capability';
    readonly targetNotJudged: true;
} | {
    readonly phase: 'exactness-currentness';
    readonly disposition: 'FAIL_CLOSED' | 'STALE';
} | {
    readonly phase: 'target-support';
    readonly disposition: 'INCOMPATIBLE';
} | {
    readonly phase: 'evaluation';
};
/**
 * Deterministic currentness-use classification of carrying an artifact or
 * result forward (LIFECYCLE_REFERENCE_REPAIRS §7; C157):
 *   - `revoked`/`voided` => FAIL_CLOSED (invalidated selection/result);
 *   - `stale`/`superseded` => STALE (non-current reusable artifact);
 *   - `current` => usable for the owning seam's own further checks.
 * Unknown states are not representable; the classifier fails closed on
 * them rather than guessing.
 */
export type DacV0041CurrentnessUseClassification = {
    readonly state: 'current';
    readonly usable: true;
} | {
    readonly state: 'stale' | 'superseded';
    readonly disposition: 'STALE';
} | {
    readonly state: 'revoked' | 'voided';
    readonly disposition: 'FAIL_CLOSED';
};
export type DacV0041ReferenceErrorCode = 'UNSUPPORTED_DAC_BASELINE' | 'INVALID_PREDECESSOR_ORIGIN' | 'INVALID_REFERENCE' | 'MUTABLE_ALIAS_REJECTED' | 'IDENTITY_MISMATCH' | 'ROLE_MISMATCH' | 'REQUEST_RESULT_ALIAS' | 'ADVISORY_HINT_NOT_BINDING_TARGET' | 'INVALID_FACTS' | 'INVALID_CURRENTNESS_STATE';
/** Fail-closed error surface for the successor foundation. */
export declare class DacV0041ReferenceError extends Error {
    readonly code: DacV0041ReferenceErrorCode;
    constructor(code: DacV0041ReferenceErrorCode, message: string);
}
//# sourceMappingURL=contracts.d.ts.map