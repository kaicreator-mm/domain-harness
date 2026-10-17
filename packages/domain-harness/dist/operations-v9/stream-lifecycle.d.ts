import type { V9PublicSubscription } from '../public-v9/contracts.js';
type V09LifecyclePurpose = 'subscribe' | 'delivery' | 'stop';
/** The trusted K→H event envelope; never a user-provided observer argument. */
export interface V09SelectedReceipt {
    readonly subjectDigest: string;
    readonly appId: string;
    readonly tenantId: string;
    readonly permitDigest: string;
    /** Only the selected Kernel's redacted public receipt, never H metadata. */
    readonly receipt: unknown;
}
export interface V09ScopedLifecyclePorts {
    readonly subjectDigest: string;
    readonly appId: string;
    readonly tenantId: string;
    /** Trusted Host principal/currentness authority; not a caller callback. */
    authorize(purpose: V09LifecyclePurpose): Promise<void>;
    /** #1129 protected current subject-authority CAS read. */
    recheckDeliveryAuthorization(subjectDigest: string, permitDigest: string): Promise<{
        readonly decision: 'authorized';
    }>;
    /** Selected Kernel-only producer; its unsubscribe may need async cleanup. */
    observeSelectedReceipts(listener: (receipt: V09SelectedReceipt) => void): Promise<() => void | Promise<void>>;
    /** Trusted shutdown for resources belonging to exactly this facade. */
    dispose(): Promise<void>;
}
/**
 * Bind one trusted activated (subject, app, tenant) lifecycle.
 * This object is H-private; the public facade receives only subscribe/stop.
 */
export declare function createV09ScopedLifecycle(ports: V09ScopedLifecyclePorts): Readonly<{
    subscribe: (observer: (receipt: unknown) => void) => Promise<V9PublicSubscription>;
    stop: () => Promise<void>;
    drainSelectedDeliveries: () => Promise<void>;
}>;
export {};
//# sourceMappingURL=stream-lifecycle.d.ts.map