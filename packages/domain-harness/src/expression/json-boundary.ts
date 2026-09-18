import type { JsonValue } from '../contracts/json.js';

export function isPortableJsonValue(value: unknown): value is JsonValue {
  return isPortableJsonValueInternal(value, new WeakSet<object>());
}

function isPortableJsonValueInternal(value: unknown, ancestors: WeakSet<object>): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;

  if (ancestors.has(value)) return false;
  ancestors.add(value);

  let valid: boolean;
  if (Array.isArray(value)) {
    valid = value.every((item) => isPortableJsonValueInternal(item, ancestors));
  } else {
    const prototype = Object.getPrototypeOf(value);
    valid =
      (prototype === Object.prototype || prototype === null) &&
      Object.values(value as Record<string, unknown>).every((item) =>
        isPortableJsonValueInternal(item, ancestors),
      );
  }

  ancestors.delete(value);
  return valid;
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}
