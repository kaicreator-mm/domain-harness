export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export interface JsonObject {
    [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
/** Portable JSON Schema documents are JSON values at the SDK boundary. */
export type JsonSchema = JsonObject;
//# sourceMappingURL=json.d.ts.map