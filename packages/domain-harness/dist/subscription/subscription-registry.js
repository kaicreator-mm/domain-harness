const microtaskScheduler = {
    schedule(task) {
        void Promise.resolve().then(task);
    },
};
const INITIAL_RETRY_DELAY_MS = 25;
const MAX_RETRY_DELAY_MS = 5_000;
const defaultRetryScheduler = (task, delayMs) => {
    const handle = setTimeout(task, delayMs);
    handle.unref?.();
};
export class SubscriptionRegistry {
    entries = new Map();
    observationSource;
    scheduler;
    retryScheduler;
    onObservationError;
    disposed = false;
    scheduledCount = 0;
    runningCount = 0;
    idleWaiters = [];
    constructor(options) {
        this.observationSource = options.observationSource;
        this.scheduler = options.scheduler ?? microtaskScheduler;
        this.retryScheduler = options.retryScheduler ?? defaultRetryScheduler;
        this.onObservationError = options.onObservationError;
    }
    /**
     * Resolves when no observation flush is scheduled, running, or pending
     * retry. Persistent observation failures keep re-scheduling retries, so the
     * registry is intentionally NOT idle until an observation succeeds (the
     * convergence guarantee of #161) or dispose() is called.
     */
    idle() {
        if (this.disposed || (this.scheduledCount === 0 && this.runningCount === 0)) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.idleWaiters.push(resolve);
        });
    }
    /**
     * Stops all delivery and observation work: entries are dropped, pending
     * scheduled/retry tasks become no-ops when they fire, and idle() waiters
     * resolve. Idempotent.
     */
    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.entries.clear();
        this.scheduledCount = 0;
        this.runningCount = 0;
        this.#resolveIdleWaiters();
    }
    #resolveIdleWaiters() {
        const waiters = this.idleWaiters;
        this.idleWaiters = [];
        for (const resolve of waiters) {
            resolve();
        }
    }
    #checkIdle() {
        if (this.scheduledCount === 0 && this.runningCount === 0) {
            this.#resolveIdleWaiters();
        }
    }
    subscribe(request, listener) {
        if (this.disposed) {
            throw new Error('SubscriptionRegistry is disposed');
        }
        const subscription = cloneSubscription(request);
        const key = subscriptionKey(subscription);
        let entry = this.entries.get(key);
        if (entry === undefined) {
            entry = {
                subscription,
                listeners: new Set(),
                generation: 0,
                scheduled: false,
                running: false,
                lastEmittedRevision: null,
                retryDelayMs: INITIAL_RETRY_DELAY_MS,
            };
            this.entries.set(key, entry);
        }
        entry.listeners.add(listener);
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            entry.listeners.delete(listener);
            if (entry.listeners.size === 0 && this.entries.get(key) === entry) {
                this.entries.delete(key);
            }
        };
    }
    notifyInstanceChanged(target) {
        if (this.disposed) {
            return;
        }
        this.signal({ kind: 'instance', target });
    }
    notifyMessageChanged(target, messageId) {
        if (this.disposed) {
            return;
        }
        this.signal({ kind: 'message', target });
        if (messageId !== undefined) {
            this.signal({ kind: 'message', target, messageId });
            return;
        }
        for (const entry of this.entries.values()) {
            if (entry.subscription.kind === 'message' &&
                entry.subscription.messageId !== undefined &&
                sameWorkflowAddress(entry.subscription.target, target)) {
                this.markEntryChanged(entry);
            }
        }
    }
    notifyProjectionChanged(projectionId, key) {
        if (this.disposed) {
            return;
        }
        this.signal({ kind: 'projection', projectionId, key });
    }
    invalidateBusinessSnapshot(invalidation) {
        if (this.disposed) {
            return;
        }
        for (const entry of this.entries.values()) {
            if (entry.subscription.kind !== 'projection') {
                continue;
            }
            let affected;
            try {
                affected =
                    this.observationSource.isProjectionAffectedByBusinessInvalidation?.(entry.subscription, invalidation) ?? true;
            }
            catch (error) {
                this.reportObservationError(error, entry.subscription);
                continue;
            }
            if (affected) {
                this.markEntryChanged(entry);
            }
        }
    }
    signal(subscription) {
        const entry = this.entries.get(subscriptionKey(subscription));
        if (entry !== undefined) {
            this.markEntryChanged(entry);
        }
    }
    markEntryChanged(entry) {
        entry.generation += 1;
        this.enqueue(entry);
    }
    enqueue(entry) {
        if (this.disposed ||
            entry.listeners.size === 0 ||
            entry.scheduled ||
            entry.running) {
            return;
        }
        entry.scheduled = true;
        this.scheduledCount += 1;
        this.scheduler.schedule(() => {
            if (this.disposed) {
                return;
            }
            entry.scheduled = false;
            this.scheduledCount -= 1;
            void this.flush(entry);
        });
    }
    /**
     * A failed observation must not consume the pending generation: the entry
     * stays dirty and is re-observed through the retry scheduler with exponential
     * backoff, so a connected subscriber still converges to the latest state
     * after a transient read failure even if no further signal ever arrives.
     * Signals arriving while a retry is pending coalesce into it.
     */
    scheduleRetry(entry) {
        if (entry.listeners.size === 0 ||
            entry.scheduled ||
            entry.running) {
            return;
        }
        entry.scheduled = true;
        this.scheduledCount += 1;
        const delayMs = entry.retryDelayMs;
        entry.retryDelayMs = Math.min(delayMs * 2, MAX_RETRY_DELAY_MS);
        this.retryScheduler(() => {
            if (this.disposed) {
                return;
            }
            entry.scheduled = false;
            this.scheduledCount -= 1;
            void this.flush(entry);
        }, delayMs);
    }
    async flush(entry) {
        if (this.disposed) {
            return;
        }
        if (entry.running || entry.listeners.size === 0) {
            this.#checkIdle();
            return;
        }
        entry.running = true;
        this.runningCount += 1;
        const observedGeneration = entry.generation;
        let observationFailed = false;
        try {
            const revision = await this.observationSource.readRevision(entry.subscription);
            if (revision !== null &&
                entry.listeners.size > 0 &&
                revision !== entry.lastEmittedRevision) {
                entry.lastEmittedRevision = revision;
                const change = {
                    kind: entry.subscription.kind,
                    revision,
                };
                for (const listener of [...entry.listeners]) {
                    if (!entry.listeners.has(listener)) {
                        continue;
                    }
                    try {
                        listener(change);
                    }
                    catch (error) {
                        this.reportObservationError(error, entry.subscription);
                    }
                }
            }
        }
        catch (error) {
            observationFailed = true;
            this.reportObservationError(error, entry.subscription);
        }
        finally {
            entry.running = false;
            this.runningCount -= 1;
            if (entry.listeners.size > 0) {
                if (observationFailed) {
                    this.scheduleRetry(entry);
                }
                else {
                    entry.retryDelayMs = INITIAL_RETRY_DELAY_MS;
                    if (entry.generation !== observedGeneration) {
                        this.enqueue(entry);
                    }
                }
            }
            this.#checkIdle();
        }
    }
    reportObservationError(error, subscription) {
        try {
            this.onObservationError?.(error, subscription);
        }
        catch {
            // Delivery error reporting must not poison later subscription refreshes.
        }
    }
}
function cloneSubscription(subscription) {
    switch (subscription.kind) {
        case 'instance':
            return {
                kind: 'instance',
                target: { ...subscription.target },
            };
        case 'message':
            if (subscription.messageId === undefined) {
                return {
                    kind: 'message',
                    target: { ...subscription.target },
                };
            }
            return {
                kind: 'message',
                target: { ...subscription.target },
                messageId: subscription.messageId,
            };
        case 'projection':
            return {
                kind: 'projection',
                projectionId: subscription.projectionId,
                key: subscription.key,
            };
    }
}
function subscriptionKey(subscription) {
    switch (subscription.kind) {
        case 'instance':
            return JSON.stringify([
                'instance',
                subscription.target.workflowId,
                subscription.target.instanceKey,
            ]);
        case 'message':
            return JSON.stringify([
                'message',
                subscription.target.workflowId,
                subscription.target.instanceKey,
                subscription.messageId ?? null,
            ]);
        case 'projection':
            return JSON.stringify([
                'projection',
                subscription.projectionId,
                subscription.key,
            ]);
    }
}
function sameWorkflowAddress(left, right) {
    return (left.workflowId === right.workflowId &&
        left.instanceKey === right.instanceKey);
}
//# sourceMappingURL=subscription-registry.js.map