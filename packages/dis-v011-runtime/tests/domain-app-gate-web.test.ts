import assert from 'node:assert/strict';
import test from 'node:test';

import { createDomainAppSession } from '../src/domain-app.ts';

test('DomainApp never exposes its raw FunctionInvoker outside the READY gate', async () => {
  let invoked = 0;
  const app = createDomainAppSession({
    app: { id: 'demo-app', init: () => {}, dispose: () => {} },
    invoker: {
      invoke: async () => { invoked += 1; return { status: 'COMPLETED', output: 'observed' }; },
    } as never,
  });
  assert.equal(Object.hasOwn(app, 'invoker'), false);
  assert.equal('invoker' in app, false);
  await assert.rejects(app.invoke({} as never), /APP_SESSION_INVALID_STATE/);
  assert.equal(invoked, 0);

  assert.equal((await app.start()).status, 'READY');
  assert.deepEqual(await app.invoke({} as never), { status: 'COMPLETED', output: 'observed' });
  assert.equal(invoked, 1);

  assert.equal((await app.stop()).status, 'STOPPED');
  await assert.rejects(app.invoke({} as never), /APP_SESSION_INVALID_STATE/);
  assert.equal(invoked, 1);
});

test('DomainApp stop does not dispose while its READY-gated invocation is in flight', async () => {
  const observed: string[] = [];
  let finish!: (value: unknown) => void;
  const app = createDomainAppSession({
    app: {
      id: 'demo-app',
      init: () => { observed.push('start'); },
      dispose: () => { observed.push('dispose'); },
    },
    invoker: {
      invoke: () => new Promise((resolve) => {
        observed.push('invoke');
        finish = resolve;
      }),
    } as never,
  });
  await app.start();
  const request = app.invoke({} as never);
  await Promise.resolve();
  await Promise.resolve();

  const stopping = app.stop();
  assert.equal(app.observe().state, 'STOPPING');
  assert.equal(observed.includes('dispose'), false);
  await assert.rejects(app.invoke({} as never), /APP_SESSION_INVALID_STATE/);
  finish({ status: 'COMPLETED', output: 1 });
  assert.deepEqual(await request, { status: 'COMPLETED', output: 1 });
  assert.equal((await stopping).status, 'STOPPED');
  assert.deepEqual(observed, ['start', 'invoke', 'dispose']);
});
