/** v0.10.2 T03a — scoped Memory foundation over injected CAS and authorization. */
/**
 * v0.10 T04: optional scoped Memory C/Host adapter over physical document CAS.
 * This is not K State, Journal, Receipt, Fence or an external Effect permit.
 */
import { Buffer } from 'node:buffer';
export class V10MemoryError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'V10MemoryError';
    }
}
function refuse(code, message) {
    throw new V10MemoryError(code, message);
}
const SCOPED_FIELDS = ['deployedAppId', 'tenantId', 'appId', 'businessPackageId', 'agentId', 'threadId'];
function scopedPrefix(scope) {
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
        refuse('MEMORY_SCOPE_INVALID', 'scope must contain every deployment and Business identity field');
    }
    const segments = [];
    for (const field of SCOPED_FIELDS) {
        const v = scope[field];
        if (typeof v !== 'string' || v.length === 0 || v.length > 256) {
            refuse('MEMORY_SCOPE_INVALID', 'invalid scoped Memory identity: ' + field);
        }
        segments.push(Buffer.from(v, 'utf8').toString('base64url'));
    }
    return 'v010:memory:' + segments.join(':') + ':';
}
function validKey(key) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 512) {
        refuse('MEMORY_KEY_INVALID', 'memory key must be a bounded nonempty string');
    }
    return key;
}
function fullKey(scope, key) {
    return scopedPrefix(scope) + Buffer.from(validKey(key), 'utf8').toString('base64url');
}
function canonicalJson(value) {
    try {
        const raw = JSON.stringify(value);
        if (raw === undefined)
            refuse('MEMORY_VALUE_INVALID', 'value must be JSON-representable');
        return JSON.parse(raw);
    }
    catch (error) {
        if (error instanceof V10MemoryError)
            throw error;
        refuse('MEMORY_VALUE_INVALID', 'value must be JSON-representable');
    }
}
function validProvenance(v) {
    if (!v || typeof v !== 'object'
        || typeof v.source !== 'string' || v.source.length === 0 || v.source.length > 256
        || typeof v.recordedBy !== 'string' || v.recordedBy.length === 0 || v.recordedBy.length > 256) {
        refuse('MEMORY_PROVENANCE_INVALID', 'write requires source and recordedBy provenance');
    }
    return { source: v.source, recordedBy: v.recordedBy };
}
function validCondition(c) {
    const create = c?.mustBeAbsent === true;
    const cas = Number.isSafeInteger(c?.mustMatchRevision) && c.mustMatchRevision >= 0;
    if (create === cas)
        refuse('MEMORY_CAS_REQUIRED', 'one create or revision-CAS condition is required');
    return c;
}
export class V10ScopedMemoryCapability {
    #store;
    #authorize;
    #now;
    constructor(host) {
        if (!host || typeof host.authorize !== 'function') {
            refuse('MEMORY_AUTHORIZATION_REQUIRED', 'trusted Host authorization is mandatory');
        }
        this.#store = host.store;
        this.#authorize = host.authorize;
        this.#now = host.now ?? Date.now;
    }
    async #admit(operation, scope, key) {
        const physical = fullKey(scope, key);
        if ((await this.#authorize({ operation, scope, key })) !== true) {
            refuse('MEMORY_SCOPE_DENIED', 'memory access refused by Host');
        }
        return physical;
    }
    #visible(value, revision) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            refuse('MEMORY_RECORD_INVALID', 'stored Memory document is not a record');
        }
        const v = value;
        if (!Object.hasOwn(v, 'value')
            || !(v.expiresAtMs === null || (typeof v.expiresAtMs === 'number' && Number.isFinite(v.expiresAtMs)))
            || !v.provenance || typeof v.provenance !== 'object') {
            refuse('MEMORY_RECORD_INVALID', 'stored memory value, expiry or provenance malformed');
        }
        if (v.expiresAtMs !== null && this.#now() >= v.expiresAtMs)
            return null;
        return { value: canonicalJson(v.value), revision,
            provenance: validProvenance(v.provenance),
            expiresAtMs: v.expiresAtMs };
    }
    async put(input) {
        const physical = await this.#admit('put', input.scope, input.key);
        const expiresAtMs = input.expiresAtMs ?? null;
        if (expiresAtMs !== null && (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= this.#now())) {
            refuse('MEMORY_TTL_INVALID', 'expiration must be a future safe-integer instant');
        }
        // An expired row is invisible to callers, but remains a physical CAS row.
        // A create may reclaim it only by matching its observed revision; two
        // concurrent creators must never both succeed. Live rows still reject
        // mustBeAbsent, and explicit revision-CAS semantics remain unchanged.
        let condition = validCondition(input.condition);
        if (condition.mustBeAbsent === true) {
            const existing = await this.#store.get(physical);
            if (existing !== null && this.#visible(existing.value, existing.revision) === null) {
                condition = { mustMatchRevision: existing.revision };
            }
        }
        return await this.#store.put(physical, {
            value: canonicalJson(input.value),
            provenance: validProvenance(input.provenance),
            expiresAtMs,
        }, condition);
    }
    async get(scope, key) {
        const physical = await this.#admit('get', scope, key);
        const found = await this.#store.get(physical);
        return found === null ? null : this.#visible(found.value, found.revision);
    }
    async search(scope, keyPrefix = '', maxResults = 50) {
        const prefix = scopedPrefix(scope);
        if (typeof keyPrefix !== 'string' || keyPrefix.length > 512
            || !Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 100) {
            refuse('MEMORY_SEARCH_INVALID', 'invalid bounded memory query');
        }
        if ((await this.#authorize({ operation: 'search', scope, key: keyPrefix })) !== true) {
            refuse('MEMORY_SCOPE_DENIED', 'memory search refused by Host');
        }
        const results = [];
        for (const physical of await this.#store.list(prefix)) {
            if (!physical.startsWith(prefix))
                continue;
            const key = Buffer.from(physical.slice(prefix.length), 'base64url').toString('utf8');
            if (!key.startsWith(keyPrefix))
                continue;
            if ((await this.#authorize({ operation: 'get', scope, key })) !== true)
                continue;
            const item = await this.#store.get(physical);
            const visible = item === null ? null : this.#visible(item.value, item.revision);
            if (visible !== null)
                results.push({ key, ...visible });
            if (results.length >= maxResults)
                break;
        }
        return results;
    }
    async delete(scope, key, revision) {
        const physical = await this.#admit('delete', scope, key);
        if (!Number.isSafeInteger(revision) || revision < 0) {
            refuse('MEMORY_CAS_REQUIRED', 'delete requires exact revision');
        }
        await this.#store.remove(physical, { mustMatchRevision: revision });
    }
}
export function createV10ScopedMemory(host) {
    return new V10ScopedMemoryCapability(host);
}
