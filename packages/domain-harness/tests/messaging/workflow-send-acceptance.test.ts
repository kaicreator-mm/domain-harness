import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkflowSendAcceptance } from '../../src/messaging/acceptance/workflow-send-acceptance.js';
import {
  MessageAcceptanceError,
  type DomainMessageAcceptanceBoundary,
  type MessageAcceptanceErrorCode,
} from '../../src/messaging/contracts/message-acceptance.js';
import type { DomainMessage, MessageAcceptedAck } from '../../src/v2/contracts/message.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';

const message: DomainMessage = {
  messageId: 'child-1',
  target: { workflowId: 'child.review', instanceKey: 'case-1' },
  type: 'START',
  payload: { caseId: '1' },
  correlationId: 'corr-1',
};

const duplicateAck: MessageAcceptedAck = {
  status: 'duplicate',
  messageId: 'child-1',
  target: message.target,
  targetSequence: 3,
  packageId: 'pkg-1',
  acceptedAt: '2026-09-30T00:00:00.000Z',
};

function instance(
  lifecycle: WorkflowInstanceSnapshot['lifecycle'],
): WorkflowInstanceSnapshot {
  return {
    address: message.target,
    correlationId: 'corr-1',
    packageId: 'pkg-1',
    lifecycle,
    stateRevision: 2,
    state: { stateId: 'waiting' },
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:02.000Z',
  };
}

function throwingAcceptance(
  code: MessageAcceptanceErrorCode,
): DomainMessageAcceptanceBoundary {
  return {
    async accept() {
      throw new MessageAcceptanceError(code, `failure:${code}`);
    },
  };
}

test('accepted/duplicate result is returned without re-reading target lifecycle', async () => {
  let targetReads = 0;
  const boundary = new WorkflowSendAcceptance({
    acceptance: { async accept() { return duplicateAck; } },
    store: {
      async getInstance() {
        targetReads += 1;
        return instance('completed');
      },
    },
  });

  const result = await boundary.accept(message);
  assert.equal(result.status, 'accepted');
  if (result.status !== 'accepted') assert.fail('expected accepted result');
  assert.equal(result.ack.status, 'duplicate');
  assert.equal(targetReads, 0);
});

for (const code of [
  'workflow_not_found',
  'message_contract_not_found',
  'contract_version_mismatch',
  'payload_contract_violation',
] as const) {
  test(`${code} is a permanent successor rejection`, async () => {
    const boundary = new WorkflowSendAcceptance({
      acceptance: throwingAcceptance(code),
      store: { async getInstance() { return null; } },
    });

    const result = await boundary.accept(message);
    assert.equal(result.status, 'rejected');
    if (result.status !== 'rejected') assert.fail('expected rejected result');
    assert.equal(result.rejection.code, code);
  });
}

test('target_not_found is transient and does not consult target again', async () => {
  let targetReads = 0;
  const boundary = new WorkflowSendAcceptance({
    acceptance: throwingAcceptance('target_not_found'),
    store: {
      async getInstance() {
        targetReads += 1;
        return null;
      },
    },
  });

  const result = await boundary.accept(message);
  assert.equal(result.status, 'transient_unavailable');
  if (result.status !== 'transient_unavailable') assert.fail('expected transient result');
  assert.equal(result.condition.code, 'target_not_found');
  assert.equal(targetReads, 0);
});

test('recovery_required is transient after target_not_accepting', async () => {
  const boundary = new WorkflowSendAcceptance({
    acceptance: throwingAcceptance('target_not_accepting'),
    store: { async getInstance() { return instance('recovery_required'); } },
  });

  const result = await boundary.accept(message);
  assert.equal(result.status, 'transient_unavailable');
  if (result.status !== 'transient_unavailable') assert.fail('expected transient result');
  assert.equal(result.condition.code, 'target_recovery_required');
});

for (const lifecycle of ['completed', 'failed', 'cancelled', 'terminated'] as const) {
  test(`${lifecycle} target is a permanent target_terminal rejection`, async () => {
    const boundary = new WorkflowSendAcceptance({
      acceptance: throwingAcceptance('target_not_accepting'),
      store: { async getInstance() { return instance(lifecycle); } },
    });

    const result = await boundary.accept(message);
    assert.equal(result.status, 'rejected');
    if (result.status !== 'rejected') assert.fail('expected rejected result');
    assert.equal(result.rejection.code, 'target_terminal');
    assert.equal(result.rejection.targetLifecycle, lifecycle);
  });
}

test('target disappearing during non-accepting classification becomes transient target_not_found', async () => {
  const boundary = new WorkflowSendAcceptance({
    acceptance: throwingAcceptance('target_not_accepting'),
    store: { async getInstance() { return null; } },
  });

  const result = await boundary.accept(message);
  assert.equal(result.status, 'transient_unavailable');
  if (result.status !== 'transient_unavailable') assert.fail('expected transient result');
  assert.equal(result.condition.code, 'target_not_found');
});

for (const lifecycle of ['active', 'waiting'] as const) {
  test(`target_not_accepting race that re-reads ${lifecycle} preserves original failure`, async () => {
    const original = new MessageAcceptanceError('target_not_accepting', 'raced');
    const boundary = new WorkflowSendAcceptance({
      acceptance: { async accept() { throw original; } },
      store: { async getInstance() { return instance(lifecycle); } },
    });

    await assert.rejects(() => boundary.accept(message), (error: unknown) => error === original);
  });
}

test('mismatched target returned by store fails as technical invariant violation', async () => {
  const boundary = new WorkflowSendAcceptance({
    acceptance: throwingAcceptance('target_not_accepting'),
    store: {
      async getInstance() {
        return {
          ...instance('completed'),
          address: { ...message.target, instanceKey: 'other' },
        };
      },
    },
  });

  await assert.rejects(
    () => boundary.accept(message),
    (error: unknown) =>
      error instanceof MessageAcceptanceError && error.code === 'store_invariant_violation',
  );
});

for (const code of [
  'invalid_message',
  'pinned_package_missing',
  'invalid_pinned_contract',
  'store_invariant_violation',
] as const) {
  test(`${code} remains a technical failure`, async () => {
    const original = new MessageAcceptanceError(code, `technical:${code}`);
    const boundary = new WorkflowSendAcceptance({
      acceptance: { async accept() { throw original; } },
      store: { async getInstance() { return instance('completed'); } },
    });

    await assert.rejects(() => boundary.accept(message), (error: unknown) => error === original);
  });
}

test('unknown non-acceptance errors remain technical failures', async () => {
  const original = new Error('storage transport failed');
  const boundary = new WorkflowSendAcceptance({
    acceptance: { async accept() { throw original; } },
    store: { async getInstance() { return instance('completed'); } },
  });

  await assert.rejects(() => boundary.accept(message), (error: unknown) => error === original);
});
