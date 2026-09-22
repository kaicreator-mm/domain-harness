import type { JsonSchema, JsonValue } from '../contracts/json.js';
import { ExpressionRuntime, type ExpressionEvaluationOptions } from './expression-runtime.js';
export interface CompiledExpressionDescriptor {
    readonly expression: string;
    readonly outputSchema: JsonSchema;
}
export declare class ExpressionToolExecutor {
    private readonly runtime;
    private readonly ajv;
    private readonly validators;
    constructor(runtime?: ExpressionRuntime);
    execute(descriptor: CompiledExpressionDescriptor, input: JsonValue, logicalTime: string, options?: ExpressionEvaluationOptions): Promise<JsonValue>;
}
//# sourceMappingURL=expression-tool.d.ts.map