import { prepareProcessedCommandTurn } from './process-command.js';
import { DomainRuntimeError } from './runtime-errors.js';
export function requireV3ProcessCommandStore(store) {
    const candidate = store;
    if (typeof candidate.getProcessData !== 'function'
        || typeof candidate.getCommandOutcome !== 'function'
        || typeof candidate.commitProcessedCommandTurn !== 'function') {
        throw new DomainRuntimeError('process_command_store_required', 'createDomainRuntimeV3 requires the supplied RuntimeStore to implement the frozen T-009 RuntimeStoreProcessCommandExtension');
    }
    return candidate;
}
/**
 * Publish one already-evaluated v3 command result through the existing T-009
 * atomic store extension. This helper never owns a second durability domain.
 */
export async function commitV3ProcessedCommandTurn(request) {
    const { store, current, stored, result, updatedAt } = request;
    const [disposition, processData, existingOutcome] = await Promise.all([
        store.getMessageDisposition(current.address, stored.message.messageId),
        store.getProcessData(current.address),
        store.getCommandOutcome(current.address, stored.message.messageId),
    ]);
    if (disposition === null) {
        throw new Error(`T-009 command ${stored.message.messageId} lost its durable mailbox disposition`);
    }
    if (processData !== null) {
        if (processData.target.workflowId !== current.address.workflowId
            || processData.target.instanceKey !== current.address.instanceKey) {
            throw new Error(`T-009 process data target mismatch for ${stored.message.messageId}`);
        }
        // Process data is mutated only by commitProcessedCommandTurn(). Other
        // authoritative Runtime operations (technical failure, recovery/control
        // settlement, terminalization) may advance the instance revision while
        // preserving process data. Therefore an older snapshot is the last
        // committed process-data value and is carried forward into this command
        // turn; a snapshot from the future is impossible/corrupt and fails closed.
        if (!Number.isSafeInteger(processData.instanceStateRevision)
            || processData.instanceStateRevision < 0
            || processData.instanceStateRevision > current.stateRevision) {
            throw new Error(`T-009 process data revision ${processData.instanceStateRevision} is invalid for current instance revision ${current.stateRevision}`);
        }
    }
    const transition = result.status === 'applied' ? result.transition : undefined;
    const prepared = prepareProcessedCommandTurn({
        instance: current,
        disposition,
        existingOutcome,
    }, {
        target: current.address,
        messageId: stored.message.messageId,
        expectedTargetSequence: stored.ack.targetSequence,
        expectedStateRevision: current.stateRevision,
        nextState: transition?.nextState ?? current.state,
        nextProcessData: processData?.data ?? {},
        nextLifecycle: transition?.nextLifecycle ?? current.lifecycle,
        resolution: result.status === 'rejected'
            ? { status: 'rejected', rejection: result.rejection }
            : { status: 'applied' },
        ...(transition?.output === undefined ? {} : { output: transition.output }),
        updatedAt,
    });
    if (prepared.kind === 'commit') {
        await store.commitProcessedCommandTurn(prepared.commit);
    }
}
//# sourceMappingURL=process-command-integration.js.map