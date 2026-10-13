/**
 * v0.8 qualified package installer — INTERNAL protected Host channel (T-A, #1000).
 * =============================================================================
 *
 * Not exported from the public package index. Only `load()` reaches this
 * module, and only AFTER the load trust gate (trust.ts) cryptographically
 * verified the approval issuer attestation — the executable path is
 * fail-closed upstream of any import.
 *
 * Installation is TWO-PHASE and whole-closure atomic wherever JavaScript
 * semantics allow (P2-ATOMIC-03 repair):
 *
 *   Phase 1 (inert preflight): EVERY package's sealed bytes are hashed and
 *   compared to its pinned SHA-256, ABI declarations and endpoint shapes
 *   are validated — for the ENTIRE closure — before the FIRST import. A
 *   malformed last package therefore rejects the load while every module is
 *   still inert data; no top-level side effect can run.
 *
 *   Phase 2 (sequential activation): modules are imported one by one and
 *   their runtime self-identity (MODULE_ID / ABI_VERSION / PACKAGE_KIND,
 *   required ABI exports, declared-endpoint correspondence) is verified.
 *   JavaScript offers no way to evaluate a module's namespace without
 *   executing its top level, so a phase-2 identity failure on package N can
 *   only be observed after packages 1..N-1 have already evaluated — this
 *   residual, unavoidable evaluation scope is documented here and pinned by
 *   ordering tests; the installer never claims an all-or-nothing startup it
 *   cannot deliver. Everything verifiable without evaluation IS verified
 *   before the first import (adapted from #994@b9ea4d1 load.mjs installer
 *   part and #978@f87cfdf trusted-anchor install).
 */
import { QualifiedPackageError, V8_QUALIFIED_ABI, sha256Hex, } from './contracts.js';
async function importModuleFromBytes(moduleSource) {
    const url = `data:text/javascript;base64,${Buffer.from(moduleSource, 'utf8').toString('base64')}`;
    return (await import(url));
}
/**
 * Install every sealed package of an already statically qualified,
 * trust-verified root. Phase 1 preflights the WHOLE closure before the
 * first import; phase 2 activates sequentially with runtime identity and
 * endpoint-correspondence checks per module.
 */
export async function installQualifiedPackages(root) {
    // ---- Phase 1: whole-closure inert preflight (no import in this loop) ----
    for (const descriptor of root.packages) {
        const digest = sha256Hex(descriptor.moduleSource);
        if (digest !== descriptor.moduleSha256) {
            throw new QualifiedPackageError('INSTALL_BYTES_MUTATED', `package ${descriptor.packageId}: sealed moduleSha256 ${descriptor.moduleSha256} does not match the presented module bytes (actual ${digest}); mutated bytes are refused for the whole closure before any executable import`);
        }
        const abi = V8_QUALIFIED_ABI[descriptor.abiVersion];
        if (abi === undefined) {
            throw new QualifiedPackageError('LOAD_ABI_UNKNOWN', `package ${descriptor.packageId} declares unknown abiVersion ${descriptor.abiVersion}`);
        }
        for (const endpoint of descriptor.endpoints) {
            if (typeof endpoint.endpointId !== 'string' || endpoint.endpointId.length === 0 || typeof endpoint.kind !== 'string') {
                throw new QualifiedPackageError('LOAD_NOT_A_QUALIFIED_ROOT', `package ${descriptor.packageId} declares a malformed endpoint entry (endpointId/kind must be non-empty strings)`);
            }
        }
    }
    // ---- Phase 2: sequential activation (evaluation begins here) ----
    const installed = [];
    for (const descriptor of root.packages) {
        const namespace = await importModuleFromBytes(descriptor.moduleSource);
        const abi = V8_QUALIFIED_ABI[descriptor.abiVersion];
        if (abi === undefined) {
            throw new QualifiedPackageError('LOAD_ABI_UNKNOWN', `package ${descriptor.packageId} declares unknown abiVersion ${descriptor.abiVersion}`);
        }
        for (const exportName of abi.requiredExports) {
            if (namespace[exportName] === undefined) {
                throw new QualifiedPackageError('MODULE_IDENTITY_MISMATCH', `package ${descriptor.packageId}: module does not export required ABI member ${exportName}; activation of an unqualified module fails typed`);
            }
        }
        if (namespace.MODULE_ID !== descriptor.packageId) {
            throw new QualifiedPackageError('MODULE_IDENTITY_MISMATCH', `package ${descriptor.packageId}: module self-identifies as ${String(namespace.MODULE_ID)}; a mismatched provider can never be installed under another package identity`);
        }
        if (namespace.ABI_VERSION !== descriptor.abiVersion) {
            throw new QualifiedPackageError('MODULE_IDENTITY_MISMATCH', `package ${descriptor.packageId}: module declares ABI ${String(namespace.ABI_VERSION)} but was sealed as ${descriptor.abiVersion}`);
        }
        if (namespace.PACKAGE_KIND !== descriptor.kind) {
            throw new QualifiedPackageError('MODULE_IDENTITY_MISMATCH', `package ${descriptor.packageId}: module declares PACKAGE_KIND ${String(namespace.PACKAGE_KIND)} but was sealed as ${descriptor.kind}`);
        }
        const endpoints = Array.isArray(namespace.ENDPOINTS) ? namespace.ENDPOINTS : [];
        const moduleEndpointKinds = new Map();
        for (const endpoint of endpoints) {
            if (typeof endpoint === 'object'
                && endpoint !== null
                && typeof endpoint.endpointId === 'string'
                && typeof endpoint.kind === 'string') {
                moduleEndpointKinds.set(endpoint.endpointId, endpoint.kind);
            }
        }
        // Declared-endpoint correspondence: every endpoint the sealed descriptor
        // binds (including the K/S/B/intent selected endpoint IDs validated in
        // contracts.ts) must resolve to an identically-kinded endpoint the
        // module itself exports — presence of the right kind SOMEWHERE in the
        // namespace is not enough (P1-BIND-02).
        for (const declared of descriptor.endpoints) {
            const moduleKind = moduleEndpointKinds.get(declared.endpointId);
            if (moduleKind === undefined || moduleKind !== declared.kind) {
                throw new QualifiedPackageError('ENDPOINT_MISSING', `package ${descriptor.packageId}: bound endpoint ${declared.endpointId} (kind ${declared.kind}) is not provided by the module`);
            }
        }
        for (const kind of abi.requiredEndpointKinds) {
            if (!new Set(moduleEndpointKinds.values()).has(kind)) {
                throw new QualifiedPackageError('ENDPOINT_MISSING', `package ${descriptor.packageId}: sealed endpoint kind ${kind} is not provided by the module`);
            }
        }
        // Capability handler correspondence (#1023 S02a): every operation→handler
        // entry the sealed root binds for this capability package must resolve
        // to a genuinely callable export of the physically installed namespace —
        // presence elsewhere in the closure is not enough, and a bound name that
        // is missing or non-callable fails typed before any handler can run.
        if (descriptor.kind === 'capability') {
            const capabilityBindings = root.bindings.filter((binding) => binding.role === 'capability' && binding.packageId === descriptor.packageId);
            for (const binding of capabilityBindings) {
                for (const bound of binding.handlers) {
                    if (typeof bound.handler !== 'string' || bound.handler.length === 0 || typeof namespace[bound.handler] !== 'function') {
                        throw new QualifiedPackageError('MODULE_HANDLER_MISSING', `package ${descriptor.packageId}: capability ${binding.capabilityId} binds handler ${String(bound.handler)} for operation ${String(bound.operationId)}, which the module does not export as a function`);
                    }
                }
            }
        }
        installed.push({ descriptor, namespace });
    }
    return installed;
}
//# sourceMappingURL=installer.js.map