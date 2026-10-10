// #457 N08–N10: the T-010 atomic provisioning seam under REAL multi-process
// SQLite contention. N08 races 8 independently spawned OS processes on one
// absolute database path and one provisioning key; N09 proves atomicity by
// breaking a REAL table at the covered boundary and asserting zero partial
// commits; N10 kills real worker processes with taskkill /F at verifiable
// barriers before/after the durable commit and reopens with a NEW process.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSuccessor, freshDbPath, openStore, rawSql, createNodeHost, fixedBusinessSnapshots, CRM_SNAPSHOT, HOST_MAXIMA, retainedLegacyPackage } from './helper.ts';
import { createNodeDomainRuntime } from '../../src/index.js';
import { StaticPackageRegistry } from '@kaicreator/domain-harness';

const CHILD = resolve(join(fileURLToPath(import.meta.url), '..', 'fixtures', 'child.ts'));
const LINE_SPLIT = String.fromCharCode(10);
const WORKERS = 8;

interface ChildOutcome {
  readonly pid: number;
  readonly instanceDisposition?: string;
  readonly provisioningDisposition?: string;
  readonly stateRevision?: number;
  /** Present when the child died through the fail-closed reporting entry (#953). */
  readonly error?: { readonly name: string; readonly message: string; readonly stack: string };
}

interface ChildResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly killed: boolean;
  readonly timedOut: boolean;
}

function runChild(
  args: readonly string[],
  options: { readonly killAt?: string; readonly killSignalFile?: string; readonly timeoutMs?: number } = {},
): Promise<ChildResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--import', 'tsx', CHILD, ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      // Strip the test-runner worker identity: a child of a `node --test`
      // parent must run as a plain process, not inherit NODE_TEST_CONTEXT.
      env: { ...process.env, NODE_TEST_CONTEXT: undefined, SX_BUSY_TIMEOUT_MS: '30000' },
    });
    // stdout stays pure machine-readable JSON; stderr is captured separately
    // so interleaved loader noise can never corrupt a report line, and stays
    // available verbatim for failure diagnostics (#953).
    let stdout = '';
    let stderr = '';
    let killed = false;
    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const watchdog = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      // #953: a hung worker used to hang the whole suite until the runner
      // timeout with zero diagnostics; kill it and let the reporting
      // assertions below surface the exit state plus captured output.
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* raced exit */
      }
    }, options.timeoutMs);
    if (options.killAt !== undefined && options.killSignalFile !== undefined) {
      const timer = setInterval(() => {
        if (!existsSync(options.killSignalFile!)) return;
        try {
          const stages = readFileSync(options.killSignalFile, 'utf8');
          if (!stages.includes(`${child.pid}:${options.killAt}`)) return;
          // Real OS kill per platform (prep N00: Windows taskkill /F /T,
          // POSIX PID-targeted SIGKILL).
          if (process.platform === 'win32') {
            execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
          } else {
            process.kill(child.pid, 'SIGKILL');
          }
          killed = true;
        } catch {
          /* raced exit */
        }
        clearInterval(timer);
      }, 25);
      child.on('exit', () => clearInterval(timer));
    }
    // Fires only when the process could not be spawned at all (the N08 race
    // loop retries exactly this class once; everything else resolves below).
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (watchdog !== undefined) clearTimeout(watchdog);
      resolvePromise({ code, stdout, stderr, killed, timedOut });
    });
  });
}

/** Parse the last machine-readable JSON line a worker printed, if any. */
function workerOutcome(stdout: string): ChildOutcome | undefined {
  const lines = stdout.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('{'));
  if (lines.length === 0) return undefined;
  return JSON.parse(lines[lines.length - 1]!) as ChildOutcome;
}

/** #953: full per-worker forensics for assertion failures — exit code, kill/timeout state, real stderr/stdout tails. */
function workerDiagnostics(result: ChildResult): Record<string, unknown> {
  return {
    code: result.code,
    killed: result.killed,
    timedOut: result.timedOut,
    stderrTail: result.stderr.slice(-2000),
    stdoutTail: result.stdout.slice(-2000),
  };
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
    const launch = (): Promise<ChildResult> => runChild(workerArgs, { timeoutMs: 120_000 });
    return launch().catch((error: unknown) => {
      // #953: runChild rejects ONLY when the OS could not spawn the process
      // at all — such a worker never touched the provisioning seam, so ONE
      // bounded retry cannot mask a genuine seam defect. Every other failure
      // class (structured worker error report, silent death, watchdog) fails
      // the assertions below with full diagnostics instead.
      console.error('N08_SPAWN_RETRY', index, String(error));
      return launch();
    });
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

  const reports = results.map((result) => ({ result, outcome: workerOutcome(result.stdout) }));
  const silent = reports.filter((report) => report.outcome === undefined);
  assert.equal(
    silent.length,
    0,
    `every worker must report a machine-readable outcome; silent workers with full diagnostics: ${JSON.stringify(silent.map((report) => workerDiagnostics(report.result)), null, 2)}`,
  );
  const errored = reports.filter((report) => report.outcome?.error !== undefined);
  assert.equal(
    errored.length,
    0,
    `no worker may fail; structured child errors with full diagnostics: ${JSON.stringify(errored.map((report) => ({ error: report.outcome?.error, ...workerDiagnostics(report.result) })), null, 2)}`,
  );
  const outcomes = reports.map((report) => report.outcome!);
  const created = outcomes.filter((outcome) => outcome.instanceDisposition === 'created');
  const existing = outcomes.filter((outcome) => outcome.instanceDisposition === 'existing');
  assert.equal(created.length, 1, 'exactly one worker materializes the instance');
  assert.equal(existing.length, WORKERS - 1, 'all other workers converge onto the existing instance');

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
  const firstOutcome = JSON.parse(first.stdout.split(LINE_SPLIT).filter((line) => line.startsWith('{')).pop()!) as ChildOutcome;
  assert.equal(firstOutcome.instanceDisposition, 'created');

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
  const replayOutcome = JSON.parse(replay.stdout.split(LINE_SPLIT).filter((line) => line.startsWith('{')).pop()!) as ChildOutcome;
  assert.equal(replayOutcome.instanceDisposition, 'existing');
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
      const retryOutcome = JSON.parse(
        retry.stdout.split('\n').filter((line) => line.startsWith('{')).pop()!,
      ) as ChildOutcome;
      if (stage === 'before-ensure') {
        assert.equal(retryOutcome.instanceDisposition, 'created', 'window A retry materializes cleanly');
      } else {
        assert.equal(retryOutcome.instanceDisposition, 'existing', 'window B retry returns the committed instance without reset');
        assert.equal(retryOutcome.stateRevision, 0, 'window B retry never resets progressed state');
      }

    });
  }
}, 300_000);
