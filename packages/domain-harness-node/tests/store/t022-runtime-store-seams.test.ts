import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  GovernanceExecutionCoordinator,
  prepareProcessedCommandTurn,
  type DomainActivationBinding,
  type Sha256Port,
} from '@kaicreator/domain-harness';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';

const hostSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const NOW = '2026-09-21T10:00:00.000Z';
const target: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'inst-seams' };

const BINDING: DomainActivationBinding = {
  domainId: 'domain-a',
  packageId: 'pkg-a',
  domainIntelligenceContentDigest: 'sha256:cdi-1',
  governanceBaseline: {
    domainId: 'domain-a',
    governanceId: 'gov-a',
    schemaVersion: '1',
    contentDigest: 'sha256:baseline-1',
  },
};

function instanceSnapshot(): WorkflowInstanceSnapshot {
  return {
    address: target,
    correlationId: 'corr-seams',
    packageId: 'pkg-a',
    lifecycle: 'active',
    stateRevision: 0,
    state: { step: 'waiting' },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function tempDir(t: test.TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-seams-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('T-022 V6: GovernanceExecutionPin is durable before any state-changing publication', async (t) => {
  const path = join(tempDir(t), 'runtime.sqlite');
  const workflowInstanceId = 'order-quote:inst-seams';

  const first = new NodeSqliteRuntimeStore({ path });
  const coordinator = new GovernanceExecutionCoordinator(first, hostSha256);
  await assert.rejects(
    () => coordinator.persistSnapshot({ workflowInstanceId, governanceBindingDigest: 'x', snapshot: {} }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'SNAPSHOT_BEFORE_GOVERNANCE_PIN',
  );
  const pin = await coordinator.pinExecution({ workflowTarget: target.workflowId, workflowInstanceId, binding: BINDING });
  const again = await coordinator.pinExecution({ workflowTarget: target.workflowId, workflowInstanceId, binding: BINDING });
  assert.deepEqual(again, pin, 'same exact pin is idempotent');
  await assert.rejects(
    () =>
      coordinator.pinExecution({
        workflowTarget: target.workflowId,
        workflowInstanceId,
        binding: { ...BINDING, packageId: 'pkg-other' },
      }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'GOVERNANCE_EXECUTION_PIN_CONFLICT',
  );
  first.close();

  const second = new NodeSqliteRuntimeStore({ path });
  const recovered = new GovernanceExecutionCoordinator(second, hostSha256);
  const recoveredPin = await recovered.requirePinnedExecution(workflowInstanceId);
  assert.deepEqual(recoveredPin, pin, 'exact pin survives process reopen');
  const stored = await second.getGovernanceExecutionPin(workflowInstanceId) as { bindingDigest?: string };
  assert.equal(stored.bindingDigest, pin.bindingDigest);
  second.close();
});

test('T-022 V14: provisioning ensure is atomic and idempotent across reopen', async (t) => {
  const path = join(tempDir(t), 'runtime.sqlite');
  const first = new NodeSqliteRuntimeStore({ path });
  const request = {
    provisioningKey: 'prov-1',
    target,
    correlationId: 'corr-seams',
    packageId: 'pkg-a',
    input: { start: true },
    requestedAt: NOW,
  };
  const created = await first.ensureProvisionedWorkflowInstance(request);
  assert.equal(created.disposition, 'created');
  const replay = await first.ensureProvisionedWorkflowInstance(request);
  assert.equal(replay.disposition, 'existing');
  assert.deepEqual(replay.record, created.record, 'replay returns the bound record');
  first.close();

  const second = new NodeSqliteRuntimeStore({ path });
  const afterReopen = await second.ensureProvisionedWorkflowInstance(request);
  assert.equal(afterReopen.disposition, 'existing');
  assert.deepEqual(afterReopen.record, created.record, 'binding survives reopen');
  second.close();
});

test('T-022 V13: external-work correlations persist with CAS terminal settlement', async (t) => {
  const path = join(tempDir(t), 'runtime.sqlite');
  const first = new NodeSqliteRuntimeStore({ path });
  const registration = {
    externalCorrelationId: 'ext-1',
    target,
    deadlineTimerId: 'timer-1',
    dueAt: '2026-09-21T12:00:00.000Z',
    registeredAt: NOW,
  };
  const created = await first.ensureExternalWorkCorrelation(registration);
  assert.equal(created.disposition, 'created');
  assert.equal(created.record.status, 'waiting');
  assert.equal(created.record.revision, 0);
  const replay = await first.ensureExternalWorkCorrelation(registration);
  assert.equal(replay.disposition, 'existing');
  first.close();

  const second = new NodeSqliteRuntimeStore({ path });
  const due = await second.listDueExternalWorkCorrelations('2026-09-21T12:00:00.000Z');
  assert.equal(due.length, 1);
  assert.equal(due[0]!.deadlineTimerId, 'timer-1', 'deadline source identity survives reopen');
  assert.equal((await second.listDueExternalWorkCorrelations('2026-09-21T11:00:00.000Z')).length, 0);

  const waiting = await second.getExternalWorkCorrelation('ext-1');
  assert.ok(waiting !== null && waiting.status === 'waiting');
  const terminal = {
    ...waiting,
    status: 'timed_out' as const,
    revision: 1,
    updatedAt: '2026-09-21T12:00:00.000Z',
    terminalSource: {
      kind: 'deadline' as const,
      durableControlTurnId: 'turn:deadline:ext-1:1',
      target,
      externalCorrelationId: 'ext-1',
      timerId: 'timer-1',
      fireOrdinal: 1,
      observedAt: '2026-09-21T12:00:00.000Z',
    },
  };
  assert.equal(
    await second.compareAndSetExternalWorkCorrelation({
      externalCorrelationId: 'ext-1',
      expectedRevision: 0,
      next: terminal,
    }),
    true,
    'first CAS settles the correlation',
  );
  assert.equal(
    await second.compareAndSetExternalWorkCorrelation({
      externalCorrelationId: 'ext-1',
      expectedRevision: 0,
      next: terminal,
    }),
    false,
    'stale revision can never settle twice',
  );
  const settled = await second.getExternalWorkCorrelation('ext-1');
  assert.ok(settled !== null && settled.status === 'timed_out');
  assert.deepEqual(settled.terminalSource, terminal.terminalSource, 'exact terminal source persisted');
  second.close();

  const third = new NodeSqliteRuntimeStore({ path });
  const afterReopen = await third.getExternalWorkCorrelation('ext-1');
  assert.ok(afterReopen !== null && afterReopen.status === 'timed_out');
  assert.equal((await third.listDueExternalWorkCorrelations('2026-09-21T13:00:00.000Z')).length, 0);
  third.close();
});

test('T-022 V15: process data + command outcomes commit atomically and survive restart', async (t) => {
  const path = join(tempDir(t), 'runtime.sqlite');
  const messageId = 'msg-1';
  const first = new NodeSqliteRuntimeStore({ path });
  await first.createInstance(instanceSnapshot());
  await first.acceptMessage({ messageId, target, type: 'quote', payload: { amount: 42 } });
  assert.equal(await first.markMessageProcessing(target, messageId, NOW), true);

  const instance = await first.getInstance(target);
  const disposition = await first.getMessageDisposition(target, messageId);
  assert.ok(instance !== null && disposition !== null);
  const prepared = prepareProcessedCommandTurn(
    { instance, disposition, existingOutcome: await first.getCommandOutcome(target, messageId) },
    {
      target,
      messageId,
      expectedTargetSequence: disposition.targetSequence,
      expectedStateRevision: instance.stateRevision,
      nextState: { step: 'quoted' },
      nextProcessData: { lastQuote: 42 },
      nextLifecycle: 'active',
      resolution: { status: 'applied', result: { quoted: 42 } },
      updatedAt: '2026-09-21T10:01:00.000Z',
    },
  );
  if (prepared.kind !== 'commit') assert.fail('expected a commit');
  await first.commitProcessedCommandTurn(prepared.commit);
  first.close();

  const second = new NodeSqliteRuntimeStore({ path });
  const processData = await second.getProcessData(target);
  assert.deepEqual(processData?.data, { lastQuote: 42 });
  assert.equal(processData?.instanceStateRevision, 1);
  const outcome = await second.getCommandOutcome(target, messageId);
  assert.ok(outcome !== null && outcome.status === 'applied');
  const replayInstance = await second.getInstance(target);
  const replayDisposition = await second.getMessageDisposition(target, messageId);
  assert.ok(replayInstance !== null && replayDisposition !== null);
  const replay = prepareProcessedCommandTurn(
    {
      instance: replayInstance,
      disposition: replayDisposition,
      existingOutcome: outcome,
    },
    {
      target,
      messageId,
      expectedTargetSequence: replayDisposition.targetSequence,
      expectedStateRevision: replayInstance.stateRevision,
      nextState: { step: 'quoted' },
      nextProcessData: { lastQuote: 42 },
      nextLifecycle: 'active',
      resolution: { status: 'applied', result: { quoted: 42 } },
      updatedAt: '2026-09-21T10:01:00.000Z',
    },
  );
  assert.equal(replay.kind, 'already_committed', 'idempotent redelivery replays the durable outcome');
  if (replay.kind === 'already_committed') {
    assert.deepEqual(replay.outcome, outcome);
  }
  assert.equal(replayInstance.stateRevision, 1, 'state advanced exactly once');
  second.close();
});
