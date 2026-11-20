/**
 * DomainHarness v0.11.0 T03 (#1577) — runtime guard unit tests
 * (DeepSeek REWORK P2 set).
 *
 * Pure counterexamples against the minimal JSON Schema subset validator
 * and the strict plain-JSON value guard — no fixtures, no boot.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlainJsonValue,
  validateJsonSubset,
} from '../../src/v011/schema-subset.js';

test('additionalProperties:false with no properties accepts only the empty object', () => {
  const schema = { type: 'object', additionalProperties: false };
  assert.equal(validateJsonSubset({}, schema), true);
  assert.equal(validateJsonSubset({ a: 1 }, schema), false, 'any key is additional when properties is absent');
  assert.equal(validateJsonSubset({ a: undefined }, schema), false);
});

test('unknown schema type matches nothing (fail closed)', () => {
  assert.equal(validateJsonSubset('text', { type: 'funky' }), false);
  assert.equal(validateJsonSubset({ a: 1 }, { type: 'funky' }), false);
  assert.equal(validateJsonSubset(null, { type: 'funky' }), false);
  // Known types still behave.
  assert.equal(validateJsonSubset('text', { type: 'string' }), true);
  assert.equal(validateJsonSubset(4, { type: ['string', 'number'] }), true);
  assert.equal(validateJsonSubset(true, { type: 'string' }), false);
});

test('Draft 2020-12 minLength/maxLength count Unicode code points, not UTF-16 units', () => {
  // One astral character is one Unicode code point, despite two JS code units.
  assert.equal('😀'.length, 2);
  assert.equal(validateJsonSubset('😀', { type: 'string', minLength: 2 }), false);
  assert.equal(validateJsonSubset('😀', { type: 'string', maxLength: 1 }), true);
  assert.equal(validateJsonSubset('😀😀', { type: 'string', minLength: 2 }), true);
  assert.equal(validateJsonSubset('😀😀', { type: 'string', maxLength: 1 }), false);
  assert.equal(validateJsonSubset('A😀', { type: 'string', maxLength: 2 }), true);
  // Combining accents are two code points (not one grapheme cluster).
  assert.equal(validateJsonSubset('e\u0301', { type: 'string', minLength: 2 }), true);
  assert.equal(validateJsonSubset('e\u0301', { type: 'string', maxLength: 1 }), false);
  // Nested selected Function input schemas use exactly the same validator.
  assert.equal(validateJsonSubset({ label: '😀' }, {
    type: 'object', properties: { label: { type: 'string', minLength: 2 } },
  }), false);
  assert.equal(validateJsonSubset('ab', { type: 'string', minLength: 2, maxLength: 2 }), true);
});

test('R27: sparse arrays cannot pass the plain JSON guard or boolean true schema', () => {
  const oneHole = new Array(1);
  const nested = { list: [1, , 3] };
  assert.equal(isPlainJsonValue(oneHole), false);
  assert.equal(isPlainJsonValue(nested), false);
  assert.equal(validateJsonSubset(oneHole, true), false);
  assert.equal(validateJsonSubset(oneHole, { type: 'array', minItems: 1 }), false);
  assert.equal(validateJsonSubset([null], true), true);
});

test('isPlainJsonValue accepts only plain JSON data', () => {
  // Primitives and plain structures pass.
  assert.equal(isPlainJsonValue(null), true);
  assert.equal(isPlainJsonValue(true), true);
  assert.equal(isPlainJsonValue('x'), true);
  assert.equal(isPlainJsonValue(4), true);
  assert.equal(isPlainJsonValue([1, 'a', null]), true);
  assert.equal(isPlainJsonValue({ a: { b: [1, 2] } }), true);
  assert.equal(isPlainJsonValue(Object.assign(Object.create(null), { a: 1 })), true);

  // Non-JSON values are refused.
  assert.equal(isPlainJsonValue(undefined), false);
  assert.equal(isPlainJsonValue(Number.NaN), false);
  assert.equal(isPlainJsonValue(Number.POSITIVE_INFINITY), false);
  assert.equal(isPlainJsonValue(new Date(0)), false, 'Date is not a JSON value');
  assert.equal(isPlainJsonValue(new Map([['a', 1]])), false, 'Map is not a JSON value');
  assert.equal(isPlainJsonValue(new Set([1])), false, 'Set is not a JSON value');
  assert.equal(isPlainJsonValue(new Number(5)), false, 'primitive wrappers are not JSON values');
  assert.equal(isPlainJsonValue(new String('x')), false);
  assert.equal(isPlainJsonValue(new Boolean(true)), false);
  assert.equal(isPlainJsonValue({ d: new Date(0) }), false, 'nested non-plain values are refused');
  assert.equal(isPlainJsonValue([new Map()]), false);
});

test('required/properties use own properties only — inherited keys do not satisfy them', () => {
  const schema = { type: 'object', required: ['a'], properties: { b: { type: 'number' } } };
  const inherited = Object.create({ a: 'inherited' });
  assert.equal(validateJsonSubset(inherited, schema), false, 'inherited `a` must not satisfy required');

  const ownAndInherited = Object.assign(Object.create({ b: 'inherited-string' }), { a: 1, b: 5 });
  assert.equal(validateJsonSubset(ownAndInherited, schema), true, 'own `b` validates; inherited is ignored');

  const badOwnB = Object.assign(Object.create({}), { a: 1, b: 'not-a-number' });
  assert.equal(validateJsonSubset(badOwnB, schema), false, 'own `b` failing its subschema is refused');
});

test('non-object schemas fail closed; non-finite numbers and tuple-form items are refused', () => {
  // Only boolean schemas and plain schema objects are meaningful.
  assert.equal(validateJsonSubset(1, true), true);
  assert.equal(validateJsonSubset(1, false), false);
  assert.equal(validateJsonSubset(1, 'not-a-schema'), false);
  assert.equal(validateJsonSubset(1, 42), false);
  assert.equal(validateJsonSubset(1, null), false);
  assert.equal(validateJsonSubset(1, ['type', 'number']), false);
  assert.equal(validateJsonSubset(1, { type: 'number' }), true);

  // Non-finite number instances are not JSON data.
  assert.equal(validateJsonSubset(Number.POSITIVE_INFINITY, { type: 'number' }), false);
  assert.equal(validateJsonSubset(Number.NaN, true), false, 'even against boolean true');

  // Array-form `items` is the pre-2020-12 tuple form; this subset requires
  // prefixItems and must reject rather than silently accept.
  assert.equal(validateJsonSubset([1, 2], { items: [{ type: 'number' }] }), false);
  assert.equal(validateJsonSubset([1, 'x'], { items: { type: 'number' } }), false);
  assert.equal(validateJsonSubset([1, 2], { items: { type: 'number' } }), true);
  assert.equal(
    validateJsonSubset([1, 'x'], { prefixItems: [{ type: 'number' }, { type: 'string' }] }),
    true,
  );
});

test('undefined and other non-JSON instances fail — undefined is not JSON', () => {
  assert.equal(validateJsonSubset(undefined, true), false, 'undefined against boolean true');
  assert.equal(validateJsonSubset(undefined, { type: 'object' }), false);
  assert.equal(validateJsonSubset(undefined, {}), false);
  assert.equal(validateJsonSubset(() => 1, true), false, 'function is not JSON');
  assert.equal(validateJsonSubset(Symbol('s'), true), false, 'symbol is not JSON');
  assert.equal(validateJsonSubset(10n, true), false, 'bigint is not JSON');
  // JSON values still pass.
  assert.equal(validateJsonSubset(null, true), true);
  assert.equal(validateJsonSubset('x', true), true);
  assert.equal(validateJsonSubset(0, true), true);
});
