// Issue #358 / A41-004 (reviewed #353 Task DAG; trigger comment 5851586129):
// bounded CONSUMER/VERIFIER surface — never an issuer — for DAC v0.0.4.1
// F-04 composition-intake semantics (LIFECYCLE_REFERENCE_REPAIRS.md §4:
// ApplicationIdentityEstablishmentRef / ApplicationSelectionRef /
// seam-typed AuthorityRefusalRef; APPLICATION_MANIFEST.md §§1–4 successor
// precedence N-002; DOMAIN_DATA_IR.md §2 selection/promotion distinctness)
// at the exact successor semantic freeze pinned by the A41-001 foundation
// (commit 75fee75b… / tree c74cf5e3…) and consuming the A41-002 designation
// chain verifier for issuer authorization.
//
// This module consumes EXTERNALLY RECOVERED evidence and classifies it
// deterministically at composition/binding intake. It never mints, issues,
// establishes, selects, refuses, promotes or publishes any application
// identity, selection, refusal, Manifest or promotion artifact: identity
// establishment, application selection, AuthorityRefusal issuance, promotion
// and Manifest issuance are explicitly NOT owned here (C140/C141/C142/C143;
// APPLICATION_MANIFEST.md §§1–2). Intake can only verify-and-accept or fail
// closed — no selection authority is created, no Manifest is issued, and no
// Manifest evidence is collapsed into live Runtime state (this module has no
// runtime-state reads or writes at all).
//
// Every decision path fails closed — an absent, foreign, stale,
// predecessor-wrapped, unauthorized or mismatched fact is never guessed,
// defaulted, normalized or repaired into a narrower valid one
// (C145/C147/C80/C81). Like the foundation, this module freezes NO wire
// schema, serialization, cryptography, clock, storage or transport.
//
// Portable: no Node built-ins, no engine internals, no imports from any
// historical DAC adapter. Imports only the A41-001 foundation contracts and
// the A41-002 authority contracts.
/**
 * F-04 §4.2: the exact seam kinds a substantive `AuthorityRefusalRef` applies
 * to — refusal of AuthorityDesignationRef issuance, application-identity
 * establishment, Manifest issuance, Runtime binding and Runtime activation.
 * Every other seam token is unknown and fails closed; Runtime binding and
 * Runtime activation refusals are NEVER conflated
 * (`AuthorityRefusalRef(RuntimeBinding) != AuthorityRefusalRef(RuntimeActivation)`).
 */
export const DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS = [
    'authority-designation-issuance',
    'application-identity-establishment',
    'manifest-issuance',
    'runtime-binding',
    'runtime-activation',
];
/**
 * F-04 §4.2 seam-to-request-role binding: a refusal MUST bind the exact
 * request/initiation of its own seam. A refusal whose bound request role
 * belongs to a different seam (the Runtime-binding/Runtime-activation
 * conflation shape of C142) fails closed as a seam conflation, never
 * re-typed.
 */
export const DAC_V0041_REFUSAL_SEAM_REQUEST_ROLES = Object.freeze({
    'authority-designation-issuance': 'authority-designation-request',
    'application-identity-establishment': 'application-identity-establishment-request',
    'manifest-issuance': 'manifest-issuance-request',
    'runtime-binding': 'runtime-binding-request',
    'runtime-activation': 'runtime-activation-request',
});
/**
 * Reference roles this intake consumes as externally owned evidence. A
 * presented reference carrying any other role fails closed with
 * ROLE_MISMATCH — a ManifestDraft, promotion decision or request reference
 * can never occupy a result/decision position (C88 / APPLICATION_MANIFEST
 * §4; CROSS_LAYER_REFERENCES §6). The generic `evidence` registry role is
 * consumed only for F-04 §4.1 requestless initiation records (A41-004R1:
 * requestless initiation must be externally recoverable evidence, never a
 * caller boolean claim).
 */
export const DAC_V0041_COMPOSITION_INTAKE_EVIDENCE_ROLES = [
    'application-identity-establishment',
    'application-identity-establishment-request',
    'application-semantic',
    'application-selection',
    'application-revision',
    'manifest',
    'manifest-content-digest',
    'manifest-issuance-request',
    'authority-refusal',
    'selected-domain-data',
    'promotion-decision',
    'evidence',
];
/**
 * Closed currentness vocabulary for ApplicationSelectionRef reuse
 * (ASSEMBLY_PROFILES §§8.2–8.3, §9): `revoked`/`voided` are explicit
 * invalidations that FAIL CLOSED for new authoritative use;
 * `stale`/`superseded`/`reselected` are ordinary non-current states that are
 * STALE for authoritative intake; `current` passes only when the
 * determination covers the evaluation point.
 */
export const DAC_V0041_SELECTION_REUSE_CURRENTNESS_STATES = [
    'current',
    'stale',
    'superseded',
    'reselected',
    'revoked',
    'voided',
];
/**
 * Closed currentness vocabulary for authoritative Manifest reuse
 * (ASSEMBLY_PROFILES §8.2 "Manifest revision/currentness"): same
 * deterministic FAIL_CLOSED/STALE precedence; `reselected` is a selection
 * state and is NOT a Manifest state (undecidable for a Manifest).
 */
export const DAC_V0041_MANIFEST_REUSE_CURRENTNESS_STATES = [
    'current',
    'stale',
    'superseded',
    'revoked',
    'voided',
];
//# sourceMappingURL=contracts.js.map