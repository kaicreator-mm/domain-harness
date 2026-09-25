// Issue #323 / DAC v0.0.3 V3-001 (reviewed #319 R1 Task DAG, planning gate
// PASS comment 5793326420): versioned base-reference/profile foundation.
//
// This module is a NEW explicit DAC v0.0.3 versioned adapter surface. It is
// bound to the exact DAC v0.0.3 semantic freeze and coexists with — never
// edits, reinterprets or relabels — the historical v0.0.2 adapter
// (src/dac/**, baseline 9c3ef91b…), whose semantics/tests stay byte-separate
// and separately testable.
//
// V3-001 owns ONLY the bounded foundation:
//   - exact v0.0.3 baseline identity;
//   - Base Reference Obligations (role/kind + authority/source scope +
//     role-specific primary identity, each exactly 1; locator hints 0..n as
//     non-authoritative hints only);
//   - composable exactness profiles P0–P7 as requirement primitives;
//   - the canonical role-registry vocabulary incl. unsafe-alias groups and
//     required role inequalities;
//   - the three nominal refs named by the DAG: RuntimeHostBindingRequirementRef,
//     RuntimeHostBindingRef, RuntimeInteractionContractRef;
//   - shared exact-reference primitives (alias rejection, exact-identity
//     verification, revision/digest contradiction guard) required by later V3
//     tasks;
//   - the reference/compatibility disposition vocabulary and the repaired
//     target-state rule vocabulary: missing required target => FAIL_CLOSED,
//     explicit unsupported target => INCOMPATIBLE.
//
// It deliberately does NOT implement compatibility decisions/validation
// (V3-002), external-operation semantics (V3-003), Manifest cardinality
// (V3-004), promotion/selection, or Runtime binding/activation/transition
// authority. Adopting a reference records identity only; it never creates,
// infers or substitutes the referenced decision, evidence or authority.
//
// Like the v0.0.2 adapter, this module freezes NO wire schema, transport
// encoding, tagged-union decomposition or serialization format (DAC v0.0.3
// keeps those PROVISIONAL). DAC remains the semantic owner of every role
// here; this module only adopts, preserves and guards them.
/**
 * Exact identity of this adapter surface. Carried by every adopted reference
 * so foreign/mis-tagged objects fail closed instead of being guessed.
 */
export const DAC_V003_REFERENCE_ADAPTER_VERSION = 'dac-v003-reference-adapter/1';
/**
 * The exact DAC v0.0.3 baseline this adapter is version-bound to: the
 * semantic freeze commit AND its tree, as fixed by #318/#319/#323. Any
 * reference presented under a different baseline/contract is rejected
 * (`UNSUPPORTED_DAC_BASELINE`) rather than interpreted optimistically.
 */
export const DAC_V003_BASELINE = {
    contract: 'domain-application-contract',
    version: 'v0.0.3',
    semanticFreezeCommit: '3322b2152253b3c60f254c23a4f9ab1a14e063d1',
    semanticFreezeTree: '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06',
};
/**
 * Canonical DAC v0.0.3 cross-layer role registry (CROSS_LAYER_REFERENCES §5)
 * as closed kebab-case vocabulary. This is shared VOCABULARY for later V3
 * tasks; only the three roles marked in `DAC_V003_FOUNDATION_ROLES` get
 * dedicated nominal types/constructors/guards in this foundation. Presence of
 * a name here creates no decision, evaluation or lifecycle authority.
 */
export const DAC_V003_ROLE_REGISTRY = [
    'domain-data-semantic',
    'domain-data-revision',
    'promoted-domain-data',
    'selected-domain-data',
    'manifest',
    'application-semantic',
    'application-revision',
    'manifest-content-digest',
    'runtime-contract',
    'compatibility-target',
    'runtime-implementation',
    'runtime-host-binding-requirement',
    'runtime-host-binding',
    'runtime-binding',
    'runtime-activation',
    'domain-ux-definition',
    'runtime-interaction-contract',
    'domain-intent',
    'semantic-target',
    'ux-view',
    'ux-snapshot',
    'ux-watch',
    'ux-outcome',
    'ux-recovery-correlation',
    'promotion-decision',
    'application-selection',
    'compatibility-validation',
    'compatibility-result',
    'evidence',
    'conformance-evidence',
    'simulation-request',
    'simulation-result',
    'finding',
    'domain-finding',
    'counterexample',
    'domain-counterexample',
    'scenario',
    'regression-comparison',
    'parent-revision',
    'derivation',
    'provenance',
    'authored-candidate',
    'evolution-operation',
    'evolution-request',
    'authoring-capability-request',
    'authoring-capability-result',
    'evolved-candidate',
    'capability-requirement',
    'port-requirement',
    'capability-satisfaction-evidence',
    'external-authority',
    'logical-operation',
    'correlation',
    'observation',
    'external-observation',
    'attempt',
    'provider-operation',
    'idempotency-identity',
    'authoritative-effect-record',
    'reconciliation',
    'recovery-capability',
    'external-capability',
];
/** The three roles this foundation owns with dedicated nominal surfaces. */
export const DAC_V003_FOUNDATION_ROLES = [
    'runtime-host-binding-requirement',
    'runtime-host-binding',
    'runtime-interaction-contract',
];
/**
 * Unsafe-alias role groups (CROSS_LAYER_REFERENCES §6.2): roles that are
 * semantically distinct and MUST never be aliased/collapsed into one another.
 * Data form so tests and later V3 tasks can assert the frozen grouping.
 */
export const DAC_V003_UNSAFE_ALIAS_GROUPS = [
    ['runtime-host-binding-requirement', 'runtime-host-binding', 'runtime-binding'],
    ['logical-operation', 'evolution-operation', 'authoring-capability-request'],
    [
        'domain-data-revision',
        'authored-candidate',
        'evolved-candidate',
        'selected-domain-data',
    ],
];
/**
 * Required role inequalities beyond the unsafe-alias groups
 * (CROSS_LAYER_REFERENCES §6.5, v0.0.2 frozen, retained in v0.0.3).
 */
export const DAC_V003_REQUIRED_ROLE_INEQUALITIES = [
    'application-selection != compatibility-validation',
    'compatibility-validation != runtime-binding',
    'runtime-binding != runtime-activation',
    'runtime-contract != runtime-implementation',
    'promotion-decision != application-selection',
];
/**
 * Composable exactness profiles P0–P7 (CROSS_LAYER_REFERENCES §4). Profiles
 * are composable requirements, not mutually-exclusive wire variants: a
 * reference satisfies a profile when it carries every semantic slot that
 * profile requires. Validators check slot presence/shape only — semantic
 * validity of the referenced content belongs to the owning later-V3 concern.
 */
export const DAC_V003_EXACTNESS_PROFILES = [
    'P0',
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
    'P6',
    'P7',
];
/** Frozen requirement table for every exactness profile. */
export const DAC_V003_PROFILE_REQUIREMENTS = {
    // P0 — semantic-only: role/kind + scope + semantic identity.
    P0: {
        requires: [],
        requiredSlots: ['semanticIdentity'],
        selectedDomainDataLifecycleAuthorities: false,
    },
    // P1 — immutable revision-bound: P0 + immutable revision identity.
    P1: {
        requires: ['P0'],
        requiredSlots: ['revisionIdentity'],
        selectedDomainDataLifecycleAuthorities: false,
    },
    // P2 — content-bound: role-valid subject identity + content digest.
    P2: {
        requires: [],
        requiredSlots: ['contentDigest'],
        selectedDomainDataLifecycleAuthorities: false,
    },
    // P3 — authority-scoped selected/pinned: P1+P2 + role-required lifecycle
    // authority refs (selected Domain Data => promotion + selection coverage).
    P3: {
        requires: ['P0', 'P1', 'P2'],
        requiredSlots: ['lifecycleAuthorityRefs'],
        selectedDomainDataLifecycleAuthorities: true,
    },
    // P4 — derived/provenance-bound: exact child subject + sufficient
    // parent/root lineage + provenance; derivation op where applicable;
    // evidence refs when the derivation/result depends on them.
    P4: {
        requires: [],
        requiredSlots: ['parentRefs', 'provenanceRefs'],
        selectedDomainDataLifecycleAuthorities: false,
    },
    // P5 — compatibility-target: target role/kind + authority/scope + target
    // semantic contract/profile identity + exact target version/revision
    // identity sufficient to prevent "whatever is current".
    P5: {
        requires: [],
        requiredSlots: ['contractProfileIdentity', 'revisionIdentity'],
        selectedDomainDataLifecycleAuthorities: false,
    },
    // P6 — evidence/result: issuer scope + result identity (base obligations)
    // + exact material input refs + provenance establishing how the result was
    // produced; contract/profile/engine/target identity where validity depends
    // on it (conditional, not forced here).
    P6: {
        requires: [],
        requiredSlots: ['materialInputRefs', 'provenanceRefs'],
        selectedDomainDataLifecycleAuthorities: false,
    },
    // P7 — operation/correlation: operation/observation role + owning
    // authority scope + logical operation identity; attempt/provider/
    // observation identities stay distinguishable from the logical operation.
    P7: {
        requires: [],
        requiredSlots: ['logicalOperationIdentity'],
        selectedDomainDataLifecycleAuthorities: false,
    },
};
/**
 * Reference / Compatibility Disposition namespace
 * (CROSS_LAYER_REFERENCES §11). The namespace tag travels with the value so
 * a disposition can never be conflated with an Authoring/Capability Exchange
 * Outcome or an External Operation Outcome/Observation (anti-conflation
 * rules §11; exact token spelling itself stays PROVISIONAL, the separation
 * is normative). `COMPATIBLE` is vocabulary only: this foundation exposes no
 * function that produces it — compatibility evaluation authority belongs to
 * V3-002.
 */
export const DAC_V003_REFERENCE_DISPOSITIONS = [
    'FAIL_CLOSED',
    'STALE',
    'INCOMPATIBLE',
    'REQUIRES_RECONCILIATION',
    'REQUIRES_EXPLICIT_RESELECTION',
    'COMPATIBLE',
];
export const DAC_V003_DISPOSITION_NAMESPACE = 'dac-v003/reference-compatibility-disposition';
/** Fail-closed error surface for the DAC v0.0.3 reference foundation. */
export class DacV003ReferenceError extends Error {
    code;
    constructor(code, message) {
        super(`[${code}] ${message}`);
        this.name = 'DacV003ReferenceError';
        this.code = code;
    }
}
//# sourceMappingURL=contracts.js.map