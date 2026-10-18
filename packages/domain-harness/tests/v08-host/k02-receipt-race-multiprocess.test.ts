/**
 * v0.10 K02 #1168 — two REAL Node processes racing one turn on ONE SQLite file.
 * =================================================================================
 *
 * Two stock-node child processes (`children/k02-receipt-worker.mjs`, no tsx;
 * host store via the built package self-reference `@kaicreator/domain-harness/v8/host`)
 * share ONE physical SQLite CAS store and race the SAME occurrence through
 * the K02 carrier:
 *
 *   K02-R1a  identical input: exactly ONE child commits the turn (fresh ACK,
 *            one effect); the other either replays the SAME original receipt
 *            (idempotentReplay, zero new effects) or, when its CAS honestly
 *            lost the race, retries once and replays. No forged ACK, no
 *            double effect, no lost update.
 *   K02-R1b  same messageId + CHANGED input raced: the first writer wins; the
 *            changed submission refuses typed K02_TURN_RECEIPT_INPUT_CONFLICT.
 *   K02-R1c  20-turn sequence interleaved across BOTH processes (10 each) on
 *            one instance: 20 fresh admissions, revision 20, and a replay of
 *            an early turn answered from the OTHER process's writer side.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';

import { openSqliteCasStore, type SqliteCasStore } from '../../src/host-v8/index.js';

const CARRIER_SOURCE = await readFile(
  new URL('../../../domain-harness-compiler/src/qualified-package/payload/durable-receipt-carrier-v1.mjs', import.meta.url),
  'utf8',
);
const carrier: Record<string, any> = await import(`data:text/javascript;base64,${Buffer.from(CARRIER_SOURCE, 'utf8').toString('base64')}`);
const { ReceiptCarryingEngine, scopedNamespacePrefix } = carrier;

const sha256 = { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') };
const SCOPE = { deployedAppId: 'app-k02-mp', tenantId: 'tenant-1', appId: 'app-1', businessPackageId: 'pkg-quote-1.0.0' };
const ARCHIVE_PREFIX = `${scopedNamespacePrefix(SCOPE)}:receipt-archive:`;

const sqlitePath = join(tmpdir(), `dh010-k02-mp-${String(process.pid)}-${String(Date.now())}.sqlite`);
const workerPath = join('children', 'k02-receipt-worker.mjs');
const workerCwd = fileURLToPath(new URL('.', import.meta.url));

let store: SqliteCasStore;

interface WorkerOutcome {
  event: 'outcome';
  mode: string;
  status: string;
  code?: string;
  raceLosses?: number;
  dispatches: number;
  originalReceipt?: Record<string, any> | null;
  stateRevision?: number | null;
  admitted?: number;
  probe?: string | null;
}

function runWorker(args: string[]): Promise<WorkerOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, ...args], { cwd: workerCwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
      const outcome = lines.map((line) => { try { return JSON.parse(line); } catch { return null; } }).find((value) => value && value.event === 'outcome');
      if (outcome === undefined) {
        reject(new Error(`worker exited ${String(code)} without an outcome line; stderr=${stderr.slice(0, 400)}; stdout=${stdout.slice(0, 400)}`));
        return;
      }
      resolve(outcome as WorkerOutcome);
    });
  });
}

const target = (instanceKey: string) => ({ workflowId: 'quote', instanceKey });

async function openInstanceForChildren(instanceKey: string): Promise<void> {
  const engine = new ReceiptCarryingEngine(store, { scope: SCOPE, sha256 });
  await engine.openInstance({ target: target(instanceKey), packageId: 'pkg-quote-1.0.0' });
}

before(async () => {
  store = await openSqliteCasStore({ path: sqlitePath });
});

after(async () => {
  await store.close();
  for (const suffix of ['', '-wal', '-shm']) {
    await rm(`${sqlitePath}${suffix}`, { force: true });
  }
});

test('K02-R1a two real processes race the same turn: ONE fresh ACK + ONE idempotent replay of the SAME original receipt', async () => {
  const ik = 'k02:mp:race-a';
  await openInstanceForChildren(ik);
  const [alpha, beta] = await Promise.all([
    runWorker(['submit', sqlitePath, ik, 'race-1', 'note', JSON.stringify({ amount: 42, effects: [{ effectType: 'effect:reserve' }] })]),
    runWorker(['submit', sqlitePath, ik, 'race-1', 'note', JSON.stringify({ amount: 42, effects: [{ effectType: 'effect:reserve' }] })]),
  ]);
  const outcomes = [alpha, beta];
  const fresh = outcomes.filter((o) => o.status === 'admitted');
  const replays = outcomes.filter((o) => o.status === 'replayed');
  const errors = outcomes.filter((o) => o.status === 'error');
  assert.equal(errors.length, 0, `no worker errors: ${JSON.stringify(outcomes)}`);
  assert.equal(fresh.length, 1, `exactly one fresh admission: ${JSON.stringify(outcomes)}`);
  assert.equal(replays.length, 1, `exactly one idempotent replay: ${JSON.stringify(outcomes)}`);
  assert.equal(fresh[0].dispatches, 1, 'the winner executed the effect exactly once');
  assert.equal(replays[0].dispatches, 0, 'the loser re-executed nothing');
  // Both children hold the SAME original acknowledged receipt bytes.
  assert.equal(replays[0].originalReceipt?.attributedAt, fresh[0].originalReceipt?.attributedAt, 'identical original attribution');
  assert.deepEqual(replays[0].originalReceipt?.instance, fresh[0].originalReceipt?.instance, 'identical original post-turn projection');
  assert.equal(fresh[0].stateRevision, 1);
  // Physical truth: one instance revision, one archive record, no doubles.
  const engine = new ReceiptCarryingEngine(store, { scope: SCOPE, sha256 });
  const receipts = await engine.readDurableOriginalReceipts(target(ik));
  assert.equal(Object.keys(receipts).length, 1, 'exactly one durable original receipt for the turn');
  const archives = await store.list(ARCHIVE_PREFIX);
  assert.equal(archives.length, 1, 'exactly one archive record on the file');
});

test('K02-R1b changed input raced under the same messageId: first writer wins, the changed submission refuses typed', async () => {
  const ik = 'k02:mp:race-b';
  await openInstanceForChildren(ik);
  const [alpha, beta] = await Promise.all([
    runWorker(['submit', sqlitePath, ik, 'race-changed', 'note', JSON.stringify({ amount: 1, effects: [{ effectType: 'effect:reserve' }] })]),
    runWorker(['submit', sqlitePath, ik, 'race-changed', 'note', JSON.stringify({ amount: 2, effects: [{ effectType: 'effect:reserve' }] })]),
  ]);
  const outcomes = [alpha, beta];
  const admitted = outcomes.filter((o) => o.status === 'admitted');
  const conflicts = outcomes.filter((o) => o.status === 'error' && o.code === 'K02_TURN_RECEIPT_INPUT_CONFLICT');
  const replays = outcomes.filter((o) => o.status === 'replayed');
  assert.equal(admitted.length + replays.length, 1, `exactly one non-conflicting writer outcome: ${JSON.stringify(outcomes)}`);
  assert.equal(conflicts.length, 1, `exactly one typed changed-input conflict: ${JSON.stringify(outcomes)}`);
  assert.equal((admitted[0] ?? replays[0]).dispatches, 1, 'the winning input executed its effect once');
  assert.equal(conflicts[0].dispatches, 0, 'the conflicting submission executed nothing');
});

test('K02-R1c 20-turn sequence interleaved across both processes: 20 fresh admissions, revision 20, cross-process replay', async () => {
  const ik = 'k02:mp:sequence';
  await openInstanceForChildren(ik);
  const alpha = await runWorker(['sequence', sqlitePath, ik, '', 'note', '{}', '10', 'alpha', '']);
  const beta = await runWorker(['sequence', sqlitePath, ik, '', 'note', '{}', '10', 'beta', 'alpha-1']);
  assert.equal(alpha.status, 'sequence');
  assert.equal(alpha.admitted, 10, 'process one admitted its 10 turns');
  assert.equal(beta.status, 'sequence');
  assert.equal(beta.admitted, 10, 'process two admitted its 10 turns');
  assert.equal(beta.stateRevision, 20, 'the shared instance reached revision 20');
  assert.equal(beta.probe, 'replayed', 'process two replayed process one\'s first turn from the durable original');
  assert.equal(beta.dispatches, 0, 'the replay probe dispatched nothing');
  const engine = new ReceiptCarryingEngine(store, { scope: SCOPE, sha256 });
  const receipts = await engine.readDurableOriginalReceipts(target(ik));
  assert.equal(Object.keys(receipts).length, 20, 'all 20 same-CAS original receipts durable in ONE document');
  assert.equal((await engine.getSnapshot(target(ik))).stateRevision, 20);
});

test('K02-R1 sanity: the carrier fragment bytes the workers import are the exact committed source', async () => {
  const workerSource = await readFile(join(workerCwd, 'children', 'k02-receipt-worker.mjs'), 'utf8');
  assert.match(workerSource, /durable-receipt-carrier-v1\.mjs/, 'the worker imports the carrier payload fragment directly');
  const carrierSource = await readFile(
    new URL('../../../domain-harness-compiler/src/qualified-package/payload/durable-receipt-carrier-v1.mjs', import.meta.url),
    'utf8',
  );
  assert.match(carrierSource, /K02_CARRIER_ID = 'durable-receipt-carrier-v1'/);
});
