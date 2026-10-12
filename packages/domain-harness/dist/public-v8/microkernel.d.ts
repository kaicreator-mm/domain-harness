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
 * effect runtime (journals/effects exist only inside the wired Kernel).
 */
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
 * Private, Host-gateway-only Kernel operations on a loaded facade
 * (#1013, I02/I03). NOT re-exported from the public `/v8` surface: the UX
 * consumer never sees this object; the trusted Host kernel gateway
 * (host-v8/kernel-gateway.ts) retrieves it right after the public one-arg
 * `DomainHarness.load(package)` and binds an AUTHENTICATED principal to
 * every Kernel request. There is no raw Kernel namespace, no raw Journal
 * and no generic second Runtime on this seam.
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
     * cannot carry a caller.
     */
    submitAs(principal: V8GatewayPrincipal, request: {
        readonly intentType: string;
        readonly messageId: string;
        readonly instanceKey: string;
        readonly input?: unknown;
    }): Promise<unknown>;
    /** Scoped instance read for the authenticated principal's app. */
    queryInstance(instanceKey: string): Promise<unknown>;
    /**
     * Protected Genesis activation (#1013, I03): open the FIRST instance of
     * the loaded Business package. The initial state/context are owned by the
     * sealed Business policy — the request cannot choose initial authority or
     * state, and no raw `openInstance` handle escapes.
     */
    provisionGenesis(request: {
        readonly instanceKey: string;
        readonly correlationId?: string;
    }): Promise<unknown>;
}
/**
 * Retrieve the private Kernel operations of a facade produced by
 * `DomainHarness.load(package)` in THIS process (#1013, I02/I03). Returns
 * `undefined` for anything that is not such a facade. Trusted Host gateway
 * use only: the object binds H-authenticated principals to Kernel requests
 * and exposes the protected Genesis path — it is never a public surface.
 */
export declare function getFacadeKernelOps(facade: object): V8FacadeKernelOps | undefined;
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