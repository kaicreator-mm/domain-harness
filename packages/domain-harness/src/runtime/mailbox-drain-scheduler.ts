import type { WorkflowAddress } from '../v2/contracts/workflow.js';

export function addressKey(target: WorkflowAddress): string {
  return JSON.stringify([target.workflowId, target.instanceKey]);
}

export interface MailboxDrainSchedulerOptions {
  /** Runs one mailbox drain loop for the target (provided by the runtime). */
  drain(target: WorkflowAddress): Promise<void>;
  /**
   * Errors for which the durable failure fact is already persisted and
   * observable (poison-message recovery) and which are therefore not
   * reported again as background errors.
   */
  isDrainSuppressed?(error: unknown): boolean;
  /** Background error reporting; the scheduler guarantees it cannot throw out. */
  reportError(error: unknown, target: WorkflowAddress): void;
}

/**
 * Owns mailbox drain scheduling state and its invariants (issue #169/#171):
 *
 * - at most one active drain per target;
 * - wake-up preservation: a schedule during an active drain is remembered and
 *   re-drains exactly once after the active drain settles (lost-wakeup fix);
 * - identity-guarded cleanup: a stale drain's `finally` never deletes or
 *   reschedules a newer drain for the same target;
 * - disposal: no new drains (including redrains) are scheduled after
 *   dispose(); already-running drain loops stop at their next safe boundary
 *   because they observe `disposed`;
 * - quiescence: `awaitIdle()` resolves when no drain is active or requested,
 *   following redrain chains.
 *
 * Error routing is hardened: a throwing host `reportError` handler cannot turn
 * drain-error routing into an unhandled rejection on the floating drain chain.
 */
export class MailboxDrainScheduler {
  readonly #drains = new Map<string, Promise<void>>();
  readonly #requested = new Set<string>();
  readonly #options: MailboxDrainSchedulerOptions;
  #disposed = false;

  public constructor(options: MailboxDrainSchedulerOptions) {
    this.#options = options;
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public get activeDrainCount(): number {
    return this.#drains.size;
  }

  public schedule(target: WorkflowAddress): void {
    if (this.#disposed) {
      return;
    }
    const key = addressKey(target);
    if (this.#drains.has(key)) {
      // Preserve the wake-up. The active drain may already have observed an
      // empty mailbox; dropping this signal would strand an accepted message.
      this.#requested.add(key);
      return;
    }
    const drain = Promise.resolve()
      .then(() => this.#options.drain(target))
      .catch((error: unknown) => {
        if (this.#options.isDrainSuppressed?.(error)) {
          return;
        }
        try {
          this.#options.reportError(error, target);
        } catch {
          // A throwing host error handler must not create an unhandled
          // rejection on the floating drain promise chain.
        }
      })
      .finally(() => {
        if (this.#drains.get(key) !== drain) return;
        this.#drains.delete(key);
        if (this.#requested.delete(key) && !this.#disposed) {
          this.schedule(target);
        }
      });
    this.#drains.set(key, drain);
  }

  public async awaitIdle(): Promise<void> {
    for (;;) {
      const active = [...this.#drains.values()];
      if (active.length === 0 && this.#requested.size === 0) {
        return;
      }
      await Promise.allSettled(active);
    }
  }

  public dispose(): void {
    this.#disposed = true;
    this.#requested.clear();
  }
}
