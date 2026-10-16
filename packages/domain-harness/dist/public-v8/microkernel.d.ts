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
 * BUILD-fixed packages order, and nothing more. The #1023 S04 callable
 * OperationCall surface adds NO second Runtime either: pure operations
 * dispatch the exact BUILD-bound sealed handler with plain-JSON data only,
 * effectful operations are ordinary authenticated Kernel occurrences
 * (Business admission → Journal → Effect), and the capability-owned
 * physical handlers run only behind the Kernel's effect dispatch as
 * Host-provisioned resource adapters.
 */
import type { JsonSchema } from '../contracts/json.js';
import { type V8CancellationSignal } from './model-port.js';
/** The scoped consumption facade returned by `DomainHarness.load(package)`. */
export interface V8DomainFacade {
    /** Submit one occurrence intent through the wired Kernel mechanism. */
    send(intent: unknown): Promise<unknown>;
    /** Scoped queries: `{kind:'instance'}` and `{kind:'build'}` only. */
    query(query: unknown): Promise<unknown>;
    /** Observe receipts; returns the unsubscribe function. */
    subscribe(observer: (receipt: unknown) => void): () => boolean;
    /**
     * Stop the facade scope. The scope is stopped for further use
     * IMMEDIATELY (synchronous part); the returned promise settles when the
     * reverse-order lifecycle teardown COMPLETES (#1023 S03, R1 P1-01: the
     * stop contract is awaitable — every `dispose(context)` is awaited in
     * reverse sealed order before the next one starts, a failing dispose
     * never aborts the remaining teardown, and the aggregate typed error
     * `LIFECYCLE_DISPOSE_FAILED` REJECTS the promise instead of being
     * swallowed). Repeated stop is one-shot idempotent: the same cached
     * outcome is reported and no teardown runs twice. Callers that ignore
     * the returned promise leave a rejection unobserved — by design, the
     * failure is never silenced.
     */
    stop(): Promise<void>;
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
 * #1023 S04 — one BUILD-fixed callable OperationCall envelope. The
 * capability/operation identity and the plain-JSON input are the ONLY
 * caller-controlled content; an effectful operation additionally carries
 * the occurrence address components (instanceKey/messageId) exactly like an
 * authenticated send. No caller-declared role, principal, verifiedPrincipal
 * or Host port can ride this envelope.
 */
export interface V8OperationCall {
    readonly capabilityId: string;
    readonly operationId: string;
    readonly input?: unknown;
    /** Effectful operations only: the occurrence instance address component. */
    readonly instanceKey?: string;
    /** Effectful operations only: the occurrence dedup/replay identity. */
    readonly messageId?: string;
}
/**
 * #1023 S04 — one trusted-Host physical resource adapter derived from the
 * sealed capability OperationCall ABI: the BUILD-selected capability
 * handlers for one Host resource key, reachable ONLY through the selected
 * Kernel's effect dispatch (`hostPorts.resources`), never from a call.
 */
export interface V8OperationResourceAdapter {
    /** The LOGICAL sealed route key (the Business policy's own declaration). */
    readonly resourceKey: string;
    /**
     * #1023 S05: this activation's injective physical deployment identity,
     * minted by the trusted loader from load-verified closure bytes — never
     * from caller payload, never ambient mutable routing state.
     */
    readonly scopeId: string;
    /** The dispatcher map key: `${scopeId}\u0000${resourceKey}`. */
    readonly physicalResourceKey: string;
    readonly operations: ReadonlyMap<string, (payload: unknown) => unknown>;
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
     *
     * [#1062 shared durable-control seam] The optional `turnSource` is a
     * TRUSTED-HOST-ONLY field: it is constructed by the Host gateway from a
     * durably settled control record (timer/callback/child-terminal), never
     * from caller data — the public `send` verb has no such field and this
     * ops seam is capability-guarded (getFacadeKernelOps). The Kernel
     * validates the shape strictly and derives the deterministic turn id.
     */
    submitAs(principal: V8GatewayPrincipal, request: {
        readonly intentType: string;
        readonly messageId: string;
        readonly instanceKey: string;
        readonly input?: unknown;
        readonly turnSource?: unknown;
    }, control?: V8OccurrenceControl): Promise<unknown>;
    /**
     * [#1066 R1 P1-A] Non-throwing Business-role admission probe of the
     * EXACT pick `submitAs`'s internal role gate makes (an intent without a
     * bound role set admits every authenticated principal, exactly like the
     * submit-time gate's 'anonymous'). The trusted Host gateway uses it to
     * enforce intent authority BEFORE any durable-control settlement CAS —
     * never as a substitute for the submit-time gate, which stays
     * authoritative for every actual Kernel submission.
     */
    roleAdmitted(principal: V8GatewayPrincipal, intentType: string): boolean;
    /** Scoped instance read for the authenticated principal's tenant/app. */
    queryInstance(principal: V8GatewayPrincipal, instanceKey: string): Promise<unknown>;
    /**
     * [#1003 NF06] Authorized read of ONE persisted decision receipt: the
     * authenticated principal's tenant/app-qualified instance plus the exact
     * message (durable control turn). The Kernel owns the reader-role gate
     * (the Business receiptPolicy readerRoles) and the record bytes; this
     * seam forwards only the verified principal — never caller-chosen
     * authority.
     */
    queryDecisionReceipt(principal: V8GatewayPrincipal, request: {
        readonly instanceKey: string;
        readonly messageId: string;
    }): Promise<unknown>;
    /**
     * [#1063 HF20] Authorized read of the ordered durable mutation-observation
     * window riding the principal's tenant/app-qualified instance document:
     * the Kernel alone validates the opaque cursor against the current
     * committed window (stream-bound, never beyond the watermark) and owns
     * the record/page bytes; this seam forwards only the verified principal —
     * never caller-chosen authority, exactly like the NF06 receipt read.
     */
    queryMutationObservations(principal: V8GatewayPrincipal, request: {
        readonly instanceKey: string;
        readonly afterCursor?: string;
        readonly limit?: number;
    }): Promise<unknown>;
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
        /**
         * [#1006 HF21] The registered closure runtime authority class forwarded
         * by the trusted gateway (never genesis-caller data); the Kernel weaves
         * it into the durable GovernanceExecutionPin bindingDigest.
         */
        readonly authorityClass?: 'PRODUCTION' | 'SIMULATION';
    }): Promise<unknown>;
    /**
     * #1023 S04: BUILD-fixed OperationCall dispatch on the protected gateway
     * seam. The exact handler comes from the sealed S02a capability binding
     * matched against the sealed module `OPERATIONS` ABI — no runtime
     * discovery. A pure (`effectClass 'none'`) operation runs the exact
     * handler with the plain-JSON input ONLY (no Host/Kernel port is in
     * scope, no State/Journal/Effect is touched) behind the Business-governed
     * visibility gate. An effectful operation NEVER touches the handler
     * directly: the call traverses the sealed Business intent's role gate and
     * the selected Kernel's submitOccurrence (Admission → Journal → Effect);
     * the capability-owned physical handler runs only behind the Kernel's
     * effect dispatch as the Host-provisioned resource adapter.
     */
    invokeOperation(principal: V8GatewayPrincipal, call: V8OperationCall, control?: V8OccurrenceControl): Promise<unknown>;
    /**
     * #1023 S04: the BUILD-selected physical resource adapters derived from
     * the sealed capability OperationCall ABI — trusted Host wiring input for
     * `registerApp` provisioning ONLY. Never caller-visible.
     */
    operationResourceAdapters(): readonly V8OperationResourceAdapter[];
    /**
     * #1003 HF23: the BUILD-sealed inert operation descriptors, computed for
     * the AUTHENTICATED principal. Discovery metadata only — no handler, no
     * physical resource route, no admission authority; the `agentExposed`
     * marking is sealed BUILD data and `principalAdmitted` mirrors the same
     * Business-bound role pick an actual OperationCall would take.
     */
    describeOperationSurface(principal: V8GatewayPrincipal): readonly V8OperationSurfaceDescriptor[];
    /**
     * #1006 HF29: the BUILD-sealed Tool Call bindings of this closure — the
     * approved local/HTTP JSON binding table every authenticated Tool Call
     * dispatch checks against. Inert sealed metadata only (binding identity,
     * bound digest, exact schemas, Business-governed visibility): no handler
     * ever rides a descriptor — the concrete implementation stays an
     * explicitly provided Host adapter the trusted gateway matches by digest.
     */
    sealedToolBindings(): readonly V8SealedToolBinding[];
    /**
     * #1003 FR05/HF17/HF23: the retained Standard-SDK query/observer/agent
     * projections surfaced for the trusted gateway exactly like the FR08
     * retained decision-source endpoints — additive optional ABI members,
     * wired all-or-none only when the sealed Standard SDK exports all three.
     * Pure inert S projections: H authentication and the Kernel's own reads
     * stay the authority; nothing here mints a revision or admits a call.
     */
    readonly retainedProjection?: {
        /** FR05: deterministic multi-source projection over exact K-attested revision selectors. */
        readonly projectRead: (declaration: unknown, snapshots: unknown) => unknown;
        /** HF17: monotonic-epoch coalescing of delivered revision observations. */
        readonly coalesceObservations: (observations: unknown) => unknown;
        /** HF23: read-only agent tool surface over BUILD-sealed descriptors. */
        readonly projectAgentTools: (operations: unknown) => unknown;
    };
    /**
     * #1006 FR11/HF24: the compiler-produced compiled package data (domainData
     * + businessSources sections and the compiled projection declarations that
     * bind them) that BUILD packed into the sealed Business module bytes —
     * re-validated at this trusted load boundary with the production integrity
     * validators BEFORE any facade or mechanism side effect exists. Optional
     * ABI member, present only when the Business policy carries the section;
     * the read itself stays the sealed Standard SDK's own projection.
     */
    readonly retainedCompiledData?: {
        /** The validated frozen section (inert sealed BUILD data). */
        readonly section: unknown;
        /** The sealed SDK's retained read over that exact section. */
        readonly project: (request: unknown) => unknown;
    };
}
/** The pre-existing effect-class declaration family (L2 successor §4). */
type V8OperationEffectClass = 'none' | 'idempotent' | 'non-idempotent';
/**
 * #1003 HF23 — one BUILD-sealed operation descriptor for an authenticated
 * principal: inert discovery metadata only. No handler, no physical
 * resource route and no admission authority ever rides a descriptor; the
 * `agentExposed` marking is the sealed BUILD approval, and
 * `principalAdmitted` mirrors the same Business-bound role pick a call
 * would take (requirePrincipalRole) without throwing.
 */
export interface V8OperationSurfaceDescriptor {
    readonly capabilityId: string;
    readonly operationId: string;
    readonly effectClass: V8OperationEffectClass;
    /** Pure operations only: the sealed BUILD `agent` approval marking. */
    readonly agentExposed: boolean;
    /** Pure: the sealed Business intent whose bound role set governs visibility. */
    readonly visibilityIntentType?: string;
    /** Effectful: the sealed Business intent that owns central admission. */
    readonly admissionIntentType?: string;
    /** Whether the authenticated principal holds the Business-bound role. */
    readonly principalAdmitted: boolean;
}
/**
 * #1006 R5 HF29 — one BUILD-sealed Tool Call binding descriptor. The sealed
 * capability `TOOLS` ABI table entry behind the Host-owned dispatch port:
 * inert approval metadata (binding identity + bound digest + exact JSON
 * Schemas + the Business intent whose bound role set governs execution).
 * No implementation rides the descriptor — the Host registers the concrete
 * adapter and the dispatch refuses everything but the exact bound digest.
 */
export interface V8SealedToolBinding {
    readonly capabilityId: string;
    readonly toolId: string;
    readonly effectClass: V8OperationEffectClass;
    /** The sealed transport kind (frozen family: host-local / remote-http-json). */
    readonly bindingKind: string;
    /** The sealed binding identity the Host adapter registers under. */
    readonly bindingId: string;
    /** The bound artifact digest a Host adapter must match exactly. */
    readonly bindingDigest: string;
    /** The host capabilities this tool declared it requires. */
    readonly requiredCapabilities: readonly string[];
    /** Exact input JSON Schema (absent = any JSON input). */
    readonly inputSchema?: JsonSchema;
    /** Exact output JSON Schema. */
    readonly outputSchema: JsonSchema;
    /** The sealed Business intent whose issuer-bound role set authorizes a call. */
    readonly visibilityIntentType: string;
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
export {};
//# sourceMappingURL=microkernel.d.ts.map