import { type ApplicationSelectionRef, type CompatibilityTargetRef, type DacReference, type DacReferenceAdoptionInput, type DacReferenceIdentityExpectation, type DacReferenceRole, type PromotionDecisionRef, type RuntimeActivationRef, type RuntimeBindingRef, type RuntimeContractRef, type RuntimeImplementationRef, type SelectedDomainDataRef } from './contracts.js';
/** Adopt upstream governance promotion-decision provenance. */
export declare function adoptPromotionDecisionRef(input: DacReferenceAdoptionInput): PromotionDecisionRef;
/** Adopt application/composition-layer selection provenance. */
export declare function adoptApplicationSelectionRef(input: DacReferenceAdoptionInput): ApplicationSelectionRef;
/** Adopt the exact selected Domain Data identity (revision + digest required). */
export declare function adoptSelectedDomainDataRef(input: DacReferenceAdoptionInput): SelectedDomainDataRef;
/** Adopt a Runtime contract identity reference. */
export declare function adoptRuntimeContractRef(input: DacReferenceAdoptionInput): RuntimeContractRef;
/** Adopt a concrete Runtime implementation identity reference. */
export declare function adoptRuntimeImplementationRef(input: DacReferenceAdoptionInput): RuntimeImplementationRef;
/** Adopt an explicit compatibility-target reference. */
export declare function adoptCompatibilityTargetRef(input: DacReferenceAdoptionInput): CompatibilityTargetRef;
/** Adopt Runtime binding evidence (never selection, never activation). */
export declare function adoptRuntimeBindingRef(input: DacReferenceAdoptionInput): RuntimeBindingRef;
/** Adopt Runtime activation evidence (never selection, never binding). */
export declare function adoptRuntimeActivationRef(input: DacReferenceAdoptionInput): RuntimeActivationRef;
/** Structural guard for any adopted DAC reference (unknown-safe). */
export declare function isDacReference(value: unknown): value is DacReference;
/** Exact role of an adopted reference; `undefined` for non-references. */
export declare function getDacReferenceRole(value: unknown): DacReferenceRole | undefined;
export declare function isPromotionDecisionRef(v: unknown): v is PromotionDecisionRef;
export declare function isApplicationSelectionRef(v: unknown): v is ApplicationSelectionRef;
export declare function isSelectedDomainDataRef(v: unknown): v is SelectedDomainDataRef;
export declare function isRuntimeContractRef(v: unknown): v is RuntimeContractRef;
export declare function isRuntimeImplementationRef(v: unknown): v is RuntimeImplementationRef;
export declare function isCompatibilityTargetRef(v: unknown): v is CompatibilityTargetRef;
export declare function isRuntimeBindingRef(v: unknown): v is RuntimeBindingRef;
export declare function isRuntimeActivationRef(v: unknown): v is RuntimeActivationRef;
export declare function expectPromotionDecisionRef(v: unknown): asserts v is PromotionDecisionRef;
export declare function expectApplicationSelectionRef(v: unknown): asserts v is ApplicationSelectionRef;
export declare function expectSelectedDomainDataRef(v: unknown): asserts v is SelectedDomainDataRef;
export declare function expectRuntimeContractRef(v: unknown): asserts v is RuntimeContractRef;
export declare function expectRuntimeImplementationRef(v: unknown): asserts v is RuntimeImplementationRef;
export declare function expectCompatibilityTargetRef(v: unknown): asserts v is CompatibilityTargetRef;
export declare function expectRuntimeBindingRef(v: unknown): asserts v is RuntimeBindingRef;
export declare function expectRuntimeActivationRef(v: unknown): asserts v is RuntimeActivationRef;
/**
 * Fail-closed exact-identity verification. Every supplied expectation must
 * equal the adopted reference's field exactly (including expectation of a
 * field the reference does not carry). Nothing is normalized, resolved or
 * defaulted; any mismatch throws `IDENTITY_MISMATCH`.
 */
export declare function verifyDacReferenceIdentity(reference: DacReference, expectation: DacReferenceIdentityExpectation): void;
/**
 * Fail-closed classification guard: no adapter-adopted reference — in
 * particular no `RuntimeImplementationRef` — can ever be presented as an
 * external Business System-of-Record/Truth identity. Throws
 * `EXTERNAL_IDENTITY_FORBIDDEN` for any adopted DAC reference; this adapter
 * deliberately exposes no external-authority adoption surface at all.
 */
export declare function refuteExternalBusinessSoRIdentity(value: unknown): void;
//# sourceMappingURL=guards.d.ts.map