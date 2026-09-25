import { assertCompatibleEffectRecord, } from '../journal/effect-journal.js';
import { deriveEffectId, } from '../journal/effect-identity.js';
export class RetryableToolExecutionError extends Error {
    effectId;
    attempt;
    constructor(effectId, attempt, cause) {
        super(`retryable Tool effect ${effectId} did not commit a result`, { cause });
        this.name = 'RetryableToolExecutionError';
        this.effectId = effectId;
        this.attempt = attempt;
    }
}
export class JournaledToolFailureError extends Error {
    effectId;
    journal;
    constructor(journal) {
        super(`Tool effect ${journal.effectId} has a committed failed journal fact`);
        this.name = 'JournaledToolFailureError';
        this.effectId = journal.effectId;
        this.journal = journal;
    }
}
function effectKind(descriptor) {
    return `tool:${descriptor.toolId}`;
}
function completedResult(record, replayed) {
    const output = record.output;
    return {
        status: 'completed',
        effectId: record.effectId,
        output,
        attempt: record.attempt,
        replayed,
        journal: record,
    };
}
function recoveryRequired(record) {
    return {
        status: 'recovery_required',
        effectId: record.effectId,
        reason: 'ambiguous-non-idempotent',
        attempt: record.attempt,
        journal: record,
    };
}
export class DurableToolRunner {
    #store;
    #sha256;
    #now;
    constructor(options) {
        this.#store = options.store;
        this.#sha256 = options.sha256;
        this.#now = options.now ?? (() => new Date().toISOString());
    }
    async run(request) {
        const effectId = await deriveEffectId(this.#sha256, request);
        const expected = {
            effectId,
            target: request.target,
            sourceMessageId: request.sourceMessageId,
            effectKind: effectKind(request.descriptor),
            effectSemantics: request.descriptor.effect,
            input: request.input,
        };
        let record = await this.#store.getEffect(effectId);
        let replayed = record !== null;
        if (record !== null) {
            assertCompatibleEffectRecord(record, expected);
            if (record.status === 'completed')
                return completedResult(record, true);
            if (record.status === 'failed')
                throw new JournaledToolFailureError(record);
            if (record.effectSemantics === 'non-idempotent')
                return recoveryRequired(record);
            record = await this.#store.beginEffect({
                effectId,
                target: request.target,
                sourceMessageId: request.sourceMessageId,
                effectKind: expected.effectKind,
                effectSemantics: request.descriptor.effect,
                status: 'started',
                // Frozen L2 A1.4: re-begin identity excludes attempt/startedAt and
                // adapters return the durable record unchanged, so carry the durable
                // attempt instead of a fictional progression the store discards.
                attempt: record.attempt,
                input: request.input,
                startedAt: this.#now(),
            });
        }
        else {
            record = await this.#store.beginEffect({
                effectId,
                target: request.target,
                sourceMessageId: request.sourceMessageId,
                effectKind: expected.effectKind,
                effectSemantics: request.descriptor.effect,
                status: 'started',
                attempt: 1,
                input: request.input,
                startedAt: this.#now(),
            });
            replayed = false;
        }
        assertCompatibleEffectRecord(record, expected);
        if (record.status === 'completed')
            return completedResult(record, true);
        if (record.status === 'failed')
            throw new JournaledToolFailureError(record);
        const activeRecord = record;
        let output;
        try {
            output = await request.executor.execute({
                descriptor: request.descriptor,
                input: request.input,
                context: {
                    effectId,
                    target: request.target,
                    sourceMessageId: request.sourceMessageId,
                    logicalTime: request.logicalTime,
                    attempt: activeRecord.attempt,
                    idempotencyKey: effectId,
                    ...(request.signal === undefined ? {} : { signal: request.signal }),
                },
            });
        }
        catch (error) {
            if (request.descriptor.effect === 'non-idempotent') {
                return recoveryRequired(activeRecord);
            }
            throw new RetryableToolExecutionError(effectId, activeRecord.attempt, error);
        }
        try {
            const completed = await this.#store.completeEffect({
                effectId,
                status: 'completed',
                output,
                completedAt: this.#now(),
            });
            assertCompatibleEffectRecord(completed, expected);
            if (completed.status !== 'completed') {
                throw new Error(`completeEffect returned ${completed.status} for ${effectId}`);
            }
            return completedResult(completed, replayed);
        }
        catch (completeError) {
            let reconciled = null;
            try {
                reconciled = await this.#store.getEffect(effectId);
            }
            catch {
                // The outcome of the journal commit is itself unknown. Fall through to the
                // frozen recovery policy; never infer that a non-idempotent effect is safe.
            }
            if (reconciled !== null) {
                assertCompatibleEffectRecord(reconciled, expected);
                if (reconciled.status === 'completed')
                    return completedResult(reconciled, true);
                if (reconciled.status === 'failed')
                    throw new JournaledToolFailureError(reconciled);
                if (request.descriptor.effect === 'non-idempotent') {
                    return recoveryRequired(reconciled);
                }
            }
            if (request.descriptor.effect === 'non-idempotent') {
                return recoveryRequired(activeRecord);
            }
            throw new RetryableToolExecutionError(effectId, activeRecord.attempt, completeError);
        }
    }
}
//# sourceMappingURL=durable-tool-runner.js.map