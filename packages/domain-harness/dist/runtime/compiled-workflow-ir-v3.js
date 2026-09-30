import { CompiledWorkflowIrError, decodeCompiledWorkflowDefinition, } from './compiled-workflow-ir.js';
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
function decodeRejectedRoutes(workflowId, path, value, stateIds) {
    if (!Array.isArray(value) || value.length === 0) {
        fail(workflowId, path, 'engine-major-3 domain-message effect requires a non-empty rejected route array');
    }
    return value.map((entry, index) => {
        const routePath = `${path}[${index}]`;
        const route = asRecord(workflowId, routePath, entry);
        const target = asNonEmptyString(workflowId, `${routePath}.target`, route.target);
        if (!stateIds.has(target)) {
            fail(workflowId, `${routePath}.target`, `route targets unknown state "${target}"`);
        }
        const isFallback = index === value.length - 1;
        if (isFallback) {
            if (route.when !== undefined) {
                fail(workflowId, `${routePath}.when`, 'final rejected route must be unconditional');
            }
            return { target };
        }
        const when = asNonEmptyString(workflowId, `${routePath}.when`, route.when);
        return { target, when };
    });
}
/**
 * Authoritative decoder for executionEngineMajor 3 successor workflow IR.
 *
 * It deliberately composes the frozen engine-2 decoder for every retained
 * field, then adds only the successor rejection-routing requirement. This
 * keeps engine-2 decoding semantics unchanged while making every successor
 * Domain Message effect total over permanent rejection.
 */
export function decodeCompiledWorkflowDefinitionV3(workflowId, definition) {
    const base = decodeCompiledWorkflowDefinition(workflowId, definition);
    const root = definition;
    const rawStates = root.states;
    const stateIds = new Set(Object.keys(base.states));
    const states = {};
    for (const [stateId, baseState] of Object.entries(base.states)) {
        const rawState = rawStates[stateId];
        if (baseState.effects === undefined) {
            // exactOptionalPropertyTypes: re-emit the state without the absent
            // `effects` key instead of forwarding the engine-2 `CompiledState`.
            const { effects: _effects, ...state } = baseState;
            states[stateId] = state;
            continue;
        }
        const rawEffects = rawState.effects;
        const effects = baseState.effects.map((effect, index) => {
            const rawEffect = rawEffects[index];
            return {
                ...effect,
                rejected: decodeRejectedRoutes(workflowId, `states.${stateId}.effects[${index}].rejected`, rawEffect.rejected, stateIds),
            };
        });
        states[stateId] = {
            ...baseState,
            effects,
        };
    }
    return {
        ...base,
        states,
    };
}
//# sourceMappingURL=compiled-workflow-ir-v3.js.map