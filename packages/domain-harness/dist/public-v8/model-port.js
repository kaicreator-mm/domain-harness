/**
 * v0.8 trusted Host ModelPort channel — INTERNAL protected (#1013, I04).
 * =======================================================================
 *
 * FR08: a selected Standard-SDK package may mark model-call evidence
 * `measured(count)` ONLY for invocations physically observed through a
 * Host-provisioned ModelPort binding. The factory on the SDK side
 * (`createHostBoundModelResolver`, T-D) explicitly does not authenticate
 * Host authority — the trust comes from HERE: a one-shot, governance/
 * Host-bootstrap-only installation that is never re-exported from the
 * public `@kaicreator/domain-harness/v8` surface (same protection pattern
 * as kernel-host.ts and trust.ts).
 *
 * Who may install: `bootstrapTrustedHost` (host-v8/bootstrap.ts), carrying
 * a deployment-provisioned port object. A process that installed nothing
 * resolves NO port — the loader then wires the SDK's plain `interpret` and
 * model-call evidence stays honestly `unsupported`/`unmeasured`. There is
 * deliberately no synthetic measured-zero anywhere on this path.
 */
import { QualifiedPackageError } from './contracts.js';
let hostModelPort;
/**
 * #1013 R2 fresh review @5494026032 (NEW_P1_02): the same session-capability
 * boundary the gateway ops seam and kernel-host.ts already enforce. The packed
 * npm distribution ships this module's compiled sibling next to the public
 * entry, and stock Node resolves an absolute `file:` URL past any
 * package-exports map — so `currentHostModelPort` must itself refuse the raw
 * `{invoke}` object to a caller without the bootstrap session capability. The
 * port is stored together with the capability and the getter denies typed
 * before the frozen port can be invoked outside the qualified S decision and
 * measurement path.
 */
let hostModelPortSessionCap;
function isDirectCallable(owner, key) {
    // The SDK refuses accessor/getter properties on this field; the channel
    // enforces the same shape at installation so a hostile object cannot pass
    // here and fail later inside sealed module bytes.
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    return descriptor !== undefined
        && Object.hasOwn(descriptor, 'value')
        && typeof descriptor.value === 'function';
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
    if (hostModelPortSessionCap === undefined || typeof cap !== 'string' || cap.length !== hostModelPortSessionCap.length) {
        return false;
    }
    let diff = 0;
    for (let index = 0; index < cap.length; index += 1) {
        diff |= cap.charCodeAt(index) ^ hostModelPortSessionCap.charCodeAt(index);
    }
    return diff === 0;
}
/**
 * Validate a prospective ModelPort installation WITHOUT consuming the
 * one-shot channel (#1013 R1 F-01): occupancy and the direct-callable
 * shape both fail here first, so the Host bootstrap can preflight ALL
 * one-shot channels (trust, kernel, ModelPort) before committing ANY.
 * The session capability is validated with the port (the boundary can
 * never exist without its key). Internal protected; not re-exported from
 * the public `/v8` surface.
 */
export function preflightHostModelPort(port, sessionCap) {
    if (hostModelPort !== undefined) {
        throw new QualifiedPackageError('MODEL_PORT_ALREADY_INSTALLED', 'a Host ModelPort is already installed in this process; the protected ModelPort channel is one-shot');
    }
    if (typeof port !== 'object' || port === null || !isDirectCallable(port, 'invoke')) {
        throw new QualifiedPackageError('MODEL_PORT_INVALID', 'installHostModelPort requires a port object with a direct callable invoke({operation, input}) data property');
    }
    if (!isUnguessableSessionCap(sessionCap)) {
        throw new QualifiedPackageError('MODEL_PORT_SESSION_CAP_INVALID', 'installHostModelPort requires the bootstrap-minted unguessable session capability string (32–256 chars) that gates currentHostModelPort (#1013 R2 @5494026032: a raw port can never be installed without its boundary)');
    }
}
/**
 * Install the trusted Host ModelPort for this process together with the
 * session capability that gates every read back. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed).
 */
export function installHostModelPort(port, sessionCap) {
    preflightHostModelPort(port, sessionCap);
    hostModelPort = Object.freeze({ invoke: port.invoke.bind(port) });
    // preflightHostModelPort already proved the capability is a string.
    hostModelPortSessionCap = sessionCap;
}
/**
 * The installed trusted ModelPort, or `undefined` when this process
 * bootstrapped without one. Absence is a legitimate honest state (FR08:
 * `unsupported`/`unmeasured`), never an error and never a fallback port.
 *
 * #1013 R2 fresh review @5494026032 (NEW_P1_02): with a port installed, the
 * caller must present the EXACT session capability that was installed with
 * it — a wrong or absent capability is refused typed
 * (MODEL_PORT_SESSION_DENIED) before the frozen `{invoke}` object can be
 * reached, so a same-process deep importer can never invoke the model
 * outside the qualified S `model-decision` declaration selection and the
 * truthful per-domain model-call evidence/accounting path. The capability
 * never exists in this module's exports.
 */
export function currentHostModelPort(sessionCap) {
    if (hostModelPort === undefined) {
        return undefined;
    }
    if (!sessionCapMatches(sessionCap)) {
        throw new QualifiedPackageError('MODEL_PORT_SESSION_DENIED', 'the installed Host ModelPort requires the bootstrap session capability; structural module access carries no authority to invoke the model port outside the qualified decision path (#1013 R2 @5494026032)');
    }
    return hostModelPort;
}
//# sourceMappingURL=model-port.js.map