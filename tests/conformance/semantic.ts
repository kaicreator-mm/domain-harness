import type { JsonValue } from './contracts.ts';

/** Portable deterministic comparison without Node/Expo assertion helpers. */
export function assertSemanticEqual(actual: unknown, expected: unknown, label: string): void {
  const actualText = stableStringify(actual);
  const expectedText = stableStringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${label} semantic mismatch\nexpected: ${expectedText}\nactual:   ${actualText}`);
  }
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Conformance observations must contain finite numbers');
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const sorted = sortValue(entry);
      if (sorted === undefined) throw new Error('Conformance observations must not contain undefined array entries');
      return sorted;
    });
  }
  if (typeof value !== 'object') {
    throw new Error(`Conformance observations must be portable JSON, received ${typeof value}`);
  }

  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const sorted = sortValue((value as Record<string, unknown>)[key]);
    if (sorted !== undefined) result[key] = sorted;
  }
  return result;
}
