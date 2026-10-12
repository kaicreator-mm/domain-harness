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
 * The H-authenticated caller record the selected Kernel receives on the
 * authenticated UX route (I02, #1013). Every field is derived from the
 * issuer-signed, per-operation-revalidated Host principal; a business
 * payload can never contribute to it. The Kernel's business-owned role
 * gate reads `role` — the only authority this record carries is the
 * issuer-attested one.
 */
export interface KernelPrincipalCaller {
    readonly kind: 'v08-host-principal/1';
    readonly issuerId: string;
    readonly grantId: string;
    readonly subject: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly role: string;
}
/**
 * The protected per-scope Kernel handle the authenticated Host UX transport
 * consumes (I02, #1013). Deep-import only — deliberately NOT re-exported
 * from the public `/v8` surface. It carries exactly the three verbs the UX
 * route needs (submit / scoped instance read / receipt observation): no
 * `openInstance` (protected Genesis, I03), no Journal, no mechanism
 * counters, no Host ports.
 */
export interface V8KernelPrincipalChannel {
    /** Submit one occurrence whose caller is the H-authenticated principal. */
    submitAsPrincipal(intent: unknown, caller: KernelPrincipalCaller): Promise<unknown>;
    /** Scoped instance read through the wired Kernel snapshot endpoint. */
    snapshotForPrincipal(target: unknown): Promise<unknown>;
    /** Observe Kernel receipts; returns the unsubscribe function. */
    observeReceipts(observer: (receipt: unknown) => void): () => boolean;
}
/**
 * Protected accessor (I02, #1013): the kernel principal channel of ONE
 * loaded facade scope. Host-context composition seam for the authenticated
 * UX transport — a foreign object, or a scope that never went through
 * `DomainHarness.load`, fails typed.
 */
export declare function kernelPrincipalChannel(facade: unknown): V8KernelPrincipalChannel;
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