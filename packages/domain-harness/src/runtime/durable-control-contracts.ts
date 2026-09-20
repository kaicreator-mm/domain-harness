import type { JsonValue } from '../contracts/json.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';

export interface ProvisionWorkflowInstanceRequest {
  readonly provisioningKey: string;
  readonly target: WorkflowAddress;
  readonly correlationId: string;
  readonly packageId: string;
  readonly input: JsonValue;
  readonly requestedAt: string;
}

export interface ProvisionedWorkflowInstance {
  readonly provisioningKey: string;
  readonly target: WorkflowAddress;
  readonly correlationId: string;
  readonly packageId: string;
  readonly input: JsonValue;
  readonly createdAt: string;
}

export interface EnsureProvisionedWorkflowInstanceResult {
  readonly disposition: 'created' | 'existing';
  readonly record: ProvisionedWorkflowInstance;
}

export interface RegisterExternalWorkRequest {
  readonly externalCorrelationId: string;
  readonly target: WorkflowAddress;
  readonly deadlineTimerId: string;
  readonly dueAt: string;
  readonly registeredAt: string;
}

export type ExternalWorkCorrelationStatus = 'waiting' | 'callback_received' | 'timed_out';

export interface DeadlineControlSource {
  readonly kind: 'deadline';
  readonly durableControlTurnId: string;
  readonly target: WorkflowAddress;
  readonly externalCorrelationId: string;
  readonly timerId: string;
  readonly fireOrdinal: number;
  readonly observedAt: string;
}

export interface ExternalCallbackControlSource {
  readonly kind: 'external_callback';
  readonly durableControlTurnId: string;
  readonly target: WorkflowAddress;
  readonly externalCorrelationId: string;
  readonly callbackOrdinal: number;
  readonly payload: JsonValue;
  readonly observedAt: string;
}

export type DurableExternalWorkControlSource =
  | DeadlineControlSource
  | ExternalCallbackControlSource;

export interface WaitingExternalWorkCorrelationRecord {
  readonly externalCorrelationId: string;
  readonly target: WorkflowAddress;
  readonly deadlineTimerId: string;
  readonly dueAt: string;
  readonly status: 'waiting';
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompletedExternalWorkCorrelationRecord {
  readonly externalCorrelationId: string;
  readonly target: WorkflowAddress;
  readonly deadlineTimerId: string;
  readonly dueAt: string;
  readonly status: 'callback_received' | 'timed_out';
  readonly revision: number;
  readonly terminalSource: DurableExternalWorkControlSource;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ExternalWorkCorrelationRecord =
  | WaitingExternalWorkCorrelationRecord
  | CompletedExternalWorkCorrelationRecord;

export interface EnsureExternalWorkCorrelationResult {
  readonly disposition: 'created' | 'existing';
  readonly record: ExternalWorkCorrelationRecord;
}

export interface CompareAndSetExternalWorkCorrelationRequest {
  readonly externalCorrelationId: string;
  readonly expectedRevision: number;
  readonly next: CompletedExternalWorkCorrelationRecord;
}

/**
 * Durable persistence seam for T-010.
 *
 * Implementations MUST make each ensure operation atomic. In particular,
 * `ensureProvisionedWorkflowInstance` binds one provisioning key to one exact
 * logical WorkflowAddress and creates/opens that logical instance in the same
 * durable transaction; callers must never emulate this with query-then-insert.
 *
 * The external-work methods store only correlation/deadline state. They do not
 * submit, cancel, poll or otherwise own the external job platform.
 */
export interface DurableControlStore {
  ensureProvisionedWorkflowInstance(
    request: ProvisionWorkflowInstanceRequest,
  ): Promise<EnsureProvisionedWorkflowInstanceResult>;

  ensureExternalWorkCorrelation(
    request: RegisterExternalWorkRequest,
  ): Promise<EnsureExternalWorkCorrelationResult>;

  getExternalWorkCorrelation(
    externalCorrelationId: string,
  ): Promise<ExternalWorkCorrelationRecord | null>;

  /**
   * Return records whose durable deadline may be due. The result may be stale;
   * the coordinator always re-checks current state and resolves through CAS.
   */
  listDueExternalWorkCorrelations(
    dueAtOrBefore: string,
  ): Promise<readonly ExternalWorkCorrelationRecord[]>;

  /**
   * Atomically replace one waiting correlation record by its terminal state.
   * Return false when expectedRevision is stale or the record is no longer
   * waiting. Implementations must not partially update a correlation record.
   */
  compareAndSetExternalWorkCorrelation(
    request: CompareAndSetExternalWorkCorrelationRequest,
  ): Promise<boolean>;
}
