import { type ExecutorErrorCode } from './executor-error.js';
export interface AbortableExecutionOptions {
    signal: AbortSignal;
    timeoutMs?: number;
}
export declare function runAbortable<T>(options: AbortableExecutionOptions, failureCode: Extract<ExecutorErrorCode, 'tool_error' | 'ai_error'>, label: string, execute: (signal: AbortSignal) => Promise<T>): Promise<T>;
//# sourceMappingURL=abortable.d.ts.map