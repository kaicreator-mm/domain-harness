import type { JsonSchema, JsonValue } from '../contracts/json.js';
import { AppContractGenerationError } from './app-contract-errors.js';
import {
  arrayValue,
  assertReferenceHasOnlyMetadataSiblings,
  assertSupportedSchema,
  isJsonObject,
  literal,
  objectValue,
  renderLiteral,
  schemaArray,
  schemaObject,
  stringArray,
  stringValue,
  toIdentifier,
} from './app-contract-schema-utils.js';

export interface SchemaRenderContext {
  readonly schemaAliases: ReadonlyMap<string, string>;
}

export function createSchemaRenderContext(
  schemas: Readonly<Record<string, JsonSchema>>,
  schemaIds: ReadonlySet<string> = new Set(Object.keys(schemas)),
): SchemaRenderContext {
  return { schemaAliases: buildSchemaAliases(schemas, schemaIds) };
}

export function renderSchemaDeclarations(
  schemas: Readonly<Record<string, JsonSchema>>,
  context: SchemaRenderContext,
  schemaIds: ReadonlySet<string>,
): string[] {
  const lines: string[] = [];
  for (const schemaId of [...schemaIds].sort()) {
    const schema = schemas[schemaId];
    if (!schema) {
      throw new AppContractGenerationError('MISSING_SCHEMA', `schemas.${schemaId}`, schemaId);
    }
    const alias = context.schemaAliases.get(schemaId);
    if (!alias) {
      throw new AppContractGenerationError(
        'MISSING_SCHEMA',
        `schemas.${schemaId}`,
        'schema alias missing',
      );
    }
    lines.push(`export type ${alias} = ${renderSchema(schema, context, `schemas.${schemaId}`)};`);
  }
  return lines;
}

export function collectNamedSchemaClosure(
  schemas: Readonly<Record<string, JsonSchema>>,
  schemaId: string,
  target: Set<string>,
  path: string,
): void {
  const schema = schemas[schemaId];
  if (!schema) {
    throw new AppContractGenerationError('MISSING_SCHEMA', path, schemaId);
  }
  if (target.has(schemaId)) return;
  target.add(schemaId);
  collectSchemaReferences(schema, schemas, target, `schemas.${schemaId}`);
}

export function collectSchemaReferences(
  schema: JsonSchema,
  schemas: Readonly<Record<string, JsonSchema>>,
  target: Set<string>,
  path: string,
): void {
  assertSupportedSchema(schema, path);

  const ref = stringValue(schema.$ref);
  if (ref !== undefined) {
    assertReferenceHasOnlyMetadataSiblings(schema, path);
    const schemaId = parseSchemaRef(ref, `${path}.$ref`);
    collectNamedSchemaClosure(schemas, schemaId, target, `${path}.$ref`);
    return;
  }

  const properties = objectValue(schema.properties);
  if (properties) {
    for (const propertyName of Object.keys(properties)) {
      collectSchemaReferences(
        schemaObject(properties[propertyName], `${path}.properties.${propertyName}`),
        schemas,
        target,
        `${path}.properties.${propertyName}`,
      );
    }
  }

  if (isJsonObject(schema.additionalProperties)) {
    collectSchemaReferences(
      schema.additionalProperties,
      schemas,
      target,
      `${path}.additionalProperties`,
    );
  }
  if (schema.items !== undefined) {
    collectSchemaReferences(
      schemaObject(schema.items, `${path}.items`),
      schemas,
      target,
      `${path}.items`,
    );
  }
  for (const keyword of ['oneOf', 'anyOf', 'allOf'] as const) {
    const members = schemaArray(schema[keyword], `${path}.${keyword}`);
    if (!members) continue;
    members.forEach((member, index) => {
      collectSchemaReferences(member, schemas, target, `${path}.${keyword}[${index}]`);
    });
  }
}

export function requireSchemaAlias(
  schemas: Readonly<Record<string, JsonSchema>>,
  context: SchemaRenderContext,
  schemaId: string,
  path: string,
): string {
  if (!schemas[schemaId]) {
    throw new AppContractGenerationError('MISSING_SCHEMA', path, schemaId);
  }
  const alias = context.schemaAliases.get(schemaId);
  if (!alias) {
    throw new AppContractGenerationError(
      'MISSING_SCHEMA',
      path,
      `${schemaId} has no generated alias`,
    );
  }
  return alias;
}

export function renderSchema(
  schema: JsonSchema,
  context: SchemaRenderContext,
  path: string,
): string {
  assertSupportedSchema(schema, path);

  const ref = stringValue(schema.$ref);
  if (ref !== undefined) {
    assertReferenceHasOnlyMetadataSiblings(schema, path);
    const schemaId = parseSchemaRef(ref, `${path}.$ref`);
    const alias = context.schemaAliases.get(schemaId);
    if (!alias) {
      throw new AppContractGenerationError('MISSING_SCHEMA', `${path}.$ref`, schemaId);
    }
    return alias;
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    return renderLiteral(schema.const as JsonValue, `${path}.const`);
  }

  const enumeration = arrayValue(schema.enum);
  if (enumeration !== undefined) {
    if (enumeration.length === 0) {
      throw new AppContractGenerationError(
        'UNSUPPORTED_SCHEMA',
        `${path}.enum`,
        'enum must not be empty',
      );
    }
    return enumeration
      .map((value, index) => renderLiteral(value, `${path}.enum[${index}]`))
      .join(' | ');
  }

  const oneOf = schemaArray(schema.oneOf, `${path}.oneOf`);
  if (oneOf) {
    assertOneOfBranchesAreDisjoint(oneOf, `${path}.oneOf`);
    return joinSchemas(oneOf, ' | ', context, `${path}.oneOf`);
  }
  const anyOf = schemaArray(schema.anyOf, `${path}.anyOf`);
  if (anyOf) return joinSchemas(anyOf, ' | ', context, `${path}.anyOf`);
  const allOf = schemaArray(schema.allOf, `${path}.allOf`);
  if (allOf) return joinSchemas(allOf, ' & ', context, `${path}.allOf`);

  const rawType = schema.type;
  if (Array.isArray(rawType)) {
    if (rawType.length === 0 || !rawType.every((entry) => typeof entry === 'string')) {
      throw new AppContractGenerationError(
        'UNSUPPORTED_SCHEMA',
        `${path}.type`,
        'type array must contain strings',
      );
    }
    return rawType.map((entry) => renderType(entry, schema, context, path)).join(' | ');
  }
  if (typeof rawType === 'string') return renderType(rawType, schema, context, path);

  return 'unknown';
}

function buildSchemaAliases(
  schemas: Readonly<Record<string, JsonSchema>>,
  schemaIds: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>();
  const reverse = new Map<string, string>();
  for (const schemaId of [...schemaIds].sort()) {
    if (!schemas[schemaId]) {
      throw new AppContractGenerationError('MISSING_SCHEMA', `schemas.${schemaId}`, schemaId);
    }
    const alias = `Schema_${toIdentifier(schemaId)}`;
    const previous = reverse.get(alias);
    if (previous) {
      throw new AppContractGenerationError(
        'DUPLICATE_CONTRACT_ID',
        `schemas.${schemaId}`,
        `schema identifiers ${previous} and ${schemaId} both normalize to ${alias}`,
      );
    }
    aliases.set(schemaId, alias);
    reverse.set(alias, schemaId);
  }
  return aliases;
}

function parseSchemaRef(ref: string, path: string): string {
  const prefix = '#/schemas/';
  if (!ref.startsWith(prefix)) {
    throw new AppContractGenerationError('INVALID_SCHEMA_REF', path, ref);
  }
  const encoded = ref.slice(prefix.length);
  if (encoded.length === 0) {
    throw new AppContractGenerationError('INVALID_SCHEMA_REF', path, ref);
  }
  try {
    const pointerToken = decodeURIComponent(encoded);
    if (pointerToken.length === 0 || pointerToken.includes('/')) {
      throw new AppContractGenerationError('INVALID_SCHEMA_REF', path, ref);
    }
    if (/~(?![01])/u.test(pointerToken)) {
      throw new AppContractGenerationError('INVALID_SCHEMA_REF', path, ref);
    }
    return pointerToken.replace(/~1/g, '/').replace(/~0/g, '~');
  } catch (error) {
    if (error instanceof AppContractGenerationError) throw error;
    throw new AppContractGenerationError('INVALID_SCHEMA_REF', path, ref);
  }
}

function renderType(
  type: string,
  schema: JsonSchema,
  context: SchemaRenderContext,
  path: string,
): string {
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'object':
      return renderObjectSchema(schema, context, path);
    case 'array':
      return renderArraySchema(schema, context, path);
    default:
      throw new AppContractGenerationError('UNSUPPORTED_SCHEMA', `${path}.type`, type);
  }
}

function renderObjectSchema(
  schema: JsonSchema,
  context: SchemaRenderContext,
  path: string,
): string {
  const properties = objectValue(schema.properties) ?? {};
  const required = stringArray(schema.required, `${path}.required`);
  const fields: string[] = [];

  for (const propertyName of Object.keys(properties).sort()) {
    const propertySchema = schemaObject(
      properties[propertyName],
      `${path}.properties.${propertyName}`,
    );
    const optional = required.has(propertyName) ? '' : '?';
    fields.push(
      `readonly ${literal(propertyName)}${optional}: ${renderSchema(
        propertySchema,
        context,
        `${path}.properties.${propertyName}`,
      )}`,
    );
  }

  const additional = schema.additionalProperties;
  if (additional === undefined || additional === true) {
    fields.push('readonly [key: string]: unknown');
  } else if (isJsonObject(additional)) {
    if (Object.keys(properties).length > 0) {
      throw new AppContractGenerationError(
        'UNSUPPORTED_SCHEMA',
        `${path}.additionalProperties`,
        'typed additionalProperties with named properties cannot be represented exactly by a TypeScript index signature',
      );
    }
    fields.push(
      `readonly [key: string]: ${renderSchema(
        additional,
        context,
        `${path}.additionalProperties`,
      )}`,
    );
  }

  return fields.length === 0
    ? 'Readonly<Record<string, never>>'
    : `{ ${fields.join('; ')} }`;
}

function renderArraySchema(
  schema: JsonSchema,
  context: SchemaRenderContext,
  path: string,
): string {
  if (schema.items === undefined) return 'readonly unknown[]';
  const itemSchema = schemaObject(schema.items, `${path}.items`);
  return `readonly (${renderSchema(itemSchema, context, `${path}.items`)})[]`;
}

function joinSchemas(
  schemas: readonly JsonSchema[],
  separator: string,
  context: SchemaRenderContext,
  path: string,
): string {
  if (schemas.length === 0) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      path,
      'schema composition must not be empty',
    );
  }
  return schemas
    .map((entry, index) => `(${renderSchema(entry, context, `${path}[${index}]`)})`)
    .join(separator);
}

function assertOneOfBranchesAreDisjoint(
  schemas: readonly JsonSchema[],
  path: string,
): void {
  if (schemas.length === 0) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      path,
      'oneOf must contain at least one schema',
    );
  }
  if (schemas.length === 1) return;

  const first = schemas[0];
  if (!first) return;
  assertSupportedSchema(first, `${path}[0]`);
  if (first.type !== 'object') {
    throwOneOfDisjointness(path);
  }

  const firstProperties = objectValue(first.properties) ?? {};
  const firstRequired = stringArray(first.required, `${path}[0].required`);
  const candidateKeys = [...firstRequired].filter((propertyName) =>
    hasPrimitiveConst(firstProperties[propertyName]),
  );

  for (const propertyName of candidateKeys) {
    const seen = new Set<string>();
    let disjoint = true;

    for (const [index, member] of schemas.entries()) {
      assertSupportedSchema(member, `${path}[${index}]`);
      if (member.type !== 'object') {
        disjoint = false;
        break;
      }
      const required = stringArray(member.required, `${path}[${index}].required`);
      const properties = objectValue(member.properties) ?? {};
      const propertySchemaValue = properties[propertyName];
      if (!required.has(propertyName) || !hasPrimitiveConst(propertySchemaValue)) {
        disjoint = false;
        break;
      }
      const propertySchema = propertySchemaValue as JsonSchema;
      const discriminator = JSON.stringify(propertySchema.const);
      if (discriminator === undefined || seen.has(discriminator)) {
        disjoint = false;
        break;
      }
      seen.add(discriminator);
    }

    if (disjoint) return;
  }

  throwOneOfDisjointness(path);
}

function hasPrimitiveConst(value: JsonValue | undefined): value is JsonSchema {
  if (!isJsonObject(value) || !Object.prototype.hasOwnProperty.call(value, 'const')) {
    return false;
  }
  const constValue = value.const;
  return constValue === null || typeof constValue !== 'object';
}

function throwOneOfDisjointness(path: string): never {
  throw new AppContractGenerationError(
    'UNSUPPORTED_SCHEMA',
    path,
    'oneOf branches must be provably disjoint through a shared required primitive const discriminator',
  );
}
