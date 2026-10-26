const TARGET_KEYS = Object.freeze([
    'deployedAppId', 'tenantId', 'appId', 'businessPackageId', 'workflowId', 'instanceKey',
]);
/** Reject accessors, prototype-bearing class instances and cycles: never run caller code. */
function safeDataRecord(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return null;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
        return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptor of Object.values(descriptors)) {
        if (!Object.hasOwn(descriptor, 'value'))
            return null;
    }
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string'))
        return null;
    return value;
}
function dataField(value, key) {
    const record = safeDataRecord(value);
    if (record === null)
        return undefined;
    const field = Object.getOwnPropertyDescriptor(record, key);
    return field !== undefined && Object.hasOwn(field, 'value') ? field.value : undefined;
}
function copyJsonData(value, stack = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new TypeError('snapshot must be finite JSON data');
        return value;
    }
    if (typeof value !== 'object')
        throw new TypeError('snapshot must be JSON data');
    if (stack.has(value))
        throw new TypeError('cyclic snapshot');
    stack.add(value);
    try {
        if (Array.isArray(value)) {
            const array = [];
            for (let i = 0; i < value.length; i += 1) {
                const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
                if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
                    throw new TypeError('sparse/accessor snapshot array');
                }
                array.push(copyJsonData(descriptor.value, stack));
            }
            return Object.freeze(array);
        }
        const record = safeDataRecord(value);
        if (record === null)
            throw new TypeError('non-plain snapshot');
        const copy = Object.create(null);
        for (const key of Object.keys(record).sort()) {
            const field = Object.getOwnPropertyDescriptor(record, key);
            if (field === undefined || !Object.hasOwn(field, 'value'))
                throw new TypeError('snapshot accessor');
            Object.defineProperty(copy, key, {
                value: copyJsonData(field.value, stack),
                enumerable: true, configurable: false, writable: false,
            });
        }
        return Object.freeze(copy);
    }
    finally {
        stack.delete(value);
    }
}
function canonicalJson(value) {
    try {
        const copied = copyJsonData(value);
        return JSON.stringify(copied) ?? null;
    }
    catch {
        return null;
    }
}
/** A snapshot is publishable ONLY with independent equal-revision query evidence. */
export function verifiedSameRevisionSnapshot(evidence) {
    if (evidence === undefined)
        return undefined;
    if (!Number.isSafeInteger(evidence.candidateRevision) ||
        !Number.isSafeInteger(evidence.queryRevision) ||
        evidence.candidateRevision < 0 ||
        evidence.candidateRevision !== evidence.queryRevision)
        return undefined;
    const candidate = canonicalJson(evidence.candidate);
    const queried = canonicalJson(evidence.querySnapshot);
    if (candidate === null || queried === null || candidate !== queried)
        return undefined;
    try {
        return copyJsonData(evidence.querySnapshot);
    }
    catch {
        return undefined;
    }
}
/**
 * Project precisely {kind, occurrenceId, target, snapshot?}; no receipt metadata.
 * A null result means invalid raw receipt / trusted-target tuple; it is never
 * an authorization refusal oracle (T06b governs query/refusal parity).
 */
export function projectV10SubscriptionEvent(input) {
    try {
        const kind = dataField(input.receipt, 'status');
        const occurrenceId = dataField(dataField(input.receipt, 'occurrence'), 'messageId');
        if (typeof kind !== 'string' || kind.length === 0 ||
            typeof occurrenceId !== 'string' || occurrenceId.length === 0)
            return null;
        const targetRecord = safeDataRecord(input.target);
        if (targetRecord === null)
            return null;
        const target = Object.create(null);
        for (const key of TARGET_KEYS) {
            const value = dataField(targetRecord, key);
            if (typeof value !== 'string' || value.length === 0)
                return null;
            Object.defineProperty(target, key, { value, enumerable: true, writable: false, configurable: false });
        }
        const event = { kind, occurrenceId, target: Object.freeze(target) };
        const snapshot = verifiedSameRevisionSnapshot(input.snapshotEvidence);
        if (snapshot !== undefined)
            event.snapshot = snapshot;
        return Object.freeze(event);
    }
    catch {
        // Observation is non-authoritative and never affects a K send/receipt.
        return null;
    }
}
/** Pure post-await re-check predicate; the real async pump belongs to T06b. */
export function mayDeliverV10Observation(state) {
    return state.active === true &&
        state.authorized === true &&
        state.revoked === false &&
        state.stopped === false &&
        state.terminal === false;
}
