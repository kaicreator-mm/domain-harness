// 当前架构的可证伪测试：断言实际行为而非历史兼容。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_CONTENT_KINDS,
  DomainHarnessError,
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
  FUNCTION_REF_JSON_SCHEMA,
  DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA,
  DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA,
  DOMAIN_APP_LOCK_JSON_SCHEMA,
  JSON_SCHEMAS,
  JSON_SCHEMA_DIALECT,
  SCHEMA_BASE_ID,
  BOOT_ERROR_CODES,
  BUILD_ERROR_CODES,
  KNOWN_ERROR_CODES,
  RUNTIME_ERROR_CODES,
  canonicalJson,
  contentDigestOf,
  isContentDigest,
  isRelativeResourcePath,
  isUnknownContentKind,
  sha256Hex,
  validateDomainDefinition,
  validateElementDefinition,
} from '@kaicreator/domain-harness-contracts';
import {
  ILLEGAL_FIXTURES,
} from './fixtures/illegal.js';
import {
  KNOWLEDGE_ELEMENT_FIXTURE,
  ELIGIBILITY_ELEMENT_FIXTURE,
  ORDERS_DOMAIN_FIXTURE,
  EXTENSION_OPTIONAL_ELEMENT_FIXTURE,
  UNKNOWN_OPTIONAL_ELEMENT_FIXTURE,
  UNKNOWN_OPTIONAL_EXCLUSION_FIXTURE,
  DOMAIN_APP_DESCRIPTOR_FIXTURE,
  DOMAIN_APP_LOCK_FIXTURE,
} from './fixtures/legal.js';
import {
  OUTCOME_NEGATIVE_FAILED_MISSING_FAILURE,
  OUTCOME_NEGATIVE_SUCCEEDED_MISSING_VALUE,
  OUTCOME_NEGATIVE_SUCCEEDED_WITH_FAILURE,
  OUTCOME_NEGATIVE_UNKNOWN_MISSING_REASON,
} from './function-outcome-negatives.js';
import type { FunctionOutcome, JsonValue } from '@kaicreator/domain-harness-contracts';
import { Ajv2020 } from 'ajv/dist/2020.js';


test('当前领域错误应继承原生 Error，保留稳定名称、错误码及 cause', () => {
  const cause = new globalThis.Error('原始原因');
  const error = new DomainHarnessError('DH_BUILD_SCHEMA_INVALID', '领域定义无效', { cause });
  assert.ok(error instanceof globalThis.Error);
  assert.ok(error instanceof DomainHarnessError);
  assert.equal(error.name, 'DomainHarnessError');
  assert.equal(error.code, 'DH_BUILD_SCHEMA_INVALID');
  assert.equal(error.message, '领域定义无效');
  assert.equal(error.cause, cause);
});

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
  assert.equal(BUILD_ERROR_CODES.length, 28, 'BUILD = 6+7+7+8');
  assert.equal(BOOT_ERROR_CODES.length, 5, 'Boot/KDP = 5');
  assert.equal(RUNTIME_ERROR_CODES.length, 7, 'Runtime §7.4 six + UNSUPPORTED_PROFILE');
  assert.equal(KNOWN_ERROR_CODES.length, 40);
  assert.equal(new Set(KNOWN_ERROR_CODES).size, 40, 'all codes unique');
  assert.equal(Object.isFrozen(BUILD_ERROR_CODES), true);
  assert.equal(Object.isFrozen(BOOT_ERROR_CODES), true);
  assert.equal(Object.isFrozen(RUNTIME_ERROR_CODES), true);
  for (const code of BUILD_ERROR_CODES) assert.match(code, /^DH_BUILD_/);
  for (const code of BOOT_ERROR_CODES) assert.match(code, /^DH_(BOOT|KDP)_/);
  for (const code of RUNTIME_ERROR_CODES) assert.match(code, /^DH_RUNTIME_/);
  assert.ok(BUILD_ERROR_CODES.includes('DH_BUILD_SCHEMA_UNKNOWN_REQUIRED'));
  assert.ok(BUILD_ERROR_CODES.includes('DH_BUILD_ROLES_NON_DESCRIPTOR'));
  assert.ok(BUILD_ERROR_CODES.includes('DH_BUILD_LOCK_NOT_REPRODUCIBLE'));
  assert.ok(BOOT_ERROR_CODES.includes('DH_BOOT_RECORD_INVALID'));
  assert.ok(RUNTIME_ERROR_CODES.includes('DH_RUNTIME_UNSUPPORTED_PROFILE'));
});

test('T01: frozen unknown-kind predicate decides recognition only (L2 §2.2)', () => {
  for (const kind of CORE_CONTENT_KINDS) assert.equal(isUnknownContentKind(kind), false);
  assert.equal(isUnknownContentKind('dh-ext.acme.prompt'), false, 'dh-ext namespace is known');
  assert.equal(isUnknownContentKind('prompt'), true, 'bare specialized kind is unknown');
  assert.equal(isUnknownContentKind(''), true);
  assert.equal(isUnknownContentKind('dh-ext.'), false, 'prefix presence decides, scope content does not');
  assert.equal(CORE_CONTENT_KINDS.length, 10);
});

test('R27: canonical JSON refuses sparse arrays before hashing', () => {
  const sparse = new Array(1);
  assert.throws(() => canonicalJson(sparse), /sparse array/);
  assert.throws(() => contentDigestOf(sparse as unknown as import('../../src/base.js').JsonValue), /sparse array/);
  const nestedSparse = new Array(2);
  nestedSparse[1] = 7;
  assert.throws(() => canonicalJson({ nested: nestedSparse }), /sparse array/);
  assert.equal(canonicalJson([]), '[]');
  assert.equal(canonicalJson([null, 7]), '[null,7]');
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
  assert.ok(ORDERS_DOMAIN_FIXTURE.semanticRelations!.length >= 2);
});

test('T01: dh-ext prefixed content is a KNOWN extension, not unknown (predicate arm 2)', () => {
  assert.equal(isUnknownContentKind('dh-ext.acme.prompt'), false);
  assert.equal(EXTENSION_OPTIONAL_ELEMENT_FIXTURE.content[0]!.contentKind, 'dh-ext.acme.prompt');
  assert.deepEqual(validateElementDefinition(EXTENSION_OPTIONAL_ELEMENT_FIXTURE), { ok: true });
});

test('T01: TRUE unknown optional content stays legal at the schema layer (PRD E10)', () => {
  const block = UNKNOWN_OPTIONAL_ELEMENT_FIXTURE.content[0]!;
  assert.equal(isUnknownContentKind(block.contentKind), true);
  assert.equal(block.required, false);
  assert.deepEqual(validateElementDefinition(UNKNOWN_OPTIONAL_ELEMENT_FIXTURE), { ok: true });
  assert.deepEqual(UNKNOWN_OPTIONAL_EXCLUSION_FIXTURE.excludedUnknownContent, [
    'orders.legacy-prompt-notes/prompt-note',
  ]);
});

test('T01: P2 disposition — domain constraints are the frozen readonly JsonValue[] array', () => {
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
      assert.ok(KNOWN_ERROR_CODES.includes(issue.code as never), 'issue codes stay in the catalog');
      assert.equal(typeof issue.message, 'string');
    }
    seen.add(fixture.expectedCode);
  }
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
    const decoded = JSON.parse(encoded) as JsonValue;
    assert.equal(canonicalJson(decoded), encoded, 'parse → canonicalize is a fixpoint');
    // 已知合法的 JSON Fixture 经结构化复制后，摘要仍应与往返序列化结果一致。
    const clone = structuredClone(fixture) as unknown as JsonValue;
    assert.equal(contentDigestOf(decoded), contentDigestOf(clone), 'digest survives the round-trip');
  }
});


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
    'app-descriptor',
    'app-lock',
  ];
  assert.deepEqual(Object.keys(JSON_SCHEMAS).sort(), [...expectedDocs].sort());
  // 直接使用契约包导出的 Schema 注册表，保留每份文档的 JSON 类型。
  const registry = JSON_SCHEMAS;
  for (const [name, doc] of Object.entries(registry)) {
    assert.equal(doc.$schema, JSON_SCHEMA_DIALECT, `${name} dialect`);
    assert.equal(doc.$id, `${SCHEMA_BASE_ID}/${name}.json`, `${name} $id`);
    ajv.compile(doc as never);
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
      assert.equal(schemaAccepts, false, `schema must refuse ${fixture.name}`);
      continue;
    }
    if (SCHEMA_EXPRESSIBLE_NEGATIVES.has(fixture.name)) {
      assert.equal(schemaAccepts, false, `schema must refuse ${fixture.name}`);
    } else {
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
  assert.equal(isUnknownContentKind('dh-ext_foo'), true, "predicate: 'dh-ext_foo' is unknown");
  const sneaky = { ...base, contentKind: 'dh-ext_foo', required: true };
  assert.equal(contentValidate(structuredClone(sneaky) as never), false, 'schema refuses required dh-ext_foo');
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
    order: 0,
    init: {
      module: { packageId: 'orders.kdp', path: 'dist/index.mjs', digest: `sha256:${'0'.repeat(64)}` },
      exportName: 'init',
    },
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
  const cases: Array<[string, boolean]> = [
    ['orders.faq', true],
    ['orders.faq.', false],
    ['orders-faq-', false],
    ['orders_faq_', true],
    ['a', true],
    ['-lead', false],
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
  const cases: Array<[string, boolean]> = [
    ['content/faq.json', true],
    ['a//b', false],
    ['a/', false],
    ['/a', false],
    ['../a', false],
    ['./a', false],
    ['a/./b', false],
    ['a/../b', false],
    ['-lead/x.js', true],
    ['_lead/x.js', true],
    ['res:x', true],
    ['@x', true], // '@'/'+' and other non-separator POSIX chars are legal
    ['+x', true],
    ['a b/c d', true],
    ['c:x', false], // /^[A-Za-z]:/ drive prefix refused
    ['C:/x/y', false],
    ['a\\b', false],
    ['.hidden/x.js', true],
    ['.a', true],
    ['a\n/b\\c', false],
    ['a\n/../b', false],
    ['a\u2028/b\\c', false],
    ['a\u2029/../b', false],
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

