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
import { QualifiedPackageError } from './contracts.js';
let kernelHost;
/**
 * #1013 R2 fresh review @5494026032 (NEW_P1_01): the same session-capability
 * boundary the gateway ops seam already enforces (microkernel.ts, @6122817203).
 * The packed npm distribution ships this module's compiled sibling next to the
 * public entry, and stock Node resolves an absolute `file:` URL past any
 * package-exports map — so "not re-exported" alone is NOT an enforceable
 * boundary for `currentKernelHostPorts`. The installed ports are therefore
 * stored TOGETHER with the bootstrap-minted unguessable session capability,
 * and the getter refuses typed before the port object is ever returned unless
 * the caller presents the exact capability. The capability value exists only
 * in the trusted Host bootstrap's closure and the trusted Host kernel gateway.
 */
let kernelHostSessionCap;
function isCallable(value) {
    return typeof value === 'function';
}
function isUnguessableSessionCap(cap) {
    return typeof cap === 'string' && cap.length >= 32 && cap.length <= 256;
}
/**
 * Constant-time equality for the session capability (fixed-length host
 * random; pure JS on purpose — this module stays free of byte-decoding
 * machinery by static proof).
 */
function sessionCapMatches(cap) {
    if (kernelHostSessionCap === undefined || typeof cap !== 'string' || cap.length !== kernelHostSessionCap.length) {
        return false;
    }
    let diff = 0;
    for (let index = 0; index < cap.length; index += 1) {
        diff |= cap.charCodeAt(index) ^ kernelHostSessionCap.charCodeAt(index);
    }
    return diff === 0;
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
export function preflightKernelHostPorts(ports, sessionCap) {
    if (kernelHost !== undefined) {
        throw new QualifiedPackageError('KERNEL_HOST_ALREADY_INSTALLED', 'kernel Host ports are already installed in this process; the protected kernel Host channel is one-shot');
    }
    if (typeof ports !== 'object' || ports === null) {
        throw new QualifiedPackageError('KERNEL_HOST_INVALID', 'installKernelHostPorts requires the COMPLETE ports object {docs:{get,put,list}, sha256:{digestUtf8}, resources:{call}, clock} (#1013 I01: no partial install)');
    }
    const candidate = ports;
    const docs = candidate.docs;
    const sha256 = candidate.sha256;
    const resources = candidate.resources;
    if (typeof docs !== 'object'
        || docs === null
        || !isCallable(docs.get)
        || !isCallable(docs.put)
        || !isCallable(docs.list)
        || !isCallable(docs.remove)
        || typeof sha256 !== 'object'
        || sha256 === null
        || !isCallable(sha256.digestUtf8)) {
        throw new QualifiedPackageError('KERNEL_HOST_INVALID', 'kernel Host ports must provide docs.get, docs.put, docs.list, docs.remove and sha256.digestUtf8 callables (the COMPLETE selected-K set; a minimal get/put tuple is not an installable production configuration)');
    }
    if (typeof resources !== 'object'
        || resources === null
        || !isCallable(resources.call)
        || !isCallable(resources.callScoped)) {
        throw new QualifiedPackageError('KERNEL_HOST_INVALID', 'kernel Host ports must provide resources.call and resources.callScoped callables (physical Business effect dispatch plus the #1023 S05 R1 scoped-physical route; #1013 I01 complete-set contract)');
    }
    if (!isCallable(candidate.clock)) {
        throw new QualifiedPackageError('KERNEL_HOST_INVALID', 'kernel Host ports must provide a clock callable returning an ISO timestamp (trusted Kernel timestamps; #1013 I01 complete-set contract)');
    }
    if (!isUnguessableSessionCap(sessionCap)) {
        throw new QualifiedPackageError('KERNEL_HOST_SESSION_CAP_INVALID', 'installKernelHostPorts requires the bootstrap-minted unguessable session capability string (32–256 chars) that gates currentKernelHostPorts (#1013 R2 @5494026032: raw ports can never be installed without their boundary)');
    }
}
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
export function installKernelHostPorts(ports, sessionCap) {
    preflightKernelHostPorts(ports, sessionCap);
    const candidate = ports;
    const docs = candidate.docs;
    const sha256 = candidate.sha256;
    const resources = candidate.resources;
    kernelHost = Object.freeze({
        docs: Object.freeze({
            get: docs.get,
            put: docs.put,
            list: docs.list,
            remove: docs.remove,
        }),
        sha256: Object.freeze({
            digestUtf8: sha256.digestUtf8,
        }),
        resources: Object.freeze({
            call: resources.call,
            callScoped: resources.callScoped,
        }),
        clock: candidate.clock,
    });
    // preflightKernelHostPorts already proved the capability is a string.
    kernelHostSessionCap = sessionCap;
}
/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export function isKernelHostInstalled() {
    return kernelHost !== undefined;
}
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
export function currentKernelHostPorts(sessionCap) {
    if (kernelHost === undefined) {
        throw new QualifiedPackageError('KERNEL_HOST_NOT_INSTALLED', 'no kernel Host ports are installed in this process (protected Host bootstrap not established); the loader fails closed and never invents a substitute effect runtime');
    }
    if (!sessionCapMatches(sessionCap)) {
        throw new QualifiedPackageError('KERNEL_HOST_SESSION_DENIED', 'the installed kernel Host ports require the bootstrap session capability; structural module access carries no authority over the physical CAS store or kernel-effect resource dispatch (#1013 R2 @5494026032)');
    }
    return kernelHost;
}
//# sourceMappingURL=kernel-host.js.map