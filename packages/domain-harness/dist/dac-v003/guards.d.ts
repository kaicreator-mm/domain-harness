import { type DacV003ExactnessProfile, type DacV003IdentityExpectation, type DacV003Reference, type DacV003ReferenceDisposition, type DacV003ReferenceDispositionValue, type DacV003ReferenceInput, type DacV003RegistryRole, type DacV003RequiredTargetState, type RuntimeHostBindingRef, type RuntimeHostBindingRequirementRef, type RuntimeInteractionContractRef } from './contracts.js';
/**
 * Generic registry-role adoption: the shared exact-reference primitive later
 * V3 tasks build their nominal roles on. Accepts any canonical registry role;
 * enforces the same Base Reference Obligations, alias rejection and (for the
 * three foundation roles) role-specific minimums as the dedicated
 * constructors. Minting a reference never creates the referenced decision,
 * evidence or authority, and this module deliberately provides no
 * compatibility/promotion/selection/external-operation decision semantics.
 */
export declare function adoptDacV003RegistryReference(role: DacV003RegistryRole, input: DacV003ReferenceInput): DacV003Reference;
/**
 * Adopt a composition-declared Runtime Host Binding REQUIREMENT. A
 * declaration only: never concrete binding evidence, never the lifecycle
 * `RuntimeBindingRef` (C56).
 */
export declare function adoptRuntimeHostBindingRequirementRef(input: DacV003ReferenceInput): RuntimeHostBindingRequirementRef;
/**
 * Adopt one CONCRETE host-binding adapter/implementation reference (a
 * conditional compatibility-validation input; not a requirement declaration,
 * not the lifecycle `RuntimeBindingRef`).
 */
export declare function adoptRuntimeHostBindingRef(input: DacV003ReferenceInput): RuntimeHostBindingRef;
/**
 * Adopt the UX↔Runtime semantic interaction contract reference (exactly 1 in
 * the supported composition; semantic compatibility target, not a renderer
 * contract; requires exact semantic + revision identity).
 */
export declare function adoptRuntimeInteractionContractRef(input: DacV003ReferenceInput): RuntimeInteractionContractRef;
/** Structural guard for any adopted DAC v0.0.3 reference (unknown-safe). */
export declare function isDacV003Reference(value: unknown): value is DacV003Reference;
/** Exact registry role of an adopted reference; `undefined` for non-references. */
export declare function getDacV003ReferenceRole(value: unknown): DacV003RegistryRole | undefined;
export declare function isRuntimeHostBindingRequirementRef(v: unknown): v is RuntimeHostBindingRequirementRef;
export declare function isRuntimeHostBindingRef(v: unknown): v is RuntimeHostBindingRef;
export declare function isRuntimeInteractionContractRef(v: unknown): v is RuntimeInteractionContractRef;
export declare function expectRuntimeHostBindingRequirementRef(v: unknown): asserts v is RuntimeHostBindingRequirementRef;
export declare function expectRuntimeHostBindingRef(v: unknown): asserts v is RuntimeHostBindingRef;
export declare function expectRuntimeInteractionContractRef(v: unknown): asserts v is RuntimeInteractionContractRef;
/**
 * Fail-closed exact-identity verification. Every supplied expectation must
 * equal the adopted reference's field exactly (including expectation of a
 * field the reference does not carry). Nothing is normalized, resolved or
 * defaulted; locator hints and opaque fields are never consulted; any
 * mismatch throws `IDENTITY_MISMATCH`.
 */
export declare function verifyDacV003ReferenceIdentity(reference: DacV003Reference, expectation: DacV003IdentityExpectation): void;
/**
 * Fail-closed composable exactness-profile validation (P0–P7). Checks that
 * the adopted reference carries every semantic slot the claimed profile
 * requires (transitively through `requires`), plus the P3 role rule for
 * selected Domain Data (promotion + selection lifecycle authority coverage).
 * Missing/empty slots throw `PROFILE_REQUIREMENT_UNMET` naming every gap; a
 * reference can never claim a stronger exactness class than it carries.
 * Slot PRESENCE only — semantic validity of the referenced content belongs
 * to the owning later-V3 concern, not to this foundation.
 */
export declare function assertDacV003ExactnessProfile(reference: DacV003Reference, profile: DacV003ExactnessProfile): void;
/**
 * Fail-closed revision/digest consistency guard (conformance C40): within one
 * authority scope, the same immutable revision identity with different
 * authoritative content digests is an identity/integrity contradiction with
 * no identity-preserving reconciliation. The same revision identity under a
 * different authority scope is a different object, not a contradiction
 * (digest equality never merges authority — C41).
 */
export declare function assertDacV003RevisionDigestConsistency(references: readonly DacV003Reference[]): void;
/**
 * Fail-closed classification guard (conformance C60): no DAC v0.0.3
 * reference — in particular no Runtime implementation/contract/host-binding
 * reference — can ever be presented as an external Business
 * System-of-Record/Truth identity. Throws `EXTERNAL_IDENTITY_FORBIDDEN` for
 * any adopted v0.0.3 reference; this foundation deliberately exposes no
 * external-authority adoption surface at all (that lane is V3-003's).
 */
export declare function refuteDacV003ExternalBusinessSoRIdentity(value: unknown): void;
/** Construct a namespaced reference/compatibility disposition value. */
export declare function dacV003ReferenceDisposition(value: DacV003ReferenceDispositionValue): DacV003ReferenceDisposition;
/**
 * Namespace guard: only values of the reference/compatibility disposition
 * namespace pass. Foreign outcome values (external-operation outcomes such as
 * `UNKNOWN`/`AUTHORITATIVE_COMMITTED`, authoring exchange outcomes such as
 * `accepted-for-evaluation`) are rejected by construction — anti-conflation
 * is normative, token spelling stays PROVISIONAL.
 */
export declare function isDacV003ReferenceDisposition(value: unknown): value is DacV003ReferenceDisposition;
/**
 * The repaired required-target disposition rule (CROSS_LAYER_REFERENCES §8;
 * conformance C43/C44), as pure vocabulary — no compatibility evaluation
 * happens here:
 *
 * ```text
 * presence 'missing'                                => FAIL_CLOSED
 * presence 'explicit' + declaredSupport 'unsupported' => INCOMPATIBLE
 * ```
 *
 * The input type cannot express "explicit + supported": deciding support of
 * an explicit target is compatibility-evaluation authority owned by V3-002,
 * and this function can never emit `COMPATIBLE`. The withdrawn #34-base
 * missing-target/unknown hybrid disposition is neither representable nor
 * producible.
 */
export declare function classifyDacV003RequiredTargetState(state: DacV003RequiredTargetState): DacV003ReferenceDisposition;
//# sourceMappingURL=guards.d.ts.map