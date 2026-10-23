/**
 * DomainHarness v0.10 T00 (#1166) — closed-world Node24 BUILD composition.
 * ========================================================================
 *
 * `buildV10App` pins, for ONE Domain App, exactly one Node24 target profile
 * and one compatible SDK + Kernel/Standard/Business/Capability graph with
 * its ordinary npm/native import allowances, under accepted Product A01
 * (A01-PC05). It is the once-only static owner of every composition fact:
 *
 *  - closed roles: exactly one K Primary, exactly one S Primary, >=1
 *    Business; capability packages are covered by exactly one sealed
 *    capability binding (handler map) — "two primaries" is a BUILD
 *    failure (A01-PC08);
 *  - advisory identity: K extension providerId/hook pairs and S feature
 *    keys are unique (duplicate/conflicting provider or feature refuses);
 *  - authority reservation: the kernel-authority namespaces (`kernel:`,
 *    `cas:`, `admission:`, `journal:`, `effect:`) may be PROVIDED only by
 *    the K Primary — a forged extension hook or any non-K package claiming
 *    commit/journal/admission authority refuses at BUILD, never at a
 *    runtime source inspection (frozen PC-08 "forged extension hook");
 *  - dependency closure: declared dependencies resolve inside the selected
 *    closure (missing refuses) and the graph is acyclic (cycle refuses);
 *    required features (`requires`) are provided by the selected closure
 *    only, so a hidden mandatory advanced dependency cannot slip in;
 *  - profile/ABI: the target profile is exactly the selected Node24 ESM
 *    profile and every entry's ABI is its role's selected row (wrong
 *    runtime/ABI refuses);
 *  - byte pinning: sha256(moduleSource) == moduleSha256 for every sealed
 *    module (byte substitution refuses);
 *  - ordinary imports: every module's import edges are sealed by its
 *    `externalImports` allowance (`import-policy.ts`); undeclared,
 *    computed dynamic, require/eval/code-string, file/data and
 *    cross-package edges refuse — the sealed graph is the whole graph,
 *    with no discovery edge (no second engine, no dynamic install);
 *  - routes: the intent→operation table is admitted against the sealed
 *    graph's OWN business intents and capability handler maps (no
 *    caller-supplied intent authority).
 *
 * Determinism is a product property: no clock, no randomness, no locale —
 * the same input builds the byte-identical plain-data output and digest.
 * The output (`dh.v10.build/1`) carries the sealed load order and mints NO
 * approval/authority of any kind; the trusted activation counterpart
 * (`activation.ts`) consumes it as plain data without re-deriving or
 * re-attesting any of these static facts (A01: the SDK is not a second
 * Package checker).
 *
 * BUILD never evaluates module source (purely static analysis) and performs
 * no I/O.
 */
import { isObjectRecord } from './guards.js';
import { canonicalSnapshot } from '@kaicreator/domain-harness/v8';
import { V10_BUILD_FORMAT, V10_BUNDLER_REVISION, V10_HOST_ABI, V10_IMPORT_POLICY_REVISION, V10_KERNEL_ADVISORY_HOOKS, V10_RUNTIME_ABI, V10_SELECTED_ROLE_ABI, V10_TARGET_PROFILE, sha256Canonical, sha256Hex, } from './digest.js';
import { assertSealedImportClosure } from './import-policy.js';
import { V10BuildError } from './errors.js';
import { resolveV10SelectedClosure } from './selected-closure.js';
const HEX64 = /^[0-9a-f]{64}$/;
const PACKAGE_ID_RE = /^[A-Za-z][A-Za-z0-9._:@-]{0,127}$/;
/** Feature/hook key grammar: `name/version` or `namespace:name/version` (e.g. `admission-budget-advice/v1`, `standard:validation/1`). */
const FEATURE_KEY_RE = /^[a-z][a-z0-9._:-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const INTENT_KEY_RE = /^intent:[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const AUTHORITY_NAMESPACES = ['kernel:', 'cas:', 'admission:', 'journal:', 'effect:'];
const ROUTE_FIELDS = new Set(['intentId', 'operationId', 'capabilityId', 'handlerId']);
const MODULE_FIELDS = new Set([
    'packageId', 'role', 'abiVersion', 'moduleSource', 'moduleSha256', 'endpoint',
    'dependencies', 'externalImports', 'provides', 'requires', 'optional',
    'providerId', 'hookExport', 'featureExport', 'capabilityId', 'handlers', 'externalEffect',
]);
const HANDLER_FIELDS = new Set(['operationId', 'handler']);
const EXTERNAL_IMPORT_FIELDS = new Set(['node', 'npm', 'native']);
const MAX_ITEMS = 256;
const MAX_STRING = 512;
/** Sealed module bytes bound (chars): real selected payload modules are tens of KB. */
const MAX_MODULE_CHARS = 8_388_608;
function fail(code, message) {
    throw new V10BuildError(code, message);
}
function boundedString(value, label) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STRING) {
        fail('BUILD_INPUT_INVALID', `${label} must be a non-empty string of at most ${String(MAX_STRING)} characters`);
    }
    return value;
}
function stringList(value, label, maxItems) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.length > maxItems) {
        fail('BUILD_INPUT_INVALID', `${label} must be an array of at most ${String(maxItems)} strings`);
    }
    const out = [];
    for (const item of value) {
        out.push(boundedString(item, `${label} entry`));
    }
    if (new Set(out).size !== out.length) {
        fail('BUILD_INPUT_INVALID', `${label} carries duplicate entries`);
    }
    return out;
}
function strictFields(value, allowed, label) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            fail('BUILD_GRAPH_INVALID', `${label} carries unknown field '${key}'; the v0.10 BUILD boundary refuses unknown fields and aliases instead of ignoring them`);
        }
    }
}
/** Canonical-snapshot hostile input first (accessor traps refused unread). */
function snapshotOrThrow(value, label) {
    let snapshot;
    try {
        snapshot = canonicalSnapshot(value);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        fail('BUILD_INPUT_INVALID', `${label} is not strict canonical plain data: ${detail}`);
    }
    if (!isObjectRecord(snapshot)) {
        fail('BUILD_INPUT_INVALID', `${label} must be a record`);
    }
    return snapshot;
}
function parseExternalImports(raw, packageId) {
    if (raw === undefined) {
        return Object.freeze({ node: Object.freeze([]), npm: Object.freeze([]), native: Object.freeze([]) });
    }
    if (!isObjectRecord(raw)) {
        fail('BUILD_INPUT_INVALID', `module ${packageId} externalImports must be a record`);
    }
    strictFields(raw, EXTERNAL_IMPORT_FIELDS, `module ${packageId} externalImports`);
    for (const kind of ['node', 'npm', 'native']) {
        for (const specifier of raw[kind] === undefined ? [] : Array.isArray(raw[kind]) ? raw[kind] : fail('BUILD_INPUT_INVALID', `module ${packageId} externalImports.${kind} must be an array`)) {
            if (typeof specifier !== 'string' || specifier.length === 0 || specifier.length > MAX_STRING) {
                fail('BUILD_INPUT_INVALID', `module ${packageId} externalImports.${kind} entries must be non-empty bounded strings`);
            }
        }
    }
    return Object.freeze({
        node: Object.freeze(stringList(raw.node, `module ${packageId} externalImports.node`, MAX_ITEMS)),
        npm: Object.freeze(stringList(raw.npm, `module ${packageId} externalImports.npm`, MAX_ITEMS)),
        native: Object.freeze(stringList(raw.native, `module ${packageId} externalImports.native`, MAX_ITEMS)),
    });
}
function parseHandlers(raw, packageId) {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) {
        fail('BUILD_GRAPH_INVALID', `capability ${packageId} must carry a non-empty bounded operation→handler map`);
    }
    const operations = new Set();
    const handlers = [];
    for (const handlerRaw of raw) {
        if (!isObjectRecord(handlerRaw)) {
            fail('BUILD_GRAPH_INVALID', `capability ${packageId} handler entry must be a record`);
        }
        strictFields(handlerRaw, HANDLER_FIELDS, `capability ${packageId} handler`);
        const operationId = boundedString(handlerRaw.operationId, `capability ${packageId} handler operationId`);
        const handler = boundedString(handlerRaw.handler, `capability ${packageId} handler handler`);
        if (operations.has(operationId)) {
            fail('BUILD_GRAPH_INVALID', `capability ${packageId} binds operation ${operationId} more than once`);
        }
        operations.add(operationId);
        handlers.push({ operationId, handler });
    }
    return handlers;
}
function parseModules(rawModules) {
    if (rawModules.length === 0 || rawModules.length > MAX_ITEMS) {
        fail('BUILD_GRAPH_INVALID', `the composition must select a non-empty bounded module array (1..${String(MAX_ITEMS)})`);
    }
    const parsed = [];
    const seenIds = new Set();
    for (const raw of rawModules) {
        if (!isObjectRecord(raw)) {
            fail('BUILD_GRAPH_INVALID', 'each composition module must be a record');
        }
        strictFields(raw, MODULE_FIELDS, 'composition module');
        const packageId = boundedString(raw.packageId, 'module packageId');
        if (!PACKAGE_ID_RE.test(packageId)) {
            fail('BUILD_INPUT_INVALID', `module packageId ${packageId} is not a bounded package identity`);
        }
        if (seenIds.has(packageId)) {
            fail('BUILD_GRAPH_INVALID', `duplicate module identity ${packageId}`);
        }
        seenIds.add(packageId);
        const role = raw.role;
        if (typeof role !== 'string' || !(role in V10_SELECTED_ROLE_ABI)) {
            fail('BUILD_GRAPH_INVALID', `module ${packageId} carries unknown role ${String(role)}`);
        }
        const abiVersion = boundedString(raw.abiVersion, `module ${packageId} abiVersion`);
        const optional = raw.optional === undefined ? false : raw.optional;
        if (typeof optional !== 'boolean') {
            fail('BUILD_INPUT_INVALID', `module ${packageId} optional must be a boolean`);
        }
        const moduleSource = raw.moduleSource === undefined ? null : (() => {
            if (typeof raw.moduleSource !== 'string' || raw.moduleSource.length === 0 || raw.moduleSource.length > MAX_MODULE_CHARS) {
                fail('BUILD_INPUT_INVALID', `module ${packageId} moduleSource must be a non-empty string of at most ${String(MAX_MODULE_CHARS)} characters`);
            }
            return raw.moduleSource;
        })();
        const moduleSha256 = raw.moduleSha256 === undefined ? null : (typeof raw.moduleSha256 === 'string' && HEX64.test(raw.moduleSha256) ? raw.moduleSha256 : fail('BUILD_GRAPH_INVALID', `module ${packageId} moduleSha256 must be a lowercase hex sha-256 digest`));
        if (optional === false && moduleSource === null) {
            fail('BUILD_GRAPH_INVALID', `module ${packageId} is not optional and must carry sealed module bytes`);
        }
        if ((moduleSource === null) !== (moduleSha256 === null)) {
            fail('BUILD_GRAPH_INVALID', `module ${packageId} must carry both sealed bytes and digest, or neither`);
        }
        parsed.push({
            packageId,
            role: role,
            abiVersion,
            moduleSource,
            moduleSha256,
            endpoint: boundedString(raw.endpoint, `module ${packageId} endpoint`),
            dependencies: Object.freeze(stringList(raw.dependencies, `module ${packageId} dependencies`, MAX_ITEMS)),
            externalImports: parseExternalImports(raw.externalImports, packageId),
            provides: Object.freeze(stringList(raw.provides, `module ${packageId} provides`, MAX_ITEMS)),
            requires: Object.freeze(stringList(raw.requires, `module ${packageId} requires`, MAX_ITEMS)),
            optional,
            providerId: raw.providerId === undefined ? null : boundedString(raw.providerId, `module ${packageId} providerId`),
            hookExport: raw.hookExport === undefined ? null : boundedString(raw.hookExport, `module ${packageId} hookExport`),
            featureExport: raw.featureExport === undefined ? null : boundedString(raw.featureExport, `module ${packageId} featureExport`),
            capabilityId: raw.capabilityId === undefined ? null : boundedString(raw.capabilityId, `module ${packageId} capabilityId`),
            handlers: raw.handlers === undefined ? null : parseHandlers(raw.handlers, packageId),
            externalEffect: raw.externalEffect === undefined ? false : (typeof raw.externalEffect === 'boolean' ? raw.externalEffect : fail('BUILD_INPUT_INVALID', `module ${packageId} externalEffect must be a boolean`)),
        });
    }
    return parsed;
}
function checkAuthorityReservation(module, kernelPrimary) {
    const isKernelPrimary = module.role === 'kernel-primary';
    for (const key of module.provides) {
        const squat = AUTHORITY_NAMESPACES.find((namespace) => key.startsWith(namespace));
        if (squat !== undefined && !isKernelPrimary) {
            fail('V10_AUTHORITY_FORGERY', `module ${module.packageId} (${module.role}) provides authority key '${key}'; the ${squat}* authority namespace is reserved to the one selected Kernel Primary`);
        }
    }
    if (isKernelPrimary && kernelPrimary !== undefined && kernelPrimary.packageId !== module.packageId) {
        fail('V10_ROLE_CARDINALITY', `two kernel-primary modules are selected (${kernelPrimary.packageId}, ${module.packageId}); a Domain App composes exactly one K Primary`);
    }
    if (module.handlers !== null && module.role !== 'capability') {
        fail('V10_AUTHORITY_FORGERY', `module ${module.packageId} (${module.role}) declares capability handlers; operation handler maps belong to capability packages only`);
    }
    if (module.externalEffect && module.role !== 'capability') {
        fail('V10_AUTHORITY_FORGERY', `module ${module.packageId} (${module.role}) declares externalEffect; the external Effect Operation gate is sealed to capability packages only`);
    }
}
/**
 * Compose one closed-world Node24 Domain App. Purely static and
 * deterministic: zero module evaluation, zero I/O, no clock/randomness.
 */
export function buildV10App(options) {
    if (typeof options !== 'object' || options === null) {
        fail('BUILD_INPUT_INVALID', 'buildV10App requires an options record');
    }
    const snap = snapshotOrThrow(options, 'build options');
    const appId = boundedString(snap.appId, 'appId');
    const audience = boundedString(snap.audience, 'audience');
    const buildId = boundedString(snap.buildId ?? 'v010-build', 'buildId');
    if (snap.targetProfile !== V10_TARGET_PROFILE) {
        fail('V10_TARGET_UNSUPPORTED', `target profile ${String(snap.targetProfile)} is not the selected Node24 ESM profile ${V10_TARGET_PROFILE}; a composition pins exactly one target runtime`);
    }
    const hardBudgetRaw = snap.hardBudget ?? { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 };
    if (!isObjectRecord(hardBudgetRaw)) {
        fail('BUILD_INPUT_INVALID', 'hardBudget must be a record');
    }
    const stepsRaw = hardBudgetRaw.maxStepsPerTurn;
    const workRaw = hardBudgetRaw.maxWorkUnitsPerTurn;
    for (const [label, value] of [['maxStepsPerTurn', stepsRaw], ['maxWorkUnitsPerTurn', workRaw]]) {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000_000) {
            fail('BUILD_INPUT_INVALID', `hardBudget.${label} must be a bounded positive integer`);
        }
    }
    const hardBudget = Object.freeze({
        maxStepsPerTurn: stepsRaw,
        maxWorkUnitsPerTurn: workRaw,
    });
    if (!Array.isArray(snap.modules) || !Array.isArray(snap.routes)) {
        fail('BUILD_INPUT_INVALID', 'buildV10App requires modules and routes arrays');
    }
    const modules = parseModules(snap.modules);
    if (modules.some((module) => module.role === 'kernel-primary' && module.moduleSource === null)) {
        fail('BUILD_GRAPH_INVALID', 'the selected Kernel Primary must carry sealed bytes');
    }
    // ---- Closed roles + advisory identity + authority reservation ----
    let kernelPrimary;
    let standardPrimary;
    const business = [];
    const capabilities = [];
    const extensions = [];
    const features = [];
    const byProvider = new Map();
    const byHook = new Map();
    const byFeature = new Map();
    const byIntent = new Map();
    const byCapabilityId = new Map();
    for (const module of modules) {
        checkAuthorityReservation(module, kernelPrimary);
        if (module.role === 'kernel-primary')
            kernelPrimary = module;
        else if (module.role === 'standard-primary') {
            if (standardPrimary !== undefined) {
                fail('V10_ROLE_CARDINALITY', `two standard-primary modules are selected (${standardPrimary.packageId}, ${module.packageId}); a Domain App composes exactly one S Primary`);
            }
            standardPrimary = module;
        }
        else if (module.role === 'business')
            business.push(module);
        else if (module.role === 'capability')
            capabilities.push(module);
        else if (module.role === 'kernel-extension')
            extensions.push(module);
        else if (module.role === 'standard-feature')
            features.push(module);
    }
    if (kernelPrimary === undefined) {
        fail('V10_ROLE_CARDINALITY', 'the composition selects no Kernel Primary; a Domain App composes exactly one K Primary');
    }
    if (standardPrimary === undefined) {
        fail('V10_ROLE_CARDINALITY', 'the composition selects no Standard Primary; a Domain App composes exactly one S Primary');
    }
    if (business.length === 0) {
        fail('V10_ROLE_CARDINALITY', 'the composition selects no Business package; a Domain App composes at least one B');
    }
    // Per-role selected ABI rows (A01-PC08 wrong version refuses at BUILD).
    for (const module of modules) {
        const selected = V10_SELECTED_ROLE_ABI[module.role];
        if (module.abiVersion !== selected) {
            fail('V10_ABI_UNSUPPORTED', `module ${module.packageId} (${module.role}) declares ABI ${module.abiVersion}; the selected Node24 profile pins ${selected} for this role`);
        }
    }
    // Advisory identity: K extension provider/hook pairs stay injective and
    // never squat a kernel/standard namespace; S feature keys likewise.
    for (const module of [...extensions, ...features]) {
        if (module.role === 'kernel-extension' && module.providerId === null) {
            fail('BUILD_GRAPH_INVALID', `kernel-extension ${module.packageId} declares no provider identity`);
        }
        if (module.role === 'kernel-extension' && (module.hookExport === null || module.provides.length !== 1)) {
            fail('BUILD_GRAPH_INVALID', `kernel-extension ${module.packageId} must declare exactly one advisory hook (hookExport + one provides key)`);
        }
        if (module.role === 'standard-feature' && (module.featureExport === null || module.provides.length !== 1)) {
            fail('BUILD_GRAPH_INVALID', `standard-feature ${module.packageId} must declare exactly one feature key (featureExport + one provides key)`);
        }
        const key = module.provides[0];
        if (!FEATURE_KEY_RE.test(key)) {
            fail('BUILD_GRAPH_INVALID', `module ${module.packageId} provides malformed feature/hook key '${key}'`);
        }
        if (module.role === 'standard-feature' && !key.startsWith('standard:')) {
            fail('BUILD_GRAPH_INVALID', `standard-feature ${module.packageId} provides '${key}'; S feature keys live in the standard: namespace`);
        }
        if (module.role === 'kernel-extension' && (key.startsWith('standard:') || AUTHORITY_NAMESPACES.some((ns) => key.startsWith(ns)))) {
            fail('V10_AUTHORITY_FORGERY', `kernel-extension ${module.packageId} provides advisory hook '${key}'; advisory hooks may not squat authority or Standard namespaces`);
        }
        // [v0.10 #1264 PC-05] The Kernel's declared CLOSED advisory hook set:
        // an extension whose single hook key is not in it is rejected HERE, at
        // BUILD, before any affected module executes — never discovered at
        // runtime. The Kernel re-refuses unknown keys at its own trusted wiring
        // boundary (defense in depth at the load seam, not a re-attestation).
        if (module.role === 'kernel-extension' && !V10_KERNEL_ADVISORY_HOOKS.includes(key)) {
            fail('V10_ADVISORY_HOOK_UNKNOWN', `kernel-extension ${module.packageId} provides advisory hook '${key}'; the selected Kernel declares the closed advisory hook set [${V10_KERNEL_ADVISORY_HOOKS.join(', ')}]`);
        }
    }
    // Collisions and provider authority are properties of the *selected*
    // closure. Absent optional advisories (no bytes/digest) are recorded in
    // skippedOptional below, and must not reserve a real selected provider key.
    const selectedExtensions = extensions.filter((module) => !(module.optional && module.moduleSource === null));
    const selectedFeatures = features.filter((module) => !(module.optional && module.moduleSource === null));
    for (const module of selectedExtensions) {
        const providerId = module.providerId;
        const hook = module.provides[0];
        const providerOwner = byProvider.get(providerId);
        if (providerOwner !== undefined) {
            fail('V10_PROVIDER_COLLISION', `advisory provider ${providerId} is claimed by both ${providerOwner.packageId} and ${module.packageId}`);
        }
        const hookOwner = byHook.get(hook);
        if (hookOwner !== undefined) {
            fail('V10_PROVIDER_COLLISION', `advisory hook ${hook} is claimed by both ${hookOwner.packageId} and ${module.packageId}`);
        }
        byProvider.set(providerId, module);
        byHook.set(hook, module);
    }
    for (const module of selectedFeatures) {
        const feature = module.provides[0];
        const owner = byFeature.get(feature);
        if (owner !== undefined) {
            fail('V10_FEATURE_COLLISION', `standard feature ${feature} is provided by both ${owner.packageId} and ${module.packageId}`);
        }
        byFeature.set(feature, module);
    }
    for (const module of business) {
        for (const key of module.provides) {
            if (INTENT_KEY_RE.test(key)) {
                const owner = byIntent.get(key);
                if (owner !== undefined) {
                    fail('V10_INTENT_CONFLICT', `intent ${key} is provided by both ${owner.packageId} and ${module.packageId}; business intents stay injective in one App`);
                }
                byIntent.set(key, module);
            }
        }
    }
    // Capability bindings: injective capabilityId, sealed operation→handler map.
    for (const module of capabilities) {
        if (module.capabilityId === null) {
            fail('BUILD_GRAPH_INVALID', `capability module ${module.packageId} declares no capabilityId`);
        }
        if (module.handlers === null) {
            fail('BUILD_GRAPH_INVALID', `capability module ${module.packageId} carries no sealed operation→handler map`);
        }
        const existing = byCapabilityId.get(module.capabilityId);
        if (existing !== undefined) {
            fail('BUILD_GRAPH_INVALID', `capability identity ${module.capabilityId} is bound by both ${existing.module.packageId} and ${module.packageId}`);
        }
        byCapabilityId.set(module.capabilityId, { module, handlers: [...module.handlers] });
    }
    // ---- Selection: optional advisory modules without bytes fall back ----
    const skippedOptional = [];
    const selected = [];
    for (const module of modules) {
        const advisory = module.role === 'kernel-extension' || module.role === 'standard-feature';
        if (advisory && module.optional && module.moduleSource === null) {
            skippedOptional.push(module.packageId);
            continue;
        }
        selected.push(module);
    }
    // ---- One private, deterministic selected-closure owner ----
    const { selectedIds, byId, loadOrder } = resolveV10SelectedClosure(selected);
    // ---- Byte pinning + once-only sealed import closure (zero evaluation) ----
    const sealed = [];
    for (const packageId of loadOrder) {
        const module = byId.get(packageId);
        const source = module.moduleSource;
        const actual = sha256Hex(source);
        if (actual !== module.moduleSha256) {
            fail('V10_DIGEST_MISMATCH', `module ${module.packageId} bytes hash to ${actual} but the composition seals ${String(module.moduleSha256)}; byte substitution before sealing is refused`);
        }
        assertSealedImportClosure(`${module.packageId} (module bytes ${actual})`, source, module.externalImports, selectedIds);
        sealed.push(Object.freeze({
            packageId: module.packageId,
            role: module.role,
            abiVersion: module.abiVersion,
            moduleSource: source,
            moduleSha256: actual,
            endpoint: module.endpoint,
            dependencies: module.dependencies,
            externalImports: module.externalImports,
            provides: module.provides,
            requires: module.requires,
            optional: module.optional,
            providerId: module.providerId,
            hookExport: module.hookExport,
            featureExport: module.featureExport,
            capabilityId: module.capabilityId,
            handlers: module.handlers === null ? null : Object.freeze(module.handlers.map((handler) => Object.freeze({ ...handler }))),
            externalEffect: module.externalEffect,
        }));
    }
    // ---- Route admission against the sealed graph's OWN authority ----
    const routesRaw = snap.routes;
    if (routesRaw.length === 0 || routesRaw.length > MAX_ITEMS) {
        fail('BUILD_GRAPH_INVALID', `routes must be a non-empty bounded array of route rows`);
    }
    const routes = [];
    const routeKeys = new Set();
    for (const raw of routesRaw) {
        if (!isObjectRecord(raw)) {
            fail('BUILD_GRAPH_INVALID', 'each route row must be a record');
        }
        strictFields(raw, ROUTE_FIELDS, 'route row');
        const intentId = boundedString(raw.intentId, 'route intentId');
        const operationId = boundedString(raw.operationId, 'route operationId');
        const capabilityId = boundedString(raw.capabilityId, 'route capabilityId');
        const handlerId = boundedString(raw.handlerId, 'route handlerId');
        const intentKey = `intent:${intentId}`;
        if (!byIntent.has(intentKey)) {
            fail('V10_ROUTE_INVALID', `route intent ${intentId} is not sealed as a business intent of this composition; caller input cannot add intents`);
        }
        const capability = byCapabilityId.get(capabilityId);
        if (capability === undefined) {
            fail('V10_ROUTE_INVALID', `route intent ${intentId} names capability ${capabilityId} which is not sealed in this composition`);
        }
        const sealedOperation = capability.handlers.find((handler) => handler.operationId === operationId);
        if (sealedOperation === undefined) {
            fail('V10_ROUTE_INVALID', `route intent ${intentId} names operation ${operationId} which capability ${capabilityId} does not seal`);
        }
        if (sealedOperation.handler !== handlerId) {
            fail('V10_ROUTE_INVALID', `route intent ${intentId} claims handler ${handlerId} but the sealed binding pins ${sealedOperation.handler} for ${operationId}`);
        }
        const key = `${intentId}\u0000${operationId}`;
        if (routeKeys.has(key)) {
            fail('V10_ROUTE_INVALID', `duplicate route for intent ${intentId} → operation ${operationId}`);
        }
        routeKeys.add(key);
        routes.push({ intentId, operationId, capabilityId, handlerId });
    }
    // ---- Canonical subject digest over the roster + bindings + policy ----
    const roster = sealed.map((module) => ({
        packageId: module.packageId,
        role: module.role,
        abiVersion: module.abiVersion,
        moduleSha256: module.moduleSha256,
        endpoint: module.endpoint,
        dependencies: [...module.dependencies],
        externalImports: { node: [...module.externalImports.node], npm: [...module.externalImports.npm], native: [...module.externalImports.native] },
        provides: [...module.provides],
        requires: [...module.requires],
        optional: module.optional,
        providerId: module.providerId,
        hookExport: module.hookExport,
        featureExport: module.featureExport,
        capabilityId: module.capabilityId,
        handlers: module.handlers === null ? null : module.handlers.map((handler) => ({ ...handler })),
        externalEffect: module.externalEffect,
    }));
    const subjectDigest = sha256Canonical({
        formatVersion: V10_BUILD_FORMAT,
        appId,
        audience,
        buildId,
        targetProfile: V10_TARGET_PROFILE,
        runtimeAbi: V10_RUNTIME_ABI,
        hostAbi: V10_HOST_ABI,
        bundlerRevision: V10_BUNDLER_REVISION,
        importPolicyRevision: V10_IMPORT_POLICY_REVISION,
        hardBudget,
        roster,
        loadOrder: [...loadOrder],
        skippedOptional: [...skippedOptional],
        routes: routes.map((route) => ({ ...route })),
    });
    return Object.freeze({
        formatVersion: V10_BUILD_FORMAT,
        subjectDigest,
        appId,
        audience,
        buildId,
        targetProfile: V10_TARGET_PROFILE,
        runtimeAbi: V10_RUNTIME_ABI,
        hostAbi: V10_HOST_ABI,
        bundlerRevision: V10_BUNDLER_REVISION,
        importPolicyRevision: V10_IMPORT_POLICY_REVISION,
        hardBudget,
        modules: Object.freeze(sealed),
        loadOrder: Object.freeze([...loadOrder]),
        skippedOptional: Object.freeze([...skippedOptional]),
        routes: Object.freeze(routes.map((route) => Object.freeze({ ...route }))),
    });
}
