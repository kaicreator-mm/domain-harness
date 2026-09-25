import type { Sha256Port } from '../contracts/identity.js';
import type { CompiledArtifactIdentity } from '../contracts/domain-data.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import type { ResolvedDecision } from '../decision-resolver/contracts.js';
import type { GovernanceBaselineStore } from '../governance/contracts.js';
import type { GovernanceExecutionCoordinator } from '../governance/execution-binding.js';
import type { ToolEffectSemantics } from '../v2/contracts/package.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import type {
  DomainWorkflowDefinition,
  DomainWorkflowTrigger,
} from '../workflow/contract.js';
import type { DomainPredicateEvent } from '../workflow/predicate.js';

/**
 * Deterministic Durable Control Turn source identity (frozen L2 §13.2). A turn
 * is not limited to an external Domain Message; child terminal, timer,
 * callback and recovery-resume sources are equally turn boundaries.
 */
export type AdmissionTurnSource =
  | { readonly kind: 'message'; readonly sourceMessageId: string }
  | {
      readonly kind: 'child-terminal';
      readonly parentActorId: string;
      readonly childActorId: string;
      readonly invocationOrdinal: number;
      readonly terminalKind: 'done' | 'error';
    }
  | { readonly kind: 'timer'; readonly timerId: string; readonly fireOrdinal: number }
  | { readonly kind: 'callback'; readonly externalCorrelationId: string; readonly callbackOrdinal: number }
  | { readonly kind: 'recovery'; readonly durableRecoveryActionId: string; readonly resumeOrdinal: number };

/** Schema authority for the structured decision presented for admission. */
export interface AdmissionDecisionSchema {
  readonly isValid: (value: JsonValue) => boolean;
}

export interface CentralAdmissionRequest {
  readonly target: WorkflowAddress;
  readonly turn: AdmissionTurnSource;
  /** Engine-neutral trigger the host turn loop matched for this turn. */
  readonly trigger: DomainWorkflowTrigger;
  /** T-014 durable GovernanceExecutionPin lookup key for this instance. */
  readonly workflowInstanceId: string;
  readonly definition: DomainWorkflowDefinition;
  readonly currentStateKey: string;
  readonly context: JsonObject;
  readonly event: DomainPredicateEvent;
  /** T-018 resolver output, consumed as data. */
  readonly resolved: ResolvedDecision<JsonValue>;
  readonly decisionSchema: AdmissionDecisionSchema;
  readonly now: string;
}

/** Declared mutation-capable host Domain Tool binding for one effect type. */
export interface AdmissionEffectToolBinding {
  readonly effectType: string;
  readonly effectSemantics: ToolEffectSemantics;
  readonly toolArtifact?: CompiledArtifactIdentity;
}

export interface AdmissionEffectToolRequest {
  readonly effectId: string;
  readonly target: WorkflowAddress;
  readonly durableControlTurnId: string;
  readonly operationOrdinal: number;
  readonly binding: AdmissionEffectToolBinding;
  readonly input: JsonValue;
  readonly idempotencyKey?: string;
  readonly logicalTime: string;
}

/**
 * Mutation-capable host Domain Tool port (frozen L2 §15/§16.1). Resolution is
 * declaration-based: an effect type without an explicit binding never enters
 * the mutation path.
 */
export interface AdmissionEffectToolPort {
  resolve(effectType: string): AdmissionEffectToolBinding | undefined;
  execute(request: AdmissionEffectToolRequest): Promise<JsonValue>;
}

export type AdmissionEffectJournalStatus = 'started' | 'completed' | 'failed';

/**
 * Durable effect journal record. Effect identity excludes `attempt` and
 * `startedAt`; the compatibility material is the exact effect identity
 * (target + turn + ordinal + type + canonical input + declared idempotency
 * key), never the volatile execution detail.
 */
export interface AdmissionEffectJournalRecord {
  readonly effectId: string;
  readonly target: WorkflowAddress;
  readonly durableControlTurnId: string;
  readonly operationOrdinal: number;
  readonly effectType: string;
  readonly effectSemantics: ToolEffectSemantics;
  readonly status: AdmissionEffectJournalStatus;
  readonly attempt: number;
  readonly input: JsonValue;
  readonly idempotencyKey?: string;
  readonly output?: JsonValue;
  readonly error?: JsonValue;
  readonly startedAt: string;
  readonly completedAt?: string;
}

/**
 * Journal-first durable effect authority (ADR-13). The same concrete
 * durability/ordering domain that owns control snapshots MUST back this port
 * on a supported host; portable fixtures use VolatileAdmissionEffectJournal.
 */
export interface AdmissionDurableEffectJournal {
  getEffect(effectId: string): Promise<AdmissionEffectJournalRecord | null>;
  /**
   * Atomically begin (or re-begin) one effect. A compatible existing record is
   * returned unchanged (`existing`); an incompatible one fails closed.
   */
  beginEffect(record: AdmissionEffectJournalRecord): Promise<{
    readonly disposition: 'created' | 'existing';
    readonly record: AdmissionEffectJournalRecord;
  }>;
  /**
   * Commit the terminal state of one started effect. Completing an already
   * settled record with the same outcome is idempotent; a conflicting outcome
   * fails closed. Implementations MUST reject outcomes that are not
   * canonical-JSON-safe (`ADMISSION_EFFECT_JOURNAL_CONFLICT`).
   */
  completeEffect(
    effectId: string,
    outcome:
      | { readonly status: 'completed'; readonly output: JsonValue; readonly completedAt: string }
      | { readonly status: 'failed'; readonly error: JsonValue; readonly completedAt: string },
  ): Promise<AdmissionEffectJournalRecord>;
}

export interface CentralAdmissionPorts {
  /** T-014 gate; the exact durable pin is required for EVERY admission. */
  readonly governance: GovernanceExecutionCoordinator;
  readonly baselines: GovernanceBaselineStore;
  readonly sha256: Sha256Port;
  readonly effectJournal: AdmissionDurableEffectJournal;
  readonly effectTools: AdmissionEffectToolPort;
}

export type CentralAdmissionErrorCode =
  | 'ADMISSION_INVALID_TURN_SOURCE'
  | 'ADMISSION_UNKNOWN_STATE'
  | 'ADMISSION_UNKNOWN_GUARD'
  | 'ADMISSION_INVALID_PREDICATE_SHAPE'
  | 'ADMISSION_EVALUATION_INPUT_INVALID'
  | 'ADMISSION_PINNED_BASELINE_UNAVAILABLE'
  | 'ADMISSION_INVALID_HARD_INVARIANTS'
  | 'ADMISSION_EFFECT_TOOL_UNBOUND'
  | 'ADMISSION_EFFECT_JOURNAL_CONFLICT'
  | 'ADMISSION_EFFECT_AMBIGUOUS'
  | 'ADMISSION_EFFECT_FAILED';

export class CentralAdmissionError extends Error {
  readonly code: CentralAdmissionErrorCode;

  constructor(code: CentralAdmissionErrorCode, message: string) {
    super(message);
    this.name = 'CentralAdmissionError';
    this.code = code;
  }
}

export type AdmissionDenialReason =
  | 'schema'
  | 'hard-invariant'
  | 'guard'
  | 'no-candidate-transition';

/** §21 resolver telemetry/LLM-avoidance handoff for the turn receipt. */
export interface AdmissionResolverEvidence {
  readonly source: ResolvedDecision<JsonValue>['source'];
  readonly llmAvoided: boolean;
  readonly freshModelCallCount: number;
  readonly cacheRead: ResolvedDecision<JsonValue>['cacheDisposition']['read'];
  readonly cacheWrite?: NonNullable<ResolvedDecision<JsonValue>['cacheDisposition']['write']>;
  readonly telemetryEventCount: number;
}

export interface AdmittedEffectOutcome {
  readonly effectId: string;
  readonly effectType: string;
  readonly disposition: 'executed' | 'replayed';
  readonly idempotencyKey?: string;
  readonly output?: JsonValue;
}

/**
 * The admitted plan for the parent Durable Control Turn. It deliberately
 * carries no engine state/snapshot reference: the existing control-turn
 * publication remains the only mutation path (ADR-02, A1 §4).
 */
export interface AdmittedAdmission {
  readonly durableControlTurnId: string;
  readonly governanceBindingDigest: string;
  readonly transitionKey: string;
  readonly targetState: string;
  readonly effects: readonly AdmittedEffectOutcome[];
  readonly resolver: AdmissionResolverEvidence;
}

export interface AdmissionDenial {
  readonly reason: AdmissionDenialReason;
  readonly durableControlTurnId: string;
  readonly governanceBindingDigest: string;
  readonly invariantId?: string;
  readonly transitionKey?: string;
  readonly guardId?: string;
  readonly resolver: AdmissionResolverEvidence;
}

export type CentralAdmissionOutcome =
  | { readonly status: 'admitted'; readonly admitted: AdmittedAdmission }
  | { readonly status: 'denied'; readonly denial: AdmissionDenial };
