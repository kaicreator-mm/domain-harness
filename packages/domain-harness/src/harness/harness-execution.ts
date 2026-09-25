import type {
  BehaviorallyRelevantSemanticDependencies,
  CompiledArtifactIdentity,
  ResolvedSemanticContextProjection,
  SemanticRevisionIdentity,
} from '../contracts/domain-data.js';
import { canonicalizeJson, isContentDigest } from '../contracts/identity.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import {
  validateObservedDependencySet,
  type ObservedDependencySet as SemanticObservedDependencySet,
  type SemanticCacheWriteIneligibleReason,
} from '../semantic-cache/exact-semantic-cache.js';
import type {
  BusinessHarnessInput,
  BusinessHarnessModelRequest,
  BusinessHarnessModelResponse,
  BusinessHarnessResult,
  HarnessCapabilityBinding,
  HarnessQueryDependency,
  ObservedDependencySet as HarnessProvenanceDependencySet,
} from './contract.js';
import {
  createHarnessExecutionOperationIdentity,
  executeJournaledHarnessOperation,
  type HarnessExecutionIdentityContext,
  type HarnessExecutionJournalStore,
  type HarnessJournalFailureCode,
  type HarnessJournalOutcome,
  type HarnessOperationEvidence,
} from './execution-journal.js';

export type HarnessExecutionIntegrationErrorCode =
  | 'INVALID_CAPABILITY_SEMANTIC_IDENTITY'
  | 'INVALID_HARNESS_PRODUCER_IDENTITY'
  | 'INVALID_SELECTED_DEPENDENCY_PROVENANCE';

export class HarnessExecutionIntegrationError extends Error {
  readonly code: HarnessExecutionIntegrationErrorCode;

  constructor(code: HarnessExecutionIntegrationErrorCode, message: string) {
    super(message);
    this.name = 'HarnessExecutionIntegrationError';
    this.code = code;
  }
}

export interface HarnessJournalIntegrationContext extends HarnessExecutionIdentityContext {
  readonly journal: HarnessExecutionJournalStore;
}

export interface HarnessExecutionIntegrationOptions {
  readonly input: BusinessHarnessInput;
  readonly execution: HarnessJournalIntegrationContext;
  /** Exact producer identity required by the T-013 Harness cache-write contract. */
  readonly harnessProducerIdentity: CompiledArtifactIdentity;
  /** Selected Fact/CDI semantic identities actually supplied to this Harness invocation. */
  readonly selectedSemanticDependencies?: BehaviorallyRelevantSemanticDependencies;
  /** T-013 pre-read semantic material. It is eligibility input only, never observed provenance. */
  readonly cachePreReadDependencies?: BehaviorallyRelevantSemanticDependencies;
  /** Exact semantic identity for a model-visible query/tool capability, keyed by capabilityId. */
  readonly capabilitySemanticIdentities?: Readonly<Record<string, CompiledArtifactIdentity>>;
}

export type HarnessObservedCacheWriteEligibility =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason: SemanticCacheWriteIneligibleReason | 'harness-not-successful';
      readonly identity?: string;
    };

export interface HarnessIntegratedObservedDependencySet {
  /** T-007 Fact/CDI/query provenance. Query entries come only from executed or journal-replayed queries. */
  readonly provenance: HarnessProvenanceDependencySet;
  /** Exact T-002/T-013 semantic dependency vocabulary for cache-write handoff. */
  readonly semantic: SemanticObservedDependencySet;
  /** Convenience exact subset of actually used model-visible tool/capability artifacts. */
  readonly toolArtifacts: readonly CompiledArtifactIdentity[];
}

export interface HarnessSemanticCacheWriteHandoff {
  /** Exact `harness-config` producer; T-013 still performs final producer/pre-read checks. */
  readonly producerIdentity: CompiledArtifactIdentity;
  readonly observedDependencies: SemanticObservedDependencySet;
  readonly dependencyEligibility: HarnessObservedCacheWriteEligibility;
}

export interface HarnessJournalFailureEvidence {
  readonly code: HarnessJournalFailureCode;
  readonly message: string;
  readonly operationKind: 'ai' | 'query';
  readonly operationOrdinal: number;
}

export interface JournaledHarnessExecutionResult {
  readonly harnessResult: BusinessHarnessResult;
  readonly observedDependencies: HarnessIntegratedObservedDependencySet;
  /** Dependency-only T-013 handoff. T-013 producer checks still run before any actual cache write. */
  readonly cacheWriteEligibility: HarnessObservedCacheWriteEligibility;
  /** Exact producer + observed dependency material for T-013 final cache-write preparation. */
  readonly cacheWriteHandoff: HarnessSemanticCacheWriteHandoff;
  readonly journalEvidence: readonly HarnessOperationEvidence[];
  readonly journalFailure?: HarnessJournalFailureEvidence;
}

export interface JournaledHarnessExecutionIntegration {
  /** Pass this exact input to the existing bounded HarnessMachine child. */
  readonly input: BusinessHarnessInput;
  /** Call exactly once after HarnessMachine reaches a terminal output. */
  complete(result: BusinessHarnessResult): JournaledHarnessExecutionResult;
}

interface SemanticAccumulator {
  artifacts: CompiledArtifactIdentity[];
  projections: ResolvedSemanticContextProjection[];
  revisions: SemanticRevisionIdentity[];
  unversionedLiveSourceIds: string[];
}

type CapturedCall =
  | { readonly kind: 'returned'; readonly value: JsonValue }
  | { readonly kind: 'threw'; readonly message: string }
  | { readonly kind: 'invalid-output'; readonly message: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function captureReturned(value: unknown): CapturedCall {
  try {
    return { kind: 'returned', value: canonicalizeJson(value) };
  } catch (error) {
    return { kind: 'invalid-output', message: errorMessage(error) };
  }
}

async function captureCall(
  signal: AbortSignal,
  invoke: () => Promise<unknown>,
): Promise<HarnessJournalOutcome> {
  try {
    const value = await invoke();
    if (signal.aborted) throw new Error('operation cancelled after external completion before journal commit');
    return { status: 'succeeded', value: captureReturned(value) as unknown as JsonValue };
  } catch (error) {
    if (signal.aborted) throw error;
    return {
      status: 'succeeded',
      value: { kind: 'threw', message: errorMessage(error) },
    };
  }
}

function decodeCaptured(outcome: HarnessJournalOutcome): CapturedCall {
  if (outcome.status === 'failed') {
    return { kind: 'invalid-output', message: `${outcome.code}: ${outcome.message}` };
  }
  const record = asRecord(outcome.value);
  if (record === null || typeof record.kind !== 'string') {
    return { kind: 'invalid-output', message: 'committed operation outcome is not a captured call' };
  }
  if (record.kind === 'returned' && Object.prototype.hasOwnProperty.call(record, 'value')) {
    return { kind: 'returned', value: canonicalizeJson(record.value) };
  }
  if (
    (record.kind === 'threw' || record.kind === 'invalid-output')
    && typeof record.message === 'string'
  ) {
    return { kind: record.kind, message: record.message };
  }
  return { kind: 'invalid-output', message: 'committed operation outcome has an invalid capture envelope' };
}

function artifactKey(value: CompiledArtifactIdentity): string {
  return `${value.kind}\u0000${value.artifactId}\u0000${value.contentDigest}`;
}

function projectionKey(value: ResolvedSemanticContextProjection): string {
  return `${value.source}\u0000${value.projectionId}\u0000${value.descriptorDigest}\u0000${value.valueDigest}`;
}

function revisionKey(value: SemanticRevisionIdentity): string {
  return `${value.sourceId}\u0000${value.revision}`;
}

function exactArtifact(value: CompiledArtifactIdentity): CompiledArtifactIdentity {
  return { kind: value.kind, artifactId: value.artifactId, contentDigest: value.contentDigest };
}

function dedupeBy<T>(values: readonly T[], keyOf: (value: T) => string): T[] {
  const map = new Map<string, T>();
  for (const value of values) map.set(keyOf(value), value);
  return [...map.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, value]) => value);
}

function normalizeSemanticDependencies(
  value: BehaviorallyRelevantSemanticDependencies = {},
): SemanticAccumulator {
  return {
    artifacts: dedupeBy((value.artifacts ?? []).map(exactArtifact), artifactKey),
    projections: dedupeBy(
      (value.projections ?? []).map((projection) => ({
        source: projection.source,
        projectionId: projection.projectionId,
        descriptorDigest: projection.descriptorDigest,
        valueDigest: projection.valueDigest,
      })),
      projectionKey,
    ),
    revisions: dedupeBy(
      (value.revisions ?? []).map((revision) => ({
        sourceId: revision.sourceId,
        revision: revision.revision,
      })),
      revisionKey,
    ),
    unversionedLiveSourceIds: [],
  };
}

function validateSelectedProvenance(input: BusinessHarnessInput): void {
  for (const dependency of input.selectedDependencies ?? []) {
    const value = dependency as { readonly kind?: unknown; readonly identity?: unknown };
    if (
      (value.kind !== 'domain-fact' && value.kind !== 'compiled-intelligence')
      || typeof value.identity !== 'string'
      || value.identity.trim().length === 0
    ) {
      throw new HarnessExecutionIntegrationError(
        'INVALID_SELECTED_DEPENDENCY_PROVENANCE',
        'selectedDependencies may contain only runtime-validated domain-fact/compiled-intelligence provenance',
      );
    }
  }
}

function validateHarnessProducerIdentity(identity: CompiledArtifactIdentity): void {
  if (
    identity.kind !== 'harness-config'
    || identity.artifactId.trim().length === 0
    || !isContentDigest(identity.contentDigest)
  ) {
    throw new HarnessExecutionIntegrationError(
      'INVALID_HARNESS_PRODUCER_IDENTITY',
      'Harness execution must bind an exact harness-config producer identity',
    );
  }
}

function validateToolIdentity(
  capabilityId: string,
  identity: CompiledArtifactIdentity | undefined,
): void {
  if (identity === undefined) return;
  if (
    identity.kind !== 'tool'
    || identity.artifactId.trim().length === 0
    || !isContentDigest(identity.contentDigest)
  ) {
    throw new HarnessExecutionIntegrationError(
      'INVALID_CAPABILITY_SEMANTIC_IDENTITY',
      `capability ${capabilityId} must bind an exact tool artifact identity`,
    );
  }
}

function parseQueryDependency(value: unknown): HarnessQueryDependency | null | 'invalid' {
  const output = asRecord(value);
  if (output === null || !Object.prototype.hasOwnProperty.call(output, 'value')) return 'invalid';
  if (!Object.prototype.hasOwnProperty.call(output, 'dependency')) return null;
  const dependency = asRecord(output.dependency);
  if (dependency === null) return 'invalid';
  const keys = Object.keys(dependency);
  if (!keys.every((key) => key === 'kind' || key === 'identity' || key === 'revision')) return 'invalid';
  if (
    dependency.kind !== 'query'
    || typeof dependency.identity !== 'string'
    || dependency.identity.trim().length === 0
  ) return 'invalid';
  if (
    dependency.revision !== undefined
    && (typeof dependency.revision !== 'string' || dependency.revision.trim().length === 0)
  ) return 'invalid';
  return {
    kind: 'query',
    identity: dependency.identity,
    ...(dependency.revision === undefined ? {} : { revision: dependency.revision }),
  };
}

function invalidQueryResult(message: string): JsonObject {
  // Intentionally omits the required `value` key so the existing HarnessMachine
  // fails closed through its QUERY_OUTPUT_INVALID contract.
  return { journalIntegrationError: message };
}

function cloneInputWithWrappers(
  options: HarnessExecutionIntegrationOptions,
  evidence: HarnessOperationEvidence[],
  semantic: SemanticAccumulator,
  tools: CompiledArtifactIdentity[],
  setJournalFailure: (value: HarnessJournalFailureEvidence) => void,
): BusinessHarnessInput {
  let aiOrdinal = 0;
  let queryOrdinal = 0;

  const wrappedModel = {
    async generate(
      request: BusinessHarnessModelRequest,
      signal: AbortSignal,
    ): Promise<BusinessHarnessModelResponse> {
      aiOrdinal += 1;
      const identity = await createHarnessExecutionOperationIdentity(
        options.execution,
        'ai',
        aiOrdinal,
        canonicalizeJson({ request }),
      );
      const result = await executeJournaledHarnessOperation(
        options.execution.journal,
        identity,
        signal,
        async () => captureCall(signal, () => options.input.model.generate(request, signal)),
      );
      if (result.status === 'cancelled') throw new Error('journaled model operation cancelled');
      if (result.status === 'journal-failure') {
        setJournalFailure({
          code: result.code,
          message: result.message,
          operationKind: 'ai',
          operationOrdinal: aiOrdinal,
        });
        throw new Error(`Harness execution journal ${result.code}: ${result.message}`);
      }
      evidence.push(result.evidence);
      const captured = decodeCaptured(result.evidence.outcome);
      if (captured.kind === 'threw') throw new Error(captured.message);
      if (captured.kind === 'invalid-output') {
        throw new Error(`model output is not journal-safe canonical JSON: ${captured.message}`);
      }
      return captured.value as unknown as BusinessHarnessModelResponse;
    },
  };

  const wrappedCapabilities = options.input.capabilities.map((capability): HarnessCapabilityBinding => {
    if (capability.kind !== 'query') return capability;
    const toolIdentity = options.capabilitySemanticIdentities?.[capability.capabilityId];
    validateToolIdentity(capability.capabilityId, toolIdentity);
    return {
      ...capability,
      async execute(value: JsonValue, signal: AbortSignal): Promise<unknown> {
        queryOrdinal += 1;
        const identity = await createHarnessExecutionOperationIdentity(
          options.execution,
          'query',
          queryOrdinal,
          canonicalizeJson({
            capabilityId: capability.capabilityId,
            description: capability.description,
            inputSchema: capability.inputSchema ?? null,
            input: value,
            toolIdentity: toolIdentity === undefined ? null : exactArtifact(toolIdentity),
          }),
        );
        const result = await executeJournaledHarnessOperation(
          options.execution.journal,
          identity,
          signal,
          async () => captureCall(signal, () => capability.execute(value, signal)),
        );
        if (result.status === 'cancelled') throw new Error('journaled query operation cancelled');
        if (result.status === 'journal-failure') {
          setJournalFailure({
            code: result.code,
            message: result.message,
            operationKind: 'query',
            operationOrdinal: queryOrdinal,
          });
          return invalidQueryResult(`Harness execution journal ${result.code}`);
        }

        evidence.push(result.evidence);
        if (toolIdentity !== undefined) {
          const exact = exactArtifact(toolIdentity);
          tools.push(exact);
          semantic.artifacts = dedupeBy([...semantic.artifacts, exact], artifactKey);
        } else {
          semantic.unversionedLiveSourceIds = dedupeBy(
            [...semantic.unversionedLiveSourceIds, `tool:${capability.capabilityId}`],
            (item) => item,
          );
        }

        const captured = decodeCaptured(result.evidence.outcome);
        if (captured.kind === 'threw') {
          semantic.unversionedLiveSourceIds = dedupeBy(
            [...semantic.unversionedLiveSourceIds, `query:${capability.capabilityId}`],
            (item) => item,
          );
          throw new Error(captured.message);
        }
        if (captured.kind === 'invalid-output') {
          return invalidQueryResult(`query output is not journal-safe canonical JSON: ${captured.message}`);
        }

        const dependency = parseQueryDependency(captured.value);
        if (dependency === 'invalid') {
          return invalidQueryResult('query dependency provenance must be an actual kind=query observation');
        }
        if (dependency === null) {
          semantic.unversionedLiveSourceIds = dedupeBy(
            [...semantic.unversionedLiveSourceIds, `query:${capability.capabilityId}`],
            (item) => item,
          );
        } else if (dependency.revision === undefined) {
          semantic.unversionedLiveSourceIds = dedupeBy(
            [...semantic.unversionedLiveSourceIds, dependency.identity],
            (item) => item,
          );
        } else {
          semantic.revisions = dedupeBy(
            [
              ...semantic.revisions,
              { sourceId: dependency.identity, revision: dependency.revision },
            ],
            revisionKey,
          );
        }
        return captured.value;
      },
    };
  });

  return {
    ...options.input,
    model: wrappedModel,
    capabilities: wrappedCapabilities,
  };
}

/**
 * Integrate durable AI/query execution facts around one existing HarnessMachine
 * invocation without creating a second workflow/runtime authority.
 */
export function createJournaledHarnessExecutionIntegration(
  options: HarnessExecutionIntegrationOptions,
): JournaledHarnessExecutionIntegration {
  validateSelectedProvenance(options.input);
  validateHarnessProducerIdentity(options.harnessProducerIdentity);
  const evidence: HarnessOperationEvidence[] = [];
  const producerIdentity = exactArtifact(options.harnessProducerIdentity);
  const semantic = normalizeSemanticDependencies(options.selectedSemanticDependencies);
  semantic.artifacts = dedupeBy([...semantic.artifacts, producerIdentity], artifactKey);
  const tools: CompiledArtifactIdentity[] = [];
  let journalFailure: HarnessJournalFailureEvidence | undefined;
  let completed = false;
  const input = cloneInputWithWrappers(
    options,
    evidence,
    semantic,
    tools,
    (value) => {
      journalFailure ??= value;
    },
  );

  return {
    input,
    complete(result: BusinessHarnessResult): JournaledHarnessExecutionResult {
      if (completed) throw new Error('journaled Harness execution may be completed only once');
      completed = true;
      const semanticObserved: SemanticObservedDependencySet = {
        artifacts: dedupeBy(semantic.artifacts, artifactKey),
        projections: dedupeBy(semantic.projections, projectionKey),
        revisions: dedupeBy(semantic.revisions, revisionKey),
        unversionedLiveSourceIds: dedupeBy(
          semantic.unversionedLiveSourceIds,
          (item) => item,
        ),
      };
      let cacheWriteEligibility: HarnessObservedCacheWriteEligibility;
      if (result.status !== 'ok') {
        cacheWriteEligibility = { eligible: false, reason: 'harness-not-successful' };
      } else if (options.cachePreReadDependencies === undefined) {
        cacheWriteEligibility = { eligible: false, reason: 'pre-read-ineligible' };
      } else {
        const validation = validateObservedDependencySet(
          options.cachePreReadDependencies,
          semanticObserved,
        );
        cacheWriteEligibility = validation.eligible
          ? { eligible: true }
          : { eligible: false, reason: validation.reason, identity: validation.identity };
      }

      const observedDependencies: HarnessIntegratedObservedDependencySet = {
        provenance: result.observedDependencies,
        semantic: semanticObserved,
        toolArtifacts: dedupeBy(tools, artifactKey),
      };
      return {
        harnessResult: result,
        observedDependencies,
        cacheWriteEligibility,
        cacheWriteHandoff: {
          producerIdentity,
          observedDependencies: semanticObserved,
          dependencyEligibility: cacheWriteEligibility,
        },
        journalEvidence: [...evidence],
        ...(journalFailure === undefined ? {} : { journalFailure }),
      };
    },
  };
}
