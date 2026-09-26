// Issue #355 / A41-001 (reviewed #353 Task DAG, audit #348 comment 5836333294,
// review #349 comment 5842794726): versioned successor DAC v0.0.4.1
// reference / request-role foundation.
//
// This module is a NEW explicit DAC v0.0.4.1 versioned adapter surface bound
// to the exact successor semantic freeze (FREEZE_MANIFEST/CROSS_LAYER_
// REFERENCES/LIFECYCLE_REFERENCE_REPAIRS/ASSEMBLY_CAPABILITY_EXCHANGE at
// commit 75fee75b…). It coexists with — and never edits, rewrites, relabels
// or imports — the historical version-bound adapters (src/dac/** v0.0.2 and
// src/dac-v003*/** v0.0.3), whose semantics/tests/evidence stay byte-separate
// and separately testable. Historical v0.0.3 conformance remains valid only
// for the v0.0.3 surface; it is never relabeled as v0.0.4/v0.0.4.1
// conformance.
//
// A41-001 owns ONLY the bounded successor foundation:
//   - the exact immutable DAC v0.0.4.1 semantic identity/pin (freeze commit
//     AND tree) plus its deterministic fail-closed baseline verification;
//   - the frozen predecessor baseline identities, retained for
//     transition/adoption evidence ONLY (F-06 / C105/C145-C147); a
//     predecessor baseline never satisfies the successor pin;
//   - the successor canonical role registry (predecessor roles imported
//     unchanged by exact identity + the v0.0.4/v0.0.4.1 additive roles) as
//     shared vocabulary, with dedicated nominal request-role surfaces for the
//     two Harness-owned seam request roles named by C89/C108:
//     CompatibilityValidationRequestRef and RuntimeBindingRequestRef;
//   - the universal request/result anti-alias chains (CROSS_LAYER_
//     REFERENCES §6) as data plus a fail-closed separation verifier
//     primitive shared by later A41 consumers (C89/C108/C155);
//   - the deterministic capability-kind/currentness ordering primitives
//     (ASSEMBLY_CAPABILITY_EXCHANGE §5 + §13; C84/C85/C150-C153/C170/C171),
//     the currentness-use classification (C157), the capability outcome
//     namespace polarity table (C156/C158) — all pure deterministic
//     classification over externally supplied facts.
//
// It deliberately does NOT implement: AuthorityDesignation or
// AuthorityAdoption issuance/verification (A41-002), compatibility
// evaluation/decisions (A41-003), composition-intake/selection/Manifest
// verification (A41-004), RuntimeBinding/RuntimeActivation behavior
// (A41-005), promotion/ApplicationSelection/Manifest/conformance authority,
// or any Runtime binding/activation implementation. Adopting or minting a
// reference records identity only; it never creates, infers, substitutes or
// approves the referenced decision, evidence or authority. No function in
// this module produces COMPATIBLE — compatibility evaluation authority
// belongs to A41-003.
//
// Like the historical adapters, this module freezes NO wire schema,
// transport encoding, tagged-union decomposition or serialization format.
// DAC remains the semantic owner of every role here; this module only
// adopts, preserves and guards them. Portable: no Node built-ins, no engine
// internals, no imports from any historical DAC adapter.
/**
 * Exact identity of this adapter surface. Carried by every adopted/minted
 * reference so foreign/mis-tagged objects fail closed instead of being
 * guessed. A v0.0.2 or v0.0.3 adopted reference is structurally foreign to
 * this adapter version and is rejected by every guard here.
 */
export const DAC_V0041_REFERENCE_ADAPTER_VERSION = 'dac-v0041-reference-adapter/1';
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
export const DAC_V0041_BASELINE = Object.freeze({
    contract: 'domain-application-contract',
    version: 'v0.0.4.1',
    semanticFreezeCommit: '75fee75b782ac229720dccd18d2a4ca54b285e51',
    semanticFreezeTree: 'c74cf5e3a0e6745da3eda6999836b61ee8103c60',
});
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
export const DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE = 'transition-or-adoption-evidence-only';
/**
 * Frozen predecessor baseline identities (F-06 / C105). Immutable history:
 * v0.0.3 is the released Harness conformance baseline (DAC freeze per
 * src/dac-v003/contracts.ts) and v0.0.4 is the frozen intermediate successor
 * this repository never shipped as a Harness release. Both are retained
 * exactly so later transition/adoption evidence (A41-002) can bind the
 * exact historic artifact and its origin DAC/reference profile; neither is
 * ever accepted as `DAC_V0041_BASELINE`.
 */
export const DAC_V0041_PREDECESSOR_BASELINES = Object.freeze([
    Object.freeze({
        contract: 'domain-application-contract',
        version: 'v0.0.3',
        semanticFreezeCommit: '3322b2152253b3c60f254c23a4f9ab1a14e063d1',
        semanticFreezeTree: '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06',
        purpose: DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
    }),
    Object.freeze({
        contract: 'domain-application-contract',
        version: 'v0.0.4',
        semanticFreezeCommit: '0d31feec751cf21d2ae29de16315d35f73b0b8c8',
        semanticFreezeTree: '529d83d7a4f25b72675fe50c80642e0471186b66',
        purpose: DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
    }),
]);
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
export const DAC_V0041_ROLE_REGISTRY = [
    // Predecessor v0.0.3 registry roles, imported unchanged.
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
    // v0.0.4/v0.0.4.1 additive roles (CROSS_LAYER_REFERENCES §3.1/§3.2,
    // LIFECYCLE_REFERENCE_REPAIRS §3/§4/§6).
    'authority-designation-request',
    'domain-authoring-request',
    'domain-authoring-result',
    'application-identity-establishment-request',
    'application-identity-establishment',
    'promotion-request',
    'application-selection-request',
    'manifest-issuance-request',
    'compatibility-validation-request',
    'runtime-binding-request',
    'runtime-activation-request',
    'conformance-request',
    'authority-designation',
    'conformance-verdict',
    'provider-capability-descriptor',
    'domain-application-assembly-plan',
    'authority-refusal',
    'authority-adoption',
];
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
export const DAC_V0041_FOUNDATION_REQUEST_ROLES = [
    'compatibility-validation-request',
    'runtime-binding-request',
];
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
export const DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS = [
    ['authority-designation-request', 'authority-designation'],
    ['domain-authoring-request', 'domain-authoring-result', 'authored-candidate'],
    [
        'application-identity-establishment-request',
        'application-identity-establishment',
        'application-semantic',
    ],
    ['promotion-request', 'promotion-decision'],
    ['application-selection-request', 'application-selection'],
    ['manifest-issuance-request', 'manifest'],
    ['compatibility-validation-request', 'compatibility-validation', 'compatibility-result'],
    ['runtime-binding-request', 'runtime-binding', 'runtime-host-binding'],
    ['runtime-activation-request', 'runtime-activation'],
    ['conformance-request', 'conformance-verdict'],
];
/**
 * Reference / Compatibility Disposition namespace carried forward unchanged
 * (v0.0.3 CROSS_LAYER_REFERENCES §11; preserved by ASSEMBLY_CAPABILITY_
 * EXCHANGE §1). `COMPATIBLE` is vocabulary only: no function in this module
 * produces it — compatibility evaluation authority belongs to A41-003.
 */
export const DAC_V0041_REFERENCE_DISPOSITIONS = [
    'FAIL_CLOSED',
    'STALE',
    'INCOMPATIBLE',
    'COMPATIBLE',
];
/**
 * Authoring / Capability Exchange outcome namespace, preserved unchanged
 * from the v0.0.3/v0.0.4 surface (ASSEMBLY_CAPABILITY_EXCHANGE §1), plus the
 * `pending/in-progress` representation class permitted while an invocation
 * is incomplete. The namespace stays separate from the disposition
 * namespace above (cross-namespace anti-conflation §10).
 */
export const DAC_V0041_CAPABILITY_OUTCOME_CLASSES = [
    'accepted-for-evaluation',
    'pending/in-progress',
    'produced-result',
    'rejected/invalid-input',
    'blocked/missing-capability',
    'failed-known-no-result',
    'unknown/ambiguous-production',
];
/**
 * Outcome polarity table (ASSEMBLY_CAPABILITY_EXCHANGE §6; C156/C158
 * foundation): only `produced-result` proves that a separately referrable
 * substantive result exists — and even then the decision may be favorable
 * OR negative (`produced-result != favorable result`). Every other class,
 * including `accepted-for-evaluation` and `pending/in-progress`, proves no
 * decision/result exists and can never be presented as approval.
 */
export const DAC_V0041_CAPABILITY_OUTCOME_PRODUCES_RESULT = {
    'accepted-for-evaluation': false,
    'pending/in-progress': false,
    'produced-result': true,
    'rejected/invalid-input': false,
    'blocked/missing-capability': false,
    'failed-known-no-result': false,
    'unknown/ambiguous-production': false,
};
/**
 * Currentness-use states a consumer can present for an artifact/result it
 * intends to carry forward, with the vocabulary kept minimal and closed.
 * Unknown/undecidable currentness is NOT representable as a passing value —
 * the classifier fails closed on it.
 */
export const DAC_V0041_CURRENTNESS_USE_STATES = [
    'current',
    'stale',
    'superseded',
    'revoked',
    'voided',
];
/**
 * Deterministic classification phases of the capability/currentness
 * precedence (ASSEMBLY_CAPABILITY_EXCHANGE §5 + v0.0.4.1 §13). The phase
 * order is frozen: descriptor establishment, capability kind, required
 * exactness/currentness, binding explicit target support, and only then the
 * provider capability evaluation namespace.
 */
export const DAC_V0041_CAPABILITY_EXCHANGE_PHASES = [
    'descriptor-establishment',
    'capability-kind',
    'exactness-currentness',
    'target-support',
    'evaluation',
];
/** Fail-closed error surface for the successor foundation. */
export class DacV0041ReferenceError extends Error {
    code;
    constructor(code, message) {
        super(`[${code}] ${message}`);
        this.name = 'DacV0041ReferenceError';
        this.code = code;
    }
}
//# sourceMappingURL=contracts.js.map