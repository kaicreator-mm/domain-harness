import type { JsonValue } from '../contracts/json.js';
import {
  computeBehaviorallyRelevantDependencyDigest,
  type BehaviorallyRelevantSemanticDependencies,
  type CompiledArtifactIdentity,
  type ResolvedSemanticContextProjection,
  type SemanticContextSource,
  type SemanticRevisionIdentity,
} from '../contracts/domain-data.js';
import {
  computeCanonicalJsonDigest,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from '../contracts/identity.js';

export const SEMANTIC_CACHE_IDENTITY_VERSION = 'domain-harness.semantic-invocation/v1' as const;
export const SEMANTIC_CACHE_ENTRY_FORMAT_VERSION = 1 as const;

export type SemanticCacheBypassReason =
  | 'non-cacheable'
  | 'time-sensitive'
  | 'live-dependency-without-semantic-revision'
  | 'dynamic-dependency-not-prebound'
  | 'explicit-domain-policy';
export type SemanticCacheWriteIneligibleReason =
  | 'pre-read-ineligible'
  | 'observed-artifact-not-prebound'
  | 'observed-projection-not-prebound'
  | 'observed-revision-not-prebound'
  | 'observed-live-dependency-without-semantic-revision'
  | 'producer-not-prebound'
  | 'producer-not-observed';
export type SemanticCacheContractErrorCode =
  | 'INVALID_SEMANTIC_CACHE_IDENTITY'
  | 'MISSING_REQUIRED_SEMANTIC_INPUT'
  | 'INVALID_SEMANTIC_CACHE_ENTRY'
  | 'INVALID_RETENTION_POLICY';

export class SemanticCacheContractError extends Error {
  readonly code: SemanticCacheContractErrorCode;
  constructor(code: SemanticCacheContractErrorCode, message: string) {
    super(message);
    this.name = 'SemanticCacheContractError';
    this.code = code;
  }
}

export interface SemanticCacheKey {
  readonly identityVersion: typeof SEMANTIC_CACHE_IDENTITY_VERSION;
  readonly namespace: string;
  readonly semanticDigest: ContentDigest;
}
export interface SemanticInvocationIdentityMaterial {
  readonly namespace: string;
  readonly domainId: string;
  readonly decisionId: string;
  readonly inputDigest: ContentDigest;
  readonly dependencyDigest: ContentDigest;
}
export interface ExactSemanticInvocationIdentity {
  readonly material: SemanticInvocationIdentityMaterial;
  readonly dependencies: BehaviorallyRelevantSemanticDependencies;
  readonly key: SemanticCacheKey;
}
export interface RequiredSemanticProjection {
  readonly source: SemanticContextSource;
  readonly projectionId: string;
}
export interface ExactSemanticInvocationRequest {
  readonly namespace: string;
  readonly domainId: string;
  readonly decisionId: string;
  readonly selectedInput: JsonValue;
  readonly dependencies: BehaviorallyRelevantSemanticDependencies;
  /** Preferred exact selector; source is part of T-002 projection identity. */
  readonly requiredProjections?: readonly RequiredSemanticProjection[];
  /** Compatibility seam for the initial T-013 focused fixture; input-source only. Prefer requiredProjections. */
  readonly requiredProjectionIds?: readonly string[];
  readonly requiredRevisionSourceIds?: readonly string[];
  readonly allBehaviorallyRelevantDependenciesPrebound?: boolean;
  readonly cachePolicy?:
    | { readonly mode: 'eligible' }
    | { readonly mode: 'bypass'; readonly reason: SemanticCacheBypassReason };
}
export type PreparedSemanticInvocation =
  | {
      readonly cacheEligibility: { readonly mode: 'eligible' };
      readonly semanticIdentity: ExactSemanticInvocationIdentity;
    }
  | {
      readonly cacheEligibility: { readonly mode: 'bypass'; readonly reason: SemanticCacheBypassReason };
      readonly semanticIdentity?: never;
    };
export interface ObservedDependencySet extends BehaviorallyRelevantSemanticDependencies {
  readonly unversionedLiveSourceIds?: readonly string[];
}
export type ObservedDependencyValidation =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason: Exclude<
        SemanticCacheWriteIneligibleReason,
        'pre-read-ineligible' | 'producer-not-prebound' | 'producer-not-observed'
      >;
      readonly identity: string;
    };
export interface SemanticCacheEntry<TResult extends JsonValue = JsonValue> {
  readonly formatVersion: typeof SEMANTIC_CACHE_ENTRY_FORMAT_VERSION;
  readonly identity: ExactSemanticInvocationIdentity;
  readonly result: TResult;
  readonly resultDigest: ContentDigest;
  readonly producerIdentity: CompiledArtifactIdentity;
  readonly observedDependencies: ObservedDependencySet;
  readonly createdAtEpochMs: number;
  readonly expiresAtEpochMs?: number;
}
export type PrepareSemanticCacheWriteResult<TResult extends JsonValue = JsonValue> =
  | { readonly eligible: true; readonly entry: SemanticCacheEntry<TResult> }
  | { readonly eligible: false; readonly reason: SemanticCacheWriteIneligibleReason; readonly identity?: string };
export type SemanticCacheRead<TResult extends JsonValue = JsonValue> =
  | { readonly status: 'hit'; readonly entry: SemanticCacheEntry<TResult> }
  | { readonly status: 'miss'; readonly reason: 'not-found' | 'expired' | 'quarantined' }
  | { readonly status: 'store-error' };
export type SemanticCachePut<TResult extends JsonValue = JsonValue> =
  | { readonly status: 'inserted'; readonly entry: SemanticCacheEntry<TResult> }
  | { readonly status: 'existing'; readonly entry: SemanticCacheEntry<TResult> };
export interface SemanticCacheEvictionReport { readonly expired: number; readonly capacity: number }
export interface SemanticCacheQuarantineRecord {
  readonly key: SemanticCacheKey;
  readonly reason: string;
  readonly quarantinedAtEpochMs: number;
}
export interface ExactSemanticCacheStore<TResult extends JsonValue = JsonValue> {
  read(key: SemanticCacheKey, nowEpochMs: number): Promise<SemanticCacheRead<TResult>>;
  putIfAbsent(entry: SemanticCacheEntry<TResult>, nowEpochMs: number): Promise<SemanticCachePut<TResult>>;
  quarantine(key: SemanticCacheKey, reason: string, nowEpochMs: number): Promise<void>;
  invalidateByProducer(producerIdentity: CompiledArtifactIdentity, reason: string): Promise<number>;
  invalidateByDependency(dependencyIdentity: CompiledArtifactIdentity, reason: string): Promise<number>;
  invalidateNamespace(namespace: string, reason: string): Promise<number>;
  evict(nowEpochMs: number): Promise<SemanticCacheEvictionReport>;
}
export interface SemanticCacheCurrentSchema<TResult extends JsonValue> {
  isValid(value: JsonValue): value is TResult;
}
export interface VolatileSemanticCacheRetentionPolicy {
  readonly maxAgeMs?: number;
  readonly maxEntries?: number;
  readonly maxQuarantineRecords?: number;
}

function nonEmpty(value: string, label: string): void {
  if (value.length === 0) throw new SemanticCacheContractError('INVALID_SEMANTIC_CACHE_IDENTITY', `${label} must be non-empty`);
}
function epoch(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new SemanticCacheContractError('INVALID_SEMANTIC_CACHE_ENTRY', `${label} must be a finite non-negative epoch millisecond`);
}
const cmp = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const artifactKey = (value: CompiledArtifactIdentity): string => `${value.kind}\u0000${value.artifactId}\u0000${value.contentDigest}`;
const projectionKey = (value: ResolvedSemanticContextProjection): string => [value.source, value.projectionId, value.descriptorDigest, value.valueDigest].join('\u0000');
const revisionKey = (value: SemanticRevisionIdentity): string => `${value.sourceId}\u0000${value.revision}`;
const storageKey = (value: SemanticCacheKey): string => `${value.identityVersion}\u0000${value.namespace}\u0000${value.semanticDigest}`;

function normalizeDependencies(value: BehaviorallyRelevantSemanticDependencies): BehaviorallyRelevantSemanticDependencies {
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
function normalizeObserved(value: ObservedDependencySet): ObservedDependencySet {
  return { ...normalizeDependencies(value), unversionedLiveSourceIds: [...(value.unversionedLiveSourceIds ?? [])].sort(cmp) };
}
function requireProjections(request: ExactSemanticInvocationRequest, deps: BehaviorallyRelevantSemanticDependencies): void {
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
function missingRevision(request: ExactSemanticInvocationRequest, deps: BehaviorallyRelevantSemanticDependencies): boolean {
  const present = new Set((deps.revisions ?? []).map((value) => value.sourceId));
  for (const sourceId of request.requiredRevisionSourceIds ?? []) {
    nonEmpty(sourceId, 'required semantic revision source id');
    if (!present.has(sourceId)) return true;
  }
  return false;
}
async function identity(material: SemanticInvocationIdentityMaterial, deps: BehaviorallyRelevantSemanticDependencies, sha256: Sha256Port): Promise<ExactSemanticInvocationIdentity> {
  const semanticDigest = await computeCanonicalJsonDigest({ identityVersion: SEMANTIC_CACHE_IDENTITY_VERSION, ...material }, sha256);
  return { material, dependencies: deps, key: { identityVersion: SEMANTIC_CACHE_IDENTITY_VERSION, namespace: material.namespace, semanticDigest } };
}

export async function prepareExactSemanticInvocation(request: ExactSemanticInvocationRequest, sha256: Sha256Port): Promise<PreparedSemanticInvocation> {
  nonEmpty(request.namespace, 'namespace');
  nonEmpty(request.domainId, 'domainId');
  nonEmpty(request.decisionId, 'decisionId');
  if ((request as { selectedInput?: JsonValue }).selectedInput === undefined) {
    throw new SemanticCacheContractError('MISSING_REQUIRED_SEMANTIC_INPUT', 'selected semantic input is required');
  }
  const dependencies = normalizeDependencies(request.dependencies);
  const dependencyDigest = await computeBehaviorallyRelevantDependencyDigest(dependencies, sha256);
  requireProjections(request, dependencies);
  if (missingRevision(request, dependencies)) return { cacheEligibility: { mode: 'bypass', reason: 'live-dependency-without-semantic-revision' } };
  if (request.allBehaviorallyRelevantDependenciesPrebound === false) return { cacheEligibility: { mode: 'bypass', reason: 'dynamic-dependency-not-prebound' } };
  if (request.cachePolicy?.mode === 'bypass') return { cacheEligibility: request.cachePolicy };
  const material: SemanticInvocationIdentityMaterial = {
    namespace: request.namespace,
    domainId: request.domainId,
    decisionId: request.decisionId,
    inputDigest: await computeCanonicalJsonDigest(request.selectedInput, sha256),
    dependencyDigest,
  };
  return { cacheEligibility: { mode: 'eligible' }, semanticIdentity: await identity(material, dependencies, sha256) };
}

export function validateObservedDependencySet(preReadDependencies: BehaviorallyRelevantSemanticDependencies, observed: ObservedDependencySet): ObservedDependencyValidation {
  const preRead = normalizeDependencies(preReadDependencies);
  const actual = normalizeObserved(observed);
  const live = actual.unversionedLiveSourceIds?.[0];
  if (live !== undefined) return { eligible: false, reason: 'observed-live-dependency-without-semantic-revision', identity: live };
  const checks = [
    ['observed-artifact-not-prebound', preRead.artifacts ?? [], actual.artifacts ?? [], artifactKey],
    ['observed-projection-not-prebound', preRead.projections ?? [], actual.projections ?? [], projectionKey],
    ['observed-revision-not-prebound', preRead.revisions ?? [], actual.revisions ?? [], revisionKey],
  ] as const;
  for (const [reason, declared, used, keyOf] of checks) {
    const allowed = new Set((declared as readonly never[]).map((value) => (keyOf as (item: never) => string)(value)));
    for (const value of used as readonly never[]) {
      const key = (keyOf as (item: never) => string)(value);
      if (!allowed.has(key)) return { eligible: false, reason, identity: key };
    }
  }
  return { eligible: true };
}

export async function prepareSemanticCacheWrite<TResult extends JsonValue>(
  invocation: PreparedSemanticInvocation,
  result: TResult,
  producerIdentity: CompiledArtifactIdentity,
  observedDependencies: ObservedDependencySet,
  createdAtEpochMs: number,
  sha256: Sha256Port,
  expiresAtEpochMs?: number,
): Promise<PrepareSemanticCacheWriteResult<TResult>> {
  epoch(createdAtEpochMs, 'createdAtEpochMs');
  if (expiresAtEpochMs !== undefined) {
    epoch(expiresAtEpochMs, 'expiresAtEpochMs');
    if (expiresAtEpochMs <= createdAtEpochMs) throw new SemanticCacheContractError('INVALID_SEMANTIC_CACHE_ENTRY', 'expiresAtEpochMs must be greater than createdAtEpochMs');
  }
  if (invocation.cacheEligibility.mode !== 'eligible') return { eligible: false, reason: 'pre-read-ineligible' };
  const exact = invocation.semanticIdentity;
  if (exact === undefined) throw new SemanticCacheContractError('INVALID_SEMANTIC_CACHE_IDENTITY', 'eligible semantic invocation is missing exact identity');
  const validation = validateObservedDependencySet(exact.dependencies, observedDependencies);
  if (!validation.eligible) return { eligible: false, reason: validation.reason, identity: validation.identity };
  const producer = artifactKey(producerIdentity);
  if (!(exact.dependencies.artifacts ?? []).some((value) => artifactKey(value) === producer)) return { eligible: false, reason: 'producer-not-prebound', identity: producer };
  const normalizedObserved = normalizeObserved(observedDependencies);
  if (!(normalizedObserved.artifacts ?? []).some((value) => artifactKey(value) === producer)) return { eligible: false, reason: 'producer-not-observed', identity: producer };
  const base = {
    formatVersion: SEMANTIC_CACHE_ENTRY_FORMAT_VERSION,
    identity: exact,
    result,
    resultDigest: await computeCanonicalJsonDigest(result, sha256),
    producerIdentity: { kind: producerIdentity.kind, artifactId: producerIdentity.artifactId, contentDigest: producerIdentity.contentDigest },
    observedDependencies: normalizedObserved,
    createdAtEpochMs,
  } as const;
  return { eligible: true, entry: expiresAtEpochMs === undefined ? base : { ...base, expiresAtEpochMs } };
}

async function validEntry(entry: SemanticCacheEntry, sha256: Sha256Port): Promise<boolean> {
  if (entry.formatVersion !== SEMANTIC_CACHE_ENTRY_FORMAT_VERSION || entry.identity.key.identityVersion !== SEMANTIC_CACHE_IDENTITY_VERSION || entry.identity.key.namespace !== entry.identity.material.namespace || !isContentDigest(entry.identity.key.semanticDigest) || !isContentDigest(entry.identity.material.inputDigest) || !isContentDigest(entry.identity.material.dependencyDigest) || !isContentDigest(entry.resultDigest)) return false;
  try {
    const normalized = normalizeDependencies(entry.identity.dependencies);
    if (await computeBehaviorallyRelevantDependencyDigest(normalized, sha256) !== entry.identity.material.dependencyDigest) return false;
    if ((await identity(entry.identity.material, normalized, sha256)).key.semanticDigest !== entry.identity.key.semanticDigest) return false;
    if (await computeCanonicalJsonDigest(entry.result, sha256) !== entry.resultDigest) return false;
    if (!validateObservedDependencySet(normalized, entry.observedDependencies).eligible) return false;
    const producer = artifactKey(entry.producerIdentity);
    return (normalized.artifacts ?? []).some((value) => artifactKey(value) === producer) && (entry.observedDependencies.artifacts ?? []).some((value) => artifactKey(value) === producer);
  } catch { return false; }
}

export async function readExactSemanticCache<TResult extends JsonValue>(store: ExactSemanticCacheStore<TResult>, key: SemanticCacheKey, currentSchema: SemanticCacheCurrentSchema<TResult>, nowEpochMs: number, sha256: Sha256Port): Promise<SemanticCacheRead<TResult>> {
  epoch(nowEpochMs, 'nowEpochMs');
  let read: SemanticCacheRead<TResult>;
  try { read = await store.read(key, nowEpochMs); } catch { return { status: 'store-error' }; }
  if (read.status !== 'hit') return read;
  const integrityValid = await validEntry(read.entry, sha256);
  if (integrityValid && currentSchema.isValid(read.entry.result)) return read;
  try { await store.quarantine(key, integrityValid ? 'current-schema-revalidation-failed' : 'corrupt-cache-entry', nowEpochMs); } catch { /* best effort */ }
  return { status: 'miss', reason: 'quarantined' };
}

function retentionPolicy(value: VolatileSemanticCacheRetentionPolicy): void {
  for (const [label, item] of [['maxEntries', value.maxEntries], ['maxQuarantineRecords', value.maxQuarantineRecords]] as const) {
    if (item !== undefined && (!Number.isSafeInteger(item) || item <= 0)) throw new SemanticCacheContractError('INVALID_RETENTION_POLICY', `${label} must be a positive safe integer`);
  }
  if (value.maxAgeMs !== undefined && (!Number.isFinite(value.maxAgeMs) || value.maxAgeMs <= 0)) throw new SemanticCacheContractError('INVALID_RETENTION_POLICY', 'maxAgeMs must be a finite positive number');
}

/** Volatile conformance/reference store only; T-022/T-023 own real persistence. */
export class VolatileExactSemanticCacheStore<TResult extends JsonValue = JsonValue> implements ExactSemanticCacheStore<TResult> {
  private readonly entries = new Map<string, SemanticCacheEntry<TResult>>();
  private readonly producerIndex = new Map<string, Set<string>>();
  private readonly dependencyIndex = new Map<string, Set<string>>();
  private readonly namespaceIndex = new Map<string, Set<string>>();
  private readonly quarantineRecords: SemanticCacheQuarantineRecord[] = [];
  private readonly retention: VolatileSemanticCacheRetentionPolicy;
  constructor(retention: VolatileSemanticCacheRetentionPolicy = {}) { retentionPolicy(retention); this.retention = retention; }

  async read(key: SemanticCacheKey, nowEpochMs: number): Promise<SemanticCacheRead<TResult>> {
    epoch(nowEpochMs, 'nowEpochMs');
    const id = storageKey(key);
    const entry = this.entries.get(id);
    if (entry === undefined) return { status: 'miss', reason: 'not-found' };
    if (this.isExpired(entry, nowEpochMs)) { this.remove(id); return { status: 'miss', reason: 'expired' }; }
    return { status: 'hit', entry };
  }

  async putIfAbsent(entry: SemanticCacheEntry<TResult>, nowEpochMs: number): Promise<SemanticCachePut<TResult>> {
    epoch(nowEpochMs, 'nowEpochMs');
    this.evictExpired(nowEpochMs);
    const id = storageKey(entry.identity.key);
    const existing = this.entries.get(id);
    if (existing !== undefined) return { status: 'existing', entry: existing };
    /* Deliberately no await from exact-key check through insert: first writer wins in this store. */
    this.evictCapacityForIncoming();
    this.entries.set(id, entry);
    this.add(this.producerIndex, artifactKey(entry.producerIdentity), id);
    for (const dependency of entry.identity.dependencies.artifacts ?? []) this.add(this.dependencyIndex, artifactKey(dependency), id);
    this.add(this.namespaceIndex, entry.identity.key.namespace, id);
    return { status: 'inserted', entry };
  }

  async quarantine(key: SemanticCacheKey, reason: string, nowEpochMs: number): Promise<void> {
    epoch(nowEpochMs, 'nowEpochMs'); nonEmpty(reason, 'quarantine reason');
    this.remove(storageKey(key));
    this.quarantineRecords.push({ key, reason, quarantinedAtEpochMs: nowEpochMs });
    const max = this.retention.maxQuarantineRecords;
    if (max !== undefined && this.quarantineRecords.length > max) this.quarantineRecords.splice(0, this.quarantineRecords.length - max);
  }
  async invalidateByProducer(value: CompiledArtifactIdentity, _reason: string): Promise<number> { return this.invalidate(this.producerIndex, artifactKey(value)); }
  async invalidateByDependency(value: CompiledArtifactIdentity, _reason: string): Promise<number> { return this.invalidate(this.dependencyIndex, artifactKey(value)); }
  async invalidateNamespace(namespace: string, _reason: string): Promise<number> { nonEmpty(namespace, 'namespace'); return this.invalidate(this.namespaceIndex, namespace); }
  async evict(nowEpochMs: number): Promise<SemanticCacheEvictionReport> { epoch(nowEpochMs, 'nowEpochMs'); return { expired: this.evictExpired(nowEpochMs), capacity: this.evictCapacity() }; }
  getQuarantineRecords(): readonly SemanticCacheQuarantineRecord[] { return [...this.quarantineRecords]; }
  get size(): number { return this.entries.size; }

  private add(index: Map<string, Set<string>>, key: string, id: string): void { const values = index.get(key) ?? new Set<string>(); values.add(id); index.set(key, values); }
  private removeIndex(index: Map<string, Set<string>>, key: string, id: string): void { const values = index.get(key); if (values === undefined) return; values.delete(id); if (values.size === 0) index.delete(key); }
  private remove(id: string): boolean {
    const entry = this.entries.get(id); if (entry === undefined) return false;
    this.entries.delete(id);
    this.removeIndex(this.producerIndex, artifactKey(entry.producerIdentity), id);
    for (const dependency of entry.identity.dependencies.artifacts ?? []) this.removeIndex(this.dependencyIndex, artifactKey(dependency), id);
    this.removeIndex(this.namespaceIndex, entry.identity.key.namespace, id);
    return true;
  }
  private invalidate(index: Map<string, Set<string>>, key: string): number { let count = 0; for (const id of [...(index.get(key) ?? [])].sort(cmp)) if (this.remove(id)) count += 1; return count; }
  private isExpired(entry: SemanticCacheEntry<TResult>, now: number): boolean {
    if (entry.expiresAtEpochMs !== undefined && now >= entry.expiresAtEpochMs) return true;
    return this.retention.maxAgeMs !== undefined && now - entry.createdAtEpochMs >= this.retention.maxAgeMs;
  }
  private evictExpired(now: number): number { let count = 0; for (const id of [...this.entries.keys()].sort(cmp)) { const entry = this.entries.get(id); if (entry !== undefined && this.isExpired(entry, now) && this.remove(id)) count += 1; } return count; }
  private candidates(): [string, SemanticCacheEntry<TResult>][] { return [...this.entries.entries()].sort(([ak, a], [bk, b]) => a.createdAtEpochMs - b.createdAtEpochMs || cmp(ak, bk)); }
  private evictCapacityForIncoming(): number { const max = this.retention.maxEntries; if (max === undefined || this.entries.size < max) return 0; return this.removeOldest(this.entries.size - max + 1); }
  private evictCapacity(): number { const max = this.retention.maxEntries; if (max === undefined || this.entries.size <= max) return 0; return this.removeOldest(this.entries.size - max); }
  private removeOldest(count: number): number { let removed = 0; for (const [id] of this.candidates().slice(0, count)) if (this.remove(id)) removed += 1; return removed; }
}
