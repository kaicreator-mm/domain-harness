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
