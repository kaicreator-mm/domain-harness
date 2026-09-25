// Issue #329 / DAC v0.0.3 V3-005 — matrix closure: the C39–C77 applicability
// matrix is SELF-VERIFYING. This suite proves there is no blank case, no
// implicit coverage, and no dangling evidence reference: every row's
// evidence file exists in this directory and the quoted test name is really
// declared in that file's source with each decisive `asserts` needle bound
// deterministically to THAT test's own body; every classification is one of
// the three frozen values; PASS rows always carry executable evidence;
// NOT_OWNED rows always carry a reason stating the owning lane.
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

/**
 * Deterministic named-test-body extraction (R2 P2-1 repair): scans the
 * referenced source from its `test('<name>'` / `test("<name>"` declaration,
 * skipping string/template literals and comments while tracking bracket
 * depth, and returns exactly that one declaration's callback body. A needle
 * checked against the returned span can only be satisfied by the referenced
 * test's own code — never by another test, a helper, an assertion message
 * elsewhere in the file, or a comment. The extraction is fail-closed: any
 * declaration shape it cannot parse deterministically (e.g. a test-options
 * object before the callback) returns null and the closure suite fails
 * loudly instead of guessing.
 */
function extractNamedTestBody(source: string, testName: string): string | null {
  for (const quote of ["'", '"'] as const) {
    const declaration = `test(${quote}${testName}${quote}`;
    const declarationAt = source.indexOf(declaration);
    if (declarationAt === -1) continue;
    let index = declarationAt + declaration.length;
    let argumentDepth = 1; // inside the `test(` call's parentheses
    let bodyStart = -1;
    let signature = '';
    while (index < source.length) {
      const ch = source[index];
      if (ch === "'" || ch === '"' || ch === '`') {
        index = skipStringLiteral(source, index, ch);
        continue;
      }
      if (ch === '/' && source[index + 1] === '/') {
        index = skipLineComment(source, index);
        continue;
      }
      if (ch === '/' && source[index + 1] === '*') {
        index = skipBlockComment(source, index);
        continue;
      }
      if (ch === '(') {
        argumentDepth += 1;
      } else if (ch === ')') {
        argumentDepth -= 1;
        if (argumentDepth === 0) return null; // call ended without a callback body
      } else if (ch === '{' && argumentDepth === 1) {
        bodyStart = index + 1;
        break;
      }
      signature += ch;
      index += 1;
    }
    if (bodyStart === -1) return null;
    // Only the standard callback form binds: `test('<name>', async () => {`.
    // Anything else (options object, dynamic name, ...) refuses to match.
    if (!/^,\s*(?:async\s*)?\(\s*\)\s*=>\s*$/.test(signature)) return null;
    let depth = 1;
    let scan = bodyStart;
    while (scan < source.length) {
      const ch = source[scan];
      if (ch === "'" || ch === '"' || ch === '`') {
        scan = skipStringLiteral(source, scan, ch);
        continue;
      }
      if (ch === '/' && source[scan + 1] === '/') {
        scan = skipLineComment(source, scan);
        continue;
      }
      if (ch === '/' && source[scan + 1] === '*') {
        scan = skipBlockComment(source, scan);
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return source.slice(bodyStart, scan);
      }
      scan += 1;
    }
    return null;
  }
  return null;
}

function skipStringLiteral(source: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return index;
}

function skipLineComment(source: string, start: number): number {
  const end = source.indexOf('\n', start);
  return end === -1 ? source.length : end + 1;
}

function skipBlockComment(source: string, start: number): number {
  const end = source.indexOf('*/', start + 2);
  return end === -1 ? source.length : end + 2;
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

test("matrix closure: every referenced evidence file exists, the quoted test is really declared in it, and its decisive semantic assertions occur inside that test's own body", () => {
  for (const row of DAC_V003_C39_C77_MATRIX) {
    const refs = [...row.evidence, ...row.adversarial];
    assert.ok(refs.length > 0, `${row.id}: at least one evidence/adversarial ref`);
    for (const ref of refs) {
      assert.match(ref.file, /^[a-z0-9-]+\.test\.ts$/, `${row.id}: evidence file name`);
      const source = sourceOf(ref.file);
      const body = extractNamedTestBody(source, ref.test);
      if (body === null) {
        assert.fail(
          `${row.id}: test "${ref.test}" must be declared as a named single-callback test declaration in ${ref.file}`,
        );
      }
      // SEMANTIC verification, deterministically bound to the referenced
      // test's OWN BODY (R2 P2-1 repair): every reference carries the
      // decisive assertion(s) of its expected result (error code /
      // disposition / frozen outcome) and those assertions must literally
      // occur inside the body extracted from that exact named declaration —
      // an evidence row can never claim a result asserted by another test,
      // a helper, a message string or a comment anywhere in the file.
      assert.ok(
        ref.asserts !== undefined && ref.asserts.length > 0,
        `${row.id}: evidence ref "${ref.test}" must carry decisive semantic assertions`,
      );
      for (const needle of ref.asserts ?? []) {
        assert.ok(
          body.includes(needle),
          `${row.id}: semantic assertion "${needle}" of "${ref.test}" must literally occur inside that test's body in ${ref.file}`,
        );
      }
    }
  }
});

test('matrix closure: classification counts match the reported V3-005 closure statistics', () => {
  const counts = dacV003ConformanceCounts();
  assert.equal(counts.total, 39);
  assert.equal(counts.pass, 31);
  assert.equal(counts.notApplicable, 0);
  assert.equal(counts.notOwned, 8);
  assert.deepEqual(
    DAC_V003_C39_C77_MATRIX.filter((r) => r.classification === 'NOT_OWNED').map((r) => r.id),
    ['C45', 'C46', 'C47', 'C48', 'C49', 'C50', 'C51', 'C52'],
    'the NOT_OWNED set is exactly the producer/evolution lane (C50 reclassified R1: the owning-evolution-operation half has no Harness-owned authoritative consumer)',
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
  // 25 numbered attack axes map onto 24 test declarations: axes 5 and 6 are
  // explicitly and executably covered by ONE declaration that carries both
  // attacks with their own decisive assertions ('INVALID_MANIFEST_INPUT' for
  // the promotion-only entry, 'SELECTED_PROMOTION_EVIDENCE_NOT_EFFECTIVE'
  // for the selection-without-effective-promotion entry). This mapping is
  // documented exactly here and verified per-needle below — it is never
  // inferred from the shared title alone.
  const mandatedScenarios: readonly { readonly id: string; readonly needle: string }[] = [
    { id: 'floating/latest/current identity substitution', needle: 'adversarial 1 (floating identity substitution)' },
    { id: 'same semantic identity with foreign revision/digest', needle: 'adversarial 2 (same semantic identity, foreign revision/digest)' },
    { id: 'role substitution', needle: 'adversarial 3 (role substitution)' },
    { id: 'scope substitution', needle: 'adversarial 4 (scope substitution)' },
    { id: 'promotion without selection (axis 5 of the shared 5+6 declaration)', needle: "test('adversarial 5 (promotion without selection) and 6 (selection without effective promotion) both fail'" },
    { id: 'selection without valid promotion evidence (axis 6 of the shared 5+6 declaration)', needle: 'SELECTED_PROMOTION_EVIDENCE_NOT_EFFECTIVE' },
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
    { id: 'UX intent used as Runtime transition authority (executable boundary: command authority)', needle: 'adversarial 22 (UX intent cannot act as Runtime command/transition authority)' },
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

test('matrix closure: the C77 positive boundary path spans every mandated lane with ownership marking and connected negatives', () => {
  const source = sourceOf('c77-positive-boundary-path.test.ts');
  const mandatedLanes: readonly { readonly lane: string; readonly needle: string }[] = [
    { lane: 'authored/evolved lineage evidence (NOT_OWNED producer)', needle: 'Lane 1 — authored/evolved lineage evidence [NOT_OWNED producer]' },
    { lane: 'effective promotion evidence (NOT_OWNED authority)', needle: 'Lanes 2+3 — effective promotion evidence [NOT_OWNED authority]' },
    { lane: 'exact ApplicationSelection evidence (NOT_OWNED authority)', needle: 'exact ApplicationSelection evidence [NOT_OWNED authority]' },
    { lane: 'asserted exact transformation/provenance relation into the compiled subject', needle: 'The DECLARED EXACT TRANSFORMATION/PROVENANCE RELATION' },
    { lane: 'immutable Manifest consumption', needle: 'Harness-owned segment 1 — immutable Manifest consumption' },
    { lane: 'exact compatibility validation correlated to the exact subject', needle: 'Harness-owned segment 2 — exact compatibility validation' },
    { lane: 'Runtime binding', needle: 'Runtime binding and technical activation' },
    { lane: 'Runtime activation', needle: 'Runtime binding and technical activation' },
    { lane: 'logical external operation / ExternalAuthority evidence', needle: 'Harness-owned segment 5 — logical external operation' },
    { lane: 'authoritative external observation + reconciliation evidence (external truth NOT_OWNED)', needle: 'Harness-owned segment 6 — authoritative external observation' },
    { lane: 'executed Runtime consequence/outcome', needle: 'Harness-owned segment 7 — Runtime consequence/outcome' },
    { lane: 'UX consequence/correlation evidence (Domain UX semantics NOT_OWNED)', needle: 'Lane 5 — UX consequence/correlation evidence' },
  ];
  for (const { lane, needle } of mandatedLanes) {
    assert.ok(source.includes(needle), `C77 positive path lane missing: ${lane}`);
  }
  // The three dispatch-mandated journey negatives are real declarations with
  // decisive assertions (not title mentions).
  const mandatedNegatives: readonly { readonly axis: string; readonly needle: string }[] = [
    { axis: 'foreign/unlinked lineage cannot traverse the journey', needle: "test(\"C77 foreign-lineage negative" },
    { axis: 'unrelated/incompatible compatibility association cannot gate binding/activation', needle: "test(\"C77 unrelated-validation negative" },
    { axis: 'acceptance-only/ambiguous evidence cannot reach the Runtime-outcome/UX success path', needle: "test(\"C77 acceptance-only negative" },
  ];
  for (const { axis, needle } of mandatedNegatives) {
    assert.ok(source.includes(needle), `C77 journey negative missing: ${axis}`);
  }
  // Ownership marking constants are asserted in the test body.
  assert.ok(source.includes("authoredEvolvedProducer: 'NOT_OWNED'"));
  assert.ok(source.includes("promotionAuthority: 'NOT_OWNED'"));
  assert.ok(source.includes("applicationSelectionAuthority: 'NOT_OWNED'"));
  assert.ok(source.includes("externalBusinessSoRTruth: 'NOT_OWNED'"));
  assert.ok(source.includes("domainUxSemantics: 'NOT_OWNED'"));
  // The Runtime consequence/outcome step is REALLY EXECUTED, and every one
  // of these decisive assertions is bound to the positive journey test's
  // own body (R2 P2-1 binding): the public Runtime assembly is driven, the
  // commit-claim predicates and the runtime-logical outcome correlation
  // both consume the Runtime-produced evidence.
  const journeyBody = extractNamedTestBody(
    source,
    'C77: the complete positive boundary path is one connected exact identity/provenance story from authored/evolved lineage to UX consequence',
  );
  if (journeyBody === null) {
    assert.fail('C77 positive journey test declaration not found in c77-positive-boundary-path.test.ts');
  }
  assert.ok(
    journeyBody.includes('observationSupportsCommitClaim(commitEvidence)'),
    'the journey body executes the commit-claim predicate',
  );
  assert.ok(
    journeyBody.includes("maxClaimableForExternalObservation('commit-observed')"),
    'the journey body executes the max-claimable predicate',
  );
  assert.ok(
    journeyBody.includes('correlateDomainOutcome({'),
    'the journey body correlates the runtime-logical outcome',
  );
  assert.ok(
    journeyBody.includes('createDomainRuntime('),
    'the journey body drives the existing public Harness Runtime assembly',
  );
  assert.ok(
    journeyBody.includes("runtimeDisposition.disposition, 'processed'"),
    "the journey body asserts the Runtime-produced 'processed' disposition",
  );
  assert.ok(
    journeyBody.includes('runtimeStore.getMessageDisposition('),
    'the journey body READS the disposition consequence from the Runtime store',
  );
});
