import type { JsonValue } from '../../contracts/json.js';
import type { EffectJournalRecord } from './effect.js';
import type { DomainMessage, MessageAcceptedAck, MessageDispositionSnapshot } from './message.js';
import type { TerminalWorkflowLifecycle, WorkflowAddress, WorkflowInstanceSnapshot } from './workflow.js';

export interface StoredAcceptedMessage {
  message: DomainMessage;
  ack: MessageAcceptedAck;
}

/**
 * Commits one processed message turn atomically with the instance state.
 *
 * Omission semantics (identical on every adapter): an omitted `output`
 * preserves the instance's durable output; `failure_json` is cleared unless
 * `nextLifecycle` is `recovery_required`. Reaching a terminal `nextLifecycle`
 * gives every accepted-but-unprocessed message the terminal disposition.
 */
export interface CommitProcessedMessageRequest {
  target: WorkflowAddress;
  messageId: string;
  expectedTargetSequence: number;
  nextState: JsonValue;
  nextLifecycle: WorkflowInstanceSnapshot['lifecycle'];
  output?: JsonValue;
  updatedAt: string;
}

export interface FailMessageProcessingRequest {
  target: WorkflowAddress;
  messageId: string;
  expectedTargetSequence: number;
  failure: JsonValue;
  updatedAt: string;
}

/**
 * Moves an instance into a terminal lifecycle and abandons every
 * accepted-but-unprocessed message (PRD R4 closure; this includes `failed`
 * poison messages under recovery termination, preserving their error evidence).
 *
 * Terminal lifecycles are final and identical on every adapter: replaying the
 * same terminal lifecycle is an idempotent no-op (no state-revision bump,
 * durable output/failure preserved); changing to a different terminal
 * lifecycle fails closed. An omitted `output` preserves the durable output;
 * an omitted `reason` preserves the durable failure evidence except when the
 * terminal lifecycle is `completed`.
 */
export interface TerminalizeInstanceRequest {
  target: WorkflowAddress;
  lifecycle: TerminalWorkflowLifecycle;
  output?: JsonValue;
  reason?: JsonValue;
  updatedAt: string;
}

/**
 * Begins (or re-begins) a durable effect journal record.
 *
 * Re-begin semantics (frozen L2 §25 A1.4): effect identity excludes `attempt`
 * and `startedAt`. When a record with the same `effectId` already exists and
 * its identity is compatible, the store returns the durable record unchanged —
 * the request's `attempt`/`startedAt` are ignored and the durable attempt does
 * not advance. An incompatible identity fails closed. A `started`
 * none/idempotent effect may therefore re-execute under the same idempotency
 * identity after reclaim/recovery.
 */
export interface BeginEffectRequest extends EffectJournalRecord {
  status: 'started';
}

/**
 * Commits the terminal state of a journaled effect. Completing an already
 * settled effect with the same status is idempotent and returns the durable
 * record unchanged (request output/error/completedAt are ignored); a
 * conflicting status fails closed.
 */
export interface CompleteEffectRequest {
  effectId: string;
  status: 'completed' | 'failed';
  output?: JsonValue;
  error?: JsonValue;
  completedAt: string;
}

export interface RuntimeStore {
  createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void>;
  getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null>;
  listPinnedPackageIds(): Promise<readonly string[]>;

  acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck>;
  getMessageDisposition(target: WorkflowAddress, messageId: string): Promise<MessageDispositionSnapshot | null>;
  getNextAcceptedMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null>;
  markMessageProcessing(target: WorkflowAddress, messageId: string, processingAt: string): Promise<boolean>;
  commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void>;
  failMessageProcessing(request: FailMessageProcessingRequest): Promise<void>;
  terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void>;

  /**
   * Lists every Workflow Instance target whose mailbox still holds unresolved
   * (`accepted` or `processing`) messages, in stable address order. Runtime
   * activation uses this to reclaim interrupted processing and to schedule
   * startup drains, so an accepted message never waits for a future send.
   */
  listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]>;

  /**
   * Atomically returns every `processing` message of one target to `accepted`,
   * preserving message identity and target sequence, and clears the processing
   * marker. Returns the reclaimed messageIds in target-sequence order.
   *
   * Precondition: the caller is the single writer process for this store (one
   * logical Domain Runtime per store; L2 §11.1). Reclaiming while a live peer
   * holds an in-flight turn would duplicate execution and is forbidden.
   * Re-execution after reclaim is governed by the durable effect journal
   * recovery matrix, not by this operation.
   */
  reclaimInterruptedProcessing(target: WorkflowAddress): Promise<readonly string[]>;

  getEffect(effectId: string): Promise<EffectJournalRecord | null>;
  beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord>;
  completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord>;

  resetRecovery(target: WorkflowAddress, updatedAt: string): Promise<WorkflowInstanceSnapshot>;
}
