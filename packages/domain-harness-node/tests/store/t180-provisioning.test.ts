import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  type ProvisionAndOpenWorkflowInstanceRequest,
} from '@kaicreator/domain-harness';
import { RuntimeInstanceProvisioningCoordinator } from '../../../domain-harness/src/runtime/instance-provisioning-coordinator.js';
import type { WorkflowAddress } from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';

// Issue #180 focused Node evidence beyond the shared provisioning conformance
// corpus: cross-connection concurrency on one database file, the portable
// coordinator delegating onto the real adapter, and a direct SQL rollback
// proof that a failed identity conflict leaves no key binding behind.

const NOW = '2026-09-30T08:00:00.000Z';

/**
 * node:test runs after-hooks FIFO, so the store-close hook is registered
 * BEFORE the directory cleanup to keep the SQLite files unlocked on Windows.
 */
function openStoreDir(
  t: test.TestContext,
  makeStore: (path: string) => NodeSqliteRuntimeStore,
): { path: string; store: NodeSqliteRuntimeStore } {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t180-'));
  const path = join(directory, 'runtime.sqlite');
  const store = makeStore(path);
  t.after(() => store.close());
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { path, store };
}

function request(
  instanceKey = 'claim-42',
  overrides: {
    provisioningKey?: string;
    correlationId?: string;
    input?: ProvisionAndOpenWorkflowInstanceRequest['input'];
  } = {},
): ProvisionAndOpenWorkflowInstanceRequest {
  const address: WorkflowAddress = { workflowId: 'claims.review', instanceKey };
  const correlationId = overrides.correlationId ?? 'request-42';
  const input = overrides.input ?? { claimId: '42', amount: 125 };
  return {
    provisioningKey: overrides.provisioningKey ?? `tenant-a:${instanceKey}`,
    target: address,
    correlationId,
    packageId: 'pkg-claims',
    input,
    requestedAt: NOW,
    initialInstance: {
      address,
      correlationId,
      packageId: 'pkg-claims',
      lifecycle: 'waiting',
      stateRevision: 0,
      state: { stateId: 'init', data: input, lastMessage: null, lastResult: null },
      createdAt: NOW,
      updatedAt: NOW,
    },
  };
}

test('#180 concurrent ensures over two connections converge to one logical instance', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t180-'));
  const path = join(directory, 'runtime.sqlite');
  const storeA = new NodeSqliteRuntimeStore({ path });
  const storeB = new NodeSqliteRuntimeStore({ path });
  t.after(() => storeA.close());
  t.after(() => storeB.close());
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const input = request('concurrent');
  const outcomes = await Promise.all([
    storeA.ensureProvisionedWorkflowInstanceOpen(input),
    storeB.ensureProvisionedWorkflowInstanceOpen(input),
  ]);

  const created = outcomes.filter((outcome) => outcome.instanceDisposition === 'created');
  assert.equal(created.length, 1, 'exactly one connection may materialize the instance');

  const raw = new Database(path);
  try {
    const rows = raw.prepare(
      'SELECT COUNT(*) AS n FROM dh_v2_instances WHERE workflow_id = ? AND instance_key = ?',
    ).get(input.target.workflowId, input.target.instanceKey) as { n: number };
    assert.equal(rows.n, 1, 'duplicate logical instance row was created');

    const keys = raw.prepare(
      'SELECT COUNT(*) AS n FROM dh_v3_provisioning_keys WHERE provisioning_key = ?',
    ).get(input.provisioningKey) as { n: number };
    assert.equal(keys.n, 1, 'duplicate provisioning key row was created');
  } finally {
    raw.close();
  }
});

test('#180 coordinator delegates to the real adapter and preserves progressed state', async (t) => {
  const { store } = openStoreDir(t, (p) => new NodeSqliteRuntimeStore({ path: p }));
  const coordinator = new RuntimeInstanceProvisioningCoordinator(store);

  const input = request();
  const created = await coordinator.ensureProvisionedWorkflowInstanceOpen(input);
  assert.equal(created.provisioningDisposition, 'created');
  assert.equal(created.instanceDisposition, 'created');

  // Drive one real durable turn, then replay through the coordinator: the
  // progressed snapshot must be returned unchanged, never reset to revision 0.
  const ack = await store.acceptMessage({
    messageId: 'm-1',
    target: input.target,
    type: 'APPROVE',
    payload: null,
    correlationId: input.correlationId,
  });
  assert.equal(ack.targetSequence, 1, 'materialized instance must start accepting at sequence 1');
  assert.equal(await store.markMessageProcessing(input.target, 'm-1', NOW), true);
  await store.commitProcessedMessage({
    target: input.target,
    messageId: 'm-1',
    expectedTargetSequence: ack.targetSequence,
    nextState: { stateId: 'approved', data: input.input, lastMessage: null, lastResult: null },
    nextLifecycle: 'active',
    updatedAt: NOW,
  });

  const replay = await coordinator.ensureProvisionedWorkflowInstanceOpen(input);
  assert.equal(replay.provisioningDisposition, 'existing');
  assert.equal(replay.instanceDisposition, 'existing');
  assert.equal(replay.instance.stateRevision, 1);
  assert.equal(replay.instance.lifecycle, 'active');
});

test('#180 same-key semantic conflict fails closed without mutating the bound record', async (t) => {
  const { path, store } = openStoreDir(t, (p) => new NodeSqliteRuntimeStore({ path: p }));

  const input = request('conflict');
  await store.ensureProvisionedWorkflowInstanceOpen(input);

  await assert.rejects(
    () => store.ensureProvisionedWorkflowInstanceOpen(request('conflict', { input: { claimId: '42', amount: 999 } })),
    /already bound to different logical material/,
  );

  const conflictRaw = new Database(path);
  try {
    const record = conflictRaw.prepare(
      'SELECT record_json FROM dh_v3_provisioning_keys WHERE provisioning_key = ?',
    ).get(input.provisioningKey) as { record_json: string };
    const bound = JSON.parse(record.record_json) as { input: { amount: number } };
    assert.equal(bound.input.amount, 125, 'conflicting attempt rewrote the bound record');
  } finally {
    conflictRaw.close();
  }
});

test('#180 address identity conflict rolls the whole transaction back (no orphan key binding)', async (t) => {
  const { path, store } = openStoreDir(t, (p) => new NodeSqliteRuntimeStore({ path: p }));

  const input = request('occupied');
  await store.createInstance({
    address: input.target,
    correlationId: 'someone-else',
    packageId: input.packageId,
    lifecycle: 'active',
    stateRevision: 0,
    state: { stateId: 'foreign' },
    createdAt: NOW,
    updatedAt: NOW,
  });

  await assert.rejects(
    () => store.ensureProvisionedWorkflowInstanceOpen(input),
    /already bound to incompatible durable identity/,
  );

  const rollbackRaw = new Database(path);
  try {
    const row = rollbackRaw.prepare(
      'SELECT COUNT(*) AS n FROM dh_v3_provisioning_keys WHERE provisioning_key = ?',
    ).get(input.provisioningKey) as { n: number };
    assert.equal(row.n, 0, 'failed identity conflict left its key binding behind');
  } finally {
    rollbackRaw.close();
  }
});

test('#180 materialized instance immediately participates in the normal message path', async (t) => {
  const { store } = openStoreDir(t, (p) => new NodeSqliteRuntimeStore({ path: p }));

  const input = request('mailbox');
  const { instance } = await store.ensureProvisionedWorkflowInstanceOpen(input);
  assert.equal(instance.stateRevision, 0);
  assert.equal(instance.lifecycle, 'waiting');

  const ack = await store.acceptMessage({
    messageId: 'boot-1',
    target: input.target,
    type: 'BOOT',
    payload: null,
    correlationId: input.correlationId,
  });
  assert.equal(ack.status, 'accepted');
  assert.equal(ack.targetSequence, 1);
});
