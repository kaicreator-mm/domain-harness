// 当前架构的可证伪测试：断言实际行为而非历史兼容。
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
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
