/**
 * DomainHarness v0.9 N06 (#1032) — producer-neutral zero-import BUILD.
 * =====================================================================
 *
 * `buildV09QualifiedRoot` consumes the output of the PUBLISHED v0.8 BUILD
 * pipeline (`buildQualifiedPackage` — which already owns module bytes,
 * closed-role shape, handler-export AST verification, approval and the v0.8
 * digest authority) plus the v0.9 intent→operation route table, and emits
 * the v0.9 sealed qualified root (`dh.v9.sealed-root/1`):
 *
 *  - every selected K/S/B/C binding is sealed as ONE self-contained ESM
 *    module (the v0.8 single-file package bytes); the zero-external-edge
 *    property is enforced here by the pinned-parser full-AST gate
 *    (static import, export-from, export * from, import(), import.meta,
 *    require, eval/code-string constructors all refuse — empty allowlist,
 *    D01);
 *  - the exact ordered package byte SHA-256s, the empty `imports: []`
 *    policy, the ordered binding records (roles, intents, capability
 *    handler maps, route rows) and the selected runtime/Host ABI profile
 *    are sealed into the `dh.v9.qualified-root.subject/1` subject digest
 *    (D04);
 *  - the route table is validated against the sealed root's OWN intent
 *    rows and capability handler maps (no caller-supplied intent
 *    authority — N01 R0 P1 semantics); duplicated package IDs, duplicated
 *    routes and ambiguous/unresolvable routes refuse;
 *  - the emitted root carries NO approval: authority is attached only by
 *    the external governance issuer at the protected install
 *    (`host-v9` `install(sealedRoot, approval, audience)`, D02). BUILD
 *    never mints or verifies the v0.9 approval itself; the consumed v0.8
 *    root's approval is validated for shape/provenance only.
 *
 * This module does not generate business domain logic (domain-forge owns
 * that) and is not a second compiler: it is the qualified closure/seal/ABI
 * selection tool boundary.
 */
import { canonicalSnapshot } from '@kaicreator/domain-harness/v8';
import { createHash } from 'node:crypto';
import { V09BuildError } from './errors.js';
import { computeV09SealedRootSubjectDigest, V09_BUNDLER_REVISION, V09_HOST_ABI, V09_IMPORT_POLICY_REVISION, V09_RUNTIME_ABI, V09_SEALED_ROOT_FORMAT, } from './digest.js';
import { assertZeroImportBuildModule } from './import-closure.js';
const HEX64 = /^[0-9a-f]{64}$/;
const PACKAGE_KINDS = new Set(['kernel', 'standard-sdk', 'business', 'capability']);
const V8_ROOT_FIELDS = new Set(['formatVersion', 'rootPackageId', 'build', 'approval', 'packages', 'bindings']);
const V8_BUILD_FIELDS = new Set(['producerId', 'builtAt', 'baseCommit', 'closureDigest']);
const V8_PACKAGE_FIELDS = new Set(['packageId', 'kind', 'abiVersion', 'moduleSource', 'moduleSha256', 'endpoints']);
const V8_ENDPOINT_FIELDS = new Set(['endpointId', 'kind']);
const V8_ROLE_BINDING_FIELDS = new Set(['role', 'packageId', 'endpointId']);
const V8_INTENT_BINDING_FIELDS = new Set(['role', 'intentType', 'packageId', 'endpointId']);
const V8_CAPABILITY_BINDING_FIELDS = new Set(['role', 'capabilityId', 'packageId', 'endpointId', 'handlers']);
const V8_HANDLER_FIELDS = new Set(['operationId', 'handler']);
const V8_APPROVAL_FIELDS = new Set(['proofType', 'subjectDigest', 'issuerId', 'issuedAt', 'proofDigest', 'issuerAttestation']);
const ROUTE_FIELDS = new Set(['intentId', 'operationId', 'capabilityId', 'handlerId']);
const CLOSED_ROLES = new Set(['kernel', 'standard-sdk', 'business']);
const MAX_ITEMS = 256;
const MAX_STRING = 512;
function fail(code, message) {
    throw new V09BuildError(code, message);
}
function boundedString(value, label) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STRING) {
        fail('BUILD_INPUT_INVALID', `${label} must be a non-empty string of at most ${String(MAX_STRING)} characters`);
    }
    return value;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function strictFields(value, allowed, label) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            fail('BUILD_GRAPH_INVALID', `${label} carries unknown field '${key}'; the v0.9 BUILD boundary refuses unknown fields and aliases instead of ignoring them`);
        }
    }
}
function hex64(value, label) {
    if (typeof value !== 'string' || !HEX64.test(value)) {
        fail('BUILD_GRAPH_INVALID', `${label} must be a lowercase hex sha-256 digest`);
    }
    return value;
}
/** Canonical-snapshot the presentation first (hostile accessors refused unread). */
function snapshotOrThrow(value, label) {
    let snapshot;
    try {
        snapshot = canonicalSnapshot(value);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        fail('BUILD_INPUT_INVALID', `${label} is not strict canonical plain data: ${detail}`);
    }
    if (!isRecord(snapshot)) {
        fail('BUILD_INPUT_INVALID', `${label} must be a record`);
    }
    return snapshot;
}
/** Validate the consumed v0.8 sealed-root shape and closed selected roles. */
function parseV8SealedRoot(input) {
    const snapshot = snapshotOrThrow(input, 'sealed v0.8 root');
    strictFields(snapshot, V8_ROOT_FIELDS, 'sealed v0.8 root');
    if (snapshot.formatVersion !== 'dhpkg/v8-qualified-root/1') {
        fail('BUILD_GRAPH_INVALID', 'buildV09QualifiedRoot consumes exactly a dhpkg/v8-qualified-root/1 sealed root from the published v0.8 BUILD');
    }
    const rootPackageId = boundedString(snapshot.rootPackageId, 'sealed root rootPackageId');
    const build = snapshot.build;
    if (!isRecord(build)) {
        fail('BUILD_GRAPH_INVALID', 'sealed v0.8 root build provenance must be a record');
    }
    strictFields(build, V8_BUILD_FIELDS, 'sealed v0.8 root build');
    const v8ClosureDigest = hex64(build.closureDigest, 'sealed v0.8 root build.closureDigest');
    const approval = snapshot.approval;
    if (!isRecord(approval)) {
        fail('BUILD_GRAPH_INVALID', 'sealed v0.8 root approval must be a record');
    }
    strictFields(approval, V8_APPROVAL_FIELDS, 'sealed v0.8 root approval');
    if (approval.proofType !== 'v08-external-approval/1') {
        fail('BUILD_GRAPH_INVALID', `sealed v0.8 root carries approval proof type ${String(approval.proofType)}; only the published v0.8 external approval shape is accepted as provenance`);
    }
    hex64(approval.proofDigest, 'sealed v0.8 root approval.proofDigest');
    const packagesValue = snapshot.packages;
    const bindingsValue = snapshot.bindings;
    if (!Array.isArray(packagesValue) || packagesValue.length === 0 || packagesValue.length > MAX_ITEMS) {
        fail('BUILD_GRAPH_INVALID', 'sealed v0.8 root must carry a non-empty bounded packages array');
    }
    if (!Array.isArray(bindingsValue) || bindingsValue.length === 0 || bindingsValue.length > MAX_ITEMS) {
        fail('BUILD_GRAPH_INVALID', 'sealed v0.8 root must carry a non-empty bounded bindings array');
    }
    const packages = [];
    const packageIds = new Set();
    for (const raw of packagesValue) {
        if (!isRecord(raw)) {
            fail('BUILD_GRAPH_INVALID', 'each sealed v0.8 package must be a record');
        }
        strictFields(raw, V8_PACKAGE_FIELDS, 'sealed v0.8 package');
        const packageId = boundedString(raw.packageId, 'sealed v0.8 package packageId');
        if (packageIds.has(packageId)) {
            fail('BUILD_GRAPH_INVALID', `duplicate sealed v0.8 package ${packageId}`);
        }
        packageIds.add(packageId);
        const kind = boundedString(raw.kind, `package ${packageId} kind`);
        if (!PACKAGE_KINDS.has(kind)) {
            fail('BUILD_GRAPH_INVALID', `package ${packageId} has unknown kind ${kind}`);
        }
        const abiVersion = boundedString(raw.abiVersion, `package ${packageId} abiVersion`);
        const moduleSha256 = hex64(raw.moduleSha256, `package ${packageId} moduleSha256`);
        if (typeof raw.moduleSource !== 'string' || raw.moduleSource.length === 0) {
            fail('BUILD_GRAPH_INVALID', `package ${packageId} must carry non-empty sealed module source bytes`);
        }
        const endpointsValue = raw.endpoints;
        if (!Array.isArray(endpointsValue) || endpointsValue.length === 0 || endpointsValue.length > MAX_ITEMS) {
            fail('BUILD_GRAPH_INVALID', `package ${packageId} must declare a non-empty bounded endpoints array`);
        }
        const endpoints = [];
        const endpointIds = new Set();
        for (const endpointRaw of endpointsValue) {
            if (!isRecord(endpointRaw)) {
                fail('BUILD_GRAPH_INVALID', `package ${packageId} endpoint must be a record`);
            }
            strictFields(endpointRaw, V8_ENDPOINT_FIELDS, `package ${packageId} endpoint`);
            const endpointId = boundedString(endpointRaw.endpointId, `package ${packageId} endpoint endpointId`);
            const endpointKind = boundedString(endpointRaw.kind, `package ${packageId} endpoint kind`);
            if (endpointIds.has(endpointId)) {
                fail('BUILD_GRAPH_INVALID', `package ${packageId} declares endpoint ${endpointId} twice`);
            }
            endpointIds.add(endpointId);
            endpoints.push({ endpointId, kind: endpointKind });
        }
        packages.push({ packageId, kind, abiVersion, moduleSource: raw.moduleSource, moduleSha256, endpoints });
    }
    const packagesById = new Map(packages.map((pkg) => [pkg.packageId, pkg]));
    const roleBindings = [];
    const intentBindings = [];
    const capabilityBindings = [];
    const roleCounts = new Map([['kernel', 0], ['standard-sdk', 0], ['business', 0]]);
    const capabilityIds = new Set();
    const capabilityBoundPackages = new Set();
    for (const raw of bindingsValue) {
        if (!isRecord(raw)) {
            fail('BUILD_GRAPH_INVALID', 'each sealed v0.8 binding must be a record');
        }
        const role = raw.role;
        if (typeof role !== 'string') {
            fail('BUILD_GRAPH_INVALID', 'sealed v0.8 binding role must be a string');
        }
        if (CLOSED_ROLES.has(role)) {
            strictFields(raw, V8_ROLE_BINDING_FIELDS, `${role} binding`);
            const packageId = boundedString(raw.packageId, `${role} binding packageId`);
            const endpointId = boundedString(raw.endpointId, `${role} binding endpointId`);
            const target = packagesById.get(packageId);
            if (target === undefined) {
                fail('BUILD_GRAPH_INVALID', `${role} binding references unknown package ${packageId}`);
            }
            if (target.kind !== role) {
                fail('BUILD_GRAPH_INVALID', `role ${role} binds package ${packageId} of kind ${target.kind}; closed roles cannot be impersonated`);
            }
            if (!target.endpoints.some((endpoint) => endpoint.endpointId === endpointId)) {
                fail('BUILD_GRAPH_INVALID', `role ${role} binds endpoint ${endpointId} which package ${packageId} does not declare`);
            }
            roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
            roleBindings.push({ role: role, packageId, endpointId });
            continue;
        }
        if (role === 'intent') {
            strictFields(raw, V8_INTENT_BINDING_FIELDS, 'intent binding');
            const intentType = boundedString(raw.intentType, 'intent binding intentType');
            const packageId = boundedString(raw.packageId, 'intent binding packageId');
            const endpointId = boundedString(raw.endpointId, 'intent binding endpointId');
            const target = packagesById.get(packageId);
            if (target === undefined || target.kind !== 'business') {
                fail('BUILD_GRAPH_INVALID', `sealed intent ${intentType} does not bind a business package`);
            }
            if (!target.endpoints.some((endpoint) => endpoint.endpointId === endpointId)) {
                fail('BUILD_GRAPH_INVALID', `sealed intent ${intentType} binds endpoint ${endpointId} which its business package does not declare`);
            }
            intentBindings.push({ intentType, packageId, endpointId });
            continue;
        }
        if (role === 'capability') {
            strictFields(raw, V8_CAPABILITY_BINDING_FIELDS, 'capability binding');
            const capabilityId = boundedString(raw.capabilityId, 'capability binding capabilityId');
            const packageId = boundedString(raw.packageId, 'capability binding packageId');
            const endpointId = boundedString(raw.endpointId, 'capability binding endpointId');
            const target = packagesById.get(packageId);
            if (target === undefined) {
                fail('BUILD_GRAPH_INVALID', `capability ${capabilityId} references unknown package ${packageId}`);
            }
            if (target.kind !== 'capability') {
                fail('BUILD_GRAPH_INVALID', `capability ${capabilityId} binds package ${packageId} of kind ${target.kind}; a capability binding must target a capability package`);
            }
            if (!target.endpoints.some((endpoint) => endpoint.endpointId === endpointId)) {
                fail('BUILD_GRAPH_INVALID', `capability ${capabilityId} binds endpoint ${endpointId} which its package does not declare`);
            }
            if (capabilityIds.has(capabilityId)) {
                fail('BUILD_GRAPH_INVALID', `capability identity ${capabilityId} is bound more than once; capability identities must stay injective`);
            }
            capabilityIds.add(capabilityId);
            capabilityBoundPackages.add(packageId);
            const handlersValue = raw.handlers;
            if (!Array.isArray(handlersValue) || handlersValue.length === 0 || handlersValue.length > MAX_ITEMS) {
                fail('BUILD_GRAPH_INVALID', `capability ${capabilityId} must carry a non-empty bounded operation→handler map`);
            }
            const operations = new Set();
            const handlers = [];
            for (const handlerRaw of handlersValue) {
                if (!isRecord(handlerRaw)) {
                    fail('BUILD_GRAPH_INVALID', `capability ${capabilityId} handler entry must be a record`);
                }
                strictFields(handlerRaw, V8_HANDLER_FIELDS, `capability ${capabilityId} handler`);
                const operationId = boundedString(handlerRaw.operationId, `capability ${capabilityId} handler operationId`);
                const handler = boundedString(handlerRaw.handler, `capability ${capabilityId} handler handler`);
                if (operations.has(operationId)) {
                    fail('BUILD_GRAPH_INVALID', `capability ${capabilityId} binds operation ${operationId} more than once`);
                }
                operations.add(operationId);
                handlers.push({ operationId, handler });
            }
            capabilityBindings.push({ capabilityId, packageId, endpointId, handlers });
            continue;
        }
        fail('BUILD_GRAPH_INVALID', `unknown sealed v0.8 binding role ${role}`);
    }
    for (const pkg of packages) {
        if (pkg.kind === 'capability' && !capabilityBoundPackages.has(pkg.packageId)) {
            fail('BUILD_GRAPH_INVALID', `capability package ${pkg.packageId} is not covered by exactly one capability binding; it can never become executable`);
        }
    }
    if ((roleCounts.get('kernel') ?? 0) !== 1) {
        fail('BUILD_GRAPH_INVALID', 'the sealed v0.8 closure must select exactly one Kernel role binding');
    }
    if ((roleCounts.get('standard-sdk') ?? 0) !== 1) {
        fail('BUILD_GRAPH_INVALID', 'the sealed v0.8 closure must select exactly one Standard role binding');
    }
    if ((roleCounts.get('business') ?? 0) < 1) {
        fail('BUILD_GRAPH_INVALID', 'the sealed v0.8 closure must select at least one Business role binding');
    }
    return { rootPackageId, v8ClosureDigest, packages, roleBindings, intentBindings, capabilityBindings };
}
/**
 * Produce the v0.9 sealed qualified root: each selected K/S/B/C binding
 * sealed as one self-contained ESM module behind the zero-import AST gate,
 * with the D04 subject digest over the exact ordered bytes and binding
 * records. Purely static — no module is evaluated here.
 */
export function buildV09QualifiedRoot(options) {
    if (typeof options !== 'object' || options === null) {
        fail('BUILD_INPUT_INVALID', 'buildV09QualifiedRoot requires an options record');
    }
    const buildId = boundedString(options.buildId, 'buildId');
    const v8 = parseV8SealedRoot(options.sealedRoot);
    // ---- Route table validation against the sealed root's OWN authority ----
    const routesValue = options.routes;
    if (!Array.isArray(routesValue) || routesValue.length === 0 || routesValue.length > MAX_ITEMS) {
        fail('BUILD_GRAPH_INVALID', 'routes must be a non-empty bounded array of route rows');
    }
    const sealedIntentOwners = new Map();
    for (const intent of v8.intentBindings) {
        const owner = sealedIntentOwners.get(intent.intentType);
        if (owner !== undefined) {
            fail('BUILD_GRAPH_INVALID', `sealed intent ${intent.intentType} is bound to more than one business package in this closure`);
        }
        sealedIntentOwners.set(intent.intentType, intent.packageId);
    }
    const routeRecords = [];
    const routeKeys = new Set();
    for (const raw of routesValue) {
        if (!isRecord(raw)) {
            fail('BUILD_GRAPH_INVALID', 'each route row must be a record');
        }
        strictFields(raw, ROUTE_FIELDS, 'route row');
        const intentId = boundedString(raw.intentId, 'route intentId');
        const operationId = boundedString(raw.operationId, 'route operationId');
        const capabilityId = boundedString(raw.capabilityId, 'route capabilityId');
        const handlerId = boundedString(raw.handlerId, 'route handlerId');
        if (!sealedIntentOwners.has(intentId)) {
            fail('BUILD_GRAPH_INVALID', `route intent ${intentId} is not sealed as a business intent binding of this closure; caller input cannot add intents`);
        }
        const capability = v8.capabilityBindings.find((binding) => binding.capabilityId === capabilityId);
        if (capability === undefined) {
            fail('BUILD_GRAPH_INVALID', `route intent ${intentId} names capability ${capabilityId} which is not sealed in this closure`);
        }
        const sealedOperation = capability.handlers.find((handler) => handler.operationId === operationId);
        if (sealedOperation === undefined) {
            fail('BUILD_GRAPH_INVALID', `route intent ${intentId} names operation ${operationId} which capability ${capabilityId} does not seal`);
        }
        if (sealedOperation.handler !== handlerId) {
            fail('BUILD_GRAPH_INVALID', `route intent ${intentId} claims handler ${handlerId} but the sealed binding pins ${sealedOperation.handler} for ${operationId}`);
        }
        const key = `${intentId}\u0000${operationId}`;
        if (routeKeys.has(key)) {
            fail('BUILD_GRAPH_INVALID', `duplicate route for intent ${intentId} → operation ${operationId}`);
        }
        routeKeys.add(key);
        routeRecords.push({ intentId, operationId, capabilityId, handlerId });
    }
    // ---- v0.9 bindings: the sealed role/intent/capability records + route rows ----
    const bindings = [
        ...v8.roleBindings,
        ...v8.intentBindings.map((intent) => Object.freeze({ role: 'intent', ...intent })),
        ...v8.capabilityBindings.map((capability) => Object.freeze({ role: 'capability', ...capability, handlers: Object.freeze([...capability.handlers]) })),
        ...routeRecords.map((route) => Object.freeze({ role: 'route', ...route })),
    ];
    // ---- Zero-import gate + byte identity on the exact sealed bytes ----
    const v09Packages = [];
    for (const pkg of v8.packages) {
        const actual = createHash('sha256').update(pkg.moduleSource, 'utf8').digest('hex');
        if (actual !== pkg.moduleSha256) {
            fail('BUILD_GRAPH_INVALID', `sealed module ${pkg.packageId} no longer hashes to its v0.8 pin ${pkg.moduleSha256} (actual ${actual}); byte substitution before sealing is refused`);
        }
        // The D01 empty-allowlist gate: the single self-contained ESM must have
        // zero external module edges of ANY kind before it can be sealed.
        assertZeroImportBuildModule(`${pkg.packageId} (module bytes ${pkg.moduleSha256})`, pkg.moduleSource);
        v09Packages.push(Object.freeze({
            packageId: pkg.packageId,
            kind: pkg.kind,
            abiVersion: pkg.abiVersion,
            moduleSource: pkg.moduleSource,
            moduleSha256: pkg.moduleSha256,
            imports: [],
        }));
    }
    const subjectDigest = computeV09SealedRootSubjectDigest({
        rootPackageId: v8.rootPackageId,
        buildId,
        bundlerRevision: V09_BUNDLER_REVISION,
        importPolicyRevision: V09_IMPORT_POLICY_REVISION,
        runtimeAbi: V09_RUNTIME_ABI,
        hostAbi: V09_HOST_ABI,
        packages: v09Packages,
        bindings,
    });
    return Object.freeze({
        formatVersion: V09_SEALED_ROOT_FORMAT,
        subjectDigest,
        rootPackageId: v8.rootPackageId,
        buildId,
        bundlerRevision: V09_BUNDLER_REVISION,
        importPolicyRevision: V09_IMPORT_POLICY_REVISION,
        runtimeAbi: V09_RUNTIME_ABI,
        hostAbi: V09_HOST_ABI,
        packages: Object.freeze(v09Packages),
        bindings: Object.freeze(bindings),
    });
}
