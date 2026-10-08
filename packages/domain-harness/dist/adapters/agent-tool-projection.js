import { computeDefinitionGraphDigest, validateDefinitionGraphEnvelope, } from '../contracts/definition-graph.js';
import { canonicalJsonStringify, } from '../contracts/identity.js';
import { admitToolExposure, admitToolInvocationRequest, } from '../contracts/invocation-request.js';
import { invokeNonEffectfulTool, } from '../contracts/non-effectful-invocation.js';
import { validateToolComponent, } from '../contracts/tool-component.js';
import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeArraySnapshot, safeRecordSnapshot, } from '../contracts/record-safety.js';
export class AgentToolProjectionError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'AgentToolProjectionError';
        this.code = code;
    }
}
/** The fixed caller-plane provenance kind this adapter stamps on its generic
 * caller contexts. Provenance only — the kernel never branches on it. */
export const AGENT_CALLER_KIND = 'agent';
// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------
function fail(code, message) {
    throw new AgentToolProjectionError(code, message);
}
/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(value, description, code = 'INVALID_PROJECTION_INPUT') {
    const result = safeRecordSnapshot(value, description);
    if (!result.ok) {
        fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
/** Snapshot one authority-bearing array, mapping descriptor issues to a typed failure. */
function requireSafeArray(value, description) {
    const result = safeArraySnapshot(value, description);
    if (!result.ok) {
        fail('INVALID_PROJECTION_INPUT', `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
function requireSha256Port(value, path) {
    if (typeof value !== 'object' ||
        value === null ||
        typeof value.digestUtf8 !== 'function') {
        fail('INVALID_PROJECTION_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
    }
    return value;
}
/**
 * Exact identity string: non-empty and free of floating tokens, range
 * operators and embedded `id@selector` forms — never normalized.
 */
function requireExactIdentity(value, path) {
    if (typeof value !== 'string') {
        fail('INVALID_PROJECTION_INPUT', `${path} must be a string`);
    }
    if (!isNonEmptyIdentityString(value)) {
        fail('INVALID_PROJECTION_INPUT', `${path} must be a non-empty exact identity`);
    }
    if (carriesEmbeddedSelector(value) || carriesFloatingOrRangeSemantics(value)) {
        fail('INVALID_PROJECTION_INPUT', `${path} must be an exact identity, not a floating/range selector or embedded \`id@version\` form (latest/current/active/default/*/x/range)`);
    }
    return value;
}
/** Validate one portable-JSON material field, returning a canonical deep copy. */
function requireJsonMaterial(value, path) {
    try {
        return JSON.parse(canonicalJsonStringify(value));
    }
    catch {
        fail('INVALID_PROJECTION_INPUT', `${path} must be portable JSON material`);
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
        fail('INVALID_PROJECTION_INPUT', `${description}.${key} is required`);
    }
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
        fail('INVALID_PROJECTION_INPUT', `${description}.${key} must be a data property, not accessor-backed`);
    }
    return descriptor.value;
}
/**
 * The Agent-plane exposure rule: the operation's exact current declarative
 * `declaredExposure` material is a record whose `audiences` list contains the
 * exact `agent` audience. Declarative-only input to the admission decision —
 * never a substitute for it (the T004A-owned policy seam decides over exact
 * current state on every admission).
 */
function operationExposedToAgent(operation) {
    const exposure = operation.declaredExposure;
    if (typeof exposure !== 'object' || exposure === null || Array.isArray(exposure)) {
        return false;
    }
    const audiences = exposure['audiences'];
    return Array.isArray(audiences) && audiences.includes(AGENT_CALLER_KIND);
}
/**
 * The fixed Agent-plane exposure admission policy consumed by the T004A seam.
 * Stateless: every decision runs over the descriptor-safe operation snapshot
 * of the exact current graph supplied by `admitToolExposure`.
 */
const AGENT_PLANE_EXPOSURE_POLICY = Object.freeze({
    decideAdmission(query) {
        if (operationExposedToAgent(query.operation)) {
            return { admitted: true };
        }
        return {
            admitted: false,
            reason: 'the operation exposure material of the exact current contract does not admit the agent audience',
        };
    },
});
// ---------------------------------------------------------------------------
// Projection input + projection scan
// ---------------------------------------------------------------------------
const PROJECT_INPUT_FIELDS = new Set(['agentId', 'currentDefinitionGraph', 'sha256']);
const PROJECTED_OPERATION_FIELDS = new Set(['operationId', 'effect', 'inputSchema', 'outputSchema']);
const PROJECTION_FIELDS = new Set(['status', 'agentId', 'graphId', 'definitionGraphDigest', 'tools']);
const PROJECTED_TOOL_FIELDS = new Set(['toolComponentId', 'operations']);
/**
 * Synchronously validate a presented projection (any seam input) on a
 * descriptor-safe snapshot and return the snapshot view. The projection is
 * derived metadata: shape validation only, no mint registry — authority
 * never rides on it.
 */
function snapshotProjectionView(value) {
    const at = 'agent tool projection';
    const view = requireSafeRecord(value, at);
    const unexpectedField = Object.keys(view).find((key) => !PROJECTION_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_PROJECTION_INPUT', `${at} must contain exactly {status, agentId, graphId, definitionGraphDigest, tools}; unexpected field "${unexpectedField}" (no authority material is representable on a projection)`);
    }
    for (const required of ['status', 'agentId', 'graphId', 'definitionGraphDigest', 'tools']) {
        if (!(required in view)) {
            fail('INVALID_PROJECTION_INPUT', `${at}.${required} is required`);
        }
    }
    if (view.status !== 'PROJECTED') {
        fail('INVALID_PROJECTION_INPUT', `${at}.status must be exactly "PROJECTED"`);
    }
    const agentId = requireExactIdentity(view.agentId, `${at}.agentId`);
    const graphId = requireExactIdentity(view.graphId, `${at}.graphId`);
    if (typeof view.definitionGraphDigest !== 'string' || view.definitionGraphDigest.length === 0) {
        fail('INVALID_PROJECTION_INPUT', `${at}.definitionGraphDigest must be a non-empty content digest string`);
    }
    const toolEntries = requireSafeArray(view.tools, `${at}.tools`);
    const tools = toolEntries.map((entry, index) => {
        const toolView = requireSafeRecord(entry, `${at}.tools[${index}]`);
        const unexpectedToolField = Object.keys(toolView).find((key) => !PROJECTED_TOOL_FIELDS.has(key));
        if (unexpectedToolField !== undefined) {
            fail('INVALID_PROJECTION_INPUT', `${at}.tools[${index}] must contain exactly {toolComponentId, operations}; unexpected field "${unexpectedToolField}"`);
        }
        const toolComponentId = requireExactIdentity(toolView.toolComponentId, `${at}.tools[${index}].toolComponentId`);
        const operationEntries = requireSafeArray(toolView.operations, `${at}.tools[${index}].operations`);
        const operations = operationEntries.map((operationEntry, operationIndex) => {
            const operationView = requireSafeRecord(operationEntry, `${at}.tools[${index}].operations[${operationIndex}]`);
            const unexpectedOperationField = Object.keys(operationView).find((key) => !PROJECTED_OPERATION_FIELDS.has(key));
            if (unexpectedOperationField !== undefined) {
                fail('INVALID_PROJECTION_INPUT', `${at}.tools[${index}].operations[${operationIndex}] must contain exactly {operationId, effect, inputSchema, outputSchema}; unexpected field "${unexpectedOperationField}"`);
            }
            const operationId = requireExactIdentity(operationView.operationId, `${at}.tools[${index}].operations[${operationIndex}].operationId`);
            if (typeof operationView.effect !== 'string') {
                fail('INVALID_PROJECTION_INPUT', `${at}.tools[${index}].operations[${operationIndex}].effect must be a string`);
            }
            return { operationId, effect: operationView.effect };
        });
        return { toolComponentId, operations };
    });
    return { agentId, graphId, definitionGraphDigest: view.definitionGraphDigest, tools };
}
/**
 * Resolve one projected operation entry from a validated projection view.
 * The projection is per-agent: a projection minted for another agent exposes
 * nothing to this caller.
 */
function findProjectedOperation(projection, agentId, toolComponentId, operationId) {
    if (projection.agentId !== agentId) {
        return undefined;
    }
    const tool = projection.tools.find((entry) => entry.toolComponentId === toolComponentId);
    if (tool === undefined) {
        return undefined;
    }
    return tool.operations.find((operation) => operation.operationId === operationId);
}
/**
 * Authoritatively verify projection freshness against the exact current
 * graph: identity AND recomputed digest must both match. Any drift means the
 * derived metadata describes older state and can never authorize (or even
 * route) current execution.
 */
async function requireProjectionFresh(projection, graph, sha256) {
    if (graph.graphId !== projection.graphId) {
        fail('AGENT_PROJECTION_STALE', `the Agent Tool projection was minted over Definition graph "${projection.graphId}" but the exact current graph is "${graph.graphId}"; a projection can never authorize or route a different graph identity`);
    }
    const currentDigest = await computeDefinitionGraphDigest(graph, sha256);
    if (currentDigest !== projection.definitionGraphDigest) {
        fail('AGENT_PROJECTION_STALE', 'the exact current Definition graph digest no longer matches the digest bound in the Agent Tool projection; the projection describes older state and can never authorize current execution — re-project against the exact current graph');
    }
}
// ---------------------------------------------------------------------------
// projectAgentToolSurface — the Agent plane projection boundary
// ---------------------------------------------------------------------------
/**
 * Project the Agent Tool surface from the EXACT current Definition graph.
 *
 * Deterministic fail-closed precedence: input shape, exact identity, graph
 * envelope validation (propagated unchanged), then per-Tool declaration
 * validation (T003A failures propagated unchanged) and synchronous canonical
 * operation snapshots, and finally the authoritative graph digest bind.
 *
 * Only operations whose exact current declarative exposure admits the
 * `agent` audience are projected. The minted projection is deeply frozen,
 * non-aliasing and digest-bound — derived metadata only.
 */
export async function projectAgentToolSurface(input) {
    // ---- PHASE 1 (synchronous): validate and snapshot all input material.
    const view = requireSafeRecord(input, 'agent tool projection input');
    const unexpectedInputField = Object.keys(view).find((key) => !PROJECT_INPUT_FIELDS.has(key));
    if (unexpectedInputField !== undefined) {
        fail('INVALID_PROJECTION_INPUT', `agent tool projection input must contain exactly {agentId, currentDefinitionGraph, sha256}; unexpected field "${unexpectedInputField}" (no authority material is representable)`);
    }
    for (const required of ['agentId', 'currentDefinitionGraph', 'sha256']) {
        if (!(required in view) || view[required] === undefined) {
            fail('INVALID_PROJECTION_INPUT', `agent tool projection input.${required} is required`);
        }
    }
    const agentId = requireExactIdentity(view.agentId, 'agent tool projection input.agentId');
    const sha256 = requireSha256Port(view.sha256, 'agent tool projection input.sha256');
    const graph = view.currentDefinitionGraph;
    // Graph envelope failures propagate the original DefinitionGraphContractError.
    validateDefinitionGraphEnvelope(graph);
    const tools = [];
    for (const component of graph.components) {
        if (component.family !== 'tool') {
            continue;
        }
        // Tool declaration failures propagate the original ToolComponentContractError.
        validateToolComponent(component);
        const body = requireSafeRecord(component.semanticBody, `Tool Component "${component.componentId}" semanticBody`);
        const declared = requireSafeArray(body['operations'], `Tool Component "${component.componentId}" operations`);
        const operations = [];
        for (const [index, candidate] of declared.entries()) {
            const operation = requireSafeRecord(candidate, `Tool Component "${component.componentId}" operation`);
            const snapshot = {
                operationId: requireExactIdentity(operation['operationId'], `operation[${index}].operationId`),
                effect: operation['effect'],
                inputSchema: requireJsonMaterial(operation['inputSchema'], `operation[${index}].inputSchema`),
                outputSchema: requireJsonMaterial(operation['outputSchema'], `operation[${index}].outputSchema`),
            };
            if ('declaredExposure' in operation && operation['declaredExposure'] !== undefined) {
                snapshot['declaredExposure'] = requireJsonMaterial(operation['declaredExposure'], `operation[${index}].declaredExposure`);
            }
            if (!operationExposedToAgent(snapshot)) {
                continue;
            }
            operations.push(deepFreezeValue({
                operationId: snapshot['operationId'],
                effect: snapshot['effect'],
                inputSchema: snapshot['inputSchema'],
                outputSchema: snapshot['outputSchema'],
            }));
        }
        tools.push(deepFreezeValue({
            toolComponentId: component.componentId,
            operations,
        }));
    }
    // ---- PHASE 2 (async): bind the exact current graph digest.
    const definitionGraphDigest = await computeDefinitionGraphDigest(graph, sha256);
    const projection = deepFreezeValue({
        status: 'PROJECTED',
        agentId,
        graphId: graph.graphId,
        definitionGraphDigest,
        tools,
    });
    return projection;
}
// ---------------------------------------------------------------------------
// Shared seam snapshot helpers
// ---------------------------------------------------------------------------
const QUERY_INPUT_FIELDS = new Set([
    'agentId',
    'toolComponentId',
    'operationId',
    'proposal',
    'projection',
    'binding',
    'currentDefinitionGraph',
    'dispatch',
    'resourceProvider',
    'sha256',
]);
const MUTATION_INTENT_FIELDS = new Set([
    'agentId',
    'toolComponentId',
    'operationId',
    'proposal',
    'projection',
    'assembly',
    'currentDefinitionGraph',
    'sha256',
]);
/**
 * Synchronously validate the shared seam material: exact identities, proposal
 * JSON snapshot, projection view (per-agent membership resolved by the
 * caller), live graph and digest port. `fields` is the seam's closed-world
 * input field set; `entries` the required field names.
 */
function snapshotSeamInput(input, fields, label) {
    const view = requireSafeRecord(input, `${label} input`);
    const unexpectedField = Object.keys(view).find((key) => !fields.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_PROJECTION_INPUT', `${label} input must contain exactly {${[...fields].join(', ')}}; unexpected field "${unexpectedField}" (no occurrence, journal, verdict, pin or effect-routing material is representable)`);
    }
    return view;
}
/** Snapshot the dispatch binding's successor Assembly reference (read-only). */
function snapshotBindingAnchor(binding) {
    if (typeof binding !== 'object' || binding === null) {
        fail('INVALID_PROJECTION_INPUT', 'seam input.binding must be the T003C sealed Tool implementation binding object');
    }
    const successorAssembly = readOwnDataProperty(binding, 'successorAssembly', 'seam input.binding');
    if (typeof successorAssembly !== 'object' || successorAssembly === null) {
        fail('INVALID_PROJECTION_INPUT', 'seam input.binding.successorAssembly must be the sealed successor Runtime Assembly object');
    }
    // Provenance of the sealed Assembly object itself is re-proved downstream by
    // the consumed T004B seam (T002B mint verifier) before any dispatch.
    return successorAssembly;
}
/** Snapshot the explicit sealed Assembly input of the mutation-intent seam. */
function snapshotAssemblyInput(assembly) {
    if (typeof assembly !== 'object' || assembly === null) {
        fail('INVALID_PROJECTION_INPUT', 'seam input.assembly must be the sealed Runtime Assembly object');
    }
    return assembly;
}
/** Resolve + gate one projected operation for a seam (membership + query-only
 * effect gate). `queryOnly` enforces the mutation refusal on the query seam. */
function requireProjectedSeamOperation(view, requiredFields, label, queryOnly) {
    for (const required of requiredFields) {
        if (!(required in view) || view[required] === undefined) {
            fail('INVALID_PROJECTION_INPUT', `${label} input.${required} is required`);
        }
    }
    const agentId = requireExactIdentity(view['agentId'], `${label} input.agentId`);
    const toolComponentId = requireExactIdentity(view['toolComponentId'], `${label} input.toolComponentId`);
    const operationId = requireExactIdentity(view['operationId'], `${label} input.operationId`);
    const proposal = requireJsonMaterial(view['proposal'], `${label} input.proposal`);
    const projection = snapshotProjectionView(view['projection']);
    const graph = view['currentDefinitionGraph'];
    const sha256 = requireSha256Port(view['sha256'], `${label} input.sha256`);
    const projected = findProjectedOperation(projection, agentId, toolComponentId, operationId);
    if (projected === undefined) {
        fail('AGENT_OPERATION_NOT_PROJECTED', `operation "${operationId}" of Tool Component "${toolComponentId}" is not on the Agent-projected surface for agent "${agentId}"; operations without exact admitted agent exposure are invisible to the Agent plane and refuse before any admission or dispatch`);
    }
    if (queryOnly && projected.effect !== 'none') {
        fail('AGENT_MUTATION_REFUSED', `operation "${operationId}" of Tool Component "${toolComponentId}" is classified "${projected.effect}" and is mutation-capable; the Agent query seam invokes only effect=none operations and refuses mutation before any implementation dispatch — mutation-capable intent must enter the generic T004A request and route through the T004C authoritative occurrence / Central Admission path (no Agent mutation shortcut exists)`);
    }
    const caller = deepFreezeValue({
        callerId: agentId,
        callerKind: AGENT_CALLER_KIND,
    });
    return { agentId, toolComponentId, operationId, proposal, projection, caller, graph, sha256 };
}
/**
 * Invoke ONE agent-exposed, effect=none operation through the generic
 * T004A -> T004B path.
 *
 * Deterministic fail-closed precedence, every refusal BEFORE any dispatch:
 * closed-world input shape, exact identities, projection view, membership
 * (AGENT_OPERATION_NOT_PROJECTED), the query-only effect gate
 * (AGENT_MUTATION_REFUSED) — all synchronous — then projection freshness
 * (AGENT_PROJECTION_STALE), then the generic T004A exposure admission over
 * the exact current state (policy decision over the exact current contract;
 * typed failures propagate unchanged), the T004A request admission, and
 * finally the T004B effect=none invocation, which independently re-admits
 * the request, re-derives the effect class, verifies the T003C binding and
 * dispatches only the verified handle. Model proposal material is provenance
 * only; the returned observational result can never mutate authoritative
 * Domain state.
 */
export async function queryAgentTool(input) {
    // ---- PHASE 1 (synchronous): validate, snapshot and gate all material.
    const view = snapshotSeamInput(input, QUERY_INPUT_FIELDS, 'agent tool query');
    const seam = requireProjectedSeamOperation(view, ['agentId', 'toolComponentId', 'operationId', 'proposal', 'projection', 'binding', 'currentDefinitionGraph', 'dispatch', 'sha256'], 'agent tool query', true);
    const anchor = snapshotBindingAnchor(view['binding']);
    let resourceProvider;
    if (view['resourceProvider'] !== undefined) {
        const candidate = view['resourceProvider'];
        if (typeof candidate !== 'object' ||
            candidate === null ||
            typeof candidate.resolve !== 'function') {
            fail('INVALID_PROJECTION_INPUT', 'agent tool query input.resourceProvider must be a ResourceProvider ({ resolve(request): Promise<ResourceProviderResponse> })');
        }
        resourceProvider = candidate;
    }
    const dispatch = view['dispatch'];
    if (typeof dispatch !== 'object' ||
        dispatch === null ||
        typeof dispatch.dispatch !== 'function') {
        fail('INVALID_PROJECTION_INPUT', 'agent tool query input.dispatch must be a NonEffectfulToolDispatchPort ({ dispatch(query): Promise<unknown> })');
    }
    // Graph envelope failures propagate the original DefinitionGraphContractError.
    validateDefinitionGraphEnvelope(seam.graph);
    // ---- PHASE 2 (async): projection freshness, then the generic T004A seam.
    await requireProjectionFresh(seam.projection, seam.graph, seam.sha256);
    const exposure = await admitToolExposure({
        toolComponentId: seam.toolComponentId,
        operationId: seam.operationId,
        caller: seam.caller,
        assembly: anchor,
        currentDefinitionGraph: seam.graph,
        policy: AGENT_PLANE_EXPOSURE_POLICY,
    }, seam.sha256);
    const admitted = await admitToolInvocationRequest({
        toolComponentId: seam.toolComponentId,
        operationId: seam.operationId,
        input: seam.proposal,
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
 * Admit ONE mutation-capable Agent intent into the GENERIC T004A request.
 *
 * Deterministic fail-closed precedence: closed-world input shape, exact
 * identities, projection view, membership (AGENT_OPERATION_NOT_PROJECTED) —
 * all synchronous — then projection freshness (AGENT_PROJECTION_STALE), then
 * the generic T004A exposure admission (policy decision over the exact
 * current contract) and request admission (typed failures propagate
 * unchanged). The admitted request is returned for the HOST to route through
 * the T004C effectful seam against an already-authoritative occurrence —
 * this module exposes no mutation dispatch and performs no effect
 * classification of its own (the T004C-owned gate derives the frozen effect
 * class from the exact current graph at re-admission).
 */
export async function admitAgentMutationIntent(input) {
    // ---- PHASE 1 (synchronous): validate and snapshot all input material.
    const view = snapshotSeamInput(input, MUTATION_INTENT_FIELDS, 'agent mutation intent');
    const seam = requireProjectedSeamOperation(view, ['agentId', 'toolComponentId', 'operationId', 'proposal', 'projection', 'assembly', 'currentDefinitionGraph', 'sha256'], 'agent mutation intent', false);
    const assembly = snapshotAssemblyInput(view['assembly']);
    // Graph envelope failures propagate the original DefinitionGraphContractError.
    validateDefinitionGraphEnvelope(seam.graph);
    // ---- PHASE 2 (async): projection freshness, then the generic T004A seam.
    await requireProjectionFresh(seam.projection, seam.graph, seam.sha256);
    const exposure = await admitToolExposure({
        toolComponentId: seam.toolComponentId,
        operationId: seam.operationId,
        caller: seam.caller,
        assembly,
        currentDefinitionGraph: seam.graph,
        policy: AGENT_PLANE_EXPOSURE_POLICY,
    }, seam.sha256);
    return await admitToolInvocationRequest({
        toolComponentId: seam.toolComponentId,
        operationId: seam.operationId,
        input: seam.proposal,
        caller: seam.caller,
        definitionGraphDigest: exposure.definitionGraphDigest,
        assemblyDigest: exposure.assemblyDigest,
        exposure,
    }, { assembly, currentDefinitionGraph: seam.graph }, seam.sha256);
}
//# sourceMappingURL=agent-tool-projection.js.map