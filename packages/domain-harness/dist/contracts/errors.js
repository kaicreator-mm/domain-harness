export const HARNESS_ERROR_CODES = [
    'timeout',
    'cancelled',
    'interrupted',
    'step_limit_exceeded',
    'invalid_input',
    'invalid_output',
    'expression_error',
    'script_error',
    'tool_error',
    'ai_error',
    'child_workflow_error',
];
export function isHarnessErrorCode(value) {
    return typeof value === 'string' && HARNESS_ERROR_CODES.includes(value);
}
//# sourceMappingURL=errors.js.map