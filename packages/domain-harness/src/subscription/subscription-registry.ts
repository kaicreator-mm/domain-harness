import type {
  BusinessInvalidation,
  DomainChange,
  DomainChangeListener,
  DomainSubscription,
  Unsubscribe,
} from '../v2/contracts/subscription.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';

export type ProjectionSubscription = Extract<
  DomainSubscription,
  { kind: 'projection' }
>;

export interface SubscriptionObservationSource {
  readRevision(subscription: DomainSubscription): Promise<string | null>;
  isProjectionAffectedByBusinessInvalidation?(
    subscription: ProjectionSubscription,
    invalidation: BusinessInvalidation,
  ): boolean;
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
  onObservationError?: (
    error: unknown,
    subscription: DomainSubscription,
  ) => void;
}

interface SubscriptionEntry {
  readonly subscription: DomainSubscription;
  readonly listeners: Set<DomainChangeListener>;
  generation: number;
  scheduled: boolean;
  running: boolean;
  lastEmittedRevision: string | null;
  retryDelayMs: number;
}

const microtaskScheduler: SubscriptionScheduler = {
  schedule(task) {
    void Promise.resolve().then(task);
  },
};

const INITIAL_RETRY_DELAY_MS = 25;
const MAX_RETRY_DELAY_MS = 5_000;

const defaultRetryScheduler: SubscriptionRetryScheduler = (task, delayMs) => {
  const handle = setTimeout(task, delayMs) as unknown as { unref?: () => void };
  handle.unref?.();
};

export class SubscriptionRegistry {
  private readonly entries = new Map<string, SubscriptionEntry>();
  private readonly observationSource: SubscriptionObservationSource;
  private readonly scheduler: SubscriptionScheduler;
  private readonly retryScheduler: SubscriptionRetryScheduler;
  private readonly onObservationError:
    | SubscriptionRegistryOptions['onObservationError']
    | undefined;

  constructor(options: SubscriptionRegistryOptions) {
    this.observationSource = options.observationSource;
    this.scheduler = options.scheduler ?? microtaskScheduler;
    this.retryScheduler = options.retryScheduler ?? defaultRetryScheduler;
    this.onObservationError = options.onObservationError;
  }

  subscribe(
    request: DomainSubscription,
    listener: DomainChangeListener,
  ): Unsubscribe {
    const subscription = cloneSubscription(request);
    const key = subscriptionKey(subscription);
    let entry = this.entries.get(key);

    if (entry === undefined) {
      entry = {
        subscription,
        listeners: new Set<DomainChangeListener>(),
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

  notifyInstanceChanged(target: WorkflowAddress): void {
    this.signal({ kind: 'instance', target });
  }

  notifyMessageChanged(target: WorkflowAddress, messageId?: string): void {
    this.signal({ kind: 'message', target });

    if (messageId !== undefined) {
      this.signal({ kind: 'message', target, messageId });
      return;
    }

    for (const entry of this.entries.values()) {
      if (
        entry.subscription.kind === 'message' &&
        entry.subscription.messageId !== undefined &&
        sameWorkflowAddress(entry.subscription.target, target)
      ) {
        this.markEntryChanged(entry);
      }
    }
  }

  notifyProjectionChanged(projectionId: string, key: string): void {
    this.signal({ kind: 'projection', projectionId, key });
  }

  invalidateBusinessSnapshot(invalidation: BusinessInvalidation): void {
    for (const entry of this.entries.values()) {
      if (entry.subscription.kind !== 'projection') {
        continue;
      }

      let affected = true;
      try {
        affected =
          this.observationSource.isProjectionAffectedByBusinessInvalidation?.(
            entry.subscription,
            invalidation,
          ) ?? true;
      } catch (error) {
        this.reportObservationError(error, entry.subscription);
        continue;
      }

      if (affected) {
        this.markEntryChanged(entry);
      }
    }
  }

  private signal(subscription: DomainSubscription): void {
    const entry = this.entries.get(subscriptionKey(subscription));
    if (entry !== undefined) {
      this.markEntryChanged(entry);
    }
  }

  private markEntryChanged(entry: SubscriptionEntry): void {
    entry.generation += 1;
    this.enqueue(entry);
  }

  private enqueue(entry: SubscriptionEntry): void {
    if (
      entry.listeners.size === 0 ||
      entry.scheduled ||
      entry.running
    ) {
      return;
    }

    entry.scheduled = true;
    this.scheduler.schedule(() => {
      entry.scheduled = false;
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
  private scheduleRetry(entry: SubscriptionEntry): void {
    if (
      entry.listeners.size === 0 ||
      entry.scheduled ||
      entry.running
    ) {
      return;
    }

    entry.scheduled = true;
    const delayMs = entry.retryDelayMs;
    entry.retryDelayMs = Math.min(delayMs * 2, MAX_RETRY_DELAY_MS);
    this.retryScheduler(() => {
      entry.scheduled = false;
      void this.flush(entry);
    }, delayMs);
  }

  private async flush(entry: SubscriptionEntry): Promise<void> {
    if (entry.running || entry.listeners.size === 0) {
      return;
    }

    entry.running = true;
    const observedGeneration = entry.generation;
    let observationFailed = false;

    try {
      const revision = await this.observationSource.readRevision(
        entry.subscription,
      );

      if (
        revision !== null &&
        entry.listeners.size > 0 &&
        revision !== entry.lastEmittedRevision
      ) {
        entry.lastEmittedRevision = revision;
        const change: DomainChange = {
          kind: entry.subscription.kind,
          revision,
        };

        for (const listener of [...entry.listeners]) {
          if (!entry.listeners.has(listener)) {
            continue;
          }
          try {
            listener(change);
          } catch (error) {
            this.reportObservationError(error, entry.subscription);
          }
        }
      }
    } catch (error) {
      observationFailed = true;
      this.reportObservationError(error, entry.subscription);
    } finally {
      entry.running = false;
      if (entry.listeners.size > 0) {
        if (observationFailed) {
          this.scheduleRetry(entry);
        } else {
          entry.retryDelayMs = INITIAL_RETRY_DELAY_MS;
          if (entry.generation !== observedGeneration) {
            this.enqueue(entry);
          }
        }
      }
    }
  }

  private reportObservationError(
    error: unknown,
    subscription: DomainSubscription,
  ): void {
    try {
      this.onObservationError?.(error, subscription);
    } catch {
      // Delivery error reporting must not poison later subscription refreshes.
    }
  }
}

function cloneSubscription(subscription: DomainSubscription): DomainSubscription {
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

function subscriptionKey(subscription: DomainSubscription): string {
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

function sameWorkflowAddress(
  left: WorkflowAddress,
  right: WorkflowAddress,
): boolean {
  return (
    left.workflowId === right.workflowId &&
    left.instanceKey === right.instanceKey
  );
}
