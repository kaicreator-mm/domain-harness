// 当前架构的可证伪测试：断言实际行为而非历史兼容。
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
  t.after(async () => {
    await install.cleanup();
  });
  await run(install);
}

test('T04-INT-1: build → boot → exactly one locked Business App Init → READY → direct invoke POS/NEG/UNKNOWN → inspect → dispose', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'READY' } }, async (install) => {
    const { lock } = install;

    assert.equal(lock.businessAppInit.functionId, 'appInit');
    assert.equal(lock.ingress.length, 2);
    assert.equal(lock.ingress[1]?.optional, true);
    assert.deepEqual(
      [...lock.selectedPackages.map((pkg) => `${pkg.layer}:${pkg.role}:${pkg.packageId}`)].sort(),
      [
        'business:extension:orders-ext',
        'business:primary:orders-business',
        'kernel:primary:kdp-kernel',
        'sdk:primary:sdk-core',
      ],
    );
    assert.equal(lock.technicalInitOrder[0], 'kdp-kernel', 'kernel Primary initializes first');

    const result = await boot(install.pin, install.context);
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    const app = result.app;
    assert.equal(app.status, 'READY');

    const technicalInitEvents = events().filter((event) => event['event'] === 'technical-init');
    assert.deepEqual(
      technicalInitEvents.map((event) => event['package']),
      lock.technicalInitOrder,
    );
    const businessInits = events().filter((event) => event['event'] === 'business-init');
    assert.equal(businessInits.length, 1, 'exactly one locked Business App Init must run');
    const initRule = businessInits[0]?.['rule'] as { readonly minOrderTotal?: number } | undefined;
    assert.equal(initRule?.['minOrderTotal'], 50, 'init read the REAL selected rule content');

    const pos = await app.invoke('evaluate', { total: 100, region: 'EU' });
    assert.deepEqual(pos, { kind: 'SUCCEEDED', value: { decision: 'POS' } });
    const neg = await app.invoke('evaluate', { total: 10, region: 'EU' });
    assert.deepEqual(neg, { kind: 'SUCCEEDED', value: { decision: 'NEG' } });
    const unknown = await app.invoke('evaluate', { total: 100, region: 'APAC' });
    assert.equal(unknown.kind, 'UNKNOWN');
    if (unknown.kind === 'UNKNOWN') assert.equal(unknown.unknownReason.code, 'FIXTURE_REGION_UNKNOWN');

    const badIngress = await app.invoke('no-such-ingress', {});
    assert.deepEqual(badIngress, {
      kind: 'FAILED',
      failure: { code: 'DH_RUNTIME_INGRESS_UNKNOWN', message: "ingress 'no-such-ingress' does not exist" },
    });
    const badInput = await app.invoke('evaluate', { total: 'not-a-number', region: 'EU' });
    assert.equal(badInput.kind, 'FAILED');
    if (badInput.kind === 'FAILED') assert.equal(badInput.failure.code, 'DH_RUNTIME_INPUT_SCHEMA_MISMATCH');

    const inspection = await app.inspect();
    assert.equal(inspection.appIdentity.lockDigest, lock.closureDigest);
    assert.equal(inspection.target.profile, 'node22-esm/1');
    assert.deepEqual(inspection.suppressedIngress, []);
    assert.deepEqual(
      inspection.functions.map((fn) => fn.ref.functionId).sort(),
      ['appInit', 'evaluate', 'optionalReport'],
    );

    const disposed = await app.dispose();
    assert.deepEqual(disposed, { status: 'DISPOSED' });
    const disposeEvents = events().filter((event) => event['event'] === 'technical-dispose');
    assert.deepEqual(
      disposeEvents.map((event) => event['package']),
      lock.technicalDisposeOrder,
    );
    const afterDispose = await app.invoke('evaluate', { total: 100, region: 'EU' });
    assert.equal(afterDispose.kind, 'FAILED');
    if (afterDispose.kind === 'FAILED') assert.equal(afterDispose.failure.code, 'DH_RUNTIME_INGRESS_NOT_CALLABLE');
  });
});

test('T04-INT-2: content exchange — same implementation, swapped selected rule content changes POS/NEG/UNKNOWN and the Lock bytes', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'READY' } }, async (installA) => {
    await withInstall(t, { rule: RULE_B, init: { status: 'READY' } }, async (installB) => {
      assert.notDeepEqual(installA.lockBytes, installB.lockBytes, 'selected content is part of the exact Lock');
      assert.notEqual(installA.lock.closureDigest, installB.lock.closureDigest);

      const bootA = await boot(installA.pin, installA.context);
      const bootB = await boot(installB.pin, installB.context);
      assert.equal(bootA.status, 'BOOTED', JSON.stringify(bootA));
      assert.equal(bootB.status, 'BOOTED', JSON.stringify(bootB));
      if (bootA.status !== 'BOOTED' || bootB.status !== 'BOOTED') return;
      try {
        const aUs = await bootA.app.invoke('evaluate', { total: 100, region: 'US' });
        assert.deepEqual(aUs, { kind: 'SUCCEEDED', value: { decision: 'POS' } }, 'A: 100 >= 50');
        const bUs = await bootB.app.invoke('evaluate', { total: 100, region: 'US' });
        assert.deepEqual(bUs, { kind: 'SUCCEEDED', value: { decision: 'NEG' } }, 'B: 100 < 500');
        const bEu = await bootB.app.invoke('evaluate', { total: 100, region: 'EU' });
        assert.equal(bEu.kind, 'UNKNOWN', 'B: EU is not covered by the selected rule');
      } finally {
        await bootA.app.dispose();
        await bootB.app.dispose();
      }
    });
  });
});

test('T04-INT-3: repeated BUILD over identical input is byte-deterministic (exact Lock)', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'READY' } }, async (first) => {
    await withInstall(t, { rule: RULE_A, init: { status: 'READY' } }, async (second) => {
      assert.deepEqual(second.lockBytes, first.lockBytes, 'same input → byte-identical Lock (AC07)');
      assert.equal(second.lock.closureDigest, first.lock.closureDigest);
    });
  });
});

test('T04-INT-4: DEGRADED suppresses only predeclared optional ingress; required ingress stays callable', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'DEGRADED' } }, async (install) => {
    const result = await boot(install.pin, install.context);
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    const app = result.app;
    assert.equal(app.status, 'DEGRADED');

    const inspection = await app.inspect();
    assert.deepEqual(inspection.suppressedIngress, ['optional-report']);

    const required = await app.invoke('evaluate', { total: 100, region: 'EU' });
    assert.deepEqual(required, { kind: 'SUCCEEDED', value: { decision: 'POS' } });

    const suppressed = await app.invoke('optional-report', {});
    assert.equal(suppressed.kind, 'FAILED');
    if (suppressed.kind === 'FAILED') {
      assert.equal(suppressed.failure.code, 'DH_RUNTIME_INGRESS_NOT_CALLABLE');
      assert.match(suppressed.failure.message, /suppressed by the DEGRADED app status/);
    }
    await app.dispose();
  });
});

test('T04-INT-5: unsupported effect profile is a typed BUILD refusal (DH_BUILD_EFFECT_PROFILE_UNSUPPORTED)', { timeout: 120_000 }, async () => {
  await assert.rejects(
    buildScenarioInstall({ rule: RULE_A, init: { status: 'READY' }, withUnsupportedEffect: true }),
    (error: unknown) => {
      assert.ok(error instanceof T04BuildRefusedError, `expected T04BuildRefusedError, got ${String(error)}`);
      assert.equal(error.failure.code, 'DH_BUILD_EFFECT_PROFILE_UNSUPPORTED');
      assert.match(error.failure.message, /0\.11\.0 implements 'none' only/);
      return true;
    },
  );
});

test('T04-INT-6: a Business App Init that suppresses a REQUIRED ingress is typed-refused (never silently accepted)', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'DEGRADED_SUPPRESS_REQUIRED' } }, async (install) => {
    const result = await boot(install.pin, install.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status !== 'FAILED') return;
    assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
    assert.match(result.reason, /suppressedIngress names required ingress 'evaluate'/);
    assert.equal(
      events().filter((event) => event['event'] === 'business-init').length,
      1,
      'the locked init ran once; its invalid result is what is refused',
    );
  });
});

test('T04-INT-7: unsupported Boot target (env.nodeMajor 20) is a typed failure before selected packages load', { timeout: 120_000 }, async (t) => {
  await withInstall(t, { rule: RULE_A, init: { status: 'READY' } }, async (install) => {
    const badContext = { ...install.context, env: { nodeMajor: 20, platform: process.platform } };
    const result = await boot(install.pin, badContext);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status !== 'FAILED') return;
    assert.equal(result.code, 'DH_RUNTIME_UNSUPPORTED_PROFILE');
    assert.match(result.reason, /below the Lock target floor 22/);
    assert.equal(
      events().some((event) => event['event'] === 'module-evaluated' || event['event'] === 'technical-init' || event['event'] === 'business-init'),
      false,
      'zero selected-package side effects: no package module was loaded or initialized',
    );
  });
});

test('T04-INT-8: authoring against a non-node22 Target is a typed BUILD refusal (DH_BUILD_TARGET_INVALID)', { timeout: 120_000 }, async () => {
  await assert.rejects(
    buildScenarioInstall({ rule: RULE_A, init: { status: 'READY' }, withUnsupportedTarget: true }),
    (error: unknown) => {
      assert.ok(error instanceof T04BuildRefusedError, `expected T04BuildRefusedError, got ${String(error)}`);
      assert.equal(error.failure.code, 'DH_BUILD_TARGET_INVALID');
      return true;
    },
  );
});
