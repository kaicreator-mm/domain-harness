/**
 * v0.8 trusted Node Host — authenticated Kernel gateway (#1013, I02/I03).
 * ===========================================================================
 *
 * The Host-side bridge between the typed authenticated UX boundary and the
 * REAL selected Kernel of a loaded qualified Domain App closure:
 *
 *   credential ──H authenticate──► HostPrincipal ──scope gate──► private
 *   facade ops (public-v8/microkernel.ts getFacadeKernelOps) ──► Kernel
 *   submitOccurrence / getSnapshot / protected Genesis openInstance.
 *
 * Authority rules enforced here (the #1005@6112954208 / #1013 repair):
 *   - every verb re-authenticates the presented credential (issuer,
 *     audience, tenant, app, currentness, durable revocation) through the
 *     trusted Host verifier — nothing is cached from a previous call;
 *   - the Kernel `caller` is derived ONLY from the issuer-signed roles ∩
 *     the sealed Business binding roles (decided inside the private ops
 *     seam); a caller-declared role is user data and never reaches the
 *     Kernel as authority;
 *   - cross-tenant / cross-app / malformed instance targets are refused
 *     typed before any Kernel activity (assertIntentScope);
 *   - Genesis activation is a PROTECTED Host command: it requires a
 *     host-configured genesis role on the authenticated principal, and the
 *     initial state/context stay owned by the sealed Business policy — no
 *     raw `openInstance`, Kernel namespace or Journal handle ever escapes;
 *   - app registration is DURABLY pinned (#1013 R1 F-02): the exact
 *     installed closure identity (rootPackageId + whole-closure digest +
 *     K/S/B module digests + host audience) is persisted in the physical
 *     Host store under guarded CAS, so package replacement / stale roots
 *     refuse across process restarts before their module bytes ever load,
 *     and re-registering the SAME closure after a restart is idempotent;
 *   - K-receipt subscriptions re-authenticate the credential on EVERY
 *     delivery and silently stop when the grant is no longer valid.
 *
 * This module wires; it implements no Kernel policy, no Guard/Effect/
 * Journal semantics and no second runtime (those belong to the physically
 * selected Kernel package, T-C).
 */
import type { TrustedNodeHost } from './bootstrap.js';
import { type UxTarget } from './ux-transport.js';
import type { HostEvent } from './events.js';
import type { HostCredential } from './identity.js';
/** One registered qualified Domain App closure bound to a host appId. */
export interface KernelGatewayAppInput {
    /** Host application identity; credentials are audience/tenant/app-bound to this. */
    readonly appId: string;
    /**
     * The sealed qualified package root (compiler BUILD + external approval
     * proof) loaded through the PUBLIC one-argument `DomainHarness.load`.
     */
    readonly packageRoot: unknown;
    /**
     * Roles (issuer-signed) allowed to run the protected Genesis activation
     * for this app. Host governance configuration — never caller data.
     */
    readonly genesisRoles: readonly string[];
}
export interface KernelGatewaySendIntent {
    readonly intentType: string;
    readonly messageId: string;
    readonly input?: unknown;
    readonly target: UxTarget;
}
/** K-receipt subscription scope (all fields must stay inside the principal). */
export interface KernelReceiptScope {
    readonly appId: string;
    readonly instanceKey: string;
}
export interface KernelReceiptSubscription {
    unsubscribe(): void;
}
export interface KernelGateway {
    /** Host-context provisioning: load + bind one approved Domain App. */
    registerApp(input: KernelGatewayAppInput): Promise<void>;
    /** Whether an app closure is registered for the appId (routing probe). */
    hasApp(appId: string): boolean;
    /** Authenticated send through the REAL selected Kernel of the app. */
    send(credential: unknown, intent: KernelGatewaySendIntent): Promise<unknown>;
    /** Authenticated scoped instance read (K getSnapshot). */
    queryInstance(credential: unknown, target: UxTarget): Promise<unknown>;
    /** Authenticated subscribe to Kernel receipts; revalidated per delivery. */
    subscribe(credential: HostCredential, scope: KernelReceiptScope, listener: (receipt: unknown) => void): Promise<KernelReceiptSubscription>;
    /** Protected Genesis activation (host-configured role authority). */
    activateGenesis(credential: unknown, request: {
        readonly appId: string;
        readonly instanceKey: string;
        readonly correlationId?: string;
    }): Promise<unknown>;
}
export declare function createKernelGateway(input: {
    readonly host: TrustedNodeHost;
}): KernelGateway;
/**
 * Bridge a Kernel receipt into the Host scoped event hub shape (host-context
 * publishing convenience; the receipt is inert data at this boundary).
 */
export declare function kernelReceiptAsHostEvent(tenantId: string, appId: string, instanceKey: string, receipt: unknown, emittedAt: string): HostEvent;
//# sourceMappingURL=kernel-gateway.d.ts.map