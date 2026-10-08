import type {
  BehaviorallyRelevantSemanticDependencies,
  CompiledArtifactIdentity,
} from '../contracts/domain-data.js';
import type { ContentDigest } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type { GovernanceExecutionPin } from '../governance/execution-binding.js';
import type { BusinessHarnessInput, BusinessHarnessResult } from '../harness/contract.js';
import type { HarnessExecutionJournalStore, HarnessOperationEvidence } from '../harness/execution-journal.js';
import type { HarnessIntegratedObservedDependencySet } from '../harness/harness-execution.js';
import type {
  PromotedArtifactIdentity,
  PromotedArtifactRevocationRecord,
} from '../promoted-artifact/contracts.js';
import type {
  DynamicChildExecutionErrorCode,
  DynamicChildExecutionPin,
  DynamicChildInvocationSlot,
  PromotedChildArtifactPort,
  PromotedChildEffectIntentData,
  PromotedChildEmittedEvent,
  PromotedChildInvokingContext,
  PromotedChildSelector,
} from '../promoted-child/contracts.js';
import type { PromotedChildQueryExecutorPort, PromotedChildRuntime } from '../promoted-child/runtime.js';
import type {
  ExactSemanticCacheStore,
  ObservedDependencySet,
  RequiredSemanticProjection,
  SemanticCacheBypassReason,
  SemanticCacheCurrentSchema,
  SemanticCacheEntry,
  SemanticCacheKey,
  SemanticCacheWriteIneligibleReason,
} from '../semantic-cache/exact-semantic-cache.js';

/* ------------------------------------------------------------------------ */
/* DecisionResolver contract (frozen L2 §9, S5-S9, §17, §18, §21)            */
/* ------------------------------------------------------------------------ */

/**
 * Frozen resolver source order (ADR-03): rule → exact cache → promoted
 * subworkflow → HarnessMachine. The resolver never reorders and never retries
 * a later source after an earlier source produced an admitted result.
 */
export type DecisionResolverSource = 'rule' | 'exact-cache' | 'promoted-subworkflow' | 'harness-machine';

export type DecisionResolverErrorCode =
  /** Deterministic rule contract/integrity error (frozen L2 §18). */
  | 'DECISION_RESOLVER_RULE_FAILED'
  /** A fresh rule/promoted/Harness result violates the declared current schema (§18). */
  | 'DECISION_RESOLVER_SCHEMA_VIOLATION'
  /** A promoted selector is configured but no promoted ports were supplied. */
  | 'DECISION_RESOLVER_PROMOTED_UNCONFIGURED'
  /** Revocation record for a revoked fresh selection carries revocationPolicy = deny (§11.5). */
  | 'DECISION_RESOLVER_PROMOTED_REVOKED_DENY'
  /** A revoked selection has no readable revocation record: registry integrity anomaly. */
  | 'DECISION_RESOLVER_REVOCATION_RECORD_MISSING'
  /** Resolution reached the HarnessMachine fallback with no Harness configuration. */
  | 'DECISION_RESOLVER_HARNESS_UNCONFIGURED'
  /** HarnessMachine terminated with an error or a journal failure (§18 fail closed). */
  | 'DECISION_RESOLVER_HARNESS_FAILED';

export class DecisionResolverError extends Error {
  readonly code: DecisionResolverErrorCode;
  readonly cause?: unknown;

  constructor(code: DecisionResolverErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DecisionResolverError';
    this.code = code;
    this.cause = cause;
  }
}

/* ------------------------------------------------------------------------ */
/* Ports (host-supplied seams over merged T-007/T-012/T-013/T-016/T-017)      */
/* ------------------------------------------------------------------------ */

export interface DecisionResolverRuleInput {
  readonly namespace: string;
  readonly domainId: string;
  readonly decisionId: string;
  readonly selectedInput: JsonValue;
  readonly invoking: PromotedChildInvokingContext;
}

export type DecisionResolverRuleOutcome<TResult extends JsonValue> =
  | {
      readonly status: 'match';
      readonly result: TResult;
      /** S9 post-execution observed dependencies (T-013 vocabulary). */
      readonly observedDependencies?: ObservedDependencySet;
    }
  | { readonly status: 'no-match' };

/**
 * Deterministic rule source. The port is provider-neutral and MUST NOT call a
 * model; a contract/integrity throw is fail-closed (never a fallthrough).
 */
export interface DecisionResolverRulePort<TResult extends JsonValue> {
  /** Exact rule-pack producer identity (kind 'rule') for the S8 producer rule. */
  readonly producerIdentity: CompiledArtifactIdentity;
  evaluate(input: DecisionResolverRuleInput): Promise<DecisionResolverRuleOutcome<TResult>>;
}

/** Revocation-policy lookup seam over the T-012 registry (read-only). */
export interface DecisionResolverRevocationPort {
  readRevocation(artifact: PromotedArtifactIdentity): Promise<PromotedArtifactRevocationRecord | undefined>;
}

/** Engine seam for the HarnessMachine fallback; the production adapter drives the merged XState child. */
export interface HarnessMachineRunnerPort {
  run(input: BusinessHarnessInput, signal?: AbortSignal): Promise<BusinessHarnessResult>;
}

export interface DecisionResolverPromotedPorts {
  readonly runtime: PromotedChildRuntime;
  readonly artifactPort: PromotedChildArtifactPort;
  readonly revocation: DecisionResolverRevocationPort;
}

export interface DecisionResolverPorts<TResult extends JsonValue> {
  readonly rule?: DecisionResolverRulePort<TResult>;
  readonly cacheStore?: ExactSemanticCacheStore<TResult>;
  readonly promoted?: DecisionResolverPromotedPorts;
  readonly harnessRunner?: HarnessMachineRunnerPort;
}

/* ------------------------------------------------------------------------ */
/* Invocation                                                                  */
/* ------------------------------------------------------------------------ */

export interface DecisionResolverPromotedConfig {
  /** One explicit promoted-subworkflow selection declaration (L2 §9.1). */
  readonly selector: PromotedChildSelector;
  readonly executor: PromotedChildQueryExecutorPort;
  readonly journal: HarnessExecutionJournalStore;
  /** Child input; defaults to the invocation selectedInput. */
  readonly input?: JsonValue;
}

export interface DecisionResolverHarnessConfig {
  /** Merged T-007 bounded invocation input (ModelPort, capabilities, bounds). */
  readonly input: BusinessHarnessInput;
  readonly journal: HarnessExecutionJournalStore;
  /** Exact harness-config producer identity (S8 producer rule, T-016 contract). */
  readonly harnessProducerIdentity: CompiledArtifactIdentity;
  readonly capabilitySemanticIdentities?: Readonly<Record<string, CompiledArtifactIdentity>>;
  readonly selectedSemanticDependencies?: BehaviorallyRelevantSemanticDependencies;
}

export interface DecisionResolverInvocation<TResult extends JsonValue = JsonValue> {
  readonly namespace: string;
  readonly domainId: string;
  readonly decisionId: string;
  readonly selectedInput: JsonValue;
  /** Pre-read behaviorally relevant dependency material (T-002 vocabulary). */
  readonly dependencies: BehaviorallyRelevantSemanticDependencies;
  readonly requiredProjections?: readonly RequiredSemanticProjection[];
  readonly requiredRevisionSourceIds?: readonly string[];
  readonly allBehaviorallyRelevantDependenciesPrebound?: boolean;
  readonly cachePolicy?:
    | { readonly mode: 'eligible' }
    | { readonly mode: 'bypass'; readonly reason: SemanticCacheBypassReason };
  /** Invoking instance's exact pinned package/CDI/Governance context (§9.1). */
  readonly invoking: PromotedChildInvokingContext;
  /** Optional T-014 durable pin validated at the promoted stage. */
  readonly governancePin?: GovernanceExecutionPin;
  /** Deterministic logical slot for any promoted child work (L2 §14.2). */
  readonly slot: DynamicChildInvocationSlot;
  /** Deterministic pin timestamp used only if a fresh pin commits. */
  readonly pinnedAt: string;
  /** Durable control-turn identity for journaled work inside this decision. */
  readonly durableControlTurnId: string;
  /** Exact behaviorally relevant decision-contract digest for T-016 identities. */
  readonly semanticContractDigest: ContentDigest;
  readonly nowEpochMs: number;
  /** Current structured output schema authority (§9.3/§18). */
  readonly currentSchema: SemanticCacheCurrentSchema<TResult>;
  readonly promoted?: DecisionResolverPromotedConfig;
  readonly harness?: DecisionResolverHarnessConfig;
  readonly signal?: AbortSignal;
}

/* ------------------------------------------------------------------------ */
/* Output + telemetry                                                          */
/* ------------------------------------------------------------------------ */

export interface DecisionResolverCacheTelemetry {
  readonly read: 'hit' | 'miss' | 'bypass' | 'store-error' | 'disabled';
  readonly reason?: string;
  readonly write?: 'inserted' | 'existing' | 'skipped' | 'store-error';
  readonly writeReason?: SemanticCacheWriteIneligibleReason | 'harness-not-successful' | 'cache-read-ineligible' | 'store-error';
}

export type DecisionResolverTelemetryEvent =
  | { readonly type: 'revocation-fallthrough'; readonly artifact: CompiledArtifactIdentity; readonly recordId: string }
  | { readonly type: 'promoted-not-found'; readonly selector: string }
  | {
      readonly type: 'promoted-fallthrough';
      readonly code: Extract<DynamicChildExecutionErrorCode, 'DYNAMIC_CHILD_INCOMPATIBLE' | 'DYNAMIC_CHILD_NOT_APPLICABLE'>;
      readonly artifact: CompiledArtifactIdentity;
    }
  | { readonly type: 'cache-store-error'; readonly operation: 'read' | 'write'; readonly message: string }
  | { readonly type: 'cache-write-ineligible'; readonly reason: string; readonly identity?: string };

export interface DecisionResolverRuleProvenance {
  readonly producerIdentity: CompiledArtifactIdentity;
}

export interface DecisionResolverCacheProvenance<TResult extends JsonValue> {
  readonly key: SemanticCacheKey;
  readonly entry: SemanticCacheEntry<TResult>;
}

export interface DecisionResolverPromotedProvenance {
  readonly artifact: CompiledArtifactIdentity;
  readonly pin: DynamicChildExecutionPin;
  readonly emittedEvents: readonly PromotedChildEmittedEvent[];
  readonly effectIntents: readonly PromotedChildEffectIntentData[];
}

export interface DecisionResolverHarnessProvenance {
  readonly producerIdentity: CompiledArtifactIdentity;
  readonly observedDependencies: HarnessIntegratedObservedDependencySet;
  readonly journalEvidence: readonly HarnessOperationEvidence[];
}

export interface DecisionResolverProvenance<TResult extends JsonValue> {
  readonly rule?: DecisionResolverRuleProvenance;
  readonly cache?: DecisionResolverCacheProvenance<TResult>;
  readonly promoted?: DecisionResolverPromotedProvenance;
  readonly harness?: DecisionResolverHarnessProvenance;
}

/**
 * Structured resolver output (L2 §9.2). It deliberately contains no parent
 * engine state ids and no committed mutation/execution authority: a cache hit
 * or any other source result is data only. The parent Domain Machine applies
 * the current synchronous guard next; guard rejection is final (S7) — this
 * resolver contains no retry loop.
 */
export interface ResolvedDecision<TResult extends JsonValue = JsonValue> {
  readonly source: DecisionResolverSource;
  readonly structuredDecision: TResult;
  readonly provenance: DecisionResolverProvenance<TResult>;
  readonly freshModelCallCount: number;
  /** §21 derived flag: llmAvoided = freshModelCallCount == 0. */
  readonly llmAvoided: boolean;
  readonly cacheDisposition: DecisionResolverCacheTelemetry;
  readonly selectedArtifactIdentity?: CompiledArtifactIdentity;
  readonly telemetry: readonly DecisionResolverTelemetryEvent[];
}
