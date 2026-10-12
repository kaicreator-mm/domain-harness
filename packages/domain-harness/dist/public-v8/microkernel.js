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
import { QualifiedPackageError } from './contracts.js';
import { currentKernelHostPorts } from './kernel-host.js';
import { load } from './load.js';
/** Non-enumerable carrier key: the channel never appears on the facade keys. */
const kernelPrincipalChannelKey = Symbol('v8.kernelPrincipalChannel');
/**
 * Protected accessor (I02, #1013): the kernel principal channel of ONE
 * loaded facade scope. Host-context composition seam for the authenticated
 * UX transport — a foreign object, or a scope that never went through
 * `DomainHarness.load`, fails typed.
 */
export function kernelPrincipalChannel(facade) {
    if (typeof facade !== 'object'
        || facade === null
        || !(kernelPrincipalChannelKey in facade)
        || typeof facade[kernelPrincipalChannelKey] !== 'object') {
        throw new QualifiedPackageError('KERNEL_CHANNEL_ABSENT', 'the given object is not a DomainHarness.load facade scope; the protected kernel principal channel exists only on a live loaded scope');
    }
    const channel = facade[kernelPrincipalChannelKey];
    if (channel === undefined || channel === null || typeof channel !== 'object') {
        throw new QualifiedPackageError('KERNEL_CHANNEL_ABSENT', 'the given object is not a DomainHarness.load facade scope; the protected kernel principal channel exists only on a live loaded scope');
    }
    return channel;
}
function typedError(code, message) {
    return new QualifiedPackageError(code, message);
}
/**
 * Structurally validate ONE generic intent (ported from #994@b9ea4d1
 * contracts.mjs): JSON-only, no functions/symbols/handles — intents are
 * data and can never carry ports or callables across the transport scope.
 */
function assertPlainJsonIntent(intent) {
    const stack = [['$intent', intent]];
    for (let cursor = stack.pop(); cursor !== undefined; cursor = stack.pop()) {
        const [path, value] = cursor;
        if (value === null || typeof value === 'string' || typeof value === 'boolean')
            continue;
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                throw typedError('INTENT_NOT_JSON', `${path} contains a non-finite number`);
            }
            continue;
        }
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') {
            throw typedError('INTENT_NOT_JSON', `${path} carries a non-JSON ${typeof value}; intents are data only and can never carry handles, ports or callables`);
        }
        if (Array.isArray(value)) {
            value.forEach((item, index) => stack.push([`${path}[${index}]`, item]));
            continue;
        }
        if (typeof value !== 'object') {
            throw typedError('INTENT_NOT_JSON', `${path} carries unsupported ${typeof value}`);
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw typedError('INTENT_NOT_JSON', `${path} must be a plain JSON object`);
        }
        const record = value;
        for (const key of Object.keys(record)) {
            stack.push([`${path}.${key}`, record[key]]);
        }
    }
}
function requireTarget(target) {
    const record = target;
    if (typeof target !== 'object'
        || target === null
        || typeof record?.workflowId !== 'string'
        || record.workflowId.length === 0
        || typeof record?.instanceKey !== 'string'
        || record.instanceKey.length === 0) {
        throw typedError('TARGET_MALFORMED', 'target must be {workflowId, instanceKey} non-empty strings');
    }
}
function requireRoleBinding(bindings, role) {
    const binding = bindings.find((candidate) => candidate.role === role);
    // Unreachable after assertQualifiedRoot (exactly-one K/S, >=1 B), but a
    // typed internal-invariant failure beats an untyped undefined deref.
    if (binding === undefined) {
        throw typedError('LOAD_ROLE_BINDING_INVALID', `sealed closure carries no ${role} role binding`);
    }
    return binding;
}
/**
 * `DomainHarness.load(package)` — the minimal microkernel consumption
 * abstraction (T-B, #1001). Exactly ONE argument: the sealed qualified
 * package root produced by `@kaicreator/domain-harness-compiler` BUILD plus
 * an externally issued approval proof.
 *
 * Every module activation happens inside the qualified load() path below —
 * static qualification, the fail-closed issuer trust gate (UNTRUSTED_ISSUER
 * / FORGED_ATTESTATION refuse EVERY import in a process without an
 * established trust channel) and the whole-closure byte preflight all run
 * BEFORE the first executable byte of any package. This loader then wires
 * the already-installed module namespaces (kernel mechanism, standard-sdk
 * rule interpreter, business policy) together through the kernel's own
 * `createOccurrenceRuntime` and returns the scoped facade.
 *
 * Activation is ordered so a wiring failure leaves the LEAST possible
 * residue: endpoint type checks and business policy resolution run BEFORE
 * the kernel mechanism is constructed; on any failure no facade escapes,
 * no observer is registered and the kernel mechanism has produced no
 * side effect. Residual scope honestly documented (same JS semantics as
 * the installer): packages whose module top level already evaluated during
 * the qualified install cannot be un-evaluated; the loader guarantees only
 * that nothing of ITS OWN (facade, observers, mechanism construction)
 * outlives a failed activation.
 */
async function loadScopedFacade(packageRoot) {
    if (arguments.length !== 1) {
        throw typedError('LOAD_ARITY_INVALID', 'load accepts exactly one argument: the sealed qualified package root; there is no options overload and no caller-injectable Host port (P1-L2-ABI-02)');
    }
    // Kernel Host binding: protected internal channel ONLY (never a load
    // argument). Fail-closed before anything else.
    const hostPorts = currentKernelHostPorts();
    // THE qualified load path — qualification, trust gate, whole-closure
    // preflight and every physical import happen here and nowhere else.
    const loaded = await load(packageRoot);
    const bindings = loaded.bindings;
    const kernelBinding = requireRoleBinding(bindings, 'kernel');
    const sdkBinding = requireRoleBinding(bindings, 'standard-sdk');
    const businessBinding = requireRoleBinding(bindings, 'business');
    const kernelNamespace = loaded.getModuleNamespace(kernelBinding.packageId);
    const sdkNamespace = loaded.getModuleNamespace(sdkBinding.packageId);
    const businessNamespace = loaded.getModuleNamespace(businessBinding.packageId);
    // ---- Endpoint wiring validation (before ANY mechanism construction) ----
    // Runtime shape first (typed), precise casts second: the module namespaces
    // are unknown records; the loader never calls a bare Function type.
    if (typeof kernelNamespace.createOccurrenceRuntime !== 'function') {
        throw typedError('ENDPOINT_INVALID', `kernel package ${kernelBinding.packageId} does not provide a callable occurrence-runtime endpoint`);
    }
    if (typeof sdkNamespace.interpret !== 'function') {
        throw typedError('ENDPOINT_INVALID', `standard-sdk package ${sdkBinding.packageId} does not provide a callable rule-interpreter endpoint`);
    }
    if (typeof businessNamespace.getPolicy !== 'function') {
        throw typedError('ENDPOINT_INVALID', `business package ${businessBinding.packageId} does not provide a callable business-policy endpoint`);
    }
    const createOccurrenceRuntime = kernelNamespace.createOccurrenceRuntime;
    const interpret = sdkNamespace.interpret;
    const getPolicy = businessNamespace.getPolicy;
    // Business policy resolution precedes kernel construction: a policy that
    // throws or returns a non-object fails typed with the mechanism still inert.
    let businessPolicy;
    try {
        businessPolicy = getPolicy();
    }
    catch (error) {
        throw typedError('ACTIVATION_FAILED', `business package ${businessBinding.packageId} policy activation failed: ${String(error?.message ?? error)}`);
    }
    if (businessPolicy === null || typeof businessPolicy !== 'object') {
        throw typedError('ACTIVATION_FAILED', `business package ${businessBinding.packageId} policy activation did not resolve to an object`);
    }
    const kernelProvenance = loaded.installedPackages.find((pkg) => pkg.packageId === kernelBinding.packageId);
    // Unreachable after the qualified install (every bound package is
    // installed), but the mechanism identity is never silently empty.
    if (kernelProvenance === undefined) {
        throw typedError('LOAD_ROLE_BINDING_INVALID', `kernel package ${kernelBinding.packageId} is bound but not installed in this closure`);
    }
    const moduleIdentity = {
        packageId: kernelBinding.packageId,
        moduleSha256: kernelProvenance.moduleSha256,
    };
    const observers = new Set();
    // ---- Kernel mechanism construction (LAST; kernel-owned side effects
    // exist only from this point on, and only behind the verified gate). ----
    let kernelCandidate;
    try {
        kernelCandidate = createOccurrenceRuntime({
            moduleIdentity,
            hostPorts,
            sdkEndpoint: { packageId: sdkBinding.packageId, interpret },
            businessEndpoint: businessPolicy,
            observe: (receipt) => {
                for (const observer of observers) {
                    try {
                        observer(receipt);
                    }
                    catch {
                        // An observer failure never mutates the authoritative occurrence.
                    }
                }
            },
        });
    }
    catch (error) {
        throw typedError('ACTIVATION_FAILED', `kernel package ${kernelBinding.packageId} mechanism activation failed: ${String(error?.message ?? error)}`);
    }
    if (typeof kernelCandidate !== 'object'
        || kernelCandidate === null
        || typeof kernelCandidate.submitOccurrence !== 'function'
        || typeof kernelCandidate.getSnapshot !== 'function') {
        throw typedError('KERNEL_RUNTIME_INVALID', `kernel package ${kernelBinding.packageId} did not activate a mechanism with submitOccurrence/getSnapshot`);
    }
    const kernelRuntime = kernelCandidate;
    // The sealed intent index IS the fixed closure: send() performs no
    // provider discovery and never falls back (KPK-03 heritage).
    const intentIndex = new Map(bindings
        .filter((binding) => binding.role === 'intent')
        .map((binding) => [binding.intentType, binding]));
    let stopped = false;
    function assertOpen() {
        if (stopped) {
            throw typedError('FACADE_STOPPED', 'this facade scope is stopped; load the package again for a fresh scope');
        }
    }
    function buildTrace() {
        return Object.freeze({
            root: Object.freeze({
                rootPackageId: loaded.rootPackageId,
                build: loaded.build,
                closureDigest: loaded.build.closureDigest,
            }),
            packages: Object.freeze(loaded.installedPackages.map((pkg) => Object.freeze({
                packageId: pkg.packageId,
                kind: pkg.kind,
                abiVersion: pkg.abiVersion,
                moduleSha256: pkg.moduleSha256,
                moduleId: loaded.getModuleNamespace(pkg.packageId).MODULE_ID,
                endpoints: pkg.endpoints,
            }))),
        });
    }
    /**
     * The single intent gate shared by the facade send and the authenticated
     * principal submit: JSON-only, sealed-closure bound type, target shape,
     * messageId. One implementation so the two routes can never drift.
     */
    function requireKernelIntent(intent) {
        assertPlainJsonIntent(intent);
        const record = intent;
        if (typeof record.intentType !== 'string' || record.intentType.length === 0) {
            throw typedError('INTENT_MALFORMED', 'intent.intentType must be a non-empty string');
        }
        if (!intentIndex.has(record.intentType)) {
            throw typedError('INTENT_UNBOUND', `intent type ${record.intentType} is not bound in this sealed package closure; no provider discovery or fallback exists at runtime`);
        }
        requireTarget(record.target);
        if (typeof record.messageId !== 'string' || record.messageId.length === 0) {
            throw typedError('INTENT_MALFORMED', 'intent.messageId must be a non-empty string');
        }
        return { intentType: record.intentType, target: record.target, messageId: record.messageId, input: record.input };
    }
    async function send(intent) {
        assertOpen();
        requireKernelIntent(intent);
        return kernelRuntime.submitOccurrence(intent);
    }
    /**
     * I02 protected route: submit with the caller REPLACED by the
     * H-authenticated principal record. The submit record is rebuilt from the
     * validated fields ONLY — a declared payload `caller` (or any other
     * payload field) never reaches the Kernel through this route.
     */
    async function submitAsPrincipal(intent, caller) {
        assertOpen();
        if (typeof caller !== 'object'
            || caller === null
            || caller.kind !== 'v08-host-principal/1'
            || typeof caller.role !== 'string'
            || caller.role.length === 0) {
            throw typedError('INTENT_MALFORMED', 'submitAsPrincipal requires an H-authenticated kernel principal caller record');
        }
        const validated = requireKernelIntent(intent);
        const submission = {
            intentType: validated.intentType,
            target: validated.target,
            messageId: validated.messageId,
            caller,
        };
        if (validated.input !== undefined) {
            submission.input = validated.input;
        }
        return kernelRuntime.submitOccurrence(submission);
    }
    /** Scoped instance read for the authenticated route (same gate as query). */
    async function snapshotForPrincipal(target) {
        assertOpen();
        requireTarget(target);
        return kernelRuntime.getSnapshot(target);
    }
    async function query(query) {
        assertOpen();
        assertPlainJsonIntent(query);
        const record = query;
        switch (record.kind) {
            case 'instance':
                requireTarget(record.target);
                return kernelRuntime.getSnapshot(record.target);
            case 'build':
                return buildTrace();
            case 'journal':
            case 'mechanism':
            case 'counters':
                // Raw journal, kernel-mechanism internals and mechanism counters are
                // deliberately NOT on the scoped public surface (task #1001: no raw
                // Kernel accessor, no raw Journal).
                throw typedError('QUERY_KIND_REFUSED', `query kind ${String(record.kind)} is not part of the scoped public facade`);
            default:
                throw typedError('QUERY_KIND_UNKNOWN', `query kind ${String(record.kind)} is not a transport query`);
        }
    }
    /** Register one receipt observer; shared by facade subscribe and the channel. */
    function observeReceipts(observer) {
        assertOpen();
        if (typeof observer !== 'function') {
            throw typedError('OBSERVER_INVALID', 'subscribe requires a listener function');
        }
        observers.add(observer);
        return () => observers.delete(observer);
    }
    function subscribe(observer) {
        assertOpen();
        return observeReceipts(observer);
    }
    function stop() {
        stopped = true;
        observers.clear();
    }
    const kernelChannel = Object.freeze({
        submitAsPrincipal,
        snapshotForPrincipal,
        observeReceipts,
    });
    // The protected principal channel rides on a non-enumerable symbol key:
    // the facade's own key set stays exactly send/query/subscribe/stop and no
    // privileged member is reachable by enumeration or `in` probing.
    const facade = { send, query, subscribe, stop };
    Object.defineProperty(facade, kernelPrincipalChannelKey, {
        value: kernelChannel,
        enumerable: false,
        writable: false,
        configurable: false,
    });
    Object.freeze(facade);
    return facade;
}
/**
 * Public consumption brand (#994 heritage): `const facade =
 * await DomainHarness.load(package)`. The brand object is frozen and its
 * loader is the strictly one-argument scoped-facade loader above — the
 * qualified installation proof surface (`load`, T-A) and this consumption
 * entry are distinct public symbols of the `/v8` subpath.
 */
export const DomainHarness = Object.freeze({
    load: loadScopedFacade,
});
//# sourceMappingURL=microkernel.js.map