/**
 * T002A deterministic Kind compatibility decision contract tests (issue #552).
 *
 * The compatibility seam is a pure, deterministic, fail-closed decision
 * function over one required exact `KindRef` (kindId + exact version, the
 * `src/contracts/component.ts` type) and a caller-supplied supported set of
 * exact KindRefs. Exact equality on both kindId and version — no fallback, no
 * ordering, no `latest`/`current`/`default` selection, and no compatibility
 * ranges: range/floating references are typed rejections, never resolved.
 * There is deliberately no Kind catalog and no implementation registry here.
 *
 * R1..R12 map to the twelve minimum requirements of the task pack.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideKindCompatibility,
  KindCompatibilityError,
  type KindCompatibilityErrorCode,
  type KindCompatibilityFailureClass,
  type KindCompatibilityResult,
  type SupportedKindSet,
} from '../../src/contracts/kind-compatibility.js';
import type { ComponentEnvelope, KindRef } from '../../src/contracts/component.js';
import { validateComponentEnvelope } from '../../src/contracts/component.js';

/**
 * The frozen failure taxonomy: each failure code maps to exactly one failure
 * class. Every failure assertion in this file is checked against this table,
 * so the 1:1 code-to-class mapping is enforced across the whole suite.
 */
const EXPECTED_FAILURE_CLASS_BY_CODE: Record<KindCompatibilityErrorCode, KindCompatibilityFailureClass> = {
  KIND_NOT_SUPPORTED: 'KIND',
  KIND_VERSION_NOT_SUPPORTED: 'KIND',
  INCOMPATIBLE_KIND_REF: 'KIND',
  INVALID_COMPATIBILITY_INPUT: 'INPUT',
};

const observedFailureCodes = new Set<KindCompatibilityErrorCode>();

const RULE_KIND: KindRef = { kindId: 'decision.rule.v1', version: '1.2.0' };

function supportedSet(...kinds: KindRef[]): SupportedKindSet {
  return kinds.map((kind) => ({ kindId: kind.kindId, version: kind.version }));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.getOwnPropertyNames(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function snapshot<T>(value: T): string {
  return JSON.stringify(value);
}

function expectCompatibilityFailure(
  decide: () => KindCompatibilityResult,
  code: KindCompatibilityErrorCode,
): KindCompatibilityError {
  observedFailureCodes.add(code);
  return assert.throws(
    decide,
    (error: unknown) => {
      if (!(error instanceof KindCompatibilityError)) {
        return false;
      }
      assert.equal(error.name, 'KindCompatibilityError');
      assert.equal(error.code, code);
      assert.equal(
        error.failureClass,
        EXPECTED_FAILURE_CLASS_BY_CODE[code],
        `failure code ${code} must carry exactly one deterministic failure class`,
      );
      return true;
    },
    `expected a typed ${code} compatibility failure`,
  ) as KindCompatibilityError;
}

// ---------------------------------------------------------------------------
// R1 — exact match (kindId AND exact version) decides SUPPORTED with fresh
// matched evidence.
// ---------------------------------------------------------------------------

test('T002A-R1: an exact KindRef present in the supported set decides SUPPORTED with fresh matched evidence', () => {
  const required: KindRef = { kindId: 'decision.rule.v1', version: '1.2.0' };
  const set = supportedSet(
    { kindId: 'doc.generate.v1', version: '3.0.0' },
    RULE_KIND,
    { kindId: 'decision.rule.v1', version: '2.0.0' },
  );
  const frozenRequired = deepFreeze(required);
  const frozenSet = deepFreeze(set);

  const result = decideKindCompatibility(frozenRequired, frozenSet);

  assert.equal(result.status, 'SUPPORTED');
  assert.deepEqual(result.supportedKind, { kindId: 'decision.rule.v1', version: '1.2.0' });
  // fresh, non-aliased evidence: not the required ref object nor any set entry
  assert.notEqual(result.supportedKind, required);
  assert.notEqual(result.supportedKind, frozenSet[1]);
  assert.deepEqual(Object.keys(result.supportedKind).sort(), ['kindId', 'version']);
});

// ---------------------------------------------------------------------------
// R2 — a kindId declared nowhere in the supported set fails typed
// KIND_NOT_SUPPORTED (class KIND); never a boolean, never a silent default.
// ---------------------------------------------------------------------------

test('T002A-R2: a kindId declared nowhere fails KIND_NOT_SUPPORTED (class KIND)', () => {
  const error = expectCompatibilityFailure(
    () =>
      decideKindCompatibility(
        { kindId: 'decision.other.v1', version: '1.2.0' },
        supportedSet(RULE_KIND),
      ),
    'KIND_NOT_SUPPORTED',
  );
  assert.match(error.message, /decision\.other\.v1/);
});

// ---------------------------------------------------------------------------
// R3 — known kindId at the wrong exact version fails KIND_VERSION_NOT_SUPPORTED,
// distinguishable from unknown kind; no fallback to another version.
// ---------------------------------------------------------------------------

test('T002A-R3: known kindId at an absent exact version fails KIND_VERSION_NOT_SUPPORTED, distinct from KIND_NOT_SUPPORTED', () => {
  const error = expectCompatibilityFailure(
    () =>
      decideKindCompatibility(
        { kindId: 'decision.rule.v1', version: '1.5.0' },
        supportedSet(
          { kindId: 'decision.rule.v1', version: '1.0.0' },
          { kindId: 'decision.rule.v1', version: '2.0.0' },
        ),
      ),
    'KIND_VERSION_NOT_SUPPORTED',
  );
  assert.notEqual(error.code, 'KIND_NOT_SUPPORTED');
  assert.equal(error.failureClass, 'KIND');
});

// ---------------------------------------------------------------------------
// R4 — no fallback/ordering/selection exists (adversarial): bracketing
// versions, entry-order permutation, and the empty supported set.
// ---------------------------------------------------------------------------

test('T002A-R4: bracketing supported versions still decide KIND_VERSION_NOT_SUPPORTED — no nearest/bound/lexical pick', () => {
  // supported 1.9.0 and 2.1.0 bracket required 2.0.0: any nearest-version,
  // lower-bound, upper-bound, or lexicographic-max pick would flip this result.
  expectCompatibilityFailure(
    () =>
      decideKindCompatibility(
        { kindId: 'decision.rule.v1', version: '2.0.0' },
        supportedSet(
          { kindId: 'decision.rule.v1', version: '1.9.0' },
          { kindId: 'decision.rule.v1', version: '2.1.0' },
        ),
      ),
    'KIND_VERSION_NOT_SUPPORTED',
  );
});

test('T002A-R4: permuting supported-set entry order yields deep-equal decisions', () => {
  const required: KindRef = { kindId: 'decision.rule.v1', version: '1.2.0' };
  const other: KindRef = { kindId: 'decision.rule.v1', version: '2.0.0' };
  const forward = decideKindCompatibility(required, supportedSet(other, RULE_KIND));
  const reversed = decideKindCompatibility(required, supportedSet(RULE_KIND, other));
  assert.deepEqual(forward, reversed);

  // the failure decision is equally order-independent (message carries no index)
  const failureA = expectCompatibilityFailure(
    () => decideKindCompatibility({ kindId: 'decision.rule.v1', version: '9.9.9' }, supportedSet(other, RULE_KIND)),
    'KIND_VERSION_NOT_SUPPORTED',
  );
  const failureB = expectCompatibilityFailure(
    () => decideKindCompatibility({ kindId: 'decision.rule.v1', version: '9.9.9' }, supportedSet(RULE_KIND, other)),
    'KIND_VERSION_NOT_SUPPORTED',
  );
  assert.equal(failureA.code, failureB.code);
  assert.equal(failureA.failureClass, failureB.failureClass);
  assert.equal(failureA.message, failureB.message);
});

test('T002A-R4: an empty supported set is valid input that supports nothing', () => {
  expectCompatibilityFailure(
    () => decideKindCompatibility(RULE_KIND, []),
    'KIND_NOT_SUPPORTED',
  );
});

// ---------------------------------------------------------------------------
// R5 — range/floating required refs are typed rejections (INCOMPATIBLE_KIND_REF),
// never resolved, even when the set holds versions a range engine would accept.
// ---------------------------------------------------------------------------

test('T002A-R5: range/floating/x-range required refs fail INCOMPATIBLE_KIND_REF unconditionally', () => {
  const satisfyingSet = supportedSet(
    { kindId: 'decision.rule.v1', version: '1.0.0' },
    { kindId: 'decision.rule.v1', version: '1.2.0' },
    { kindId: 'decision.rule.v1', version: '2.0.0' },
  );
  for (const selector of [
    '^1.0.0',
    '~1.2.3',
    '>=2.0.0',
    '<3.0.0',
    '1.x',
    '1.X',
    '1.',
    'x',
    'latest',
    'current',
    'active',
    'default',
    '*',
    '1.0.0 || 2.0.0',
    '1.2.*',
  ]) {
    const error = expectCompatibilityFailure(
      () =>
        decideKindCompatibility({ kindId: 'decision.rule.v1', version: selector }, satisfyingSet),
      'INCOMPATIBLE_KIND_REF',
    );
    assert.equal(error.failureClass, 'KIND');
  }
  // a floating/range kindId is equally a typed rejection, not a lookup
  expectCompatibilityFailure(
    () => decideKindCompatibility({ kindId: 'latest', version: '1.2.0' }, satisfyingSet),
    'INCOMPATIBLE_KIND_REF',
  );
});

// ---------------------------------------------------------------------------
// R6 — floating/range entries and duplicates inside the supported set are
// input failures (INVALID_COMPATIBILITY_INPUT, class INPUT) before any lookup.
// ---------------------------------------------------------------------------

test('T002A-R6: floating/range supported-set entries fail INVALID_COMPATIBILITY_INPUT before any lookup', () => {
  for (const selector of ['^1.0.0', '~2.0.0', 'latest', '*', '1.x', '1.', '>=2.0.0']) {
    expectCompatibilityFailure(
      () =>
        decideKindCompatibility(
          RULE_KIND,
          supportedSet({ kindId: 'decision.rule.v1', version: selector }),
        ),
      'INVALID_COMPATIBILITY_INPUT',
    );
  }
  // a floating kindId entry is equally an input failure
  expectCompatibilityFailure(
    () =>
      decideKindCompatibility(
        RULE_KIND,
        supportedSet({ kindId: 'current', version: '1.2.0' }),
      ),
    'INVALID_COMPATIBILITY_INPUT',
  );
});

test('T002A-R6: duplicate exact KindRef entries fail INVALID_COMPATIBILITY_INPUT', () => {
  // identical duplicates
  expectCompatibilityFailure(
    () => decideKindCompatibility(RULE_KIND, supportedSet(RULE_KIND, RULE_KIND)),
    'INVALID_COMPATIBILITY_INPUT',
  );
  // same kindId@version, independently constructed entries
  expectCompatibilityFailure(
    () =>
      decideKindCompatibility(
        RULE_KIND,
        supportedSet(RULE_KIND, { kindId: 'decision.rule.v1', version: '1.2.0' }),
      ),
    'INVALID_COMPATIBILITY_INPUT',
  );
});

// ---------------------------------------------------------------------------
// R7 — structurally invalid input fails closed with a typed code, never a
// TypeError.
// ---------------------------------------------------------------------------

test('T002A-R7: structurally invalid required refs fail INVALID_COMPATIBILITY_INPUT, not a TypeError', () => {
  const validSet = supportedSet(RULE_KIND);
  const badRequiredRefs: unknown[] = [
    null,
    undefined,
    'decision.rule.v1@1.2.0',
    42,
    ['decision.rule.v1', '1.2.0'],
    // wrong shape: missing/extra fields
    { kindId: 'decision.rule.v1' },
    { version: '1.2.0' },
    {},
    { kindId: 'decision.rule.v1', version: '1.2.0', implementationId: 'rule-engine@9' },
    // non-string fields
    { kindId: 42, version: '1.2.0' },
    { kindId: 'decision.rule.v1', version: 42 },
    { kindId: null, version: '1.2.0' },
    // empty / whitespace-only fields
    { kindId: '', version: '1.2.0' },
    { kindId: 'decision.rule.v1', version: '' },
    { kindId: '   ', version: '1.2.0' },
    { kindId: 'decision.rule.v1', version: '   ' },
    // embedded `id@version` form in either field
    { kindId: 'decision.rule.v1@1.2.0', version: '1.2.0' },
    { kindId: 'decision.rule.v1', version: 'decision.rule.v1@1.2.0' },
  ];
  for (const bad of badRequiredRefs) {
    expectCompatibilityFailure(
      () => decideKindCompatibility(bad as KindRef, validSet),
      'INVALID_COMPATIBILITY_INPUT',
    );
  }
});

test('T002A-R7: structurally invalid supported sets fail INVALID_COMPATIBILITY_INPUT, not a TypeError', () => {
  const badSets: unknown[] = [
    null,
    undefined,
    {},
    'decision.rule.v1@1.2.0',
    42,
    // non-object entries
    [null],
    [42],
    ['decision.rule.v1@1.2.0'],
    // entries not containing exactly {kindId, version}
    [{ kindId: 'decision.rule.v1' }],
    [{ version: '1.2.0' }],
    [{}],
    [{ kindId: 'decision.rule.v1', version: '1.2.0', implementationId: 'rule-engine@9' }],
    // non-string / empty / '@' fields on entries
    [{ kindId: 42, version: '1.2.0' }],
    [{ kindId: 'decision.rule.v1', version: 42 }],
    [{ kindId: '', version: '1.2.0' }],
    [{ kindId: 'decision.rule.v1', version: '' }],
    [{ kindId: 'decision.rule.v1@1.2.0', version: '1.2.0' }],
    [{ kindId: 'decision.rule.v1', version: 'kind@1.2.0' }],
  ];
  for (const bad of badSets) {
    expectCompatibilityFailure(
      () => decideKindCompatibility(RULE_KIND, bad as SupportedKindSet),
      'INVALID_COMPATIBILITY_INPUT',
    );
  }
});

// ---------------------------------------------------------------------------
// R8 — deterministic and pure: repeated calls are deep-equal, inputs are
// never mutated, no ambient/module-level state participates.
// ---------------------------------------------------------------------------

test('T002A-R8: repeated identical decisions are deep-equal and inputs are unmutated on every path', () => {
  const required: KindRef = { kindId: 'decision.rule.v1', version: '1.2.0' };
  const set = supportedSet(
    { kindId: 'doc.generate.v1', version: '3.0.0' },
    RULE_KIND,
    { kindId: 'decision.rule.v1', version: '2.0.0' },
  );
  const requiredBefore = snapshot(required);
  const setBefore = snapshot(set);

  const first = decideKindCompatibility(deepFreeze(required), deepFreeze(set));
  const second = decideKindCompatibility(deepFreeze(required), deepFreeze(set));
  const third = decideKindCompatibility(deepFreeze(required), deepFreeze(set));
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  assert.deepEqual(snapshot(required), requiredBefore, 'required ref must not be mutated');
  assert.deepEqual(snapshot(set), setBefore, 'supported set must not be mutated');

  // failure paths: deterministic outcome, unmutated inputs
  const failureBefore = snapshot(set);
  const failureA = expectCompatibilityFailure(
    () => decideKindCompatibility({ kindId: 'decision.rule.v1', version: '9.0.0' }, set),
    'KIND_VERSION_NOT_SUPPORTED',
  );
  const failureB = expectCompatibilityFailure(
    () => decideKindCompatibility({ kindId: 'decision.rule.v1', version: '9.0.0' }, set),
    'KIND_VERSION_NOT_SUPPORTED',
  );
  assert.equal(failureA.code, failureB.code);
  assert.equal(failureA.message, failureB.message);
  assert.deepEqual(snapshot(set), failureBefore);

  const unknownBefore = snapshot(set);
  const unknownA = expectCompatibilityFailure(
    () => decideKindCompatibility({ kindId: 'no.such.kind.v1', version: '1.0.0' }, set),
    'KIND_NOT_SUPPORTED',
  );
  const unknownB = expectCompatibilityFailure(
    () => decideKindCompatibility({ kindId: 'no.such.kind.v1', version: '1.0.0' }, set),
    'KIND_NOT_SUPPORTED',
  );
  assert.equal(unknownA.code, unknownB.code);
  assert.equal(unknownA.message, unknownB.message);
  assert.deepEqual(snapshot(set), unknownBefore);

  // interleaving different decisions does not perturb earlier outcomes
  assert.deepEqual(decideKindCompatibility(required, set), first);
});

// ---------------------------------------------------------------------------
// R9 — result evidence boundary: the SUPPORTED result exposes only the exact
// matched KindRef and nothing implementation-identity-shaped.
// ---------------------------------------------------------------------------

test('T002A-R9: the SUPPORTED result carries only {status, supportedKind} — no implementation identity is representable', () => {
  const result = decideKindCompatibility(RULE_KIND, supportedSet(RULE_KIND));
  assert.deepEqual(Object.keys(result).sort(), ['status', 'supportedKind']);
  assert.deepEqual(Object.keys(result.supportedKind).sort(), ['kindId', 'version']);
  for (const smuggled of [
    'implementationId',
    'moduleId',
    'provider',
    'packagePath',
    'assemblyDigest',
    'activationId',
    'endpoint',
    'secret',
  ]) {
    assert.equal(smuggled in result, false);
    assert.equal(smuggled in result.supportedKind, false);
  }
});

// ---------------------------------------------------------------------------
// R10 — the TOOL family decides through the identical seam with identical
// codes; no family-specific branch exists.
// ---------------------------------------------------------------------------

test('T002A-R10: tool-family kindIds decide through the same seam with the same codes', () => {
  const toolKind: KindRef = { kindId: 'tool.http.request', version: '2.1.0' };
  const set = supportedSet(toolKind, { kindId: 'tool.http.request', version: '1.0.0' });

  const supported = decideKindCompatibility(toolKind, set);
  assert.equal(supported.status, 'SUPPORTED');
  assert.deepEqual(supported, { status: 'SUPPORTED', supportedKind: { kindId: 'tool.http.request', version: '2.1.0' } });

  const wrongVersion = expectCompatibilityFailure(
    () => decideKindCompatibility({ kindId: 'tool.http.request', version: '3.0.0' }, set),
    'KIND_VERSION_NOT_SUPPORTED',
  );
  const unknown = expectCompatibilityFailure(
    () => decideKindCompatibility({ kindId: 'tool.sql.query', version: '1.0.0' }, set),
    'KIND_NOT_SUPPORTED',
  );
  const floating = expectCompatibilityFailure(
    () => decideKindCompatibility({ kindId: 'tool.http.request', version: '^2.0.0' }, set),
    'INCOMPATIBLE_KIND_REF',
  );
  const invalid = expectCompatibilityFailure(
    () =>
      decideKindCompatibility(
        toolKind,
        supportedSet({ kindId: 'tool.http.request', version: 'latest' }),
      ),
    'INVALID_COMPATIBILITY_INPUT',
  );
  // identical codes to the semantic family for the same defect classes
  assert.equal(wrongVersion.failureClass, 'KIND');
  assert.equal(unknown.failureClass, 'KIND');
  assert.equal(floating.failureClass, 'KIND');
  assert.equal(invalid.failureClass, 'INPUT');
});

// ---------------------------------------------------------------------------
// R11 — the failure taxonomy is total and distinguishable; the fixed
// validation order (structural → required exactness → set exactness → lookup)
// makes coexisting defects deterministic.
// ---------------------------------------------------------------------------

test('T002A-R11: every failure code maps to exactly one failure class and the suite observes all codes', () => {
  const codes = Object.keys(EXPECTED_FAILURE_CLASS_BY_CODE) as KindCompatibilityErrorCode[];
  assert.equal(new Set(codes).size, codes.length, 'failure codes are pairwise distinct');
  assert.equal(new Set(Object.values(EXPECTED_FAILURE_CLASS_BY_CODE)).size, 2, 'exactly the classes KIND and INPUT exist');
  for (const code of codes) {
    assert.ok(observedFailureCodes.has(code), `failure code ${code} must be exercised by the suite`);
  }
});

test('T002A-R11: coexisting defects resolve deterministically through the fixed validation order', () => {
  // structural input precedes required-ref exactness: a floating required
  // version together with a structurally broken required kindId is INPUT.
  expectCompatibilityFailure(
    () =>
      decideKindCompatibility(
        { kindId: '', version: '^1.0.0' } as unknown as KindRef,
        supportedSet(RULE_KIND),
      ),
    'INVALID_COMPATIBILITY_INPUT',
  );
  // required-ref exactness precedes supported-set exactness: a floating
  // required version together with a floating set entry is INCOMPATIBLE_KIND_REF.
  expectCompatibilityFailure(
    () =>
      decideKindCompatibility(
        { kindId: 'decision.rule.v1', version: '^1.0.0' },
        supportedSet({ kindId: 'decision.rule.v1', version: '~2.0.0' }),
      ),
    'INCOMPATIBLE_KIND_REF',
  );
  // supported-set exactness precedes the lookup: an unsupported required kind
  // together with a floating set entry is the set's INPUT failure.
  expectCompatibilityFailure(
    () =>
      decideKindCompatibility(
        { kindId: 'no.such.kind.v1', version: '1.0.0' },
        supportedSet({ kindId: 'decision.rule.v1', version: 'latest' }),
      ),
    'INVALID_COMPATIBILITY_INPUT',
  );
  // duplicate detection precedes the lookup, too
  expectCompatibilityFailure(
    () =>
      decideKindCompatibility(
        { kindId: 'no.such.kind.v1', version: '1.0.0' },
        supportedSet(RULE_KIND, RULE_KIND),
      ),
    'INVALID_COMPATIBILITY_INPUT',
  );
});

// ---------------------------------------------------------------------------
// R12 — composition with admission-era types compiles: the decision consumes
// the component.ts KindRef and composes alongside ComponentEnvelope /
// ComponentAdmissionResult-era surfaces in runtime and compile-time fixtures.
// ---------------------------------------------------------------------------

test('T002A-R12: an admission-validated envelope kind decides through the compatibility seam', () => {
  const envelope: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'quote.eligibility.rule',
    kind: RULE_KIND,
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { threshold: 100 },
  };
  validateComponentEnvelope(envelope);

  const result = decideKindCompatibility(envelope.kind, supportedSet(RULE_KIND));
  assert.equal(result.status, 'SUPPORTED');
  assert.deepEqual(result.supportedKind, envelope.kind);
});
