// 进程 Host Exit 交接：真实 EventEmitter，单次、有界、敏感信息不进入日志。
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { DomainApp } from '@kaicreator/domain-harness-contracts';
import { installProcessExitHandoff } from '../../src/process-exit.js';

class FakeProcess extends EventEmitter {
  readonly exitCodes: number[] = [];
  exit(code: number): void {
    this.exitCodes.push(code);
  }
}

function appWithDispose(dispose: () => Promise<{ readonly status: 'DISPOSED' }>): DomainApp {
  return {
    status: 'READY',
    invoke: async () => {
      throw new Error('invoke not used by process-exit fixture');
    },
    inspect: async () => {
      throw new Error('inspect not used by process-exit fixture');
    },
    dispose,
  } as DomainApp;
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.ok(predicate(), 'asynchronous process handoff did not finish in the test window');
}

test('normal beforeExit and SIGTERM each hand off to bounded Exit with success code', async (t) => {
  for (const event of ['beforeExit', 'SIGTERM'] as const) {
    let disposals = 0;
    const host = new FakeProcess();
    const app = appWithDispose(async () => {
      disposals += 1;
      return { status: 'DISPOSED' };
    });
    installProcessExitHandoff(app, host, 20);
    host.emit(event);
    await until(() => host.exitCodes.length === 1);
    assert.equal(disposals, 1);
    assert.deepEqual(host.exitCodes, [0]);
  }
  t.mock.restoreAll();
});

test('unhandledRejection is redacted, runs Exit once, and cannot race a later signal', async (t) => {
  let disposals = 0;
  const host = new FakeProcess();
  const logged: string[] = [];
  t.mock.method(console, 'error', (message?: unknown) => logged.push(String(message)));
  const app = appWithDispose(async () => {
    disposals += 1;
    return { status: 'DISPOSED' };
  });
  installProcessExitHandoff(app, host, 20);
  host.emit('unhandledRejection', new Error('TOKEN_SECRET_CANARY_8029'));
  await until(() => host.exitCodes.length === 1);
  host.emit('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(disposals, 1);
  assert.deepEqual(host.exitCodes, [1]);
  assert.equal(logged.some((line) => line.includes('TOKEN_SECRET_CANARY_8029')), false);
  assert.ok(logged.some((line) => line.includes('DH_RUNTIME_UNCAUGHT')));
});

test('a hanging Exit is bounded and terminates with the timeout category', async (t) => {
  const host = new FakeProcess();
  const logged: string[] = [];
  t.mock.method(console, 'error', (message?: unknown) => logged.push(String(message)));
  const app = appWithDispose(() => new Promise<{ readonly status: 'DISPOSED' }>(() => {}));
  installProcessExitHandoff(app, host, 5);
  host.emit('uncaughtException', new Error('TOKEN_SECRET_CANARY_8029'));
  await until(() => host.exitCodes.length === 1);
  assert.deepEqual(host.exitCodes, [1]);
  assert.ok(logged.some((line) => line.includes('DH_RUNTIME_EXIT_TIMEOUT')));
  assert.equal(logged.some((line) => line.includes('TOKEN_SECRET_CANARY_8029')), false);
});

test('explicit dispose removes only this adapter listeners and suppresses later process handoff', async () => {
  let disposals = 0;
  const host = new FakeProcess();
  const app = appWithDispose(async () => {
    disposals += 1;
    return { status: 'DISPOSED' };
  });
  const wrapped = installProcessExitHandoff(app, host, 20);
  await wrapped.dispose();
  host.emit('beforeExit');
  host.emit('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(disposals, 1);
  assert.deepEqual(host.exitCodes, []);
  assert.equal(host.listenerCount('beforeExit'), 0);
  assert.equal(host.listenerCount('SIGTERM'), 0);
  assert.equal(host.listenerCount('uncaughtException'), 0);
  assert.equal(host.listenerCount('unhandledRejection'), 0);
});
