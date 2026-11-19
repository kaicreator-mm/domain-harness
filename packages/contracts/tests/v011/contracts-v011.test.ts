/**
 * DomainHarness v0.11.0 T01 (#1575) — directed contracts/v011 tests.
 *
 * Consumed through the real public subpath (`@kaicreator/domain-harness-
 * contracts/v011`, built dist) exactly as an 0.11 consumer would, per the
 * contracts-authority test convention of buying through the package
 * channel rather than source-relative paths.
 *
 * Negative assertions bind each fixture to its exact frozen DH_BUILD_*
 * catalog code (L2 §9.3: no message-string matching). The FunctionOutcome
 * static negatives are compile-time evidence enforced by the package tsc
 * gates; here we additionally assert their runtime shapes so the exported
 * constants are proven to be real values.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_CONTENT_KINDS,
  DH_APP_SCHEMA_VERSION,
  DH_DOMAIN_SCHEMA_VERSION,
  DH_ELEMENT_SCHEMA_VERSION,
  DH_INSTALL_RECORD_SCHEMA_VERSION,
  DH_LOCK_SCHEMA_VERSION,
  DH_PACKAGE_SCHEMA_VERSION,
  DH_PIN_SCHEMA_VERSION,
  ILLEGAL_FIXTURES,
  KNOWLEDGE_ELEMENT_FIXTURE,
  ELIGIBILITY_ELEMENT_FIXTURE,
  ORDERS_DOMAIN_FIXTURE,
  EXTENSION_OPTIONAL_ELEMENT_FIXTURE,
  OUTCOME_NEGATIVE_FAILED_MISSING_FAILURE,
  OUTCOME_NEGATIVE_SUCCEEDED_MISSING_VALUE,
  OUTCOME_NEGATIVE_SUCCEEDED_WITH_FAILURE,
  OUTCOME_NEGATIVE_UNKNOWN_MISSING_REASON,
  V011_BOOT_ERROR_CODES,
  V011_BUILD_ERROR_CODES,
  V011_KNOWN_ERROR_CODES,
  V011_RUNTIME_ERROR_CODES,
  canonicalJson,
  contentDigestOf,
  isContentDigest,
  isUnknownContentKind,
  sha256Hex,
  validateDomainDefinition,
  validateElementDefinition,
} from '@kaicreator/domain-harness-contracts/v011';
import type { FunctionOutcome } from '@kaicreator/domain-harness-contracts/v011';

test('T01: schemaVersion discriminators carry the frozen spellings (L2 §2.1)', () => {
  assert.equal(DH_DOMAIN_SCHEMA_VERSION, 'dh.domain/0.11');
  assert.equal(DH_ELEMENT_SCHEMA_VERSION, 'dh.element/0.11');
  assert.equal(DH_PACKAGE_SCHEMA_VERSION, 'dh.package/0.11');
  assert.equal(DH_APP_SCHEMA_VERSION, 'dh.app/0.11');
  assert.equal(DH_LOCK_SCHEMA_VERSION, 'dh.lock/0.11');
  assert.equal(DH_PIN_SCHEMA_VERSION, 'dh.pin/0.11');
  assert.equal(DH_INSTALL_RECORD_SCHEMA_VERSION, 'dh.install/0.11');
});

test('T01: error catalog counts and spellings match the frozen directory (L2 §9.1)', () => {
  assert.equal(V011_BUILD_ERROR_CODES.length, 28, 'BUILD = 6+7+7+8');
  assert.equal(V011_BOOT_ERROR_CODES.length, 5, 'Boot/KDP = 5');
  assert.equal(V011_RUNTIME_ERROR_CODES.length, 7, 'Runtime §7.4 six + UNSUPPORTED_PROFILE');
  assert.equal(V011_KNOWN_ERROR_CODES.length, 40);
  assert.equal(new Set(V011_KNOWN_ERROR_CODES).size, 40, 'all codes unique');
  assert.equal(Object.isFrozen(V011_BUILD_ERROR_CODES), true);
  assert.equal(Object.isFrozen(V011_BOOT_ERROR_CODES), true);
  assert.equal(Object.isFrozen(V011_RUNTIME_ERROR_CODES), true);
  for (const code of V011_BUILD_ERROR_CODES) assert.match(code, /^DH_BUILD_/);
  for (const code of V011_BOOT_ERROR_CODES) assert.match(code, /^DH_(BOOT|KDP)_/);
  for (const code of V011_RUNTIME_ERROR_CODES) assert.match(code, /^DH_RUNTIME_/);
  // Spot-check the review-added and self-check codes are spelled exactly.
  assert.ok(V011_BUILD_ERROR_CODES.includes('DH_BUILD_SCHEMA_UNKNOWN_REQUIRED'));
  assert.ok(V011_BUILD_ERROR_CODES.includes('DH_BUILD_ROLES_NON_DESCRIPTOR'));
  assert.ok(V011_BUILD_ERROR_CODES.includes('DH_BUILD_LOCK_NOT_REPRODUCIBLE'));
  assert.ok(V011_BOOT_ERROR_CODES.includes('DH_BOOT_RECORD_INVALID'));
  assert.ok(V011_RUNTIME_ERROR_CODES.includes('DH_RUNTIME_UNSUPPORTED_PROFILE'));
});

test('T01: frozen unknown-kind predicate decides recognition only (L2 §2.2)', () => {
  for (const kind of CORE_CONTENT_KINDS) assert.equal(isUnknownContentKind(kind), false);
  assert.equal(isUnknownContentKind('dh-ext.acme.prompt'), false, 'dh-ext namespace is known');
  assert.equal(isUnknownContentKind('prompt'), true, 'bare specialized kind is unknown');
  assert.equal(isUnknownContentKind(''), true);
  assert.equal(isUnknownContentKind('dh-ext.'), false, 'prefix presence decides, scope content does not');
  assert.equal(CORE_CONTENT_KINDS.length, 10);
});

test('T01: canonical digest is deterministic, order-insensitive and byte-sensitive (L2 §5.3)', () => {
  assert.equal(canonicalJson({ b: 2, a: [1, { z: 1, y: 2 }] }), '{"a":[1,{"y":2,"z":1}],"b":2}');
  const digestA = contentDigestOf({ kind: 'x', payload: { b: 2, a: 1 } });
  const digestB = contentDigestOf({ payload: { a: 1, b: 2 }, kind: 'x' });
  assert.equal(digestA, digestB, 'key order must not change the digest');
  assert.match(digestA, /^sha256:[0-9a-f]{64}$/);
  assert.equal(isContentDigest(digestA), true);
  assert.equal(digestA, `sha256:${sha256Hex('{"kind":"x","payload":{"a":1,"b":2}}')}`);
  const flipped = contentDigestOf({ kind: 'x', payload: { b: 3, a: 1 } });
  assert.notEqual(digestA, flipped, 'single byte flip must change the digest');
  assert.equal(isContentDigest('deadbeef'), false);
  assert.equal(isContentDigest(`sha256:${'A'.repeat(64)}`), false, 'uppercase hex refused');
});

test('T01: legal fixtures validate clean, including functions:[] and cycle-legal relations', () => {
  assert.deepEqual(validateElementDefinition(KNOWLEDGE_ELEMENT_FIXTURE), { ok: true });
  assert.deepEqual(validateElementDefinition(ELIGIBILITY_ELEMENT_FIXTURE), { ok: true });
  assert.deepEqual(validateElementDefinition(EXTENSION_OPTIONAL_ELEMENT_FIXTURE), { ok: true });
  assert.deepEqual(validateDomainDefinition(ORDERS_DOMAIN_FIXTURE), { ok: true });
  // AC02: semantic relation cycles are legal at the schema layer (no cycle check here).
  assert.ok(ORDERS_DOMAIN_FIXTURE.semanticRelations!.length >= 2);
});

test('T01: unknown optional dh-ext content stays legal (PRD E10 optional track)', () => {
  const optionalUnknown = structuredClone(EXTENSION_OPTIONAL_ELEMENT_FIXTURE);
  assert.deepEqual(validateElementDefinition(optionalUnknown), { ok: true });
});

test('T01: every illegal fixture is refused with exactly its bound catalog code', () => {
  assert.ok(ILLEGAL_FIXTURES.length >= 15, 'negative set is non-trivial');
  const seen = new Set<string>();
  for (const fixture of ILLEGAL_FIXTURES) {
    const result =
      fixture.target === 'element'
        ? validateElementDefinition(fixture.value)
        : validateDomainDefinition(fixture.value);
    assert.equal(result.ok, false, `fixture ${fixture.name} must be refused`);
    if (result.ok) continue;
    const codes = result.issues.map((issue) => issue.code);
    assert.ok(
      codes.includes(fixture.expectedCode),
      `fixture ${fixture.name}: expected ${fixture.expectedCode}, got ${codes.join(',')}`,
    );
    for (const issue of result.issues) {
      assert.ok(V011_KNOWN_ERROR_CODES.includes(issue.code as never), 'issue codes stay in the catalog');
      assert.equal(typeof issue.message, 'string');
    }
    seen.add(fixture.expectedCode);
  }
  // Distinct rule families show up as distinct codes across the set.
  assert.ok(seen.size >= 5);
});

test('T01: FunctionOutcome strict union constructs all three legal states', () => {
  const outcomes: FunctionOutcome[] = [
    { kind: 'SUCCEEDED', value: { decision: 'POS' } },
    { kind: 'UNKNOWN', unknownReason: { code: 'DH_TEST', message: 'rule did not decide' } },
    { kind: 'FAILED', failure: { code: 'DH_TEST', message: 'evaluation failed' } },
  ];
  const seen: string[] = [];
  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case 'SUCCEEDED':
        seen.push(outcome.kind);
        assert.ok('value' in outcome);
        break;
      case 'UNKNOWN':
        seen.push(outcome.kind);
        assert.ok('unknownReason' in outcome);
        break;
      case 'FAILED':
        seen.push(outcome.kind);
        assert.ok('failure' in outcome);
        break;
    }
  }
  assert.deepEqual(seen, ['SUCCEEDED', 'UNKNOWN', 'FAILED']);
});

test('T01: static negatives are real runtime values with the expected broken shapes', () => {
  // The compile-time illegality of these four is enforced by every tsc gate
  // via @ts-expect-error in function-outcome-negatives.ts (L2 §9.3 ×4).
  assert.deepEqual(OUTCOME_NEGATIVE_SUCCEEDED_MISSING_VALUE, { kind: 'SUCCEEDED' });
  assert.equal('value' in OUTCOME_NEGATIVE_SUCCEEDED_MISSING_VALUE, false);
  assert.deepEqual(OUTCOME_NEGATIVE_FAILED_MISSING_FAILURE, { kind: 'FAILED' });
  assert.equal('failure' in OUTCOME_NEGATIVE_FAILED_MISSING_FAILURE, false);
  assert.deepEqual(OUTCOME_NEGATIVE_UNKNOWN_MISSING_REASON, { kind: 'UNKNOWN' });
  assert.equal('unknownReason' in OUTCOME_NEGATIVE_UNKNOWN_MISSING_REASON, false);
  assert.equal(OUTCOME_NEGATIVE_SUCCEEDED_WITH_FAILURE.kind, 'SUCCEEDED');
  assert.equal('failure' in OUTCOME_NEGATIVE_SUCCEEDED_WITH_FAILURE, true, 'cross-state excess field');
});

test('T01: fixtures round-trip through canonical JSON with stable digests', () => {
  for (const fixture of [KNOWLEDGE_ELEMENT_FIXTURE, ELIGIBILITY_ELEMENT_FIXTURE, ORDERS_DOMAIN_FIXTURE]) {
    const encoded = canonicalJson(fixture);
    const decoded = JSON.parse(encoded) as unknown;
    assert.equal(canonicalJson(decoded), encoded, 'parse → canonicalize is a fixpoint');
    const clone = structuredClone(fixture) as unknown;
    assert.equal(contentDigestOf(decoded), contentDigestOf(clone), 'digest survives the round-trip');
  }
});
