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
 * effect runtime (journals/effects exist only inside the wired Kernel);
 * no init-script engine — the #1023 S03 lifecycle hooks are optional
 * module exports of BUILD-sealed packages, called in the sealed
 * BUILD-fixed packages order, and nothing more. The #1023 S04 callable
 * OperationCall surface adds NO second Runtime either: pure operations
 * dispatch the exact BUILD-bound sealed handler with plain-JSON data only,
 * effectful operations are ordinary authenticated Kernel occurrences
 * (Business admission → Journal → Effect), and the capability-owned
 * physical handlers run only behind the Kernel's effect dispatch as
 * Host-provisioned resource adapters.
 */
import { QualifiedPackageError } from './contracts.js';
import { currentKernelHostPorts } from './kernel-host.js';
import { currentHostModelPort } from './model-port.js';
import { load } from './load.js';
function typedError(code, message) {
    return new QualifiedPackageError(code, message);
}
function errorMessage(error) {
    return String(error?.message ?? error);
}
/**
 * Reverse-order cleanup of already-initialized packages along the sealed
 * (BUILD-fixed) dependency order. Every participant is offered its
 * `dispose` even when an earlier dispose failed; failures are COLLECTED,
 * never thrown, so the caller can report them beside the primary failure
 * without erasing it.
 */
async function disposeInitialized(initialized) {
    const failures = [];
    for (const participant of [...initialized].reverse()) {
        if (participant.dispose === undefined)
            continue;
        try {
            await participant.dispose(participant.context);
        }
        catch (error) {
            failures.push({ packageId: participant.packageId, message: errorMessage(error) });
        }
    }
    return failures;
}
const OPERATION_EFFECT_CLASSES = ['none', 'idempotent', 'non-idempotent'];
function isOperationEffectClass(value) {
    return typeof value === 'string' && OPERATION_EFFECT_CLASSES.includes(value);
}
const OPERATION_JSON_MAX_DEPTH = 64;
function isPlainRecordValue(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Descriptor-safe bounded JSON validation for OperationCall payloads: plain
 * JSON data only (finite numbers, plain arrays/objects), hostile ACCESSORS
 * refused WITHOUT invocation, depth-capped so a cyclic presentation cannot
 * exhaust the stack. Unlike assertPlainJsonIntent (the transport-intent
 * walker), this reads every slot through its property descriptor — an
 * OperationCall is a NEW externally shaped surface, so its input AND the
 * handler's output both pass this gate typed.
 */
function assertOperationJsonData(value, path, code, depth = 0) {
    if (depth > OPERATION_JSON_MAX_DEPTH) {
        throw typedError(code, `${path} exceeds the maximum OperationCall JSON depth (${OPERATION_JSON_MAX_DEPTH})`);
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw typedError(code, `${path} contains a non-finite number`);
        }
        return;
    }
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') {
        throw typedError(code, `${path} carries a non-JSON ${typeof value}; OperationCall payloads are data only`);
    }
    if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) {
            throw typedError(code, `${path} is not a plain array`);
        }
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const lengthDescriptor = descriptors.length;
        if (lengthDescriptor === undefined
            || !Object.hasOwn(lengthDescriptor, 'value')
            || !Number.isSafeInteger(lengthDescriptor.value)
            || lengthDescriptor.value < 0) {
            throw typedError(code, `${path}.length descriptor is not the intrinsic array length`);
        }
        const length = lengthDescriptor.value;
        if (Reflect.ownKeys(descriptors).length !== length + 1) {
            throw typedError(code, `${path} has non-index own keys`);
        }
        for (let index = 0; index < length; index += 1) {
            const descriptor = descriptors[String(index)];
            if (descriptor === undefined || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
                throw typedError(code, `${path}[${index}] is not an own enumerable data slot (accessors are refused)`);
            }
            assertOperationJsonData(descriptor.value, `${path}[${index}]`, code, depth + 1);
        }
        return;
    }
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
        throw typedError(code, `${path} must be a plain JSON object`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(value)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw typedError(code, `${path}.${key} is a dangerous own key`);
        }
        const descriptor = descriptors[key];
        if (descriptor === undefined || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
            throw typedError(code, `${path}.${key} is not an own enumerable data slot (accessors are refused)`);
        }
        assertOperationJsonData(descriptor.value, `${path}.${key}`, code, depth + 1);
    }
    if (Reflect.ownKeys(descriptors).length !== Object.keys(value).length) {
        throw typedError(code, `${path} has non-enumerable own keys`);
    }
}
/**
 * Wire the callable operation surface of every sealed S02a capability
 * binding at THIS trusted activation boundary (#1023 S04): the module's
 * optional `OPERATIONS` ABI table is validated against the BUILD capability
 * binding's exact operation→handler map (the installer already proved every
 * bound handler is a callable export), every referenced visibility/admission
 * intent must be sealed in THIS closure, and every effectful entry must
 * carry its Host physical resource route. A malformed, unbound, duplicate
 * or contradictory ABI fails typed BEFORE any facade escapes — a capability
 * package without an `OPERATIONS` export keeps the S02a-only behavior (its
 * handlers stay installed but not callable). No runtime discovery exists:
 * what BUILD sealed here is the entire callable surface.
 */
function wireCapabilityOperations(input) {
    const capabilities = new Map();
    const adapters = new Map();
    for (const binding of input.bindings) {
        if (binding.role !== 'capability')
            continue;
        const namespace = input.getModuleNamespace(binding.packageId);
        const operations = new Map();
        const abiTable = namespace.OPERATIONS;
        if (abiTable === undefined) {
            capabilities.set(binding.capabilityId, { packageId: binding.packageId, endpointId: binding.endpointId, operations });
            continue;
        }
        if (!Array.isArray(abiTable) || abiTable.length === 0) {
            throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} exports an OPERATIONS ABI that is not a non-empty array`);
        }
        for (const entry of abiTable) {
            if (!isPlainRecordValue(entry)) {
                throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} OPERATIONS entries must be plain records`);
            }
            const operationId = entry.operationId;
            if (typeof operationId !== 'string' || operationId.length === 0) {
                throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} declares an OPERATIONS entry without a non-empty operationId`);
            }
            if (operations.has(operationId)) {
                throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} declares operation ${operationId} more than once in its OPERATIONS ABI`);
            }
            const effectClass = entry.effectClass;
            if (!isOperationEffectClass(effectClass)) {
                throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} operation ${operationId} declares effectClass ${String(effectClass)}; the declaration family is none | idempotent | non-idempotent`);
            }
            const boundHandler = binding.handlers.find((candidate) => candidate.operationId === operationId);
            if (boundHandler === undefined) {
                throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} OPERATIONS entry ${operationId} has no exact BUILD handler binding; the callable surface is BUILD-fixed`);
            }
            const handlerExport = namespace[boundHandler.handler];
            // The installer already refused non-callable bound exports
            // (MODULE_HANDLER_MISSING); this is the same invariant re-anchored at
            // the dispatch wiring.
            if (typeof handlerExport !== 'function') {
                throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} operation ${operationId} handler ${boundHandler.handler} is not callable on the installed namespace`);
            }
            const handler = handlerExport;
            if (effectClass === 'none') {
                const visibility = entry.visibility;
                if (!isPlainRecordValue(visibility) || typeof visibility.intentType !== 'string' || visibility.intentType.length === 0) {
                    throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} pure operation ${operationId} must declare visibility.intentType (Business-governed role set)`);
                }
                if (!input.sealedIntentTypes.has(visibility.intentType)) {
                    throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} pure operation ${operationId} visibility references intent ${visibility.intentType} which is not bound in this sealed closure`);
                }
                if (entry.intentType !== undefined || entry.resource !== undefined) {
                    throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} pure operation ${operationId} cannot declare an admission intent or a physical resource route`);
                }
                operations.set(operationId, { effectClass, handler, visibilityIntentType: visibility.intentType });
                continue;
            }
            const intentType = entry.intentType;
            if (typeof intentType !== 'string' || intentType.length === 0) {
                throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} effectful operation ${operationId} must declare the sealed Business intentType that owns its admission`);
            }
            if (!input.sealedIntentTypes.has(intentType)) {
                throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} effectful operation ${operationId} references intent ${intentType} which is not bound in this sealed closure; every effect traverses the sealed Business admission`);
            }
            if (entry.visibility !== undefined) {
                throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} effectful operation ${operationId} visibility is the intent's own role gate; an extra visibility declaration is contradictory`);
            }
            const resource = entry.resource;
            if (!isPlainRecordValue(resource)
                || typeof resource.key !== 'string' || resource.key.length === 0
                || typeof resource.operation !== 'string' || resource.operation.length === 0) {
                throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} effectful operation ${operationId} must declare resource {key, operation} for the Host physical route`);
            }
            const resourceOperations = adapters.get(resource.key) ?? new Map();
            if (resourceOperations.has(resource.operation)) {
                throw typedError('OPERATION_ABI_INVALID', `resource ${resource.key}.${resource.operation} is claimed by more than one capability operation; Host physical routes are injective`);
            }
            resourceOperations.set(resource.operation, handler);
            adapters.set(resource.key, resourceOperations);
            operations.set(operationId, { effectClass, handler, intentType, resource: { key: resource.key, operation: resource.operation } });
        }
        capabilities.set(binding.capabilityId, { packageId: binding.packageId, endpointId: binding.endpointId, operations });
    }
    return { capabilities, adapters };
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
 * side effect. #1023 S03 adds the optional package lifecycle phase
 * (init ascending / dispose descending along the sealed BUILD-fixed
 * packages order) between import and wiring: an init failure blocks the
 * entire activation and cleans up in reverse order starting from the
 * failed package itself (best-effort, R1 P1-02); a post-init wiring
 * failure cleans up the initialized packages the same way with its own
 * typed error rethrown unchanged. Residual scope honestly documented
 * (same JS semantics as the installer): packages whose module top level
 * already evaluated during the qualified install cannot be un-evaluated;
 * the loader guarantees only that nothing of ITS OWN (facade, observers,
 * mechanism construction, lifecycle participants) outlives a failed
 * activation.
 */
async function loadScopedFacade(packageRoot) {
    if (arguments.length !== 1) {
        throw typedError('LOAD_ARITY_INVALID', 'load accepts exactly one argument: the sealed qualified package root; there is no options overload and no caller-injectable Host port (P1-L2-ABI-02)');
    }
    // Kernel Host binding: protected internal channel ONLY (never a load
    // argument). Fail-closed before anything else. The read carries this
    // module's gateway session capability (#1013 R2 @5494026032): the trusted
    // bootstrap installs the SAME unguessable value into the gateway channel
    // here and into the kernel Host ports channel, so the public one-arg load
    // keeps working while an uncredentialed deep importer of kernel-host.js is
    // refused at the getter before any port escapes.
    const hostPorts = currentKernelHostPorts(gatewaySessionCap);
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
    // ---- #1023 S03: optional package lifecycle (init/dispose) ----
    // Module import stays the existing trusted preflight above (load() →
    // installer); ACTIVATION side effects are this phase. Every package of
    // the actually selected closure (K/S/B plus any BUILD-admitted capability
    // package) MAY export `init(context)` / `dispose(context)`; the sealed
    // root's packages array order — BUILD-fixed and committed inside the
    // approval subject digest — IS the dependency order: init runs ascending,
    // cleanup runs descending. A present-but-non-callable hook is refused by
    // the pre-scan BEFORE any lifecycle side effect; an init failure blocks
    // the whole activation (no policy resolution, no mechanism construction,
    // no facade) and cleans up along the reverse order starting with the
    // FAILED package itself (R1 P1-02: its init may have partially allocated
    // resources — a best-effort dispose runs first when the package exports
    // one), then the already-initialized packages. The context is the frozen
    // data-only identity record (contracts.ts V8PackageLifecycleContext); it
    // never carries Host ports, gateway session material or any Kernel/Host
    // private capability, and there is no init-script engine — the hooks are
    // exports of BUILD-sealed module bytes, nothing else.
    const participants = [];
    for (const pkg of loaded.installedPackages) {
        const namespace = loaded.getModuleNamespace(pkg.packageId);
        const initHook = namespace.init;
        const disposeHook = namespace.dispose;
        if (initHook === undefined && disposeHook === undefined)
            continue;
        if ((initHook !== undefined && typeof initHook !== 'function') || (disposeHook !== undefined && typeof disposeHook !== 'function')) {
            const which = initHook !== undefined && typeof initHook !== 'function' ? 'init' : 'dispose';
            throw typedError('LIFECYCLE_HOOK_INVALID', `package ${pkg.packageId} exports a ${which} hook that is not a function; lifecycle hooks must be callable module exports`);
        }
        participants.push({
            packageId: pkg.packageId,
            context: Object.freeze({
                packageId: pkg.packageId,
                kind: pkg.kind,
                abiVersion: pkg.abiVersion,
                rootPackageId: loaded.rootPackageId,
                closureDigest: loaded.build.closureDigest,
            }),
            init: initHook,
            dispose: disposeHook,
        });
    }
    const initialized = [];
    for (const participant of participants) {
        if (participant.init === undefined) {
            // A dispose-only participant is vacuously initialized: it never
            // receives init, but its cleanup runs in the reverse sealed order.
            initialized.push(participant);
            continue;
        }
        try {
            await participant.init(participant.context);
        }
        catch (error) {
            // R1 P1-02: a failed init may hold PARTIALLY allocated resources —
            // best-effort dispose the FAILING participant FIRST (its allocation
            // is the most recent), then the already-initialized packages in
            // reverse sealed order. Every cleanup failure is collected beside
            // the primary LIFECYCLE_INIT_FAILED error without erasing it.
            const cleanupFailures = [];
            if (participant.dispose !== undefined) {
                try {
                    await participant.dispose(participant.context);
                }
                catch (disposeError) {
                    cleanupFailures.push({ packageId: participant.packageId, message: errorMessage(disposeError) });
                }
            }
            cleanupFailures.push(...await disposeInitialized(initialized));
            const failure = typedError('LIFECYCLE_INIT_FAILED', `package ${participant.packageId} lifecycle init failed: ${errorMessage(error)}; activation is blocked and lifecycle cleanup ran (the failed package best-effort first, then the initialized packages in reverse sealed order)`);
            if (cleanupFailures.length > 0)
                failure.cleanupFailures = cleanupFailures;
            throw failure;
        }
        initialized.push(participant);
    }
    const observers = new Set();
    // The sealed intent index IS the fixed closure: send() performs no
    // provider discovery and never falls back (KPK-03 heritage). Built before
    // the activation try so the #1023 S04 capability OperationCall wiring can
    // validate every ABI-referenced intent against the SAME sealed set.
    const intentIndex = new Map(bindings
        .filter((binding) => binding.role === 'intent')
        .map((binding) => [binding.intentType, binding]));
    let businessPolicy;
    let kernelRuntime;
    let wiredOperations;
    try {
        // ---- FR08 (#1013, I04 + R1 F-03 / ABI ruling #1013@6118426531): trusted
        // ModelPort binding, protected channel ONLY. When this process bootstrapped
        // a Host ModelPort and the qualified Standard SDK exposes the host-bound
        // resolver factory, the endpoint handed to the Kernel is a COMPOSITE that
        // dispatches ONLY on the SEALED business rule declaration: a
        // `model-decision` rule routes through the resolver's real async
        // port-invoking endpoint (`invokeDecision` — the Kernel awaits the result
        // per the recorded ABI ruling), every other declared kind stays on the
        // resolver's model-free wrapper (honest `measured(0)` scoped to bound-port
        // invocations). Caller input/context never selects the path. Without an
        // installed port the plain `interpret` stays wired and evidence remains
        // `unsupported`/`unmeasured` — there is no synthetic measured zero and no
        // caller-supplied port anywhere. The read carries this module's gateway
        // session capability (#1013 R2 @5494026032): the same unguessable value
        // the bootstrap installed with the port, so the trusted load path keeps
        // working while an uncredentialed deep importer of model-port.js is
        // refused at the getter before the frozen {invoke} object can be reached.
        const modelPort = currentHostModelPort(gatewaySessionCap);
        const resolverFactory = sdkNamespace.createHostBoundModelResolver;
        const sdkEndpoint = (modelPort !== undefined && typeof resolverFactory === 'function'
            ? (() => {
                const factory = resolverFactory;
                let bound;
                try {
                    bound = factory(modelPort);
                }
                catch (error) {
                    throw typedError('ACTIVATION_FAILED', `standard-sdk package ${sdkBinding.packageId} host-bound model resolver activation failed: ${String(error?.message ?? error)}`);
                }
                if (typeof bound !== 'object'
                    || bound === null
                    || typeof bound.interpret !== 'function'
                    || typeof bound.invokeDecision !== 'function') {
                    // R1 F-03 stale/failed-bind negative: a factory that does not
                    // expose the real port-invoking endpoint is not a usable
                    // production binding — refuse typed, never degrade silently.
                    throw typedError('ACTIVATION_FAILED', `standard-sdk package ${sdkBinding.packageId} host-bound model resolver exposes no callable interpret/invokeDecision pair (stale or failed bind)`);
                }
                /**
                 * #1003 FR07-KH2 (B3): the resolver for ONE model turn. Without a
                 * protected control it is the load-time binding. With one, the SAME
                 * qualified factory is bound to a request-scoped view of the SAME
                 * trusted port that adds only the cancellation signal to the
                 * physical invocation — the S step/decision code, its evidence
                 * minting and the port identity are unchanged; nothing else rides.
                 */
                const resolverFor = (control) => {
                    if (control === undefined)
                        return bound;
                    const signal = control.signal;
                    const signalledPort = Object.freeze({
                        invoke: (request) => modelPort.invoke({ operation: request.operation, input: request.input, signal }),
                    });
                    try {
                        return factory(signalledPort);
                    }
                    catch (error) {
                        throw typedError('ACTIVATION_FAILED', `standard-sdk package ${sdkBinding.packageId} request-scoped model resolver bind failed: ${String(error?.message ?? error)}`);
                    }
                };
                const interpretComposite = (declaration, input, context, control) => {
                    const kind = declaration?.kind;
                    return kind === 'model-decision'
                        ? resolverFor(control).invokeDecision(declaration, input, context)
                        : bound.interpret(declaration, input, context);
                };
                if (typeof bound.invokeStep !== 'function') {
                    // An S package without the step surface still serves one-turn
                    // decisions; a harness rule then refuses typed inside K.
                    return { packageId: sdkBinding.packageId, interpret: interpretComposite };
                }
                const invokeStep = (declaration, input, context, control) => {
                    const resolver = resolverFor(control);
                    if (typeof resolver.invokeStep !== 'function') {
                        throw typedError('ACTIVATION_FAILED', `standard-sdk package ${sdkBinding.packageId} request-scoped model resolver exposes no invokeStep`);
                    }
                    return resolver.invokeStep(declaration, input, context);
                };
                return { packageId: sdkBinding.packageId, interpret: interpretComposite, invokeStep };
            })()
            : { packageId: sdkBinding.packageId, interpret: sdkNamespace.interpret });
        // Business policy resolution precedes kernel construction: a policy that
        // throws or returns a non-object fails typed with the mechanism still inert.
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
        // ---- Kernel mechanism construction (LAST; kernel-owned side effects
        // exist only from this point on, and only behind the verified gate). ----
        let kernelCandidate;
        try {
            kernelCandidate = createOccurrenceRuntime({
                moduleIdentity,
                hostPorts,
                sdkEndpoint: Object.freeze(sdkEndpoint),
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
        kernelRuntime = kernelCandidate;
        // ---- #1023 S04: BUILD-fixed callable OperationCall wiring ----
        // The sealed S02a capability bindings plus each capability module's
        // optional sealed OPERATIONS ABI become the dispatch table (and the
        // trusted-Host physical resource adapters) — validated HERE, at the
        // same trusted boundary, so a malformed ABI leaves no facade (the S03
        // reverse cleanup above applies to any initialized packages).
        wiredOperations = wireCapabilityOperations({
            bindings,
            getModuleNamespace: (packageId) => loaded.getModuleNamespace(packageId),
            sealedIntentTypes: new Set(intentIndex.keys()),
        });
    }
    catch (error) {
        // #1023 S03: a post-init activation failure leaves NO partial active
        // residue either — every already-initialized package is disposed in
        // reverse sealed order, the primary typed error is rethrown unchanged,
        // and dispose failures ride beside it without erasing it.
        const cleanupFailures = await disposeInitialized(initialized);
        if (cleanupFailures.length > 0 && error instanceof QualifiedPackageError) {
            error.cleanupFailures = cleanupFailures;
        }
        throw error;
    }
    // The frozen trusted-Host adapter view (#1023 S04): one entry per sealed
    // resource key, each operation map frozen at this trusted boundary.
    const resourceAdapters = Object.freeze([...wiredOperations.adapters.entries()].map(([resourceKey, operations]) => Object.freeze({ resourceKey, operations: new Map(operations) })));
    const capabilityOperations = wiredOperations.capabilities;
    let stopped = false;
    let stopDisposal;
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
        // #1023 S03, R1 P1-01: stopping the scope tears the package lifecycle
        // down along the reverse sealed (BUILD-fixed) order and the teardown is
        // AWAITABLE — each dispose is fully awaited (sync or async) before the
        // next participant starts, a failing dispose never aborts the remaining
        // teardown, and the aggregate typed LIFECYCLE_DISPOSE_FAILED error
        // REJECTS the returned promise (a rejection is never silenced: callers
        // that ignore the promise leave it unobserved, which surfaces through
        // the host's unhandled-rejection channel). The disposal is ONE-SHOT:
        // the first stop caches the outcome promise and every repeated stop
        // reports that same outcome without re-running anything.
        stopDisposal ??= disposeInitialized(initialized).then((failures) => {
            if (failures.length > 0) {
                throw typedError('LIFECYCLE_DISPOSE_FAILED', `facade stop lifecycle cleanup failed for ${failures.map((failure) => failure.packageId).join(', ')}: ${failures.map((failure) => failure.message).join('; ')}`);
            }
        });
        return stopDisposal;
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
    /**
     * The single authenticated Kernel-occurrence request construction
     * (#1013 I02, shared verbatim by submitAs and the #1023 S04 effectful
     * OperationCall): intent shape check, sealed-intent binding check, the
     * principal's tenant/app-qualified instance address and the caller
     * derived ONLY from the issuer-signed roles ∩ the sealed Business binding
     * roles. `send` and an effectful OperationCall can never diverge — they
     * are the same unbypassable route.
     */
    function buildKernelOccurrenceRequest(principal, request) {
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
        return kernelRequest;
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
        async submitAs(principal, request, control) {
            assertOpen();
            requirePrincipal(principal);
            const kernelRequest = buildKernelOccurrenceRequest(principal, request);
            // #1003 FR07-KH2: the protected control stays OUT of the plain-JSON
            // request; the Kernel validates it and owns the latch it drives.
            return control === undefined
                ? kernelRuntime.submitOccurrence(kernelRequest)
                : kernelRuntime.submitOccurrence(kernelRequest, control);
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
        async invokeOperation(principal, call, control) {
            assertOpen();
            requirePrincipal(principal);
            if (typeof call !== 'object' || call === null) {
                throw typedError('OPERATION_CALL_MALFORMED', 'an OperationCall must be a plain record {capabilityId, operationId, input?}');
            }
            const callRecord = call;
            if (typeof callRecord.capabilityId !== 'string' || callRecord.capabilityId.length === 0) {
                throw typedError('OPERATION_CALL_MALFORMED', 'OperationCall.capabilityId must be a non-empty string');
            }
            if (typeof callRecord.operationId !== 'string' || callRecord.operationId.length === 0) {
                throw typedError('OPERATION_CALL_MALFORMED', 'OperationCall.operationId must be a non-empty string');
            }
            const capability = capabilityOperations.get(callRecord.capabilityId);
            if (capability === undefined) {
                throw typedError('OPERATION_CAPABILITY_UNKNOWN', `capability ${callRecord.capabilityId} is not bound in this sealed package closure; the callable surface is BUILD-fixed with no runtime discovery`);
            }
            const operation = capability.operations.get(callRecord.operationId);
            if (operation === undefined) {
                throw typedError('OPERATION_UNKNOWN', `operation ${callRecord.operationId} is not declared callable on capability ${callRecord.capabilityId} in this sealed closure`);
            }
            if (operation.effectClass === 'none') {
                // PURE dispatch: the ONLY inputs are the plain-JSON OperationCall
                // data. No Host/Kernel port, no State/Journal/Effect contact, and
                // no occurrence address may ride (one surface, one meaning).
                if (callRecord.instanceKey !== undefined || callRecord.messageId !== undefined) {
                    throw typedError('OPERATION_CALL_MALFORMED', 'a pure OperationCall carries no occurrence address (instanceKey/messageId)');
                }
                const visibilityIntent = operation.visibilityIntentType;
                // B-governed visibility: the issuer-signed principal must hold a
                // role the SEALED Business intent binding admits — the same gate as
                // an authenticated send, decided by the same sealed policy data.
                requirePrincipalRole(principal, visibilityIntent);
                const input = callRecord.input === undefined ? null : callRecord.input;
                assertOperationJsonData(input, '$operationCall.input', 'OPERATION_INPUT_INVALID');
                let output;
                try {
                    output = await operation.handler(input);
                }
                catch (error) {
                    throw typedError('OPERATION_HANDLER_FAILED', `operation ${callRecord.operationId} handler failed: ${errorMessage(error)}`);
                }
                assertOperationJsonData(output, '$operationCall.output', 'OPERATION_OUTPUT_INVALID');
                return output;
            }
            // EFFECTFUL dispatch: the capability handler is NEVER executed here.
            // The call is an authenticated Kernel occurrence like send — the
            // sealed Business intent owns the role/guard/invariant and the effect
            // declaration, and the physical handler runs only behind the
            // Kernel's effect dispatch (Admission → Journal → Effect) as the
            // Host-provisioned resource adapter. This branch constructs the SAME
            // request submitAs builds — there is no alternate K/S composition.
            if (typeof callRecord.messageId !== 'string' || callRecord.messageId.length === 0 || typeof callRecord.instanceKey !== 'string' || callRecord.instanceKey.length === 0) {
                throw typedError('OPERATION_CALL_MALFORMED', 'an effectful OperationCall must carry the occurrence address (instanceKey and messageId) exactly like an authenticated send');
            }
            const kernelRequest = buildKernelOccurrenceRequest(principal, {
                intentType: operation.intentType,
                messageId: callRecord.messageId,
                instanceKey: callRecord.instanceKey,
                input: callRecord.input,
            });
            return control === undefined
                ? kernelRuntime.submitOccurrence(kernelRequest)
                : kernelRuntime.submitOccurrence(kernelRequest, control);
        },
        operationResourceAdapters() {
            assertOpen();
            return resourceAdapters;
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
 * #1013 R2 repair (@6122817203): the gateway ops session capability channel.
 * The packed npm distribution ships this module's compiled sibling next to
 * the public entry, and stock Node resolves an absolute `file:` URL past any
 * package-exports map — so "not re-exported" alone is NOT an enforceable
 * boundary for an uncredentialed same-process consumer. The ops seam is
 * therefore gated by a one-shot, host-generated unguessable session
 * capability installed ONLY by `bootstrapTrustedHost` (which hands it to the
 * trusted Host kernel gateway and to nobody else): without the exact
 * capability, `getFacadeKernelOps` refuses typed before the WeakMap is ever
 * consulted, and forging a `V8GatewayPrincipal` (structural check only) can
 * never reach the Kernel. A deep import of this module yields functions, not
 * authority. Mirrors the one-shot channel pattern of trust.ts/kernel-host.ts
 * /model-port.ts: first installation wins, and a bootstrap whose session
 * channel is already occupied refuses with zero residue.
 */
let gatewaySessionCap;
/**
 * Validate the gateway session channel WITHOUT consuming it (#1013 R2): the
 * Host bootstrap preflights this channel alongside every other one-shot
 * channel before committing any installation. Internal protected.
 */
export function preflightGatewaySessionCap() {
    if (gatewaySessionCap !== undefined) {
        throw typedError('GATEWAY_SESSION_ALREADY_INSTALLED', 'a gateway session capability is already installed in this process; the protected gateway ops seam is one-shot');
    }
}
/**
 * Install the gateway session capability for this process. Internal
 * protected bootstrap (`bootstrapTrustedHost` only): one-shot, and the
 * capability value must be an unguessable host-generated string so a
 * consumer can never brute-force or guess its way past the seam.
 */
export function installGatewaySessionCap(cap) {
    preflightGatewaySessionCap();
    if (typeof cap !== 'string' || cap.length < 32 || cap.length > 256) {
        throw typedError('GATEWAY_SESSION_INVALID', 'installGatewaySessionCap requires an unguessable host-generated session capability string (32–256 chars)');
    }
    gatewaySessionCap = cap;
}
/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export function isGatewaySessionCapInstalled() {
    return gatewaySessionCap !== undefined;
}
/**
 * Constant-time equality for the session capability (fixed-length host
 * random; pure JS on purpose — this module stays free of byte-decoding
 * machinery by static proof).
 */
function sessionMatches(cap) {
    if (gatewaySessionCap === undefined || typeof cap !== 'string' || cap.length !== gatewaySessionCap.length) {
        return false;
    }
    let diff = 0;
    for (let index = 0; index < cap.length; index += 1) {
        diff |= cap.charCodeAt(index) ^ gatewaySessionCap.charCodeAt(index);
    }
    return diff === 0;
}
/**
 * Retrieve the private Kernel operations of a facade produced by
 * `DomainHarness.load(package)` in THIS process (#1013, I02/I03). Returns
 * `undefined` for anything that is not such a facade. Trusted Host gateway
 * use only: the caller must present the EXACT gateway session capability
 * installed by `bootstrapTrustedHost` — a process without one fails closed
 * (`GATEWAY_SESSION_NOT_INSTALLED`) and a wrong or absent capability is
 * refused typed (`GATEWAY_SESSION_DENIED`) before any Kernel operation,
 * observer or address is reachable. Deep-importing this module grants no
 * authority: the capability never exists in this module's exports, only in
 * the trusted Host bootstrap's closure.
 */
export function getFacadeKernelOps(facade, sessionCap) {
    if (gatewaySessionCap === undefined) {
        throw typedError('GATEWAY_SESSION_NOT_INSTALLED', 'no gateway session capability is installed in this process; the protected ops seam stays closed until the trusted Host bootstrap establishes one');
    }
    if (!sessionMatches(sessionCap)) {
        throw typedError('GATEWAY_SESSION_DENIED', 'the protected facade ops seam requires the Host bootstrap gateway session capability; structural module access or a forged principal carries no authority (#1013 R2 @6122817203)');
    }
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