import { ScriptExecutorError, type JsonValue } from './types.js';

export function serializePortableJson(value: unknown, label: string): string {
  if (!isPortableJson(value)) {
    throw new ScriptExecutorError('invalid_json', `${label} is not a portable JSON value`);
  }
  return JSON.stringify(value);
}

export function parsePortableJson(serialized: string, label: string): JsonValue {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new ScriptExecutorError('invalid_json', `${label} is not valid JSON`, error);
  }
  if (!isPortableJson(value)) {
    throw new ScriptExecutorError('invalid_json', `${label} is not a portable JSON value`);
  }
  return value;
}

function isPortableJson(value: unknown, active = new WeakSet<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (active.has(value)) return false;
  active.add(value);
  try {
    if (Array.isArray(value)) return value.every((item) => isPortableJson(item, active));
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(value as Record<string, unknown>).every((item) => isPortableJson(item, active));
  } finally {
    active.delete(value);
  }
}
