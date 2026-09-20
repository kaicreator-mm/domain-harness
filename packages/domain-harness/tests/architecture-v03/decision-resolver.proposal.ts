import { createHash } from 'node:crypto';

/**
 * Architecture-only executable production contract proposal for DomainHarness v0.3 Issue #203.
 * node:crypto is used only by this evidence fixture. Production Runtime Core must use a
 * portable/injected digest implementation with Node/Expo parity and MUST NOT acquire a
 * mandatory Node built-in dependency.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type Sha256Digest = string;

export type CompiledIntelligenceArtifactKind =
  | 'rule'
  | 'knowledge'
  | 'skill'
  | 'tool'
  | 'output-schema'
  | 'workflow'
  | 'promoted-subworkflow'
  | 'harness-config';

/** Exact shape consumed from #205. Human version is lifecycle metadata, not semantic identity. */
export interface CompiledArtifactIdentity {
  readonly kind: CompiledIntelligenceArtifactKind;
  readonly artifactId: string;
  readonly version?: string;
  readonly contentDigest: Sha256Digest;
}

/** Exact shape consumed from #205. */
export interface ResolvedSemanticContextProjection {
  readonly projectionId: string;
  readonly descriptorDigest: Sha256Digest;
  readonly valueDigest: Sha256Digest;
}

export interface SemanticDependencySet {
  /** Only artifacts that can change this decision belong here. */
  readonly artifacts: readonly CompiledArtifactIdentity[];
  readonly context: readonly ResolvedSemanticContextProjection[];
}

export interface ExecutionAuditIdentity {
  /** Existing v0.2 exact target-package pin. Never part of exact semantic equivalence by default. */
  readonly packageId: string;
  readonly workflowInstanceId?: string;
  readonly sourceMessageId?: string;
  readonly effectId?: string;
}

export type CacheBypassReason =
  | 'non-cacheable'
  | 'time-sensitive'
  | 'live-dependency-without-semantic-revision'
  | 'missing-semantic-input'
  | 'explicit-domain-policy';

export type CacheEligibility =
  | { readonly mode: 'eligible' }
  | { readonly mode: 'bypass'; readonly reason: CacheBypassReason };

export interface SemanticInvocationIdentityMaterial {
  readonly namespace: string;
  readonly domainId: string;
  readonly decisionId: string;
  readonly inputDigest: Sha256Digest;
  readonly dependencies: SemanticDependencySet;
}

export interface SemanticCacheKey {
  readonly namespace: string;
  readonly identityVersion: 'domain-harness.semantic-invocation/v1';
  readonly semanticDigest: Sha256Digest;
}

export interface SemanticIdentity {
  readonly material: SemanticInvocationIdentityMaterial;
  readonly key: SemanticCacheKey;
}

export interface ResolvedSemanticInvocation<TInput extends JsonValue = JsonValue> {
  readonly domainId: string;
  readonly decisionId: string;
  readonly namespace: string;
  readonly input: TInput;
  readonly inputDigest: Sha256Digest;
  readonly dependencies: SemanticDependencySet;
  /** Retained for audit/recovery only; never silently folded into the semantic key. */
  readonly execution: ExecutionAuditIdentity;
  readonly cache: CacheEligibility;
  /** Present only when the invocation is safe for exact semantic reuse. */
  readonly semanticIdentity?: SemanticIdentity;
}

export interface ResolveSemanticInvocationArgs<TInput extends JsonValue> {
  readonly namespace: string;
  readonly domainId: string;
  readonly decisionId: string;
  readonly input: TInput;
  readonly dependencies: SemanticDependencySet;
  readonly execution: ExecutionAuditIdentity;
  readonly cache: CacheEligibility;
}

export type ResolverSource = 'rule' | 'semantic-cache' | 'promoted-subworkflow' | 'harness';

export type CacheDisposition =
  | 'not-checked'
  | 'hit'
  | 'miss'
  | 'bypass'
  | 'invalid-entry'
  | 'store-error';

export interface DecisionComputation<TDecision extends JsonValue> {
  readonly decision: TDecision;
  /** Actual fresh ModelPort/AI Runtime calls made while computing this decision. */
  readonly freshModelCalls: number;
}

export interface ResolvedDecision<TDecision extends JsonValue> {
  readonly source: ResolverSource;
  readonly decision: TDecision;
  readonly cacheDisposition: CacheDisposition;
  readonly freshModelCalls: number;
}

export interface DeterministicRuleResolver<TInput extends JsonValue, TDecision extends JsonValue> {
  /** null means no deterministic rule resolves this invocation. Errors fail closed. */
  resolve(invocation: ResolvedSemanticInvocation<TInput>): Promise<TDecision | null>;
}

export interface PromotedSubworkflowResolver<TInput extends JsonValue, TDecision extends JsonValue> {
  /** null means no compatible/applicable promoted artifact. Contract/integrity errors fail closed. */
  resolve(invocation: ResolvedSemanticInvocation<TInput>): Promise<DecisionComputation<TDecision> | null>;
}

export interface HarnessDecisionResolver<TInput extends JsonValue, TDecision extends JsonValue> {
  /** Provider/model routing stays behind this boundary in AI Runtime / ModelPort. */
  resolve(invocation: ResolvedSemanticInvocation<TInput>): Promise<DecisionComputation<TDecision>>;
}

export interface CurrentDecisionSchema<TDecision extends JsonValue> {
  /** Must validate against the current invocation/package contract on every source, including cache hits. */
  isValid(value: JsonValue): value is TDecision;
}

export interface SemanticCacheEntry<TDecision extends JsonValue> {
  readonly formatVersion: 1;
  readonly key: SemanticCacheKey;
  readonly result: TDecision;
  readonly resultDigest: Sha256Digest;
  readonly createdAtEpochMs: number;
  /** Operational retention only. It MUST NOT compensate for missing semantic freshness identity. */
  readonly expiresAtEpochMs?: number;
  readonly producer: 'promoted-subworkflow' | 'harness';
}

export type SemanticCacheRead<TDecision extends JsonValue> =
  | { readonly status: 'hit'; readonly entry: SemanticCacheEntry<TDecision> }
  | { readonly status: 'miss' };

export type SemanticCachePut<TDecision extends JsonValue> =
  | { readonly status: 'inserted'; readonly entry: SemanticCacheEntry<TDecision> }
  | { readonly status: 'existing'; readonly entry: SemanticCacheEntry<TDecision> };

/**
 * Production persistent store boundary.
 * - read is a single-entry snapshot read;
 * - putIfAbsent is atomic under the composite key and first-writer-wins;
 * - no DB transaction spans rule/subworkflow/model/tool execution;
 * - no transaction is shared with execution journal/effect commits.
 */
export interface ExactSemanticResultCacheStore<TDecision extends JsonValue> {
  read(key: SemanticCacheKey, nowEpochMs: number): Promise<SemanticCacheRead<TDecision>>;
  putIfAbsent(entry: SemanticCacheEntry<TDecision>): Promise<SemanticCachePut<TDecision>>;
  /** Optional best-effort quarantine. Failure must not grant the entry authority. */
  quarantine?(key: SemanticCacheKey, reason: string): Promise<void>;
}

export interface DecisionResolutionObservation {
  readonly source: ResolverSource;
  readonly cacheDisposition: CacheDisposition;
  readonly freshModelCalls: number;
  /** True only when this domain decision needed zero fresh model calls. */
  readonly llmAvoided: boolean;
}

export interface DecisionResolverTelemetrySink {
  recordDecision(observation: DecisionResolutionObservation): void;
  recordCacheWrite(outcome: 'inserted' | 'existing' | 'store-error'): void;
}

export interface DecisionResolverDependencies<TInput extends JsonValue, TDecision extends JsonValue> {
  readonly rule: DeterministicRuleResolver<TInput, TDecision>;
  readonly cacheStore: ExactSemanticResultCacheStore<TDecision>;
  readonly subworkflow: PromotedSubworkflowResolver<TInput, TDecision>;
  readonly harness: HarnessDecisionResolver<TInput, TDecision>;
  readonly schema: CurrentDecisionSchema<TDecision>;
  readonly telemetry: DecisionResolverTelemetrySink;
  readonly nowEpochMs: () => number;
}

export class DecisionResolutionContractError extends Error {
  readonly code: 'invalid-source-result' | 'unresolved' | 'invalid-fresh-model-count';

  constructor(code: 'invalid-source-result' | 'unresolved' | 'invalid-fresh-model-count', message: string) {
    super(message);
    this.name = 'DecisionResolutionContractError';
    this.code = code;
  }
}

function normalize(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number is not canonical JSON');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) throw new Error(`undefined at ${key} is not canonical JSON`);
      output[key] = normalize(child);
    }
    return output;
  }
  throw new Error(`unsupported canonical JSON type: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Canonical(value: unknown): Sha256Digest {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function sortedArtifactIdentityMaterial(artifacts: readonly CompiledArtifactIdentity[]): JsonValue[] {
  return artifacts
    .map(({ kind, artifactId, contentDigest }) => ({ kind, artifactId, contentDigest }))
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

export function semanticInvocationDigest(material: SemanticInvocationIdentityMaterial): Sha256Digest {
  return sha256Canonical({
    namespace: material.namespace,
    domainId: material.domainId,
    decisionId: material.decisionId,
    inputDigest: material.inputDigest,
    artifacts: sortedArtifactIdentityMaterial(material.dependencies.artifacts),
    context: [...material.dependencies.context]
      .map(({ projectionId, descriptorDigest, valueDigest }) => ({ projectionId, descriptorDigest, valueDigest }))
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
  });
}

export function resolveSemanticInvocation<TInput extends JsonValue>(
  args: ResolveSemanticInvocationArgs<TInput>,
): ResolvedSemanticInvocation<TInput> {
  const inputDigest = sha256Canonical(args.input);
  const base = {
    domainId: args.domainId,
    decisionId: args.decisionId,
    namespace: args.namespace,
    input: args.input,
    inputDigest,
    dependencies: args.dependencies,
    execution: args.execution,
    cache: args.cache,
  } as const;

  if (args.cache.mode === 'bypass') return base;

  const material: SemanticInvocationIdentityMaterial = {
    namespace: args.namespace,
    domainId: args.domainId,
    decisionId: args.decisionId,
    inputDigest,
    dependencies: args.dependencies,
  };
  const semanticDigest = semanticInvocationDigest(material);
  return {
    ...base,
    semanticIdentity: {
      material,
      key: {
        namespace: args.namespace,
        identityVersion: 'domain-harness.semantic-invocation/v1',
        semanticDigest,
      },
    },
  };
}

function assertFreshModelCalls(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new DecisionResolutionContractError('invalid-fresh-model-count', 'freshModelCalls must be a non-negative integer');
  }
}

function validateSourceResult<TDecision extends JsonValue>(
  source: Exclude<ResolverSource, 'semantic-cache'>,
  result: JsonValue,
  schema: CurrentDecisionSchema<TDecision>,
): asserts result is TDecision {
  if (!schema.isValid(result)) {
    throw new DecisionResolutionContractError('invalid-source-result', `${source} returned a result outside the current output schema`);
  }
}

export class DecisionResolver<TInput extends JsonValue, TDecision extends JsonValue> {
  private readonly deps: DecisionResolverDependencies<TInput, TDecision>;

  constructor(deps: DecisionResolverDependencies<TInput, TDecision>) {
    this.deps = deps;
  }

  async resolve(invocation: ResolvedSemanticInvocation<TInput>): Promise<ResolvedDecision<TDecision>> {
    const ruleResult = await this.deps.rule.resolve(invocation);
    if (ruleResult !== null) {
      validateSourceResult('rule', ruleResult, this.deps.schema);
      return this.finish('rule', ruleResult, 'not-checked', 0);
    }

    let cacheDisposition: CacheDisposition;
    if (invocation.cache.mode === 'bypass') {
      cacheDisposition = 'bypass';
    } else {
      const key = invocation.semanticIdentity?.key;
      if (key === undefined) {
        throw new DecisionResolutionContractError('unresolved', 'cacheable invocation is missing semantic identity');
      }
      try {
        const read = await this.deps.cacheStore.read(key, this.deps.nowEpochMs());
        if (read.status === 'hit') {
          const integrityValid = sha256Canonical(read.entry.result) === read.entry.resultDigest;
          if (integrityValid && this.deps.schema.isValid(read.entry.result)) {
            return this.finish('semantic-cache', read.entry.result, 'hit', 0);
          }
          cacheDisposition = 'invalid-entry';
          try {
            await this.deps.cacheStore.quarantine?.(key, 'current-schema-revalidation-failed');
          } catch {
            // Best-effort only. The invalid entry is never returned as authoritative.
          }
        } else {
          cacheDisposition = 'miss';
        }
      } catch {
        cacheDisposition = 'store-error';
      }
    }

    const subworkflowResult = await this.deps.subworkflow.resolve(invocation);
    if (subworkflowResult !== null) {
      assertFreshModelCalls(subworkflowResult.freshModelCalls);
      validateSourceResult('promoted-subworkflow', subworkflowResult.decision, this.deps.schema);
      await this.bestEffortCacheWrite(invocation, subworkflowResult.decision, 'promoted-subworkflow');
      return this.finish(
        'promoted-subworkflow',
        subworkflowResult.decision,
        cacheDisposition,
        subworkflowResult.freshModelCalls,
      );
    }

    const harnessResult = await this.deps.harness.resolve(invocation);
    assertFreshModelCalls(harnessResult.freshModelCalls);
    validateSourceResult('harness', harnessResult.decision, this.deps.schema);
    await this.bestEffortCacheWrite(invocation, harnessResult.decision, 'harness');
    return this.finish('harness', harnessResult.decision, cacheDisposition, harnessResult.freshModelCalls);
  }

  private finish(
    source: ResolverSource,
    decision: TDecision,
    cacheDisposition: CacheDisposition,
    freshModelCalls: number,
  ): ResolvedDecision<TDecision> {
    const observation: DecisionResolutionObservation = {
      source,
      cacheDisposition,
      freshModelCalls,
      llmAvoided: freshModelCalls === 0,
    };
    this.deps.telemetry.recordDecision(observation);
    return { source, decision, cacheDisposition, freshModelCalls };
  }

  private async bestEffortCacheWrite(
    invocation: ResolvedSemanticInvocation<TInput>,
    decision: TDecision,
    producer: 'promoted-subworkflow' | 'harness',
  ): Promise<void> {
    if (invocation.cache.mode !== 'eligible') return;
    const key = invocation.semanticIdentity?.key;
    if (key === undefined) return;
    const entry: SemanticCacheEntry<TDecision> = {
      formatVersion: 1,
      key,
      result: decision,
      resultDigest: sha256Canonical(decision),
      createdAtEpochMs: this.deps.nowEpochMs(),
      producer,
    };
    try {
      const write = await this.deps.cacheStore.putIfAbsent(entry);
      this.deps.telemetry.recordCacheWrite(write.status);
    } catch {
      this.deps.telemetry.recordCacheWrite('store-error');
    }
  }
}

/** Reference test-double only; production must provide a persistent host adapter. */
export class MemoryExactSemanticResultCacheStore<TDecision extends JsonValue>
  implements ExactSemanticResultCacheStore<TDecision>
{
  private readonly entries = new Map<string, SemanticCacheEntry<TDecision>>();

  async read(key: SemanticCacheKey, nowEpochMs: number): Promise<SemanticCacheRead<TDecision>> {
    const entry = this.entries.get(cacheKeyString(key));
    if (entry === undefined) return { status: 'miss' };
    if (entry.expiresAtEpochMs !== undefined && entry.expiresAtEpochMs <= nowEpochMs) {
      this.entries.delete(cacheKeyString(key));
      return { status: 'miss' };
    }
    return { status: 'hit', entry };
  }

  async putIfAbsent(entry: SemanticCacheEntry<TDecision>): Promise<SemanticCachePut<TDecision>> {
    const key = cacheKeyString(entry.key);
    const existing = this.entries.get(key);
    if (existing !== undefined) return { status: 'existing', entry: existing };
    this.entries.set(key, entry);
    return { status: 'inserted', entry };
  }

  async quarantine(key: SemanticCacheKey): Promise<void> {
    this.entries.delete(cacheKeyString(key));
  }

  seed(entry: SemanticCacheEntry<TDecision>): void {
    this.entries.set(cacheKeyString(entry.key), entry);
  }
}

export function cacheKeyString(key: SemanticCacheKey): string {
  return `${key.identityVersion}:${key.namespace}:${key.semanticDigest}`;
}

export interface LlmAvoidanceSnapshot {
  readonly domainDecisions: number;
  readonly freshModelCalls: number;
  readonly decisionsWithFreshModelCall: number;
  readonly decisionsWithoutFreshModelCall: number;
  readonly llmAvoidanceRate: number;
}

export class CountingDecisionResolverTelemetry implements DecisionResolverTelemetrySink {
  readonly decisions: DecisionResolutionObservation[] = [];
  readonly cacheWrites: Array<'inserted' | 'existing' | 'store-error'> = [];

  recordDecision(observation: DecisionResolutionObservation): void {
    this.decisions.push(observation);
  }

  recordCacheWrite(outcome: 'inserted' | 'existing' | 'store-error'): void {
    this.cacheWrites.push(outcome);
  }

  snapshot(): LlmAvoidanceSnapshot {
    const domainDecisions = this.decisions.length;
    const freshModelCalls = this.decisions.reduce((sum, item) => sum + item.freshModelCalls, 0);
    const decisionsWithFreshModelCall = this.decisions.filter((item) => !item.llmAvoided).length;
    const decisionsWithoutFreshModelCall = domainDecisions - decisionsWithFreshModelCall;
    return {
      domainDecisions,
      freshModelCalls,
      decisionsWithFreshModelCall,
      decisionsWithoutFreshModelCall,
      llmAvoidanceRate: domainDecisions === 0 ? 0 : decisionsWithoutFreshModelCall / domainDecisions,
    };
  }
}
