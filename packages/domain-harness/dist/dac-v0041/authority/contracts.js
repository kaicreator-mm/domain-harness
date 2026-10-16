// Issue #356 / A41-002 (reviewed #353 Task DAG; trigger comment 5847963315):
// bounded CONSUMER/VERIFIER surface — never an issuer — for DAC v0.0.4.1
// F-01 designation/delegation/currentness semantics
// (AUTHORITY_DESIGNATION_DELEGATION.md, tightening CROSS_LAYER_REFERENCES
// §2.2–§2.4) and F-06 AuthorityAdoption semantics
// (LIFECYCLE_REFERENCE_REPAIRS.md §6) at the exact successor semantic freeze
// pinned by the A41-001 foundation (commit 75fee75b… / tree c74cf5e3…).
//
// This module consumes EXTERNALLY RECOVERED facts and classifies them
// deterministically. It never mints, issues, grants, revokes, voids, adopts,
// relabels, truncates, normalizes or repairs any designation, delegation,
// adoption or authority-bearing artifact: root AuthorityDesignation issuance,
// upstream authority establishment, promotion/selection/Manifest issuance and
// independent conformance verdict issuance are explicitly NOT owned here.
// Every decision path fails closed — an absent, contradictory or undecidable
// fact is never guessed, defaulted or repaired into a narrower valid one
// (AUTHORITY_DESIGNATION_DELEGATION.md §4; LIFECYCLE_REFERENCE_REPAIRS.md
// §6.4).
//
// Like the foundation, this module freezes NO wire schema, serialization,
// cryptography, clock, storage or transport; every fact arrives as a plain
// immutable record whose recoverability was established upstream. Constraint
// inheritance is exact-token conjunctive: only the IDENTICAL constraint token
// deterministically provably satisfies an ancestor constraint; a differently
// spelled "stricter" restriction is undecidable and fails closed.
//
// Portable: no Node built-ins, no engine internals, no imports from any
// historical DAC adapter. Imports only the A41-001 foundation contracts.
/**
 * Authority role token that permits its holder to issue further
 * AuthorityDesignationRef links within a delegation envelope. Token spelling
 * is KEEP_PROVISIONAL per the frozen spec; the semantic role is normative —
 * holding any other authority role never implies designation authority.
 */
export const DAC_V0041_DESIGNATION_ISSUANCE_ROLE = 'designation-issuance';
/**
 * Separately referrable end-act kinds that can terminate a designation link
 * (AUTHORITY_DESIGNATION_DELEGATION.md §§7–8). The first four are PROSPECTIVE
 * ordinary ends (history is not rewritten; artifacts issued while the chain
 * was current remain usable absent separate invalidation); `retroactive-void`
 * is the single retroactive instrument, bounded by the §8 void-point interval
 * and cascade rules.
 */
export const DAC_V0041_END_ACT_KINDS = [
    'ordinary-expiry',
    'supersession',
    'prospective-revocation',
    'relinquishment',
    'retroactive-void',
];
/**
 * F-06 §6.3: the ONLY artifact classes an AuthorityAdoptionRef may adopt,
 * spelled with the successor registry role vocabulary. Every other class —
 * and every unknown token — is non-adoptable and fails closed.
 */
export const DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES = [
    'promotion-decision',
    'application-selection',
    'application-semantic',
    'runtime-contract',
    'compatibility-target',
    'domain-ux-definition',
    'runtime-interaction-contract',
    'external-authority',
];
/**
 * F-06 §6.4: classes that require fresh v0.0.4.1 issuance and can NEVER be
 * made current by adoption. `authority-designation` covers every
 * specialization including attestation forms (C163); Manifest identity/
 * issuance, compatibility validation/result, Runtime binding/activation and
 * ConformanceVerdict artifacts are equally non-adoptable.
 */
export const DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES = [
    'authority-designation',
    'authority-designation-attestation',
    'manifest',
    'compatibility-validation',
    'compatibility-result',
    'runtime-binding',
    'runtime-activation',
    'conformance-verdict',
];
/**
 * Re-evaluation evidence dimensions an adoption act must bind
 * (F-06 §6.2 element 5). Each must be explicitly established in the facts;
 * a missing dimension fails closed as re-evaluation incompleteness.
 */
export const DAC_V0041_ADOPTION_REEVALUATION_REQUIREMENTS = [
    'source-authenticity',
    'source-provenance',
    'subject-exactness',
    'source-currentness',
    'evidence-closure',
    'class-specific-obligations',
];
//# sourceMappingURL=contracts.js.map