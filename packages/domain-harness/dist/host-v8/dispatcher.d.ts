/**
 * v0.8 trusted Node Host — generic resource dispatcher (T-E, #1004).
 * ====================================================================
 *
 * The Host supplies ONLY generic physical resource dispatch with call
 * accounting and typed physical fault injection (adapted from
 * #994@b9ea4d1 src/host/memory-host.mjs `resources` port). It contains NO
 * business policy: what resources exist and what their operations do is a
 * deployment/host-context decision (provisioned at bootstrap, outside the
 * UX transport surface), never a caller capability.
 *
 * Every dispatch carries the AUTHENTICATED principal (verified credential),
 * so a resource can never mistake caller-declared user data for identity.
 *
 * [#1108 K01 R2 P1] The kernel may thread one kernel-minted per-call
 * attestation object (`DispatchAttestation`) as the DEDICATED trailing
 * argument of `call`/`callScoped` (never the payload, never the dispatch
 * context, never the handler). The dispatcher marks it only for its OWN
 * pre-handler refusals (MALFORMED / NAMESPACE_RESERVED / UNKNOWN) — the sole
 * trusted zero-external-effect proof channel; once a handler runs, nothing
 * is provable and no code string an adapter throws can change that.
 *
 * #1023 S05 — the dispatcher's map keys are PHYSICAL keys. Deployment-owned
 * handlers install under their bare logical key (this module's historical
 * shape); capability-owned adapters install under the INJECTIVE composed
 * `<scopeId>\u0000<logicalKey>` entries the trusted kernel gateway provisions,
 * where the scope is minted per activation by the trusted loader. Two
 * independently approved closures binding the same logical route therefore
 * retain two distinct entries and can never cross-route. The scoped-physical
 * namespace is RESERVED against raw `call` dispatch (#1023 S05 R1 P1-01):
 * naming a composed key by its exact string — from a Business effect handler
 * whose declared route says otherwise, from an adapter-less closure's raw
 * port, or from any other raw-port caller — refuses typed, because the only
 * route into a scoped entry is the trusted per-activation `callScoped`
 * wiring that composes the caller deployment's OWN loader-minted scope.
 */
import type { HostPrincipal } from './identity.js';
/** The authenticated identity attached to every physical dispatch. */
export interface DispatchContext {
    readonly principal: HostPrincipal;
}
export type ResourceHandler = (operation: string, payload: unknown, context: DispatchContext) => unknown;
/**
 * [#1108 K01 R2 P1] The kernel-minted per-call attestation object. The
 * kernel's effect executor mints ONE fresh attestation per resources-port
 * call and threads it as a DEDICATED trailing argument (never inside the
 * payload, never inside the DispatchContext, never forwarded to the resource
 * handler). The dispatcher marks it — synchronously, BEFORE the refusal
 * throws — for its OWN pre-handler refusals only. Anything else a port call
 * throws (adapter/handler faults, fault injection, post-mutation errors
 * carrying any code string, including the dispatcher's own code names) is
 * NEVER attested: a thrown `code` proves nothing about external effects.
 */
export interface DispatchAttestation {
    /** Set only by the trusted dispatcher, only for its own pre-handler refusals. */
    preHandlerRefusal: string | null;
}
export interface ResourceCallRecord {
    readonly resourceKey: string;
    readonly operation: string;
    readonly principalSubject: string;
    readonly principalRoles: readonly string[];
}
export declare class ResourceDispatcher {
    #private;
    /**
     * Host-context retention probe (#1023 S05): the sorted PHYSICAL keys every
     * currently provisioned handler is retained under — the observable
     * registry behind "the Host registers and retains each deployment's
     * unique physical identity". Keys here are the composed
     * `<scopeId>\0<logicalKey>` entries the trusted gateway provisions
     * (capability-owned adapters) plus any deployment-owned bare keys.
     * Read-only diagnostics; never installs, never routes.
     */
    resourceKeys(): readonly string[];
    /** Host-context provisioning (deployment configuration, not caller surface). */
    provision(resourceKey: string, handler: ResourceHandler): void;
    /**
     * All-or-nothing batch provisioning (#1023 S04 R1 P1-01): every key is
     * validated — shape, freedom on this Host and uniqueness inside the batch —
     * BEFORE the first handler installs, and the installs commit in the same
     * synchronous block. A colliding or malformed batch therefore leaves ZERO
     * partial install (the bounded reversible batch the trusted gateway
     * registers app adapters through); a mid-loop throw is structurally
     * impossible because nothing can interleave between the preflight and the
     * commit inside one synchronous call.
     */
    provisionAll(entries: readonly {
        resourceKey: string;
        handler: ResourceHandler;
    }[]): void;
    /** Host-context probe: is a resource key provisioned? Never installs. */
    has(resourceKey: string): boolean;
    /**
     * Host-context rollback of ONE provisioning (#1023 S04 R1 P1-01): removes
     * the key's handler typed, refusing when absent. Deployment/diagnostics
     * surface only — it is never reachable from the UX transport.
     */
    unprovision(resourceKey: string): void;
    /** Physical resource fault: the NEXT call to resourceKey fails after accounting (KPK-06 port). */
    failNextCall(resourceKey: string): void;
    call(resourceKey: string, operation: string, payload: unknown, context: DispatchContext, attest?: DispatchAttestation): Promise<unknown>;
    /**
     * #1023 S05 R1 P1-01: the privileged scoped dispatch. Composes the given
     * deployment scope with the logical key and dispatches the retained
     * capability entry — the ONLY route into the reserved namespace. This
     * method exists on the physical Host boundary for the trusted bootstrap
     * port wiring; the loader's per-activation resources view calls it with
     * the scope it minted itself, and that view never forwards the member to
     * the Kernel mechanism, the Business packages or any caller (the raw ports
     * are additionally session-capability-gated in kernel-host.ts).
     */
    callScoped(scopeId: string, resourceKey: string, operation: string, payload: unknown, context: DispatchContext, attest?: DispatchAttestation): Promise<unknown>;
    /** Call accounting (diagnostics, host context only). */
    calls(): readonly ResourceCallRecord[];
    callCount(): number;
}
//# sourceMappingURL=dispatcher.d.ts.map