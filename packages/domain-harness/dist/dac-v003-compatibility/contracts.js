// Issue #325 / DAC v0.0.3 V3-002 (reviewed #319 R1 Task DAG, planning gate
// PASS comment 5793326420): compatibility / HostBinding / interaction closure.
//
// This module is the bounded DAC v0.0.3 compatibility-validation authority
// built on the #323 V3-001 foundation (src/dac-v003/**) and the merged A2
// surfaces: #306 composition intake (genuine stage-3 exact-selection
// validation is the mandatory upstream evidence input), #307 runtime binding
// (this module never mints or accepts RuntimeBinding/activation evidence —
// validation is stage 3, binding is stage 4), #308 UX bridge (renderer-
// independent UX semantic-role anchors only).
//
// Owned obligations (APPLICATION_MANIFEST §3/§7.4/§8/§9/§12,
// CROSS_LAYER_REFERENCES §6.2/§6.3/§8, conformance C43/C44/C53–C59):
//
//   - RuntimeHostBindingRequirementRef != RuntimeHostBindingRef !=
//     RuntimeBindingRef stays structural: requirement declarations, concrete
//     host-binding satisfaction providers, and v0.0.2 lifecycle binding refs
//     each fail closed in every wrong position;
//   - DomainUXDefinitionRef and RuntimeInteractionContractRef are exactly-1
//     semantic contracts, distinct from each other and from renderer/
//     presentation identity (no renderer slot exists anywhere on this
//     surface; #308 bridge anchors are correlation evidence only);
//   - required Capability / Port / Host-Binding requirements are closed
//     against exact satisfaction evidence; missing required evidence can
//     only produce INCOMPATIBLE, never COMPATIBLE;
//   - missing required compatibility target => FAIL_CLOSED; explicit
//     unsupported target => INCOMPATIBLE (repaired #34 rule, C43/C44);
//   - exactly one subject/target-bound compatibility-validation authority:
//     one authority scope and a deterministic closure-derived validation
//     identity, with CompatibilityValidationRef and CompatibilityResultRef
//     encoded separately but resolving to that same authority (§6.3/§12.2);
//   - incompatibility is terminal: no auto-latest/default/substitute
//     surface, and no ApplicationSelectionRef is ever manufactured (the only
//     selection evidence is the upstream #306 verdict pass-through).
//
// It does NOT implement Manifest cardinality/storage (V3-004), external-
// operation semantics (V3-003), promotion/selection, or Runtime
// binding/activation/transition authority.
//
// Portable leaf module: no Node built-ins, no engine/observation/control
// imports, no DAC product dependency, no edits to historical v0.0.2 adapter
// semantics. Composition happens only in the public barrels.
/** Exact identity of this compatibility-validation authority surface. */
export const DAC_V003_COMPATIBILITY_AUTHORITY_VERSION = 'dac-v003-compatibility-authority/1';
/**
 * The single compatibility-validation authority scope (CROSS_LAYER_REFERENCES
 * §6.3/§7.3, APPLICATION_MANIFEST §12.2). Every minted validation act
 * (`CompatibilityValidationRef`) and every separately-encoded result
 * (`CompatibilityResultRef`) carries exactly this scope, so both semantic
 * views always resolve to one and the same validation authority and no second
 * authority can be synthesized for the same exact subject/target.
 */
export const DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE = 'domain-harness://dac-v003/compatibility-validation';
/**
 * UX semantic roles the interaction-contract closure can cover
 * (CROSS_LAYER_REFERENCES §5 UX family; APPLICATION_MANIFEST §9). This is a
 * COVERAGE vocabulary only: an application is not forced to use every role —
 * but every material role its UX definition requires must be covered.
 */
export const DAC_V003_UX_SEMANTIC_ROLES = [
    'domain-intent',
    'semantic-target',
    'ux-view',
    'ux-snapshot',
    'ux-watch',
    'ux-outcome',
    'ux-recovery-correlation',
];
/**
 * Requirement strength/cardinality semantics (APPLICATION_MANIFEST §8.1/§8.2):
 * exactly 1 per requirement descriptor. A conditional requirement is only
 * applicable when its auditable condition descriptor is declared to hold in
 * the validation request; applicability is recorded, never guessed.
 */
export const DAC_V003_REQUIREMENT_STRENGTHS = [
    'required',
    'optional',
    'conditional',
];
/** Requirement kinds whose satisfaction this authority closes (§8). */
export const DAC_V003_REQUIREMENT_KINDS = [
    'capability',
    'port',
    'host-binding',
];
/** Fail-closed error surface for the DAC v0.0.3 compatibility authority. */
export class DacV003CompatibilityError extends Error {
    code;
    details;
    constructor(code, message, details = []) {
        super(`[${code}] ${message}`);
        this.name = 'DacV003CompatibilityError';
        this.code = code;
        this.details = details;
    }
}
//# sourceMappingURL=contracts.js.map