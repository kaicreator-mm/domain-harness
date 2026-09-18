import { ScriptExecutorError, type JsonValue } from './types.js';

export function clonePortableJson(value: unknown, label: string): JsonValue {
  if (!isPortableJson(value)) {
    throw new ScriptExecutorError('invalid_json', `${label} is not a portable JSON value`);
  }
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function isPortableJson(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPortableJson);
  if (typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value as Record<string, unknown>).every(isPortableJson);
}
