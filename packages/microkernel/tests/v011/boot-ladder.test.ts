/**
 * DomainHarness v0.11.0 T03 (#1577) — Boot verification ladder tests
 * (L2 §6.2/§6.3, AC05 negative half).
 *
 * Every REFUSED case asserts the exact frozen catalog code and that Boot
 * produced zero side effects: no module load events, no business events.
 * Fixtures are real on-disk installs (see helpers/install.ts) whose
 * InstalledRecord is the only trust anchor — never a caller payload.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { BootResult, BootstrapPin, ContentDigest } from '@kaicreator/domain-harness-contracts/v011';
import {
  boot,
  buildFixtureInstall,
  digestOf,
  events,
  LOCK_RELATIVE_PATH,
  type FixtureInstall,
} from './helpers/install.js';

async function withFixture(
  t: import('node:test').TestContext,
  run: (fixture: FixtureInstall) => Promise<void>,
): Promise<void> {
  const fixture = await buildFixtureInstall();
  t.after(async () => {
    await fixture.cleanup();
  });
  await run(fixture);
}

function assertRefused(result: BootResult, code: string): void {
  assert.equal(result.status, 'REFUSED', JSON.stringify(result));
  assert.equal(result.status === 'REFUSED' && result.code, code);
}

function sideEffectFree(): void {
  assert.deepEqual(
    events().filter((event) => event['event'] !== undefined),
    [],
    'REFUSED boot must produce zero package/business side effects',
  );
}

test('trusted positive: boot loads only the pinned KDP and boots the app READY', async (t) => {
  await withFixture(t, async (fixture) => {
    const pin = structuredClone(fixture.pin);
    const context = structuredClone(fixture.context);
    // Key guard: deeply frozen untrusted inputs must be accepted untouched.
    deepFreeze(pin);
    deepFreeze(context);
    const before = JSON.stringify([pin, context]);

    const result = await boot(pin, context);

    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    assert.equal(result.app.status, 'READY');
    // Mutation guard readback: boot never writes through its inputs.
    assert.equal(JSON.stringify([pin, context]), before);
    // Boot itself loaded nothing but the KDP entry: the first observable
    // event is the KDP-driven fixture kernel module evaluation.
    const names = events().map((event) => event['event']);
    assert.ok(!names.includes('business-init') || names.indexOf('module-evaluated') < names.indexOf('business-init'));
    await result.app.dispose();
  });
});

test('pin mismatch: any pin field disagreement is REFUSED with DH_BOOT_PIN_MISMATCH', async (t) => {
  await withFixture(t, async (fixture) => {
    const tampered = {
      ...fixture.pin,
      lockDigest: `sha256:${'0'.repeat(64)}` as ContentDigest,
    };
    const result = await boot(tampered, fixture.context);
    assertRefused(result, 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();

    const wrongEntry = { ...fixture.pin, kdpPrimaryEntry: 'notBootstrap' } as unknown as BootstrapPin;
    assertRefused(await boot(wrongEntry, fixture.context), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();
  });
});

test('missing record: absent installed-record.json is DH_BOOT_RECORD_MISSING', async (t) => {
  await withFixture(t, async (fixture) => {
    await rm(join(fixture.installRoot, 'dh-install'), { recursive: true, force: true });
    const result = await boot(fixture.pin, fixture.context);
    assertRefused(result, 'DH_BOOT_RECORD_MISSING');
    sideEffectFree();
  });
});

test('unreadable/parse-broken record is DH_BOOT_RECORD_MISSING, never a silent fallback', async (t) => {
  await withFixture(t, async (fixture) => {
    await fixture.writeRecordText('{not json');
    const result = await boot(fixture.pin, fixture.context);
    assertRefused(result, 'DH_BOOT_RECORD_MISSING');
    sideEffectFree();
  });
});

test('invalid record: wrong kind / wrong schemaVersion / broken recordDigest are DH_BOOT_RECORD_INVALID', async (t) => {
  await withFixture(t, async (fixture) => {
    const badKind = await fixture.readRecord();
    badKind['kind'] = 'SomethingElse';
    await fixture.writeRecord(badKind);
    assertRefused(await boot(fixture.pin, fixture.context), 'DH_BOOT_RECORD_INVALID');
    sideEffectFree();

    const badVersion = await fixture.readRecord();
    badVersion['schemaVersion'] = 'dh.install/0.99';
    await fixture.writeRecord(badVersion);
    assertRefused(await boot(fixture.pin, fixture.context), 'DH_BOOT_RECORD_INVALID');
    sideEffectFree();

    const badDigest = await fixture.readRecord();
    badDigest['appVersion'] = '9.9.9'; // content change without recordDigest update
    await fixture.writeRecord(badDigest);
    assertRefused(await boot(fixture.pin, fixture.context), 'DH_BOOT_RECORD_INVALID');
    sideEffectFree();
  });
});

test('one-byte Lock tamper: closure digest recomputation refuses with DH_BOOT_PIN_MISMATCH', async (t) => {
  await withFixture(t, async (fixture) => {
    const bytes = await fixture.readLockBytes();
    const flip = Buffer.from(bytes);
    flip[flip.length - 2] = flip[flip.length - 2] === 0x30 ? 0x31 : 0x30;
    assert.notDeepEqual(flip, bytes);
    await fixture.writeLockBytes(flip);
    const result = await boot(fixture.pin, fixture.context);
    assertRefused(result, 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();
  });
});

test('KDP artifact digest mismatch is DH_BOOT_PIN_MISMATCH', async (t) => {
  await withFixture(t, async (fixture) => {
    const bytes = await fixture.readKdpEntryBytes();
    const flip = Buffer.from(bytes);
    flip[0] = flip[0] === 0x2f ? 0x30 : 0x2f;
    await fixture.writeKdpEntryBytes(flip);
    const result = await boot(fixture.pin, fixture.context);
    assertRefused(result, 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();
  });
});

test('pinned entry without the named bootstrap export is DH_BOOT_KDP_ENTRY_INVALID', async (t) => {
  await withFixture(t, async (fixture) => {
    // Re-pin a valid digest chain over a bootstrap-less artifact (all three
    // of record/lock/pin updated consistently) so Boot reaches the entry
    // check itself. An uncoordinated artifact swap is stopped earlier by
    // the DH_BOOT_PIN_MISMATCH digest gate.
    const stub = 'export const notBootstrap = 1;\n';
    await fixture.writeKdpEntryBytes(Buffer.from(stub, 'utf8'));
    const stubDigest = `sha256:${createHash('sha256').update(stub, 'utf8').digest('hex')}` as ContentDigest;

    const lockBytes = await fixture.readLockBytes();
    const lock = JSON.parse(lockBytes.toString('utf8')) as Record<string, unknown>;
    const bootstrapKdpPin = lock['bootstrapKdpPin'] as Record<string, unknown>;
    bootstrapKdpPin['kdpPrimaryDigest'] = stubDigest;
    delete lock['closureDigest'];
    lock['closureDigest'] = digestOf(lock);

    const record = await fixture.readRecord();
    record['kdpPrimaryDigest'] = stubDigest;
    record['lockDigest'] = lock['closureDigest'];
    const recordBase = { ...record };
    delete recordBase['recordDigest'];
    record['recordDigest'] = digestOf(recordBase);
    await fixture.writeRecord(record);
    await fixture.writeLockBytes(Buffer.from(JSON.stringify(lock), 'utf8'));

    const pin = {
      ...fixture.pin,
      kdpPrimaryDigest: stubDigest,
      lockDigest: lock['closureDigest'] as ContentDigest,
    };
    const result = await boot(pin, fixture.context);
    assertRefused(result, 'DH_BOOT_KDP_ENTRY_INVALID');
    sideEffectFree();
  });
});

test('path substitution: traversal/absolute/out-of-root lock paths are REFUSED', async (t) => {
  await withFixture(t, async (fixture) => {
    // Absolute context.lockPath alias for the very same file is still refused.
    const absolute = {
      ...fixture.context,
      lockPath: join(fixture.installRoot, ...LOCK_RELATIVE_PATH.split('/')),
    };
    assertRefused(await boot(fixture.pin, absolute), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();

    // In-root substitution to a different file (the record itself) is refused.
    const swapped = { ...fixture.context, lockPath: 'dh-install/installed-record.json' };
    assertRefused(await boot(fixture.pin, swapped), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();

    // Traversal pin.lockPath never matches the record and never escapes.
    const traversalPin = { ...fixture.pin, lockPath: '../outside/lock.json' };
    assertRefused(await boot(traversalPin, fixture.context), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();

    // A record whose lockPath escapes the root cannot be booted either:
    // the pin comparison and the in-root resolution both refuse it.
    const record = await fixture.readRecord();
    record['lockPath'] = '../../outside.json';
    const recordBase = { ...record };
    delete recordBase['recordDigest'];
    record['recordDigest'] = digestOf(recordBase);
    await fixture.writeRecord(record);
    assertRefused(await boot(fixture.pin, fixture.context), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();
  });
});

test('missing or non-string installRoot is a typed REFUSED, never a TypeError', async (t) => {
  await withFixture(t, async (fixture) => {
    for (const badRoot of [undefined, null, 42, '']) {
      const context = { ...fixture.context, installRoot: badRoot } as unknown as typeof fixture.context;
      const result = await boot(fixture.pin, context);
      assertRefused(result, 'DH_BOOT_RECORD_MISSING');
      if (result.status === 'REFUSED') {
        assert.match(result.reason, /installRoot/);
      }
    }
    sideEffectFree();
  });
});

test('null/garbage boot context is a typed REFUSED, never a TypeError', async (t) => {
  await withFixture(t, async (fixture) => {
    for (const badContext of [null, undefined, 'nope', 42]) {
      const result = await boot(fixture.pin, badContext as unknown as typeof fixture.context);
      assertRefused(result, 'DH_BOOT_RECORD_MISSING');
    }
    sideEffectFree();
  });
});

test('cyclic or throwing pin values are typed REFUSED, never a TypeError', async (t) => {
  await withFixture(t, async (fixture) => {
    // Cyclic pin.target: canonicalJson would throw on the cycle.
    const cyclicTarget: Record<string, unknown> = { runtime: 'node' };
    cyclicTarget['self'] = cyclicTarget;
    const cyclicPin = { ...fixture.pin, target: cyclicTarget } as unknown as typeof fixture.pin;
    const cyclicResult = await boot(cyclicPin, fixture.context);
    assertRefused(cyclicResult, 'DH_BOOT_PIN_MISMATCH');
    if (cyclicResult.status === 'REFUSED') {
      assert.match(cyclicResult.reason, /not plain serializable/);
    }
    sideEffectFree();

    // Throwing-Proxy pin: reading any pin field throws.
    const evilPin = new Proxy(
      {},
      {
        get() {
          throw new Error('evil pin getter');
        },
      },
    );
    const proxyResult = await boot(evilPin as unknown as typeof fixture.pin, fixture.context);
    assertRefused(proxyResult, 'DH_BOOT_PIN_MISMATCH');
    if (proxyResult.status === 'REFUSED') {
      assert.match(proxyResult.reason, /could not be read/);
    }
    sideEffectFree();
  });
});

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  Object.freeze(value);
}
