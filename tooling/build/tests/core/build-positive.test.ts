// BUILD 正反例：只有符合当前契约的资源才能进入 Lock。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DH_DOMAIN_SCHEMA_VERSION,
  canonicalJson,
  contentDigestOf,
  type DomainAppDescriptor,
  type DomainPackageManifest,
  type JsonValue,
} from '@kaicreator/domain-harness-contracts';
import { buildApp, type BuildResult } from '../../src/index.js';
import { DH_ELEMENT_SCHEMA_VERSION, addPackage, manifest, sha256OfBytes, writeRaw } from './fixtures.js';
import { standardCase } from './standard-case.js';

function expectSuccess(result: BuildResult): Extract<BuildResult, { ok: true }> {
  assert.equal(result.ok, true, result.ok ? undefined : `${result.code}: ${result.message}`);
  return result;
}

test('AC02/03/04/07 positive: full K/S/B closure seals the exact Lock', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();

  const first = expectSuccess(buildApp(input));
  const lock = first.lock;

  assert.equal(lock.kind, 'DomainAppLock');
  assert.equal(lock.schemaVersion, 'dh.lock/0.11.1');
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
    ['kdp-kernel', 'orders-ext'],
  );

  assert.equal(lock.selectedPackages.find((pkg) => pkg.packageId === 'sdk-core')?.initFunction.functionId, 'init');
  assert.equal(lock.selectedPackages.find((pkg) => pkg.packageId === 'orders-business')?.initFunction.element.id, 'orders.app-main');

  for (const id of ['orders.app-main', 'orders.eligibility', 'orders.faq', 'orders.legacy-prompt-notes']) {
    assert.ok(lock.selectedElements.some((element) => element.ref.id === id), `must select Element '${id}'`);
  }
  assert.equal(lock.selectedPackages.every((pkg) => lock.selectedElements.some(
    (entry) => entry.ownerPackageId === pkg.packageId && entry.ref.digest === pkg.init.digest,
  )), true, 'each Package Init must resolve to its owned selected Element');
  const eligibility = lock.selectedElements.find((element) => element.ref.id === 'orders.eligibility')!;
  const faq = lock.selectedElements.find((element) => element.ref.id === 'orders.faq')!;
  assert.deepEqual(faq.contractDigests, []); // 0-Function is a first-class form
  assert.equal(eligibility.contractDigests.length, 2);
  assert.equal(eligibility.ownerPackageId, 'orders-business');

  assert.ok(lock.selectedFunctions.some((fn) =>
    fn.ref.element.id === 'orders.eligibility' && fn.ref.functionId === 'evaluate'));
  assert.equal(lock.selectedPackages.every((pkg) =>
    lock.selectedFunctions.some((fn) => JSON.stringify(fn.ref) === JSON.stringify(pkg.initFunction))), true);

  const evaluate = lock.selectedFunctions.find((fn) => fn.ref.functionId === 'evaluate')!;
  assert.equal(evaluate.implementation.module.path, 'dist/evaluate.mjs');
  assert.equal(evaluate.effects, 'none');
  assert.deepEqual(
    evaluate.resources.map((resource) => resource.path),
    ['content/zones.json'],
  );

  assert.equal(lock.hookBindings.length, 1);
  assert.equal(lock.hookBindings[0]?.providers.length, 1);
  assert.equal(lock.hookBindings[0]?.providers[0]?.functionId, 'audit');
  assert.equal(lock.hookBindings[0]?.providers[0]?.element.id, 'orders-ext.lifecycle');

  assert.deepEqual(lock.coreOrder, ['kdp-kernel', 'sdk-core', 'orders-business']);
  assert.deepEqual(lock.selectedPackages.filter((pkg) => pkg.role === 'primary').map((pkg) => pkg.order).sort(), [0, 1, 2]);

  assert.equal('ingress' in lock, false, 'no direct business ingress is part of v0.11.0');

  assert.deepEqual(lock.excludedUnknownContent, ['orders.legacy-prompt-notes/prompt-note']);
  assert.deepEqual(
    lock.selectedElements.find((element) => element.ref.id === 'orders.legacy-prompt-notes')!.contentDigests,
    [],
  );

  assert.equal(lock.selectedKdpHost.kdpPackageId, 'kdp-kernel');
  assert.equal(lock.selectedKdpHost.invocationAbi, 'kdp-host-init/1');
  assert.equal(lock.selectedKdpHost.kdpInitFunction.functionId, 'init');
  assert.equal(lock.selectedKdpHost.kdpInitModule.path, 'dist/kdp.mjs');
  assert.match(lock.selectedKdpHost.kdpInitModule.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(lock.selectedFunctions.filter((fn) => fn.invocationAbi === 'kdp-host-init/1').length, 1);

  for (const key of [
    'orders-business/content/faq.json',
    'orders-business/content/zones.json',
    'orders-business/docs/eligibility.md',
    'orders-business/definitions/eligibility-1.0.0-1.json',
    'orders-business/dist/business.mjs',
    'kdp-kernel/dist/kdp.mjs',
    'kdp-kernel/package.json',
  ]) {
    assert.match(lock.resourceDigests[key] ?? '', /^sha256:[0-9a-f]{64}$/u, `resourceDigests['${key}']`);
  }
});

test('R2 P1-01: const function and immutable local function alias both remain callable Targets', (t) => {
  for (const source of [
    "export const init = () => ({ status: 'READY' });\n",
    "const stable = () => ({ status: 'READY' });\nexport { stable as init };\n",
    "function stable() { return { status: 'READY' }; }\nexport { stable as init };\n",
  ]) {
    const scenario = standardCase();
    t.after(scenario.ws.dispose);
    const { input } = scenario.finalize();
    const sdk = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'sdk-core') as DomainPackageManifest;
    const module = writeRaw(scenario.ws.packageRoots['sdk-core']!, 'dist/cases/callable-alias.mjs',
      new TextEncoder().encode(source));
    const altered = { ...sdk, targetVariants: sdk.targetVariants.map((variant) => ({
      ...variant, implementations: variant.implementations.map((binding) =>
        binding.functionId === 'init'
          ? { ...binding, entry: { module, exportName: 'init' } }
          : binding),
    })) };
    const result = buildApp({ ...input, packages: input.packages.map((pkg) => pkg === sdk ? altered : pkg) });
    assert.equal(result.ok, true, result.ok ? '' : result.message);
  }
});

test('AC07: repeated BUILD over identical input is byte-identical and pool-order insensitive', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();

  const first = expectSuccess(buildApp(input));
  const second = expectSuccess(buildApp(input));
  assert.deepEqual(Buffer.from(second.lockBytes), Buffer.from(first.lockBytes));
  assert.deepEqual(second.appPackage, first.appPackage);

  const shuffled = { ...input, packages: [...input.packages].reverse() };
  const third = expectSuccess(buildApp(shuffled));
  assert.deepEqual(Buffer.from(third.lockBytes), Buffer.from(first.lockBytes));
  assert.deepEqual(third.appPackage, first.appPackage);
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

test('R11 P1-02: four Cores with a repeated layer and non-contiguous Orders are BUILD-selected', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const dir = addPackage(scenario.ws, 'auxiliary-core');
  const artifact = writeRaw(dir, 'dist/index.mjs', new TextEncoder().encode(
    'export async function init(ctx) { return ctx.nextCore?.init(); }\nexport async function exit() {}\n',
  ));
  writeRaw(dir, 'package.json', new TextEncoder().encode(canonicalJson({
    name: 'auxiliary-core', version: '1.0.0', type: 'module', exports: { '.': './dist/index.mjs' },
  })));
  const element = {
    kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.auxiliary-core-lifecycle', version: '1.0.0',
    description: 'Extra Core with its own real Init/Exit Element',
    content: [],
    functions: ['init', 'exit'].map((id) => ({
      id, contractVersion: '1',
      inputSchemaRef: { inline: { type: 'object' } }, outputSchemaRef: { inline: { type: 'object' } },
      outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'], effects: 'none',
    })),
  };
  const definitionRef = writeRaw(dir, 'elements/lifecycle.json',
    new TextEncoder().encode(canonicalJson(element as JsonValue)));
  const lifeRef = {
    namespace: 'orders', id: element.id, version: '1.0.0' as const,
    digest: contentDigestOf(element as JsonValue),
  };
  const core = manifest('auxiliary-core', '1.0.0', {
    layer: 'sdk', role: 'primary', order: 7,
    init: lifeRef, exit: lifeRef,
    elements: [{ id: element.id, version: '1.0.0', definitionRef, visibility: 'private' }],
    targetVariants: [{ target: { runtime: 'node', module: 'esm', nodeMajor: 22 }, implementations: [
      { elementId: element.id, functionId: 'init', contractVersion: '1', entry: { module: artifact, exportName: 'init' } },
      { elementId: element.id, functionId: 'exit', contractVersion: '1', entry: { module: artifact, exportName: 'exit' } },
    ] }],
  });
  const descriptor = structuredClone(input.descriptor) as DomainAppDescriptor;
  (descriptor.roots.cores as { package: string; version: string }[]).push({ package: 'auxiliary-core', version: '1.0.0' });
  const built = expectSuccess(buildApp({
    ...input,
    descriptor,
    packages: [...input.packages, core],
    packageArtifacts: { ...input.packageArtifacts, 'auxiliary-core': 'dist/index.mjs' },
  }));
  assert.deepEqual(built.lock.coreOrder, ['kdp-kernel', 'sdk-core', 'orders-business', 'auxiliary-core']);
  assert.deepEqual(built.lock.selectedPackages.filter((pkg) => pkg.role === 'primary').map((pkg) => pkg.order), [7, 0, 2, 1]);
  assert.ok(built.appPackage.files.some((file) => file.path === 'packages/auxiliary-core/dist/index.mjs'));
});

test('B0: direct Extension Function import remains selected from public Element', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input, refs } = scenario.finalize();
  const selected = buildApp(input);
  assert.equal(selected.ok, true, JSON.stringify(selected));
  if (selected.ok) {
    assert.ok(selected.lock.selectedFunctions.some((fn) =>
      JSON.stringify(fn.ref) === JSON.stringify(refs.evaluateRef)));
  }
});

test('R16 P1-SRC-01: ordinary non-lifecycle scripts remain legal and do not change selected BUILD semantics', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  writeRaw(scenario.ws.packageRoots['orders-business']!, 'package.json',
    new TextEncoder().encode(JSON.stringify({
      name: 'orders-business', version: '1.0.0', type: 'module',
      scripts: { test: 'node --test', build: 'tsc' },
    })));
  const result = buildApp(input);
  assert.equal(result.ok, true, JSON.stringify(result));
});

test('B0: local Array.at / Map.get remain legal in a selected Init Function Target', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const business = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-business') as
    import('@kaicreator/domain-harness-contracts').DomainPackageManifest;
  const artifact = writeRaw(scenario.ws.packageRoots['orders-business']!, 'dist/local-collections.mjs',
    new TextEncoder().encode(`
const values = [2, 4, 6];
const byKey = new Map([['first', 'READY']]);
export function init() {
  const index = 1;
  return { status: byKey.get('first'), detail: { value: values.at(index) } };
}
`));
  const packages = input.packages.map((pkg) => pkg === business ? {
    ...business, targetVariants: business.targetVariants.map((variant) => ({
      ...variant, implementations: variant.implementations.map((binding) =>
        binding.functionId === 'init'
          ? { ...binding, entry: { module: artifact, exportName: 'init' } }
          : binding),
    })),
  } : pkg);
  const result = buildApp({ ...input, packages });
  assert.equal(result.ok, true, JSON.stringify(result));
});

test('R60 W06: real selected Business ESM may import only pinned pure yaml@2.9.1, locked and verified', (t) => {
  const make = (dependencies: Record<string, string> | undefined, source = `
import { parseDocument } from 'yaml';
export const artifact = 'orders-business';
export function init() {
  const doc = parseDocument('verified: 42', { schema: 'core', version: '1.2', uniqueKeys: true });
  if (doc.errors.length) throw new Error('selected YAML library failed');
  return { status: 'READY', value: doc.toJS() };
}
export function exit() {}
`) => {
    const scenario = standardCase();
    t.after(scenario.ws.dispose);
    const { input } = scenario.finalize();
    const dir = scenario.ws.packageRoots['orders-business']!;
    const module = writeRaw(dir, 'dist/business.mjs', new TextEncoder().encode(source));
    writeRaw(dir, 'package.json', new TextEncoder().encode(JSON.stringify({
      name:'orders-business', version:'1.0.0', type:'module',
      exports:{'.':'./dist/business.mjs'},
      ...(dependencies ? { dependencies } : {}),
    })));
    const selected = input.packages.find((item) => (item as DomainPackageManifest).id === 'orders-business') as DomainPackageManifest;
    const revised = { ...selected, targetVariants: selected.targetVariants.map((variant) => ({
      ...variant, implementations: variant.implementations.map((fn) => fn.entry.module.path === 'dist/business.mjs'
        ? { ...fn, entry: { ...fn.entry, module } } : fn),
    })) };
    return buildApp({ ...input, packages: input.packages.map((item) => item === selected ? revised : item) });
  };
  const accepted = make({yaml:'2.9.1'});
  assert.equal(accepted.ok, true, accepted.ok ? '' : accepted.message);
  if (accepted.ok) {
    const archive = accepted.lock.trustedRuntimeIntegrity;
    // R130：引擎 XState 随 KDP 自含闭包交付；App 层钉唯一直接声明的 yaml 归档。
    assert.equal(archive?.length, 1, 'exact SHA512 transitive closure must remain immutable');
    assert.equal(archive?.[0]?.name, 'yaml');
    assert.equal(archive?.[0]?.version, '2.9.1');
    assert.match(archive?.[0]?.integrity ?? '', /^sha512-/u);
    const app = accepted.appPackage.files.find((item) => item.path === 'package.json');
    assert.ok(app);
    const manifest = JSON.parse(Buffer.from(app.bytes).toString('utf8')) as {
      dependencies: Record<string,string>;
    };
    assert.equal(manifest.dependencies['@kaicreator/domain-harness'], '0.11.0');
    assert.equal(manifest.dependencies.yaml, '2.9.1');
    assert.equal(manifest.dependencies['@kaicreator/domain-harness-build'], undefined);
    assert.ok(accepted.appPackage.files.some((item) => item.path === 'dh-install/verify-preinstall.mjs'));
    assert.ok(accepted.appPackage.files.some((item) => item.path === 'dh-install/verify-runtime.mjs'));
    assert.ok(accepted.appPackage.files.some((item) => item.path === 'dh-install/install-runtime.mjs'));
  }
  for (const deps of [
    {yaml:'^2.9.1'},
    {yaml:'2.9.2'},
    {yaml:'2.9.1', 'unapproved-package':'1.0.0'},
  ]) {
    const rejected = make(deps);
    assert.equal(rejected.ok, false, 'floating or unexpected npm dependencies must refuse');
    if (!rejected.ok) assert.equal(rejected.code, 'DH_BUILD_DEPENDS_ON_UNSELECTED');
  }
  const undeclared = make(undefined);
  assert.equal(undeclared.ok, false, 'undocumented external import must refuse before install');
  if (!undeclared.ok) assert.equal(undeclared.code, 'DH_BUILD_DEPENDS_ON_UNSELECTED');
  const dynamic = make({yaml:'2.9.1'}, `
export async function init() { return (await import('yaml')).parseDocument('a: 1'); }
export function exit() {}
`);
  assert.equal(dynamic.ok, false, 'dynamically resolved third-party runtime must refuse');
  if (!dynamic.ok) assert.equal(dynamic.code, 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});
