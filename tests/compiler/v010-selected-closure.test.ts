/** T00 internal phase extraction regression — no selected Kernel runtime. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveV10SelectedClosure } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/selected-closure.js';
import { V10BuildError } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/errors.js';
import type { V10ClosureModule } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/selected-closure.js';

const mod = (
  packageId: string,
  role: V10ClosureModule['role'],
  dependencies: string[] = [],
  provides: string[] = [],
  requires: string[] = [],
): V10ClosureModule => ({ packageId, role, dependencies, provides, requires });

test('P-I1230: deterministic role-stable dependency closure and required features', () => {
  const selected = [
    mod('biz', 'business', ['std', 'cap'], ['intent:a'], ['standard:feature/a']),
    mod('cap', 'capability', [], ['cap:read']),
    mod('std', 'standard-primary', [], ['standard:feature/a']),
    mod('kernel', 'kernel-primary'),
    mod('optional', 'standard-feature'),
  ];
  const first = resolveV10SelectedClosure(selected);
  const second = resolveV10SelectedClosure(selected);
  assert.deepEqual(first.loadOrder, ['kernel', 'std', 'optional', 'cap', 'biz']);
  assert.deepEqual(second.loadOrder, first.loadOrder);
  assert.deepEqual([...first.selectedIds].sort(), [...second.selectedIds].sort());
});

test('N-I1230: missing dependency, cycle, and required feature keep typed baseline refusals', () => {
  const checks = [
    { selected: [mod('a', 'business', ['missing'])], code: 'V10_DEPENDENCY_MISSING' },
    { selected: [mod('a', 'business', ['b']), mod('b', 'capability', ['a'])], code: 'V10_DEPENDENCY_CYCLE' },
    { selected: [mod('a', 'business', [], [], ['missing/1'])], code: 'V10_FEATURE_MISSING' },
  ];
  for (const check of checks) {
    assert.throws(
      () => resolveV10SelectedClosure(check.selected),
      (error: unknown) => error instanceof V10BuildError && error.code === check.code,
      `expected ${check.code}`,
    );
  }
});
