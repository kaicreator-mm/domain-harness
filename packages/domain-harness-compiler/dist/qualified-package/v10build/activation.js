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
 *       sealed graph is the whole graph — nothing else is imported);
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
import { V10_BUILD_FORMAT, V10_HOST_ABI, V10_RUNTIME_ABI, V10_TARGET_PROFILE, sha256Hex } from './digest.js';
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
function privateModuleUrl(source, activationNonce, packageId) {
    const bytes = Buffer.from(source, 'utf8').toString('base64');
    return `data:text/javascript;base64,${bytes}#v10-${activationNonce}-${encodeURIComponent(packageId)}`;
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
    #store;
    #now;
    #counters;
    #docsPrefix;
    #runtimes = new Map();
    #closed = false;
    constructor(deps) {
        this.#app = deps.app;
        this.#namespaces = deps.namespaces;
        this.#store = deps.store;
        this.#now = deps.now;
        this.#counters = deps.counters;
        this.#docsPrefix = `${K_DOCS_PREFIX}${deps.app.subjectDigest}/${deps.tenantId}/`;
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
    #assertOpen() {
        if (this.#closed) {
            refuse('FACADE_CLOSED', 'the v0.10 App facade is closed; no further K activity can start');
        }
    }
    #docs = {
        get: async (key) => {
            this.#assertOpen();
            return await this.#store.get(`${this.#docsPrefix}${key}`);
        },
        put: async (key, value, condition) => {
            this.#assertOpen();
            let mapped;
            if (isPlainRecord(condition) && condition.mustBeAbsent === true) {
                mapped = { kind: 'create' };
            }
            else if (isPlainRecord(condition) && typeof condition.mustMatchRevision === 'number' && Number.isSafeInteger(condition.mustMatchRevision)) {
                mapped = { kind: 'cas', revision: condition.mustMatchRevision };
            }
            else {
                refuse('K_DOC_CONDITION_REQUIRED', `K document write of ${key} requires a physical revision expectation`);
            }
            try {
                return await this.#store.put(`${this.#docsPrefix}${key}`, value, mapped);
            }
            catch (error) {
                const code = error.code;
                if (code === 'HOST_CAS_CONFLICT' || code === undefined) {
                    throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { code: 'HOST_CAS_CONFLICT' });
                }
                throw error;
            }
        },
        list: async (prefix) => {
            this.#assertOpen();
            const full = `${this.#docsPrefix}${prefix}`;
            const keys = this.#store.keys?.() ?? [];
            return keys.filter((key) => key.startsWith(full)).map((key) => key.slice(this.#docsPrefix.length));
        },
    };
    /** Sealed capability dispatch: the ONLY physical resource port here. */
    #resources = {
        call: async (capabilityId, operationId, payload) => {
            this.#assertOpen();
            if (typeof capabilityId !== 'string' || typeof operationId !== 'string' || !isPlainRecord(payload)) {
                refuse('RESOURCE_INPUT_INVALID', 'a resource call requires (capabilityId, operationId, record payload)');
            }
            const entry = this.#app.modules.find((module) => module.role === 'capability' && module.capabilityId === capabilityId);
            const handlerName = entry?.handlers?.find((handler) => handler.operationId === operationId)?.handler;
            if (entry === undefined || handlerName === undefined) {
                refuse('RESOURCE_ROUTE_UNSEALED', `resource ${capabilityId}:${operationId} is not sealed in this App`);
            }
            const handler = this.#namespaces.get(entry.packageId)?.[handlerName];
            if (typeof handler !== 'function') {
                refuse('RESOURCE_ABI_INVALID', `sealed handler ${handlerName} is not callable`);
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
                docs: this.#docs,
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
        const basisDigest = `sha256:${this.#app.subjectDigest}`;
        const bindings = rows.map((row) => ({ intentId: row.intentId, operationId: row.operationId, capabilityId: row.capabilityId, handlerId: row.handlerId }));
        const candidates = rows.map((row) => ({ operationId: row.operationId, capabilityId: row.capabilityId, priority: 1, eligibility: 'eligible' }));
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
                await runtime.openInstance({ target, correlationId: `corr:${messageId}`, authorityClass: 'PRODUCTION' });
            }
            catch (error) {
                const code = error.code;
                if (code !== 'HOST_CAS_CONFLICT' && code !== 'HOST_KEY_EXISTS')
                    throw error;
            }
        }
        try {
            const receipt = await runtime.submitOccurrence({
                kind: 'v08/tc-intent', intentType, target, messageId, input: intent.input,
                caller: { role: 'requester' },
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
        // ---- (2) import the sealed modules in the SEALED order ----
        const activationNonce = randomUUID();
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
        const facade = new V10AppFacade({
            app: appView,
            namespaces,
            advisories,
            store: options.store,
            tenantId: options.tenantId ?? 'tenant:v010-default',
            now: options.now ?? (() => 0),
            counters,
        });
        const failActivation = (code, failedPackageId, message) => {
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
        };
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
            const initRecord = assertPlainRecord(initReturn, `advisory module ${advisory.packageId} init return`);
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
        if (error instanceof V10ActivationError) {
            counters.activationRefusals.push({ code: error.code, message: error.message });
        }
        throw error;
    }
}
