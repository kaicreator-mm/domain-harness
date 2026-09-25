// Issue #309 / A2 I-006 (reviewed #300 A2 Task DAG): public evidence /
// correlation adapter around the EXISTING durable effect semantics for
// external authority / operation / observation / reconciliation refs.
//
// Semantic owner: the DAC v0.0.2 `EXTERNAL_AUTHORITY` spec (baseline commit
// `9c3ef91b8b40d893e4fe2b0370200e765816ec2b`, same baseline triple as the
// I-002 DAC cross-layer reference adapter). This adapter freezes ONLY:
//
//   - the nominal reference/evidence roles below;
//   - the exact baseline it is version-bound to (fails closed on any other);
//   - the closed classification/result vocabularies with their frozen
//     claim-strength ceilings (DAC EXTERNAL_AUTHORITY §4 authority matrix);
//   - opaque preservation of unknown/PROVISIONAL source fields.
//
// It does NOT freeze provider wire schemas, exact lifecycle enum names of any
// provider, transport encodings or serialization, and it creates no second
// identity authority: the external Business SoR/provider keeps authority over
// its own records, invariants and final acceptance/commit semantics. This
// module adopts, preserves, correlates and guards — it never decides.
//
// Mandatory distinctions (each guarded nominally at the type level and
// fail-closed at runtime — no conversion function exists between roles, so no
// identity or evidence class can ever be manufactured from another):
//
// ```text
// Runtime logical operation identity != provider/request operation identity
// ExternalAuthorityRef != any DAC lifecycle/technical reference
// dispatch/attempt evidence != authoritative external observation evidence
// external observation evidence != reconciliation outcome
// request dispatched != external authoritative commit
// provider effect success != Business SoR commit
// local timeout/abandonment/cancel != remote non-commit
// unresolved non-idempotent ambiguity stays reconciliation-sensitive
// ```
//
// No evidence object minted here acquires Runtime transition, mutation,
// promotion, activation or provider-routing authority: every evidence record
// carries `executionAuthority: 'none'` and this module persists nothing.
//
// This module deliberately imports nothing from the DAC adapter (#305), the
// observation stream (#312), the control concern (#313) or any runtime store /
// engine / journal implementation — concern separation per the A2 authority
// matrix. Cross-family fail-closed behavior comes from nominal adoption
// (a foreign object never passes a guard), not from cross-module coupling.
/**
 * Exact identity of this adapter surface. Carried by every adopted reference
 * and evidence record so foreign/mis-tagged objects fail closed.
 */
export const EXTERNAL_AUTHORITY_ADAPTER_VERSION = 'external-authority-adapter/1';
/**
 * The exact DAC baseline this adapter is version-bound to (the
 * EXTERNAL_AUTHORITY spec surface of the frozen v0.0.2 baseline — the same
 * baseline triple as the I-002 adapter, so both adapters bind one authority
 * and no parallel identity authority is forked). Any reference presented
 * under a different baseline is rejected (`UNSUPPORTED_BASELINE`).
 */
export const EXTERNAL_AUTHORITY_BASELINE = {
    contract: 'domain-application-contract',
    version: 'v0.0.2',
    baselineCommit: '9c3ef91b8b40d893e4fe2b0370200e765816ec2b',
};
/**
 * The five nominal external-effect reference roles adopted by this adapter.
 *
 * The role is set exclusively by the matching `adopt*Ref` constructor — a
 * caller can never author a role discriminant directly, and one role is never
 * rewritable into another (there is no conversion function).
 */
export const EXTERNAL_AUTHORITY_REFERENCE_ROLES = [
    'external-authority',
    'runtime-logical-operation',
    'provider-operation',
    'external-observation',
    'external-reconciliation',
];
/**
 * Closed classification vocabulary for externally-originated observations
 * (DAC EXTERNAL_AUTHORITY §4 authority matrix; adapter-own token names —
 * PROVISIONAL provider enum names are never frozen, the raw statement is
 * always preserved verbatim on the evidence record).
 *
 * `unknown-ambiguous` is first-class and MUST NOT collapse into any failure
 * or success claim (§5); `stale`/`conflicting` observations cannot silently
 * override current operation truth (they claim nothing here).
 */
export const EXTERNAL_OBSERVATION_CLASSIFICATIONS = [
    'dispatch-acknowledged',
    'accepted-pending',
    'in-progress',
    'rejected',
    'known-failed-before-commit',
    'effect-succeeded-provider-scope',
    'commit-observed',
    'unknown-ambiguous',
    'stale',
    'conflicting',
];
/**
 * Closed claim vocabulary — the STRONGEST runtime consequence an observation
 * classification may ever support (DAC EXTERNAL_AUTHORITY §4 "Runtime may
 * claim" column). Derived exclusively by
 * `maxClaimableForExternalObservation`; an evidence record's `claim` is
 * always exactly its classification's ceiling, never caller-supplied and
 * never stronger.
 */
export const EXTERNAL_OBSERVATION_CLAIMS = [
    'no-claim',
    'dispatch-attempt-only',
    'external-acceptance-observed',
    'external-progress-observed',
    'non-commit-known-for-attempt',
    'provider-effect-success-observed',
    'commit-observed-within-authority-scope',
];
/**
 * Closed reconciliation result vocabulary (DAC EXTERNAL_AUTHORITY §3
 * reconciliation exits). `TERMINAL_ABANDONMENT` is a LOCAL STOP ONLY — it
 * never resolves remote truth; `STILL_UNKNOWN` preserves unresolved external
 * truth as unresolved. Commit/non-commit results exist only with an
 * authoritative external observation basis (enforced at adoption).
 */
export const EXTERNAL_RECONCILIATION_RESULTS = [
    'RECONCILED_COMMITTED',
    'RECONCILED_NOT_COMMITTED',
    'STILL_UNKNOWN',
    'TERMINAL_ABANDONMENT',
];
/** Evidence class discriminants (nominal; no conversion between classes). */
export const EXTERNAL_EVIDENCE_CLASSES = [
    'dispatch-attempt',
    'external-observation',
    'reconciliation-outcome',
];
/** Fail-closed error surface for the external authority evidence adapter. */
export class ExternalAuthorityError extends Error {
    code;
    constructor(code, message) {
        super(`[${code}] ${message}`);
        this.name = 'ExternalAuthorityError';
        this.code = code;
    }
}
//# sourceMappingURL=contracts.js.map