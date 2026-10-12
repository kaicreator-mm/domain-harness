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
 * The generic Host ports the wired Kernel mechanism may consume. Ports are
 * caller-shape-agnostic at the mechanism boundary; this channel only
 * verifies that every required member is a callable.
 *
 * #1013 (I01): the selected Kernel mechanism (`kernel-mechanism-v1.mjs`)
 * additionally consumes journal `docs.list`, `hostPorts.resources` (real
 * effect dispatch) and an optional trusted `clock`. These are OPTIONAL at
 * this channel so pre-existing minimal memory fixtures stay valid installs;
 * the trusted Host bootstrap installs the COMPLETE set.
 */
export interface V8KernelHostPorts {
    readonly docs: {
        readonly get: (key: string) => unknown;
        readonly put: (key: string, value: unknown, conditions?: V8KernelDocsPutConditions) => unknown;
        /** Journal read-back (`list(prefix)`); optional for minimal fixtures. */
        readonly list?: (prefix: string) => unknown;
    };
    readonly sha256: {
        readonly digestUtf8: (value: string) => string;
    };
    /** Physical resource dispatch port handed to Business effect handlers. */
    readonly resources?: object;
    /** Trusted clock (ISO string); the mechanism defaults to wall clock when absent. */
    readonly clock?: () => string;
}
/**
 * Install the kernel Host ports for this process. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed, so a
 * running process can never have its Host storage swapped mid-flight).
 */
export declare function installKernelHostPorts(ports: unknown): void;
/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export declare function isKernelHostInstalled(): boolean;
/**
 * The installed kernel Host ports. Fail-closed: a process that never went
 * through the protected bootstrap has NO Host binding, and the loader
 * refuses with KERNEL_HOST_NOT_INSTALLED instead of falling back to an
 * invented in-memory second runtime.
 */
export declare function currentKernelHostPorts(): V8KernelHostPorts;
//# sourceMappingURL=kernel-host.d.ts.map