import type { JsonObject, JsonSchema, JsonValue } from '../contracts/json.js';
import { AppContractGenerationError } from './app-contract-errors.js';

const METADATA_SCHEMA_KEYWORDS = new Set([
  '$id',
  '$schema',
  'title',
  'description',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
]);

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$ref',
  ...METADATA_SCHEMA_KEYWORDS,
  'type',
  'enum',
  'const',
  'oneOf',
  'anyOf',
  'allOf',
  'properties',
  'required',
  'additionalProperties',
  'items',
]);

export function assertReferenceHasOnlyMetadataSiblings(
  schema: JsonSchema,
  path: string,
): void {
  for (const key of Object.keys(schema)) {
    if (key !== '$ref' && !METADATA_SCHEMA_KEYWORDS.has(key)) {
      throw new AppContractGenerationError(
        'UNSUPPORTED_SCHEMA',
        `${path}.${key}`,
        'constraint sibling beside $ref is not supported for exact TypeScript generation',
      );
    }
  }
}

export function assertSupportedSchema(schema: JsonSchema, path: string): void {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(keyword)) {
      throw new AppContractGenerationError(
        'UNSUPPORTED_SCHEMA',
        `${path}.${keyword}`,
        'keyword is not represented by the generated TypeScript contract',
      );
    }
  }

  if (schema.$ref !== undefined && typeof schema.$ref !== 'string') {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      `${path}.$ref`,
      'expected string reference',
    );
  }

  const rawType = schema.type;
  if (
    rawType !== undefined &&
    typeof rawType !== 'string' &&
    (!Array.isArray(rawType) ||
      rawType.length === 0 ||
      !rawType.every((entry) => typeof entry === 'string'))
  ) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      `${path}.type`,
      'expected a type string or non-empty string array',
    );
  }

  if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      `${path}.enum`,
      'expected array',
    );
  }

  if (schema.properties !== undefined && !isJsonObject(schema.properties)) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      `${path}.properties`,
      'expected object',
    );
  }

  if (schema.required !== undefined) {
    stringArray(schema.required, `${path}.required`);
  }

  if (
    schema.additionalProperties !== undefined &&
    typeof schema.additionalProperties !== 'boolean' &&
    !isJsonObject(schema.additionalProperties)
  ) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      `${path}.additionalProperties`,
      'expected boolean or schema object',
    );
  }

  if (schema.items !== undefined && !isJsonObject(schema.items)) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      `${path}.items`,
      'expected schema object',
    );
  }

  for (const keyword of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (schema[keyword] !== undefined && !Array.isArray(schema[keyword])) {
      throw new AppContractGenerationError(
        'UNSUPPORTED_SCHEMA',
        `${path}.${keyword}`,
        'expected schema array',
      );
    }
  }

  const semanticKeys = Object.keys(schema).filter(
    (key) => !METADATA_SCHEMA_KEYWORDS.has(key),
  );

  if (schema.$ref !== undefined) {
    assertOnlySemanticKeys(semanticKeys, ['$ref'], path);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    assertOnlySemanticKeys(
      semanticKeys,
      rawType === undefined ? ['const'] : ['type', 'const'],
      path,
    );
    if (rawType !== undefined) {
      assertLiteralMatchesType(schema.const, rawType, `${path}.const`);
    }
    return;
  }

  if (schema.enum !== undefined) {
    assertOnlySemanticKeys(
      semanticKeys,
      rawType === undefined ? ['enum'] : ['type', 'enum'],
      path,
    );
    if (rawType !== undefined) {
      schema.enum.forEach((value, index) => {
        assertLiteralMatchesType(value, rawType, `${path}.enum[${index}]`);
      });
    }
    return;
  }

  const compositionKeys = (['oneOf', 'anyOf', 'allOf'] as const).filter(
    (key) => schema[key] !== undefined,
  );
  if (compositionKeys.length > 0) {
    if (compositionKeys.length !== 1) {
      throw new AppContractGenerationError(
        'UNSUPPORTED_SCHEMA',
        path,
        'multiple composition keywords cannot be represented without changing schema semantics',
      );
    }
    const compositionKey = compositionKeys[0];
    if (compositionKey === undefined) {
      throw new AppContractGenerationError(
        'UNSUPPORTED_SCHEMA',
        path,
        'composition keyword missing',
      );
    }
    assertOnlySemanticKeys(semanticKeys, [compositionKey], path);
    return;
  }

  if (rawType === undefined) {
    if (semanticKeys.length > 0) {
      throw new AppContractGenerationError(
        'UNSUPPORTED_SCHEMA',
        `${path}.${semanticKeys[0]}`,
        'structural keywords require an explicit supported type',
      );
    }
    return;
  }

  if (Array.isArray(rawType)) {
    assertOnlySemanticKeys(semanticKeys, ['type'], path);
    for (const type of rawType) {
      assertKnownType(type, `${path}.type`);
    }
    return;
  }

  switch (rawType) {
    case 'object': {
      assertOnlySemanticKeys(
        semanticKeys,
        ['type', 'properties', 'required', 'additionalProperties'],
        path,
      );
      const properties = objectValue(schema.properties) ?? {};
      const required = stringArray(schema.required, `${path}.required`);
      for (const propertyName of required) {
        if (!Object.prototype.hasOwnProperty.call(properties, propertyName)) {
          throw new AppContractGenerationError(
            'UNSUPPORTED_SCHEMA',
            `${path}.required`,
            `required property ${JSON.stringify(propertyName)} has no explicit property schema`,
          );
        }
      }
      return;
    }
    case 'array':
      assertOnlySemanticKeys(semanticKeys, ['type', 'items'], path);
      return;
    case 'string':
    case 'number':
    case 'integer':
    case 'boolean':
    case 'null':
      assertOnlySemanticKeys(semanticKeys, ['type'], path);
      return;
    default:
      throw new AppContractGenerationError(
        'UNSUPPORTED_SCHEMA',
        `${path}.type`,
        rawType,
      );
  }
}

export function schemaArray(
  value: JsonValue | undefined,
  path: string,
): readonly JsonSchema[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new AppContractGenerationError('UNSUPPORTED_SCHEMA', path, 'expected schema array');
  }
  return value.map((entry, index) => schemaObject(entry, `${path}[${index}]`));
}

export function schemaObject(value: JsonValue | undefined, path: string): JsonSchema {
  if (!isJsonObject(value)) {
    throw new AppContractGenerationError('UNSUPPORTED_SCHEMA', path, 'expected schema object');
  }
  return value;
}

export function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

export function arrayValue(value: JsonValue | undefined): readonly JsonValue[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

export function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function stringArray(value: JsonValue | undefined, path: string): ReadonlySet<string> {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new AppContractGenerationError('UNSUPPORTED_SCHEMA', path, 'expected string array');
  }
  return new Set(value);
}

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function renderLiteral(value: JsonValue | undefined, path: string): string {
  if (value === undefined || (typeof value === 'object' && value !== null)) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      path,
      'only primitive const/enum values are supported',
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      path,
      'non-finite numbers are not portable JSON literals',
    );
  }
  return literal(value);
}

export function literal(value: string | number | boolean | null): string {
  return JSON.stringify(value);
}

export function toIdentifier(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_$]/g, '_');
  if (normalized.length === 0) return '_';
  return /^[A-Za-z_$]/.test(normalized) ? normalized : `_${normalized}`;
}

function assertOnlySemanticKeys(
  actual: readonly string[],
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unsupported = actual.find((key) => !allowedSet.has(key));
  if (unsupported !== undefined) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      `${path}.${unsupported}`,
      `keyword combination cannot be represented exactly with ${allowed.join(' + ') || 'metadata-only'} semantics`,
    );
  }
}

function assertLiteralMatchesType(
  value: JsonValue | undefined,
  declaredType: JsonValue,
  path: string,
): void {
  const types = Array.isArray(declaredType) ? declaredType : [declaredType];
  if (!types.every((entry) => typeof entry === 'string')) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      path,
      'declared type must contain strings',
    );
  }
  if (!types.some((type) => jsonValueMatchesType(value, type))) {
    throw new AppContractGenerationError(
      'UNSUPPORTED_SCHEMA',
      path,
      'literal is incompatible with its declared JSON Schema type',
    );
  }
}

function jsonValueMatchesType(value: JsonValue | undefined, type: string): boolean {
  switch (type) {
    case 'null':
      return value === null;
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isJsonObject(value);
    default:
      return false;
  }
}

function assertKnownType(type: string, path: string): void {
  if (!['null', 'string', 'boolean', 'number', 'integer', 'array', 'object'].includes(type)) {
    throw new AppContractGenerationError('UNSUPPORTED_SCHEMA', path, type);
  }
}
