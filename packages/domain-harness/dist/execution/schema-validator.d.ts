import type { JsonSchema, JsonValue } from '../contracts/json.js';
import { type ExecutorErrorCode } from './executor-error.js';
export declare class SchemaValidator {
    private readonly ajv;
    private readonly cache;
    validate(schema: JsonSchema | undefined, value: unknown, code: Extract<ExecutorErrorCode, 'invalid_input' | 'invalid_output'>, label: string): JsonValue;
}
export declare function assertPortableJson(value: unknown, code: Extract<ExecutorErrorCode, 'invalid_input' | 'invalid_output'>, label: string): asserts value is JsonValue;
//# sourceMappingURL=schema-validator.d.ts.map