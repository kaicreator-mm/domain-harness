import type { ProjectionService } from '../projection/projection-service.js';
import type { PackageRegistry } from '../v2/contracts/package.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type { BusinessInvalidation, DomainChangeListener, DomainSubscription, Unsubscribe } from '../v2/contracts/subscription.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
export interface SubscriptionCoordinatorOptions {
    store: RuntimeStore;
    projection: ProjectionService;
    packageRegistry: PackageRegistry;
    /**
     * Observation/listener error adapter. Projection-kind errors cannot carry a
     * WorkflowAddress, so the runtime filters them before onBackgroundError
     * (contract-shape limitation tracked with #169/#172); convergence for them
     * is still guaranteed by the registry's retry behavior.
     */
    onObservationError?: (error: unknown, subscription: DomainSubscription) => void;
}
/**
 * Owns the runtime's observation state (issue #171): the subscription
 * registry, projection subscription reference counts, and the bounded
 * target-wide message revision tracker (#170). The composition root wires it
 * and forwards public subscribe/invalidate calls; mutable observation state
 * no longer lives in the createDomainRuntime closure.
 */
export declare class RuntimeSubscriptionCoordinator {
    #private;
    constructor(options: SubscriptionCoordinatorOptions);
    get disposed(): boolean;
    subscribe(request: DomainSubscription, listener: DomainChangeListener): Unsubscribe;
    notifyTargetChanged(target: WorkflowAddress, messageId?: string): void;
    invalidateBusinessSnapshot(invalidation: BusinessInvalidation): void;
    idle(): Promise<void>;
    dispose(): void;
}
//# sourceMappingURL=subscription-coordinator.d.ts.map