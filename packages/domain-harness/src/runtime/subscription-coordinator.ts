import type { ProjectionService } from '../projection/projection-service.js';
import {
  SubscriptionRegistry,
  type ProjectionSubscription,
} from '../subscription/subscription-registry.js';
import type { PackageRegistry } from '../v2/contracts/package.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type {
  BusinessInvalidation,
  DomainChangeListener,
  DomainSubscription,
  Unsubscribe,
} from '../v2/contracts/subscription.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import { addressKey } from './mailbox-drain-scheduler.js';
import { MessageRevisionTracker } from './message-revision-tracker.js';

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
export class RuntimeSubscriptionCoordinator {
  readonly #projectionSubscriptions = new Map<
    string,
    { request: ProjectionSubscription; count: number }
  >();
  readonly #messageRevisions = new MessageRevisionTracker();
  readonly #registry: SubscriptionRegistry;
  #disposed = false;

  public constructor(options: SubscriptionCoordinatorOptions) {
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
            const disposition = await options.store.getMessageDisposition(
              subscription.target,
              subscription.messageId,
            );
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
          const compiledPackage = options.packageRegistry.get(
            options.packageRegistry.defaultPackageId,
          );
          const descriptor = compiledPackage?.manifest.projections[subscription.projectionId];
          return (
            descriptor?.dependencies.some(
              (dependency) =>
                dependency.kind === 'business' && dependency.source === invalidation.source,
            ) ?? false
          );
        },
      },
      ...(options.onObservationError === undefined
        ? {}
        : { onObservationError: options.onObservationError }),
    });
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public subscribe(request: DomainSubscription, listener: DomainChangeListener): Unsubscribe {
    let projectionKey: string | undefined;
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
    let revisionKey: string | undefined;
    if (request.kind === 'message' && request.messageId === undefined) {
      revisionKey = addressKey(request.target);
      this.#messageRevisions.retain(revisionKey);
    }
    const unsubscribe = this.#registry.subscribe(request, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      unsubscribe();
      if (projectionKey !== undefined) {
        const existing = this.#projectionSubscriptions.get(projectionKey);
        if (existing !== undefined) {
          if (existing.count <= 1) this.#projectionSubscriptions.delete(projectionKey);
          else {
            this.#projectionSubscriptions.set(projectionKey, {
              ...existing,
              count: existing.count - 1,
            });
          }
        }
      }
      if (revisionKey !== undefined) this.#messageRevisions.release(revisionKey);
    };
  }

  public notifyTargetChanged(target: WorkflowAddress, messageId?: string): void {
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

  public invalidateBusinessSnapshot(invalidation: BusinessInvalidation): void {
    this.#registry.invalidateBusinessSnapshot(invalidation);
  }

  public idle(): Promise<void> {
    return this.#registry.idle();
  }

  public dispose(): void {
    this.#disposed = true;
    this.#projectionSubscriptions.clear();
    this.#registry.dispose();
  }
}
