/** v0.10.2 T03a — Host CAS foundation; source moved from H host-v8/cas.ts. No SQLite runtime dependency or Kernel authority. Real SQLite adapter belongs to T03b. */
/**
 * v0.8 trusted Node Host — physical compare-and-swap document store (T-E, #1004).
 * ================================================================================
 *
 * The Host supplies ONLY a generic durable document store with true revision
 * compare-and-swap semantics. It contains NO workflow/admission/journal/effect
 * knowledge and NO business policy (L2 boundary; adapted from #994@b9ea4d1
 * src/host/memory-host.mjs `MemoryDocStore` + `resources` port surface).
 *
 * THE central C01 repair over the #994 hosts: a write WITHOUT a physical
 * revision expectation does not exist. `put(key, value)` — or
 * `put(key, value, { mustMatchRevision: undefined })` where a lost `get()`
 * revision silently degraded into an unconditional overwrite in the #994
 * hosts — is a typed refusal here (`HOST_PUT_CONDITION_REQUIRED`), never an
 * unconditional write (L2 C01-N10). Every write is either:
 *   - create-if-absent  (`mustBeAbsent: true`  → revision 0), or
 *   - revision CAS      (`mustMatchRevision: <safe integer>` → revision + 1).
 *
 * `get` returns `{value, revision}` (C01 contract) or `null` for absent keys;
 * values are deep-cloned JSON on every crossing so a returned snapshot can
 * never alias the authoritative bytes (B01-N7).
 */
import { randomUUID } from 'node:crypto';
export class HostBoundaryError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'HostBoundaryError';
        this.code = code;
    }
}
/**
 * Shared condition gate for every physical store: validates the exactly-one
 * rule and returns the physical write plan. Exported for the bootstrap-time
 * storage probe so both the SQLite and in-memory stores cannot drift.
 */
export function validateWriteCondition(key, conditions) {
    if (typeof key !== 'string' || key.length === 0) {
        throw new HostBoundaryError('HOST_KEY_MALFORMED', 'document keys must be non-empty strings');
    }
    if (typeof conditions !== 'object' || conditions === null) {
        throw new HostBoundaryError('HOST_PUT_CONDITION_REQUIRED', `write of ${key} requires a physical revision expectation (mustBeAbsent or mustMatchRevision); unconditional writes do not exist on this store`);
    }
    const hasAbsent = conditions.mustBeAbsent === true;
    const hasRevision = conditions.mustMatchRevision !== undefined;
    if (hasAbsent && hasRevision) {
        throw new HostBoundaryError('HOST_PUT_CONDITION_AMBIGUOUS', `write of ${key} carries both mustBeAbsent and mustMatchRevision; the physical write plan must be exactly one of create/CAS`);
    }
    if (!hasAbsent && !hasRevision) {
        throw new HostBoundaryError('HOST_PUT_CONDITION_REQUIRED', `write of ${key} carries no physical revision expectation (a lost get() revision must never degrade into an unconditional write)`);
    }
    if (hasRevision) {
        const revision = conditions.mustMatchRevision;
        if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
            throw new HostBoundaryError('HOST_CAS_REVISION_MALFORMED', `write of ${key} declares mustMatchRevision ${String(revision)}; CAS expectations must be non-negative safe integers`);
        }
        return { kind: 'cas', revision };
    }
    return { kind: 'create' };
}
function cloneJson(value) {
    if (value === undefined)
        return undefined;
    return JSON.parse(JSON.stringify(value));
}
/**
 * In-memory reference implementation of the physical CAS contract. Same
 * condition gate as the SQLite store; for non-durable fixtures only (the
 * durable physical store is the SQLite store — L2 file+SQLite decision).
 */
export class InMemoryCasStore {
    #docs = new Map();
    #fault = null;
    #getFault = null;
    /** Physical fault injection (KPK-06 vector port): typed Host-side I/O failure. */
    failNextPutMatching(keySubstring, { skip = 0 } = {}) {
        this.#fault = { keySubstring, remainingSkips: skip };
    }
    /**
     * Physical READ fault injection (#1055 R1 P1-02 vector): the next matching
     * `get` fails typed, so a read-side Host failure (connection closed, I/O
     * error) is provable on the physical path — symmetric with the write fault.
     */
    failNextGetMatching(keySubstring, { skip = 0 } = {}) {
        this.#getFault = { keySubstring, remainingSkips: skip };
    }
    async get(key) {
        this.#maybeFaultRead(key);
        const doc = this.#docs.get(key);
        if (doc === undefined)
            return null;
        return { value: cloneJson(doc.value), revision: doc.revision };
    }
    async put(key, value, conditions) {
        const plan = validateWriteCondition(key, conditions);
        this.#maybeFault(key);
        let canonical;
        try {
            canonical = cloneJson(value);
        }
        catch {
            throw new HostBoundaryError('HOST_VALUE_NOT_JSON', `value for ${key} is not JSON-representable; the physical store persists canonical JSON only`);
        }
        const existing = this.#docs.get(key);
        if (plan.kind === 'create') {
            if (existing !== undefined) {
                throw new HostBoundaryError('HOST_KEY_EXISTS', `host doc ${key} already exists (revision ${String(existing.revision)})`);
            }
            this.#docs.set(key, { value: canonical, revision: 0 });
            return { revision: 0 };
        }
        if (existing === undefined) {
            throw new HostBoundaryError('HOST_CAS_CONFLICT', `host doc ${key} does not exist; CAS expected revision ${String(plan.revision)}`);
        }
        if (existing.revision !== plan.revision) {
            throw new HostBoundaryError('HOST_CAS_CONFLICT', `host doc ${key} revision is ${String(existing.revision)}; CAS expected ${String(plan.revision)} — the stale snapshot never becomes authority`);
        }
        this.#docs.set(key, { value: canonical, revision: plan.revision + 1 });
        return { revision: plan.revision + 1 };
    }
    async remove(key, conditions) {
        if (typeof conditions !== 'object' || conditions === null || conditions.mustMatchRevision === undefined || conditions.mustBeAbsent === true) {
            throw new HostBoundaryError('HOST_PUT_CONDITION_REQUIRED', `remove of ${key} requires mustMatchRevision; unconditional deletes do not exist on this store`);
        }
        const plan = validateWriteCondition(key, conditions);
        this.#maybeFault(key);
        if (plan.kind !== 'cas') {
            throw new HostBoundaryError('HOST_PUT_CONDITION_REQUIRED', `remove of ${key} requires a revision CAS expectation`);
        }
        const existing = this.#docs.get(key);
        if (existing === undefined) {
            throw new HostBoundaryError('HOST_CAS_CONFLICT', `host doc ${key} does not exist; remove expected revision ${String(plan.revision)}`);
        }
        if (existing.revision !== plan.revision) {
            throw new HostBoundaryError('HOST_CAS_CONFLICT', `host doc ${key} revision is ${String(existing.revision)}; remove expected ${String(plan.revision)}`);
        }
        this.#docs.delete(key);
    }
    async list(prefix) {
        return [...this.#docs.keys()].filter((key) => key.startsWith(prefix)).sort();
    }
    async close() {
        this.#docs.clear();
    }
    #maybeFault(key) {
        if (this.#fault === null)
            return;
        if (!key.includes(this.#fault.keySubstring))
            return;
        if (this.#fault.remainingSkips > 0) {
            this.#fault.remainingSkips -= 1;
            return;
        }
        this.#fault = null;
        throw new HostBoundaryError('HOST_FAULT_INJECTED', `host storage physically faulted during write of ${key}`);
    }
    #maybeFaultRead(key) {
        if (this.#getFault === null)
            return;
        if (!key.includes(this.#getFault.keySubstring))
            return;
        if (this.#getFault.remainingSkips > 0) {
            this.#getFault.remainingSkips -= 1;
            return;
        }
        this.#getFault = null;
        throw new HostBoundaryError('HOST_FAULT_INJECTED', `host storage physically faulted during read of ${key}`);
    }
}
/**
 * Bootstrap-time physical CAS probe (C01-N7 enforcement): a store handed to
 * the trusted Host bootstrap must PROVE true revision CAS behavior before it
 * is accepted, by exercising an actual conflict. A store that cannot run the
 * probe sequence, accepts a stale-revision write, or accepts an unconditional
 * write is refused typed — "typed unsupported" instead of silent degradation.
 */
export async function probeTrueCasStore(store) {
    const key = `v8host:probe:${randomUUID()}`;
    // Positive path: create → CAS advance → read back must all succeed and
    // agree on the physical revision. Anything else is not a true CAS store.
    try {
        const first = await store.get(key);
        if (first !== null) {
            throw new Error('probe key is not fresh');
        }
        const created = await store.put(key, { probe: 'create' }, { mustBeAbsent: true });
        if (created.revision !== 0) {
            throw new Error(`create returned revision ${String(created.revision)} instead of 0`);
        }
        const advanced = await store.put(key, { probe: 'cas' }, { mustMatchRevision: 0 });
        if (advanced.revision !== 1) {
            throw new Error(`advance returned revision ${String(advanced.revision)} instead of 1`);
        }
    }
    catch (error) {
        throw new HostBoundaryError('HOST_STORAGE_UNSUPPORTED', `the presented storage could not exercise the true-CAS probe sequence (create, CAS advance, read back); it is refused instead of degraded (${String(error instanceof Error ? error.message : error)})`);
    }
    // The load-bearing refusal: a STALE revision expectation must conflict.
    let staleRejected = false;
    try {
        await store.put(key, { probe: 'stale' }, { mustMatchRevision: 0 });
    }
    catch {
        staleRejected = true;
    }
    if (!staleRejected) {
        throw new HostBoundaryError('HOST_STORAGE_UNSUPPORTED', 'the presented storage accepted a stale-revision write; it is not a true CAS store and is refused instead of degraded');
    }
    // And the unconditional-write path must not exist at all.
    let unconditionalRejected = false;
    try {
        await store.put(key, { probe: 'unconditional' }, undefined);
    }
    catch {
        unconditionalRejected = true;
    }
    if (!unconditionalRejected) {
        throw new HostBoundaryError('HOST_STORAGE_UNSUPPORTED', 'the presented storage accepted an unconditional write; revision-conditioned writes are mandatory');
    }
    const after = await store.get(key);
    if (after === null || after.revision !== 1 || after.value.probe !== 'cas') {
        throw new HostBoundaryError('HOST_STORAGE_UNSUPPORTED', 'CAS probe read-back does not match the last accepted physical write');
    }
    await store.remove(key, { mustMatchRevision: 1 });
    const cleaned = await store.get(key);
    if (cleaned !== null) {
        throw new HostBoundaryError('HOST_STORAGE_UNSUPPORTED', 'CAS probe cleanup remove did not take effect');
    }
}
