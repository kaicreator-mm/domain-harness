import type { V10ProjectedSubscriptionEvent, V10ProjectedTarget } from '../subscription-projection.js';
/**
 * The fixed per-subscription FIFO bound (L2 §8: "The queue bound is fixed
 * in T06 review"). Overflow drops that subscription's whole queue and ends
 * it — observation is best-effort, never a back-pressure channel.
 */
export declare const V10_SUBSCRIPTION_QUEUE_BOUND = 128;
/** The public subscription handle: one entry, removable exactly once. */
export interface V10SubscriptionHandle {
    unsubscribe(): void;
}
/** The already-resolved, already-authorized registration of one listener. */
export interface V10SubscriptionRegistration {
    /** The exact authorized target the shared multi-B selector resolved. */
    readonly target: Readonly<V10ProjectedTarget>;
    /** The explicit selector to re-read the same target for snapshot evidence. */
    readonly selector: Readonly<{
        workflowId: string;
        instanceKey: string;
        businessPackageId?: string;
    }>;
    readonly listener: (event: Readonly<V10ProjectedSubscriptionEvent>) => void;
}
/** The trusted Host hooks the registry needs (all wired by the facade). */
export interface V10SubscriptionHostSeam {
    /** True once the activation facade closed (stop/dispose path). */
    isClosed(): boolean;
    /** The Host-wired authorization of the exact target (§8(ii) pump re-check). */
    authorize(target: Readonly<V10ProjectedTarget>): boolean | Promise<boolean>;
    /**
     * Authorized re-read of the same target through the SAME multi-B selector
     * (§8(i) same-revision snapshot evidence). Best-effort: any refusal simply
     * drops the snapshot field of that one event, never the delivery.
     */
    readAuthorizedSnapshot(selector: Readonly<{
        workflowId: string;
        instanceKey: string;
        businessPackageId?: string;
    }>): Promise<{
        readonly snapshot: unknown;
    } | null>;
}
export declare class V10SubscriptionRegistry {
    #private;
    constructor(host: V10SubscriptionHostSeam);
    /** Register one resolved+authorized listener; returns its only handle. */
    register(registration: V10SubscriptionRegistration): V10SubscriptionHandle;
    /**
     * The synchronous fan-out the kernel's best-effort `observe` calls into
     * (one receipt per turn, per business runtime). NEVER throws, never reads
     * beyond three scalar receipt fields plus the outward instance candidate,
     * and never aliases the caller's receipt: the candidate is deep-frozen at
     * enqueue time through the T06a copy discipline.
     *
     * Instance routing uses K's own `workflowInstanceId` join when the receipt
     * carries it; the K02 archive-replay receipts carry `occurrence =
     * { messageId }` only, so the same join is re-derived there from the
     * outward snapshot's `instance.address` — byte-identical grammar, never a
     * wider guess. An unroutable receipt is dropped silently.
     */
    observe(businessPackageId: string, receipt: unknown): void;
    /** §8 teardown on activation close: everyone inactive, queues cleared. */
    stopAll(): void;
}
export declare function createV10SubscriptionRegistry(host: V10SubscriptionHostSeam): V10SubscriptionRegistry;
