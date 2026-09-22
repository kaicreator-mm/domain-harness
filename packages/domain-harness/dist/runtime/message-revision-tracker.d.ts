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
export declare class MessageRevisionTracker {
    #private;
    /** Registers one target-wide message subscription for the address key. */
    retain(key: string): void;
    /** Releases one subscription; the last release drops all ephemeral state. */
    release(key: string): void;
    /**
     * Advances the synthesized revision — but only while the address has at
     * least one retained subscription, so notifications for unobserved addresses
     * allocate nothing.
     */
    bump(key: string): void;
    /** Current synthesized revision; `'0'` when nothing is retained. */
    read(key: string): string;
    /** Number of addresses currently holding ephemeral revision state. */
    get size(): number;
}
//# sourceMappingURL=message-revision-tracker.d.ts.map