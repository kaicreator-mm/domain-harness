import { type ExternalAuthorityBaselineInput, type ExternalAuthorityFamilyReference, type ExternalAuthorityRef, type ExternalAuthorityRefAdoptionInput, type ExternalAuthorityReferenceRole, type ExternalDispatchAttemptEvidence, type ExternalEffectCorrelation, type ExternalEffectCorrelationExpectation, type ExternalObservationClaim, type ExternalObservationClassification, type ExternalObservationEvidence, type ExternalObservationRef, type ExternalObservationRefAdoptionInput, type ProviderOperationRef, type ProviderOperationRefAdoptionInput, type ExternalReconciliationOutcome, type ExternalReconciliationRef, type ExternalReconciliationRefAdoptionInput, type ExternalReconciliationResult, type RuntimeLogicalOperationRef, type RuntimeLogicalOperationRefAdoptionInput } from './contracts.js';
import type { EffectExecutionContext, EffectJournalRecord } from '../v2/contracts/effect.js';
/**
 * The strongest Runtime consequence an observation classification may ever
 * support (DAC EXTERNAL_AUTHORITY §4). `unknown-ambiguous`, `stale` and
 * `conflicting` support nothing — unknown never collapses into failure or
 * success, and stale/conflicting observations never override current truth.
 */
export declare function maxClaimableForExternalObservation(classification: ExternalObservationClassification): ExternalObservationClaim;
/** Only a Business-SoR-observed commit supports a commit claim (§2/§4). */
export declare function observationSupportsCommitClaim(evidence: ExternalObservationEvidence): boolean;
/**
 * Only an authoritative rejection or a definitive pre-commit failure supports
 * a known-non-commit claim (§4). Timeouts, abandonments and unknowns never
 * reach this predicate — they cannot produce this evidence class at all.
 */
export declare function observationSupportsNonCommitClaim(evidence: ExternalObservationEvidence): boolean;
/** Adopt external Business SoR / effect-provider identity and scope. */
export declare function adoptExternalAuthorityRef(input: ExternalAuthorityRefAdoptionInput): ExternalAuthorityRef;
/** Adopt the Runtime logical operation identity (exact durable effectId). */
export declare function adoptRuntimeLogicalOperationRef(input: RuntimeLogicalOperationRefAdoptionInput): RuntimeLogicalOperationRef;
/**
 * Adopt the Runtime logical operation identity directly from an EXISTING
 * durable effect journal record (shape `EffectJournalRecord` — the journal
 * stays the runtime's truth; this only reads identity fields).
 */
export declare function adoptRuntimeLogicalOperationRefFromJournal(baseline: ExternalAuthorityBaselineInput, record: Pick<EffectJournalRecord, 'effectId' | 'attempt' | 'effectSemantics'>): RuntimeLogicalOperationRef;
/**
 * Adopt the Runtime logical operation identity directly from the EXISTING
 * durable effect execution context the runtime already hands executors
 * (shape `EffectExecutionContext` — includes the idempotency key the runtime
 * derived for this logical effect).
 */
export declare function adoptRuntimeLogicalOperationRefFromExecutionContext(baseline: ExternalAuthorityBaselineInput, context: Pick<EffectExecutionContext, 'effectId' | 'attempt' | 'idempotencyKey'>): RuntimeLogicalOperationRef;
/** Adopt provider/request operation identity (where the contract provides one). */
export declare function adoptProviderOperationRef(input: ProviderOperationRefAdoptionInput): ProviderOperationRef;
/** Adopt the identity of one externally-originated observation. */
export declare function adoptExternalObservationRef(input: ExternalObservationRefAdoptionInput): ExternalObservationRef;
/** Adopt the identity of one reconciliation process. */
export declare function adoptExternalReconciliationRef(input: ExternalReconciliationRefAdoptionInput): ExternalReconciliationRef;
/** Structural guard for any adopted reference of this family (unknown-safe). */
export declare function isExternalAuthorityFamilyReference(value: unknown): value is ExternalAuthorityFamilyReference;
/** Exact role of an adopted reference; `undefined` for non-references. */
export declare function getExternalAuthorityFamilyRole(value: unknown): ExternalAuthorityReferenceRole | undefined;
export declare function isExternalAuthorityRef(v: unknown): v is ExternalAuthorityRef;
export declare function isRuntimeLogicalOperationRef(v: unknown): v is RuntimeLogicalOperationRef;
export declare function isProviderOperationRef(v: unknown): v is ProviderOperationRef;
export declare function isExternalObservationRef(v: unknown): v is ExternalObservationRef;
export declare function isExternalReconciliationRef(v: unknown): v is ExternalReconciliationRef;
export declare function expectExternalAuthorityRef(v: unknown): asserts v is ExternalAuthorityRef;
export declare function expectRuntimeLogicalOperationRef(v: unknown): asserts v is RuntimeLogicalOperationRef;
export declare function expectProviderOperationRef(v: unknown): asserts v is ProviderOperationRef;
export declare function expectExternalObservationRef(v: unknown): asserts v is ExternalObservationRef;
export declare function expectExternalReconciliationRef(v: unknown): asserts v is ExternalReconciliationRef;
/**
 * Fail-closed classification guard: no reference of this family EXCEPT an
 * adopted `ExternalAuthorityRef` — in particular no runtime logical
 * operation, provider operation, observation or reconciliation identity —
 * can ever be presented where external Business SoR identity is required.
 * (DAC adapter references are likewise refuted by that adapter's own
 * `refuteExternalBusinessSoRIdentity`; the two families stay disjoint.)
 */
export declare function refuteNonExternalAuthorityIdentity(value: unknown): void;
export interface ExternalEffectCorrelationInput {
    readonly correlationId: string;
    readonly runtimeOperation: RuntimeLogicalOperationRef;
    readonly externalAuthority: ExternalAuthorityRef;
    readonly providerOperation?: ProviderOperationRef;
    readonly opaque?: Readonly<Record<string, unknown>>;
}
/**
 * Correlate one exact Runtime logical operation with one external authority
 * (and, where available, one provider operation identity). Fail-closed: the
 * constituent references must be adopted by this adapter, and idempotency
 * keys presented by both the runtime side and the provider side must agree
 * exactly — the same logical effect never silently rebinds to a different
 * idempotency identity.
 */
export declare function correlateExternalEffect(input: ExternalEffectCorrelationInput): ExternalEffectCorrelation;
export declare function isExternalEffectCorrelation(v: unknown): v is ExternalEffectCorrelation;
export declare function expectExternalEffectCorrelation(v: unknown): asserts v is ExternalEffectCorrelation;
/**
 * Fail-closed exact-correlation verification. Every supplied expectation must
 * equal the correlation's field exactly (including expectation of a field the
 * correlation does not carry). Nothing is normalized, resolved or defaulted;
 * any mismatch throws `IDENTITY_MISMATCH`.
 */
export declare function verifyExternalEffectCorrelation(correlation: ExternalEffectCorrelation, expectation: ExternalEffectCorrelationExpectation): void;
export interface ExternalDispatchAttemptEvidenceInput {
    readonly correlation: ExternalEffectCorrelation;
    readonly attempt: number;
    readonly dispatchedAt?: string;
    readonly opaque?: Readonly<Record<string, unknown>>;
}
/**
 * Mint dispatch/attempt evidence: proves ONLY that attempt `attempt` of the
 * correlated Runtime logical operation was dispatched. This is never commit
 * or non-commit evidence, and no local cause field is accepted.
 */
export declare function adoptExternalDispatchAttemptEvidence(input: ExternalDispatchAttemptEvidenceInput): ExternalDispatchAttemptEvidence;
export interface ExternalObservationEvidenceInput {
    readonly correlation: ExternalEffectCorrelation;
    readonly observation?: ExternalObservationRef;
    /**
     * The host integration's evidence-backed mapping of the authoritative
     * external statement into the closed classification vocabulary. Statements
     * that are unrecognized or semantically insufficient MUST be mapped to
     * `unknown-ambiguous` (never coerced to failure or success).
     */
    readonly classification: ExternalObservationClassification;
    /** The external statement verbatim (auditable; never interpreted). */
    readonly rawStatement: string;
    readonly observedAt?: string;
    readonly opaque?: Readonly<Record<string, unknown>>;
}
/**
 * Adopt authoritative external observation evidence. The claim is DERIVED
 * from the classification ceiling — a caller-supplied `claim` is rejected,
 * so evidence can never be strengthened beyond what the classification
 * supports (DAC EXTERNAL_AUTHORITY §4). No local cause field is accepted:
 * this class records only externally-originated statements.
 */
export declare function adoptExternalObservationEvidence(input: ExternalObservationEvidenceInput): ExternalObservationEvidence;
export interface ExternalReconciliationOutcomeInput {
    readonly correlation: ExternalEffectCorrelation;
    readonly reconciliation: ExternalReconciliationRef;
    readonly result: ExternalReconciliationResult;
    /**
     * Authoritative external observation basis. Required and decisive for
     * RECONCILED_COMMITTED / RECONCILED_NOT_COMMITTED; for STILL_UNKNOWN /
     * TERMINAL_ABANDONMENT the basis must NOT contain a decisive observation
     * (a decisive basis demands a reconciled result, and unresolved truth
     * stays unresolved).
     */
    readonly basis?: readonly ExternalObservationEvidence[];
    readonly reconciledAt?: string;
    readonly opaque?: Readonly<Record<string, unknown>>;
}
/**
 * Adopt a reconciliation identity/result record. Fail-closed result rules
 * (DAC EXTERNAL_AUTHORITY §3/§4):
 *
 * - `RECONCILED_COMMITTED` requires a basis observation the Business SoR
 *   committed (provider-scope effect success is NOT business commit);
 * - `RECONCILED_NOT_COMMITTED` requires a basis observation that
 *   authoritatively establishes non-commit (rejection or definitive
 *   pre-commit failure) — a local timeout/abandonment can never be the basis
 *   because it cannot produce observation evidence at all;
 * - `STILL_UNKNOWN` / `TERMINAL_ABANDONMENT` keep remote truth `unresolved`
 *   (terminal abandonment is a local stop only) and reject a basis that
 *   already decides commit or non-commit.
 */
export declare function adoptExternalReconciliationOutcome(input: ExternalReconciliationOutcomeInput): ExternalReconciliationOutcome;
export declare function isExternalDispatchAttemptEvidence(v: unknown): v is ExternalDispatchAttemptEvidence;
export declare function isExternalObservationEvidence(v: unknown): v is ExternalObservationEvidence;
export declare function isExternalReconciliationOutcome(v: unknown): v is ExternalReconciliationOutcome;
export declare function expectExternalDispatchAttemptEvidence(v: unknown): asserts v is ExternalDispatchAttemptEvidence;
export declare function expectExternalObservationEvidence(v: unknown): asserts v is ExternalObservationEvidence;
export declare function expectExternalReconciliationOutcome(v: unknown): asserts v is ExternalReconciliationOutcome;
//# sourceMappingURL=guards.d.ts.map