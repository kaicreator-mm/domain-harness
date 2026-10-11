/**
 * v0.8 trusted Node Host — scoped event delivery (T-E, #1004).
 * ==============================================================
 *
 * K-authorized scoped event delivery, Host side: a subscription is an
 * authenticated, tenant/app/instance-scoped grant check — and the check is
 * REPEATED ON EVERY DELIVERY (L2 B01-N5): a role revoked or a grant expired
 * between subscribe and delivery never receives the event.
 *
 * Boundary rules proven here:
 *   - a subscription can never outlive its grant (per-delivery revalidation
 *     of the presented credential — currentness + durable revocation);
 *   - a subscription can never see across its scope: cross-tenant scope is
 *     refused typed at subscribe time, and events outside the authenticated
 *     principal's tenant/app/instance are never delivered (no observer
 *     leakage, B01-N2/N6);
 *   - publishing is a HOST-context capability — the UX transport exposes no
 *     publish route at all.
 */
import type { HostPrincipal } from './identity.js';
/** An authoritative Host event (emitted by the host context / resources). */
export interface HostEvent {
    readonly tenantId: string;
    readonly appId: string;
    readonly instanceKey: string;
    readonly topic: string;
    readonly payload: unknown;
    readonly emittedAt: string;
}
/** The subscription scope requested by a UX observer. */
export interface EventScope {
    readonly tenantId?: string;
    readonly appId?: string;
    readonly instanceKey?: string;
    readonly topic?: string;
}
export interface HostSubscription {
    unsubscribe(): void;
}
export type EventListener = (event: HostEvent) => void;
export declare class ScopedEventHub {
    #private;
    constructor(input: {
        authenticate: (credential: unknown) => Promise<HostPrincipal>;
    });
    /**
     * Host-context publish. Deliveries re-authenticate every subscriber's
     * credential (fresh clock + revocation read); an invalidated subscriber is
     * silently skipped — the publisher never learns about observers, and the
     * observer never receives an event its grant no longer covers.
     */
    publish(event: HostEvent): Promise<void>;
    subscribe(credential: unknown, scope: unknown, listener: unknown): Promise<HostSubscription>;
    subscriptionCount(): number;
}
//# sourceMappingURL=events.d.ts.map