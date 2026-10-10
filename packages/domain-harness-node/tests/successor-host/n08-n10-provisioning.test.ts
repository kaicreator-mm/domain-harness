// #457 N08–N10: the T-010 atomic provisioning seam under REAL multi-process
// SQLite contention. N08 races 8 independently spawned OS processes on one
// absolute database path and one provisioning key; N09 proves atomicity by
// breaking a REAL table at the covered boundary and asserting zero partial
// commits; N10 kills real worker processes with taskkill /F at verifiable
// barriers before/after the durable commit and reopens with a NEW process.
import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSuccessor, freshDbPath, openStore, rawSql, createNodeHost, fixedBusinessSnapshots, CRM_SNAPSHOT, HOST_MAXIMA, retainedLegacyPackage } from './helper.ts';
import { createNodeDomainRuntime } from '../../src/index.js';
import { StaticPackageRegistry } from '@kaicreator/domain-harness';
import { assertHealthyWorkerReports, spawnReportedChild, withSpawnOnlyRetry, type ChildResult } from './worker-oracle.ts';

const CHILD = resolve(join(fileURLToPath(import.meta.url), '..', 'fixtures', 'child.ts'));
const WORKERS = 8;

function runChild(args: readonly string[], options: Parameters<typeof spawnReportedChild>[2] = {}): Promise<ChildResult> {
  return spawnReportedChild(CHILD, args, options);
}

async function bootRuntimeOn(path: string, options: { readonly observation?: boolean } = {}) {
  const successor = compileSuccessor();
  const retained = await retainedLegacyPackage();
  const store = openStore(path);
  const runtime = await createNodeDomainRuntime({
    packageRegistry: new StaticPackageRegistry([
      retained,
      { manifest: successor.manifest, bindings: {}, domainData: successor.domainData },
    ], successor.manifest.packageId),
    store,
    bindings: createNodeHost(),
    businessSnapshots: fixedBusinessSnapshots(CRM_SNAPSHOT),
    supportedPackageDataBounds: { ...HOST_MAXIMA },
    now: () => '2026-10-01T00:00:00.000Z',
    ...(options.observation === true ? { observation: { mode: 'enabled' as const } } : {}),
  });
  return { runtime, store };
}

test('N08: 8 real OS processes racing one provisioning key converge to exactly one instance', async () => {
  const { path } = freshDbPath('n08');
  // Bootstrap schema and both packages once so children only race the seam.
  {
    const { store } = await bootRuntimeOn(path);
    store.close();
  }
  const spawnWorker = (index: number): Promise<ChildResult> => {
    const workerArgs = ['ensure', path, join(tmpdir(), `dh457-n08-marker-${index}`), 'sx:n08:key-42', 'n08-shared'];
    // #953 (P1-01): the retry is spawn-only — runChild rejects with
    // SpawnFailure exclusively when the OS could not start the process, so a
    // worker that never existed is relaunched once. Every LAUNCHED worker,
    // including one that printed a valid report and then exited 137 / was
    // killed / timed out, RESOLVES with its exit state and must fail the
    // strict oracle below with full diagnostics — it is never replayed.
    return withSpawnOnlyRetry(() => runChild(workerArgs, { timeoutMs: 120_000 }), `N08 worker ${index}`);
  };
  let results: readonly ChildResult[];
  try {
    // Staggered ramp-up (~1s window): the 8 ensure transactions still race
    // concurrently, but the tsx/migration startup storm on slower hosts no
    // longer trips busy timeouts before the race even begins.
    results = await Promise.all(Array.from({ length: WORKERS }, (_, index) =>
      new Promise<void>((resolveStagger) => {
        setTimeout(resolveStagger, index * 150);
      }).then(() => spawnWorker(index))));
  } catch (error) {
    console.error('N08_RACE_ERROR', error);
    throw error;
  }

  // #953 (P1-01) strict oracle: all 8 workers must have exited cleanly
  // (code 0, no signal, not killed, not timed out) AND printed exactly one
  // correctly shaped, pid-correlated, error-free report each — BEFORE the
  // disposition counts are even considered. A worker that reports success
  // JSON and then dies abnormally fails closed here.
  assertHealthyWorkerReports(results, { workers: WORKERS, created: 1, existing: WORKERS - 1 });

  const sql = rawSql(path);
  const keyRows = sql.rows('SELECT provisioning_key, record_json FROM dh_v3_provisioning_keys') as Array<{ provisioning_key: string; record_json: string }>;
  assert.equal(keyRows.length, 1, 'exactly one durable provisioning-key row');
  assert.equal(keyRows[0]!.provisioning_key, 'sx:n08:key-42');
  const keyRecord = JSON.parse(keyRows[0]!.record_json) as { packageId?: string };
  assert.equal(typeof keyRecord.packageId, 'string', 'the durable key record carries the exact package identity');
  const instanceRows = sql.rows('SELECT workflow_id, instance_key, state_revision FROM dh_v2_instances') as Array<{ workflow_id: string; instance_key: string; state_revision: number }>;
  assert.equal(instanceRows.length, 1, 'no duplicate instance row across 8 processes');
  assert.equal(instanceRows[0]!.instance_key, 'n08-shared');
  assert.equal(instanceRows[0]!.state_revision, 0, 'revision-0 snapshot, never auto-run');
  sql.close();
}, 240_000);

test('N08b: conflicting same-key ensure requests with a changed address fail closed deterministically', async () => {
  const { path } = freshDbPath('n08b');
  {
    const { store } = await bootRuntimeOn(path);
    store.close();
  }
  const first = await runChild(['ensure', path, join(tmpdir(), 'dh457-n08b-first'), 'sx:n08b:key', 'n08b-target'], { timeoutMs: 120_000 });
  assertHealthyWorkerReports([first], { workers: 1, created: 1, existing: 0 });

  const conflicting = await Promise.all([0, 1, 2, 3].map((index) =>
    runChild(['ensure', path, join(tmpdir(), `dh457-n08b-c${index}`), 'sx:n08b:key', `n08b-OTHER-${index}`], { timeoutMs: 120_000 })));
  for (const result of conflicting) {
    assert.notEqual(result.code, 0, 'a conflicting same-key request must fail closed');
    assert.match(result.stdout, /already/i, `failure names the conflicting provisioning key: ${result.stdout.slice(0, 200)}`);
  }

  const sql = rawSql(path);
  const instances = sql.rows('SELECT instance_key FROM dh_v2_instances');
  assert.equal(instances.length, 1, 'the conflicting requests left exactly the original instance');
  sql.close();

  // The EXACT original request still converges after the conflicts.
  const replay = await runChild(['ensure', path, join(tmpdir(), 'dh457-n08b-replay'), 'sx:n08b:key', 'n08b-target'], { timeoutMs: 120_000 });
  assertHealthyWorkerReports([replay], { workers: 1, created: 0, existing: 1 });
}, 180_000);

test('N09: a REAL durable-table failure at the covered boundary leaves zero partial commits', async () => {
  const { path } = freshDbPath('n09');
  {
    const { store } = await bootRuntimeOn(path, { observation: true });
    store.close();
  }
  // Break the REAL observation persistence table on a disposable database:
  // the covered ensure/open transaction must fail in full — no key row, no
  // instance row, no observation record survives.
  const breaker = rawSql(path);
  breaker.exec('DROP TABLE dh_v3_observation_records');
  breaker.close();

  const { runtime, store } = await bootRuntimeOn(path, { observation: true });
  await assert.rejects(
    runtime.provisioning?.status === 'ENABLED'
      ? runtime.provisioning.ensureOpen({
          provisioningKey: 'sx:n09:broken',
          address: { workflowId: 'parent', instanceKey: 'n09-1' },
          correlationId: 'corr-n09',
          input: { caseId: 'n09' },
        })
      : Promise.reject(new Error('provisioning not enabled')),
    (error: unknown) => error instanceof Error,
  );
  store.close();

  const sql = rawSql(path);
  const keys = sql.rows('SELECT provisioning_key FROM dh_v3_provisioning_keys WHERE provisioning_key = ?', 'sx:n09:broken');
  const instances = sql.rows("SELECT instance_key FROM dh_v2_instances WHERE instance_key = 'n09-1'");
  assert.equal(keys.length, 0, 'no orphan provisioning key after atomic failure');
  assert.equal(instances.length, 0, 'no partial instance after atomic failure');
  sql.close();

  // The same key on an INTACT database still works: the failure was the
  // injected table, not the seam.
  const { path: intactPath } = freshDbPath('n09-intact');
  const intact = await bootRuntimeOn(intactPath);
  const outcome = await intact.runtime.provisioning?.status === 'ENABLED'
    ? await intact.runtime.provisioning.ensureOpen({
        provisioningKey: 'sx:n09:ok',
        address: { workflowId: 'parent', instanceKey: 'n09-ok' },
        correlationId: 'corr-n09-ok',
        input: { caseId: 'ok' },
      })
    : null;
  assert.equal(outcome?.instanceDisposition, 'created');
  intact.store.close();
}, 120_000);

test('N10: real taskkill crash windows around the durable commit', async () => {
  // Rare local spawn races can make a worker die before its barrier marker
  // (observed once under heavy parallel load); one bounded retry per window
  // keeps the physical oracle stable without weakening any assertion.
  const runWindowWithRetry = async (runWindow: () => Promise<void>): Promise<void> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await runWindow();
        return;
      } catch (error) {
        if (attempt >= 1 || !/really killed/.test(String((error as Error).message))) throw error;
      }
    }
  };
  for (const stage of ['before-ensure', 'after-commit'] as const) {
    await runWindowWithRetry(async () => {
      const { path, dir } = freshDbPath(`n10-${stage}`);
      {
        const { store } = await bootRuntimeOn(path);
        store.close();
      }
      const marker = join(dir, 'stages.log');
      const killSignal = join(dir, 'kill-now');
      writeFileSync(killSignal, 'go');

      const killed = await runChild(
        ['ensure-armed', path, marker, stage, `sx:n10:${stage}`, `n10-${stage}`],
        { killAt: 'at-barrier', killSignalFile: marker, timeoutMs: 120_000 },
      );
      assert.equal(killed.killed, true, `${stage}: the worker was really killed by taskkill /F`);
      assert.notEqual(killed.code, 0, `${stage}: killed worker exits abnormally`);

      const sql = rawSql(path);
      const keys = sql.rows('SELECT provisioning_key FROM dh_v3_provisioning_keys');
      const instances = sql.rows('SELECT instance_key, state_revision FROM dh_v2_instances');
      if (stage === 'before-ensure') {
        assert.equal(keys.length, 0, 'window A: nothing durable was committed');
        assert.equal(instances.length, 0);
      } else {
        assert.equal(keys.length, 1, 'window B: the durable commit survived the kill');
        assert.equal(instances.length, 1);
        assert.equal((instances[0] as { state_revision: number }).state_revision, 0);
      }
      sql.close();

      // Reopen from a NEW OS process with the exact same request.
      const retry = await runChild(['ensure', path, join(dir, 'retry-marker'), `sx:n10:${stage}`, `n10-${stage}`], { timeoutMs: 120_000 });
      const retryOutcome = assertHealthyWorkerReports(
        [retry],
        stage === 'before-ensure' ? { workers: 1, created: 1, existing: 0 } : { workers: 1, created: 0, existing: 1 },
      )[0]!;
      if (stage === 'after-commit') {
        assert.equal(retryOutcome.stateRevision, 0, 'window B retry never resets progressed state');
      }

    });
  }
}, 300_000);
