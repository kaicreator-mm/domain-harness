import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  EnsureProvisionedWorkflowInstanceOpenResult,
  ProvisionAndOpenWorkflowInstanceRequest,
  RuntimeInstanceProvisioningStore,
} from '../../src/runtime/durable-control-contracts.js';
import {
  RuntimeInstanceProvisioningCoordinator,
} from '../../src/runtime/instance-provisioning-coordinator.js';
import { DurableControlError } from '../../src/runtime/durable-control-coordinator.js';

function request(): ProvisionAndOpenWorkflowInstanceRequest {
  return {
    provisioningKey: 'tenant-a:claim-42',
    target: { workflowId: 'claims.review', instanceKey: 'claim-42' },
    correlationId: 'request-42',
    packageId: 'pkg-42',
    input: { claimId: '42', amount: 125 },
    requestedAt: '2026-09-30T00:00:00.000Z',
    initialInstance: {
      address: { workflowId: 'claims.review', instanceKey: 'claim-42' },
      correlationId: 'request-42',
      packageId: 'pkg-42',
      lifecycle: 'waiting',
      stateRevision: 0,
      state: { stateId: 'init', data: { claimId: '42' } },
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    },
  };
}

function createdResult(
  input = request(),
): EnsureProvisionedWorkflowInstanceOpenResult {
  return {
    provisioningDisposition: 'created',
    instanceDisposition: 'created',
    record: {
      provisioningKey: input.provisioningKey,
      target: input.target,
      correlationId: input.correlationId,
      packageId: input.packageId,
      input: input.input,
      createdAt: input.requestedAt,
    },
    instance: input.initialInstance,
  };
}

class FakeStore implements RuntimeInstanceProvisioningStore {
  calls = 0;

  constructor(
    private readonly result: EnsureProvisionedWorkflowInstanceOpenResult,
  ) {}

  async ensureProvisionedWorkflowInstanceOpen(): Promise<EnsureProvisionedWorkflowInstanceOpenResult> {
    this.calls += 1;
    return this.result;
  }
}

async function expectDurableControlError(
  action: () => Promise<unknown>,
  code: DurableControlError['code'],
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    return error instanceof DurableControlError && error.code === code;
  });
}

test('accepts an exact created provisioning record and revision-0 Runtime instance', async () => {
  const input = request();
  const store = new FakeStore(createdResult(input));
  const coordinator = new RuntimeInstanceProvisioningCoordinator(store);

  const result = await coordinator.ensureProvisionedWorkflowInstanceOpen(input);

  assert.equal(result.provisioningDisposition, 'created');
  assert.equal(result.instanceDisposition, 'created');
  assert.equal(store.calls, 1);
});

test('accepts exact replay against a progressed existing Runtime instance without reset', async () => {
  const input = request();
  const progressed = {
    ...input.initialInstance,
    lifecycle: 'completed' as const,
    stateRevision: 7,
    state: { stateId: 'done', data: { claimId: '42' } },
    output: { approved: true },
    updatedAt: '2026-09-30T00:05:00.000Z',
  };
  const store = new FakeStore({
    ...createdResult(input),
    provisioningDisposition: 'existing',
    instanceDisposition: 'existing',
    instance: progressed,
  });
  const coordinator = new RuntimeInstanceProvisioningCoordinator(store);

  const result = await coordinator.ensureProvisionedWorkflowInstanceOpen({
    ...input,
    input: { amount: 125, claimId: '42' },
    requestedAt: '2026-09-30T00:10:00.000Z',
    initialInstance: {
      ...input.initialInstance,
      createdAt: '2026-09-30T00:10:00.000Z',
      updatedAt: '2026-09-30T00:10:00.000Z',
    },
  });

  assert.equal(result.instance.stateRevision, 7);
  assert.equal(result.instance.lifecycle, 'completed');
});

test('fails before storage when Runtime supplies a non-initial snapshot', async () => {
  const input = request();
  const store = new FakeStore(createdResult(input));
  const coordinator = new RuntimeInstanceProvisioningCoordinator(store);

  await expectDurableControlError(
    () => coordinator.ensureProvisionedWorkflowInstanceOpen({
      ...input,
      initialInstance: { ...input.initialInstance, stateRevision: 1 },
    }),
    'INVALID_ARGUMENT',
  );
  assert.equal(store.calls, 0);
});

test('fails closed when an existing provisioning key is bound to different logical material', async () => {
  const input = request();
  const result = createdResult(input);
  const store = new FakeStore({
    ...result,
    provisioningDisposition: 'existing',
    record: { ...result.record, packageId: 'other-package' },
  });
  const coordinator = new RuntimeInstanceProvisioningCoordinator(store);

  await expectDurableControlError(
    () => coordinator.ensureProvisionedWorkflowInstanceOpen(input),
    'PROVISIONING_IDENTITY_CONFLICT',
  );
});

test('fails closed when the target address is occupied by incompatible durable identity', async () => {
  const input = request();
  const result = createdResult(input);
  const store = new FakeStore({
    ...result,
    provisioningDisposition: 'existing',
    instanceDisposition: 'existing',
    instance: { ...result.instance, correlationId: 'other-correlation' },
  });
  const coordinator = new RuntimeInstanceProvisioningCoordinator(store);

  await expectDurableControlError(
    () => coordinator.ensureProvisionedWorkflowInstanceOpen(input),
    'PROVISIONING_IDENTITY_CONFLICT',
  );
});

test('treats a store-created non-exact initial snapshot as contract violation', async () => {
  const input = request();
  const result = createdResult(input);
  const store = new FakeStore({
    ...result,
    instance: { ...result.instance, state: { stateId: 'wrong' } },
  });
  const coordinator = new RuntimeInstanceProvisioningCoordinator(store);

  await expectDurableControlError(
    () => coordinator.ensureProvisionedWorkflowInstanceOpen(input),
    'STORE_CONTRACT_VIOLATION',
  );
});

test('rejects unknown store dispositions as contract violation', async () => {
  const input = request();
  const malformed = {
    ...createdResult(input),
    provisioningDisposition: 'maybe',
  } as unknown as EnsureProvisionedWorkflowInstanceOpenResult;
  const store = new FakeStore(malformed);
  const coordinator = new RuntimeInstanceProvisioningCoordinator(store);

  await expectDurableControlError(
    () => coordinator.ensureProvisionedWorkflowInstanceOpen(input),
    'STORE_CONTRACT_VIOLATION',
  );
});
