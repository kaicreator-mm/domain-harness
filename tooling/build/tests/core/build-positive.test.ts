// BUILD 正反例：只有符合当前契约的资源才能进入 Lock。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DH_DOMAIN_SCHEMA_VERSION,
  canonicalJson,
  contentDigestOf,
  type JsonValue,
} from '@kaicreator/domain-harness-contracts';
import { buildApp, type BuildResult } from '../../src/index.js';
import { DH_ELEMENT_SCHEMA_VERSION, sha256OfBytes } from './fixtures.js';
import { standardCase } from './standard-case.js';

function expectSuccess(result: BuildResult): Extract<BuildResult, { ok: true }> {
  assert.equal(result.ok, true, result.ok ? undefined : `${result.code}: ${result.message}`);
  return result;
}

test('AC02/03/04/07 positive: full K/S/B closure seals the exact Lock', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input, refs } = scenario.finalize();

  const first = expectSuccess(buildApp(input));
  const lock = first.lock;

  assert.equal(lock.kind, 'DomainAppLock');
  assert.equal(lock.schemaVersion, 'dh.lock/0.11');
  assert.deepEqual(lock.target, { runtime: 'node', module: 'esm', nodeMajor: 22, profile: 'node22-esm/1' });
  assert.deepEqual(lock.appIdentity, {
    id: 'orders.basic',
    version: '1.0.0',
    descriptorDigest: contentDigestOf(input.descriptor as JsonValue),
  });

  assert.deepEqual(
    lock.selectedPackages.map((pkg) => [pkg.packageId, pkg.layer, pkg.role]),
    [
      ['aaa-ext', 'business', 'extension'],
      ['kdp-kernel', 'kernel', 'primary'],
      ['orders-business', 'business', 'primary'],
      ['orders-ext', 'business', 'extension'],
      ['sdk-core', 'sdk', 'primary'],
    ],
  );
  assert.deepEqual(
    lock.selectedPackages.find((pkg) => pkg.packageId === 'sdk-core')?.dependsOn,
    ['kdp-kernel'],
  );

  assert.equal(lock.selectedPackages.find((pkg) => pkg.packageId === 'sdk-core')?.init.exportName, 'init');
  assert.equal(lock.selectedPackages.find((pkg) => pkg.packageId === 'orders-business')?.init.exportName, 'init');

  assert.deepEqual(
    lock.selectedElements.map((element) => element.ref.id),
    ['orders.app-main', 'orders.eligibility', 'orders.faq', 'orders.legacy-prompt-notes'],
  );
  const eligibility = lock.selectedElements.find((element) => element.ref.id === 'orders.eligibility')!;
  const faq = lock.selectedElements.find((element) => element.ref.id === 'orders.faq')!;
  assert.deepEqual(faq.contractDigests, []); // 0-Function is a first-class form
  assert.equal(eligibility.contractDigests.length, 2);
  assert.equal(eligibility.ownerPackageId, 'orders-business');

  assert.deepEqual(
    lock.selectedFunctions.map((fn) => `${fn.ref.element.id}.${fn.ref.functionId}`),
    ['orders.eligibility.evaluate'],
  );
  const evaluate = lock.selectedFunctions.find((fn) => fn.ref.functionId === 'evaluate')!;
  assert.equal(evaluate.implementation.module.path, 'dist/evaluate.mjs');
  assert.equal(evaluate.effects, 'none');
  assert.deepEqual(
    evaluate.resources.map((resource) => resource.path),
    ['content/zones.json'],
  );

  assert.deepEqual(lock.hookBindings, [
    {
      ownerPackageId: 'sdk-core',
      hookId: 'audit',
      cardinality: 'multi',
      providers: [{ module: { packageId: 'orders-ext', path: 'dist/audit.mjs', digest: lock.hookBindings[0]!.providers[0]!.module.digest }, exportName: 'audit' }],
    },
  ]);

  assert.deepEqual(lock.coreOrder, ['kdp-kernel', 'sdk-core', 'orders-business']);
  assert.deepEqual(lock.selectedPackages.filter((pkg) => pkg.role === 'primary').map((pkg) => pkg.order).sort(), [0, 1, 2]);

  assert.deepEqual(lock.ingress, [{ id: 'evaluate', function: refs.evaluateRef, optional: false }]);

  assert.deepEqual(lock.excludedUnknownContent, ['orders.legacy-prompt-notes/prompt-note']);
  assert.deepEqual(
    lock.selectedElements.find((element) => element.ref.id === 'orders.legacy-prompt-notes')!.contentDigests,
    [],
  );

  assert.equal(lock.bootstrapKdpPin.kdpPackageId, '@kaicreator/domain-harness-microkernel');
  assert.equal(lock.bootstrapKdpPin.kdpPrimaryEntry, 'bootstrap');
  assert.match(lock.bootstrapKdpPin.kdpPrimaryDigest, /^sha256:[0-9a-f]{64}$/u);

  for (const key of [
    'orders-business/content/faq.json',
    'orders-business/content/zones.json',
    'orders-business/docs/eligibility.md',
    'orders-business/definitions/eligibility-1.0.0-1.json',
    'orders-business/dist/business.mjs',
    '@kaicreator/domain-harness-microkernel/dist/index.js',
  ]) {
    assert.match(lock.resourceDigests[key] ?? '', /^sha256:[0-9a-f]{64}$/u, `resourceDigests['${key}']`);
  }
});

test('AC07: repeated BUILD over identical input is byte-identical and pool-order insensitive', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();

  const first = expectSuccess(buildApp(input));
  const second = expectSuccess(buildApp(input));
  assert.deepEqual(Buffer.from(second.lockBytes), Buffer.from(first.lockBytes));

  const shuffled = { ...input, packages: [...input.packages].reverse() };
  const third = expectSuccess(buildApp(shuffled));
  assert.deepEqual(Buffer.from(third.lockBytes), Buffer.from(first.lockBytes));
});

test('AC07: closureDigest is the L2 §5.3 predecessor image and is mutation-sensitive', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const { lock, lockBytes } = expectSuccess(buildApp(input));

  const parsed = JSON.parse(Buffer.from(lockBytes).toString('utf8')) as Record<string, unknown>;
  const { closureDigest, ...preimage } = parsed;
  assert.equal(contentDigestOf(preimage as JsonValue), closureDigest);
  assert.equal(lock.closureDigest, closureDigest);

  assert.equal(Buffer.from(lockBytes).toString('utf8'), canonicalJson(JSON.parse(Buffer.from(lockBytes).toString('utf8')) as JsonValue));

  const tampered = Buffer.from(lockBytes);
  const idMarker = Buffer.from('"orders.basic"');
  const at = tampered.indexOf(idMarker);
  assert.notEqual(at, -1);
  tampered[at + 2] = tampered[at + 2]! ^ 0x01; // 'r' -> 's'
  const tamperedParsed = JSON.parse(Buffer.from(tampered).toString('utf8')) as Record<string, unknown>;
  const { closureDigest: tamperedDigest, ...tamperedPreimage } = tamperedParsed;
  assert.notEqual(contentDigestOf(tamperedPreimage as JsonValue), tamperedDigest);
});

test('AC02: inline value and ref-to-canonical-bytes normalize to the same content digest', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const inlineValue = { minOrderTotal: 50, regions: ['EU', 'US'] };
  const refElement = {
    ...structuredClone(scenario.eligibility),
    id: 'orders.eligibility-ref',
    description: 'Ref-carried twin of the inline rule element.',
    content: [
      {
        id: 'policy-rules',
        contentKind: 'rule' as const,
        schemaRef: scenario.eligibility.content[0]!.schemaRef,
        required: true,
        ref: { packageId: 'orders-business', path: 'content/twin-policy-rules.json', digest: 'sha256:pending' },
      },
    ],
    functions: [],
  };
  scenario.extraElements.push(refElement as never);
  scenario.extraElementFileValues['orders.eligibility-ref/policy-rules'] = inlineValue;

  const prettyBytes = new TextEncoder().encode(JSON.stringify(inlineValue, null, 2));
  const prettyRefElement = {
    ...structuredClone(refElement),
    id: 'orders.eligibility-ref-pretty',
    content: structuredClone(refElement.content),
  };
  prettyRefElement.content[0]!.ref = {
    packageId: 'orders-business',
    path: 'content/pretty-policy-rules.json',
    digest: 'sha256:pending',
  };
  scenario.extraElements.push(prettyRefElement as never);
  scenario.extraElementRawFiles['orders.eligibility-ref-pretty/policy-rules'] = prettyBytes;

  const { input } = scenario.finalize();
  const result = expectSuccess(buildApp(input));
  const lock = result.lock;
  const inline = lock.selectedElements.find((element) => element.ref.id === 'orders.eligibility')!;
  const byRef = lock.selectedElements.find((element) => element.ref.id === 'orders.eligibility-ref')!;
  const byPrettyRef = lock.selectedElements.find((element) => element.ref.id === 'orders.eligibility-ref-pretty')!;
  const expected = contentDigestOf(inlineValue as JsonValue);
  assert.equal(inline.contentDigests[0], expected, 'inline block digests the canonical JSON of its value');
  assert.equal(byRef.contentDigests[0], expected, 'ref block to canonical bytes yields the identical digest');
  assert.equal(
    byPrettyRef.contentDigests[0],
    expected,
    'pretty-printed ref bytes normalize to the same digest (review P2-2)',
  );
  assert.equal(
    lock.resourceDigests['orders-business/content/eligibility-ref-pretty-policy-rules.bin'],
    sha256OfBytes(prettyBytes),
  );
});

test('AC02: cycle-legal semantic relations pass BUILD untouched', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const domainWithSemanticCycle = {
    kind: 'Domain',
    schemaVersion: DH_DOMAIN_SCHEMA_VERSION,
    id: 'orders',
    version: '1.0.0',
    elements: [structuredClone(scenario.faq), structuredClone(scenario.eligibility)],
    semanticRelations: [
      { relation: 'depends-knowledge', from: 'orders.eligibility', to: 'orders.faq' },
      { relation: 'documents', from: 'orders.faq', to: 'orders.eligibility' },
    ],
  };
  const withDomain = { ...input, domains: [domainWithSemanticCycle] };
  const result = expectSuccess(buildApp(withDomain));
  assert.equal(result.lock.closureDigest, expectSuccess(buildApp(input)).lock.closureDigest);
});

test('P1-1: exported multi-Function element selects functions in total fn.id order', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const reviewFunctions = ['zebra', 'alpha', 'mid'].map((id) => ({
    id,
    contractVersion: '1',
    inputSchemaRef: { inline: { type: 'object' } },
    outputSchemaRef: { inline: { type: 'string' } },
    outcomes: ['SUCCEEDED'] as const,
    effects: 'none' as const,
  }));
  scenario.extraElements.push({
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.review',
    version: '1.0.0',
    description: 'Multi-function element with deliberately unsorted function ids.',
    content: [],
    functions: reviewFunctions,
  } as never);
  scenario.businessExports = [
    ...scenario.businessExports,
    { elementId: 'orders.review', functionId: 'zebra' },
    { elementId: 'orders.review', functionId: 'alpha' },
    { elementId: 'orders.review', functionId: 'mid' },
  ];
  scenario.extraImplementations = reviewFunctions.map((fn) => ({
    elementId: 'orders.review',
    functionId: fn.id,
    contractVersion: '1',
    entry: { module: { packageId: 'orders-business', path: 'x', digest: 'sha256:pending' }, exportName: fn.id },
  }));
  const { input } = scenario.finalize();
  const { lock } = expectSuccess(buildApp(input));
  const reviewSelected = lock.selectedFunctions
    .filter((fn) => fn.ref.element.id === 'orders.review')
    .map((fn) => fn.ref.functionId);
  assert.deepEqual(reviewSelected, ['alpha', 'mid', 'zebra']);
});

test('P2-8: authoring schemas sharing an $id across separate BUILD runs do not collide', (t) => {
  const first = standardCase();
  t.after(first.ws.dispose);
  first.extraElements.push({
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.schema-a',
    version: '1.0.0',
    description: 'Object-typed inline schema with a fixed $id.',
    content: [
      {
        id: 'block',
        contentKind: 'knowledge',
        schemaRef: { inline: { $id: 'https://fixture.review/schema-dup', type: 'object' } },
        required: true,
        value: { a: 1 },
      },
    ],
    functions: [],
  } as never);
  expectSuccess(buildApp(first.finalize().input));

  const second = standardCase();
  t.after(second.ws.dispose);
  second.extraElements.push({
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.schema-b',
    version: '1.0.0',
    description: 'String-typed inline schema reusing the same $id in a LATER run.',
    content: [
      {
        id: 'block',
        contentKind: 'knowledge',
        schemaRef: { inline: { $id: 'https://fixture.review/schema-dup', type: 'string' } },
        required: true,
        value: 'not shadowed by the previous run',
      },
    ],
    functions: [],
  } as never);
  expectSuccess(buildApp(second.finalize().input));
});

test('R11 P1-07: BUILD selects a declared Extension from a different layer without dropping dependency', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const ext = input.packages.find((pkg) => (pkg as { id: string }).id === 'aaa-ext') as { layer: string };
  ext.layer = 'sdk';
  const built = buildApp(input);
  assert.equal(built.ok, true, JSON.stringify(built));
  if (built.ok) {
    const chosen = built.lock.selectedPackages.find((pkg) => pkg.packageId === 'orders-business');
    assert.ok(chosen?.dependsOn.includes('aaa-ext'));
    assert.equal(built.lock.selectedPackages.find((pkg) => pkg.packageId === 'aaa-ext')?.layer, 'sdk');
  }
});
