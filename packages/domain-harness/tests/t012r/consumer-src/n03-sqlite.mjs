/**
 * T12-N03 / N09 / N10 / N14 — REAL SQLite host journey against the PACKED
 * candidate, executed from the clean external consumer.
 *
 *  - Real physical SQLite file (WAL, synchronous=FULL, foreign_keys=ON).
 *  - sqlite_version() + PRAGMAs recorded, not assumed.
 *  - Phase B: close ALL connections, REOPEN from a NEW OS process, assert
 *    exact durable identity (pin + resource currentness + completed effect).
 *  - Phase N09: parent-controlled OS kill (SIGKILL) of a child AFTER the
 *    durable 'started' journal record but BEFORE effect completion; a later
 *    process replays the exact turn and proves exactly-once execution.
 *  - Phase N10: kill AFTER durable completion but before caller ack; replay
 *    proves 'replayed' with zero duplicate observable effect.
 *  - Executions are counted in an append-only file so duplicates are
 *    observable across processes.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, appendFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as V3 from '@kaicreator/domain-harness/v3';
import {
  NodeSqliteRuntimeStore,
  openNodeSqliteAuthorityStores,
} from '@kaicreator/domain-harness-node';
import Database from 'better-sqlite3';
import {
  T010A_DECISION_SCHEMA,
  T010A_EFFECT_TYPE,
  T010A_IDEMPOTENCY_KEY,
  T010A_NOW,
  T010A_OCCURRENCE_TARGET,
  T010A_RESOURCE_CURRENTNESS,
  T010A_WORKFLOW_INSTANCE_ID,
  T010A_WORKFLOW_TARGET,
  T010aTestExecutor,
  t010aGovernanceBody,
  t010aResolvedDecision,
  t010aSha256,
  t010aWorkflowDefinition,
} from './fixture.mjs';

const mode = process.argv[2] ?? 'parent';
const artifactsDir = resolve(fileURLToPath(new URL('../artifacts/', import.meta.url)));
const dbDir = join(artifactsDir, 'sqlite');
const DB = join(dbDir, 't012-real.db');
const COUNT_FILE = join(dbDir, 'executions.jsonl');
const rows = [];
function row(id, verdict, detail) {
  rows.push({ id, verdict, detail });
  console.log(`${verdict} ${id} — ${detail}`);
  if (verdict === 'FAIL') process.exitCode = 1;
}

async function buildBaselineAndPin(stores, runtimeStore) {
  const b1 = await t010aGovernanceBody(t010aSha256, V3.createGovernanceBaselineBody);
  await stores.baselines.putBody(b1);
  const coordinator = new V3.GovernanceExecutionCoordinator(runtimeStore, t010aSha256);
  const pin = await coordinator.pinExecution({
    workflowTarget: T010A_WORKFLOW_TARGET,
    workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 't010a',
      packageId: 'pkg-t010a-1',
      domainIntelligenceContentDigest: 'cdi-t010a-1',
      governanceBaseline: b1.identity,
    },
    authorityClass: 'PRODUCTION',
    resourceCurrentness: [T010A_RESOURCE_CURRENTNESS],
  });
  return { b1, coordinator, pin };
}

function requestFor(turnMessageId, effectInput, idempotencyKey) {
  return {
    target: { ...T010A_OCCURRENCE_TARGET },
    turn: { kind: 'message', sourceMessageId: turnMessageId },
    trigger: { kind: 'event', eventType: 'T010A_COMPLETE_REQUESTED' },
    workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
    definition: t010aWorkflowDefinition(effectInput, idempotencyKey),
    currentStateKey: 'READY',
    context: {},
    event: { type: 'T010A_COMPLETE_REQUESTED', payload: { note: 't010a-note' } },
    resolved: t010aResolvedDecision('harness-machine', {
      decision: { outcome: 'complete', data: { note: 't010a-note' } },
      event: { type: 'T010A_COMPLETE_REQUESTED', payload: { note: 't010a-note' } },
    }),
    decisionSchema: T010A_DECISION_SCHEMA,
    now: T010A_NOW,
  };
}

function effectTools(executor, countFile, slowMs = 0) {
  return {
    resolve(effectType) {
      if (effectType !== T010A_EFFECT_TYPE) return undefined;
      return { effectType, effectSemantics: 'idempotent' };
    },
    async execute(request) {
      if (slowMs > 0) await new Promise((r) => setTimeout(r, slowMs));
      appendFileSync(countFile, JSON.stringify({ effectType: request.binding.effectType, input: request.input, at: new Date().toISOString() }) + '\n');
      return executor.run('op.t010a.record', request.input);
    },
  };
}

async function openBoth() {
  const runtimeStore = new NodeSqliteRuntimeStore({ path: DB });
  const stores = openNodeSqliteAuthorityStores({ path: DB });
  return { runtimeStore, stores };
}

function sqliteVersion() {
  const db = new Database(DB);
  const v = db.prepare('select sqlite_version() v').get().v;
  const journalMode = db.pragma('journal_mode', { simple: true });
  db.close();
  return { sqliteVersion: v, journalMode };
}

// ---------------------------------------------------------------------------
// child: reopen-check (new process; Phase B evidence)
// ---------------------------------------------------------------------------
if (mode === 'reopen-check') {
  const { runtimeStore, stores } = await openBoth();
  const pragmas = runtimeStore.inspectPragmas();
  const outcome = {};
  const coordinator = new V3.GovernanceExecutionCoordinator(runtimeStore, t010aSha256);
  const pin = await coordinator.requirePinnedExecution(T010A_WORKFLOW_INSTANCE_ID);
  outcome.pin = {
    authorityClass: pin.authorityClass,
    resourceCurrentness: pin.resourceCurrentness,
    workflowInstanceId: pin.workflowInstanceId,
  };
  const turnId = V3.deriveDurableControlTurnId(T010A_OCCURRENCE_TARGET, { kind: 'message', sourceMessageId: 'msg:t010a:1' });
  const record = await stores.admissionEffectJournal.getEffect(`${turnId}/effect/1`);
  outcome.journalRecord = record === null ? null : { status: record.status, input: record.input, effectType: record.effectType, durableControlTurnId: record.durableControlTurnId };
  outcome.pragmas = pragmas;
  outcome.sqlite = sqliteVersion();
  stores.close();
  runtimeStore.close();
  console.log('REOPEN_RESULT ' + JSON.stringify(outcome));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// child: crash victim (N09: slow effect; N10: fast effect + slow ack)
// argv: crash-victim pre|post
// ---------------------------------------------------------------------------
if (mode === 'crash-victim') {
  const phase = process.argv[3];
  const { runtimeStore, stores } = await openBoth();
  const { coordinator } = await buildBaselineAndPin(stores, runtimeStore);
  const executor = new T010aTestExecutor();
  const request = requestFor('msg:t010a:1', { note: 't012-sqlite-journey-1' }, T010A_IDEMPOTENCY_KEY);
  const journal = stores.admissionEffectJournal;
  const admission = V3.admitCentralDecision(request, {
    governance: coordinator,
    baselines: stores.baselines,
    sha256: t010aSha256,
    effectJournal: journal,
    effectTools: effectTools(executor, COUNT_FILE, phase === 'pre' ? 4000 : 0),
  });
  if (phase === 'pre') {
    // Wait until the started record is durable, signal the parent, then keep
    // "executing" so the parent can kill us mid-execute.
    const turnId = V3.deriveDurableControlTurnId(T010A_OCCURRENCE_TARGET, { kind: 'message', sourceMessageId: 'msg:t010a:1' });
    for (let i = 0; i < 100; i++) {
      const rec = await journal.getEffect(`${turnId}/effect/1`);
      if (rec !== null && rec.status === 'started') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    console.log('STARTED_DURABLE');
    await admission; // still mid-execute when the parent kills us
    console.log('COMPLETED (unexpected if pre-crash)');
  } else {
    const outcome = await admission; // completes durably
    assert.equal(outcome.status, 'admitted');
    console.log('COMPLETED_DURABLE');
    await new Promise((r) => setTimeout(r, 8000)); // killed before ack
  }
  stores.close();
  runtimeStore.close();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// child: replay (new process; re-admits the exact same turn)
// ---------------------------------------------------------------------------
if (mode === 'replay') {
  const { runtimeStore, stores } = await openBoth();
  const { coordinator } = await buildBaselineAndPin(stores, runtimeStore);
  const executor = new T010aTestExecutor();
  const request = requestFor('msg:t010a:1', { note: 't012-sqlite-journey-1' }, T010A_IDEMPOTENCY_KEY);
  const outcome = await V3.admitCentralDecision(request, {
    governance: coordinator,
    baselines: stores.baselines,
    sha256: t010aSha256,
    effectJournal: stores.admissionEffectJournal,
    effectTools: effectTools(executor, COUNT_FILE),
  });
  const executions = readFileSync(COUNT_FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log('REPLAY_RESULT ' + JSON.stringify({
    status: outcome.status,
    effectDisposition: outcome.status === 'admitted' ? outcome.admitted.effects[0].disposition : null,
    effectId: outcome.status === 'admitted' ? outcome.admitted.effects[0].effectId : null,
    executionCount: executions.length,
  }));
  stores.close();
  runtimeStore.close();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// parent orchestrator
// ---------------------------------------------------------------------------
assert.equal(mode, 'parent');
mkdirSync(dbDir, { recursive: true });
for (const f of [DB, DB + '-wal', DB + '-shm', COUNT_FILE]) {
  if (existsSync(f)) rmSync(f);
}

const self = fileURLToPath(import.meta.url);

function runChild(args, { killAfterSignal = null, timeoutMs = 30000 } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [self, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let killed = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectPromise(new Error(`child timeout: ${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (killAfterSignal !== null && !killed && stdout.includes(killAfterSignal)) {
        killed = true;
        // Give the signal line a moment to flush, then hard-kill.
        setTimeout(() => child.kill('SIGKILL'), 200);
      }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout, killed });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
  });
}

// --- Phase A: real file-backed journey in THIS process. -------------------
{
  const { runtimeStore, stores } = await openBoth();
  const pragmas = runtimeStore.inspectPragmas();
  const { coordinator } = await buildBaselineAndPin(stores, runtimeStore);
  const executor = new T010aTestExecutor();
  const outcome = await V3.admitCentralDecision(
    requestFor('msg:t010a:1', { note: 't012-sqlite-journey-1' }, T010A_IDEMPOTENCY_KEY),
    {
      governance: coordinator,
      baselines: stores.baselines,
      sha256: t010aSha256,
      effectJournal: stores.admissionEffectJournal,
      effectTools: effectTools(executor, COUNT_FILE),
    },
  );
  assert.equal(outcome.status, 'admitted');
  assert.equal(outcome.admitted.targetState, 'DONE');
  const turnId = V3.deriveDurableControlTurnId(T010A_OCCURRENCE_TARGET, { kind: 'message', sourceMessageId: 'msg:t010a:1' });
  const record = await stores.admissionEffectJournal.getEffect(`${turnId}/effect/1`);
  assert.equal(record.status, 'completed');
  const sv = sqliteVersion();
  row(
    'T12-N03-sqlite-real-file',
    'PASS',
    `physical DB ${DB}; sqlite_version=${sv.sqliteVersion}; journal_mode=${sv.journalMode}; synchronous=FULL pragmas=${JSON.stringify(pragmas)}; authoritative DONE with 1 completed durable effect`,
  );
  stores.close();
  runtimeStore.close();
}

// --- Phase B: NEW process reopens after ALL connections closed. -----------
{
  const { code, stdout } = await runChild(['reopen-check']);
  assert.equal(code, 0, stdout);
  const result = JSON.parse(stdout.split('REOPEN_RESULT ')[1].trim());
  assert.equal(result.pin.authorityClass, 'PRODUCTION');
  assert.equal(result.pin.workflowInstanceId, T010A_WORKFLOW_INSTANCE_ID);
  assert.deepEqual(result.pin.resourceCurrentness, [
    { componentId: T010A_RESOURCE_CURRENTNESS.componentId, providerId: T010A_RESOURCE_CURRENTNESS.providerId, resourceKey: T010A_RESOURCE_CURRENTNESS.resourceKey, revisionDigest: T010A_RESOURCE_CURRENTNESS.revisionDigest },
  ]);
  assert.equal(result.journalRecord.status, 'completed');
  assert.deepEqual(result.journalRecord.input, { note: 't012-sqlite-journey-1' });
  assert.equal(result.sqlite.sqliteVersion, sqliteVersion().sqliteVersion);
  row(
    'T12-N03-cross-process-reopen',
    'PASS',
    `new OS process reopened the closed DB: PRODUCTION pin + exact resource currentness + completed effect byte-intact (sqlite ${result.sqlite.sqliteVersion})`,
  );
}

// --- Phase N09: kill AFTER durable 'started', BEFORE completion. ----------
{
  // Fresh DB for the crash phases so Phase A/B evidence stays pristine.
  for (const f of [DB, DB + '-wal', DB + '-shm', COUNT_FILE]) {
    if (existsSync(f)) rmSync(f);
  }
  const victim = await runChild(['crash-victim', 'pre'], { killAfterSignal: 'STARTED_DURABLE', timeoutMs: 30000 });
  assert.equal(victim.killed, true, 'parent must have hard-killed the mid-execute child');
  assert.equal(victim.signal, 'SIGKILL');
  const replay = await runChild(['replay']);
  assert.equal(replay.code, 0, replay.stdout);
  const result = JSON.parse(replay.stdout.split('REPLAY_RESULT ')[1].trim());
  assert.equal(result.status, 'admitted');
  assert.equal(result.executionCount, 1, `exactly-once execution after mid-execute kill (got ${result.executionCount})`);
  row(
    'T12-N09-crash-pre-commit',
    'PASS',
    `SIGKILL after durable 'started' record, before effect completion; cross-process replay completed the exact effect identity with executionCount=${result.executionCount} (no partial/duplicate authority)`,
  );
}

// --- Phase N10: kill AFTER durable completion, before caller ack. ---------
{
  for (const f of [DB, DB + '-wal', DB + '-shm', COUNT_FILE]) {
    if (existsSync(f)) rmSync(f);
  }
  const victim = await runChild(['crash-victim', 'post'], { killAfterSignal: 'COMPLETED_DURABLE', timeoutMs: 30000 });
  assert.equal(victim.killed, true);
  assert.equal(victim.signal, 'SIGKILL');
  const replay = await runChild(['replay']);
  assert.equal(replay.code, 0, replay.stdout);
  const result = JSON.parse(replay.stdout.split('REPLAY_RESULT ')[1].trim());
  assert.equal(result.status, 'admitted');
  assert.equal(result.effectDisposition, 'replayed', 'committed effect must replay, never re-execute');
  assert.equal(result.executionCount, 1, `zero duplicate observable effect (got ${result.executionCount})`);
  row(
    'T12-N10-crash-post-commit',
    'PASS',
    `SIGKILL after durable completion before ack; replay disposition=${result.effectDisposition} executionCount=${result.executionCount} (outcome-unknown resolved by exact idempotency identity, never blind duplicate)`,
  );
}

// Preserve the post-crash DB as evidence.
writeFileSync(join(artifactsDir, 'n03-sqlite.json'), JSON.stringify({ rows }, null, 2));
console.log(`n03-sqlite complete: ${rows.length} rows`);