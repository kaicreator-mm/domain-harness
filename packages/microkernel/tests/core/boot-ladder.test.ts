// 当前架构的可证伪测试：断言实际行为而非历史兼容。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { BootResult, BootstrapPin, ContentDigest } from '@kaicreator/domain-harness-contracts';
import {
  boot,
  buildFixtureInstall,
  digestOf,
  events,
  KDP_PACKAGE_ID,
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
    deepFreeze(pin);
    deepFreeze(context);
    const before = JSON.stringify([pin, context]);

    const result = await boot(pin, context);

    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') return;
    assert.equal(result.app.status, 'READY');
    assert.equal(JSON.stringify([pin, context]), before);
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

    const wrongEntry = { ...fixture.pin, invocationAbi: 'ordinary-json-function' } as unknown as BootstrapPin;
    assertRefused(await boot(wrongEntry, fixture.context), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();
  });
});

test('R127 Host ABI migration: previous Lock/Pin/InstallRecord versions are refused before KDP import', async (t) => {
  await withFixture(t, async (fixture) => {
    const oldPin = { ...fixture.pin, schemaVersion: 'dh.pin/0.11' } as unknown as BootstrapPin;
    assertRefused(await boot(oldPin, fixture.context), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();
  });
  await withFixture(t, async (fixture) => {
    const record = await fixture.readRecord();
    record['schemaVersion'] = 'dh.install/0.11';
    delete record['recordDigest'];
    record['recordDigest'] = digestOf(record);
    await fixture.writeRecord(record);
    assertRefused(await boot(fixture.pin, fixture.context), 'DH_BOOT_RECORD_INVALID');
    sideEffectFree();
  });
  await withFixture(t, async (fixture) => {
    const lock = JSON.parse((await fixture.readLockBytes()).toString('utf8')) as Record<string, unknown>;
    lock['schemaVersion'] = 'dh.lock/0.11';
    delete lock['closureDigest'];
    lock['closureDigest'] = digestOf(lock);
    await fixture.writeLockBytes(Buffer.from(JSON.stringify(lock), 'utf8'));
    const record = await fixture.readRecord();
    record['lockDigest'] = lock['closureDigest'];
    delete record['recordDigest'];
    record['recordDigest'] = digestOf(record);
    await fixture.writeRecord(record);
    const pin: BootstrapPin = {
      ...fixture.pin, lockDigest: lock['closureDigest'] as ContentDigest,
    };
    assertRefused(await boot(pin, fixture.context), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();
  });
});

test('R127: duplicate special Host ABI Function or malformed selected function graph refuses before execution', async (t) => {
  for (const mutation of ['duplicate-host', 'malformed-function'] as const) {
    await withFixture(t, async (fixture) => {
      const lock = JSON.parse((await fixture.readLockBytes()).toString('utf8')) as Record<string, unknown>;
      const functions = lock['selectedFunctions'] as Array<Record<string, unknown>>;
      if (mutation === 'duplicate-host') {
        const host = functions.find((entry) => entry['invocationAbi'] === 'kdp-host-init/1');
        assert.ok(host);
        functions.push({ ...structuredClone(host),
          ref: { ...(host['ref'] as Record<string, unknown>), functionId: 'another-host' } });
      } else {
        functions[0] = { ref: null };
      }
      delete lock['closureDigest'];
      lock['closureDigest'] = digestOf(lock);
      await fixture.writeLockBytes(Buffer.from(JSON.stringify(lock), 'utf8'));
      const record = await fixture.readRecord();
      record['lockDigest'] = lock['closureDigest'];
      delete record['recordDigest'];
      record['recordDigest'] = digestOf(record);
      await fixture.writeRecord(record);
      const pin = { ...fixture.pin, lockDigest: lock['closureDigest'] as ContentDigest };
      assertRefused(await boot(pin, fixture.context), 'DH_BOOT_PIN_MISMATCH');
      sideEffectFree();
    });
  }
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
    badDigest['appVersion'] = '9.9.9';
    await fixture.writeRecord(badDigest);
    assertRefused(await boot(fixture.pin, fixture.context), 'DH_BOOT_RECORD_INVALID');
    sideEffectFree();
  });
});

// JSON.parse 可接受指数溢出的数字，但可信摘要必须受控拒绝，禁止异常逃逸。
test('non-canonical installed record number is REFUSED with zero package side effects', async (t) => {
  await withFixture(t, async (fixture) => {
    const source = JSON.stringify(await fixture.readRecord());
    assert.ok(source.includes('"recordDigest":'));
    await fixture.writeRecordText(source.replace('"recordDigest":', '"unexpected":1e999,"recordDigest":'));
    assertRefused(await boot(fixture.pin, fixture.context), 'DH_BOOT_RECORD_INVALID');
    sideEffectFree();
  });
});

test('non-canonical Lock number is REFUSED with zero package side effects', async (t) => {
  await withFixture(t, async (fixture) => {
    const source = (await fixture.readLockBytes()).toString('utf8');
    assert.ok(source.includes('"closureDigest":'));
    await fixture.writeLockBytes(Buffer.from(source.replace('"closureDigest":', '"unexpected":1e999,"closureDigest":'), 'utf8'));
    assertRefused(await boot(fixture.pin, fixture.context), 'DH_BOOT_PIN_MISMATCH');
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

/** 受信根外的 KDP 软链接不得被 Lock 的旧字节摘要误认为合法安装。 */
test('Boot rejects external KDP package symlink before selected Init', async (t) => {
  await withFixture(t, async (fixture) => {
    const outside = await mkdtemp(join(tmpdir(), 'dh-kdp-outside-'));
    t.after(() => rm(outside, { recursive: true, force: true }));
    const selectedRoot = join(fixture.installRoot, 'node_modules', KDP_PACKAGE_ID);
    await cp(selectedRoot, outside, { recursive: true });
    await rm(selectedRoot, { recursive: true, force: true });
    await symlink(outside, selectedRoot, process.platform === 'win32' ? 'junction' : 'dir');

    const result = await boot(fixture.pin, fixture.context);
    assertRefused(result, 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();
  });
});

/** 真实 npm file:./packages/<id> 使用 node_modules 软链接，仍位于交付封存的目录。 */
test('Boot accepts selected in-root npm file-package symlink with exact pinned bytes', async (t) => {
  await withFixture(t, async (fixture) => {
    const selected = join(fixture.installRoot, 'node_modules', KDP_PACKAGE_ID);
    const sealedLocal = join(fixture.installRoot, 'packages', KDP_PACKAGE_ID);
    await mkdir(join(fixture.installRoot, 'packages'), { recursive: true });
    await cp(selected, sealedLocal, { recursive: true });
    await rm(selected, { recursive: true, force: true });
    await symlink(sealedLocal, selected, process.platform === 'win32' ? 'junction' : 'dir');

    const result = await boot(fixture.pin, fixture.context);
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status === 'BOOTED') await result.app.dispose();
  });
});

/** 即使物理 KDP 仍位于安装根内，重定向目录会改变 Node ESM 的 bare import 搜索路径。 */
test('Boot rejects in-root relocated KDP package before selected Init', async (t) => {
  await withFixture(t, async (fixture) => {
    const relocated = join(fixture.installRoot, 'store', 'relocated-kdp');
    await mkdir(join(fixture.installRoot, 'store'), { recursive: true });
    const selectedRoot = join(fixture.installRoot, 'node_modules', KDP_PACKAGE_ID);
    await cp(selectedRoot, relocated, { recursive: true });
    await rm(selectedRoot, { recursive: true, force: true });
    await symlink(relocated, selectedRoot, process.platform === 'win32' ? 'junction' : 'dir');

    const result = await boot(fixture.pin, fixture.context);
    assertRefused(result, 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();
  });
});

/** 只核验 SDK 安装来源的真实 Node 查找路径，不重新扫描 KDP JavaScript 源码。 */
for (const shadowKind of ['packages-parent', 'kdp-private'] as const) {
  test(`Boot rejects same-name SDK lookup shadow under ${shadowKind} before KDP evaluation`, async (t) => {
    await withFixture(t, async (fixture) => {
      const selectedRoot = join(fixture.installRoot, 'node_modules', KDP_PACKAGE_ID);
      const localRoot = join(fixture.installRoot, 'packages', KDP_PACKAGE_ID);
      await mkdir(join(fixture.installRoot, 'packages'), { recursive: true });
      await cp(selectedRoot, localRoot, { recursive: true });
      await rm(selectedRoot, { recursive: true, force: true });
      await symlink(localRoot, selectedRoot, process.platform === 'win32' ? 'junction' : 'dir');

      const shadowBase = shadowKind === 'packages-parent'
        ? join(fixture.installRoot, 'packages', 'node_modules')
        : join(localRoot, 'node_modules');
      const shadowName = shadowKind === 'packages-parent'
        ? 'domain-harness-microkernel'
        : 'domain-harness-contracts';
      const shadowRoot = join(shadowBase, '@kaicreator', shadowName);
      await mkdir(shadowRoot, { recursive: true });
      // 即使受选 KDP 自身的入口字节仍与 Lock 相同，Node 也可能优先找到此同名包。
      await writeFile(join(shadowRoot, 'package.json'),
        JSON.stringify({ name: `@kaicreator/${shadowName}`, version: '9.9.9', type: 'module' }));
      await writeFile(join(shadowRoot, 'index.js'),
        'globalThis.__untrustedSdkLookupExecuted = true;\\n');

      const result = await boot(fixture.pin, fixture.context);
      assertRefused(result, 'DH_BOOT_PIN_MISMATCH');
      sideEffectFree();
      assert.equal((globalThis as { __untrustedSdkLookupExecuted?: boolean }).__untrustedSdkLookupExecuted, undefined);
    });
  });
}

/** 修改真正受选 KDP Host ESM 后，Lock/Record/Pin 三方使用同一真实新字节摘要。 */
async function resealKdpHostEntry(fixture: FixtureInstall, source: string): Promise<BootstrapPin> {
  await fixture.writeKdpEntryBytes(Buffer.from(source, 'utf8'));
  const digest = `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}` as ContentDigest;
  const lock = JSON.parse((await fixture.readLockBytes()).toString('utf8')) as Record<string, unknown>;
  const selection = lock['selectedKdpHost'] as Record<string, unknown>;
  const module = selection['kdpInitModule'] as Record<string, unknown>;
  module['digest'] = digest;
  const functions = lock['selectedFunctions'] as Array<Record<string, unknown>>;
  const host = functions.find((fn) => fn['invocationAbi'] === 'kdp-host-init/1')!;
  ((host['implementation'] as Record<string, unknown>)['module'] as Record<string, unknown>)['digest'] = digest;
  (lock['resourceDigests'] as Record<string, unknown>)[`${KDP_PACKAGE_ID}/dist/index.js`] = digest;
  delete lock['closureDigest'];
  lock['closureDigest'] = digestOf(lock);

  const record = await fixture.readRecord();
  (record['kdpInitModule'] as Record<string, unknown>)['digest'] = digest;
  record['lockDigest'] = lock['closureDigest'];
  delete record['recordDigest'];
  record['recordDigest'] = digestOf(record);
  await fixture.writeRecord(record);
  await fixture.writeLockBytes(Buffer.from(JSON.stringify(lock), 'utf8'));
  return {
    ...fixture.pin,
    kdpInitModule: { ...fixture.pin.kdpInitModule, digest },
    lockDigest: lock['closureDigest'] as ContentDigest,
  };
}

test('R127: digest-consistent but non-callable KDP Init export is FAILED, never BOOTED', async (t) => {
  await withFixture(t, async (fixture) => {
    const pin = await resealKdpHostEntry(fixture, 'export const init = 1;\n');
    const result = await boot(pin, fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status === 'FAILED') assert.equal(result.code, 'DH_BOOT_KDP_ENTRY_INVALID');
    sideEffectFree();
  });
});

test('R129 P2: sealed KDP ESM evaluation throw is FAILED after side effects, before Host Init', async (t) => {
  await withFixture(t, async (fixture) => {
    const scope = globalThis as typeof globalThis & { __dhR129EsmEvaluated?: boolean };
    delete scope.__dhR129EsmEvaluated;
    t.after(() => { delete scope.__dhR129EsmEvaluated; });
    const source = [
      'globalThis.__dhR129EsmEvaluated = true;',
      "throw new Error('TOKEN_SECRET_IMPORT_EVAL_5027');",
      "export async function init() { throw new Error('Host Init must not be entered'); }",
      '',
    ].join('\n');
    const pin = await resealKdpHostEntry(fixture, source);
    const result = await boot(pin, fixture.context);
    assert.equal(result.status, 'FAILED', JSON.stringify(result));
    if (result.status !== 'FAILED') return;
    assert.equal(result.code, 'DH_BOOT_KDP_ENTRY_INVALID');
    assert.match(result.reason, /import\/evaluation/);
    assert.doesNotMatch(result.reason, /TOKEN_SECRET_IMPORT_EVAL_5027/);
    assert.equal(scope.__dhR129EsmEvaluated, true, 'selected ESM top-level did execute');
    assert.deepEqual(events().filter((event) => event['event'] === 'package-exit'), [],
      'Host Init was not invoked, so no Package.Exit should be fabricated');
    assert.deepEqual(events().filter((event) => event['event'] === 'business-init'), [],
      'no business initialization should be started');
  });
});

for (const candidate of [
  {
    name: 'pre-delegation throw',
    source: "export async function init() { throw new Error('TOKEN_SECRET_CANARY_8029'); }\n",
    expectedExits: ['fixture-kernel'],
    expectedCode: 'DH_KDP_PACKAGE_LOAD_FAILED',
  },
  {
    name: 'post-delegation throw',
    source: [
      "import { activateSelectedKdpHostInit } from '@kaicreator/domain-harness-microkernel';",
      "export async function init(context) {",
      "  await activateSelectedKdpHostInit(context);",
      "  throw new Error('TOKEN_SECRET_CANARY_8029');",
      "}",
      "",
    ].join('\n'),
    expectedExits: ['fixture-ext', 'fixture-business', '@fixture/sdk', 'fixture-kernel'],
    expectedCode: 'DH_KDP_PACKAGE_LOAD_FAILED',
  },
  {
    name: 'malformed BOOTED handle',
    source: "export function init() { return { status: 'BOOTED', app: {} }; }\n",
    expectedExits: ['fixture-kernel'],
    expectedCode: 'DH_KDP_PACKAGE_LOAD_FAILED',
  },
  {
    name: 'throwing Host return getter',
    source: "export function init() { return Object.defineProperty({}, 'status', { get() { throw new Error('TOKEN_SECRET_CANARY_8029'); } }); }\n",
    expectedExits: ['fixture-kernel'],
    expectedCode: 'DH_KDP_PACKAGE_LOAD_FAILED',
  },
  {
    name: 'Host-declared typed FAILED before delegation',
    source: "export function init() { return { status: 'FAILED', code: 'FIXTURE_HOST_DECLINED', reason: 'scoped failure' }; }\n",
    expectedExits: ['fixture-kernel'],
    expectedCode: 'FIXTURE_HOST_DECLINED',
  },
] as const) {
  test(`R128: selected Host ${candidate.name} is FAILED and exits every entered Package once`, async (t) => {
    await withFixture(t, async (fixture) => {
      const pin = await resealKdpHostEntry(fixture, candidate.source);
      const result = await boot(pin, fixture.context);
      assert.equal(result.status, 'FAILED', JSON.stringify(result));
      if (result.status !== 'FAILED') return;
      assert.equal(result.code, candidate.expectedCode);
      assert.doesNotMatch(result.reason, /TOKEN_SECRET_CANARY_8029/);
      assert.doesNotMatch(result.reason, /CLEANUP_NOT_SAFE|EXIT_FAILED/,
        'trusted selected Exit must remain runnable after Host failure');
      const exits = events().filter((event) => event['event'] === 'package-exit')
        .map((event) => event['package']);
      assert.deepEqual(exits, candidate.expectedExits, 'only actual Init entries Exit, in reverse order');
      assert.equal(exits.filter((id) => id === 'fixture-kernel').length, 1,
        'Kernel Host must Exit exactly once');
      if (candidate.name !== 'post-delegation throw') {
        assert.equal(events().filter((event) => event['event'] === 'business-init').length, 0,
          'failed Host before delegation must not reach Business');
      }
    });
  });
}

test('path substitution: traversal/absolute/out-of-root lock paths are REFUSED', async (t) => {
  await withFixture(t, async (fixture) => {
    const absolute = {
      ...fixture.context,
      lockPath: join(fixture.installRoot, ...LOCK_RELATIVE_PATH.split('/')),
    };
    assertRefused(await boot(fixture.pin, absolute), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();

    const swapped = { ...fixture.context, lockPath: 'dh-install/installed-record.json' };
    assertRefused(await boot(fixture.pin, swapped), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();

    const traversalPin = { ...fixture.pin, lockPath: '../outside/lock.json' };
    assertRefused(await boot(traversalPin, fixture.context), 'DH_BOOT_PIN_MISMATCH');
    sideEffectFree();

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
    const cyclicTarget: Record<string, unknown> = { runtime: 'node' };
    cyclicTarget['self'] = cyclicTarget;
    const cyclicPin = { ...fixture.pin, target: cyclicTarget } as unknown as typeof fixture.pin;
    const cyclicResult = await boot(cyclicPin, fixture.context);
    assertRefused(cyclicResult, 'DH_BOOT_PIN_MISMATCH');
    if (cyclicResult.status === 'REFUSED') {
      assert.match(cyclicResult.reason, /not plain serializable/);
    }
    sideEffectFree();

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

async function writeKdpManifestAndReseal(fixture: FixtureInstall, manifest: unknown): Promise<BootstrapPin> {
  await fixture.writeKdpManifest(manifest);
  const manifestBytes = await readFile(join(fixture.installRoot, 'node_modules', ...KDP_PACKAGE_ID.split('/'), 'package.json'));
  const manifestDigest = `sha256:${createHash('sha256').update(manifestBytes).digest('hex')}`;
  const lock = JSON.parse((await fixture.readLockBytes()).toString('utf8')) as Record<string, unknown>;
  const resources = lock['resourceDigests'] as Record<string, string>;
  resources[`${KDP_PACKAGE_ID}/package.json`] = manifestDigest;
  delete lock['closureDigest'];
  lock['closureDigest'] = digestOf(lock);
  await fixture.writeLockBytes(Buffer.from(JSON.stringify(lock), 'utf8'));
  const record = await fixture.readRecord();
  record['lockDigest'] = lock['closureDigest'];
  delete record['recordDigest'];
  record['recordDigest'] = digestOf(record);
  await fixture.writeRecord(record);
  return { ...fixture.pin, lockDigest: lock['closureDigest'] as ContentDigest };
}

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  Object.freeze(value);
}

test('KDP manifest exports conditions: nested node/import resolve, unresolvable shapes are typed entry-invalid', async (t) => {
  await withFixture(t, async (fixture) => {
    const nestedPin = await writeKdpManifestAndReseal(fixture, {
      name: KDP_PACKAGE_ID,
      version: '0.11.0',
      type: 'module',
      exports: { '.': { node: { import: './dist/index.js' } } },
    });
    const nested = await boot(nestedPin, fixture.context);
    assert.equal(nested.status, 'BOOTED', JSON.stringify(nested));
    if (nested.status === 'BOOTED') await nested.app.dispose();

    const orderedPin = await writeKdpManifestAndReseal(fixture, {
      name: KDP_PACKAGE_ID,
      version: '0.11.0',
      type: 'module',
      exports: { '.': { browser: './dist/nowhere.js', import: './dist/index.js' } },
    });
    const ordered = await boot(orderedPin, fixture.context);
    assert.equal(ordered.status, 'BOOTED', JSON.stringify(ordered));
    if (ordered.status === 'BOOTED') await ordered.app.dispose();

    const unresolvedPin = await writeKdpManifestAndReseal(fixture, {
      name: KDP_PACKAGE_ID,
      version: '0.11.0',
      type: 'module',
      exports: { '.': { browser: './TOKEN_SECRET_CANARY_8029.js' } },
    });
    const unresolved = await boot(unresolvedPin, fixture.context);
    assertRefused(unresolved, 'DH_BOOT_KDP_ENTRY_INVALID');
    if (unresolved.status === 'REFUSED') {
      assert.match(unresolved.reason, /node\/import\/default/);
      assert.doesNotMatch(unresolved.reason, /TOKEN_SECRET_CANARY_8029/);
    }
  });
});

test('digest-consistent Lock with malformed target/selectedKdpHost is a typed mismatch, not a TypeError', async (t) => {
  await withFixture(t, async (fixture) => {
    const lock = JSON.parse((await fixture.readLockBytes()).toString('utf8')) as Record<string, unknown>;
    delete lock['selectedKdpHost'];
    delete lock['closureDigest'];
    lock['closureDigest'] = digestOf(lock);

    const record = await fixture.readRecord();
    record['lockDigest'] = lock['closureDigest'];
    const recordBase = { ...record };
    delete recordBase['recordDigest'];
    record['recordDigest'] = digestOf(recordBase);
    await fixture.writeRecord(record);
    await fixture.writeLockBytes(Buffer.from(JSON.stringify(lock), 'utf8'));
    const pin = {
      ...fixture.pin,
      lockDigest: lock['closureDigest'] as ContentDigest,
    };

    const result = await boot(pin, fixture.context);
    assertRefused(result, 'DH_BOOT_PIN_MISMATCH');
    if (result.status === 'REFUSED') {
      assert.match(result.reason, /selectedKdpHost is malformed/);
    }
    sideEffectFree();
  });
});

test('pin and context are normalized once: second-read throwing Proxies cannot escape typed results', async (t) => {
  await withFixture(t, async (fixture) => {
    const reads = new Map<string, number>();
    const oneShotPin = new Proxy(structuredClone(fixture.pin), {
      get(target, key) {
        const count = (reads.get(String(key)) ?? 0) + 1;
        reads.set(String(key), count);
        if (count > 1) throw new Error('second pin read');
        return Reflect.get(target, key);
      },
    });
    const pinResult = await boot(oneShotPin as unknown as typeof fixture.pin, fixture.context);
    assert.equal(pinResult.status, 'BOOTED', JSON.stringify(pinResult));
    if (pinResult.status === 'BOOTED') await pinResult.app.dispose();

    const contextReads = new Map<string, number>();
    const oneShotContext = new Proxy(structuredClone(fixture.context), {
      get(target, key) {
        const count = (contextReads.get(String(key)) ?? 0) + 1;
        contextReads.set(String(key), count);
        if (count > 1) throw new Error('second context read');
        return Reflect.get(target, key);
      },
    });
    const contextResult = await boot(fixture.pin, oneShotContext as unknown as typeof fixture.context);
    assert.equal(contextResult.status, 'BOOTED', JSON.stringify(contextResult));
    if (contextResult.status === 'BOOTED') await contextResult.app.dispose();
  });
});
