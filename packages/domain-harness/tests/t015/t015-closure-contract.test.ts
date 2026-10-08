/**
 * T015 — final L2/SDK closure companion contract-assertion test (gate #939).
 *
 * ROLE: bind the normative surface claims of
 * `docs/architecture/DomainHarness_v0_7_FINAL_L2_SDK_CLOSURE.md` to landed
 * reality so drift goes red in EITHER direction:
 *   - doc claims something the package does not provide -> red;
 *   - the package surface drifts from the frozen closure doc -> red.
 *
 * Scope (tests-only; MICROKERNEL_SOURCE_DIFF=0 by construction):
 *   1. NORMATIVE_EXPORT_MAP_KEYS block == live package.json `exports` keys
 *      (exactly 7 keys, zero wildcard patterns, types/import/require present);
 *   2. NORMATIVE_V7_RUNTIME_EXPORTS == actual runtime names of the landed
 *      `./v7` source surface (src/public-v7/index.ts);
 *   3. NORMATIVE_V7_EXECUTION_FUNCTIONS + NORMATIVE_V7_EXECUTION_ERROR_CLASSES
 *      == actual runtime names of the landed `./v7/execution` facade source
 *      (src/public-v7/execution.ts);
 *   4. every NORMATIVE_SEAM_MODULES path exists under packages/domain-harness/src/;
 *   5. the T014 carried-limits register still carries exactly 12 entries and
 *      MICROKERNEL_SOURCE_DIFF=0 (accepted limitations cannot shrink silently);
 *   6. the T013s N/A matrix statuses remain exactly the accepted multiset
 *      (no silent host-parity upgrade).
 *
 * Falsification (executed by the builder on a scratch doc copy, then
 * restored): removing one export-map key from the doc block -> assertion 1
 * red; injecting a nonexistent seam module into the doc block -> assertion 4
 * red. Both bit as designed.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as v7Surface from '../../src/public-v7/index.js';
import * as v7ExecutionSurface from '../../src/public-v7/execution.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..', '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
const CLOSURE_DOC = join(
  REPO_ROOT,
  'docs',
  'architecture',
  'DomainHarness_v0_7_FINAL_L2_SDK_CLOSURE.md',
);

const docText = readFileSync(CLOSURE_DOC, 'utf8');

/** Extract the fenced `NORMATIVE_<name>` block from the closure doc. */
function normativeBlock(name: string): string[] {
  const marker = `NORMATIVE_${name}`;
  const start = docText.indexOf(marker);
  assert.notEqual(start, -1, `closure doc must contain ${marker}`);
  const after = docText.slice(start + marker.length);
  const fenceEnd = after.indexOf('```');
  assert.notEqual(fenceEnd, -1, `${marker} block must be fenced`);
  return after
    .slice(0, fenceEnd)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const EXPORT_MAP_KEYS_DOC = normativeBlock('EXPORT_MAP_KEYS');
const V7_RUNTIME_DOC = normativeBlock('V7_RUNTIME_EXPORTS');
const V7_EXECUTION_FUNCTIONS_DOC = normativeBlock('V7_EXECUTION_FUNCTIONS');
const V7_EXECUTION_ERRORS_DOC = normativeBlock('V7_EXECUTION_ERROR_CLASSES');
const SEAM_MODULES_DOC = normativeBlock('SEAM_MODULES');

void test('t015: closure doc NORMATIVE_EXPORT_MAP_KEYS == live package.json exports (7 keys, zero wildcards)', () => {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
    exports: Record<string, Record<string, string>>;
  };
  const liveKeys = Object.keys(pkg.exports).sort();
  const docKeys = [...EXPORT_MAP_KEYS_DOC].sort();
  assert.deepEqual(liveKeys, docKeys, 'export map keys drifted from the frozen closure doc');
  assert.equal(liveKeys.length, 7, 'the public SDK surface is exactly the 7-key export map');
  for (const key of liveKeys) {
    assert.ok(!key.includes('*'), `wildcard export key is forbidden: ${key}`);
    const conditions = pkg.exports[key];
    assert.ok(conditions, `${key} must declare conditions`);
    for (const cond of ['types', 'import', 'require'] as const) {
      const value = conditions[cond];
      assert.ok(
        typeof value === 'string' && value.length > 0,
        `${key} must declare a ${cond} condition`,
      );
    }
    const targets = Object.values(conditions);
    assert.ok(!targets.some((v) => v.includes('*')), `wildcard pattern forbidden under ${key}`);
  }
});

void test('t015: NORMATIVE_V7_RUNTIME_EXPORTS == landed ./v7 runtime surface', () => {
  const liveRuntime = Object.keys(v7Surface).sort();
  assert.deepEqual(
    liveRuntime,
    [...V7_RUNTIME_DOC].sort(),
    './v7 runtime surface drifted from the frozen closure doc',
  );
  assert.equal(liveRuntime.length, 15, './v7 carries exactly the proven 15 runtime names');
});

void test('t015: NORMATIVE_V7_EXECUTION_* == landed ./v7/execution facade runtime surface (16 fns + 9 error classes = 25)', () => {
  const liveRuntime = Object.keys(v7ExecutionSurface).sort();
  const docRuntime = [...V7_EXECUTION_FUNCTIONS_DOC, ...V7_EXECUTION_ERRORS_DOC].sort();
  assert.deepEqual(
    liveRuntime,
    docRuntime,
    './v7/execution facade runtime surface drifted from the frozen closure doc',
  );
  assert.equal(V7_EXECUTION_FUNCTIONS_DOC.length, 16, 'facade declares exactly 16 runtime functions');
  assert.equal(V7_EXECUTION_ERRORS_DOC.length, 9, 'facade declares exactly 9 typed error classes');
  for (const name of V7_EXECUTION_ERRORS_DOC) {
    const value = (v7ExecutionSurface as Record<string, unknown>)[name];
    assert.equal(typeof value, 'function', `${name} must be a class (function) at runtime`);
  }
});

void test('t015: every NORMATIVE_SEAM_MODULES path exists under packages/domain-harness/src/', () => {
  for (const rel of SEAM_MODULES_DOC) {
    assert.ok(
      existsSync(join(PACKAGE_ROOT, 'src', rel)),
      `closure doc cites a seam module that does not exist: src/${rel}`,
    );
  }
});

void test('t015: T014 carried-limits register still carries exactly 12 entries with MICROKERNEL_SOURCE_DIFF=0', () => {
  const register = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, 'tests', 't014', 't014-carried-limits-register.json'), 'utf8'),
  ) as { limits: Array<{ id: string }>; MICROKERNEL_SOURCE_DIFF: number };
  assert.equal(register.limits.length, 12, 'accepted limitations register must keep exactly 12 entries');
  assert.deepEqual(
    register.limits.map((l) => l.id),
    Array.from({ length: 12 }, (_, i) => `T014-L${i + 1}`),
    'register entries must remain T014-L1..T014-L12 in order',
  );
  assert.equal(register.MICROKERNEL_SOURCE_DIFF, 0);
});

void test('t015: T013s N/A matrix statuses remain exactly the accepted multiset (no inferred parity)', () => {
  const na = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, 'tests', 't013s', 't013s-na-matrix.json'), 'utf8'),
  ) as { matrix: Array<{ facility: string; status: string }> };
  const liveStatuses = na.matrix.map((row) => row.status).sort();
  const acceptedStatuses = [
    'APPLICABLE_AND_EXECUTED_ON_HOST',
    'APPLICABLE_AND_EXECUTED_ON_HOST',
    'NOT_APPLICABLE',
    'NOT_APPLICABLE',
    'NOT_EXERCISED_ON_HOST',
  ].sort();
  assert.deepEqual(
    liveStatuses,
    acceptedStatuses,
    'host N/A boundary drifted: parity may never be inferred silently',
  );
});
