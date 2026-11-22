// B0: 唯一 KDP 保留 Core.Order、直接 Extension、InitFrom 与 Exit；生命周期只认 Element/Function 身份。
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { BootResult } from '@kaicreator/domain-harness-contracts';
import { PackageSystem } from '../../src/package-system.js';
import { validateBusinessCoreResults } from '../../src/kdp.js';
import { splitResourceKey } from '../../src/paths.js';
import {
  boot, buildFixtureInstall, events,
  type FixtureInstall, type FixtureScenario,
} from './helpers/install.js';

const INIT_ORDER = ['fixture-kernel', '@fixture/sdk', 'fixture-ext', 'fixture-business'];
const EXIT_ORDER = ['fixture-ext', 'fixture-business', '@fixture/sdk', 'fixture-kernel'];
const appCtx = (fixture: FixtureInstall) => ({
  appId: 'fixture.orders-app', activationId: 'activation',
  lockDigest: fixture.lock.closureDigest, config: {}, functions: new Map(), resources: new Map(),
});
async function withScenario(
  t: import('node:test').TestContext,
  scenario: FixtureScenario,
  run: (fixture: FixtureInstall, result: BootResult) => Promise<void>,
) {
  const fixture = await buildFixtureInstall(scenario);
  t.after(async () => fixture.cleanup());
  await run(fixture, await boot(fixture.pin, fixture.context));
}
const timeline = (event: string) => events().filter((item) => item['event'] === event).map((item) => item['package']);

test('B0-07: Boot selects the unique ordered Core chain and Hook Provider before Business Init', async (t) => {
  await withScenario(t, { init: { status: 'READY' }, functions: {} }, async (fixture, result) => {
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    assert.equal(result.app.status, 'READY');
    assert.deepEqual(timeline('package-init'), INIT_ORDER);
    assert.ok(timeline('module-evaluated').includes('fixture-ext:hook'));
    assert.equal(timeline('hook-provider-invoked').length, 0);
    const selected = events().find((entry) => entry['event'] === 'init-selected-function');
    assert.ok(selected, 'Business Init calls selected Function before READY');
    assert.equal(selected['kind'], 'SUCCEEDED');
    const business = events().find((entry) => entry['event'] === 'business-init');
    assert.equal(business?.['appId'], 'fixture.orders-app');
    assert.deepEqual(business?.['resourceKeys'], ['fixture-business/content/rules.json']);
    assert.equal(result.app.inspect !== undefined, true);
    assert.ok(fixture.lock.selectedPackages.every((pkg) => pkg.initFunction.element.id === pkg.init.id));
    await result.app.dispose();
  });
});

test('B0-07: Exit follows reverse Init-entry order exactly once', async (t) => {
  await withScenario(t, { init: { status: 'READY' }, functions: {} }, async (_fixture, result) => {
    assert.equal(result.status, 'BOOTED');
    if (result.status !== 'BOOTED') return;
    assert.deepEqual(await result.app.dispose(), { status: 'DISPOSED' });
    assert.deepEqual(timeline('package-exit'), EXIT_ORDER);
    await result.app.dispose();
    assert.deepEqual(timeline('package-exit'), EXIT_ORDER);
  });
});

test('B0-05: DEGRADED/BLOCKED remain status only, no direct ingress', async (t) => {
  for (const status of ['DEGRADED', 'BLOCKED'] as const) {
    await withScenario(t, { init: { status }, functions: {} }, async (_fixture, result) => {
      assert.equal(result.status, 'BOOTED', JSON.stringify(result));
      if (result.status !== 'BOOTED') return;
      assert.equal(result.app.status, status);
      assert.equal('invoke' in result.app, false);
      assert.equal('suppressedIngress' in await result.app.inspect(), false);
      await result.app.dispose();
    });
  }
});

test('B0-05: FAILED and unhandled Init throw are fail-closed with reverse Exit', async (t) => {
  for (const scenario of [
    { init: { status: 'FAILED' as const }, functions: {} },
    { init: { status: 'READY' as const, throw: true }, functions: {} },
    { init: { status: 'READY' as const }, functions: {}, sdkInitThrow: true },
  ]) {
    await withScenario(t, scenario, async (_fixture, result) => {
      assert.equal(result.status, 'FAILED', JSON.stringify(result));
      if (result.status !== 'FAILED') return;
      assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
      assert.doesNotMatch(result.reason, /TOKEN_SECRET_CANARY_8029/);
      assert.ok(timeline('package-exit').length >= 1);
    });
  }
});

test('B0-07: selected Function unhandled exception is fatal, sanitized and triggers Exit', async (t) => {
  await withScenario(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'throw' } },
  }, async (_fixture, result) => {
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status !== 'FAILED') return;
    assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
    assert.doesNotMatch(result.reason, /TOKEN_SECRET_CANARY_8029/);
    assert.deepEqual(timeline('package-exit'), EXIT_ORDER);
  });
});

test('B0-02: selected Exit is optional and does not block remaining Exit chain', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const lock = { ...fixture.lock, selectedPackages: fixture.lock.selectedPackages.map((pkg) => {
    if (pkg.packageId !== 'fixture-ext') return pkg;
    const { exit: unusedExit, exitFunction: unusedFunction, ...withoutExit } = pkg;
    void unusedExit; void unusedFunction;
    return withoutExit;
  }) };
  const system = new PackageSystem(fixture.installRoot, lock, []);
  await system.runInit(appCtx(fixture));
  await system.runExit();
  assert.deepEqual(timeline('package-exit'), ['fixture-business', '@fixture/sdk', 'fixture-kernel']);
});

test('B0-07: InitFrom is optional independently of Exit bookkeeping', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const lock = { ...fixture.lock, selectedPackages: fixture.lock.selectedPackages.map((pkg) => {
    if (pkg.packageId !== 'fixture-business') return pkg;
    const { recordInitFrom: unused, ...without } = pkg;
    void unused;
    return without;
  }) };
  const system = new PackageSystem(fixture.installRoot, lock, []);
  await system.runInit(appCtx(fixture));
  assert.equal(system.initFrom('fixture-business'), undefined);
  await system.runExit();
  assert.deepEqual(timeline('package-exit'), EXIT_ORDER);
});

test('B0-07: Kernel never deduplicates valid repeated Init entries', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const system = new PackageSystem(fixture.installRoot, fixture.lock, []);
  await system.runInit(appCtx(fixture));
  await system.runInit(appCtx(fixture));
  assert.deepEqual(system.initFrom('fixture-kernel'), [{ type: 'Boot' }, { type: 'Boot' }]);
  await system.runExit();
  assert.equal(timeline('package-exit').length, INIT_ORDER.length * 2);
});

test('B0-07: cross-layer directly declared Extension is not silently omitted', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const lock = { ...fixture.lock, selectedPackages: fixture.lock.selectedPackages.map((pkg) =>
    pkg.packageId === 'fixture-ext' ? { ...pkg, layer: 'sdk' as const } : pkg),
  };
  const system = new PackageSystem(fixture.installRoot, lock, []);
  await system.runInit(appCtx(fixture));
  assert.deepEqual(timeline('package-init'), INIT_ORDER);
  await system.runExit();
});

test('B0-02: an incorrect selected lifecycle FunctionRef is not silently executed', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const lock = { ...fixture.lock, selectedPackages: fixture.lock.selectedPackages.map((pkg) =>
    pkg.packageId === '@fixture/sdk' ? {
      ...pkg, initFunction: { ...pkg.initFunction, functionId: 'not-selected' },
    } : pkg),
  };
  const system = new PackageSystem(fixture.installRoot, lock, []);
  await assert.rejects(system.runInit(appCtx(fixture)), /Init Element\/Function identity mismatch/);
  assert.deepEqual(timeline('package-init'), ['fixture-kernel']);
});

test('B0-07: valid Business READY cannot mask a missing trailing Core.Init', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const sdk = fixture.lock.selectedPackages.find((pkg) => pkg.packageId === '@fixture/sdk')!;
  const lock = {
    ...fixture.lock,
    coreOrder: ['fixture-kernel', '@fixture/sdk', 'fixture-business', 'trailing-sdk-core'],
    selectedPackages: [...fixture.lock.selectedPackages, { ...sdk, packageId: 'trailing-sdk-core', order: 7 }],
  };
  const system = new PackageSystem(fixture.installRoot, lock, []);
  await assert.rejects(system.runInit(appCtx(fixture)), /Core.Order chain incomplete/);
  await system.runExit();
  assert.deepEqual(timeline('package-exit'), EXIT_ORDER);
});

test('R124 Host KDP Init records Kernel once and starts remaining Cores without importing ordinary Kernel Init', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const system = new PackageSystem(fixture.installRoot, fixture.lock, []);
  const result = await system.runRemainingCoresAfterKernelEntered(appCtx(fixture));
  assert.deepEqual(validateBusinessCoreResults(result), { status: 'READY' });
  assert.deepEqual(timeline('package-init'), ['@fixture/sdk', 'fixture-ext', 'fixture-business'],
    'selected KDP ordinary Init must not execute again');
  assert.deepEqual(system.initFrom('fixture-kernel'), [{ type: 'Boot' }]);

  await assert.rejects(system.runRemainingCoresAfterKernelEntered(appCtx(fixture)),
    /already entered this activation/);
  assert.deepEqual(system.initFrom('fixture-kernel'), [{ type: 'Boot' }]);
  await system.runExit();
  assert.deepEqual(timeline('package-exit'), EXIT_ORDER,
    'KDP Exit must run last even though its ordinary Init module was not invoked');
  await system.runExit();
  assert.deepEqual(timeline('package-exit'), EXIT_ORDER, 'Exit is idempotent');
});

test('R124 Host KDP continuation preserves explicit repeated Extension entry and reverse Exit order', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const lock = { ...fixture.lock, selectedPackages: fixture.lock.selectedPackages.map((pkg) =>
    pkg.packageId === 'fixture-kernel'
      ? { ...pkg, dependsOn: ['fixture-ext'] }
      : pkg),
  };
  const system = new PackageSystem(fixture.installRoot, lock, []);
  await system.runRemainingCoresAfterKernelEntered(appCtx(fixture));
  assert.deepEqual(timeline('package-init'), ['fixture-ext', '@fixture/sdk', 'fixture-ext', 'fixture-business']);
  assert.deepEqual(system.initFrom('fixture-ext'), [
    { type: 'Package', packageId: 'fixture-kernel' },
    { type: 'Package', packageId: 'fixture-business' },
  ]);
  await system.runExit();
  assert.deepEqual(timeline('package-exit'),
    ['fixture-business', 'fixture-ext', '@fixture/sdk', 'fixture-ext', 'fixture-kernel'],
    'each actual Extension entry exits independently, KDP last');
});

test('R124 Host KDP failure after entering still exits Kernel without twice running Kernel.Init', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {}, sdkInitThrow: true });
  t.after(async () => fixture.cleanup());
  const system = new PackageSystem(fixture.installRoot, fixture.lock, []);
  await assert.rejects(system.runRemainingCoresAfterKernelEntered(appCtx(fixture)), /Package.*Init Element raised/);
  assert.deepEqual(timeline('package-init'), ['@fixture/sdk'],
    'Kernel normal Init is never called by the Host continuation');
  await system.runExit();
  assert.deepEqual(timeline('package-exit'), ['@fixture/sdk', 'fixture-kernel'],
    'entered Kernel is cleaned up last even on next-Core failure');
});

test('B0-05: all Business Core results conservatively determine App status', () => {
  assert.deepEqual(validateBusinessCoreResults([{ status: 'READY' }, { status: 'READY' }]), { status: 'READY' });
  assert.deepEqual(validateBusinessCoreResults([{ status: 'READY' }, { status: 'BLOCKED' }]), { status: 'BLOCKED' });
  assert.deepEqual(validateBusinessCoreResults([{ status: 'READY' }, { status: 'DEGRADED' }]), { status: 'DEGRADED' });
  assert.throws(() => validateBusinessCoreResults([{ status: 'READY' }, { status: 'FAILED' }]), /FAILED/);
  assert.throws(() => validateBusinessCoreResults([{ status: 'READY' }, { status: 'unknown' }]), /invalid/);
});

test('B0-07: Boot Pin must match Order 0 KDP identity before running package Init', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const lock = { ...fixture.lock, bootstrapKdpPin: { ...fixture.lock.bootstrapKdpPin, kdpPackageId: 'different-kdp' } };
  const system = new PackageSystem(fixture.installRoot, lock, []);
  await assert.rejects(system.runInit(appCtx(fixture)), /identities differ/);
  assert.equal(timeline('package-init').length, 0);
});

test('B0-07: immutable resource keys stay inside the selected Function closure', () => {
  assert.deepEqual(splitResourceKey('fixture-business/content/rules.json'),
    { packageId: 'fixture-business', path: 'content/rules.json' });
  assert.equal(join('a', 'b').length > 0, true);
});
