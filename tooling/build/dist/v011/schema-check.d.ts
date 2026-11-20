import type { ValidateFunction } from 'ajv';
import { type JsonValue } from '@kaicreator/domain-harness-contracts/v011';
/** Compile one JSON Schema (draft 2020-12); illegal schemas raise SCHEMA_INVALID. */
export declare function compileContentSchema(schema: unknown, refPath: string): ValidateFunction;
/** Validate one authoring document against a frozen T01 machine schema. */
export declare function validateDocument(schemaName: 'descriptor' | 'domain' | 'manifest' | 'element', value: unknown): void;
/** Compile (with per-BUILD-process cache) an inline content schema object. */
export declare function compileInlineSchema(schema: JsonValue, refPath: string): ValidateFunction;
