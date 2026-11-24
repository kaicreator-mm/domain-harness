import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CliElement } from '../../src/standard-cli.js';

const node = process.execPath;
const run = (source: string, cli = new CliElement()) => cli.run(node, ['-e', source]);

test('CLI 正常前台 stdout、字面参数与精确合计字节边界', async () => {
  const cli = new CliElement(5000, 5);
  assert.equal(await run('process.stdout.write("abc");process.stderr.write("xy")', cli), 'abc');
  assert.equal(await new CliElement().run(node, ['-e', 'process.stdout.write(process.argv[1])', 'x; & $y']), 'x; & $y');
});

test('CLI 拒绝非法限制、脱敏启动异常与退出错误', async () => {
  for (const n of [0, -1, 1.5, NaN, Infinity, 2_147_483_648]) {
    assert.throws(() => new CliElement(n), { message: 'CLI_INVALID_LIMIT' });
    assert.throws(() => new CliElement(100, n), { message: 'CLI_INVALID_LIMIT' });
  }
  await assert.rejects(new CliElement().run('dh-s04-no-such-executable', []), { message: 'CLI_SPAWN' });
  await assert.rejects(new CliElement().run(node, ['secret\0input']), { message: 'CLI_SPAWN' });
  await assert.rejects(run('console.error("PRIVATE_INPUT_MARKER");process.exit(7)'), { message: 'CLI_EXIT_7' });
});

test('CLI stdout/stderr 合计超限及独立并发调用', async () => {
  const cli = new CliElement(5000, 5);
  const [good, bad] = await Promise.allSettled([
    run('process.stdout.write("abc")', cli),
    run('process.stdout.write("abc");process.stderr.write("xyz")', cli),
  ]);
  assert.deepEqual(good, { status: 'fulfilled', value: 'abc' });
  assert.equal(bad.status, 'rejected');
  if (bad.status === 'rejected') assert.equal((bad.reason as Error).message, 'CLI_OUTPUT_LIMIT');
  assert.equal(await run('process.stdout.write("ok")', cli), 'ok');
});

test('CLI 超时终止前台直接进程', { timeout: 5000 }, async () => {
  await assert.rejects(run('setInterval(()=>{},1000)', new CliElement(200)), { message: 'CLI_TIMEOUT' });
});

for (const kind of ['success', 'nonzero', 'signal', 'overflow', 'timeout'] as const) {
  test(`Linux 前台进程组清理：${kind}`, { skip: process.platform !== 'linux', timeout: 7000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dh-std-cli-'));
    const late = join(root, 'late');
    const ready = join(root, 'ready');
    const pidFile = join(root, 'pid');
    const grand = 'const fs=require("node:fs");fs.writeFileSync(process.argv[2],"ready");setTimeout(()=>fs.writeFileSync(process.argv[1],"survived"),1800)';
    const action = {
      success: 'process.stdout.write("ok");process.exit(0)',
      nonzero: 'process.exit(7)',
      signal: 'process.kill(process.pid,"SIGTERM")',
      overflow: 'process.stdout.write("x".repeat(1000));setInterval(()=>{},1000)',
      timeout: 'setInterval(()=>{},1000)',
    }[kind];
    const leader = 'const fs=require("node:fs");const {spawn}=require("node:child_process");' +
      'fs.writeFileSync(process.argv[4],String(process.pid));' +
      'spawn(process.execPath,["-e",process.argv[1],process.argv[2],process.argv[3]],{stdio:"inherit"}).unref();' +
      'const poll=setInterval(()=>{if(!fs.existsSync(process.argv[3]))return;clearInterval(poll);' + action + '},10);';
    try {
      const result = new CliElement(kind === 'timeout' ? 900 : 4000, kind === 'overflow' ? 32 : 65536)
        .run(node, ['-e', leader, grand, late, ready, pidFile]);
      if (kind === 'success') assert.equal(await result, 'ok');
      else await assert.rejects(result, { message: {
        nonzero: 'CLI_EXIT_7', signal: 'CLI_EXIT_SIGNAL', overflow: 'CLI_OUTPUT_LIMIT', timeout: 'CLI_TIMEOUT',
      }[kind] });
      assert.equal(await readFile(ready, 'utf8'), 'ready');
      await delay(2000);
      await assert.rejects(readFile(late), { code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
