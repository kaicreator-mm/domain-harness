/**
 * v0.8 BUILD qualification — phase 1 (T-A, #1000).
 * ================================================
 *
 * `qualifyPackageClosure()` performs the bounded build-time static
 * qualification the frozen L2 mandates for the qualified package ABI:
 * Identity (exact module bytes → SHA-256, self-declared module identity
 * exports), Compatibility (ABI registry/kind agreement, required exports
 * AST-verified), Binding (K/S/multiple-B role shape, intent bindings,
 * provider uniqueness) and exact closure (TypeScript-AST static import
 * analysis; no regex-only import filter).
 *
 * The result is an UNSIGNED qualification: it carries a subject digest but
 * no authority. Authority is attached separately and externally
 * (approval.ts, phase 2) — BUILD can never self-mint it.
 *
 * Qualified-Graph identity uses the #956 R3 repaired escaping rule: each
 * tuple member escapes '/' as '%2F' before joining, so slash-bearing IDs
 * stay injective ('a/b' + 'c' never collides with 'a' + 'b/c') while
 * slash-free IDs keep their historical spelling.
 */
import { QualifiedPackageError, V8_QUALIFIED_ABI, canonicalSnapshot, computeSubjectDigest, sha256Hex, } from '@kaicreator/domain-harness/v8';
import { analyzeModuleClosure, assertDeclaredExports, ClosureError } from './closure.js';
export class QualificationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'QualificationError';
        this.code = code;
    }
}
function fail(code, detail) {
    throw new QualificationError(code, detail);
}
/** Escape each tuple member so the joined qualified key stays injective. */
export function qualifiedKey(packageId, componentId) {
    return `${packageId.replaceAll('/', '%2F')}/${componentId.replaceAll('/', '%2F')}`;
}
const MODULE_PATH_PATTERN = /^modules\/[a-zA-Z0-9._/-]+\.mjs$/;
/**
 * Phase 1 — qualify one exact closure. Every rejection happens BEFORE any
 * module is executed: qualification is purely static.
 */
export function qualifyPackageClosure(submission) {
    // Descriptor-safe read first: hostile getters/proxies on the submission
    // are refused typed without ever being invoked.
    let snapshot;
    try {
        snapshot = canonicalSnapshot(submission);
    }
    catch (error) {
        if (error instanceof QualifiedPackageError) {
            throw new QualificationError('QUALIFY_RECORD_UNSAFE', error.message);
        }
        throw error;
    }
    if (typeof snapshot !== 'object' || snapshot === null) {
        fail('QUALIFY_SUBMISSION_INVALID', 'qualification submission must be a plain object');
    }
    if (typeof snapshot.rootPackageId !== 'string' || snapshot.rootPackageId.length === 0) {
        fail('QUALIFY_SUBMISSION_INVALID', 'rootPackageId must be a non-empty string');
    }
    // Runtime shape checks run on separate unknown aliases: Array.isArray
    // would narrow the typed readonly arrays to any[] and defeat type safety.
    const packagesValue = snapshot.packages;
    const bindingsValue = snapshot.bindings;
    if (!Array.isArray(packagesValue) || packagesValue.length === 0 || !Array.isArray(bindingsValue)) {
        fail('QUALIFY_SUBMISSION_INVALID', 'submission must carry a non-empty packages array and a bindings array');
    }
    const seenPackageIds = new Set();
    const qualifiedEndpointKeys = new Set();
    for (const pkg of snapshot.packages) {
        if (typeof pkg.packageId !== 'string' || pkg.packageId.length === 0) {
            fail('QUALIFY_PACKAGE_IDENTITY', 'each package needs a non-empty packageId');
        }
        if (seenPackageIds.has(pkg.packageId)) {
            fail('QUALIFY_DUPLICATE_PACKAGE', `package ${pkg.packageId} appears twice in the closure`);
        }
        seenPackageIds.add(pkg.packageId);
        const abi = V8_QUALIFIED_ABI[pkg.abiVersion];
        if (abi === undefined) {
            fail('QUALIFY_ABI_UNKNOWN', `package ${pkg.packageId} declares unknown abiVersion ${String(pkg.abiVersion)}`);
        }
        if (abi.kind !== pkg.kind) {
            fail('QUALIFY_KIND_ABI_MISMATCH', `package ${pkg.packageId} kind ${String(pkg.kind)} does not match abi ${String(pkg.abiVersion)}`);
        }
        if (typeof pkg.modulePath !== 'string' || !MODULE_PATH_PATTERN.test(pkg.modulePath) || pkg.modulePath.includes('..')) {
            fail('QUALIFY_MODULE_PATH', `package ${pkg.packageId} modulePath must be a sealed 'modules/*.mjs' path`);
        }
        if (typeof pkg.moduleSource !== 'string' || pkg.moduleSource.length === 0) {
            fail('QUALIFY_MODULE_BYTES', `package ${pkg.packageId} must carry non-empty sealed module bytes`);
        }
        const endpointsValue = pkg.endpoints;
        if (!Array.isArray(endpointsValue) || endpointsValue.length === 0) {
            fail('QUALIFY_ENDPOINT_INVALID', `package ${pkg.packageId} must declare a non-empty endpoints array`);
        }
        const endpointKinds = endpointsValue.map((endpoint) => endpoint.kind);
        if (new Set(endpointKinds).size !== endpointKinds.length) {
            fail('QUALIFY_ENDPOINT_INVALID', `package ${pkg.packageId} must declare unique endpoint kinds`);
        }
        // Static AST checks: required exports really declared, closure really
        // static and self-contained. (Byte identity is computed below from the
        // same presented bytes; the sealed root and the trusted installer
        // re-verify it independently.)
        try {
            assertDeclaredExports(pkg.modulePath, pkg.moduleSource, abi.requiredExports);
            analyzeModuleClosure({ entryPath: pkg.modulePath, moduleSources: new Map([[pkg.modulePath, pkg.moduleSource]]) });
        }
        catch (error) {
            if (error instanceof ClosureError) {
                throw new QualificationError(error.code, error.message);
            }
            throw error;
        }
        if (pkg.kind === 'business') {
            const intentTypes = Array.isArray(pkg.intentTypes) ? pkg.intentTypes : [];
            if (intentTypes.length === 0) {
                fail('QUALIFY_INTENT_TYPES', `business package ${pkg.packageId} must advertise its bound INTENT_TYPES`);
            }
            for (const intentType of intentTypes) {
                if (typeof intentType !== 'string' || intentType.length === 0) {
                    fail('QUALIFY_INTENT_TYPES', `business package ${pkg.packageId} advertises a malformed intent type`);
                }
            }
        }
        for (const endpoint of pkg.endpoints) {
            const key = qualifiedKey(pkg.packageId, endpoint.endpointId);
            if (qualifiedEndpointKeys.has(key)) {
                fail('QUALIFY_GRAPH_ID_COLLISION', `qualified graph key ${key} is declared twice; qualified-Graph tuples must stay injective`);
            }
            qualifiedEndpointKeys.add(key);
        }
    }
    for (const role of ['kernel', 'standard-sdk']) {
        const bound = snapshot.bindings.filter((binding) => binding.role === role);
        const [only] = bound;
        if (bound.length !== 1 || only === undefined) {
            fail('QUALIFY_ROLE_BINDING_INVALID', `role ${role} must be bound to exactly one package (found ${bound.length})`);
        }
        if (!seenPackageIds.has(only.packageId)) {
            fail('QUALIFY_ROLE_BINDING_INVALID', `role ${role} binds unknown package ${only.packageId}`);
        }
    }
    const businessBound = snapshot.bindings.filter((binding) => binding.role === 'business');
    if (businessBound.length < 1) {
        fail('QUALIFY_ROLE_BINDING_INVALID', 'at least one business package must be selected (K/S/multiple-B closure)');
    }
    for (const bound of businessBound) {
        if (!seenPackageIds.has(bound.packageId)) {
            fail('QUALIFY_ROLE_BINDING_INVALID', `role business binds unknown package ${bound.packageId}`);
        }
    }
    // Provider uniqueness: an intent type must be provided by exactly one
    // bound business package; two providers without a unique selection are an
    // ambiguous provider failure (adapted from #956 E_AMBIGUOUS_PROVIDER).
    const intentProviders = new Map();
    for (const pkg of snapshot.packages) {
        const intentTypesValue = pkg.intentTypes;
        if (pkg.kind !== 'business' || !Array.isArray(intentTypesValue))
            continue;
        const intentTypes = intentTypesValue;
        for (const intentType of intentTypes) {
            const providers = intentProviders.get(intentType) ?? [];
            providers.push(pkg.packageId);
            intentProviders.set(intentType, providers);
        }
    }
    for (const [intentType, providers] of intentProviders) {
        if (providers.length > 1) {
            fail('QUALIFY_PROVIDER_AMBIGUOUS', `intent type ${intentType} is provided by more than one business package (${providers.join(', ')}); BUILD demands a unique selection`);
        }
    }
    const intentBindings = snapshot.bindings.filter((binding) => binding.role === 'intent');
    for (const binding of intentBindings) {
        if (typeof binding.intentType !== 'string' || binding.intentType.length === 0) {
            fail('QUALIFY_INTENT_BINDING_INVALID', 'intent bindings need a non-empty intentType');
        }
        if (!seenPackageIds.has(binding.packageId)) {
            fail('QUALIFY_INTENT_BINDING_INVALID', `intent ${binding.intentType} binds unknown package ${binding.packageId}`);
        }
        if (!intentProviders.has(binding.intentType)) {
            fail('QUALIFY_INTENT_BINDING_MISSING', `intent ${binding.intentType} is bound but its business package does not advertise it in INTENT_TYPES`);
        }
    }
    const packages = snapshot.packages.map((pkg) => Object.freeze({
        packageId: pkg.packageId,
        kind: pkg.kind,
        abiVersion: pkg.abiVersion,
        modulePath: pkg.modulePath,
        moduleSha256: sha256Hex(pkg.moduleSource),
        endpoints: Object.freeze(pkg.endpoints.map((endpoint) => Object.freeze({ ...endpoint }))),
        intentTypes: Object.freeze([...(pkg.intentTypes ?? [])]),
    }));
    const subjectDigest = computeSubjectDigest({
        rootPackageId: snapshot.rootPackageId,
        packages: packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
        bindings: snapshot.bindings,
    });
    return Object.freeze({
        formatVersion: 'v08-build-qualification/1',
        rootPackageId: snapshot.rootPackageId,
        subjectDigest,
        packages: Object.freeze(packages),
        bindings: Object.freeze(snapshot.bindings.map((binding) => Object.freeze({ ...binding }))),
        qualifiedAt: new Date().toISOString(),
        producerId: 'qualified-producer:v08-build',
    });
}
