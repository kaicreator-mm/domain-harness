import { type CompatibilityValidationRequestRef, type DacV0041CapabilityExchangeClassification, type DacV0041CapabilityExchangeFacts, type DacV0041CapabilityOutcomeClass, type DacV0041CurrentnessUseClassification, type DacV0041CurrentnessUseState, type DacV0041Reference, type DacV0041ReferenceInput, type DacV0041RequestReferenceInput, type DacV0041RegistryRole, type RuntimeBindingRequestRef } from './contracts.js';
/** Type guard: is this value a reference minted by the v0.0.4.1 core? */
export declare function isDacV0041Reference(value: unknown): value is DacV0041Reference;
/**
 * Adopt an arbitrary successor registry-role reference. Identity-only: no
 * role in the registry gains decision, evaluation, issuance or lifecycle
 * authority by being adopted here. In particular `authority-designation` /
 * `authority-adoption` / `compatibility-validation` / `compatibility-result`
 * / `runtime-binding` / `runtime-activation` / promotion / selection /
 * Manifest references carry identity only — their verification belongs to
 * A41-002..A41-006 and their issuance is never owned by this repository.
 *
 * The two foundation request roles are RESERVED: they have dedicated nominal
 * constructors (`mintCompatibilityValidationRequestRef` /
 * `mintRuntimeBindingRequestRef`) that enforce the request-envelope
 * minimums, so generic adoption of exactly those roles fails closed instead
 * of minting a request-shaped carrier that bypasses them.
 */
export declare function adoptDacV0041RegistryReference(input: DacV0041ReferenceInput & {
    readonly role: DacV0041RegistryRole;
}): DacV0041Reference;
/**
 * Mint a `CompatibilityValidationRequestRef` (C89). The request identity is
 * nominal and minted-only; it can never occupy a
 * `compatibility-validation`/`compatibility-result` position, and minting it
 * records no acceptance, evaluation or compatibility decision (A41-003 owns
 * evaluation; F-05 keeps the two result views separable).
 */
export declare function mintCompatibilityValidationRequestRef(input: DacV0041RequestReferenceInput): CompatibilityValidationRequestRef;
/**
 * Mint a `RuntimeBindingRequestRef` (C108). The request identity is nominal
 * and minted-only; it can never occupy a `runtime-binding` or
 * `runtime-host-binding` position, and minting it records no binding,
 * activation or Runtime consequence (A41-005 owns binding/activation
 * behavior).
 */
export declare function mintRuntimeBindingRequestRef(input: DacV0041RequestReferenceInput): RuntimeBindingRequestRef;
/** Type guard for the C89 compatibility seam request role. */
export declare function isCompatibilityValidationRequestRef(value: unknown): value is CompatibilityValidationRequestRef;
/** Type guard for the C108 Runtime binding seam request role. */
export declare function isRuntimeBindingRequestRef(value: unknown): value is RuntimeBindingRequestRef;
/**
 * Universal request/result anti-alias verifier (CROSS_LAYER_REFERENCES §6;
 * C89/C108/C155). Given a minted request reference and one or more minted
 * counterpart references, fails closed (`REQUEST_RESULT_ALIAS`) when a
 * request identity aliases a distinct result/decision/definition identity
 * within the same seam chain — the shape that would make a consumer unable
 * to recover whether an action was merely requested, whether a
 * decision/result actually exists, or which authority acted. Distinct
 * identities across every presented chain position pass.
 */
export declare function verifyDacV0041RequestResultSeparation(request: DacV0041Reference, counterparts: readonly DacV0041Reference[]): void;
/**
 * Deterministic capability-kind/currentness precedence classifier
 * (ASSEMBLY_CAPABILITY_EXCHANGE §5 + v0.0.4.1 §13.1/§13.2; C84/C85/
 * C150-C153/C170/C171). Pure, total and fail-closed:
 *
 *   Step 0  no role-valid current exact descriptor        => FAIL_CLOSED
 *   Step 1  current descriptor lacks capability kind      =>
 *             blocked/missing-capability, target not judged (even when a
 *             pinned/reused input is also stale — C150/C170)
 *   Step 2  structural invalidity                         => FAIL_CLOSED
 *           (dominates coexisting staleness — C152/C153/C171)
 *           else material staleness                       => STALE (C85)
 *   Step 3  binding explicit target unsupported           => INCOMPATIBLE
 *   Step 4  otherwise                                     => evaluation phase
 *
 * The classifier reads only the externally supplied facts, never invents or
 * defaults one (`INVALID_FACTS` on a malformed facts object), never consults
 * advisory hints, and never produces COMPATIBLE or any evaluation outcome.
 */
export declare function classifyDacV0041CapabilityExchange(facts: DacV0041CapabilityExchangeFacts): DacV0041CapabilityExchangeClassification;
/**
 * Deterministic currentness-use classifier for carrying an artifact or
 * result forward (LIFECYCLE_REFERENCE_REPAIRS §7; C157): revoked/voided =>
 * FAIL_CLOSED (invalidated), stale/superseded => STALE, current => usable
 * for the owning seam's own further checks. Unknown states fail closed
 * (`INVALID_CURRENTNESS_STATE`) — currentness is never guessed.
 */
export declare function classifyDacV0041CurrentnessUse(state: DacV0041CurrentnessUseState): DacV0041CurrentnessUseClassification;
/**
 * Outcome polarity lookup (ASSEMBLY_CAPABILITY_EXCHANGE §6; C156/C158):
 * only `produced-result` proves a substantive result exists, and even a
 * produced result may carry a negative decision — produced-result !=
 * favorable. `accepted-for-evaluation`, `pending/in-progress` and every
 * other class are never a decision/approval. Unknown classes fail closed
 * rather than being guessed favorable.
 */
export declare function dacV0041OutcomeProducesResult(outcome: DacV0041CapabilityOutcomeClass): boolean;
//# sourceMappingURL=guards.d.ts.map