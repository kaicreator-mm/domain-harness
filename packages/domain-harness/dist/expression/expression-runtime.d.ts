import type { JsonValue } from '../contracts/json.js';
export type ExpressionRuntimeErrorCode = 'expression_error' | 'timeout' | 'cancelled';
export declare class ExpressionRuntimeError extends Error {
    readonly code: ExpressionRuntimeErrorCode;
    constructor(code: ExpressionRuntimeErrorCode, message: string);
}
export interface ExpressionEvaluationOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
    maxInputBytes?: number;
    maxOutputBytes?: number;
    stackLimit?: number;
}
export declare class ExpressionRuntime {
    evaluate(expressionSource: string, scope: JsonValue, logicalTime: string, options?: ExpressionEvaluationOptions): Promise<JsonValue>;
    evaluateBoolean(expression: string, scope: JsonValue, logicalTime: string, options?: ExpressionEvaluationOptions): Promise<boolean>;
}
//# sourceMappingURL=expression-runtime.d.ts.map