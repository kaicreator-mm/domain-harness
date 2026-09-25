import type {
  BehaviorallyRelevantSemanticDependencies,
  CompiledArtifactIdentity,
} from '../contracts/domain-data.js';
import type { Sha256Port } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import { createJournaledHarnessExecutionIntegration } from '../harness/harness-execution.js';
import {
  PromotedArtifactContractError,
  type PromotedArtifactRevocationRecord,
} from '../promoted-artifact/contracts.js';
import {
  DynamicChildExecutionError,
  FALLTHROUGH_ELIGIBLE_CODES,
  type PromotedChildInvokingContext,
  type PromotedChildSelector,
  type ResolvedPromotedChild,
} from '../promoted-child/index.js';
import { resolvePromotedChildOnce } from '../promoted-child/selection.js';
import {
  prepareExactSemanticInvocation,
  prepareSemanticCacheWrite,
  readExactSemanticCache,
  type ExactSemanticCacheStore,
  type ObservedDependencySet,
  type PreparedSemanticInvocation,
} from '../semantic-cache/exact-semantic-cache.js';
import {
  DecisionResolverError,
  type DecisionResolverCacheTelemetry,
  type DecisionResolverInvocation,
  type DecisionResolverPorts,
  type DecisionResolverSource,
  type DecisionResolverTelemetryEvent,
  type ResolvedDecision,
} from './contracts.js';

/**
 * Production DecisionResolver (frozen L2 §9, ADR-03):
 * Rule → Exact Semantic Cache → Promoted Subworkflow → HarnessMachine.
 *
 * The implementation is a single straight-line pass: one deterministic
 * semantic pre-read phase (S5), then each source in frozen order, returning at
 * the first admitted result. There is no retry loop, so a later source can
 * never be retried after a guard rejection (S7) — guard authority belongs to
 * the parent Domain Machine and this resolver only returns structured data.
 */

type PromotedPreRead =
  | { readonly status: 'resolved'; readonly resolved: ResolvedPromotedChild }
  | { readonly status: 'not-found' }
  | { readonly status: 'revoked'; readonly record: PromotedArtifactRevocationRecord };

function isRegistryError(error: unknown, code: string): boolean {
  return error instanceof PromotedArtifactContractError && error.code === code;
}

function selectorDescription(selector: PromotedChildSelector): string {
  switch (selector.kind) {
    case 'exact-digest':
      return `exact-digest:${selector.artifact.artifactId}@${selector.artifact.contentDigest}`;
    case 'version':
      return `version:${selector.artifactId}@${selector.version}`;
    case 'alias':
      return `alias:${selector.artifactId}#${selector.alias}`;
  }
}

function expectedAuthorityOf(invoking: PromotedChildInvokingContext) {
  return {
    domainId: invoking.governanceBaseline.domainId,
    packageId: invoking.packageId,
    domainIntelligenceContentDigest: invoking.domainIntelligenceContentDigest,
    governanceBaseline: invoking.governanceBaseline,
  };
}

const artifactKey = (value: CompiledArtifactIdentity): string => `${value.kind} ${value.artifactId} ${value.contentDigest}`;

function withArtifact(
  dependencies: BehaviorallyRelevantSemanticDependencies,
  artifact: CompiledArtifactIdentity,
): BehaviorallyRelevantSemanticDependencies {
  const artifacts = [...(dependencies.artifacts ?? [])];
  if (!artifacts.some((value) => artifactKey(value) === artifactKey(artifact))) artifacts.push(artifact);
  return { ...dependencies, artifacts };
}

function observedWithProducer(
  observed: ObservedDependencySet | undefined,
  producer: CompiledArtifactIdentity,
): ObservedDependencySet {
  const base: ObservedDependencySet = observed ?? {};
  return withArtifact(base, producer);
}

/**
 * Resolve the configured promoted selector exactly once for this invocation
 * (S5 pre-read). Typed negative outcomes are deferred to the promoted stage so
 * the frozen §18 taxonomy applies only when resolution actually reaches that
 * source; integrity errors fail closed immediately.
 */
async function promotedPreRead<TResult extends JsonValue>(
  invocation: DecisionResolverInvocation<TResult>,
  ports: DecisionResolverPorts<TResult>,
): Promise<PromotedPreRead | undefined> {
  const config = invocation.promoted;
  if (config === undefined) return undefined;
  if (ports.promoted === undefined) {
    throw new DecisionResolverError(
      'DECISION_RESOLVER_PROMOTED_UNCONFIGURED',
      'a promoted selector is configured but no promoted runtime/artifact/revocation ports were supplied',
    );
  }
  try {
    const resolved = await resolvePromotedChildOnce(
      config.selector,
      expectedAuthorityOf(invocation.invoking),
      ports.promoted.artifactPort,
    );
    return { status: 'resolved', resolved };
  } catch (error) {
    if (isRegistryError(error, 'PROMOTED_ARTIFACT_NOT_FOUND')) return { status: 'not-found' };
    if (isRegistryError(error, 'PROMOTED_ARTIFACT_REVOKED')) {
      const artifact = (error as PromotedArtifactContractError).artifact;
      if (artifact === undefined) {
        throw new DecisionResolverError(
          'DECISION_RESOLVER_REVOCATION_RECORD_MISSING',
          'a revoked fresh selection did not carry the exact artifact identity; fail closed',
          error,
        );
      }
      const record = await ports.promoted.revocation.readRevocation(artifact);
      if (record === undefined) {
        throw new DecisionResolverError(
          'DECISION_RESOLVER_REVOCATION_RECORD_MISSING',
          `artifact ${artifact.artifactId}@${artifact.contentDigest} is blocked as revoked but no revocation record is readable`,
          error,
        );
      }
      return { status: 'revoked', record };
    }
    throw error;
  }
}

function validateFreshResult<TResult extends JsonValue>(
  invocation: DecisionResolverInvocation<TResult>,
  source: DecisionResolverSource,
  value: JsonValue,
): TResult {
  if (!invocation.currentSchema.isValid(value)) {
    throw new DecisionResolverError(
      'DECISION_RESOLVER_SCHEMA_VIOLATION',
      `fresh ${source} result violates the declared current output schema; fail closed (frozen L2 §18)`,
    );
  }
  return value;
}

interface CacheWriteAttempt<TResult extends JsonValue> {
  readonly prepared: PreparedSemanticInvocation;
  readonly store: ExactSemanticCacheStore<TResult> | undefined;
  readonly result: TResult;
  readonly producerIdentity: CompiledArtifactIdentity;
  readonly observed: ObservedDependencySet;
  readonly nowEpochMs: number;
}

interface MutableCacheTelemetry {
  read: DecisionResolverCacheTelemetry['read'];
  reason?: string;
  write?: DecisionResolverCacheTelemetry['write'];
  writeReason?: DecisionResolverCacheTelemetry['writeReason'];
}

type EligiblePreparation = Extract<PreparedSemanticInvocation, { readonly cacheEligibility: { readonly mode: 'eligible' } }>;

function eligiblePreparation(prepared: PreparedSemanticInvocation): prepared is EligiblePreparation {
  return prepared.cacheEligibility.mode === 'eligible';
}

function snapshotCache(cache: MutableCacheTelemetry): DecisionResolverCacheTelemetry {
  return {
    read: cache.read,
    ...(cache.reason === undefined ? {} : { reason: cache.reason }),
    ...(cache.write === undefined ? {} : { write: cache.write }),
    ...(cache.writeReason === undefined ? {} : { writeReason: cache.writeReason }),
  };
}

/**
 * Best-effort exact cache write (S9 two-phase eligibility). Every ineligible
 * or failed write downgrades to telemetry; the fresh result is never failed
 * by a cache-write problem (frozen L2 §18).
 */
async function attemptCacheWrite<TResult extends JsonValue>(
  attempt: CacheWriteAttempt<TResult>,
  sha256: Sha256Port,
  telemetry: DecisionResolverTelemetryEvent[],
  cache: MutableCacheTelemetry,
): Promise<void> {
  if (!eligiblePreparation(attempt.prepared) || attempt.store === undefined) {
    cache.write = 'skipped';
    cache.writeReason = 'cache-read-ineligible';
    return;
  }
  const preparedWrite = await prepareSemanticCacheWrite(
    attempt.prepared,
    attempt.result,
    attempt.producerIdentity,
    attempt.observed,
    attempt.nowEpochMs,
    sha256,
  );
  if (!preparedWrite.eligible) {
    cache.write = 'skipped';
    cache.writeReason = preparedWrite.reason;
    telemetry.push({
      type: 'cache-write-ineligible',
      reason: preparedWrite.reason,
      ...(preparedWrite.identity === undefined ? {} : { identity: preparedWrite.identity }),
    });
    return;
  }
  try {
    const put = await attempt.store.putIfAbsent(preparedWrite.entry, attempt.nowEpochMs);
    cache.write = put.status === 'inserted' ? 'inserted' : 'existing';
  } catch (error) {
    cache.write = 'store-error';
    cache.writeReason = 'store-error';
    telemetry.push({
      type: 'cache-store-error',
      operation: 'write',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function resolveDecision<TResult extends JsonValue>(
  invocation: DecisionResolverInvocation<TResult>,
  ports: DecisionResolverPorts<TResult>,
  sha256: Sha256Port,
): Promise<ResolvedDecision<TResult>> {
  const telemetry: DecisionResolverTelemetryEvent[] = [];
  const cache: MutableCacheTelemetry = { read: 'disabled' };
  const promotedPorts = ports.promoted;

  /* -------------------- deterministic semantic pre-read (S5) ------------- */
  const preRead = await promotedPreRead(invocation, ports);
  const preReadDependencies = preRead?.status === 'resolved'
    ? withArtifact(invocation.dependencies, preRead.resolved.body.identity)
    : invocation.dependencies;
  const prepared = await prepareExactSemanticInvocation(
    {
      namespace: invocation.namespace,
      domainId: invocation.domainId,
      decisionId: invocation.decisionId,
      selectedInput: invocation.selectedInput,
      dependencies: preReadDependencies,
      ...(invocation.requiredProjections === undefined ? {} : { requiredProjections: invocation.requiredProjections }),
      ...(invocation.requiredRevisionSourceIds === undefined ? {} : { requiredRevisionSourceIds: invocation.requiredRevisionSourceIds }),
      ...(invocation.allBehaviorallyRelevantDependenciesPrebound === undefined
        ? {}
        : { allBehaviorallyRelevantDependenciesPrebound: invocation.allBehaviorallyRelevantDependenciesPrebound }),
      ...(invocation.cachePolicy === undefined ? {} : { cachePolicy: invocation.cachePolicy }),
    },
    sha256,
  );
  const cacheStore = ports.cacheStore;

  /* ------------------------------ 1. Rule -------------------------------- */
  if (ports.rule !== undefined) {
    let outcome;
    try {
      outcome = await ports.rule.evaluate({
        namespace: invocation.namespace,
        domainId: invocation.domainId,
        decisionId: invocation.decisionId,
        selectedInput: invocation.selectedInput,
        invoking: invocation.invoking,
      });
    } catch (error) {
      throw new DecisionResolverError(
        'DECISION_RESOLVER_RULE_FAILED',
        'deterministic rule evaluation failed closed (frozen L2 §18)',
        error,
      );
    }
    if (outcome.status === 'match') {
      const result = validateFreshResult(invocation, 'rule', outcome.result);
      await attemptCacheWrite(
        {
          prepared,
          store: cacheStore,
          result,
          producerIdentity: ports.rule.producerIdentity,
          observed: observedWithProducer(outcome.observedDependencies, ports.rule.producerIdentity),
          nowEpochMs: invocation.nowEpochMs,
        },
        sha256,
        telemetry,
        cache,
      );
      return {
        source: 'rule',
        structuredDecision: result,
        provenance: { rule: { producerIdentity: ports.rule.producerIdentity } },
        freshModelCallCount: 0,
        llmAvoided: true,
        cacheDisposition: snapshotCache(cache),
        telemetry,
      };
    }
  }

  /* --------------------------- 2. Exact cache ---------------------------- */
  if (!eligiblePreparation(prepared)) {
    cache.read = 'bypass';
    cache.reason = prepared.cacheEligibility.mode === 'bypass' ? prepared.cacheEligibility.reason : 'non-cacheable';
  } else if (cacheStore === undefined) {
    cache.read = 'disabled';
  } else {
    const exact = prepared;
    const read = await readExactSemanticCache(
      cacheStore,
      exact.semanticIdentity.key,
      invocation.currentSchema,
      invocation.nowEpochMs,
      sha256,
    );
    if (read.status === 'hit') {
      cache.read = 'hit';
      return {
        source: 'exact-cache',
        structuredDecision: read.entry.result,
        provenance: { cache: { key: exact.semanticIdentity.key, entry: read.entry } },
        freshModelCallCount: 0,
        llmAvoided: true,
        cacheDisposition: snapshotCache(cache),
        telemetry,
      };
    }
    if (read.status === 'store-error') {
      cache.read = 'store-error';
      telemetry.push({ type: 'cache-store-error', operation: 'read', message: 'exact semantic cache store read failed' });
    } else {
      cache.read = 'miss';
      cache.reason = read.reason;
    }
  }

  /* ------------------------ 3. Promoted subworkflow ---------------------- */
  if (invocation.promoted !== undefined && preRead !== undefined && promotedPorts !== undefined) {
    if (preRead.status === 'revoked') {
      if (preRead.record.revocationPolicy === 'deny') {
        throw new DecisionResolverError(
          'DECISION_RESOLVER_PROMOTED_REVOKED_DENY',
          `promoted artifact ${preRead.record.artifact.artifactId}@${preRead.record.artifact.contentDigest} is revoked with revocationPolicy=deny; fail closed (frozen L2 §11.5)`,
        );
      }
      telemetry.push({
        type: 'revocation-fallthrough',
        artifact: preRead.record.artifact,
        recordId: preRead.record.recordId,
      });
    } else if (preRead.status === 'not-found') {
      telemetry.push({ type: 'promoted-not-found', selector: selectorDescription(invocation.promoted.selector) });
    } else {
      const artifact = preRead.resolved.body.identity;
      try {
        const session = await promotedPorts.runtime.beginFreshResolvedExecution({
          resolved: preRead.resolved,
          slot: invocation.slot,
          invoking: invocation.invoking,
          ...(invocation.governancePin === undefined ? {} : { governancePin: invocation.governancePin }),
          pinnedAt: invocation.pinnedAt,
        });
        const terminal = await session.run({
          input: invocation.promoted.input ?? invocation.selectedInput,
          journal: invocation.promoted.journal,
          executor: invocation.promoted.executor,
          durableControlTurnId: invocation.durableControlTurnId,
          semanticContractDigest: invocation.semanticContractDigest,
          ...(invocation.signal === undefined ? {} : { signal: invocation.signal }),
        });
        const result = validateFreshResult(invocation, 'promoted-subworkflow', terminal.output);
        await attemptCacheWrite(
          {
            prepared,
            store: cacheStore,
            result,
            producerIdentity: artifact,
            observed: { artifacts: [artifact] },
            nowEpochMs: invocation.nowEpochMs,
          },
          sha256,
          telemetry,
          cache,
        );
        return {
          source: 'promoted-subworkflow',
          structuredDecision: result,
          provenance: {
            promoted: {
              artifact,
              pin: session.pin,
              emittedEvents: terminal.emittedEvents,
              effectIntents: terminal.effectIntents,
            },
          },
          freshModelCallCount: 0,
          llmAvoided: true,
          cacheDisposition: snapshotCache(cache),
          selectedArtifactIdentity: artifact,
          telemetry,
        };
      } catch (error) {
        if (error instanceof DynamicChildExecutionError
          && (FALLTHROUGH_ELIGIBLE_CODES as readonly string[]).includes(error.code)) {
          telemetry.push({
            type: 'promoted-fallthrough',
            code: error.code as 'DYNAMIC_CHILD_INCOMPATIBLE' | 'DYNAMIC_CHILD_NOT_APPLICABLE',
            artifact,
          });
        } else {
          throw error;
        }
      }
    }
  }

  /* --------------------------- 4. HarnessMachine ------------------------- */
  const harnessConfig = invocation.harness;
  if (harnessConfig === undefined || ports.harnessRunner === undefined) {
    throw new DecisionResolverError(
      'DECISION_RESOLVER_HARNESS_UNCONFIGURED',
      'resolution fell through every earlier source but no HarnessMachine fallback configuration was supplied',
    );
  }
  const integration = createJournaledHarnessExecutionIntegration({
    input: harnessConfig.input,
    execution: {
      target: invocation.slot.target,
      durableControlTurnId: invocation.durableControlTurnId,
      semanticContractDigest: invocation.semanticContractDigest,
      journal: harnessConfig.journal,
      sha256,
    },
    harnessProducerIdentity: harnessConfig.harnessProducerIdentity,
    ...(harnessConfig.selectedSemanticDependencies === undefined
      ? {}
      : { selectedSemanticDependencies: harnessConfig.selectedSemanticDependencies }),
    ...(eligiblePreparation(prepared)
      ? { cachePreReadDependencies: prepared.semanticIdentity.dependencies }
      : {}),
    ...(harnessConfig.capabilitySemanticIdentities === undefined
      ? {}
      : { capabilitySemanticIdentities: harnessConfig.capabilitySemanticIdentities }),
  });
  const harnessResult = await ports.harnessRunner.run(
    integration.input,
    invocation.signal,
  );
  const completed = integration.complete(harnessResult);
  if (completed.journalFailure !== undefined) {
    throw new DecisionResolverError(
      'DECISION_RESOLVER_HARNESS_FAILED',
      `Harness execution journal ${completed.journalFailure.code} on ${completed.journalFailure.operationKind}#${completed.journalFailure.operationOrdinal}: ${completed.journalFailure.message}`,
    );
  }
  if (harnessResult.status !== 'ok') {
    throw new DecisionResolverError(
      'DECISION_RESOLVER_HARNESS_FAILED',
      `HarnessMachine fallback failed closed (${harnessResult.code}): ${harnessResult.message}`,
    );
  }
  const structured: JsonValue = {
    decision: { outcome: harnessResult.decision.outcome, data: harnessResult.decision.data },
    event: { type: harnessResult.event.type, payload: harnessResult.event.payload },
  };
  const result = validateFreshResult(invocation, 'harness-machine', structured);
  const freshModelCallCount = completed.journalEvidence.filter(
    (evidence) => evidence.identity.slot.operationKind === 'ai' && evidence.disposition === 'executed',
  ).length;
  await attemptCacheWrite(
    {
      prepared,
      store: cacheStore,
      result,
      producerIdentity: harnessConfig.harnessProducerIdentity,
      observed: completed.cacheWriteHandoff.observedDependencies,
      nowEpochMs: invocation.nowEpochMs,
    },
    sha256,
    telemetry,
    cache,
  );
  return {
    source: 'harness-machine',
    structuredDecision: result,
    provenance: {
      harness: {
        producerIdentity: harnessConfig.harnessProducerIdentity,
        observedDependencies: completed.observedDependencies,
        journalEvidence: completed.journalEvidence,
      },
    },
    freshModelCallCount,
    llmAvoided: freshModelCallCount === 0,
    cacheDisposition: snapshotCache(cache),
    telemetry,
  };
}
