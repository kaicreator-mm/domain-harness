/**
 * T011 — architecture-gate disposition matrix E1–E11 (gate issue #924;
 * frozen #727 disposition contract; controller #537
 * LOCAL_FIRST_MAX_SAFE_PARALLELISM #537@6042127032; #589 PACK-E T011 frozen).
 *
 * ROLE: aggregation/adjudication ONLY. This suite consumes the accepted
 * T009R full-manifest rerun (E1–E10, PR #920 → efcb1817) via
 * `dispositionMatrix()` — which imports the T009R aggregator rather than
 * duplicating it — plus the accepted #921 terminal chain for E11 (validation
 * 6048043527 CONFIRMED, fresh review 6047975173 PASS, merge record
 * 6048065030). It re-verifies every identity LIVE (git-bound subject
 * HEAD->tree, merge ancestry, freeze-digest deep-match against the landed
 * T010A freeze record) and demonstrates the executable fail-closed paths.
 *
 * Disposition semantics (frozen #727): verdicts preserved verbatim; stale/
 * duplicate/conflicting evidence fails closed; test-count confidence /
 * verdict coercion is refused; any REFUTED verdict or material PARTIAL routes
 * T012_PLUS=HOLD (bounded ChatGPT Web repair/re-review lane, never local
 * repair); all SUPPORTED with only explicitly accepted non-material limits
 * derives T012_T013_AUTHORIZED=YES — which is NOT Version Closure and NOT
 * Release PASS.
 *
 * SOURCE_MUTATION=NONE. Tests/evidence-only write set under tests/t011/.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHITECTURE_DIMENSIONS,
  DispositionRefused,
  dispositionMatrix,
  T011_GATE_ORDER,
  type E11Binding,
} from './t011-disposition.js';
import { AggregationRefused, isAncestor } from '../t009r/t009r-aggregator.js';
import type { Manifest } from '../t009r/t009r-aggregator.js';
import { T010A_FREEZE_RECORD } from '../fixtures/t010a-neutral-definition.freeze.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, '..', 't009r', 't009r-e1-e10-evidence-manifest.json');
const E11_BINDING_PATH = join(HERE, 't011-e11-terminal-binding.json');

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const result = dispositionMatrix(loadJson(MANIFEST_PATH), loadJson(E11_BINDING_PATH));

// ---------------------------------------------------------------------------
// Positive path — the complete E1..E11 disposition matrix.
// ---------------------------------------------------------------------------

describe('T011 disposition — complete matrix E1..E11 (positive path)', () => {
  test('matrix is complete: 12 rows (E8a and E8b distinct, plus E11), frozen deterministic order, no duplicates', () => {
    assert.equal(result.matrix.length, 12);
    assert.deepEqual(
      result.matrix.map((r) => r.gate),
      [...T011_GATE_ORDER],
    );
    assert.equal(new Set(result.matrix.map((r) => r.gate)).size, 12);
  });

  test('every verdict preserved verbatim (12/12 SUPPORTED); Product/L2/SDK impact NONE everywhere', () => {
    for (const row of result.matrix) {
      assert.equal(row.verdict, 'SUPPORTED', `gate ${row.gate} verdict carried exactly`);
      assert.equal(row.productImpact, 'NONE');
      assert.equal(row.l2Impact, 'NONE');
      assert.equal(row.sdkImpact, 'NONE');
    }
    assert.deepEqual(result.nonSupportedVerdicts, []);
  });

  test('E1..E10 rows bind the accepted t009r identities verbatim (issue/PR/merge per gate)', () => {
    const expected: Record<string, [number, number, string]> = {
      E1: [895, 900, 'c9768091285f322da0f3b3c060d5bcb975f1d32e'],
      E2: [887, 891, 'c42f4bc37cbedf4e0ddee448617c904e43922603'],
      E3: [875, 882, 'aa4b4fd1345fe3bdbd66c59220faf15e7f6237fc'],
      E4: [896, 901, '08aee5e6f723220137f5749fae1d784d9bf417b1'],
      E5: [876, 883, '5885c7d2eb1d64c41ef5bb6da445887ccbaa53ff'],
      E6: [897, 902, 'edbf0ed3de05cca4bea0c62291d3abc9dd12cde6'],
      E7: [913, 916, '2b50ba01860e28b76c9eff8e825756555fcff32b'],
      E8a: [877, 884, 'cb7eba1e1527f3e1677a4f3ecd14607d8175dc9d'],
      E8b: [873, 893, '92b71a9f38cb5b642c84116a7ddf3b8441466d5f'],
      E9: [878, 885, 'bdc6c447fb17288a094fb77c0ea30667c403cfb2'],
      E10: [899, 904, '20b65cbc89170c1b02037385e98bb915ca578546'],
    };
    for (const row of result.matrix) {
      if (row.gate === 'E11') continue;
      const [issue, pr, merge] = expected[row.gate]!;
      assert.equal(row.issue, issue, `${row.gate} issue`);
      assert.equal(row.pr, pr, `${row.gate} PR`);
      assert.equal(row.mergeCommit, merge, `${row.gate} merge anchor`);
    }
  });

  test('E11 binds the accepted #921 terminal chain exactly (subject 3694c687, tree 4c30463a, merge 05a72d64, four terminal ids)', () => {
    const e11 = result.matrix.find((r) => r.gate === 'E11')!;
    assert.equal(e11.issue, 921);
    assert.equal(e11.pr, 922);
    assert.equal(e11.subjectHead, '3694c6878d0fe72b67f50f9ca676f319ce045830');
    assert.equal(e11.subjectTree, '4c30463a21f495389f3118f2ef8a787c1a830ed4');
    assert.equal(e11.mergeCommit, '05a72d64fbc28cb2993df195daf65cd5d26541bd');
    assert.deepEqual(Object.values(e11.terminalCommentIds).sort(), [
      '6047764502', '6047975173', '6048043527', '6048065030',
    ]);
    assert.equal(e11.currentness, 'CURRENT');
  });

  test('E11 freeze digests deep-match the landed T010A freeze record (identity-bound to the SAME integrated candidate)', () => {
    const binding = loadJson(E11_BINDING_PATH) as E11Binding;
    assert.equal(
      binding.fixtureDigests.FREEZE_DEFINITION_GRAPH_DIGEST,
      T010A_FREEZE_RECORD.definition.definitionGraphDigest,
    );
    assert.equal(
      binding.fixtureDigests.FREEZE_DEFINITION_GRAPH_DIGEST,
      '030402bf802340d77f1ed88a3a4858dc2202b9b16bc590038d45cbf26b97825c',
    );
    assert.equal(
      T010A_FREEZE_RECORD.toolBinding.bindingDigest,
      '8f5220bfc9c2e41c44cd06cdf36a5369662806a6e311fb1b5e338d2b2df86a87',
    );
    assert.equal(
      T010A_FREEZE_RECORD.finalAssembly.assemblyDigest,
      '400d668f9f806b7b7266c78b2322ffdf13bde07c8aa87a86edd9d78398d677c0',
    );
  });

  test('old E7 #898 row remains NON-SATISFYING: recorded SUPERSEDED in superseded[], never enters the 12-row matrix', () => {
    assert.equal(result.superseded.length, 1);
    const s = result.superseded[0]!;
    assert.equal(s.gate, 'E7');
    assert.equal(s.issue, 898);
    assert.equal(s.disposition, 'SUPERSEDED');
    assert.equal(s.verdict, 'SUPPORTED'); // recorded verbatim, never counted
    assert.equal(s.mergeCommit, '967ef6917ba18832aad108f08d416553f6f9aebb');
    assert.equal(s.supersededByMergeCommit, '2b50ba01860e28b76c9eff8e825756555fcff32b');
    const serialized = JSON.stringify(result.matrix);
    assert.ok(!serialized.includes('"issue":898'));
    assert.ok(!serialized.includes('967ef6917ba18832aad108f08d416553f6f9aebb'));
  });

  test('all merge anchors sit on accepted ancestry: E1-E10 of 2b50ba01; E11 merge anchor binds the T011 base head exactly', () => {
    for (const row of result.matrix) {
      if (row.gate === 'E11') continue;
      assert.ok(
        isAncestor(row.mergeCommit, '2b50ba01860e28b76c9eff8e825756555fcff32b'),
        `${row.gate} merge on t009r integration ancestry`,
      );
    }
    // E11's anchor is bound by EXACT IDENTITY to the T011 base head (the
    // accepted #921 merge record): ancestry-relative-to-HEAD assertions are
    // deliberately NOT used — CI clones --depth=1 --filter=tree:0 (HEAD is a
    // shallow root), so only exact-identity binding is history-independent.
    const e11 = result.matrix.find((r) => r.gate === 'E11')!;
    const binding = loadJson(E11_BINDING_PATH) as E11Binding;
    assert.equal(e11.mergeCommit, '05a72d64fbc28cb2993df195daf65cd5d26541bd');
    assert.equal(binding.t011BaseHead, e11.mergeCommit);
    assert.ok(isAncestor(e11.mergeCommit, binding.t011BaseHead), 'E11 merge anchor on its declared base ancestry');
  });

  test('NO aggregate verdict anywhere in the output (no averaging / majority / test-count confidence / coercion surface)', () => {
    const serialized = JSON.stringify(result);
    for (const banned of ['overallVerdict', 'average', 'majority', 'gatePass', 'passCount', 'testCount', 'confidence']) {
      assert.ok(!serialized.includes(`"${banned}"`), `output must not contain "${banned}"`);
    }
  });

  test('deterministic: shuffled t009r input and a pristine rerun are byte-identical', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.gates = [...m.gates].reverse();
    const shuffled = dispositionMatrix(m, loadJson(E11_BINDING_PATH));
    const again = dispositionMatrix(loadJson(MANIFEST_PATH), loadJson(E11_BINDING_PATH));
    assert.equal(JSON.stringify(shuffled), JSON.stringify(result));
    assert.equal(JSON.stringify(again), JSON.stringify(result));
  });
});

// ---------------------------------------------------------------------------
// Seven-dimension architecture adjudication (#727).
// ---------------------------------------------------------------------------

describe('T011 disposition — seven falsifiable architecture dimensions (#727)', () => {
  test('exactly the seven frozen dimensions are adjudicated', () => {
    assert.deepEqual(
      result.dimensions.map((d) => d.dimension),
      ARCHITECTURE_DIMENSIONS.map((d) => d.dimension),
    );
    assert.equal(result.dimensions.length, 7);
  });

  test('all seven dimensions are SUPPORTED with every supporting gate SUPPORTED', () => {
    for (const d of result.dimensions) {
      assert.equal(d.disposition, 'SUPPORTED', `${d.dimension} disposition`);
      assert.ok(d.supporting.length >= 2, `${d.dimension} maps to concrete gates`);
      for (const s of d.supporting) {
        assert.equal(s.verdict, 'SUPPORTED', `${d.dimension}/${s.gate}`);
        // Exact identity: the supporting entry IS the matrix row.
        const row = result.matrix.find((r) => r.gate === s.gate)!;
        assert.equal(s.issue, row.issue);
        assert.equal(s.mergeCommit, row.mergeCommit);
        assert.equal(s.subjectHead, row.subjectHead);
        assert.equal(s.subjectTree, row.subjectTree);
      }
    }
  });

  test('every dimension cites its frozen planning source (#517 Product freeze / #526 L2 freeze) without rewriting it', () => {
    for (const d of result.dimensions) {
      assert.match(d.planningSource, /#517|#526/, `${d.dimension} planning source`);
      assert.ok(d.claim.length > 80, `${d.dimension} carries the falsifiable claim`);
    }
  });

  test('dimension -> gate mapping covers the full E1..E11 matrix (every gate supports at least one dimension)', () => {
    const covered = new Set(result.dimensions.flatMap((d) => d.supporting.map((s) => s.gate)));
    for (const row of result.matrix) {
      assert.ok(covered.has(row.gate), `gate ${row.gate} supports at least one architecture dimension`);
    }
  });
});

// ---------------------------------------------------------------------------
// Disposition semantics — the derived T012/T013 handoff.
// ---------------------------------------------------------------------------

describe('T011 disposition — T012/T013 handoff semantics (frozen #727)', () => {
  test('all SUPPORTED with only accepted non-material limits => T012_T013_AUTHORIZED=YES is DERIVED (not assumed)', () => {
    assert.equal(result.t012PlusDisposition, 'T012_T013_AUTHORIZED=YES');
    assert.equal(result.holdRoute, null);
    // The derivation inputs: no non-SUPPORTED verdict, no non-SUPPORTED dimension.
    assert.deepEqual(result.nonSupportedVerdicts, []);
    assert.ok(result.dimensions.every((d) => d.disposition === 'SUPPORTED'));
  });

  test('T012_T013_AUTHORIZED=YES is NOT Version Closure and NOT Release PASS', () => {
    assert.equal(result.versionClosure, 'NO');
    assert.equal(result.releasePass, 'NO');
    assert.equal(result.prPassNotReleasePass, true);
  });

  test('accepted limits: all committed limits are NON_MATERIAL with acceptance authority cited (#725, #915-derived, environment disclosures)', () => {
    assert.ok(result.limits.length >= 3, 'E11 accepted limits recorded');
    for (const l of result.limits) {
      assert.equal(l.materiality, 'NON_MATERIAL');
      assert.ok(l.acceptanceAuthority.length > 10, `${l.id} cites acceptance authority`);
    }
    const joined = result.limits.map((l) => l.id).join(' ');
    assert.ok(joined.includes('REPRESENTATIVE_SUBSET'));
    assert.ok(joined.includes('DERIVED_VARIANT'));
  });

  test('currentness policy binds the no-impact audits (rebinds / successor reruns are recorded, never silent)', () => {
    assert.match(result.currentnessPolicy, /NO_IMPACT_CURRENTNESS_ACCEPTED/);
    const rebinds = result.matrix.filter((r) => r.currentness === 'CURRENT_REBIND_RECORDED').map((r) => r.gate);
    const successors = result.matrix.filter((r) => r.currentness === 'SUCCESSOR_RERUN_ACCEPTED').map((r) => r.gate);
    assert.deepEqual([...rebinds].sort(), ['E5', 'E8a']);
    assert.deepEqual([...successors].sort(), ['E1', 'E7']);
  });
});

// ---------------------------------------------------------------------------
// Negative controls (executable fail-closed demonstrations).
// ---------------------------------------------------------------------------

describe('T011 disposition — NEGATIVE CONTROL: stale/superseded evidence must not satisfy', () => {
  test('old E7 #898 row posed as a live gate row is refused (AGG_DUPLICATE_GATE / AGG_SUPERSEDED_INVALID family)', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    const e7 = m.gates.find((g) => g.gate === 'E7')!;
    const old = JSON.parse(JSON.stringify(m.supersededRows![0]));
    m.gates = [
      ...m.gates.filter((g) => g.gate !== 'E7' && g.gate !== 'E9'),
      { ...e7, issue: old.issue, pr: old.pr, mergeCommit: old.mergeCommit, subjectHead: old.subjectHead, subjectTree: old.subjectTree, terminalCommentIds: old.terminalCommentIds },
      e7,
    ];
    assert.throws(
      () => dispositionMatrix(m, loadJson(E11_BINDING_PATH)),
      (err: unknown) => err instanceof AggregationRefused || err instanceof DispositionRefused,
    );
  });

  test('dropping the superseded #898 record is refused — never silently dropped', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.supersededRows = [];
    assert.throws(() => dispositionMatrix(m, loadJson(E11_BINDING_PATH)), /AGG_SUPERSEDED_MISSING/);
  });

  test('stale E11 currentness (SUCCESSOR_RERUN_ACCEPTED on a non-rerun row / unknown token) is refused', () => {
    const b = loadJson(E11_BINDING_PATH) as E11Binding;
    b.currentness = 'STALE';
    assert.throws(() => dispositionMatrix(loadJson(MANIFEST_PATH), b), /DISP_STALE_EVIDENCE/);
  });

  test('foreign freeze digest in the E11 binding is refused (identity binding has teeth)', () => {
    const b = loadJson(E11_BINDING_PATH) as E11Binding;
    b.fixtureDigests.FREEZE_DEFINITION_GRAPH_DIGEST =
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    assert.throws(() => dispositionMatrix(loadJson(MANIFEST_PATH), b), /DISP_DIGEST_MISMATCH/);
  });
});

describe('T011 disposition — NEGATIVE CONTROL: duplicate/conflicting evidence fails closed', () => {
  test('E11 binding pointing at a different gate issue/PR is refused', () => {
    const b = loadJson(E11_BINDING_PATH) as E11Binding;
    b.pr = 921;
    assert.throws(() => dispositionMatrix(loadJson(MANIFEST_PATH), b), /DISP_SCHEMA/);
  });

  test('an E11 terminal comment id colliding with another gate row is refused (duplicate/conflict)', () => {
    const b = loadJson(E11_BINDING_PATH) as E11Binding;
    b.terminalCommentIds.validation = '6039802398'; // E1's validation terminal
    assert.throws(() => dispositionMatrix(loadJson(MANIFEST_PATH), b), /DISP_CONFLICT/);
  });

  test('a dimension citing a terminal id the gate row does not carry is refused (exact-identity citation enforced)', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    const e10 = m.gates.find((g) => g.gate === 'E10')!;
    e10.terminalCommentIds.validation = '0000000001'; // unbind D6's keyTerminal
    assert.throws(() => dispositionMatrix(m, loadJson(E11_BINDING_PATH)), /DISP_DIMENSION_BINDING/);
  });
});

describe('T011 disposition — NEGATIVE CONTROL: verdict coercion / test-count confidence substitution', () => {
  test('coerced verdict string (not an exact token) is refused', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.gates.find((g) => g.gate === 'E5')!.verdict = 'SUPPORTED (was REFUTED)';
    assert.throws(() => dispositionMatrix(m, loadJson(E11_BINDING_PATH)), /AGG_VERDICT_INVALID/);
  });

  test('test-count confidence substitution (passCount/supportingTestCount) anywhere in the inputs is refused', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    (m.gates.find((g) => g.gate === 'E2') as unknown as Record<string, unknown>).supportingTestCount = 17;
    assert.throws(() => dispositionMatrix(m, loadJson(E11_BINDING_PATH)), /DISP_TEST_COUNT_CONFIDENCE/);
    const b = loadJson(E11_BINDING_PATH) as E11Binding;
    (b as unknown as Record<string, unknown>).confidence = 0.99;
    assert.throws(() => dispositionMatrix(loadJson(MANIFEST_PATH), b), /DISP_TEST_COUNT_CONFIDENCE/);
  });

  test('an accepted-limit entry smuggling an aggregate verdict key is refused', () => {
    const b = loadJson(E11_BINDING_PATH) as E11Binding;
    (b.acceptedLimits![0] as unknown as Record<string, unknown>).overallVerdict = 'SUPPORTED';
    assert.throws(() => dispositionMatrix(loadJson(MANIFEST_PATH), b), /DISP_TEST_COUNT_CONFIDENCE/);
  });
});

describe('T011 disposition — NEGATIVE CONTROL: injected REFUTED routes T012_PLUS=HOLD (never silently absorbed)', () => {
  test('a REFUTED verdict in any gate row routes the whole disposition to HOLD with the bounded ChatGPT Web lane', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.gates.find((g) => g.gate === 'E3')!.verdict = 'REFUTED'; // simulated honest verdict
    const r = dispositionMatrix(m, loadJson(E11_BINDING_PATH));
    assert.equal(r.t012PlusDisposition, 'T012_PLUS=HOLD');
    assert.equal(r.holdRoute, 'BOUNDED_CHATGPT_WEB_REPAIR_REVIEW_LANE');
    assert.deepEqual(r.nonSupportedVerdicts, [{ gate: 'E3', verdict: 'REFUTED' }]);
    // The REFUTED verdict is preserved verbatim, never rewritten or suppressed.
    assert.equal(r.matrix.find((row) => row.gate === 'E3')!.verdict, 'REFUTED');
    // The supporting dimension goes REFUTED with the row's exact identity.
    const d3 = r.dimensions.find((d) => d.dimension === 'D3_TOOL_CAPABILITY_RESOURCE_EXACTNESS')!;
    assert.equal(d3.disposition, 'REFUTED');
    assert.equal(d3.supporting.find((s) => s.gate === 'E3')!.verdict, 'REFUTED');
    // And HOLD is still NOT Version Closure / NOT Release PASS.
    assert.equal(r.versionClosure, 'NO');
    assert.equal(r.releasePass, 'NO');
  });

  test('an unaccepted PARTIAL verdict also routes HOLD (fail closed; no silent downgrade)', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.gates.find((g) => g.gate === 'E9')!.verdict = 'PARTIAL';
    const r = dispositionMatrix(m, loadJson(E11_BINDING_PATH));
    assert.equal(r.t012PlusDisposition, 'T012_PLUS=HOLD');
    assert.equal(r.holdRoute, 'BOUNDED_CHATGPT_WEB_REPAIR_REVIEW_LANE');
  });

  test('a self-declared NON_MATERIAL accepted limit canNOT launder a REFUTED verdict (verdict-level refutation is always material)', () => {
    const m = loadJson(MANIFEST_PATH) as Manifest;
    m.gates.find((g) => g.gate === 'E10')!.verdict = 'REFUTED';
    const b = loadJson(E11_BINDING_PATH) as E11Binding;
    b.acceptedLimits!.push({
      id: 'L-ATTACK-DOWNGRADE',
      text: 'attempt to declare the E10 refutation non-material',
      materiality: 'NON_MATERIAL',
      acceptanceAuthority: 'none — attack',
    });
    // The attack entry is recorded on gate E11, and even naming cannot rescue
    // a REFUTED row: the disposition MUST stay HOLD.
    const r = dispositionMatrix(m, b);
    assert.equal(r.t012PlusDisposition, 'T012_PLUS=HOLD');
  });

  test('a MATERIAL limit anywhere routes HOLD even with all verdicts SUPPORTED', () => {
    const b = loadJson(E11_BINDING_PATH) as E11Binding;
    b.acceptedLimits!.push({
      id: 'L-MATERIAL-TEST',
      text: 'synthetic material limit',
      materiality: 'MATERIAL',
      acceptanceAuthority: 'none — negative control',
    });
    const r = dispositionMatrix(loadJson(MANIFEST_PATH), b);
    assert.equal(r.t012PlusDisposition, 'T012_PLUS=HOLD');
  });
});

describe('T011 disposition — sanity against over-blocking', () => {
  test('control: pristine inputs still produce the authorized disposition', () => {
    assert.doesNotThrow(() => dispositionMatrix(loadJson(MANIFEST_PATH), loadJson(E11_BINDING_PATH)));
    assert.equal(result.t012PlusDisposition, 'T012_T013_AUTHORIZED=YES');
  });
});
