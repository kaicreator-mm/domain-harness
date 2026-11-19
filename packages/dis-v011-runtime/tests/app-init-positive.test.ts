import assert from 'node:assert/strict';
import { test } from 'node:test';
// app-init session is self-contained (no runtime relative imports), so tests
// consume the source directly under the strip-types runner (bounded idiom).
import { createAppSession, createAppSessionObserver } from '../src/app-init/session.ts';
import type { AppSessionObservation, AppLifecycleStep } from '../src/app-init/session.ts';

const recorder = (log: string[]): AppLifecycleStep => (id: string): AppLifecycleStep => ({
  id,
  init: async () => { log.push(id + ':init'); },
  dispose: async () => { log.push(id + ':dispose'); },
});

test('package inits run in order, the unique App Init runs last, READY admits calls, and stop disposes in reverse', async () => {
  const log: string[] = [];
  const step = recorder(log);
  const session = createAppSession({
    packages: [step('pkg.a'), step('pkg.b')],
    app: step('app.main'),
  });
  const startResult = await session.start();
  assert.equal(startResult.status, 'READY');
  assert.deepEqual(startResult.started, [
    { id: 'pkg.a', phase: 'package' },
    { id: 'pkg.b', phase: 'package' },
    { id: 'app.main', phase: 'app' },
  ], 'started records are the init execution order: packages first, then the unique App Init');
  assert.deepEqual(log, ['pkg.a:init', 'pkg.b:init', 'app.main:init'], 'init callbacks ran strictly in selected order');
  assert.equal(session.observe().state, 'READY');
  assert.equal(session.observe().ready, true);

  assert.equal(await session.run(async () => 'payload'), 'payload', 'READY admits upper-layer calls');
  assert.equal(await session.run(() => 41 + 1), 42);

  const stopResult = await session.stop();
  assert.equal(stopResult.status, 'STOPPED');
  assert.deepEqual(stopResult.disposed, [
    { id: 'app.main', phase: 'app' },
    { id: 'pkg.b', phase: 'package' },
    { id: 'pkg.a', phase: 'package' },
  ], 'dispose runs in exact reverse init order');
  assert.deepEqual(log.slice(3), ['app.main:dispose', 'pkg.b:dispose', 'pkg.a:dispose']);

  const closed = session.observe();
  assert.equal(closed.state, 'STOPPED');
  assert.equal(closed.ready, false);
  assert.equal(closed.closed, true);
});

test('a Basic App with zero package inits is a legal composition', async () => {
  const log: string[] = [];
  const step = recorder(log);
  const session = createAppSession({ packages: [], app: step('basic.app') });
  const startResult = await session.start();
  assert.equal(startResult.status, 'READY');
  assert.deepEqual(startResult.started, [{ id: 'basic.app', phase: 'app' }]);
  assert.deepEqual(log, ['basic.app:init']);
  assert.equal(await session.run(() => 'basic-ok'), 'basic-ok');
  const stopResult = await session.stop();
  assert.equal(stopResult.status, 'STOPPED');
  assert.deepEqual(stopResult.disposed, [{ id: 'basic.app', phase: 'app' }]);
  assert.deepEqual(log, ['basic.app:init', 'basic.app:dispose']);
});

test('the observer gate shows resources absent before init, present only while READY, and released after dispose', async () => {
  const observations: AppSessionObservation[] = [];
  const resources = new Set<string>();
  const session = createAppSession({
    packages: [{
      id: 'pkg.probe',
      init: async () => { observations.push(session.observe()); resources.add('probe'); },
      dispose: async () => { resources.delete('probe'); },
    }],
    app: {
      id: 'app.main',
      init: async () => { observations.push(session.observe()); },
      dispose: async () => {},
    },
  });
  const before = session.observe();
  assert.equal(before.state, 'NEW');
  assert.equal(before.ready, false);
  assert.equal(before.closed, false);
  assert.equal(resources.size, 0, 'no resource exists before any init ran');

  await session.start();
  assert.deepEqual(observations.map((observation) => observation.state), ['STARTING', 'STARTING'],
    'the observer sees the transitional state, never a premature READY');
  assert.equal(resources.has('probe'), true);
  assert.equal(session.observe().ready, true);

  await session.stop();
  assert.equal(resources.size, 0, 'resources are released after dispose');
  const after = session.observe();
  assert.equal(after.state, 'STOPPED');
  assert.equal(after.ready, false);
  assert.equal(after.closed, true);
});

test('createAppSessionObserver narrows the session to a read-only ready/closed gate', () => {
  const session = createAppSession({
    packages: [],
    app: { id: 'app.main', init: async () => {}, dispose: async () => {} },
  });
  const observer = createAppSessionObserver(session);
  assert.deepEqual(Object.keys(observer).sort(), ['observe'], 'the observer exposes the observation gate only');

  assert.equal(observer.observe().ready, false);
  assert.equal(observer.observe().closed, false);
});

test('observer snapshots are frozen and reflect later state transitions', async () => {
  const session = createAppSession({
    packages: [],
    app: { id: 'app.main', init: async () => {}, dispose: async () => {} },
  });
  const observer = createAppSessionObserver(session);
  const fresh = observer.observe();
  assert.throws(() => { (fresh as { state: string }).state = 'READY'; }, 'observation snapshots are frozen');
  assert.notEqual(observer.observe(), fresh, 'each observe() call returns an independent snapshot');

  await session.start();
  assert.equal(observer.observe().ready, true);
  await session.stop();
  assert.equal(observer.observe().closed, true);
  assert.equal(observer.observe().ready, false);
});

test('a throwing function call belongs to the caller: the session stays READY and remains stoppable', async () => {
  const log: string[] = [];
  const step = recorder(log);
  const session = createAppSession({ packages: [step('pkg.a')], app: step('app.main') });
  await session.start();
  await assert.rejects(
    session.run(async () => { throw new Error('call failed'); }),
    /call failed/,
  );
  assert.equal(session.observe().state, 'READY', 'a failed call must not tear down or fail the session');
  const stopResult = await session.stop();
  assert.equal(stopResult.status, 'STOPPED');
  assert.deepEqual(log.slice(2), ['app.main:dispose', 'pkg.a:dispose']);
});
