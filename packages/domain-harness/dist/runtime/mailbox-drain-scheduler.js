export function addressKey(target) {
    return JSON.stringify([target.workflowId, target.instanceKey]);
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
    #drains = new Map();
    #requested = new Set();
    #options;
    #disposed = false;
    constructor(options) {
        this.#options = options;
    }
    get disposed() {
        return this.#disposed;
    }
    get activeDrainCount() {
        return this.#drains.size;
    }
    schedule(target) {
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
            .catch((error) => {
            if (this.#options.isDrainSuppressed?.(error)) {
                return;
            }
            try {
                this.#options.reportError(error, target);
            }
            catch {
                // A throwing host error handler must not create an unhandled
                // rejection on the floating drain promise chain.
            }
        })
            .finally(() => {
            if (this.#drains.get(key) !== drain)
                return;
            this.#drains.delete(key);
            if (this.#requested.delete(key) && !this.#disposed) {
                this.schedule(target);
            }
        });
        this.#drains.set(key, drain);
    }
    async awaitIdle() {
        for (;;) {
            const active = [...this.#drains.values()];
            if (active.length === 0 && this.#requested.size === 0) {
                return;
            }
            await Promise.allSettled(active);
        }
    }
    dispose() {
        this.#disposed = true;
        this.#requested.clear();
    }
}
//# sourceMappingURL=mailbox-drain-scheduler.js.map