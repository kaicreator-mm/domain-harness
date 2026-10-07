/**
 * T009R — E1-E10 evidence aggregator test suite (issue #919, fresh
 * full-manifest rerun per #720@6042071497).
 *
 * Verifies the committed refreshed manifest
 * (t009r-e1-e10-evidence-manifest.json) against the frozen T009 contract
 * (#720 / #589) and demonstrates the fail-closed paths by loading mutated
 * manifests from fixtures-negative/. Ported from the proven parked suite
 * (PR #909 / gate issue #905) with the E7 successor-chain refresh and the
 * superseded-row (old #898) handling.
 *
 * SOURCE_MUTATION=NONE. Tests/evidence-only write set.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateManifest,
  AggregationRefused,
  GATE_ORDER,
  isAncestor,
  type Manifest,
} from './t009r-aggregator.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, 't009r-e1-e10-evidence-manifest.json');
const NEGATIVE_DIR = join(HERE, 'fixtures-negative');

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('T009R aggregator — committed refreshed manifest (positive path)', () => {
  const result = aggregateManifest(loadJson(MANIFEST_PATH));

  test('matrix is complete: 10 gates present (11 rows — E8a and E8b distinct), no duplicates', () => {
    // The exact input set is 11 gate issues for 10 gates: E8 = E8a + E8b,
    // both consumed as DISTINCT rows per the frozen contract.
    assert.equal(result.matrix.length, 11);
    const ids = result.matrix.map((r) => r.gate);
    assert.deepEqual(ids, [...GATE_ORDER]);
    assert.ok(ids.includes('E8a') && ids.includes('E8b'));
    assert.equal(new Set(ids).size, 11);
  });

  test('E7 binds the #913 successor chain (issue 913, PR 916, merge 2b50ba01) — the ONLY admissible E7 row', () => {
    const e7 = result.matrix.find((r) => r.gate === 'E7')!;
    assert.equal(e7.issue, 913);
    assert.equal(e7.pr, 916);
    assert.equal(e7.mergeCommit, '2b50ba01860e28b76c9eff8e825756555fcff32b');
    assert.equal(e7.currentness, 'SUCCESSOR_RERUN_ACCEPTED');
    assert.deepEqual(Object.values(e7.terminalCommentIds).sort(), [
      '6044280062', '6044639949', '6044792324', '6044823037',
    ]);
    // The old #898 merge anchor must NOT be cited as live E7 evidence.
    assert.ok(!Object.values(e7.terminalCommentIds).includes('6040707122'));
    assert.notEqual(e7.mergeCommit, '967ef6917ba18832aad108f08d416553f6f9aebb');
  });

  test('old #898 E7 row recorded as SUPERSEDED disposition — recorded, never averaged, never silently dropped', () => {
    assert.equal(result.superseded.length, 1);
    const s = result.superseded[0]!;
    assert.equal(s.gate, 'E7');
    assert.equal(s.issue, 898);
    assert.equal(s.pr, 903);
    assert.equal(s.verdict, 'SUPPORTED'); // recorded verbatim
    assert.equal(s.disposition, 'SUPERSEDED');
    assert.equal(s.mergeCommit, '967ef6917ba18832aad108f08d416553f6f9aebb');
    assert.equal(s.supersededByMergeCommit, '2b50ba01860e28b76c9eff8e825756555fcff32b');
  });

  test('superseded row NEVER enters the matrix (11 rows only; no #898 identity anywhere in matrix)', () => {
    const serialized = JSON.stringify(result.matrix);
    assert.ok(!serialized.includes('"issue":898'));
    assert.ok(!serialized.includes('967ef6917ba18832aad108f08d416553f6f9aebb'));
    assert.ok(!serialized.includes('6040707122'));
    for (const row of result.matrix) {
      assert.equal(row.issue, { E1: 895, E2: 887, E3: 875, E4: 896, E5: 876, E6: 897, E7: 913, E8a: 877, E8b: 873, E9: 878, E10: 899 }[row.gate]);
    }
  });

  test('every individual verdict preserved verbatim (11/11 rows SUPPORTED in the current matrix)', () => {
    for (const row of result.matrix) {
      assert.equal(row.verdict, 'SUPPORTED', `gate ${row.gate} verdict must be carried exactly`);
      assert.equal(row.productImpact, 'NONE');
      assert.equal(row.l2Impact, 'NONE');
      assert.equal(row.sdkImpact, 'NONE');
    }
    assert.deepEqual(result.nonSupportedVerdicts, []);
  });

  test('T009=PASS means completeness+currentness ONLY (no architecture authority)', () => {
    assert.equal(result.t009Pass, true);
    assert.equal(result.completenessCurrentness, 'PASS');
  });

  test('NO aggregate/majority/average verdict exists anywhere in the output (fail-suppression-proof)', () => {
    const serialized = JSON.stringify(result);
    for (const banned of ['overallVerdict', 'average', 'majority', 'gatePass']) {
      assert.ok(!serialized.includes(banned), `output must not contain "${banned}"`);
    }
    // The matrix rows carry exactly the frozen fields; nothing computed.
    for (const row of result.matrix) {
      assert.deepEqual(Object.keys(row).sort(), [
        'gate', 'issue', 'l2Impact', 'mergeCommit', 'pr', 'productImpact',
        'sdkImpact', 'subjectHead', 'subjectTree', 'terminalCommentIds',
        'currentness', 'verdict',
      ].sort());
    }
  });

  test('deterministic ordering: shuffled input yields byte-identical output', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.gates = [...m.gates].reverse();
    const rerun = aggregateManifest(m);
    assert.deepEqual(rerun, result);
    // Second run on the pristine manifest is byte-identical too.
    const again = aggregateManifest(loadJson(MANIFEST_PATH));
    assert.equal(JSON.stringify(again), JSON.stringify(result));
  });

  test('merge anchors sit on accepted ancestry of integration head 2b50ba01', () => {
    for (const row of result.matrix) {
      assert.ok(isAncestor(row.mergeCommit, '2b50ba01860e28b76c9eff8e825756555fcff32b'));
    }
  });
});

describe('T009R aggregator — negative controls (fail-closed demonstrations)', () => {
  const fixtures = readdirSync(NEGATIVE_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(fixtures.length >= 3, 'at least three committed negative-control manifests required');

  for (const f of fixtures) {
    test(`mutated manifest ${f} is refused`, () => {
      assert.throws(
        () => aggregateManifest(loadJson(join(NEGATIVE_DIR, f))),
        (err: unknown) => {
          assert.ok(err instanceof AggregationRefused, `expected AggregationRefused, got ${String(err)}`);
          return true;
        },
      );
    });
  }

  test('control: pristine manifest still aggregates (sanity against over-blocking)', () => {
    assert.doesNotThrow(() => aggregateManifest(loadJson(MANIFEST_PATH)));
  });
});

describe('T009R aggregator — rerun-specific supersession fail-closed paths', () => {
  test('old #898 E7 row presented as CURRENT (not superseded) is refused — AGG_SUPERSEDED_INVALID', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.supersededRows![0]!.disposition = 'CURRENT';
    assert.throws(() => aggregateManifest(m), /AGG_SUPERSEDED_INVALID/);
  });

  test('old #898 E7 row dropped from supersededRows is refused — never silently dropped', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.supersededRows = [];
    assert.throws(() => aggregateManifest(m), /AGG_SUPERSEDED_MISSING/);
  });

  test('old #898 E7 row ALSO posed as a second live E7 gate row is refused — duplicate/conflict', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    const newE7 = m.gates.find((g) => g.gate === 'E7')!;
    const old = JSON.parse(JSON.stringify(m.supersededRows![0]));
    const fakeOldAsCurrent = {
      ...newE7,
      issue: old.issue,
      pr: old.pr,
      verdict: old.verdict,
      currentness: 'CURRENT',
      subjectHead: old.subjectHead,
      subjectTree: old.subjectTree,
      mergeCommit: old.mergeCommit,
      terminalCommentIds: old.terminalCommentIds,
    };
    // Two non-stale E7 candidates side by side (E9 row displaced to keep 11
    // rows, so the completeness count does not mask the duplicate) =>
    // duplicate/conflict, fail closed.
    m.gates = [...m.gates.filter((g) => g.gate !== 'E7' && g.gate !== 'E9'), fakeOldAsCurrent, newE7];
    assert.throws(() => aggregateManifest(m), /AGG_DUPLICATE_GATE/);
  });

  test('supersession chain pointing at the wrong successor merge is refused', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.supersededRows![0]!.supersededBy!.mergeCommit = '967ef6917ba18832aad108f08d416553f6f9aebb';
    assert.throws(() => aggregateManifest(m), /AGG_SUPERSEDED_CHAIN_BROKEN/);
  });

  test('superseded row reusing a live gate comment id is refused — AGG_CONFLICT', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.supersededRows![0]!.terminalCommentIds.builderEvidence = '6044280062';
    assert.throws(() => aggregateManifest(m), /AGG_CONFLICT/);
  });
});

describe('T009R aggregator — verdict preservation under PARTIAL/REFUTED (no coercion path)', () => {
  test('a REFUTED verdict is surfaced verbatim, never rewritten', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    const e3 = m.gates.find((g) => g.gate === 'E3')!;
    e3.verdict = 'REFUTED'; // simulated honest verdict
    const r = aggregateManifest(m);
    const row = r.matrix.find((x) => x.gate === 'E3')!;
    assert.equal(row.verdict, 'REFUTED');
    assert.deepEqual(r.nonSupportedVerdicts, [{ gate: 'E3', verdict: 'REFUTED' }]);
  });

  test('a coerced verdict string (not an exact token) fails closed', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    const e3 = m.gates.find((g) => g.gate === 'E3')!;
    e3.verdict = 'SUPPORTED (was REFUTED)';
    assert.throws(() => aggregateManifest(m), /AGG_VERDICT_INVALID/);
  });
});
