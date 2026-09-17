import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { MIGRATIONS, SqliteStore } from '../src/persistence/index.js';
import type { StoredRun } from '../src/persistence/types.js';

async function withStore(fn: (store: SqliteStore, path: string) => void | Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-store-'));
  const path = join(dir, 'runtime.sqlite');
  const store = new SqliteStore({ path, busyTimeoutMs: 1234 });
  try {
    await fn(store, path);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
}

function sampleRun(): StoredRun {
  return {
    runId: 'run-1',
    harnessId: 'test',
    rootWorkflowId: 'main',
    status: 'running',
    input: { value: 1 },
    definitionHash: 'a'.repeat(64),
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

test('configures WAL/FULL and persists run + unique step identity', async () => {
  await withStore((store) => {
    assert.equal(store.db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(store.db.pragma('synchronous', { simple: true }), 2);
    assert.equal(store.db.pragma('busy_timeout', { simple: true }), 1234);

    const run = sampleRun();
    store.createRun(run);
    assert.deepEqual(store.getRun(run.runId), run);

    const step = {
      runId: run.runId,
      workflowInstanceId: 'root',
      stateId: 'first',
      visit: 1,
      kind: 'expr' as const,
      attempt: 1,
      startedAt: run.createdAt,
      input: { x: 1 },
      idempotencyKey: 'dh:v1:test',
    };
    store.insertStartedStep(step);
    assert.throws(() => store.insertStartedStep(step));
    assert.equal(store.completeStep(step, {
      status: 'completed',
      completedAt: '2026-09-17T00:00:01.000Z',
      output: { ok: true },
    }), true);
    assert.deepEqual(store.getStep(step)?.output, { ok: true });
  });
});

test('committed state survives close and reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-store-reopen-'));
  const path = join(dir, 'runtime.sqlite');
  try {
    const first = new SqliteStore({ path });
    const run = sampleRun();
    first.createRun(run);
    first.close();

    const reopened = new SqliteStore({ path });
    assert.equal(reopened.getRun(run.runId)?.definitionHash, run.definitionHash);
    reopened.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('migration v2 installs terminal-fencing triggers on a fresh database', async () => {
  await withStore((store) => {
    assert.equal(store.db.pragma('user_version', { simple: true }), MIGRATIONS.length);
    const run = sampleRun();
    store.createRun(run);
    store.updateRun(run.runId, { status: 'completed', updatedAt: '2026-09-17T00:00:02.000Z' });
    store.updateRun(run.runId, { status: 'running', updatedAt: '2026-09-17T00:00:03.000Z' });
    assert.equal(store.getRun(run.runId)?.status, 'completed');
  });
});

test('migration v2 upgrades an existing user_version=1 database in place', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-store-upgrade-'));
  const path = join(dir, 'runtime.sqlite');
  try {
    const legacy = new Database(path);
    legacy.pragma('journal_mode = WAL');
    legacy.exec(MIGRATIONS[0]!.sql);
    legacy.pragma('user_version = 1');
    legacy.close();

    const store = new SqliteStore({ path });
    assert.equal(store.db.pragma('user_version', { simple: true }), MIGRATIONS.length);
    const run = sampleRun();
    store.createRun(run);
    store.updateRun(run.runId, { status: 'cancelled', updatedAt: '2026-09-17T00:00:02.000Z' });
    store.updateRun(run.runId, { status: 'running', updatedAt: '2026-09-17T00:00:03.000Z' });
    assert.equal(store.getRun(run.runId)?.status, 'cancelled');
    store.insertStartedStep({
      runId: run.runId,
      workflowInstanceId: 'root',
      stateId: 'late',
      visit: 1,
      kind: 'tool',
      attempt: 1,
      startedAt: '2026-09-17T00:00:04.000Z',
      input: null,
      idempotencyKey: 'dh:v0.1:late',
    });
    assert.equal(store.getStep({
      runId: run.runId,
      workflowInstanceId: 'root',
      stateId: 'late',
      visit: 1,
    }), null, 'step inserts after a terminal Run must be fenced');
    store.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
