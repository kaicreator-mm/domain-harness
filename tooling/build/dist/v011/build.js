/**
 * DomainHarness v0.11.0 T02 (#1576) — canonical BUILD/AOT pipeline
 * (`buildV011App`, L2 §5 + PRD B01–B10).
 *
 * One pass, fail-fast at the FIRST refusal with the exact frozen code:
 *   1. machine-schema validation of Descriptor / Domains / Manifests through
 *      the T01 schemas + handwritten validators (single schema authority);
 *   2. exact `node24-esm/1` Target selection;
 *   3. Package closure from descriptor roots + typed dependsOn (no repair, no
 *      rediscovery), one Primary per K/S/B layer, legal extensions;
 *   4. Element ownership (one owner), explicit export/import visibility,
 *      exactly one compatible implementation per selected Function+Target;
 *   5. real resource bytes + declared sha256 verification, inline/ref content
 *      normalization, unknown-required refusal / unknown-optional exclusion;
 *   6. Package DAG + Element build-DAG acyclicity (semantic relation cycles
 *      stay legal and untouched), typed Hook owner/cardinality, paired
 *      technical init/dispose;
 *   7. exact Lock emission: Kahn topological order with lexicographic
 *      tie-break, strict-reverse dispose order, canonical JSON bytes,
 *      closureDigest over the digest-less predecessor image.
 *
 * No runtime discovery, no dependency repair, no dynamic version negotiation,
 * no old-ABI compatibility, no LLM/Effect/Provider/Meta engine, no second
 * schema authority (L2 §12 scope boundaries).
 */
import { CORE_CONTENT_KINDS, DH_LOCK_SCHEMA_VERSION, NODE24_ESM_PROFILE, contentDigestOf, isUnknownContentKind, validateDomainDefinition, validateElementDefinition, } from '@kaicreator/domain-harness-contracts/v011';
import { canonicalJson } from '@kaicreator/domain-harness-contracts/v011';
import { V011BuildRefusal, refusal } from './refusal.js';
import { compileInlineSchema, validateDocument } from './schema-check.js';
import { V011ResourceScope, digestOfBytes } from './resources.js';
import { kahnTopologicalOrder, satisfiesSemver } from './graph.js';
const PACKAGE_LAYERS = ['kernel', 'sdk', 'business'];
function elementNamespace(id) {
    const dot = id.indexOf('.');
    if (dot <= 0) {
        throw refusal('DH_BUILD_SCHEMA_INVALID', `element id '${id}' is not domain-qualified (expected '<domain>.<name>')`);
    }
    return id.slice(0, dot);
}
function isCompatibleTarget(target) {
    return (target.runtime === 'node' &&
        target.module === 'esm' &&
        (target.nodeMajor === undefined || target.nodeMajor === 24));
}
function toJson(value) {
    return value;
}
function firstIssue(issues) {
    const issue = issues[0];
    return issue;
}
// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
export function buildV011App(input) {
    try {
        return { ok: true, ...runBuild(input) };
    }
    catch (error) {
        if (error instanceof V011BuildRefusal) {
            return {
                ok: false,
                code: error.code,
                message: error.message,
                ...(error.refPath !== undefined ? { path: error.refPath } : {}),
            };
        }
        throw error;
    }
}
function runBuild(input) {
    // ---- 1. descriptor machine-schema validation --------------------------
    validateDocument('descriptor', input.descriptor);
    const descriptor = input.descriptor;
    // ---- 2. optional authoring Domains through the T01 validators ---------
    for (const [index, domain] of (input.domains ?? []).entries()) {
        const result = validateDomainDefinition(domain);
        if (!result.ok) {
            const issue = firstIssue(result.issues);
            throw new V011BuildRefusal(issue.code, `domains[${index}]: ${issue.message}`, issue.path);
        }
        validateDocument('domain', domain);
    }
    // ---- 3. manifest pool machine-schema validation -----------------------
    const pool = new Map();
    for (const [index, candidate] of input.packages.entries()) {
        validateDocument('manifest', candidate);
        const manifest = candidate;
        if (pool.has(manifest.id)) {
            throw refusal('DH_BUILD_SCHEMA_INVALID', `duplicate manifest id '${manifest.id}' in the package pool`, `packages[${index}].id`);
        }
        pool.set(manifest.id, manifest);
    }
    // ---- 4. exact target ---------------------------------------------------
    if (!isCompatibleTarget(descriptor.target)) {
        throw refusal('DH_BUILD_TARGET_INVALID', `descriptor target ${JSON.stringify(descriptor.target)} is not the unique supported node24-esm/1 family`, 'target');
    }
    const target = {
        runtime: 'node',
        module: 'esm',
        ...(descriptor.target.nodeMajor !== undefined ? { nodeMajor: descriptor.target.nodeMajor } : {}),
        profile: NODE24_ESM_PROFILE,
    };
    // ---- 5. roots / extensions lookup with layer+role checks --------------
    const selected = new Map();
    const rootSlots = [
        'kernelPrimary',
        'sdkPrimary',
        'businessPrimary',
    ];
    for (const slot of rootSlots) {
        const ref = descriptor.roots[slot];
        const manifest = pool.get(ref.package);
        if (!manifest || manifest.version !== ref.version) {
            throw refusal('DH_BUILD_REF_UNRESOLVED', `descriptor roots.${slot} references '${ref.package}@${ref.version}' which is not in the package pool`, `roots.${slot}`);
        }
        if (manifest.role !== 'primary') {
            throw refusal('DH_BUILD_LAYER_ROLE_MISMATCH', `roots.${slot} package '${ref.package}' declares role='${manifest.role}'; a root slot must reference a primary package`, `roots.${slot}`);
        }
        selected.set(manifest.id, manifest);
    }
    for (const [index, ref] of descriptor.extensions.entries()) {
        const manifest = pool.get(ref.package);
        if (!manifest || manifest.version !== ref.version) {
            throw refusal('DH_BUILD_REF_UNRESOLVED', `descriptor extensions[${index}] references '${ref.package}@${ref.version}' which is not in the package pool`, `extensions[${index}]`);
        }
        selected.set(manifest.id, manifest);
    }
    // ---- 6. closure over typed dependsOn -----------------------------------
    const queue = [...selected.keys()].sort();
    const dependsOnEdges = new Map();
    while (queue.length > 0) {
        const id = queue.shift();
        const manifest = selected.get(id);
        const edges = [];
        for (const dep of manifest.dependsOn) {
            const targetManifest = pool.get(dep.package);
            if (!targetManifest || !satisfiesSemver(targetManifest.version, dep.version)) {
                throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `'${id}' depends on '${dep.package}@${dep.version}' which is not selected and cannot be resolved`, 'dependsOn');
            }
            const exportedInterfaces = new Set(targetManifest.exports
                .map((entry) => entry.interfaceId)
                .filter((value) => value !== undefined));
            if (!exportedInterfaces.has(dep.interface)) {
                throw refusal('DH_BUILD_EXPORT_MISSING', `'${id}' depends on interface '${dep.interface}' which '${dep.package}' does not export`, 'dependsOn');
            }
            edges.push(dep.package);
            if (!selected.has(dep.package)) {
                selected.set(dep.package, targetManifest);
                queue.push(dep.package);
                queue.sort();
            }
        }
        dependsOnEdges.set(id, edges);
    }
    // ---- 7. exactly one Primary per layer ----------------------------------
    const primaries = new Map();
    for (const manifest of selected.values()) {
        if (manifest.role === 'primary') {
            const list = primaries.get(manifest.layer) ?? [];
            list.push(manifest.id);
            primaries.set(manifest.layer, list);
        }
    }
    for (const layer of PACKAGE_LAYERS) {
        const list = (primaries.get(layer) ?? []).sort();
        if (list.length === 0) {
            throw refusal('DH_BUILD_PRIMARY_MISSING', `no primary package selected for layer '${layer}'`);
        }
        if (list.length > 1) {
            throw refusal('DH_BUILD_PRIMARY_DUPLICATE', `layer '${layer}' has ${list.length} primary packages: ${list.join(', ')}`);
        }
    }
    // ---- 8. element loading + ownership invariants -------------------------
    const scope = new V011ResourceScope(input.packageRoots);
    const elements = new Map();
    const byLogicalId = new Map();
    const packagesSorted = [...selected.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const manifest of packagesSorted) {
        for (const entry of manifest.elements) {
            const definitionBytes = scope.verify(entry.definitionRef);
            let parsed;
            try {
                parsed = JSON.parse(Buffer.from(definitionBytes).toString('utf8'));
            }
            catch {
                throw refusal('DH_BUILD_SCHEMA_INVALID', `element definition '${entry.definitionRef.packageId}/${entry.definitionRef.path}' is not JSON`);
            }
            const checked = validateElementDefinition(parsed);
            if (!checked.ok) {
                const issue = firstIssue(checked.issues);
                throw new V011BuildRefusal(issue.code, issue.message, issue.path);
            }
            validateDocument('element', parsed);
            const def = parsed;
            const namespace = elementNamespace(def.id);
            if (def.id !== entry.id || def.version !== entry.version) {
                throw refusal('DH_BUILD_VERSION_CONFLICT', `manifest entry '${entry.id}@${entry.version}' resolves to definition '${def.id}@${def.version}'`);
            }
            const key = `${namespace}|${def.id}|${def.version}`;
            if (elements.has(key)) {
                throw refusal('DH_BUILD_ELEMENT_DUPLICATE_OWNER', `element '${def.id}@${def.version}' is declared by more than one selected package`);
            }
            const loaded = {
                def,
                namespace,
                key,
                definitionDigest: contentDigestOf(toJson(def)),
                owner: manifest,
                visibility: entry.visibility,
            };
            elements.set(key, loaded);
            const versions = byLogicalId.get(def.id) ?? new Map();
            versions.set(def.version, loaded);
            byLogicalId.set(def.id, versions);
        }
    }
    for (const [id, versions] of byLogicalId) {
        if (versions.size > 1) {
            throw refusal('DH_BUILD_VERSION_CONFLICT', `element '${id}' is required at multiple versions: ${[...versions.keys()].sort().join(', ')}`);
        }
    }
    // ---- 9. element build-DAG (dependencies) — semantic cycles untouched ----
    const elementDeps = new Map();
    for (const loaded of elements.values()) {
        const deps = [];
        for (const dep of loaded.def.dependencies ?? []) {
            const versions = byLogicalId.get(dep.element);
            const resolved = versions
                ? [...versions.values()].find((candidate) => satisfiesSemver(candidate.def.version, dep.version))
                : undefined;
            if (!resolved) {
                throw refusal('DH_BUILD_REF_UNRESOLVED', `element '${loaded.def.id}' depends on '${dep.element}@${dep.version}' which is not in the selected closure`);
            }
            deps.push(resolved.key);
            for (const fnId of dep.functions ?? []) {
                const fn = resolved.def.functions.find((candidate) => candidate.id === fnId);
                if (!fn) {
                    throw refusal('DH_BUILD_REF_UNRESOLVED', `element '${loaded.def.id}' pins function '${fnId}' which does not exist on '${dep.element}'`);
                }
                if (resolved.owner.id !== loaded.owner.id && !isExported(resolved.owner, resolved, fn)) {
                    throw refusal('DH_BUILD_EXPORT_MISSING', `element '${loaded.def.id}' pins non-exported function '${dep.element}.${fnId}'`);
                }
            }
        }
        elementDeps.set(loaded.key, deps);
    }
    if (kahnTopologicalOrder([...elements.keys()], elementDeps) === null) {
        throw refusal('DH_BUILD_ELEMENT_CYCLE', 'element build-time dependency DAG carries a cycle');
    }
    // ---- 10. exports self-consistency --------------------------------------
    for (const manifest of packagesSorted) {
        const owned = [...elements.values()].filter((loaded) => loaded.owner.id === manifest.id);
        for (const [index, entry] of manifest.exports.entries()) {
            if (entry.elementId !== undefined) {
                if (!owned.some((loaded) => loaded.def.id === entry.elementId)) {
                    throw refusal('DH_BUILD_REF_UNRESOLVED', `'${manifest.id}' exports element '${entry.elementId}' it does not own`, `exports[${index}]`);
                }
            }
            else if (entry.functionId !== undefined) {
                const carriers = owned.filter((loaded) => loaded.def.functions.some((fn) => fn.id === entry.functionId));
                if (carriers.length !== 1) {
                    throw refusal('DH_BUILD_REF_UNRESOLVED', `'${manifest.id}' exports function '${entry.functionId}' resolved to ${carriers.length} owned elements`, `exports[${index}]`);
                }
            }
        }
    }
    // ---- 11. descriptor-level function references ---------------------------
    const resolveFunctionRef = (ref, refPath) => {
        const versions = byLogicalId.get(ref.element.id);
        const loaded = versions?.get(ref.element.version);
        if (!loaded || loaded.namespace !== ref.element.namespace) {
            throw refusal('DH_BUILD_REF_UNRESOLVED', `function reference '${ref.element.id}' is not in the selected closure`, refPath);
        }
        if (loaded.definitionDigest !== ref.element.digest) {
            throw refusal('DH_BUILD_REF_UNRESOLVED', `function reference '${ref.element.id}@${ref.element.version}' digest does not match the selected definition`, refPath);
        }
        const fn = loaded.def.functions.find((candidate) => candidate.id === ref.functionId);
        if (!fn || fn.contractVersion !== ref.contractVersion) {
            throw refusal('DH_BUILD_REF_UNRESOLVED', `function '${ref.functionId}' (contract ${ref.contractVersion}) does not exist on '${ref.element.id}'`, refPath);
        }
        return { element: loaded, fn, owner: loaded.owner };
    };
    const requireExported = (resolved, consumer) => {
        if (resolved.owner.id !== consumer && !isExported(resolved.owner, resolved.element, resolved.fn)) {
            throw refusal('DH_BUILD_EXPORT_MISSING', `'${consumer}' references '${resolved.element.def.id}.${resolved.fn.id}' which its owner does not export`);
        }
    };
    const ingressResolved = [];
    for (const entry of descriptor.ingress) {
        const resolved = resolveFunctionRef(entry.function, `ingress.${entry.id}`);
        requireExported(resolved, descriptor.id);
        ingressResolved.push({ entry, resolved });
    }
    // ---- business App Init: exactly one selected candidate ------------------
    const appInitCandidates = [];
    for (const loaded of elements.values()) {
        const fn = loaded.def.functions.find((candidate) => candidate.id === descriptor.businessAppInit.functionId &&
            candidate.contractVersion === descriptor.businessAppInit.contractVersion);
        if (!fn || loaded.namespace !== descriptor.businessAppInit.element.namespace || loaded.def.id !== descriptor.businessAppInit.element.id) {
            continue;
        }
        if (loaded.def.version === descriptor.businessAppInit.element.version &&
            loaded.definitionDigest === descriptor.businessAppInit.element.digest) {
            appInitCandidates.push({ element: loaded, fn, owner: loaded.owner });
        }
    }
    if (appInitCandidates.length === 0) {
        throw refusal('DH_BUILD_APP_INIT_MISSING', `businessAppInit '${descriptor.businessAppInit.element.id}.${descriptor.businessAppInit.functionId}' did not resolve to a selected Function`);
    }
    if (appInitCandidates.length > 1) {
        // Under the frozen ownership invariants (one owner per element, no
        // version conflicts) exactly one candidate is reachable; this branch is
        // the defensive guard for the L2 §5.3 "≥2 App Init candidates" refusal.
        throw refusal('DH_BUILD_APP_INIT_DUPLICATE', 'more than one App Init candidate matched the descriptor reference');
    }
    const appInit = appInitCandidates[0];
    requireExported(appInit, descriptor.id);
    // ---- 12. per-package imports --------------------------------------------
    const importedFunctions = new Map();
    for (const manifest of packagesSorted) {
        for (const ref of manifest.imports) {
            const resolved = resolveFunctionRef(ref, `imports.${manifest.id}`);
            requireExported(resolved, manifest.id);
            importedFunctions.set(`${resolved.element.key}|${resolved.fn.id}`, resolved);
        }
    }
    // ---- 13. selected function set + implementation selection ---------------
    const selectedFunctions = new Map();
    const addSelected = (resolved) => {
        selectedFunctions.set(`${resolved.element.key}|${resolved.fn.id}`, resolved);
    };
    for (const { resolved } of ingressResolved)
        addSelected(resolved);
    addSelected(appInit);
    for (const resolved of importedFunctions.values())
        addSelected(resolved);
    for (const loaded of elements.values()) {
        for (const fn of loaded.def.functions) {
            if (isExported(loaded.owner, loaded, fn))
                addSelected({ element: loaded, fn, owner: loaded.owner });
        }
    }
    const sealedFunctions = [];
    for (const resolved of [...selectedFunctions.values()].sort(compareResolvedFunction)) {
        if (resolved.fn.effects !== 'none') {
            throw refusal('DH_BUILD_EFFECT_PROFILE_UNSUPPORTED', `selected function '${resolved.element.def.id}.${resolved.fn.id}' declares effects '${resolved.fn.effects}'; 0.11.0 implements 'none' only`);
        }
        const candidates = [];
        for (const manifest of packagesSorted) {
            for (const variant of manifest.targetVariants) {
                if (!isCompatibleTarget(variant.target))
                    continue;
                for (const binding of variant.implementations) {
                    if (binding.elementId === resolved.element.def.id &&
                        binding.functionId === resolved.fn.id &&
                        binding.contractVersion === resolved.fn.contractVersion) {
                        candidates.push({ manifest, binding });
                    }
                }
            }
        }
        if (candidates.length === 0) {
            throw refusal('DH_BUILD_IMPLEMENTATION_MISSING', `selected function '${resolved.element.def.id}.${resolved.fn.id}' has no compatible node24-esm/1 implementation binding`);
        }
        if (candidates.length > 1) {
            throw refusal('DH_BUILD_FUNCTION_AMBIGUOUS_IMPLEMENTATION', `selected function '${resolved.element.def.id}.${resolved.fn.id}' has ${candidates.length} compatible implementation bindings`);
        }
        const { manifest: implementor, binding } = candidates[0];
        if (implementor.id !== resolved.owner.id) {
            const ownerEntry = resolved.owner.elements.find((entry) => entry.id === resolved.element.def.id && entry.version === resolved.element.def.version);
            if (!ownerEntry || ownerEntry.visibility !== 'public' || !isExported(resolved.owner, resolved.element, resolved.fn)) {
                throw refusal('DH_BUILD_EXPORT_MISSING', `implementation owner '${implementor.id}' binds '${resolved.element.def.id}.${resolved.fn.id}' which is not visible through the definition owner's exports`);
            }
        }
        scope.verify(binding.entry.module);
        for (const resource of binding.resources ?? [])
            scope.verify(resource);
        sealedFunctions.push({
            ref: toFunctionRef(resolved),
            outcomes: [...resolved.fn.outcomes],
            effects: resolved.fn.effects,
            implementation: binding.entry,
            resources: [...(binding.resources ?? [])],
        });
    }
    // ---- 14. typed hooks -----------------------------------------------------
    const hookBindings = [];
    for (const owner of packagesSorted) {
        const declared = owner.provides?.hooks ?? [];
        for (const hook of declared) {
            const providers = [];
            for (const manifest of packagesSorted) {
                for (const contribution of manifest.contributesTo) {
                    if (contribution.ownerPackageId !== owner.id || contribution.hookId !== hook.id)
                        continue;
                    scope.verify(contribution.entry.module);
                    providers.push(contribution.entry);
                }
            }
            if (hook.cardinality === 'single' && providers.length > 1) {
                throw refusal('DH_BUILD_HOOK_CARDINALITY', `single hook '${owner.id}/${hook.id}' received ${providers.length} provider bindings`);
            }
            hookBindings.push({
                ownerPackageId: owner.id,
                hookId: hook.id,
                cardinality: hook.cardinality,
                providers,
            });
        }
    }
    for (const manifest of packagesSorted) {
        for (const contribution of manifest.contributesTo) {
            const owner = selected.get(contribution.ownerPackageId);
            const declared = owner?.provides?.hooks ?? [];
            if (!owner || !declared.some((hook) => hook.id === contribution.hookId)) {
                throw refusal('DH_BUILD_HOOK_TARGET_INVALID', `'${manifest.id}' contributes to hook '${contribution.ownerPackageId}/${contribution.hookId}' which is not declared by the selected owner package`);
            }
        }
    }
    // ---- 15. paired technical lifecycle --------------------------------------
    for (const manifest of packagesSorted) {
        if ((manifest.technicalInit === undefined) !== (manifest.technicalDispose === undefined)) {
            throw refusal('DH_BUILD_LIFECYCLE_HALF', `package '${manifest.id}' declares only one of technicalInit / technicalDispose`);
        }
        if (manifest.technicalInit)
            scope.verify(manifest.technicalInit.module);
        if (manifest.technicalDispose)
            scope.verify(manifest.technicalDispose.module);
    }
    // ---- 16. package DAG ------------------------------------------------------
    const initOrder = kahnTopologicalOrder(packagesSorted.map((manifest) => manifest.id), dependsOnEdges);
    if (initOrder === null) {
        throw refusal('DH_BUILD_PACKAGE_CYCLE', 'package dependsOn closure carries a cycle');
    }
    const disposeOrder = [...initOrder].reverse();
    // ---- 17. content validation + unknown-kind disposition --------------------
    const excludedUnknownContent = [];
    const sealedElements = [];
    for (const loaded of [...elements.values()].sort(compareLoadedElement)) {
        const contentDigests = [];
        for (const block of loaded.def.content) {
            validateBlockContent(loaded, block, scope);
            if (block.ref) {
                // digest already verified against real bytes inside validateBlockContent
                contentDigests.push(block.ref.digest);
            }
            else {
                contentDigests.push(contentDigestOf(toJson(block.value)));
            }
            if (isUnknownContentKind(block.contentKind)) {
                if (block.required) {
                    // unreachable in practice: the T01 validators already refuse a
                    // required unknown kind; kept as the frozen-predicate guard.
                    throw refusal('DH_BUILD_SCHEMA_UNKNOWN_REQUIRED', `required content block '${loaded.def.id}/${block.id}' carries unknown contentKind '${block.contentKind}'`);
                }
                excludedUnknownContent.push(`${loaded.def.id}/${block.id}`);
            }
        }
        if (loaded.def.validation)
            scope.verify(loaded.def.validation.ref);
        sealedElements.push({
            ref: toElementRef(loaded),
            ownerPackageId: loaded.owner.id,
            visibility: loaded.visibility,
            contentDigests,
            contractDigests: loaded.def.functions.map((fn) => contentDigestOf(toJson(fn))),
        });
    }
    // ---- 18. artifacts + KDP pin ----------------------------------------------
    const sealedPackages = [];
    for (const manifest of packagesSorted) {
        const artifactPath = input.packageArtifacts[manifest.id];
        if (!artifactPath) {
            throw refusal('DH_BUILD_RESOURCE_MISSING', `no artifact path provided for selected package '${manifest.id}'`);
        }
        const bytes = scope.read(manifest.id, artifactPath);
        const digest = digestOfBytes(bytes);
        scope.record(manifest.id, artifactPath, digest);
        sealedPackages.push({
            packageId: manifest.id,
            version: manifest.version,
            layer: manifest.layer,
            role: manifest.role,
            artifact: { packageId: manifest.id, path: artifactPath, digest },
            dependsOn: [...(dependsOnEdges.get(manifest.id) ?? [])].sort(),
        });
    }
    const kdpBytes = scope.read(input.kdpArtifact.packageId, input.kdpArtifact.path);
    const kdpDigest = digestOfBytes(kdpBytes);
    scope.record(input.kdpArtifact.packageId, input.kdpArtifact.path, kdpDigest);
    // ---- 19. exact Lock assembly ----------------------------------------------
    const descriptorDigest = contentDigestOf(toJson(descriptor));
    const assemble = () => {
        const withoutDigest = {
            kind: 'DomainAppLock',
            schemaVersion: DH_LOCK_SCHEMA_VERSION,
            appIdentity: { id: descriptor.id, version: descriptor.version, descriptorDigest },
            target,
            bootstrapKdpPin: {
                kdpPackageId: input.kdpArtifact.packageId,
                kdpPrimaryEntry: 'bootstrap',
                kdpPrimaryDigest: kdpDigest,
            },
            selectedPackages: sealedPackages,
            selectedElements: sealedElements,
            selectedFunctions: sealedFunctions,
            hookBindings: [...hookBindings].sort(compareHookBinding),
            technicalInitOrder: initOrder,
            technicalDisposeOrder: disposeOrder,
            businessAppInit: toFunctionRef(appInit),
            ingress: ingressResolved
                .map(({ entry, resolved }) => ({
                id: entry.id,
                function: toFunctionRef(resolved),
                optional: entry.optional ?? false,
            }))
                .sort((a, b) => (a.id < b.id ? -1 : 1)),
            resourceDigests: scope.toLockMap(),
            excludedUnknownContent: [...excludedUnknownContent].sort(),
        };
        return {
            ...withoutDigest,
            closureDigest: contentDigestOf(toJson(withoutDigest)),
        };
    };
    const lock = assemble();
    const lockText = canonicalJson(toJson(lock));
    // BUILD self-check: a second assembly from the same model must reproduce
    // byte-identical canonical JSON (L2 §5.3 DH_BUILD_LOCK_NOT_REPRODUCIBLE).
    if (canonicalJson(toJson(assemble())) !== lockText) {
        throw refusal('DH_BUILD_LOCK_NOT_REPRODUCIBLE', 'double-build self-check produced divergent Lock bytes');
    }
    return { lock, lockBytes: new TextEncoder().encode(lockText) };
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isExported(owner, element, fn) {
    const entry = owner.elements.find((candidate) => candidate.id === element.def.id && candidate.version === element.def.version);
    if (!entry || entry.visibility !== 'public')
        return false;
    return owner.exports.some((exported) => {
        if (exported.elementId === undefined && exported.functionId === undefined)
            return false;
        if (exported.elementId !== undefined && exported.elementId !== element.def.id)
            return false;
        if (exported.functionId !== undefined) {
            if (fn === undefined || exported.functionId !== fn.id)
                return false;
        }
        return true;
    });
}
function toElementRef(loaded) {
    return {
        namespace: loaded.namespace,
        id: loaded.def.id,
        version: loaded.def.version,
        digest: loaded.definitionDigest,
    };
}
function toFunctionRef(resolved) {
    return {
        element: toElementRef(resolved.element),
        functionId: resolved.fn.id,
        contractVersion: resolved.fn.contractVersion,
    };
}
function compareLoadedElement(a, b) {
    return a.def.id < b.def.id ? -1 : a.def.id > b.def.id ? 1 : a.def.version < b.def.version ? -1 : 1;
}
function compareResolvedFunction(a, b) {
    const byElement = compareLoadedElement(a.element, b.element);
    return byElement !== 0 ? byElement : a.fn.id < b.fn.id ? -1 : 1;
}
function compareHookBinding(a, b) {
    return a.ownerPackageId < b.ownerPackageId
        ? -1
        : a.ownerPackageId > b.ownerPackageId
            ? 1
            : a.hookId < b.hookId
                ? -1
                : 1;
}
/**
 * Validate one content block against its schemaRef (L2 §2.2/§2.3):
 * known kinds must resolve their schema (inline or package resource bytes)
 * and the content value must pass real draft 2020-12 validation; unknown
 * kinds are dispositioned by the caller (required → refused, optional →
 * recorded exclusion).
 */
function validateBlockContent(loaded, block, scope) {
    const known = CORE_CONTENT_KINDS.includes(block.contentKind) ||
        !isUnknownContentKind(block.contentKind);
    const blockPath = `${loaded.def.id}/${block.id}`;
    let parsedRefValue;
    let refIsJson = false;
    if (block.ref) {
        const bytes = scope.verify(block.ref);
        try {
            parsedRefValue = JSON.parse(Buffer.from(bytes).toString('utf8'));
            refIsJson = true;
        }
        catch {
            // Opaque byte content (e.g. a markdown document): digest-verified
            // above, but not schema-validatable as JSON — dispositioned as bytes.
        }
    }
    if (!known || (block.ref && !refIsJson))
        return; // unknown kind / opaque bytes: caller disposition.
    const validate = 'inline' in block.schemaRef
        ? compileInlineSchema(block.schemaRef.inline, `${blockPath}.schemaRef`)
        : compileInlineSchema(parseSchemaResource(scope, block.schemaRef, blockPath), `${blockPath}.schemaRef`);
    const value = block.ref ? parsedRefValue : block.value;
    if (!validate(value)) {
        throw refusal('DH_BUILD_SCHEMA_INVALID', `content block '${blockPath}' does not pass its declared schema`, blockPath);
    }
}
function parseSchemaResource(scope, ref, blockPath) {
    const bytes = scope.verify(ref);
    try {
        return JSON.parse(Buffer.from(bytes).toString('utf8'));
    }
    catch {
        throw refusal('DH_BUILD_SCHEMA_INVALID', `schema resource '${ref.packageId}/${ref.path}' for content block '${blockPath}' is not JSON`, blockPath);
    }
}
