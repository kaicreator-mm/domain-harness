// Issue #357 / A41-003 (reviewed #353 Task DAG; trigger comment 5851585053):
// bounded CONSUMER/VERIFIER surface — never an issuer — for DAC v0.0.4.1
// successor compatibility/capability/refusal/currentness semantics
// (LIFECYCLE_REFERENCE_REPAIRS.md §5 F-05 two-view clarification and §4.2
// AuthorityRefusalRef; APPLICATION_MANIFEST.md §§8–§11; ASSEMBLY_CAPABILITY_
// EXCHANGE.md §5 + §13 precedence; CONFORMANCE_MATRIX.md rows C84/C85/C98/
// C99/C144 and the v0.0.4.1 additive C150–C153/C170/C171) at the exact
// successor semantic freeze pinned by the A41-001 foundation (commit
// 75fee75b… / tree c74cf5e3…).
//
// This module classifies and verifies EXTERNALLY RECOVERED facts. It never
// mints or issues a CompatibilityValidationRef / CompatibilityResultRef, an
// ApplicationSelectionRef, a RuntimeBindingRef or a RuntimeActivationRef, and
// never expands a compatibility designation: a compatibility PASS produced
// here is a distinct, bounded verdict that implies NOTHING about
// ApplicationSelection, RuntimeBinding or RuntimeActivation
// (APPLICATION_MANIFEST §10; C107). Refusal/negative evidence can verify and
// report incompatibility but can NEVER manufacture a target, selection,
// binding or activation authority: no success-style outcome is derivable
// from negative evidence alone (§4.2; C142/C156-family).
//
// C144 two-view/same-validation-authority semantics are preserved exactly as
// frozen: CompatibilityValidationRef and CompatibilityResultRef are
// separately recoverable semantic views of ONE validation authority; one
// concrete immutable record MAY carry both views, but co-storage must never
// alias the request identity, synthesize a second authority, or create
// contradictory dispositions inside that one record (LIFECYCLE_REFERENCE_
// REPAIRS §5). The one-authority invariant is LOCAL to the two views of the
// SAME validation record: a second independently-issued validation for the
// same exact subject is not an association defect — mutually consistent
// multiple validations are permitted (APPLICATION_MANIFEST §11), and
// contradiction/currentness across them belongs to the C98/C157 precedence
// rungs of the classifier below, never to this association verifier.
//
// Like the foundation and the authority module, this module freezes NO wire
// schema, serialization, cryptography, clock, storage or transport. Portable:
// no Node built-ins, no engine internals, no imports from any historical DAC
// adapter. Imports only the A41-001 foundation contracts/guards.
/**
 * The closed compatibility seam role chain (CROSS_LAYER_REFERENCES §6 chain
 * carried forward by LIFECYCLE_REFERENCE_REPAIRS §5; C89):
 *
 *   CompatibilityValidationRequestRef != CompatibilityValidationRef
 *                                            != CompatibilityResultRef
 *
 * The three roles are pairwise role distinctions whose identities MUST
 * remain distinct at every material seam. Presence here creates no storage
 * obligation: one immutable record MAY carry the two view roles (C144).
 */
export const DAC_V0041_COMPATIBILITY_SEAM_ROLES = [
    'compatibility-validation-request',
    'compatibility-validation',
    'compatibility-result',
];
/**
 * AuthorityRefusal seam kinds (LIFECYCLE_REFERENCE_REPAIRS §4.2): the seams
 * whose positive artifact cannot itself carry negative polarity. Note that
 * compatibility is NOT a refusal seam — compatibility carries its own
 * polarity via INCOMPATIBLE, and an AuthorityRefusalRef is distinct from a
 * compatibility INCOMPATIBLE result (C142: reclassifying a refusal as
 * compatibility INCOMPATIBLE — or the reverse — is rejected).
 */
export const DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS = [
    'authority-designation',
    'application-identity-establishment',
    'manifest-issuance',
    'runtime-binding',
    'runtime-activation',
];
/**
 * Frozen result-view disposition vocabulary for the compatibility seam
 * (foundation `DAC_V0041_REFERENCE_DISPOSITIONS` restricted to the two
 * terminal compatibility verdicts). Only A41-003 may produce these.
 */
export const DAC_V0041_COMPATIBILITY_DISPOSITIONS = [
    'COMPATIBLE',
    'INCOMPATIBLE',
];
//# sourceMappingURL=contracts.js.map