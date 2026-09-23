import type { DacV003BaselineInput } from '../dac-v003/contracts.js';
import { type DacV003AttemptEvidenceClass, type DacV003AttemptEvidenceMeaning, type DacV003AttemptRef, type DacV003AttemptRefInput, type DacV003AuthoritativeEffectRecordRef, type DacV003AuthoritativeEffectRecordRefInput, type DacV003CapabilityDeclarationInput, type DacV003ExternalAuthorityRef, type DacV003ExternalAuthorityRefInput, type DacV003ExternalCapabilityRef, type DacV003ExternalOutcome, type DacV003ExternalOutcomeClass, type DacV003ExternalObservationRef, type DacV003ExternalObservationRefInput, type DacV003IdempotencyIdentityRef, type DacV003IdempotencyIdentityRefInput, type DacV003LogicalOperationRef, type DacV003LogicalOperationRefInput, type DacV003ProviderOperationRef, type DacV003ProviderOperationRefInput, type DacV003ReconciliationActionSemantics, type DacV003RecoveryCapabilityFamily, type DacV003RecoveryCapabilityRef, type DacV003UpstreamV002Evidence } from './contracts.js';
/** Adopt the external Business SoR / effect-authority identity and scope. */
export declare function adoptDacV003ExternalAuthorityRef(input: DacV003ExternalAuthorityRefInput): DacV003ExternalAuthorityRef;
export declare function isDacV003ExternalAuthorityRef(v: unknown): v is DacV003ExternalAuthorityRef;
export declare function expectDacV003ExternalAuthorityRef(v: unknown): asserts v is DacV003ExternalAuthorityRef;
/**
 * Adopt the application/Runtime-owned identity of ONE intended logical
 * external effect. Exactly 1 bound external authority (§3 row 2); an
 * idempotency identity, when bound, must already be provably bound to this
 * exact logical-effect semantic identity and authority (§7 rule 1 /
 * conformance C66). Adoption proves intent/correlation only — never
 * dispatch, acceptance, success or commit.
 */
export declare function adoptDacV003LogicalOperationRef(input: DacV003LogicalOperationRefInput): DacV003LogicalOperationRef;
export declare function isDacV003LogicalOperationRef(v: unknown): v is DacV003LogicalOperationRef;
export declare function expectDacV003LogicalOperationRef(v: unknown): asserts v is DacV003LogicalOperationRef;
/**
 * §4 rule 2 fail-closed continuity guard: the logical-operation identity is
 * stable only across attempts that still intend the SAME external effect. A
 * change to material command semantics, external authority, or semantic
 * target REQUIRES a new logical operation — presenting the prior reference
 * as the continuation of a changed intent throws (`IDENTITY_MISMATCH`),
 * it is never silently rebased.
 */
export declare function assertDacV003LogicalOperationContinuity(prior: DacV003LogicalOperationRef, next: Pick<DacV003LogicalOperationRef, 'externalAuthority' | 'operationSemanticIdentity' | 'semanticTargetRefs'>): void;
/** Adopt a provider-issued job/operation identity (exactly 1 authority). */
export declare function adoptDacV003ProviderOperationRef(input: DacV003ProviderOperationRefInput): DacV003ProviderOperationRef;
export declare function isDacV003ProviderOperationRef(v: unknown): v is DacV003ProviderOperationRef;
export declare function expectDacV003ProviderOperationRef(v: unknown): asserts v is DacV003ProviderOperationRef;
/**
 * Adopt one delivery/execution attempt (exactly 1 logical operation, §5
 * evidence class). The attempt identity MUST differ from the logical
 * operation identity (conformance C67: attempt identity may never collapse
 * into the logical operation where attempts can differ).
 */
export declare function adoptDacV003AttemptRef(input: DacV003AttemptRefInput): DacV003AttemptRef;
export declare function isDacV003AttemptRef(v: unknown): v is DacV003AttemptRef;
export declare function expectDacV003AttemptRef(v: unknown): asserts v is DacV003AttemptRef;
/**
 * Fail-closed attempt-identity distinctness within one logical operation:
 * replaying over the first attempt's identity is non-conforming (§3 row 3 /
 * conformance C67). Every materially distinct delivery/replay/transport
 * execution must carry its own `AttemptRef` identity.
 */
export declare function assertDacV003AttemptIdentitiesDistinct(attempts: readonly DacV003AttemptRef[]): void;
/**
 * The strongest justified meaning one attempt evidence class carries
 * (EXTERNAL_AUTHORITY §5 table). A dispatch-attempted or ambiguous attempt
 * NEVER carries provider receipt/acceptance/non-commit/commit truth, and a
 * known pre-commit failure covers THIS attempt only.
 */
export declare function maxJustifiedMeaningForAttemptEvidence(evidenceClass: DacV003AttemptEvidenceClass): DacV003AttemptEvidenceMeaning;
/** Adopt an exact effect-record identity inside the authority scope (§6). */
export declare function adoptDacV003AuthoritativeEffectRecordRef(input: DacV003AuthoritativeEffectRecordRefInput): DacV003AuthoritativeEffectRecordRef;
export declare function isDacV003AuthoritativeEffectRecordRef(v: unknown): v is DacV003AuthoritativeEffectRecordRef;
export declare function expectDacV003AuthoritativeEffectRecordRef(v: unknown): asserts v is DacV003AuthoritativeEffectRecordRef;
/** Adopt an idempotency identity with issuer + promised dedup scope (§7). */
export declare function adoptDacV003IdempotencyIdentityRef(input: DacV003IdempotencyIdentityRefInput): DacV003IdempotencyIdentityRef;
export declare function isDacV003IdempotencyIdentityRef(v: unknown): v is DacV003IdempotencyIdentityRef;
export declare function expectDacV003IdempotencyIdentityRef(v: unknown): asserts v is DacV003IdempotencyIdentityRef;
/**
 * Fail-closed idempotency reuse check for the replay path (§7 rules 1–2 /
 * conformance C66): the same identity/key may only be replayed against the
 * SAME issuer, promised dedup scope, bound external authority and bound
 * logical-effect semantic identity. Any divergence is a contract violation,
 * never a "probably the same" pass.
 */
export declare function assertDacV003IdempotencyReuseForLogicalEffect(idempotencyIdentity: DacV003IdempotencyIdentityRef, logicalOperation: DacV003LogicalOperationRef, intendedCommandSemanticIdentity: string): void;
/**
 * §7 rule 4: a key recorded locally without provider/integration evidence of
 * deduplication is correlation metadata only. The guarantee is proven only
 * when evidence refs were presented AND the equivalence rule was established
 * from evidence/contract.
 */
export declare function isDacV003IdempotencyGuaranteeProven(idempotencyIdentity: DacV003IdempotencyIdentityRef): boolean;
/**
 * Adopt one immutable externally-originated observation (§8). Exactly 1
 * external authority + exactly 1 logical operation; provider
 * currentness/provenance metadata is preserved verbatim; the raw statement is
 * preserved when interpretation is lossy. The observation is frozen history:
 * later reconciliation supersedes the CURRENT conclusion, never this record.
 */
export declare function adoptDacV003ExternalObservationRef(input: DacV003ExternalObservationRefInput): DacV003ExternalObservationRef;
export declare function isDacV003ExternalObservationRef(v: unknown): v is DacV003ExternalObservationRef;
export declare function expectDacV003ExternalObservationRef(v: unknown): asserts v is DacV003ExternalObservationRef;
/**
 * Declare a recovery capability (§3 row 9 / §10). A DECLARATION only: it is
 * not evidence that the bound provider/integration satisfies it
 * (`assertDacV003CapabilitySatisfaction`), not a composition
 * `capability-requirement` reference, and not live operation state.
 */
export declare function declareDacV003RecoveryCapability(input: DacV003CapabilityDeclarationInput): DacV003RecoveryCapabilityRef;
/**
 * Declare an external capability of a bound integration/profile target
 * (§3 row 10 / §10). Same declaration-vs-evidence separation; whether the
 * two capability roles share one concrete type stays PROVISIONAL.
 */
export declare function declareDacV003ExternalCapability(input: DacV003CapabilityDeclarationInput): DacV003ExternalCapabilityRef;
export declare function isDacV003RecoveryCapabilityRef(v: unknown): v is DacV003RecoveryCapabilityRef;
export declare function expectDacV003RecoveryCapabilityRef(v: unknown): asserts v is DacV003RecoveryCapabilityRef;
export declare function isDacV003ExternalCapabilityRef(v: unknown): v is DacV003ExternalCapabilityRef;
export declare function expectDacV003ExternalCapabilityRef(v: unknown): asserts v is DacV003ExternalCapabilityRef;
/**
 * Fail-closed declaration-vs-satisfaction closure (§10): the required
 * capability family must be covered by at least one declaration whose
 * satisfaction is actually asserted with evidence refs. A bare declaration
 * never passes — declared capability != proven satisfaction.
 */
export declare function assertDacV003CapabilitySatisfaction(declarations: readonly (DacV003RecoveryCapabilityRef | DacV003ExternalCapabilityRef)[], requiredFamily: DacV003RecoveryCapabilityFamily): void;
/** Construct a namespaced external-operation outcome value. */
export declare function dacV003ExternalOutcome(value: DacV003ExternalOutcomeClass): DacV003ExternalOutcome;
/**
 * Namespace guard: only External Operation Outcome / Observation values
 * pass. Reference/compatibility disposition values (e.g. the V3-001
 * `INCOMPATIBLE`) are rejected by construction — `UNKNOWN_AMBIGUOUS !=
 * INCOMPATIBLE` (§11 anti-conflation).
 */
export declare function isDacV003ExternalOutcome(v: unknown): v is DacV003ExternalOutcome;
/**
 * Adopt a v0.0.3 observation from a GENUINE #309 (v0.0.2)
 * `ExternalObservationEvidence` record — the durable external-effect
 * evidence surface consumed read-only. The v0.0.2 classification maps 1:1
 * onto the v0.0.3 outcome class with the claim ceiling preserved exactly
 * (never strengthened); the correlation identities must match the v0.0.3
 * bindings exactly or the adoption fails closed.
 */
export declare function adoptDacV003ObservationFromV002Evidence(evidence: unknown, bindings: {
    readonly baseline: DacV003BaselineInput;
    readonly observationIdentity: string;
    readonly externalAuthority: DacV003ExternalAuthorityRef;
    readonly logicalOperation: DacV003LogicalOperationRef;
    readonly producer: string;
    readonly providerCurrentness?: DacV003ExternalObservationRef['providerCurrentness'];
}): DacV003ExternalObservationRef;
/** Guard for genuine #309 upstream evidence records (either class). */
export declare function isDacV003UpstreamV002Evidence(v: unknown): v is DacV003UpstreamV002Evidence;
export declare function expectDacV003UpstreamV002Evidence(v: unknown): asserts v is DacV003UpstreamV002Evidence;
/**
 * Fail-closed action-semantics vocabulary check: the observational
 * reconciliation surface (§9) accepts only the five observational action
 * semantics. `retry-same-logical-effect` and `new-independent-operation`
 * are effectful actions owned by `evaluateDacV003SafeRetry` — presenting
 * either here fails closed instead of hiding an effect inside a
 * reconciliation episode.
 */
export declare function assertDacV003ReconciliationActionSemantics(actionSemantics: unknown): asserts actionSemantics is DacV003ReconciliationActionSemantics;
/**
 * Conformance C60/C76: a Harness-side DAC v0.0.3 reference (runtime
 * implementation, host binding, compatibility surface, …) can never be
 * presented as external Business SoR / effect-authority identity. External
 * authority scope is never transferred by composition.
 */
export declare function refuteDacV003HarnessSideIdentityAsExternalAuthority(v: unknown): void;
/**
 * Conformance C67: the attempt identity may never collapse into — or
 * substitute — the logical operation identity where attempts can differ.
 */
export declare function refuteDacV003AttemptAsLogicalOperation(v: unknown): void;
/**
 * Conformance C68: the provider job/operation identity may never substitute
 * the authoritative effect/business record identity inside the external
 * authority scope.
 */
export declare function refuteDacV003ProviderOperationAsAuthoritativeEffectRecord(v: unknown): void;
/** Local-cause shapes that can never become remote truth evidence (§2/§10). */
export type DacV003LocalCauseKind = 'local-timeout' | 'local-cancel' | 'local-interrupt' | 'local-abandonment';
/**
 * Conformance C64 + §2/§10: local timeout, cancellation, interruption or
 * abandonment material can NEVER be presented as evidence of remote
 * rollback, non-commit, or any remote truth. `cancel/abort` capability
 * declarations support only the cancellation REQUEST semantic — a local
 * cancel/interrupt never fabricates remote rollback or known non-commit.
 */
export declare function refuteDacV003LocalCauseAsRemoteTruth(input: {
    readonly cause: DacV003LocalCauseKind;
    readonly claimedRemoteTruth: DacV003ExternalOutcomeClass | 'rollback' | 'non-commit';
}): void;
/**
 * Composition handoff boundary (EXTERNAL_AUTHORITY §13): the composition /
 * compatibility lane may consume ONLY declarative semantic requirements —
 * external authority declarations and capability declarations. Presenting
 * live operation state (a logical operation, attempt, provider job,
 * live-operation idempotency key, observation, reconciliation episode, or
 * authoritative effect record instance) into the composition handoff fails
 * closed: the Manifest is not an operation journal, workflow store,
 * provider job store, or execution state machine.
 */
export declare function assertDacV003CompositionHandoffIsDeclarative(items: readonly unknown[]): void;
//# sourceMappingURL=guards.d.ts.map