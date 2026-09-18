import type { DomainMessage, MessageAcceptedAck } from './message.js';
import type { DomainQuery, DomainQueryResult } from './query.js';
import type {
  BusinessInvalidation,
  DomainChangeListener,
  DomainSubscription,
  Unsubscribe,
} from './subscription.js';
import type { OpenWorkflowInstanceRequest, WorkflowAddress, WorkflowInstanceSnapshot } from './workflow.js';

export interface RecoveryRequest {
  target: WorkflowAddress;
  action: 'retry' | 'resolve' | 'terminate';
  reason?: string;
}

export interface RecoveryResult {
  instance: WorkflowInstanceSnapshot;
}

export interface DomainRuntime {
  openInstance(request: OpenWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot>;
  send(message: DomainMessage): Promise<MessageAcceptedAck>;
  query(request: DomainQuery): Promise<DomainQueryResult>;
  subscribe(request: DomainSubscription, listener: DomainChangeListener): Unsubscribe;
  recover(request: RecoveryRequest): Promise<RecoveryResult>;
  invalidateBusinessSnapshot(request: BusinessInvalidation): void;
}
