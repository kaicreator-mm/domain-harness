import { compileSchema, draft2020 } from 'json-schema-library';

import { canonicalJsonStringify } from '../contracts/identity.js';
import type { JsonSchema, JsonValue } from '../contracts/json.js';

export const DOMAIN_HARNESS_JSON_SCHEMA_V1 = 'domainharness-json-schema/1' as const;
export const JSON_SCHEMA_DRAFT_2020_12_URI = 'https://json-schema.org/draft/2020-12/schema' as const;

export type DomainHarnessJsonSchemaContractVersion = typeof DOMAIN_HARNESS_JSON_SCHEMA_V1;

export type DomainHarnessJsonSchemaV1ErrorCode =
  | 'INVALID_SCHEMA_CONTRACT'
  | 'INSTANCE_VALIDATION_FAILED';

export class DomainHarnessJsonSchemaV1Error extends Error {
  constructor(
    readonly code: DomainHarnessJsonSchemaV1ErrorCode,
    message: string,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'DomainHarnessJsonSchemaV1Error';
  }
}

const DRAFT_2020_12_KEYWORDS = new Set([
  '$schema', '$id', '$ref', '$anchor', '$dynamicRef', '$dynamicAnchor', '$defs', '$comment',
  'prefixItems', 'items', 'contains', 'additionalProperties', 'properties', 'patternProperties',
  'dependentSchemas', 'propertyNames', 'if', 'then', 'else', 'allOf', 'anyOf', 'oneOf', 'not',
  'unevaluatedItems', 'unevaluatedProperties',
  'type', 'const', 'enum', 'multipleOf', 'maximum', 'exclusiveMaximum', 'minimum', 'exclusiveMinimum',
  'maxLength', 'minLength', 'pattern', 'maxItems', 'minItems', 'uniqueItems', 'maxContains',
  'minContains', 'maxProperties', 'minProperties', 'required', 'dependentRequired',
  'title', 'description', 'default', 'deprecated', 'readOnly', 'writeOnly', 'examples',
  'format', 'contentEncoding', 'contentMediaType', 'contentSchema',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidSchema(message: string, details: readonly string[] = []): never {
  throw new DomainHarnessJsonSchemaV1Error('INVALID_SCHEMA_CONTRACT', message, details);
}

function inspectActualSchemaNode(value: unknown, path: string): void {
  if (!isRecord(value)) return;

  for (const key of Object.keys(value)) {
    if (key === '$vocabulary') {
      invalidSchema(`${path}.$vocabulary is forbidden by ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`);
    }
    if (!DRAFT_2020_12_KEYWORDS.has(key)) {
      invalidSchema(`${path} contains unknown/custom keyword '${key}'`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, '$schema')
    && value.$schema !== JSON_SCHEMA_DRAFT_2020_12_URI) {
    invalidSchema(
      `${path}.$schema must be omitted or exactly ${JSON_SCHEMA_DRAFT_2020_12_URI}`,
    );
  }

  for (const keyword of ['$ref', '$dynamicRef'] as const) {
    if (!Object.prototype.hasOwnProperty.call(value, keyword)) continue;
    const reference = value[keyword];
    if (typeof reference !== 'string' || !reference.startsWith('#')) {
      invalidSchema(`${path}.${keyword} must be a package-local fragment reference`);
    }
  }
}

function validationErrorDetails(errors: readonly { readonly message?: string; readonly data?: { readonly pointer?: string } }[]): string[] {
  if (errors.length === 0) return ['validation failed'];
  return errors.map((error) => `${error.data?.pointer ?? '#'} ${error.message ?? 'validation failed'}`);
}

/** Portable UTF-8 byte length without Node Buffer/TextEncoder dependencies. */
export function portableUtf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit < 0x80) {
      bytes += 1;
      continue;
    }
    if (codeUnit < 0x800) {
      bytes += 2;
      continue;
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
        continue;
      }
    }
    bytes += 3;
  }
  return bytes;
}

export function canonicalSchemaUtf8ByteLength(schema: JsonSchema): number {
  return portableUtf8ByteLength(canonicalJsonStringify(schema));
}

type CompiledPortableSchema = ReturnType<typeof compileSchema>;

/**
 * Authoritative Mode-A portable interpreter for `domainharness-json-schema/1`.
 *
 * The pinned interpreter executes the schema directly and does not use Ajv's
 * runtime `Function` code generation path. DomainHarness owns the exact profile
 * restrictions around the interpreter so package identity is not delegated to
 * library defaults.
 */
export class DomainHarnessJsonSchemaV1Validator {
  private readonly compiled = new Map<string, CompiledPortableSchema>();

  normalizeSchema(value: unknown): JsonSchema {
    let canonicalText: string;
    try {
      canonicalText = canonicalJsonStringify(value);
    } catch (error) {
      invalidSchema('schema must be canonical portable JSON', [
        error instanceof Error ? error.message : String(error),
      ]);
    }

    const normalized = JSON.parse(canonicalText) as unknown;
    if (!isRecord(normalized)) invalidSchema('schema root must be a JSON object');
    if (Object.prototype.hasOwnProperty.call(normalized, '$schema')
      && normalized.$schema !== JSON_SCHEMA_DRAFT_2020_12_URI) {
      invalidSchema(`$.$schema must be omitted or exactly ${JSON_SCHEMA_DRAFT_2020_12_URI}`);
    }
    this.compileCanonical(canonicalText, normalized as JsonSchema);
    return normalized as JsonSchema;
  }

  validate(schema: JsonSchema, value: unknown, label: string): JsonValue {
    const normalizedSchema = this.normalizeSchema(schema);
    const schemaText = canonicalJsonStringify(normalizedSchema);

    let valueText: string;
    try {
      valueText = canonicalJsonStringify(value);
    } catch (error) {
      throw new DomainHarnessJsonSchemaV1Error(
        'INSTANCE_VALIDATION_FAILED',
        `${label} must be canonical portable JSON`,
        [error instanceof Error ? error.message : String(error)],
      );
    }

    const snapshot = JSON.parse(valueText) as JsonValue;
    const compiled = this.compileCanonical(schemaText, normalizedSchema);
    const result = compiled.validate(snapshot);
    if (!result.valid) {
      throw new DomainHarnessJsonSchemaV1Error(
        'INSTANCE_VALIDATION_FAILED',
        `${label} does not satisfy ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`,
        validationErrorDetails(result.errors),
      );
    }
    return snapshot;
  }

  private compileCanonical(canonicalText: string, schema: JsonSchema): CompiledPortableSchema {
    const cached = this.compiled.get(canonicalText);
    if (cached) return cached;

    try {
      const compiled = compileSchema(schema as never, {
        drafts: [draft2020],
        formatAssertion: false,
        throwOnInvalidSchema: true,
        throwOnInvalidRef: true,
        withSchemaAnnotations: true,
      });

      for (const node of compiled.toSchemaNodes()) {
        inspectActualSchemaNode(node.schema, node.schemaLocation ?? '#');
      }
      const unknownAnnotations = compiled.schemaAnnotations.filter(
        (annotation) => annotation.code === 'unknown-keyword-warning',
      );
      if (unknownAnnotations.length > 0) {
        invalidSchema('schema contains unknown/custom keywords', unknownAnnotations.map(
          (annotation) => annotation.message,
        ));
      }

      this.compiled.set(canonicalText, compiled);
      return compiled;
    } catch (error) {
      if (error instanceof DomainHarnessJsonSchemaV1Error) throw error;
      invalidSchema(`schema is not valid under ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`, [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }
}
