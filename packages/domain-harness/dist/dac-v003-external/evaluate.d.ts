import type { DacV003ObservationCurrentnessInput, DacV003ObservationCurrentnessResult, DacV003ReconciliationRef, DacV003ReconciliationRequest, DacV003SafeRetryDecision, DacV003SafeRetryRequest } from './contracts.js';
/**
 * Fail-closed currentness adjudication (EXTERNAL_AUTHORITY §8; conformance
 * C69/C70). Deterministic rules:
 *
 *  - an observation whose own class is STALE, or whose provider-operation
 *    channel is superseded (e.g. by a proven continuation), is STALE for
 *    current truth while remaining valid historical evidence;
 *  - ordering is applied only where the provider metadata establishes it:
 *    within ONE metadata kind (sequence or version), plain integer tokens
 *    order the groups — strictly older ones are STALE, the newest is a
 *    current candidate. Opaque provider tokens and cross-kind comparisons
 *    establish no ordering: those observations stay current candidates;
 *  - materially contradictory current candidates that provider metadata
 *    cannot order apart are CONFLICTING and require reconciliation —
 *    arbitrary last-write-wins is non-conforming and adapter receipt time
 *    is never an ordering authority;
 *  - duplicate delivery does not create stronger truth: identical classes
 *    never manufacture a contradiction.
 *
 * All inputs must bind the same logical operation and authority, else
 * `CORRELATION_CONFLICT`.
 */
export declare function adjudicateDacV003ObservationCurrentness(input: DacV003ObservationCurrentnessInput): DacV003ObservationCurrentnessResult;
/**
 * Mint one exact-operation, exact-authority reconciliation episode (§9).
 * Observational action semantics only — a reconciliation NEVER creates a
 * new effect attempt; an effectful resume must be explicitly modeled as a
 * new AttemptRef/LogicalOperationRef via `effectfulModeling` or the mint
 * fails closed. Historical observations are consumed read-only and never
 * rewritten; the episode establishes a newer evidence-backed current
 * conclusion at most. The record carries no runtime execution authority.
 */
export declare function reconcileDacV003ExternalOperation(request: DacV003ReconciliationRequest): DacV003ReconciliationRef;
/**
 * Evaluate the §11 safe retry/replay decision matrix. Pure and fail-closed:
 *
 * ```text
 * authoritative known non-commit, prior cannot later commit
 *   => same LogicalOperationRef + NEW AttemptRef
 * no prior attempt crossed the dispatch boundary (trustworthy not-dispatched)
 *   => same LogicalOperationRef + NEW AttemptRef
 * proven idempotency guarantee, same identity + equivalent command
 *   => same LogicalOperationRef + NEW AttemptRef + same IdempotencyIdentityRef
 * domain intentionally permits an independent duplicate
 *   => NEW LogicalOperationRef (+ distinct idempotency identity)
 * possible prior dispatch, no proof
 *   => NOT authorized: ambiguity preserved; query/watch/reconcile/policy/
 *      human authority required before another effect attempt
 * later attempt failed while an earlier remains unresolved
 *   => NOT authorized: reconciliation required; overall truth not collapsed
 * ```
 *
 * A local abandonment note never flips a denial into a permission and never
 * becomes non-commit proof. No decision implies commit truth.
 */
export declare function evaluateDacV003SafeRetry(request: DacV003SafeRetryRequest): DacV003SafeRetryDecision;
//# sourceMappingURL=evaluate.d.ts.map