/**
 * v0.9 published DomainHarness.load(installedRef) dispatch boundary.
 *
 * A caller request MUST run in exactly one selected trusted Host scope,
 * installed by the trusted deployment/Host bootstrap, not chosen by the
 * public caller. There is no process-global iteration over other Host
 * identities: an opaque reference from tenant B cannot cause public load
 * invoked in A's caller context to borrow B's authenticated principal.
 *
 * The published ./v9 entry exports only DomainHarness.load(installedRef).
 * It NEVER exports the Host-context binder, issuer, verifier, Kernel, store,
 * bridge composer or raw module namespace. The protected H independently
 * checks installed reference/audience/issuer/bytes and scope at each call.
 *
 * First qualified selected profile is Node24, whose AsyncLocalStorage keeps
 * the trusted context isolated across concurrent async caller requests.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { DomainHarnessV9Error, V9_PUBLIC_ERROR_CODES } from './errors.js';
import { isV09AuthenticatedBridgeHarness } from './operation-bridge.js';
const callerHost = new AsyncLocalStorage();
const activeHosts = new WeakSet();
function refused() {
    return new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED);
}
/**
 * TRUSTED INTERNAL REGISTRATION — never re-exported from the published SDK.
 * A same-shape object cannot bind itself: only the actual #1036 selected
 * H→K bridge module can mint the module-private WeakSet brand.
 */
export function attachV09TrustedBridge(harness) {
    if (!isV09AuthenticatedBridgeHarness(harness)) {
        throw new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED);
    }
    activeHosts.add(harness);
    let attached = true;
    return () => {
        if (!attached)
            return;
        attached = false;
        activeHosts.delete(harness);
    };
}
/**
 * TRUSTED Host dispatch-only wrapper. Public clients cannot select the Host,
 * inject a presentation or create an AsyncLocalStorage caller scope through
 * DomainHarness.load. The privileged bootstrap must enter its own context
 * after it has authenticated the ambient caller/presentation.
 */
export async function runV09InTrustedHostScope(harness, action) {
    if (!isV09AuthenticatedBridgeHarness(harness) || !activeHosts.has(harness)
        || typeof action !== 'function') {
        throw new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED);
    }
    return callerHost.run(harness, action);
}
/** Exactly one public verb: select ONLY the Host bound to this request. */
export const DomainHarness = Object.freeze({
    async load(installedRef) {
        if (arguments.length !== 1 || typeof installedRef !== 'string' || installedRef.length === 0) {
            throw refused();
        }
        const current = callerHost.getStore();
        if (current === undefined || !activeHosts.has(current)) {
            throw refused(); // no ambient privileged Host => no executable runtime
        }
        const loaded = await current.load(installedRef);
        // The Host-bound facade itself must remain request-scoped. Otherwise
        // a caller could capture another tenant's facade in one request and
        // later invoke send/query/stop under a different Host's authority.
        const requireCurrentHost = () => {
            if (callerHost.getStore() !== current || !activeHosts.has(current)) {
                throw new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.CALLER_SCOPE_DENIED);
            }
        };
        // Every facade verb re-checks the SAME current Host scope at use time and
        // refuses asynchronously: the facade contract is promise-returning, so a
        // denial must be a rejected promise, never a synchronous throw.
        return Object.freeze({
            package: loaded.package,
            async send(intent) {
                requireCurrentHost();
                return loaded.send(intent);
            },
            async query(query) {
                requireCurrentHost();
                return loaded.query(query);
            },
            async subscribe(observer) {
                requireCurrentHost();
                const subscription = await loaded.subscribe(observer);
                return Object.freeze({
                    async unsubscribe() {
                        requireCurrentHost();
                        await subscription.unsubscribe();
                    },
                });
            },
            async stop() {
                requireCurrentHost();
                return loaded.stop();
            },
        });
    },
});
//# sourceMappingURL=runtime-channel.js.map