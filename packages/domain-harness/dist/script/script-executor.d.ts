import { type ResourceLimits } from 'node:worker_threads';
import type { JsonValue } from '../contracts/json.js';
export type ScriptExecutorErrorCode = 'script_error' | 'timeout' | 'cancelled';
export declare class ScriptExecutorError extends Error {
    readonly code: ScriptExecutorErrorCode;
    constructor(code: ScriptExecutorErrorCode, message: string);
}
export interface ScriptSourceExecutionOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
    maxInputBytes?: number;
    maxOutputBytes?: number;
    resourceLimits?: ResourceLimits;
}
export interface ScriptExecutionOptions extends ScriptSourceExecutionOptions {
    harnessRoot: string;
}
export declare class ScriptExecutor {
    /**
     * Compatibility/testing entry point for executing a Script file directly.
     * Runtime workflow execution uses executeSource() with the source frozen by
     * Loader so bytes cannot drift after definitionHash is established.
     */
    execute(scriptRef: string, input: JsonValue, options: ScriptExecutionOptions): Promise<JsonValue>;
    executeSource(source: string, input: JsonValue, options?: ScriptSourceExecutionOptions): Promise<JsonValue>;
}
//# sourceMappingURL=script-executor.d.ts.map