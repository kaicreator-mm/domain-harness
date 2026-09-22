import type { WorkflowAddress } from '../v2/contracts/workflow.js';
export declare class RecoveryTargetNotFoundError extends Error {
    readonly target: WorkflowAddress;
    constructor(target: WorkflowAddress);
}
export declare class RecoveryMessageNotFoundError extends Error {
    readonly target: WorkflowAddress;
    readonly messageId: string;
    constructor(target: WorkflowAddress, messageId: string);
}
export declare class RecoveryStateError extends Error {
    constructor(message: string);
}
export declare class RecoveryRetryNotAuthorizedError extends Error {
    constructor(message: string);
}
export declare class AmbiguousNonIdempotentResolutionRequiredError extends Error {
    readonly effectId: string;
    constructor(effectId: string);
}
export declare class RecoveryStoreInvariantError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=errors.d.ts.map