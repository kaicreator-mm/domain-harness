import { canonicalJsonStringify, isContentDigest, } from './identity.js';
import { isSealedRuntimeAssembly, } from './runtime-assembly.js';
import { admitToolInvocationRequest, } from './invocation-request.js';
import { resolveToolResources, } from './resource-resolution.js';
import { verifyToolImplementationBinding, } from './tool-implementation-binding.js';
import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeArraySnapshot, safeRecordSnapshot, } from './record-safety.js';
export class NonEffectfulInvocationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'NonEffectfulInvocationError';
        this.code = code;
    }
}
// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------
function fail(code, message) {
    throw new NonEffectfulInvocationError(code, message);
}
/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(value, description, code) {
    const result = safeRecordSnapshot(value, description);
    if (!result.ok) {
        fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
/** Snapshot one authority-bearing array, mapping descriptor issues to a typed failure. */
function requireSafeArray(value, description, code) {
    const result = safeArraySnapshot(value, description);
    if (!result.ok) {
        fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
function requireSha256Port(value, path) {
    if (typeof value !== 'object' ||
        value === null ||
        typeof value.digestUtf8 !== 'function') {
        fail('INVALID_INVOCATION_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
    }
    return value;
}
/**
 * Exact identity string: non-empty and free of floating tokens, range
 * operators and embedded `id@selector` forms — never normalized.
 */
function requireExactIdentity(value, path, code) {
    if (typeof value !== 'string') {
        fail(code, `${path} must be a string`);
    }
    if (!isNonEmptyIdentityString(value)) {
        fail(code, `${path} must be a non-empty exact identity`);
    }
    if (carriesEmbeddedSelector(value) || carriesFloatingOrRangeSemantics(value)) {
        fail(code, `${path} must be an exact identity, not a floating/range selector or embedded \`id@version\` form (latest/current/active/default/*/x/range)`);
    }
    return value;
}
/** Validate one portable-JSON material field, returning a canonical deep copy. */
function requireJsonMaterial(value, path, code) {
    try {
        return JSON.parse(canonicalJsonStringify(value));
    }
    catch {
        fail(code, `${path} must be portable JSON material`);
    }
}
/** Deep-freeze a module-owned value object (callers' objects are never frozen). */
function deepFreezeValue(value) {
    if (typeof value === 'object' && value !== null) {
        for (const key of Reflect.ownKeys(value)) {
            deepFreezeValue(value[key]);
        }
        Object.freeze(value);
    }
    return value;
}
/**
 * Read one own DATA property without invoking hidden getters. Applies to
 * branded/frozen contract objects the descriptor-safe record snapshot cannot
 * consume directly (they legitimately carry symbol-keyed material).
 */
function readOwnDataProperty(value, key, code, description) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
        fail(code, `${description}.${key} is required`);
    }
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
        fail(code, `${description}.${key} must be a data property, not accessor-backed`);
    }
    return descriptor.value;
}
// ---------------------------------------------------------------------------
// Request snapshot (dispatch intent; re-admitted authoritatively later)
// ---------------------------------------------------------------------------
const INPUT_FIELDS = new Set([
    'request',
    'binding',
    'currentDefinitionGraph',
    'dispatch',
    'resourceProvider',
    'sha256',
]);
const REQUEST_FIELDS = new Set([
    'status',
    'toolComponentId',
    'operationId',
    'input',
    'caller',
    'operationEffect',
    'definitionGraphDigest',
    'assemblyDigest',
    'exposure',
]);
/**
 * Synchronously validate and snapshot the admitted-request material. The
 * presented object is dispatch INTENT, never trusted authority: its claimed
 * effect classification is ignored (re-derived from the current graph at
 * re-admission) and its exposure mint is re-verified by the T004A seam. The
 * reconstructed generic request is therefore built only from descriptor-safe
 * module-owned snapshot material.
 */
function snapshotRequest(value) {
    const at = 'invocation input.request';
    const view = requireSafeRecord(value, at, 'INVALID_INVOCATION_INPUT');
    const unexpectedField = Object.keys(view).find((key) => !REQUEST_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_INVOCATION_INPUT', `${at} must contain exactly the T004A admitted-request fields; unexpected field "${unexpectedField}"`);
    }
    for (const required of REQUEST_FIELDS) {
        if (!(required in view)) {
            fail('INVALID_INVOCATION_INPUT', `${at}.${required} is required`);
        }
    }
    if (view.status !== 'ADMITTED') {
        fail('INVALID_INVOCATION_INPUT', `${at}.status must be exactly "ADMITTED"`);
    }
    if (typeof view.operationEffect !== 'string') {
        fail('INVALID_INVOCATION_INPUT', `${at}.operationEffect must be a string (the classification is re-derived, never trusted)`);
    }
    const toolComponentId = requireExactIdentity(view.toolComponentId, `${at}.toolComponentId`, 'INVALID_INVOCATION_INPUT');
    const operationId = requireExactIdentity(view.operationId, `${at}.operationId`, 'INVALID_INVOCATION_INPUT');
    const input = requireJsonMaterial(view.input, `${at}.input`, 'INVALID_INVOCATION_INPUT');
    const caller = requireJsonMaterial(view.caller, `${at}.caller`, 'INVALID_INVOCATION_INPUT');
    if (!isContentDigest(view.definitionGraphDigest)) {
        fail('INVALID_INVOCATION_INPUT', `${at}.definitionGraphDigest must be a non-empty content digest string`);
    }
    if (!isContentDigest(view.assemblyDigest)) {
        fail('INVALID_INVOCATION_INPUT', `${at}.assemblyDigest must be a non-empty content digest string`);
    }
    if (typeof view.exposure !== 'object' || view.exposure === null) {
        fail('INVALID_INVOCATION_INPUT', `${at}.exposure must be the admitted exposure evidence object`);
    }
    return {
        toolComponentId,
        operationId,
        input,
        caller: caller,
        definitionGraphDigest: view.definitionGraphDigest,
        assemblyDigest: view.assemblyDigest,
        exposure: view.exposure,
    };
}
/**
 * Synchronously snapshot the dispatch anchor and prove its provenance. The
 * dispatch anchor is the binding's OWN successor Assembly — the exact
 * contextual Assembly pin (#646/#658 posture); there is no separate assembly
 * input, no global current/latest Assembly owner and no other repair.
 *
 * #691 P1-1 repair: the anchor's provenance is decided by the accepted
 * T002B-owned `isSealedRuntimeAssembly` mint verifier consumed DIRECTLY over
 * this exact object. A self-consistent content forgery — never passed through
 * `sealRuntimeAssembly` — fails ASSEMBLY_PROVENANCE_UNVERIFIED here, before
 * the T004A re-admission that would otherwise accept its content checks. No
 * host-held mint record, caller trust callback or content-consistency-only
 * substitute can authorize the anchor.
 *
 * Binding AUTHENTICITY (module-private mint membership, v1 evidence digest,
 * exact subject slot/currentness) is deliberately NOT re-derived here: it is
 * consumed from the T003C-owned verifier in the async phase, before the
 * opaque implementation handle is paired and exposed.
 */
function snapshotDispatchAnchor(value, request) {
    const at = 'invocation input.binding';
    if (typeof value !== 'object' || value === null) {
        fail('INVALID_BINDING_EVIDENCE', `${at} must be the T003C sealed Tool implementation binding object`);
    }
    const successorAssembly = readOwnDataProperty(value, 'successorAssembly', 'INVALID_BINDING_EVIDENCE', at);
    if (typeof successorAssembly !== 'object' || successorAssembly === null) {
        fail('INVALID_BINDING_EVIDENCE', `${at}.successorAssembly must be the sealed successor Runtime Assembly object`);
    }
    if (!isSealedRuntimeAssembly(successorAssembly)) {
        fail('ASSEMBLY_PROVENANCE_UNVERIFIED', `the dispatch anchor (${at}.successorAssembly) is not a SealedRuntimeAssembly minted by sealRuntimeAssembly — the accepted T002B mint verifier is consumed directly over the exact final Assembly and a self-consistent content forgery can never supply the dispatch anchor`);
    }
    const successorRecord = readOwnDataProperty(successorAssembly, 'record', 'INVALID_BINDING_EVIDENCE', `${at}.successorAssembly`);
    const applicableRequirementCount = countApplicableRequirements(successorRecord, request.toolComponentId, request.operationId);
    return {
        successorAssembly,
        applicableRequirementCount,
    };
}
/**
 * Count the sealed-Assembly requirements applicable to one invocation
 * operation: component-scope requirements always apply; operation-scoped
 * requirements apply only to their exact operation. Tolerant structural read
 * (the authoritative requirement-material validation lives in the T005B
 * seam); structural surprises fail closed typed.
 */
function countApplicableRequirements(record, toolComponentId, operationId) {
    if (typeof record !== 'object' || record === null) {
        fail('INVALID_BINDING_EVIDENCE', 'sealed binding successorAssembly.record must be an object');
    }
    const requirements = readOwnDataProperty(record, 'resourceRequirements', 'INVALID_BINDING_EVIDENCE', 'sealed binding successorAssembly.record');
    const entries = requireSafeArray(requirements, 'sealed binding successorAssembly.record.resourceRequirements', 'INVALID_BINDING_EVIDENCE');
    let count = 0;
    for (const entry of entries) {
        const material = requireSafeRecord(entry, 'sealed binding successorAssembly.record.resourceRequirements entry', 'INVALID_BINDING_EVIDENCE');
        if (material.componentId !== toolComponentId || !Array.isArray(material.requirements)) {
            continue;
        }
        for (const requirement of material.requirements) {
            if (typeof requirement !== 'object' || requirement === null) {
                fail('INVALID_BINDING_EVIDENCE', 'sealed Assembly requirement material must be records');
            }
            const scoped = requirement.operationId;
            if (scoped === undefined || scoped === operationId) {
                count += 1;
            }
        }
    }
    return count;
}
// ---------------------------------------------------------------------------
// invokeNonEffectfulTool — the non-effectful dispatch boundary (PACK-C T004B)
// ---------------------------------------------------------------------------
/**
 * Execute ONE admitted Tool invocation request through the `effect=none`
 * path.
 *
 * Deterministic fail-closed precedence: input shape, port shapes, request
 * snapshot and the dispatch-anchor snapshot (where the directly consumed
 * T002B mint verifier decides the final Assembly's provenance,
 * ASSEMBLY_PROVENANCE_UNVERIFIED) — all synchronous — then, after the single
 * re-admission suspension, the freshly derived effect gate
 * (EFFECTFUL_OPERATION_REJECTED), the T003C-owned binding verification whose
 * typed failures propagate unchanged
 * (UNMINTED_TOOL_IMPLEMENTATION_BINDING, TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH,
 * MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING, STALE_TOOL_IMPLEMENTATION_BINDING),
 * T004B-owned dispatch consistency over the VERIFIED binding
 * (INVALID_BINDING_EVIDENCE), T005B resource resolution (failures propagated
 * unchanged) and finally the dispatch. The Tool's own thrown failures
 * propagate unchanged; only a portable-JSON Tool return is snapshotted into
 * the frozen observational result.
 *
 * Torn-snapshot discipline: every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted before the first `await` (the T004A
 * re-admission's own synchronous phase runs in the same tick, over the same
 * caller-owned graph object, before its first suspension); after any
 * suspension only module-owned snapshot material, the frozen genuine-mint
 * anchor and the fresh frozen T003C-verified material are read — the
 * dispatched handle is the verifier-paired reference, never a re-read of
 * caller-owned state.
 */
export async function invokeNonEffectfulTool(input) {
    // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
    const view = requireSafeRecord(input, 'non-effectful invocation input', 'INVALID_INVOCATION_INPUT');
    const unexpectedInputField = Object.keys(view).find((key) => !INPUT_FIELDS.has(key));
    if (unexpectedInputField !== undefined) {
        fail('INVALID_INVOCATION_INPUT', `non-effectful invocation input must contain exactly {request, binding, currentDefinitionGraph, dispatch, resourceProvider?, sha256}; unexpected field "${unexpectedInputField}" (no transition, occurrence, journal or injected provenance-decision material is representable)`);
    }
    for (const required of ['request', 'binding', 'currentDefinitionGraph', 'dispatch', 'sha256']) {
        if (!(required in view) || view[required] === undefined) {
            fail('INVALID_INVOCATION_INPUT', `non-effectful invocation input.${required} is required`);
        }
    }
    const sha256 = requireSha256Port(view.sha256, 'non-effectful invocation input.sha256');
    const dispatchPort = view.dispatch;
    if (typeof dispatchPort !== 'object' ||
        dispatchPort === null ||
        typeof dispatchPort.dispatch !== 'function') {
        fail('INVALID_TOOL_DISPATCH_PORT', 'non-effectful invocation input.dispatch must be a NonEffectfulToolDispatchPort ({ dispatch({ handle, operationId, input, resources }): Promise<unknown> })');
    }
    let resourceProvider;
    if (view.resourceProvider !== undefined) {
        const candidate = view.resourceProvider;
        if (typeof candidate !== 'object' ||
            candidate === null ||
            typeof candidate.resolve !== 'function') {
            fail('INVALID_INVOCATION_INPUT', 'non-effectful invocation input.resourceProvider must be a ResourceProvider ({ resolve(request): Promise<ResourceProviderResponse> })');
        }
        resourceProvider = candidate;
    }
    const graph = view.currentDefinitionGraph;
    const request = snapshotRequest(view.request);
    const anchor = snapshotDispatchAnchor(view.binding, request);
    // ---- PHASE 2 (async): re-admission over the exact current state.
    //
    // The dispatch anchor is the binding's OWN successor Assembly: a request
    // admitted against any other Assembly fails currentness here, before any
    // Tool call. T004A typed failures propagate unchanged.
    const reconstructed = Object.freeze({
        toolComponentId: request.toolComponentId,
        operationId: request.operationId,
        input: request.input,
        caller: request.caller,
        definitionGraphDigest: request.definitionGraphDigest,
        assemblyDigest: request.assemblyDigest,
        exposure: request.exposure,
    });
    const admitted = await admitToolInvocationRequest(reconstructed, { assembly: anchor.successorAssembly, currentDefinitionGraph: graph }, sha256);
    // The effect gate runs on the FRESHLY DERIVED classification — never on the
    // caller-presented operationEffect.
    if (admitted.operationEffect !== 'none') {
        fail('EFFECTFUL_OPERATION_REJECTED', `operation "${admitted.operationId}" of Tool Component "${admitted.toolComponentId}" is classified "${admitted.operationEffect}" and can never use the effect=none path; effectful operations route through the T004C authoritative occurrence / Central Admission path — this module never dispatches them and never falls back`);
    }
    // ---- #691 P1-2 repair: T003C-owned binding verification BEFORE the opaque
    // implementation handle is paired and exposed. The verifier proves
    // module-private mint membership, re-verifies the accepted v1
    // bindingDigest over the evidence material, and decides exact subject
    // slot/currentness against the SAME final sealed Assembly (the anchor). Its
    // typed failures propagate unchanged — this module never re-derives or
    // re-owns those semantics.
    const verified = await verifyToolImplementationBinding({
        binding: view.binding,
        finalAssembly: anchor.successorAssembly,
        sha256,
    });
    // Binding/request dispatch consistency over the VERIFIED material: the
    // exact verifier-paired handle pairs only with the exact current pin under
    // the exact current identities. (T003C deliberately never compares the
    // historical mint-time evidence.assemblyDigest to the final Assembly; the
    // cross-seam equality checks here consume only VERIFIED/ADMITTED material.)
    const evidence = verified.evidence;
    if (evidence.toolComponentId !== admitted.toolComponentId) {
        fail('INVALID_BINDING_EVIDENCE', `the verified binding pairs the handle of Tool Component "${evidence.toolComponentId}" but the admitted request targets "${admitted.toolComponentId}"; a binding can never dispatch another target's handle`);
    }
    if (verified.currentness.definitionGraphDigest !== admitted.definitionGraphDigest) {
        fail('INVALID_BINDING_EVIDENCE', 'the verified binding currentness is anchored to a different Definition graph digest than the authoritatively recomputed current digest; a stale binding fails closed before any Tool call');
    }
    if (verified.currentness.finalAssemblyDigest !== admitted.assemblyDigest) {
        fail('INVALID_BINDING_EVIDENCE', 'the verified binding currentness is anchored to a different final Assembly digest than the admitted request; a binding verified against another successor Assembly fails closed before any Tool call');
    }
    if (!evidence.supportedOperations.includes(admitted.operationId)) {
        fail('INVALID_BINDING_EVIDENCE', `the verified binding binds only operations (${evidence.supportedOperations.join(', ')}) and does not include the admitted operation "${admitted.operationId}"; the paired handle never dispatches outside the exact bound set`);
    }
    // Resources: only sealed-Assembly requirements are resolved, through the
    // T005B boundary, before dispatch. T005B typed failures propagate unchanged.
    let resources;
    if (resourceProvider !== undefined) {
        const resolved = await resolveToolResources({
            assembly: anchor.successorAssembly,
            componentId: admitted.toolComponentId,
            operationId: admitted.operationId,
            provider: resourceProvider,
        });
        resources = resolved.resources;
    }
    else if (anchor.applicableRequirementCount > 0) {
        fail('MISSING_RESOURCE_PROVIDER', `the sealed Assembly carries ${anchor.applicableRequirementCount} applicable resource requirement(s) for operation "${admitted.operationId}" of Tool Component "${admitted.toolComponentId}", but no ResourceProvider was injected; requirements fail closed before dispatch — no ambient, default, or fallback resource exists`);
    }
    else {
        resources = new Map();
    }
    // ---- Dispatch: the VERIFIER-PAIRED handle (exposed only after mint,
    // evidence, final-slot and currentness verification succeeded), the frozen
    // input snapshot, the resolved resources. Tool thrown failures propagate
    // unchanged — never caught, wrapped or converted into an outcome.
    const dispatchQuery = Object.freeze({
        handle: verified.implementationHandle,
        operationId: admitted.operationId,
        input: admitted.input,
        resources,
    });
    const rawOutput = await dispatchPort.dispatch(dispatchQuery);
    // The Tool output is observational material: snapshot it immediately after
    // the suspension into frozen module-owned portable JSON.
    const output = deepFreezeValue(requireJsonMaterial(rawOutput, 'tool output', 'INVALID_TOOL_OUTPUT'));
    const result = Object.freeze({
        status: 'OBSERVED',
        toolComponentId: admitted.toolComponentId,
        operationId: admitted.operationId,
        output,
        implementation: evidence.implementation,
        bindingDigest: evidence.bindingDigest,
        definitionGraphDigest: admitted.definitionGraphDigest,
        assemblyDigest: admitted.assemblyDigest,
    });
    return result;
}
//# sourceMappingURL=non-effectful-invocation.js.map