/**
 * #1062 HF18 — Host-side durable external-work coordinator (deadline +
 * callback correlation), adapted from the frozen v0.7 reference
 * `src/runtime/durable-control-coordinator.ts` (blob 8d341dca…) onto the
 * v0.8 true-CAS document store.
 * ===========================================================================
 *
 * Ownership split (frozen contract of #1062): the Kernel alone owns State,
 * Journal, Effect and turn identity; THIS coordinator owns only the
 * source-pinned CAS state machine that decides WHICH delivery may become a
 * Kernel turn. It owns no wall-clock scheduler and no process lifecycle —
 * the Host decides when to deliver/fire/recover (caller-driven recovery,
 * not a scheduler).
 *
 * State machine per external-work correlation (single document, single CAS
 * authority — no cross-document atomicity is claimed anywhere):
 *
 *   waiting ──CAS──► callback_received   (the winning callback delivery)
 *   waiting ──CAS──► timed_out           (the winning deadline fire)
 *
 * Only the CAS winner's turn source is handed to the Kernel submission
 * seam; duplicates/late/misbound deliveries are typed outcomes that never
 * reach the Kernel. A crash after settlement but before the Kernel turn
 * submission is healed by `recover*` returning the STORED terminal source
 * verbatim (stable turn identity ⇒ the Kernel turn disposition replays it
 * idempotently — zero doubled State/Effect).
 *
 * Record keys live in the Host namespace (never inside `v08-kernel:`):
 *   v8host:durable-control:ext:{appId}:{tenantId}:{instanceKey}:{externalCorrelationId}
 * Every key component is ':'-free by construction (appId at registerApp,
 * tenantId at credential shape check, instanceKey at requireInstanceKey,
 * correlation/timer ids validated HERE typed).
 */
import { canonicalJsonStringify } from '../contracts/identity.js';
export class DurableControlError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'DurableControlError';
        this.code = code;
    }
}
const MAX_CAS_ATTEMPTS = 8;
/**
 * Project a stored terminal source onto the EXACT Kernel turn-source shapes
 * (strictTurnSource refuses any extra field): timer ⇒ {kind, timerId,
 * fireOrdinal}, callback ⇒ {kind, externalCorrelationId, callbackOrdinal}.
 */
export function kernelTurnSourceOf(source) {
    if (source.kind === 'callback') {
        return { kind: 'callback', externalCorrelationId: source.externalCorrelationId, callbackOrdinal: source.callbackOrdinal ?? 1 };
    }
    return {
        kind: 'timer',
        ...(source.timerId === undefined ? {} : { timerId: source.timerId }),
        ...(source.fireOrdinal === undefined ? {} : { fireOrdinal: source.fireOrdinal }),
    };
}
function invalid(message) {
    throw new DurableControlError('DURABLE_CONTROL_INVALID', message);
}
function requireComponent(value, name) {
    if (typeof value !== 'string' || value.length === 0 || value.includes(':')) {
        invalid(`${name} must be a non-empty ':'-free string`);
    }
    return value;
}
/** Non-empty string without the ':'-free constraint (message ids carry the delimited correlation). */
function requireNonEmptyText(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        invalid(`${name} must be a non-empty string`);
    }
    return value;
}
function requireInstant(value, name) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
        invalid(`${name} must be a valid ISO timestamp`);
    }
    return value;
}
function instantMillis(value) {
    return Date.parse(value);
}
function requirePositiveOrdinal(value, name) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        invalid(`${name} must be a positive safe integer`);
    }
    return value;
}
export function externalWorkDocKey(appId, tenantId, instanceKey, externalCorrelationId) {
    return `v8host:durable-control:ext:${appId}:${tenantId}:${instanceKey}:${externalCorrelationId}`;
}
function asRecord(value, name) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new DurableControlError('DURABLE_CONTROL_INVALID', `${name} must be a JSON record`);
    }
    return value;
}
function decodeExternalWork(envelope, key) {
    const raw = asRecord(envelope, `external-work record ${key}`);
    if (raw.pinVersion !== 1 || raw.kind !== 'external-work') {
        throw new DurableControlError('DURABLE_CONTROL_INVALID', `record ${key} is not an external-work record`);
    }
    const record = raw;
    requireComponent(record.appId, 'appId');
    requireComponent(record.tenantId, 'tenantId');
    requireComponent(record.instanceKey, 'instanceKey');
    requireComponent(record.externalCorrelationId, 'externalCorrelationId');
    requireComponent(record.deadlineTimerId, 'deadlineTimerId');
    requireInstant(record.dueAt, 'dueAt');
    requireComponent(record.callbackIntentType, 'callbackIntentType');
    requireComponent(record.timeoutIntentType, 'timeoutIntentType');
    if (record.status !== 'waiting' && record.status !== 'callback_received' && record.status !== 'timed_out') {
        throw new DurableControlError('DURABLE_CONTROL_INVALID', `record ${key} carries an unknown status`);
    }
    requireInstant(record.createdAt, 'createdAt');
    requireInstant(record.updatedAt, 'updatedAt');
    if (record.status === 'waiting' && record.terminalSource !== undefined) {
        throw new DurableControlError('DURABLE_CONTROL_INVALID', `waiting record ${key} must not carry a terminalSource`);
    }
    return record;
}
function callbackTurnMessageId(record, callbackOrdinal) {
    return `ctrl:callback:${record.externalCorrelationId}:${String(callbackOrdinal)}`;
}
function timerTurnMessageId(record) {
    return `ctrl:timer:${record.deadlineTimerId}:1`;
}
/**
 * The Host-side coordinator over the probed physical CAS store. One
 * instance per host; all verbs are invoked behind gateway authentication.
 */
export class ExternalWorkCoordinator {
    docs;
    constructor(docs) {
        this.docs = docs;
    }
    async load(key) {
        const envelope = await this.docs.get(key);
        if (envelope === null) {
            throw new DurableControlError('UNKNOWN_EXTERNAL_CORRELATION', `external correlation ${key} is not durably registered on this host`);
        }
        return { record: decodeExternalWork(envelope.value, key), revision: envelope.revision };
    }
    async register(input) {
        requireComponent(input.externalCorrelationId, 'externalCorrelationId');
        requireComponent(input.deadlineTimerId, 'deadlineTimerId');
        requireInstant(input.dueAt, 'dueAt');
        requireInstant(input.registeredAt, 'registeredAt');
        requireComponent(input.callbackIntentType, 'callbackIntentType');
        requireComponent(input.timeoutIntentType, 'timeoutIntentType');
        const key = externalWorkDocKey(input.appId, input.tenantId, input.instanceKey, input.externalCorrelationId);
        const record = {
            pinVersion: 1,
            kind: 'external-work',
            appId: input.appId,
            tenantId: input.tenantId,
            instanceKey: input.instanceKey,
            externalCorrelationId: input.externalCorrelationId,
            deadlineTimerId: input.deadlineTimerId,
            dueAt: input.dueAt,
            callbackIntentType: input.callbackIntentType,
            timeoutIntentType: input.timeoutIntentType,
            status: 'waiting',
            createdAt: input.registeredAt,
            updatedAt: input.registeredAt,
        };
        try {
            await this.docs.put(key, record, { mustBeAbsent: true });
            return { record, disposition: 'created' };
        }
        catch {
            const existing = await this.load(key);
            const current = existing.record;
            const exact = current.deadlineTimerId === record.deadlineTimerId
                && current.dueAt === record.dueAt
                && current.callbackIntentType === record.callbackIntentType
                && current.timeoutIntentType === record.timeoutIntentType;
            if (!exact) {
                throw new DurableControlError('EXTERNAL_WORK_IDENTITY_CONFLICT', `external correlation ${input.externalCorrelationId} is already bound to different logical material`);
            }
            return { record: current, disposition: 'existing' };
        }
    }
    async read(appId, tenantId, instanceKey, externalCorrelationId) {
        requireComponent(externalCorrelationId, 'externalCorrelationId');
        const { record } = await this.load(externalWorkDocKey(appId, tenantId, instanceKey, externalCorrelationId));
        return record;
    }
    /**
     * Settle ONE incoming callback against the durable state machine. The
     * CAS winner receives the deterministic callback turn source; everyone
     * else gets a typed duplicate/late/ignored outcome with ZERO Kernel
     * activity.
     */
    async settleCallback(input) {
        requirePositiveOrdinal(input.callbackOrdinal, 'callbackOrdinal');
        requireInstant(input.receivedAt, 'receivedAt');
        const key = externalWorkDocKey(input.appId, input.tenantId, input.instanceKey, input.externalCorrelationId);
        for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
            const { record: current, revision } = await this.load(key);
            if (current.status === 'timed_out') {
                return { disposition: 'late_after_timeout', record: current };
            }
            if (current.status === 'callback_received') {
                const source = current.terminalSource;
                if (source?.kind === 'callback' && source.callbackOrdinal === input.callbackOrdinal) {
                    if (canonicalJsonStringify(source.payload ?? null) === canonicalJsonStringify(input.payload)) {
                        return { disposition: 'duplicate', record: current };
                    }
                    throw new DurableControlError('CALLBACK_IDENTITY_CONFLICT', `callback ordinal ${String(input.callbackOrdinal)} for ${input.externalCorrelationId} changed payload`);
                }
                return { disposition: 'ignored_after_completion', record: current };
            }
            const source = instantMillis(input.receivedAt) >= instantMillis(current.dueAt)
                ? { kind: 'timer', externalCorrelationId: current.externalCorrelationId, timerId: current.deadlineTimerId, fireOrdinal: 1 }
                : { kind: 'callback', externalCorrelationId: current.externalCorrelationId, callbackOrdinal: input.callbackOrdinal, payload: input.payload };
            const next = {
                ...current,
                status: source.kind === 'timer' ? 'timed_out' : 'callback_received',
                updatedAt: input.receivedAt,
                terminalSource: source,
            };
            const changed = await this.cas(key, next, revision);
            if (changed) {
                return {
                    disposition: 'accepted',
                    record: next,
                    turnSource: source,
                    messageId: source.kind === 'callback'
                        ? callbackTurnMessageId(current, input.callbackOrdinal)
                        : timerTurnMessageId(current),
                };
            }
        }
        throw new DurableControlError('DURABLE_CONTROL_CONTENTION', `could not settle callback ${input.externalCorrelationId} after bounded retries`);
    }
    /**
     * Settle ONE deadline fire. Early fires and foreign timers refuse typed
     * before any mutation; the CAS winner receives the one-shot timer turn
     * source (fireOrdinal is pinned to 1, the v0.7 T-010 one-shot contract).
     */
    async settleDeadline(input) {
        requireComponent(input.timerId, 'timerId');
        requirePositiveOrdinal(input.fireOrdinal, 'fireOrdinal');
        requireInstant(input.firedAt, 'firedAt');
        if (input.fireOrdinal !== 1) {
            invalid('external-work deadlines are one-shot and require fireOrdinal=1');
        }
        const key = externalWorkDocKey(input.appId, input.tenantId, input.instanceKey, input.externalCorrelationId);
        for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
            const { record: current, revision } = await this.load(key);
            if (current.deadlineTimerId !== input.timerId) {
                throw new DurableControlError('DEADLINE_TIMER_MISMATCH', `timer ${input.timerId} does not own external correlation ${input.externalCorrelationId}`);
            }
            if (current.status === 'timed_out') {
                return { disposition: 'duplicate', record: current };
            }
            if (current.status === 'callback_received') {
                return { disposition: 'callback_already_completed', record: current };
            }
            if (instantMillis(input.firedAt) < instantMillis(current.dueAt)) {
                throw new DurableControlError('DEADLINE_NOT_DUE', `timer ${input.timerId} fired before its durable dueAt ${current.dueAt}`);
            }
            const source = { kind: 'timer', externalCorrelationId: current.externalCorrelationId, timerId: current.deadlineTimerId, fireOrdinal: 1 };
            const next = {
                ...current,
                status: 'timed_out',
                updatedAt: input.firedAt,
                terminalSource: source,
            };
            const changed = await this.cas(key, next, revision);
            if (changed) {
                return { disposition: 'accepted', record: next, turnSource: source, messageId: timerTurnMessageId(current) };
            }
        }
        throw new DurableControlError('DURABLE_CONTROL_CONTENTION', `could not settle deadline ${input.externalCorrelationId} after bounded retries`);
    }
    /**
     * Mark the settled turn as submitted (the heal marker written AFTER a
     * successful Kernel submission). A crash between settlement and this
     * marker is the honest UNKNOWN window healed by `recoverExternalWork`.
     */
    async markSubmitted(appId, tenantId, instanceKey, externalCorrelationId, messageId, submittedAt) {
        const key = externalWorkDocKey(appId, tenantId, instanceKey, externalCorrelationId);
        for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
            const { record: current, revision } = await this.load(key);
            if (current.submittedTurn !== undefined && current.submittedTurn.messageId === messageId)
                return;
            const next = {
                ...current,
                submittedTurn: { messageId, submittedAt },
                updatedAt: submittedAt,
            };
            if (await this.cas(key, next, revision))
                return;
        }
        // The marker is a heal optimization, never an authority — losing the
        // bounded race only means a later recovery re-reads the settled record
        // and replays the SAME turn id idempotently at the Kernel.
    }
    /**
     * Caller-driven recovery (NOT a scheduler): list every correlation of
     * the tenant/app, fire the due waiting ones, and re-submit every settled
     * record whose turn submission may have been lost (no submittedTurn
     * marker). The stable turn identity makes every re-submission an
     * idempotent Kernel replay — the v0.7 heal contract verbatim.
     */
    async recoverDueAndSettled(input) {
        requireInstant(input.now, 'now');
        const prefix = `v8host:durable-control:ext:${input.appId}:${input.tenantId}:`;
        const keys = [...await this.docs.list(prefix)].sort();
        let fired = 0;
        let healed = 0;
        for (const key of keys) {
            const { record } = await this.load(key);
            if (record.status === 'waiting') {
                if (instantMillis(input.now) < instantMillis(record.dueAt))
                    continue;
                const settle = await this.settleDeadline({
                    appId: input.appId,
                    tenantId: input.tenantId,
                    instanceKey: record.instanceKey,
                    externalCorrelationId: record.externalCorrelationId,
                    timerId: record.deadlineTimerId,
                    fireOrdinal: 1,
                    firedAt: input.now,
                });
                if (settle.disposition === 'accepted') {
                    fired += 1;
                    await input.fireDue({ record: settle.record, turnSource: settle.turnSource, messageId: settle.messageId });
                    await this.markSubmitted(input.appId, input.tenantId, record.instanceKey, record.externalCorrelationId, settle.messageId, input.now);
                }
                continue;
            }
            if (record.submittedTurn === undefined && record.terminalSource !== undefined) {
                const source = record.terminalSource;
                healed += 1;
                await input.fireDue({
                    record,
                    turnSource: source,
                    messageId: source.kind === 'callback'
                        ? callbackTurnMessageId(record, source.callbackOrdinal ?? 1)
                        : timerTurnMessageId(record),
                });
                await this.markSubmitted(input.appId, input.tenantId, record.instanceKey, record.externalCorrelationId, source.kind === 'callback'
                    ? callbackTurnMessageId(record, source.callbackOrdinal ?? 1)
                    : timerTurnMessageId(record), input.now);
            }
        }
        return { fired, healed };
    }
    async cas(key, next, expectedRevision) {
        try {
            await this.docs.put(key, next, { mustMatchRevision: expectedRevision });
            return true;
        }
        catch (error) {
            if (typeof error === 'object' && error !== null && error.code === 'HOST_CAS_CONFLICT') {
                return false; // lost the race: re-read and retry inside the bounded loop
            }
            throw error;
        }
    }
}
export function childInvocationDocKey(appId, tenantId, parentInstanceKey, childInstanceKey, invocationOrdinal) {
    return `v8host:durable-control:child:${appId}:${tenantId}:${parentInstanceKey}:${childInstanceKey}:${String(invocationOrdinal)}`;
}
export function childInvocationCorrelationId(parentInstanceKey, childInstanceKey, invocationOrdinal) {
    return `child:${parentInstanceKey}:${childInstanceKey}:${String(invocationOrdinal)}`;
}
function decodeChildInvocation(envelope, key) {
    const raw = asRecord(envelope, `child-invocation record ${key}`);
    if (raw.pinVersion !== 1 || raw.kind !== 'child-invocation') {
        throw new DurableControlError('DURABLE_CONTROL_INVALID', `record ${key} is not a child-invocation record`);
    }
    const record = raw;
    requireComponent(record.appId, 'appId');
    requireComponent(record.tenantId, 'tenantId');
    requireComponent(record.parentInstanceKey, 'parentInstanceKey');
    requireComponent(record.childInstanceKey, 'childInstanceKey');
    requirePositiveOrdinal(record.invocationOrdinal, 'invocationOrdinal');
    requireComponent(record.childIntentType, 'childIntentType');
    requireComponent(record.doneIntentType, 'doneIntentType');
    requireComponent(record.errorIntentType, 'errorIntentType');
    if (!['pending', 'accepted', 'rejected', 'done', 'error'].includes(record.status)) {
        throw new DurableControlError('DURABLE_CONTROL_INVALID', `record ${key} carries an unknown status`);
    }
    requireNonEmptyText(record.childTurnMessageId, 'childTurnMessageId');
    requireInstant(record.createdAt, 'createdAt');
    requireInstant(record.updatedAt, 'updatedAt');
    if (record.status === 'pending' && (record.rejection !== undefined || record.terminal !== undefined)) {
        throw new DurableControlError('DURABLE_CONTROL_INVALID', `pending record ${key} must not carry a rejection or terminal`);
    }
    return record;
}
function rejectedRefusal(ordinal, record) {
    throw new DurableControlError('CHILD_INVOCATION_REJECTED', `child invocation ${String(ordinal)} was PERMANENTLY rejected (${record.rejection?.code ?? 'unknown'}); a rejected invocation is never retried`);
}
export class ChildInvocationCoordinator {
    docs;
    constructor(docs) {
        this.docs = docs;
    }
    async load(key) {
        const envelope = await this.docs.get(key);
        if (envelope === null) {
            throw new DurableControlError('CHILD_INVOCATION_UNKNOWN', `child invocation ${key} is not durably registered on this host`);
        }
        return { record: decodeChildInvocation(envelope.value, key), revision: envelope.revision };
    }
    async peek(appId, tenantId, parentInstanceKey, childInstanceKey, invocationOrdinal) {
        const key = childInvocationDocKey(appId, tenantId, parentInstanceKey, childInstanceKey, invocationOrdinal);
        const envelope = await this.docs.get(key);
        if (envelope === null)
            return null;
        return decodeChildInvocation(envelope.value, key);
    }
    /**
     * Allocate (or re-address) ONE invocation record. Without an explicit
     * ordinal the next free ordinal of the (parent, child) pair is claimed
     * under create-if-absent CAS; an explicit ordinal re-addresses a known
     * invocation (bounded UNKNOWN-window retry while pending, typed refusal
     * once settled — a rejected invocation is NEVER retried).
     */
    async open(input) {
        requireComponent(input.parentInstanceKey, 'parentInstanceKey');
        requireComponent(input.childInstanceKey, 'childInstanceKey');
        requireComponent(input.childIntentType, 'childIntentType');
        requireComponent(input.doneIntentType, 'doneIntentType');
        requireComponent(input.errorIntentType, 'errorIntentType');
        requireInstant(input.openedAt, 'openedAt');
        if (input.invocationOrdinal !== undefined) {
            requirePositiveOrdinal(input.invocationOrdinal, 'invocationOrdinal');
            const current = await this.peek(input.appId, input.tenantId, input.parentInstanceKey, input.childInstanceKey, input.invocationOrdinal);
            if (current !== null)
                return this.adjudicateExisting(current);
        }
        else {
            const prefix = `v8host:durable-control:child:${input.appId}:${input.tenantId}:${input.parentInstanceKey}:${input.childInstanceKey}:`;
            const existing = await this.docs.list(prefix);
            let ordinal = existing.length + 1;
            for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
                const record = this.pendingRecord(input, ordinal);
                try {
                    await this.docs.put(childInvocationDocKey(input.appId, input.tenantId, input.parentInstanceKey, input.childInstanceKey, ordinal), record, { mustBeAbsent: true });
                    return { record, disposition: 'created' };
                }
                catch (error) {
                    if (error?.code !== 'HOST_KEY_EXISTS')
                        throw error;
                    ordinal += 1;
                }
            }
            throw new DurableControlError('DURABLE_CONTROL_CONTENTION', 'could not allocate a child invocation ordinal after bounded retries');
        }
        // Explicit ordinal, record absent: create it at exactly that ordinal.
        const record = this.pendingRecord(input, input.invocationOrdinal);
        try {
            await this.docs.put(childInvocationDocKey(input.appId, input.tenantId, input.parentInstanceKey, input.childInstanceKey, input.invocationOrdinal), record, { mustBeAbsent: true });
            return { record, disposition: 'created' };
        }
        catch {
            const current = await this.peek(input.appId, input.tenantId, input.parentInstanceKey, input.childInstanceKey, input.invocationOrdinal);
            if (current === null)
                throw new DurableControlError('CHILD_INVOCATION_UNKNOWN', 'child invocation disappeared while being addressed');
            return this.adjudicateExisting(current);
        }
    }
    adjudicateExisting(current) {
        if (current.status === 'rejected')
            rejectedRefusal(current.invocationOrdinal, current);
        if (current.status !== 'pending') {
            throw new DurableControlError('CHILD_INVOCATION_SETTLED', `child invocation ${String(current.invocationOrdinal)} is already settled (${current.status}); a settled invocation is never re-sent`);
        }
        return { record: current, disposition: 'pending-retry' };
    }
    pendingRecord(input, ordinal) {
        const correlationId = childInvocationCorrelationId(input.parentInstanceKey, input.childInstanceKey, ordinal);
        return {
            pinVersion: 1,
            kind: 'child-invocation',
            appId: input.appId,
            tenantId: input.tenantId,
            parentInstanceKey: input.parentInstanceKey,
            childInstanceKey: input.childInstanceKey,
            invocationOrdinal: ordinal,
            childIntentType: input.childIntentType,
            doneIntentType: input.doneIntentType,
            errorIntentType: input.errorIntentType,
            status: 'pending',
            childTurnMessageId: `child-msg:${correlationId}`,
            createdAt: input.openedAt,
            updatedAt: input.openedAt,
        };
    }
    /**
     * Settle the child-send outcome: `accepted` (the child message turn was
     * admitted) or `rejected` (a PERMANENT typed refusal, durably committed
     * BEFORE any route selection — the caller routes on the returned truth).
     */
    async settleSend(input) {
        requireInstant(input.settledAt, 'settledAt');
        const key = childInvocationDocKey(input.appId, input.tenantId, input.record.parentInstanceKey, input.record.childInstanceKey, input.record.invocationOrdinal);
        for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
            const { record: current, revision } = await this.load(key);
            if (current.status !== 'pending') {
                if (current.status === input.outcome)
                    return current; // idempotent same-outcome replay
                throw new DurableControlError('CHILD_INVOCATION_SETTLED', `child invocation ${String(current.invocationOrdinal)} is already settled (${current.status})`);
            }
            const next = {
                ...current,
                status: input.outcome,
                ...(input.outcome === 'rejected' && input.rejection !== undefined ? { rejection: input.rejection } : {}),
                updatedAt: input.settledAt,
            };
            try {
                await this.docs.put(key, next, { mustMatchRevision: revision });
                return next;
            }
            catch (error) {
                if (error?.code !== 'HOST_CAS_CONFLICT')
                    throw error;
            }
        }
        throw new DurableControlError('DURABLE_CONTROL_CONTENTION', `could not settle child invocation ${key} after bounded retries`);
    }
    /**
     * Settle ONE correlated child terminal (done | error). Exactly ONE CAS
     * winner receives the deterministic parent child-terminal turn source;
     * duplicates and terminals on non-accepted invocations refuse typed with
     * ZERO Kernel activity.
     */
    async settleTerminal(input) {
        if (input.terminalKind !== 'done' && input.terminalKind !== 'error') {
            invalid('terminalKind must be done or error');
        }
        requireInstant(input.settledAt, 'settledAt');
        const key = childInvocationDocKey(input.appId, input.tenantId, input.parentInstanceKey, input.childInstanceKey, input.invocationOrdinal);
        for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
            const { record: current, revision } = await this.load(key);
            if (current.status === 'done' || current.status === 'error') {
                return { disposition: 'already-terminal', record: current };
            }
            if (current.status !== 'accepted') {
                throw new DurableControlError('CHILD_INVOCATION_NOT_ACCEPTED', `child invocation ${String(current.invocationOrdinal)} is ${current.status}; only an accepted child invocation may receive a terminal`);
            }
            const terminal = { terminalKind: input.terminalKind, ...(input.terminalInput === undefined ? {} : { input: input.terminalInput }), settledAt: input.settledAt };
            const next = {
                ...current,
                status: input.terminalKind,
                terminal,
                updatedAt: input.settledAt,
            };
            try {
                await this.docs.put(key, next, { mustMatchRevision: revision });
            }
            catch (error) {
                if (error?.code !== 'HOST_CAS_CONFLICT')
                    throw error;
                continue;
            }
            const correlationId = childInvocationCorrelationId(current.parentInstanceKey, current.childInstanceKey, current.invocationOrdinal);
            return {
                disposition: 'accepted',
                record: next,
                plan: {
                    record: next,
                    childTurnSource: { kind: 'callback', externalCorrelationId: correlationId, callbackOrdinal: 1 },
                    childTurnMessageId: current.childTurnMessageId,
                    parentTurnSource: {
                        kind: 'child-terminal',
                        parentActorId: current.parentInstanceKey,
                        childActorId: current.childInstanceKey,
                        invocationOrdinal: current.invocationOrdinal,
                        terminalKind: input.terminalKind,
                    },
                    parentTurnMessageId: `ctrl:child-terminal:${correlationId}:${input.terminalKind}`,
                },
            };
        }
        throw new DurableControlError('DURABLE_CONTROL_CONTENTION', `could not settle child invocation ${key} after bounded retries`);
    }
    /** The heal marker (see ExternalWorkCoordinator.markSubmitted). */
    async markSubmitted(record, messageId, submittedAt) {
        const key = childInvocationDocKey(record.appId, record.tenantId, record.parentInstanceKey, record.childInstanceKey, record.invocationOrdinal);
        for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
            const { record: current, revision } = await this.load(key);
            if (current.submittedTurn !== undefined && current.submittedTurn.messageId === messageId)
                return;
            const next = { ...current, submittedTurn: { messageId, submittedAt }, updatedAt: submittedAt };
            try {
                await this.docs.put(key, next, { mustMatchRevision: revision });
                return;
            }
            catch (error) {
                if (error?.code !== 'HOST_CAS_CONFLICT')
                    throw error;
            }
        }
        // The marker is a heal optimization, never an authority — losing the
        // bounded race only means a later recovery replays the SAME turn id
        // idempotently at the Kernel.
    }
}
export function poisonRecoveryDocKey(appId, tenantId, instanceKey, poisonMessageId) {
    return `v8host:poison-recovery:${appId}:${tenantId}:${instanceKey}:${poisonMessageId}`;
}
/** The durable recovery action identity embedded in the Kernel turn source. */
export function poisonRecoveryActionId(poisonMessageId) {
    return `pr:${poisonMessageId}`;
}
export function poisonRecoveryTurnMessageId(poisonMessageId) {
    return `ctrl:recovery:${poisonMessageId}:1`;
}
function decodePoisonRecovery(envelope, key) {
    const raw = asRecord(envelope, `poison-recovery record ${key}`);
    if (raw.pinVersion !== 1 || raw.kind !== 'poison-recovery') {
        throw new DurableControlError('POISON_RECOVERY_INVALID', `record ${key} is not a poison-recovery record`);
    }
    const record = raw;
    requireComponent(record.appId, 'appId');
    requireComponent(record.tenantId, 'tenantId');
    requireComponent(record.instanceKey, 'instanceKey');
    requireComponent(record.poisonMessageId, 'poisonMessageId');
    requireComponent(record.recoveryIntentType, 'recoveryIntentType');
    requireNonEmptyText(record.reason, 'reason');
    if (typeof record.authorizedBy !== 'object' || record.authorizedBy === null || typeof record.authorizedBy.subject !== 'string') {
        throw new DurableControlError('POISON_RECOVERY_INVALID', `record ${key} carries no authorizing principal`);
    }
    requireInstant(record.authorizedAt, 'authorizedAt');
    if (record.status !== 'authorized' && record.status !== 'delivered') {
        throw new DurableControlError('POISON_RECOVERY_INVALID', `record ${key} carries an unknown status`);
    }
    requireInstant(record.createdAt, 'createdAt');
    requireInstant(record.updatedAt, 'updatedAt');
    if (record.status === 'authorized' && record.deliveredSource !== undefined) {
        throw new DurableControlError('POISON_RECOVERY_INVALID', `authorized record ${key} must not carry a deliveredSource`);
    }
    if (record.status === 'delivered' && (record.deliveredSource === undefined || record.deliveredSource.resumeOrdinal !== 1)) {
        throw new DurableControlError('POISON_RECOVERY_INVALID', `delivered record ${key} must carry its one-shot terminal source`);
    }
    return record;
}
export class PoisonRecoveryCoordinator {
    docs;
    constructor(docs) {
        this.docs = docs;
    }
    async load(key) {
        const envelope = await this.docs.get(key);
        if (envelope === null) {
            throw new DurableControlError('POISON_RECOVERY_UNKNOWN', `no durable poison-recovery action exists for ${key}; an unauthorized recovery never reaches the Kernel`);
        }
        return { record: decodePoisonRecovery(envelope.value, key), revision: envelope.revision };
    }
    /**
     * Durably authorize ONE corrective recovery action for an exact poisoned
     * message. Single creation (mustBeAbsent); the same material re-authorizes
     * idempotently ('existing'), different material for the same poison is a
     * typed identity conflict.
     */
    async authorize(input) {
        requireComponent(input.poisonMessageId, 'poisonMessageId');
        requireComponent(input.recoveryIntentType, 'recoveryIntentType');
        requireNonEmptyText(input.reason, 'reason');
        requireInstant(input.authorizedAt, 'authorizedAt');
        const key = poisonRecoveryDocKey(input.appId, input.tenantId, input.instanceKey, input.poisonMessageId);
        const record = {
            pinVersion: 1,
            kind: 'poison-recovery',
            appId: input.appId,
            tenantId: input.tenantId,
            instanceKey: input.instanceKey,
            poisonMessageId: input.poisonMessageId,
            recoveryIntentType: input.recoveryIntentType,
            recoveryInput: input.recoveryInput,
            reason: input.reason,
            authorizedBy: input.authorizedBy,
            authorizedAt: input.authorizedAt,
            status: 'authorized',
            createdAt: input.authorizedAt,
            updatedAt: input.authorizedAt,
        };
        try {
            await this.docs.put(key, record, { mustBeAbsent: true });
            return { record, disposition: 'created' };
        }
        catch {
            const { record: current } = await this.load(key);
            const exact = current.recoveryIntentType === record.recoveryIntentType
                && canonicalJsonStringify(current.recoveryInput ?? null) === canonicalJsonStringify(record.recoveryInput ?? null);
            if (!exact) {
                throw new DurableControlError('POISON_RECOVERY_IDENTITY_CONFLICT', `poisoned message ${input.poisonMessageId} is already bound to different corrective material; one poison admits exactly one authorized recovery action`);
            }
            return { record: current, disposition: 'existing' };
        }
    }
    /**
     * Read ONE durable recovery action (the persisted authorization truth;
     * survives restarts). Authenticated Host-context read for the delivery
     * verb's pre-CAS Business-intent authority check.
     */
    async read(appId, tenantId, instanceKey, poisonMessageId) {
        requireComponent(poisonMessageId, 'poisonMessageId');
        const { record } = await this.load(poisonRecoveryDocKey(appId, tenantId, instanceKey, poisonMessageId));
        return record;
    }
    /**
     * Deliver the authorized corrective turn exactly once. The CAS winner
     * (authorized→delivered) hands its deterministic recovery turn source to
     * the Kernel submission seam; every later redelivery — duplicate or after
     * restart — returns the STORED terminal source so the Kernel turn
     * disposition replays it idempotently (zero doubled State/Effect).
     */
    async deliver(input) {
        requireComponent(input.poisonMessageId, 'poisonMessageId');
        requireInstant(input.deliveredAt, 'deliveredAt');
        const key = poisonRecoveryDocKey(input.appId, input.tenantId, input.instanceKey, input.poisonMessageId);
        const source = {
            kind: 'recovery',
            durableRecoveryActionId: poisonRecoveryActionId(input.poisonMessageId),
            resumeOrdinal: 1,
        };
        const messageId = poisonRecoveryTurnMessageId(input.poisonMessageId);
        for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
            const { record: current, revision } = await this.load(key);
            if (current.status === 'delivered') {
                return { disposition: 'duplicate', record: current, turnSource: current.deliveredSource ?? source, messageId };
            }
            const next = {
                ...current,
                status: 'delivered',
                updatedAt: input.deliveredAt,
                deliveredSource: source,
            };
            if (await this.cas(key, next, revision)) {
                return { disposition: 'accepted', record: next, turnSource: source, messageId };
            }
        }
        throw new DurableControlError('DURABLE_CONTROL_CONTENTION', `could not deliver poison recovery ${key} after bounded retries`);
    }
    /** The heal marker (see ExternalWorkCoordinator.markSubmitted). */
    async markSubmitted(appId, tenantId, instanceKey, poisonMessageId, messageId, submittedAt) {
        const key = poisonRecoveryDocKey(appId, tenantId, instanceKey, poisonMessageId);
        for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
            const { record: current, revision } = await this.load(key);
            if (current.submittedTurn !== undefined && current.submittedTurn.messageId === messageId)
                return;
            const next = { ...current, submittedTurn: { messageId, submittedAt }, updatedAt: submittedAt };
            if (await this.cas(key, next, revision))
                return;
        }
        // The marker is a heal optimization, never an authority — losing the
        // bounded race only means a later redelivery replays the SAME turn id
        // idempotently at the Kernel.
    }
    async cas(key, next, expectedRevision) {
        try {
            await this.docs.put(key, next, { mustMatchRevision: expectedRevision });
            return true;
        }
        catch (error) {
            if (typeof error === 'object' && error !== null && error.code === 'HOST_CAS_CONFLICT') {
                return false;
            }
            throw error;
        }
    }
}
//# sourceMappingURL=durable-controls.js.map