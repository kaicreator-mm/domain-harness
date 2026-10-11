/**
 * V08-ABI-C01/B01 — REAL multi-process Host evidence (T-E, #1004).
 * ==================================================================
 *
 * All children in this file are REAL stock-node child processes
 * (node:child_process spawn of process.execPath) importing the BUILT
 * package via package self-reference — no mocks, no in-process fakes:
 *
 *   - C01-N2/N9 cross-process: 8 workers race CAS on the SAME SQLite file.
 *     (a) increment: serialized CAS rounds never lose an update — the sum of
 *         per-worker successes equals the final durable revision+1.
 *     (b) simultaneous: every worker attempts the SAME revision — exactly
 *         one success, N-1 typed HOST_CAS_CONFLICT, zero false ACKs.
 *   - B01/#1000 closure: a fresh un-bootstrapped process with a GENUINELY
 *         HMAC'd approval proof refuses load() with UNTRUSTED_ISSUER and the
 *         sealed modules' top-level sentinels stay 0 (zero imports).
 *   - KPK-13 port: a clean stock-Node consumer performs the full typed UX
 *     round trip against a bootstrapped host.
 */

import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openSqliteCasStore, type SqliteCasStore } from '../../src/host-v8/index.js';
import { ISSUER_ID, ISSUER_SECRET } from './helpers.js';

const WORKER_SCRIPT = fileURLToPath(new URL('./children/cas-worker.mjs', import.meta.url));
const SENTINEL_SCRIPT = fileURLToPath(new URL('./children/unbootstrapped-load.mjs', import.meta.url));
const CONSUMER_SCRIPT = fileURLToPath(new URL('./children/ux-consumer.mjs', import.meta.url));

const CHILD_TIMEOUT_MS = 180_000;

/** Windows-robust recursive removal: child-process handle release can lag process exit by a moment (EBUSY). */
async function rmWithRetries(dir: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM') && attempt < 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
}


interface ChildResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

async function runChild(script: string, args: readonly string[]): Promise<ChildResult> {
  return new Promise<ChildResult>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: path.dirname(fileURLToPath(new URL('../../package.json', import.meta.url))),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`child ${path.basename(script)} timed out after ${String(CHILD_TIMEOUT_MS)} ms\nstderr: ${stderr}`));
    }, CHILD_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** The single JSON line a child prints as its last stdout line. */
function parseChildJson(result: ChildResult, label: string): Record<string, unknown> {
  assert.equal(result.code, 0, `${label} child exited non-zero\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  const last = lines[lines.length - 1];
  assert.ok(last !== undefined && last.startsWith('{'), `${label} child printed no JSON line:\n${result.stdout}`);
  return JSON.parse(last) as Record<string, unknown>;
}

async function makeWorkspace(): Promise<{ dir: string; dbPath: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'v08-host-mp-'));
  return { dir, dbPath: path.join(dir, 'cas.db') };
}

test('C01-N2/N9 [multiprocess] 8 real node processes race serialized CAS increments: zero lost updates', async () => {
  const { dir, dbPath } = await makeWorkspace();
  const WORKERS = 8;
  const ROUNDS = 25;
  let seeder: SqliteCasStore | null = null;
  try {
    // Parent opens the store first: schema exists before any child spawns.
    seeder = await openSqliteCasStore({ path: dbPath });
    const seed = await seeder.put('mp:counter', { count: 0, lastWriter: 'seed' }, { mustBeAbsent: true });
    assert.equal(seed.revision, 0);

    // Spawn WITHOUT awaiting: the children open their DB handles and wait on
    // the start barrier; releasing it only after every spawn is in flight
    // makes the CAS loop run with genuine contention.
    const running = Array.from({ length: WORKERS }, (_, index) =>
      runChild(WORKER_SCRIPT, [
        '--mode',
        'increment',
        '--db',
        dbPath,
        '--key',
        'mp:counter',
        '--rounds',
        String(ROUNDS),
        '--worker',
        `w${String(index)}`,
        '--ready',
        'mp:counter:go',
      ]),
    );
    // Release the start barrier now that every child is spawned and polling.
    await seeder.put('mp:counter:go', { go: true }, { mustBeAbsent: true });
    const children = await Promise.all(running);
    const results = children.map((result, index) => parseChildJson(result, `increment w${String(index)}`));
    let totalSuccesses = 0;
    for (const result of results) {
      assert.equal(result.mode, 'increment');
      totalSuccesses += result.successes as number;
    }
    assert.equal(totalSuccesses, WORKERS * ROUNDS, 'every CAS round eventually succeeded exactly once');

    const final = await seeder.get('mp:counter');
    assert.equal(final?.revision, totalSuccesses, 'durable revision equals the exact number of successful CAS writes (no lost update)');
    assert.equal((final?.value as { count: number }).count, totalSuccesses, 'the value count equals the physical revision count');
    // Note: per-conflict counts are NOT asserted here. With the write lock
    // acquired by BEGIN IMMEDIATE before the revision is re-read inside the
    // transaction, genuine conflicts are legitimately rare — the DETERMINISTIC
    // cross-process conflict evidence (exactly one winner, WORKERS-1 typed
    // HOST_CAS_CONFLICT refusals, zero false ACKs) is the next test's
    // same-revision race, where every worker targets the same revision.
  } finally {
    // Always release the parent handle first: a leaked handle would turn any
    // assertion failure into a masking Windows EBUSY on cleanup.
    if (seeder !== null) await seeder.close().catch(() => {});
    await rmWithRetries(dir);
  }
});

test('C01-N2 [multiprocess] 8 real node processes attempt the SAME revision: exactly one winner, typed conflicts', async () => {
  const { dir, dbPath } = await makeWorkspace();
  const WORKERS = 8;
  let seeder: SqliteCasStore | null = null;
  try {
    seeder = await openSqliteCasStore({ path: dbPath });
    await seeder.put('mp:race', { winner: null }, { mustBeAbsent: true });
    // The start signal: children poll for this key, then all fire at once.
    await seeder.put('mp:race:ready', { go: true }, { mustBeAbsent: true });

    const children = await Promise.all(
      Array.from({ length: WORKERS }, (_, index) =>
        runChild(WORKER_SCRIPT, ['--mode', 'race', '--db', dbPath, '--key', 'mp:race', '--ready', 'mp:race:ready', '--worker', `w${String(index)}`]),
      ),
    );
    const results = children.map((result, index) => parseChildJson(result, `race w${String(index)}`));
    const winners = results.filter((result) => result.successes === 1);
    const losers = results.filter((result) => result.conflicts === 1 && result.errorCode === 'HOST_CAS_CONFLICT');
    assert.equal(winners.length, 1, 'exactly one winner across processes');
    assert.equal(losers.length, WORKERS - 1, 'every loser observed the typed CAS conflict — no silent degradation, no false ACK');
    const winnerName = winners[0]?.worker as string;
    const final = await seeder.get('mp:race');
    assert.equal(final?.revision, 1);
    assert.equal((final?.value as { winner: string }).winner, winnerName, 'the durable winner is exactly the process whose CAS succeeded');
  } finally {
    if (seeder !== null) await seeder.close().catch(() => {});
    await rmWithRetries(dir);
  }
});

test('B01/#1000 closure [multiprocess] an un-bootstrapped process fails closed on load(): UNTRUSTED_ISSUER, sentinel 0', async () => {
  const result = await runChild(SENTINEL_SCRIPT, [ISSUER_ID, ISSUER_SECRET]);
  const parsed = parseChildJson(result, 'sentinel');
  assert.equal(parsed.channelEstablished, false, 'importing the Host module alone never establishes the trust channel');
  assert.equal(parsed.code, 'UNTRUSTED_ISSUER', 'even a genuinely HMAC-d approval proof is refused without the protected bootstrap');
  assert.equal(parsed.sentinelKernel, 0, 'kernel module never evaluated (zero imports)');
  assert.equal(parsed.sentinelSdk, 0, 'sdk module never evaluated (zero imports)');
  assert.equal(parsed.sentinelBiz, 0, 'business module never evaluated (zero imports)');
});

test('KPK-13 port [multiprocess] a clean stock-Node consumer performs the full typed UX round trip', async () => {
  const { dir, dbPath } = await makeWorkspace();
  try {
    const result = await runChild(CONSUMER_SCRIPT, [ISSUER_ID, ISSUER_SECRET, dbPath]);
    const parsed = parseChildJson(result, 'consumer');
    assert.equal(parsed.loadedPackages, 3, 'the sealed closure loaded through the public one-argument gate');
    const receipt = parsed.receipt as { status: string; intentType: string; authenticatedRoles: string[]; declaredCaller: { role: string } };
    assert.equal(receipt.status, 'dispatched');
    assert.equal(receipt.intentType, 'demo.consumer');
    assert.deepEqual(receipt.authenticatedRoles, ['requester'], 'roles come from the signed credential only');
    assert.deepEqual(receipt.declaredCaller, { role: 'admin' }, 'declared caller carried as user data');
    const query = parsed.query as { revision: number; messageId: string; bySubject: string };
    assert.equal(query.messageId, 'msg:consumer-1');
    assert.equal(query.bySubject, 'user:consumer');
    assert.deepEqual(parsed.observed, ['hello'], 'scoped subscribe + publish delivered');
    assert.equal(parsed.revokedRefused, 'HOST_CREDENTIAL_REVOKED', 'the same transport is refused after durable revocation');
  } finally {
    await rmWithRetries(dir);
  }
});
