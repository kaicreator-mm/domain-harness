import type { HarnessError } from '../contracts/errors.js';
import type { JsonValue } from '../contracts/json.js';
import type { RouteSelection } from '../compiler/control-machine.js';
import { ExpressionRuntime } from '../expression/expression-runtime.js';
import type { RouteAst } from '../loader/ast.js';

export interface RouteScope {
  input: JsonValue;
  steps: Record<string, JsonValue>;
  run: { visits: Record<string, number> };
  output?: JsonValue;
  error?: HarnessError;
}

export class RouteEvaluator {
  constructor(private readonly expressions: ExpressionRuntime) {}

  async select(
    sourceStateId: string,
    routeClass: 'done' | 'error',
    routes: readonly RouteAst[],
    scope: RouteScope,
    logicalTime: string,
  ): Promise<RouteSelection> {
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

function toJsonScope(scope: RouteScope): JsonValue {
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
