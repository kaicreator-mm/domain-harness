import type { JsonValue } from '../contracts/json.js';
import { type BehaviorallyRelevantSemanticDependencies, type CompiledArtifactIdentity, type SemanticContextSource } from '../contracts/domain-data.js';
import { type ContentDigest, type Sha256Port } from '../contracts/identity.js';
export declare const SEMANTIC_CACHE_IDENTITY_VERSION: "domain-harness.semantic-invocation/v1";
export declare const SEMANTIC_CACHE_ENTRY_FORMAT_VERSION: 1;
export type SemanticCacheBypassReason = 'non-cacheable' | 'time-sensitive' | 'live-dependency-without-semantic-revision' | 'dynamic-dependency-not-prebound' | 'explicit-domain-policy';
export type SemanticCacheWriteIneligibleReason = 'pre-read-ineligible' | 'observed-artifact-not-prebound' | 'observed-projection-not-prebound' | 'observed-revision-not-prebound' | 'observed-live-dependency-without-semantic-revision' | 'producer-not-prebound' | 'producer-not-observed';
export type SemanticCacheContractErrorCode = 'INVALID_SEMANTIC_CACHE_IDENTITY' | 'MISSING_REQUIRED_SEMANTIC_INPUT' | 'INVALID_SEMANTIC_CACHE_ENTRY' | 'INVALID_RETENTION_POLICY';
export declare class SemanticCacheContractError extends Error {
    readonly code: SemanticCacheContractErrorCode;
    constructor(code: SemanticCacheContractErrorCode, message: string);
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
    readonly cachePolicy?: {
        readonly mode: 'eligible';
    } | {
        readonly mode: 'bypass';
        readonly reason: SemanticCacheBypassReason;
    };
}
export type PreparedSemanticInvocation = {
    readonly cacheEligibility: {
        readonly mode: 'eligible';
    };
    readonly semanticIdentity: ExactSemanticInvocationIdentity;
} | {
    readonly cacheEligibility: {
        readonly mode: 'bypass';
        readonly reason: SemanticCacheBypassReason;
    };
    readonly semanticIdentity?: never;
};
export interface ObservedDependencySet extends BehaviorallyRelevantSemanticDependencies {
    readonly unversionedLiveSourceIds?: readonly string[];
}
export type ObservedDependencyValidation = {
    readonly eligible: true;
} | {
    readonly eligible: false;
    readonly reason: Exclude<SemanticCacheWriteIneligibleReason, 'pre-read-ineligible' | 'producer-not-prebound' | 'producer-not-observed'>;
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
export type PrepareSemanticCacheWriteResult<TResult extends JsonValue = JsonValue> = {
    readonly eligible: true;
    readonly entry: SemanticCacheEntry<TResult>;
} | {
    readonly eligible: false;
    readonly reason: SemanticCacheWriteIneligibleReason;
    readonly identity?: string;
};
export type SemanticCacheRead<TResult extends JsonValue = JsonValue> = {
    readonly status: 'hit';
    readonly entry: SemanticCacheEntry<TResult>;
} | {
    readonly status: 'miss';
    readonly reason: 'not-found' | 'expired' | 'quarantined';
} | {
    readonly status: 'store-error';
};
export type SemanticCachePut<TResult extends JsonValue = JsonValue> = {
    readonly status: 'inserted';
    readonly entry: SemanticCacheEntry<TResult>;
} | {
    readonly status: 'existing';
    readonly entry: SemanticCacheEntry<TResult>;
};
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
export declare function prepareExactSemanticInvocation(request: ExactSemanticInvocationRequest, sha256: Sha256Port): Promise<PreparedSemanticInvocation>;
export declare function validateObservedDependencySet(preReadDependencies: BehaviorallyRelevantSemanticDependencies, observed: ObservedDependencySet): ObservedDependencyValidation;
export declare function prepareSemanticCacheWrite<TResult extends JsonValue>(invocation: PreparedSemanticInvocation, result: TResult, producerIdentity: CompiledArtifactIdentity, observedDependencies: ObservedDependencySet, createdAtEpochMs: number, sha256: Sha256Port, expiresAtEpochMs?: number): Promise<PrepareSemanticCacheWriteResult<TResult>>;
export declare function readExactSemanticCache<TResult extends JsonValue>(store: ExactSemanticCacheStore<TResult>, key: SemanticCacheKey, currentSchema: SemanticCacheCurrentSchema<TResult>, nowEpochMs: number, sha256: Sha256Port): Promise<SemanticCacheRead<TResult>>;
/** Volatile conformance/reference store only; T-022/T-023 own real persistence. */
export declare class VolatileExactSemanticCacheStore<TResult extends JsonValue = JsonValue> implements ExactSemanticCacheStore<TResult> {
    private readonly entries;
    private readonly producerIndex;
    private readonly dependencyIndex;
    private readonly namespaceIndex;
    private readonly quarantineRecords;
    private readonly retention;
    constructor(retention?: VolatileSemanticCacheRetentionPolicy);
    read(key: SemanticCacheKey, nowEpochMs: number): Promise<SemanticCacheRead<TResult>>;
    putIfAbsent(entry: SemanticCacheEntry<TResult>, nowEpochMs: number): Promise<SemanticCachePut<TResult>>;
    quarantine(key: SemanticCacheKey, reason: string, nowEpochMs: number): Promise<void>;
    invalidateByProducer(value: CompiledArtifactIdentity, _reason: string): Promise<number>;
    invalidateByDependency(value: CompiledArtifactIdentity, _reason: string): Promise<number>;
    invalidateNamespace(namespace: string, _reason: string): Promise<number>;
    evict(nowEpochMs: number): Promise<SemanticCacheEvictionReport>;
    getQuarantineRecords(): readonly SemanticCacheQuarantineRecord[];
    get size(): number;
    private add;
    private removeIndex;
    private remove;
    private invalidate;
    private isExpired;
    private evictExpired;
    private candidates;
    private evictCapacityForIncoming;
    private evictCapacity;
    private removeOldest;
}
//# sourceMappingURL=exact-semantic-cache.d.ts.map