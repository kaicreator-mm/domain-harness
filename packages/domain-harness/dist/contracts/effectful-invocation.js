import { canonicalJsonStringify, isContentDigest, } from './identity.js';
import { isSealedRuntimeAssembly, } from './runtime-assembly.js';
import { admitToolInvocationRequest, } from './invocation-request.js';
import { resolveToolResources, } from './resource-resolution.js';
import { verifyToolImplementationBinding, } from './tool-implementation-binding.js';
import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeArraySnapshot, safeRecordSnapshot, } from './record-safety.js';
import { admitCentralDecision } from '../admission/admission.js';
export class EffectfulInvocationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'EffectfulInvocationError';
        this.code = code;
    }
}
// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------
function fail(code, message) {
    throw new EffectfulInvocationError(code, message);
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
    'activator',
    'admissionRequest',
    'admissionPorts',
    'effectType',
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
const ADMISSION_REQUEST_FIELDS = new Set([
    'target',
    'turn',
    'trigger',
    'workflowInstanceId',
    'definition',
    'currentStateKey',
    'context',
    'event',
    'resolved',
    'decisionSchema',
    'now',
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
/** Validate one portable-JSON material field, returning a canonical deep copy. */
function requireJsonMaterial(value, path, code) {
    try {
        return JSON.parse(canonicalJsonStringify(value));
    }
    catch {
        fail(code, `${path} must be portable JSON material`);
    }
}
/**
 * Synchronously validate and snapshot the occurrence identity carried by the
 * admission turn material. The occurrence is CONSUMED, never minted: these
 * exact identity fields are the only occurrence material this module relies
 * on, so they are snapshotted before the first `await` and the admission
 * request is reconstructed over the snapshot — a caller mutating its own turn
 * material mid-flight can never redirect the effect to a fresh occurrence or
 * effect namespace.
 */
function snapshotOccurrenceIdentity(value) {
    const at = 'invocation input.admissionRequest';
    const view = requireSafeRecord(value, at, 'INVALID_INVOCATION_INPUT');
    const unexpectedField = Object.keys(view).find((key) => !ADMISSION_REQUEST_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_INVOCATION_INPUT', `${at} must contain exactly the CentralAdmissionRequest fields; unexpected field "${unexpectedField}"`);
    }
    for (const required of ADMISSION_REQUEST_FIELDS) {
        if (!(required in view)) {
            fail('INVALID_INVOCATION_INPUT', `${at}.${required} is required`);
        }
    }
    const targetView = requireSafeRecord(view.target, `${at}.target`, 'INVALID_INVOCATION_INPUT');
    const targetKeys = Object.keys(targetView).sort();
    if (targetKeys.length !== 2 || targetKeys[0] !== 'instanceKey' || targetKeys[1] !== 'workflowId') {
        fail('INVALID_INVOCATION_INPUT', `${at}.target must contain exactly {workflowId, instanceKey}`);
    }
    const workflowId = requireExactIdentity(targetView.workflowId, `${at}.target.workflowId`, 'INVALID_INVOCATION_INPUT');
    const instanceKey = requireExactIdentity(targetView.instanceKey, `${at}.target.instanceKey`, 'INVALID_INVOCATION_INPUT');
    const turn = deepFreezeValue(requireJsonMaterial(view.turn, `${at}.turn`, 'INVALID_INVOCATION_INPUT'));
    const workflowInstanceId = requireExactIdentity(view.workflowInstanceId, `${at}.workflowInstanceId`, 'INVALID_INVOCATION_INPUT');
    const now = requireExactIdentity(view.now, `${at}.now`, 'INVALID_INVOCATION_INPUT');
    return {
        target: Object.freeze({ workflowId, instanceKey }),
        turn,
        workflowInstanceId,
        now,
    };
}
/**
 * Synchronously snapshot the dispatch anchor and prove its provenance. The
 * dispatch anchor is the binding's OWN successor Assembly — the exact
 * contextual Assembly pin; there is no separate assembly input, no global
 * current Assembly owner and no other repair.
 *
 * The anchor's provenance is decided by the accepted T002B-owned
 * `isSealedRuntimeAssembly` mint verifier consumed DIRECTLY over this exact
 * object. A self-consistent content forgery — never passed through
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
// Port shape checks (fail closed before any owner seam runs)
// ---------------------------------------------------------------------------
function requireDispatchPort(value) {
    if (typeof value !== 'object' ||
        value === null ||
        typeof value.dispatch !== 'function') {
        fail('INVALID_TOOL_DISPATCH_PORT', 'effectful invocation input.dispatch must be an EffectfulToolDispatchPort ({ dispatch({ handle, operationId, input, resources, effectId, durableControlTurnId, operationOrdinal, effectType, idempotencyKey?, logicalTime }): Promise<unknown> })');
    }
    return value;
}
function requireActivator(value) {
    if (typeof value !== 'object' ||
        value === null ||
        typeof value.requireProductionEffectAuthority !== 'function' ||
        typeof value.requireResourceCurrentness !== 'function') {
        fail('INVALID_INVOCATION_INPUT', 'effectful invocation input.activator must be the accepted AssemblyExecutionActivator (the T002C/T002D/T005C occurrence-pin gates are consumed, never re-owned)');
    }
    return value;
}
function requireAdmissionPorts(value) {
    const view = requireSafeRecord(value, 'invocation input.admissionPorts', 'INVALID_INVOCATION_INPUT');
    const unexpectedField = Object.keys(view).find((key) => key !== 'governance' && key !== 'baselines' && key !== 'effectJournal');
    if (unexpectedField !== undefined) {
        fail('INVALID_INVOCATION_INPUT', `invocation input.admissionPorts must contain exactly {governance, baselines, effectJournal}; unexpected field "${unexpectedField}" (the effect-tools port is not caller-expressible — this module installs the only verified-binding adapter)`);
    }
    const governance = view.governance;
    if (typeof governance !== 'object' ||
        governance === null ||
        typeof governance.requirePinnedExecution !== 'function') {
        fail('INVALID_INVOCATION_INPUT', 'invocation input.admissionPorts.governance must be the GovernanceExecutionCoordinator port');
    }
    const baselines = view.baselines;
    if (typeof baselines !== 'object' ||
        baselines === null ||
        typeof baselines.getBody !== 'function') {
        fail('INVALID_INVOCATION_INPUT', 'invocation input.admissionPorts.baselines must be the GovernanceBaselineStore port');
    }
    const effectJournal = view.effectJournal;
    if (typeof effectJournal !== 'object' || effectJournal === null) {
        fail('INVALID_INVOCATION_INPUT', 'invocation input.admissionPorts.effectJournal must be the existing AdmissionDurableEffectJournal port');
    }
    return {
        governance: governance,
        baselines: baselines,
        effectJournal: effectJournal,
    };
}
// ---------------------------------------------------------------------------
// invokeEffectfulTool — the effectful dispatch boundary (PACK-C T004C)
// ---------------------------------------------------------------------------
/**
 * Route ONE admitted effectful Tool invocation onto an already-authoritative
 * occurrence through the ONE existing Central Admission effect path.
 *
 * Deterministic fail-closed precedence, every gate BEFORE any side effect:
 * input shape + port shapes + request/occurrence-identity snapshots and the
 * dispatch-anchor snapshot (where the directly consumed T002B mint verifier
 * decides the final Assembly's provenance, ASSEMBLY_PROVENANCE_UNVERIFIED) —
 * all synchronous; then the T004A re-admission over the exact current state
 * (typed failures propagate unchanged), the freshly derived effect-class gate
 * (EFFECTLESS_OPERATION_REJECTED), the T003C-owned binding verification whose
 * typed failures propagate unchanged, T004C-owned dispatch consistency over
 * the VERIFIED binding (INVALID_BINDING_EVIDENCE), the occurrence-pin gates on
 * the SAME activator (`requireProductionEffectAuthority` — exact PRODUCTION
 * class only — plus the module-owned occurrence/Assembly match), T005B
 * resource resolution + the T005C occurrence-currentness re-proof, and only
 * then the ONE existing Central Admission effect path with the only
 * verified-binding adapter. The Tool's own thrown failures flow through the
 * existing admission owner semantics — never caught, wrapped or converted
 * into an outcome by this module.
 *
 * Torn-snapshot discipline: every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted before the first `await`; after any
 * suspension only module-owned snapshot material, the frozen genuine-mint
 * anchor and the fresh frozen T003C-verified material are read — the
 * dispatched handle is the verifier-paired reference, never a re-read of
 * caller-owned state.
 */
export async function invokeEffectfulTool(input) {
    // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
    const view = requireSafeRecord(input, 'effectful invocation input', 'INVALID_INVOCATION_INPUT');
    const unexpectedInputField = Object.keys(view).find((key) => !INPUT_FIELDS.has(key));
    if (unexpectedInputField !== undefined) {
        fail('INVALID_INVOCATION_INPUT', `effectful invocation input must contain exactly {request, binding, currentDefinitionGraph, activator, admissionRequest, admissionPorts, effectType, dispatch, resourceProvider?, sha256}; unexpected field "${unexpectedInputField}" (no journal, occurrence-verdict, effect-authority or caller-minted pin material is representable)`);
    }
    for (const required of [
        'request',
        'binding',
        'currentDefinitionGraph',
        'activator',
        'admissionRequest',
        'admissionPorts',
        'effectType',
        'dispatch',
        'sha256',
    ]) {
        if (!(required in view) || view[required] === undefined) {
            fail('INVALID_INVOCATION_INPUT', `effectful invocation input.${required} is required`);
        }
    }
    const sha256 = requireSha256Port(view.sha256, 'effectful invocation input.sha256');
    const dispatchPort = requireDispatchPort(view.dispatch);
    const activator = requireActivator(view.activator);
    const ports = requireAdmissionPorts(view.admissionPorts);
    const effectType = requireExactIdentity(view.effectType, 'effectful invocation input.effectType', 'INVALID_INVOCATION_INPUT');
    const graph = view.currentDefinitionGraph;
    const request = snapshotRequest(view.request);
    const identity = snapshotOccurrenceIdentity(view.admissionRequest);
    const anchor = snapshotDispatchAnchor(view.binding, request);
    // ---- PHASE 2 (async): re-admission over the exact current state.
    //
    // The dispatch anchor is the binding's OWN successor Assembly: a request
    // admitted against any other Assembly fails currentness here, before any
    // effect. T004A typed failures propagate unchanged.
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
    // The effect-class gate runs on the FRESHLY DERIVED classification — never
    // on the caller-presented operationEffect. An effect=none operation belongs
    // to the T004B path and can never enter the effectful authority path.
    if (admitted.operationEffect === 'none') {
        fail('EFFECTLESS_OPERATION_REJECTED', `operation "${admitted.operationId}" of Tool Component "${admitted.toolComponentId}" is classified "none" and can never use the effectful path; effect=none operations route through the T004B non-effectful path — this module never dispatches them and never records a journal effect for them`);
    }
    // ---- T003C-owned binding verification BEFORE the opaque implementation
    // handle is paired and exposed. The verifier proves module-private mint
    // membership, re-verifies the accepted v1 bindingDigest over the evidence
    // material, and decides exact subject slot/currentness against the SAME
    // final sealed Assembly (the anchor). Its typed failures propagate
    // unchanged — this module never re-derives or re-owns those semantics.
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
        fail('INVALID_BINDING_EVIDENCE', 'the verified binding currentness is anchored to a different Definition graph digest than the authoritatively recomputed current digest; a stale binding fails closed before any effect');
    }
    if (verified.currentness.finalAssemblyDigest !== admitted.assemblyDigest) {
        fail('INVALID_BINDING_EVIDENCE', 'the verified binding currentness is anchored to a different final Assembly digest than the admitted request; a binding verified against another successor Assembly fails closed before any effect');
    }
    if (!evidence.supportedOperations.includes(admitted.operationId)) {
        fail('INVALID_BINDING_EVIDENCE', `the verified binding binds only operations (${evidence.supportedOperations.join(', ')}) and does not include the admitted operation "${admitted.operationId}"; the paired handle never dispatches outside the exact bound set`);
    }
    // ---- Occurrence pin gates (T002C/T002D/T005C) on the SAME activator: the
    // durable occurrence must carry an exact PRODUCTION authority class (a
    // SIMULATION, legacy class-less, unknown or malformed authority can never
    // satisfy production durable-effect authority — typed failures propagate
    // unchanged), and the pinned occurrence must be bound to the SAME final
    // sealed Assembly the invocation was re-proven against (bind-once: a
    // replaced Assembly never rides a pin bound to its predecessor).
    const pin = await activator.requireProductionEffectAuthority(identity.workflowInstanceId);
    if (pin.assemblyDigest !== admitted.assemblyDigest) {
        fail('OCCURRENCE_ASSEMBLY_MISMATCH', `the occurrence ${identity.workflowInstanceId} is pinned to Assembly ${String(pin.assemblyDigest)} but the admitted invocation was proven against final Assembly ${admitted.assemblyDigest}; a replaced Assembly can never ride a pinned occurrence — re-activation under the exact current Assembly is the only path (no overwrite, no alias)`);
    }
    // ---- Resources: only sealed-Assembly requirements are resolved, through
    // the T005B boundary, before dispatch (typed failures propagate unchanged).
    // The fresh T005C currentness pins are then re-proven against the SAME
    // occurrence pin through the accepted T005C gate — a stale, replaced or
    // missing exact resource revision fails closed BEFORE the effect.
    let resources;
    if (view.resourceProvider !== undefined) {
        const provider = view.resourceProvider;
        if (typeof provider !== 'object' ||
            provider === null ||
            typeof provider.resolve !== 'function') {
            fail('INVALID_INVOCATION_INPUT', 'effectful invocation input.resourceProvider must be a ResourceProvider ({ resolve(request): Promise<ResourceProviderResponse> })');
        }
        const resolved = await resolveToolResources({
            assembly: anchor.successorAssembly,
            componentId: admitted.toolComponentId,
            operationId: admitted.operationId,
            provider: provider,
        });
        resources = resolved.resources;
    }
    else if (anchor.applicableRequirementCount > 0) {
        fail('MISSING_RESOURCE_PROVIDER', `the sealed Assembly carries ${anchor.applicableRequirementCount} applicable resource requirement(s) for operation "${admitted.operationId}" of Tool Component "${admitted.toolComponentId}", but no ResourceProvider was injected; requirements fail closed before the effect — no ambient, default, or fallback resource exists`);
    }
    else {
        resources = new Map();
    }
    const freshEvidence = [];
    for (const entry of resources.values()) {
        if (entry.status === 'resolved' && entry.currentnessPin !== undefined) {
            freshEvidence.push({
                componentId: admitted.toolComponentId,
                providerId: entry.currentnessPin.providerId,
                resourceKey: entry.currentnessPin.resourceKey,
                revisionDigest: entry.currentnessPin.revisionDigest,
            });
        }
    }
    const pinnedEvidence = pin.resourceCurrentness;
    if (freshEvidence.length > 0 || (pinnedEvidence !== undefined && pinnedEvidence.length > 0)) {
        await activator.requireResourceCurrentness(identity.workflowInstanceId, freshEvidence);
    }
    // ---- PHASE 3: the ONE public effect-admission path (existing Central
    // Admission) with the ONLY verified-binding effect adapter. The caller
    // cannot express an effect-tools port, and the adapter performs no
    // independent implementation selection: it resolves ONLY the exact declared
    // effect type with the graph-derived effect semantics, and dispatches ONLY
    // the verified exact T003C handle.
    const operationEffect = admitted.operationEffect;
    const invocationEffectType = effectType;
    const verifiedHandle = verified.implementationHandle;
    const admittedInput = admitted.input;
    const admittedOperationId = admitted.operationId;
    const snapshottedTarget = identity.target;
    const snapshottedTargetCanonical = canonicalJsonStringify(snapshottedTarget);
    const admittedInputCanonical = canonicalJsonStringify(admittedInput);
    const effectTools = {
        resolve(candidateEffectType) {
            if (candidateEffectType !== invocationEffectType) {
                return undefined;
            }
            return { effectType: candidateEffectType, effectSemantics: operationEffect };
        },
        async execute(request) {
            // Intent-closure gate: the executed intent must realize exactly the
            // admitted invocation on the snapshotted occurrence. Any divergence
            // fails closed typed BEFORE the Tool dispatch runs.
            if (request.binding.effectType !== invocationEffectType) {
                fail('EFFECT_INTENT_MISMATCH', `the admission effect path executed effect type "${request.binding.effectType}" but this invocation admitted exactly "${invocationEffectType}"; an effect intent can never be silently substituted`);
            }
            if (canonicalJsonStringify(request.target) !== snapshottedTargetCanonical) {
                fail('EFFECT_INTENT_MISMATCH', 'the admission effect path executed on an occurrence target other than the snapshotted occurrence identity; an effect can never be redirected to a fresh occurrence namespace');
            }
            if (canonicalJsonStringify(request.input) !== admittedInputCanonical) {
                fail('EFFECT_INTENT_MISMATCH', `the admitted transition executes effect "${invocationEffectType}" with different input material than the re-admitted invocation request; the journaled durable effect must be exactly the admitted invocation, and a divergent intent fails closed before the Tool dispatch`);
            }
            // Dispatch ONLY the verified exact T003C handle. The Tool's own thrown
            // failures propagate through the existing admission owner semantics.
            return (await dispatchPort.dispatch({
                handle: verifiedHandle,
                operationId: admittedOperationId,
                input: request.input,
                resources,
                effectId: request.effectId,
                durableControlTurnId: request.durableControlTurnId,
                operationOrdinal: request.operationOrdinal,
                effectType: request.binding.effectType,
                ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
                logicalTime: request.logicalTime,
            }));
        },
    };
    // The admission request is reconstructed over the module-owned occurrence
    // identity snapshot; the remaining turn material is consumed by the
    // existing Central Admission owner under its own accepted posture.
    const admissionRequest = Object.freeze({
        ...view.admissionRequest,
        target: snapshottedTarget,
        turn: identity.turn,
        workflowInstanceId: identity.workflowInstanceId,
        now: identity.now,
    });
    const outcome = await admitCentralDecision(admissionRequest, {
        governance: ports.governance,
        baselines: ports.baselines,
        sha256,
        effectJournal: ports.effectJournal,
        effectTools,
    });
    return Object.freeze({
        outcome,
        occurrence: Object.freeze({
            workflowTarget: pin.workflowTarget,
            workflowInstanceId: pin.workflowInstanceId,
            // The consumed T002D gate guarantees the exact PRODUCTION class here.
            authorityClass: pin.authorityClass,
            pinBindingDigest: pin.bindingDigest,
            assemblyDigest: admitted.assemblyDigest,
        }),
        invocation: Object.freeze({
            toolComponentId: admitted.toolComponentId,
            operationId: admitted.operationId,
            effectType: invocationEffectType,
            effectSemantics: operationEffect,
            implementation: evidence.implementation,
            bindingDigest: evidence.bindingDigest,
            definitionGraphDigest: admitted.definitionGraphDigest,
        }),
    });
}
//# sourceMappingURL=effectful-invocation.js.map