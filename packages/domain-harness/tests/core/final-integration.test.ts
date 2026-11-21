// Element-First 基础能力验证：业务由 Package.Init 内的已选 Function 启动，无外部 direct ingress。
import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from '@kaicreator/domain-harness';
import {
  T04BuildRefusedError,
  buildScenarioInstall,
  events,
  type T04Install,
} from './scenario.js';

const RULE_A = { minOrderTotal: 50, regions: ['EU', 'US'] } as const;
const RULE_B = { minOrderTotal: 500, regions: ['US'] } as const;

async function withInstall(
  t: import('node:test').TestContext,
  scenario: Parameters<typeof buildScenarioInstall>[0],
  run: (install: T04Install) => Promise<void>,
): Promise<void> {
  const install = await buildScenarioInstall(scenario);
  t.after(async () => install.cleanup());
  await run(install);
}
type Event = Record<string, unknown>;

function selectedCall(): Event {
  const result = events().find((entry) => entry['event'] === 'init-selected-function');
  assert.ok(result, 'a BUILD-selected Function must really run during Business Core.Init');
  return result;
}

test('B0: BUILD → Boot → Package.Init uses selected Function before READY; no public invoke', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'READY' } }, async (install) => {
    assert.deepEqual(install.lock.coreOrder, ['kdp-kernel', 'sdk-core', 'orders-business']);
    assert.equal(install.lock.selectedPackages.length, 4);
    for (const selected of install.lock.selectedPackages) {
      assert.ok(install.lock.selectedElements.some((el) =>
        el.ownerPackageId === selected.packageId &&
        JSON.stringify(el.ref) === JSON.stringify(selected.init)));
      assert.ok(install.lock.selectedFunctions.some((fn) =>
        JSON.stringify(fn.ref) === JSON.stringify(selected.initFunction)));
    }

    const result = await boot(install.pin, install.context);
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    const app = result.app;
    assert.equal(app.status, 'READY');
    assert.equal('invoke' in app, false);

    assert.deepEqual(events().filter((entry) => entry['event'] === 'package-init').map((entry) => entry['package']),
      ['kdp-kernel', 'sdk-core', 'orders-ext', 'orders-business']);
    const observed = selectedCall();
    assert.deepEqual(observed['pos'], { kind: 'SUCCEEDED', value: { decision: 'POS' } });
    assert.deepEqual(observed['neg'], { kind: 'SUCCEEDED', value: { decision: 'NEG' } });
    assert.equal((observed['unknown'] as { kind: string }).kind, 'UNKNOWN');
    assert.equal((observed['bad'] as { kind: string }).kind, 'FAILED');

    const inspection = await app.inspect();
    assert.equal(inspection.appIdentity.lockDigest, install.lock.closureDigest);
    assert.equal(inspection.target.profile, 'node22-esm/1');
    assert.ok(inspection.functions.some((fn) => fn.ref.functionId === 'evaluate'));
    assert.equal('ingress' in inspection, false);
    assert.deepEqual(await app.dispose(), { status: 'DISPOSED' });
    assert.deepEqual(events().filter((entry) => entry['event'] === 'package-exit').map((entry) => entry['package']),
      ['orders-ext', 'orders-business', 'sdk-core', 'kdp-kernel']);
  });
});

test('B0: different real rule Content produces different pre-READY Function outcomes and Lock digests', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'READY' } }, async (a) => {
    assert.equal((await boot(a.pin, a.context)).status, 'BOOTED');
    const aCall = selectedCall();
    assert.deepEqual(aCall['pos'], { kind: 'SUCCEEDED', value: { decision: 'POS' } });
    await withInstall(t, { rule: RULE_B, init: { status: 'READY' } }, async (b) => {
      assert.notDeepEqual(a.lockBytes, b.lockBytes);
      assert.notEqual(a.lock.closureDigest, b.lock.closureDigest);
      const bResult = await boot(b.pin, b.context);
      assert.equal(bResult.status, 'BOOTED');
      const bCall = selectedCall();
      assert.deepEqual(bCall['pos'], { kind: 'SUCCEEDED', value: { decision: 'NEG' } });
    });
  });
});

test('B0: deterministic repeated BUILD and pinned implementation selection', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'READY' } }, async (a) => {
    await withInstall(t, { rule: RULE_A, init: { status: 'READY' } }, async (b) => {
      assert.deepEqual(b.lockBytes, a.lockBytes);
      assert.equal(b.lock.closureDigest, a.lock.closureDigest);
      assert.ok(a.lock.selectedPackages.every((pkg) => pkg.initFunction.element.id === pkg.init.id));
    });
  });
});

test('B0: DEGRADED state remains visible without a suppressed ingress list', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'DEGRADED' } }, async (install) => {
    const result = await boot(install.pin, install.context);
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    assert.equal(result.app.status, 'DEGRADED');
    assert.equal((selectedCall()['pos'] as { kind: string }).kind, 'SUCCEEDED');
    assert.equal('suppressedIngress' in await result.app.inspect(), false);
    await result.app.dispose();
  });
});

test('B0: effectful Function is rejected before runtime', { timeout: 120_000 }, async () => {
  await assert.rejects(
    buildScenarioInstall({ rule: RULE_A, init: { status: 'READY' }, withUnsupportedEffect: true }),
    (error: unknown) => {
      assert.ok(error instanceof T04BuildRefusedError);
      assert.equal(error.failure.code, 'DH_BUILD_EFFECT_PROFILE_UNSUPPORTED');
      return true;
    },
  );
});

test('B0: Business Core FAILED never becomes READY, and Exit occurs deepest-first', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'FAILED' } }, async (install) => {
    const result = await boot(install.pin, install.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status !== 'FAILED') return;
    assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
    assert.equal((selectedCall()['pos'] as { kind: string }).kind, 'SUCCEEDED');
    assert.deepEqual(events().filter((entry) => entry['event'] === 'package-exit').map((entry) => entry['package']),
      ['orders-ext', 'orders-business', 'sdk-core', 'kdp-kernel']);
  });
});

test('B0: unsupported Node Host target is refused before package execution', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'READY' } }, async (install) => {
    const result = await boot(install.pin, {
      ...install.context, env: { nodeMajor: 20, platform: process.platform },
    });
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status !== 'FAILED') return;
    assert.equal(result.code, 'DH_RUNTIME_UNSUPPORTED_PROFILE');
    assert.equal(events().filter((entry) => entry['event'] === 'package-init').length, 0);
  });
});

test('B0: non-Node22 BUILD target returns a stable refusal', { timeout: 120_000 }, async () => {
  await assert.rejects(
    buildScenarioInstall({ rule: RULE_A, init: { status: 'READY' }, withUnsupportedTarget: true }),
    (error: unknown) => {
      assert.ok(error instanceof T04BuildRefusedError);
      assert.equal(error.failure.code, 'DH_BUILD_TARGET_INVALID');
      return true;
    },
  );
});
