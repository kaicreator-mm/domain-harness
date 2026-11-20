/**
 * DomainHarness v0.11.0 T03 (#1577) — KDP bootstrap / Package System
 * lifecycle tests (L2 §6.2.2, AC04/AC05 positive half).
 *
 * Observable behavior comes from real fixture package modules writing
 * events during module evaluation, technical init/dispose and the one
 * businessAppInit (see helpers/install.ts). Assertions cover: load and
 * init order equals the Lock's technicalInitOrder, hook provider sealing,
 * exactly-locked businessAppInit with the PRD A03 init context, strict
 * reverse dispose, and ordinary-FAILED startup with zero ingress and no
 * recovery on physical load/init failure (PRD K07).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { BootResult } from '@kaicreator/domain-harness-contracts/v011';
import { splitResourceKey } from '../../src/v011/paths.js';
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

const INIT_ORDER = ['fixture-kernel', '@fixture/sdk', 'fixture-business', 'fixture-ext'];
const DISPOSE_ORDER = [...INIT_ORDER].reverse();

test('KDP boots core + package system: init order, hook sealing, business init, READY', async (t) => {
  await withScenario(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  }, async (_fixture, result) => {
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    assert.equal(result.app.status, 'READY');

    // Package modules evaluated + technical init in the Lock's exact order.
    const evaluated = events()
      .filter((event) => event['event'] === 'module-evaluated')
      .map((event) => event['package']);
    const inits = events()
      .filter((event) => event['event'] === 'technical-init')
      .map((event) => event['package']);
    assert.deepEqual(evaluated.slice(0, INIT_ORDER.length), INIT_ORDER);
    assert.deepEqual(inits, INIT_ORDER);

    // Hook provider module imported during sealing (after technical init,
    // before business init) and never invoked (no channel).
    const hookEvalIndex = events().findIndex(
      (event) => event['event'] === 'module-evaluated' && event['package'] === 'fixture-ext:hook',
    );
    const businessInitIndex = events().findIndex((event) => event['event'] === 'business-init');
    assert.ok(hookEvalIndex > 0, 'hook provider module must be loaded by sealHooks');
    assert.ok(businessInitIndex > hookEvalIndex, 'hooks sealed before businessAppInit runs');
    assert.equal(events().some((event) => event['event'] === 'hook-provider-invoked'), false);

    // The one businessAppInit observed the PRD A03 init context.
    const businessInit = events().find((event) => event['event'] === 'business-init');
    assert.ok(businessInit !== undefined);
    assert.equal(businessInit['appId'], 'fixture.orders-app');
    assert.equal(businessInit['hasActivationId'], true);
    assert.equal(typeof businessInit['lockDigest'], 'string');
    assert.deepEqual(businessInit['config'], { region: 'EU', featureFlag: true });
    assert.deepEqual(businessInit['ingress'], ['evaluate', 'optional-report']);
    assert.deepEqual(businessInit['resourceKeys'], [
      'fixture-kernel/dist/index.mjs',
      '@fixture/sdk/dist/index.mjs',
      'fixture-business/dist/index.mjs',
      'fixture-business/elements/orders.eligibility.json',
      'fixture-business/schemas/optional-report-input.schema.json',
      'fixture-business/content/rules.json',
      'fixture-ext/dist/index.mjs',
      'fixture-ext/dist/hook.mjs',
    ]);
    assert.deepEqual(
      events().filter((event) => event['event'] === 'business-init'),
      [businessInit],
      'exactly one businessAppInit executed',
    );
  });
});

test('dispose runs technicalDispose in the strict reverse disposeOrder', async (t) => {
  await withScenario(t, {
    init: { status: 'READY' },
    functions: {},
  }, async (_fixture, result) => {
    assert.equal(result.status, 'BOOTED');
    if (result.status !== 'BOOTED') return;
    await result.app.dispose();
    const disposes = events()
      .filter((event) => event['event'] === 'technical-dispose')
      .map((event) => event['package']);
    assert.deepEqual(disposes, DISPOSE_ORDER);
    // Idempotent second dispose adds no further events.
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

  // Honesty guard: DEGRADED may not swallow a required ingress (PRD A04).
  // The init itself did execute (its event is observable) but its dishonest
  // result is refused: FAILED, no app handle, no ingress.
  await withScenario(t, {
    init: { status: 'DEGRADED', suppressed: ['evaluate'] },
    functions: {},
  }, async (_fixture, result) => {
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status === 'FAILED') {
      assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
    }
  });

  // Honesty guard: DEGRADED with an EMPTY or OMITTED suppressedIngress list
  // is a masquerade — nothing is actually degraded — and is refused.
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

  // READY while suppressing an ingress is a masquerade attempt -> refused.
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
  // Remove a selected package artifact after installation (post-install
  // corruption inside the trusted root).
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
  // Unit: the frozen T02/T01 `<packageId>/<path>` key form resolves its
  // boundary by scanning from the rightmost '/' for the first well-formed
  // package id — scoped ids keep their scope segment and multi-segment
  // resource paths (per the frozen T01 fixture) stay intact.
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

  // End to end: the default fixture install carries a SCOPED SDK primary
  // ('@fixture/sdk'); boot, schema lookup across the mixed-key closure and
  // ingress invocation all still work.
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
      (event['resourceKeys'] as string[]).includes('@fixture/sdk/dist/index.mjs'),
  );
  assert.ok(scopedKeySeen, 'scoped package resource key must reach the init context');
  const outcome = await result.app.invoke('evaluate', { total: 10, region: 'EU' });
  assert.equal(outcome.kind, 'SUCCEEDED');
  await result.app.dispose();
});

test('artifact byte tamper: selected package artifact is hashed before import and refused', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => {
    await fixture.cleanup();
  });
  // Post-install tamper INSIDE the trust root: swap a selected package
  // artifact for different bytes. The Lock closure still verifies, so only
  // the runtime artifact digest check can catch this.
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
  // Positive: the init-context resource handle returns verified bytes.
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

  // Negative: tamper the resource bytes after install; the read itself
  // refuses with a digest mismatch and the boot fails with zero ingress.
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

test('dispose is single-flight: concurrent and repeated calls never rerun technicalDispose', async (t) => {
  // Success: every concurrent caller gets the same DISPOSED result and the
  // teardown runs exactly once per package.
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
    const disposes = events().filter((event) => event['event'] === 'technical-dispose');
    assert.equal(disposes.length, DISPOSE_ORDER.length, 'technicalDispose ran exactly once per package');
  });

  // Failure: the same rejection is shared by every caller and the failing
  // technicalDispose is never rerun.
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
  assert.match(String(first), /fixture kernel technicalDispose threw/);
  assert.equal(first, second, 'repeated dispose returns the same rejection');
  assert.equal(events().length, countAfterFirst, 'no teardown reruns after the first attempt');
  const kernelDisposes = events().filter(
    (event) => event['event'] === 'technical-dispose' && event['package'] === 'fixture-kernel',
  );
  assert.equal(kernelDisposes.length, 1, 'failing technicalDispose ran exactly once');

  // A failed dispose consumes the app: later invoke is refused, and repeat
  // dispose keeps returning the latched rejection (not a DISPOSED result).
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

test('technical dispose is best-effort across all packages with an aggregate error', async (t) => {
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
  assert.match(String(message), /technical dispose failed for 1 package\(s\)/);
  assert.match(String(message), /fixture-kernel/);
  // Every package was attempted despite the kernel failure — the reverse
  // teardown never aborts early.
  const disposes = events().filter((event) => event['event'] === 'technical-dispose');
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

test('R27: Lock-declared lifecycle executes only when explicitly selected and callable', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => fixture.cleanup());
  const { PackageSystem } = await import('../../src/v011/package-system.js');
  const noLifecycle = {
    ...fixture.lock,
    selectedPackages: fixture.lock.selectedPackages.map((pkg) => ({ ...pkg, technicalLifecycle: false })),
  };
  await new PackageSystem(fixture.installRoot, noLifecycle, []).runTechnicalInit();
  assert.equal(events().filter((e) => e['event'] === 'technical-init').length, 0,
    'an undeclared export is never implicitly invoked');

  const hookDigest = fixture.lock.resourceDigests['fixture-ext/dist/hook.mjs']!;
  const badLifecycle = {
    ...fixture.lock,
    selectedPackages: fixture.lock.selectedPackages.map((pkg) => pkg.packageId === 'fixture-ext'
      ? { ...pkg, artifact: { packageId: 'fixture-ext', path: 'dist/hook.mjs', digest: hookDigest } }
      : pkg),
  };
  await assert.rejects(
    new PackageSystem(fixture.installRoot, badLifecycle, []).runTechnicalInit(),
    /declared technicalInit but its artifact has no callable named export/,
  );
});

test('R27: post-initialization Business App Init failure rolls back every technical package', async (t) => {
  for (const init of [{ status: 'FAILED' as const }, { status: 'READY' as const, throw: true }]) {
    const fixture = await buildFixtureInstall({ init, functions: {} });
    t.after(async () => fixture.cleanup());
    const result = await boot(fixture.pin, fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    const inits = events().filter((e) => e['event'] === 'technical-init').map((e) => e['package']);
    const disposes = events().filter((e) => e['event'] === 'technical-dispose').map((e) => e['package']);
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
  assert.equal(events().some((e) => e['event'] === 'technical-init'), false,
    'selected module integrity must be checked before first technical init');
});

test('R31: rollback never invokes an undeclared technicalDispose export', async (t) => {
  const fixture = await buildFixtureInstall({
    init: { status: 'READY' },
    functions: {},
    sdkInitThrow: true,
  });
  t.after(async () => fixture.cleanup());
  const { PackageSystem } = await import('../../src/v011/package-system.js');
  const narrowedLock = {
    ...fixture.lock,
    selectedPackages: fixture.lock.selectedPackages.map((pkg) =>
      pkg.packageId === 'fixture-kernel' ? { ...pkg, technicalLifecycle: false } : pkg),
  };
  const packages = new PackageSystem(fixture.installRoot, narrowedLock, []);
  await assert.rejects(packages.runTechnicalInit(), /fixture sdk technicalInit threw/);
  const kernelDisposes = events().filter((event) =>
    event['event'] === 'technical-dispose' && event['package'] === 'fixture-kernel');
  assert.equal(kernelDisposes.length, 0,
    'rollback must not execute technicalDispose for a package whose Lock lifecycle is false');
});

test('technicalInit failure: already-initialized packages are torn down in strict reverse order', async (t) => {
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
    assert.equal(result.code, 'DH_KDP_PACKAGE_LOAD_FAILED');
    assert.match(result.reason, /fixture sdk technicalInit threw/);
  }

  // Init order: kernel initialized, sdk's technicalInit threw. Best-effort
  // cleanup must dispose ONLY the already-initialized kernel, in reverse.
  const inits = events()
    .filter((event) => event['event'] === 'technical-init')
    .map((event) => event['package']);
  assert.deepEqual(inits, ['fixture-kernel', '@fixture/sdk']);
  const disposes = events()
    .filter((event) => event['event'] === 'technical-dispose')
    .map((event) => event['package']);
  assert.deepEqual(disposes, ['fixture-kernel'], 'reverse best-effort cleanup of initialized packages only');
  assert.equal(
    events().some((event) => event['event'] === 'business-init'),
    false,
    'zero ingress when technical init fails',
  );
});

test('runTechnicalDispose refuses unselected packages instead of silently continuing', async (t) => {
  const fixture = await buildFixtureInstall({ init: { status: 'READY' }, functions: {} });
  t.after(async () => {
    await fixture.cleanup();
  });
  const { PackageSystem } = await import('../../src/v011/package-system.js');
  const tamperedLock = {
    ...fixture.lock,
    technicalDisposeOrder: ['fixture-ghost'],
  };
  const packages = new PackageSystem(fixture.installRoot, tamperedLock, []);
  await assert.rejects(
    packages.runTechnicalDispose(),
    /technicalDisposeOrder references unselected package 'fixture-ghost'/,
  );
});
