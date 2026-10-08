import { computeDefinitionGraphDigest, validateDefinitionGraphEnvelope, } from './definition-graph.js';
import { canonicalJsonStringify, computeCanonicalJsonDigest, isContentDigest, } from './identity.js';
import { RUNTIME_ASSEMBLY_DIGEST_DOMAIN, } from './runtime-assembly.js';
import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeRecordSnapshot, } from './record-safety.js';
import { validateToolComponent, } from './tool-component.js';
/**
 * Versioned Tool exposure digest domain tag, owned exclusively by this file.
 * Any future change to the admitted-exposure material shape is a NEW domain
 * tag; historical exposure evidence identities never change retroactively.
 */
export const TOOL_EXPOSURE_DIGEST_DOMAIN = 'kaicreator.tool-exposure.digest.v1';
export class InvocationRequestError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'InvocationRequestError';
        this.code = code;
    }
}
/**
 * Private anti-forgery brand + module-private minting registry (authoritative
 * test). The brand property alone is bypassable (prototype-chain inheritance,
 * reflective symbol theft — see #601), so registry membership decided here is
 * what actually authorizes evidence.
 */
const ADMITTED_EXPOSURE_BRAND = Symbol('kaicreator.invocation.exposure.admitted');
const ADMITTED_EXPOSURE_MINTS = new WeakSet();
// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------
function fail(code, message) {
    throw new InvocationRequestError(code, message);
}
function requireSha256Port(value, path) {
    if (typeof value !== 'object' ||
        value === null ||
        typeof value.digestUtf8 !== 'function') {
        fail('INVALID_INVOCATION_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
    }
    return value;
}
/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(value, description, code) {
    const result = safeRecordSnapshot(value, description);
    if (!result.ok) {
        fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
/**
 * Exact identity string: non-empty and free of floating tokens, range
 * operators and embedded `id@selector` forms — never normalized. Identity and
 * embedded-selector violations are one authority class here: both mean the
 * value is not an exact identity.
 */
function requireExactIdentity(value, path, code) {
    if (typeof value !== 'string') {
        fail(code, `${path} must be a string`);
    }
    if (!isNonEmptyIdentityString(value)) {
        fail(code, `${path} must be a non-empty exact identity`);
    }
    if (carriesEmbeddedSelector(value) || carriesFloatingOrRangeSemantics(value)) {
        fail('FLOATING_AUTHORITY_REFERENCE_FORBIDDEN', `${path} must be an exact identity, not a floating/range selector or embedded \`id@version\` form (latest/current/active/default/*/x/range)`);
    }
    return value;
}
/**
 * Validate one portable-JSON material field, returning a plain-object deep
 * copy in canonical form (null-prototype canonical intermediates are
 * reified, so stored snapshots deep-compare and serialize like ordinary
 * JSON values).
 */
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
const CALLER_FIELDS = new Set(['callerId', 'callerKind', 'attributes']);
/**
 * Synchronously validate and snapshot one caller context into fresh frozen
 * module-owned value objects with canonicalized attributes. The canonical
 * text is the caller-equality authority used to prove a request caller is
 * exactly the caller the exposure evidence was minted for.
 */
function snapshotCaller(value, path, code) {
    const view = requireSafeRecord(value, path, code);
    const unexpectedField = Object.keys(view).find((key) => !CALLER_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail(code, `${path} must contain exactly {callerId, callerKind?, attributes?}; unexpected field "${unexpectedField}" (caller context is provenance only — no authority material is representable)`);
    }
    if (!('callerId' in view)) {
        fail(code, `${path}.callerId is required`);
    }
    const callerId = requireExactIdentity(view.callerId, `${path}.callerId`, code);
    const snapshot = { callerId };
    if ('callerKind' in view && view.callerKind !== undefined) {
        snapshot.callerKind = requireExactIdentity(view.callerKind, `${path}.callerKind`, code);
    }
    if ('attributes' in view && view.attributes !== undefined) {
        snapshot.attributes = deepFreezeValue(requireJsonMaterial(view.attributes, `${path}.attributes`, code));
    }
    const canonical = canonicalJsonStringify(snapshot);
    deepFreezeValue(snapshot);
    return { caller: snapshot, canonical };
}
/** Trusted-policy shape check (the DECISION runs later, over snapshots). */
function requirePolicy(value) {
    if (typeof value !== 'object' ||
        value === null ||
        typeof value.decideAdmission !== 'function') {
        fail('INVALID_EXPOSURE_POLICY', 'policy must be a ToolExposureAdmissionPolicy ({ decideAdmission({ operation, caller }): { admitted: boolean, reason? } })');
    }
    return value;
}
// ---------------------------------------------------------------------------
// Sealed Assembly serializable-identity consumption (T002B-owned mint stays
// the sole authority over validator-handle provenance; here only the public
// record identity is consumed and authoritatively re-derived)
// ---------------------------------------------------------------------------
const ASSEMBLY_RECORD_FIELDS = new Set([
    'digestDomain',
    'definitionGraphDigest',
    'kindImplementations',
    'resourceRequirements',
    'implementationBindingEvidence',
]);
/**
 * Synchronously validate the serializable identity shape of a sealed-Assembly-
 * like value. The sealed Assembly is a BRANDED object (its anti-forgery brand
 * is symbol-keyed by design, #601), so the closed-world record snapshot cannot
 * be applied to the object itself: own string-keyed properties are inspected
 * through property descriptors only (never executing accessors), symbol-keyed
 * material is ignored by design, and the nested serializable record is then
 * snapshot through the descriptor-safe primitive. Authenticity of the sealed
 * Assembly object itself (and of any validator handles on its bindings)
 * remains T002B's mint-registry authority — this module never invokes
 * validators; it consumes only public record identity, which it re-derives
 * authoritatively through the digest port.
 */
function requireAssemblyIdentity(value, path) {
    if (typeof value !== 'object' || value === null) {
        fail('INVALID_ASSEMBLY_EVIDENCE', `${path} must be a sealed Runtime Assembly object`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowedStringKeys = new Set(['record', 'assemblyDigest', 'bindings']);
    for (const key of Object.getOwnPropertyNames(descriptors)) {
        if (!allowedStringKeys.has(key)) {
            fail('INVALID_ASSEMBLY_EVIDENCE', `${path} must not carry unexpected property "${key}" (a sealed Runtime Assembly carries exactly {record, assemblyDigest, bindings} plus its symbol brand)`);
        }
        const descriptor = descriptors[key];
        if (!descriptor.enumerable) {
            fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.${key} must be an enumerable data property (hidden properties are not contract input)`);
        }
        if (typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
            fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.${key} must be a data property, not an accessor`);
        }
    }
    if (!('record' in descriptors)) {
        fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.record is required (a sealed Runtime Assembly carries its serializable record)`);
    }
    if (!('assemblyDigest' in descriptors)) {
        fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.assemblyDigest is required`);
    }
    if (!isContentDigest(descriptors.assemblyDigest.value)) {
        fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.assemblyDigest must be a non-empty content digest string`);
    }
    const record = requireSafeRecord(descriptors.record.value, `${path}.record`, 'INVALID_ASSEMBLY_EVIDENCE');
    const unexpectedField = Object.keys(record).find((key) => !ASSEMBLY_RECORD_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.record must contain exactly the T002B record fields; unexpected field "${unexpectedField}"`);
    }
    if (record.digestDomain !== RUNTIME_ASSEMBLY_DIGEST_DOMAIN) {
        fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.record.digestDomain must be exactly "${RUNTIME_ASSEMBLY_DIGEST_DOMAIN}"`);
    }
    if (!isContentDigest(record.definitionGraphDigest)) {
        fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.record.definitionGraphDigest must be a non-empty content digest string`);
    }
    for (const arrayField of ['kindImplementations', 'resourceRequirements', 'implementationBindingEvidence']) {
        if (!Array.isArray(record[arrayField])) {
            fail('INVALID_ASSEMBLY_EVIDENCE', `${path}.record.${arrayField} must be an array`);
        }
    }
    return {
        record: descriptors.record.value,
        definitionGraphDigest: record.definitionGraphDigest,
        assemblyDigest: descriptors.assemblyDigest.value,
    };
}
/** Authoritative admitted-exposure guard: mint registry + own-property brand. */
function isAdmittedExposure(value) {
    return (typeof value === 'object' &&
        value !== null &&
        ADMITTED_EXPOSURE_MINTS.has(value) &&
        Object.hasOwn(value, ADMITTED_EXPOSURE_BRAND) &&
        value[ADMITTED_EXPOSURE_BRAND] === true);
}
/** Resolve one exact Tool Component binding from an already-validated graph. */
function requireToolComponentBinding(graph, toolComponentId) {
    const bound = graph.components.find((component) => component.componentId === toolComponentId);
    if (bound === undefined) {
        fail('TOOL_COMPONENT_NOT_BOUND', `Tool Component "${toolComponentId}" is not bound in the current Definition graph; unbound invocation targets fail closed (no ambient/default Tool exists)`);
    }
    return bound;
}
/**
 * Synchronously snapshot the declared operation contract for one operationId
 * from an already Tool-validated component binding. Runs in the same
 * synchronous phase as `validateToolComponent`, so the snapshot can never
 * observe post-validation caller mutation.
 */
function snapshotOperation(bound, toolComponentId, operationId) {
    const body = requireSafeRecord(bound.semanticBody, `Tool Component "${toolComponentId}" semanticBody`, 'INVALID_TOOL_INVOCATION_TARGET');
    if (!Array.isArray(body.operations)) {
        fail('INVALID_TOOL_INVOCATION_TARGET', `Tool Component "${toolComponentId}" does not carry a valid operations declaration`);
    }
    for (const candidate of body.operations) {
        const operation = requireSafeRecord(candidate, `Tool Component "${toolComponentId}" operation`, 'INVALID_TOOL_INVOCATION_TARGET');
        if (operation.operationId !== operationId) {
            continue;
        }
        const snapshot = {
            operationId: operation.operationId,
            inputSchema: requireJsonMaterial(operation.inputSchema, 'operation.inputSchema', 'INVALID_TOOL_INVOCATION_TARGET'),
            outputSchema: requireJsonMaterial(operation.outputSchema, 'operation.outputSchema', 'INVALID_TOOL_INVOCATION_TARGET'),
            effect: operation.effect,
        };
        if ('declaredFailures' in operation && operation.declaredFailures !== undefined) {
            snapshot.declaredFailures = requireJsonMaterial(operation.declaredFailures, 'operation.declaredFailures', 'INVALID_TOOL_INVOCATION_TARGET');
        }
        if ('declaredExposure' in operation && operation.declaredExposure !== undefined) {
            snapshot.declaredExposure = requireJsonMaterial(operation.declaredExposure, 'operation.declaredExposure', 'INVALID_TOOL_INVOCATION_TARGET');
        }
        return deepFreezeValue(snapshot);
    }
    fail('INVALID_TOOL_INVOCATION_TARGET', `operation "${operationId}" is not declared by Tool Component "${toolComponentId}"; unknown operations fail closed (never first/default)`);
}
const ADMIT_EXPOSURE_INPUT_FIELDS = new Set([
    'toolComponentId',
    'operationId',
    'caller',
    'assembly',
    'currentDefinitionGraph',
    'policy',
]);
const REQUEST_FIELDS = new Set([
    'toolComponentId',
    'operationId',
    'input',
    'caller',
    'definitionGraphDigest',
    'assemblyDigest',
    'exposure',
]);
// ---------------------------------------------------------------------------
// admitToolExposure — the exposure-authority boundary (PACK-A)
// ---------------------------------------------------------------------------
/**
 * Admit one caller exposure against the exact current state.
 *
 * Deterministic fail-closed precedence: input shape, exact identities, caller
 * contract, policy shape, Assembly identity shape, graph validation
 * (propagated unchanged), Tool binding resolution, Tool declaration
 * validation (propagated unchanged), operation existence, then async
 * currentness recomputation, exposure digest, policy decision and mint.
 *
 * Torn-snapshot discipline: every authority-bearing input is descriptor-safe
 * validated and snapshotted synchronously before the first `await`; the
 * policy decision consumes only module-owned snapshots; minted evidence is
 * deeply frozen and never aliases caller-owned state.
 */
export async function admitToolExposure(input, sha256) {
    const port = requireSha256Port(sha256, 'sha256');
    // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
    const view = requireSafeRecord(input, 'tool exposure admission input', 'INVALID_INVOCATION_INPUT');
    const unexpectedInputField = Object.keys(view).find((key) => !ADMIT_EXPOSURE_INPUT_FIELDS.has(key));
    if (unexpectedInputField !== undefined) {
        fail('INVALID_INVOCATION_INPUT', `tool exposure admission input must contain exactly {toolComponentId, operationId, caller, assembly, currentDefinitionGraph, policy}; unexpected field "${unexpectedInputField}"`);
    }
    for (const required of ['toolComponentId', 'operationId', 'caller', 'assembly', 'currentDefinitionGraph', 'policy']) {
        if (!(required in view)) {
            fail('INVALID_INVOCATION_INPUT', `tool exposure admission input.${required} is required`);
        }
    }
    const toolComponentId = requireExactIdentity(view.toolComponentId, 'tool exposure admission input.toolComponentId', 'INVALID_INVOCATION_INPUT');
    const operationId = requireExactIdentity(view.operationId, 'tool exposure admission input.operationId', 'INVALID_INVOCATION_INPUT');
    const { caller } = snapshotCaller(view.caller, 'tool exposure admission input.caller', 'INVALID_INVOCATION_CALLER');
    const policy = requirePolicy(view.policy);
    const assembly = requireAssemblyIdentity(view.assembly, 'tool exposure admission input.assembly');
    const graph = view.currentDefinitionGraph;
    // Graph envelope failures propagate the original DefinitionGraphContractError.
    validateDefinitionGraphEnvelope(graph);
    // The graph binding is the authoritative target: the component must be a
    // structurally valid Tool and must declare the exact operation.
    const bound = requireToolComponentBinding(graph, toolComponentId);
    if (bound.family !== 'tool') {
        fail('INVALID_TOOL_INVOCATION_TARGET', `Component "${toolComponentId}" is family "${bound.family}" and can never be a Tool invocation target`);
    }
    // Tool declaration failures propagate the original ToolComponentContractError.
    validateToolComponent(bound);
    const operation = snapshotOperation(bound, toolComponentId, operationId);
    // ---- PHASE 2 (async): authoritative digest work only.
    const currentGraphDigest = await computeDefinitionGraphDigest(graph, port);
    if (currentGraphDigest !== assembly.definitionGraphDigest) {
        fail('DEFINITION_CURRENTNESS_MISMATCH', 'the current Definition graph digest does not match the exact digest bound in the sealed Assembly; stale graphs fail closed before any exposure evidence is minted');
    }
    const exposureDigest = await computeCanonicalJsonDigest({
        digestDomain: TOOL_EXPOSURE_DIGEST_DOMAIN,
        toolComponentId,
        operationId,
        declaredExposure: 'declaredExposure' in operation ? operation.declaredExposure : null,
        caller,
    }, port);
    // ---- PHASE 3: trusted policy decision over module-owned snapshots, then mint.
    const decision = policy.decideAdmission({ operation, caller });
    if (typeof decision !== 'object' ||
        decision === null ||
        typeof decision.admitted !== 'boolean') {
        fail('INVALID_EXPOSURE_POLICY', 'policy.decideAdmission must return { admitted: boolean, reason?: string }');
    }
    if (!decision.admitted) {
        const reason = decision.reason;
        fail('EXPOSURE_NOT_ADMITTED', `exposure admission was denied by the policy${typeof reason === 'string' && reason.length > 0 ? `: ${reason}` : ''}`);
    }
    const evidence = Object.freeze({
        status: 'ADMITTED',
        toolComponentId,
        operationId,
        caller,
        definitionGraphDigest: currentGraphDigest,
        assemblyDigest: assembly.assemblyDigest,
        exposureDigest,
        [ADMITTED_EXPOSURE_BRAND]: true,
    });
    ADMITTED_EXPOSURE_MINTS.add(evidence);
    return evidence;
}
// ---------------------------------------------------------------------------
// admitToolInvocationRequest — the request-admission boundary (PACK-A)
// ---------------------------------------------------------------------------
/**
 * Admit one generic caller-neutral invocation request against the exact
 * current state.
 *
 * Deterministic fail-closed precedence: options/input shape, exact
 * identities, portable JSON input, caller contract, digest formats, Assembly
 * identity shape, exposure minting authority, exposure/request binding and
 * caller consistency, graph validation (propagated unchanged), Tool binding
 * resolution and declaration validation (propagated unchanged), operation
 * existence, then async digest recomputation, then currentness failures —
 * tampered Assembly identity, stale Definition, stale Assembly claim, stale
 * exposure — and finally the mint.
 *
 * Torn-snapshot discipline: the request material is descriptor-safe validated
 * and snapshotted synchronously before the first `await`; only module-owned
 * snapshots and the trusted #555 digest seam are read after any suspension.
 * The minted admitted request is deeply frozen and never aliases caller-owned
 * state. REQUEST_ADMITTED=YES, DISPATCH_AUTHORITY=NO, EFFECT_AUTHORITY=NO.
 */
export async function admitToolInvocationRequest(request, options, sha256) {
    const port = requireSha256Port(sha256, 'sha256');
    // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
    const optionsView = requireSafeRecord(options, 'invocation admission options', 'INVALID_INVOCATION_INPUT');
    const unexpectedOptionField = Object.keys(optionsView).find((key) => key !== 'assembly' && key !== 'currentDefinitionGraph');
    if (unexpectedOptionField !== undefined) {
        fail('INVALID_INVOCATION_INPUT', `invocation admission options must contain exactly {assembly, currentDefinitionGraph}; unexpected field "${unexpectedOptionField}"`);
    }
    if (!('assembly' in optionsView) || optionsView.assembly === undefined) {
        fail('INVALID_INVOCATION_INPUT', 'invocation admission options.assembly is required');
    }
    if (!('currentDefinitionGraph' in optionsView) || optionsView.currentDefinitionGraph === undefined) {
        fail('INVALID_INVOCATION_INPUT', 'invocation admission options.currentDefinitionGraph is required');
    }
    const view = requireSafeRecord(request, 'tool invocation request', 'INVALID_INVOCATION_REQUEST');
    const unexpectedRequestField = Object.keys(view).find((key) => !REQUEST_FIELDS.has(key));
    if (unexpectedRequestField !== undefined) {
        fail('INVALID_INVOCATION_REQUEST', `tool invocation request must contain exactly {toolComponentId, operationId, input, caller, definitionGraphDigest, assemblyDigest, exposure}; unexpected field "${unexpectedRequestField}"`);
    }
    for (const required of ['toolComponentId', 'operationId', 'input', 'caller', 'definitionGraphDigest', 'assemblyDigest', 'exposure']) {
        if (!(required in view)) {
            fail('INVALID_INVOCATION_REQUEST', `tool invocation request.${required} is required`);
        }
    }
    const toolComponentId = requireExactIdentity(view.toolComponentId, 'tool invocation request.toolComponentId', 'INVALID_INVOCATION_REQUEST');
    const operationId = requireExactIdentity(view.operationId, 'tool invocation request.operationId', 'INVALID_INVOCATION_REQUEST');
    const input = requireJsonMaterial(view.input, 'tool invocation request.input', 'INVALID_INVOCATION_REQUEST');
    const { canonical: callerCanonical } = snapshotCaller(view.caller, 'tool invocation request.caller', 'INVALID_INVOCATION_CALLER');
    if (!isContentDigest(view.definitionGraphDigest)) {
        fail('INVALID_INVOCATION_REQUEST', 'tool invocation request.definitionGraphDigest must be a non-empty content digest string');
    }
    if (!isContentDigest(view.assemblyDigest)) {
        fail('INVALID_INVOCATION_REQUEST', 'tool invocation request.assemblyDigest must be a non-empty content digest string');
    }
    const assembly = requireAssemblyIdentity(optionsView.assembly, 'invocation admission options.assembly');
    // Anti-forgery boundary: a caller-constructed evidence object can never
    // carry the minting registry membership, even with byte-perfect public
    // digest material (#601 posture, applied from the start).
    if (!isAdmittedExposure(view.exposure)) {
        fail('FORGED_EXPOSURE_EVIDENCE', 'tool invocation request.exposure must be AdmittedToolExposure minted by admitToolExposure; a caller-constructed evidence object can never carry the minting brand and registry membership');
    }
    const exposure = view.exposure;
    // Evidence/request consistency — synchronous shape-level checks: evidence
    // can never be transferred across targets or callers.
    if (exposure.toolComponentId !== toolComponentId || exposure.operationId !== operationId) {
        fail('INVOCATION_BINDING_MISMATCH', 'the admitted exposure evidence binds a different Tool Component or operation than the request; evidence cannot be transferred across targets');
    }
    if (canonicalJsonStringify(exposure.caller) !== callerCanonical) {
        fail('INVOCATION_CALLER_MISMATCH', 'tool invocation request.caller does not match the caller context bound in the admitted exposure evidence; a caller cannot ride on evidence minted for a different caller');
    }
    const graph = optionsView.currentDefinitionGraph;
    // Graph envelope failures propagate the original DefinitionGraphContractError.
    validateDefinitionGraphEnvelope(graph);
    const bound = requireToolComponentBinding(graph, toolComponentId);
    if (bound.family !== 'tool') {
        fail('INVALID_TOOL_INVOCATION_TARGET', `Component "${toolComponentId}" is family "${bound.family}" and can never be a Tool invocation target`);
    }
    // Tool declaration failures propagate the original ToolComponentContractError.
    validateToolComponent(bound);
    const operation = snapshotOperation(bound, toolComponentId, operationId);
    // ---- PHASE 2 (async): authoritative recomputation over trusted seams only.
    const currentGraphDigest = await computeDefinitionGraphDigest(graph, port);
    const recomputedAssemblyDigest = await computeCanonicalJsonDigest(assembly.record, port);
    // ---- PHASE 3: fail-closed currentness and consistency, then mint.
    if (recomputedAssemblyDigest !== assembly.assemblyDigest) {
        fail('ASSEMBLY_DIGEST_MISMATCH', 'the sealed Assembly record digest authoritatively recomputed from the supplied record does not match its claimed assemblyDigest; tampered or inconsistent Assembly identity fails closed');
    }
    if (currentGraphDigest !== assembly.definitionGraphDigest) {
        fail('DEFINITION_CURRENTNESS_MISMATCH', 'the current Definition graph digest does not match the exact digest bound in the sealed Assembly; stale Definition fails closed before any dispatch');
    }
    if (view.definitionGraphDigest !== currentGraphDigest) {
        fail('DEFINITION_CURRENTNESS_MISMATCH', 'tool invocation request.definitionGraphDigest does not match the authoritatively recomputed current Definition graph digest; stale request claims fail closed before any dispatch');
    }
    if (view.assemblyDigest !== assembly.assemblyDigest) {
        fail('ASSEMBLY_CURRENTNESS_MISMATCH', 'tool invocation request.assemblyDigest does not match the exact sealed Assembly digest; stale Assembly claims fail closed before any dispatch');
    }
    // Exposure currentness: evidence binds the exact digests current at mint
    // time; any drift of Definition or Assembly since then fails closed.
    if (exposure.definitionGraphDigest !== currentGraphDigest ||
        exposure.assemblyDigest !== assembly.assemblyDigest) {
        fail('EXPOSURE_CURRENTNESS_MISMATCH', 'the admitted exposure evidence is bound to older exact state than the current Definition/Assembly; stale exposure fails closed before any dispatch');
    }
    const admitted = Object.freeze({
        status: 'ADMITTED',
        toolComponentId,
        operationId,
        input: deepFreezeValue(input),
        caller: exposure.caller,
        operationEffect: operation.effect,
        definitionGraphDigest: currentGraphDigest,
        assemblyDigest: assembly.assemblyDigest,
        exposure,
    });
    return admitted;
}
//# sourceMappingURL=invocation-request.js.map