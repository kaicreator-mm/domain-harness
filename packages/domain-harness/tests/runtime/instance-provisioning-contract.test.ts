import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initialProvisioningInstanceMatchesRequest,
  isRuntimeInstanceProvisioningStore,
  provisioningInstanceIdentityMatchesRequest,
  provisioningRecordMatchesRequest,
  type ProvisionAndOpenWorkflowInstanceRequest,
  type ProvisionedWorkflowInstance,
} from '../../src/runtime/durable-control-contracts.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';

const requestedAt = '2026-09-30T00:00:00.000Z';

function request(): ProvisionAndOpenWorkflowInstanceRequest {
  const initialInstance: WorkflowInstanceSnapshot = {
    address: { workflowId: 'claims.review', instanceKey: 'claim-42' },
    correlationId: 'request-42',
    packageId: 'pkg-sha256-abc',
    lifecycle: 'waiting',
    stateRevision: 0,
    state: { phase: 'init', claimId: '42' },
    createdAt: requestedAt,
    updatedAt: requestedAt,
  };
  return {
    provisioningKey: 'tenant-a:claim-42',
    target: initialInstance.address,
    correlationId: initialInstance.correlationId,
    packageId: initialInstance.packageId,
    input: { claimId: '42', amount: 125 },
    requestedAt,
    initialInstance,
  };
}

function record(): ProvisionedWorkflowInstance {
  const value = request();
  return {
    provisioningKey: value.provisioningKey,
    target: value.target,
    correlationId: value.correlationId,
    packageId: value.packageId,
    input: value.input,
    createdAt: value.requestedAt,
  };
}

test('provisioning identity treats canonical JSON input key order as equivalent', () => {
  const value = request();
  assert.equal(
    provisioningRecordMatchesRequest(
      { ...record(), input: { amount: 125, claimId: '42' } },
      value,
    ),
    true,
  );
  assert.equal(
    provisioningRecordMatchesRequest(
      { ...record(), input: { amount: 126, claimId: '42' } },
      value,
    ),
    false,
  );
});

test('a progressed or terminal instance remains identity-compatible with exact ensure replay', () => {
  const value = request();
  const progressed: WorkflowInstanceSnapshot = {
    ...value.initialInstance,
    lifecycle: 'completed',
    stateRevision: 7,
    state: { phase: 'done' },
    output: { approved: true },
    updatedAt: '2026-09-30T00:05:00.000Z',
  };

  assert.equal(provisioningInstanceIdentityMatchesRequest(progressed, value), true);
  assert.equal(
    provisioningInstanceIdentityMatchesRequest(
      { ...progressed, packageId: 'pkg-sha256-different' },
      value,
    ),
    false,
  );
});

test('new instance materialization must equal the exact revision-zero Runtime snapshot', () => {
  const value = request();
  assert.equal(initialProvisioningInstanceMatchesRequest(value.initialInstance, value), true);

  assert.equal(
    initialProvisioningInstanceMatchesRequest(
      { ...value.initialInstance, stateRevision: 1 },
      value,
    ),
    false,
  );
  assert.equal(
    initialProvisioningInstanceMatchesRequest(
      { ...value.initialInstance, state: { phase: 'different' } },
      value,
    ),
    false,
  );
  assert.equal(
    initialProvisioningInstanceMatchesRequest(
      { ...value.initialInstance, output: { unexpected: true } },
      value,
    ),
    false,
  );
});

test('request initial snapshot cannot drift from provisioning identity or requested timestamp', () => {
  const value = request();
  const driftedRequest: ProvisionAndOpenWorkflowInstanceRequest = {
    ...value,
    initialInstance: {
      ...value.initialInstance,
      correlationId: 'different-correlation',
    },
  };
  assert.equal(
    initialProvisioningInstanceMatchesRequest(driftedRequest.initialInstance, driftedRequest),
    false,
  );

  const timestampDrift: ProvisionAndOpenWorkflowInstanceRequest = {
    ...value,
    initialInstance: {
      ...value.initialInstance,
      createdAt: '2026-09-30T00:00:01.000Z',
      updatedAt: '2026-09-30T00:00:01.000Z',
    },
  };
  assert.equal(
    initialProvisioningInstanceMatchesRequest(timestampDrift.initialInstance, timestampDrift),
    false,
  );
});

test('RuntimeInstanceProvisioningStore capability detection is exact and fail-closed', () => {
  assert.equal(isRuntimeInstanceProvisioningStore(null), false);
  assert.equal(isRuntimeInstanceProvisioningStore({}), false);
  assert.equal(
    isRuntimeInstanceProvisioningStore({ ensureProvisionedWorkflowInstanceOpen: true }),
    false,
  );
  assert.equal(
    isRuntimeInstanceProvisioningStore({
      async ensureProvisionedWorkflowInstanceOpen() {
        throw new Error('not executed');
      },
    }),
    true,
  );
});
