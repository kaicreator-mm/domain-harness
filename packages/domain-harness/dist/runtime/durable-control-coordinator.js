import { canonicalJsonStringify } from '../contracts/identity.js';
export class DurableControlError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'DurableControlError';
        this.code = code;
    }
}
const MAX_COMPARE_AND_SET_ATTEMPTS = 8;
function requireNonEmpty(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new DurableControlError('INVALID_ARGUMENT', `${name} must be a non-empty string`);
    }
}
function instantMillis(value, name) {
    requireNonEmpty(value, name);
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
        throw new DurableControlError('INVALID_ARGUMENT', `${name} must be a valid timestamp`);
    }
    return parsed;
}
function requirePositiveOrdinal(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new DurableControlError('INVALID_ARGUMENT', `${name} must be a positive safe integer`);
    }
}
function sameTarget(left, right) {
    return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}
function targetMaterial(target) {
    requireNonEmpty(target.workflowId, 'target.workflowId');
    requireNonEmpty(target.instanceKey, 'target.instanceKey');
    return [target.workflowId, target.instanceKey];
}
function durableControlTurnId(material) {
    return `dct:v1:${canonicalJsonStringify(material)}`;
}
function deadlineSource(record, fireOrdinal, observedAt) {
    return {
        kind: 'deadline',
        durableControlTurnId: durableControlTurnId([
            'deadline',
            ...targetMaterial(record.target),
            record.deadlineTimerId,
            fireOrdinal,
        ]),
        target: record.target,
        externalCorrelationId: record.externalCorrelationId,
        timerId: record.deadlineTimerId,
        fireOrdinal,
        observedAt,
    };
}
function callbackSource(record, callbackOrdinal, payload, observedAt) {
    return {
        kind: 'external_callback',
        durableControlTurnId: durableControlTurnId([
            'external_callback',
            ...targetMaterial(record.target),
            record.externalCorrelationId,
            callbackOrdinal,
        ]),
        target: record.target,
        externalCorrelationId: record.externalCorrelationId,
        callbackOrdinal,
        payload,
        observedAt,
    };
}
function assertProvisioningIdentity(request, result) {
    const record = result.record;
    const exact = record.provisioningKey === request.provisioningKey &&
        sameTarget(record.target, request.target) &&
        record.correlationId === request.correlationId &&
        record.packageId === request.packageId &&
        canonicalJsonStringify(record.input) === canonicalJsonStringify(request.input);
    if (!exact) {
        throw new DurableControlError('PROVISIONING_IDENTITY_CONFLICT', `provisioning key ${request.provisioningKey} is already bound to different logical material`);
    }
}
function assertExternalWorkIdentity(request, record) {
    const exact = record.externalCorrelationId === request.externalCorrelationId &&
        sameTarget(record.target, request.target) &&
        record.deadlineTimerId === request.deadlineTimerId &&
        record.dueAt === request.dueAt;
    if (!exact) {
        throw new DurableControlError('EXTERNAL_WORK_IDENTITY_CONFLICT', `external correlation ${request.externalCorrelationId} is already bound to different logical material`);
    }
}
function assertRequestTargetsRecord(target, record) {
    if (!sameTarget(target, record.target)) {
        throw new DurableControlError('TARGET_MISMATCH', `external correlation ${record.externalCorrelationId} belongs to a different workflow instance`);
    }
}
function timedOutRecord(current, terminalSource, updatedAt) {
    return {
        externalCorrelationId: current.externalCorrelationId,
        target: current.target,
        deadlineTimerId: current.deadlineTimerId,
        dueAt: current.dueAt,
        status: 'timed_out',
        revision: current.revision + 1,
        terminalSource,
        createdAt: current.createdAt,
        updatedAt,
    };
}
function callbackCompletedRecord(current, terminalSource, updatedAt) {
    return {
        externalCorrelationId: current.externalCorrelationId,
        target: current.target,
        deadlineTimerId: current.deadlineTimerId,
        dueAt: current.dueAt,
        status: 'callback_received',
        revision: current.revision + 1,
        terminalSource,
        createdAt: current.createdAt,
        updatedAt,
    };
}
function requireValidRevision(record) {
    if (!Number.isSafeInteger(record.revision) || record.revision < 0) {
        throw new DurableControlError('STORE_CONTRACT_VIOLATION', `external correlation ${record.externalCorrelationId} has invalid revision`);
    }
}
function storeContractViolation(message) {
    throw new DurableControlError('STORE_CONTRACT_VIOLATION', message);
}
function asStoredObject(value, name) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return storeContractViolation(`${name} must be an object`);
    }
    return value;
}
function storedNonEmptyString(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        return storeContractViolation(`${name} must be a non-empty string`);
    }
    return value;
}
function storedInstant(value, name) {
    const text = storedNonEmptyString(value, name);
    if (!Number.isFinite(Date.parse(text))) {
        return storeContractViolation(`${name} must be a valid timestamp`);
    }
    return text;
}
function storedPositiveOrdinal(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        return storeContractViolation(`${name} must be a positive safe integer`);
    }
    return value;
}
function storedTarget(value, name) {
    const target = asStoredObject(value, name);
    return {
        workflowId: storedNonEmptyString(target.workflowId, `${name}.workflowId`),
        instanceKey: storedNonEmptyString(target.instanceKey, `${name}.instanceKey`),
    };
}
function assertStoredJson(value, name) {
    if (value === undefined) {
        return storeContractViolation(`${name} must be valid JSON material`);
    }
    try {
        canonicalJsonStringify(value);
    }
    catch {
        return storeContractViolation(`${name} must be valid canonical JSON material`);
    }
    return value;
}
function assertStoredTerminalSource(record, rawRecord) {
    const source = asStoredObject(rawRecord.terminalSource, 'terminalSource');
    const sourceTarget = storedTarget(source.target, 'terminalSource.target');
    if (!sameTarget(sourceTarget, record.target)) {
        storeContractViolation('terminalSource target does not match external-work record target');
    }
    if (storedNonEmptyString(source.externalCorrelationId, 'terminalSource.externalCorrelationId') !== record.externalCorrelationId) {
        storeContractViolation('terminalSource external correlation does not match external-work record');
    }
    storedInstant(source.observedAt, 'terminalSource.observedAt');
    const storedTurnId = storedNonEmptyString(source.durableControlTurnId, 'terminalSource.durableControlTurnId');
    if (record.status === 'timed_out') {
        if (source.kind !== 'deadline') {
            storeContractViolation('timed_out record must contain a deadline terminalSource');
        }
        const timerId = storedNonEmptyString(source.timerId, 'terminalSource.timerId');
        if (timerId !== record.deadlineTimerId) {
            storeContractViolation('deadline terminalSource timerId does not match external-work record');
        }
        const fireOrdinal = storedPositiveOrdinal(source.fireOrdinal, 'terminalSource.fireOrdinal');
        if (fireOrdinal !== 1) {
            storeContractViolation('T-010 external-work deadline terminalSource must use fireOrdinal=1');
        }
        const expectedTurnId = durableControlTurnId([
            'deadline',
            ...targetMaterial(record.target),
            timerId,
            fireOrdinal,
        ]);
        if (storedTurnId !== expectedTurnId) {
            storeContractViolation('deadline terminalSource durableControlTurnId does not match its identity material');
        }
        return;
    }
    if (record.status === 'callback_received') {
        if (source.kind !== 'external_callback') {
            storeContractViolation('callback_received record must contain an external_callback terminalSource');
        }
        const callbackOrdinal = storedPositiveOrdinal(source.callbackOrdinal, 'terminalSource.callbackOrdinal');
        assertStoredJson(source.payload, 'terminalSource.payload');
        const expectedTurnId = durableControlTurnId([
            'external_callback',
            ...targetMaterial(record.target),
            record.externalCorrelationId,
            callbackOrdinal,
        ]);
        if (storedTurnId !== expectedTurnId) {
            storeContractViolation('callback terminalSource durableControlTurnId does not match its identity material');
        }
    }
}
function assertStoredExternalWorkRecord(value, expectedExternalCorrelationId) {
    const rawRecord = asStoredObject(value, 'external-work record');
    const externalCorrelationId = storedNonEmptyString(rawRecord.externalCorrelationId, 'external-work record.externalCorrelationId');
    if (expectedExternalCorrelationId !== undefined &&
        externalCorrelationId !== expectedExternalCorrelationId) {
        storeContractViolation('external-work record key does not match requested correlation');
    }
    const target = storedTarget(rawRecord.target, 'external-work record.target');
    storedNonEmptyString(rawRecord.deadlineTimerId, 'external-work record.deadlineTimerId');
    storedInstant(rawRecord.dueAt, 'external-work record.dueAt');
    storedInstant(rawRecord.createdAt, 'external-work record.createdAt');
    storedInstant(rawRecord.updatedAt, 'external-work record.updatedAt');
    if (!Number.isSafeInteger(rawRecord.revision) || rawRecord.revision < 0) {
        storeContractViolation('external-work record.revision must be a non-negative safe integer');
    }
    const status = rawRecord.status;
    if (status !== 'waiting' && status !== 'callback_received' && status !== 'timed_out') {
        storeContractViolation('external-work record has an unknown status');
    }
    const typedRecord = value;
    if (!sameTarget(target, typedRecord.target)) {
        storeContractViolation('external-work record target is malformed');
    }
    if (status === 'waiting') {
        if (rawRecord.terminalSource !== undefined) {
            storeContractViolation('waiting external-work record must not contain terminalSource');
        }
        return;
    }
    assertStoredTerminalSource(typedRecord, rawRecord);
}
/**
 * Portable T-010 coordinator.
 *
 * It owns deterministic source identity and fail-closed race semantics, but it
 * deliberately owns no wall-clock scheduler, process lifecycle or external job
 * platform. Host adapters provide durable storage and decide when to invoke the
 * deadline/recovery methods.
 */
export class DurableControlCoordinator {
    store;
    constructor(store) {
        this.store = store;
    }
    async provisionWorkflowInstance(request) {
        requireNonEmpty(request.provisioningKey, 'provisioningKey');
        targetMaterial(request.target);
        requireNonEmpty(request.correlationId, 'correlationId');
        requireNonEmpty(request.packageId, 'packageId');
        instantMillis(request.requestedAt, 'requestedAt');
        canonicalJsonStringify(request.input);
        const result = await this.store.ensureProvisionedWorkflowInstance(request);
        if (result.disposition !== 'created' && result.disposition !== 'existing') {
            throw new DurableControlError('STORE_CONTRACT_VIOLATION', 'provisioning store returned an unknown disposition');
        }
        assertProvisioningIdentity(request, result);
        return result;
    }
    async registerExternalWork(request) {
        requireNonEmpty(request.externalCorrelationId, 'externalCorrelationId');
        targetMaterial(request.target);
        requireNonEmpty(request.deadlineTimerId, 'deadlineTimerId');
        instantMillis(request.dueAt, 'dueAt');
        instantMillis(request.registeredAt, 'registeredAt');
        const result = await this.store.ensureExternalWorkCorrelation(request);
        if (result.disposition !== 'created' && result.disposition !== 'existing') {
            throw new DurableControlError('STORE_CONTRACT_VIOLATION', 'external-work store returned an unknown disposition');
        }
        assertStoredExternalWorkRecord(result.record, request.externalCorrelationId);
        assertExternalWorkIdentity(request, result.record);
        requireValidRevision(result.record);
        return result.record;
    }
    async acceptExternalCallback(request) {
        requireNonEmpty(request.externalCorrelationId, 'externalCorrelationId');
        targetMaterial(request.target);
        requirePositiveOrdinal(request.callbackOrdinal, 'callbackOrdinal');
        const receivedAtMillis = instantMillis(request.receivedAt, 'receivedAt');
        canonicalJsonStringify(request.payload);
        for (let attempt = 0; attempt < MAX_COMPARE_AND_SET_ATTEMPTS; attempt += 1) {
            const current = await this.requireExternalWork(request.externalCorrelationId);
            assertRequestTargetsRecord(request.target, current);
            requireValidRevision(current);
            if (current.status === 'timed_out') {
                return {
                    disposition: 'late_after_timeout',
                    controlSource: current.terminalSource,
                };
            }
            if (current.status === 'callback_received') {
                const source = current.terminalSource;
                if (source.callbackOrdinal === request.callbackOrdinal &&
                    canonicalJsonStringify(source.payload) === canonicalJsonStringify(request.payload)) {
                    return { disposition: 'duplicate', controlSource: source };
                }
                if (source.callbackOrdinal === request.callbackOrdinal) {
                    throw new DurableControlError('CALLBACK_IDENTITY_CONFLICT', `callback ordinal ${request.callbackOrdinal} for ${request.externalCorrelationId} changed payload`);
                }
                return { disposition: 'ignored_after_completion', controlSource: source };
            }
            const dueAtMillis = instantMillis(current.dueAt, 'stored dueAt');
            if (receivedAtMillis >= dueAtMillis) {
                const source = deadlineSource(current, 1, request.receivedAt);
                const timedOut = timedOutRecord(current, source, request.receivedAt);
                const changed = await this.store.compareAndSetExternalWorkCorrelation({
                    externalCorrelationId: current.externalCorrelationId,
                    expectedRevision: current.revision,
                    next: timedOut,
                });
                if (changed) {
                    return { disposition: 'late_after_timeout', controlSource: source };
                }
                continue;
            }
            const source = callbackSource(current, request.callbackOrdinal, request.payload, request.receivedAt);
            const completed = callbackCompletedRecord(current, source, request.receivedAt);
            const changed = await this.store.compareAndSetExternalWorkCorrelation({
                externalCorrelationId: current.externalCorrelationId,
                expectedRevision: current.revision,
                next: completed,
            });
            if (changed)
                return { disposition: 'accepted', controlSource: source };
        }
        throw new DurableControlError('STORE_CONTENTION', `could not resolve callback ${request.externalCorrelationId} after bounded retries`);
    }
    async fireDeadline(request) {
        requireNonEmpty(request.externalCorrelationId, 'externalCorrelationId');
        targetMaterial(request.target);
        requireNonEmpty(request.timerId, 'timerId');
        requirePositiveOrdinal(request.fireOrdinal, 'fireOrdinal');
        const firedAtMillis = instantMillis(request.firedAt, 'firedAt');
        if (request.fireOrdinal !== 1) {
            throw new DurableControlError('INVALID_ARGUMENT', 'T-010 external-work deadlines are one-shot and require fireOrdinal=1');
        }
        for (let attempt = 0; attempt < MAX_COMPARE_AND_SET_ATTEMPTS; attempt += 1) {
            const current = await this.requireExternalWork(request.externalCorrelationId);
            assertRequestTargetsRecord(request.target, current);
            requireValidRevision(current);
            if (current.deadlineTimerId !== request.timerId) {
                throw new DurableControlError('DEADLINE_TIMER_MISMATCH', `timer ${request.timerId} does not own external correlation ${request.externalCorrelationId}`);
            }
            if (current.status === 'timed_out') {
                return {
                    disposition: 'duplicate',
                    controlSource: current.terminalSource,
                };
            }
            if (current.status === 'callback_received') {
                return {
                    disposition: 'callback_already_completed',
                    controlSource: current.terminalSource,
                };
            }
            const dueAtMillis = instantMillis(current.dueAt, 'stored dueAt');
            if (firedAtMillis < dueAtMillis) {
                throw new DurableControlError('DEADLINE_NOT_DUE', `timer ${request.timerId} fired before its durable dueAt`);
            }
            const source = deadlineSource(current, request.fireOrdinal, request.firedAt);
            const timedOut = timedOutRecord(current, source, request.firedAt);
            const changed = await this.store.compareAndSetExternalWorkCorrelation({
                externalCorrelationId: current.externalCorrelationId,
                expectedRevision: current.revision,
                next: timedOut,
            });
            if (changed)
                return { disposition: 'accepted', controlSource: source };
        }
        throw new DurableControlError('STORE_CONTENTION', `could not resolve deadline ${request.externalCorrelationId} after bounded retries`);
    }
    /**
     * Restart helper for one known correlation. A stored terminal source is
     * returned again verbatim so a crash after durable settlement but before
     * downstream turn submission cannot lose the wake-up. Stable turn identity
     * lets the downstream Durable Control Turn layer deduplicate the replay.
     */
    async recoverExternalWork(externalCorrelationId, now) {
        requireNonEmpty(externalCorrelationId, 'externalCorrelationId');
        const nowMillis = instantMillis(now, 'now');
        const current = await this.requireExternalWork(externalCorrelationId);
        requireValidRevision(current);
        if (current.status !== 'waiting')
            return current.terminalSource;
        if (nowMillis < instantMillis(current.dueAt, 'stored dueAt'))
            return null;
        const result = await this.fireDeadline({
            externalCorrelationId,
            target: current.target,
            timerId: current.deadlineTimerId,
            fireOrdinal: 1,
            firedAt: now,
        });
        return result.controlSource;
    }
    /**
     * Caller-driven recovery scan, not a scheduler. Hosts may invoke it on start,
     * resume or their own durable timer wake-up. Both accepted and duplicate
     * timeout sources are returned to heal crash-after-settlement/before-submit.
     */
    async recoverDueDeadlines(now) {
        instantMillis(now, 'now');
        const rawCandidates = await this.store.listDueExternalWorkCorrelations(now);
        if (!Array.isArray(rawCandidates)) {
            storeContractViolation('due-deadline store query must return an array');
        }
        const candidates = rawCandidates
            .map((candidate) => {
            assertStoredExternalWorkRecord(candidate);
            return candidate;
        })
            .sort((left, right) => left.externalCorrelationId.localeCompare(right.externalCorrelationId));
        const sources = [];
        for (const candidate of candidates) {
            if (candidate.status === 'callback_received')
                continue;
            const source = await this.recoverExternalWork(candidate.externalCorrelationId, now);
            if (source?.kind === 'deadline')
                sources.push(source);
        }
        return sources;
    }
    async requireExternalWork(externalCorrelationId) {
        const record = await this.store.getExternalWorkCorrelation(externalCorrelationId);
        if (record === null) {
            throw new DurableControlError('UNKNOWN_EXTERNAL_CORRELATION', `external correlation ${externalCorrelationId} is not durably registered`);
        }
        assertStoredExternalWorkRecord(record, externalCorrelationId);
        return record;
    }
}
//# sourceMappingURL=durable-control-coordinator.js.map