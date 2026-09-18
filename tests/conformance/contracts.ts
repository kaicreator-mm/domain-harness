export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

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

export type MessageDisposition = 'accepted' | 'processing' | 'processed' | 'failed' | 'abandoned';

export interface ConformanceMessage {
  messageId: string;
  target: WorkflowAddress;
  type: string;
  payload: JsonValue;
  correlationId?: string;
  causationId?: string;
  contractVersion?: string;
}

export interface OpenInstanceRequest {
  address: WorkflowAddress;
  correlationId: string;
  input: JsonValue;
}

export type MessageAcceptanceObservation =
  | {
      status: 'accepted' | 'duplicate';
      messageId: string;
      target: WorkflowAddress;
      targetSequence: number;
    }
  | {
      status: 'rejected';
      code: string;
    };

export interface FailureObservation {
  code: string;
  sourceMessageId?: string;
}

export interface InstanceObservation {
  address: WorkflowAddress;
  correlationId: string;
  lifecycle: WorkflowLifecycle;
  stateRevision: number;
  state: JsonValue;
  output?: JsonValue;
  failure?: FailureObservation;
}

export interface MessageDispositionObservation {
  messageId: string;
  target: WorkflowAddress;
  targetSequence: number;
  disposition: MessageDisposition;
  correlationId: string;
  causationId?: string;
  failure?: FailureObservation;
}

export interface ProjectionSourceObservation {
  address: WorkflowAddress;
  stateRevision: number;
  state: JsonValue;
}

export interface ProjectionObservation {
  projectionId: string;
  key: string;
  value: JsonValue;
  workflowSources: readonly ProjectionSourceObservation[];
}

export type ConformanceQuery =
  | { kind: 'instance'; target: WorkflowAddress }
  | { kind: 'message-disposition'; target: WorkflowAddress; messageId: string }
  | { kind: 'runtime-failure'; target: WorkflowAddress }
  | { kind: 'projection'; projectionId: string; key: string };

export type ConformanceQueryResult =
  | { kind: 'instance'; value: InstanceObservation | null }
  | { kind: 'message-disposition'; value: MessageDispositionObservation | null }
  | { kind: 'runtime-failure'; value: FailureObservation | null }
  | { kind: 'projection'; value: ProjectionObservation };

export interface ToolInvocationObservation {
  toolId: string;
  effect: 'none' | 'idempotent' | 'non-idempotent';
  input: JsonValue;
  output?: JsonValue;
  failureCode?: string;
}

export interface EmittedDomainMessageObservation {
  target: WorkflowAddress;
  type: string;
  payload: JsonValue;
  correlationId?: string;
  causationId?: string;
}

export interface ConformanceFixture {
  readonly id: string;
  readonly workflowId: string;
  readonly auditWorkflowId: string;
  readonly messageContractVersion: string;
  readonly deterministicQuoteAdjustment: number;
  readonly deterministicFailureCode: string;
  readonly projectionId: string;
}

/**
 * Host adapter boundary for G30.
 *
 * Implementations may use Node, Expo/Hermes, different SQLite drivers and different
 * execution bindings internally. Everything returned here must already be reduced to
 * PRD-observable semantics: no package IDs, SQLite row IDs, driver handles, wall-clock
 * timestamps, private engine snapshots or host-specific diagnostics.
 */
export interface RuntimeConformanceSession {
  openInstance(request: OpenInstanceRequest): Promise<InstanceObservation>;
  send(message: ConformanceMessage): Promise<MessageAcceptanceObservation>;

  /**
   * Deterministic drain barrier for the test harness. It must wait until work that was
   * causally scheduled by preceding operations has reached its observable quiescent point.
   * It must not sleep for an arbitrary wall-clock duration.
   */
  settle(target?: WorkflowAddress): Promise<void>;

  query(request: ConformanceQuery): Promise<ConformanceQueryResult>;
  toolInvocations(): Promise<readonly ToolInvocationObservation[]>;
  emittedMessages(): Promise<readonly EmittedDomainMessageObservation[]>;
  dispose(): Promise<void>;
}

export interface RuntimeConformanceHost {
  readonly label: string;
  createSession(fixture: ConformanceFixture): Promise<RuntimeConformanceSession>;
}
