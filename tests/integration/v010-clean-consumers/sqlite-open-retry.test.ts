/**
 * Deterministic unit tests for the #1209 shared-file SQLite open retry.
 *
 * The physical witness is the T11 clean-packed suite itself (two real
 * competing processes over one fresh rich-k.sqlite). These tests pin the
 * retry contract deterministically with an injected Database implementation:
 *   1. SQLITE_BUSY on the WAL transition is retried until one attempt fully
 *      configures; half-configured handles are closed, never leaked.
 *   2. exhaustion rethrows the ORIGINAL SQLITE_BUSY error (fail closed —
 *      never an invented typed code).
 *   3. non-BUSY open failures are never retried.
 *   4. a real file physically opens in WAL through the same helper.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// Plain .mjs example fixture without bundled types; tsx executes it directly.
// @ts-expect-error untyped fixture module
import { openSharedSqliteDatabase } from '../../../examples/v010-clean-consumer/runtime/sqlite-open.mjs';

interface FakeHandle {
  readonly calls: string[];
  closed: boolean;
  pragma(statement: string): unknown;
  exec(sql: string): void;
  close(): void;
}

type FakeDatabaseImpl = new (path: string) => FakeHandle;

const SCHEMA = 'CREATE TABLE IF NOT EXISTS docs (key TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL)';

function initialize(handle: FakeHandle): void {
  handle.pragma('journal_mode = WAL');
  handle.pragma('busy_timeout = 10000');
  handle.exec(SCHEMA);
}

function fakeDatabase(failuresBeforeSuccess: number, failure: () => Error): { DatabaseImpl: FakeDatabaseImpl; handles: FakeHandle[] } {
  const handles: FakeHandle[] = [];
  let remaining = failuresBeforeSuccess;
  const DatabaseImpl = function (this: unknown, _path: string): FakeHandle {
    const handle: FakeHandle = {
      calls: [],
      closed: false,
      pragma(statement: string): unknown {
        handle.calls.push(`pragma:${statement}`);
        if (statement === 'journal_mode = WAL' && remaining > 0) {
          remaining -= 1;
          throw failure();
        }
        return undefined;
      },
      exec(sql: string): void {
        handle.calls.push(`exec:${sql}`);
      },
      close(): void {
        handle.closed = true;
      },
    };
    handles.push(handle);
    return handle;
  };
  return { DatabaseImpl: DatabaseImpl as unknown as FakeDatabaseImpl, handles };
}

test('SQLITE_BUSY on the WAL transition is retried; the first fully configured handle wins', () => {
  const busy = (): Error => Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
  const { DatabaseImpl, handles } = fakeDatabase(2, busy);
  const sleeps: number[] = [];
  const db = openSharedSqliteDatabase('ignored', initialize, {
    DatabaseImpl,
    maxAttempts: 5,
    sleep: (ms: number) => {
      sleeps.push(ms);
    },
  }) as FakeHandle;
  assert.equal(db, handles[2], 'the returned handle must be the one attempt that configured fully');
  assert.equal(handles.length, 3);
  assert.deepEqual(handles.slice(0, 2).map((handle) => handle.closed), [true, true], 'half-configured handles must be closed');
  assert.equal(handles[2]!.closed, false);
  assert.deepEqual(handles[0]!.calls, ['pragma:journal_mode = WAL']);
  assert.deepEqual(handles[2]!.calls, ['pragma:journal_mode = WAL', 'pragma:busy_timeout = 10000', `exec:${SCHEMA}`]);
  assert.deepEqual(sleeps, [25, 50], 'linear backoff between attempts');
});

test('exhaustion rethrows the original SQLITE_BUSY (fail closed, no invented code)', () => {
  const original = Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
  const { DatabaseImpl, handles } = fakeDatabase(Number.POSITIVE_INFINITY, () => original);
  let thrown: unknown;
  try {
    openSharedSqliteDatabase('ignored', initialize, { DatabaseImpl, maxAttempts: 3, sleep: () => {} });
  } catch (error) {
    thrown = error;
  }
  assert.equal(thrown, original, 'the exact original error instance must propagate');
  assert.equal(handles.length, 3, 'exactly maxAttempts opens, no silent extra work');
  assert.deepEqual(handles.map((handle) => handle.closed), [true, true, true]);
});

test('a non-BUSY open failure is never retried', () => {
  const cantOpen = Object.assign(new Error('unable to open database file'), { code: 'SQLITE_CANTOPEN' });
  const { DatabaseImpl, handles } = fakeDatabase(Number.POSITIVE_INFINITY, () => cantOpen);
  assert.throws(
    () => openSharedSqliteDatabase('ignored', initialize, { DatabaseImpl, maxAttempts: 5, sleep: () => {} }),
    (error: unknown) => error === cantOpen,
  );
  assert.equal(handles.length, 1);
});

test('a real file physically opens in WAL through the helper', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dh-sqlite-open-'));
  try {
    const db = openSharedSqliteDatabase(join(dir, 'k.sqlite'), (handle: FakeHandle) => initialize(handle)) as {
      pragma(statement: string, options?: { simple: boolean }): unknown;
      prepare(sql: string): { run(...params: unknown[]): void; get(...params: unknown[]): { revision: number } | undefined };
      close(): void;
    };
    try {
      assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
      db.prepare('INSERT INTO docs (key, revision, value) VALUES (?, 0, ?)').run('k', '{}');
      assert.equal(db.prepare('SELECT revision FROM docs WHERE key = ?').get('k')?.revision, 0);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
