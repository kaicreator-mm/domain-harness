// Negative 1/4: SUCCEEDED without `value` must not typecheck.
const succeededMissingValue = { kind: 'SUCCEEDED' };
// @ts-expect-error T01 §9.3 static negative: SUCCEEDED requires `value`.
export const OUTCOME_NEGATIVE_SUCCEEDED_MISSING_VALUE = succeededMissingValue;
// Negative 2/4: FAILED without `failure` must not typecheck.
const failedMissingFailure = { kind: 'FAILED' };
// @ts-expect-error T01 §9.3 static negative: FAILED requires `failure`.
export const OUTCOME_NEGATIVE_FAILED_MISSING_FAILURE = failedMissingFailure;
// Negative 3/4: UNKNOWN without `unknownReason` must not typecheck.
const unknownMissingReason = { kind: 'UNKNOWN' };
// @ts-expect-error T01 §9.3 static negative: UNKNOWN requires `unknownReason`.
export const OUTCOME_NEGATIVE_UNKNOWN_MISSING_REASON = unknownMissingReason;
// Negative 4/4: cross-state excess property (`failure` on SUCCEEDED) must not typecheck.
// @ts-expect-error T01 §9.3 static negative: cross-state excess `failure` is illegal on SUCCEEDED.
export const OUTCOME_NEGATIVE_SUCCEEDED_WITH_FAILURE = { kind: 'SUCCEEDED', value: null, failure: { code: 'DH_TEST', message: 'cross-state mixture' } };
