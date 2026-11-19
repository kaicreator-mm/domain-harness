import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppSession, AppSessionError } from '../src/app-init/session.ts';

function makeSession(events: string[]) {
  return createAppSession({
    packages: [{
      id: 'business-package',
      init: () => { events.push('package-init'); },
      dispose: () => { events.push('package-dispose'); },
    }],
    app: {
      id: 'app-init',
      init: () => { events.push('app-init'); },
      dispose: () => { events.push('app-dispose'); },
    },
  });
}

test('stop waits for already-admitted asynchronous call before reverse cleanup', async () => {
  const events: string[] = [];
  const session = makeSession(events);
  assert.equal((await session.start()).status, 'READY');

  let release!: (value: string) => void;
  const pending = session.run(() => new Promise<string>((resolve) => {
    events.push('function-start');
    release = resolve;
  }));
  await Promise.resolve();
  assert.equal(events.at(-1), 'function-start');

  const stopping = session.stop();
  assert.equal(session.observe().state, 'STOPPING');
  assert.equal(events.includes('app-dispose'), false);
  assert.throws(() => session.run(async () => 'new-call'), AppSessionError);
  await Promise.resolve();
  assert.equal(events.includes('app-dispose'), false);

  release('observed');
  assert.equal(await pending, 'observed');
  const result = await stopping;
  assert.equal(result.status, 'STOPPED');
  assert.deepEqual(events, [
    'package-init', 'app-init', 'function-start', 'app-dispose', 'package-dispose',
  ]);
  assert.equal(session.observe().state, 'STOPPED');
});

test('rejected calls are drained and do not block resource cleanup', async () => {
  const events: string[] = [];
  const session = makeSession(events);
  await session.start();
  let rejectCall!: (reason: Error) => void;
  const first = session.run(() => new Promise<string>((_resolve, reject) => { rejectCall = reject; }));
  const rejection = assert.rejects(first, /expected failed call/);
  let finishCall!: () => void;
  const second = session.run(() => new Promise<void>((resolve) => { finishCall = resolve; }));
  await Promise.resolve();
  const stopping = session.stop();

  assert.equal(session.observe().state, 'STOPPING');
  assert.deepEqual(events, ['package-init', 'app-init']);
  rejectCall(new Error('expected failed call'));
  await rejection;
  assert.equal(events.includes('app-dispose'), false);
  finishCall();
  await second;
  assert.equal((await stopping).status, 'STOPPED');
  assert.deepEqual(events.slice(-2), ['app-dispose', 'package-dispose']);
});

test('run from NEW and after STOPPED is refused without invoking callback', async () => {
  const events: string[] = [];
  const session = makeSession(events);
  let called = 0;
  assert.throws(() => session.run(() => { called += 1; }), AppSessionError);
  assert.equal(called, 0);
  await session.start();
  await session.stop();
  assert.throws(() => session.run(() => { called += 1; }), AppSessionError);
  assert.equal(called, 0);
});

test('idempotent stop still replays the recorded result without repeated dispose', async () => {
  const events: string[] = [];
  const session = createAppSession({
    packages: [],
    app: { id: 'a', init: () => events.push('init'), dispose: () => events.push('dispose') },
    disposeMode: 'idempotent',
  });
  assert.equal((await session.start()).status, 'READY');
  const one = await session.stop();
  assert.equal(one.status, 'STOPPED');
  assert.equal(await session.stop(), one);
  assert.deepEqual(events, ['init', 'dispose']);
});
