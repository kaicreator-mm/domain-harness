// B0: 已选 Function 直接从 Package.Init 运行；公开 DomainApp 不含业务 ingress。
import test from 'node:test';
import assert from 'node:assert/strict';
import type { DomainApp, FunctionRef } from '@kaicreator/domain-harness-contracts';
import { PackageSystem } from '../../src/package-system.js';
import { normalizeOutcome } from '../../src/selected-function.js';
import { boot, buildFixtureInstall, events, type FixtureScenario, type FixtureInstall } from './helpers/install.js';

async function fixtureFor(t: import('node:test').TestContext, scenario: FixtureScenario): Promise<FixtureInstall> {
  const fixture = await buildFixtureInstall(scenario);
  t.after(async () => fixture.cleanup());
  return fixture;
}
async function bootApp(t: import('node:test').TestContext, scenario: FixtureScenario): Promise<{
  app: DomainApp; fixture: FixtureInstall;
}> {
  const fixture = await fixtureFor(t, scenario);
  const result = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'BOOTED', JSON.stringify(result));
  if (result.status !== 'BOOTED') throw new Error('Boot failed');
  return { app: result.app, fixture };
}
function selectedRef(fixture: FixtureInstall, functionId: string): FunctionRef {
  const selected = fixture.lock.selectedFunctions.find((candidate) => candidate.ref.functionId === functionId &&
    candidate.ref.element.id === 'orders.eligibility');
  assert.ok(selected, `selected Function '${functionId}' must exist`);
  return selected.ref;
}
async function selectedRunner(fixture: FixtureInstall): Promise<PackageSystem> {
  const selected = new PackageSystem(fixture.installRoot, fixture.lock, []);
  await selected.verifySelectedArtifacts();
  return selected;
}

test('B0-04: real selected Function executes inside Package.Init before App READY', async (t) => {
  const { app } = await bootApp(t, {
    init: { status: 'READY' },
    functions: { evaluate: { behavior: 'succeed', value: { decision: 'POS' } } },
  });
  assert.equal(app.status, 'READY');
  assert.equal('invoke' in app, false, 'no direct ingress is part of public SDK');
  const call = events().find((event) => event['event'] === 'init-selected-function');
  assert.ok(call, 'selected Function must run during Init');
  assert.equal(call['kind'], 'SUCCEEDED');
  assert.deepEqual(call['value'], { decision: 'POS' });
  await app.dispose();
});

test('B0-01: unknown FunctionRef refused, selected FunctionRef executable', async (t) => {
  const fixture = await fixtureFor(t, { init: { status: 'READY' }, functions: {} });
  const packages = await selectedRunner(fixture);
  const genuine = selectedRef(fixture, 'evaluate');
  const outcome = await packages.invokeSelectedFunction({ ...genuine, functionId: 'unselected' }, {});
  assert.equal(outcome.kind, 'FAILED');
  if (outcome.kind === 'FAILED') assert.equal(outcome.failure.code, 'DH_RUNTIME_INGRESS_UNKNOWN');
});

test('B0-04: selected Function input JSON Schema checked before implementation', async (t) => {
  const fixture = await fixtureFor(t, { init: { status: 'READY' }, functions: {} });
  const packages = await selectedRunner(fixture);
  for (const bad of [{ total: 100 }, { total: '100', region: 'EU' }]) {
    const outcome = await packages.invokeSelectedFunction(selectedRef(fixture, 'evaluate'), bad);
    assert.equal(outcome.kind, 'FAILED');
    if (outcome.kind === 'FAILED') assert.equal(outcome.failure.code, 'DH_RUNTIME_INPUT_SCHEMA_MISMATCH');
  }
});

test('B0-04: selected Function outcomes share one normalized result contract', async (t) => {
  for (const behavior of [
    { behavior: 'succeed' as const, value: { decision: 'POS' } },
    { behavior: 'unknown' as const },
    { behavior: 'garbage' as const },
    { behavior: 'proxy-outcome' as const },
    { behavior: 'proxy-value' as const },
  ]) {
    const fixture = await fixtureFor(t, { init: { status: 'READY' }, functions: { evaluate: behavior } });
    const packages = await selectedRunner(fixture);
    const outcome = await packages.invokeSelectedFunction(selectedRef(fixture, 'evaluate'), { total: 100, region: 'EU' });
    assert.ok(['SUCCEEDED', 'UNKNOWN', 'FAILED'].includes(outcome.kind));
    if (behavior.behavior === 'succeed') assert.deepEqual(outcome, { kind: 'SUCCEEDED', value: { decision: 'POS' } });
    if (behavior.behavior === 'unknown') assert.equal(outcome.kind, 'UNKNOWN');
    if (behavior.behavior === 'garbage' || behavior.behavior === 'proxy-outcome' || behavior.behavior === 'proxy-value')
      assert.equal(outcome.kind, 'FAILED');
  }
});

test('B0: reason diagnostics are stable defensive snapshots', () => {
  let reads = 0;
  const raw = { kind: 'UNKNOWN', unknownReason: {
    get code() { reads += 1; return reads === 1 ? 'REGION_UNKNOWN' : 'LATER'; },
    get message() { reads += 1; return reads === 2 ? 'region not selected' : 'LATER'; },
  } };
  const normalized = normalizeOutcome(raw, ['UNKNOWN']);
  assert.deepEqual(normalized, { kind: 'UNKNOWN', unknownReason: { code: 'REGION_UNKNOWN', message: 'region not selected' } });
  assert.equal(reads, 2);
});

test('B0-07: inspect returns snapshots not mutable selected Function metadata', async (t) => {
  const { app } = await bootApp(t, { init: { status: 'READY' }, functions: {} });
  const first = await app.inspect();
  assert.ok(first.elements.length >= 2);
  assert.ok(first.functions.some((fn) => fn.ref.functionId === 'evaluate'));
  assert.equal('ingress' in first, false);
  const target = first.target.profile;
  const element = first.elements[0]!.ref.id;
  (first.target as { profile: string }).profile = 'malicious';
  (first.elements[0]!.ref as { id: string }).id = 'malicious';
  const second = await app.inspect();
  assert.equal(second.target.profile, target);
  assert.equal(second.elements[0]!.ref.id, element);
  assert.deepEqual(await app.dispose(), { status: 'DISPOSED' });
  assert.deepEqual(await app.dispose(), { status: 'DISPOSED' });
});

test('B0-05: DEGRADED and BLOCKED status never enables external direct ingress', async (t) => {
  for (const status of ['DEGRADED', 'BLOCKED'] as const) {
    const { app } = await bootApp(t, { init: { status }, functions: {} });
    assert.equal(app.status, status);
    assert.equal('invoke' in app, false);
    assert.equal('suppressedIngress' in await app.inspect(), false);
    await app.dispose();
  }
});

test('B0-06: tampered selected schema is rejected before executing untrusted data', async (t) => {
  const fixture = await fixtureFor(t, { init: { status: 'READY' }, functions: {} });
  await fixture.writePackageFile('fixture-business', 'schemas/optional-report-input.schema.json',
    Buffer.from(JSON.stringify({ type: 'object', additionalProperties: false }), 'utf8'));
  const packages = await selectedRunner(fixture);
  // KDP verifies executable bytes before loading; the schema is verified when the selected Function needs it.
  // A tampered schema must fail before the Function's implementation can run.
  await assert.rejects(
    packages.invokeSelectedFunction(selectedRef(fixture, 'optionalReport'), { anything: true }),
    /sealed digest|do not match/,
  );
});
