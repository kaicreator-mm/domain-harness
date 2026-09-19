import type { JsonValue } from '../../contracts/json.js';
import type { EffectJournalRecord } from './effect.js';
import type { DomainMessage, MessageAcceptedAck, MessageDispositionSnapshot } from './message.js';
import type { TerminalWorkflowLifecycle, WorkflowAddress, WorkflowInstanceSnapshot } from './workflow.js';

export interface StoredAcceptedMessage {
  message: DomainMessage;
  ack: MessageAcceptedAck;
}

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

export interface TerminalizeInstanceRequest {
  target: WorkflowAddress;
  lifecycle: TerminalWorkflowLifecycle;
  output?: JsonValue;
  reason?: JsonValue;
  updatedAt: string;
}

export interface BeginEffectRequest extends EffectJournalRecord {
  status: 'started';
}

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
