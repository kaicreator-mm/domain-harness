// Issue #329 / DAC v0.0.3 V3-005 — matrix closure: the C39–C77 applicability
// matrix is SELF-VERIFYING. This suite proves there is no blank case, no
// implicit coverage, and no dangling evidence reference: every row's
// evidence file exists in this directory and the quoted test name is really
// declared in that file's source; every classification is one of the three
// frozen values; PASS rows always carry executable evidence; NOT_OWNED rows
// always carry a reason stating the owning lane.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  DAC_V003_C39_C77_MATRIX,
  DAC_V003_CONFORMANCE_FREEZE,
  dacV003ConformanceCounts,
} from './conformance-matrix.js';
import { DAC_V003_BASELINE } from '../../src/dac-v003/index.js';

const EXPECTED_IDS: readonly string[] = Array.from(
  { length: 77 - 39 + 1 },
  (_, i) => `C${39 + i}`,
);

const fileCache = new Map<string, string>();
function sourceOf(file: string): string {
  const cached = fileCache.get(file);
  if (cached !== undefined) return cached;
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  fileCache.set(file, source);
  return source;
}

test('matrix closure: exactly C39..C77, no gaps, no duplicates, no foreign rows', () => {
  const ids = DAC_V003_C39_C77_MATRIX.map((row) => row.id);
  assert.deepEqual(ids, [...EXPECTED_IDS]);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate case ids');
});

test('matrix closure: every row is complete — no blank case, no implicit coverage', () => {
  for (const row of DAC_V003_C39_C77_MATRIX) {
    const label = row.id;
    assert.ok(row.group.trim().length > 0, `${label}: group`);
    assert.ok(row.obligation.trim().length > 0, `${label}: obligation`);
    assert.ok(row.source.includes('CONFORMANCE_MATRIX'), `${label}: frozen source`);
    assert.ok(row.surface.trim().length > 0, `${label}: applicable surface`);
    assert.ok(row.ownerBoundary.trim().length > 0, `${label}: owner/authority boundary`);
    assert.ok(row.expected.trim().length > 0, `${label}: expected result`);
    assert.ok(row.reason.trim().length > 40, `${label}: durable reason`);
    assert.ok(
      ['PASS', 'NOT_APPLICABLE', 'NOT_OWNED'].includes(row.classification),
      `${label}: classification vocabulary`,
    );
    assert.ok(
      row.evidence.length > 0,
      `${label}: every case must reference executable evidence (no "covered by general test")`,
    );
    if (row.classification === 'PASS') {
      assert.ok(
        row.evidence.length > 0,
        `${label}: PASS requires executable evidence`,
      );
    }
    if (row.classification === 'NOT_OWNED') {
      assert.match(
        row.reason,
        /NOT_OWNED|upstream|producer|evolution|authoring|promotion|selection|external|UX/i,
        `${label}: NOT_OWNED reason must state the owning lane`,
      );
      assert.match(
        row.ownerBoundary,
        /NOT_OWNED/i,
        `${label}: NOT_OWNED boundary must be explicit`,
      );
    }
    if (row.identityLinkage !== undefined) {
      assert.ok(row.identityLinkage.trim().length > 0);
    }
  }
});

test('matrix closure: every referenced evidence file exists and the quoted test is really declared in it', () => {
  for (const row of DAC_V003_C39_C77_MATRIX) {
    const refs = [...row.evidence, ...row.adversarial];
    assert.ok(refs.length > 0, `${row.id}: at least one evidence/adversarial ref`);
    for (const ref of refs) {
      assert.match(ref.file, /^[a-z0-9-]+\.test\.ts$/, `${row.id}: evidence file name`);
      const source = sourceOf(ref.file);
      const declared = source.includes(`test('${ref.test}'`)
        || source.includes(`test("${ref.test}"`);
      assert.ok(
        declared,
        `${row.id}: test "${ref.test}" must be declared in ${ref.file}`,
      );
    }
  }
});

test('matrix closure: classification counts match the reported V3-005 closure statistics', () => {
  const counts = dacV003ConformanceCounts();
  assert.equal(counts.total, 39);
  assert.equal(counts.pass, 32);
  assert.equal(counts.notApplicable, 0);
  assert.equal(counts.notOwned, 7);
  assert.deepEqual(
    DAC_V003_C39_C77_MATRIX.filter((r) => r.classification === 'NOT_OWNED').map((r) => r.id),
    ['C45', 'C46', 'C47', 'C48', 'C49', 'C51', 'C52'],
    'the NOT_OWNED set is exactly the producer/evolution lane',
  );
});

test('matrix closure: the consumed freeze is the exact dispatched DAC v0.0.3 semantic freeze', () => {
  assert.equal(DAC_V003_CONFORMANCE_FREEZE.semanticFreezeCommit, '3322b2152253b3c60f254c23a4f9ab1a14e063d1');
  assert.equal(
    DAC_V003_CONFORMANCE_FREEZE.semanticFreezeTree,
    '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06',
  );
  // The adapter baseline the suites execute against is the same freeze.
  assert.equal(DAC_V003_BASELINE.semanticFreezeCommit, DAC_V003_CONFORMANCE_FREEZE.semanticFreezeCommit);
  assert.equal(DAC_V003_BASELINE.semanticFreezeTree, DAC_V003_CONFORMANCE_FREEZE.semanticFreezeTree);
});

test('matrix closure: adversarial dispatch list is fully materialized in the adversarial suite', () => {
  const source = sourceOf('adversarial-shortcuts.test.ts');
  const mandatedScenarios: readonly { readonly id: string; readonly needle: string }[] = [
    { id: 'floating/latest/current identity substitution', needle: 'adversarial 1 (floating identity substitution)' },
    { id: 'same semantic identity with foreign revision/digest', needle: 'adversarial 2 (same semantic identity, foreign revision/digest)' },
    { id: 'role substitution', needle: 'adversarial 3 (role substitution)' },
    { id: 'scope substitution', needle: 'adversarial 4 (scope substitution)' },
    { id: 'promotion without selection', needle: 'adversarial 5 (promotion without selection)' },
    { id: 'selection without valid promotion evidence', needle: '6 (selection without effective promotion)' },
    { id: 'compatibility validation bound to wrong subject/target', needle: 'adversarial 7 (wrong subject/target binding)' },
    { id: 'Manifest partial selected-set coverage', needle: 'adversarial 8 (manifest partial selected-set coverage)' },
    { id: 'Manifest self-referential compatibility result', needle: 'adversarial 9 (self-referential compatibility result)' },
    { id: 'live-state insertion into Manifest opaque content', needle: 'adversarial 10 (live-state insertion)' },
    { id: 'binding/activation evidence insertion into Manifest', needle: 'adversarial 11 (binding/activation evidence insertion)' },
    { id: 'external accepted/requested mistaken for committed', needle: 'adversarial 12 (accepted mistaken for committed)' },
    { id: 'timeout treated as non-commit', needle: 'adversarial 13 (timeout as non-commit)' },
    { id: 'retry under different logical operation when same operation required', needle: 'adversarial 14 (retry under a different logical operation' },
    { id: 'same attempt reused when new attempt required', needle: 'adversarial 15 (same attempt reused' },
    { id: 'idempotency issuer/scope/effect mismatch', needle: 'adversarial 16 (idempotency issuer/scope/effect mismatch)' },
    { id: 'stale external observation', needle: 'adversarial 17 (stale observation)' },
    { id: 'conflicting observations without valid reconciliation evidence', needle: 'adversarial 18 (conflicting observations' },
    { id: 'query/watch/reconcile creating a new effect attempt', needle: 'adversarial 19 (query/watch/reconcile creating an effect attempt)' },
    { id: 'Runtime implementation identity substituted for external authority', needle: 'adversarial 20 (runtime identity as external authority)' },
    { id: 'renderer substituted for Domain UX semantic definition', needle: 'adversarial 21 (renderer as UX semantic definition)' },
    { id: 'UX intent used as Runtime transition authority', needle: 'adversarial 22 (UX intent as Runtime transition authority)' },
    { id: 'provider job substituted for authoritative record', needle: 'adversarial 23 (provider job as authoritative record)' },
    { id: 'compatibility evidence absorption via satisfaction slot', needle: 'adversarial 24 (compatibility evidence absorption' },
    { id: 'attempt identity collapse', needle: 'adversarial 25 (attempt identity collapse' },
  ];
  for (const scenario of mandatedScenarios) {
    assert.ok(
      source.includes(scenario.needle),
      `dispatch-mandated adversarial scenario missing: ${scenario.id}`,
    );
  }
});

test('matrix closure: the C77 positive boundary path spans every mandated lane with ownership marking', () => {
  const source = sourceOf('c77-positive-boundary-path.test.ts');
  const mandatedLanes: readonly { readonly lane: string; readonly needle: string }[] = [
    { lane: 'authored/evolved lineage evidence (NOT_OWNED producer)', needle: 'Lane 1 — authored/evolved lineage evidence [NOT_OWNED producer]' },
    { lane: 'effective promotion evidence (NOT_OWNED authority)', needle: 'Lanes 2+3 — effective promotion evidence [NOT_OWNED authority]' },
    { lane: 'exact ApplicationSelection evidence (NOT_OWNED authority)', needle: 'exact ApplicationSelection evidence [NOT_OWNED authority]' },
    { lane: 'immutable Manifest consumption', needle: 'Harness-owned segment 1 — immutable Manifest consumption' },
    { lane: 'exact compatibility validation', needle: 'Harness-owned segment 2 — exact compatibility validation' },
    { lane: 'Runtime binding', needle: 'Runtime binding and technical activation' },
    { lane: 'Runtime activation', needle: 'Runtime binding and technical activation' },
    { lane: 'logical external operation / ExternalAuthority evidence', needle: 'Harness-owned segment 5 — logical external operation' },
    { lane: 'authoritative external observation + reconciliation evidence (external truth NOT_OWNED)', needle: 'Harness-owned segment 6 — authoritative external observation' },
    { lane: 'Runtime outcome', needle: 'Harness-owned segment 7 — Runtime outcome' },
    { lane: 'UX consequence/correlation evidence (Domain UX semantics NOT_OWNED)', needle: 'Lane 5 — UX consequence/correlation evidence' },
  ];
  for (const { lane, needle } of mandatedLanes) {
    assert.ok(source.includes(needle), `C77 positive path lane missing: ${lane}`);
  }
  // Ownership marking constants are asserted in the test body.
  assert.ok(source.includes("authoredEvolvedProducer: 'NOT_OWNED'"));
  assert.ok(source.includes("promotionAuthority: 'NOT_OWNED'"));
  assert.ok(source.includes("applicationSelectionAuthority: 'NOT_OWNED'"));
  assert.ok(source.includes("externalBusinessSoRTruth: 'NOT_OWNED'"));
  assert.ok(source.includes("domainUxSemantics: 'NOT_OWNED'"));
});
