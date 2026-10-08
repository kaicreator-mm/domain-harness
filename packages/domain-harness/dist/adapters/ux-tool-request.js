import { computeDefinitionGraphDigest, validateDefinitionGraphEnvelope, } from '../contracts/definition-graph.js';
import { canonicalJsonStringify, } from '../contracts/identity.js';
import { admitToolExposure, admitToolInvocationRequest, } from '../contracts/invocation-request.js';
import { invokeNonEffectfulTool, } from '../contracts/non-effectful-invocation.js';
import { invokeEffectfulTool, } from '../contracts/effectful-invocation.js';
import { validateToolComponent, } from '../contracts/tool-component.js';
import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeArraySnapshot, safeRecordSnapshot, } from '../contracts/record-safety.js';
export class UxToolRequestError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'UxToolRequestError';
        this.code = code;
    }
}
/** The fixed caller-plane provenance kind this adapter stamps on its generic
 * caller contexts. Provenance only — the kernel never branches on it. */
export const UX_CALLER_KIND = 'ux';
// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------
function fail(code, message) {
    throw new UxToolRequestError(code, message);
}
/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(value, description) {
    const result = safeRecordSnapshot(value, description);
    if (!result.ok) {
        fail('INVALID_UX_REQUEST_INPUT', `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
/** Snapshot one authority-bearing array, mapping descriptor issues to a typed failure. */
function requireSafeArray(value, description) {
    const result = safeArraySnapshot(value, description);
    if (!result.ok) {
        fail('INVALID_UX_REQUEST_INPUT', `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
function requireSha256Port(value, path) {
    if (typeof value !== 'object' ||
        value === null ||
        typeof value.digestUtf8 !== 'function') {
        fail('INVALID_UX_REQUEST_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
    }
    return value;
}
/**
 * Exact identity string: non-empty and free of floating tokens, range
 * operators and embedded `id@selector` forms — never normalized.
 */
function requireExactIdentity(value, path) {
    if (typeof value !== 'string') {
        fail('INVALID_UX_REQUEST_INPUT', `${path} must be a string`);
    }
    if (!isNonEmptyIdentityString(value)) {
        fail('INVALID_UX_REQUEST_INPUT', `${path} must be a non-empty exact identity`);
    }
    if (carriesEmbeddedSelector(value) || carriesFloatingOrRangeSemantics(value)) {
        fail('INVALID_UX_REQUEST_INPUT', `${path} must be an exact identity, not a floating/range selector or embedded \`id@version\` form (latest/current/active/default/*/x/range)`);
    }
    return value;
}
/** Validate one portable-JSON material field, returning a canonical deep copy. */
function requireJsonMaterial(value, path) {
    try {
        return JSON.parse(canonicalJsonStringify(value));
    }
    catch {
        fail('INVALID_UX_REQUEST_INPUT', `${path} must be portable JSON material`);
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
 * Read one own DATA property without invoking hidden getters (branded/frozen
 * contract objects the descriptor-safe record snapshot cannot consume
 * directly).
 */
function readOwnDataProperty(value, key, description) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
        fail('INVALID_UX_REQUEST_INPUT', `${description}.${key} is required`);
    }
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
        fail('INVALID_UX_REQUEST_INPUT', `${description}.${key} must be a data property, not accessor-backed`);
    }
    return descriptor.value;
}
/**
 * The UX-plane exposure rule: the operation's exact current declarative
 * `declaredExposure` material is a record whose `audiences` list contains the
 * exact `ux` audience. Declarative-only input to the admission decision —
 * never a substitute for it (the T004A-owned policy seam decides over exact
 * current state on every admission).
 */
function operationExposedToUx(operation) {
    const exposure = operation.declaredExposure;
    if (typeof exposure !== 'object' || exposure === null || Array.isArray(exposure)) {
        return false;
    }
    const audiences = exposure['audiences'];
    return Array.isArray(audiences) && audiences.includes(UX_CALLER_KIND);
}
/**
 * The FIXED UX-plane exposure admission policy consumed by the T004A seam.
 * Module-internal by construction (#703: T004E MUST NOT expose a UX-supplied
 * ToolExposureAdmissionPolicy): no input field of either seam can select,
 * replace or mint it. Stateless: every decision runs over the descriptor-safe
 * operation snapshot of the exact current graph supplied by
 * `admitToolExposure`.
 */
const UX_PLANE_EXPOSURE_POLICY = Object.freeze({
    decideAdmission(query) {
        if (operationExposedToUx(query.operation)) {
            return { admitted: true };
        }
        return {
            admitted: false,
            reason: 'the operation exposure material of the exact current contract does not admit the ux audience',
        };
    },
});
// ---------------------------------------------------------------------------
// Shared seam input snapshots
// ---------------------------------------------------------------------------
const QUERY_INPUT_FIELDS = new Set([
    'uxSessionId',
    'toolComponentId',
    'operationId',
    'input',
    'expectedDefinitionGraphDigest',
    'binding',
    'currentDefinitionGraph',
    'dispatch',
    'resourceProvider',
    'sha256',
]);
const EFFECTFUL_INPUT_FIELDS = new Set([
    'uxSessionId',
    'toolComponentId',
    'operationId',
    'input',
    'expectedDefinitionGraphDigest',
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
/**
 * Synchronously validate the shared seam material against the seam's
 * closed-world input field set: any unexpected field — occurrence, journal,
 * admission evidence, pin, handle or other authority lookalike — refuses
 * typed BEFORE any admission or dispatch, and hostile accessors/prototypes
 * are rejected by the descriptor-safe snapshot itself.
 */
function snapshotSeamInput(input, fields, label) {
    const view = requireSafeRecord(input, `${label} input`);
    const unexpectedField = Object.keys(view).find((key) => !fields.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_UX_REQUEST_INPUT', `${label} input must contain exactly {${[...fields].join(', ')}}; unexpected field "${unexpectedField}" (no occurrence, journal, admission-evidence, pin, handle or effect-routing material is representable)`);
    }
    return view;
}
/**
 * Resolve one UX-targeted operation against the EXACT current Definition
 * graph: the Tool Component must be bound, the operation must be declared,
 * its exact current declarative exposure must admit the `ux` audience, and
 * its frozen effect class is returned for the seam's routing gate. Every
 * classification is derived from exact current state — never from UX
 * material.
 */
function resolveCurrentUxOperation(graph, toolComponentId, operationId) {
    const component = graph.components.find((entry) => entry.family === 'tool' && entry.componentId === toolComponentId);
    if (component === undefined) {
        fail('UX_OPERATION_NOT_EXPOSED', `Tool Component "${toolComponentId}" is not bound in the exact current Definition graph; operations without an exact bound target are invisible to the UX plane and refuse before any admission or dispatch`);
    }
    // Tool declaration failures propagate the original ToolComponentContractError.
    validateToolComponent(component);
    const body = requireSafeRecord(component.semanticBody, `Tool Component "${component.componentId}" semanticBody`);
    const declared = requireSafeArray(body['operations'], `Tool Component "${component.componentId}" operations`);
    const match = declared.find((candidate) => {
        const view = requireSafeRecord(candidate, `Tool Component "${component.componentId}" operation`);
        return view['operationId'] === operationId;
    });
    if (match === undefined) {
        fail('UX_OPERATION_NOT_EXPOSED', `operation "${operationId}" is not declared by Tool Component "${toolComponentId}" in the exact current Definition graph; unknown operations refuse before any admission or dispatch`);
    }
    const operation = requireSafeRecord(match, `Tool Component "${component.componentId}" operation "${operationId}"`);
    if (!operationExposedToUx({ declaredExposure: operation['declaredExposure'] })) {
        fail('UX_OPERATION_NOT_EXPOSED', `operation "${operationId}" of Tool Component "${toolComponentId}" is not exposed to the ux audience by the exact current contract; non-exposed operations are invisible to the UX plane and refuse before any admission or dispatch`);
    }
    return { effect: operation['effect'] };
}
/**
 * Shared synchronous seam gate: closed-world shape, exact identities,
 * portable-JSON input snapshot, the UX-claimed current graph digest, and the
 * seam routing gate over the effect class derived from the EXACT current
 * graph (`requireEffectNone` routes the pure seam; its inverse routes the
 * effectful seam). All refusal happens BEFORE any admission or dispatch.
 */
function requireUxSeamSnapshot(view, requiredFields, label, requireEffectNone) {
    for (const required of requiredFields) {
        if (!(required in view) || view[required] === undefined) {
            fail('INVALID_UX_REQUEST_INPUT', `${label} input.${required} is required`);
        }
    }
    const uxSessionId = requireExactIdentity(view['uxSessionId'], `${label} input.uxSessionId`);
    const toolComponentId = requireExactIdentity(view['toolComponentId'], `${label} input.toolComponentId`);
    const operationId = requireExactIdentity(view['operationId'], `${label} input.operationId`);
    const input = requireJsonMaterial(view['input'], `${label} input.input`);
    const expectedDefinitionGraphDigest = requireExactIdentity(view['expectedDefinitionGraphDigest'], `${label} input.expectedDefinitionGraphDigest`);
    const graph = view['currentDefinitionGraph'];
    const sha256 = requireSha256Port(view['sha256'], `${label} input.sha256`);
    const { effect } = resolveCurrentUxOperation(graph, toolComponentId, operationId);
    if (requireEffectNone && effect !== 'none') {
        fail('UX_MUTATION_REFUSED', `operation "${operationId}" of Tool Component "${toolComponentId}" is classified "${effect}" and is mutation-capable; the UX query seam invokes only effect=none operations and refuses mutation before any admission or dispatch — mutation-capable intent must enter the generic T004A request and route through the T004C authoritative occurrence / Central Admission path (no UX mutation shortcut exists)`);
    }
    if (!requireEffectNone && effect === 'none') {
        fail('UX_EFFECTLESS_OPERATION_REFUSED', `operation "${operationId}" of Tool Component "${toolComponentId}" is classified "none" and is not mutation-capable; the UX effectful seam accepts only mutation-capable intent and refuses effectless operations before any admission — observational use belongs to the UX query seam`);
    }
    const caller = deepFreezeValue({
        callerId: uxSessionId,
        callerKind: UX_CALLER_KIND,
    });
    return {
        uxSessionId,
        toolComponentId,
        operationId,
        input,
        expectedDefinitionGraphDigest,
        caller,
        graph,
        sha256,
        effect,
    };
}
/**
 * Authoritatively verify the UX-claimed currentness BEFORE any generic
 * admission: the exact current Definition graph digest is recomputed and must
 * equal the digest claimed by the UX request. Any drift means the UX intent
 * was shaped against older state and can never authorize or route current
 * execution — fail closed, no rebind, no latest/default fallback.
 */
async function requireUxRequestFresh(seam) {
    const currentDigest = await computeDefinitionGraphDigest(seam.graph, seam.sha256);
    if (currentDigest !== seam.expectedDefinitionGraphDigest) {
        fail('UX_REQUEST_STALE', 'the exact current Definition graph digest no longer matches the digest claimed by the UX request; the UX intent describes older state and can never authorize current execution — re-shape the intent against the exact current graph');
    }
}
/** Snapshot the dispatch binding's successor Assembly reference (read-only). */
function snapshotBindingAnchor(binding) {
    if (typeof binding !== 'object' || binding === null) {
        fail('INVALID_UX_REQUEST_INPUT', 'seam input.binding must be the T003C sealed Tool implementation binding object');
    }
    const successorAssembly = readOwnDataProperty(binding, 'successorAssembly', 'seam input.binding');
    if (typeof successorAssembly !== 'object' || successorAssembly === null) {
        fail('INVALID_UX_REQUEST_INPUT', 'seam input.binding.successorAssembly must be the sealed successor Runtime Assembly object');
    }
    // Provenance of the sealed Assembly object itself is re-proved downstream by
    // the consumed T004A/T004B/T004C seams (T002B mint verifier) before any
    // dispatch or effect.
    return successorAssembly;
}
/** Validate one injected dispatch port (T004B or T004C calling convention). */
function requireDispatchPort(value, path) {
    if (typeof value !== 'object' ||
        value === null ||
        typeof value.dispatch !== 'function') {
        fail('INVALID_UX_REQUEST_INPUT', `${path} must be a Tool dispatch port ({ dispatch(query): Promise<unknown> })`);
    }
    return value;
}
/** Validate the optional injected T005B resource provider. */
function requireResourceProviderField(view, label) {
    const candidate = view['resourceProvider'];
    if (candidate === undefined) {
        return undefined;
    }
    if (typeof candidate !== 'object' ||
        candidate === null ||
        typeof candidate.resolve !== 'function') {
        fail('INVALID_UX_REQUEST_INPUT', `${label} input.resourceProvider must be a ResourceProvider ({ resolve(request): Promise<ResourceProviderResponse> })`);
    }
    return candidate;
}
/**
 * Invoke ONE ux-exposed, effect=none operation through the generic
 * T004A -> T004B path.
 *
 * Deterministic fail-closed precedence, every refusal BEFORE any dispatch:
 * closed-world input shape (no occurrence/journal/admission/evidence field is
 * representable), exact identities, portable-JSON input snapshot, membership
 * + exposure gate (UX_OPERATION_NOT_EXPOSED) and the query-only effect gate
 * (UX_MUTATION_REFUSED) — all synchronous, all derived from the EXACT current
 * graph — then UX currentness (UX_REQUEST_STALE), then the generic T004A
 * exposure admission over the exact current state (policy decision over the
 * exact current contract; typed failures propagate unchanged), the T004A
 * request admission, and finally the T004B effect=none invocation, which
 * independently re-admits the request, re-derives the effect class, verifies
 * the T003C binding and dispatches only the verified handle. The returned
 * result is the T004B OBSERVED-only outcome: UX may project it but can never
 * rewrite, upgrade or substitute it as business/runtime truth.
 */
export async function queryUxTool(input) {
    // ---- PHASE 1 (synchronous): validate, snapshot and gate all material.
    const view = snapshotSeamInput(input, QUERY_INPUT_FIELDS, 'ux tool query');
    const seam = requireUxSeamSnapshot(view, ['uxSessionId', 'toolComponentId', 'operationId', 'input', 'expectedDefinitionGraphDigest', 'binding', 'currentDefinitionGraph', 'dispatch', 'sha256'], 'ux tool query', true);
    const anchor = snapshotBindingAnchor(view['binding']);
    const resourceProvider = requireResourceProviderField(view, 'ux tool query');
    const dispatch = requireDispatchPort(view['dispatch'], 'ux tool query input.dispatch');
    // Graph envelope failures propagate the original DefinitionGraphContractError.
    validateDefinitionGraphEnvelope(seam.graph);
    // ---- PHASE 2 (async): UX currentness, then the generic T004A seam.
    await requireUxRequestFresh(seam);
    const exposure = await admitToolExposure({
        toolComponentId: seam.toolComponentId,
        operationId: seam.operationId,
        caller: seam.caller,
        assembly: anchor,
        currentDefinitionGraph: seam.graph,
        policy: UX_PLANE_EXPOSURE_POLICY,
    }, seam.sha256);
    const admitted = await admitToolInvocationRequest({
        toolComponentId: seam.toolComponentId,
        operationId: seam.operationId,
        input: seam.input,
        caller: seam.caller,
        definitionGraphDigest: exposure.definitionGraphDigest,
        assemblyDigest: exposure.assemblyDigest,
        exposure,
    }, { assembly: anchor, currentDefinitionGraph: seam.graph }, seam.sha256);
    // ---- PHASE 3: the generic T004B effect=none path — the only dispatch this
    // seam can ever reach, and only for the exact verified binding handle.
    return await invokeNonEffectfulTool({
        request: admitted,
        binding: view['binding'],
        currentDefinitionGraph: seam.graph,
        dispatch: dispatch,
        ...(resourceProvider === undefined ? {} : { resourceProvider }),
        sha256: seam.sha256,
    });
}
/**
 * Route ONE ux-exposed, mutation-capable intent through the generic
 * T004A -> T004C path exactly once.
 *
 * Deterministic fail-closed precedence, every refusal BEFORE any admission
 * or effect: closed-world input shape (no occurrence/journal/admission-
 * evidence field is representable on the UX material), exact identities,
 * portable-JSON input snapshot, membership + exposure gate
 * (UX_OPERATION_NOT_EXPOSED), the mutation-capable effect gate
 * (UX_EFFECTLESS_OPERATION_REFUSED — effect classification is re-derived
 * from the EXACT current graph, never trusted from UX material) — all
 * synchronous — then UX currentness (UX_REQUEST_STALE), then the generic
 * T004A exposure admission (policy decision over the exact current contract)
 * and request admission (typed failures propagate unchanged). The admitted
 * generic request is then routed through the accepted T004C seam exactly
 * once, against the already-authoritative occurrence / Central Admission
 * material supplied by trusted host composition: exactly one existing
 * Central Admission record results. No T004B/query fallback exists, and the
 * returned result reflects the existing authoritative T004C/Central
 * Admission outcome — UX may observe/project it but can never rewrite,
 * upgrade or substitute it as business/runtime truth.
 */
export async function invokeUxToolEffectfully(input) {
    // ---- PHASE 1 (synchronous): validate, snapshot and gate all material.
    const view = snapshotSeamInput(input, EFFECTFUL_INPUT_FIELDS, 'ux tool effectful');
    const seam = requireUxSeamSnapshot(view, ['uxSessionId', 'toolComponentId', 'operationId', 'input', 'expectedDefinitionGraphDigest', 'binding', 'currentDefinitionGraph', 'activator', 'admissionRequest', 'admissionPorts', 'effectType', 'dispatch', 'sha256'], 'ux tool effectful', false);
    const anchor = snapshotBindingAnchor(view['binding']);
    const resourceProvider = requireResourceProviderField(view, 'ux tool effectful');
    const dispatch = requireDispatchPort(view['dispatch'], 'ux tool effectful input.dispatch');
    const activator = view['activator'];
    if (typeof activator !== 'object' || activator === null) {
        fail('INVALID_UX_REQUEST_INPUT', 'ux tool effectful input.activator must be the accepted AssemblyExecutionActivator object (trusted host composition input)');
    }
    const admissionRequest = view['admissionRequest'];
    if (typeof admissionRequest !== 'object' || admissionRequest === null) {
        fail('INVALID_UX_REQUEST_INPUT', 'ux tool effectful input.admissionRequest must be the CentralAdmissionRequest turn material of the already-authoritative occurrence (trusted host composition input)');
    }
    const admissionPorts = requireSafeRecord(view['admissionPorts'], 'ux tool effectful input.admissionPorts');
    for (const required of ['governance', 'baselines', 'effectJournal']) {
        if (!(required in admissionPorts) || admissionPorts[required] === undefined) {
            fail('INVALID_UX_REQUEST_INPUT', `ux tool effectful input.admissionPorts.${required} is required (Central Admission ports are trusted host composition input; the effect-tools port is installed only inside the T004C owner)`);
        }
    }
    const effectType = requireExactIdentity(view['effectType'], 'ux tool effectful input.effectType');
    // Graph envelope failures propagate the original DefinitionGraphContractError.
    validateDefinitionGraphEnvelope(seam.graph);
    // ---- PHASE 2 (async): UX currentness, then the generic T004A seam.
    await requireUxRequestFresh(seam);
    const exposure = await admitToolExposure({
        toolComponentId: seam.toolComponentId,
        operationId: seam.operationId,
        caller: seam.caller,
        assembly: anchor,
        currentDefinitionGraph: seam.graph,
        policy: UX_PLANE_EXPOSURE_POLICY,
    }, seam.sha256);
    const admitted = await admitToolInvocationRequest({
        toolComponentId: seam.toolComponentId,
        operationId: seam.operationId,
        input: seam.input,
        caller: seam.caller,
        definitionGraphDigest: exposure.definitionGraphDigest,
        assemblyDigest: exposure.assemblyDigest,
        exposure,
    }, { assembly: anchor, currentDefinitionGraph: seam.graph }, seam.sha256);
    // ---- PHASE 3: the generic T004C effectful path exactly once — the only
    // effect this seam can ever produce, under the host-supplied authoritative
    // occurrence and the ONE existing Central Admission path.
    return await invokeEffectfulTool({
        request: admitted,
        binding: view['binding'],
        currentDefinitionGraph: seam.graph,
        activator: activator,
        admissionRequest: admissionRequest,
        admissionPorts: view['admissionPorts'],
        effectType,
        dispatch: dispatch,
        ...(resourceProvider === undefined ? {} : { resourceProvider }),
        sha256: seam.sha256,
    });
}
//# sourceMappingURL=ux-tool-request.js.map