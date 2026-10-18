/**
 * K01 (#1108) — REAL two-process admission-fence/effect race over ONE shared
 * SQLite file. ==================================================================
 *
 * Every leg spawns REAL stock-node child processes (k01-fence-worker.mjs):
 * one child = one independent Host process with its own SqliteCasStore handle
 * (WAL + IMMEDIATE transactions — true cross-process physical CAS) running
 * the exact current selected kernel payload. The external non-idempotent
 * effect is an append-only ledger FILE: one appended line = one real external
 * call. Interleavings are made deterministic by parking the effect handler
 * AFTER the admission-fence claim and journal begin (admitCentralDecision
 * claims the fence strictly before executeEffectIntents) and by a
 * kill-at-the-commit-seam crash injection. No mock CAS anywhere.
 *
 *   K01-P1  protected in-flight dispatch: a rival whose snapshot observed the
 *           holder's fence claim REFUSES typed before any journal/effect; the
 *           holder dispatches exactly once and commits. (Pre-fix #1108: the
 *           rival CAS-overwrote the in-flight fence, both dispatched, the
 *           first writer lost after its external dispatch — orphaned.)
 *   K01-N1  crash before dispatch: killed holder keeps the fence held —
 *           rivals refuse typed (fail-closed, no lease); the same-turn replay
 *           hits journal 'started' + non-idempotent => ADMISSION_EFFECT_AMBIGUOUS
 *           (honest UNKNOWN); zero external dispatch ever happened.
 *   K01-N2  crash after dispatch + journal 'completed', before the commit CAS:
 *           rivals refuse; the same-turn replay replays the journal (NO second
 *           dispatch) and commits — the external effect stays accounted once.
 *   K01-F1  zero-ambiguity failure release: an effect that fails BEFORE any
 *           external call releases the fence; a fresh turn admits at the same
 *           stateRevision (no permanent wedge).
 *   K01-F2  post-dispatch failure honesty: the attempt is durably 'failed'
 *           and accounted; a fresh turn still proceeds.
 *   K01-S1  sequential cross-process reuse: an OLDER held fence (its holder
 *           committed) is superseded by the normal revision CAS — the normal
 *           multi-process path stays live.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openSqliteCasStore, type SqliteCasStore } from '../../src/host-v8/index.js';

const WORKER_SCRIPT = fileURLToPath(new URL('./children/k01-fence-worker.mjs', import.meta.url));
const CHILD_TIMEOUT_MS = 120_000;
const WORKFLOW_ID = 'quote';

interface ChildResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** Last stdout JSON line emitted by the worker (its result record). */
  result: Record<string, any> | null;
}

function parseLastJsonLine(stdout: string): Record<string, any> | null {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index] as string);
      if (parsed !== null && typeof parsed === 'object') return parsed as Record<string, any>;
    } catch { /* not a JSON line */ }
  }
  return null;
}

function spawnWorker(args: readonly string[]): ChildProcess {
  return spawn(process.execPath, [WORKER_SCRIPT, ...args], {
    cwd: path.dirname(fileURLToPath(new URL('../../package.json', import.meta.url))),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

interface StartedWorker {
  child: ChildProcess;
  done: Promise<ChildResult>;
}

function startWorker(args: readonly string[]): StartedWorker {
  const child = spawnWorker(args);
  const done = new Promise<ChildResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`worker timed out after ${String(CHILD_TIMEOUT_MS)} ms\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, CHILD_TIMEOUT_MS);
    child.stdout!.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, result: parseLastJsonLine(stdout) });
    });
  });
  return { child, done };
}

function runWorker(args: readonly string[]): Promise<ChildResult> {
  return startWorker(args).done;
}

/** Windows-robust recursive removal (EBUSY/EPERM while child handles release). */
async function rmWithRetries(dir: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM') && attempt < 30) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
}

interface Fixture {
  dir: string;
  dbPath: string;
  ledgerPath: string;
  store: SqliteCasStore;
  workerArgs(extra: readonly string[]): string[];
  ledgerLines(): Promise<string[]>;
  waitForCtrl(key: string): Promise<void>;
  putCtrl(key: string): Promise<void>;
  instanceDoc(instanceKey: string): Promise<any>;
  journalRecords(instanceKey: string): Promise<{ status: string; effectId: string }[]>;
  fenceDoc(instanceKey: string): Promise<{ value: any; revision: number } | null>;
}

async function fixture(name: string): Promise<Fixture> {
  const dir = await mkdtemp(path.join(tmpdir(), `dh-k01-${name}-`));
  const dbPath = path.join(dir, 'race.sqlite');
  const ledgerPath = path.join(dir, 'ledger.ndjson');
  await writeFile(ledgerPath, '', 'utf8');
  const store = await openSqliteCasStore({ path: dbPath });
  const workerArgs = (extra: readonly string[]) => ['--db', dbPath, '--ledger', ledgerPath, ...extra];
  const waitForCtrl = async (key: string): Promise<void> => {
    const deadline = Date.now() + 60_000;
    while ((await store.get(`ctrl:${key}`)) === null) {
      if (Date.now() > deadline) throw new Error(`control key ctrl:${key} never appeared`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  return {
    dir, dbPath, ledgerPath, store, workerArgs, waitForCtrl,
    putCtrl: async (key: string) => { await store.put(`ctrl:${key}`, { go: true }, { mustBeAbsent: true }); },
    ledgerLines: async () => (await readFile(ledgerPath, 'utf8')).split(/\r?\n/).filter((line) => line.trim().length > 0),
    instanceDoc: async (instanceKey: string) => (await store.get(`v08-kernel:wf-instance:${WORKFLOW_ID}:${instanceKey}`))?.value ?? null,
    journalRecords: async (instanceKey: string) => {
      const keys = await store.list('v08-kernel:effect-journal:');
      const records: { status: string; effectId: string }[] = [];
      for (const key of keys.filter((candidate) => candidate.includes(encodeURIComponent(instanceKey)))) {
        const doc = await store.get(key);
        const record = (doc as { value?: { record?: { status?: unknown; effectId?: unknown } } } | null)?.value?.record;
        if (record !== undefined) {
          records.push({ status: String(record.status), effectId: String(record.effectId) });
        }
      }
      return records;
    },
    fenceDoc: async (instanceKey: string) => await store.get(`v08-kernel:admission-fence:${WORKFLOW_ID}:${instanceKey}`),
  };
}

const fixtures: Fixture[] = [];

async function namedFixture(name: string): Promise<Fixture> {
  const created = await fixture(name);
  fixtures.push(created);
  return created;
}

after(async () => {
  for (const item of fixtures) await item.store.close();
  const dirs = [...new Set(fixtures.map((item) => item.dir))];
  for (const dir of dirs) await rmWithRetries(dir);
});

const openInstance = async (fx: Fixture, instanceKey: string) => {
  const opened = await runWorker(fx.workerArgs(['--mode', 'open', '--instance', instanceKey, '--worker', 'opener']));
  assert.equal(opened.result?.status, 'ok', `open failed: ${opened.stdout}\n${opened.stderr}`);
};

test('K01-P1 two real processes: the rival cannot displace an in-flight fence at the same stateRevision; the holder dispatches exactly once', async () => {
  const fx = await namedFixture('p1');
  const instance = 't:a:p1';
  await openInstance(fx, instance);

  // A enters its effect handler AFTER claiming the fence (admitCentralDecision
  // claims before executeEffectIntents) and parks before the external dispatch.
  const pendingA = startWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-a', '--worker', 'a', '--park', 'p1-entered:p1-go']));
  await fx.waitForCtrl('p1-entered');

  // B snapshots the instance STILL at stateRevision 0 — after A's fence claim,
  // so B's snapshotFenceRevision observes A's claim. Pre-fix (#1108) this claim
  // CAS-overwrote A's in-flight fence; post-fix it must refuse typed BEFORE any
  // journal begin or effect dispatch by B.
  const b = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-b', '--worker', 'b']));
  assert.equal(b.result?.status, 'error');
  assert.equal(b.result?.error_code, 'ADMISSION_STATE_CAS_CONFLICT', `B outcome: ${b.stdout}\n${b.stderr}`);

  await fx.putCtrl('p1-go');
  const a = await pendingA.done;
  assert.equal(a.result?.status, 'admitted', `A outcome: ${a.stdout}\n${a.stderr}`);
  assert.equal(a.result?.stateKey, 'approved');

  // Exactly ONE real external dispatch (the holder's); zero by the rival.
  assert.equal((await fx.ledgerLines()).length, 1);
  // Exactly ONE journal row (the holder's), durably completed.
  const journal = await fx.journalRecords(instance);
  assert.equal(journal.length, 1);
  assert.equal(journal[0]?.status, 'completed');
  // The committed instance truth: A's approve landed at revision 1.
  const doc = await fx.instanceDoc(instance);
  assert.equal(doc.state.stateKey, 'approved');
  assert.equal(doc.stateRevision, 1);
  assert.equal(doc.lifecycle, 'completed');
});

test('K01-N1 killed in-flight holder: rivals fail closed; same-turn replay is honestly AMBIGUOUS; zero external dispatch', async () => {
  const fx = await namedFixture('n1');
  const instance = 't:a:n1';
  await openInstance(fx, instance);

  // A parks inside its effect handler: fence claimed, journal 'started', no
  // external dispatch yet. The parent kills the REAL process mid-flight.
  const parked = startWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-a', '--worker', 'a', '--park', 'n1-entered:n1-go']));
  await fx.waitForCtrl('n1-entered');
  parked.child.kill('SIGKILL');
  const killed = await parked.done;
  assert.equal(killed.result?.phase, undefined, 'the killed worker emitted no result record');

  // A rival turn must refuse: the dead holder's fence is still held — fail
  // closed, no expiry lease, no takeover.
  const b = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-b', '--worker', 'b']));
  assert.equal(b.result?.status, 'error');
  assert.equal(b.result?.error_code, 'ADMISSION_STATE_CAS_CONFLICT', `B outcome: ${b.stdout}\n${b.stderr}`);

  // The same turn replayed by a NEW process re-claims its own fence and must
  // hit the durable 'started' + non-idempotent record => honest UNKNOWN.
  const replay = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-a', '--worker', 'a2']));
  assert.equal(replay.result?.status, 'error');
  assert.equal(replay.result?.error_code, 'ADMISSION_EFFECT_AMBIGUOUS', `replay outcome: ${replay.stdout}\n${replay.stderr}`);

  assert.equal((await fx.ledgerLines()).length, 0, 'zero external dispatches ever happened');
  const journal = await fx.journalRecords(instance);
  assert.equal(journal.length, 1);
  assert.equal(journal[0]?.status, 'started');
  const doc = await fx.instanceDoc(instance);
  assert.equal(doc.stateRevision, 0);
  assert.equal(doc.state.stateKey, 'review');
  assert.equal(doc.lifecycle, 'active');
  const fence = await fx.fenceDoc(instance);
  assert.notEqual(fence, null, 'the crashed turn keeps the fence held (fail-closed)');
});

test('K01-N2 crash after dispatch + journal completion, before commit: replay reconciles exactly once', async () => {
  const fx = await namedFixture('n2');
  const instance = 't:a:n2';
  await openInstance(fx, instance);

  // Dispatch happens, journal completes, the process dies at the instance
  // commit CAS seam — deterministic crash injection over the real store.
  const a = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-a', '--worker', 'a', '--kill-at-commit']));
  assert.equal(a.result?.phase, 'kill-before-commit', `worker did not reach the commit seam: ${a.stdout}\n${a.stderr}`);
  assert.equal(a.code, 70);

  assert.equal((await fx.ledgerLines()).length, 1, 'the single real external dispatch happened');
  const journal = await fx.journalRecords(instance);
  assert.equal(journal.length, 1);
  assert.equal(journal[0]?.status, 'completed');
  let doc = await fx.instanceDoc(instance);
  assert.equal(doc.stateRevision, 0, 'the commit never landed');

  const b = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-b', '--worker', 'b']));
  assert.equal(b.result?.status, 'error');
  assert.equal(b.result?.error_code, 'ADMISSION_STATE_CAS_CONFLICT', `B outcome: ${b.stdout}\n${b.stderr}`);

  // Same-turn replay: journal 'completed' is REPLAYED — no second external
  // dispatch — and the commit lands.
  const replay = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-a', '--worker', 'a2']));
  assert.equal(replay.result?.status, 'admitted', `replay outcome: ${replay.stdout}\n${replay.stderr}`);
  assert.equal(replay.result?.effects?.[0]?.disposition, 'replayed');

  assert.equal((await fx.ledgerLines()).length, 1, 'still exactly ONE real external dispatch');
  doc = await fx.instanceDoc(instance);
  assert.equal(doc.state.stateKey, 'approved');
  assert.equal(doc.stateRevision, 1);
  assert.equal(doc.lifecycle, 'completed');
});

test('K01-F1 an effect failing before any external call releases the fence; a fresh turn admits at the same stateRevision', async () => {
  const fx = await namedFixture('f1');
  const instance = 't:a:f1';
  await openInstance(fx, instance);

  const a = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-a', '--worker', 'a', '--fail', 'before']));
  assert.equal(a.result?.status, 'error');
  assert.equal(a.result?.error_code, 'ADMISSION_EFFECT_FAILED', `A outcome: ${a.stdout}\n${a.stderr}`);
  assert.equal((await fx.ledgerLines()).length, 0);
  const journal = await fx.journalRecords(instance);
  assert.equal(journal.length, 1);
  assert.equal(journal[0]?.status, 'failed');
  // Zero-ambiguity release: the fence is free again.
  assert.equal(await fx.fenceDoc(instance), null, 'the fence was released after the all-failed turn');

  const b = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-b', '--worker', 'b']));
  assert.equal(b.result?.status, 'admitted', `B outcome: ${b.stdout}\n${b.stderr}`);
  assert.equal((await fx.ledgerLines()).length, 1);
  const doc = await fx.instanceDoc(instance);
  assert.equal(doc.state.stateKey, 'approved');
  assert.equal(doc.stateRevision, 1);
});

test('K01-F2 an effect failing after the external call is durably accounted; a fresh turn still proceeds', async () => {
  const fx = await namedFixture('f2');
  const instance = 't:a:f2';
  await openInstance(fx, instance);

  const a = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-a', '--worker', 'a', '--fail', 'after']));
  assert.equal(a.result?.status, 'error');
  assert.equal(a.result?.error_code, 'ADMISSION_EFFECT_FAILED', `A outcome: ${a.stdout}\n${a.stderr}`);
  assert.equal((await fx.ledgerLines()).length, 1, 'the failed attempt DID reach the external call');
  const journal = await fx.journalRecords(instance);
  assert.equal(journal.length, 1);
  assert.equal(journal[0]?.status, 'failed');
  assert.equal(await fx.fenceDoc(instance), null, 'durable failed record anchors reconciliation; the fence is released');

  const b = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-b', '--worker', 'b']));
  assert.equal(b.result?.status, 'admitted', `B outcome: ${b.stdout}\n${b.stderr}`);
  assert.equal((await fx.ledgerLines()).length, 2);
  const doc = await fx.instanceDoc(instance);
  assert.equal(doc.state.stateKey, 'approved');
  assert.equal(doc.stateRevision, 1);
});

test('K01-S1 sequential cross-process admissions supersede an OLDER held fence normally', async () => {
  const fx = await namedFixture('s1');
  const instance = 't:a:s1';
  await openInstance(fx, instance);

  const note = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'note', '--message', 'm-n1', '--worker', 'a']));
  assert.equal(note.result?.status, 'admitted', `note outcome: ${note.stdout}\n${note.stderr}`);
  assert.equal(note.result?.stateRevision, 1);

  // B's snapshot is at stateRevision 1; the leftover fence is at 0 — the
  // normal revision-CAS supersede must stay legal (live grant currentness).
  const approve = await runWorker(fx.workerArgs(['--instance', instance, '--intent', 'approve', '--message', 'm-ap', '--worker', 'b']));
  assert.equal(approve.result?.status, 'admitted', `approve outcome: ${approve.stdout}\n${approve.stderr}`);
  assert.equal(approve.result?.stateRevision, 2);
  assert.equal(approve.result?.effects?.[0]?.disposition, 'executed');
  assert.equal((await fx.ledgerLines()).length, 1);
  const doc = await fx.instanceDoc(instance);
  assert.equal(doc.state.stateKey, 'approved');
  assert.equal(doc.stateRevision, 2);
  assert.equal(doc.lifecycle, 'completed');
});
