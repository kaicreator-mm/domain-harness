/** Stable v0.10 record predicate semantics (not a security/authority check). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isObjectRecord, isPlainRecord } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/guards.js';

test('P-I1229: plain records include null prototype but not arrays/classes', () => {
  const nullPrototype = Object.create(null) as Record<string, unknown>;
  class Custom {}
  assert.equal(isPlainRecord({}), true);
  assert.equal(isPlainRecord(nullPrototype), true);
  assert.equal(isPlainRecord(Object.freeze({ a: 1 })), true);
  for (const candidate of [null, undefined, 1, 'x', [], new Date(), new Custom(), Object.create({})]) {
    assert.equal(isPlainRecord(candidate), false);
  }
});

test('P-I1229: shallow object record is deliberately looser than plain', () => {
  const classInstance = new (class Custom {})();
  assert.equal(isObjectRecord(classInstance), true);
  assert.equal(isPlainRecord(classInstance), false);
  assert.equal(isObjectRecord([]), false);
  assert.equal(isObjectRecord(null), false);
});

test('N-I1229: throwing Proxy prototype trap is not silently accepted', () => {
  const hostile = new Proxy({}, { getPrototypeOf() { throw new Error('hostile proxy'); } });
  assert.equal(isObjectRecord(hostile), true);
  assert.throws(() => isPlainRecord(hostile), /hostile proxy/);
});
