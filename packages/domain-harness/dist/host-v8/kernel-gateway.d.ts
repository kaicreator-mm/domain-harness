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
 *     and re-registering the SAME closure after a restart is idempotent.
 *     The registration is ATOMIC (#1023 S04 R1 P1-01): the capability
 *     resource adapters install as one all-or-nothing batch BEFORE the
 *     durable pin commit, and ANY post-load failure rolls the batch back,
 *     awaits the facade's S03 lifecycle teardown and leaves no pin, no
 *     partial adapter and no live facade behind;
 *   - K-receipt subscriptions re-authenticate the credential on EVERY
 *     delivery and silently stop when the grant is no longer valid;
 *   - cancellation (#1003 FR07-KH2, B3) is request-scoped and
 *     H-authenticated: every `send` mints ONE AbortController whose signal
 *     rides beside the Kernel request as the protected occurrence control;
 *     `cancel` re-authenticates, applies the same tenant/app scope gate and
 *     aborts only an in-flight occurrence the SAME principal subject
 *     submitted (any other id, or another subject's, answers
 *     `not-in-flight` alike). The signal carries no authority — the selected Kernel owns
 *     the latch, and a cancel arriving after K closed it for admission
 *     cannot split the authoritative occurrence.
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
    /**
     * [#1062] Roles allowed to run the protected durable-control governance
     * verbs (external-work registration, deadline firing, recovery). Defaults
     * to genesisRoles when omitted. Host governance configuration — never
     * caller data.
     */
    readonly controlRoles?: readonly string[];
    /**
     * [#1006 HF21] The runtime authority class of the installed closure:
     * exactly 'PRODUCTION' or 'SIMULATION'. Host governance configuration —
     * never caller data. When declared, every Genesis activation of this app
     * binds the class into the durable Kernel GovernanceExecutionPin (woven
     * into its bindingDigest), and a SIMULATION instance can never mint
     * authoritative production Effect/Journal. The declaration is pinned in
     * the durable app-registration record, so a restart re-registration under
     * the OTHER class refuses typed before load. Omitted = the historical
     * classless compatibility boundary (pre-HF21 behavior, product
     * disposition pending).
     */
    readonly authorityClass?: 'PRODUCTION' | 'SIMULATION';
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
/** Request-scoped cancellation request (#1003 FR07-KH2). */
export interface KernelGatewayCancelRequest {
    readonly target: UxTarget;
    readonly messageId: string;
}
/**
 * #1023 S04 — one authenticated BUILD-fixed OperationCall through the
 * gateway. Pure operations carry only the capability/operation identity
 * and plain-JSON input; effectful operations additionally carry the
 * occurrence address components exactly like an authenticated send.
 */
export interface KernelGatewayOperationCall {
    readonly appId: string;
    readonly capabilityId: string;
    readonly operationId: string;
    readonly input?: unknown;
    /** Effectful operations only: the occurrence instance address component. */
    readonly instanceKey?: string;
    /** Effectful operations only: the occurrence dedup/replay identity. */
    readonly messageId?: string;
}
/**
 * `cancel-requested`: the in-flight occurrence's signal was raised — the
 * `send` receipt stays the authoritative outcome (`terminated`/CANCELLED, or
 * `admitted` when K had already closed its latch for admission).
 * `not-in-flight`: nothing of this principal is running under that id.
 */
export interface KernelGatewayCancelResult {
    readonly status: 'cancel-requested' | 'not-in-flight';
}
/**
 * #1003 FR05 — one credentialed multi-source projection read. Every
 * dependency source is read through the SAME authenticated K read as
 * `queryInstance` (each at the caller principal's tenant/app-qualified
 * address), pinned to the exact K-attested `stateRevision` the caller
 * projected (`rev-<n>`), and handed to the sealed Standard SDK's retained
 * `projectRetainedRead` — a deterministic, fail-closed projection proposal.
 */
export interface KernelGatewayProjectionDependency {
    /** Projection-local source name (unique, ':'-free). */
    readonly name: string;
    /** The instance address component, qualified by the authenticated principal. */
    readonly instanceKey: string;
    /** The pinned K-attested revision the projection requires (`rev-<n>`). */
    readonly expectedRevision: string;
}
export interface KernelGatewayProjectionRequest {
    readonly appId: string;
    readonly projectionId: string;
    readonly dependencies: readonly KernelGatewayProjectionDependency[];
    /** Output name → declared source name (the S projection field map). */
    readonly fields: Readonly<Record<string, string>>;
}
/**
 * #1003 HF17 — one live non-durable latest observer. The reconnect contract
 * is exactly `Query latest → create a NEW non-durable subscription session`:
 * no durable cursor, no offset replay, no journal-backed resume and no
 * subscription state in any store. Receipts that land while no session
 * exists are gone by contract (HF20 durability is a separate K-retention
 * row). Every delivery re-authenticates the credential; a revoked grant or
 * a persistently failing listener stops the session fail-closed.
 */
export interface KernelGatewayLatestObserverScope {
    readonly appId: string;
    readonly instanceKey: string;
}
/** One coalesced live update: the newest K-attested revision observed. */
export interface KernelGatewayLatestObserverUpdate {
    readonly revision: string;
    readonly snapshot: unknown;
}
export type KernelGatewayLatestObserverStatus = 'live' | 'credential-stopped' | 'listener-failed' | 'read-failed' | 'closed';
export interface KernelGatewayLatestObserver {
    /** The Query-latest snapshot the session opened at (null before Genesis). */
    readonly latest: unknown;
    status(): KernelGatewayLatestObserverStatus;
    unsubscribe(): void;
}
/**
 * #1003 HF23 — the result of one credentialed agent tool-surface read:
 * exactly the BUILD `agent`-approved PURE operations this principal's
 * Business-bound roles may call. Inert discovery metadata only — no
 * handler, no route and no mutation authority; effectful operations never
 * enter the surface (the seal refuses the marking), and a discovered tool
 * stays callable only through the S04 protected OperationCall route.
 */
export interface KernelGatewayAgentToolQueryResult {
    readonly kind: 'agent-tool-query';
    readonly appId: string;
    readonly tools: readonly {
        readonly capabilityId: string;
        readonly operationId: string;
        readonly effectClass: 'none';
        readonly authority: string;
    }[];
    readonly projectionAuthority: string;
}
export interface KernelGateway {
    /** Host-context provisioning: load + bind one approved Domain App. */
    registerApp(input: KernelGatewayAppInput): Promise<void>;
    /** Whether an app closure is registered for the appId (routing probe). */
    hasApp(appId: string): boolean;
    /** Authenticated send through the REAL selected Kernel of the app. */
    send(credential: unknown, intent: KernelGatewaySendIntent): Promise<unknown>;
    /**
     * #1023 S04: authenticated BUILD-fixed OperationCall. Every call
     * re-authenticates the credential and scope-gates the authenticated
     * principal's app exactly like send; pure operations dispatch the exact
     * sealed handler, effectful operations traverse the same unbypassable
     * Business admission + Kernel occurrence path as send.
     */
    invokeOperation(credential: unknown, request: KernelGatewayOperationCall): Promise<unknown>;
    /** Authenticated, request-scoped cancellation of the principal's own in-flight send. */
    cancel(credential: unknown, request: KernelGatewayCancelRequest): Promise<KernelGatewayCancelResult>;
    /** Authenticated scoped instance read (K getSnapshot). */
    queryInstance(credential: unknown, target: UxTarget): Promise<unknown>;
    /**
     * [#1003 NF06] Authenticated scoped decision-receipt read: ONE persisted
     * record of the exact message turn, through the same K authority that
     * appended it (Business-declared reader roles gate the Kernel side).
     */
    queryDecisionReceipt(credential: unknown, request: UxTarget & {
        readonly messageId: string;
    }): Promise<unknown>;
    /**
     * [#1063 HF20] Authenticated scoped mutation-observation read: the ordered
     * committed-mutation window riding the principal's tenant/app-qualified
     * instance document, through the same K authority that commits it (opaque
     * K-validated cursor; restart-resumable on the same physical storage).
     * Requires a host-configured control role — an ordinary authenticated
     * reader (one who may send and queryInstance) is NOT a mutation-
     * observation reader.
     */
    queryMutationObservations(credential: unknown, request: UxTarget & {
        readonly afterCursor?: string;
        readonly limit?: number;
    }): Promise<unknown>;
    /** Authenticated subscribe to Kernel receipts; revalidated per delivery. */
    subscribe(credential: HostCredential, scope: KernelReceiptScope, listener: (receipt: unknown) => void): Promise<KernelReceiptSubscription>;
    /**
     * [#1003 FR05] Authenticated multi-source projection read: every source
     * resolves through the authenticated principal's qualified K read, the
     * exact K-attested revisions are pinned by the caller, and the sealed
     * Standard SDK's retained `projectRetainedRead` yields the inert
     * projection candidate (fail-closed on any stale/missing source).
     */
    queryProjection(credential: unknown, request: KernelGatewayProjectionRequest): Promise<unknown>;
    /**
     * [#1003 HF17] Authenticated latest-then-subscribe observer: ONE Query
     * latest opens the session, then a NEW non-durable subscription delivers
     * coalesced live revision updates (the sealed SDK's retained
     * `coalesceRetainedObservations` collapses same-subject observations to
     * the newest). Non-durable by contract; every delivery re-authenticates.
     */
    observeLatest(credential: HostCredential, scope: KernelGatewayLatestObserverScope, listener: (update: KernelGatewayLatestObserverUpdate) => void): Promise<KernelGatewayLatestObserver>;
    /**
     * [#1003 HF23] Authenticated agent tool-surface discovery: exactly the
     * BUILD `agent`-approved PURE operations the principal's Business-bound
     * roles may call, projected by the sealed SDK's retained
     * `projectAgentTools`. Discovery grants nothing — mutations stay on the
     * central occurrence path (`send` / effectful OperationCall).
     */
    queryAgentTools(credential: unknown, request: {
        readonly appId: string;
    }): Promise<KernelGatewayAgentToolQueryResult>;
    /** Protected Genesis activation (host-configured role authority). */
    activateGenesis(credential: unknown, request: {
        readonly appId: string;
        readonly instanceKey: string;
        readonly correlationId?: string;
    }): Promise<unknown>;
    /**
     * [#1062 HF18] Protected durable external-work registration: ONE
     * deadline+callback correlation bound to the principal's tenant/app
     * instance, with the SEALED Business intents the settled turn will
     * submit. Requires a host-configured control role and DURABLE physical
     * storage — a non-durable host refuses typed BEFORE any mutation.
     */
    registerExternalWork(credential: unknown, request: {
        readonly appId: string;
        readonly instanceKey: string;
        readonly externalCorrelationId: string;
        readonly deadlineTimerId: string;
        readonly dueAt: string;
        readonly callbackIntentType: string;
        readonly timeoutIntentType: string;
    }): Promise<unknown>;
    /**
     * [#1062 HF18] ONE authenticated external callback delivery. The durable
     * CAS state machine admits exactly ONE winning delivery; its deterministic
     * callback turn source is submitted through the SAME authenticated Kernel
     * seam as send. Duplicates/late/misbound deliveries answer typed outcomes
     * with ZERO Kernel activity.
     */
    acceptExternalCallback(credential: unknown, request: {
        readonly appId: string;
        readonly instanceKey: string;
        readonly externalCorrelationId: string;
        readonly callbackOrdinal: number;
        readonly payload?: unknown;
    }): Promise<unknown>;
    /**
     * [#1062 HF18] ONE authenticated deadline fire (host scheduler / operator
     * driven). Early fires and foreign timers refuse typed; the one-shot
     * winner submits the timer turn through the authenticated Kernel seam.
     */
    fireDeadline(credential: unknown, request: {
        readonly appId: string;
        readonly instanceKey: string;
        readonly externalCorrelationId: string;
        readonly timerId: string;
        readonly fireOrdinal: number;
    }): Promise<unknown>;
    /**
     * [#1062 HF18] Authenticated read of ONE durable external-work record
     * (the persisted correlation/deadline truth; survives restarts).
     */
    queryExternalWork(credential: unknown, request: {
        readonly appId: string;
        readonly instanceKey: string;
        readonly externalCorrelationId: string;
    }): Promise<unknown>;
    /**
     * [#1062 HF18] Caller-driven recovery (control role; NOT a scheduler):
     * fires the due waiting deadlines and re-submits every settled record
     * whose Kernel turn submission may have been lost. The stable turn
     * identity makes every heal an idempotent Kernel replay.
     */
    recoverDurableControls(credential: unknown, request: {
        readonly appId: string;
    }): Promise<unknown>;
    /**
     * [#1006 HF16] Protected durable POISON-RECOVERY authorization: a
     * host-configured control role durably authorizes ONE corrective recovery
     * action for an exact poisoned message of the principal's tenant/app
     * instance, binding the sealed Business intent and corrective input the
     * recovery turn will submit. Durable physical storage required; the same
     * material re-authorizes idempotently, different material for the same
     * poison is a typed identity conflict.
     */
    authorizePoisonRecovery(credential: unknown, request: {
        readonly appId: string;
        readonly instanceKey: string;
        readonly poisonMessageId: string;
        readonly intentType: string;
        readonly input: Record<string, unknown>;
        readonly reason: string;
    }): Promise<unknown>;
    /**
     * [#1006 HF16] ONE authenticated poison-recovery delivery. Only a
     * principal admitted to the bound Business intent may deliver (the
     * settlement submits a real turn); the durable CAS state machine admits
     * exactly ONE winning delivery and every redelivery is an idempotent
     * Kernel turn-disposition replay with zero doubled State/Effect.
     */
    deliverPoisonRecovery(credential: unknown, request: {
        readonly appId: string;
        readonly instanceKey: string;
        readonly poisonMessageId: string;
    }): Promise<unknown>;
    /**
     * [#1062 HF32] ONE authenticated durable child-send: the invocation
     * record is created pending, the child message turn submits through the
     * SAME authenticated Kernel seam as send (riding the shared non-message
     * turn source for deterministic replay), and the outcome settles
     * durably — `accepted`, or `rejected_routed` with the PERMANENT
     * rejection committed BEFORE any route selection (a rejected invocation
     * is never retried; an infrastructure failure leaves it pending for a
     * bounded re-send).
     */
    sendChildMessage(credential: unknown, request: {
        readonly appId: string;
        readonly parentInstanceKey: string;
        readonly childInstanceKey: string;
        readonly childIntentType: string;
        readonly doneIntentType: string;
        readonly errorIntentType: string;
        readonly input?: unknown;
        readonly invocationOrdinal?: number;
    }): Promise<unknown>;
    /**
     * [#1062 HF32] ONE authenticated correlated child terminal. The durable
     * CAS state machine routes the terminal to its parent EXACTLY once (the
     * winning child-terminal turn source submits through the authenticated
     * Kernel seam); duplicate terminals, foreign targets and terminals on
     * non-accepted invocations refuse typed with ZERO Kernel activity.
     */
    deliverChildTerminal(credential: unknown, request: {
        readonly appId: string;
        readonly parentInstanceKey: string;
        readonly childInstanceKey: string;
        readonly invocationOrdinal: number;
        readonly terminalKind: 'done' | 'error';
        readonly input?: unknown;
    }): Promise<unknown>;
    /**
     * [#1062 HF32] Authenticated read of ONE durable child-invocation record
     * (the persisted accepted/rejected/terminal truth).
     */
    queryChildInvocation(credential: unknown, request: {
        readonly appId: string;
        readonly parentInstanceKey: string;
        readonly childInstanceKey: string;
        readonly invocationOrdinal: number;
    }): Promise<unknown>;
}
export declare function createKernelGateway(input: {
    readonly host: TrustedNodeHost;
    readonly gatewaySessionCap: string;
}): KernelGateway;
/**
 * Bridge a Kernel receipt into the Host scoped event hub shape (host-context
 * publishing convenience; the receipt is inert data at this boundary).
 */
export declare function kernelReceiptAsHostEvent(tenantId: string, appId: string, instanceKey: string, receipt: unknown, emittedAt: string): HostEvent;
//# sourceMappingURL=kernel-gateway.d.ts.map