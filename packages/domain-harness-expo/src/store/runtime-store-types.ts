/**
 * Structural mirror of the frozen v0.2 RuntimeStore contract.
 *
 * T-016 owns central package wiring. Keeping this mirror local lets the Expo
 * host package compile independently while remaining structurally assignable
 * to @kaicreator/domain-harness/v2 RuntimeStore.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface WorkflowAddress {
  workflowId: string;
  instanceKey: string;
}

export type WorkflowLifecycle =
  | 'active'
  | 'waiting'
  | 'recovery_required'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'terminated';

export type TerminalWorkflowLifecycle = Extract<
  WorkflowLifecycle,
  'completed' | 'failed' | 'cancelled' | 'terminated'
>;

export interface RuntimeFailure {
  code: string;
  message: string;
  details?: JsonObject;
  sourceMessageId?: string;
  effectId?: string;
}

export interface WorkflowInstanceSnapshot {
  address: WorkflowAddress;
  correlationId: string;
  packageId: string;
  lifecycle: WorkflowLifecycle;
  stateRevision: number;
  state: JsonValue;
  output?: JsonValue;
  failure?: RuntimeFailure;
  createdAt: string;
  updatedAt: string;
}

export interface DomainMessage {
  messageId: string;
  target: WorkflowAddress;
  type: string;
  payload: JsonValue;
  correlationId?: string;
  causationId?: string;
  contractVersion?: string;
}

export interface MessageAcceptedAck {
  status: 'accepted' | 'duplicate';
  messageId: string;
  target: WorkflowAddress;
  targetSequence: number;
  packageId: string;
  acceptedAt: string;
}

export type MessageDisposition =
  | 'accepted'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'abandoned';

export interface MessageDispositionSnapshot {
  messageId: string;
  target: WorkflowAddress;
  targetSequence: number;
  packageId: string;
  disposition: MessageDisposition;
  correlationId: string;
  causationId?: string;
  failure?: RuntimeFailure;
  acceptedAt: string;
  processingAt?: string;
  resolvedAt?: string;
}

export type ToolEffectSemantics = 'none' | 'idempotent' | 'non-idempotent';
export type EffectJournalStatus = 'started' | 'completed' | 'failed';

export interface EffectJournalRecord {
  effectId: string;
  target: WorkflowAddress;
  sourceMessageId: string;
  effectKind: string;
  effectSemantics: ToolEffectSemantics;
  status: EffectJournalStatus;
  attempt: number;
  input?: JsonValue;
  output?: JsonValue;
  error?: JsonValue;
  startedAt: string;
  completedAt?: string;
}

export interface StoredAcceptedMessage {
  message: DomainMessage;
  ack: MessageAcceptedAck;
}

export interface CommitProcessedMessageRequest {
  target: WorkflowAddress;
  messageId: string;
  expectedTargetSequence: number;
  nextState: JsonValue;
  nextLifecycle: WorkflowLifecycle;
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

export interface RuntimeStoreLike {
  createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void>;
  getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null>;
  listPinnedPackageIds(): Promise<readonly string[]>;

  acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck>;
  getMessageDisposition(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<MessageDispositionSnapshot | null>;
  getNextAcceptedMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null>;
  markMessageProcessing(
    target: WorkflowAddress,
    messageId: string,
    processingAt: string,
  ): Promise<boolean>;
  commitProcessedMessage(request: CommitProcessedMessageRequest): Promise<void>;
  failMessageProcessing(request: FailMessageProcessingRequest): Promise<void>;
  terminalizeInstance(request: TerminalizeInstanceRequest): Promise<void>;

  getEffect(effectId: string): Promise<EffectJournalRecord | null>;
  beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord>;
  completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord>;

  resetRecovery(target: WorkflowAddress, updatedAt: string): Promise<WorkflowInstanceSnapshot>;
}
