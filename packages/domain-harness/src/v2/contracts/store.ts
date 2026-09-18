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

  getEffect(effectId: string): Promise<EffectJournalRecord | null>;
  beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord>;
  completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord>;

  resetRecovery(target: WorkflowAddress, updatedAt: string): Promise<WorkflowInstanceSnapshot>;
}
