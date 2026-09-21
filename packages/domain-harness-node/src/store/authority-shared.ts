import { canonicalJsonStringify } from '@kaicreator/domain-harness';
import type { JsonValue } from '@kaicreator/domain-harness/v2';
import type { NodeSqliteStatement } from './migrations.js';

/**
 * Structural view of the better-sqlite3 handle shared by the T-022 authority
 * stores. Declared structurally so published .d.ts files never require
 * consumers to resolve @types/better-sqlite3 (the handle itself is supplied by
 * the factory, which keeps the concrete type private).
 */
export interface AuthoritySqliteDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): NodeSqliteStatement;
  transaction<F>(fn: () => F): { immediate(): F };
}

export function encodeJson(value: JsonValue, label: string): string {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch (error) {
    throw new TypeError(`${label} must be JSON-serializable`, { cause: error });
  }
  if (encoded === undefined) {
    throw new TypeError(`${label} must be JSON-serializable`);
  }
  return encoded;
}

export function decodeJson<T>(encoded: string, label: string): T {
  try {
    return JSON.parse(encoded) as T;
  } catch (error) {
    throw new Error(`Corrupt JSON in ${label}`, { cause: error });
  }
}

/** Canonical JSON text of a plain-JSON value (stable key order for byte equality). */
export function canonicalText(value: JsonValue, label: string): string {
  return canonicalJsonStringify(decodeJson<JsonValue>(encodeJson(value, label), label));
}

/** Deep clone through canonical JSON (drops key-order noise, matches core cloneCanonical). */
export function cloneCanonical<T>(value: T, label: string): T {
  return decodeJson<T>(canonicalText(value as JsonValue, label), label);
}
