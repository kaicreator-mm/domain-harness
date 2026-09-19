/**
 * Bounded, subscription-scoped revision counters for target-wide message
 * subscriptions (issue #170).
 *
 * A target-wide message subscription (`kind: 'message'` without a messageId)
 * has no durable per-target revision to read, so the runtime synthesizes a
 * monotonic revision per workflow address. That synthesis must not become an
 * address-history index: entries exist only while at least one matching
 * subscription is retained, and are released with the last subscriber.
 * Churn of distinct addresses without subscribers retains nothing.
 *
 * Ownership: created and owned by `createDomainRuntime`; mutated only through
 * retain/release (subscribe/unsubscribe) and bump (target-change fan-out).
 */
export class MessageRevisionTracker {
  readonly #revisions = new Map<string, number>();
  readonly #subscribers = new Map<string, number>();

  /** Registers one target-wide message subscription for the address key. */
  retain(key: string): void {
    this.#subscribers.set(key, (this.#subscribers.get(key) ?? 0) + 1);
  }

  /** Releases one subscription; the last release drops all ephemeral state. */
  release(key: string): void {
    const count = this.#subscribers.get(key) ?? 0;
    if (count <= 1) {
      this.#subscribers.delete(key);
      this.#revisions.delete(key);
      return;
    }
    this.#subscribers.set(key, count - 1);
  }

  /**
   * Advances the synthesized revision — but only while the address has at
   * least one retained subscription, so notifications for unobserved addresses
   * allocate nothing.
   */
  bump(key: string): void {
    if ((this.#subscribers.get(key) ?? 0) > 0) {
      this.#revisions.set(key, (this.#revisions.get(key) ?? 0) + 1);
    }
  }

  /** Current synthesized revision; `'0'` when nothing is retained. */
  read(key: string): string {
    return String(this.#revisions.get(key) ?? 0);
  }

  /** Number of addresses currently holding ephemeral revision state. */
  get size(): number {
    return this.#revisions.size;
  }
}
