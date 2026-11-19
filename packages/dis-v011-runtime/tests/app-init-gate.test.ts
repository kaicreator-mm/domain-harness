import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppSessionError, createAppSession } from '../src/app-init/session.ts';
import type { AppLifecycleStep, AppSession } from '../src/app-init/session.ts';

const step = (id: string): AppLifecycleStep => ({ id, init: async () => {}, dispose: async () => {} });

const rejectsGate = (invoke: () => unknown, expectedDetail: string): void => {
  assert.throws(invoke, (error: unknown) => {
    if (!(error instanceof AppSessionError)) return false;
    return error.code === 'APP_SESSION_INVALID_STATE' && error.detail === expectedDetail;
  }, `expected an APP_SESSION_INVALID_STATE gate rejection with detail ${expectedDetail}`);
};

const startedSession = async (dispose?: () => Promise<void>): Promise<AppSession> => {
  const session = createAppSession({
    packages: [],
    app: { id: 'app.main', init: async () => {}, dispose: dispose ?? (async () => {}) },
  });
  const result = await session.start();
  assert.equal(result.status, 'READY');
  return session;
};

test('the state gate rejects stop and run in NEW before any init has run', () => {
  const session = createAppSession({ packages: [step('pkg.a')], app: step('app.main') });
  rejectsGate(() => session.run(() => 'too-early'), 'run:NEW');
  rejectsGate(() => session.stop(), 'stop:NEW');
  rejectsGate(() => session.run(async () => 'also-too-early'), 'run:NEW');
  assert.equal(session.observe().state, 'NEW', 'the rejected calls changed nothing');
});

test('duplicate start is rejected in READY, and start after dispose is rejected in STOPPED', async () => {
  const session = await startedSession();
  rejectsGate(() => session.start(), 'start:READY');
  const stopResult = await session.stop();
  assert.equal(stopResult.status, 'STOPPED');
  rejectsGate(() => session.start(), 'start:STOPPED');
  assert.equal(session.observe().state, 'STOPPED');
});

test('a concurrent start while the first is still starting is rejected before running any second init', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let initCalls = 0;
  const session = createAppSession({
    packages: [{ id: 'pkg.slow', init: async () => { initCalls += 1; await gate; }, dispose: async () => {} }],
    app: { id: 'app.main', init: async () => { initCalls += 1; }, dispose: async () => {} },
  });
  const first = session.start();
  rejectsGate(() => session.start(), 'start:STARTING');
  release();
  const result = await first;
  assert.equal(result.status, 'READY');
  assert.equal(initCalls, 2, 'the rejected second start must not execute any init callback');
});

test('calls during STOPPING are rejected: neither a second stop nor run may interleave', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let disposeCalls = 0;
  const session = await startedSession(async () => { disposeCalls += 1; await gate; });
  const stopping = session.stop();
  rejectsGate(() => session.stop(), 'stop:STOPPING');
  rejectsGate(() => session.run(() => 'mid-stop'), 'run:STOPPING');
  rejectsGate(() => session.start(), 'start:STOPPING');
  release();
  const result = await stopping;
  assert.equal(result.status, 'STOPPED');
  assert.equal(disposeCalls, 1);
  assert.equal(session.observe().state, 'STOPPED');
});

test('a FAILED session is terminal: start, stop and run are all rejected with the FAILED detail', async () => {
  const session = createAppSession({
    packages: [{ id: 'pkg.bad', init: async () => { throw new Error('init failed'); }, dispose: async () => {} }],
    app: step('app.main'),
  });
  const result = await session.start();
  assert.equal(result.status, 'FAILED');
  assert.equal(session.observe().state, 'FAILED');
  rejectsGate(() => session.start(), 'start:FAILED');
  rejectsGate(() => session.stop(), 'stop:FAILED');
  rejectsGate(() => session.run(() => 'after-failure'), 'run:FAILED');
});

test('single-shot dispose mode (default) rejects a repeat stop and never re-invokes disposes', async () => {
  let disposeCalls = 0;
  const session = await startedSession(async () => { disposeCalls += 1; });
  assert.equal(session.disposeMode, 'single-shot');
  const first = await session.stop();
  assert.equal(first.status, 'STOPPED');
  rejectsGate(() => session.stop(), 'stop:STOPPED');
  assert.equal(disposeCalls, 1, 'each dispose runs at most once per session');
});

test('idempotent dispose mode replays a repeat stop without re-invoking any dispose', async () => {
  let disposeCalls = 0;
  const session = createAppSession({
    disposeMode: 'idempotent',
    packages: [step('pkg.a')],
    app: { id: 'app.main', init: async () => {}, dispose: async () => { disposeCalls += 1; } },
  });
  assert.equal(session.disposeMode, 'idempotent');
  await session.start();
  const first = await session.stop();
  assert.equal(first.status, 'STOPPED');
  const second = await session.stop();
  assert.equal(second.status, 'STOPPED', 'the idempotent repeat stop succeeds');
  assert.equal(second, first, 'the recorded result is replayed, not recomputed');
  assert.deepEqual(second.disposed, first.disposed);
  assert.equal(disposeCalls, 1, 'idempotent stop must not invoke dispose callbacks again');
  // Idempotency covers stop only: the session stays single-use.
  rejectsGate(() => session.start(), 'start:STOPPED');
});

test('a non-function run callback is a configuration error, not a state error', async () => {
  const session = await startedSession();
  assert.throws(
    () => session.run('no' as unknown as () => string),
    (error: unknown) => error instanceof AppSessionError && error.code === 'APP_SESSION_CONFIGURATION_INVALID',
  );
  assert.equal(session.observe().state, 'READY');
});
