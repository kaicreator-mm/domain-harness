/**
 * Minimal microkernel — `DomainHarness.load(package)` scoped facade (T-B, #1001).
 * ================================================================================
 *
 * Selective production port of the pinned research loader #994@b9ea4d1
 * (src/microkernel/contracts.mjs `assertPlainJsonIntent` + src/microkernel/load.mjs
 * endpoint wiring and UX transport), with the research defects the task DAG
 * pinpoints FIXED:
 *
 *   - P1-L2-ABI-02: the research `load(packageRoot, options={})` read
 *     caller-provided `options.hostPorts`. The production loader is STRICTLY
 *     one-argument — there is no options overload and no caller-injected
 *     Host port; the kernel Host binding comes only from the protected
 *     internal channel (kernel-host.ts) and fails closed when absent.
 *   - Module activation goes ONLY through the merged qualified load() path
 *     (./load.js: static qualification → fail-closed issuer trust gate →
 *     whole-closure byte preflight → physical import → module
 *     self-identity). This file never imports sealed module bytes itself,
 *     never constructs `data:` URLs and never decodes base64 payload bytes.
 *   - The scoped facade exposes EXACTLY send/query/subscribe/stop. The
 *     research surface's `kernelRuntime` accessor, raw journal query,
 *     mechanism-internals query and Host ports are absent; `query` refuses
 *     those kinds typed.
 *
 * What this loader deliberately does NOT contain (KPK-02/03/10/12 heritage):
 * no v0.7 engine import or re-implementation — the physically selected
 * Kernel package owns the entire mechanism; no business special case; no
 * provider discovery or fallback; no runtime recompilation; no second
 * effect runtime (journals/effects exist only inside the wired Kernel);
 * no init-script engine — the #1023 S03 lifecycle hooks are optional
 * module exports of BUILD-sealed packages, called in the sealed
 * BUILD-fixed packages order, and nothing more.
 */
import { type V8CancellationSignal } from './model-port.js';
/** The scoped consumption facade returned by `DomainHarness.load(package)`. */
export interface V8DomainFacade {
    /** Submit one occurrence intent through the wired Kernel mechanism. */
    send(intent: unknown): Promise<unknown>;
    /** Scoped queries: `{kind:'instance'}` and `{kind:'build'}` only. */
    query(query: unknown): Promise<unknown>;
    /** Observe receipts; returns the unsubscribe function. */
    subscribe(observer: (receipt: unknown) => void): () => boolean;
    /** Stop the facade scope: observers cleared, further use fails typed. */
    stop(): void;
}
/**
 * The Host-verified principal the private gateway seam binds into Kernel
 * requests (#1013, I02). Every field originates from an issuer-signed
 * credential verified by the trusted Host — a caller-declared `caller.role`
 * can never construct one of these.
 */
export interface V8GatewayPrincipal {
    readonly subject: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly roles: readonly string[];
}
/**
 * Protected, request-scoped occurrence control (#1003 FR07-KH2, B3). Only
 * the H-authenticated kernel gateway constructs one (per `send`); it rides
 * BESIDE the plain-JSON Kernel request — never inside intent data — and the
 * selected Kernel owns the cancellation latch the signal drives.
 */
export interface V8OccurrenceControl {
    readonly signal: V8CancellationSignal;
}
/**
 * Private, Host-gateway-only Kernel operations on a loaded facade
 * (#1013, I02/I03). NOT re-exported from the public `/v8` surface: the UX
 * consumer never sees this object; the trusted Host kernel gateway
 * (host-v8/kernel-gateway.ts) retrieves it right after the public one-arg
 * `DomainHarness.load(package)` and binds an AUTHENTICATED principal to
 * every Kernel request. There is no raw Kernel namespace, no raw Journal
 * and no generic second Runtime on this seam.
 *
 * #1013 review repair (@6117218727 Candidate A): every physical Kernel
 * instance address is QUALIFIED by the authenticated principal's
 * tenant/app — `${tenantId}:${appId}:${instanceKey}` — so two distinct
 * tenants addressing the same appId/instanceKey resolve to two DISTINCT
 * physical Kernel instances (state, Journal, effects and receipts are
 * namespace-isolated by construction, never by caller discipline).
 */
export interface V8FacadeKernelOps {
    /** Identity of the loaded Business policy (routing/provisioning metadata). */
    describePolicy(): {
        readonly packageId: string;
        readonly policyId: string;
        readonly workflowKey: string;
        readonly intentTypes: readonly string[];
    };
    /**
     * Submit one occurrence as the H-authenticated principal. The caller
     * record bound into the Kernel request is derived ONLY from the
     * issuer-signed roles ∩ the sealed Business binding roles; intent data
     * cannot carry a caller. The physical instance address is the
     * tenant/app-qualified key of the authenticated principal. The optional
     * `control` (#1003 FR07-KH2) is forwarded to the Kernel unchanged.
     */
    submitAs(principal: V8GatewayPrincipal, request: {
        readonly intentType: string;
        readonly messageId: string;
        readonly instanceKey: string;
        readonly input?: unknown;
    }, control?: V8OccurrenceControl): Promise<unknown>;
    /** Scoped instance read for the authenticated principal's tenant/app. */
    queryInstance(principal: V8GatewayPrincipal, instanceKey: string): Promise<unknown>;
    /**
     * The physical Kernel `workflowInstanceId` the tenant/app-qualified
     * address resolves to (`${workflowKey}:${tenantId}:${appId}:${key}`) —
     * the single source of the receipt-filter address shared by send,
     * Genesis and subscriptions.
     */
    workflowInstanceId(principal: V8GatewayPrincipal, instanceKey: string): string;
    /**
     * Observe Kernel receipts for this scope (trusted gateway use; the
     * public facade `subscribe` is closed — #1013 @6117218727 Candidate B).
     * Returns the unsubscribe function.
     */
    observeReceipts(observer: (receipt: unknown) => void): () => boolean;
    /**
     * Protected Genesis activation (#1013, I03): open the FIRST instance of
     * the loaded Business package at the authenticated principal's
     * tenant/app-qualified address. The initial state/context are owned by
     * the sealed Business policy — the request cannot choose initial
     * authority or state, and no raw `openInstance` handle escapes.
     */
    provisionGenesis(principal: V8GatewayPrincipal, request: {
        readonly instanceKey: string;
        readonly correlationId?: string;
    }): Promise<unknown>;
}
/**
 * Validate the gateway session channel WITHOUT consuming it (#1013 R2): the
 * Host bootstrap preflights this channel alongside every other one-shot
 * channel before committing any installation. Internal protected.
 */
export declare function preflightGatewaySessionCap(): void;
/**
 * Install the gateway session capability for this process. Internal
 * protected bootstrap (`bootstrapTrustedHost` only): one-shot, and the
 * capability value must be an unguessable host-generated string so a
 * consumer can never brute-force or guess its way past the seam.
 */
export declare function installGatewaySessionCap(cap: unknown): void;
/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export declare function isGatewaySessionCapInstalled(): boolean;
/**
 * Retrieve the private Kernel operations of a facade produced by
 * `DomainHarness.load(package)` in THIS process (#1013, I02/I03). Returns
 * `undefined` for anything that is not such a facade. Trusted Host gateway
 * use only: the caller must present the EXACT gateway session capability
 * installed by `bootstrapTrustedHost` — a process without one fails closed
 * (`GATEWAY_SESSION_NOT_INSTALLED`) and a wrong or absent capability is
 * refused typed (`GATEWAY_SESSION_DENIED`) before any Kernel operation,
 * observer or address is reachable. Deep-importing this module grants no
 * authority: the capability never exists in this module's exports, only in
 * the trusted Host bootstrap's closure.
 */
export declare function getFacadeKernelOps(facade: object, sessionCap?: unknown): V8FacadeKernelOps | undefined;
/**
 * Public consumption brand (#994 heritage): `const facade =
 * await DomainHarness.load(package)`. The brand object is frozen and its
 * loader is the strictly one-argument scoped-facade loader above — the
 * qualified installation proof surface (`load`, T-A) and this consumption
 * entry are distinct public symbols of the `/v8` subpath.
 */
export declare const DomainHarness: Readonly<{
    readonly load: (packageRoot: unknown) => Promise<V8DomainFacade>;
}>;
//# sourceMappingURL=microkernel.d.ts.map