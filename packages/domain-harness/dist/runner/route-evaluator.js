import { ExpressionRuntime } from '../expression/expression-runtime.js';
export class RouteEvaluator {
    expressions;
    constructor(expressions) {
        this.expressions = expressions;
    }
    async select(sourceStateId, routeClass, routes, scope, logicalTime) {
        const expressionScope = toJsonScope(scope);
        for (const [routeIndex, route] of routes.entries()) {
            if (!route.when) {
                return { sourceStateId, routeClass, routeIndex };
            }
            if (await this.expressions.evaluateBoolean(route.when, expressionScope, logicalTime)) {
                return { sourceStateId, routeClass, routeIndex };
            }
        }
        throw new Error(`no matching ${routeClass} route from state '${sourceStateId}'`);
    }
}
function toJsonScope(scope) {
    return {
        input: scope.input,
        steps: scope.steps,
        run: { visits: scope.run.visits },
        ...(scope.output !== undefined ? { output: scope.output } : {}),
        ...(scope.error
            ? {
                error: {
                    code: scope.error.code,
                    message: scope.error.message,
                    ...(scope.error.details !== undefined ? { details: scope.error.details } : {}),
                },
            }
            : {}),
    };
}
//# sourceMappingURL=route-evaluator.js.map