export const PROMOTED_CHILD_BODY_SCHEMA_VERSION = 'promoted-child-workflow/v1';
export class DynamicChildExecutionError extends Error {
    code;
    cause;
    constructor(code, message, cause) {
        super(message);
        this.name = 'DynamicChildExecutionError';
        this.code = code;
        this.cause = cause;
    }
}
/** Fallthrough-eligible fresh-selection outcomes per frozen policy (T-018 consumes). */
export const FALLTHROUGH_ELIGIBLE_CODES = [
    'DYNAMIC_CHILD_INCOMPATIBLE',
    'DYNAMIC_CHILD_NOT_APPLICABLE',
];
//# sourceMappingURL=contracts.js.map