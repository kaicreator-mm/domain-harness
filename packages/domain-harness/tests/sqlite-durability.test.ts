import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SqliteStore } from '../src/persistence/index.js';
import type { StoredRun } from '../src/persistence/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');

function sampleRun(runId: string): StoredRun {
  return {
    runId,
    harnessId: 'durability',
    rootWorkflowId: 'main',
    status: 'running',
    input: { value: 1 },
    definitionHash: 'c'.repeat(64),
    executionEngineMajor: 5,
    controlState: {
      schemaVersion: 1,
      frames: [{
        workflowId: 'main',
        workflowInstanceId: 'root',
        stateId: 'first',
        visits: { first: 1 },
        lastDecisionAt: '2026-09-17T00:00:00.000Z',
      }],
    },
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
  };
}

function runAbruptWriter(dbPath: string, runId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', join(here, 'helpers', 'abrupt-exit-writer.ts'), dbPath, runId],
      { cwd: packageRoot },
    );
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? -1));
  });
}

test('rolls back multi-write transactions when the body throws', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-rollback-'));
  try {
    const store = new SqliteStore({ path: join(dir, 'runtime.sqlite') });
    const run = sampleRun('rollback-1');
    store.createRun(run);

    assert.throws(() => store.transaction(() => {
      store.updateRun(run.runId, { status: 'failed', updatedAt: '2026-09-17T00:00:01.000Z' });
      store.insertStartedStep({
        runId: run.runId,
        workflowInstanceId: 'root',
        stateId: 'first',
        visit: 1,
        kind: 'expr',
        attempt: 1,
        startedAt: '2026-09-17T00:00:01.000Z',
        input: { x: 1 },
        idempotencyKey: 'dh:v1:rollback',
      });
      throw new Error('boom');
    }), /boom/);

    assert.equal(store.getRun(run.runId)?.status, 'running');
    assert.equal(store.getStep({
      runId: run.runId,
      workflowInstanceId: 'root',
      stateId: 'first',
      visit: 1,
    }), null);
    assert.equal(store.db.inTransaction, false);
    store.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('committed writes survive an abrupt process exit and reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-abrupt-'));
  const path = join(dir, 'runtime.sqlite');
  try {
    const exitCode = await runAbruptWriter(path, 'run-abrupt');
    assert.notEqual(exitCode, 0, 'writer must exit abnormally');

    const reopened = new SqliteStore({ path });
    const run = reopened.getRun('run-abrupt');
    assert.ok(run, 'committed run must be recoverable after abrupt exit');
    assert.equal(run.status, 'running');
    assert.equal(run.definitionHash, 'b'.repeat(64));
    assert.equal(reopened.db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(reopened.db.pragma('synchronous', { simple: true }), 2);
    assert.equal(reopened.db.pragma('busy_timeout', { simple: true }), 5000);
    assert.equal(reopened.db.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(reopened.getStep({
      runId: 'run-abrupt',
      workflowInstanceId: 'root',
      stateId: 'first',
      visit: 1,
    })?.idempotencyKey, 'dh:v1:abrupt');

    reopened.updateRun('run-abrupt', { status: 'completed', updatedAt: '2026-09-17T00:00:02.000Z' });
    assert.equal(reopened.getRun('run-abrupt')?.status, 'completed');
    reopened.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

test('transaction is synchronous and returns the body value directly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-sync-'));
  try {
    const store = new SqliteStore({ path: join(dir, 'runtime.sqlite') });
    const result: unknown = store.transaction(() => 42);
    assert.equal(result, 42);
    assert.ok(!isPromise(result), 'transaction must not return a Promise');
    assert.equal(store.db.inTransaction, false);
    store.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
