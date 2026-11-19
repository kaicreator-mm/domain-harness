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
  DOMAIN_DEFINITION_JSON_SCHEMA,
  ELEMENT_DEFINITION_JSON_SCHEMA,
  CONTENT_BLOCK_JSON_SCHEMA,
  FUNCTION_CONTRACT_JSON_SCHEMA,
  ELEMENT_REF_JSON_SCHEMA,
  FUNCTION_REF_JSON_SCHEMA,
  DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA,
  V011_JSON_SCHEMAS,
  V011_JSON_SCHEMA_DIALECT,
  V011_SCHEMA_BASE_ID,
  ILLEGAL_FIXTURES,
  KNOWLEDGE_ELEMENT_FIXTURE,
  ELIGIBILITY_ELEMENT_FIXTURE,
  ORDERS_DOMAIN_FIXTURE,
  EXTENSION_OPTIONAL_ELEMENT_FIXTURE,
  UNKNOWN_OPTIONAL_ELEMENT_FIXTURE,
  UNKNOWN_OPTIONAL_EXCLUSION_FIXTURE,
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
import Ajv2020 from 'ajv/dist/2020';

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
  assert.deepEqual(validateElementDefinition(UNKNOWN_OPTIONAL_ELEMENT_FIXTURE), { ok: true });
  assert.deepEqual(validateDomainDefinition(ORDERS_DOMAIN_FIXTURE), { ok: true });
  // AC02: semantic relation cycles are legal at the schema layer (no cycle check here).
  assert.ok(ORDERS_DOMAIN_FIXTURE.semanticRelations!.length >= 2);
});

test('T01: dh-ext prefixed content is a KNOWN extension, not unknown (predicate arm 2)', () => {
  // Controller supplement #1575/7024893190: dh-ext.* satisfies the prefix
  // arm of the frozen predicate, so the fixture is a known-extension
  // positive — regardless of its required flag.
  assert.equal(isUnknownContentKind('dh-ext.acme.prompt'), false);
  assert.equal(EXTENSION_OPTIONAL_ELEMENT_FIXTURE.content[0]!.contentKind, 'dh-ext.acme.prompt');
  assert.deepEqual(validateElementDefinition(EXTENSION_OPTIONAL_ELEMENT_FIXTURE), { ok: true });
});

test('T01: TRUE unknown optional content stays legal at the schema layer (PRD E10)', () => {
  // Bare 'prompt' fails both predicate arms; optional:true means accept
  // here — BUILD (T02) records the explicit exclusion in the Lock.
  const block = UNKNOWN_OPTIONAL_ELEMENT_FIXTURE.content[0]!;
  assert.equal(isUnknownContentKind(block.contentKind), true);
  assert.equal(block.required, false);
  assert.deepEqual(validateElementDefinition(UNKNOWN_OPTIONAL_ELEMENT_FIXTURE), { ok: true });
  // Paired Lock-exclusion input fixture for T02 consumption.
  assert.deepEqual(UNKNOWN_OPTIONAL_EXCLUSION_FIXTURE.excludedUnknownContent, [
    'orders.legacy-prompt-notes/prompt-note',
  ]);
});

test('T01: P2 disposition — domain constraints are the frozen readonly JsonValue[] array', () => {
  // Frozen L2 §2.2 wrote `readonly JsonValue` (invalid TS: TS1354); the
  // frozen shape is an ARRAY of declarative constraints. TS type, validator
  // and JSON Schema now agree on the array form.
  assert.ok(Array.isArray(ORDERS_DOMAIN_FIXTURE.constraints));
  const badConstraints = structuredClone(ORDERS_DOMAIN_FIXTURE);
  (badConstraints as unknown as { constraints: unknown }).constraints = { oops: 'not-an-array' };
  const result = validateDomainDefinition(badConstraints);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => issue.path === 'domain.constraints'));
  }
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

// ---- Canonical machine JSON Schemas (controller pre-review P1-01) ----

/** Test-side draft 2020-12 compiler from the hoisted workspace ajv (contracts keeps zero deps). */
const ajv = new Ajv2020({ strict: true, allErrors: true });

const SCHEMA_EXPRESSIBLE_NEGATIVES = new Set([
  'unknown-required-content-kind',
  'content-xor-both-present',
  'content-xor-neither-present',
  'outcomes-missing-succeeded',
  'outcomes-unknown-literal',
  'element-id-empty',
  'element-id-illegal-characters',
  'permission-semantics-field-smuggled-onto-roles-element',
  'ref-path-traversal',
  'ref-path-absolute',
  'digest-format-invalid',
  'discriminant-kind-wrong',
  'schema-version-stale',
  'domain-elements-empty',
]);

test('T01: every exported JSON Schema document carries $schema/$id and compiles under 2020-12', () => {
  const expectedDocs = [
    'domain',
    'element',
    'content-block',
    'function-contract',
    'element-ref',
    'function-ref',
    'package-manifest',
  ];
  assert.deepEqual(Object.keys(V011_JSON_SCHEMAS).sort(), [...expectedDocs].sort());
  const registry: Record<string, object> = {
    'domain': DOMAIN_DEFINITION_JSON_SCHEMA as Record<string, object>,
    'element': ELEMENT_DEFINITION_JSON_SCHEMA as Record<string, object>,
    'content-block': CONTENT_BLOCK_JSON_SCHEMA as Record<string, object>,
    'function-contract': FUNCTION_CONTRACT_JSON_SCHEMA as Record<string, object>,
    'element-ref': ELEMENT_REF_JSON_SCHEMA as Record<string, object>,
    'function-ref': FUNCTION_REF_JSON_SCHEMA as Record<string, object>,
    'package-manifest': DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA as Record<string, object>,
  };
  for (const [name, doc] of Object.entries(registry)) {
    assert.equal(doc.$schema, V011_JSON_SCHEMA_DIALECT, `${name} dialect`);
    assert.equal(doc.$id, `${V011_SCHEMA_BASE_ID}/${name}.json`, `${name} $id`);
    ajv.compile(doc as never); // throws on any schema-syntax error
  }
});

test('T01: legal fixtures pass BOTH the handwritten validator and the JSON Schema', () => {
  const elementValidate = ajv.compile(ELEMENT_DEFINITION_JSON_SCHEMA as never);
  const domainValidate = ajv.compile(DOMAIN_DEFINITION_JSON_SCHEMA as never);
  for (const fixture of [
    KNOWLEDGE_ELEMENT_FIXTURE,
    ELIGIBILITY_ELEMENT_FIXTURE,
    EXTENSION_OPTIONAL_ELEMENT_FIXTURE,
    UNKNOWN_OPTIONAL_ELEMENT_FIXTURE,
  ]) {
    assert.equal(validateElementDefinition(fixture).ok, true);
    assert.equal(elementValidate(structuredClone(fixture)), true, `schema accepts ${fixture.id}`);
  }
  assert.equal(validateDomainDefinition(ORDERS_DOMAIN_FIXTURE).ok, true);
  assert.equal(domainValidate(structuredClone(ORDERS_DOMAIN_FIXTURE)), true);
});

test('T01: unknown optional content passes the JSON Schema required-track gate by design', () => {
  const contentValidate = ajv.compile(CONTENT_BLOCK_JSON_SCHEMA as never);
  const unknownRequired = {
    id: 'bad',
    contentKind: 'prompt',
    schemaRef: { inline: { type: 'string' } },
    required: true,
    value: 'x',
  };
  assert.equal(contentValidate(unknownRequired), false, 'required + unknown kind refused');
  assert.equal(contentValidate(structuredClone(UNKNOWN_OPTIONAL_ELEMENT_FIXTURE.content[0])), true);
});

test('T01: JSON Schema rejects the schema-expressible negatives the same way the validator does', () => {
  const elementValidate = ajv.compile(ELEMENT_DEFINITION_JSON_SCHEMA as never);
  const domainValidate = ajv.compile(DOMAIN_DEFINITION_JSON_SCHEMA as never);
  for (const fixture of ILLEGAL_FIXTURES) {
    const validate = fixture.target === 'element' ? elementValidate : domainValidate;
    const schemaAccepts = validate(structuredClone(fixture.value) as never) === true;
    if (SCHEMA_EXPRESSIBLE_NEGATIVES.has(fixture.name)) {
      assert.equal(schemaAccepts, false, `schema must refuse ${fixture.name}`);
    } else {
      // Known schema-layer blind spot: cross-ITEM identity uniqueness
      // (duplicate element ids inside one Domain) is not expressible in
      // JSON Schema — owned by the handwritten validator and BUILD (T02).
      assert.equal(schemaAccepts, true, `schema-level blind spot preserved for ${fixture.name}`);
      assert.equal(
        fixture.target === 'element'
          ? validateElementDefinition(fixture.value).ok
          : validateDomainDefinition(fixture.value).ok,
        false,
        `handwritten validator still refuses ${fixture.name}`,
      );
    }
  }
});
