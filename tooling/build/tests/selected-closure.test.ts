import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveV10SelectedClosure } from '../src/selected-closure.js';

const base = [
  { packageId: 'kernel', role: 'kernel-primary' as const, dependencies: [] as string[], provides: ['kernel:commit'], requires: [] as string[] },
  { packageId: 'standard', role: 'standard-primary' as const, dependencies: ['kernel'], provides: [] as string[], requires: [] as string[] },
  { packageId: 'business', role: 'business' as const, dependencies: ['standard'], provides: ['intent:sale'], requires: [] as string[] },
];
test('T05 deterministic closure is dependency ordered regardless of input order', () => {
  const a = resolveV10SelectedClosure([...base].reverse());
  const b = resolveV10SelectedClosure(base);
  assert.deepEqual(a.loadOrder, b.loadOrder);
  assert.ok(a.loadOrder.indexOf('kernel') < a.loadOrder.indexOf('standard'));
  assert.ok(a.loadOrder.indexOf('standard') < a.loadOrder.indexOf('business'));
});
test('T05 fails closed for missing or cyclic dependencies', () => {
  assert.throws(() => resolveV10SelectedClosure([{ ...base[1]!, dependencies: ['missing'] }]), { code: 'V10_DEPENDENCY_MISSING' });
  assert.throws(() => resolveV10SelectedClosure([
    { ...base[0]!, dependencies: ['standard'] },
    { ...base[1]!, dependencies: ['kernel'] },
  ]), { code: 'V10_DEPENDENCY_CYCLE' });
});
