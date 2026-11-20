/** 当前领域契约：单一结构定义与严格的数据验证。 */
import type { FunctionOutcome } from './app-contracts.js';

const succeededMissingValue = { kind: 'SUCCEEDED' } as const;
// @ts-expect-error 此处必须触发静态类型错误
export const OUTCOME_NEGATIVE_SUCCEEDED_MISSING_VALUE: FunctionOutcome = succeededMissingValue;

const failedMissingFailure = { kind: 'FAILED' } as const;
// @ts-expect-error 此处必须触发静态类型错误
export const OUTCOME_NEGATIVE_FAILED_MISSING_FAILURE: FunctionOutcome = failedMissingFailure;

const unknownMissingReason = { kind: 'UNKNOWN' } as const;
// @ts-expect-error 此处必须触发静态类型错误
export const OUTCOME_NEGATIVE_UNKNOWN_MISSING_REASON: FunctionOutcome = unknownMissingReason;

// @ts-expect-error 此处必须触发静态类型错误
export const OUTCOME_NEGATIVE_SUCCEEDED_WITH_FAILURE: FunctionOutcome = { kind: 'SUCCEEDED', value: null, failure: { code: 'DH_TEST', message: 'cross-state mixture' } };
