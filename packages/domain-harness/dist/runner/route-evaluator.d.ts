import type { HarnessError } from '../contracts/errors.js';
import type { JsonValue } from '../contracts/json.js';
import type { RouteSelection } from '../compiler/control-machine.js';
import { ExpressionRuntime } from '../expression/expression-runtime.js';
import type { RouteAst } from '../loader/ast.js';
export interface RouteScope {
    input: JsonValue;
    steps: Record<string, JsonValue>;
    run: {
        visits: Record<string, number>;
    };
    output?: JsonValue;
    error?: HarnessError;
}
export declare class RouteEvaluator {
    private readonly expressions;
    constructor(expressions: ExpressionRuntime);
    select(sourceStateId: string, routeClass: 'done' | 'error', routes: readonly RouteAst[], scope: RouteScope, logicalTime: string): Promise<RouteSelection>;
}
//# sourceMappingURL=route-evaluator.d.ts.map