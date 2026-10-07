/**
 * T009 — E1-E10 evidence aggregator test suite (issue #905, PACK-D).
 *
 * Verifies the committed manifest (t009-e1-e10-evidence-manifest.json)
 * against the frozen T009 contract (#905 / #720 / #589) and demonstrates the
 * fail-closed paths by loading mutated manifests from fixtures-negative/.
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
} from './t009-aggregator.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, 't009-e1-e10-evidence-manifest.json');
const NEGATIVE_DIR = join(HERE, 'fixtures-negative');

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('T009 aggregator — committed manifest (positive path)', () => {
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

  test('merge anchors sit on accepted ancestry of integration head 20b65cbc', () => {
    for (const row of result.matrix) {
      assert.ok(isAncestor(row.mergeCommit, '20b65cbc89170c1b02037385e98bb915ca578546'));
    }
  });
});

describe('T009 aggregator — negative controls (fail-closed demonstrations)', () => {
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

describe('T009 aggregator — verdict preservation under PARTIAL/REFUTED (no coercion path)', () => {
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
