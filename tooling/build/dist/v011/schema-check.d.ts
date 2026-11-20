import type { ValidateFunction } from 'ajv';
import { type JsonValue } from '@kaicreator/domain-harness-contracts/v011';
export type V011DocumentSchemaName = 'descriptor' | 'domain' | 'manifest' | 'element';
export declare class V011SchemaChecker {
    private readonly ajv;
    private readonly documentValidators;
    private readonly contentSchemaCache;
    constructor();
    /** Validate one authoring document against a frozen T01 machine schema. */
    validateDocument(schemaName: V011DocumentSchemaName, value: unknown): void;
    /** Compile one JSON Schema (draft 2020-12); illegal schemas raise SCHEMA_INVALID. */
    compileContentSchema(schema: unknown, refPath: string): ValidateFunction;
    /** Compile (cached within this BUILD run) an inline content schema object. */
    compileInlineSchema(schema: JsonValue, refPath: string): ValidateFunction;
}
