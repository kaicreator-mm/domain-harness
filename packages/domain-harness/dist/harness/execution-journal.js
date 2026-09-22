import { canonicalJsonStringify, canonicalizeJson, computeCanonicalJsonDigest, isContentDigest, } from '../contracts/identity.js';
export const HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION = 1;
export const HARNESS_OPERATION_IDENTITY_VERSION = 'domain-harness.harness-operation/v1';
function nonEmpty(value, label) {
    if (value.trim().length === 0)
        throw new Error(`${label} must be non-empty`);
}
function validateSlot(slot) {
    nonEmpty(slot.target.workflowId, 'workflowId');
    nonEmpty(slot.target.instanceKey, 'instanceKey');
    nonEmpty(slot.durableControlTurnId, 'durableControlTurnId');
    if (slot.operationKind !== 'ai' && slot.operationKind !== 'query') {
        throw new Error('operationKind must be ai or query');
    }
    if (!Number.isSafeInteger(slot.operationOrdinal) || slot.operationOrdinal <= 0) {
        throw new Error('operationOrdinal must be a positive safe integer');
    }
}
function validateIdentity(identity) {
    if (identity.identityVersion !== HARNESS_OPERATION_IDENTITY_VERSION) {
        throw new Error('unexpected Harness operation identity version');
    }
    validateSlot(identity.slot);
    if (!isContentDigest(identity.semanticContractDigest)) {
        throw new Error('semanticContractDigest must be a content digest');
    }
    if (identity.promotedChildContentDigest !== undefined
        && !isContentDigest(identity.promotedChildContentDigest)) {
        throw new Error('promotedChildContentDigest must be a content digest when supplied');
    }
}
function slotKey(slot) {
    validateSlot(slot);
    return canonicalJsonStringify({
        workflowId: slot.target.workflowId,
        instanceKey: slot.target.instanceKey,
        durableControlTurnId: slot.durableControlTurnId,
        operationKind: slot.operationKind,
        operationOrdinal: slot.operationOrdinal,
    });
}
function identityKey(identity) {
    validateIdentity(identity);
    return canonicalJsonStringify(identity);
}
function outcomeKey(outcome) {
    return canonicalJsonStringify(outcome);
}
function sameIdentity(left, right) {
    return identityKey(left) === identityKey(right);
}
export async function createHarnessExecutionOperationIdentity(context, operationKind, operationOrdinal, operationSemanticMaterial) {
    nonEmpty(context.target.workflowId, 'workflowId');
    nonEmpty(context.target.instanceKey, 'instanceKey');
    nonEmpty(context.durableControlTurnId, 'durableControlTurnId');
    if (!isContentDigest(context.semanticContractDigest)) {
        throw new Error('semanticContractDigest must be a content digest');
    }
    if (context.promotedChildContentDigest !== undefined
        && !isContentDigest(context.promotedChildContentDigest)) {
        throw new Error('promotedChildContentDigest must be a content digest when supplied');
    }
    const slot = {
        target: {
            workflowId: context.target.workflowId,
            instanceKey: context.target.instanceKey,
        },
        durableControlTurnId: context.durableControlTurnId,
        operationKind,
        operationOrdinal,
    };
    validateSlot(slot);
    const semanticContractDigest = await computeCanonicalJsonDigest({
        identityVersion: HARNESS_OPERATION_IDENTITY_VERSION,
        baseSemanticContractDigest: context.semanticContractDigest,
        operationKind,
        semanticMaterial: canonicalizeJson(operationSemanticMaterial),
    }, context.sha256);
    return {
        identityVersion: HARNESS_OPERATION_IDENTITY_VERSION,
        slot,
        semanticContractDigest,
        ...(context.promotedChildContentDigest === undefined
            ? {}
            : { promotedChildContentDigest: context.promotedChildContentDigest }),
    };
}
function journalFailure(identity, code, message) {
    return { status: 'journal-failure', code, message, identity };
}
function inspectExisting(identity, record) {
    if (!sameIdentity(identity, record.identity)) {
        return journalFailure(identity, 'CONFLICTING_SEMANTIC_IDENTITY', 'deterministic Harness execution slot is already bound to a different semantic identity');
    }
    if (record.state === 'started') {
        return journalFailure(identity, 'AMBIGUOUS_COMPLETION', 'Harness operation was started but has no committed outcome; automatic retry is forbidden');
    }
    return {
        status: 'completed',
        evidence: { identity, disposition: 'replayed', outcome: record.outcome },
    };
}
/**
 * Execute one AI/query operation at most once for a deterministic execution slot.
 *
 * A `started` record is written before the external call. If completion is not
 * durably committed, a later attempt fails closed as ambiguous instead of
 * silently repeating possibly-completed work. Real host durability is owned by
 * T-022/T-023; this module defines only the portable logical contract.
 */
export async function executeJournaledHarnessOperation(store, identity, signal, execute) {
    try {
        validateIdentity(identity);
    }
    catch (error) {
        return journalFailure(identity, 'INVALID_EXECUTION_IDENTITY', error instanceof Error ? error.message : String(error));
    }
    if (signal.aborted)
        return { status: 'cancelled', identity };
    let existing;
    try {
        existing = await store.read(identity.slot);
    }
    catch (error) {
        return journalFailure(identity, 'JOURNAL_STORE_ERROR', `journal read failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (existing !== null)
        return inspectExisting(identity, existing) ?? journalFailure(identity, 'JOURNAL_STORE_ERROR', 'unreachable journal record state');
    let begun;
    try {
        begun = await store.begin(identity);
    }
    catch (error) {
        return journalFailure(identity, 'JOURNAL_STORE_ERROR', `journal begin failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (begun.disposition === 'existing') {
        return inspectExisting(identity, begun.record) ?? journalFailure(identity, 'JOURNAL_STORE_ERROR', 'journal begin returned an invalid existing record');
    }
    if (begun.record.state !== 'started' || !sameIdentity(identity, begun.record.identity)) {
        return journalFailure(identity, 'JOURNAL_STORE_ERROR', 'journal begin returned an invalid created record');
    }
    if (signal.aborted)
        return { status: 'cancelled', identity };
    let outcome;
    try {
        outcome = await execute();
    }
    catch (error) {
        if (signal.aborted)
            return { status: 'cancelled', identity };
        outcome = {
            status: 'failed',
            code: 'UNEXPECTED_EXECUTOR_FAILURE',
            message: error instanceof Error ? error.message : String(error),
        };
    }
    if (signal.aborted)
        return { status: 'cancelled', identity };
    try {
        const committed = await store.commit(identity, outcome);
        if (!sameIdentity(identity, committed.identity)) {
            return journalFailure(identity, 'CONFLICTING_SEMANTIC_IDENTITY', 'journal commit returned a conflicting semantic identity');
        }
        if (outcomeKey(committed.outcome) !== outcomeKey(outcome)) {
            return journalFailure(identity, 'CONFLICTING_SEMANTIC_IDENTITY', 'journal commit returned a conflicting committed outcome');
        }
        return {
            status: 'completed',
            evidence: { identity, disposition: 'executed', outcome: committed.outcome },
        };
    }
    catch (error) {
        // The commit call itself may have crossed a crash/transport boundary. Never
        // repeat the external operation in this attempt. A fresh attempt re-reads
        // the durable journal and either replays committed truth or fails ambiguous.
        return journalFailure(identity, 'JOURNAL_STORE_ERROR', `journal commit completion is ambiguous: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/** Portable deterministic logical-reference store; it makes no host durability claim. */
export class VolatileHarnessExecutionJournalStore {
    records = new Map();
    async read(slot) {
        return this.records.get(slotKey(slot)) ?? null;
    }
    async begin(identity) {
        validateIdentity(identity);
        const key = slotKey(identity.slot);
        const existing = this.records.get(key);
        if (existing !== undefined)
            return { disposition: 'existing', record: existing };
        const started = {
            formatVersion: HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION,
            state: 'started',
            identity,
        };
        this.records.set(key, started);
        return { disposition: 'created', record: started };
    }
    async commit(identity, outcome) {
        validateIdentity(identity);
        const key = slotKey(identity.slot);
        const existing = this.records.get(key);
        if (existing === undefined)
            throw new Error('cannot commit a Harness operation that was never begun');
        if (!sameIdentity(identity, existing.identity)) {
            throw new Error('cannot commit a Harness operation under a conflicting semantic identity');
        }
        if (existing.state === 'committed') {
            if (outcomeKey(existing.outcome) !== outcomeKey(outcome)) {
                throw new Error('Harness operation slot already has a different committed outcome');
            }
            return existing;
        }
        const committed = {
            formatVersion: HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION,
            state: 'committed',
            identity,
            outcome,
        };
        this.records.set(key, committed);
        return committed;
    }
    getRecords() {
        return [...this.records.values()].sort((left, right) => {
            const a = slotKey(left.identity.slot);
            const b = slotKey(right.identity.slot);
            return a < b ? -1 : a > b ? 1 : 0;
        });
    }
}
//# sourceMappingURL=execution-journal.js.map