import { sha256Canonical } from '../../package/canonical.js';
const JSON_VALUE_SCHEMA = {};
export class V01ExprMigrationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'V01ExprMigrationError';
    }
}
/**
 * Build-time compatibility translation for frozen v0.1 `invoke.expr` forms.
 *
 * The generated tool identity is content-addressed from workflow/state/source
 * identity. Filesystem location and call-site input/timeout metadata are
 * intentionally excluded from source identity.
 *
 * This compatibility layer does not mutate the input workflow and does not
 * alter non-expr invokes. Runtime wiring is deliberately outside T-020.
 */
export function translateV01ExprWorkflow(workflow) {
    const migratedStates = {};
    const tools = [];
    for (const stateId of Object.keys(workflow.states).sort()) {
        const state = workflow.states[stateId];
        if (state === undefined)
            continue;
        if (state.invoke?.kind !== 'expr') {
            migratedStates[stateId] = state;
            continue;
        }
        const translated = translateV01ExprInvoke(workflow.id, stateId, state.invoke);
        tools.push(translated.tool);
        migratedStates[stateId] = {
            ...state,
            invoke: translated.invoke,
        };
    }
    return {
        workflow: {
            ...workflow,
            states: migratedStates,
        },
        tools,
    };
}
export function translateV01ExprInvoke(workflowId, stateId, invoke) {
    if (invoke.kind !== 'expr') {
        throw new V01ExprMigrationError(`Expected legacy expr invoke at ${workflowId}/${stateId}, got ${invoke.kind}`);
    }
    const expression = invoke.expression?.trim();
    if (!expression) {
        throw new V01ExprMigrationError(`Legacy expr invoke at ${workflowId}/${stateId} is missing expression source`);
    }
    const sourceIdentity = sha256Canonical({ expression });
    const toolId = `__v01_expr_${sha256Canonical({ workflowId, stateId, sourceIdentity })}`;
    return {
        invoke: {
            kind: 'tool',
            ref: toolId,
            ...(invoke.input === undefined ? {} : { input: invoke.input }),
            ...(invoke.timeoutMs === undefined ? {} : { timeoutMs: invoke.timeoutMs }),
        },
        tool: {
            toolId,
            kind: 'expression',
            effect: 'none',
            descriptor: {
                expression,
                outputSchema: JSON_VALUE_SCHEMA,
            },
            sourceIdentity,
            source: { workflowId, stateId },
        },
    };
}
