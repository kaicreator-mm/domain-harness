import type { WorkflowAddress } from '../v2/contracts/workflow.js';
/**
 * Portable keyed scheduler: work for the same WorkflowAddress is chained, while
 * distinct addresses have independent promise tails and can progress concurrently.
 */
export declare class PerInstanceSerializedLane {
    private readonly tails;
    run<T>(address: WorkflowAddress, operation: () => Promise<T> | T): Promise<T>;
}
//# sourceMappingURL=per-instance-serialized-lane.d.ts.map