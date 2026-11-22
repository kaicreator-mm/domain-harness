// 当前架构的可证伪测试：断言实际行为而非历史兼容。
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildFixtureInstall,
  DEFAULT_SCENARIO,
  digestOf,
  events,
  type FixtureInstall,
} from './helpers/install.js';
import { bootstrap, activateSelectedKdpHostInit } from '../../src/kdp.js';

async function withFixture(
  t: import('node:test').TestContext,
  run: (fixture: FixtureInstall) => Promise<void>,
): Promise<void> {
  const fixture = await buildFixtureInstall(DEFAULT_SCENARIO);
  t.after(async () => {
    await fixture.cleanup();
  });
  await run(fixture);
}

test('R124 selected KDP Host Init creates actual App without invoking a second ordinary Kernel Init', async (t) => {
  await withFixture(t, async (fixture) => {
    const result = await activateSelectedKdpHostInit(fixture.context);
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    assert.equal(result.app.status, 'READY');
    const initiated = events().filter((event) => event['event'] === 'package-init')
      .map((event) => event['package']);
    assert.deepEqual(initiated, ['@fixture/sdk', 'fixture-ext', 'fixture-business'],
      'actual Host KDP.Init must not be invoked through the ordinary Function loader again');
    await result.app.dispose();
    const exited = events().filter((event) => event['event'] === 'package-exit')
      .map((event) => event['package']);
    assert.deepEqual(exited,
      ['fixture-ext', 'fixture-business', '@fixture/sdk', 'fixture-kernel'],
      'selected KDP Exit remains the final teardown');
  });
});

test('R124 selected KDP Host Init failure cleans up Kernel after entered downstream Core', async (t) => {
  const fixture = await buildFixtureInstall({
    ...DEFAULT_SCENARIO, sdkInitThrow: true,
  });
  t.after(async () => fixture.cleanup());
  const result = await activateSelectedKdpHostInit(fixture.context);
  assert.equal(result.status, 'FAILED', JSON.stringify(result));
  if (result.status === 'FAILED') {
    assert.equal(result.code, 'DH_RUNTIME_NOT_READY');
  }
  assert.deepEqual(events().filter((event) => event['event'] === 'package-init')
    .map((event) => event['package']), ['@fixture/sdk']);
  assert.deepEqual(events().filter((event) => event['event'] === 'package-exit')
    .map((event) => event['package']), ['@fixture/sdk', 'fixture-kernel']);
});

test('R124 selected Host KDP failure after initial entry performs its Exit even before next Core', async (t) => {
  await withFixture(t, async (fixture) => {
    await fixture.writePackageFile('fixture-business', 'dist/index.mjs',
      Buffer.from('export async function init() { throw new Error("untrusted"); }\n', 'utf8'));
    const result = await activateSelectedKdpHostInit(fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    assert.equal(events().filter((event) => event['event'] === 'package-init').length, 0,
      'selected artifacts must be verified before ordinary Package.Init');
    assert.deepEqual(events().filter((event) => event['event'] === 'package-exit')
      .map((event) => event['package']), ['fixture-kernel'],
      'KDP has already been entered by Host and must be the only cleanup');
  });
});

test('R125 P1: Host Init entered before descriptor read, missing descriptor still runs exactly one KDP.Exit', async (t) => {
  await withFixture(t, async (fixture) => {
    await rm(join(fixture.installRoot, fixture.context.descriptorPath));
    const result = await activateSelectedKdpHostInit(fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status !== 'FAILED') return;
    assert.equal(result.code, 'DH_KDP_PACKAGE_LOAD_FAILED');
    assert.match(result.reason, /Descriptor file.*not readable/);
    assert.doesNotMatch(result.reason, /CLEANUP_NOT_SAFE/);
    assert.deepEqual(events().filter((event) => event['event'] === 'package-init'), []);
    assert.deepEqual(events().filter((event) => event['event'] === 'package-exit')
      .map((event) => event['package']), ['fixture-kernel']);
  });
});

test('R125 P1: Host Init entered before descriptor digest rejection, Kernel Exit remains last', async (t) => {
  await withFixture(t, async (fixture) => {
    await writeFile(join(fixture.installRoot, fixture.context.descriptorPath),
      JSON.stringify({ kind: 'DomainApp', id: 'changed-without-lock' }));
    const result = await activateSelectedKdpHostInit(fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status !== 'FAILED') return;
    assert.equal(result.code, 'DH_KDP_PACKAGE_LOAD_FAILED');
    assert.match(result.reason, /descriptorDigest/);
    assert.deepEqual(events().filter((event) => event['event'] === 'package-init'), []);
    assert.deepEqual(events().filter((event) => event['event'] === 'package-exit')
      .map((event) => event['package']), ['fixture-kernel']);
  });
});

test('R125 P1: Host environment failure after trusted install triggers KDP.Exit without other Init', async (t) => {
  await withFixture(t, async (fixture) => {
    const result = await activateSelectedKdpHostInit({
      ...fixture.context,
      env: { ...fixture.context.env, nodeMajor: 1 },
    });
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status !== 'FAILED') return;
    assert.equal(result.code, 'DH_RUNTIME_UNSUPPORTED_PROFILE');
    assert.deepEqual(events().filter((event) => event['event'] === 'package-init'), []);
    assert.deepEqual(events().filter((event) => event['event'] === 'package-exit')
      .map((event) => event['package']), ['fixture-kernel']);
  });
});

test('R125 P1: Host Init cannot execute unverified Kernel Exit when no trusted installation remains', async (t) => {
  await withFixture(t, async (fixture) => {
    await rm(join(fixture.installRoot, 'dh-install'), { recursive: true, force: true });
    const result = await activateSelectedKdpHostInit(fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status !== 'FAILED') return;
    assert.equal(result.code, 'DH_BOOT_RECORD_MISSING');
    assert.match(result.reason, /cleanup=CLEANUP_NOT_SAFE/);
    assert.deepEqual(events().filter((event) => event['event'] === 'package-init'), []);
    assert.deepEqual(events().filter((event) => event['event'] === 'package-exit'), [],
      'no unverified Lock/Exit target may be loaded to complete cleanup');
  });
});

test('direct bootstrap on a consistent install boots READY (same trust ladder as Boot)', async (t) => {
  await withFixture(t, async (fixture) => {
    const result = await bootstrap(fixture.context);
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    assert.equal(result.app.status, 'READY');
    await result.app.dispose();
  });
});

test('direct bootstrap with a self-signed Lock is FAILED (closure digest vs trusted record)', async (t) => {
  await withFixture(t, async (fixture) => {
    const lock = JSON.parse((await fixture.readLockBytes()).toString('utf8')) as Record<string, unknown>;
    const selectedPackages = lock['selectedPackages'] as Array<Record<string, unknown>>;
    // A syntactically valid, self-signed Lock mutation must still disagree with the trusted installed record.
    selectedPackages[0]!['version'] = '9.9.9';
    delete lock['closureDigest'];
    lock['closureDigest'] = digestOf(lock);
    await fixture.writeLockBytes(Buffer.from(JSON.stringify(lock), 'utf8'));

    const result = await bootstrap(fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status === 'FAILED') {
      assert.equal(result.code, 'DH_BOOT_PIN_MISMATCH');
      assert.match(result.reason, /record lockDigest/);
    }
    assert.equal(events().some((event) => event['event'] === 'business-init'), false);
  });
});

test('direct bootstrap with forged KDP entry bytes is FAILED (entry bytes vs trusted record)', async (t) => {
  await withFixture(t, async (fixture) => {
    const forged = [
      'export async function bootstrap() {',
      '  return { status: "BOOTED", app: { status: "READY", inspect: async () => ({}), dispose: async () => ({ status: "DISPOSED" }) } };',
      '}',
      '',
    ].join('\n');
    await fixture.writeKdpEntryBytes(Buffer.from(forged, 'utf8'));

    const result = await bootstrap(fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status === 'FAILED') {
      assert.equal(result.code, 'DH_BOOT_PIN_MISMATCH');
      assert.match(result.reason, /kdpPrimaryDigest/);
    }
    assert.equal(events().some((event) => event['event'] === 'business-init'), false);
  });
});

test('direct bootstrap with a removed installed record is FAILED (record is the trust anchor)', async (t) => {
  await withFixture(t, async (fixture) => {
    await rm(join(fixture.installRoot, 'dh-install'), { recursive: true, force: true });
    const result = await bootstrap(fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status === 'FAILED') {
      assert.equal(result.code, 'DH_BOOT_RECORD_MISSING');
    }
  });
});

test('direct bootstrap with a null/garbage context is typed FAILED, never a TypeError', async () => {
  for (const badContext of [null, undefined, 42]) {
    const result = await bootstrap(badContext as unknown as Parameters<typeof bootstrap>[0]);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status === 'FAILED') {
      assert.equal(result.code, 'DH_BOOT_RECORD_MISSING');
    }
  }
});
