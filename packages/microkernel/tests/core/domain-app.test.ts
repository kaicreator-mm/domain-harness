// 当前架构的可证伪测试：断言实际行为而非历史兼容。
import test from 'node:test';
import assert from 'node:assert/strict';
import type { BootResult, DomainApp } from '@kaicreator/domain-harness-contracts';
import { normalizeOutcome } from '../../src/domain-app.js';
import {
  boot,
  buildFixtureInstall,
  events,
  type FixtureScenario,
} from './helpers/install.js';
async function bootApp(t: import('node:test').TestContext, scenario: FixtureScenario): Promise<DomainApp> {
  const fixture = await buildFixtureInstall(scenario);
  t.after(async () => {
    await fixture.cleanup();
  });
  const result: BootResult = await boot(fixture.pin, fixture.context);
  if (result.status !== 'BOOTED') {
    assert.fail(`expected BOOTED, got ${JSON.stringify(result)}`);
  }
  return result.app;
}

test('unknown ingress id is refused with DH_RUNTIME_INGRESS_UNKNOWN', async (t) => {
  const app = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  });
  const outcome = await app.invoke('no-such-ingress', {});
  assert.equal(outcome.kind, 'FAILED');
  assert.equal(outcome.kind === 'FAILED' && outcome.failure.code, 'DH_RUNTIME_INGRESS_UNKNOWN');
  await app.dispose();
});

test('input schema mismatch is refused before the implementation runs', async (t) => {
  const app = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  });
  const missingField = await app.invoke('evaluate', { total: 100 });
  assert.equal(missingField.kind, 'FAILED');
  assert.equal(missingField.kind === 'FAILED' && missingField.failure.code, 'DH_RUNTIME_INPUT_SCHEMA_MISMATCH');
  const wrongType = await app.invoke('evaluate', { total: '100', region: 'EU' });
  assert.equal(wrongType.kind, 'FAILED');
  assert.equal(wrongType.kind === 'FAILED' && wrongType.failure.code, 'DH_RUNTIME_INPUT_SCHEMA_MISMATCH');
  await app.dispose();
});

test('nested non-JSON input is refused before the selected implementation runs', async (t) => {
  const app = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'throw' } },
  });
  const cases: readonly [string, unknown][] = [
    ['nested undefined', { total: 100, region: 'EU', metadata: [{ value: undefined }] }],
    ['nested function', { total: 100, region: 'EU', metadata: { callback: () => undefined } }],
    ['nested Symbol', { total: 100, region: 'EU', metadata: [{ token: Symbol('not-json') }] }],
    ['nested bigint', { total: 100, region: 'EU', metadata: { count: 10n } }],
    ['nested non-finite number', { total: 100, region: 'EU', metadata: [{ value: Number.NaN }] }],
    [
      'nested throwing Proxy',
      {
        total: 100,
        region: 'EU',
        metadata: new Proxy({ value: true }, { get() { throw new Error('evil nested getter'); } }),
      },
    ],
    ['root Date', new Date(0)],
    ['root Map', new Map([['total', 100]])],
  ];
  for (const [name, input] of cases) {
    const outcome = await app.invoke('evaluate', input);
    assert.equal(outcome.kind, 'FAILED', name);
    assert.equal(
      outcome.kind === 'FAILED' && outcome.failure.code,
      'DH_RUNTIME_INPUT_SCHEMA_MISMATCH',
      name,
    );
  }
  await app.dispose();
});

test('valid nested JSON objects and arrays preserve the existing invocation behavior', async (t) => {
  const app = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  });
  const outcome = await app.invoke('evaluate', {
    total: 100,
    region: 'EU',
    metadata: {
      history: [null, true, 1, 'text', { nested: ['array', { object: 2 }] }],
    },
  });
  assert.deepEqual(outcome, { kind: 'SUCCEEDED', value: { decision: 'POS' } });
  await app.dispose();
});

test('SUCCEEDED values are validated against the output schema; mismatch is reported as FAILED', async (t) => {
  const app = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'MAYBE' } } },
  });
  const outcome = await app.invoke('evaluate', { total: 100, region: 'EU' });
  assert.equal(outcome.kind, 'FAILED');
  assert.equal(outcome.kind === 'FAILED' && outcome.failure.code, 'DH_RUNTIME_OUTPUT_SCHEMA_MISMATCH');
  await app.dispose();
});

test('strict FunctionOutcome: garbage and undeclared kinds never propagate as SUCCEEDED', async (t) => {
  const garbage = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'garbage' } },
  });
  const garbageOutcome = await garbage.invoke('evaluate', { total: 1, region: 'EU' });
  assert.equal(garbageOutcome.kind, 'FAILED');
  assert.equal(garbageOutcome.kind === 'FAILED' && garbageOutcome.failure.code, 'DH_RUNTIME_UNSUPPORTED_PROFILE');
  await garbage.dispose();

  const undeclared = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'failed' } },
  });
  const undeclaredOutcome = await undeclared.invoke('evaluate', { total: 1, region: 'EU' });
  assert.equal(undeclaredOutcome.kind, 'UNKNOWN');
  assert.equal(
    undeclaredOutcome.kind === 'UNKNOWN' && undeclaredOutcome.unknownReason.code,
    'DH_RUNTIME_UNSUPPORTED_PROFILE',
  );
  await undeclared.dispose();

  const unknown = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'unknown' } },
  });
  const unknownOutcome = await unknown.invoke('evaluate', { total: 1, region: 'EU' });
  assert.deepEqual(unknownOutcome, {
    kind: 'UNKNOWN',
    unknownReason: { code: 'FIXTURE_UNKNOWN', message: 'fixture unknown outcome' },
  });
  await unknown.dispose();
});

test('unhandled implementation exceptions cause KDP Exit and block subsequent ingress', async (t) => {
  const app = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'throw' } },
  });
  const outcome = await app.invoke('evaluate', { total: 1, region: 'EU' });
  assert.equal(outcome.kind, 'FAILED');
  assert.equal(outcome.kind === 'FAILED' && outcome.failure.code, 'DH_KDP_PACKAGE_LOAD_FAILED');
  if (outcome.kind === 'FAILED') assert.doesNotMatch(outcome.failure.message, /TOKEN_SECRET_CANARY_8029/);
  assert.deepEqual(
    events().filter((event) => event['event'] === 'package-exit').map((event) => event['package']),
    ['fixture-ext', 'fixture-business', '@fixture/sdk', 'fixture-kernel'],
  );
  const after = await app.invoke('evaluate', { total: 1, region: 'EU' });
  assert.equal(after.kind === 'FAILED' && after.failure.code, 'DH_RUNTIME_INGRESS_NOT_CALLABLE');
  await app.dispose();
});

test('inspect projects Lock facts only (B06), including DEGRADED suppression', async (t) => {
  const ready = await bootApp(t, {
    init: { status: 'READY' },
    functions: {},
  });
  const inspection = await ready.inspect();
  assert.deepEqual(inspection.appIdentity, {
    id: 'fixture.orders-app',
    version: '1.0.0',
    lockDigest: inspection.appIdentity.lockDigest,
  });
  assert.deepEqual(inspection.target, {
    runtime: 'node',
    module: 'esm',
    nodeMajor: 22,
    profile: 'node22-esm/1',
  });
  assert.deepEqual(
    inspection.packages.map((pkg) => [pkg.packageId, pkg.layer, pkg.role]),
    [
      ['fixture-kernel', 'kernel', 'primary'],
      ['@fixture/sdk', 'sdk', 'primary'],
      ['fixture-business', 'business', 'primary'],
      ['fixture-ext', 'business', 'extension'],
    ],
  );
  assert.equal(inspection.elements.length, 1);
  assert.equal(inspection.elements[0]?.ownerPackageId, 'fixture-business');
  assert.deepEqual(
    inspection.functions.map((fn) => fn.ref.functionId),
    ['evaluate', 'optionalReport'],
  );
  assert.deepEqual(
    inspection.ingress.map((entry) => [entry.id, entry.optional]),
    [
      ['evaluate', false],
      ['optional-report', true],
    ],
  );
  assert.deepEqual(inspection.suppressedIngress, []);
  await ready.dispose();

  const degraded = await bootApp(t, {
    init: { status: 'DEGRADED', suppressed: ['optional-report'] },
    functions: {},
  });
  const degradedInspection = await degraded.inspect();
  assert.deepEqual(degradedInspection.suppressedIngress, ['optional-report']);
  await degraded.dispose();
});

test('R27: FunctionOutcome reason diagnostics are stable snapshots, not live getters', () => {
  let reads = 0;
  const raw = { kind: 'UNKNOWN', unknownReason: {
    get code() { reads += 1; return reads === 1 ? 'REGION_UNKNOWN' : 'LATER'; },
    get message() { reads += 1; return reads === 2 ? 'region not selected' : 'LATER'; },
  } };
  const normalized = normalizeOutcome(raw, ['UNKNOWN']);
  assert.deepEqual(normalized, { kind: 'UNKNOWN', unknownReason: { code: 'REGION_UNKNOWN', message: 'region not selected' } });
  assert.equal(reads, 2);
});

test('invoke never rejects on Proxy/getter outcomes: typed FAILED instead', async (t) => {
  const evilOutcome = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'proxy-outcome' } },
  });
  const outcomeResult = await evilOutcome.invoke('evaluate', { total: 1, region: 'EU' });
  assert.equal(outcomeResult.kind, 'FAILED');
  assert.equal(
    outcomeResult.kind === 'FAILED' && outcomeResult.failure.code,
    'DH_RUNTIME_UNSUPPORTED_PROFILE',
  );
  assert.match(
    outcomeResult.kind === 'FAILED' ? outcomeResult.failure.message : '',
    /inspection threw/,
  );
  await evilOutcome.dispose();

  const evilValue = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'proxy-value' } },
  });
  const valueResult = await evilValue.invoke('evaluate', { total: 1, region: 'EU' });
  assert.equal(valueResult.kind, 'FAILED');
  assert.equal(
    valueResult.kind === 'FAILED' && valueResult.failure.code,
    'DH_RUNTIME_UNSUPPORTED_PROFILE',
  );
  await evilValue.dispose();
});

test('invoke never rejects on hostile Proxy input: typed input mismatch instead', async (t) => {
  const app = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  });
  const hostileInput = new Proxy(
    { total: 100, region: 'EU' },
    {
      get(target, key) {
        if (key === 'total') throw new Error('evil input getter');
        return Reflect.get(target, key);
      },
    },
  );
  const outcome = await app.invoke('evaluate', hostileInput);
  assert.equal(outcome.kind, 'FAILED');
  assert.equal(outcome.kind === 'FAILED' && outcome.failure.code, 'DH_RUNTIME_INPUT_SCHEMA_MISMATCH');
  await app.dispose();
});

test('R27: disposal immediately closes ingress before asynchronous technical teardown', async (t) => {
  const app = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  });
  const teardown = app.dispose();
  const during = await app.invoke('evaluate', { total: 100, region: 'EU' });
  assert.equal(during.kind, 'FAILED');
  if (during.kind === 'FAILED') assert.equal(during.failure.code, 'DH_RUNTIME_INGRESS_NOT_CALLABLE');
  await teardown;
});

// inspect 返回值不得成为修改内部 Lock 和已选 Function 合同的可写通道。
test('inspection provides independent snapshots and cannot change selected function policy', async (t) => {
  const app = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  });
  const first = await app.inspect();
  const expectedTarget = first.target.profile;
  const selected = first.functions.find((fn) => fn.ref.functionId === 'evaluate');
  assert.ok(selected);
  const expectedElementId = selected.ref.element.id;
  const expectedOutcomes = [...selected.outcomes];
  (first.target as { profile: string }).profile = 'hostile-profile';
  (selected.ref.element as { id: string }).id = 'hostile.element';
  (selected.outcomes as string[]).splice(0, selected.outcomes.length, 'UNKNOWN');
  const firstElement = first.elements[0];
  assert.ok(firstElement);
  const originalElementId = firstElement.ref.id;
  (firstElement.ref as { id: string }).id = 'hostile.id';
  const second = await app.inspect();
  assert.equal(second.target.profile, expectedTarget);
  const reselected = second.functions.find((fn) => fn.ref.functionId === 'evaluate');
  assert.ok(reselected);
  assert.equal(reselected.ref.element.id, expectedElementId);
  assert.deepEqual(reselected.outcomes, expectedOutcomes);
  assert.equal(second.elements[0]?.ref.id, originalElementId);
  assert.deepEqual(await app.invoke('evaluate', { total: 100, region: 'EU' }), {
    kind: 'SUCCEEDED',
    value: { decision: 'POS' },
  });
  await app.dispose();
});

test('invoke after dispose is refused; disposed apps stay disposed', async (t) => {
  const app = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  });
  await app.dispose();
  const outcome = await app.invoke('evaluate', { total: 1, region: 'EU' });
  assert.equal(outcome.kind, 'FAILED');
  assert.equal(outcome.kind === 'FAILED' && outcome.failure.code, 'DH_RUNTIME_INGRESS_NOT_CALLABLE');
});

test('resource-referenced input schema: verified read passes, tampered schema is refused', async (t) => {
  const healthy = await bootApp(t, {
    init: { status: 'READY' },
    functions: { optionalReport: { behavior: 'succeed', value: 'report-ok' } },
  });
  const ok = await healthy.invoke('optional-report', { anything: true });
  assert.deepEqual(ok, { kind: 'SUCCEEDED', value: 'report-ok' });
  await healthy.dispose();

  const fixture = await buildFixtureInstall({
    init: { status: 'READY' },
    functions: { optionalReport: { behavior: 'succeed', value: 'report-ok' } },
  });
  t.after(async () => {
    await fixture.cleanup();
  });
  await fixture.writePackageFile(
    'fixture-business',
    'schemas/optional-report-input.schema.json',
    Buffer.from(JSON.stringify({ type: 'object', additionalProperties: false }), 'utf8'),
  );
  const result = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'BOOTED', JSON.stringify(result));
  if (result.status !== 'BOOTED') return;
  const outcome = await result.app.invoke('optional-report', { anything: true });
  assert.equal(outcome.kind, 'UNKNOWN');
  assert.equal(outcome.kind === 'UNKNOWN' && outcome.unknownReason.code, 'DH_RUNTIME_UNSUPPORTED_PROFILE');
  assert.match(outcome.kind === 'UNKNOWN' ? outcome.unknownReason.message : '', /digest/);
  await result.app.dispose();
});
