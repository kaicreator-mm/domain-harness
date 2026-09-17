import type { ErrorObject, ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';

import type { JsonSchema, JsonValue } from '../contracts/json.js';
import { ExecutorError, type ExecutorErrorCode } from './executor-error.js';

export class SchemaValidator {
  private readonly ajv = new Ajv2020({ strict: true, allErrors: true });
  private readonly cache = new WeakMap<object, ValidateFunction>();

  validate(
    schema: JsonSchema | undefined,
    value: unknown,
    code: Extract<ExecutorErrorCode, 'invalid_input' | 'invalid_output'>,
    label: string,
  ): JsonValue {
    assertPortableJson(value, code, label);
    if (!schema) return value;

    let validate = this.cache.get(schema);
    if (!validate) {
      validate = this.ajv.compile(schema);
      this.cache.set(schema, validate);
    }

    if (!validate(value)) {
      throw new ExecutorError(code, `${label} does not satisfy JSON Schema: ${formatAjvErrors(validate.errors)}`);
    }
    return value;
  }
}

export function assertPortableJson(
  value: unknown,
  code: Extract<ExecutorErrorCode, 'invalid_input' | 'invalid_output'>,
  label: string,
): asserts value is JsonValue {
  if (isJsonValue(value)) return;
  throw new ExecutorError(code, `${label} must be a portable JSON value`);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) return 'validation failed';
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword}`)
    .join('; ');
}
