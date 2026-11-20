/**
 * DomainHarness v0.11.0 T02 (#1576) — BUILD positive + determinism tests.
 *
 * Covers the AC02/AC03/AC04/AC07 BUILD positive rows: 0- and multi-Function
 * Elements, >=2 content kinds, inline/ref digest equivalence, cycle-legal
 * semantic relations, K/S/B primaries + extensions + typed Hook, exact
 * node22-esm/1 target selection with the wrong-Target alternative excluded,
 * deterministic Kahn plan with lexicographic tie-break, strict-reverse
 * dispose order, byte-identical repeated BUILD, mutation-sensitive
 * closureDigest with the exact L2 §5.3 predecessor image.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DH_DOMAIN_SCHEMA_VERSION,
  canonicalJson,
  contentDigestOf,
  type JsonValue,
} from '@kaicreator/domain-harness-contracts/v011';
import { buildV011App, type V011BuildResult } from '../../src/v011/index.js';
import { DH_ELEMENT_SCHEMA_VERSION, sha256OfBytes } from './fixtures.js';
import { standardCase } from './standard-case.js';

function expectSuccess(result: V011BuildResult): Extract<V011BuildResult, { ok: true }> {
  assert.equal(result.ok, true, result.ok ? undefined : `${result.code}: ${result.message}`);
  return result;
}

test('AC02/03/04/07 positive: full K/S/B closure seals the exact Lock', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input, refs } = scenario.finalize();

  const first = expectSuccess(buildV011App(input));
  const lock = first.lock;

  // frozen envelope
  assert.equal(lock.kind, 'DomainAppLock');
  assert.equal(lock.schemaVersion, 'dh.lock/0.11');
  assert.deepEqual(lock.target, { runtime: 'node', module: 'esm', nodeMajor: 22, profile: 'node22-esm/1' });
  assert.deepEqual(lock.appIdentity, {
    id: 'orders.basic',
    version: '1.0.0',
    descriptorDigest: contentDigestOf(input.descriptor as JsonValue),
  });

  // K/S/B exactly one primary each + legal extensions
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

  // elements: 0-Function knowledge element + multi-Function element coexist
  assert.deepEqual(
    lock.selectedElements.map((element) => element.ref.id),
    ['orders.app-main', 'orders.eligibility', 'orders.faq', 'orders.legacy-prompt-notes'],
  );
  const eligibility = lock.selectedElements.find((element) => element.ref.id === 'orders.eligibility')!;
  const faq = lock.selectedElements.find((element) => element.ref.id === 'orders.faq')!;
  assert.deepEqual(faq.contractDigests, []); // 0-Function is a first-class form
  assert.equal(eligibility.contractDigests.length, 2);
  assert.equal(eligibility.ownerPackageId, 'orders-business');

  // selected functions: exported evaluate + app init; non-exported explain stays out
  assert.deepEqual(
    lock.selectedFunctions.map((fn) => `${fn.ref.element.id}.${fn.ref.functionId}`),
    ['orders.app-main.init', 'orders.eligibility.evaluate'],
  );
  const evaluate = lock.selectedFunctions.find((fn) => fn.ref.functionId === 'evaluate')!;
  // the wrong-Target (node20) alternative must NOT enter the Lock
  assert.equal(evaluate.implementation.module.path, 'dist/evaluate.mjs');
  assert.equal(evaluate.effects, 'none');
  assert.deepEqual(
    evaluate.resources.map((resource) => resource.path),
    ['content/zones.json'],
  );

  // typed hook: multi audit hook with the one contributing extension
  assert.deepEqual(lock.hookBindings, [
    {
      ownerPackageId: 'sdk-core',
      hookId: 'audit',
      cardinality: 'multi',
      providers: [{ module: { packageId: 'orders-ext', path: 'dist/audit.mjs', digest: lock.hookBindings[0]!.providers[0]!.module.digest }, exportName: 'audit' }],
    },
  ]);

  // deterministic plan: Kahn with lexicographic tie-break; dispose strict reverse
  assert.deepEqual(lock.technicalInitOrder, ['aaa-ext', 'kdp-kernel', 'orders-ext', 'sdk-core', 'orders-business']);
  assert.deepEqual(lock.technicalDisposeOrder, [...lock.technicalInitOrder].reverse());

  // ingress + unique business app init
  assert.deepEqual(lock.ingress, [{ id: 'evaluate', function: refs.evaluateRef, optional: false }]);
  assert.deepEqual(lock.businessAppInit, refs.initRef);

  // unknown optional content explicitly excluded (PRD E10 pinned record form)
  // AND absent from selectedElements.contentDigests (review P2-4)
  assert.deepEqual(lock.excludedUnknownContent, ['orders.legacy-prompt-notes/prompt-note']);
  assert.deepEqual(
    lock.selectedElements.find((element) => element.ref.id === 'orders.legacy-prompt-notes')!.contentDigests,
    [],
  );

  // KDP bootstrap pin: acyclic KDP-side facts only
  assert.equal(lock.bootstrapKdpPin.kdpPackageId, '@kaicreator/domain-harness-microkernel');
  assert.equal(lock.bootstrapKdpPin.kdpPrimaryEntry, 'bootstrap');
  assert.match(lock.bootstrapKdpPin.kdpPrimaryDigest, /^sha256:[0-9a-f]{64}$/u);

  // resource closure digests are keyed by <packageId>/<path>
  for (const key of [
    'orders-business/content/faq.json',
    'orders-business/content/zones.json',
    'orders-business/docs/eligibility.md',
    'orders-business/definitions/eligibility-1.0.0-1.json',
    'orders-business/dist/business.mjs',
    '@kaicreator/domain-harness-microkernel/dist/v011/index.js',
  ]) {
    assert.match(lock.resourceDigests[key] ?? '', /^sha256:[0-9a-f]{64}$/u, `resourceDigests['${key}']`);
  }
});

test('AC07: repeated BUILD over identical input is byte-identical and pool-order insensitive', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();

  const first = expectSuccess(buildV011App(input));
  const second = expectSuccess(buildV011App(input));
  assert.deepEqual(Buffer.from(second.lockBytes), Buffer.from(first.lockBytes));

  // shuffling the candidate pool order must not change a single output byte
  const shuffled = { ...input, packages: [...input.packages].reverse() };
  const third = expectSuccess(buildV011App(shuffled));
  assert.deepEqual(Buffer.from(third.lockBytes), Buffer.from(first.lockBytes));
});

test('AC07: closureDigest is the L2 §5.3 predecessor image and is mutation-sensitive', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const { lock, lockBytes } = expectSuccess(buildV011App(input));

  // recompute: parse -> remove closureDigest -> canonical JSON -> sha256
  const parsed = JSON.parse(Buffer.from(lockBytes).toString('utf8')) as Record<string, unknown>;
  const { closureDigest, ...preimage } = parsed;
  assert.equal(contentDigestOf(preimage as JsonValue), closureDigest);
  assert.equal(lock.closureDigest, closureDigest);

  // the sealed bytes are exactly the canonical JSON of the sealed Lock
  assert.equal(Buffer.from(lockBytes).toString('utf8'), canonicalJson(JSON.parse(Buffer.from(lockBytes).toString('utf8')) as JsonValue));

  // flip one byte inside appIdentity.id -> digest guard must catch the drift
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

  // review P2-2 counterexample: a PRETTY-PRINTED (non-canonical) JSON ref must
  // still normalize to the inline digest, while resourceDigests keeps the
  // raw-bytes digest.
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
  const result = expectSuccess(buildV011App(input));
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
  // raw actual-bytes digests remain verified in the resource closure
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
  const result = expectSuccess(buildV011App(withDomain));
  assert.equal(result.lock.closureDigest, expectSuccess(buildV011App(input)).lock.closureDigest);
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
  const { lock } = expectSuccess(buildV011App(input));
  const reviewSelected = lock.selectedFunctions
    .filter((fn) => fn.ref.element.id === 'orders.review')
    .map((fn) => fn.ref.functionId);
  assert.deepEqual(reviewSelected, ['alpha', 'mid', 'zebra']);
});

test('P2-8: authoring schemas sharing an $id across separate BUILD runs do not collide', (t) => {
  // A shared ajv registry would let the first run's compiled validator shadow
  // the second run's same-$id schema; per-build checkers make each run exact.
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
  expectSuccess(buildV011App(first.finalize().input));

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
  expectSuccess(buildV011App(second.finalize().input));
});
