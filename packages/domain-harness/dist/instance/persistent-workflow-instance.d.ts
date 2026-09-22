import type { JsonValue } from '../contracts/json.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot, WorkflowLifecycle } from '../v2/contracts/workflow.js';
export type InitialWorkflowLifecycle = Extract<WorkflowLifecycle, 'active' | 'waiting'>;
export interface CreatePersistentWorkflowInstanceRequest {
    address: WorkflowAddress;
    correlationId: string;
    packageId: string;
    initialState: JsonValue;
    lifecycle?: InitialWorkflowLifecycle;
}
export declare class WorkflowInstanceNotFoundError extends Error {
    readonly address: WorkflowAddress;
    constructor(address: WorkflowAddress);
}
export declare class PersistentWorkflowInstanceRepository {
    private readonly store;
    private readonly now;
    constructor(store: RuntimeStore, now?: () => string);
    create(request: CreatePersistentWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot>;
    resolve(address: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null>;
    require(address: WorkflowAddress): Promise<WorkflowInstanceSnapshot>;
}
//# sourceMappingURL=persistent-workflow-instance.d.ts.map