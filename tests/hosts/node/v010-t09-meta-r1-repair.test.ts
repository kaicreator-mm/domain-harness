/**
 * v0.10 T09 (#1178) R1 repair — the falsifiers the independent review added:
 *
 *   T09-R1-P1a  two REAL Node24 processes perform their own durable ledger
 *               read, meet at a barrier AFTER both observed the ledger absent,
 *               then race the pre-admission reservation with DISTINCT valid
 *               evidence. Exactly ONE business turn is admitted; the loser is
 *               refused typed WITHOUT sending; one terminal ledger exists.
 *   T09-R1-P1b  a process crashes after the reservation CAS but before
 *               `facade.send`; a later call recovers the reservation and
 *               admits exactly one turn.
 *   T09-R1-P1c  a process crashes after the K admission but before the
 *               terminal ledger; recovery re-sends the SAME message identity,
 *               the Kernel replays the ORIGINAL receipt, and the ledger is
 *               finalized without a second turn. A competing different input
 *               is refused typed without a send.
 *   T09-R1-P2   Tenant A and Tenant B activate the same selected Business over
 *               ONE file-backed store with the same schedule/round. Neither
 *               can read/replay the other's evidence, reservation, ledger or
 *               original receipt; foreign evidence is refused BEFORE any
 *               physical read. An activation without a deployment identity is
 *               refused instead of degrading to a shared namespace.
 */
import '../../assembly/cjs-package-bridge.ts';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

import { sha256Canonical } from '@kaicreator/domain-harness-contracts';
import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';
import {
  META_FEEDBACK_CLAIM_PREFIX,
  META_FEEDBACK_LEDGER_PREFIX,
  runMetaFeedbackWorkflow,
} from '../../../packages/host-node/dist/index.js';
import {
  APP_ID,
  BUSINESS_ID,
  DEPLOYMENT,
  NOW,
  activateApp,
  activateWithoutDeployment,
  buildT09App,
  claimKeyFor,
  evidenceKeyFor,
  ledgerKeyFor,
  openHarness,
  refusal,
  roundIntent,
  scopeFor,
  stateOf,
  v10Store,
  type Counts,
} from './v010-t09-meta-fixture.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const RACE_CHILD = join(HERE, 'v010-t09-meta-race-child.ts');
const CRASH_CHILD = join(HERE, 'v010-t09-meta-crash-child.ts');

interface ChildRun {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function spawnChild(script: string, args: readonly string[]): Promise<ChildRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', script, ...args], {
      cwd: HERE,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function seedPlainEvidence(
  store: { put: (key: string, value: unknown, condition: { kind: 'create' }) => Promise<unknown> },
  key: string,
  value: Record<string, unknown>,
): Promise<void> {
  await store.put(key, value, { kind: 'create' });
}

/**
 * The selected Kernel's replay path returns the stored original admission
 * plus envelope-level replay metadata (`turnId`, `intentType`, `inputDigest`,
 * `attributedAt`, `idempotentReplay`, healed disposition). The business
 * admission itself — status, admitted control turn, instance snapshot — is
 * the EXACT original; compare that core rather than the annotated envelope.
 */
function receiptCore(receipt: Record<string, unknown>): Record<string, unknown> {
  return {
    status: receipt.status,
    admitted: receipt.admitted,
    instance: receipt.instance,
  };
}

let dir = '';
let app: V10BuiltApp;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dh010-t09-r1-'));
  app = await buildT09App();
});

after(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true });
});

test('T09-R1-P1a two barrier-synchronized fresh processes admit at most one business turn', async () => {
  const kPath = join(dir, 'race.sqlite');
  const barrierDir = join(dir, 'race-barrier');
  await mkdir(barrierDir, { recursive: true });

  // Distinct, valid observations => distinct proposal digests and message
  // identities. Both records live in the same trusted scope.
  const evidenceA = evidenceKeyFor('evidence/race-a');
  const evidenceB = evidenceKeyFor('evidence/race-b');
  const seedSqlite = await openSqliteCasStore({ path: kPath });
  const seedCounts: Counts = { gets: 0, puts: 0, removes: 0 };
  const seedStore = v10Store(seedSqlite, seedCounts);
  await seedPlainEvidence(seedStore, evidenceA, { kernelOutcome: 'admitted', semanticOutcome: 'admitted' });
  await seedPlainEvidence(seedStore, evidenceB, { kernelOutcome: 'admitted', semanticOutcome: 'unavailable' });
  await seedSqlite.close();

  const outA = join(dir, 'race-a.json');
  const outB = join(dir, 'race-b.json');
  const [runA, runB] = await Promise.all([
    spawnChild(RACE_CHILD, [kPath, outA, evidenceA, barrierDir, 'a', 'b']),
    spawnChild(RACE_CHILD, [kPath, outB, evidenceB, barrierDir, 'b', 'a']),
  ]);
  assert.equal(runA.code, 0, `race child A failed (${String(runA.code)}): ${runA.stderr.slice(0, 1200)}`);
  assert.equal(runB.code, 0, `race child B failed (${String(runB.code)}): ${runB.stderr.slice(0, 1200)}`);

  const resultA = await readJson<Record<string, any>>(outA);
  const resultB = await readJson<Record<string, any>>(outB);
  const winners = [resultA, resultB].filter((result) => result.ok === true);
  const losers = [resultA, resultB].filter((result) => result.ok === false);
  assert.equal(winners.length, 1, `exactly one fresh writer must win the reservation: ${JSON.stringify([resultA, resultB])}`);
  assert.equal(losers.length, 1, `exactly one fresh writer must be refused: ${JSON.stringify([resultA, resultB])}`);
  assert.ok(
    losers[0]?.code === 'META_ROUND_CONFLICT' || losers[0]?.code === 'META_ROUND_IN_PROGRESS',
    `the concurrent loser is refused typed without sending: ${JSON.stringify(losers[0])}`,
  );
  assert.equal(winners[0]?.stateRevision, 1, 'the winner admitted exactly one business turn');
  assert.equal(winners[0]?.recovered, false, 'the winner is not a recovery call');

  const winningEvidence = resultA.ok === true ? evidenceA : evidenceB;
  const harness = await openHarness(kPath, { app });
  try {
    const snapshot = await stateOf(harness.activation);
    assert.equal(snapshot.stateRevision, 1, 'the shared instance holds exactly one turn');
    const keys = await harness.store.keys();
    const ledgerKeys = keys.filter((key) => key.startsWith(META_FEEDBACK_LEDGER_PREFIX));
    const claimKeys = keys.filter((key) => key.startsWith(META_FEEDBACK_CLAIM_PREFIX));
    assert.equal(ledgerKeys.length, 1, 'exactly one durable terminal ledger');
    assert.equal(claimKeys.length, 1, 'exactly one durable reservation');
    assert.equal(ledgerKeys[0], ledgerKeyFor(1));
    assert.equal(claimKeys[0], claimKeyFor(1));

    const ledger = await harness.store.get(ledgerKeyFor(1));
    assert.ok(ledger !== null && ledger !== undefined, 'the terminal ledger exists');
    const ledgerValue = ledger.value as Record<string, any>;
    assert.equal(ledgerValue.receipt.status, 'admitted');
    assert.equal(ledgerValue.proposalDigest, winners[0]?.proposalDigest);
    assert.equal(harness.activation.facade.kCounters(BUSINESS_ID).effectDispatches, 0, 'zero K effects');
    assert.equal(harness.activation.counters.externalEffectDispatches, 0, 'zero external effects');
    assert.equal(keys.some((key) => key.includes('effect-journal')), false, 'zero effect-journal rows');

    const replay = await runMetaFeedbackWorkflow({
      facade: harness.activation.facade,
      store: harness.store,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [winningEvidence] },
      now: () => NOW,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.receiptDigest, ledgerValue.receiptDigest);
    assert.equal((await stateOf(harness.activation)).stateRevision, 1);
  } finally {
    harness.activation.dispose();
    await harness.sqlite.close();
  }
});

test('T09-R1-P1b a crash after the reservation CAS recovers into exactly one turn', async () => {
  const kPath = join(dir, 'crash-reserve.sqlite');
  const evidence = evidenceKeyFor('evidence/crash-reserve');
  const seedSqlite = await openSqliteCasStore({ path: kPath });
  const seedCounts: Counts = { gets: 0, puts: 0, removes: 0 };
  await seedPlainEvidence(v10Store(seedSqlite, seedCounts), evidence, {
    kernelOutcome: 'admitted', semanticOutcome: 'admitted',
  });
  await seedSqlite.close();

  const outFile = join(dir, 'crash-reserve.json');
  const child = await spawnChild(CRASH_CHILD, [kPath, outFile, 'crash-after-reserve', evidence]);
  assert.equal(child.code, 42, `the child must die inside the crash window (stderr ${child.stderr.slice(0, 800)})`);
  const crashed = await readJson<Record<string, any>>(outFile);
  assert.equal(crashed.mode, 'crash-after-reserve');
  assert.equal(crashed.key, claimKeyFor(1));
  assert.equal(crashed.value.state, 'reserved');

  const harness = await openHarness(kPath, { app });
  try {
    const recovered = await runMetaFeedbackWorkflow({
      facade: harness.activation.facade,
      store: harness.store,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [evidence] },
      now: () => NOW,
    });
    assert.equal(recovered.status, 'proposed');
    assert.equal(recovered.replayed, false);
    assert.equal(recovered.recovered, true, 'the pre-send reservation was recovered');
    assert.equal(recovered.receipt?.status, 'admitted');
    assert.equal((await stateOf(harness.activation)).stateRevision, 1, 'recovery admitted exactly one turn');

    const ledger = await harness.store.get(ledgerKeyFor(1));
    assert.ok(ledger !== null && ledger !== undefined, 'recovery finalized the terminal ledger');

    const replay = await runMetaFeedbackWorkflow({
      facade: harness.activation.facade,
      store: harness.store,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [evidence] },
      now: () => NOW,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.receiptDigest, recovered.receiptDigest);
    assert.equal((await stateOf(harness.activation)).stateRevision, 1);
  } finally {
    harness.activation.dispose();
    await harness.sqlite.close();
  }
});

test('T09-R1-P1c a crash after K admission recovers the ORIGINAL receipt and refuses a competing input', async () => {
  const kPath = join(dir, 'crash-send.sqlite');
  const evidence = evidenceKeyFor('evidence/crash-send');
  const competing = evidenceKeyFor('evidence/crash-send-competing');
  const seedSqlite = await openSqliteCasStore({ path: kPath });
  const seedCounts: Counts = { gets: 0, puts: 0, removes: 0 };
  const seedStore = v10Store(seedSqlite, seedCounts);
  await seedPlainEvidence(seedStore, evidence, { kernelOutcome: 'admitted', semanticOutcome: 'unavailable' });
  await seedPlainEvidence(seedStore, competing, { kernelOutcome: 'denied', semanticOutcome: 'unavailable' });
  await seedSqlite.close();

  const outFile = join(dir, 'crash-send.json');
  const child = await spawnChild(CRASH_CHILD, [kPath, outFile, 'crash-after-send', evidence]);
  assert.equal(child.code, 42, `the child must die inside the crash window (stderr ${child.stderr.slice(0, 800)})`);
  const crashed = await readJson<Record<string, any>>(outFile);
  assert.equal(crashed.mode, 'crash-after-send');
  assert.equal(crashed.key, ledgerKeyFor(1));
  assert.equal(crashed.value.receipt.status, 'admitted');
  assert.equal(crashed.value.receiptDigest, sha256Canonical(crashed.value.receipt));

  const harness = await openHarness(kPath, { app });
  try {
    const recovered = await runMetaFeedbackWorkflow({
      facade: harness.activation.facade,
      store: harness.store,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [evidence] },
      now: () => NOW,
    });
    assert.equal(recovered.replayed, false);
    assert.equal(recovered.recovered, true, 'the post-admission reservation was recovered');
    assert.equal(recovered.receipt?.idempotentReplay, true, 'the selected Kernel answered through its durable message dedup');
    assert.deepEqual(
      receiptCore(recovered.receipt as Record<string, unknown>),
      receiptCore(crashed.value.receipt),
      'the ORIGINAL K admission (status/control turn/instance) is reproduced exactly',
    );
    assert.equal((await stateOf(harness.activation)).stateRevision, 1, 'recovery sent no second turn');

    const ledger = await harness.store.get(ledgerKeyFor(1));
    assert.ok(ledger !== null && ledger !== undefined);
    const ledgerReceipt = (ledger.value as Record<string, any>).receipt as Record<string, unknown>;
    assert.deepEqual(
      receiptCore(ledgerReceipt),
      receiptCore(crashed.value.receipt),
      'the terminal ledger records the recovered original admission',
    );

    const readsBefore = harness.store.readKeys.length;
    const putsBefore = harness.counts.puts;
    const competingError = await refusal(runMetaFeedbackWorkflow({
      facade: harness.activation.facade,
      store: harness.store,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [competing] },
      now: () => NOW,
    }));
    assert.equal(competingError.code, 'META_ROUND_CONFLICT', 'a competing input cannot take over the reserved round');
    assert.ok(
      harness.store.readKeys.slice(readsBefore).includes(competing),
      'the competing call read its own evidence before the terminal-ledger conflict refused it',
    );
    assert.equal(harness.counts.puts, putsBefore, 'the competing input wrote no round record');
    assert.equal((await stateOf(harness.activation)).stateRevision, 1, 'the competing input sent nothing');

    const replay = await runMetaFeedbackWorkflow({
      facade: harness.activation.facade,
      store: harness.store,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [evidence] },
      now: () => NOW,
    });
    assert.equal(replay.replayed, true);
    assert.deepEqual(
      receiptCore(replay.receipt as Record<string, unknown>),
      receiptCore(crashed.value.receipt),
    );
    assert.equal((await stateOf(harness.activation)).stateRevision, 1);
  } finally {
    harness.activation.dispose();
    await harness.sqlite.close();
  }
});

test('T09-R1-P2 tenant/deployment scopes cannot read, replay or steer each other', async () => {
  const kPath = join(dir, 'tenants.sqlite');
  const deploymentA = Object.freeze({ deployedAppId: 'deploy:t09-a', tenantId: 'tenant:t09-a', appId: APP_ID });
  const deploymentB = Object.freeze({ deployedAppId: 'deploy:t09-b', tenantId: 'tenant:t09-b', appId: APP_ID });
  const scopeA = scopeFor(deploymentA);
  const scopeB = scopeFor(deploymentB);
  assert.notEqual(ledgerKeyFor(1, scopeA), ledgerKeyFor(1, scopeB), 'the round keys differ by trusted tuple');

  const sqliteA = await openSqliteCasStore({ path: kPath });
  const sqliteB = await openSqliteCasStore({ path: kPath });
  const countsA: Counts = { gets: 0, puts: 0, removes: 0 };
  const countsB: Counts = { gets: 0, puts: 0, removes: 0 };
  const storeA = v10Store(sqliteA, countsA);
  const storeB = v10Store(sqliteB, countsB);
  const activationA = await activateApp(app, storeA, deploymentA, deploymentA.tenantId);
  const activationB = await activateApp(app, storeB, deploymentB, deploymentB.tenantId);
  try {
    const evidenceA = evidenceKeyFor('evidence/1', deploymentA);
    const evidenceB = evidenceKeyFor('evidence/1', deploymentB);
    await seedPlainEvidence(storeA, evidenceA, { kernelOutcome: 'admitted', semanticOutcome: 'unavailable' });
    await seedPlainEvidence(storeB, evidenceB, { kernelOutcome: 'admitted', semanticOutcome: 'unavailable' });

    const a1 = await runMetaFeedbackWorkflow({
      facade: activationA.facade,
      store: storeA,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [evidenceA] },
      now: () => NOW,
    });
    const b1 = await runMetaFeedbackWorkflow({
      facade: activationB.facade,
      store: storeB,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [evidenceB] },
      now: () => NOW,
    });
    assert.equal(a1.status, 'proposed');
    assert.equal(b1.status, 'proposed');
    assert.equal(a1.replayed, false);
    assert.equal(b1.replayed, false, 'B never replays A even with equivalent evidence content');
    assert.equal(a1.ledgerKey, ledgerKeyFor(1, scopeA));
    assert.equal(b1.ledgerKey, ledgerKeyFor(1, scopeB));
    assert.equal(a1.claimKey, claimKeyFor(1, scopeA));
    assert.equal(b1.claimKey, claimKeyFor(1, scopeB));
    assert.notEqual(a1.ledgerKey, b1.ledgerKey);
    assert.equal((await stateOf(activationA)).stateRevision, 1);
    assert.equal((await stateOf(activationB)).stateRevision, 1, 'B admitted its own turn rather than replaying A');

    const ledgerA1 = await storeA.get(ledgerKeyFor(1, scopeA));
    const ledgerB1 = await storeB.get(ledgerKeyFor(1, scopeB));
    assert.ok(ledgerA1 !== null && ledgerA1 !== undefined);
    assert.ok(ledgerB1 !== null && ledgerB1 !== undefined);
    assert.deepEqual((ledgerA1.value as Record<string, unknown>).scope, scopeA, 'A ledger carries only the A tuple');
    assert.deepEqual((ledgerB1.value as Record<string, unknown>).scope, scopeB, 'B ledger carries only the B tuple');
    assert.equal((ledgerA1.value as Record<string, any>).receipt.status, 'admitted');
    assert.equal((ledgerB1.value as Record<string, any>).receipt.status, 'admitted');

    // Same evidence CONTENT in each independent scope is still two rounds.
    await seedPlainEvidence(storeA, evidenceKeyFor('evidence/2', deploymentA), {
      kernelOutcome: 'admitted', semanticOutcome: 'unavailable',
    });
    await seedPlainEvidence(storeB, evidenceKeyFor('evidence/2', deploymentB), {
      kernelOutcome: 'admitted', semanticOutcome: 'unavailable',
    });
    const a2 = await runMetaFeedbackWorkflow({
      facade: activationA.facade,
      store: storeA,
      workflow: roundIntent(2),
      sources: { evidenceKeys: [evidenceKeyFor('evidence/2', deploymentA)] },
      now: () => NOW,
    });
    const b2 = await runMetaFeedbackWorkflow({
      facade: activationB.facade,
      store: storeB,
      workflow: roundIntent(2),
      sources: { evidenceKeys: [evidenceKeyFor('evidence/2', deploymentB)] },
      now: () => NOW,
    });
    assert.equal(a2.replayed, false);
    assert.equal(b2.replayed, false);
    assert.notEqual(a2.inputDigest, b2.inputDigest, 'the injective scope is part of the round input identity');
    assert.notEqual(a2.ledgerKey, b2.ledgerKey);
    assert.equal((await stateOf(activationA)).stateRevision, 2);
    assert.equal((await stateOf(activationB)).stateRevision, 2);

    // Pointing B at A's evidence must refuse BEFORE a physical foreign read.
    const readsBefore = storeB.readKeys.length;
    const putsBefore = countsB.puts;
    const foreign = await refusal(runMetaFeedbackWorkflow({
      facade: activationB.facade,
      store: storeB,
      workflow: roundIntent(3),
      sources: { evidenceKeys: [evidenceA] },
      now: () => NOW,
    }));
    assert.equal(foreign.code, 'META_EVIDENCE_FOREIGN_SCOPE');
    assert.equal(storeB.readKeys.length, readsBefore, 'no foreign row was physically read');
    assert.equal(countsB.puts, putsBefore, 'no round record was written');

    const legacy = await refusal(runMetaFeedbackWorkflow({
      facade: activationB.facade,
      store: storeB,
      workflow: roundIntent(3),
      sources: { evidenceKeys: ['v10/t09/evidence/legacy-global'] },
      now: () => NOW,
    }));
    assert.equal(legacy.code, 'META_EVIDENCE_FOREIGN_SCOPE');
    assert.equal(storeB.readKeys.length, readsBefore, 'a legacy global key is not physically read either');

    // The Host SQLite file is physically shared, but every round record is
    // addressed by its own trusted tuple and carries its owner's scope; the
    // runner never derives the other Tenant's key.
    const keysA = await storeA.keys();
    const keysB = await storeB.keys();
    for (const key of [ledgerKeyFor(1, scopeA), ledgerKeyFor(2, scopeA)]) {
      assert.ok(keysA.includes(key), `A's ledger ${key} exists`);
    }
    for (const key of [ledgerKeyFor(1, scopeB), ledgerKeyFor(2, scopeB)]) {
      assert.ok(keysB.includes(key), `B's ledger ${key} exists`);
    }
  } finally {
    activationA.dispose();
    activationB.dispose();
    await sqliteA.close();
    await sqliteB.close();
  }
});

test('T09-R1-P2b an activation without a deployment identity is refused before any store read', async () => {
  const kPath = join(dir, 'no-deployment.sqlite');
  const sqlite = await openSqliteCasStore({ path: kPath });
  const counts: Counts = { gets: 0, puts: 0, removes: 0 };
  const store = v10Store(sqlite, counts);
  const activation = await activateWithoutDeployment(app, store);
  try {
    const error = await refusal(runMetaFeedbackWorkflow({
      facade: activation.facade,
      store,
      workflow: roundIntent(1),
      sources: { evidenceKeys: [evidenceKeyFor('evidence/1', DEPLOYMENT)] },
      now: () => NOW,
    }));
    assert.equal(error.code, 'META_DEPLOYMENT_REQUIRED');
    assert.equal(counts.gets, 0, 'the unscoped activation was refused before any physical read');
    assert.equal(counts.puts, 0, 'the unscoped activation wrote nothing');
  } finally {
    activation.dispose();
    await sqlite.close();
  }
});
