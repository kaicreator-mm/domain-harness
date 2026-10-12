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
import { currentHostModelPort } from './model-port.js';
import { load } from './load.js';
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
    const getPolicy = businessNamespace.getPolicy;
    // ---- FR08 (#1013, I04): trusted ModelPort binding, protected channel ONLY.
    // When this process bootstrapped a Host ModelPort and the qualified Standard
    // SDK exposes the host-bound resolver factory, rule interpretation goes
    // through that binding so model-call evidence can honestly report
    // physically observed port invocations. Without an installed port the plain
    // `interpret` stays wired and evidence remains `unsupported`/`unmeasured` —
    // there is no synthetic measured zero and no caller-supplied port anywhere.
    const modelPort = currentHostModelPort();
    const resolverFactory = sdkNamespace.createHostBoundModelResolver;
    const interpret = (modelPort !== undefined && typeof resolverFactory === 'function'
        ? (() => {
            const factory = resolverFactory;
            try {
                return factory(modelPort).interpret;
            }
            catch (error) {
                throw typedError('ACTIVATION_FAILED', `standard-sdk package ${sdkBinding.packageId} host-bound model resolver activation failed: ${String(error?.message ?? error)}`);
            }
        })()
        : sdkNamespace.interpret);
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
     * #1013 review repair (@6117218727 Candidate B): the PUBLIC facade verbs
     * are CLOSED for authority-carrying routes. `send`, `instance` reads and
     * receipt observation have no authentication channel at this surface —
     * an unauthenticated in-process caller (including one holding a sealed
     * root after a trusted Host bootstrap) must never mutate Kernel state,
     * read instance data or observe receipts. Every such operation goes
     * through the Host-authenticated kernel gateway seam
     * (`getFacadeKernelOps`, trusted Host context only). The inert `build`
     * trace stays public: it restates sealed-root metadata the caller
     * already supplied and reads no Kernel state.
     */
    function refusePublicRoute(verb) {
        return typedError('FACADE_PUBLIC_ROUTE_CLOSED', `the public facade ${verb} route is closed (#1013): mutations, instance reads and receipt observation require the Host-authenticated kernel gateway; DomainHarness.load stays the one-argument public entry`);
    }
    async function send(intent) {
        assertOpen();
        assertPlainJsonIntent(intent);
        const record = intent;
        if (typeof record.intentType !== 'string' || record.intentType.length === 0) {
            throw typedError('INTENT_MALFORMED', 'intent.intentType must be a non-empty string');
        }
        if (record.caller !== undefined) {
            // #1013 I02: a caller-declared `caller` is user data and can never
            // carry authority. The public route refuses it outright; the only
            // route that binds a caller is the Host gateway's authenticated seam.
            throw typedError('INTENT_CALLER_FORBIDDEN', 'intent.caller is caller-declared data and can never carry authority; submit through the Host-authenticated kernel gateway which binds the verified principal');
        }
        // The no-caller variant would reach the Kernel as the implicit
        // 'anonymous' caller — an unauthenticated mutation. Closed alike.
        throw refusePublicRoute('send');
    }
    async function query(query) {
        assertOpen();
        assertPlainJsonIntent(query);
        const record = query;
        switch (record.kind) {
            case 'instance':
                // Unauthenticated instance reads are closed with the send route.
                throw refusePublicRoute('query instance');
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
    function subscribe(observer) {
        assertOpen();
        if (typeof observer !== 'function') {
            throw typedError('OBSERVER_INVALID', 'subscribe requires a listener function');
        }
        // Receipt observation without an authenticated principal would leak
        // occurrence facts to any in-process holder of the facade. Closed.
        throw refusePublicRoute('subscribe');
    }
    function stop() {
        stopped = true;
        observers.clear();
    }
    // ---- #1013 private gateway seam (I02/I03), module-private WeakMap ----
    // The UX consumer receives ONLY the frozen facade above; the trusted Host
    // kernel gateway retrieves the ops below through getFacadeKernelOps()
    // (never exported from the public /v8 index) to bind an H-authenticated
    // principal to Kernel requests and to run the protected Genesis path.
    const policyRecord = businessPolicy;
    function resolveWorkflowKey() {
        const definition = policyRecord.workflowDefinition;
        const key = definition === null || typeof definition !== 'object' ? undefined : definition.workflowKey;
        if (typeof key !== 'string' || key.length === 0 || key.includes(':')) {
            throw typedError('POLICY_ADDRESSING_INVALID', `business package ${businessBinding.packageId} policy must declare a non-empty ':'-free workflowDefinition.workflowKey for gateway instance addressing`);
        }
        return key;
    }
    function resolveIntentRoles(intentType) {
        const bindings = policyRecord.intentBindings;
        if (bindings === null || typeof bindings !== 'object')
            return undefined;
        const binding = Object.prototype.hasOwnProperty.call(bindings, intentType) ? bindings[intentType] : undefined;
        if (binding === null || typeof binding !== 'object')
            return undefined;
        return Array.isArray(binding.roles) ? binding.roles : undefined;
    }
    /**
     * The ONLY caller derivation on this path: an issuer-signed principal role
     * that the sealed Business binding itself admits. Mirrors the Kernel's own
     * gate (deny when `binding.roles` is an array that excludes the caller) so
     * the Host-side pick and the Kernel-side check can never disagree.
     */
    function requirePrincipalRole(principal, intentType) {
        const roles = resolveIntentRoles(intentType);
        if (roles === undefined)
            return 'anonymous';
        const granted = principal.roles.find((role) => roles.includes(role));
        if (granted === undefined) {
            throw typedError('PRINCIPAL_ROLE_NOT_BOUND', `authenticated principal (subject ${principal.subject}, roles [${principal.roles.join(', ')}]) holds none of the Business-bound roles [${roles.join(', ')}] required by intent ${intentType}`);
        }
        return granted;
    }
    function requireInstanceKey(instanceKey) {
        if (typeof instanceKey !== 'string' || instanceKey.length === 0 || instanceKey.includes(':')) {
            throw typedError('INSTANCE_KEY_INVALID', 'instanceKey must be a non-empty string without the addressing delimiter \':\'');
        }
        return instanceKey;
    }
    function requirePrincipal(principal) {
        if (typeof principal !== 'object'
            || principal === null
            || typeof principal.subject !== 'string'
            || principal.subject.length === 0
            || typeof principal.tenantId !== 'string'
            || principal.tenantId.length === 0
            || principal.tenantId.includes(':')
            || typeof principal.appId !== 'string'
            || principal.appId.length === 0
            || principal.appId.includes(':')
            || !Array.isArray(principal.roles)
            || !principal.roles.every((role) => typeof role === 'string' && role.length > 0)) {
            throw typedError('PRINCIPAL_INVALID', 'the gateway principal must carry the H-verified subject/tenant/app and issuer-signed roles (tenant/app without the \':\' delimiter)');
        }
    }
    /**
     * The Host-derived, collision-free physical instance address: the
     * authenticated principal's tenant/app qualify the caller-chosen key
     * (#1013 @6117218727 Candidate A repair). All three components are
     * ':'-free (credentials at identity shape check, registerApp at the
     * gateway, requireInstanceKey here), so the join is unambiguous and two
     * distinct tenants can never resolve to the same physical Kernel
     * instance regardless of appId/instanceKey reuse. The namespace identity
     * is derived ONLY from the VERIFIED principal — never caller-provided.
     */
    function qualifiedInstanceKey(principal, instanceKey) {
        return `${principal.tenantId}:${principal.appId}:${instanceKey}`;
    }
    const gatewayOps = {
        describePolicy() {
            assertOpen();
            return Object.freeze({
                packageId: typeof policyRecord.packageId === 'string' ? policyRecord.packageId : businessBinding.packageId,
                policyId: typeof policyRecord.policyId === 'string' ? policyRecord.policyId : businessBinding.packageId,
                workflowKey: resolveWorkflowKey(),
                intentTypes: Object.freeze([...intentIndex.keys()]),
            });
        },
        async submitAs(principal, request) {
            assertOpen();
            requirePrincipal(principal);
            const { intentType, messageId, instanceKey } = request;
            if (typeof intentType !== 'string' || intentType.length === 0) {
                throw typedError('INTENT_MALFORMED', 'intent.intentType must be a non-empty string');
            }
            if (typeof messageId !== 'string' || messageId.length === 0) {
                throw typedError('INTENT_MALFORMED', 'intent.messageId must be a non-empty string');
            }
            if (!intentIndex.has(intentType)) {
                throw typedError('INTENT_UNBOUND', `intent type ${intentType} is not bound in this sealed package closure; no provider discovery or fallback exists at runtime`);
            }
            const key = requireInstanceKey(instanceKey);
            const role = requirePrincipalRole(principal, intentType);
            // The Kernel request is CONSTRUCTED here — intent data never carries a
            // caller; the verified principal is the only authority source, and the
            // physical instance address is the principal's tenant/app-qualified
            // key (two tenants reusing the same appId/instanceKey are two distinct
            // physical instances — never shared state, Journal or effects).
            const kernelRequest = {
                intentType,
                messageId,
                input: request.input === undefined ? null : request.input,
                target: { workflowId: resolveWorkflowKey(), instanceKey: qualifiedInstanceKey(principal, key) },
                caller: { role, subject: principal.subject, tenantId: principal.tenantId, appId: principal.appId },
            };
            assertPlainJsonIntent(kernelRequest);
            return kernelRuntime.submitOccurrence(kernelRequest);
        },
        async queryInstance(principal, instanceKey) {
            assertOpen();
            requirePrincipal(principal);
            const key = requireInstanceKey(instanceKey);
            return kernelRuntime.getSnapshot({ workflowId: resolveWorkflowKey(), instanceKey: qualifiedInstanceKey(principal, key) });
        },
        workflowInstanceId(principal, instanceKey) {
            requirePrincipal(principal);
            const key = requireInstanceKey(instanceKey);
            return `${resolveWorkflowKey()}:${qualifiedInstanceKey(principal, key)}`;
        },
        observeReceipts(observer) {
            assertOpen();
            if (typeof observer !== 'function') {
                throw typedError('OBSERVER_INVALID', 'a Kernel receipt observer must be a function');
            }
            observers.add(observer);
            return () => observers.delete(observer);
        },
        async provisionGenesis(principal, request) {
            assertOpen();
            requirePrincipal(principal);
            const key = requireInstanceKey(request.instanceKey);
            const runtimeWithOpener = kernelRuntime;
            if (typeof runtimeWithOpener.openInstance !== 'function') {
                throw typedError('GENESIS_ENDPOINT_INVALID', `kernel package ${kernelBinding.packageId} mechanism exposes no instance-open endpoint; protected Genesis provisioning is unavailable for this closure`);
            }
            // I03: the initial state/context are the sealed Business policy's own
            // (the Kernel reads initialStateKey/initialContext from the policy) —
            // this seam deliberately forwards NO caller-chosen initial context,
            // and the instance address is the principal's tenant/app-qualified
            // key (per-tenant Genesis by construction).
            return runtimeWithOpener.openInstance({
                target: { workflowId: resolveWorkflowKey(), instanceKey: qualifiedInstanceKey(principal, key) },
                ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
            });
        },
    };
    const facade = Object.freeze({ send, query, subscribe, stop });
    facadeScopes.set(facade, Object.freeze(gatewayOps));
    return facade;
}
/**
 * Module-private registry of the gateway ops bound to each facade this
 * loader produced. Not exported from the public `/v8` index.
 */
const facadeScopes = new WeakMap();
/**
 * Retrieve the private Kernel operations of a facade produced by
 * `DomainHarness.load(package)` in THIS process (#1013, I02/I03). Returns
 * `undefined` for anything that is not such a facade. Trusted Host gateway
 * use only: the object binds H-authenticated principals to Kernel requests
 * and exposes the protected Genesis path — it is never a public surface.
 */
export function getFacadeKernelOps(facade) {
    return facadeScopes.get(facade);
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