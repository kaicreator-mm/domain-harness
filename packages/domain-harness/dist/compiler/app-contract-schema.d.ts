import type { JsonSchema } from '../contracts/json.js';
export interface SchemaRenderContext {
    readonly schemaAliases: ReadonlyMap<string, string>;
}
export declare function createSchemaRenderContext(schemas: Readonly<Record<string, JsonSchema>>, schemaIds?: ReadonlySet<string>): SchemaRenderContext;
export declare function renderSchemaDeclarations(schemas: Readonly<Record<string, JsonSchema>>, context: SchemaRenderContext, schemaIds: ReadonlySet<string>): string[];
export declare function collectNamedSchemaClosure(schemas: Readonly<Record<string, JsonSchema>>, schemaId: string, target: Set<string>, path: string): void;
export declare function collectSchemaReferences(schema: JsonSchema, schemas: Readonly<Record<string, JsonSchema>>, target: Set<string>, path: string): void;
export declare function requireSchemaAlias(schemas: Readonly<Record<string, JsonSchema>>, context: SchemaRenderContext, schemaId: string, path: string): string;
export declare function renderSchema(schema: JsonSchema, context: SchemaRenderContext, path: string): string;
//# sourceMappingURL=app-contract-schema.d.ts.map