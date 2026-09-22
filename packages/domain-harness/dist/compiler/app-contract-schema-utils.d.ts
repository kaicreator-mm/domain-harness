import type { JsonObject, JsonSchema, JsonValue } from '../contracts/json.js';
export declare function assertReferenceHasOnlyMetadataSiblings(schema: JsonSchema, path: string): void;
export declare function assertSupportedSchema(schema: JsonSchema, path: string): void;
export declare function schemaArray(value: JsonValue | undefined, path: string): readonly JsonSchema[] | undefined;
export declare function schemaObject(value: JsonValue | undefined, path: string): JsonSchema;
export declare function objectValue(value: JsonValue | undefined): JsonObject | undefined;
export declare function arrayValue(value: JsonValue | undefined): readonly JsonValue[] | undefined;
export declare function stringValue(value: JsonValue | undefined): string | undefined;
export declare function stringArray(value: JsonValue | undefined, path: string): ReadonlySet<string>;
export declare function isJsonObject(value: JsonValue | undefined): value is JsonObject;
export declare function renderLiteral(value: JsonValue | undefined, path: string): string;
export declare function literal(value: string | number | boolean | null): string;
export declare function toIdentifier(value: string): string;
//# sourceMappingURL=app-contract-schema-utils.d.ts.map