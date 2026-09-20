import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IdentityContractError,
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  type Sha256Port,
} from '../../src/v2/index.js';
import { CANONICAL_SHA256_VECTORS } from '../fixtures/identity-vectors.js';

test('T-001: canonical JSON recursively sorts object keys and preserves array order', () => {
  assert.equal(
    canonicalJsonStringify({
      z: 'last',
      list: [3, 2, 1],
      a: { y: 2, x: 1 },
    }),
    '{"a":{"x":1,"y":2},"list":[3,2,1],"z":"last"}',
  );

  assert.notEqual(
    canonicalJsonStringify({ list: [3, 2, 1] }),
    canonicalJsonStringify({ list: [1, 2, 3] }),
  );
});

test('T-001: equivalent objects with different insertion order produce identical material', () => {
  const left = {
    domain: 'orders',
    policy: { b: 2, a: 1 },
    flags: [true, false],
  };
  const right = {
    flags: [true, false],
    policy: { a: 1, b: 2 },
    domain: 'orders',
  };

  assert.equal(canonicalJsonStringify(left), canonicalJsonStringify(right));
});

test('T-001: canonical SHA-256 seam consumes the frozen cross-host vector material', async () => {
  for (const vector of CANONICAL_SHA256_VECTORS) {
    const sha256: Sha256Port = {
      async digestUtf8(value: string): Promise<string> {
        assert.equal(value, vector.canonicalUtf8, vector.name);
        return vector.sha256;
      },
    };

    assert.equal(await computeCanonicalJsonDigest(vector.input, sha256), vector.sha256, vector.name);
  }
});

test('T-001: invalid or lossy semantic material fails closed', () => {
  const symbolKeyed: Record<string | symbol, unknown> = { ok: true };
  symbolKeyed[Symbol('hidden')] = 'not-json';

  const sparse: unknown[] = [];
  sparse.length = 2;
  sparse[1] = 'present';

  const arrayWithExtraProperty = [1] as unknown[] & { extra?: string };
  arrayWithExtraProperty.extra = 'not-json-array-data';

  const invalidValues: unknown[] = [
    { missing: undefined },
    { fn: () => undefined },
    { symbol: Symbol('value') },
    { bigint: 1n },
    { bad: Number.NaN },
    { bad: Number.POSITIVE_INFINITY },
    symbolKeyed,
    sparse,
    arrayWithExtraProperty,
  ];

  for (const value of invalidValues) {
    assert.throws(
      () => canonicalJsonStringify(value),
      (error: unknown) =>
        error instanceof IdentityContractError && error.code === 'INVALID_CANONICAL_JSON',
    );
  }
});

test('T-001: circular semantic material fails closed', () => {
  const value: Record<string, unknown> = { ok: true };
  value.self = value;

  assert.throws(
    () => canonicalJsonStringify(value),
    (error: unknown) =>
      error instanceof IdentityContractError && error.code === 'INVALID_CANONICAL_JSON',
  );
});

test('T-001: an invalid digest response from the host seam fails closed', async () => {
  const sha256: Sha256Port = {
    async digestUtf8(): Promise<string> {
      return '';
    },
  };

  await assert.rejects(
    computeCanonicalJsonDigest({ a: 1 }, sha256),
    (error: unknown) =>
      error instanceof IdentityContractError && error.code === 'INVALID_CONTENT_DIGEST',
  );
});
