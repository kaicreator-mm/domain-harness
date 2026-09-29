import type { ErrorObject, ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidSchema(message: string, details: readonly string[] = []): never {
  throw new DomainHarnessJsonSchemaV1Error('INVALID_SCHEMA_CONTRACT', message, details);
}

function inspectSchemaContract(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSchemaContract(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;

  if (Object.prototype.hasOwnProperty.call(value, '$schema')) {
    if (value.$schema !== JSON_SCHEMA_DRAFT_2020_12_URI) {
      invalidSchema(
        `${path}.$schema must be omitted or exactly ${JSON_SCHEMA_DRAFT_2020_12_URI}`,
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, '$ref')) {
    if (typeof value.$ref !== 'string' || !value.$ref.startsWith('#')) {
      invalidSchema(`${path}.$ref must be a package-local fragment reference`);
    }
  }

  // The frozen v1 profile is self-contained. Dynamic vocabulary negotiation
  // would make accept/reject behavior depend on external vocabulary support.
  if (Object.prototype.hasOwnProperty.call(value, '$vocabulary')) {
    invalidSchema(`${path}.$vocabulary is forbidden by ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`);
  }

  for (const [key, child] of Object.entries(value)) {
    inspectSchemaContract(child, `${path}.${key}`);
  }
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors?.length) return ['validation failed'];
  return errors.map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword}`);
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

/**
 * Authoritative Mode-A interpreter for `domainharness-json-schema/1`.
 *
 * Ajv is instantiated per unique canonical schema so `$id` registration in one
 * package cannot affect another package. `validateFormats:false` freezes
 * `format` as annotation-only for v1. Strict compilation rejects unknown/custom
 * keywords; no async loader is installed, so external refs cannot be fetched.
 */
export class DomainHarnessJsonSchemaV1Validator {
  private readonly compiled = new Map<string, ValidateFunction>();

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
    inspectSchemaContract(normalized, '$');

    // Compile now so malformed schemas, unsupported/custom keywords and
    // unresolved refs fail at contract admission rather than first data read.
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
    const validate = this.compileCanonical(schemaText, normalizedSchema);
    if (!validate(snapshot)) {
      throw new DomainHarnessJsonSchemaV1Error(
        'INSTANCE_VALIDATION_FAILED',
        `${label} does not satisfy ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`,
        formatErrors(validate.errors),
      );
    }
    return snapshot;
  }

  private compileCanonical(canonicalText: string, schema: JsonSchema): ValidateFunction {
    const cached = this.compiled.get(canonicalText);
    if (cached) return cached;

    try {
      const ajv = new Ajv2020({
        strict: true,
        allErrors: true,
        validateFormats: false,
      });
      const validate = ajv.compile(schema);
      this.compiled.set(canonicalText, validate);
      return validate;
    } catch (error) {
      invalidSchema(`schema is not valid under ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`, [
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }
}
