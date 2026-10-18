/**
 * v0.10 K02 #1168 — durable original-receipt carrier: unit semantics.
 * ====================================================================
 *
 * Pure-fragment semantics of `durable-receipt-carrier-v1.mjs` (the isolated
 * K02 module; kernel splice is a separate post-K01 phase):
 *
 *   U1 canonical input digest: canonically equivalent inputs (key order,
 *      whitespace, nesting) digest identically; any semantic difference
 *      (value/type/nesting) changes the digest; non-JSON input refuses typed.
 *   U2 deployment scope identity: the full injective tuple validates, extra
 *      or malformed components refuse typed.
 *   U3 scoped key grammar: keys are scope-prefixed, kind-closed and
 *      injective across scopes/kinds/parts (turn ids carry separators).
 *   U4 turn receipt identity: stable under key reordering of equivalent
 *      inputs, distinct under changed input/intent/scope/target; pinned
 *      build identity is OUTSIDE the identity (stable across releases).
 *   U5 the scoped docs adapter routes get/put/remove/list through the
 *      namespace only — another scope's keys are unreachable.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  canonicalInputDigest,
  canonicalJsonStringify,
  createScopedDocumentStore,
  deploymentScopeIdentity,
  deriveCarrierTurnId,
  durableTurnReceiptIdentity,
  scopedDocKey,
  SCOPED_DOC_KINDS,
} from '../src/qualified-package/payload/durable-receipt-carrier-v1.mjs';

const sha256 = { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') };

function typed(error: unknown): { name?: string; code?: string } {
  return error as { name?: string; code?: string };
}

const scopeA = { deployedAppId: 'app-alpha', tenantId: 'tenant-1', appId: 'app-1', businessPackageId: 'pkg-quote-1.0.0' };
const scopeB = { deployedAppId: 'app-beta', tenantId: 'tenant-1', appId: 'app-1', businessPackageId: 'pkg-quote-1.0.0' };
const target = { workflowId: 'quote', instanceKey: 'q-1' };

test('U1 canonical input digest: equivalence, injectivity, typed non-JSON refusal', () => {
  const a = canonicalInputDigest(sha256, { amount: 42, note: 'x' });
  const reordered = canonicalInputDigest(sha256, { note: 'x', amount: 42 });
  const nested = canonicalInputDigest(sha256, { list: [{ b: 2, a: 1 }], z: null });
  const nestedReordered = canonicalInputDigest(sha256, { z: null, list: [{ a: 1, b: 2 }] });
  assert.equal(a, reordered, 'key order does not change the canonical digest');
  assert.equal(nested, nestedReordered, 'nested key order does not change the canonical digest');
  assert.match(a, /^sha256:[0-9a-f]{64}$/);

  const changed = [
    { amount: 43, note: 'x' }, // value
    { amount: 42, note: 'y' }, // value
    { amount: 42, note: 'x', extra: 1 }, // added member
    { amount: '42', note: 'x' }, // type
    { amount: 42 }, // removed member
    { amount: 42, note: ['x'] }, // structure
  ];
  for (const input of changed) {
    assert.notEqual(canonicalInputDigest(sha256, input), a, `changed input ${JSON.stringify(input)} must change the digest`);
  }

  assert.throws(() => canonicalInputDigest(sha256, { bad: undefined }), (error: unknown) => typed(error).code === 'K02_INPUT_NOT_JSON');
  // non-finite numbers are refused typed: JSON.stringify would coerce them to
  // null and silently collide three DIFFERENT inputs into one digest
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => canonicalInputDigest(sha256, { a: bad }), (error: unknown) => typed(error).code === 'K02_INPUT_NOT_JSON');
  }
  assert.throws(() => canonicalInputDigest(sha256, { list: [1, Number.NaN] }), (error: unknown) => typed(error).code === 'K02_INPUT_NOT_JSON');
  assert.throws(() => canonicalInputDigest(sha256, Symbol('x')), (error: unknown) => typed(error).code === 'K02_INPUT_NOT_JSON');
  assert.throws(() => canonicalInputDigest(sha256, () => 1), (error: unknown) => typed(error).code === 'K02_INPUT_NOT_JSON');
});

test('U1b canonicalJsonStringify is order-normalizing and whitespace-free', () => {
  assert.equal(canonicalJsonStringify({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 2 } }), '{"a":{"c":2,"d":[3,{"y":2,"z":1}]},"b":1}');
});

test('U2 deployment scope identity: full tuple validates and freezes; malformed refuses typed', () => {
  const frozen = deploymentScopeIdentity(scopeA);
  assert.deepEqual({ ...frozen }, { ...scopeA });
  // separator-bearing identifiers (real package ids) are VALID scope components
  deploymentScopeIdentity({ deployedAppId: 'app:x', tenantId: 't', appId: 'a', businessPackageId: 'pkg:quote@1.0.0' });
  assert.throws(() => deploymentScopeIdentity({ deployedAppId: 'a', tenantId: 't', appId: 'x' }), (e: unknown) => typed(e).code === 'K02_SCOPE_INVALID');
  assert.throws(() => deploymentScopeIdentity({ ...scopeA, extra: 1 }), (e: unknown) => typed(e).code === 'K02_SCOPE_INVALID');
  assert.throws(() => deploymentScopeIdentity({ ...scopeA, tenantId: '' }), (e: unknown) => typed(e).code === 'K02_SCOPE_INVALID');
  assert.throws(() => deploymentScopeIdentity({ ...scopeA, appId: 'a\u0007b' }), (e: unknown) => typed(e).code === 'K02_SCOPE_INVALID');
  assert.throws(() => deploymentScopeIdentity({ ...scopeA, businessPackageId: 'x'.repeat(300) }), (e: unknown) => typed(e).code === 'K02_SCOPE_INVALID');
});

test('U3 scoped key grammar: scope-prefixed, kind-closed, percent-encoded, injective across scopes/kinds/parts', () => {
  const instanceKey = scopedDocKey(scopeA, 'wf-instance', 'quote', 'q-1');
  assert.equal(instanceKey, 'v010-k02:app-alpha:tenant-1:app-1:pkg-quote-1.0.0:wf-instance:quote:q-1');
  // separator-bearing components are percent-encoded, never raw
  const encodedScope = { deployedAppId: 'app:x', tenantId: 't', appId: 'a', businessPackageId: 'pkg:quote@1.0.0' };
  assert.equal(
    scopedDocKey(encodedScope, 'wf-instance', 'quote', 'q-1'),
    'v010-k02:app%3Ax:t:a:pkg%3Aquote@1.0.0:wf-instance:quote:q-1',
  );
  // every kind is reachable; the kind set is closed
  for (const kind of SCOPED_DOC_KINDS) {
    assert.match(scopedDocKey(scopeA, kind, 'x'), new RegExp(`:${kind}:x$`));
  }
  assert.throws(() => scopedDocKey(scopeA, 'not-a-kind', 'x'), (e: unknown) => typed(e).code === 'K02_SCOPE_INVALID');
  // injectivity: two scopes / two kinds / two parts never collide
  const turnId = deriveCarrierTurnId(target, { kind: 'message', sourceMessageId: 'm-1' });
  const keys = new Set([
    scopedDocKey(scopeA, 'wf-instance', 'quote', 'q-1'),
    scopedDocKey(scopeB, 'wf-instance', 'quote', 'q-1'),
    scopedDocKey(scopeA, 'admission-fence', 'quote', 'q-1'),
    scopedDocKey(scopeA, 'receipt-archive', turnId),
    scopedDocKey(scopeA, 'receipt-archive', `${turnId}:extra`),
    scopedDocKey(scopeA, 'receipt-archive', `${turnId.slice(0, -3)}x-1`),
  ]);
  assert.equal(keys.size, 6, 'all composed keys are distinct');
  // the encoded grammar is injective where the raw kernel grammar is not:
  // ('a:b','c') vs ('a','b:c')
  assert.notEqual(scopedDocKey(scopeA, 'wf-instance', 'a:b', 'c'), scopedDocKey(scopeA, 'wf-instance', 'a', 'b:c'));
  assert.notEqual(
    deriveCarrierTurnId({ workflowId: 'a:b', instanceKey: 'c' }, { kind: 'message', sourceMessageId: 'm' }),
    deriveCarrierTurnId({ workflowId: 'a', instanceKey: 'b:c' }, { kind: 'message', sourceMessageId: 'm' }),
  );
});

test('U4 durable turn receipt identity: injective, canonical, build-identity-separated', () => {
  const turn = { kind: 'message', sourceMessageId: 'm-1' };
  const digest = canonicalInputDigest(sha256, { amount: 42 });
  const identity = durableTurnReceiptIdentity({ scope: scopeA, target, turn, intentType: 'approve', inputDigest: digest });
  // canonical stability: no dependence on caller key order inside scope/target
  assert.equal(
    durableTurnReceiptIdentity({
      target: { instanceKey: 'q-1', workflowId: 'quote' },
      turn,
      intentType: 'approve',
      inputDigest: digest,
      scope: { businessPackageId: scopeA.businessPackageId, appId: 'app-1', tenantId: 'tenant-1', deployedAppId: 'app-alpha' },
    }),
    identity,
  );
  // every identity component matters
  const variants: Array<Record<string, unknown>> = [
    { scope: scopeB },
    { target: { workflowId: 'quote', instanceKey: 'q-2' } },
    { turn: { kind: 'message', sourceMessageId: 'm-2' } },
    { intentType: 'reject' },
    { inputDigest: canonicalInputDigest(sha256, { amount: 43 }) },
  ];
  for (const variant of variants) {
    assert.notEqual(
      durableTurnReceiptIdentity({ scope: scopeA, target, turn, intentType: 'approve', inputDigest: digest, ...variant } as Parameters<typeof durableTurnReceiptIdentity>[0]),
      identity,
    );
  }
  // malformed input digests refuse typed
  assert.throws(() => durableTurnReceiptIdentity({ scope: scopeA, target, turn, intentType: 'approve', inputDigest: 'md5:abc' }), (e: unknown) => typed(e).code === 'K02_SCOPE_INVALID');
});

test('U5 scoped docs adapter: namespace-only routing, cross-scope keys unreachable', async () => {
  const base = new MemoryCasStore();
  const storeA = createScopedDocumentStore(scopeA, base);
  const storeB = createScopedDocumentStore(scopeB, base);
  await storeA.put('v08-kernel:wf-instance:quote:q-1', { who: 'A' }, { mustBeAbsent: true });
  // B cannot see A's document under the same kernel-local key
  assert.equal(await storeB.get('v08-kernel:wf-instance:quote:q-1'), null);
  assert.equal((await storeB.list('v08-kernel:')).length, 0);
  // B can create the colliding key in its own namespace; both coexist
  await storeB.put('v08-kernel:wf-instance:quote:q-1', { who: 'B' }, { mustBeAbsent: true });
  assert.equal((await storeA.get('v08-kernel:wf-instance:quote:q-1'))?.value.who, 'A');
  assert.equal((await storeB.get('v08-kernel:wf-instance:quote:q-1'))?.value.who, 'B');
  // global enumeration sees two physically distinct keys
  const all = await base.list('v010-k02:');
  assert.equal(all.length, 2);
  assert.equal(new Set(all.map((key: string) => key.split(':').slice(0, 6).join(':'))).size, 2, 'distinct scope prefixes');
  // list() filters inside the scoped namespace
  await storeA.put('v08-kernel:admission-fence:quote:q-1', { f: 1 }, { mustBeAbsent: true });
  assert.equal((await storeA.list('v08-kernel:wf-instance:')).length, 1);
  assert.equal((await storeA.list('v08-kernel:')).length, 2);
  // malformed scope refuses at adapter construction, before any store access
  assert.throws(() => createScopedDocumentStore({ deployedAppId: '', tenantId: 't', appId: 'a', businessPackageId: 'p' }, base), (e: unknown) => typed(e).code === 'K02_SCOPE_INVALID');
});

/** Minimal in-memory true-CAS docs port (unit fixture only; physical legs use real SQLite). */
class MemoryCasStore {
  #docs = new Map<string, { revision: number; value: unknown }>();

  async get(key: string) {
    const doc = this.#docs.get(key);
    return doc === undefined ? null : { revision: doc.revision, value: structuredClone(doc.value) };
  }

  async put(key: string, value: unknown, conditions: { mustBeAbsent?: boolean; mustMatchRevision?: number }) {
    const current = this.#docs.get(key);
    if (conditions.mustBeAbsent === true) {
      if (current !== undefined) throw Object.assign(new Error(`host doc ${key} already exists`), { code: 'HOST_KEY_EXISTS' });
      this.#docs.set(key, { revision: 0, value: structuredClone(value) });
      return { revision: 0 };
    }
    const expected = conditions.mustMatchRevision;
    if (typeof expected !== 'number') throw Object.assign(new Error('condition required'), { code: 'HOST_PUT_CONDITION_REQUIRED' });
    if (current === undefined) throw Object.assign(new Error(`host doc ${key} does not exist`), { code: 'HOST_CAS_CONFLICT' });
    if (current.revision !== expected) throw Object.assign(new Error(`host doc ${key} revision is ${String(current.revision)}`), { code: 'HOST_CAS_CONFLICT' });
    this.#docs.set(key, { revision: expected + 1, value: structuredClone(value) });
    return { revision: expected + 1 };
  }

  async list(prefix: string): Promise<readonly string[]> {
    return [...this.#docs.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}
