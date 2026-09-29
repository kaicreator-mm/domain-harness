import type { JsonSchema, JsonValue } from '../contracts/json.js';
export declare const DOMAIN_HARNESS_JSON_SCHEMA_V1: "domainharness-json-schema/1";
export declare const JSON_SCHEMA_DRAFT_2020_12_URI: "https://json-schema.org/draft/2020-12/schema";
export type DomainHarnessJsonSchemaContractVersion = typeof DOMAIN_HARNESS_JSON_SCHEMA_V1;
export type DomainHarnessJsonSchemaV1ErrorCode = 'INVALID_SCHEMA_CONTRACT' | 'INSTANCE_VALIDATION_FAILED';
export declare class DomainHarnessJsonSchemaV1Error extends Error {
    readonly code: DomainHarnessJsonSchemaV1ErrorCode;
    readonly details: readonly string[];
    constructor(code: DomainHarnessJsonSchemaV1ErrorCode, message: string, details?: readonly string[]);
}
/** Portable UTF-8 byte length without Node Buffer/TextEncoder dependencies. */
export declare function portableUtf8ByteLength(value: string): number;
export declare function canonicalSchemaUtf8ByteLength(schema: JsonSchema): number;
/**
 * Authoritative Mode-A portable interpreter for `domainharness-json-schema/1`.
 *
 * The pinned interpreter executes the schema directly and does not use Ajv's
 * runtime `Function` code generation path. DomainHarness owns the exact profile
 * restrictions around the interpreter so package identity is not delegated to
 * library defaults.
 */
export declare class DomainHarnessJsonSchemaV1Validator {
    private readonly compiled;
    normalizeSchema(value: unknown): JsonSchema;
    validate(schema: JsonSchema, value: unknown, label: string): JsonValue;
    private compileCanonical;
}
//# sourceMappingURL=domainharness-json-schema-v1.d.ts.map