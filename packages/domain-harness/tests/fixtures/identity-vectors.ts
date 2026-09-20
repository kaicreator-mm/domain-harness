import type { JsonValue } from '../../src/v2/index.js';

export interface CanonicalSha256Vector {
  readonly name: string;
  readonly input: JsonValue;
  readonly canonicalUtf8: string;
  readonly sha256: string;
}

/**
 * Host-independent canonicalization/SHA-256 vectors.
 * Node and Expo host validation must use these same values when proving digest parity.
 */
export const CANONICAL_SHA256_VECTORS: readonly CanonicalSha256Vector[] = [
  {
    name: 'nested-key-order-and-array-order',
    input: {
      z: 'last',
      list: [3, 2, 1],
      a: { y: 2, x: 1 },
    },
    canonicalUtf8: '{"a":{"x":1,"y":2},"list":[3,2,1],"z":"last"}',
    sha256: '982372ebe3835ab6ea9d78e05f08e0c65a31edb00cf047de470a82c7a118e98b',
  },
  {
    name: 'unicode-and-escaped-newline',
    input: {
      zero: 0,
      newline: 'a\nb',
      myanmar: 'မြန်မာ',
      emoji: '🙂',
    },
    canonicalUtf8: '{"emoji":"🙂","myanmar":"မြန်မာ","newline":"a\\nb","zero":0}',
    sha256: '16704edbeb0a6149e972115eb5554a3248514ef8dc94c99a6726f44fcf3d1c5f',
  },
];
