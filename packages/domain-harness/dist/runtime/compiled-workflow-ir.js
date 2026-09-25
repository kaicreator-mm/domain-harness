import { SUPPORTED_COMPILED_INVOKE_KINDS_V2, } from '../v2/contracts/package.js';
export class CompiledWorkflowIrError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CompiledWorkflowIrError';
    }
}
function fail(workflowId, path, problem) {
    throw new CompiledWorkflowIrError(`Compiled workflow "${workflowId}" IR is invalid at ${path}: ${problem}`);
}
function asRecord(workflowId, path, value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        fail(workflowId, path, 'expected an object');
    }
    return value;
}
function asNonEmptyString(workflowId, path, value) {
    if (typeof value !== 'string' || value.length === 0) {
        fail(workflowId, path, 'expected a non-empty string');
    }
    return value;
}
function asOptionalString(workflowId, path, value) {
    if (value === undefined) {
        return undefined;
    }
    return asNonEmptyString(workflowId, path, value);
}
function decodeRoutes(workflowId, path, value, stateIds) {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        fail(workflowId, path, 'expected an array of routes');
    }
    return value.map((entry, index) => {
        const routePath = `${path}[${index}]`;
        const route = asRecord(workflowId, routePath, entry);
        const target = asNonEmptyString(workflowId, `${routePath}.target`, route.target);
        if (!stateIds.has(target)) {
            fail(workflowId, `${routePath}.target`, `route targets unknown state "${target}"`);
        }
        const when = asOptionalString(workflowId, `${routePath}.when`, route.when);
        return when === undefined ? { target } : { target, when };
    });
}
function decodeInvoke(workflowId, path, value) {
    const invoke = asRecord(workflowId, path, value);
    const kind = invoke.kind;
    if (typeof kind !== 'string' ||
        !SUPPORTED_COMPILED_INVOKE_KINDS_V2.includes(kind)) {
        fail(workflowId, `${path}.kind`, `invoke kind ${JSON.stringify(kind) ?? 'undefined'} is not executable by executionEngineMajor 2 `
            + `(supported: ${SUPPORTED_COMPILED_INVOKE_KINDS_V2.join(', ')}); legacy script invokes must be `
            + 'translated at build time (T-021) and child workflow invokes modeled as Domain Message effects');
    }
    const decodedKind = kind;
    const input = asOptionalString(workflowId, `${path}.input`, invoke.input);
    let timeoutMs;
    if (invoke.timeoutMs !== undefined) {
        if (typeof invoke.timeoutMs !== 'number' ||
            !Number.isSafeInteger(invoke.timeoutMs) ||
            invoke.timeoutMs <= 0) {
            fail(workflowId, `${path}.timeoutMs`, 'expected a positive safe integer');
        }
        timeoutMs = invoke.timeoutMs;
    }
    if (decodedKind === 'expr') {
        const expression = asNonEmptyString(workflowId, `${path}.expression`, invoke.expression);
        return {
            kind: decodedKind,
            expression,
            ...(input === undefined ? {} : { input }),
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
        };
    }
    const ref = asNonEmptyString(workflowId, `${path}.ref`, invoke.ref);
    if (decodedKind === 'skill') {
        if (invoke.skill === undefined) {
            fail(workflowId, `${path}.skill`, 'compiled skill invoke must carry its embedded skill definition');
        }
        const skill = asRecord(workflowId, `${path}.skill`, invoke.skill);
        asNonEmptyString(workflowId, `${path}.skill.skillId`, skill.skillId);
        asNonEmptyString(workflowId, `${path}.skill.instructions`, skill.instructions);
        asRecord(workflowId, `${path}.skill.outputSchema`, skill.outputSchema);
        if (!Array.isArray(skill.resources)) {
            fail(workflowId, `${path}.skill.resources`, 'expected an array of skill resources');
        }
        return {
            kind: decodedKind,
            ref,
            // Structural skill fields are validated above; deep identity/schema
            // semantics remain owned by the journaled skill runner.
            skill: skill,
            ...(input === undefined ? {} : { input }),
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
        };
    }
    return {
        kind: decodedKind,
        ref,
        ...(input === undefined ? {} : { input }),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
    };
}
function decodeEffects(workflowId, path, value) {
    if (value === undefined) {
        return undefined;
    }
    // A non-array here was previously skipped silently at execution time, which
    // could vanish a durable Domain Message effect without any error (#168).
    if (!Array.isArray(value)) {
        fail(workflowId, path, 'expected an array of domain-message effects');
    }
    return value.map((entry, index) => {
        const effectPath = `${path}[${index}]`;
        const effect = asRecord(workflowId, effectPath, entry);
        if (effect.kind !== 'domain-message') {
            fail(workflowId, `${effectPath}.kind`, 'only "domain-message" effects are supported');
        }
        const targetExpression = asNonEmptyString(workflowId, `${effectPath}.targetExpression`, effect.targetExpression);
        const messageType = asNonEmptyString(workflowId, `${effectPath}.messageType`, effect.messageType);
        const payloadExpression = asOptionalString(workflowId, `${effectPath}.payloadExpression`, effect.payloadExpression);
        const contractVersion = asOptionalString(workflowId, `${effectPath}.contractVersion`, effect.contractVersion);
        return {
            kind: 'domain-message',
            targetExpression,
            messageType,
            ...(payloadExpression === undefined ? {} : { payloadExpression }),
            ...(contractVersion === undefined ? {} : { contractVersion }),
        };
    });
}
export function decodeCompiledWorkflowDefinition(workflowId, definition) {
    if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
        fail(workflowId, 'definition', 'expected an object');
    }
    const root = definition;
    const initial = asNonEmptyString(workflowId, 'initial', root.initial);
    const statesRecord = asRecord(workflowId, 'states', root.states);
    const stateIds = new Set(Object.keys(statesRecord));
    if (stateIds.size === 0) {
        fail(workflowId, 'states', 'compiled workflow must declare at least one state');
    }
    if (!stateIds.has(initial)) {
        fail(workflowId, 'initial', `initial state "${initial}" is not declared in states`);
    }
    const output = asOptionalString(workflowId, 'output', root.output);
    const states = {};
    for (const [stateId, stateValue] of Object.entries(statesRecord)) {
        const statePath = `states.${stateId}`;
        const state = asRecord(workflowId, statePath, stateValue);
        let final = false;
        if (state.final !== undefined) {
            if (typeof state.final !== 'boolean') {
                fail(workflowId, `${statePath}.final`, 'expected a boolean');
            }
            final = state.final;
        }
        const eventsRecord = state.events === undefined ? undefined : asRecord(workflowId, `${statePath}.events`, state.events);
        const events = {};
        for (const [eventName, eventValue] of Object.entries(eventsRecord ?? {})) {
            const event = asRecord(workflowId, `${statePath}.events.${eventName}`, eventValue);
            events[eventName] = {
                routes: decodeRoutes(workflowId, `${statePath}.events.${eventName}.routes`, event.routes, stateIds),
            };
        }
        const effects = decodeEffects(workflowId, `${statePath}.effects`, state.effects);
        states[stateId] = {
            final,
            ...(state.invoke === undefined
                ? {}
                : { invoke: decodeInvoke(workflowId, `${statePath}.invoke`, state.invoke) }),
            done: decodeRoutes(workflowId, `${statePath}.done`, state.done, stateIds),
            error: decodeRoutes(workflowId, `${statePath}.error`, state.error, stateIds),
            events,
            ...(effects === undefined ? {} : { effects }),
        };
    }
    if (root.limits !== undefined) {
        const limits = asRecord(workflowId, 'limits', root.limits);
        if (limits.maxSteps !== undefined) {
            // Previously an invalid maxSteps produced NaN comparisons at execution
            // time, killing every message with "exceeded maxSteps" (#168).
            if (typeof limits.maxSteps !== 'number' ||
                !Number.isSafeInteger(limits.maxSteps) ||
                limits.maxSteps < 1) {
                fail(workflowId, 'limits.maxSteps', 'expected a positive safe integer');
            }
        }
    }
    const limitsRecord = root.limits;
    const maxSteps = limitsRecord?.maxSteps;
    return {
        initial,
        ...(output === undefined ? {} : { output }),
        states,
        ...(maxSteps === undefined ? {} : { limits: { maxSteps } }),
    };
}
//# sourceMappingURL=compiled-workflow-ir.js.map