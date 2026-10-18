/**
 * T00 (#1166) — v0.10 BUILD→activation composition smoke (positive,
 * negative, fault), Node 24 real ESM execution over the REAL selected
 * payload bytes. The activation seam trusts the BUILD output (A01: no
 * runtime digest/AST/dependency re-attestation — proven from the consumer
 * side below). The doc store is an in-process plain CAS store; physical
 * two-process SQLite, packed npm consumers and hidden validation belong to
 * K01/K02/T11/R01 and are NOT claimed here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  V10ActivationError,
  activateV10App,
  buildV10App,
  freshV10Counters,
} from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import {
  BUSINESS_PACKAGE_ID,
  CAPABILITY_PACKAGE_ID,
  INTENT,
  KERNEL_PACKAGE_ID,
  PlainCasDocStore,
  STANDARD_PACKAGE_ID,
  basicComposition,
  clearDisposalLog,
  clearEvalLog,
  disposalLog,
  evalLog,
  extensionEntry,
  richComposition,
} from './helpers-v010.js';

const BASE_MS = Date.UTC(2026, 9, 19, 9, 0, 0);
const TENANT = 'tenant:v010-t00';

function tickingClock(): { now: () => number } {
  let tick = 0;
  return { now: (): number => BASE_MS + (tick += 1) * 1000 };
}

function activationCode(error: unknown): string {
  assert.ok(error instanceof V10ActivationError, `expected V10ActivationError, got ${String(error)}`);
  return error.code;
}

test('P-ACT-BASIC-LIFECYCLE: sealed modules load/connect/execute/dispose; one admitted turn via the real kernel', async () => {
  clearEvalLog();
  const app = buildV10App(await basicComposition());
  const store = new PlainCasDocStore();
  const clock = tickingClock();
  const counters = freshV10Counters();
  const activation = await activateV10App(app, { store, tenantId: TENANT, now: clock.now, counters });

  assert.deepEqual(counters.importsByPackage, {
    [KERNEL_PACKAGE_ID]: 1,
    [STANDARD_PACKAGE_ID]: 1,
    [BUSINESS_PACKAGE_ID]: 1,
    [CAPABILITY_PACKAGE_ID]: 1,
  });
  assert.equal(counters.extensionImports, 0);
  assert.equal(counters.featureImports, 0);

  const first = await activation.facade.send({ ...INTENT });
  assert.equal(first.status, 'admitted', `first turn must be admitted (receipt ${JSON.stringify(first).slice(0, 200)})`);
  const second = await activation.facade.send({ ...INTENT, instanceKey: 'instance:t00-2', messageId: 'msg:t00-2' });
  assert.equal(second.status, 'admitted');

  assert.equal(counters.runtimeFactoryInvocations, 1);
  const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
  assert.equal(k.admissions, 2);
  assert.equal(k.journalBegins, 2);
  assert.equal(k.journalCompletes, 2);
  assert.equal(k.effectDispatches, 2);

  activation.dispose();
  assert.equal(activation.facade.isClosed(), true);
  assert.deepEqual(counters.disposals, [], 'Basic has no advisory modules to dispose');
  assert.deepEqual(evalLog(), []);
});

test('P-ACT-BASIC-SKIPS-ADVANCED: absent optional advisory modules are skipped, advanced bytes never evaluated', async () => {
  clearEvalLog();
  const optionalAbsent = await extensionEntry({ fixture: 'kext-eval-sentinel.mjs', hookExport: 'observeSentinel', optional: true, bytesOnly: true });
  const app = buildV10App(await basicComposition({ extensions: [optionalAbsent] }));
  assert.deepEqual(app.skippedOptional, [optionalAbsent.packageId]);

  const store = new PlainCasDocStore();
  const counters = freshV10Counters();
  const activation = await activateV10App(app, { store, tenantId: TENANT, now: tickingClock().now, counters });
  assert.equal(counters.importsByPackage[optionalAbsent.packageId ?? ''], undefined);
  assert.equal(counters.extensionImports, 0);
  assert.deepEqual(evalLog(), [], 'Basic activation never evaluates advanced module bytes');
  const receipt = await activation.facade.send({ ...INTENT });
  assert.equal(receipt.status, 'admitted');
  activation.dispose();
});

test('P-ACT-RICH-LIFECYCLE: 2 K advisories + 3 S features load/init/execute/dispose as physically distinct modules', async () => {
  clearEvalLog();
  clearDisposalLog();
  const app = buildV10App(await richComposition());
  const store = new PlainCasDocStore();
  const clock = tickingClock();
  const counters = freshV10Counters();
  const activation = await activateV10App(app, { store, tenantId: TENANT, now: clock.now, counters });

  assert.equal(counters.extensionImports, 2);
  assert.equal(counters.featureImports, 3);
  const advisoryOrder = app.loadOrder.filter((packageId) => {
    const module = app.modules.find((candidate) => candidate.packageId === packageId);
    return module?.role === 'kernel-extension' || module?.role === 'standard-feature';
  });
  assert.deepEqual(counters.initCalls, advisoryOrder, 'advisory init follows the sealed load order');

  assert.equal(activation.facade.selectedExtensions.length, 2);
  assert.equal(new Set(activation.facade.selectedExtensions.map((extension) => extension.providerId)).size, 2);
  assert.equal(new Set(activation.facade.selectedExtensions.map((extension) => extension.hook)).size, 2);
  assert.equal(activation.facade.selectedFeatures.length, 3);
  assert.equal(new Set(activation.facade.selectedFeatures.map((feature) => feature.featureKey)).size, 3);

  const receipt = await activation.facade.send({ ...INTENT });
  assert.equal(receipt.status, 'admitted');
  assert.equal(counters.runtimeFactoryInvocations, 1);

  activation.dispose();
  const disposable = new Set(['sfeature-validation@v010.1.0.0', 'sfeature-formatting@v010.1.0.0', 'kext-advisory-alpha@v010.1.0.0']);
  const expectedReverse = [...advisoryOrder].reverse().filter((packageId) => disposable.has(packageId));
  assert.deepEqual(disposalLog(), expectedReverse, 'dispose runs in reverse init order for modules exporting dispose');
});

test('P-ACT-ORDINARY-BUILTIN-IMPORT: a sealed node:crypto import really evaluates through the ordinary module system', async () => {
  clearEvalLog();
  const app = buildV10App(await richComposition());
  const activation = await activateV10App(app, { store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now });
  // sfeature-formatting evaluated only if its node:crypto import physically resolved
  assert.equal(activation.counters.importsByPackage['sfeature-formatting@v010.1.0.0'], 1);
  const receipt = await activation.facade.send({ ...INTENT });
  assert.equal(receipt.status, 'admitted');
  activation.dispose();
});

test('P-ACT-NO-RESTATTESTATION: a tampered sealed digest still activates — the SDK is not a second Package checker', async () => {
  clearEvalLog();
  const app = buildV10App(await basicComposition());
  const tampered = JSON.parse(JSON.stringify(app)) as typeof app;
  tampered.modules[0].moduleSha256 = '0'.repeat(64);
  const activation = await activateV10App(tampered, { store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now });
  const receipt = await activation.facade.send({ ...INTENT });
  assert.equal(receipt.status, 'admitted', 'A01: static trust facts are BUILD facts; activation does not re-attest bytes');
  activation.dispose();
});

test('N-ACT-REFUSE-BEFORE-IMPORT: wrong format / empty load order refuse typed with zero imports', async () => {
  clearEvalLog();
  const app = buildV10App(await basicComposition());

  const wrongFormat = JSON.parse(JSON.stringify(app)) as typeof app;
  wrongFormat.formatVersion = 'dh.v9.sealed-root/1';
  await assert.rejects(activateV10App(wrongFormat, { store: new PlainCasDocStore() }), (error: unknown) => activationCode(error) === 'V10_APP_INVALID');

  const emptyOrder = JSON.parse(JSON.stringify(app)) as typeof app;
  emptyOrder.loadOrder = [];
  await assert.rejects(activateV10App(emptyOrder, { store: new PlainCasDocStore() }), (error: unknown) => activationCode(error) === 'V10_APP_INVALID');

  await assert.rejects(activateV10App(null, { store: new PlainCasDocStore() }), (error: unknown) => activationCode(error) === 'V10_APP_INVALID');
  assert.deepEqual(evalLog(), [], 'typed refusal before the trust boundary evaluates nothing');
});

test('N-ACT-INIT-FAILURE-REVERSE-DISPOSAL: a late init throw disposes only initialized modules; K documents untouched', async () => {
  clearDisposalLog();
  const throwing = await extensionEntry({ fixture: 'kext-init-throws.mjs', hookExport: 'observeThrows' });
  const options = await richComposition();
  const builtApp = buildV10App({ ...options, appId: 'app:v010-t00-fault', modules: [...options.modules, throwing] });

  const store = new PlainCasDocStore();
  const counters = freshV10Counters();
  const documentsBefore = store.size();
  await assert.rejects(
    activateV10App(builtApp, { store, tenantId: TENANT, now: tickingClock().now, counters }),
    (error: unknown) => activationCode(error) === 'V10_EXTENSION_INIT_FAILED',
  );
  assert.equal(store.size(), documentsBefore, 'no K document was written by the failed activation');
  const failing = throwing.packageId as string;
  const initialized = counters.initCalls.filter((packageId) => packageId !== failing);
  const disposable = new Set(['sfeature-validation@v010.1.0.0', 'sfeature-formatting@v010.1.0.0', 'kext-advisory-alpha@v010.1.0.0']);
  assert.deepEqual(disposalLog(), [...initialized].reverse().filter((packageId) => disposable.has(packageId)));
  assert.equal(counters.portDenials, 0);
});

test('N-ACT-FORGED-INIT-RETURN: authority-shaped init data refuses typed with reverse disposal', async () => {
  clearDisposalLog();
  const forged = await extensionEntry({ fixture: 'kext-init-forged-return.mjs', hookExport: 'observeForged' });
  const options = await richComposition();
  const builtApp = buildV10App({ ...options, appId: 'app:v010-t00-forged', modules: [...options.modules, forged] });
  const counters = freshV10Counters();
  await assert.rejects(
    activateV10App(builtApp, { store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters }),
    (error: unknown) => activationCode(error) === 'V10_INIT_CONTRACT_REFUSED',
  );
  const initialized = counters.initCalls.filter((packageId) => packageId !== forged.packageId);
  const disposable = new Set(['sfeature-validation@v010.1.0.0', 'sfeature-formatting@v010.1.0.0', 'kext-advisory-alpha@v010.1.0.0']);
  assert.deepEqual(disposalLog(), [...initialized].reverse().filter((packageId) => disposable.has(packageId)));
});

test('N-ACT-PORT-PROBE-DENIED: probing a protected K port denies-and-records, activation fails closed', async () => {
  const prober = await extensionEntry({ fixture: 'kext-init-probes-ports.mjs', hookExport: 'observePorts' });
  const options = await richComposition();
  const builtApp = buildV10App({ ...options, appId: 'app:v010-t00-portprobe', modules: [...options.modules, prober] });
  const counters = freshV10Counters();
  await assert.rejects(
    activateV10App(builtApp, { store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters }),
    (error: unknown) => activationCode(error) === 'V10_EXTENSION_INIT_FAILED',
  );
  assert.equal(counters.portDenials, 1);
  assert.deepEqual(counters.portProbes, [{ packageId: prober.packageId, name: 'resources' }]);
});

test('N-ACT-EXPORT-MISSING: a sealed module missing its sealed surface refuses typed at connect', async () => {
  const missing = await extensionEntry({ fixture: 'kext-missing-export.mjs', hookExport: 'observeMissing' });
  const options = await richComposition();
  const builtApp = buildV10App({ ...options, appId: 'app:v010-t00-missing', modules: [...options.modules, missing] });
  const counters = freshV10Counters();
  await assert.rejects(
    activateV10App(builtApp, { store: new PlainCasDocStore(), tenantId: TENANT, now: tickingClock().now, counters }),
    (error: unknown) => activationCode(error) === 'V10_EXPORT_CONTRACT_REFUSED',
  );
  assert.deepEqual(counters.initCalls, [], 'connect refuses before any advisory init runs');
});
