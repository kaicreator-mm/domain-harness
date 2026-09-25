import jsonata from 'jsonata';
const FORBIDDEN_VARIABLES = new Set(['random', 'eval']);
const DETERMINISTIC_CLOCK_FUNCTIONS = new Set(['now', 'millis']);
export class ExpressionPolicyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ExpressionPolicyError';
    }
}
export function assertExpressionPolicy(source) {
    let expression;
    try {
        expression = jsonata(source);
    }
    catch (error) {
        throw new ExpressionPolicyError(`JSONata compile failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    inspectNode(expression.ast());
}
function inspectNode(value) {
    if (Array.isArray(value)) {
        for (const item of value)
            inspectNode(item);
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    const node = value;
    if (node.type === 'variable' && typeof node.value === 'string') {
        if (FORBIDDEN_VARIABLES.has(node.value)) {
            throw new ExpressionPolicyError(`$${node.value} is forbidden by DomainHarness`);
        }
    }
    if (node.type === 'function' && node.procedure && typeof node.procedure === 'object') {
        const procedure = node.procedure;
        const args = Array.isArray(node.arguments) ? node.arguments : [];
        if (procedure.type === 'variable' &&
            typeof procedure.value === 'string' &&
            DETERMINISTIC_CLOCK_FUNCTIONS.has(procedure.value) &&
            args.length > 0) {
            throw new ExpressionPolicyError(`$${procedure.value}(...) arguments are not supported by the v0.2 deterministic clock contract`);
        }
    }
    for (const child of Object.values(node))
        inspectNode(child);
}
//# sourceMappingURL=policy.js.map