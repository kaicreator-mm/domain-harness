import { canonicalJsonStringify } from '@kaicreator/domain-harness';
import type { JsonValue } from '@kaicreator/domain-harness/v2';

/**
 * Pure canonical-JSON helpers shared by the T-023 Expo SQLite authority
 * stores. Identical semantics to the T-022 Node authority-shared helpers;
 * duplicated rather than imported cross-host because the Node package is not
 * a dependency of the Expo package (and must never become one — E7).
 */
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
