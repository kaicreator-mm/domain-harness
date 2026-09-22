import type { JsonValue } from './json.js';
export declare const HARNESS_ERROR_CODES: readonly ["timeout", "cancelled", "interrupted", "step_limit_exceeded", "invalid_input", "invalid_output", "expression_error", "script_error", "tool_error", "ai_error", "child_workflow_error"];
export type HarnessErrorCode = (typeof HARNESS_ERROR_CODES)[number];
export interface HarnessError {
    code: HarnessErrorCode;
    message: string;
    details?: JsonValue;
}
export declare function isHarnessErrorCode(value: unknown): value is HarnessErrorCode;
//# sourceMappingURL=errors.d.ts.map