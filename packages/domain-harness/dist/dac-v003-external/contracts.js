// Issue #327 / DAC v0.0.3 V3-003 (reviewed #319 R1 Task DAG, planning gate
// PASS comment 5793326420): external-operation / idempotency /
// reconciliation exact role binding.
//
// Semantic owner: the DAC v0.0.3 `EXTERNAL_AUTHORITY` spec surface of the
// exact semantic freeze (commit 3322b215… / tree 163d2a4…), with the
// role-registry/P7 bindings of `CROSS_LAYER_REFERENCES` §5/§6 and the
// outcome-namespace separation of §11 (conformance C62–C70).
//
// This module EXTENDS two already-merged surfaces and redesigns neither:
//
//   - A2 #309 durable external-effect evidence surface
//     (src/external-authority/**, DAC v0.0.2 EXTERNAL_AUTHORITY @ 9c3ef91b):
//     genuine #309 evidence records are consumed READ-ONLY as upstream
//     evidence basis through the #309 guards; the v0.0.2 classifications map
//     1:1 onto the v0.0.3 outcome classes without ever strengthening a claim.
//     #309 scope/history is never expanded or rewritten.
//   - V3-001 #323 foundation (src/dac-v003/**): the ten nominal refs below
//     WRAP `DacV003RegistryReference` envelopes minted by the shared adoption
//     core (exact baseline binding, Base Reference Obligations, mutable-alias
//     rejection, P7 logical-operation identity), never editing it.
//
// Owned applicable versioned binding for the ten reviewed #319 R1 roles:
// ExternalAuthorityRef, LogicalOperationRef, AttemptRef, ProviderOperationRef,
// ExternalObservationRef, ReconciliationRef, AuthoritativeEffectRecordRef,
// IdempotencyIdentityRef, RecoveryCapabilityRef, ExternalCapabilityRef.
//
// Frozen non-equivalences this surface preserves (EXTERNAL_AUTHORITY §2;
// conformance C62–C70; negatives per §15):
//
// ```text
// request sent / provider accepted != Business SoR commit        (C62/C63)
// local timeout / crash / unknown != known non-commit            (C64)
// retry keeps LogicalOperationRef; new AttemptRef only under the
//   evidence-backed §11 safe-retry conditions                     (C65/C67)
// safe replay requires PROVEN idempotency issuer/scope/effect
//   equivalence — a locally recorded key is correlation metadata  (C66)
// stale / conflicting observations fail closed for current truth;
//   never last-write-wins                                         (C69)
// declared RecoveryCapability / ExternalCapability != proven
//   satisfaction                                                  (§10)
// query / watch / reconcile is not a new effect attempt           (§9)
// local cancel / interrupt never fabricates remote rollback or
//   non-commit                                                    (§10)
// provider-private proof protocols stay OPEN_NOT_OWNED           (§16)
// ```
//
// It does NOT redesign durable-effect execution (the runtime journal/store
// remains the durable authority; this adapter persists nothing and mints no
// runtime transition/mutation authority — every derived record carries
// `runtimeExecutionAuthority: 'none'`), does NOT define Manifest
// cardinality/storage (V3-004), does NOT implement compatibility validation
// (V3-002, consumed unchanged), and does NOT own promotion/selection or
// Runtime binding/activation/transition authority. Provider wire schemas,
// transport encodings, retry timing and proof encodings stay PROVISIONAL /
// OPEN: this module adopts, binds, correlates and guards — it never decides
// remote truth beyond the evidence ceiling presented to it.
/**
 * Exact identity of this adapter surface. Carried by every minted role
 * wrapper and derived record so foreign/mis-tagged objects fail closed.
 */
export const DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION = 'dac-v003-external-operation-adapter/1';
/**
 * Provider-private proof protocols (the encoding a provider requires to
 * prove "known non-commit / cannot later commit", cross-provider ordering,
 * provider transaction protocols) are explicitly NOT owned by the Harness
 * (EXTERNAL_AUTHORITY §16 DEFER_OPEN). This surface consumes caller-presented
 * authoritative evidence classes only; it never invents, parses or validates
 * a provider proof encoding, and no function here can manufacture the
 * stronger fact from local material.
 */
export const DAC_V003_PROVIDER_PROOF_PROTOCOL_OWNERSHIP = 'OPEN_NOT_OWNED';
/**
 * The frozen invariant vocabulary of EXTERNAL_AUTHORITY §2/§9. Reconciliation
 * action semantics in the observational set never create a new effect
 * attempt; if a provider protocol makes a nominal query/watch/resume call
 * effectful, the effect MUST be explicitly modeled as a new `AttemptRef` (or
 * new `LogicalOperationRef`) — it cannot hide inside an observational
 * `ReconciliationRef` (enforced by `reconcileDacV003ExternalOperation`).
 */
export const DAC_V003_QUERY_WATCH_RECONCILE_IS_NOT_A_NEW_EFFECT_ATTEMPT = true;
// ---------------------------------------------------------------------------
// External Operation Outcome / Observation namespace (§11/§12)
// ---------------------------------------------------------------------------
/**
 * Closed external-operation outcome/observation class vocabulary
 * (EXTERNAL_AUTHORITY §12; distinctions normative, exact token spelling
 * PROVISIONAL). These are NOT reference/compatibility dispositions: the
 * namespaces are guarded separately and never convertible
 * (`UNKNOWN_AMBIGUOUS != INCOMPATIBLE`).
 */
export const DAC_V003_EXTERNAL_OUTCOME_CLASSES = [
    'REQUEST_DISPATCHED',
    'ACCEPTED_FOR_PROCESSING',
    'PENDING_IN_PROGRESS',
    'REJECTED',
    'KNOWN_FAILED_BEFORE_COMMIT',
    'EFFECT_SUCCEEDED',
    'AUTHORITATIVE_COMMITTED',
    'UNKNOWN_AMBIGUOUS',
    'STALE',
    'CONFLICTING',
    'RECONCILED_COMMITTED',
    'RECONCILED_NOT_COMMITTED',
    'TERMINAL_ABANDONMENT',
];
/** The External Operation Outcome / Observation namespace tag (§11). */
export const DAC_V003_EXTERNAL_OUTCOME_NAMESPACE = 'dac-v003/external-operation-outcome';
/**
 * Total, ceiling-preserving mapping from the historical #309 (v0.0.2)
 * observation classifications onto the v0.0.3 outcome classes. Every row
 * preserves the claim ceiling exactly — in particular
 * `effect-succeeded-provider-scope` maps to `EFFECT_SUCCEEDED` and NEVER to
 * `AUTHORITATIVE_COMMITTED` (provider effect success != automatically
 * Business SoR commit, §2; conformance C63/C75).
 */
export const DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION = {
    'dispatch-acknowledged': 'REQUEST_DISPATCHED',
    'accepted-pending': 'ACCEPTED_FOR_PROCESSING',
    'in-progress': 'PENDING_IN_PROGRESS',
    rejected: 'REJECTED',
    'known-failed-before-commit': 'KNOWN_FAILED_BEFORE_COMMIT',
    'effect-succeeded-provider-scope': 'EFFECT_SUCCEEDED',
    'commit-observed': 'AUTHORITATIVE_COMMITTED',
    'unknown-ambiguous': 'UNKNOWN_AMBIGUOUS',
    stale: 'STALE',
    conflicting: 'CONFLICTING',
};
// ---------------------------------------------------------------------------
// Attempt evidence classes (§5)
// ---------------------------------------------------------------------------
/**
 * Closed attempt evidence-class vocabulary (EXTERNAL_AUTHORITY §5). A generic
 * transport error or timeout after possible dispatch is AMBIGUOUS — never
 * known non-commit. A provider rejection qualifies as known pre-commit
 * failure only when the bound provider semantics/evidence establish that the
 * attempt cannot later commit (the proof protocol itself stays
 * OPEN_NOT_OWNED; the class is caller-asserted from authoritative evidence,
 * never inferred locally).
 */
export const DAC_V003_ATTEMPT_EVIDENCE_CLASSES = [
    'not-dispatched',
    'dispatch-attempted',
    'definitively-rejected-known-pre-commit-failed',
    'dispatch-outcome-ambiguous',
];
// ---------------------------------------------------------------------------
// Reconciliation action semantics (§9)
// ---------------------------------------------------------------------------
/**
 * Closed reconciliation action-semantics vocabulary (EXTERNAL_AUTHORITY §9).
 * The two effectful actions — `retry-same-logical-effect` and
 * `new-independent-operation` — are DELIBERATELY NOT reconciliation action
 * semantics: minting a reconciliation episode with either value fails closed
 * (`INVALID_ACTION_SEMANTICS`); a new effect attempt is authorized only
 * through `evaluateDacV003SafeRetry` under the §11 preconditions.
 */
export const DAC_V003_RECONCILIATION_ACTION_SEMANTICS = [
    'query-status-observation',
    'watch-continuation-observation',
    'resume-existing-provider-operation',
    'reconcile-local-vs-external-truth',
    'local-abandon',
];
// ---------------------------------------------------------------------------
// Recovery / external capability families (§10)
// ---------------------------------------------------------------------------
/**
 * Closed transport-neutral capability-family vocabulary
 * (EXTERNAL_AUTHORITY §10, extensible by semantic refs). `cancel-abort-request`
 * means ONLY that a cancellation/abort REQUEST semantic is supported under
 * declared conditions — never rollback, successful cancellation, known
 * non-commit, or reversal of committed effects.
 */
export const DAC_V003_RECOVERY_CAPABILITY_FAMILIES = [
    'query-status',
    'watch-poll-subscription',
    'resume-existing-provider-operation',
    'safe-same-operation-retry',
    'idempotent-replay',
    'reconciliation',
    'cancel-abort-request',
];
// ---------------------------------------------------------------------------
// Safe retry / replay decisions (§11)
// ---------------------------------------------------------------------------
/** Closed safe-retry decision vocabulary (EXTERNAL_AUTHORITY §11 matrix). */
export const DAC_V003_SAFE_RETRY_DECISIONS = [
    'PERMITTED_SAME_OPERATION_NEW_ATTEMPT',
    'PERMITTED_IDEMPOTENT_REPLAY',
    'PERMITTED_NEW_INDEPENDENT_OPERATION',
    'NOT_AUTHORIZED_AMBIGUITY_PRESERVED',
    'RECONCILIATION_REQUIRED',
];
/** Fail-closed error surface for the DAC v0.0.3 external-operation binding. */
export class DacV003ExternalError extends Error {
    code;
    details;
    constructor(code, message, details = []) {
        super(`[${code}] ${message}`);
        this.name = 'DacV003ExternalError';
        this.code = code;
        this.details = details;
    }
}
//# sourceMappingURL=contracts.js.map