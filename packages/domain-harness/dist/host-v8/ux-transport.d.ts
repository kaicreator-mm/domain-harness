/**
 * v0.8 trusted Node Host — typed UX transport boundary (T-E, #1004).
 * ====================================================================
 *
 * The ONLY surface a UX consumer ever receives: three typed verbs — send,
 * query, subscribe — adapted from #994@b9ea4d1 src/ux/ux-client.mjs
 * (blob 448a8aad261e704254a34d9f67bb9ee0f3612187) with the experiment's
 * security debt repaired:
 *
 *   - the experiment let the caller SELECT `role` (`caller: { role }`); the
 *     transport treats the whole declared `caller` field as USER DATA: it is
 *     echoed opaquely into the dispatch record and NEVER used for any
 *     authorization decision — the authenticated principal comes from the
 *     issuer-signed credential on EVERY verb (B01-N1);
 *   - intents must be canonical plain JSON: callables, accessors, __proto__
 *     keys and other non-JSON material are refused typed before any dispatch
 *     (KPK-11 vector port: no commit authority can be smuggled);
 *   - query is a scoped, authenticated READ only: raw journal / kernel /
 *     mechanism / effect surfaces have no representable route (B01-N4: no
 *     direct Journal/Kernel/Doc handle bypass — #994's `getJournal` UX
 *     convenience does not exist here);
 *   - subscriptions revalidate the credential on every delivery (B01-N5,
 *     events.ts) and are refused typed when the scope crosses the
 *     authenticated principal's tenant/app (B01-N2);
 *   - the transport object is frozen, exposes no privileged member, and its
 *     constructor rejects injected hostPorts/verifier/installer options
 *     outright (B01-N8 Host face: no mutable installer injection).
 */
import { type V8KernelPrincipalChannel } from '../public-v8/microkernel.js';
import type { TrustedNodeHost } from './bootstrap.js';
import type { HostEvent, HostSubscription } from './events.js';
import { type HostCredential, type HostPrincipal } from './identity.js';
/** Where an intent is addressed: the H identity quadruple plus instance. */
export interface UxTarget {
    readonly tenantId: string;
    readonly appId: string;
    readonly instanceKey: string;
}
export interface UxDispatchReceipt {
    readonly status: 'dispatched';
    readonly messageId: string;
    readonly intentType: string;
    readonly resourceKey: string;
    /** The generic resource's physical result (fixture/adapter defined). */
    readonly result: unknown;
    /**
     * The authenticated identity of the dispatch — derived ONLY from the
     * issuer-signed credential. Declared caller roles can never appear here.
     */
    readonly authenticatedPrincipal: {
        readonly subject: string;
        readonly tenantId: string;
        readonly appId: string;
        readonly roles: readonly string[];
    };
    /** The caller-declared field, carried as untrusted user data. */
    readonly declaredCaller: unknown;
}
/** Query kinds the UX surface can express. */
export type UxQueryKind = 'doc';
export interface UxQueryRequest {
    readonly kind: UxQueryKind;
    readonly target?: UxTarget;
    /** Physical document key; reads are namespaced per tenant/app. */
    readonly key?: string;
}
/** UX-scoped document namespace: reads/writes never cross this prefix. */
export declare function uxDocumentNamespace(tenantId: string, appId: string): string;
interface TransportDeps {
    readonly authenticate: (credential: unknown) => Promise<HostPrincipal>;
    readonly dispatch: (resourceKey: string, operation: string, payload: unknown, principal: HostPrincipal) => Promise<unknown>;
    readonly readScopedDoc: (key: string) => Promise<{
        value: unknown;
        revision: number;
    } | null>;
    readonly subscribe: (credential: unknown, scope: unknown, listener: unknown) => Promise<HostSubscription>;
    readonly assertIntentScope: (target: UxTarget, principal: HostPrincipal) => void;
}
/**
 * Create the typed UX transport for one credential. The returned object is
 * the complete UX-reachable surface: frozen, allowlisted, portless.
 */
export declare function createUxTransport(deps: TransportDeps, channel: {
    readonly credential: HostCredential;
}): UxTransport;
export interface UxTransport {
    send(intent: unknown): Promise<UxDispatchReceipt>;
    query(request: unknown): Promise<unknown>;
    subscribe(scope: unknown, listener: (event: HostEvent) => void): Promise<HostSubscription>;
}
/** The host-side scope gate shared by send and any instance-scoped verb. */
export declare function assertIntentScope(target: UxTarget, principal: HostPrincipal): void;
/**
 * Wire the typed UX transport to a trusted host for one credential. The
 * caller (host context) hands the RETURNED transport to the UX consumer —
 * never the host object itself.
 */
export declare function createHostUxTransport(host: TrustedNodeHost, credential: HostCredential): UxTransport;
/** The protected tenant/app/workflow binding of one kernel UX transport. */
export interface KernelUxScopeBinding {
    readonly tenantId: string;
    readonly appId: string;
    readonly workflowId: string;
}
/** The authenticated send receipt: the Kernel outcome plus the H identity. */
export interface UxKernelSendReceipt {
    /** The authoritative Kernel receipt, verbatim and detached. */
    readonly kernelReceipt: unknown;
    /** The identity the Kernel actually evaluated — issuer-signed only. */
    readonly authenticatedPrincipal: {
        readonly issuerId: string;
        readonly grantId: string;
        readonly subject: string;
        readonly tenantId: string;
        readonly appId: string;
        /** The single signed role this submission selected/carried. */
        readonly role: string;
    };
    /** The caller-declared field, carried as untrusted user data. */
    readonly declaredCaller: unknown;
}
export interface KernelUxTransport {
    send(intent: unknown): Promise<UxKernelSendReceipt>;
    query(request: unknown): Promise<unknown>;
    subscribe(scope: unknown, listener: (receipt: unknown) => void): Promise<HostSubscription>;
}
interface KernelTransportDeps {
    readonly authenticate: (credential: unknown) => Promise<HostPrincipal>;
    readonly kernel: V8KernelPrincipalChannel;
    readonly binding: KernelUxScopeBinding;
}
/**
 * Create the typed kernel UX transport for one credential. The returned
 * object is the complete UX-reachable surface: frozen, allowlisted,
 * portless — exactly send/query/subscribe.
 */
export declare function createKernelUxTransport(deps: KernelTransportDeps, channel: {
    readonly credential: HostCredential;
}): KernelUxTransport;
/**
 * Wire the authenticated kernel UX transport: a trusted host, ONE loaded
 * package facade scope, the protected tenant/app/workflow binding and one
 * credential. The host context hands the RETURNED transport to the UX
 * consumer — never the host object, the facade or the kernel channel.
 */
export declare function createHostKernelUxTransport(host: TrustedNodeHost, facade: unknown, binding: KernelUxScopeBinding, credential: HostCredential): KernelUxTransport;
export {};
//# sourceMappingURL=ux-transport.d.ts.map