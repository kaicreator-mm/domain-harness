import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppSessionError, createAppSession } from '../src/app-init/session.ts';
import type { AppLifecycleStep, AppSessionConfig, AppSessionStartFailedResult } from '../src/app-init/session.ts';

const step = (id: string, overrides: Partial<AppLifecycleStep> = {}): AppLifecycleStep => ({
  id,
  init: async () => {},
  dispose: async () => {},
  ...overrides,
});

const isConfigurationInvalid = (error: unknown): boolean =>
  error instanceof AppSessionError && error.code === 'APP_SESSION_CONFIGURATION_INVALID';

test('a second App Init is rejected structurally: neither an app array nor an extra apps field is accepted', () => {
  const app = step('app.main');
  const second = step('app.second');
  // An `app` that is an array is an attempt to select two App Inits.
  assert.throws(
    () => createAppSession({ packages: [], app: [app, second] as unknown as AppLifecycleStep }),
    isConfigurationInvalid,
  );
  // A second App Init smuggled in through an extra field is rejected as an
  // unknown configuration key (no auto-discovery, no hot-plug).
  assert.throws(
    () => createAppSession({ packages: [], app, apps: [second] } as unknown as AppSessionConfig),
    isConfigurationInvalid,
  );
  // The accepted shape keeps exactly one App Init.
  const session = createAppSession({ packages: [], app });
  assert.equal(session.disposeMode, 'single-shot');
});

test('a package init failure disposes the already-started packages in reverse and reports FAILED with the real error', async () => {
  const log: string[] = [];
  const trace = (id: string): AppLifecycleStep => ({
    id,
    init: async () => { log.push(id + ':init'); },
    dispose: async () => { log.push(id + ':dispose'); },
  });
  const boom = new Error('pkg-c exploded');
  const session = createAppSession({
    packages: [
      trace('pkg.a'),
      trace('pkg.b'),
      { id: 'pkg.c', init: async () => { throw boom; }, dispose: async () => { log.push('pkg.c:dispose'); } },
    ],
    app: trace('app.main'),
  });
  const result = await session.start();
  assert.equal(result.status, 'FAILED');
  const failed = result as AppSessionStartFailedResult;
  assert.equal(failed.code, 'APP_SESSION_INIT_FAILED');
  assert.equal(failed.failedStepId, 'pkg.c');
  assert.equal(failed.failedPhase, 'package');
  assert.equal(failed.error, boom, 'the real thrown error is attached, not a synthesized one');
  assert.deepEqual(failed.disposed, [
    { id: 'pkg.b', phase: 'package' },
    { id: 'pkg.a', phase: 'package' },
  ], 'only the steps whose init completed are cleaned up, in reverse order');
  assert.deepEqual(failed.disposeErrors, [], 'no dispose failed during this cleanup');
  assert.deepEqual(log, ['pkg.a:init', 'pkg.b:init', 'pkg.b:dispose', 'pkg.a:dispose'],
    'the failing init and the App Init never complete, their disposes never run');
  const closed = session.observe();
  assert.equal(closed.state, 'FAILED');
  assert.equal(closed.closed, true);
  assert.equal(closed.ready, false);
});

test('an App Init failure disposes the packages in reverse and reports failedPhase app', async () => {
  const log: string[] = [];
  const trace = (id: string): AppLifecycleStep => ({
    id,
    init: async () => { log.push(id + ':init'); },
    dispose: async () => { log.push(id + ':dispose'); },
  });
  const boom = new Error('app init blew up');
  const session = createAppSession({
    packages: [trace('pkg.a'), trace('pkg.b')],
    app: { id: 'app.main', init: async () => { throw boom; }, dispose: async () => { log.push('app.main:dispose'); } },
  });
  const failed = (await session.start()) as AppSessionStartFailedResult;
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.code, 'APP_SESSION_INIT_FAILED');
  assert.equal(failed.failedStepId, 'app.main');
  assert.equal(failed.failedPhase, 'app');
  assert.equal(failed.error, boom);
  assert.deepEqual(failed.disposed, [
    { id: 'pkg.b', phase: 'package' },
    { id: 'pkg.a', phase: 'package' },
  ]);
  assert.deepEqual(failed.disposeErrors, []);
  assert.deepEqual(log, ['pkg.a:init', 'pkg.b:init', 'pkg.b:dispose', 'pkg.a:dispose'],
    'the App dispose never runs because the App Init never completed');
});

test('a throwing dispose during failure cleanup does not prevent the remaining dispose attempts', async () => {
  const log: string[] = [];
  const trace = (id: string): AppLifecycleStep => ({
    id,
    init: async () => { log.push(id + ':init'); },
    dispose: async () => { log.push(id + ':dispose'); },
  });
  const initFailure = new Error('pkg-c init failed');
  const disposeFailure = new Error('pkg-b dispose failed');
  const session = createAppSession({
    packages: [
      trace('pkg.a'),
      { id: 'pkg.b', init: trace('pkg.b').init, dispose: async () => { log.push('pkg.b:dispose'); throw disposeFailure; } },
      { id: 'pkg.c', init: async () => { throw initFailure; }, dispose: async () => {} },
    ],
    app: trace('app.main'),
  });
  const failed = (await session.start()) as AppSessionStartFailedResult;
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.code, 'APP_SESSION_INIT_FAILED');
  assert.equal(failed.error, initFailure, 'the first error stays the primary failure');
  assert.deepEqual(failed.disposed, [
    { id: 'pkg.b', phase: 'package' },
    { id: 'pkg.a', phase: 'package' },
  ], 'both cleanup disposes were attempted despite the first one throwing');
  assert.deepEqual(log, ['pkg.a:init', 'pkg.b:init', 'pkg.b:dispose', 'pkg.a:dispose']);
  assert.equal(failed.disposeErrors.length, 1);
  assert.equal(failed.disposeErrors[0].stepId, 'pkg.b');
  assert.equal(failed.disposeErrors[0].phase, 'package');
  assert.equal(failed.disposeErrors[0].error, disposeFailure);
  assert.equal(session.observe().state, 'FAILED');
});

test('a dispose failure during a normal stop still attempts the rest, then marks FAILED with structured dispose errors', async () => {
  const log: string[] = [];
  const trace = (id: string): AppLifecycleStep => ({
    id,
    init: async () => { log.push(id + ':init'); },
    dispose: async () => { log.push(id + ':dispose'); },
  });
  const disposeFailure = new Error('app.main dispose failed');
  const session = createAppSession({
    packages: [trace('pkg.a')],
    app: { id: 'app.main', init: trace('app.main').init, dispose: async () => { log.push('app.main:dispose'); throw disposeFailure; } },
  });
  await session.start();
  const result = await session.stop();
  assert.equal(result.status, 'FAILED');
  assert.equal(result.code, 'APP_SESSION_DISPOSE_FAILED', 'a throwing dispose must never fake a clean STOPPED');
  assert.equal(result.error, disposeFailure);
  assert.deepEqual(result.disposed, [
    { id: 'app.main', phase: 'app' },
    { id: 'pkg.a', phase: 'package' },
  ], 'the remaining dispose after the throwing one is still attempted');
  assert.deepEqual(log, ['pkg.a:init', 'app.main:init', 'app.main:dispose', 'pkg.a:dispose']);
  assert.equal(result.disposeErrors.length, 1);
  assert.equal(result.disposeErrors[0].stepId, 'app.main');
  assert.equal(result.disposeErrors[0].phase, 'app');
  assert.equal(result.disposeErrors[0].error, disposeFailure);
  const closed = session.observe();
  assert.equal(closed.state, 'FAILED');
  assert.equal(closed.closed, true);
});

test('configuration is fail-closed: malformed steps, duplicate ids and unknown dispose modes are rejected', () => {
  const app = step('app.main');
  assert.throws(() => createAppSession(null as unknown as AppSessionConfig), isConfigurationInvalid);
  assert.throws(() => createAppSession({} as unknown as AppSessionConfig), isConfigurationInvalid);
  assert.throws(() => createAppSession({ packages: 'no', app } as unknown as AppSessionConfig), isConfigurationInvalid);
  assert.throws(() => createAppSession({ packages: [], app: { id: '', init: async () => {}, dispose: async () => {} } }), isConfigurationInvalid);
  assert.throws(() => createAppSession({ packages: [], app: { id: 'app.main', init: 'no' as unknown as AppLifecycleStep['init'], dispose: async () => {} } }), isConfigurationInvalid);
  assert.throws(() => createAppSession({ packages: [], app: { id: 'app.main', init: async () => {}, dispose: undefined } as unknown as AppLifecycleStep }), isConfigurationInvalid);
  assert.throws(() => createAppSession({ packages: [step('dup'), step('dup')], app }), isConfigurationInvalid);
  assert.throws(() => createAppSession({ packages: [step('same')], app: step('same') }), isConfigurationInvalid);
  assert.throws(() => createAppSession({ packages: [], app, disposeMode: 'aggressive' } as unknown as AppSessionConfig), isConfigurationInvalid);
  assert.throws(() => createAppSession({ packages: [], app, extra: true } as unknown as AppSessionConfig), isConfigurationInvalid);
});
