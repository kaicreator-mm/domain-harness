import { computeBehaviorallyRelevantDependencyDigest, } from '../contracts/domain-data.js';
import { computeCanonicalJsonDigest, isContentDigest, } from '../contracts/identity.js';
export const SEMANTIC_CACHE_IDENTITY_VERSION = 'domain-harness.semantic-invocation/v1';
export const SEMANTIC_CACHE_ENTRY_FORMAT_VERSION = 1;
export class SemanticCacheContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'SemanticCacheContractError';
        this.code = code;
    }
}
function nonEmpty(value, label) {
    if (value.length === 0)
        throw new SemanticCacheContractError('INVALID_SEMANTIC_CACHE_IDENTITY', `${label} must be non-empty`);
}
function epoch(value, label) {
    if (!Number.isFinite(value) || value < 0)
        throw new SemanticCacheContractError('INVALID_SEMANTIC_CACHE_ENTRY', `${label} must be a finite non-negative epoch millisecond`);
}
const cmp = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const artifactKey = (value) => `${value.kind}\u0000${value.artifactId}\u0000${value.contentDigest}`;
const projectionKey = (value) => [value.source, value.projectionId, value.descriptorDigest, value.valueDigest].join('\u0000');
const revisionKey = (value) => `${value.sourceId}\u0000${value.revision}`;
const storageKey = (value) => `${value.identityVersion}\u0000${value.namespace}\u0000${value.semanticDigest}`;
function normalizeDependencies(value) {
    const artifacts = [...(value.artifacts ?? [])]
        .map(({ kind, artifactId, contentDigest }) => ({ kind, artifactId, contentDigest }))
        .sort((a, b) => cmp(artifactKey(a), artifactKey(b)));
    const projections = [...(value.projections ?? [])]
        .map(({ source, projectionId, descriptorDigest, valueDigest }) => ({ source, projectionId, descriptorDigest, valueDigest }))
        .sort((a, b) => cmp(projectionKey(a), projectionKey(b)));
    const revisions = [...(value.revisions ?? [])]
        .map(({ sourceId, revision }) => ({ sourceId, revision }))
        .sort((a, b) => cmp(revisionKey(a), revisionKey(b)));
    return { artifacts, projections, revisions };
}
function normalizeObserved(value) {
    return { ...normalizeDependencies(value), unversionedLiveSourceIds: [...(value.unversionedLiveSourceIds ?? [])].sort(cmp) };
}
function requireProjections(request, deps) {
    const projections = deps.projections ?? [];
    for (const required of request.requiredProjections ?? []) {
        nonEmpty(required.projectionId, 'required projection id');
        if (!projections.some((value) => value.source === required.source && value.projectionId === required.projectionId)) {
            throw new SemanticCacheContractError('MISSING_REQUIRED_SEMANTIC_INPUT', `required semantic projection ${required.source}:${required.projectionId} is missing`);
        }
    }
    for (const projectionId of request.requiredProjectionIds ?? []) {
        nonEmpty(projectionId, 'required projection id');
        if (!projections.some((value) => value.source === 'input' && value.projectionId === projectionId)) {
            throw new SemanticCacheContractError('MISSING_REQUIRED_SEMANTIC_INPUT', `required semantic projection input:${projectionId} is missing`);
        }
    }
}
function missingRevision(request, deps) {
    const present = new Set((deps.revisions ?? []).map((value) => value.sourceId));
    for (const sourceId of request.requiredRevisionSourceIds ?? []) {
        nonEmpty(sourceId, 'required semantic revision source id');
        if (!present.has(sourceId))
            return true;
    }
    return false;
}
async function identity(material, deps, sha256) {
    const semanticDigest = await computeCanonicalJsonDigest({ identityVersion: SEMANTIC_CACHE_IDENTITY_VERSION, ...material }, sha256);
    return { material, dependencies: deps, key: { identityVersion: SEMANTIC_CACHE_IDENTITY_VERSION, namespace: material.namespace, semanticDigest } };
}
export async function prepareExactSemanticInvocation(request, sha256) {
    nonEmpty(request.namespace, 'namespace');
    nonEmpty(request.domainId, 'domainId');
    nonEmpty(request.decisionId, 'decisionId');
    if (request.selectedInput === undefined) {
        throw new SemanticCacheContractError('MISSING_REQUIRED_SEMANTIC_INPUT', 'selected semantic input is required');
    }
    const dependencies = normalizeDependencies(request.dependencies);
    const dependencyDigest = await computeBehaviorallyRelevantDependencyDigest(dependencies, sha256);
    requireProjections(request, dependencies);
    if (missingRevision(request, dependencies))
        return { cacheEligibility: { mode: 'bypass', reason: 'live-dependency-without-semantic-revision' } };
    if (request.allBehaviorallyRelevantDependenciesPrebound === false)
        return { cacheEligibility: { mode: 'bypass', reason: 'dynamic-dependency-not-prebound' } };
    if (request.cachePolicy?.mode === 'bypass')
        return { cacheEligibility: request.cachePolicy };
    const material = {
        namespace: request.namespace,
        domainId: request.domainId,
        decisionId: request.decisionId,
        inputDigest: await computeCanonicalJsonDigest(request.selectedInput, sha256),
        dependencyDigest,
    };
    return { cacheEligibility: { mode: 'eligible' }, semanticIdentity: await identity(material, dependencies, sha256) };
}
export function validateObservedDependencySet(preReadDependencies, observed) {
    const preRead = normalizeDependencies(preReadDependencies);
    const actual = normalizeObserved(observed);
    const live = actual.unversionedLiveSourceIds?.[0];
    if (live !== undefined)
        return { eligible: false, reason: 'observed-live-dependency-without-semantic-revision', identity: live };
    const checks = [
        ['observed-artifact-not-prebound', preRead.artifacts ?? [], actual.artifacts ?? [], artifactKey],
        ['observed-projection-not-prebound', preRead.projections ?? [], actual.projections ?? [], projectionKey],
        ['observed-revision-not-prebound', preRead.revisions ?? [], actual.revisions ?? [], revisionKey],
    ];
    for (const [reason, declared, used, keyOf] of checks) {
        const allowed = new Set(declared.map((value) => keyOf(value)));
        for (const value of used) {
            const key = keyOf(value);
            if (!allowed.has(key))
                return { eligible: false, reason, identity: key };
        }
    }
    return { eligible: true };
}
export async function prepareSemanticCacheWrite(invocation, result, producerIdentity, observedDependencies, createdAtEpochMs, sha256, expiresAtEpochMs) {
    epoch(createdAtEpochMs, 'createdAtEpochMs');
    if (expiresAtEpochMs !== undefined) {
        epoch(expiresAtEpochMs, 'expiresAtEpochMs');
        if (expiresAtEpochMs <= createdAtEpochMs)
            throw new SemanticCacheContractError('INVALID_SEMANTIC_CACHE_ENTRY', 'expiresAtEpochMs must be greater than createdAtEpochMs');
    }
    if (invocation.cacheEligibility.mode !== 'eligible')
        return { eligible: false, reason: 'pre-read-ineligible' };
    const exact = invocation.semanticIdentity;
    if (exact === undefined)
        throw new SemanticCacheContractError('INVALID_SEMANTIC_CACHE_IDENTITY', 'eligible semantic invocation is missing exact identity');
    const validation = validateObservedDependencySet(exact.dependencies, observedDependencies);
    if (!validation.eligible)
        return { eligible: false, reason: validation.reason, identity: validation.identity };
    const producer = artifactKey(producerIdentity);
    if (!(exact.dependencies.artifacts ?? []).some((value) => artifactKey(value) === producer))
        return { eligible: false, reason: 'producer-not-prebound', identity: producer };
    const normalizedObserved = normalizeObserved(observedDependencies);
    if (!(normalizedObserved.artifacts ?? []).some((value) => artifactKey(value) === producer))
        return { eligible: false, reason: 'producer-not-observed', identity: producer };
    const base = {
        formatVersion: SEMANTIC_CACHE_ENTRY_FORMAT_VERSION,
        identity: exact,
        result,
        resultDigest: await computeCanonicalJsonDigest(result, sha256),
        producerIdentity: { kind: producerIdentity.kind, artifactId: producerIdentity.artifactId, contentDigest: producerIdentity.contentDigest },
        observedDependencies: normalizedObserved,
        createdAtEpochMs,
    };
    return { eligible: true, entry: expiresAtEpochMs === undefined ? base : { ...base, expiresAtEpochMs } };
}
async function validEntry(entry, sha256) {
    if (entry.formatVersion !== SEMANTIC_CACHE_ENTRY_FORMAT_VERSION || entry.identity.key.identityVersion !== SEMANTIC_CACHE_IDENTITY_VERSION || entry.identity.key.namespace !== entry.identity.material.namespace || !isContentDigest(entry.identity.key.semanticDigest) || !isContentDigest(entry.identity.material.inputDigest) || !isContentDigest(entry.identity.material.dependencyDigest) || !isContentDigest(entry.resultDigest))
        return false;
    try {
        const normalized = normalizeDependencies(entry.identity.dependencies);
        if (await computeBehaviorallyRelevantDependencyDigest(normalized, sha256) !== entry.identity.material.dependencyDigest)
            return false;
        if ((await identity(entry.identity.material, normalized, sha256)).key.semanticDigest !== entry.identity.key.semanticDigest)
            return false;
        if (await computeCanonicalJsonDigest(entry.result, sha256) !== entry.resultDigest)
            return false;
        if (!validateObservedDependencySet(normalized, entry.observedDependencies).eligible)
            return false;
        const producer = artifactKey(entry.producerIdentity);
        return (normalized.artifacts ?? []).some((value) => artifactKey(value) === producer) && (entry.observedDependencies.artifacts ?? []).some((value) => artifactKey(value) === producer);
    }
    catch {
        return false;
    }
}
export async function readExactSemanticCache(store, key, currentSchema, nowEpochMs, sha256) {
    epoch(nowEpochMs, 'nowEpochMs');
    let read;
    try {
        read = await store.read(key, nowEpochMs);
    }
    catch {
        return { status: 'store-error' };
    }
    if (read.status !== 'hit')
        return read;
    const integrityValid = await validEntry(read.entry, sha256);
    if (integrityValid && currentSchema.isValid(read.entry.result))
        return read;
    try {
        await store.quarantine(key, integrityValid ? 'current-schema-revalidation-failed' : 'corrupt-cache-entry', nowEpochMs);
    }
    catch { /* best effort */ }
    return { status: 'miss', reason: 'quarantined' };
}
function retentionPolicy(value) {
    for (const [label, item] of [['maxEntries', value.maxEntries], ['maxQuarantineRecords', value.maxQuarantineRecords]]) {
        if (item !== undefined && (!Number.isSafeInteger(item) || item <= 0))
            throw new SemanticCacheContractError('INVALID_RETENTION_POLICY', `${label} must be a positive safe integer`);
    }
    if (value.maxAgeMs !== undefined && (!Number.isFinite(value.maxAgeMs) || value.maxAgeMs <= 0))
        throw new SemanticCacheContractError('INVALID_RETENTION_POLICY', 'maxAgeMs must be a finite positive number');
}
/** Volatile conformance/reference store only; T-022/T-023 own real persistence. */
export class VolatileExactSemanticCacheStore {
    entries = new Map();
    producerIndex = new Map();
    dependencyIndex = new Map();
    namespaceIndex = new Map();
    quarantineRecords = [];
    retention;
    constructor(retention = {}) { retentionPolicy(retention); this.retention = retention; }
    async read(key, nowEpochMs) {
        epoch(nowEpochMs, 'nowEpochMs');
        const id = storageKey(key);
        const entry = this.entries.get(id);
        if (entry === undefined)
            return { status: 'miss', reason: 'not-found' };
        if (this.isExpired(entry, nowEpochMs)) {
            this.remove(id);
            return { status: 'miss', reason: 'expired' };
        }
        return { status: 'hit', entry };
    }
    async putIfAbsent(entry, nowEpochMs) {
        epoch(nowEpochMs, 'nowEpochMs');
        this.evictExpired(nowEpochMs);
        const id = storageKey(entry.identity.key);
        const existing = this.entries.get(id);
        if (existing !== undefined)
            return { status: 'existing', entry: existing };
        /* Deliberately no await from exact-key check through insert: first writer wins in this store. */
        this.evictCapacityForIncoming();
        this.entries.set(id, entry);
        this.add(this.producerIndex, artifactKey(entry.producerIdentity), id);
        for (const dependency of entry.identity.dependencies.artifacts ?? [])
            this.add(this.dependencyIndex, artifactKey(dependency), id);
        this.add(this.namespaceIndex, entry.identity.key.namespace, id);
        return { status: 'inserted', entry };
    }
    async quarantine(key, reason, nowEpochMs) {
        epoch(nowEpochMs, 'nowEpochMs');
        nonEmpty(reason, 'quarantine reason');
        this.remove(storageKey(key));
        this.quarantineRecords.push({ key, reason, quarantinedAtEpochMs: nowEpochMs });
        const max = this.retention.maxQuarantineRecords;
        if (max !== undefined && this.quarantineRecords.length > max)
            this.quarantineRecords.splice(0, this.quarantineRecords.length - max);
    }
    async invalidateByProducer(value, _reason) { return this.invalidate(this.producerIndex, artifactKey(value)); }
    async invalidateByDependency(value, _reason) { return this.invalidate(this.dependencyIndex, artifactKey(value)); }
    async invalidateNamespace(namespace, _reason) { nonEmpty(namespace, 'namespace'); return this.invalidate(this.namespaceIndex, namespace); }
    async evict(nowEpochMs) { epoch(nowEpochMs, 'nowEpochMs'); return { expired: this.evictExpired(nowEpochMs), capacity: this.evictCapacity() }; }
    getQuarantineRecords() { return [...this.quarantineRecords]; }
    get size() { return this.entries.size; }
    add(index, key, id) { const values = index.get(key) ?? new Set(); values.add(id); index.set(key, values); }
    removeIndex(index, key, id) { const values = index.get(key); if (values === undefined)
        return; values.delete(id); if (values.size === 0)
        index.delete(key); }
    remove(id) {
        const entry = this.entries.get(id);
        if (entry === undefined)
            return false;
        this.entries.delete(id);
        this.removeIndex(this.producerIndex, artifactKey(entry.producerIdentity), id);
        for (const dependency of entry.identity.dependencies.artifacts ?? [])
            this.removeIndex(this.dependencyIndex, artifactKey(dependency), id);
        this.removeIndex(this.namespaceIndex, entry.identity.key.namespace, id);
        return true;
    }
    invalidate(index, key) { let count = 0; for (const id of [...(index.get(key) ?? [])].sort(cmp))
        if (this.remove(id))
            count += 1; return count; }
    isExpired(entry, now) {
        if (entry.expiresAtEpochMs !== undefined && now >= entry.expiresAtEpochMs)
            return true;
        return this.retention.maxAgeMs !== undefined && now - entry.createdAtEpochMs >= this.retention.maxAgeMs;
    }
    evictExpired(now) { let count = 0; for (const id of [...this.entries.keys()].sort(cmp)) {
        const entry = this.entries.get(id);
        if (entry !== undefined && this.isExpired(entry, now) && this.remove(id))
            count += 1;
    } return count; }
    candidates() { return [...this.entries.entries()].sort(([ak, a], [bk, b]) => a.createdAtEpochMs - b.createdAtEpochMs || cmp(ak, bk)); }
    evictCapacityForIncoming() { const max = this.retention.maxEntries; if (max === undefined || this.entries.size < max)
        return 0; return this.removeOldest(this.entries.size - max + 1); }
    evictCapacity() { const max = this.retention.maxEntries; if (max === undefined || this.entries.size <= max)
        return 0; return this.removeOldest(this.entries.size - max); }
    removeOldest(count) { let removed = 0; for (const [id] of this.candidates().slice(0, count))
        if (this.remove(id))
            removed += 1; return removed; }
}
//# sourceMappingURL=exact-semantic-cache.js.map