/**
 * T00 (#1166) — v0.10 BUILD composition targeted tests (positive/negative/
 * sentinel), Node 24 real ESM toolchain. BUILD is the once-only static
 * owner of every composition fact (A01-PC05/PC08): every negative below is
 * a deterministic BUILD refusal, and the evaluation sentinel proves BUILD
 * never evaluates module source. Physical packed consumers/SQLite belong
 * to K01/K02/T11 and are NOT claimed here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { V10BuildError } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '../../tooling/build/dist/index.js';
import {
  basicComposition,
  clearEvalLog,
  evalLog,
  extensionEntry,
  featureEntry,
  richComposition,
} from '../assembly/helpers-v010.js';

function buildCode(options: Parameters<typeof buildV10App>[0]): string {
  try {
    buildV10App(options);
  } catch (error) {
    assert.ok(error instanceof V10BuildError, `expected V10BuildError, got ${String(error)}`);
    return error.code;
  }
  throw new Error('expected a typed BUILD refusal');
}

function buildOk(options: Parameters<typeof buildV10App>[0]): ReturnType<typeof buildV10App> {
  return buildV10App(options);
}

test('P-BUILD-BASIC: Tiny Basic composition over real K/S/B/C bytes builds as plain data', async () => {
  clearEvalLog();
  const app = buildOk(await basicComposition());
  assert.equal(app.formatVersion, 'dh.v10.build/1');
  assert.equal(app.targetProfile, 'node24-esm/1');
  assert.equal(new Set(app.modules.map((module) => module.role)).size, 4);
  assert.equal(app.modules.filter((module) => module.role === 'kernel-primary').length, 1);
  assert.equal(app.modules.filter((module) => module.role === 'standard-primary').length, 1);
  assert.equal(app.modules.filter((module) => module.role === 'kernel-extension').length, 0);
  assert.equal(app.modules.filter((module) => module.role === 'standard-feature').length, 0);
  assert.equal(app.loadOrder.length, 4);
  assert.equal(app.skippedOptional.length, 0);
  assert.match(app.subjectDigest, /^[0-9a-f]{64}$/);
  assert.equal('approval' in app, false, 'BUILD output mints no approval');
  assert.deepEqual(evalLog(), [], 'BUILD never evaluates module source');
});

test('P-BUILD-DETERMINISM: same input builds byte-identical output and digest', async () => {
  const options = await richComposition();
  const first = buildOk(options);
  const second = buildOk(JSON.parse(JSON.stringify(options)) as typeof options);
  assert.deepEqual(second, first);
  assert.equal(second.subjectDigest, first.subjectDigest);
});

test('P-BUILD-RICH: two physically distinct K advisories + three physically distinct S features seal', async () => {
  clearEvalLog();
  const app = buildOk(await richComposition());
  const extensions = app.modules.filter((module) => module.role === 'kernel-extension');
  const features = app.modules.filter((module) => module.role === 'standard-feature');
  assert.equal(extensions.length, 2);
  assert.equal(features.length, 3);
  assert.equal(new Set(extensions.map((extension) => extension.packageId)).size, 2);
  assert.equal(new Set(extensions.map((extension) => extension.moduleSha256)).size, 2);
  assert.equal(new Set(extensions.map((extension) => extension.providerId)).size, 2);
  assert.equal(new Set(features.map((feature) => feature.packageId)).size, 3);
  assert.equal(new Set(features.map((feature) => feature.moduleSha256)).size, 3);
  assert.equal(new Set(features.map((feature) => feature.provides[0])).size, 3);
  // load order is a permutation of the sealed roster and stays deterministic
  assert.deepEqual(app.loadOrder, buildOk(await richComposition()).loadOrder);
  assert.deepEqual(evalLog(), [], 'BUILD never evaluates module source (Rich included)');
});

test('P-BUILD-ORDINARY-IMPORTS-SEALED: declared node/npm/native imports seal; undeclared refuse', async () => {
  const cryptoFeature = await featureEntry({
    fixture: 'sfeature-formatting-v1.mjs',
    featureExport: 'canonicalDigest',
    externalImports: { node: ['node:crypto'] },
  });
  const npmFeature = await featureEntry({
    fixture: 'sfeature-npm-declared-v1.mjs',
    featureExport: 'parseDocument',
    externalImports: { npm: ['yaml'] },
  });
  const nativeFeature = await featureEntry({
    fixture: 'sfeature-native-declared-v1.mjs',
    featureExport: 'memoryValue',
    externalImports: { native: ['better-sqlite3'] },
  });
  const okApp = buildOk(await richComposition({ features: [cryptoFeature, npmFeature, nativeFeature] }));
  const sealedNpm = okApp.modules.find((module) => module.packageId === 'sfeature-npm-declared@v010.1.0.0');
  assert.deepEqual(sealedNpm?.externalImports.npm, ['yaml']);
  const sealedNative = okApp.modules.find((module) => module.packageId === 'sfeature-native-declared@v010.1.0.0');
  assert.deepEqual(sealedNative?.externalImports.native, ['better-sqlite3']);

  // Same ordinary imports WITHOUT the sealed allowance refuse at BUILD.
  const undeclaredCrypto = await featureEntry({
    fixture: 'sfeature-formatting-v1.mjs',
    featureExport: 'canonicalDigest',
    externalImports: { node: ['node:buffer'] },
  });
  assert.equal(buildCode(await richComposition({ features: [undeclaredCrypto] })), 'V10_IMPORT_POLICY_DENIED');
  const undeclaredNpm = await featureEntry({
    fixture: 'sfeature-npm-declared-v1.mjs',
    featureExport: 'parseDocument',
  });
  assert.equal(buildCode(await richComposition({ features: [undeclaredNpm] })), 'V10_IMPORT_POLICY_DENIED');
  // A declared-but-different specifier is equally an unsealed edge (allowances are edge-exact).
  const declaredElsewhere = await featureEntry({
    fixture: 'sfeature-npm-declared-v1.mjs',
    featureExport: 'parseDocument',
    externalImports: { npm: ['left-pad'] },
  });
  assert.equal(buildCode(await richComposition({ features: [declaredElsewhere] })), 'V10_IMPORT_POLICY_DENIED');
  const undeclaredNative = await featureEntry({
    fixture: 'sfeature-native-declared-v1.mjs',
    featureExport: 'memoryValue',
  });
  assert.equal(buildCode(await richComposition({ features: [undeclaredNative] })), 'V10_IMPORT_POLICY_DENIED');
});

test('P-BUILD-OPTIONAL-SKIP: an optional advisory module without bytes falls back to Basic', async () => {
  const optionalAbsent = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', optional: true, bytesOnly: true, hookExport: 'observeAlpha' });
  const app = buildOk(await basicComposition({ extensions: [optionalAbsent] }));
  assert.deepEqual(app.skippedOptional, [optionalAbsent.packageId]);
  assert.equal(app.loadOrder.includes(optionalAbsent.packageId), false);
});

test('N-BUILD duplicate/conflict cardinality refusals', async () => {
  clearEvalLog();
  const base = await basicComposition();
  const secondKernel = { ...base.modules[0], packageId: 'kernel-clone@1.0.0' };
  assert.equal(buildCode({ ...base, modules: [...base.modules, secondKernel] }), 'V10_ROLE_CARDINALITY');

  const base2 = await basicComposition();
  const secondStandard = { ...base2.modules[1], packageId: 'standard-clone@1.0.0' };
  assert.equal(buildCode({ ...base2, modules: [...base2.modules, secondStandard] }), 'V10_ROLE_CARDINALITY');

  const noBusiness = await basicComposition();
  assert.equal(buildCode({ ...noBusiness, modules: noBusiness.modules.filter((module) => module.role !== 'business') }), 'V10_ROLE_CARDINALITY');

  const alpha = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha' });
  const betaSameProvider = await extensionEntry({ fixture: 'kext-advisory-beta-v1.mjs', hookExport: 'observeBeta', providerId: alpha.providerId });
  assert.equal(buildCode(await basicComposition({ extensions: [alpha, betaSameProvider] })), 'V10_PROVIDER_COLLISION');

  const betaSameHook = await extensionEntry({ fixture: 'kext-advisory-beta-v1.mjs', hookExport: 'observeBeta', hook: alpha.provides[0] });
  assert.equal(buildCode(await basicComposition({ extensions: [alpha, betaSameHook] })), 'V10_PROVIDER_COLLISION');

  const validation = await featureEntry({ fixture: 'sfeature-validation-v1.mjs', featureExport: 'validate' });
  const aggregationSameKey = await featureEntry({ fixture: 'sfeature-aggregation-v1.mjs', featureExport: 'sum', featureKey: validation.provides[0] });
  assert.equal(buildCode(await basicComposition({ features: [validation, aggregationSameKey] })), 'V10_FEATURE_COLLISION');

  const businessClone = { ...base.modules[2], packageId: 'business-clone@v08.1.0.0' };
  assert.equal(buildCode({ ...base, modules: [...base.modules, businessClone] }), 'V10_INTENT_CONFLICT');
  assert.deepEqual(evalLog(), [], 'no refusal path evaluated module source');
});

test('N-BUILD dependency/feature closure refusals', async () => {
  clearEvalLog();
  const ghostDep = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha', dependencies: ['ghost-package@1.0.0'] });
  assert.equal(buildCode(await basicComposition({ extensions: [ghostDep] })), 'V10_DEPENDENCY_MISSING');

  const alpha = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha', dependencies: ['kext-advisory-beta@v010.1.0.0'] });
  const beta = await extensionEntry({ fixture: 'kext-advisory-beta-v1.mjs', hookExport: 'observeBeta', dependencies: ['kext-advisory-alpha@v010.1.0.0'] });
  assert.equal(buildCode(await basicComposition({ extensions: [alpha, beta] })), 'V10_DEPENDENCY_CYCLE');

  const hiddenMandatory = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha', requires: ['standard:nonexistent/1'] });
  assert.equal(buildCode(await basicComposition({ extensions: [hiddenMandatory] })), 'V10_FEATURE_MISSING');
  assert.deepEqual(evalLog(), []);
});

test('N-BUILD ABI/target profile/digest refusals', async () => {
  clearEvalLog();
  const wrongAbi = await basicComposition();
  wrongAbi.modules[0] = { ...wrongAbi.modules[0], abiVersion: 'v08-business-abi/1' } as typeof wrongAbi.modules[0];
  assert.equal(buildCode(wrongAbi), 'V10_ABI_UNSUPPORTED');

  const wrongKextAbi = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha', abiVersion: 'dh.v10.standard-feature/1' });
  assert.equal(buildCode(await basicComposition({ extensions: [wrongKextAbi] })), 'V10_ABI_UNSUPPORTED');

  const wrongTarget = await basicComposition();
  assert.equal(buildCode({ ...wrongTarget, targetProfile: 'node20-esm/1' }), 'V10_TARGET_UNSUPPORTED');

  const tampered = await basicComposition();
  tampered.modules[0] = { ...tampered.modules[0], moduleSha256: '0'.repeat(64) } as typeof tampered.modules[0];
  assert.equal(buildCode(tampered), 'V10_DIGEST_MISMATCH');
  assert.deepEqual(evalLog(), []);
});

test('N-BUILD import-closure refusals (undeclared/computed/code-string/edges)', async () => {
  clearEvalLog();
  const synthetic = async (source: string, externalImports?: { node?: readonly string[]; npm?: readonly string[]; native?: readonly string[] }) =>
    extensionEntry({
      fixture: 'kext-advisory-alpha-v1.mjs',
      hookExport: 'observeAlpha',
      moduleSourceOverride: source,
      shaOverride: undefined,
      externalImports,
    });

  const base = 'export const MODULE_ID = \'synthetic@1\';\nexport const PACKAGE_KIND = \'kernel-extension\';\nexport const EXTENSION_ABI = \'dh.v10.k-extension/1\';\nexport const PROVIDER_ID = \'synthetic\';\nexport const HOOK = \'synthetic-hook/v1\';\nexport function init() { return { ok: true, providerId: PROVIDER_ID, hook: HOOK }; }\nexport function observeFixture() { return {}; }\n';

  const undeclaredNode = await synthetic(`${base}\nimport { readFileSync } from 'node:fs';\nexport const fs = readFileSync;\n`);
  assert.equal(buildCode(await basicComposition({ extensions: [undeclaredNode] })), 'V10_IMPORT_POLICY_DENIED');

  const declaredButDifferent = await synthetic(`${base}\nimport { createHash } from 'node:crypto';\nexport const h = createHash;\n`, { node: ['node:fs'] });
  assert.equal(buildCode(await basicComposition({ extensions: [declaredButDifferent] })), 'V10_IMPORT_POLICY_DENIED');

  const computedDynamic = await synthetic(`${base}\nexport const dyn = (specifier) => import(specifier);\n`, { node: ['node:crypto'] });
  assert.equal(buildCode(await basicComposition({ extensions: [computedDynamic] })), 'V10_IMPORT_POLICY_DENIED');

  const declaredDynamic = await synthetic(`${base}\nexport const dyn = () => import('node:crypto');\n`, { node: ['node:crypto'] });
  buildV10App(await basicComposition({ extensions: [declaredDynamic] })); // a DECLARED literal dynamic import seals

  const requireCall = await synthetic(`${base}\nexport const req = (module) => require(module);\n`);
  assert.equal(buildCode(await basicComposition({ extensions: [requireCall] })), 'V10_IMPORT_POLICY_DENIED');

  const evalCall = await synthetic(`${base}\nexport const ev = (code) => eval(code);\n`);
  assert.equal(buildCode(await basicComposition({ extensions: [evalCall] })), 'V10_IMPORT_POLICY_DENIED');

  const relativeEdge = await synthetic(`${base}\nimport { helper } from './helper.mjs';\nexport const h = helper;\n`);
  assert.equal(buildCode(await basicComposition({ extensions: [relativeEdge] })), 'V10_IMPORT_POLICY_DENIED');

  const crossPackage = await synthetic(`${base}\nimport { createOccurrenceRuntime } from 'v08-kernel-mechanism@1.0.0';\nexport const k = createOccurrenceRuntime;\n`);
  assert.equal(buildCode(await basicComposition({ extensions: [crossPackage] })), 'V10_IMPORT_POLICY_DENIED');
  assert.deepEqual(evalLog(), []);
});


test('N-I1221: reject statically visible indirect code-string evaluators and bare Node builtins', async () => {
  // The gate is bounded AST hygiene, not a sandbox or dynamic JS proof.
  // The gate module and its error class load through the SAME dynamic-import
  // graph: under tsx a static import of the barrel and a dynamic import of
  // the gate module produce separate module instances, so an instanceof
  // against the statically imported V10BuildError would be false even for
  // a genuine gate refusal.
  const { assertSealedImportClosure } = await import(
    '../../tooling/build/src/import-policy.js'
  );
  const { V10BuildError: V10BuildErrorFromGateModule } = await import(
    '@kaicreator/domain-harness-contracts'
  );
  const empty = { node: [], npm: [], native: [] };
  const rejected = [
    "globalThis.eval('1');",
    "(0, eval)('1');",
    "const F = Function; F('return 1')();",
    "globalThis.Function('return 1')();",
    "(function(){}).constructor('return 1')();",
    "const make = globalThis['Function'];",
    "const { eval: run } = globalThis;",
    "import fs from 'fs'; export const name = fs;",
    "import fs from 'fs/promises'; export const name = fs;",
  ];
  for (const source of rejected) {
    assert.throws(
      () => assertSealedImportClosure('probe', source, { ...empty, npm: ['fs', 'fs/promises'] }, new Set()),
      (error: unknown) => error instanceof V10BuildErrorFromGateModule && error.code === 'V10_IMPORT_POLICY_DENIED',
      `expected BUILD policy refusal for ${source}`,
    );
  }
  assert.doesNotThrow(() => assertSealedImportClosure(
    'probe', "import { readFileSync } from 'node:fs'; export const read = readFileSync;",
    { ...empty, node: ['node:fs'] }, new Set(),
  ));
  // Ordinary `require`-named members (the vendored kernel's instance-registry
  // method) must stay sealable: only the bare CommonJS identifier is refused.
  assert.doesNotThrow(() => assertSealedImportClosure(
    'probe',
    'class Registry { async require(address) { return address; } }\n'
    + 'const registry = { require(address) { return address; } };\n'
    + 'export const probe = (self, instances) => [self.require("a"), instances.require("b"), registry.require("c")];',
    { ...empty }, new Set(),
  ));
});


test('N-BUILD authority forgery refusals (kernel namespace / handler squatting)', async () => {
  clearEvalLog();
  const forgedHook = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha', hook: 'kernel:occurrence-runtime/1' });
  assert.equal(buildCode(await basicComposition({ extensions: [forgedHook] })), 'V10_AUTHORITY_FORGERY');

  const admissionHook = await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha', hook: 'admission:gate/v1' });
  assert.equal(buildCode(await basicComposition({ extensions: [admissionHook] })), 'V10_AUTHORITY_FORGERY');

  const base = await basicComposition();
  const businessWithHandlers = { ...base.modules[2], handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }] } as typeof base.modules[0];
  assert.equal(buildCode({ ...base, modules: [base.modules[0], base.modules[1], businessWithHandlers, base.modules[3]] }), 'V10_AUTHORITY_FORGERY');

  const featureProvidingKernelKey = await featureEntry({ fixture: 'sfeature-validation-v1.mjs', featureExport: 'validate', featureKey: 'kernel:effect-journal/1' });
  assert.equal(buildCode(await basicComposition({ features: [featureProvidingKernelKey] })), 'V10_AUTHORITY_FORGERY');
  assert.deepEqual(evalLog(), []);
});

test('N-BUILD route admission refusals', async () => {
  clearEvalLog();
  const unsealedIntent = await basicComposition({ routes: [{ intentId: 'unsealedIntent', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' }] });
  assert.equal(buildCode(unsealedIntent), 'V10_ROUTE_INVALID');

  const wrongHandler = await basicComposition({ routes: [{ intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'previewTotal' }] });
  assert.equal(buildCode(wrongHandler), 'V10_ROUTE_INVALID');

  const duplicateRoute = await basicComposition({
    routes: [
      { intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
      { intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
    ],
  });
  assert.equal(buildCode(duplicateRoute), 'V10_ROUTE_INVALID');
  assert.deepEqual(evalLog(), []);
});

test('N-BUILD strict shape refusals (unknown fields / hostile data / duplicates)', async () => {
  clearEvalLog();
  const withUnknown = await basicComposition();
  withUnknown.modules[0] = { ...withUnknown.modules[0], extraField: 'no' } as typeof withUnknown.modules[0];
  assert.equal(buildCode(withUnknown), 'BUILD_GRAPH_INVALID');

  const hostile: unknown = new Proxy({}, {
    get(): unknown {
      throw new Error('accessor trap');
    },
  });
  assert.equal(buildCode(hostile as Parameters<typeof buildV10App>[0]), 'BUILD_INPUT_INVALID');

  const duplicateId = await basicComposition();
  duplicateId.modules[1] = { ...duplicateId.modules[1], packageId: duplicateId.modules[0].packageId } as typeof duplicateId.modules[0];
  assert.equal(buildCode(duplicateId), 'BUILD_GRAPH_INVALID');
  assert.deepEqual(evalLog(), []);
});

test('S-BUILD-ZERO-EVAL: an evaluation-sentinel module in the composition keeps the log empty through BUILD', async () => {
  clearEvalLog();
  const sentinel = await extensionEntry({ fixture: 'kext-eval-sentinel.mjs', hookExport: 'observeSentinel' });
  const app = buildOk(await basicComposition({ extensions: [sentinel] }));
  assert.equal(app.modules.some((module) => module.packageId === sentinel.packageId), true);
  assert.deepEqual(evalLog(), [], 'BUILD sealed the sentinel bytes without evaluating them');
});
