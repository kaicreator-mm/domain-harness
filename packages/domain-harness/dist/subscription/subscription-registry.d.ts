import type { BusinessInvalidation, DomainChangeListener, DomainSubscription, Unsubscribe } from '../v2/contracts/subscription.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
export type ProjectionSubscription = Extract<DomainSubscription, {
    kind: 'projection';
}>;
export interface SubscriptionObservationSource {
    readRevision(subscription: DomainSubscription): Promise<string | null>;
    isProjectionAffectedByBusinessInvalidation?(subscription: ProjectionSubscription, invalidation: BusinessInvalidation): boolean;
}
export interface SubscriptionScheduler {
    schedule(task: () => void): void;
}
/**
 * Schedules a deferred observation retry after a failed read. Hosts may inject
 * a policy (e.g. capped attempts or platform timers); the default uses the
 * global setTimeout with exponential backoff and, where the platform supports
 * it, unrefs the timer so a pending retry never keeps a Node process alive.
 */
export type SubscriptionRetryScheduler = (task: () => void, delayMs: number) => void;
export interface SubscriptionRegistryOptions {
    observationSource: SubscriptionObservationSource;
    scheduler?: SubscriptionScheduler;
    retryScheduler?: SubscriptionRetryScheduler;
    onObservationError?: (error: unknown, subscription: DomainSubscription) => void;
}
export declare class SubscriptionRegistry {
    #private;
    private readonly entries;
    private readonly observationSource;
    private readonly scheduler;
    private readonly retryScheduler;
    private readonly onObservationError;
    private disposed;
    private scheduledCount;
    private runningCount;
    private idleWaiters;
    constructor(options: SubscriptionRegistryOptions);
    /**
     * Resolves when no observation flush is scheduled, running, or pending
     * retry. Persistent observation failures keep re-scheduling retries, so the
     * registry is intentionally NOT idle until an observation succeeds (the
     * convergence guarantee of #161) or dispose() is called.
     */
    idle(): Promise<void>;
    /**
     * Stops all delivery and observation work: entries are dropped, pending
     * scheduled/retry tasks become no-ops when they fire, and idle() waiters
     * resolve. Idempotent.
     */
    dispose(): void;
    subscribe(request: DomainSubscription, listener: DomainChangeListener): Unsubscribe;
    notifyInstanceChanged(target: WorkflowAddress): void;
    notifyMessageChanged(target: WorkflowAddress, messageId?: string): void;
    notifyProjectionChanged(projectionId: string, key: string): void;
    invalidateBusinessSnapshot(invalidation: BusinessInvalidation): void;
    private signal;
    private markEntryChanged;
    private enqueue;
    /**
     * A failed observation must not consume the pending generation: the entry
     * stays dirty and is re-observed through the retry scheduler with exponential
     * backoff, so a connected subscriber still converges to the latest state
     * after a transient read failure even if no further signal ever arrives.
     * Signals arriving while a retry is pending coalesce into it.
     */
    private scheduleRetry;
    private flush;
    private reportObservationError;
}
//# sourceMappingURL=subscription-registry.d.ts.map