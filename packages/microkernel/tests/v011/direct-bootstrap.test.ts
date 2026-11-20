/**
 * DomainHarness v0.11.0 T03 (#1577) — direct `bootstrap` trust-anchor
 * tests (DeepSeek REWORK P1).
 *
 * The KDP Primary is exported directly, so calling it WITHOUT Boot must
 * still enforce the full install-trust ladder (trusted installed record,
 * context path binding, Lock closure digest vs the record, and the actual
 * KDP entry bytes vs record.kdpPrimaryDigest). Self-signed Locks and
 * forged KDP artifacts must fail even on the direct path. Boot covers the
 * same helpers with REFUSED; here the ordinary-FAILED mapping is asserted.
 */
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
import { bootstrap } from '../../src/v011/kdp.js';

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
    // Attacker rewrites the Lock (self-signed: consistent own closureDigest)
    // but cannot rewrite the trusted installed record.
    const lock = JSON.parse((await fixture.readLockBytes()).toString('utf8')) as Record<string, unknown>;
    const ingress = lock['ingress'] as Array<Record<string, unknown>>;
    ingress.push({ id: 'forged-ingress', function: (lock['ingress'] as Array<Record<string, unknown>>)[0]?.['function'], optional: false });
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
    // A forged entry that would report a fake BOOTED app; the trusted
    // record's kdpPrimaryDigest still pins the REAL artifact bytes.
    const forged = [
      'export async function bootstrap() {',
      '  return { status: "BOOTED", app: { status: "READY", invoke: async () => ({ kind: "SUCCEEDED", value: 0 }), inspect: async () => ({}), dispose: async () => ({ status: "DISPOSED" }) } };',
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
