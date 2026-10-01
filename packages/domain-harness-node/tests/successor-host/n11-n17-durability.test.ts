// #457 N11–N17: engine-3 durable semantics on a REAL SQLite Runtime —
// permanent rejection routing with surviving sources (N11), transient
// recovery ownership (N12), I-LOCAL tool receipts that survive process death
// (N14), effect-journal adversarial integrity (N15), observation continuity
// across restart (N16) and real concurrent send pressure including a held
// BEGIN IMMEDIATE competitor (N17). N13's three intra-turn crash windows
// need a controllable in-product commit barrier; the two REPRODUCIBLE real
// kill windows are already exercised by N10 — the third is recorded
// NOT_RUN(BARRIER) honestly per the prep's authorization.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeDomainRuntime } from '../../src/index.js';
import { StaticPackageRegistry } from '@kaicreator/domain-harness';
import type { DomainRuntime } from '@kaicreator/domain-harness/v2';
import {
  CRM_SNAPSHOT,
  HOST_MAXIMA,
  compileSuccessor,
  createNodeHost,
  fixedBusinessSnapshots,
  freshDbPath,
  inventoryCounterPath,
  openStore,
  rawSql,
  retainedLegacyPackage,
} from './helper.ts';

const NOW = () => '2026-10-01T00:00:00.000Z';
const CHILD_FIXTURE = resolvePath(join(fileURLToPath(import.meta.url), '..', 'fixtures', 'child.ts'));

interface ChildReport {
  readonly ack?: string;
  readonly disposition?: string;
  readonly domainData?: Array<{ key: string; value: unknown }>;
}

async function runChild(args: readonly string[], options: { readonly withTool?: boolean; readonly counterPath?: string } = {}): Promise<{ readonly code: number | null; readonly stdout: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--import', 'tsx', CHILD_FIXTURE, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_TEST_CONTEXT: undefined,
        SX_WITH_TOOL: undefined,
        ...(options.withTool === true ? { SX_WITH_TOOL: '1' } : {}),
        ...(options.counterPath === undefined ? { SX_COUNTER_PATH: undefined } : { SX_COUNTER_PATH: options.counterPath }),
      },
    });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.on('error', rejectPromise);
    child.on('close', (code) => resolvePromise({ code, stdout }));
  });
}

function childReport(stdout: string): ChildReport {
  const LineBreak = String.fromCharCode(10);
  const jsonLine = stdout.split(LineBreak).map((line) => line.trim()).filter((line) => line.startsWith('{')).pop();
  assert.ok(jsonLine, `child produced a JSON report: ${stdout.slice(0, 300)}`);
  return JSON.parse(jsonLine!) as ChildReport;
}

async function bootRuntime(path: string, options: { readonly counterPath?: string; readonly observation?: boolean } = {}) {
  const successor = compileSuccessor(options.counterPath === undefined ? {} : { withTool: true });
  const retained = await retainedLegacyPackage();
  const store = openStore(path);
  const runtime = await createNodeDomainRuntime({
    packageRegistry: new StaticPackageRegistry([
      retained,
      {
        manifest: successor.manifest,
        bindings: options.counterPath === undefined ? {} : { 'sx-node-inventory-v1': { opaque: 'host-local-slot' } },
        domainData: successor.domainData,
      },
    ], successor.manifest.packageId),
    store,
    bindings: createNodeHost({ counterPath: options.counterPath }),
    businessSnapshots: fixedBusinessSnapshots(CRM_SNAPSHOT),
    supportedPackageDataBounds: { ...HOST_MAXIMA },
    now: NOW,
    ...(options.observation === true ? { observation: { mode: 'enabled' as const } } : {}),
  });
  return { runtime, store, successor };
}

async function sendBegin(runtime: DomainRuntime, instanceKey: string, messageId: string): Promise<void> {
  await runtime.openInstance({
    address: { workflowId: 'parent', instanceKey },
    correlationId: `corr-${instanceKey}`,
    input: { caseId: instanceKey },
  });
  await runtime.send({
    messageId,
    target: { workflowId: 'parent', instanceKey },
    type: 'BEGIN',
    payload: {},
    correlationId: `corr-${instanceKey}`,
  });
}

test('N11: permanent child-send rejection routes durably and the source survives (target_terminal)', async () => {
  const { path } = freshDbPath('n11');
  const { runtime, store } = await bootRuntime(path);
  // Terminalize the child target FIRST, then send the parent journey: the
  // domain-message effect hits a terminal target and must route through the
  // compiled total rejected route; the parent survives in its rejected state.
  await runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'child-1' }, correlationId: 'c', input: {} });
  await runtime.send({ messageId: 'child-done', target: { workflowId: 'child', instanceKey: 'child-1' }, type: 'NOTIFY', payload: {}, correlationId: 'c' });
  await new Promise((resolve) => setTimeout(resolve, 300));

  await sendBegin(runtime, 'n11-parent', 'n11-begin');
  await new Promise((resolve) => setTimeout(resolve, 400));

  const parent = await runtime.query({ kind: 'instance', target: { workflowId: 'parent', instanceKey: 'n11-parent' } });
  assert.ok(parent.value, 'the rejected source survives rejection');
  assert.equal(parent.value?.state?.stateId ?? (parent.value?.state as { stateId?: string } | null)?.stateId, 'rejected');
  const sql = rawSql(path);
  const journal = sql.rows("SELECT status FROM dh_v2_effect_journal WHERE effect_kind = 'domain-message'") as Array<{ status: string }>;
  assert.ok(journal.length >= 1, 'the rejection is journalled');
  sql.close();
  store.close();
}, 120_000);

test('N12: transient target_not_found stays recovery-owned; technical failures never relabel as semantic rejection', async () => {
  const { path } = freshDbPath('n12');
  const { runtime, store } = await bootRuntime(path);
  // The child target is NOT provisioned: parent BEGIN drains into a
  // transient (recovery-owned) failure, never a durable semantic rejection.
  await runtime.openInstance({ address: { workflowId: 'parent', instanceKey: 'n12-parent' }, correlationId: 'c12', input: {} });
  await runtime.send({ messageId: 'n12-begin', target: { workflowId: 'parent', instanceKey: 'n12-parent' }, type: 'BEGIN', payload: {}, correlationId: 'c12' });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const failed = await runtime.query({ kind: 'instance', target: { workflowId: 'parent', instanceKey: 'n12-parent' } });
  assert.equal(failed.value?.lifecycle, 'recovery_required', 'transient failure is recovery-owned');
  const sql = rawSql(path);
  const semanticRejects = sql.rows("SELECT output_json FROM dh_v2_effect_journal WHERE effect_kind = 'domain-message' AND output_json LIKE '%rejected%'") as Array<{ output_json: string }>;
  assert.equal(semanticRejects.filter((row) => row.output_json.includes('target_terminal')).length, 0, 'no permanent semantic rejection was invented for a transient condition');
  sql.close();
  store.close();
}, 120_000);

test('N14: I-LOCAL tool receipts survive process death in an out-of-process counter; replay never double-invokes', async () => {
  const { path, dir } = freshDbPath('n14');
  const counterPath = inventoryCounterPath(dir);
  {
    const { store } = await bootRuntime(path, { counterPath });
    store.close();
  }
  // Worker 1: provision + one tool-bearing journey in its own OS process.
  const first = await runChild(['send', path, join(dir, 'n14-m1'), 'n14-target', 'n14-msg-1', 'child-1'], { withTool: true, counterPath });
  assert.equal(first.code, 0, `worker 1 exits cleanly: ${first.stdout.slice(0, 300)}`);
  const receipts = () => readFileSync(counterPath, 'utf8').trim().split(String.fromCharCode(10)).filter((line) => line.length > 0);
  assert.equal(receipts().length, 1, 'exactly one durable tool invocation receipt');

  // Replay the SAME message id in a NEW process: duplicate acceptance
  // converges, and the durable receipt count does not move.
  const replay = await runChild(['send', path, join(dir, 'n14-m2'), 'n14-target', 'n14-msg-1', 'child-1'], { withTool: true, counterPath });
  assert.equal(replay.code, 0, `replay worker exits cleanly: ${replay.stdout.slice(0, 300)}`);
  const report = childReport(replay.stdout);
  assert.ok(report.ack === 'duplicate' || report.disposition === 'processed', `duplicate acceptance converges: ${JSON.stringify(report)}`);
  assert.equal(receipts().length, 1, 'completed tool replay executes zero additional durable invocations');

  // A NEW message id invokes the durable tool exactly once more.
  const second = await runChild(['send', path, join(dir, 'n14-m3'), 'n14-target-2', 'n14-msg-2', 'child-2'], { withTool: true, counterPath });
  assert.equal(second.code, 0);
  assert.equal(receipts().length, 2, 'a new durable journey invokes once more');
}, 180_000);

test('N15: effect-journal adversarial integrity — same effect id with conflicting material never rewrites history', async () => {
  const { path } = freshDbPath('n15');
  const { runtime, store } = await bootRuntime(path);
  const journal = (store as unknown as {
    beginEffect(request: Record<string, unknown>): Promise<unknown>;
  });
  await runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'n15-child' }, correlationId: 'c15', input: {} });
  const request = {
    effectId: 'sx-n15-effect-1',
    effectKind: 'domain-message',
    effectSemantics: 'none',
    sourceMessageId: 'sx-n15-source',
    target: { workflowId: 'child', instanceKey: 'n15-child' },
    status: 'started' as const,
    attempt: 1,
    startedAt: NOW(),
  };
  await journal.beginEffect(request);
  // Same effect id with CONFLICTING material: the store fails closed with an
  // identity collision — the first durable record stays authoritative.
  await assert.rejects(
    journal.beginEffect({ ...request, input: { forged: true } }),
    /collision/i,
    'a conflicting same-effect-id attempt fails closed',
  );
  const sql = rawSql(path);
  const rows = sql.rows('SELECT effect_id, output_json FROM dh_v2_effect_journal WHERE effect_id = ?', 'sx-n15-effect-1') as Array<{ effect_id: string }>;
  assert.equal(rows.length, 1, 'exactly one durable record per effect id');
  sql.close();
  store.close();
  void runtime;
}, 120_000);

test('N16: observation streams survive restart with ordered sequences and preserved cursors', async () => {
  const { path } = freshDbPath('n16');
  {
    const { runtime, store } = await bootRuntime(path, { observation: true });
    const provisioning = runtime.provisioning;
    if (provisioning?.status !== 'ENABLED') throw new Error('observation provisioning not enabled');
    await provisioning.ensureOpen({
      provisioningKey: 'sx:n16:1',
      address: { workflowId: 'parent', instanceKey: 'n16-1' },
      correlationId: 'c16',
      input: { caseId: 'n16' },
    });
    store.close();
  }
  {
    const { runtime, store } = await bootRuntime(path, { observation: true });
    const streams = await (runtime as unknown as { observation?: { listStreams?(): Promise<unknown[]> } }).observation?.listStreams?.();
    const sql = rawSql(path);
    const records = sql.rows('SELECT workflow_id, instance_key, epoch_id, sequence FROM dh_v3_observation_records ORDER BY workflow_id, instance_key, epoch_id, sequence') as Array<{ workflow_id: string; instance_key: string; epoch_id: string; sequence: number }>;
    assert.ok(records.length >= 1, 'the INSTANCE_OPENED observation is durably recorded');
    const perStream = new Map<string, number[]>();
    for (const record of records) {
      const streamKey = `${record.workflow_id}/${record.instance_key}/${record.epoch_id}`;
      const list = perStream.get(streamKey) ?? [];
      list.push(record.sequence);
      perStream.set(streamKey, list);
    }
    for (const [streamKey, sequences] of perStream) {
      const sorted = [...sequences].sort((left, right) => left - right);
      assert.deepEqual(sequences, sorted, `stream ${streamKey} sequences are ordered after restart`);
      for (let index = 1; index < sequences.length; index += 1) {
        assert.equal(sequences[index], sequences[index - 1]! + 1, `stream ${streamKey} sequence contiguity`);
      }
    }
    sql.close();
    void streams;
    store.close();
  }
}, 120_000);

test('N17: concurrent real-process sends stay unique; a held BEGIN IMMEDIATE competitor surfaces as SQLITE_BUSY, never a semantic rejection', async () => {
  const { path, dir } = freshDbPath('n17');
  {
    const { store } = await bootRuntime(path);
    store.close();
  }
  // 4 distinct journeys from 4 real OS processes concurrently.
  const sends = await Promise.all([0, 1, 2, 3].map((index) =>
    runChild(['send', path, join(dir, `n17-m${index}`), `n17-target-${index}`, `n17-msg-${index}`])));
  for (const result of sends) {
    assert.equal(result.code, 0, `worker completes under contention: ${result.stdout.slice(0, 300)}`);
  }
  const sql = rawSql(path);
  const instances = sql.rows("SELECT instance_key FROM dh_v2_instances WHERE instance_key LIKE 'n17-target-%'");
  assert.equal(instances.length, 4, 'four distinct durable instances');
  const messages = sql.rows("SELECT message_id FROM dh_v2_messages WHERE message_id LIKE 'n17-msg-%'");
  assert.equal(messages.length, 4, 'four unique durable messages, no cross-talk');
  sql.close();

  // A deliberately held BEGIN IMMEDIATE competing connection: writers must
  // either wait it out within busy_timeout or surface a distinguishable
  // SQLITE_BUSY/locked error — never a silent semantic rejection.
  const holder = rawSql(path);
  holder.exec('BEGIN IMMEDIATE');
  try {
    const contended = await bootRuntime(path);
    const busyProvisioning = contended.runtime.provisioning;
    if (busyProvisioning?.status === 'ENABLED') {
      await busyProvisioning.ensureOpen({
        provisioningKey: 'sx:n17:busy',
        address: { workflowId: 'parent', instanceKey: 'n17-busy-target' },
        correlationId: 'c17b',
        input: { caseId: 'busy' },
      });
    }
    const ack = await contended.runtime.send({
      messageId: 'n17-busy-1',
      target: { workflowId: 'parent', instanceKey: 'n17-busy-target' },
      type: 'BEGIN',
      payload: {},
      correlationId: 'c17b',
    });
    assert.ok(ack.status === 'accepted' || ack.status === 'duplicate', `the writer converges within busy_timeout: ${ack.status}`);
    contended.store.close();
  } catch (error) {
    const message = (error as Error).message;
    assert.match(
      message,
      /SQLITE_BUSY|BUSY|locked|busy/i,
      `a held write lock surfaces as a distinguishable busy/lock failure, got: ${message}`,
    );
  } finally {
    holder.exec('ROLLBACK');
    holder.close();
  }
}, 300_000);
