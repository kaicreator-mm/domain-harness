/**
 * Shared descriptor-safe record primitive + unified exact-reference authority
 * unit tests (issues #557 + #578, landed by #588).
 *
 * Covers the Part 1A primitive contract directly:
 * - ordinary AND null-prototype records/arrays are accepted (documented posture);
 * - exotic/class prototypes, symbol-keyed, non-enumerable and accessor own
 *   properties are rejected;
 * - snapshots are fresh, non-aliased value copies; caller input is never
 *   mutated or frozen;
 * - diagnostics never execute hidden getters;
 * - the unified exact-ref matrix predicates (floating tokens, range
 *   operators, x-range/partial versions, embedded `id@version`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  carriesXRangeVersionSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from '../../src/contracts/record-safety.js';

test('#588-P1: ordinary and null-prototype records snapshot; exotic/class prototypes are rejected', () => {
  const ordinary = { a: 1, b: 'two' };
  const ordinaryResult = safeRecordSnapshot(ordinary, 'record');
  assert.equal(ordinaryResult.ok, true);
  if (ordinaryResult.ok) {
    assert.notEqual(ordinaryResult.snapshot, ordinary);
    assert.deepEqual(ordinaryResult.snapshot, ordinary);
    assert.equal(Object.getPrototypeOf(ordinaryResult.snapshot), Object.prototype);
  }

  const nullProto = Object.assign(Object.create(null), { a: 1 });
  const nullProtoResult = safeRecordSnapshot(nullProto, 'record');
  assert.equal(nullProtoResult.ok, true);

  class ClassRecord {
    a = 1;
  }
  const classResult = safeRecordSnapshot(new ClassRecord(), 'record');
  assert.equal(classResult.ok, false);
  if (!classResult.ok) {
    assert.equal(classResult.issue.violation, 'EXOTIC_PROTOTYPE');
    assert.match(describeRecordSafetyIssue(classResult.issue), /ordinary or null-prototype/);
  }

  for (const nonRecord of [null, undefined, 42, 'record', true, ['array']]) {
    const result = safeRecordSnapshot(nonRecord, 'record');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issue.violation, 'NOT_A_RECORD');
  }
});

test('#588-P2: accessor properties are rejected without executing the hidden getter', () => {
  let getterCalls = 0;
  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, 'kind', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { kindId: 'decision.rule.v1', version: '1.2.0' };
    },
  });
  Object.defineProperty(accessor, 'semanticBody', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { threshold: 100 };
    },
  });

  const result = safeRecordSnapshot(accessor, 'record');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issue.violation, 'ACCESSOR_PROPERTY');
    assert.equal(result.issue.key, 'kind');
    assert.match(describeRecordSafetyIssue(result.issue), /own enumerable data properties/);
  }
  // Diagnostics must identify the input without executing hidden getters.
  assert.equal(getterCalls, 0, 'no hidden getter may execute during validation or diagnostics');
});

test('#588-P3: symbol-keyed and non-enumerable own properties are rejected', () => {
  const symbolKeyed: Record<string, unknown> = { visible: true };
  Object.defineProperty(symbolKeyed, Symbol('hidden'), {
    value: 'smuggled',
    enumerable: true,
  });
  const symbolResult = safeRecordSnapshot(symbolKeyed, 'record');
  assert.equal(symbolResult.ok, false);
  if (!symbolResult.ok) assert.equal(symbolResult.issue.violation, 'SYMBOL_KEYED_PROPERTY');

  const nonEnumerable: Record<string, unknown> = { visible: true };
  Object.defineProperty(nonEnumerable, 'hidden', {
    value: 'smuggled',
    enumerable: false,
  });
  const hiddenResult = safeRecordSnapshot(nonEnumerable, 'record');
  assert.equal(hiddenResult.ok, false);
  if (!hiddenResult.ok) {
    assert.equal(hiddenResult.issue.violation, 'NON_ENUMERABLE_PROPERTY');
    assert.equal(hiddenResult.issue.key, 'hidden');
  }
});

test('#588-P4: array snapshots reject exotic prototypes, symbol keys, sparse holes and extra properties', () => {
  const ordinary = [{ kindId: 'a', version: '1.0.0' }, { kindId: 'b', version: '2.0.0' }];
  const ordinaryResult = safeArraySnapshot(ordinary, 'array');
  assert.equal(ordinaryResult.ok, true);
  if (ordinaryResult.ok) {
    assert.notEqual(ordinaryResult.snapshot, ordinary);
    assert.deepEqual(ordinaryResult.snapshot, ordinary);
  }

  for (const nonArray of [null, undefined, 42, 'array', { not: 'an array' }]) {
    const result = safeArraySnapshot(nonArray, 'array');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issue.violation, 'NOT_AN_ARRAY');
  }

  const sparse = new Array(2);
  sparse[0] = 'a';
  const sparseResult = safeArraySnapshot(sparse, 'array');
  assert.equal(sparseResult.ok, false);
  if (!sparseResult.ok) assert.equal(sparseResult.issue.violation, 'SPARSE_ARRAY');

  const withExtra = ['a'];
  Object.defineProperty(withExtra, 'tag', { value: 'hidden', enumerable: true });
  const extraResult = safeArraySnapshot(withExtra, 'array');
  assert.equal(extraResult.ok, false);
  if (!extraResult.ok) assert.equal(extraResult.issue.violation, 'EXTRA_ARRAY_PROPERTY');

  const withSymbol = ['a'];
  Object.defineProperty(withSymbol, Symbol('hidden'), { value: 1, enumerable: true });
  const symbolResult = safeArraySnapshot(withSymbol, 'array');
  assert.equal(symbolResult.ok, false);
  if (!symbolResult.ok) assert.equal(symbolResult.issue.violation, 'SYMBOL_KEYED_PROPERTY');
});

test('#588-P5: snapshot discipline — no caller mutation, no aliasing, frozen input tolerated', () => {
  const nested = { kindId: 'decision.rule.v1', version: '1.2.0' };
  const envelope: Record<string, unknown> = { componentId: 'a.b', kind: nested };
  const result = safeRecordSnapshot(envelope, 'record');
  assert.equal(result.ok, true);
  if (!result.ok) return;

  // Shallow snapshot: top-level values are copied into a fresh record...
  assert.notEqual(result.snapshot, envelope);
  assert.deepEqual(Object.keys(result.snapshot), ['componentId', 'kind']);
  // ...while nested records remain nested (their own validation layer
  // re-snapshots them) — documented shallow semantics.
  assert.equal(result.snapshot.kind, nested);

  // The snapshot is writable authority material and the caller record is untouched.
  result.snapshot.componentId = 'changed';
  assert.equal(envelope.componentId, 'a.b');

  // Frozen caller input works: validation reads descriptors only.
  const frozen = Object.freeze({ a: 1, b: 2 });
  const frozenResult = safeRecordSnapshot(frozen, 'record');
  assert.equal(frozenResult.ok, true);
});

test('#588-P6: unified exact-ref matrix — identity predicates', () => {
  assert.equal(isNonEmptyIdentityString('a.b.c'), true);
  assert.equal(isNonEmptyIdentityString(''), false);
  assert.equal(isNonEmptyIdentityString('   '), false);
  assert.equal(isNonEmptyIdentityString(42), false);

  assert.equal(carriesEmbeddedSelector('a@1.0.0'), true);
  assert.equal(carriesEmbeddedSelector('a.b.c'), false);

  // Floating tokens, including `x`, are case-insensitive after trim.
  for (const floating of ['latest', 'current', 'active', 'default', '*', 'x', 'X', 'LATEST', ' latest ']) {
    assert.equal(carriesFloatingOrRangeSemantics(floating), true, `${floating} must be floating`);
  }
  // Range/wildcard operators never occur in an exact identity string.
  for (const ranged of ['^1.0.0', '~2', '<2', '>1', '1 || 2', 'a*b', '1.*']) {
    assert.equal(carriesFloatingOrRangeSemantics(ranged), true, `${ranged} must be rejected`);
  }
  for (const exact of ['decision.rule.v1', '1.2.0', 'quote.eligibility.rule', 'a|b'.replace('|', '.')]) {
    assert.equal(carriesFloatingOrRangeSemantics(exact), false, `${exact} must be exact`);
  }
});

test('#588-P7: unified exact-ref matrix — version x-range/partial forms', () => {
  for (const partial of ['1.x', '1.X', 'x', 'X', '1.', '1.x.2', '..']) {
    assert.equal(carriesXRangeVersionSemantics(partial), true, `${partial} must be an x-range/partial`);
  }
  for (const exact of ['1.2.0', '0.1.0', '14.2.0', '1.2.3.4']) {
    assert.equal(carriesXRangeVersionSemantics(exact), false, `${exact} must be exact`);
  }
});
