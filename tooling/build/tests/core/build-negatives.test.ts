// BUILD 正反例：只有符合当前契约的资源才能进入 Lock。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DH_ELEMENT_SCHEMA_VERSION,
  type BuildErrorCode,
  type DomainAppDescriptor,
} from '@kaicreator/domain-harness-contracts';
import { buildApp, type BuildResult } from '../../src/index.js';
import { functionRefOf, writeRaw } from './fixtures.js';
import { standardCase } from './standard-case.js';

function expectRefusal(result: BuildResult, code: BuildErrorCode): void {
  assert.equal(result.ok, false, 'BUILD must refuse this input');
  if (!result.ok) {
    assert.equal(result.code, code, `expected ${code}, got ${result.code}: ${result.message}`);
  }
}

function refusalCase(code: BuildErrorCode, mutate: (scenario: ReturnType<typeof standardCase>) => void) {
  test(`${code}`, (t) => {
    const scenario = standardCase();
    t.after(scenario.ws.dispose);
    mutate(scenario);
    const { input } = scenario.finalize();
    expectRefusal(buildApp(input), code);
  });
}


refusalCase('DH_BUILD_SCHEMA_UNKNOWN_REQUIRED', (s) => {
  s.extraElements.push({
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.quantum',
    version: '1.0.0',
    description: 'Carries a REQUIRED block of a kind this BUILD profile does not recognize.',
    content: [
      {
        id: 'quantum-block',
        contentKind: 'quantum' as never,
        schemaRef: { inline: { type: 'object' } },
        required: true,
        value: { q: 1 },
      },
    ],
    functions: [],
  });
});

refusalCase('DH_BUILD_CONTENT_XOR', (s) => {
  s.faq.content[0]!.value = { entries: [] };
});

refusalCase('DH_BUILD_SCHEMA_INVALID', (s) => {
  s.eligibility.content[0]!.value = { minOrderTotal: 'fifty', regions: ['EU'] };
});

refusalCase('DH_BUILD_REF_UNRESOLVED', (s) => {
  s.eligibility.dependencies = [{ element: 'orders.ghost', version: '1.0.0' }];
});

refusalCase('DH_BUILD_ELEMENT_CYCLE', (s) => {
  s.faq.dependencies = [{ element: 'orders.eligibility', version: '^1.0.0' }];
});


refusalCase('DH_BUILD_ELEMENT_DUPLICATE_OWNER', (s) => {
  s.extraElements.push(structuredClone(s.faq));
  s.extraElementFileValues['orders.faq/faq-knowledge'] = { entries: [{ q: 'dup?', a: 'dup' }] };
});

refusalCase('DH_BUILD_VERSION_CONFLICT', (s) => {
  const faqTwo = structuredClone(s.faq);
  faqTwo.version = '1.0.1';
  s.extraElements.push(faqTwo);
  s.extraElementFileValues['orders.faq/faq-knowledge'] = { entries: [{ q: 'v2?', a: 'v2' }] };
});

refusalCase('DH_BUILD_EXPORT_MISSING', (s) => {
  s.businessExports = [{ elementId: 'orders.app-main' }, { interfaceId: 'orders.api' }];
});

refusalCase('DH_BUILD_EXPORT_MISSING', (s) => {
  s.eligibilityVisibility = 'private';
});

refusalCase('DH_BUILD_EXPORT_MISSING', (s) => {
  s.sdkImports = [functionRefOf(s.eligibility, 'evaluate')];
  s.businessExports = [{ elementId: 'orders.app-main' }, { interfaceId: 'orders.api' }];
  s.ingress = [];
});

refusalCase('DH_BUILD_IMPLEMENTATION_MISSING', (s) => {
  s.eligibility.functions = s.eligibility.functions.map((fn) =>
    fn.id === 'evaluate' ? { ...fn, contractVersion: '2' } : fn,
  );
});


// Hook 接口必须在 BUILD 解析，非法 Schema 不得被封存成可用 Hook。
test('RV-1: BUILD refuses malformed inline Hook interface schema', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as { id: string }).id === 'sdk-core') as unknown as {
    provides: { hooks: { interfaceSchemaRef: unknown }[] };
  };
  sdk.provides.hooks[0]!.interfaceSchemaRef = { inline: 42 };
  expectRefusal(buildApp(input), 'DH_BUILD_HOOK_TARGET_INVALID');
});

test('RV-1: BUILD refuses Hook schema resource with incorrect digest', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as { id: string }).id === 'sdk-core') as unknown as {
    provides: { hooks: { interfaceSchemaRef: unknown }[] };
  };
  const file = writeRaw(scenario.ws.packageRoots['sdk-core']!, 'schemas/hook.schema.json', new TextEncoder().encode('{"type":"object"}'));
  sdk.provides.hooks[0]!.interfaceSchemaRef = { ...file, digest: `sha256:${'0'.repeat(64)}` };
  expectRefusal(buildApp(input), 'DH_BUILD_HOOK_TARGET_INVALID');
});

test('RV-3: duplicate ingress ID pointing to distinct Functions is refused before Lock creation', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input, refs } = scenario.finalize();
  const descriptor: DomainAppDescriptor = {
    ...(input.descriptor as DomainAppDescriptor),
    ingress: [
      { id: 'same', function: refs.evaluateRef },
      { id: 'same', function: refs.initRef },
    ],
  };
  const result = buildApp({ ...input, descriptor });
  expectRefusal(result, 'DH_BUILD_SCHEMA_INVALID');
  if (!result.ok) assert.match(result.path ?? '', /^ingress\[1\]\.id$/);
});

test('R27: BUILD rejects artifact paths Runtime would reject', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  for (const path of ['./dist/business.mjs', 'dist/../dist/business.mjs']) {
    expectRefusal(buildApp({
      ...input, packageArtifacts: { ...input.packageArtifacts, 'orders-business': path },
    }), 'DH_BUILD_RESOURCE_MISSING');
  }
  expectRefusal(buildApp({
    ...input, kdpArtifact: { ...input.kdpArtifact, path: `./${input.kdpArtifact.path}` },
  }), 'DH_BUILD_RESOURCE_MISSING');
});

test('R27: lifecycle EntryRef must match pinned package artifact and named export', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const packages = input.packages.map((raw) => {
    const manifest = raw as import('@kaicreator/domain-harness-contracts').DomainPackageManifest;
    if (manifest.id !== 'sdk-core') return manifest;
    return { ...manifest, init: { ...manifest.init, exportName: 'wrongInit' } };
  });
  expectRefusal(buildApp({ ...input, packages }), 'DH_BUILD_SCHEMA_INVALID');
});

test('Exit Element is optional; Init-only Package can build', (t) => {
  const scenario = standardCase();
  scenario.sdkLifecycle = 'init-only';
  t.after(scenario.ws.dispose);
  assert.equal(buildApp(scenario.finalize().input).ok, true);
});

refusalCase('DH_BUILD_DEPENDS_ON_UNSELECTED', (s) => {
  s.businessDependsOn = [{ package: 'ghost-package', version: '1.0.0', interface: 'ghost.api' }];
});

refusalCase('DH_BUILD_PACKAGE_CYCLE', (s) => {
  s.kdpDependsOn = [{ package: 'sdk-core', version: '1.0.0', interface: 'sdk.api' }];
});

refusalCase('DH_BUILD_HOOK_CARDINALITY', (s) => {
  s.sdkHookCardinality = 'single';
  s.aaaContributesTo = [
    {
      ownerPackageId: 'sdk-core',
      hookId: 'audit',
      entry: {
        module: { packageId: 'aaa-ext', path: 'dist/aaa.mjs', digest: 'sha256:pending' },
        exportName: 'audit',
      },
    },
  ];
});


refusalCase('DH_BUILD_TARGET_INVALID', (s) => {
  s.descriptorTarget = { runtime: 'node', module: 'esm', nodeMajor: 20 };
});

refusalCase('DH_BUILD_RESOURCE_MISSING', (s) => {
  s.eligibility.content[1]!.ref = {
    packageId: 'orders-business',
    path: 'content/does-not-exist.json',
    digest: `sha256:${'1'.repeat(64)}`,
  };
});

refusalCase('DH_BUILD_RESOURCE_DIGEST_MISMATCH', (s) => {
  s.eligibility.content[1]!.ref = {
    packageId: 'orders-business',
    path: 'content/zones.json',
    digest: `sha256:${'0'.repeat(64)}`,
  };
});

refusalCase('DH_BUILD_EFFECT_PROFILE_UNSUPPORTED', (s) => {
  s.eligibility.functions = s.eligibility.functions.map((fn) =>
    fn.id === 'evaluate' ? { ...fn, effects: 'external' as const } : fn,
  );
});


test('DH_BUILD_FUNCTION_AMBIGUOUS_IMPLEMENTATION: two compatible bindings for one selected Function+Target', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdkDir = scenario.ws.packageRoots['sdk-core']!;
  const sdkModule = writeRaw(
    sdkDir,
    'dist/sdk-evaluate.mjs',
    new TextEncoder().encode('export function evaluate() { return { decision: "SDK" }; }\n'),
  );
  const sdk = input.packages.find((pkg) => (pkg as { id: string }).id === 'sdk-core') as {
    targetVariants: unknown[];
  };
  sdk.targetVariants.push({
    target: { runtime: 'node', module: 'esm', nodeMajor: 22 },
    implementations: [
      {
        elementId: 'orders.eligibility',
        functionId: 'evaluate',
        contractVersion: '1',
        entry: { module: sdkModule, exportName: 'evaluate' },
      },
    ],
  });
  expectRefusal(buildApp(input), 'DH_BUILD_FUNCTION_AMBIGUOUS_IMPLEMENTATION');
});

test('DH_BUILD_PRIMARY_DUPLICATE: extension claiming primary in an occupied layer', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const aaa = input.packages.find((pkg) => (pkg as { id: string }).id === 'aaa-ext') as { role: string };
  aaa.role = 'primary';
  expectRefusal(buildApp(input), 'DH_BUILD_PRIMARY_DUPLICATE');
});

test('DH_BUILD_PRIMARY_MISSING: kernel root manifest declaring the sdk layer', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const kdp = input.packages.find((pkg) => (pkg as { id: string }).id === 'kdp-kernel') as { layer: string };
  kdp.layer = 'sdk';
  expectRefusal(buildApp(input), 'DH_BUILD_PRIMARY_MISSING');
});

test('DH_BUILD_LAYER_ROLE_MISMATCH: extension referenced from a root slot', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const kdp = input.packages.find((pkg) => (pkg as { id: string }).id === 'kdp-kernel') as { role: string };
  kdp.role = 'extension';
  expectRefusal(buildApp(input), 'DH_BUILD_LAYER_ROLE_MISMATCH');
});

test('DH_BUILD_HOOK_TARGET_INVALID: contribution to an undeclared hook', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const ext = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-ext') as {
    contributesTo: { hookId: string }[];
  };
  ext.contributesTo[0]!.hookId = 'ghost-hook';
  expectRefusal(buildApp(input), 'DH_BUILD_HOOK_TARGET_INVALID');
});

test('BUILD rejects undeclared final generated ESM import even when an indirect Package is selected', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const business = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-business') as import('@kaicreator/domain-harness-contracts').DomainPackageManifest;
  const source = writeRaw(scenario.ws.packageRoots['orders-business']!, 'dist/business.mjs',
    new TextEncoder().encode("import 'aaa-ext';\nexport function init() { return { status: 'READY' }; }\nexport function exit() {}\n"));
  const packages = input.packages.map((pkg) =>
    pkg === business ? {
      ...business,
      dependsOn: business.dependsOn.filter((dep) => dep.package !== 'aaa-ext'),
      init: { module: source, exportName: 'init' },
      exit: { module: source, exportName: 'exit' },
    } : pkg);
  expectRefusal(buildApp({ ...input, packages }), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('BUILD refuses a declared Init when the final artifact lacks the actual export', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as { id: string }).id === 'sdk-core') as import('@kaicreator/domain-harness-contracts').DomainPackageManifest;
  const module = writeRaw(scenario.ws.packageRoots['sdk-core']!, 'dist/sdk.mjs',
    new TextEncoder().encode("export function exit() {}\n"));
  const packages = input.packages.map((pkg) =>
    pkg === sdk ? { ...sdk, init: { module, exportName: 'init' }, exit: { module, exportName: 'exit' } } : pkg);
  expectRefusal(buildApp({ ...input, packages }), 'DH_BUILD_SCHEMA_INVALID');
});

test('BUILD rejects duplicated Core.Order', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as { id: string }).id === 'sdk-core') as { order: number };
  sdk.order = 0;
  expectRefusal(buildApp(input), 'DH_BUILD_PRIMARY_DUPLICATE');
});

test('BUILD rejects missing KDP Order 0', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const kdp = input.packages.find((pkg) => (pkg as { id: string }).id === 'kdp-kernel') as { order: number };
  kdp.order = 9;
  expectRefusal(buildApp(input), 'DH_BUILD_PRIMARY_MISSING');
});

test('BUILD rejects imports from an undeclared direct Extension', (t) => {
  const scenario = standardCase();
  scenario.sdkImports = [functionRefOf(scenario.eligibility, 'evaluate')];
  t.after(scenario.ws.dispose);
  expectRefusal(buildApp(scenario.finalize().input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});


