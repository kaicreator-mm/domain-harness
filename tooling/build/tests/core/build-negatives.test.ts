// BUILD 正反例：只有符合当前契约的资源才能进入 Lock。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DH_ELEMENT_SCHEMA_VERSION,
  type BuildErrorCode,
  type DomainAppDescriptor,
  type DomainPackageManifest,
  type ResourceRef,
} from '@kaicreator/domain-harness-contracts';
import { buildApp, type BuildResult } from '../../src/index.js';
import { functionRefOf, writeRaw } from './fixtures.js';
import { standardCase } from './standard-case.js';

function withInitTarget(pkg: DomainPackageManifest, module: ResourceRef): DomainPackageManifest {
  return { ...pkg, targetVariants: pkg.targetVariants.map((variant) => ({
    ...variant, implementations: variant.implementations.map((binding) =>
      binding.functionId === 'init' ? { ...binding, entry: { module, exportName: 'init' } } : binding),
  })) };
}

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

test('Foundation L2-1: FunctionRef namespace must match the selected logical Element key', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input, refs } = scenario.finalize();
  const packages = input.packages.map((pkg) => (pkg as DomainPackageManifest).id === 'sdk-core'
    ? {
      ...(pkg as DomainPackageManifest),
      imports: [{
        ...refs.evaluateRef,
        element: { ...refs.evaluateRef.element, namespace: 'unselected-namespace' },
      }],
    } : pkg);
  expectRefusal(buildApp({ ...input, packages }), 'DH_BUILD_REF_UNRESOLVED');
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

// 新合同中没有默认 ingress，未导入的 Function 不要求公开。
test('B0: private unimported Element is legal (no implicit direct ingress)', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  scenario.eligibilityVisibility = 'private';
  const { input } = scenario.finalize();
  assert.equal(buildApp(input).ok, true);
});

test('B0-03: Hook provider cannot satisfy interface via a private Element', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const ext = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'orders-ext') as DomainPackageManifest;
  const packages = input.packages.map((pkg) => pkg === ext
    ? { ...ext, elements: ext.elements.map((entry) => ({
        ...entry, visibility: 'private' as const,
      })) }
    : pkg);
  expectRefusal(buildApp({ ...input, packages }), 'DH_BUILD_EXPORT_MISSING');
});

test('B0-03: Hook provider missing declared public Function export is rejected', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const ext = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'orders-ext') as DomainPackageManifest;
  const packages = input.packages.map((pkg) => pkg === ext
    ? { ...ext, exports: ext.exports.filter((entry) => entry.functionId !== 'audit') }
    : pkg);
  expectRefusal(buildApp({ ...input, packages }), 'DH_BUILD_EXPORT_MISSING');
});

test('B0-03: direct Extension Function import must target an actually exported FunctionRef', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const ext = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'orders-ext') as DomainPackageManifest;
  const sdk = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'sdk-core') as DomainPackageManifest;
  const providerRef = ext.contributesTo[0]!.function;
  const packages = input.packages.map((pkg) => pkg === sdk
    ? { ...sdk, imports: [providerRef] }
    : pkg === ext
      ? { ...ext, exports: ext.exports.filter((entry) => entry.functionId !== 'audit') }
      : pkg);
  expectRefusal(buildApp({ ...input, packages }), 'DH_BUILD_EXPORT_MISSING');
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

test('B0-05: direct ingress cannot be reintroduced into the DomainApp descriptor', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input, refs } = scenario.finalize();
  const descriptor = { ...(input.descriptor as DomainAppDescriptor),
    ingress: [{ id: 'old-direct-ingress', function: refs.evaluateRef }],
  };
  expectRefusal(buildApp({ ...input, descriptor }), 'DH_BUILD_SCHEMA_INVALID');
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

test('B0-02: lifecycle ElementRef digest mismatch is refused before choosing a Target', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const packages = input.packages.map((raw) => {
    const pkg = raw as DomainPackageManifest;
    return pkg.id === 'sdk-core'
      ? { ...pkg, init: { ...pkg.init, digest: `sha256:${'0'.repeat(64)}` } }
      : pkg;
  });
  expectRefusal(buildApp({ ...input, packages }), 'DH_BUILD_REF_UNRESOLVED');
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
      function: functionRefOf(s.eligibility, 'evaluate'),
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

test('DH_BUILD_PRIMARY_MISSING: a Primary introduced transitively but not selected as a root Core', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const aaa = input.packages.find((pkg) => (pkg as { id: string }).id === 'aaa-ext') as { role: string };
  aaa.role = 'primary';
  expectRefusal(buildApp(input), 'DH_BUILD_PRIMARY_MISSING');
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

test('B0: BUILD refuses a module import from undeclared Extension even when its Target is selected', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const business = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'orders-business')! as DomainPackageManifest;
  const source = writeRaw(scenario.ws.packageRoots['orders-business']!, 'dist/cases/undeclared.mjs',
    new TextEncoder().encode("import 'aaa-ext';\nexport function init() { return { status: 'READY' }; }\n"));
  const changed = withInitTarget({ ...business, dependsOn: business.dependsOn.filter((dep) => dep.package !== 'aaa-ext') }, source);
  expectRefusal(buildApp({ ...input, packages: input.packages.map((pkg) => pkg === business ? changed : pkg) }),
    'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('B0-02: BUILD refuses a named Init export that is not callable', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'sdk-core') as DomainPackageManifest;
  const module = writeRaw(scenario.ws.packageRoots['sdk-core']!, 'dist/cases/not-callable.mjs',
    new TextEncoder().encode('export const init = 42;\n'));
  const altered = withInitTarget(sdk, module);
  expectRefusal(buildApp({ ...input, packages: input.packages.map((pkg) => pkg === sdk ? altered : pkg) }),
    'DH_BUILD_IMPLEMENTATION_MISSING');
});

test('R2 P1-01: mutable ESM let init is refused even when initializer is a function', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'sdk-core') as DomainPackageManifest;
  const module = writeRaw(scenario.ws.packageRoots['sdk-core']!, 'dist/cases/mutable-init.mjs',
    new TextEncoder().encode("export let init = () => ({ status: 'READY' });\ninit = 42;\n"));
  const altered = withInitTarget(sdk, module);
  expectRefusal(buildApp({ ...input, packages: input.packages.map((pkg) => pkg === sdk ? altered : pkg) }),
    'DH_BUILD_IMPLEMENTATION_MISSING');
});

test('R2 P1-01: local function alias export with later reassignment is refused', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'sdk-core') as DomainPackageManifest;
  const module = writeRaw(scenario.ws.packageRoots['sdk-core']!, 'dist/cases/alias-reassigned.mjs',
    new TextEncoder().encode("function localInit() { return { status: 'READY' }; }\nlocalInit = 42;\nexport { localInit as init };\n"));
  const altered = withInitTarget(sdk, module);
  expectRefusal(buildApp({ ...input, packages: input.packages.map((pkg) => pkg === sdk ? altered : pkg) }),
    'DH_BUILD_IMPLEMENTATION_MISSING');
});

test('R2 P1-01: exported function with later assignment is not a proof of a callable Target', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'sdk-core') as DomainPackageManifest;
  const module = writeRaw(scenario.ws.packageRoots['sdk-core']!, 'dist/cases/function-reassigned.mjs',
    new TextEncoder().encode("export function init() { return { status: 'READY' }; }\ninit = 42;\n"));
  const altered = withInitTarget(sdk, module);
  expectRefusal(buildApp({ ...input, packages: input.packages.map((pkg) => pkg === sdk ? altered : pkg) }),
    'DH_BUILD_IMPLEMENTATION_MISSING');
});

test('B0-02: no Element owner means no legal Init despite a valid ESM export', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'sdk-core') as DomainPackageManifest;
  const altered = { ...sdk, elements: [] };
  expectRefusal(buildApp({ ...input, packages: input.packages.map((pkg) => pkg === sdk ? altered : pkg) }),
    'DH_BUILD_REF_UNRESOLVED');
});

test('B0-02: lifecycle Element owner must be the declaring Package, not another selected Core', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'sdk-core') as DomainPackageManifest;
  const business = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'orders-business') as DomainPackageManifest;
  const altered = { ...sdk, init: business.init };
  expectRefusal(buildApp({ ...input, packages: input.packages.map((pkg) => pkg === sdk ? altered : pkg) }),
    'DH_BUILD_REF_UNRESOLVED');
});

test('B0-02: BUILD refuses declared Init Function whose Target module lacks named export', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'sdk-core')! as DomainPackageManifest;
  const source = writeRaw(scenario.ws.packageRoots['sdk-core']!, 'dist/cases/missing-init.mjs',
    new TextEncoder().encode("export function notInit() {}\n"));
  const changed = withInitTarget(sdk, source);
  expectRefusal(buildApp({ ...input, packages: input.packages.map((pkg) => pkg === sdk ? changed : pkg) }),
    'DH_BUILD_IMPLEMENTATION_MISSING');
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
  t.after(scenario.ws.dispose);
  const { input, refs } = scenario.finalize();
  const sdk = input.packages.find((pkg) => (pkg as { id: string }).id === 'sdk-core') as { imports: unknown[] };
  sdk.imports = [refs.evaluateRef];
  expectRefusal(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});



test('B0: raw cross-Package re-export cannot launder a Function handle', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const business = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'orders-business')! as DomainPackageManifest;
  const source = writeRaw(scenario.ws.packageRoots['orders-business']!, 'dist/cases/reexport.mjs',
    new TextEncoder().encode("export function init() {}\nexport { audit } from 'aaa-ext';\n"));
  const changed = withInitTarget(business, source);
  expectRefusal(buildApp({ ...input, packages: input.packages.map((pkg) => pkg === business ? changed : pkg) }),
    'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('B0: unapproved Node module loaders are not accepted in selected Function Targets', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const business = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'orders-business')! as DomainPackageManifest;
  const source = writeRaw(scenario.ws.packageRoots['orders-business']!, 'dist/cases/loader.mjs',
    new TextEncoder().encode("import { createRequire } from 'node:module';\nexport function init() {}\n"));
  const changed = withInitTarget(business, source);
  expectRefusal(buildApp({ ...input, packages: input.packages.map((pkg) => pkg === business ? changed : pkg) }),
    'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('BUILD forbids Function resource access to an undeclared transitive Package', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const business = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-business') as {
    targetVariants: { implementations: { functionId: string; resources?: unknown[] }[] }[];
  };
  const implementation = business.targetVariants[0]!.implementations.find((entry) => entry.functionId === 'evaluate')!;
  implementation.resources = [{ packageId: 'kdp-kernel', path: 'content/illegal.txt', digest: `sha256:${'0'.repeat(64)}` }];
  expectRefusal(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('BUILD forbids Element content references to an undeclared Package', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  scenario.eligibility.content[1]!.ref = {
    packageId: 'kdp-kernel', path: 'content/unauthorized.json', digest: `sha256:${'0'.repeat(64)}`,
  };
  expectRefusal(buildApp(scenario.finalize().input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('Foundation L2-1: Order-0 Kernel refuses literal dynamic import before sealing KDP', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const kdp = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'kdp-kernel') as DomainPackageManifest;
  const target = writeRaw(scenario.ws.packageRoots['kdp-kernel']!, 'dist/kdp.mjs',
    new TextEncoder().encode('export async function init() { await import("./lazy.mjs"); }\nexport function exit() {}\n'));
  const patched = {
    ...kdp,
    targetVariants: kdp.targetVariants.map((variant) => ({
      ...variant,
      implementations: variant.implementations.map((binding) => ({
        ...binding,
        entry: { ...binding.entry, module: target },
      })),
    })),
  };
  const packages = input.packages.map((pkg) => pkg === kdp ? patched : pkg);
  expectRefusal(buildApp({ ...input, packages }), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

function generatedLoaderCase(label: string, body: string, code: BuildErrorCode = 'DH_BUILD_DEPENDS_ON_UNSELECTED'): void {
  test(`B0 selected ESM proof: ${label}`, (t) => {
    const scenario = standardCase();
    t.after(scenario.ws.dispose);
    const { input } = scenario.finalize();
    const business = input.packages.find((pkg) => (pkg as DomainPackageManifest).id === 'orders-business')! as DomainPackageManifest;
    const source = writeRaw(scenario.ws.packageRoots['orders-business']!, 'dist/cases/guard.mjs',
      new TextEncoder().encode(body));
    const changed = withInitTarget(business, source);
    expectRefusal(buildApp({ ...input,
      packages: input.packages.map((pkg) => pkg === business ? changed : pkg),
    }), code);
  });
}

generatedLoaderCase('computed global Function loader is refused', `
const load = globalThis['Function']('return import("undeclared-package")');
export async function init() { await load()(); }
export function exit() {}
`);
generatedLoaderCase('aliased global Function loader is refused before invocation', `
const F = globalThis.Function;
export async function init() { return F('return import("undeclared-package")')(); }
export function exit() {}
`);
generatedLoaderCase('bare Function alias cannot bypass identifier checks', `
const F = Function;
export async function init() { return F('return 1')(); }
export function exit() {}
`);
generatedLoaderCase('process.getBuiltinModule and createRequire are refused', `
export async function init() { return process.getBuiltinModule('module').createRequire(import.meta.url)('undeclared-package'); }
export function exit() {}
`);
generatedLoaderCase('computed process builtin loader is refused', `
export async function init() { return process['getBuiltinModule']('module'); }
export function exit() {}
`);
generatedLoaderCase('nonliteral computed calls are not statically provable', `
const table = {};
export async function init() { return table[globalThis.name](); }
export function exit() {}
`);
generatedLoaderCase('Reflect-based Function lookup is refused', `
export async function init() { return Reflect.get(globalThis, 'Function')('return 1')(); }
export function exit() {}
`);

generatedLoaderCase('computed global Function read followed by indirect invocation is refused', `
const loader = globalThis['Fun' + 'ction'];
export async function init() { return loader('return import("undeclared-package")')()(); }
export function exit() {}
`);
generatedLoaderCase('computed process builtin read followed by indirect invocation is refused', `
const loader = process['get' + 'BuiltinModule'];
export async function init() { return loader('module').createRequire(import.meta.url)('undeclared-package'); }
export function exit() {}
`);
generatedLoaderCase('computed destructuring property aliases cannot acquire a dynamic loader', `
const { ['Fun' + 'ction']: loader } = globalThis;
export async function init() { return loader('return import("undeclared-package")')()(); }
export function exit() {}
`);

generatedLoaderCase('ambient global fetch is not an approved Effect', `
export async function init() { await fetch('https://example.invalid/no-network'); }
export function exit() {}
`);
generatedLoaderCase('globalThis.fetch bypass is refused before Boot', `
export async function init() { return globalThis.fetch('https://example.invalid/no-network'); }
export function exit() {}
`);
generatedLoaderCase('ambient process.env access is refused before Boot', `
export async function init() { return process.env.DH_UNAPPROVED_EFFECT; }
export function exit() {}
`);

generatedLoaderCase('private named imports from a declared Extension are refused', `
import { notExported } from 'orders-ext';
export async function init() { return notExported(); }
export function exit() {}
`, 'DH_BUILD_EXPORT_MISSING');

generatedLoaderCase('private Extension Init cannot be returned through a wrapper', `
import { init as extensionInit } from 'orders-ext';
export async function init() { return { rawExtensionHandle: extensionInit }; }
export function exit() {}
`, 'DH_BUILD_EXPORT_MISSING');

generatedLoaderCase('namespace imports expose an unprovable raw Package handle', `
import * as ext from 'orders-ext';
export async function init() { return ext; }
export function exit() {}
`, 'DH_BUILD_EXPORT_MISSING');


test('R16 P1-SRC-01: BUILD refuses npm preinstall scripts on selected Packages before composition', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const businessDir = scenario.ws.packageRoots['orders-business']!;
  writeRaw(businessDir, 'package.json', new TextEncoder().encode(JSON.stringify({
    name: 'orders-business', version: '1.0.0', type: 'module',
    scripts: { preinstall: 'node -e "process.exit(99)"' },
  })));
  expectRefusal(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('R16 P1-SRC-01: BUILD refuses npm prepare scripts hidden in selected Packages', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  writeRaw(scenario.ws.packageRoots['orders-ext']!, 'package.json',
    new TextEncoder().encode(JSON.stringify({
      name: 'orders-ext', version: '1.0.0', type: 'module',
      scripts: { prepare: 'node -e "process.exit(99)"' },
    })));
  expectRefusal(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('R18 P1: selected Package cannot pull an unselected local package with postinstall at npm install time', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const localDir = scenario.ws.packageRoots['orders-business']!;
  // An unselected package script is data only: BUILD must reject before materialize/install.
  writeRaw(localDir, 'unselected/package.json', new TextEncoder().encode(JSON.stringify({
    name: 'unselected-probe', version: '1.0.0', type: 'module',
    scripts: { postinstall: 'node -e "process.exit(99)"' },
  })));
  writeRaw(localDir, 'package.json', new TextEncoder().encode(JSON.stringify({
    name: 'orders-business', version: '1.0.0', type: 'module',
    dependencies: { 'unselected-probe': 'file:./unselected' },
  })));
  expectRefusal(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('R18 P1: selected Package cannot resolve external optional, peer, bundled, or dev install dependencies', (t) => {
  for (const [field, value] of [
    ['optionalDependencies', { unselected: 'git+ssh://example.invalid/test.git' }],
    ['peerDependencies', { unselected: '^1.0.0' }],
    ['bundleDependencies', ['unselected']],
    ['devDependencies', { unselected: 'file:../unselected' }],
    ['overrides', { unselected: 'file:../unselected' }],
  ] as const) {
    const scenario = standardCase();
    t.after(scenario.ws.dispose);
    const { input } = scenario.finalize();
    writeRaw(scenario.ws.packageRoots['orders-ext']!, 'package.json', new TextEncoder().encode(JSON.stringify({
      name: 'orders-ext', version: '1.0.0', type: 'module', [field]: value,
    })));
    expectRefusal(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
  }
});

test('R55: composed App binds SDK as the only direct runtime product dependency', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const built = buildApp(input);
  assert.equal(built.ok, true, built.ok ? '' : built.message);
  if (!built.ok) return;
  const manifest = built.appPackage.files.find((entry) => entry.path === 'package.json');
  assert.ok(manifest);
  const app = JSON.parse(Buffer.from(manifest.bytes).toString('utf8')) as {
    dependencies: Record<string, string>;
  };
  assert.equal(app.dependencies['@kaicreator/domain-harness'], '0.11.0');
  assert.equal(app.dependencies['@kaicreator/domain-harness-microkernel'], undefined);
  assert.equal(app.dependencies['@kaicreator/domain-harness-contracts'], undefined);
});

test('R20 P1: selected root binding.gyp triggers implicit node-gyp and is rejected before npm install', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const businessDir = scenario.ws.packageRoots['orders-business']!;
  const binding = writeRaw(businessDir, 'binding.gyp',
    new TextEncoder().encode(JSON.stringify({
      targets: [{ target_name: 'unsafe_native_build', sources: ['unreviewed-native.cc'] }],
    })));
  const business = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-business') as
    import('@kaicreator/domain-harness-contracts').DomainPackageManifest;
  const packages = input.packages.map((pkg) => pkg === business
    ? { ...business, targetVariants: business.targetVariants.map((variant) => ({
        ...variant, implementations: variant.implementations.map((entry) =>
          entry.functionId === 'init'
            ? { ...entry, resources: [...(entry.resources ?? []), binding] }
            : entry),
      })) }
    : pkg);
  // No package.json scripts or dependencies. The file itself would cause implicit node-gyp.
  expectRefusal(buildApp({ ...input, packages }), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('R20 P1: even unselected root binding.gyp is rejected rather than available to npm packaging', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  writeRaw(scenario.ws.packageRoots['orders-ext']!, 'binding.gyp',
    new TextEncoder().encode('{"targets":[]}'));
  expectRefusal(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});
