import type { RuntimeObservationIntent } from '../observation/contracts.js';
import type { EnsureProvisionedWorkflowInstanceOpenResult, ProvisionAndOpenWorkflowInstanceRequest, RuntimeInstanceProvisioningStore } from './durable-control-contracts.js';
/**
 * Portable I-OPEN coordinator.
 *
 * Runtime owns package/workflow resolution and construction of the exact
 * revision-0 initial snapshot. This coordinator owns fail-closed validation of
 * the successor provisioning contract around the host transaction; adapters
 * own only the atomic durable write itself.
 */
export declare class RuntimeInstanceProvisioningCoordinator {
    private readonly store;
    constructor(store: RuntimeInstanceProvisioningStore);
    ensureProvisionedWorkflowInstanceOpen(request: ProvisionAndOpenWorkflowInstanceRequest, observationIntent?: RuntimeObservationIntent): Promise<EnsureProvisionedWorkflowInstanceOpenResult>;
}
//# sourceMappingURL=instance-provisioning-coordinator.d.ts.map