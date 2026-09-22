import type { JsonValue } from '../contracts/json.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot, WorkflowLifecycle } from '../v2/contracts/workflow.js';
import { type CreatePersistentWorkflowInstanceRequest } from '../instance/persistent-workflow-instance.js';
import { PerInstanceSerializedLane } from './per-instance-serialized-lane.js';
export interface WorkflowInstanceTransition {
    nextState: JsonValue;
    nextLifecycle?: WorkflowLifecycle;
    output?: JsonValue;
}
export interface ProcessAcceptedInstanceTransitionRequest {
    target: WorkflowAddress;
    messageId: string;
    expectedTargetSequence: number;
    transition(current: WorkflowInstanceSnapshot): Promise<WorkflowInstanceTransition> | WorkflowInstanceTransition;
}
export interface WorkflowInstanceEngineOptions {
    now?: () => string;
    lane?: PerInstanceSerializedLane;
}
export declare class WorkflowInstanceEngine {
    private readonly store;
    private readonly instances;
    private readonly lane;
    private readonly now;
    constructor(store: RuntimeStore, options?: WorkflowInstanceEngineOptions);
    createInstance(request: CreatePersistentWorkflowInstanceRequest): Promise<WorkflowInstanceSnapshot>;
    getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null>;
    processAcceptedTransition(request: ProcessAcceptedInstanceTransitionRequest): Promise<WorkflowInstanceSnapshot>;
}
//# sourceMappingURL=workflow-instance-engine.d.ts.map