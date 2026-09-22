import { AMBIGUOUS_NON_IDEMPOTENT_EFFECT_FAILURE_CODE, } from './contracts.js';
import { AmbiguousNonIdempotentResolutionRequiredError, RecoveryMessageNotFoundError, RecoveryRetryNotAuthorizedError, RecoveryStateError, RecoveryStoreInvariantError, RecoveryTargetNotFoundError, } from './errors.js';
/**
 * T-013 recovery policy over frozen RuntimeStore semantic operations.
 *
 * This coordinator deliberately does not create another per-instance lane. T-016 must invoke
 * state-changing recovery operations from the same T-010 serialized execution boundary used by
 * normal message processing. RuntimeStore remains the atomic durability authority.
 */
export class PoisonMessageRecoveryCoordinator {
    store;
    #now;
    constructor(store, options = {}) {
        this.store = store;
        this.#now = options.now ?? (() => new Date().toISOString());
    }
    async inspect(target, messageId) {
        const [instance, message] = await Promise.all([
            this.#requireInstance(target),
            this.#requireDisposition(target, messageId),
        ]);
        return { instance, message };
    }
    async nextProcessableMessage(target) {
        const instance = await this.#requireInstance(target);
        if (instance.lifecycle === 'recovery_required' || isTerminal(instance.lifecycle)) {
            return null;
        }
        const next = await this.store.getNextAcceptedMessage(target);
        if (next !== null && !sameAddress(next.message.target, target)) {
            throw new RecoveryStoreInvariantError(`RuntimeStore returned a message for another target while reading ${formatTarget(target)}`);
        }
        return next;
    }
    async recordProcessingFailure(request) {
        const current = await this.#requireInstance(request.target);
        const disposition = await this.#requireDisposition(request.target, request.messageId);
        assertSequence(disposition.targetSequence, request.expectedTargetSequence, request.messageId);
        if (current.lifecycle === 'recovery_required') {
            if (disposition.disposition === 'failed') {
                return { instance: current, message: disposition };
            }
            throw new RecoveryStateError(`Workflow target ${formatTarget(request.target)} already requires recovery for another unresolved message`);
        }
        if (isTerminal(current.lifecycle)) {
            throw new RecoveryStateError(`Cannot record processing failure for terminal workflow ${formatTarget(request.target)} (${current.lifecycle})`);
        }
        if (disposition.disposition !== 'accepted' && disposition.disposition !== 'processing') {
            throw new RecoveryStateError(`Message ${request.messageId} cannot become poison from disposition ${disposition.disposition}`);
        }
        const failure = normalizeFailure(request.failure, request.messageId);
        await this.store.failMessageProcessing({
            target: request.target,
            messageId: request.messageId,
            expectedTargetSequence: request.expectedTargetSequence,
            failure: failureToJson(failure),
            updatedAt: this.#now(),
        });
        const result = await this.inspect(request.target, request.messageId);
        if (result.instance.lifecycle !== 'recovery_required') {
            throw new RecoveryStoreInvariantError(`RuntimeStore did not enter recovery_required after message ${request.messageId} failed`);
        }
        if (result.message.disposition !== 'failed') {
            throw new RecoveryStoreInvariantError(`RuntimeStore did not persist failed disposition for poison message ${request.messageId}`);
        }
        return result;
    }
    recordToolRecoveryRequired(request) {
        return this.recordProcessingFailure({
            target: request.target,
            messageId: request.messageId,
            expectedTargetSequence: request.expectedTargetSequence,
            failure: {
                code: AMBIGUOUS_NON_IDEMPOTENT_EFFECT_FAILURE_CODE,
                message: request.message ??
                    `Non-idempotent effect ${request.effect.effectId} has an ambiguous durable outcome`,
                sourceMessageId: request.messageId,
                effectId: request.effect.effectId,
                details: {
                    effectSemantics: 'non-idempotent',
                    recoveryReason: request.effect.reason,
                    attempt: request.effect.attempt,
                },
            },
        });
    }
    async retry(request) {
        const inspection = await this.inspect(request.target, request.messageId);
        if (inspection.instance.lifecycle !== 'recovery_required') {
            throw new RecoveryStateError(`Workflow target ${formatTarget(request.target)} is ${inspection.instance.lifecycle}, not recovery_required`);
        }
        if (inspection.message.disposition !== 'failed') {
            throw new RecoveryStateError(`Recovery retry requires failed poison message ${request.messageId}; found ${inspection.message.disposition}`);
        }
        this.#assertRetryAuthorization(inspection.message.failure, request.authorization);
        const reset = await this.store.resetRecovery(request.target, this.#now());
        if (reset.lifecycle !== 'active' && reset.lifecycle !== 'waiting') {
            throw new RecoveryStoreInvariantError(`RuntimeStore resetRecovery returned non-accepting lifecycle ${reset.lifecycle}`);
        }
        const message = await this.#requireDisposition(request.target, request.messageId);
        if (message.disposition !== 'accepted') {
            throw new RecoveryStoreInvariantError(`RuntimeStore resetRecovery did not restore poison message ${request.messageId} to accepted; found ${message.disposition}`);
        }
        return { instance: reset, message };
    }
    async terminalize(request) {
        const current = await this.#requireInstance(request.target);
        if (request.mode === 'normal') {
            if (current.lifecycle === 'recovery_required') {
                throw new RecoveryStateError(`Recovery-required workflow ${formatTarget(request.target)} needs an explicit recovery terminalization`);
            }
            if (isTerminal(current.lifecycle)) {
                if (current.lifecycle === request.lifecycle)
                    return current;
                throw new RecoveryStateError(`Workflow ${formatTarget(request.target)} is already terminal as ${current.lifecycle}`);
            }
        }
        else {
            if (current.lifecycle !== 'recovery_required') {
                throw new RecoveryStateError(`Recovery terminalization requires recovery_required; ${formatTarget(request.target)} is ${current.lifecycle}`);
            }
            if (request.authorization.reason.trim().length === 0) {
                throw new RecoveryRetryNotAuthorizedError('Recovery terminalization requires a non-empty domain authorization reason');
            }
        }
        await this.store.terminalizeInstance({
            target: request.target,
            lifecycle: request.lifecycle,
            ...(request.output === undefined ? {} : { output: request.output }),
            ...(request.reason === undefined ? {} : { reason: request.reason }),
            updatedAt: this.#now(),
        });
        const terminal = await this.#requireInstance(request.target);
        if (terminal.lifecycle !== request.lifecycle) {
            throw new RecoveryStoreInvariantError(`RuntimeStore terminalized ${formatTarget(request.target)} as ${terminal.lifecycle}; expected ${request.lifecycle}`);
        }
        return terminal;
    }
    async #requireInstance(target) {
        const instance = await this.store.getInstance(target);
        if (instance === null)
            throw new RecoveryTargetNotFoundError(target);
        if (!sameAddress(instance.address, target)) {
            throw new RecoveryStoreInvariantError(`RuntimeStore returned ${formatTarget(instance.address)} for requested ${formatTarget(target)}`);
        }
        return instance;
    }
    async #requireDisposition(target, messageId) {
        const disposition = await this.store.getMessageDisposition(target, messageId);
        if (disposition === null)
            throw new RecoveryMessageNotFoundError(target, messageId);
        if (!sameAddress(disposition.target, target) || disposition.messageId !== messageId) {
            throw new RecoveryStoreInvariantError(`RuntimeStore returned mismatched disposition while reading ${messageId} for ${formatTarget(target)}`);
        }
        return disposition;
    }
    #assertRetryAuthorization(failure, authorization) {
        if (authorization.reason.trim().length === 0) {
            throw new RecoveryRetryNotAuthorizedError('Recovery retry requires a non-empty authorization reason');
        }
        if (failure?.code !== AMBIGUOUS_NON_IDEMPOTENT_EFFECT_FAILURE_CODE) {
            if (authorization.kind !== 'domain-policy') {
                throw new RecoveryRetryNotAuthorizedError('Ordinary poison-message retry requires domain-policy authorization');
            }
            return;
        }
        const effectId = failure.effectId;
        if (!effectId) {
            throw new RecoveryStoreInvariantError('Ambiguous non-idempotent recovery failure is missing effectId');
        }
        if (authorization.kind !== 'ambiguous-non-idempotent-resolved' ||
            authorization.effectId !== effectId) {
            throw new AmbiguousNonIdempotentResolutionRequiredError(effectId);
        }
    }
}
function normalizeFailure(failure, messageId) {
    if (failure.code.trim().length === 0 || failure.message.trim().length === 0) {
        throw new RecoveryStateError('Runtime failure code and message must be non-empty');
    }
    if (failure.sourceMessageId !== undefined && failure.sourceMessageId !== messageId) {
        throw new RecoveryStateError(`Runtime failure sourceMessageId ${failure.sourceMessageId} does not match poison message ${messageId}`);
    }
    return {
        ...failure,
        sourceMessageId: messageId,
    };
}
function failureToJson(failure) {
    return {
        code: failure.code,
        message: failure.message,
        sourceMessageId: failure.sourceMessageId ?? null,
        effectId: failure.effectId ?? null,
        details: failure.details ?? null,
    };
}
function assertSequence(actual, expected, messageId) {
    if (actual !== expected) {
        throw new RecoveryStateError(`Message ${messageId} has target sequence ${actual}; expected ${expected}`);
    }
}
function sameAddress(left, right) {
    return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}
function formatTarget(target) {
    return `${target.workflowId}/${target.instanceKey}`;
}
function isTerminal(lifecycle) {
    return (lifecycle === 'completed' ||
        lifecycle === 'failed' ||
        lifecycle === 'cancelled' ||
        lifecycle === 'terminated');
}
//# sourceMappingURL=poison-message-recovery.js.map