// 当前架构的可证伪测试：断言实际行为而非历史兼容。
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { BootResult } from '@kaicreator/domain-harness-contracts';
import { splitResourceKey } from '../../src/paths.js';
import {
  boot,
  buildFixtureInstall,
  events,
  type FixtureInstall,
  type FixtureScenario,
} from './helpers/install.js';

async function withScenario(
  t: import('node:test').TestContext,
  scenario: FixtureScenario,
  run: (fixture: FixtureInstall, result: BootResult) => Promise<void>,
): Promise<void> {
  const fixture = await buildFixtureInstall(scenario);
  t.after(async () => {
    await fixture.cleanup();
  });
  const result = await boot(fixture.pin, fixture.context);
  await run(fixture, result);
}

function packageContext(fixture: FixtureInstall) {
  return {
    appId: 'fixture.orders-app',
    activationId: 'fixture-activation',
    lockDigest: fixture.lock.closureDigest,
    config: {},
    functions: new Map(),
    resources: new Map(),
  };
}

const INIT_ORDER = ['fixture-kernel', '@fixture/sdk', 'fixture-ext', 'fixture-business'];
const DISPOSE_ORDER = ['fixture-ext', 'fixture-business', '@fixture/sdk', 'fixture-kernel'];

test('KDP boots core + package system: init order, hook sealing, business init, READY', async (t) => {
  await withScenario(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  }, async (_fixture, result) => {
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    assert.equal(result.app.status, 'READY');

    const evaluated = events()
      .filter((event) => event['event'] === 'module-evaluated')
      .map((event) => event['package']);
    const inits = events()
      .filter((event) => event['event'] === 'package-init')
      .map((event) => event['package']);
    assert.deepEqual(new Set(evaluated), new Set([...INIT_ORDER, 'fixture-ext:hook']));
    assert.deepEqual(inits, INIT_ORDER);

    const hookEvalIndex = events().findIndex(
      (event) => event['event'] === 'module-evaluated' && event['package'] === 'fixture-ext:hook',
    );
    const businessInitIndex = events().findIndex((event) => event['event'] === 'business-init');
    assert.ok(hookEvalIndex >= 0, 'hook provider module must be loaded by sealHooks');
    assert.ok(businessInitIndex > hookEvalIndex, 'hooks sealed before Business Core.Init runs');
    assert.equal(events().some((event) => event['event'] === 'hook-provider-invoked'), false);

    const businessInit = events().find((event) => event['event'] === 'business-init');
    assert.ok(businessInit !== undefined);
    assert.equal(businessInit['appId'], 'fixture.orders-app');
    assert.equal(businessInit['hasActivationId'], true);
    assert.equal(typeof businessInit['lockDigest'], 'string');
    assert.deepEqual(businessInit['config'], { region: 'EU', featureFlag: true });
    assert.deepEqual(businessInit['ingress'], ['evaluate', 'optional-report']);
    assert.deepEqual(businessInit['resourceKeys'], [
      'fixture-business/content/rules.json',
    ], 'App Init 只能获得选定 Function 声明的资源，不得读取任何可执行产物');
    assert.deepEqual(
      events().filter((event) => event['event'] === 'business-init'),
      [businessInit],
      'exactly one Business Core.Init executed',
    );
  });
});

test('dispose runs Exit in the strict reverse Init entry order', async (t) => {
  await withScenario(t, {
    init: { status: 'READY' },
    functions: {},
  }, async (_fixture, result) => {
    assert.equal(result.status, 'BOOTED');
    if (result.status !== 'BOOTED') return;
    await result.app.dispose();
    const disposes = events()
      .filter((event) => event['event'] === 'package-exit')
      .map((event) => event['package']);
    assert.deepEqual(disposes, DISPOSE_ORDER);
    const count = events().length;
    await result.app.dispose();
    assert.equal(events().length, count);
  });
});

test('DEGRADED: only predeclared optional ingress is suppressed; required suppression is refused', async (t) => {
  await withScenario(t, {
    init: { status: 'DEGRADED', suppressed: ['optional-report'] },
    functions: {
      evaluate: { behavior: 'succeed', value: { decision: 'POS' } },
      optionalReport: { behavior: 'succeed', value: 'report-ok' },
    },
  }, async (_fixture, result) => {
    assert.equal(result.status, 'BOOTED');
    if (result.status !== 'BOOTED') return;
    assert.equal(result.app.status, 'DEGRADED');

    const ok = await result.app.invoke('evaluate', { total: 100, region: 'EU' });
    assert.equal(ok.kind, 'SUCCEEDED');

    const suppressed = await result.app.invoke('optional-report', {});
    assert.equal(suppressed.kind, 'FAILED');
    assert.equal(suppressed.kind === 'FAILED' && suppressed.failure.code, 'DH_RUNTIME_INGRESS_NOT_CALLABLE');

    const inspection = await result.app.inspect();
    assert.deepEqual(inspection.suppressedIngress, ['optional-report']);
    await result.app.dispose();
  });

  await withScenario(t, {
    init: { status: 'DEGRADED', suppressed: ['evaluate'] },
    functions: {},
  }, async (_fixture, result) => {
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status === 'FAILED') {
      assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
    }
  });

  for (const init of [
    { status: 'DEGRADED' as const },
    { status: 'DEGRADED' as const, suppressed: [] as string[] },
  ]) {
    await withScenario(t, { init, functions: {} }, async (_fixture, result) => {
      assert.equal(result.status, 'FAILED', JSON.stringify(result));
      if (result.status === 'FAILED') {
        assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
        assert.match(result.reason, /masquerade/);
      }
    });
  }
});

test('BLOCKED: app handle boots with BLOCKED status and no ingress is callable', async (t) => {
  await withScenario(t, {
    init: { status: 'BLOCKED' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  }, async (_fixture, result) => {
    assert.equal(result.status, 'BOOTED');
    if (result.status !== 'BOOTED') return;
    assert.equal(result.app.status, 'BLOCKED');
    const outcome = await result.app.invoke('evaluate', { total: 1, region: 'EU' });
    assert.equal(outcome.kind, 'FAILED');
    assert.equal(outcome.kind === 'FAILED' && outcome.failure.code, 'DH_RUNTIME_INGRESS_NOT_CALLABLE');
    const inspection = await result.app.inspect();
    assert.deepEqual(inspection.suppressedIngress, []);
    await result.app.dispose();
  });
});

test('business init FAILED / throwing / malformed result: ordinary FAILED, zero ingress, no recovery', async (t) => {
  for (const scenario of [
    { init: { status: 'FAILED' as const }, functions: {} },
    { init: { status: 'READY' as const, throw: true }, functions: {} },
  ]) {
    await withScenario(t, scenario, async (_fixture, result) => {
      assert.equal(result.status, 'FAILED', JSON.stringify(result));
      if (result.status === 'FAILED') {
        assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
        assert.ok(result.reason.length > 0);
      }
    });
  }

  await withScenario(t, {
    init: { status: 'READY', suppressed: ['optional-report'] },
    functions: {},
  }, async (_fixture, result) => {
    assert.equal(result.status, 'FAILED');
    if (result.status === 'FAILED') assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
  });
});

test('package physical load failure: DH_KDP_PACKAGE_LOAD_FAILED, zero ingress, no retry', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => {
    await fixture.cleanup();
  });
  await rm(join(fixture.installRoot, 'node_modules', '@fixture/sdk', 'dist'), { recursive: true, force: true });
  const result = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'FAILED', JSON.stringify(result));
  if (result.status === 'FAILED') {
    assert.equal(result.code, 'DH_KDP_PACKAGE_LOAD_FAILED');
  }
  assert.equal(
    events().some((event) => event['event'] === 'business-init'),
    false,
    'zero ingress and no business init on physical load failure',
  );
});

test('resource key convention: rightmost-slash split handles scoped package ids end to end', async (t) => {
  assert.deepEqual(splitResourceKey('@fixture/sdk/dist/index.mjs'), {
    packageId: '@fixture/sdk',
    path: 'dist/index.mjs',
  });
  assert.deepEqual(splitResourceKey('orders-business/content/rules.json'), {
    packageId: 'orders-business',
    path: 'content/rules.json',
  });
  assert.deepEqual(splitResourceKey('fixture-business/elements/orders.eligibility.json'), {
    packageId: 'fixture-business',
    path: 'elements/orders.eligibility.json',
  });
  assert.equal(splitResourceKey('noslash'), null);
  assert.equal(splitResourceKey('/onlypath'), null);
  assert.equal(splitResourceKey('../evil/x.json'), null, 'traversal package ids are refused');

  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => {
    await fixture.cleanup();
  });
  const result = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'BOOTED', JSON.stringify(result));
  if (result.status !== 'BOOTED') return;
  const scopedKeySeen = events().some(
    (event) =>
      event['event'] === 'business-init' &&
      Array.isArray(event['resourceKeys']) &&
      (event['resourceKeys'] as string[]).includes('fixture-business/content/rules.json') &&
      !(event['resourceKeys'] as string[]).includes('@fixture/sdk/dist/index.mjs'),
  );
  assert.ok(scopedKeySeen, 'only declared scoped resource reaches App Init, not other package artifacts');
  const outcome = await result.app.invoke('evaluate', { total: 10, region: 'EU' });
  assert.equal(outcome.kind, 'SUCCEEDED');
  await result.app.dispose();
});

test('artifact byte tamper: selected package artifact is hashed before import and refused', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => {
    await fixture.cleanup();
  });
  await fixture.writePackageFile(
    'fixture-kernel',
    'dist/index.mjs',
    Buffer.from('export const tampered = true;\n', 'utf8'),
  );
  const result = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'FAILED', JSON.stringify(result));
  if (result.status === 'FAILED') {
    assert.equal(result.code, 'DH_BOOT_PIN_MISMATCH');
    assert.match(result.reason, /sealed digest/);
  }
  assert.equal(
    events().some((event) => event['event'] === 'business-init'),
    false,
    'tampered artifact must produce zero ingress',
  );
});

test('closure resource read: verified bytes on the happy path, digest mismatch on tamper', async (t) => {
  await withScenario(
    t,
    { init: { status: 'READY' }, functions: {}, readResource: 'fixture-business/content/rules.json' },
    async (_fixture, result) => {
      assert.equal(result.status, 'BOOTED', JSON.stringify(result));
      if (result.status !== 'BOOTED') return;
      const read = events().find((event) => event['event'] === 'resource-read');
      assert.ok(read !== undefined, 'resource-read event expected');
      assert.equal(read['key'], 'fixture-business/content/rules.json');
      assert.equal(typeof read['bytes'], 'number');
      await result.app.dispose();
    },
  );

  const fixture = await buildFixtureInstall({
    init: { status: 'READY' },
    functions: {},
    readResource: 'fixture-business/content/rules.json',
  });
  t.after(async () => {
    await fixture.cleanup();
  });
  await fixture.writePackageFile(
    'fixture-business',
    'content/rules.json',
    Buffer.from(JSON.stringify({ minOrderTotal: 1, regions: ['XX'] }), 'utf8'),
  );
  const result = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'FAILED', JSON.stringify(result));
  if (result.status === 'FAILED') {
    assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
    assert.match(result.reason, /digest/);
  }
});

test('dispose is single-flight: concurrent and repeated calls never rerun Exit', async (t) => {
  await withScenario(t, { init: { status: 'READY' }, functions: {} }, async (_fixture, result) => {
    assert.equal(result.status, 'BOOTED');
    if (result.status !== 'BOOTED') return;
    const [a, b, c] = await Promise.all([
      result.app.dispose(),
      result.app.dispose(),
      result.app.dispose(),
    ]);
    assert.deepEqual(a, { status: 'DISPOSED' });
    assert.deepEqual(b, { status: 'DISPOSED' });
    assert.deepEqual(c, { status: 'DISPOSED' });
    const disposes = events().filter((event) => event['event'] === 'package-exit');
    assert.equal(disposes.length, DISPOSE_ORDER.length, 'Exit ran exactly once per package');
  });

  const fixture = await buildFixtureInstall({
    init: { status: 'READY' },
    functions: {},
    kernelDisposeThrow: true,
  });
  t.after(async () => {
    await fixture.cleanup();
  });
  const result = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'BOOTED');
  if (result.status !== 'BOOTED') return;
  const first = await result.app.dispose().then(
    () => null,
    (error: unknown) => (error as Error).message,
  );
  const countAfterFirst = events().length;
  const second = await result.app.dispose().then(
    () => null,
    (error: unknown) => (error as Error).message,
  );
  assert.match(String(first), /fixture kernel Exit threw/);
  assert.equal(first, second, 'repeated dispose returns the same rejection');
  assert.equal(events().length, countAfterFirst, 'no teardown reruns after the first attempt');
  const kernelDisposes = events().filter(
    (event) => event['event'] === 'package-exit' && event['package'] === 'fixture-kernel',
  );
  assert.equal(kernelDisposes.length, 1, 'failing Exit ran exactly once');

  const invokeOutcome = await result.app.invoke('evaluate', { total: 1, region: 'EU' });
  assert.equal(invokeOutcome.kind, 'FAILED');
  assert.equal(
    invokeOutcome.kind === 'FAILED' && invokeOutcome.failure.code,
    'DH_RUNTIME_INGRESS_NOT_CALLABLE',
  );
  const third = await result.app.dispose().then(
    () => null,
    (error: unknown) => (error as Error).message,
  );
  assert.equal(third, first, 'repeat dispose after failure returns the same rejection');
});

test('Package Exit is best-effort across all packages with an aggregate error', async (t) => {
  const fixture = await buildFixtureInstall({
    init: { status: 'READY' },
    functions: {},
    kernelDisposeThrow: true,
  });
  t.after(async () => {
    await fixture.cleanup();
  });
  const result = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'BOOTED');
  if (result.status !== 'BOOTED') return;
  const message = await result.app.dispose().then(
    () => null,
    (error: unknown) => (error as Error).message,
  );
  assert.match(String(message), /Exit failed for 1 Init call\(s\)/);
  assert.match(String(message), /fixture-kernel/);
  const disposes = events().filter((event) => event['event'] === 'package-exit');
  assert.deepEqual(
    disposes.map((event) => event['package']),
    DISPOSE_ORDER,
  );
});

test('DEGRADED with duplicate suppressedIngress ids is refused', async (t) => {
  await withScenario(
    t,
    {
      init: { status: 'DEGRADED', suppressed: ['optional-report', 'optional-report'] },
      functions: {},
    },
    async (_fixture, result) => {
      assert.equal(result.status, 'FAILED', JSON.stringify(result));
      if (result.status === 'FAILED') {
        assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
        assert.match(result.reason, /duplicate/);
      }
    },
  );
});

test('R27: missing selected Init Element export is rejected and InitFrom retains caller', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const { PackageSystem } = await import('../../src/package-system.js');
  const invalidLock = {
    ...fixture.lock,
    selectedPackages: fixture.lock.selectedPackages.map((pkg) =>
      pkg.packageId === '@fixture/sdk' ? { ...pkg, init: { ...pkg.init, exportName: 'missingInit' } } : pkg),
  };
  const packages = new PackageSystem(fixture.installRoot, invalidLock, []);
  await assert.rejects(packages.runInit(packageContext(fixture)), /missingInit/);
  assert.deepEqual(packages.initFrom('fixture-kernel'), [{ type: 'Boot' }]);
  assert.deepEqual(packages.initFrom('@fixture/sdk'), [{ type: 'Package', packageId: 'fixture-kernel' }]);
  await packages.runExit();
});

test('R27: failed Business Core.Init triggers reverse Exit for entered Packages', async (t) => {
  for (const init of [{ status: 'FAILED' as const }, { status: 'READY' as const, throw: true }]) {
    const fixture = await buildFixtureInstall({ init, functions: {} });
    t.after(async () => fixture.cleanup());
    const result = await boot(fixture.pin, fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    const inits = events().filter((e) => e['event'] === 'package-init').map((e) => e['package']);
    const disposes = events().filter((e) => e['event'] === 'package-exit').map((e) => e['package']);
    assert.deepEqual(inits, INIT_ORDER);
    assert.deepEqual(disposes, DISPOSE_ORDER, 'all previously initialized packages must be disposed');
  }
});

test('R27: a tampered selected Hook module is refused before any selected package executes', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  await fixture.writePackageFile('fixture-ext', 'dist/hook.mjs', Buffer.from('export function telemetryHook() { return "tampered"; }\n'));
  const result = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'FAILED', JSON.stringify(result));
  if (result.status === 'FAILED') assert.equal(result.code, 'DH_BOOT_PIN_MISMATCH');
  assert.equal(events().some((e) => e['event'] === 'package-init'), false,
    'selected module integrity must be checked before first Package Init');
});

test('R31: missing Exit Element is allowed; partial startup still closes remaining Packages', async (t) => {
  const fixture = await buildFixtureInstall({
    init: { status: 'READY' },
    functions: {},
    sdkInitThrow: true,
  });
  t.after(async () => fixture.cleanup());
  const { PackageSystem } = await import('../../src/package-system.js');
  const lock = {
    ...fixture.lock,
    selectedPackages: fixture.lock.selectedPackages.map((pkg) => {
      if (pkg.packageId !== 'fixture-kernel') return pkg;
      const { exit: ignored, ...withoutExit } = pkg;
      void ignored;
      return withoutExit;
    }),
  };
  const packages = new PackageSystem(fixture.installRoot, lock, []);
  await assert.rejects(packages.runInit(packageContext(fixture)), /fixture sdk Init threw/);
  await packages.runExit();
  assert.equal(events().some((e) => e['event'] === 'package-exit' && e['package'] === 'fixture-kernel'), false);
  assert.equal(events().filter((e) => e['event'] === 'package-exit' && e['package'] === '@fixture/sdk').length, 1);
});

test('Init failure: already-initialized packages are torn down in strict reverse order', async (t) => {
  const fixture = await buildFixtureInstall({
    init: { status: 'READY' },
    functions: {},
    sdkInitThrow: true,
  });
  t.after(async () => {
    await fixture.cleanup();
  });
  const result = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'FAILED', JSON.stringify(result));
  if (result.status === 'FAILED') {
    assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
    assert.match(result.reason, /fixture sdk Init threw/);
  }

  const inits = events()
    .filter((event) => event['event'] === 'package-init')
    .map((event) => event['package']);
  assert.deepEqual(inits, ['fixture-kernel', '@fixture/sdk']);
  const disposes = events()
    .filter((event) => event['event'] === 'package-exit')
    .map((event) => event['package']);
  assert.deepEqual(disposes, ['@fixture/sdk', 'fixture-kernel'], 'failed Init entrance also receives Exit');
  assert.equal(
    events().some((event) => event['event'] === 'business-init'),
    false,
    'zero ingress when Package Init fails',
  );
});

test('Core chain containing unselected Core fails without inventing an Init call', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const { PackageSystem } = await import('../../src/package-system.js');
  const packages = new PackageSystem(fixture.installRoot, { ...fixture.lock, coreOrder: ['fixture-ghost'] }, []);
  await assert.rejects(packages.runInit(packageContext(fixture)), /invalid Core/);
  assert.equal(events().some((e) => e['event'] === 'package-init'), false);
});

test('InitFrom preserves repeated callers, while KDP never deduplicates Init calls', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const { PackageSystem } = await import('../../src/package-system.js');
  const packages = new PackageSystem(fixture.installRoot, fixture.lock, []);
  await packages.runInit(packageContext(fixture));
  await packages.runInit(packageContext(fixture));
  assert.deepEqual(packages.initFrom('fixture-kernel'), [{ type: 'Boot' }, { type: 'Boot' }]);
  assert.deepEqual(packages.initFrom('fixture-ext'), [
    { type: 'Package', packageId: 'fixture-business' },
    { type: 'Package', packageId: 'fixture-business' },
  ]);
  await packages.runExit();
  assert.equal(events().filter((e) => e['event'] === 'package-exit').length, INIT_ORDER.length * 2);
});

test('Init capability projection exposes only own or direct Extension ingress, never transitive/global handles', async (t) => {
  await withScenario(t, { init: { status: 'READY' }, functions: {} }, async (_fixture, result) => {
    assert.equal(result.status, 'BOOTED');
    if (result.status !== 'BOOTED') return;
    const packages = events().filter((event) => event['event'] === 'package-init');
    for (const pkg of ['fixture-kernel', '@fixture/sdk', 'fixture-ext']) {
      assert.deepEqual(packages.find((event) => event['package'] === pkg)?.['visibleFunctions'], [],
        `unprivileged Package '${pkg}' must not receive unrelated business ingress handles`);
    }
    assert.deepEqual(packages.find((event) => event['package'] === 'fixture-business')?.['visibleFunctions'],
      ['evaluate', 'optional-report'], 'Business Core receives its own selected ingress only');
    await result.app.dispose();
  });
});

test('parent Core Init entry is recorded before child Extension; child failure exits deepest-first including entered parent', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const { PackageSystem } = await import('../../src/package-system.js');
  const invalid = {
    ...fixture.lock,
    selectedPackages: fixture.lock.selectedPackages.map((pkg) =>
      pkg.packageId === 'fixture-ext' ? { ...pkg, init: { ...pkg.init, exportName: 'missingChildInit' } } : pkg),
  };
  const packages = new PackageSystem(fixture.installRoot, invalid, []);
  await assert.rejects(packages.runInit(packageContext(fixture)), /missingChildInit/);
  assert.deepEqual(packages.initFrom('fixture-business'),
    [{ type: 'Package', packageId: '@fixture/sdk' }],
    'the parent Core has already entered Init before recursively calling its Extension');
  assert.deepEqual(packages.initFrom('fixture-ext'),
    [{ type: 'Package', packageId: 'fixture-business' }]);
  await packages.runExit();
  assert.deepEqual(events().filter((event) => event['event'] === 'package-exit').map((event) => event['package']),
    DISPOSE_ORDER, 'failed child still exits before entered parent, regardless of own Init return');
});

test('optional InitFrom absence creates no Package history but never disables independent reverse Exit', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const { PackageSystem } = await import('../../src/package-system.js');
  const noHistoryLock = {
    ...fixture.lock,
    selectedPackages: fixture.lock.selectedPackages.map((pkg) => {
      if (pkg.packageId !== 'fixture-business') return pkg;
      const { recordInitFrom: ignored, ...withoutHistory } = pkg;
      void ignored;
      return withoutHistory;
    }),
  };
  const packages = new PackageSystem(fixture.installRoot, noHistoryLock, []);
  await packages.runInit(packageContext(fixture));
  assert.equal(packages.initFrom('fixture-business'), undefined);
  const business = events().find((event) => event['event'] === 'package-init' && event['package'] === 'fixture-business');
  assert.ok(business !== undefined);
  assert.equal(business['initFrom'], undefined);
  await packages.runExit();
  assert.deepEqual(events().filter((event) => event['event'] === 'package-exit').map((event) => event['package']),
    DISPOSE_ORDER, 'Exit must use the KDP enter log even when a Package never enables InitFrom');
});
