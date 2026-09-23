// Issue #305 / A2 I-002 (reviewed Product/L2 A2 chain): DAC cross-layer
// reference adapter core — dependency-light public type/adapter boundary for
// the DAC-owned semantic roles required by A2 G1/G2.
//
// The DAC baseline (domain-application-contract v0.0.2 CROSS_LAYER_REFERENCES)
// freezes the *semantic* reference roles and their required inequalities, but
// explicitly marks the exact envelope field set, encodings and resolution API
// shape PROVISIONAL. This adapter therefore freezes ONLY:
//
//   - the nominal semantic roles (one per lifecycle authority stage);
//   - the exact DAC baseline it is bound to (fails closed on any other);
//   - the minimum exact identity fields needed for fail-closed consumption;
//   - opaque preservation of unknown/provisional fields.
//
// It does NOT freeze a wire schema, transport encoding, CrossLayerRef field
// decomposition, or serialization format. It creates no second DomainHarness
// identity authority: DAC remains the semantic owner of every role here; this
// module only adopts, preserves and guards them.
//
// Mandatory role inequalities (each guarded nominally at the type level and
// fail-closed at runtime — no conversion function exists between roles, so no
// lifecycle role can ever be manufactured from another):
//
// ```text
// PromotionDecisionRef  != ApplicationSelectionRef
// ApplicationSelection  != CompatibilityTargetRef (compatibility validation)
// ApplicationSelection  != RuntimeBindingRef
// RuntimeBindingRef     != RuntimeActivationRef
// RuntimeContractRef    != RuntimeImplementationRef
// ```
//
// This module deliberately imports nothing from the observation stream
// (#312), the generic control concern (#313), or any DAC product
// implementation — concern separation per the A2 authority matrix.
/**
 * Exact identity of this adapter surface. Carried by every adopted reference
 * so foreign/mis-tagged objects fail closed instead of being guessed.
 */
export const DAC_REFERENCE_ADAPTER_VERSION = 'dac-reference-adapter/1';
/**
 * The exact DAC baseline this adapter is version-bound to. Any reference
 * presented under a different baseline/contract is rejected
 * (`UNSUPPORTED_DAC_BASELINE`) rather than interpreted optimistically.
 */
export const DAC_REFERENCE_BASELINE = {
    contract: 'domain-application-contract',
    version: 'v0.0.2',
    baselineCommit: '9c3ef91b8b40d893e4fe2b0370200e765816ec2b',
};
/**
 * The eight DAC-owned semantic lifecycle roles adopted by this adapter.
 *
 * The role is set exclusively by the matching `adopt*Ref` constructor — a
 * caller can never author a role discriminant directly into a foreign
 * authority's reference, and one role is never rewritable into another.
 */
export const DAC_REFERENCE_ROLES = [
    'promotion-decision',
    'application-selection',
    'selected-domain-data',
    'runtime-contract',
    'runtime-implementation',
    'compatibility-target',
    'runtime-binding',
    'runtime-activation',
];
/** Fail-closed error surface for the DAC reference adapter. */
export class DacReferenceError extends Error {
    code;
    constructor(code, message) {
        super(`[${code}] ${message}`);
        this.name = 'DacReferenceError';
        this.code = code;
    }
}
//# sourceMappingURL=contracts.js.map