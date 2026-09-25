import type { HarnessErrorCode } from '../contracts/errors.js';
export type ExecutorErrorCode = Extract<HarnessErrorCode, 'timeout' | 'cancelled' | 'invalid_input' | 'invalid_output' | 'tool_error' | 'ai_error'>;
export declare class ExecutorError extends Error {
    readonly code: ExecutorErrorCode;
    constructor(code: ExecutorErrorCode, message: string, options?: ErrorOptions);
}
//# sourceMappingURL=executor-error.d.ts.map