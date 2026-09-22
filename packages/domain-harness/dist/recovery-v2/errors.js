function formatTarget(target) {
    return `${target.workflowId}/${target.instanceKey}`;
}
export class RecoveryTargetNotFoundError extends Error {
    target;
    constructor(target) {
        super(`Workflow target ${formatTarget(target)} does not exist`);
        this.target = target;
        this.name = 'RecoveryTargetNotFoundError';
    }
}
export class RecoveryMessageNotFoundError extends Error {
    target;
    messageId;
    constructor(target, messageId) {
        super(`Message ${messageId} is not durable for ${formatTarget(target)}`);
        this.target = target;
        this.messageId = messageId;
        this.name = 'RecoveryMessageNotFoundError';
    }
}
export class RecoveryStateError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RecoveryStateError';
    }
}
export class RecoveryRetryNotAuthorizedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RecoveryRetryNotAuthorizedError';
    }
}
export class AmbiguousNonIdempotentResolutionRequiredError extends Error {
    effectId;
    constructor(effectId) {
        super(`Ambiguous non-idempotent effect ${effectId} requires an explicit matching ambiguity-resolution authorization before retry`);
        this.effectId = effectId;
        this.name = 'AmbiguousNonIdempotentResolutionRequiredError';
    }
}
export class RecoveryStoreInvariantError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RecoveryStoreInvariantError';
    }
}
//# sourceMappingURL=errors.js.map