import { SubscriptionRegistry, } from '../subscription/subscription-registry.js';
import { addressKey } from './mailbox-drain-scheduler.js';
import { MessageRevisionTracker } from './message-revision-tracker.js';
/**
 * Owns the runtime's observation state (issue #171): the subscription
 * registry, projection subscription reference counts, and the bounded
 * target-wide message revision tracker (#170). The composition root wires it
 * and forwards public subscribe/invalidate calls; mutable observation state
 * no longer lives in the createDomainRuntime closure.
 */
export class RuntimeSubscriptionCoordinator {
    #projectionSubscriptions = new Map();
    #messageRevisions = new MessageRevisionTracker();
    #registry;
    #disposed = false;
    constructor(options) {
        // Field initializers run before the constructor body, so the closures
        // below capture the live tracker instance.
        const tracker = this.#messageRevisions;
        this.#registry = new SubscriptionRegistry({
            observationSource: {
                async readRevision(subscription) {
                    if (subscription.kind === 'instance') {
                        const instance = await options.store.getInstance(subscription.target);
                        return instance === null
                            ? null
                            : JSON.stringify([
                                instance.packageId,
                                instance.stateRevision,
                                instance.lifecycle,
                                instance.updatedAt,
                            ]);
                    }
                    if (subscription.kind === 'message') {
                        if (subscription.messageId === undefined) {
                            return tracker.read(addressKey(subscription.target));
                        }
                        const disposition = await options.store.getMessageDisposition(subscription.target, subscription.messageId);
                        return disposition === null
                            ? null
                            : JSON.stringify([
                                disposition.targetSequence,
                                disposition.disposition,
                                disposition.processingAt ?? null,
                                disposition.resolvedAt ?? null,
                            ]);
                    }
                    const snapshot = await options.projection.read({
                        projectionId: subscription.projectionId,
                        key: subscription.key,
                    });
                    return snapshot.revision;
                },
                isProjectionAffectedByBusinessInvalidation(subscription, invalidation) {
                    const compiledPackage = options.packageRegistry.get(options.packageRegistry.defaultPackageId);
                    const descriptor = compiledPackage?.manifest.projections[subscription.projectionId];
                    return (descriptor?.dependencies.some((dependency) => dependency.kind === 'business' && dependency.source === invalidation.source) ?? false);
                },
            },
            ...(options.onObservationError === undefined
                ? {}
                : { onObservationError: options.onObservationError }),
        });
    }
    get disposed() {
        return this.#disposed;
    }
    subscribe(request, listener) {
        let projectionKey;
        if (request.kind === 'projection') {
            projectionKey = JSON.stringify([request.projectionId, request.key]);
            const existing = this.#projectionSubscriptions.get(projectionKey);
            this.#projectionSubscriptions.set(projectionKey, {
                request: { ...request },
                count: (existing?.count ?? 0) + 1,
            });
        }
        // Target-wide message subscriptions are the only consumer of synthesized
        // revisions; scoping retention to them keeps the tracker bounded (#170).
        let revisionKey;
        if (request.kind === 'message' && request.messageId === undefined) {
            revisionKey = addressKey(request.target);
            this.#messageRevisions.retain(revisionKey);
        }
        const unsubscribe = this.#registry.subscribe(request, listener);
        let active = true;
        return () => {
            if (!active)
                return;
            active = false;
            unsubscribe();
            if (projectionKey !== undefined) {
                const existing = this.#projectionSubscriptions.get(projectionKey);
                if (existing !== undefined) {
                    if (existing.count <= 1)
                        this.#projectionSubscriptions.delete(projectionKey);
                    else {
                        this.#projectionSubscriptions.set(projectionKey, {
                            ...existing,
                            count: existing.count - 1,
                        });
                    }
                }
            }
            if (revisionKey !== undefined)
                this.#messageRevisions.release(revisionKey);
        };
    }
    notifyTargetChanged(target, messageId) {
        if (this.#disposed) {
            return;
        }
        this.#messageRevisions.bump(addressKey(target));
        this.#registry.notifyInstanceChanged(target);
        this.#registry.notifyMessageChanged(target, messageId);
        for (const { request } of this.#projectionSubscriptions.values()) {
            this.#registry.notifyProjectionChanged(request.projectionId, request.key);
        }
    }
    invalidateBusinessSnapshot(invalidation) {
        this.#registry.invalidateBusinessSnapshot(invalidation);
    }
    idle() {
        return this.#registry.idle();
    }
    dispose() {
        this.#disposed = true;
        this.#projectionSubscriptions.clear();
        this.#registry.dispose();
    }
}
//# sourceMappingURL=subscription-coordinator.js.map