// T008 (issue #594) J9: process-kill / reopen recovery on the REAL node store.
//
// Gold-standard restart semantics: a REAL child process opens the real SQLite
// store, drives the composed v0.6 turn loop to a durable boundary (acceptance +
// admission transition + effect journal + command outcome + observations, WAL /
// synchronous=FULL), prints BOUNDARY and is then SIGKILLed WITHOUT any clean
// close of its SQLite handles. A SECOND process reopens the same files, reads
// the durable facts left behind, replays the exact same message through the
// composed loop and verifies: no duplicate decision, no duplicate effect, no
// duplicate state mutation — the durable facts apply.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const WORKER = join(HERE, 'fixtures', 't594-kill-worker.mts');

interface T594KillResult {
  before: {
    instanceFound: boolean;
    stateRevision: number | null;
    lifecycle: string | null;
    disposition: string | null;
    outcomeStatus: string | null;
    journalRecords: number;
    observationRecords: number;
    observationKinds: string[];
    traceLines: number;
  };
  replay:
    | {
        kind: 'duplicate-ack';
        status: string;
        targetSequence: number;
        existingOutcomeStatus: string | null;
      }
    | { kind: string; unexpected: true };
  after: {
    stateRevision: number | null;
    journalRecords: number;
    observationRecords: number;
    traceLines: number;
  };
}

test('T008 J9: SIGKILLed process leaves committed facts intact; the reopening process replays with no duplicate decision/effect/state mutation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t594-kill-'));
  const tracePath = join(directory, 'effect-trace.jsonl');
  try {
    const killed = await killAtDurableBoundary(directory, tracePath);
    if (process.platform === 'win32') {
      assert.notEqual(killed.code, 0, `crash worker exited cleanly instead of being terminated: ${killed.stderr}`);
    } else {
      assert.equal(killed.signal, 'SIGKILL', `expected SIGKILL at the durable boundary: ${killed.stderr}`);
    }

    const result = resumeInSecondProcess(directory, tracePath);

    // The committed turn survived the unclean kill: one committed transition,
    // one processed disposition, one applied outcome, one journal record, one
    // external effect execution, and the acceptance was observed.
    assert.equal(result.before.instanceFound, true, 'the instance survived the SIGKILL');
    assert.equal(result.before.stateRevision, 1, 'exactly one committed transition survived');
    assert.equal(result.before.lifecycle, 'waiting');
    assert.equal(result.before.disposition, 'processed');
    assert.equal(result.before.outcomeStatus, 'applied');
    assert.equal(result.before.journalRecords, 1, 'exactly one admission effect journal record');
    assert.equal(result.before.traceLines, 1, 'exactly one external effect execution before the kill');
    assert.ok(
      result.before.observationKinds.includes('MESSAGE_ACCEPTED'),
      `the acceptance was durably observed (kinds: ${result.before.observationKinds.join(',')})`,
    );

    // The replay is a valid duplicate: original outcome reused, nothing doubled.
    assert.equal(result.replay.kind, 'duplicate-ack');
    if (result.replay.kind !== 'duplicate-ack') assert.fail('replay must be a duplicate ack');
    assert.equal(result.replay.status, 'duplicate');
    assert.equal(result.replay.targetSequence, 1);
    assert.equal(result.replay.existingOutcomeStatus, 'applied', 'the original outcome is reused');
    assert.equal(result.after.stateRevision, 1, 'no duplicate state mutation after replay');
    assert.equal(result.after.journalRecords, 1, 'no duplicate decision/journal record after replay');
    assert.equal(result.after.observationRecords, result.before.observationRecords, 'no duplicate observation');
    assert.equal(result.after.traceLines, 1, 'no duplicate external effect execution after replay');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function killAtDurableBoundary(
  directory: string,
  tracePath: string,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }> {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', WORKER, 'crash', directory, tracePath],
    {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  );

  let stdout = '';
  let stderr = '';
  let boundarySeen = false;
  let settled = false;

  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      rejectPromise(new Error(
        `T594 crash worker did not reach the durable boundary. stdout=${stdout} stderr=${stderr}`,
      ));
    }, 30_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (!boundarySeen && stdout.includes('BOUNDARY ')) {
        boundarySeen = true;
        child.kill('SIGKILL');
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!boundarySeen) {
        rejectPromise(new Error(
          `T594 crash worker exited before the durable boundary. code=${code} signal=${signal} stdout=${stdout} stderr=${stderr}`,
        ));
        return;
      }
      resolvePromise({ code, signal, stderr });
    });
  });
}

function resumeInSecondProcess(directory: string, tracePath: string): T594KillResult {
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', WORKER, 'resume', directory, tracePath],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: process.env,
    },
  );

  assert.equal(child.status, 0, `resume worker failed: ${child.stderr}`);
  const resultLine = child.stdout
    .split('\n')
    .find((line) => line.startsWith('RESULT '));
  assert.ok(resultLine, `resume worker emitted no RESULT: ${child.stdout}`);
  return JSON.parse(resultLine.slice('RESULT '.length)) as T594KillResult;
}
