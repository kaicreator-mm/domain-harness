import type { JsonValue } from '../contracts/json.js';
import {
  computeBehaviorallyRelevantDependencyDigest,
  type BehaviorallyRelevantSemanticDependencies,
  type CompiledArtifactIdentity,
  type ResolvedSemanticContextProjection,
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

export interface ExactSemanticInvocationRequest {
  readonly namespace: string;
  readonly domainId: string;
  readonly decisionId: string;
  /** Selected/canonical semantic input only. Execution ids and package pins stay outside this identity. */
  readonly selectedInput: JsonValue;
  readonly dependencies: BehaviorallyRelevantSemanticDependencies;
  /** Projection ids that are required to build this invocation. Missing required input fails closed. */
  readonly requiredProjectionIds?: readonly string[];
  /** Live/read-only dependency sources that must have pre-bindable exact semantic revisions. */
  readonly requiredRevisionSourceIds?: readonly string[];
  /** False when behaviorally relevant dynamic dependencies cannot be fully known before cache read. */
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
      readonly cacheEligibility: {
        readonly mode: 'bypass';
        readonly reason: SemanticCacheBypassReason;
      };
      readonly semanticIdentity?: never;
    };

export interface ObservedDependencySet extends BehaviorallyRelevantSemanticDependencies {
  /**
   * Live/read-only semantic sources actually observed during execution but not represented
   * by an exact SemanticRevisionIdentity. Any value here makes cache write ineligible.
   */
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
  | {
      readonly eligible: false;
      readonly reason: SemanticCacheWriteIneligibleReason;
      readonly identity?: string;
    };

export type SemanticCacheRead<TResult extends JsonValue = JsonValue> =
  | { readonly status: 'hit'; readonly entry: SemanticCacheEntry<TResult> }
  | { readonly status: 'miss'; readonly reason: 'not-found' | 'expired' | 'quarantined' }
  | { readonly status: 'store-error' };

export type SemanticCachePut<TResult extends JsonValue = JsonValue> =
  | { readonly status: 'inserted'; readonly entry: SemanticCacheEntry<TResult> }
  | { readonly status: 'existing'; readonly entry: SemanticCacheEntry<TResult> };

export interface SemanticCacheEvictionReport {
  readonly expired: number;
  readonly capacity: number;
}

export interface SemanticCacheQuarantineRecord {
  readonly key: SemanticCacheKey;
  readonly reason: string;
  readonly quarantinedAtEpochMs: number;
}

export interface ExactSemanticCacheStore<TResult extends JsonValue = JsonValue> {
  read(key: SemanticCacheKey, nowEpochMs: number): Promise<SemanticCacheRead<TResult>>;
  putIfAbsent(
    entry: SemanticCacheEntry<TResult>,
    nowEpochMs: number,
  ): Promise<SemanticCachePut<TResult>>;
  quarantine(key: SemanticCacheKey, reason: string, nowEpochMs: number): Promise<void>;
  invalidateByProducer(
    producerIdentity: CompiledArtifactIdentity,
    reason: string,
  ): Promise<number>;
  invalidateByDependency(
    dependencyIdentity: CompiledArtifactIdentity,
    reason: string,
  ): Promise<number>;
  invalidateNamespace(namespace: string, reason: string): Promise<number>;
  evict(nowEpochMs: number): Promise<SemanticCacheEvictionReport>;
}

export interface SemanticCacheCurrentSchema<TResult extends JsonValue> {
  isValid(value: JsonValue): value is TResult;
}

export interface VolatileSemanticCacheRetentionPolicy {
  /** Operational retention only; never a substitute for semantic freshness/revision identity. */
  readonly maxAgeMs?: number;
  readonly maxEntries?: number;
  readonly maxQuarantineRecords?: number;
}

function requireNonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    throw new SemanticCacheContractError(
      'INVALID_SEMANTIC_CACHE_IDENTITY',
      `${label} must be non-empty`,
    );
  }
}

function validateEpoch(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new SemanticCacheContractError(
      'INVALID_SEMANTIC_CACHE_ENTRY',
      `${label} must be a finite non-negative epoch millisecond`,
    );
  }
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function artifactIdentityKey(identity: CompiledArtifactIdentity): string {
  return `${identity.kind}\u0000${identity.artifactId}\u0000${identity.contentDigest}`;
}

function projectionIdentityKey(projection: ResolvedSemanticContextProjection): string {
  return [
    projection.source,
    projection.projectionId,
    projection.descriptorDigest,
    projection.valueDigest,
  ].join('\u0000');
}

function revisionIdentityKey(revision: SemanticRevisionIdentity): string {
  return `${revision.sourceId}\u0000${revision.revision}`;
}

function cacheStorageKey(key: SemanticCacheKey): string {
  return `${key.identityVersion}\u0000${key.namespace}\u0000${key.semanticDigest}`;
}

function normalizeDependencies(
  dependencies: BehaviorallyRelevantSemanticDependencies,
): BehaviorallyRelevantSemanticDependencies {
  const artifacts = [...(dependencies.artifacts ?? [])]
    .map(({ kind, artifactId, contentDigest }) => ({ kind, artifactId, contentDigest }))
    .sort((left, right) => lexicalCompare(artifactIdentityKey(left), artifactIdentityKey(right)));
  const projections = [...(dependencies.projections ?? [])]
    .map(({ source, projectionId, descriptorDigest, valueDigest }) => ({
      source,
      projectionId,
      descriptorDigest,
      valueDigest,
    }))
    .sort((left, right) => lexicalCompare(projectionIdentityKey(left), projectionIdentityKey(right)));
  const revisions = [...(dependencies.revisions ?? [])]
    .map(({ sourceId, revision }) => ({ sourceId, revision }))
    .sort((left, right) => lexicalCompare(revisionIdentityKey(left), revisionIdentityKey(right)));

  return { artifacts, projections, revisions };
}

function normalizeObservedDependencies(observed: ObservedDependencySet): ObservedDependencySet {
  const dependencies = normalizeDependencies(observed);
  const unversionedLiveSourceIds = [...(observed.unversionedLiveSourceIds ?? [])].sort(lexicalCompare);
  return { ...dependencies, unversionedLiveSourceIds };
}

function requireRequiredProjections(
  dependencies: BehaviorallyRelevantSemanticDependencies,
  requiredProjectionIds: readonly string[],
): void {
  const present = new Set((dependencies.projections ?? []).map((value) => value.projectionId));
  for (const projectionId of requiredProjectionIds) {
    requireNonEmpty(projectionId, 'required projection id');
    if (!present.has(projectionId)) {
      throw new SemanticCacheContractError(
        'MISSING_REQUIRED_SEMANTIC_INPUT',
        `required semantic projection ${projectionId} is missing`,
      );
    }
  }
}

function missingRevisionSourceId(
  dependencies: BehaviorallyRelevantSemanticDependencies,
  requiredRevisionSourceIds: readonly string[],
): string | undefined {
  const present = new Set((dependencies.revisions ?? []).map((value) => value.sourceId));
  for (const sourceId of requiredRevisionSourceIds) {
    requireNonEmpty(sourceId, 'required semantic revision source id');
    if (!present.has(sourceId)) return sourceId;
  }
  return undefined;
}

async function compileIdentityFromDigests(
  material: SemanticInvocationIdentityMaterial,
  dependencies: BehaviorallyRelevantSemanticDependencies,
  sha256: Sha256Port,
): Promise<ExactSemanticInvocationIdentity> {
  const semanticDigest = await computeCanonicalJsonDigest(
    {
      identityVersion: SEMANTIC_CACHE_IDENTITY_VERSION,
      namespace: material.namespace,
      domainId: material.domainId,
      decisionId: material.decisionId,
      inputDigest: material.inputDigest,
      dependencyDigest: material.dependencyDigest,
    },
    sha256,
  );

  return {
    material,
    dependencies,
    key: {
      identityVersion: SEMANTIC_CACHE_IDENTITY_VERSION,
      namespace: material.namespace,
      semanticDigest,
    },
  };
}

export async function prepareExactSemanticInvocation(
  request: ExactSemanticInvocationRequest,
  sha256: Sha256Port,
): Promise<PreparedSemanticInvocation> {
  requireNonEmpty(request.namespace, 'namespace');
  requireNonEmpty(request.domainId, 'domainId');
  requireNonEmpty(request.decisionId, 'decisionId');

  if ((request as { selectedInput?: JsonValue }).selectedInput === undefined) {
    throw new SemanticCacheContractError(
      'MISSING_REQUIRED_SEMANTIC_INPUT',
      'selected semantic input is required',
    );
  }

  const dependencies = normalizeDependencies(request.dependencies);
  // This both validates the T-002 dependency identities and compiles their stable exact digest.
  const dependencyDigest = await computeBehaviorallyRelevantDependencyDigest(dependencies, sha256);
  requireRequiredProjections(dependencies, request.requiredProjectionIds ?? []);

  const missingRevision = missingRevisionSourceId(
    dependencies,
    request.requiredRevisionSourceIds ?? [],
  );
  if (missingRevision !== undefined) {
    return {
      cacheEligibility: {
        mode: 'bypass',
        reason: 'live-dependency-without-semantic-revision',
      },
    };
  }

  if (request.allBehaviorallyRelevantDependenciesPrebound === false) {
    return {
      cacheEligibility: { mode: 'bypass', reason: 'dynamic-dependency-not-prebound' },
    };
  }

  if (request.cachePolicy?.mode === 'bypass') {
    return { cacheEligibility: request.cachePolicy };
  }

  const inputDigest = await computeCanonicalJsonDigest(request.selectedInput, sha256);
  const material: SemanticInvocationIdentityMaterial = {
    namespace: request.namespace,
    domainId: request.domainId,
    decisionId: request.decisionId,
    inputDigest,
    dependencyDigest,
  };

  return {
    cacheEligibility: { mode: 'eligible' },
    semanticIdentity: await compileIdentityFromDigests(material, dependencies, sha256),
  };
}

export function validateObservedDependencySet(
  preReadDependencies: BehaviorallyRelevantSemanticDependencies,
  observed: ObservedDependencySet,
): ObservedDependencyValidation {
  const preRead = normalizeDependencies(preReadDependencies);
  const normalizedObserved = normalizeObservedDependencies(observed);

  const unversioned = normalizedObserved.unversionedLiveSourceIds?.[0];
  if (unversioned !== undefined) {
    return {
      eligible: false,
      reason: 'observed-live-dependency-without-semantic-revision',
      identity: unversioned,
    };
  }

  const preArtifacts = new Set((preRead.artifacts ?? []).map(artifactIdentityKey));
  for (const artifact of normalizedObserved.artifacts ?? []) {
    const key = artifactIdentityKey(artifact);
    if (!preArtifacts.has(key)) {
      return { eligible: false, reason: 'observed-artifact-not-prebound', identity: key };
    }
  }

  const preProjections = new Set((preRead.projections ?? []).map(projectionIdentityKey));
  for (const projection of normalizedObserved.projections ?? []) {
    const key = projectionIdentityKey(projection);
    if (!preProjections.has(key)) {
      return {
        eligible: false,
        reason: 'observed-projection-not-prebound',
        identity: key,
      };
    }
  }

  const preRevisions = new Set((preRead.revisions ?? []).map(revisionIdentityKey));
  for (const revision of normalizedObserved.revisions ?? []) {
    const key = revisionIdentityKey(revision);
    if (!preRevisions.has(key)) {
      return { eligible: false, reason: 'observed-revision-not-prebound', identity: key };
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
  validateEpoch(createdAtEpochMs, 'createdAtEpochMs');
  if (expiresAtEpochMs !== undefined) {
    validateEpoch(expiresAtEpochMs, 'expiresAtEpochMs');
    if (expiresAtEpochMs <= createdAtEpochMs) {
      throw new SemanticCacheContractError(
        'INVALID_SEMANTIC_CACHE_ENTRY',
        'expiresAtEpochMs must be greater than createdAtEpochMs',
      );
    }
  }

  if (invocation.cacheEligibility.mode !== 'eligible') {
    return { eligible: false, reason: 'pre-read-ineligible' };
  }

  const semanticIdentity = invocation.semanticIdentity;
  if (semanticIdentity === undefined) {
    throw new SemanticCacheContractError(
      'INVALID_SEMANTIC_CACHE_IDENTITY',
      'eligible semantic invocation is missing exact identity',
    );
  }
  const validation = validateObservedDependencySet(
    semanticIdentity.dependencies,
    observedDependencies,
  );
  if (!validation.eligible) {
    return {
      eligible: false,
      reason: validation.reason,
      identity: validation.identity,
    };
  }

  const producerKey = artifactIdentityKey(producerIdentity);
  const preReadArtifacts = new Set(
    (semanticIdentity.dependencies.artifacts ?? []).map(artifactIdentityKey),
  );
  if (!preReadArtifacts.has(producerKey)) {
    return { eligible: false, reason: 'producer-not-prebound', identity: producerKey };
  }

  const normalizedObserved = normalizeObservedDependencies(observedDependencies);
  const observedArtifacts = new Set(
    (normalizedObserved.artifacts ?? []).map(artifactIdentityKey),
  );
  if (!observedArtifacts.has(producerKey)) {
    return { eligible: false, reason: 'producer-not-observed', identity: producerKey };
  }

  const resultDigest = await computeCanonicalJsonDigest(result, sha256);
  const normalizedProducer: CompiledArtifactIdentity = {
    kind: producerIdentity.kind,
    artifactId: producerIdentity.artifactId,
    contentDigest: producerIdentity.contentDigest,
  };

  const entryBase = {
    formatVersion: SEMANTIC_CACHE_ENTRY_FORMAT_VERSION,
    identity: semanticIdentity,
    result,
    resultDigest,
    producerIdentity: normalizedProducer,
    observedDependencies: normalizedObserved,
    createdAtEpochMs,
  } as const;

  return {
    eligible: true,
    entry:
      expiresAtEpochMs === undefined
        ? entryBase
        : { ...entryBase, expiresAtEpochMs },
  };
}

async function validateEntryIntegrity(
  entry: SemanticCacheEntry,
  sha256: Sha256Port,
): Promise<boolean> {
  if (
    entry.formatVersion !== SEMANTIC_CACHE_ENTRY_FORMAT_VERSION ||
    entry.identity.key.identityVersion !== SEMANTIC_CACHE_IDENTITY_VERSION ||
    entry.identity.key.namespace !== entry.identity.material.namespace ||
    !isContentDigest(entry.identity.key.semanticDigest) ||
    !isContentDigest(entry.identity.material.inputDigest) ||
    !isContentDigest(entry.identity.material.dependencyDigest) ||
    !isContentDigest(entry.resultDigest)
  ) {
    return false;
  }

  try {
    const dependencyDigest = await computeBehaviorallyRelevantDependencyDigest(
      entry.identity.dependencies,
      sha256,
    );
    if (dependencyDigest !== entry.identity.material.dependencyDigest) return false;

    const rebuilt = await compileIdentityFromDigests(
      entry.identity.material,
      normalizeDependencies(entry.identity.dependencies),
      sha256,
    );
    if (rebuilt.key.semanticDigest !== entry.identity.key.semanticDigest) return false;

    const resultDigest = await computeCanonicalJsonDigest(entry.result, sha256);
    if (resultDigest !== entry.resultDigest) return false;

    const observedValidation = validateObservedDependencySet(
      entry.identity.dependencies,
      entry.observedDependencies,
    );
    if (!observedValidation.eligible) return false;

    const producerKey = artifactIdentityKey(entry.producerIdentity);
    const preReadArtifacts = new Set(
      (entry.identity.dependencies.artifacts ?? []).map(artifactIdentityKey),
    );
    const observedArtifacts = new Set(
      (entry.observedDependencies.artifacts ?? []).map(artifactIdentityKey),
    );
    return preReadArtifacts.has(producerKey) && observedArtifacts.has(producerKey);
  } catch {
    return false;
  }
}

export async function readExactSemanticCache<TResult extends JsonValue>(
  store: ExactSemanticCacheStore<TResult>,
  key: SemanticCacheKey,
  currentSchema: SemanticCacheCurrentSchema<TResult>,
  nowEpochMs: number,
  sha256: Sha256Port,
): Promise<SemanticCacheRead<TResult>> {
  validateEpoch(nowEpochMs, 'nowEpochMs');

  let read: SemanticCacheRead<TResult>;
  try {
    read = await store.read(key, nowEpochMs);
  } catch {
    return { status: 'store-error' };
  }
  if (read.status !== 'hit') return read;

  const integrityValid = await validateEntryIntegrity(read.entry, sha256);
  const schemaValid = integrityValid && currentSchema.isValid(read.entry.result);
  if (schemaValid) return read;

  try {
    await store.quarantine(
      key,
      integrityValid ? 'current-schema-revalidation-failed' : 'corrupt-cache-entry',
      nowEpochMs,
    );
  } catch {
    // Quarantine is best-effort. Invalid data never regains authority if quarantine storage fails.
  }
  return { status: 'miss', reason: 'quarantined' };
}

function validateRetentionPolicy(policy: VolatileSemanticCacheRetentionPolicy): void {
  const positiveIntegerFields = [
    ['maxEntries', policy.maxEntries],
    ['maxQuarantineRecords', policy.maxQuarantineRecords],
  ] as const;
  for (const [label, value] of positiveIntegerFields) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new SemanticCacheContractError(
        'INVALID_RETENTION_POLICY',
        `${label} must be a positive safe integer`,
      );
    }
  }
  if (
    policy.maxAgeMs !== undefined &&
    (!Number.isFinite(policy.maxAgeMs) || policy.maxAgeMs <= 0)
  ) {
    throw new SemanticCacheContractError(
      'INVALID_RETENTION_POLICY',
      'maxAgeMs must be a finite positive number',
    );
  }
}

/**
 * Volatile reference implementation of the production logical store contract.
 * It owns exact-key/index/invalidation/retention semantics but deliberately makes no durability claim.
 * T-022/T-023 provide real Node/Expo persistence adapters against the same contract.
 */
export class VolatileExactSemanticCacheStore<TResult extends JsonValue = JsonValue>
  implements ExactSemanticCacheStore<TResult>
{
  private readonly entries = new Map<string, SemanticCacheEntry<TResult>>();
  private readonly producerIndex = new Map<string, Set<string>>();
  private readonly dependencyIndex = new Map<string, Set<string>>();
  private readonly namespaceIndex = new Map<string, Set<string>>();
  private readonly quarantineRecords: SemanticCacheQuarantineRecord[] = [];
  private readonly retention: VolatileSemanticCacheRetentionPolicy;

  constructor(retention: VolatileSemanticCacheRetentionPolicy = {}) {
    validateRetentionPolicy(retention);
    this.retention = retention;
  }

  async read(
    key: SemanticCacheKey,
    nowEpochMs: number,
  ): Promise<SemanticCacheRead<TResult>> {
    validateEpoch(nowEpochMs, 'nowEpochMs');
    const storageKey = cacheStorageKey(key);
    const entry = this.entries.get(storageKey);
    if (entry === undefined) return { status: 'miss', reason: 'not-found' };

    if (this.isExpired(entry, nowEpochMs)) {
      this.remove(storageKey);
      return { status: 'miss', reason: 'expired' };
    }

    return { status: 'hit', entry };
  }

  async putIfAbsent(
    entry: SemanticCacheEntry<TResult>,
    nowEpochMs: number,
  ): Promise<SemanticCachePut<TResult>> {
    validateEpoch(nowEpochMs, 'nowEpochMs');
    await this.evictExpired(nowEpochMs);

    const storageKey = cacheStorageKey(entry.identity.key);
    const existing = this.entries.get(storageKey);
    if (existing !== undefined) {
      return { status: 'existing', entry: existing };
    }

    await this.evictCapacityForIncoming();

    this.entries.set(storageKey, entry);
    this.addIndex(this.producerIndex, artifactIdentityKey(entry.producerIdentity), storageKey);
    for (const dependency of entry.identity.dependencies.artifacts ?? []) {
      this.addIndex(this.dependencyIndex, artifactIdentityKey(dependency), storageKey);
    }
    this.addIndex(this.namespaceIndex, entry.identity.key.namespace, storageKey);

    return { status: 'inserted', entry };
  }

  async quarantine(
    key: SemanticCacheKey,
    reason: string,
    nowEpochMs: number,
  ): Promise<void> {
    validateEpoch(nowEpochMs, 'nowEpochMs');
    requireNonEmpty(reason, 'quarantine reason');
    const storageKey = cacheStorageKey(key);
    this.remove(storageKey);
    this.quarantineRecords.push({ key, reason, quarantinedAtEpochMs: nowEpochMs });
    const max = this.retention.maxQuarantineRecords;
    if (max !== undefined && this.quarantineRecords.length > max) {
      this.quarantineRecords.splice(0, this.quarantineRecords.length - max);
    }
  }

  async invalidateByProducer(
    producerIdentity: CompiledArtifactIdentity,
    _reason: string,
  ): Promise<number> {
    return this.invalidateIndexed(this.producerIndex, artifactIdentityKey(producerIdentity));
  }

  async invalidateByDependency(
    dependencyIdentity: CompiledArtifactIdentity,
    _reason: string,
  ): Promise<number> {
    return this.invalidateIndexed(
      this.dependencyIndex,
      artifactIdentityKey(dependencyIdentity),
    );
  }

  async invalidateNamespace(namespace: string, _reason: string): Promise<number> {
    requireNonEmpty(namespace, 'namespace');
    return this.invalidateIndexed(this.namespaceIndex, namespace);
  }

  async evict(nowEpochMs: number): Promise<SemanticCacheEvictionReport> {
    validateEpoch(nowEpochMs, 'nowEpochMs');
    const expired = await this.evictExpired(nowEpochMs);
    const capacity = await this.evictCapacity();
    return { expired, capacity };
  }

  /** Deterministic observability for focused tests/host adapter conformance; not cache authority. */
  getQuarantineRecords(): readonly SemanticCacheQuarantineRecord[] {
    return [...this.quarantineRecords];
  }

  get size(): number {
    return this.entries.size;
  }

  private addIndex(index: Map<string, Set<string>>, key: string, storageKey: string): void {
    let values = index.get(key);
    if (values === undefined) {
      values = new Set<string>();
      index.set(key, values);
    }
    values.add(storageKey);
  }

  private removeIndex(index: Map<string, Set<string>>, key: string, storageKey: string): void {
    const values = index.get(key);
    if (values === undefined) return;
    values.delete(storageKey);
    if (values.size === 0) index.delete(key);
  }

  private remove(storageKey: string): boolean {
    const entry = this.entries.get(storageKey);
    if (entry === undefined) return false;

    this.entries.delete(storageKey);
    this.removeIndex(
      this.producerIndex,
      artifactIdentityKey(entry.producerIdentity),
      storageKey,
    );
    for (const dependency of entry.identity.dependencies.artifacts ?? []) {
      this.removeIndex(
        this.dependencyIndex,
        artifactIdentityKey(dependency),
        storageKey,
      );
    }
    this.removeIndex(this.namespaceIndex, entry.identity.key.namespace, storageKey);
    return true;
  }

  private async invalidateIndexed(
    index: Map<string, Set<string>>,
    indexKey: string,
  ): Promise<number> {
    const storageKeys = [...(index.get(indexKey) ?? [])].sort(lexicalCompare);
    let removed = 0;
    for (const storageKey of storageKeys) {
      if (this.remove(storageKey)) removed += 1;
    }
    return removed;
  }

  private isExpired(entry: SemanticCacheEntry<TResult>, nowEpochMs: number): boolean {
    const explicitExpiry = entry.expiresAtEpochMs;
    if (explicitExpiry !== undefined && nowEpochMs >= explicitExpiry) return true;
    const maxAgeMs = this.retention.maxAgeMs;
    return maxAgeMs !== undefined && nowEpochMs - entry.createdAtEpochMs >= maxAgeMs;
  }

  private async evictExpired(nowEpochMs: number): Promise<number> {
    const storageKeys = [...this.entries.keys()].sort(lexicalCompare);
    let removed = 0;
    for (const storageKey of storageKeys) {
      const entry = this.entries.get(storageKey);
      if (entry !== undefined && this.isExpired(entry, nowEpochMs) && this.remove(storageKey)) {
        removed += 1;
      }
    }
    return removed;
  }

  private async evictCapacityForIncoming(): Promise<number> {
    const maxEntries = this.retention.maxEntries;
    if (maxEntries === undefined || this.entries.size < maxEntries) return 0;

    const candidates = [...this.entries.entries()].sort(([leftKey, left], [rightKey, right]) => {
      const created = left.createdAtEpochMs - right.createdAtEpochMs;
      return created !== 0 ? created : lexicalCompare(leftKey, rightKey);
    });
    const removeCount = this.entries.size - maxEntries + 1;
    let removed = 0;
    for (const [storageKey] of candidates.slice(0, removeCount)) {
      if (this.remove(storageKey)) removed += 1;
    }
    return removed;
  }

  private async evictCapacity(): Promise<number> {
    const maxEntries = this.retention.maxEntries;
    if (maxEntries === undefined || this.entries.size <= maxEntries) return 0;

    const candidates = [...this.entries.entries()].sort(([leftKey, left], [rightKey, right]) => {
      const created = left.createdAtEpochMs - right.createdAtEpochMs;
      return created !== 0 ? created : lexicalCompare(leftKey, rightKey);
    });
    const removeCount = this.entries.size - maxEntries;
    let removed = 0;
    for (const [storageKey] of candidates.slice(0, removeCount)) {
      if (this.remove(storageKey)) removed += 1;
    }
    return removed;
  }
}
