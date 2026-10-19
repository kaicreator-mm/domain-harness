/**
 * v0.8 kernel Host binding channel — INTERNAL protected (T-B, #1001).
 * =====================================================================
 *
 * The physically selected Kernel package's mechanism consumes Host ports
 * (immutable docs storage + pinned digest) exactly as the pinned research
 * loader did (#994@b9ea4d1 src/microkernel/load.mjs wiring). The production
 * repair of that research (anti-pattern P1-L2-ABI-02): the loader NEVER
 * accepts Host ports from a caller — `load` is strictly one-argument — so
 * the binding can only be established through this protected internal
 * channel, mirroring the load trust channel (trust.ts): a one-shot,
 * governance/Host-bootstrap-only installation that is never re-exported
 * from the public `@kaicreator/domain-harness/v8` surface.
 *
 * Who may install: the Host bootstrap context that owns physical storage
 * (successor Host-channel task T-E / #1004 wires the physical channel; a
 * process that installed nothing fails closed — the loader refuses with
 * KERNEL_HOST_NOT_INSTALLED before any import). There is deliberately NO
 * second effect runtime here: the channel stores the ports, it never
 * implements journals/effects/state of its own.
 */
/**
 * The write-condition shape the physical Kernel document port accepts. The
 * channel is condition-transparent: it forwards whatever the mechanism passed
 * to the physical store, and a store that refuses unconditional writes stays
 * the authority (a lost CAS expectation can never degrade into an
 * unconditional write at this boundary).
 */
export interface V8KernelDocsPutConditions {
    readonly mustBeAbsent?: true;
    readonly mustMatchRevision?: number;
}
/**
 * [#1108 K01 R2 P1] The kernel-minted per-call dispatch attestation shape
 * (structural twin of the trusted dispatcher's `DispatchAttestation`): the
 * kernel mints one per resources-port call and threads it as a dedicated
 * trailing port argument; the trusted host dispatcher alone may set
 * `preHandlerRefusal`, synchronously before its own pre-handler refusal
 * throws. The port signature keeps the parameter OPTIONAL and structurally
 * typed so the mechanism blob (plain ESM) and alternate hosts stay decoupled
 * — a host that ignores the attestation simply never marks it, and the
 * kernel's proof fails closed.
 */
export interface V8KernelDispatchAttestation {
    preHandlerRefusal: string | null;
}
/**
 * The generic Host ports the wired Kernel mechanism consumes. Ports are
 * caller-shape-agnostic at the mechanism boundary; this channel only
 * verifies that every required member is a callable.
 *
 * #1013 (I01, review repair @6117202798): the selected Kernel mechanism
 * (`kernel-mechanism-v1.mjs`) consumes journal `docs.list`, physical
 * `resources.call` for real Business effect dispatch and the trusted
 * `clock`. The COMPLETE set is REQUIRED at installation — a partial tuple
 * fails typed with KERNEL_HOST_INVALID and installs NOTHING, so a process
 * can never carry a seemingly-installed production Kernel that would
 * silently lack Journal/resource/clock capabilities (#1015 fail-closed
 * contract; no test-only minimal installer exists).
 */
export interface V8KernelHostPorts {
    readonly docs: {
        readonly get: (key: string) => unknown;
        readonly put: (key: string, value: unknown, conditions?: V8KernelDocsPutConditions) => unknown;
        /** Journal read-back (`list(prefix)`). */
        readonly list: (prefix: string) => unknown;
        /**
         * [#1108 K01] Conditional document removal (the admission-fence release
         * path): the store contract never accepts an unconditional delete — the
         * conditions argument is REQUIRED and forwarded verbatim, exactly like
         * `put`. A port without `remove` cannot install: the selected Kernel's
         * fence lifecycle would silently degrade to never-released fences.
         */
        readonly remove: (key: string, conditions: V8KernelDocsPutConditions) => unknown;
    };
    readonly sha256: {
        readonly digestUtf8: (value: string) => string;
    };
    /**
     * Physical resource dispatch port handed to Business effect handlers.
     * #1023 S05 R1 P1-01: `call` refuses the reserved scoped-physical
     * namespace at the dispatcher; `callScoped` is the ONLY route into it and
     * exists for the trusted loader's per-activation resources view alone —
     * the view the loader hands the Kernel mechanism never forwards it, so no
     * package or caller can present a scope.
     * [#1108 K01 R2 P1]: both members take an OPTIONAL trailing kernel-minted
     * dispatch attestation (never the payload, never a handler-visible
     * context). The attestation is marked ONLY by the trusted dispatcher for
     * its own pre-handler refusals; an attestation parameter is a proof
     * SINK, not a proof source — a caller-provided object can never mint a
     * refusal marking it did not earn.
     */
    readonly resources: {
        readonly call: (resourceKey: string, operation: string, payload: unknown, attest?: V8KernelDispatchAttestation) => unknown;
        readonly callScoped: (scopeId: string, resourceKey: string, operation: string, payload: unknown, attest?: V8KernelDispatchAttestation) => unknown;
    };
    /** Trusted clock (ISO string) used for Kernel instance/journal timestamps. */
    readonly clock: () => string;
}
/**
 * Validate a prospective kernel Host ports installation WITHOUT consuming
 * the one-shot channel (#1013 R1 F-01): occupancy and the COMPLETE port
 * shape are both checked here first, so the Host bootstrap can preflight
 * ALL one-shot channels (trust, kernel, ModelPort) before committing ANY.
 * The session capability is validated with the ports (the boundary can
 * never exist without its key). Internal protected; not re-exported from
 * the public `/v8` surface.
 */
export declare function preflightKernelHostPorts(ports: unknown, sessionCap: unknown): void;
/**
 * Install the kernel Host ports for this process together with the session
 * capability that gates every read back. Internal protected bootstrap:
 * one-shot (a second installation attempt fails typed, so a running process
 * can never have its Host storage swapped mid-flight).
 *
 * The COMPLETE bounded port set is required: `docs.get/put/list`,
 * `sha256.digestUtf8`, `resources.call` and `clock`. A minimal
 * `{docs:{get,put}, sha256}` tuple is refused typed BEFORE anything is
 * installed — an incomplete production install can never exist.
 */
export declare function installKernelHostPorts(ports: unknown, sessionCap: unknown): void;
/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export declare function isKernelHostInstalled(): boolean;
/**
 * The installed kernel Host ports. Fail-closed: a process that never went
 * through the protected bootstrap has NO Host binding, and the loader
 * refuses with KERNEL_HOST_NOT_INSTALLED instead of falling back to an
 * invented in-memory second runtime.
 *
 * #1013 R2 fresh review @5494026032 (NEW_P1_01): with ports installed, the
 * caller must additionally present the EXACT session capability that was
 * installed with them — a wrong or absent capability is refused typed
 * (KERNEL_HOST_SESSION_DENIED) before the raw `{docs, resources}` object —
 * uncredentialed physical CAS access and kernel-effect resource dispatch —
 * can ever escape to a same-process deep importer. The capability never
 * exists in this module's exports; only the trusted Host bootstrap closure
 * and the loader's module-private channel hold it.
 */
export declare function currentKernelHostPorts(sessionCap?: unknown): V8KernelHostPorts;
//# sourceMappingURL=kernel-host.d.ts.map