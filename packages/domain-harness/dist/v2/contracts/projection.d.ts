import type { JsonValue } from '../../contracts/json.js';
import type { WorkflowAddress } from './workflow.js';
export interface WorkflowProjectionInput {
    address: WorkflowAddress;
    stateRevision: number;
    state: JsonValue;
}
export interface BusinessSnapshot {
    source: string;
    key: string;
    revision: string;
    value: JsonValue;
}
export interface BusinessSnapshotRequest {
    source: string;
    key: string;
}
export interface BusinessSnapshotPort {
    read(request: BusinessSnapshotRequest): Promise<BusinessSnapshot>;
}
export interface ProjectionSnapshot {
    projectionId: string;
    key: string;
    packageId: string;
    revision: string;
    value: JsonValue;
    workflowSources: readonly WorkflowProjectionInput[];
    businessSources: readonly Pick<BusinessSnapshot, 'source' | 'key' | 'revision'>[];
}
//# sourceMappingURL=projection.d.ts.map