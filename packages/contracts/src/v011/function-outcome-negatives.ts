/**
 * DomainHarness v0.11.0 T01 (#1575) — FunctionOutcome static negatives
 * (L2 §9.3 / §13.5 P1-04 / §10 T01 row).
 *
 * These exported constants are INTENTIONALLY INVALID constructions, each
 * carrying one `@ts-expect-error` directive. They are falsifiable type
 * assertions compiled by every tsc gate of this package (`build` and
 * `typecheck`): if the discriminated union ever loosens (payload becomes
 * optional, or cross-state fields become legal), the directive goes
 * unused and compilation FAILS. Removing or weakening the union type is
 * therefore not silently possible.
 *
 * Runtime shape of each value is asserted in tests/v011 to prove they are
 * real values, not dead type-level comments.
 */
import type { FunctionOutcome } from './app-contracts.js';

// Negative 1/4: SUCCEEDED without `value` must not typecheck.
const succeededMissingValue = { kind: 'SUCCEEDED' } as const;
// @ts-expect-error T01 §9.3 static negative: SUCCEEDED requires `value`.
export const OUTCOME_NEGATIVE_SUCCEEDED_MISSING_VALUE: FunctionOutcome = succeededMissingValue;

// Negative 2/4: FAILED without `failure` must not typecheck.
const failedMissingFailure = { kind: 'FAILED' } as const;
// @ts-expect-error T01 §9.3 static negative: FAILED requires `failure`.
export const OUTCOME_NEGATIVE_FAILED_MISSING_FAILURE: FunctionOutcome = failedMissingFailure;

// Negative 3/4: UNKNOWN without `unknownReason` must not typecheck.
const unknownMissingReason = { kind: 'UNKNOWN' } as const;
// @ts-expect-error T01 §9.3 static negative: UNKNOWN requires `unknownReason`.
export const OUTCOME_NEGATIVE_UNKNOWN_MISSING_REASON: FunctionOutcome = unknownMissingReason;

// Negative 4/4: cross-state excess property (`failure` on SUCCEEDED) must not typecheck.
// @ts-expect-error T01 §9.3 static negative: cross-state excess `failure` is illegal on SUCCEEDED.
export const OUTCOME_NEGATIVE_SUCCEEDED_WITH_FAILURE: FunctionOutcome = { kind: 'SUCCEEDED', value: null, failure: { code: 'DH_TEST', message: 'cross-state mixture' } };
