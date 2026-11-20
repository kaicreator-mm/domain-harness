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
  DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA,
  DOMAIN_APP_LOCK_JSON_SCHEMA,
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
  DOMAIN_APP_DESCRIPTOR_FIXTURE,
  DOMAIN_APP_LOCK_FIXTURE,
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
  isRelativeResourcePath,
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
  assert.ok(ILLEGAL_FIXTURES.length >= 25, 'negative set is non-trivial');
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
  // D02 full set (controller #1575/7025451554): descriptor + app-lock included.
  const expectedDocs = [
    'domain',
    'element',
    'content-block',
    'function-contract',
    'element-ref',
    'function-ref',
    'package-manifest',
    'app-descriptor',
    'app-lock',
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
    'app-descriptor': DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA as Record<string, object>,
    'app-lock': DOMAIN_APP_LOCK_JSON_SCHEMA as Record<string, object>,
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

test('T01: legal descriptor and Lock pass their JSON Schemas (D02 completion)', () => {
  const descriptorValidate = ajv.compile(DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA as never);
  const lockValidate = ajv.compile(DOMAIN_APP_LOCK_JSON_SCHEMA as never);
  assert.equal(descriptorValidate(structuredClone(DOMAIN_APP_DESCRIPTOR_FIXTURE)), true);
  assert.equal(lockValidate(structuredClone(DOMAIN_APP_LOCK_FIXTURE)), true);
  // The Lock fixture records the unknown-optional exclusion exactly as the
  // paired fixture pins it (coherence across D02 fixture set).
  assert.deepEqual(DOMAIN_APP_LOCK_FIXTURE.excludedUnknownContent, ['orders.legacy-prompt-notes/prompt-note']);
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
  const schemaValidators: Record<string, ReturnType<typeof ajv.compile>> = {
    'element': ajv.compile(ELEMENT_DEFINITION_JSON_SCHEMA as never),
    'domain': ajv.compile(DOMAIN_DEFINITION_JSON_SCHEMA as never),
    'descriptor': ajv.compile(DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA as never),
    'lock': ajv.compile(DOMAIN_APP_LOCK_JSON_SCHEMA as never),
  };
  for (const fixture of ILLEGAL_FIXTURES) {
    const validate = schemaValidators[fixture.target]!;
    const schemaAccepts = validate(structuredClone(fixture.value) as never) === true;
    if (fixture.target === 'descriptor' || fixture.target === 'lock') {
      // Descriptor/Lock negatives have no handwritten T01 validator — the
      // JSON Schema is the schema-layer authority for these documents.
      assert.equal(schemaAccepts, false, `schema must refuse ${fixture.name}`);
      continue;
    }
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

// ---- Review-repair adversarial section (#1575/7027597735: P1, P2-1, P2-2, P2-3) ----
// Each repaired case gets an explicit positive AND negative here, so the
// "schema compiled but never positively validated" blind spot that let
// function-ref.json reject every legal FunctionRef cannot recur. The JSON
// Schema verdict must agree with the handwritten validator on every case.

/** The review's minimal legal FunctionRef (P1 counterexample, now a positive). */
const LEGAL_FUNCTION_REF = {
  element: {
    namespace: 'orders',
    id: 'orders.eligibility',
    version: '1.0.0',
    digest: `sha256:${'a'.repeat(64)}`,
  },
  functionId: 'evaluate',
  contractVersion: '1',
} as const;

test('T01 repair P1: function-ref.json root is a pure $ref envelope and accepts a legal FunctionRef', () => {
  // Root carries no sibling type/additionalProperties (they would evaluate
  // against an empty root property set under 2020-12 and reject everything).
  assert.deepEqual(
    Object.keys(FUNCTION_REF_JSON_SCHEMA).sort(),
    ['$defs', '$id', '$ref', '$schema'].sort(),
    'function-ref.json root must be a pure $ref envelope',
  );
  const validate = ajv.compile(FUNCTION_REF_JSON_SCHEMA as never);
  assert.equal(validate(structuredClone(LEGAL_FUNCTION_REF)), true, 'legal FunctionRef passes the ROOT document');
});

test('T01 repair P1: function-ref.json root refuses meaningful negatives', () => {
  const validate = ajv.compile(FUNCTION_REF_JSON_SCHEMA as never);
  const negatives: Array<[string, unknown]> = [
    ['missing functionId', { element: LEGAL_FUNCTION_REF.element, contractVersion: '1' }],
    ['missing contractVersion', { element: LEGAL_FUNCTION_REF.element, functionId: 'evaluate' }],
    ['unknown extra root property', { ...LEGAL_FUNCTION_REF, bogus: 1 }],
    ['bad element digest', { ...LEGAL_FUNCTION_REF, element: { ...LEGAL_FUNCTION_REF.element, digest: 'deadbeef' } }],
    [
      'element missing namespace',
      { ...LEGAL_FUNCTION_REF, element: { id: 'x', version: '1.0.0', digest: `sha256:${'a'.repeat(64)}` } },
    ],
    ['non-object root', 'evaluate'],
    ['null root', null],
  ];
  for (const [name, value] of negatives) {
    assert.equal(validate(structuredClone(value) as never), false, `root must refuse: ${name}`);
  }
});

test('T01 repair P2-1: required dh-ext_foo is refused by BOTH the schema and the handwritten validator', () => {
  const contentValidate = ajv.compile(CONTENT_BLOCK_JSON_SCHEMA as never);
  const base = { id: 'prompt-block', schemaRef: { inline: { type: 'string' } }, value: 'x' };
  // The frozen predicate is a LITERAL startsWith('dh-ext.') — the underscore
  // form must not slip through the required-track kind gate.
  assert.equal(isUnknownContentKind('dh-ext_foo'), true, "predicate: 'dh-ext_foo' is unknown");
  const sneaky = { ...base, contentKind: 'dh-ext_foo', required: true };
  assert.equal(contentValidate(structuredClone(sneaky) as never), false, 'schema refuses required dh-ext_foo');
  // Handwritten parity: the element-level validator reports the exact frozen code.
  // ('dh-ext_foo' is deliberately not a ContentKind at the TS layer — the
  // adversarial input arrives as untyped data, hence the cast.)
  const element = structuredClone(KNOWLEDGE_ELEMENT_FIXTURE);
  (element as { content: unknown }).content = [sneaky as never];
  const result = validateElementDefinition(element);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some((issue) => issue.code === 'DH_BUILD_SCHEMA_UNKNOWN_REQUIRED'),
      'handwritten validator reports DH_BUILD_SCHEMA_UNKNOWN_REQUIRED for dh-ext_foo',
    );
  }
  // The literal-prefix form stays legal on the required track.
  const known = { ...base, contentKind: 'dh-ext.acme.prompt', required: true };
  assert.equal(isUnknownContentKind('dh-ext.acme.prompt'), false);
  assert.equal(contentValidate(structuredClone(known) as never), true, 'dh-ext.* stays legal when required');
});

test('T01 repair P2-2: ExportEntry accepts {} and every optional-key combination the frozen TS type allows', () => {
  const manifestValidate = ajv.compile(DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA as never);
  const base = {
    kind: 'DomainPackage',
    schemaVersion: DH_PACKAGE_SCHEMA_VERSION,
    id: 'orders.kdp',
    version: '1.0.0',
    layer: 'kernel',
    role: 'primary',
    elements: [],
    dependsOn: [],
    imports: [],
    contributesTo: [],
    targetVariants: [],
  };
  const legalExports: unknown[] = [
    {},
    { elementId: 'orders.faq' },
    { functionId: 'evaluate' },
    { interfaceId: 'orders.search' },
    { elementId: 'orders.faq', functionId: 'evaluate' },
    { elementId: 'orders.faq', functionId: 'evaluate', interfaceId: 'orders.search' },
    { functionId: 'evaluate', interfaceId: 'orders.search' },
  ];
  for (const entry of legalExports) {
    const manifest = { ...structuredClone(base), exports: [entry] };
    assert.equal(
      manifestValidate(manifest as never),
      true,
      `ExportEntry ${JSON.stringify(entry)} is legal (frozen type: all three keys optional)`,
    );
  }
  const illegalExports: Array<[string, unknown]> = [
    ['empty-string elementId', { elementId: '' }],
    ['unknown fourth key', { elementId: 'orders.faq', bogus: 1 }],
    ['non-string functionId', { functionId: 42 }],
  ];
  for (const [name, entry] of illegalExports) {
    const manifest = { ...structuredClone(base), exports: [entry] };
    assert.equal(manifestValidate(manifest as never), false, `schema must refuse ExportEntry: ${name}`);
  }
});

test('T01 repair P2-3: identifier pattern matches the handwritten validator on corner cases', () => {
  const elementValidate = ajv.compile(ELEMENT_DEFINITION_JSON_SCHEMA as never);
  // [candidate, expected verdict for BOTH layers]
  const cases: Array<[string, boolean]> = [
    ['orders.faq', true],
    ['orders.faq.', false], // trailing '.' refused by both
    ['orders-faq-', false], // trailing '-' refused by both
    ['orders_faq_', true], // trailing '_' stays legal (handwritten parity)
    ['a', true],
    ['-lead', false], // first char must be alphanumeric in both layers
    ['_lead', false],
    ['', false],
  ];
  for (const [id, expected] of cases) {
    const element = structuredClone(KNOWLEDGE_ELEMENT_FIXTURE);
    (element as { id: string }).id = id;
    assert.equal(
      elementValidate(structuredClone(element) as never),
      expected,
      `schema verdict for id '${id}'`,
    );
    assert.equal(validateElementDefinition(element).ok, expected, `handwritten verdict for id '${id}'`);
  }
});

test('T01 repair P2-3: resource path pattern matches the handwritten validator on corner cases', () => {
  const elementValidate = ajv.compile(ELEMENT_DEFINITION_JSON_SCHEMA as never);
  const digest = `sha256:${'a'.repeat(64)}`;
  // [candidate path, expected verdict for BOTH layers]
  const cases: Array<[string, boolean]> = [
    ['content/faq.json', true],
    ['a//b', false], // empty segment
    ['a/', false], // trailing '/'
    ['/a', false], // leading '/'
    ['../a', false], // dot-dot segment
    ['./a', false], // dot segment
    ['a/./b', false],
    ['a/../b', false],
    ['-lead/x.js', true], // leading '-' legal in both layers
    ['_lead/x.js', true],
    ['res:x', true], // colon after the first char is legal in both layers
    ['@x', true], // '@'/'+' and other non-separator POSIX chars are legal
    ['+x', true],
    ['a b/c d', true],
    ['c:x', false], // /^[A-Za-z]:/ drive prefix refused
    ['C:/x/y', false],
    ['a\\b', false], // backslash refused anywhere
    ['.hidden/x.js', true], // non-dot-segment heads starting with '.' are legal
    ['.a', true],
    ['a\n/b\\c', false], // backslash after a line terminator still refused ([\s\S]* lookahead)
    ['a\n/../b', false], // dot-segment after a line terminator still refused
    ['a\u2028/b\\c', false], // U+2028 variant
    ['a\u2029/../b', false], // U+2029 variant
    ['a/.\n', true], // '.\n' is an ordinary legal segment, not the '.' segment
    ['', false],
  ];
  for (const [path, expected] of cases) {
    assert.equal(isRelativeResourcePath(path), expected, `handwritten path verdict for '${path}'`);
    const element = structuredClone(KNOWLEDGE_ELEMENT_FIXTURE);
    const block = element.content[0] as unknown as { ref: unknown };
    block.ref = { packageId: 'orders-business', path, digest };
    assert.equal(
      elementValidate(structuredClone(element) as never),
      expected,
      `schema path verdict for '${path}'`,
    );
    assert.equal(validateElementDefinition(element).ok, expected, `handwritten element verdict for '${path}'`);
  }
});

