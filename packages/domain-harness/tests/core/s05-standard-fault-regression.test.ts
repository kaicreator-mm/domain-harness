import assert from 'node:assert/strict';
import test from 'node:test';
import childProcess, { type ChildProcess, type SpawnOptions } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { CliElement } from '../../src/standard-cli.js';
import { KernelLifecycle } from '../../src/kernel-lifecycle.js';
import { StandardWorkflowSession } from '../../src/native-workflow-composition.js';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

test('协作取消的非成功结果与关联结果必须等待异步 end 收敛', { timeout: 5000 }, async () => {
  const app = new KernelLifecycle([{ packageMeta: { id: 'kdp', role: 'core', order: 0 } }]);
  await app.start({ appId: 'end-gate' });
  const entered = gate(), cancel = gate(), endEntered = gate(), endRelease = gate();
  const limits = { maxCalls: 3, maxSteps: 4, maxDepth: 0 };
  const events: string[] = [];
  const a = app.execute(() => new StandardWorkflowSession(limits).run(root => root.leaf({
    start: () => { events.push('start'); },
    run: async () => {
      entered.release();
      await cancel.promise;
      return { status: 'REJECT', reason: { code: 'CANCELLED', message: 'Cancelled' } };
    },
    end: async () => {
      events.push('end-enter'); endEntered.release();
      await endRelease.promise; events.push('end-exit');
    },
  })));
  const dependent = app.execute(async () => {
    const result = await a;
    events.push('dependent');
    return result;
  });
  let aSettled = false, dependentSettled = false;
  const aObserved = a.then(() => { aSettled = true; });
  const dependentObserved = dependent.then(() => { dependentSettled = true; });
  try {
    await entered.promise;
    cancel.release();
    await endEntered.promise;
    await nextTurn();
    assert.equal(aSettled, false);
    assert.equal(dependentSettled, false);
    const unrelated = await app.execute(() => new StandardWorkflowSession(limits).run(root =>
      root.invoke(() => { events.push('unrelated'); return 'done'; })));
    assert.deepEqual(unrelated, { status: 'COMPLETE', value: 'done' });
    assert.deepEqual(events, ['start', 'end-enter', 'unrelated']);
    endRelease.release();
    assert.deepEqual(await a, { status: 'REJECT', reason: { code: 'CANCELLED', message: 'Cancelled' } });
    assert.deepEqual(await dependent, await a);
    assert.deepEqual(events, ['start', 'end-enter', 'unrelated', 'end-exit', 'dependent']);
  } finally {
    cancel.release(); endRelease.release();
    await Promise.allSettled([a, dependent, aObserved, dependentObserved]);
    await app[Symbol.asyncDispose]();
  }
});

// 仅测试进程内受控故障注入；真实有界子进程，不替换 SDK，也不影响其他 PID。
for (const kind of ['cleanup', 'stream', 'reap'] as const) {
  test(`Linux CLI 持久故障反例：${kind}`, { skip: process.platform !== 'linux', timeout: 6000 }, async t => {
    const originalSpawn = childProcess.spawn;
    const originalKill = process.kill;
    let captured: ChildProcess | undefined;
    let exited: Promise<void> | undefined;
    let injected = 0;
    const spawnMock = t.mock.method(childProcess, 'spawn', ((file: string, args: readonly string[], options: SpawnOptions) => {
      const child = originalSpawn(file, args, options);
      captured = child;
      exited = new Promise<void>(resolve => { child.once('exit', () => resolve()); });
      if (kind === 'stream') child.once('spawn', () => {
        injected++;
        child.stdout?.emit('error', new Error('PRIVATE_STREAM_MARKER'));
      });
      return child;
    }) as typeof childProcess.spawn);
    const killMock = t.mock.method(process, 'kill', (pid: number, signal?: string | number) => {
      if (captured?.pid !== undefined && pid === -captured.pid && signal === 'SIGKILL') {
        if (kind === 'cleanup') {
          injected++;
          throw Object.assign(new Error('PRIVATE_PERMISSION_MARKER'), { code: 'EPERM' });
        }
        if (kind === 'reap') { injected++; return true; }
      }
      return originalKill(pid, signal);
    });
    syncBuiltinESMExports();
    try {
      const code = kind === 'cleanup' ? 'process.stdout.write("done")' : 'setTimeout(()=>{},1500)';
      await assert.rejects(new CliElement(kind === 'reap' ? 200 : 4000).run(process.execPath, ['-e', code]), {
        message: { cleanup: 'CLI_CLEANUP_FAILED', stream: 'CLI_STREAM', reap: 'CLI_REAP_TIMEOUT' }[kind],
      });
      assert.equal(injected, 1);
      assert.ok(captured?.pid !== undefined && exited !== undefined);
      if (kind === 'reap') {
        assert.equal(captured.exitCode, null);
        assert.equal(captured.signalCode, null);
      } else {
        await exited;
        assert.throws(() => originalKill(captured!.pid!, 0), { code: 'ESRCH' });
      }
    } finally {
      killMock.mock.restore(); spawnMock.mock.restore(); syncBuiltinESMExports();
      if (captured && captured.exitCode === null && captured.signalCode === null) captured.kill('SIGKILL');
      await exited;
    }
    if (captured?.pid !== undefined) assert.throws(() => originalKill(captured!.pid!, 0), { code: 'ESRCH' });
  });
}
