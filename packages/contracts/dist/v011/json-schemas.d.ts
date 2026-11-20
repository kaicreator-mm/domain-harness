import type { JsonValue } from './base.js';
type JsonObject = {
    readonly [k: string]: JsonValue;
};
export declare const V011_JSON_SCHEMA_DIALECT: "https://json-schema.org/draft/2020-12/schema";
export declare const V011_SCHEMA_BASE_ID: "https://kaicreator.dev/schemas/domain-harness/v011";
export declare const ELEMENT_DEFINITION_JSON_SCHEMA: JsonObject;
export declare const DOMAIN_DEFINITION_JSON_SCHEMA: JsonObject;
export declare const CONTENT_BLOCK_JSON_SCHEMA: JsonObject;
export declare const FUNCTION_CONTRACT_JSON_SCHEMA: JsonObject;
export declare const ELEMENT_REF_JSON_SCHEMA: JsonObject;
export declare const FUNCTION_REF_JSON_SCHEMA: JsonObject;
export declare const DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA: JsonObject;
export declare const DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA: JsonObject;
export declare const DOMAIN_APP_LOCK_JSON_SCHEMA: JsonObject;
/**
 * Machine-readable registry of every v011 JSON Schema document, keyed by
 * the `$id` file stem. Frozen order; consumers may compile each document
 * standalone with a draft 2020-12 validator.
 */
export declare const V011_JSON_SCHEMAS: Readonly<Record<string, JsonObject>>;
export {};
