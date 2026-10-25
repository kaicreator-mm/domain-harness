import type { V10BuiltApp, V10DocStore, V10PublicIntent, V10QueryAuthority, V10ScopedSnapshotAnswer, V10ScopedSnapshotManyAnswer, V10ScopedSnapshotQuery } from '@kaicreator/domain-harness-contracts';
/** The frozen public load options: no `counters` (L2 §3). */
export interface LoadAppOptions {
    readonly store: V10DocStore;
    readonly tenantId?: string;
    readonly deploymentIdentity?: {
        readonly deployedAppId: string;
        readonly tenantId: string;
        readonly appId: string;
    };
    readonly queryAuthority?: V10QueryAuthority;
    readonly deploymentRoot?: string;
    readonly now?: () => number;
}
/**
 * The frozen event projection SHAPE of L2 §8. Real delivery (asynchronous
 * authorize/re-check pump, deep-frozen snapshot copy) is T06b; at this pin
 * `subscribe` enforces the query preconditions and registers only.
 */
export interface V10ScopedSubscriptionEvent {
    readonly kind: string;
    readonly occurrenceId: string;
    readonly target: Readonly<Record<string, unknown>>;
    readonly snapshot?: unknown;
}
export interface V10Subscription {
    unsubscribe(): void;
}
export interface DomainApp {
    send(intent: V10PublicIntent): Promise<Record<string, unknown>>;
    query(selector: V10ScopedSnapshotQuery): Promise<V10ScopedSnapshotAnswer>;
    query(selectors: readonly V10ScopedSnapshotQuery[]): Promise<readonly V10ScopedSnapshotManyAnswer[]>;
    subscribe(selector: V10ScopedSnapshotQuery, listener: (event: V10ScopedSubscriptionEvent) => void): Promise<V10Subscription>;
    stop(): void;
}
/**
 * Load one trusted prebuilt App and return the frozen public Facade.
 * The activation's structural plain-data refusals (typed, Contracts error
 * identity) cross unchanged except for message redaction.
 */
export declare function load(app: V10BuiltApp, options: LoadAppOptions): Promise<DomainApp>;
