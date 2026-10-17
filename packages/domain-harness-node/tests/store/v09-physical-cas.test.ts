/**
 * v0.9 N02 (#1028) — focused physical transactional CAS semantics on REAL
 * SQLite file databases (Node24 + better-sqlite3, first selected cohort).
 *
 * Every DISPATCH-required semantic has at least one positive AND one negative
 * case: condition gate, parallel-writer CAS conflict (in-process and real
 * cross-process), transaction atomicity/rollback, close/reopen durability,
 * real child-process crash mid-transaction (WAL recovery), typed busy under
 * real cross-process lock contention, disk-unavailable (no false ACK),
 * explicit UNKNOWN classification, audience/currentness tuple atomicity, and
 * resource disposal. Child processes are bounded by explicit timeouts and
 * SIGKILL — no long-lived zombie processes.
 *
 * Windows discipline: every workspace registers ONE cleanup hook that closes
 * all tracked stores BEFORE removing the directory (node:test after hooks run
 * in registration order, and an open SQLite handle keeps the WAL files
 * locked), with a small bounded retry for transient EPERM on freshly closed
 * files.
 */

import assert from 'node:assert/strict';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { Readable } from 'node:stream';
import test from 'node:test';
import { probeV09PhysicalCasStore, V09CasStoreError } from '../../src/v09/physical-cas.js';
import {
  classifySqliteFailure,
  openV09SqlitePhysicalCasStore,
  V09_REGISTRY_DOCS_TABLE,
  type V09SqlitePhysicalCasStore,
} from '../../src/v09/sqlite-physical-cas.js';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Child with piped stdout/stderr and ignored stdin (what `stdio: ['ignore','pipe','pipe']` yields). */
type PipeChild = ChildProcessByStdio<null, Readable, Readable>;

interface ClosableStore {
  close(): Promise<unknown>;
}

/**
 * A real temp workspace whose single cleanup hook closes tracked stores
 * before removing the directory (an open SQLite handle keeps WAL files
 * locked on Windows), retrying removal briefly for fresh-close transients.
 */
function workspace(t: test.TestContext): { dir: string; track: (store: ClosableStore) => void } {
  const dir = mkdtempSync(join(tmpdir(), 'domain-harness-v09-n02-'));
  const stores: ClosableStore[] = [];
  t.after(async () => {
    for (const store of stores) {
      try {
        await store.close();
      } catch {
        // best effort: the rm below is the assertion that handles released
      }
    }
    for (let attempt = 0; ; attempt++) {
      try {
        rmSync(dir, { recursive: true, force: true });
        return;
      } catch (error) {
        if (attempt >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  });
  return { dir, track: (store: ClosableStore): void => void stores.push(store) };
}

async function openStore(path: string, busyTimeoutMs?: number): Promise<V09SqlitePhysicalCasStore> {
  return busyTimeoutMs === undefined
    ? openV09SqlitePhysicalCasStore({ path })
    : openV09SqlitePhysicalCasStore({ path, busyTimeoutMs });
}

function casErrorOf(error: unknown): V09CasStoreError {
  assert.ok(error instanceof V09CasStoreError, `expected V09CasStoreError, got ${String(error)}`);
  return error;
}

interface ChildOutcome {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
}

function toBuffer(chunk: string | Uint8Array): Buffer {
  return typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
}

async function waitForExit(child: PipeChild, timeoutMs: number, killOnTimeout: boolean): Promise<ChildOutcome> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: string | Uint8Array) => void stdout.push(toBuffer(chunk)));
  child.stderr.on('data', (chunk: string | Uint8Array) => void stderr.push(toBuffer(chunk)));
  const exited = new Promise<ChildOutcome>((resolve) => {
    child.once('exit', (exitCode, signal) => {
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode,
        signal,
      });
    });
  });
  const timer = setTimeout(() => {
    if (killOnTimeout) child.kill('SIGKILL');
  }, timeoutMs);
  try {
    return await exited;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve with the first stdout line containing `marker`, bounded by a timer that SIGKILLs the child. */
function waitForLine(child: PipeChild, marker: string, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`child did not print ${marker} within ${String(timeoutMs)}ms`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    const onData = (line: string): void => {
      if (settled) return;
      if (!line.includes(marker)) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      resolve(line.trim());
    };
    child.stdout.on('data', onData);
  });
}

const LAST_LINE = (stdout: string): string => {
  const lines = stdout.trim().split('\n');
  const last = lines.at(-1);
  assert.ok(last !== undefined && last.length > 0, `child produced no stdout (full: ${JSON.stringify(stdout)})`);
  return last;
};

const RACE_CHILD_SCRIPT = `
const module_ = await import(process.env.V09_MODULE_URL);
const store = await module_.openV09SqlitePhysicalCasStore({ path: process.env.V09_DB_PATH });
try {
  await store.put(process.env.V09_KEY, { writer: process.env.V09_WRITER }, { kind: 'create' });
  console.log(JSON.stringify({ writer: process.env.V09_WRITER, outcome: 'won' }));
} catch (error) {
  console.log(JSON.stringify({ writer: process.env.V09_WRITER, outcome: 'refused', code: error.code ?? 'UNCLASSIFIED' }));
}
await store.close();
`;

const LOCK_CHILD_SCRIPT = `
const Database = require('better-sqlite3');
const db = new Database(process.env.V09_DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
const insert = db.prepare('INSERT INTO ${V09_REGISTRY_DOCS_TABLE} (key, revision, value) VALUES (?, 0, ?)');
const tx = db.transaction(() => {
  insert.run(process.env.V09_STEP1_KEY, '"held-by-lock-child"');
  console.log('LOCKED_MID_TX');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.V09_HOLD_MS));
  insert.run(process.env.V09_STEP2_KEY, '"only-if-tx-commits"');
});
tx.immediate();
console.log('TX_DONE');
db.close();
`;

function spawnLockChild(dbPath: string, holdMs: number, step1Key: string, step2Key: string): PipeChild {
  return spawn(process.execPath, ['-e', LOCK_CHILD_SCRIPT], {
    cwd: PACKAGE_ROOT,
    env: {
      ...process.env,
      V09_DB_PATH: dbPath,
      V09_HOLD_MS: String(holdMs),
      V09_STEP1_KEY: step1Key,
      V09_STEP2_KEY: step2Key,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function spawnRaceChild(dbPath: string, key: string, writer: string, childScriptPath: string, moduleUrl: string): PipeChild {
  return spawn(process.execPath, ['--import', 'tsx', childScriptPath], {
    cwd: PACKAGE_ROOT,
    env: {
      ...process.env,
      V09_MODULE_URL: moduleUrl,
      V09_DB_PATH: dbPath,
      V09_KEY: key,
      V09_WRITER: writer,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('V09-CAS P: true-CAS probe sequence passes on the real SQLite store', async (t) => {
  const ws = workspace(t);
  const store = await openStore(join(ws.dir, 'registry.sqlite'));
  ws.track(store);
  await probeV09PhysicalCasStore(store);
});

test('V09-CAS N: condition gate — unconditional/malformed writes are typed refusals, junk values and keys rejected', async (t) => {
  const ws = workspace(t);
  const store = await openStore(join(ws.dir, 'registry.sqlite'));
  ws.track(store);

  assert.equal(await store.get('v09:gate'), null);
  const unconditional = await store.put('v09:gate', { a: 1 }, undefined as never).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(unconditional).code, 'condition_required', 'a write without a physical revision expectation does not exist');
  const badKind = await store.put('v09:gate', { a: 1 }, { kind: 'unconditional' } as never).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(badKind).code, 'condition_malformed');
  const floatRevision = await store.put('v09:gate', { a: 1 }, { kind: 'cas', revision: 1.5 }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(floatRevision).code, 'condition_malformed');
  const negativeRevision = await store.put('v09:gate', { a: 1 }, { kind: 'cas', revision: -1 }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(negativeRevision).code, 'condition_malformed');
  const emptyKey = await store.put('', { a: 1 }, { kind: 'create' }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(emptyKey).code, 'key_malformed');
  const undefinedValue = await store.put('v09:gate', undefined, { kind: 'create' }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(undefinedValue).code, 'value_not_json');
  // remove carries a revision CAS condition; a create-condition delete is refused.
  await store.put('v09:gate', { a: 1 }, { kind: 'create' });
  const createRemove = await store.remove('v09:gate', { kind: 'create' }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(createRemove).code, 'condition_malformed');
  // Nothing above silently wrote junk: exactly the one create landed.
  const only = await store.get('v09:gate');
  assert.deepEqual(only, { value: { a: 1 }, revision: 0 });
  // list filters by prefix, sorted.
  assert.deepEqual(await store.list('v09:'), ['v09:gate']);
  assert.deepEqual(await store.list('v09-absent:'), []);
});

test('V09-CAS P/N: create/CAS progression, typed conflicts carry expected/actual revisions, remove is revision-checked', async (t) => {
  const ws = workspace(t);
  const store = await openStore(join(ws.dir, 'registry.sqlite'));
  ws.track(store);

  const created = await store.put('v09:doc', { step: 1 }, { kind: 'create' });
  assert.deepEqual(created, { revision: 0 });
  const exists = await store.put('v09:doc', { step: 'x' }, { kind: 'create' }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(exists).code, 'already_exists');
  assert.equal(casErrorOf(exists).actualRevision, 0, 'create conflict reports the actual revision — nothing was overwritten');

  const advanced = await store.put('v09:doc', { step: 2 }, { kind: 'cas', revision: 0 });
  assert.deepEqual(advanced, { revision: 1 });

  const stale = await store.put('v09:doc', { step: 'stale' }, { kind: 'cas', revision: 0 }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(stale).code, 'revision_conflict');
  assert.equal(casErrorOf(stale).expectedRevision, 0);
  assert.equal(casErrorOf(stale).actualRevision, 1);
  assert.equal(casErrorOf(stale).indeterminate, false, 'conflicts are determinate: nothing was written');

  const onAbsent = await store.put('v09:never-created', { x: 1 }, { kind: 'cas', revision: 4 }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(onAbsent).code, 'revision_conflict');
  assert.equal(casErrorOf(onAbsent).expectedRevision, 4);
  assert.equal(casErrorOf(onAbsent).actualRevision, undefined, 'absent key conflicts omit actualRevision');

  await store.remove('v09:doc', { kind: 'cas', revision: 1 });
  assert.equal(await store.get('v09:doc'), null);
  const staleRemove = await store.remove('v09:doc', { kind: 'cas', revision: 1 }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(staleRemove).code, 'revision_conflict');
});

test('V09-CAS P/N: parallel in-process writers race the same CAS revision — exactly one wins, loser typed, no silent overwrite', async (t) => {
  const ws = workspace(t);
  const dbPath = join(ws.dir, 'registry.sqlite');
  const writerA = await openStore(dbPath);
  const writerB = await openStore(dbPath);
  ws.track(writerA);
  ws.track(writerB);
  await writerA.put('v09:race', { holder: 'init' }, { kind: 'create' });

  const settled = await Promise.allSettled([
    writerA.put('v09:race', { holder: 'A' }, { kind: 'cas', revision: 0 }),
    writerB.put('v09:race', { holder: 'B' }, { kind: 'cas', revision: 0 }),
  ]);
  const winners = settled.filter((s) => s.status === 'fulfilled');
  const losers = settled.filter((s) => s.status === 'rejected');
  assert.equal(winners.length, 1, 'exactly one CAS writer wins');
  assert.equal(losers.length, 1);
  assert.equal(casErrorOf((losers[0] as PromiseRejectedResult).reason).code, 'revision_conflict');

  const state = await writerA.get('v09:race');
  assert.ok(state !== null && state.revision === 1, 'the winner advanced the physical revision by exactly one');
  const holder = (state.value as { holder: string }).holder;
  assert.ok(holder === 'A' || holder === 'B', `the physical document equals exactly one full winner payload (got ${holder})`);
});

test('V09-CAS P/N: real cross-process create race — exactly one process wins, loser typed, physical value equals winner payload', async (t) => {
  const ws = workspace(t);
  const dbPath = join(ws.dir, 'registry.sqlite');
  const parentStore = await openStore(dbPath);
  ws.track(parentStore);

  // The child runs the REAL typed store (tsx-loaded .ts module) as a separate OS process.
  const childScriptPath = join(ws.dir, 'race-child.mts');
  writeFileSync(childScriptPath, RACE_CHILD_SCRIPT);
  const moduleUrl = pathToFileURL(join(PACKAGE_ROOT, 'src', 'v09', 'sqlite-physical-cas.ts')).href;

  const children = ['A', 'B'].map((writer) => spawnRaceChild(dbPath, 'v09:cross-process-race', writer, childScriptPath, moduleUrl));
  const outcomes = await Promise.all(children.map((child) => waitForExit(child, 30_000, true)));
  for (const [index, outcome] of outcomes.entries()) {
    assert.equal(outcome.exitCode, 0, `race child ${String(index)} exited cleanly (stderr: ${outcome.stderr})`);
  }
  const reports = outcomes.map((outcome) => JSON.parse(LAST_LINE(outcome.stdout)) as { writer: string; outcome: string; code?: string });
  const won = reports.filter((report) => report.outcome === 'won');
  const refused = reports.filter((report) => report.outcome === 'refused');
  assert.equal(won.length, 1, `exactly one cross-process create wins (reports: ${JSON.stringify(reports)})`);
  assert.equal(refused.length, 1);
  assert.equal(refused[0]?.code, 'already_exists', 'the losing process gets the typed create conflict');
  const winner = won[0]?.writer;
  const physical = await parentStore.get('v09:cross-process-race');
  assert.deepEqual(physical?.value, { writer: winner }, 'the physical document equals the winner payload — no merged or overwritten data');
  assert.equal(physical?.revision, 0);
});

test('V09-CAS P/N: transact is atomic — full batch lands; mid-batch typed refusal rolls back every earlier mutation', async (t) => {
  const ws = workspace(t);
  const store = await openStore(join(ws.dir, 'registry.sqlite'));
  ws.track(store);

  // P: approval + permit documents commit together in one physical transaction.
  const entries = await store.transact([
    { kind: 'put', key: 'v09:approval:app-1', value: { audience: 'aud-1', currentness: { epoch: 1, approved: true } }, condition: { kind: 'create' } },
    { kind: 'put', key: 'v09:permit:op-1', value: { approval: 'app-1', oneShot: true }, condition: { kind: 'create' } },
  ]);
  assert.deepEqual(entries, [
    { key: 'v09:approval:app-1', op: 'put', revision: 0 },
    { key: 'v09:permit:op-1', op: 'put', revision: 0 },
  ]);
  assert.ok(await store.get('v09:approval:app-1') !== null);
  assert.ok(await store.get('v09:permit:op-1') !== null);

  // P: same-key sequencing inside one batch sees in-transaction effects.
  const sequenced = await store.transact([
    { kind: 'put', key: 'v09:sequenced', value: { n: 1 }, condition: { kind: 'create' } },
    { kind: 'put', key: 'v09:sequenced', value: { n: 2 }, condition: { kind: 'cas', revision: 0 } },
  ]);
  assert.deepEqual(sequenced, [
    { key: 'v09:sequenced', op: 'put', revision: 0 },
    { key: 'v09:sequenced', op: 'put', revision: 1 },
  ]);

  // N: the second mutation carries a STALE CAS expectation (the approval doc
  // sits at revision 0, we claim 9); the FIRST mutation of the batch must
  // roll back — zero partial writes.
  const failure = await store
    .transact([
      { kind: 'put', key: 'v09:batch:first', value: { partial: false }, condition: { kind: 'create' } },
      { kind: 'put', key: 'v09:approval:app-1', value: { audience: 'aud-1', currentness: { epoch: 99, approved: true } }, condition: { kind: 'cas', revision: 9 } },
    ])
    .then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(failure).code, 'revision_conflict');
  assert.equal(await store.get('v09:batch:first'), null, 'the first batch mutation did not survive the mid-batch refusal');

  // N: mutations without any condition are refused before the write lock is
  // taken (condition_required — unconditional writes do not exist).
  const malformed = await store
    .transact([{ kind: 'put', key: 'v09:batch:malformed', value: { x: 1 } } as never])
    .then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(malformed).code, 'condition_required');
  assert.equal(await store.get('v09:batch:malformed'), null);
});

test('V09-CAS P: close/reopen durability — confirmed writes survive the close and the fresh WAL open', async (t) => {
  const ws = workspace(t);
  const dbPath = join(ws.dir, 'registry.sqlite');
  const first = await openStore(dbPath);
  await first.put('v09:durable', { kept: true, tuple: { audience: 'aud-A', currentness: { epoch: 3, revoked: false } } }, { kind: 'create' });
  await first.put('v09:durable', { kept: true, tuple: { audience: 'aud-A', currentness: { epoch: 4, revoked: true } } }, { kind: 'cas', revision: 0 });
  await first.close();

  const reopened = await openStore(dbPath);
  ws.track(reopened);
  const state = await reopened.get('v09:durable');
  assert.deepEqual(state?.value, { kept: true, tuple: { audience: 'aud-A', currentness: { epoch: 4, revoked: true } } });
  assert.equal(state?.revision, 1);
  const advanced = await reopened.put('v09:durable', { kept: true, tuple: { audience: 'aud-A', currentness: { epoch: 5, revoked: true } } }, { kind: 'cas', revision: 1 });
  assert.deepEqual(advanced, { revision: 2 });
});

test('V09-CAS P/N: real child SIGKILL mid-transaction — WAL recovery leaves zero partial writes, committed data intact, store usable', async (t) => {
  const ws = workspace(t);
  const dbPath = join(ws.dir, 'registry.sqlite');
  const parent = await openStore(dbPath, 200);
  ws.track(parent);
  await parent.put('v09:pre-crash', { committed: 'before-crash' }, { kind: 'create' });

  const child = spawnLockChild(dbPath, 8_000, 'v09:crash:step1', 'v09:crash:step2');
  try {
    await waitForLine(child, 'LOCKED_MID_TX', 15_000);
    // While the child holds the IMMEDIATE write lock mid-transaction, the parent write is typed busy — never silent data.
    const busy = await parent.put('v09:busy-probe', { x: 1 }, { kind: 'create' }).then(() => null, (error: unknown) => error);
    assert.equal(casErrorOf(busy).code, 'store_busy');
    assert.equal(casErrorOf(busy).indeterminate, false);
    assert.equal(await parent.get('v09:busy-probe'), null, 'the busy write did not land and was not ACKed');
  } finally {
    child.kill('SIGKILL');
  }
  const outcome = await waitForExit(child, 10_000, false);
  assert.equal(outcome.signal, 'SIGKILL', 'the child was killed mid-transaction (bounded, no zombie)');

  await parent.close();
  // Fresh open performs WAL recovery; the outcome is decided by authoritative read-back, not assumption.
  const fresh = await openStore(dbPath);
  ws.track(fresh);
  assert.deepEqual(await fresh.get('v09:pre-crash'), { value: { committed: 'before-crash' }, revision: 0 }, 'committed data survives the crash');
  assert.equal(await fresh.get('v09:crash:step1'), null, 'the uncommitted first insert of the killed transaction is gone');
  assert.equal(await fresh.get('v09:crash:step2'), null, 'no partial transaction state exists');
  const usable = await fresh.put('v09:post-crash', { healthy: true }, { kind: 'create' });
  assert.deepEqual(usable, { revision: 0 }, 'the recovered store accepts new writes');
});

test('V09-CAS P/N: cross-process lock contention is typed store_busy, then writes succeed after the contender settles', async (t) => {
  const ws = workspace(t);
  const dbPath = join(ws.dir, 'registry.sqlite');
  const parent = await openStore(dbPath, 200);
  ws.track(parent);

  const child = spawnLockChild(dbPath, 1_500, 'v09:held-while-locked', 'v09:second-insert');
  await waitForLine(child, 'LOCKED_MID_TX', 15_000);
  const busy = await parent.put('v09:contended', { x: 1 }, { kind: 'create' }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(busy).code, 'store_busy', 'exceeding the busy budget is a typed busy error, not silent wrong data');
  assert.equal(await parent.get('v09:contended'), null);
  assert.equal(await parent.get('v09:held-while-locked'), null, 'uncommitted transaction state is invisible to readers');
  // Bounded: the child finishes its own 1.5s hold; kill only if hung.
  const outcome = await waitForExit(child, 15_000, true);
  assert.equal(outcome.exitCode, 0, `lock child exited cleanly (stderr: ${outcome.stderr})`);

  const after = await parent.put('v09:contended', { x: 1 }, { kind: 'create' });
  assert.deepEqual(after, { revision: 0 }, 'the store accepts writes once the contender releases');
  const held = await parent.get('v09:held-while-locked');
  assert.deepEqual(held?.value, 'held-by-lock-child', 'the contender transaction committed fully');
  const secondInsert = await parent.get('v09:second-insert');
  assert.equal(secondInsert?.value, 'only-if-tx-commits');
});

test('V09-CAS N: disk-unavailable opens are typed store_unavailable with no false ACK (no database file created)', async (t) => {
  const base = workspace(t).dir;

  // Missing directory (better-sqlite3 refuses with a plain TypeError here).
  const missingDir = join(base, 'does-not-exist', 'registry.sqlite');
  const missing = await openV09SqlitePhysicalCasStore({ path: missingDir }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(missing).code, 'store_unavailable');
  assert.equal(casErrorOf(missing).indeterminate, false);
  assert.equal(existsSync(missingDir), false, 'no database file appeared — the failure is honest');

  // Parent path is a regular file (ENOTDIR / SQLITE_CANTOPEN family).
  const fileThatIsNotDir = join(base, 'plain-file');
  writeFileSync(fileThatIsNotDir, 'not a directory');
  const notDir = await openV09SqlitePhysicalCasStore({ path: join(fileThatIsNotDir, 'registry.sqlite') }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(notDir).code, 'store_unavailable');

  // Read-only directory: POSIX enforces EACCES for creation inside it.
  // (Windows does NOT enforce the read-only directory attribute for file
  // creation, so this vector is POSIX-only to stay deterministic.)
  if (process.platform !== 'win32') {
    const readOnlyDir = join(base, 'read-only');
    mkdirSync(readOnlyDir);
    chmodSync(readOnlyDir, 0o555);
    try {
      const readOnly = await openV09SqlitePhysicalCasStore({ path: join(readOnlyDir, 'registry.sqlite') }).then(() => null, (error: unknown) => error);
      assert.equal(casErrorOf(readOnly).code, 'store_unavailable', 'an unwritable directory refuses typed instead of pretending');
      assert.equal(existsSync(join(readOnlyDir, 'registry.sqlite')), false, 'no database file appeared in the read-only directory');
    } finally {
      chmodSync(readOnlyDir, 0o755);
    }
  }
});

test('V09-CAS N: unclassifiable driver failures classify as explicit UNKNOWN with indeterminate outcome', async () => {
  const determinateNothing = classifySqliteFailure(new Error('boom'), 'probe');
  assert.equal(determinateNothing.code, 'outcome_unknown');
  assert.equal(determinateNothing.indeterminate, true, 'UNKNOWN is explicit: the landed state must be read back, never guessed');
  assert.equal((determinateNothing.cause as Error).message, 'boom', 'the raw cause is preserved for protected diagnostics');

  const busy = classifySqliteFailure(Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }), 'probe');
  assert.equal(busy.code, 'store_busy');
  assert.equal(busy.indeterminate, false);

  const busySnapshot = classifySqliteFailure(Object.assign(new Error('busy snapshot'), { code: 'SQLITE_BUSY_SNAPSHOT' }), 'probe');
  assert.equal(busySnapshot.code, 'store_busy');

  const cantOpen = classifySqliteFailure(Object.assign(new Error('unable to open database file'), { code: 'SQLITE_CANTOPEN' }), 'probe');
  assert.equal(cantOpen.code, 'store_unavailable');

  const missingDirType = classifySqliteFailure(new TypeError('Cannot open database because the directory does not exist'), 'probe');
  assert.equal(missingDirType.code, 'store_unavailable', 'the better-sqlite3 Windows directory refusal is determinate unavailable');
  assert.equal(missingDirType.indeterminate, false);

  const ioErr = classifySqliteFailure(Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR_WRITE' }), 'probe');
  assert.equal(ioErr.code, 'store_unavailable', 'classified I/O failure is determinate unavailable, nothing claimed written');

  const typedPassthrough = classifySqliteFailure(new V09CasStoreError('revision_conflict', 'passthrough'), 'probe');
  assert.equal(typedPassthrough.code, 'revision_conflict', 'typed CAS refusals pass through unmodified');
});

test('V09-CAS P/N: audience/currentness tuple is written and CAS-swapped atomically — racers never observe a torn tuple', async (t) => {
  const ws = workspace(t);
  const dbPath = join(ws.dir, 'registry.sqlite');
  const governance = await openStore(dbPath);
  const contender = await openStore(dbPath);
  ws.track(governance);
  ws.track(contender);

  const initial = { audience: 'aud-A', appId: 'app-1', currentness: { epoch: 1, revoked: false, issuer: 'issuer-1' } };
  await governance.put('v09:currentness:app-1', initial, { kind: 'create' });

  const revoked = { audience: 'aud-A', appId: 'app-1', currentness: { epoch: 2, revoked: true, issuer: 'issuer-1' } };
  const epochBump = { audience: 'aud-A', appId: 'app-1', currentness: { epoch: 2, revoked: false, issuer: 'issuer-1' } };
  const settled = await Promise.allSettled([
    governance.put('v09:currentness:app-1', revoked, { kind: 'cas', revision: 0 }),
    contender.put('v09:currentness:app-1', epochBump, { kind: 'cas', revision: 0 }),
  ]);
  const losers = settled.filter((s) => s.status === 'rejected');
  assert.equal(losers.length, 1, 'one currentness writer loses the CAS');
  assert.equal(casErrorOf((losers[0] as PromiseRejectedResult).reason).code, 'revision_conflict');

  const state = await governance.get('v09:currentness:app-1');
  assert.ok(state !== null);
  // The physical document is exactly ONE of the two full tuples — never a field-level mix.
  const isRevoked = JSON.stringify(state.value) === JSON.stringify(revoked);
  const isBump = JSON.stringify(state.value) === JSON.stringify(epochBump);
  assert.ok(isRevoked || isBump, `tuple is atomic and complete (got ${JSON.stringify(state.value)})`);
  assert.equal((state.value as typeof revoked).audience, 'aud-A');
  assert.equal(state.revision, 1);

  // N: stale tuple writer cannot overwrite a committed revocation.
  const stale = await governance.put('v09:currentness:app-1', initial, { kind: 'cas', revision: 0 }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(stale).code, 'revision_conflict');
});

test('V09-CAS P/N: resource disposal — closed stores fail typed, close is idempotent, reopen works, file handle is released', async (t) => {
  const ws = workspace(t);
  const dbPath = join(ws.dir, 'registry.sqlite');
  const store = await openStore(dbPath);
  await store.put('v09:before-close', { v: 1 }, { kind: 'create' });
  await store.close();

  const closedRead = await store.get('v09:before-close').then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(closedRead).code, 'store_closed');
  const closedWrite = await store.put('v09:after-close', { v: 2 }, { kind: 'create' }).then(() => null, (error: unknown) => error);
  assert.equal(casErrorOf(closedWrite).code, 'store_closed');
  await store.close(); // idempotent
  await store.close();

  // Reopen on the same path: the physical handle was genuinely released.
  const reopened = await openStore(dbPath);
  assert.deepEqual(await reopened.get('v09:before-close'), { value: { v: 1 }, revision: 0 });
  await reopened.close();
  // Strongest handle-release proof (Windows fails rm on a leaked descriptor).
  rmSync(dbPath);
  assert.equal(existsSync(dbPath), false, 'the closed store released its file handle');
});
