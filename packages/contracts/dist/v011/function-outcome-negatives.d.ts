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
export declare const OUTCOME_NEGATIVE_SUCCEEDED_MISSING_VALUE: FunctionOutcome;
export declare const OUTCOME_NEGATIVE_FAILED_MISSING_FAILURE: FunctionOutcome;
export declare const OUTCOME_NEGATIVE_UNKNOWN_MISSING_REASON: FunctionOutcome;
export declare const OUTCOME_NEGATIVE_SUCCEEDED_WITH_FAILURE: FunctionOutcome;
