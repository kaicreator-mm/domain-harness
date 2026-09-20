import type { JsonValue } from './json.js';

/** Portable SHA-256 capability. Hosts provide the concrete implementation. */
export interface Sha256Port {
  digestUtf8(value: string): Promise<string>;
}

/** Immutable content-addressed semantic identity component. */
export type ContentDigest = string;

/**
 * Small shared identity shape used by v0.3 contracts that need an exact
 * schema-versioned semantic body. Domain-specific identities extend this
 * shape rather than inventing a second digest convention.
 */
export interface ExactContentIdentity {
  readonly schemaVersion: string;
  readonly contentDigest: ContentDigest;
}

export type IdentityContractErrorCode =
  | 'INVALID_CANONICAL_JSON'
  | 'INVALID_CONTENT_DIGEST';

export class IdentityContractError extends Error {
  readonly code: IdentityContractErrorCode;

  constructor(code: IdentityContractErrorCode, message: string) {
    super(message);
    this.name = 'IdentityContractError';
    this.code = code;
  }
}

function failCanonical(path: string, reason: string): never {
  throw new IdentityContractError(
    'INVALID_CANONICAL_JSON',
    `cannot canonicalize ${path}: ${reason}`,
  );
}

function assertNoSymbolKeys(value: object, path: string): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    failCanonical(path, 'symbol-keyed properties are not JSON');
  }
}

function canonicalize(value: unknown, path: string, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) failCanonical(path, 'number must be finite');
    return value;
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) failCanonical(path, 'circular reference');
    assertNoSymbolKeys(value, path);
    ancestors.add(value);

    const result: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        failCanonical(`${path}[${index}]`, 'sparse array entries are not canonical JSON');
      }
      result.push(canonicalize(value[index], `${path}[${index}]`, ancestors));
    }

    const unexpectedKeys = Object.keys(value).filter((key) => {
      if (!/^(0|[1-9]\d*)$/.test(key)) return true;
      const index = Number(key);
      return !Number.isSafeInteger(index) || index < 0 || index >= value.length;
    });
    if (unexpectedKeys.length > 0) {
      failCanonical(path, 'arrays may not carry extra object properties');
    }

    ancestors.delete(value);
    return result;
  }

  if (typeof value === 'object' && value !== null) {
    if (ancestors.has(value)) failCanonical(path, 'circular reference');
    assertNoSymbolKeys(value, path);
    ancestors.add(value);

    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        ancestors,
      );
    }

    ancestors.delete(value);
    return result;
  }

  failCanonical(path, `unsupported value type ${typeof value}`);
}

/**
 * Convert JSON-compatible semantic material into a deterministic structure.
 * Object keys are sorted recursively; array order is preserved.
 */
export function canonicalizeJson(value: unknown): JsonValue {
  return canonicalize(value, '$', new Set<object>());
}

/** Deterministic UTF-8 material used as input to content-addressed digests. */
export function canonicalJsonStringify(value: unknown): string {
  const encoded = JSON.stringify(canonicalizeJson(value));
  if (encoded === undefined) failCanonical('$', 'value did not produce JSON text');
  return encoded;
}

/** Compute a canonical SHA-256 content digest through the portable host seam. */
export async function computeCanonicalJsonDigest(
  value: unknown,
  sha256: Sha256Port,
): Promise<ContentDigest> {
  const digest = await sha256.digestUtf8(canonicalJsonStringify(value));
  if (typeof digest !== 'string' || digest.length === 0) {
    throw new IdentityContractError(
      'INVALID_CONTENT_DIGEST',
      'Sha256Port returned an empty or invalid content digest',
    );
  }
  return digest;
}

export function isContentDigest(value: unknown): value is ContentDigest {
  return typeof value === 'string' && value.length > 0;
}
