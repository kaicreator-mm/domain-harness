import type { JsonObject, JsonValue } from '../../contracts/json.js';
export interface WorkflowAddress {
    workflowId: string;
    instanceKey: string;
}
export type WorkflowLifecycle = 'active' | 'waiting' | 'recovery_required' | 'completed' | 'failed' | 'cancelled' | 'terminated';
export type TerminalWorkflowLifecycle = Extract<WorkflowLifecycle, 'completed' | 'failed' | 'cancelled' | 'terminated'>;
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
export interface OpenWorkflowInstanceRequest {
    address: WorkflowAddress;
    correlationId: string;
    input: JsonValue;
    packageId?: string;
}
//# sourceMappingURL=workflow.d.ts.map