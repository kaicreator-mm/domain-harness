// #953 (Controller 093, P1-01) — executable adversarial regressions proving
// the strict N08 worker oracle fails closed on every abnormal-worker class
// the Controller-092 reviewer demonstrated. The oracle under attack lives in
// ./worker-oracle.ts (assertHealthyWorkerReports): before this repair the
// historical assertions accepted a worker that printed valid JSON and then
// exited 137 or timed out. Two layers are exercised here:
//   1. synthetic ChildResult sets — the exact reviewer counterexamples plus
//      shape/pid/duplicate/count violations, deterministically;
//   2. REAL adversarial child processes (fixtures/adversarial-child.ts)
//      spawned through the same spawnReportedChild machinery as N08, so the
//      captured exit state (code/signal/killed/timedOut) is authentic.
// A positive control proves the harness still passes a genuinely healthy
// 8-worker set — hardening must never become unable to accept the truth.
import assert from 'node:assert/strict';
import test from 'node:test';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SpawnFailure,
  assertHealthyWorkerReports,
  spawnReportedChild,
  withSpawnOnlyRetry,
  type ChildResult,
} from './worker-oracle.ts';

const ADVERSARIAL_CHILD = resolve(join(fileURLToPath(import.meta.url), '..', 'fixtures', 'adversarial-child.ts'));

const SYNTHETIC_PID = 424242;

function syntheticResult(overrides: Partial<ChildResult> = {}): ChildResult {
  return {
    pid: SYNTHETIC_PID,
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
    killed: false,
    timedOut: false,
    ...overrides,
  };
}

function healthyReportLine(pid: number = SYNTHETIC_PID, disposition: string = 'existing'): string {
  return `${JSON.stringify({
    pid,
    instanceDisposition: disposition,
    provisioningDisposition: 'attached',
    stateRevision: 0,
  })}\n`;
}

/** The reviewer's 8-worker shape: one created, seven existing, all reporting. */
function healthyRace(): ChildResult[] {
  return Array.from({ length: 8 }, (_, index) =>
    syntheticResult({ stdout: healthyReportLine(SYNTHETIC_PID + index, index === 0 ? 'created' : 'existing'), pid: SYNTHETIC_PID + index }));
}

function expectOracleReject(results: readonly ChildResult[], pattern: RegExp, label: string): void {
  assert.throws(
    () => assertHealthyWorkerReports(results, { workers: results.length, created: 1, existing: results.length - 1 }),
    pattern,
    label,
  );
}

test('oracle accepts a genuinely healthy 8-worker set (positive control — no over-tightening)', () => {
  const outcomes = assertHealthyWorkerReports(healthyRace(), { workers: 8, created: 1, existing: 7 });
  assert.equal(outcomes.length, 8);
});

test('synthetic: valid report followed by exit 137 must FAIL (reviewer counterexample a)', () => {
  const race = healthyRace();
  race[7] = { ...race[7]!, code: 137 };
  expectOracleReject(race, /abnormal exit: code=137/, 'a worker reporting success JSON then exiting 137 must fail the oracle');
});

test('synthetic: valid report followed by watchdog timeout must FAIL (reviewer counterexample b)', () => {
  const race = healthyRace();
  race[7] = { ...race[7]!, code: null, timedOut: true };
  expectOracleReject(race, /timedOut=true/, 'a worker reporting success JSON then timing out must fail the oracle');
});

test('synthetic: valid report followed by OS kill must FAIL', () => {
  const race = healthyRace();
  race[7] = { ...race[7]!, code: null, signal: 'SIGKILL', killed: true };
  expectOracleReject(race, /killed=true/, 'a worker reporting success JSON then being killed must fail the oracle');
});

test('synthetic: silent worker must FAIL even on a clean exit', () => {
  const race = healthyRace();
  race[7] = { ...race[7]!, stdout: '' };
  expectOracleReject(race, /silent worker/, 'a worker printing nothing must fail the oracle');
});

test('synthetic: typed failure report must FAIL', () => {
  const race = healthyRace();
  race[7] = {
    ...race[7]!,
    code: 1,
    stdout: `${JSON.stringify({ pid: race[7]!.pid, error: { name: 'Error', message: 'boom', stack: '' } })}\n`,
  };
  expectOracleReject(race, /structured failure report/, 'a structured error envelope must fail the oracle');
});

test('synthetic: duplicated/replayed report lines must FAIL', () => {
  const race = healthyRace();
  race[7] = { ...race[7]!, stdout: healthyReportLine(race[7]!.pid) + healthyReportLine(race[7]!.pid) };
  expectOracleReject(race, /2 report lines/, 'two reports from one child must fail the oracle');
});

test('synthetic: pid-correlation forgery must FAIL', () => {
  const race = healthyRace();
  race[7] = { ...race[7]!, stdout: healthyReportLine(999999) };
  expectOracleReject(race, /pid correlation failed/, 'a report naming another pid must fail the oracle');
});

test('synthetic: malformed report shapes must FAIL', () => {
  const badDispositions = [
    healthyReportLine().replace('"existing"', '"bogus"'),
    JSON.stringify({ pid: SYNTHETIC_PID, instanceDisposition: 'existing' }),
    healthyReportLine().replace('"stateRevision":0', '"stateRevision":"zero"'),
    '{not json}\n',
  ];
  for (const stdout of badDispositions) {
    const race = healthyRace();
    race[7] = { ...race[7]!, stdout };
    expectOracleReject(race, /malformed report|unparsable report/, `malformed report ${stdout.slice(0, 60)} must fail the oracle`);
  }
});

test('synthetic: disposition-count violation must FAIL even with 8 healthy exits', () => {
  const race = healthyRace();
  race[6] = { ...race[6]!, stdout: healthyReportLine(race[6]!.pid, 'created') };
  expectOracleReject(race, /disposition counts must be exactly 1 created \/ 7 existing/, 'two creators must fail the oracle');
});

test('synthetic: dropped worker result must FAIL', () => {
  const race = healthyRace().slice(0, 7);
  assert.throws(
    () => assertHealthyWorkerReports(race, { workers: 8, created: 1, existing: 7 }),
    /worker-count/,
    'a lost result must fail the oracle',
  );
});

test('synthetic: spawn-only retry never replays a LAUNCHED worker', async () => {
  // A launch that RESOLVES with a failed worker must run exactly once — the
  // failure is returned unchanged for the oracle to reject, never retried.
  const failedWorker = { ...healthyRace()[7]!, code: 137 };
  let resolvedLaunches = 0;
  const resolved = await withSpawnOnlyRetry(() => {
    resolvedLaunches += 1;
    return Promise.resolve(failedWorker);
  });
  assert.equal(resolvedLaunches, 1, 'a launched worker must not be replayed');
  assert.equal(resolved, failedWorker, 'the failed result is handed back for the oracle to reject');

  // A genuine OS-level spawn failure (process never started) is retried once.
  let spawnAttempts = 0;
  const recovered = await withSpawnOnlyRetry(() => {
    spawnAttempts += 1;
    return spawnAttempts === 1 ? Promise.reject(new SpawnFailure('spawn ENOENT')) : Promise.resolve(failedWorker);
  });
  assert.equal(spawnAttempts, 2, 'exactly one bounded retry across a spawn failure');
  assert.equal(recovered, failedWorker);

  // Any other rejection propagates unretried.
  let genericAttempts = 0;
  await assert.rejects(
    withSpawnOnlyRetry(() => {
      genericAttempts += 1;
      return Promise.reject(new Error('not a spawn failure'));
    }),
    /not a spawn failure/,
  );
  assert.equal(genericAttempts, 1, 'non-spawn failures are never retried');
});

test('real adversarial child: valid report then exit 137 must FAIL the oracle', async () => {
  const result = await spawnReportedChild(ADVERSARIAL_CHILD, ['valid-then-exit', '137'], { timeoutMs: 60_000 });
  assert.equal(result.code, 137, 'the adversarial child really exited 137 after printing its report');
  assert.throws(
    () => assertHealthyWorkerReports([result], { workers: 1, created: 0, existing: 1 }),
    /abnormal exit: code=137/,
    'real valid-JSON-then-137 must fail the oracle',
  );
}, 90_000);

test('real adversarial child: valid report then watchdog timeout must FAIL the oracle', async () => {
  const result = await spawnReportedChild(ADVERSARIAL_CHILD, ['valid-then-hang'], { timeoutMs: 2_000 });
  assert.equal(result.timedOut, true, 'the adversarial child really hung until the watchdog killed it');
  assert.throws(
    () => assertHealthyWorkerReports([result], { workers: 1, created: 0, existing: 1 }),
    /abnormal exit/,
    'real valid-JSON-then-timeout must fail the oracle',
  );
}, 90_000);

test('real adversarial child: valid report then hard self-kill must FAIL the oracle', async () => {
  const result = await spawnReportedChild(ADVERSARIAL_CHILD, ['valid-then-selfkill'], { timeoutMs: 60_000 });
  assert.notEqual(result.code, 0, 'a self-killed child never exits 0');
  assert.throws(
    () => assertHealthyWorkerReports([result], { workers: 1, created: 0, existing: 1 }),
    /abnormal exit/,
    'real valid-JSON-then-kill must fail the oracle',
  );
}, 90_000);

test('real adversarial child: silent clean exit must FAIL the oracle', async () => {
  const result = await spawnReportedChild(ADVERSARIAL_CHILD, ['silent'], { timeoutMs: 60_000 });
  assert.equal(result.code, 0, 'the silent child really exits 0 — the report, not the exit, is what it withholds');
  assert.throws(
    () => assertHealthyWorkerReports([result], { workers: 1, created: 0, existing: 1 }),
    /silent worker/,
    'a real silent worker must fail the oracle',
  );
}, 90_000);

test('real adversarial child: typed failure envelope must FAIL the oracle', async () => {
  const result = await spawnReportedChild(ADVERSARIAL_CHILD, ['typed-failure'], { timeoutMs: 60_000 });
  assert.equal(result.code, 1, 'the typed-failure child exits 1 through the fail-closed entry');
  assert.throws(
    () => assertHealthyWorkerReports([result], { workers: 1, created: 0, existing: 1 }),
    /structured failure report/,
    'a real typed failure must fail the oracle',
  );
}, 90_000);

test('real adversarial child: forged pid correlation must FAIL the oracle', async () => {
  const result = await spawnReportedChild(ADVERSARIAL_CHILD, ['pid-mismatch'], { timeoutMs: 60_000 });
  assert.equal(result.code, 0, 'the forged-pid child itself exits cleanly — only the report lies');
  assert.throws(
    () => assertHealthyWorkerReports([result], { workers: 1, created: 0, existing: 1 }),
    /pid correlation failed/,
    'a report from the wrong pid must fail the oracle',
  );
}, 90_000);

test('real adversarial child: duplicated report lines must FAIL the oracle', async () => {
  const result = await spawnReportedChild(ADVERSARIAL_CHILD, ['multi-report'], { timeoutMs: 60_000 });
  assert.equal(result.code, 0, 'the duplicate-report child itself exits cleanly');
  assert.throws(
    () => assertHealthyWorkerReports([result], { workers: 1, created: 0, existing: 1 }),
    /2 report lines/,
    'two reports from one real child must fail the oracle',
  );
}, 90_000);
