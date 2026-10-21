/**
 * DomainHarness v0.10 T00 (#1166) — trusted App activation seam.
 * ================================================================
 *
 * The A01-PC05 consumer counterpart of `buildV10App`: the SDK consumes the
 * already-trusted BUILD output as plain data and performs the ordinary
 * module lifecycle only —
 *
 *   (1) structural plain-data check of the consumed App record;
 *   (2) import the sealed modules in the SEALED load order through private
 *       per-activation `data:` URLs (fresh cache discriminators; the
 *       sealed graph is the whole graph — nothing else is imported). A
 *       `data:` URL has no package hierarchy, so each module's DECLARED
 *       npm/native import allowance is honored through one process-wide
 *       synchronous resolve hook (`node:module registerHooks`): a sealed
 *       bare specifier resolves against the real deployment context's
 *       installed packages; every other request falls through to the
 *       default resolver, which fail-closed refuses it. Sealed bytes are
 *       never rewritten; the hook is deregistered at activation close; a
 *       runtime without the hook refuses activations that declare
 *       npm/native imports typed (`V10_IMPORT_HOOK_UNAVAILABLE`);
 *   (3) connect: structural per-role export checks (the A01 runtime
 *       fail-fast class: an actually missing callable hook);
 *   (4) init the advisory modules (S features, then K extensions) in
 *       sealed order with ONE bounded, data-only, port-denying context
 *       each; ANY late init failure disposes ONLY successfully
 *       initialized advisory modules in reverse order — durable K state
 *       is never rolled back and no protected port is ever exposed;
 *   (5) execute through ONE facade over the real selected kernel: one
 *       `createOccurrenceRuntime` per business package, sealed-route
 *       Standard Router selection, honest receipts (kernel UNKNOWN
 *       passes through as UNKNOWN — no invented terminal success);
 *   (6) dispose: facade closes first, then advisory disposal in reverse
 *       init order.
 *
 * Deliberately ABSENT (accepted Product A01): digest re-attestation, AST
 * inspection, dependency recomputation, issuer/approval verification,
 * dynamic package discovery, hot swap, installation of any kind. A
 * tampered sealed digest in the consumed plain data therefore does NOT
 * block activation — static trust facts are BUILD/deployment facts, and
 * that trust semantics is asserted by tests from this consumer side.
 *
 * Advisory turn-time consultation semantics (budget advice, recovery
 * diagnostics — E2 research #1151) are NOT implemented here: loading,
 * initializing and disposing advisory modules is composition scope; their
 * participation in turns belongs to the K-side successors (#1167/#1169).
 */
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createV10AuthorizedMultiBQuery, } from '@kaicreator/domain-harness/v8/host';
import { V10_BUILD_FORMAT, V10_HOST_ABI, V10_RUNTIME_ABI, V10_TARGET_PROFILE, V10_KERNEL_INTENT_KIND, V10_KERNEL_AUTHORITY_CLASS, V10_KERNEL_CALLER_ROLE, V10_ROUTER_PRIORITY, V10_ROUTER_ELIGIBILITY, v10RouterBasisDigest, sha256Hex, } from './digest.js';
import { dispatchThroughExternalEffectGate } from './external-effect.js';
export class V10ActivationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'V10ActivationError';
        this.code = code;
    }
}
export class V10PortDeniedError extends Error {
    code = 'KEXT_PORT_DENIED';
    constructor(name) {
        super(`advisory init context exposes no protected port '${name}'; the probe is denied`);
        this.name = 'V10PortDeniedError';
    }
}
function refuse(code, message) {
    throw new V10ActivationError(code, message);
}
export function freshV10Counters() {
    return {
        importsByPackage: {},
        extensionImports: 0,
        featureImports: 0,
        optionalMissing: [],
        initCalls: [],
        initFailures: [],
        disposals: [],
        runtimeFactoryInvocations: 0,
        portProbes: [],
        portDenials: 0,
        activationRefusals: [],
        externalEffectDispatches: 0,
        externalEffectRefusals: 0,
    };
}
const PROTECTED_CONTEXT_NAMES = new Set([
    'docs', 'store', 'cas', 'sha256', 'hostPorts', 'principal', 'permit', 'resources',
    'createOccurrenceRuntime', 'effectPermit', 'interpret', 'submitOccurrence', 'openInstance',
]);
const KEXT_EXPORT_BASE = ['MODULE_ID', 'PACKAGE_KIND', 'EXTENSION_ABI', 'PROVIDER_ID', 'HOOK', 'init'];
const SFEATURE_EXPORT_BASE = ['MODULE_ID', 'PACKAGE_KIND', 'FEATURE_ABI', 'FEATURE_KEY', 'init'];
const INIT_RETURN_FIELDS = new Set(['ok', 'providerId', 'hook', 'featureKey', 'observedContext']);
const K_DOCS_PREFIX = 'v10/k/';
function isPlainRecord(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
function assertPlainRecord(value, label) {
    if (!isPlainRecord(value)) {
        refuse('V10_APP_INVALID', `${label} must be a plain record`);
    }
    return value;
}
function privateModuleFragment(activationNonce, packageId) {
    return `#v10-${activationNonce}-${encodeURIComponent(packageId)}`;
}
function privateModuleUrl(source, activationNonce, packageId) {
    const bytes = Buffer.from(source, 'utf8').toString('base64');
    return `data:text/javascript;base64,${bytes}${privateModuleFragment(activationNonce, packageId)}`;
}
/** Minted parent-URL fragment -> the declared bare specifiers it may resolve. */
const declaredBareImportAllowances = new Map();
let importHookHandle = null;
let importHookUsers = 0;
/** The default deployment anchor: this activation module's own resolution context. */
const ACTIVATION_MODULE_URL = import.meta.url;
function ensureImportResolveHook() {
    if (typeof registerHooks !== 'function')
        return null;
    if (importHookHandle === null) {
        importHookHandle = registerHooks({
            resolve(specifier, context, nextResolve) {
                const parentURL = context.parentURL;
                // The fragment carries this machinery's per-activation nonce; the
                // keyed lookup is the authority (a foreign URL is never keyed).
                if (typeof parentURL === 'string' && parentURL.startsWith('data:text/javascript;base64,') && parentURL.includes('#v10-')) {
                    const allowance = declaredBareImportAllowances.get(parentURL.slice(parentURL.indexOf('#')));
                    if (allowance !== undefined && allowance.specifiers.has(specifier)) {
                        // Resolve through the REAL default ESM resolver against a
                        // synthetic file: parent inside the deployment context (the
                        // legitimately deployed node_modules lookup), instead of the
                        // hierarchy-less data: parent. Everything unsealed keeps going
                        // to the next resolver, which refuses bare specifiers from a
                        // data: parent — the fail-closed default.
                        const anchorParentURL = allowance.deploymentRoot === undefined
                            ? ACTIVATION_MODULE_URL
                            : pathToFileURL(join(allowance.deploymentRoot, 'package.json')).href;
                        return nextResolve(specifier, { parentURL: anchorParentURL });
                    }
                }
                return nextResolve(specifier, context);
            },
        });
    }
    importHookUsers += 1;
    return importHookHandle;
}
function releaseImportResolveHook() {
    importHookUsers -= 1;
    if (importHookUsers === 0 && importHookHandle !== null) {
        importHookHandle.deregister();
        importHookHandle = null;
    }
}
/** The npm/native specifiers a consumed module record declares (defensive plain-data read). */
function declaredBareImportsOf(module) {
    const external = module.externalImports;
    if (!isPlainRecord(external))
        return [];
    const declared = [];
    for (const kind of ['npm', 'native']) {
        const list = external[kind];
        if (Array.isArray(list)) {
            for (const item of list) {
                if (typeof item === 'string' && item.length > 0)
                    declared.push(item);
            }
        }
    }
    return declared;
}
/**
 * Honor the consumed record's declared npm/native allowances for the `data:`
 * URLs this activation is about to import. Returns the release closure that
 * unregisters the allowances (and the process hook when this was its last
 * user). Refuses typed when the runtime cannot host the resolve hook.
 */
function registerDeclaredBareImports(deps) {
    const mintedFragments = [];
    let hasDeclaredBareImports = false;
    for (const module of deps.appView.modules) {
        if (typeof module.moduleSource !== 'string' || module.moduleSource.length === 0)
            continue;
        const declared = declaredBareImportsOf(module);
        const fragment = privateModuleFragment(deps.activationNonce, module.packageId);
        mintedFragments.push(fragment);
        if (declared.length > 0) {
            declaredBareImportAllowances.set(fragment, { specifiers: new Set(declared), deploymentRoot: deps.deploymentRoot });
            hasDeclaredBareImports = true;
        }
    }
    if (!hasDeclaredBareImports)
        return () => { };
    const handle = ensureImportResolveHook();
    if (handle === null) {
        for (const fragment of mintedFragments)
            declaredBareImportAllowances.delete(fragment);
        refuse('V10_IMPORT_HOOK_UNAVAILABLE', 'this Node runtime lacks the node:module registerHooks resolve seam; an App declaring npm/native external imports refuses fail-closed instead of importing without its declared resolution context');
    }
    let released = false;
    return () => {
        if (released)
            return;
        released = true;
        for (const fragment of mintedFragments)
            declaredBareImportAllowances.delete(fragment);
        releaseImportResolveHook();
    };
}
/** Map the kernel-side condition shape onto the physical store condition. */
function mapDocCondition(key, condition) {
    if (isPlainRecord(condition) && condition.mustBeAbsent === true) {
        return { kind: 'create' };
    }
    if (isPlainRecord(condition) && typeof condition.mustMatchRevision === 'number' && Number.isSafeInteger(condition.mustMatchRevision)) {
        return { kind: 'cas', revision: condition.mustMatchRevision };
    }
    refuse('K_DOC_CONDITION_REQUIRED', `K document operation on ${key} requires a physical revision expectation`);
}
/** Normalize a physical store refusal into the typed CAS-conflict error. */
function casConflictError(error) {
    return Object.assign(new Error(error instanceof Error ? error.message : String(error)), { code: 'HOST_CAS_CONFLICT' });
}
/** Build the prefix-bounded K docs port over one physical store. */
export function createV10DocsPort(deps) {
    const port = {
        get: async (key) => {
            deps.assertOpen();
            return await deps.store.get(`${deps.docsPrefix}${key}`);
        },
        put: async (key, value, condition) => {
            deps.assertOpen();
            const mapped = mapDocCondition(key, condition);
            try {
                return await deps.store.put(`${deps.docsPrefix}${key}`, value, mapped);
            }
            catch (error) {
                const code = error.code;
                if (code === 'HOST_CAS_CONFLICT' || code === undefined)
                    throw casConflictError(error);
                throw error;
            }
        },
        list: async (prefix) => {
            deps.assertOpen();
            const full = `${deps.docsPrefix}${prefix}`;
            const keys = deps.store.keys?.() ?? [];
            return keys.filter((key) => key.startsWith(full)).map((key) => key.slice(deps.docsPrefix.length));
        },
    };
    if (deps.store.remove === undefined) {
        // Fail-closed: without a physical conditional remove the port exposes NO
        // remove member at all — a K01 fence release then fails loudly instead
        // of pretending to succeed.
        return port;
    }
    const physicalRemove = deps.store.remove.bind(deps.store);
    return {
        ...port,
        remove: async (key, condition) => {
            deps.assertOpen();
            const mapped = mapDocCondition(key, condition);
            try {
                await physicalRemove(`${deps.docsPrefix}${key}`, mapped);
            }
            catch (error) {
                const code = error.code;
                if (code === 'HOST_CAS_CONFLICT' || code === undefined)
                    throw casConflictError(error);
                throw error;
            }
        },
    };
}
/** The K02 key-component encoding (percent and colon only). */
function encodeK02Component(value) {
    return value.replace(/%/g, '%25').replace(/:/g, '%3A');
}
/**
 * The ONE governed K-docs outer prefix of a deployment: the stable,
 * delimiter-escaped `deployment:<deployedAppId>:<tenantId>:<appId>` tuple.
 * Shared by the writer (V10AppFacade.#docsPrefix), the reported shadow
 * binding and the Shadow L4 verifier's independent re-derivation — the three
 * must never drift apart.
 */
export function v10DeploymentDocsPrefix(deployment) {
    return `${K_DOCS_PREFIX}deployment:${encodeK02Component(deployment.deployedAppId)}:${encodeK02Component(deployment.tenantId)}:${encodeK02Component(deployment.appId)}/`;
}
/**
 * The exact K02 physical prefix of ONE deployment
 * and ONE selected Business: the injective
 * `v010-k02:<deployedAppId>:<tenantId>:<appId>:<businessPackageId>:`
 * component the Host docs port prepends. This is the ONE derivation both the
 * write path (`scopedDocsView`) and the read-only deployment binding use, so
 * a Shadow observation set can never drift wider than what this deployment
 * physically writes.
 */
export function v10K02DocumentPrefix(scope) {
    return ['v010-k02',
        encodeK02Component(scope.deployedAppId),
        encodeK02Component(scope.tenantId),
        encodeK02Component(scope.appId),
        encodeK02Component(scope.businessPackageId),
    ].join(':') + ':';
}
/**
 * The K02 SCOPED document-store composition: the
 * exact two-B namespace mechanism the K02 physical witness exercises. Every
 * key of one deployment tuple — instance, fence, journal, permit, dispatch
 * claim, disposition, governance pin, receipt archive — is addressed under
 * the injective `v010-k02:<deployedAppId>:<tenantId>:<appId>:<businessPackageId>:`
 * prefix, applied by the HOST docs port. The kernel keeps issuing its own
 * relative keys; a scoped deployment physically cannot resolve an unprefixed
 * key through this view (no legacy fallback exists). The composition (rather
 * than re-keying only the six kernel families) is required because the
 * governance pin family must be disjoint for two B sharing one
 * workflowId/instanceKey — K02's own witness proves exactly this shape.
 */
function scopedDocsView(base, scope) {
    const prefix = v10K02DocumentPrefix(scope);
    const view = {
        get: async (key) => await base.get(`${prefix}${key}`),
        put: async (key, value, condition) => await base.put(`${prefix}${key}`, value, condition),
        list: async (keyPrefix) => (await base.list(`${prefix}${keyPrefix}`)).map((key) => key.slice(prefix.length)),
    };
    if (base.remove === undefined)
        return view;
    return {
        ...view,
        remove: async (key, condition) => {
            await base.remove(`${prefix}${key}`, condition);
        },
    };
}
/** One bounded, data-only, port-denying init context for ONE advisory module. */
function advisoryContext(app, counters, packageId) {
    const base = Object.freeze({
        appId: app.appId,
        audience: app.audience,
        subjectDigest: app.subjectDigest,
        hostProfile: Object.freeze({ hostAbi: app.hostAbi, runtimeAbi: app.runtimeAbi, targetProfile: app.targetProfile }),
        hardBudget: Object.freeze({ ...app.hardBudget }),
    });
    return new Proxy(base, {
        get(target, property) {
            if (typeof property !== 'string')
                return undefined;
            if (PROTECTED_CONTEXT_NAMES.has(property)) {
                counters.portProbes.push({ packageId, name: property });
                const denied = () => {
                    counters.portDenials += 1;
                    throw new V10PortDeniedError(property);
                };
                Object.defineProperty(denied, 'get', { value: denied });
                Object.defineProperty(denied, 'put', { value: denied });
                Object.defineProperty(denied, 'call', { value: denied });
                return denied;
            }
            return target[property];
        },
    });
}
/**
 * The composed App facade: the ONE composition-owned boundary over the
 * selected kernel primary. `send` runs a public intent through the sealed
 * route (Standard Router selection over the real selected modules) and the
 * real kernel admission path.
 */
export class V10AppFacade {
    #app;
    #namespaces;
    #now;
    #counters;
    // In governed deployments the outer K namespace is derived solely from
    // the stable deployment tuple, not from subjectDigest (a BUILD revision).
    // K02 applies the per-B scoped prefix inside this outer namespace.
    #docsPrefix;
    #activatedTenantId;
    #docs;
    #runtimes = new Map();
    #deploymentIdentity;
    #scopedDocs = new Map();
    #queryAuthority;
    #query;
    #closed = false;
    constructor(deps) {
        this.#app = deps.app;
        this.#namespaces = deps.namespaces;
        this.#now = deps.now;
        this.#counters = deps.counters;
        this.#deploymentIdentity = deps.deploymentIdentity;
        this.#queryAuthority = deps.queryAuthority;
        this.#activatedTenantId = deps.tenantId;
        this.#docsPrefix = deps.deploymentIdentity === undefined
            ? `${K_DOCS_PREFIX}${deps.app.subjectDigest}/${deps.tenantId}/`
            : v10DeploymentDocsPrefix(deps.deploymentIdentity);
        this.#docs = createV10DocsPort({ store: deps.store, docsPrefix: this.#docsPrefix, assertOpen: () => this.#assertOpen() });
    }
    get selectedExtensions() {
        return this.#app.modules
            .filter((module) => module.role === 'kernel-extension')
            .map((module) => ({ packageId: module.packageId, providerId: module.providerId ?? null, hook: module.provides[0] ?? null }));
    }
    get selectedFeatures() {
        return this.#app.modules
            .filter((module) => module.role === 'standard-feature')
            .map((module) => ({ packageId: module.packageId, featureKey: module.provides[0] ?? null }));
    }
    /**
     * T07: read-only, activation-origin BUILD/tenant identity used by the Host
     * Shadow L4 verifier. Derived exclusively from private activated state,
     * never a caller-provided digest or a user-supplied matching claim.
     *
     * `deployedAppId` and `k02DocumentPrefixes` are the exact
     * deployment instance and its per-B physical document prefixes. They are
     * derived here from the same private deployment identity the write path
     * uses (`v10K02DocumentPrefix`), so a shadow can select one deployment's K
     * rows without accepting a caller's deployment/tenant/B claim. A facade
     * activated WITHOUT a deployment identity reports `deployedAppId: null` and
     * no prefixes; its K rows carry no deployment attribution and a shadow must
     * refuse rather than widen to the whole App/Tenant namespace.
     */
    get selectedShadowBinding() {
        this.#assertOpen();
        const deployment = this.#deploymentIdentity;
        const businessPackageIds = this.#app.modules
            .filter((module) => module.role === 'business')
            .map((module) => module.packageId)
            .sort();
        const namespace = this.#docsPrefix;
        return Object.freeze({
            subjectDigest: this.#app.subjectDigest,
            appId: this.#app.appId,
            tenantId: this.#activatedTenantId,
            deployedAppId: deployment?.deployedAppId ?? null,
            deploymentAppId: deployment?.appId ?? null,
            businessPackageIds: Object.freeze(businessPackageIds),
            k02DocumentPrefixes: Object.freeze(deployment === undefined ? [] : businessPackageIds.map((businessPackageId) => `${namespace}${v10K02DocumentPrefix({
                deployedAppId: deployment.deployedAppId,
                tenantId: deployment.tenantId,
                appId: deployment.appId,
                businessPackageId,
            })}`)),
        });
    }
    /**
     * Invoke one actually selected Standard feature through its sealed ABI.
     * The Host supplies any trusted read/query/model dependencies; merely
     * possessing semantic data never creates a K Permit or Effect authority.
     * An unselected feature is NOT dynamically discovered or imported.
     */
    async invokeSelectedStandardFeature(featureKey, request, trustedDependencies = {}) {
        this.#assertOpen();
        const feature = this.#app.modules.find((module) => module.role === 'standard-feature' && module.provides[0] === featureKey);
        if (feature === undefined) {
            refuse('V10_FEATURE_NOT_SELECTED', 'Standard feature is not selected in this built App');
        }
        const declaredExport = feature.featureExport;
        const invoke = typeof declaredExport === 'string'
            ? this.#namespaces.get(feature.packageId)?.[declaredExport]
            : undefined;
        if (typeof invoke !== 'function') {
            refuse('V10_FEATURE_ABI_INVALID', 'sealed Standard feature export is not callable');
        }
        return await invoke(request, trustedDependencies);
    }
    isClosed() {
        return this.#closed;
    }
    close() {
        this.#closed = true;
    }
    /** The real kernel's own counters for one business package. */
    kCounters(businessPackageId) {
        const runtime = this.#runtimeFor(businessPackageId);
        return { ...runtime.counters };
    }
    /**
     * [v0.10 T08 #1175] Read-only resolution of ONE sealed public intent to
     * its exact selected Business package and policy workflow id. Deployment
     * governance uses this to address the immutable occurrence→BUILD pin; it
     * grants no admission/query authority, reads no K storage and cannot
     * change route selection.
     */
    resolveIntentTarget(intentType) {
        this.#assertOpen();
        if (typeof intentType !== 'string' || intentType.length === 0) {
            refuse('INTENT_UNSEALED', 'intentType must be a non-empty sealed intent id');
        }
        const businessPackageId = this.#businessFor(intentType);
        return Object.freeze({ businessPackageId, workflowId: this.#policyWorkflowId(businessPackageId) });
    }
    /**
     * [v0.10 T10 #1176] Authorized, explicit scoped snapshot query over the
     * selected kernel. The public caller supplies ONLY workflowId, instanceKey
     * and optionally the Business packageId — never a principal, grant,
     * deployment or reader. Authorization is Host wiring fixed at activation,
     * runs on every selected candidate BEFORE any snapshot read and is
     * rechecked immediately before the single read. Unscoped ambiguity is
     * decided among VISIBLE selected Business packages only (never storage
     * existence or a denied package), denied/unselected/absent targets collapse
     * into one non-oracle refusal, and no query path writes K state or
     * dispatches an effect.
     */
    async queryScopedSnapshot(selector) {
        this.#assertOpen();
        const authority = this.#queryAuthority;
        if (authority === undefined) {
            refuse('QUERY_AUTHORIZATION_REQUIRED', 'this activation carries no Host-owned query authority; authorized scoped queries are disabled (no allow-all default exists)');
        }
        const deployment = this.#deploymentIdentity;
        if (deployment === undefined) {
            refuse('QUERY_DEPLOYMENT_REQUIRED', 'an authorized scoped query requires the K02 deployment identity; no unscoped cross-B fallback exists');
        }
        return await this.#querySelector(deployment, authority).query(selector);
    }
    /**
     * [v0.10 T10B #1179] Explicit multi-target variant of
     * `queryScopedSnapshot`. Every requested selector is independently
     * authorized and read; each result is correlated to its input index and a
     * failure is confined to that entry. The public selector still carries only
     * workflow/instance/optional B — the Host authority and deployment identity
     * remain activation wiring. No cross-B transaction or hidden-B oracle is
     * introduced, and no query path writes K state or dispatches an Effect.
     */
    async queryManyScopedSnapshots(selectors) {
        this.#assertOpen();
        const authority = this.#queryAuthority;
        if (authority === undefined) {
            refuse('QUERY_AUTHORIZATION_REQUIRED', 'this activation carries no Host-owned query authority; authorized scoped queries are disabled (no allow-all default exists)');
        }
        const deployment = this.#deploymentIdentity;
        if (deployment === undefined) {
            refuse('QUERY_DEPLOYMENT_REQUIRED', 'an authorized scoped query requires the K02 deployment identity; no unscoped cross-B fallback exists');
        }
        return await this.#querySelector(deployment, authority).queryMany(selectors);
    }
    /**
     * The ONE Host composition of the reviewed Multi-B selector: BUILD-selected
     * Business routes (their sealed workflow keys, never caller data), the
     * Host-verified principal/authorization, and the per-B K02 scoped kernel
     * snapshot reader. Constructed once per activation, lazily.
     */
    #querySelector(deployment, authority) {
        const existing = this.#query;
        if (existing !== undefined)
            return existing;
        const selectedRoutes = [];
        for (const module of this.#app.modules) {
            if (module.role !== 'business')
                continue;
            selectedRoutes.push(Object.freeze({
                businessPackageId: module.packageId,
                workflowId: this.#policyWorkflowId(module.packageId),
            }));
        }
        const query = createV10AuthorizedMultiBQuery({
            verifiedPrincipal: authority.principal,
            deployment: Object.freeze({ ...deployment }),
            selectedRoutes: Object.freeze(selectedRoutes),
            authorize: authority.authorize,
            readSnapshot: async (target) => {
                // The exact B's own K02 scoped view via its real selected runtime;
                // this is the ONLY physical read any query path performs.
                const runtime = this.#runtimeFor(target.businessPackageId);
                return await runtime.getSnapshot({ workflowId: target.workflowId, instanceKey: target.instanceKey });
            },
        });
        this.#query = query;
        return query;
    }
    #assertOpen() {
        if (this.#closed) {
            refuse('FACADE_CLOSED', 'the v0.10 App facade is closed; no further K activity can start');
        }
    }
    /**
     * The docs view ONE business runtime (and its external-effect
     * gate) must use: the plain K port for the historical unscoped wiring, or
     * the per-B K02 scoped view of a deployment-identity activation. The view
     * is cached per business package — one B, one namespace.
     */
    #docsFor(businessPackageId) {
        if (this.#deploymentIdentity === undefined)
            return this.#docs;
        const cached = this.#scopedDocs.get(businessPackageId);
        if (cached !== undefined)
            return cached;
        const view = scopedDocsView(this.#docs, {
            deployedAppId: this.#deploymentIdentity.deployedAppId,
            tenantId: this.#deploymentIdentity.tenantId,
            appId: this.#deploymentIdentity.appId,
            businessPackageId,
        });
        this.#scopedDocs.set(businessPackageId, view);
        return view;
    }
    /** Sealed capability dispatch: the ONLY physical resource port here. */
    #resources = {
        call: async (capabilityId, operationId, payload, attest) => {
            this.#assertOpen();
            if (typeof capabilityId !== 'string' || typeof operationId !== 'string' || !isPlainRecord(payload)) {
                refuse('RESOURCE_INPUT_INVALID', 'a resource call requires (capabilityId, operationId, record payload)');
            }
            const entry = this.#app.modules.find((module) => module.role === 'capability' && module.capabilityId === capabilityId);
            const handlerName = entry?.handlers?.find((handler) => handler.operationId === operationId)?.handler;
            if (entry === undefined || handlerName === undefined) {
                if (entry?.externalEffect === true && isPlainRecord(attest)) {
                    attest.preHandlerRefusal = 'RESOURCE_ROUTE_UNSEALED';
                }
                refuse('RESOURCE_ROUTE_UNSEALED', `resource ${capabilityId}:${operationId} is not sealed in this App`);
            }
            const handler = this.#namespaces.get(entry.packageId)?.[handlerName];
            if (typeof handler !== 'function') {
                if (entry.externalEffect === true && isPlainRecord(attest)) {
                    attest.preHandlerRefusal = 'RESOURCE_ABI_INVALID';
                }
                refuse('RESOURCE_ABI_INVALID', `sealed handler ${handlerName} is not callable`);
            }
            if (entry.externalEffect === true) {
                // [v0.10 C01 #1177] A sealed external Effect provider dispatches ONLY
                // through the selected K→C external Effect Operation gate: a live
                // K-issued permit — re-read from the durable K docs together with the
                // journal record and the held admission fence — authorizes exactly
                // this capability/operation/turn. Anything less is a typed refusal
                // with ZERO adapter dispatch, marked into the kernel-minted attest
                // (the trusted pre-handler-refusal discipline of #1108 K01).
                return await dispatchThroughExternalEffectGate({
                    // The gate reads through the DISPATCHING business's own
                    // K docs view: a scoped deployment resolves the kernel-issued
                    // addresses inside that B's namespace only (no legacy fallback).
                    docs: {
                        get: async (businessPackageId, key) => await this.#docsFor(businessPackageId).get(key),
                    },
                    nowIso: () => new Date(this.#now()).toISOString(),
                    onDispatch: () => {
                        this.#counters.externalEffectDispatches += 1;
                    },
                    onRefusal: () => {
                        this.#counters.externalEffectRefusals += 1;
                    },
                }, {
                    capabilityId,
                    operationId,
                    payload,
                    attest,
                    invoke: (adapterPayload, dispatchContext) => handler(adapterPayload, dispatchContext),
                });
            }
            return await handler(payload);
        },
    };
    /** One runtime factory invocation per business package (real kernel). */
    #runtimeFor(businessPackageId) {
        this.#assertOpen();
        const existing = this.#runtimes.get(businessPackageId);
        if (existing !== undefined)
            return existing;
        const kernelEntry = this.#app.modules.find((module) => module.role === 'kernel-primary');
        const standardEntry = this.#app.modules.find((module) => module.role === 'standard-primary');
        if (kernelEntry === undefined || standardEntry === undefined) {
            refuse('V10_APP_INVALID', 'the App lost a closed primary role at execute time');
        }
        const kernelNamespace = this.#namespaces.get(kernelEntry.packageId);
        const createRuntime = kernelNamespace.createOccurrenceRuntime;
        if (typeof createRuntime !== 'function') {
            refuse('V10_EXPORT_CONTRACT_REFUSED', `kernel-primary ${kernelEntry.packageId} does not export createOccurrenceRuntime`);
        }
        const businessNamespace = this.#namespaces.get(businessPackageId);
        const policy = businessNamespace.getPolicy();
        if (!isPlainRecord(policy)) {
            refuse('V10_APP_INVALID', `Business ${businessPackageId} policy is not a record`);
        }
        this.#counters.runtimeFactoryInvocations += 1;
        const runtime = createRuntime({
            moduleIdentity: { packageId: kernelEntry.packageId, moduleSha256: kernelEntry.moduleSha256 ?? null },
            hostPorts: {
                // Each B owns its own K docs view; under a deployment identity that
                // view is the K02 scoped namespace of THIS business package.
                docs: this.#docsFor(businessPackageId),
                resources: this.#resources,
                sha256: { digestUtf8: (value) => sha256Hex(value) },
                clock: () => new Date(this.#now()).toISOString(),
            },
            sdkEndpoint: {
                packageId: standardEntry.packageId,
                interpret: (declaration, input, context) => this.#namespaces.get(standardEntry.packageId)?.interpret?.(declaration, input, context),
            },
            businessEndpoint: policy,
            observe: () => {
                /* receipts are returned to the caller; no side observation at T00 */
            },
        });
        this.#runtimes.set(businessPackageId, runtime);
        return runtime;
    }
    #businessFor(intentType) {
        const business = this.#app.modules.find((module) => module.role === 'business' && module.provides.includes(`intent:${intentType}`));
        if (business === undefined || !this.#app.routes.some((row) => row.intentId === intentType)) {
            refuse('INTENT_UNSEALED', `intent ${intentType} carries no sealed route rows in this App`);
        }
        return business.packageId;
    }
    #policyWorkflowId(businessPackageId) {
        const policy = (this.#namespaces.get(businessPackageId)?.getPolicy)();
        const workflowKey = isPlainRecord(policy) && isPlainRecord(policy.workflowDefinition)
            ? policy.workflowDefinition.workflowKey
            : undefined;
        if (typeof workflowKey !== 'string' || workflowKey.length === 0) {
            refuse('V10_APP_INVALID', `Business ${businessPackageId} declares no workflowKey`);
        }
        return workflowKey;
    }
    /** One public intent through the sealed route and the real kernel. */
    async send(intent) {
        this.#assertOpen();
        const { intentType, instanceKey, messageId } = intent;
        const businessPackageId = this.#businessFor(intentType);
        const workflowId = this.#policyWorkflowId(businessPackageId);
        const target = { workflowId, instanceKey };
        // Pure Standard Router over the sealed route rows (real selected module).
        const rows = this.#app.routes.filter((row) => row.intentId === intentType);
        if (rows.length === 0) {
            refuse('INTENT_UNSEALED', `intent ${intentType} carries no sealed route rows in this App`);
        }
        const basisDigest = v10RouterBasisDigest(this.#app.subjectDigest);
        const bindings = rows.map((row) => ({ intentId: row.intentId, operationId: row.operationId, capabilityId: row.capabilityId, handlerId: row.handlerId }));
        const candidates = rows.map((row) => ({ operationId: row.operationId, capabilityId: row.capabilityId, priority: V10_ROUTER_PRIORITY, eligibility: V10_ROUTER_ELIGIBILITY }));
        const standardEntry = this.#app.modules.find((module) => module.role === 'standard-primary');
        const router = this.#namespaces.get(standardEntry.packageId)?.routeWorkflowIntent;
        const routed = router({ intentId: intentType, basisDigest, bindings, candidates });
        if (routed.kind !== 'selected') {
            refuse('ROUTING_OUTCOME_UNSELECTED', `the selected Standard Router outcome '${String(routed.kind)}' admits nothing`);
        }
        const matched = rows.some((row) => row.operationId === routed.operationId
            && row.capabilityId === routed.capabilityId
            && row.handlerId === routed.handlerId);
        if (!matched || routed.basisDigest !== basisDigest) {
            refuse('ROUTING_BINDING_UNMATCHED', 'the Router result does not exactly match a sealed route row of this App');
        }
        const runtime = this.#runtimeFor(businessPackageId);
        const existing = await runtime.getSnapshot(target);
        if (existing === null || existing === undefined) {
            try {
                await runtime.openInstance({ target, correlationId: `corr:${messageId}`, authorityClass: V10_KERNEL_AUTHORITY_CLASS });
            }
            catch (error) {
                const code = error.code;
                if (code !== 'HOST_CAS_CONFLICT' && code !== 'HOST_KEY_EXISTS')
                    throw error;
            }
        }
        try {
            const receipt = await runtime.submitOccurrence({
                kind: V10_KERNEL_INTENT_KIND, intentType, target, messageId, input: intent.input,
                caller: { role: V10_KERNEL_CALLER_ROLE },
            });
            if (!isPlainRecord(receipt)) {
                refuse('K_RECEIPT_INVALID', 'the Kernel admission receipt is not a record');
            }
            return { ...receipt };
        }
        catch (error) {
            const code = error.code;
            if (code === 'ADMISSION_EFFECT_AMBIGUOUS' || code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT') {
                // The kernel's own honest UNKNOWN: no false ACK, no retry.
                return { status: 'UNKNOWN', messageId, code };
            }
            throw error;
        }
    }
}
/**
 * Activate one built App. Trusts the BUILD output's static facts (no
 * re-attestation) and performs the ordinary module lifecycle only.
 */
export async function activateV10App(app, options) {
    const counters = options.counters ?? freshV10Counters();
    // Set once this activation's declared bare-import allowances are registered;
    // invoked at close (dispose) and on any activation refusal path.
    let releaseDeclaredImports;
    try {
        // ---- (1) structural plain-data check; nothing imported yet ----
        const record = assertPlainRecord(app, 'built App');
        if (record.formatVersion !== V10_BUILD_FORMAT) {
            refuse('V10_APP_INVALID', `unsupported built-App format ${String(record.formatVersion)}; this activation seam consumes ${V10_BUILD_FORMAT} only`);
        }
        if (record.targetProfile !== V10_TARGET_PROFILE) {
            refuse('V10_APP_INVALID', `built-App target profile ${String(record.targetProfile)} is not the selected ${V10_TARGET_PROFILE}`);
        }
        if (record.runtimeAbi !== V10_RUNTIME_ABI || record.hostAbi !== V10_HOST_ABI) {
            refuse('V10_APP_INVALID', 'built-App ABI bindings do not match this runtime');
        }
        if (typeof record.subjectDigest !== 'string' || record.subjectDigest.length === 0) {
            refuse('V10_APP_INVALID', 'built-App carries no subject digest');
        }
        if (!Array.isArray(record.modules) || record.modules.length === 0) {
            refuse('V10_APP_INVALID', 'built-App carries no module roster');
        }
        if (!Array.isArray(record.loadOrder) || record.loadOrder.length === 0) {
            refuse('V10_APP_INVALID', 'built-App carries no sealed load order');
        }
        if (!Array.isArray(record.routes) || record.routes.length === 0) {
            refuse('V10_APP_INVALID', 'built-App carries no sealed routes');
        }
        const appView = record;
        const byId = new Map(appView.modules.map((module) => [module.packageId, module]));
        // ---- (1.5) declared bare-import resolution context (no bytes touched) ----
        const activationNonce = randomUUID();
        releaseDeclaredImports = registerDeclaredBareImports({
            activationNonce,
            appView,
            deploymentRoot: options.deploymentRoot,
        });
        // ---- (2) import the sealed modules in the SEALED order ----
        const namespaces = new Map();
        for (const packageId of appView.loadOrder) {
            const module = byId.get(packageId);
            if (module === undefined || typeof module.moduleSource !== 'string' || module.moduleSource.length === 0) {
                refuse('V10_APP_INVALID', `sealed load order names ${String(packageId)} which carries no sealed bytes`);
            }
            let namespace;
            try {
                namespace = (await import(privateModuleUrl(module.moduleSource, activationNonce, packageId)));
            }
            catch (error) {
                refuse('V10_IMPORT_EVAL_FAILED', `sealed module ${packageId} failed to evaluate through the ordinary module system: ${error instanceof Error ? error.message : String(error)}`);
            }
            if (namespace === null || typeof namespace !== 'object') {
                refuse('V10_IMPORT_EVAL_FAILED', `module ${packageId} did not evaluate to a module namespace`);
            }
            namespaces.set(packageId, namespace);
            counters.importsByPackage[packageId] = (counters.importsByPackage[packageId] ?? 0) + 1;
            if (module.role === 'kernel-extension')
                counters.extensionImports += 1;
            if (module.role === 'standard-feature')
                counters.featureImports += 1;
        }
        // ---- (3) connect: structural per-role export checks ----
        for (const module of appView.modules) {
            if (!appView.loadOrder.includes(module.packageId))
                continue; // skipped optional
            const namespace = namespaces.get(module.packageId);
            if (module.role === 'kernel-primary' && typeof namespace.createOccurrenceRuntime !== 'function') {
                refuse('V10_EXPORT_CONTRACT_REFUSED', `kernel-primary ${module.packageId} does not export createOccurrenceRuntime`);
            }
            if (module.role === 'standard-primary') {
                for (const name of ['interpret', 'routeWorkflowIntent']) {
                    if (typeof namespace[name] !== 'function') {
                        refuse('V10_EXPORT_CONTRACT_REFUSED', `standard-primary ${module.packageId} does not export ${name}`);
                    }
                }
            }
            if (module.role === 'business' && typeof namespace.getPolicy !== 'function') {
                refuse('V10_EXPORT_CONTRACT_REFUSED', `business ${module.packageId} does not export getPolicy`);
            }
            if (module.role === 'capability') {
                for (const handler of module.handlers ?? []) {
                    if (typeof namespace[handler.handler] !== 'function') {
                        refuse('V10_EXPORT_CONTRACT_REFUSED', `capability ${module.packageId} does not export sealed handler ${handler.handler}`);
                    }
                }
            }
            if (module.role === 'kernel-extension') {
                const exported = new Set(Object.keys(namespace));
                const allowed = new Set([...KEXT_EXPORT_BASE, module.hookExport]);
                if (typeof namespace.dispose === 'function')
                    allowed.add('dispose');
                const unexpected = [...exported].filter((name) => !allowed.has(name));
                if (unexpected.length > 0) {
                    refuse('V10_EXPORT_CONTRACT_REFUSED', `kernel-extension ${module.packageId} exports beyond its sealed advisory surface: ${unexpected.join(', ')}`);
                }
                const missing = [...allowed].filter((name) => name !== 'dispose' && !exported.has(name));
                if (missing.length > 0) {
                    refuse('V10_EXPORT_CONTRACT_REFUSED', `kernel-extension ${module.packageId} does not export its sealed surface: ${missing.join(', ')}`);
                }
            }
            if (module.role === 'standard-feature') {
                const exported = new Set(Object.keys(namespace));
                const allowed = new Set([...SFEATURE_EXPORT_BASE, module.featureExport]);
                if (typeof namespace.dispose === 'function')
                    allowed.add('dispose');
                const unexpected = [...exported].filter((name) => !allowed.has(name));
                if (unexpected.length > 0) {
                    refuse('V10_EXPORT_CONTRACT_REFUSED', `standard-feature ${module.packageId} exports beyond its sealed feature surface: ${unexpected.join(', ')}`);
                }
                const missing = [...allowed].filter((name) => name !== 'dispose' && !exported.has(name));
                if (missing.length > 0) {
                    refuse('V10_EXPORT_CONTRACT_REFUSED', `standard-feature ${module.packageId} does not export its sealed surface: ${missing.join(', ')}`);
                }
            }
        }
        // ---- (4) advisory init in sealed order; reverse disposal on failure ----
        const advisories = [];
        const initialized = [];
        for (const packageId of appView.loadOrder) {
            const module = byId.get(packageId);
            if (module.role !== 'kernel-extension' && module.role !== 'standard-feature')
                continue;
            advisories.push({
                packageId,
                kind: module.role,
                identityLabel: module.role === 'kernel-extension' ? String(module.providerId ?? '') : String(module.provides[0] ?? ''),
                identityKey: module.provides[0] ?? '',
                dispose: undefined,
            });
        }
        // Optional deployment identity: validated here
        // once, then carried into every business runtime's K02 scoped namespace.
        let deploymentIdentity;
        if (options.deploymentIdentity !== undefined) {
            const raw = options.deploymentIdentity;
            if (!isPlainRecord(raw)) {
                refuse('V10_APP_INVALID', 'deploymentIdentity must be a plain record');
            }
            const identity = { deployedAppId: '', tenantId: '', appId: '' };
            for (const field of ['deployedAppId', 'tenantId', 'appId']) {
                const value = raw[field];
                if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
                    refuse('V10_APP_INVALID', `deploymentIdentity.${field} must be a bounded non-empty string`);
                }
                identity[field] = value;
            }
            if (options.tenantId !== undefined && options.tenantId !== identity.tenantId) {
                refuse('V10_APP_INVALID', 'options.tenantId and deploymentIdentity.tenantId disagree; one deployment owns one tenant identity');
            }
            deploymentIdentity = identity;
        }
        // [v0.10 T10 #1176] Host-owned query authority: validated once here so a
        // malformed deployment wiring fails activation instead of silently
        // degrading query authorization. Never sourced from public query input.
        let queryAuthority;
        if (options.queryAuthority !== undefined) {
            const raw = options.queryAuthority;
            if (!isPlainRecord(raw) || raw.principal === null || raw.principal === undefined
                || typeof raw.authorize !== 'function') {
                refuse('V10_APP_INVALID', 'queryAuthority must be Host-owned wiring carrying a verified principal and an authorize(principal, target) function');
            }
            const authorize = raw.authorize;
            queryAuthority = Object.freeze({
                principal: raw.principal,
                authorize: (principal, target) => authorize.call(raw, principal, target),
            });
        }
        const facade = new V10AppFacade({
            app: appView,
            namespaces,
            advisories,
            store: options.store,
            tenantId: deploymentIdentity?.tenantId ?? options.tenantId ?? 'tenant:v010-default',
            now: options.now ?? Date.now,
            counters,
            ...(deploymentIdentity === undefined ? {} : { deploymentIdentity }),
            ...(queryAuthority === undefined ? {} : { queryAuthority }),
        });
        // A `function` declaration (not a const arrow) so the explicit `never`
        // return is on the referenced declaration itself: TypeScript only treats
        // the call as a control-flow terminator that way, which is what narrows
        // `initReturn` to a plain record after the guard below.
        function failActivation(code, failedPackageId, message) {
            for (let index = initialized.length - 1; index >= 0; index -= 1) {
                const advisory = initialized[index];
                counters.disposals.push(advisory.packageId);
                try {
                    advisory.dispose?.();
                }
                catch {
                    // Bounded best-effort teardown; the authority evidence is that no
                    // K state or protected port changed, not this call itself.
                }
            }
            facade.close();
            counters.initFailures.push({ packageId: failedPackageId, message });
            refuse(code, message);
        }
        for (const advisory of advisories) {
            const namespace = namespaces.get(advisory.packageId);
            const init = namespace.init;
            counters.initCalls.push(advisory.packageId);
            let initReturn;
            try {
                initReturn = init(advisoryContext(appView, counters, advisory.packageId));
            }
            catch (error) {
                failActivation('V10_EXTENSION_INIT_FAILED', advisory.packageId, `advisory module ${advisory.packageId} init threw: ${error instanceof Error ? error.message : String(error)}`);
            }
            // Contract rejection is a late init failure: run the SAME reverse
            // teardown path as a thrown init, never bypass the initialized stack.
            if (!isPlainRecord(initReturn)) {
                failActivation('V10_INIT_CONTRACT_REFUSED', advisory.packageId, `advisory module ${advisory.packageId} init return must be a plain record`);
            }
            const initRecord = initReturn;
            const fields = Object.keys(initRecord);
            if (fields.some((field) => !INIT_RETURN_FIELDS.has(field))) {
                // A forged createOccurrenceRuntime / effectPermit / principal rides
                // exactly here: authority-shaped caller data is refused typed.
                failActivation('V10_INIT_CONTRACT_REFUSED', advisory.packageId, `advisory module ${advisory.packageId} init return carries non-contract fields: ${fields.join(', ')}`);
            }
            if (initRecord.ok !== true) {
                failActivation('V10_INIT_CONTRACT_REFUSED', advisory.packageId, `advisory module ${advisory.packageId} init return does not confirm its plain init contract`);
            }
            if (initRecord.observedContext !== undefined && !isPlainRecord(initRecord.observedContext)) {
                failActivation('V10_INIT_CONTRACT_REFUSED', advisory.packageId, `advisory module ${advisory.packageId} init return observedContext must be plain data`);
            }
            if (advisory.kind === 'kernel-extension'
                && (initRecord.providerId !== byId.get(advisory.packageId).providerId
                    || initRecord.hook !== advisory.identityKey)) {
                failActivation('V10_INIT_CONTRACT_REFUSED', advisory.packageId, `advisory module ${advisory.packageId} init return does not confirm its sealed provider/hook identity`);
            }
            if (advisory.kind === 'standard-feature' && initRecord.featureKey !== advisory.identityKey) {
                failActivation('V10_INIT_CONTRACT_REFUSED', advisory.packageId, `advisory module ${advisory.packageId} init return does not confirm its sealed feature key`);
            }
            initialized.push({
                ...advisory,
                dispose: typeof namespace.dispose === 'function' ? namespace.dispose : undefined,
            });
        }
        // ---- (5)+(6) the facade is the execute surface; dispose closes in reverse ----
        return {
            facade,
            counters,
            dispose: () => {
                // Close the declared-import resolution seam first: after activation
                // close, this App's allowances stop being honored (fail-closed).
                releaseDeclaredImports?.();
                facade.close();
                for (let index = initialized.length - 1; index >= 0; index -= 1) {
                    const advisory = initialized[index];
                    counters.disposals.push(advisory.packageId);
                    try {
                        advisory.dispose?.();
                    }
                    catch {
                        // bounded best-effort teardown
                    }
                }
            },
        };
    }
    catch (error) {
        releaseDeclaredImports?.();
        if (error instanceof V10ActivationError) {
            counters.activationRefusals.push({ code: error.code, message: error.message });
        }
        throw error;
    }
}
