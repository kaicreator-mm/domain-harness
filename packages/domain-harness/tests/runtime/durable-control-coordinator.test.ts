import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';
import type {
  CompareAndSetExternalWorkCorrelationRequest,
  DurableControlStore,
  EnsureExternalWorkCorrelationResult,
  EnsureProvisionedWorkflowInstanceResult,
  ExternalWorkCorrelationRecord,
  ProvisionWorkflowInstanceRequest,
  ProvisionedWorkflowInstance,
  RegisterExternalWorkRequest,
} from '../../src/runtime/durable-control-contracts.js';
import {
  DurableControlCoordinator,
  DurableControlError,
} from '../../src/runtime/durable-control-coordinator.js';

class FakeClock {
  private current: number;

  constructor(start: string) {
    this.current = Date.parse(start);
  }

  now(): string {
    return new Date(this.current).toISOString();
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }
}

class FakeDurableControlStore implements DurableControlStore {
  private readonly provisions = new Map<string, ProvisionedWorkflowInstance>();
  private readonly externalWork = new Map<string, ExternalWorkCorrelationRecord>();

  provisionCreates = 0;
  externalWorkCreates = 0;

  async ensureProvisionedWorkflowInstance(
    request: ProvisionWorkflowInstanceRequest,
  ): Promise<EnsureProvisionedWorkflowInstanceResult> {
    const existing = this.provisions.get(request.provisioningKey);
    if (existing !== undefined) return { disposition: 'existing', record: existing };

    const record: ProvisionedWorkflowInstance = {
      provisioningKey: request.provisioningKey,
      target: request.target,
      correlationId: request.correlationId,
      packageId: request.packageId,
      input: request.input,
      createdAt: request.requestedAt,
    };
    this.provisions.set(request.provisioningKey, record);
    this.provisionCreates += 1;
    return { disposition: 'created', record };
  }

  async ensureExternalWorkCorrelation(
    request: RegisterExternalWorkRequest,
  ): Promise<EnsureExternalWorkCorrelationResult> {
    const existing = this.externalWork.get(request.externalCorrelationId);
    if (existing !== undefined) return { disposition: 'existing', record: existing };

    const record: ExternalWorkCorrelationRecord = {
      externalCorrelationId: request.externalCorrelationId,
      target: request.target,
      deadlineTimerId: request.deadlineTimerId,
      dueAt: request.dueAt,
      status: 'waiting',
      revision: 0,
      createdAt: request.registeredAt,
      updatedAt: request.registeredAt,
    };
    this.externalWork.set(request.externalCorrelationId, record);
    this.externalWorkCreates += 1;
    return { disposition: 'created', record };
  }

  async getExternalWorkCorrelation(
    externalCorrelationId: string,
  ): Promise<ExternalWorkCorrelationRecord | null> {
    return this.externalWork.get(externalCorrelationId) ?? null;
  }

  async listDueExternalWorkCorrelations(
    dueAtOrBefore: string,
  ): Promise<readonly ExternalWorkCorrelationRecord[]> {
    const cutoff = Date.parse(dueAtOrBefore);
    return [...this.externalWork.values()].filter(
      (record) => Date.parse(record.dueAt) <= cutoff,
    );
  }

  async compareAndSetExternalWorkCorrelation(
    request: CompareAndSetExternalWorkCorrelationRequest,
  ): Promise<boolean> {
    const current = this.externalWork.get(request.externalCorrelationId);
    if (
      current === undefined ||
      current.status !== 'waiting' ||
      current.revision !== request.expectedRevision
    ) {
      return false;
    }
    this.externalWork.set(request.externalCorrelationId, request.next);
    return true;
  }

  replaceExternalWork(record: ExternalWorkCorrelationRecord): void {
    this.externalWork.set(record.externalCorrelationId, record);
  }
}

const target: WorkflowAddress = {
  workflowId: 'claims.review',
  instanceKey: 'claim-42',
};

function provisionRequest(
  requestedAt = '2026-09-21T00:00:00.000Z',
): ProvisionWorkflowInstanceRequest {
  return {
    provisioningKey: 'tenant-a:claim-42',
    target,
    correlationId: 'request-42',
    packageId: 'pkg-sha256-abc',
    input: { claimId: '42', amount: 125 },
    requestedAt,
  };
}

function externalWorkRequest(clock: FakeClock): RegisterExternalWorkRequest {
  return {
    externalCorrelationId: 'job-42',
    target,
    deadlineTimerId: 'deadline-job-42',
    dueAt: '2026-09-21T00:05:00.000Z',
    registeredAt: clock.now(),
  };
}

async function assertDurableControlError(
  action: () => Promise<unknown>,
  code: DurableControlError['code'],
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    return error instanceof DurableControlError && error.code === code;
  });
}

test('provisioning is idempotent and one key cannot bind a second logical instance', async () => {
  const store = new FakeDurableControlStore();
  const coordinator = new DurableControlCoordinator(store);
  const request = provisionRequest();

  const [first, second] = await Promise.all([
    coordinator.provisionWorkflowInstance(request),
    coordinator.provisionWorkflowInstance({
      ...request,
      input: { amount: 125, claimId: '42' },
      requestedAt: '2026-09-21T00:00:01.000Z',
    }),
  ]);

  assert.equal(store.provisionCreates, 1);
  assert.equal(first.record.createdAt, '2026-09-21T00:00:00.000Z');
  assert.equal(second.record.createdAt, first.record.createdAt);
  assert.deepEqual(second.record.target, first.record.target);

  await assertDurableControlError(
    () =>
      coordinator.provisionWorkflowInstance({
        ...request,
        target: { ...target, instanceKey: 'claim-43' },
      }),
    'PROVISIONING_IDENTITY_CONFLICT',
  );
  assert.equal(store.provisionCreates, 1);
});

test('external-work registration is idempotent and conflicting correlation fails closed', async () => {
  const clock = new FakeClock('2026-09-21T00:00:00.000Z');
  const store = new FakeDurableControlStore();
  const coordinator = new DurableControlCoordinator(store);
  const request = externalWorkRequest(clock);

  const first = await coordinator.registerExternalWork(request);
  clock.advance(1000);
  const second = await coordinator.registerExternalWork({
    ...request,
    registeredAt: clock.now(),
  });

  assert.equal(store.externalWorkCreates, 1);
  assert.equal(first.createdAt, second.createdAt);

  await assertDurableControlError(
    () =>
      coordinator.registerExternalWork({
        ...request,
        deadlineTimerId: 'different-timer',
      }),
    'EXTERNAL_WORK_IDENTITY_CONFLICT',
  );
});

test('callback source has stable identity and duplicate callback replays the same source', async () => {
  const clock = new FakeClock('2026-09-21T00:00:00.000Z');
  const store = new FakeDurableControlStore();
  const coordinator = new DurableControlCoordinator(store);
  await coordinator.registerExternalWork(externalWorkRequest(clock));

  clock.advance(60_000);
  const accepted = await coordinator.acceptExternalCallback({
    externalCorrelationId: 'job-42',
    target,
    callbackOrdinal: 1,
    payload: { status: 'complete', resultId: 'result-42' },
    receivedAt: clock.now(),
  });
  const duplicate = await coordinator.acceptExternalCallback({
    externalCorrelationId: 'job-42',
    target,
    callbackOrdinal: 1,
    payload: { resultId: 'result-42', status: 'complete' },
    receivedAt: '2026-09-21T00:02:00.000Z',
  });

  assert.equal(accepted.disposition, 'accepted');
  assert.equal(duplicate.disposition, 'duplicate');
  assert.equal(
    duplicate.controlSource.durableControlTurnId,
    accepted.controlSource.durableControlTurnId,
  );
  assert.equal(duplicate.controlSource.observedAt, accepted.controlSource.observedAt);

  await assertDurableControlError(
    () =>
      coordinator.acceptExternalCallback({
        externalCorrelationId: 'job-42',
        target,
        callbackOrdinal: 1,
        payload: { status: 'complete', resultId: 'different-result' },
        receivedAt: '2026-09-21T00:02:00.000Z',
      }),
    'CALLBACK_IDENTITY_CONFLICT',
  );
});

test('callback completion wins before dueAt and a later timer cannot create a second resume', async () => {
  const clock = new FakeClock('2026-09-21T00:00:00.000Z');
  const store = new FakeDurableControlStore();
  const coordinator = new DurableControlCoordinator(store);
  await coordinator.registerExternalWork(externalWorkRequest(clock));

  const callback = await coordinator.acceptExternalCallback({
    externalCorrelationId: 'job-42',
    target,
    callbackOrdinal: 3,
    payload: { status: 'complete' },
    receivedAt: '2026-09-21T00:04:59.999Z',
  });
  const deadline = await coordinator.fireDeadline({
    externalCorrelationId: 'job-42',
    target,
    timerId: 'deadline-job-42',
    fireOrdinal: 1,
    firedAt: '2026-09-21T00:05:00.000Z',
  });

  assert.equal(callback.disposition, 'accepted');
  assert.equal(deadline.disposition, 'callback_already_completed');
  assert.equal(
    deadline.controlSource.durableControlTurnId,
    callback.controlSource.durableControlTurnId,
  );
});

test('dueAt is a deterministic closed timeout boundary and late callback replays deadline source', async () => {
  const clock = new FakeClock('2026-09-21T00:00:00.000Z');
  const store = new FakeDurableControlStore();
  const coordinator = new DurableControlCoordinator(store);
  await coordinator.registerExternalWork(externalWorkRequest(clock));

  const late = await coordinator.acceptExternalCallback({
    externalCorrelationId: 'job-42',
    target,
    callbackOrdinal: 1,
    payload: { status: 'complete-but-late' },
    receivedAt: '2026-09-21T00:05:00.000Z',
  });
  const timer = await coordinator.fireDeadline({
    externalCorrelationId: 'job-42',
    target,
    timerId: 'deadline-job-42',
    fireOrdinal: 1,
    firedAt: '2026-09-21T00:05:10.000Z',
  });

  assert.equal(late.disposition, 'late_after_timeout');
  assert.equal(late.controlSource.kind, 'deadline');
  assert.equal(timer.disposition, 'duplicate');
  assert.equal(
    timer.controlSource.durableControlTurnId,
    late.controlSource.durableControlTurnId,
  );
});

test('restart recovers deadline without volatile timer state and keeps one logical wake-up', async () => {
  const clock = new FakeClock('2026-09-21T00:00:00.000Z');
  const store = new FakeDurableControlStore();
  const beforeRestart = new DurableControlCoordinator(store);
  await beforeRestart.registerExternalWork(externalWorkRequest(clock));

  clock.advance(5 * 60_000);
  const afterRestart = new DurableControlCoordinator(store);
  const firstRecovery = await afterRestart.recoverDueDeadlines(clock.now());
  assert.equal(firstRecovery.length, 1);
  assert.equal(firstRecovery[0]?.kind, 'deadline');

  // Simulate a second process restart after durable timeout settlement but
  // before downstream submission was known to have completed.
  const secondRestart = new DurableControlCoordinator(store);
  const secondRecovery = await secondRestart.recoverDueDeadlines(clock.now());
  assert.equal(secondRecovery.length, 1);
  assert.equal(
    secondRecovery[0]?.durableControlTurnId,
    firstRecovery[0]?.durableControlTurnId,
  );
});

test('restart can replay a committed callback source after crash-before-submit', async () => {
  const clock = new FakeClock('2026-09-21T00:00:00.000Z');
  const store = new FakeDurableControlStore();
  const beforeRestart = new DurableControlCoordinator(store);
  await beforeRestart.registerExternalWork(externalWorkRequest(clock));

  const accepted = await beforeRestart.acceptExternalCallback({
    externalCorrelationId: 'job-42',
    target,
    callbackOrdinal: 7,
    payload: { status: 'complete' },
    receivedAt: '2026-09-21T00:01:00.000Z',
  });

  const afterRestart = new DurableControlCoordinator(store);
  const recovered = await afterRestart.recoverExternalWork(
    'job-42',
    '2026-09-21T00:02:00.000Z',
  );
  assert.equal(recovered?.kind, 'external_callback');
  assert.equal(recovered?.durableControlTurnId, accepted.controlSource.durableControlTurnId);
});

test('unknown, wrong-target, wrong-timer and early deadline sources fail closed', async () => {
  const clock = new FakeClock('2026-09-21T00:00:00.000Z');
  const store = new FakeDurableControlStore();
  const coordinator = new DurableControlCoordinator(store);

  await assertDurableControlError(
    () =>
      coordinator.acceptExternalCallback({
        externalCorrelationId: 'missing-job',
        target,
        callbackOrdinal: 1,
        payload: null,
        receivedAt: clock.now(),
      }),
    'UNKNOWN_EXTERNAL_CORRELATION',
  );

  await coordinator.registerExternalWork(externalWorkRequest(clock));

  await assertDurableControlError(
    () =>
      coordinator.acceptExternalCallback({
        externalCorrelationId: 'job-42',
        target: { ...target, instanceKey: 'wrong-instance' },
        callbackOrdinal: 1,
        payload: null,
        receivedAt: clock.now(),
      }),
    'TARGET_MISMATCH',
  );

  await assertDurableControlError(
    () =>
      coordinator.fireDeadline({
        externalCorrelationId: 'job-42',
        target,
        timerId: 'wrong-timer',
        fireOrdinal: 1,
        firedAt: '2026-09-21T00:05:00.000Z',
      }),
    'DEADLINE_TIMER_MISMATCH',
  );

  await assertDurableControlError(
    () =>
      coordinator.fireDeadline({
        externalCorrelationId: 'job-42',
        target,
        timerId: 'deadline-job-42',
        fireOrdinal: 1,
        firedAt: '2026-09-21T00:04:59.999Z',
      }),
    'DEADLINE_NOT_DUE',
  );
});

test('malformed persisted callback terminal source fails closed before replay', async () => {
  const clock = new FakeClock('2026-09-21T00:00:00.000Z');
  const store = new FakeDurableControlStore();
  const coordinator = new DurableControlCoordinator(store);
  await coordinator.registerExternalWork(externalWorkRequest(clock));
  await coordinator.acceptExternalCallback({
    externalCorrelationId: 'job-42',
    target,
    callbackOrdinal: 2,
    payload: { status: 'complete' },
    receivedAt: '2026-09-21T00:01:00.000Z',
  });

  const committed = await store.getExternalWorkCorrelation('job-42');
  if (committed === null || committed.status !== 'callback_received') {
    throw new Error('expected committed callback terminal record');
  }
  store.replaceExternalWork({
    ...committed,
    terminalSource: {
      ...committed.terminalSource,
      durableControlTurnId: 'dct:v1:forged',
    },
  });

  const restarted = new DurableControlCoordinator(store);
  await assertDurableControlError(
    () => restarted.recoverExternalWork('job-42', '2026-09-21T00:02:00.000Z'),
    'STORE_CONTRACT_VIOLATION',
  );
});

test('malformed persisted deadline terminal source fails closed during due recovery', async () => {
  const clock = new FakeClock('2026-09-21T00:00:00.000Z');
  const store = new FakeDurableControlStore();
  const coordinator = new DurableControlCoordinator(store);
  await coordinator.registerExternalWork(externalWorkRequest(clock));
  await coordinator.fireDeadline({
    externalCorrelationId: 'job-42',
    target,
    timerId: 'deadline-job-42',
    fireOrdinal: 1,
    firedAt: '2026-09-21T00:05:00.000Z',
  });

  const committed = await store.getExternalWorkCorrelation('job-42');
  if (committed === null || committed.status !== 'timed_out') {
    throw new Error('expected committed deadline terminal record');
  }
  store.replaceExternalWork({
    ...committed,
    terminalSource: {
      ...committed.terminalSource,
      timerId: 'forged-timer',
    },
  });

  const restarted = new DurableControlCoordinator(store);
  await assertDurableControlError(
    () => restarted.recoverDueDeadlines('2026-09-21T00:06:00.000Z'),
    'STORE_CONTRACT_VIOLATION',
  );
});
