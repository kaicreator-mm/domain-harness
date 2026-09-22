import { CANDIDATE_ENVELOPE_SCHEMA_VERSION, } from '../candidate/contracts.js';
import { DynamicChildExecutionError, PROMOTED_CHILD_BODY_SCHEMA_VERSION, } from './contracts.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function failBody(message) {
    throw new DynamicChildExecutionError('DYNAMIC_CHILD_BODY_INVALID', message);
}
function failCompile(message) {
    throw new DynamicChildExecutionError('DYNAMIC_CHILD_COMPILE_INVALID', message);
}
function requireString(value, label) {
    if (typeof value !== 'string' || value.length === 0) {
        failBody(`${label} must be a non-empty string`);
    }
    return value;
}
function parseExactReference(value, label) {
    if (!isRecord(value))
        failBody(`${label} must be an object`);
    return {
        kind: requireString(value.kind, `${label}.kind`),
        artifactId: requireString(value.artifactId, `${label}.artifactId`),
        contentDigest: requireString(value.contentDigest, `${label}.contentDigest`),
    };
}
function parseReferenceArray(value, label) {
    if (!Array.isArray(value))
        failBody(`${label} must be an array`);
    return value.map((entry, index) => parseExactReference(entry, `${label}[${index}]`));
}
function parseStringArray(value, label) {
    if (!Array.isArray(value))
        failBody(`${label} must be an array`);
    return value.map((entry, index) => requireString(entry, `${label}[${index}]`));
}
function parseControl(value) {
    if (!isRecord(value))
        failBody('envelope.control is required for a promoted-subworkflow');
    const startNode = requireString(value.startNode, 'control.startNode');
    const nodes = parseStringArray(value.nodes, 'control.nodes');
    if (!Array.isArray(value.edges))
        failBody('control.edges must be an array');
    const edges = value.edges.map((edge, index) => {
        if (!isRecord(edge))
            failBody(`control.edges[${index}] must be an object`);
        return {
            from: requireString(edge.from, `control.edges[${index}].from`),
            to: requireString(edge.to, `control.edges[${index}].to`),
        };
    });
    if (!Number.isSafeInteger(value.maxSteps) || value.maxSteps <= 0) {
        failBody('control.maxSteps must be a positive safe integer');
    }
    return { startNode, nodes, edges, maxSteps: value.maxSteps };
}
/** Structural re-validation of the promoted envelope. Digest integrity is the registry's job. */
export function parsePromotedChildEnvelope(material) {
    if (!isRecord(material))
        failBody('promoted semantic material must be an object');
    if (material.schemaVersion !== CANDIDATE_ENVELOPE_SCHEMA_VERSION) {
        failBody(`unsupported candidate envelope schema version ${JSON.stringify(material.schemaVersion)}`);
    }
    if (material.candidateKind !== 'workflow') {
        failBody(`promoted-subworkflow requires candidateKind 'workflow', got ${JSON.stringify(material.candidateKind)}`);
    }
    const candidateId = requireString(material.candidateId, 'envelope.candidateId');
    const bodyContract = parseExactReference(material.bodyContract, 'envelope.bodyContract');
    if (!isRecord(material.io))
        failBody('envelope.io must be an object');
    const mutation = material.mutation;
    if (!isRecord(mutation))
        failBody('envelope.mutation must be an object');
    let parsedMutation;
    if (mutation.kind === 'none') {
        parsedMutation = { kind: 'none' };
    }
    else if (mutation.kind === 'durable-effect') {
        parsedMutation = {
            kind: 'durable-effect',
            effects: parseReferenceArray(mutation.effects, 'envelope.mutation.effects'),
        };
    }
    else {
        failBody(`unsupported envelope.mutation.kind ${JSON.stringify(mutation.kind)}`);
    }
    return {
        schemaVersion: CANDIDATE_ENVELOPE_SCHEMA_VERSION,
        candidateKind: 'workflow',
        candidateId,
        bodyContract,
        body: material.body,
        io: {
            inputs: parseReferenceArray(material.io.inputs, 'envelope.io.inputs'),
            outputs: parseReferenceArray(material.io.outputs, 'envelope.io.outputs'),
        },
        capabilities: parseStringArray(material.capabilities, 'envelope.capabilities'),
        tools: parseReferenceArray(material.tools, 'envelope.tools').map((tool) => ({
            ...tool,
            kind: 'tool',
            capability: 'query',
        })),
        events: parseStringArray(material.events, 'envelope.events'),
        mutation: parsedMutation,
        references: parseReferenceArray(material.references, 'envelope.references'),
        applicability: parseReferenceArray(material.applicability, 'envelope.applicability'),
        hardInvariants: parseReferenceArray(material.hardInvariants, 'envelope.hardInvariants'),
        control: parseControl(material.control),
    };
}
function parseValueSource(value, label) {
    if (!isRecord(value))
        failBody(`${label} must be an object`);
    if (value.kind === 'literal') {
        if (!('value' in value))
            failBody(`${label}.value is required for a literal source`);
        return { kind: 'literal', value: value.value };
    }
    if (value.kind === 'input') {
        return { kind: 'input', path: requireString(value.path, `${label}.path`) };
    }
    if (value.kind === 'step-output') {
        return {
            kind: 'step-output',
            node: requireString(value.node, `${label}.node`),
            path: requireString(value.path, `${label}.path`),
        };
    }
    return failBody(`${label}.kind ${JSON.stringify(value.kind)} is not a declarative value source`);
}
function parseStep(value, label) {
    if (!isRecord(value))
        failBody(`${label} must be an object`);
    switch (value.kind) {
        case 'query':
            return {
                kind: 'query',
                tool: parseExactReference(value.tool, `${label}.tool`),
                input: parseValueSource(value.input, `${label}.input`),
            };
        case 'emit-event': {
            const parsed = {
                kind: 'emit-event',
                eventType: requireString(value.eventType, `${label}.eventType`),
                ...('payload' in value && value.payload !== undefined
                    ? { payload: parseValueSource(value.payload, `${label}.payload`) }
                    : {}),
            };
            return parsed;
        }
        case 'effect-intent': {
            return {
                kind: 'effect-intent',
                effect: parseExactReference(value.effect, `${label}.effect`),
                input: parseValueSource(value.input, `${label}.input`),
                ...(value.idempotencyKey !== undefined
                    ? { idempotencyKey: requireString(value.idempotencyKey, `${label}.idempotencyKey`) }
                    : {}),
            };
        }
        case 'terminal-output':
            return {
                kind: 'terminal-output',
                output: parseValueSource(value.output, `${label}.output`),
            };
        case 'reasoned':
            return {
                kind: 'reasoned',
                harnessConfig: parseExactReference(value.harnessConfig, `${label}.harnessConfig`),
            };
        default:
            return failBody(`${label}.kind ${JSON.stringify(value.kind)} is not a supported promoted child step`);
    }
}
export function parsePromotedChildWorkflowBody(body) {
    if (!isRecord(body))
        failBody('promoted child body must be an object');
    if (body.schemaVersion !== PROMOTED_CHILD_BODY_SCHEMA_VERSION) {
        failBody(`unsupported promoted child body schema version ${JSON.stringify(body.schemaVersion)}`);
    }
    if (!Array.isArray(body.nodes))
        failBody('body.nodes must be an array');
    const nodes = body.nodes.map((node, index) => {
        if (!isRecord(node))
            failBody(`body.nodes[${index}] must be an object`);
        return {
            node: requireString(node.node, `body.nodes[${index}].node`),
            step: parseStep(node.step, `body.nodes[${index}].step`),
        };
    });
    return { schemaVersion: PROMOTED_CHILD_BODY_SCHEMA_VERSION, nodes };
}
function sameReference(left, right) {
    return left.kind === right.kind
        && left.artifactId === right.artifactId
        && left.contentDigest === right.contentDigest;
}
/** Deterministic topological order (Kahn with lexical tie-break); fails closed on any cycle. */
function topologicalOrder(control) {
    const nodeSet = new Set(control.nodes);
    if (nodeSet.size !== control.nodes.length)
        failCompile('control.nodes contains duplicates');
    if (!nodeSet.has(control.startNode))
        failCompile('control.startNode is not declared in control.nodes');
    const indegree = new Map();
    const outgoing = new Map();
    for (const node of control.nodes) {
        indegree.set(node, 0);
        outgoing.set(node, []);
    }
    const seenEdges = new Set();
    for (const edge of control.edges) {
        if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) {
            failCompile(`control edge ${edge.from} -> ${edge.to} references an undeclared node`);
        }
        if (edge.from === edge.to) {
            throw new DynamicChildExecutionError('DYNAMIC_CHILD_CYCLE_FORBIDDEN', `control edge ${edge.from} -> ${edge.to} is a self cycle`);
        }
        const edgeKey = `${edge.from}->${edge.to}`;
        if (seenEdges.has(edgeKey)) {
            failCompile(`duplicate control edge ${edgeKey}`);
        }
        seenEdges.add(edgeKey);
        indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
        outgoing.get(edge.from).push(edge.to);
    }
    const ready = control.nodes.filter((node) => indegree.get(node) === 0).sort();
    const order = [];
    while (ready.length > 0) {
        const node = ready.shift();
        order.push(node);
        for (const next of outgoing.get(node).slice().sort()) {
            const remaining = indegree.get(next) - 1;
            indegree.set(next, remaining);
            if (remaining === 0) {
                ready.push(next);
                ready.sort();
            }
        }
    }
    if (order.length !== control.nodes.length) {
        throw new DynamicChildExecutionError('DYNAMIC_CHILD_CYCLE_FORBIDDEN', 'promoted-subworkflow control graph contains a control-flow cycle; v0.3 rejects all cycles');
    }
    return order;
}
function assertReachable(control) {
    const seen = new Set([control.startNode]);
    const queue = [control.startNode];
    while (queue.length > 0) {
        const node = queue.shift();
        for (const edge of control.edges) {
            if (edge.from === node && !seen.has(edge.to)) {
                seen.add(edge.to);
                queue.push(edge.to);
            }
        }
    }
    for (const node of control.nodes) {
        if (!seen.has(node))
            failCompile(`control node ${node} is not reachable from startNode`);
    }
}
function stateKey(node) {
    return `node:${node}`;
}
const FAILURE_STATE = 'promoted-child:failed';
function buildDefinition(control, stepByNode, order, artifactKey) {
    const terminalNode = order.find((node) => stepByNode.get(node)?.kind === 'terminal-output');
    const states = order.map((node) => {
        const step = stepByNode.get(node);
        const transitions = [];
        const completionEvent = `promoted-child/${node}/done`;
        const isQuery = step.kind === 'query';
        const outgoing = control.edges
            .filter((edge) => edge.from === node)
            .map((edge) => edge.to)
            .sort();
        for (const target of outgoing) {
            transitions.push({
                transitionKey: `${node}->${target}`,
                trigger: isQuery
                    ? { kind: 'invocation_done', invocationKey: `invoke:${node}` }
                    : { kind: 'event', eventType: completionEvent },
                targetState: stateKey(target),
            });
        }
        if (isQuery) {
            transitions.push({
                transitionKey: `${node}->${FAILURE_STATE}`,
                trigger: { kind: 'invocation_failed', invocationKey: `invoke:${node}` },
                targetState: FAILURE_STATE,
            });
        }
        const state = {
            stateKey: stateKey(node),
            ...(node === terminalNode ? { kind: 'final' } : { kind: 'active' }),
            ...(step.kind === 'query'
                ? {
                    invocations: [{
                            invocationKey: `invoke:${node}`,
                            operationKey: `${step.tool.artifactId}@${step.tool.contentDigest}`,
                            onDoneEvent: completionEvent,
                            onFailureEvent: `promoted-child/${node}/failed`,
                        }],
                }
                : {}),
            ...(transitions.length > 0 ? { transitions } : {}),
        };
        return state;
    });
    states.push({ stateKey: FAILURE_STATE, kind: 'failure' });
    return {
        workflowKey: artifactKey,
        initialState: stateKey(control.startNode),
        initialContext: {},
        states,
    };
}
/**
 * Compile one exact promoted artifact body into a deterministic executable child
 * definition. Pure and deterministic: the same exact body always compiles to the
 * same definition, which is what makes pinned recovery equivalent to fresh start.
 */
export function compilePromotedChild(body) {
    const envelope = parsePromotedChildEnvelope(body.semanticMaterial);
    const workflowBody = parsePromotedChildWorkflowBody(envelope.body);
    const control = envelope.control;
    const stepByNode = new Map();
    for (const entry of workflowBody.nodes) {
        if (stepByNode.has(entry.node))
            failCompile(`body defines node ${entry.node} more than once`);
        stepByNode.set(entry.node, entry.step);
    }
    for (const node of control.nodes) {
        if (!stepByNode.has(node))
            failCompile(`control node ${node} has no body step definition`);
    }
    for (const node of workflowBody.nodes.map((entry) => entry.node)) {
        if (!control.nodes.includes(node))
            failCompile(`body node ${node} is not declared in control.nodes`);
    }
    const order = topologicalOrder(control);
    assertReachable(control);
    if (control.maxSteps < order.length) {
        failCompile(`control.maxSteps ${control.maxSteps} cannot cover ${order.length} declared nodes`);
    }
    const orderIndex = new Map(order.map((node, index) => [node, index]));
    let terminalCount = 0;
    const steps = order.map((node, index) => {
        const step = stepByNode.get(node);
        const validateSource = (source, label) => {
            if (source.kind === 'step-output') {
                const sourceIndex = orderIndex.get(source.node);
                if (sourceIndex === undefined)
                    failCompile(`${label} references undeclared step node ${source.node}`);
                if (sourceIndex >= index) {
                    failCompile(`${label} references step node ${source.node} that does not execute before ${node}`);
                }
            }
        };
        switch (step.kind) {
            case 'query': {
                const allowlisted = envelope.tools.some((tool) => sameReference(tool, step.tool));
                if (!allowlisted) {
                    failCompile(`query step ${node} uses tool ${step.tool.artifactId}@${step.tool.contentDigest} outside the envelope tools allowlist`);
                }
                validateSource(step.input, `query step ${node} input`);
                break;
            }
            case 'emit-event': {
                if (!envelope.events.includes(step.eventType)) {
                    throw new DynamicChildExecutionError('DYNAMIC_CHILD_EVENT_NOT_ALLOWED', `emit-event step ${node} emits ${step.eventType} outside the envelope events allowlist`);
                }
                if (step.payload !== undefined)
                    validateSource(step.payload, `emit-event step ${node} payload`);
                break;
            }
            case 'effect-intent': {
                if (envelope.mutation.kind !== 'durable-effect') {
                    throw new DynamicChildExecutionError('DYNAMIC_CHILD_MUTATION_BINDING_FORBIDDEN', `effect-intent step ${node} is forbidden while the envelope mutation contract is 'none'`);
                }
                const allowlisted = envelope.mutation.effects.some((effect) => sameReference(effect, step.effect));
                if (!allowlisted) {
                    throw new DynamicChildExecutionError('DYNAMIC_CHILD_EFFECT_NOT_ALLOWED', `effect-intent step ${node} references an effect outside the envelope mutation.effects allowlist`);
                }
                validateSource(step.input, `effect-intent step ${node} input`);
                break;
            }
            case 'terminal-output': {
                terminalCount += 1;
                if (control.edges.some((edge) => edge.from === node)) {
                    failCompile(`terminal-output node ${node} must not have outgoing control edges`);
                }
                validateSource(step.output, `terminal-output step ${node} output`);
                break;
            }
            case 'reasoned': {
                throw new DynamicChildExecutionError('DYNAMIC_CHILD_REASONED_STEP_UNSUPPORTED', `reasoned step ${node} is not supported by the v0.3 promoted child compiler (frozen L2 §11.6 fail-closed allowance)`);
            }
            default:
                failCompile(`node ${node} has an unsupported step`);
        }
        return { node, step, operationOrdinal: index + 1 };
    });
    if (terminalCount !== 1) {
        failCompile(`promoted-subworkflow requires exactly one terminal-output node, got ${terminalCount}`);
    }
    const terminalNode = order.find((node) => stepByNode.get(node)?.kind === 'terminal-output');
    for (const node of order) {
        if (node === terminalNode)
            continue;
        if (!control.edges.some((edge) => edge.from === node)) {
            failCompile(`non-terminal node ${node} has no outgoing control edge; the compiled child would dead-end before its terminal output`);
        }
    }
    const definition = buildDefinition(control, stepByNode, order, `promoted-child/${body.identity.artifactId}@${body.identity.contentDigest}`);
    return {
        artifact: body.identity,
        definition,
        steps,
        maxSteps: control.maxSteps,
        declaredEvents: envelope.events,
        envelope,
    };
}
//# sourceMappingURL=compiler.js.map