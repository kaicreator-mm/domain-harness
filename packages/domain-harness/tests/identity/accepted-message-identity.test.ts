import assert from 'node:assert/strict';
import test from 'node:test';
import type { DomainMessage } from '../../src/v2/index.js';
import {
  AcceptedMessageIdentityCollisionError,
  durableAcceptedMessageIdentity,
  effectiveMessageCorrelationId,
  findAcceptedMessageIdentityConflict,
  incomingAcceptedMessageIdentity,
  requireAcceptedMessageIdentityCompatible,
} from '../../src/v2/index.js';

const INSTANCE = {
  workflowId: 'design',
  instanceKey: 'project-42',
  correlationId: 'corr-project-42',
  packageId: 'pkg-design',
};

function makeMessage(overrides: Partial<DomainMessage> = {}): DomainMessage {
  return {
    messageId: 'm-1',
    target: { workflowId: INSTANCE.workflowId, instanceKey: INSTANCE.instanceKey },
    type: 'RESERVE',
    payload: { sku: 'A' },
    ...overrides,
  };
}

function makeDurableRow(overrides: Partial<Parameters<typeof durableAcceptedMessageIdentity>[0]> = {}) {
  return {
    workflowId: INSTANCE.workflowId,
    instanceKey: INSTANCE.instanceKey,
    messageId: 'm-1',
    type: 'RESERVE',
    payloadJson: '{"sku":"A"}',
    correlationId: INSTANCE.correlationId,
    causationId: null,
    contractVersion: null,
    packageId: INSTANCE.packageId,
    ...overrides,
  };
}

test('A8: canonical payload equality ignores object key serialization order', () => {
  const conflict = findAcceptedMessageIdentityConflict(
    incomingAcceptedMessageIdentity(makeMessage({ payload: { b: 2, a: 1 } }), INSTANCE),
    durableAcceptedMessageIdentity(makeDurableRow({ payloadJson: '{"a":1,"b":2}' })),
  );
  assert.equal(conflict, null);
});

test('A8: canonical payload equality preserves array order', () => {
  const conflict = findAcceptedMessageIdentityConflict(
    incomingAcceptedMessageIdentity(makeMessage({ payload: { list: [1, 2] } }), INSTANCE),
    durableAcceptedMessageIdentity(makeDurableRow({ payloadJson: '{"list":[2,1]}' })),
  );
  assert.equal(conflict, 'payload');
});

test('A8: effective correlation normalization makes omitted and instance-equal compatible', () => {
  assert.equal(effectiveMessageCorrelationId(makeMessage(), INSTANCE.correlationId), INSTANCE.correlationId);
  assert.equal(
    effectiveMessageCorrelationId(makeMessage({ correlationId: INSTANCE.correlationId }), INSTANCE.correlationId),
    INSTANCE.correlationId,
  );
  const conflict = findAcceptedMessageIdentityConflict(
    incomingAcceptedMessageIdentity(
      makeMessage({ correlationId: INSTANCE.correlationId }),
      INSTANCE,
    ),
    durableAcceptedMessageIdentity(makeDurableRow({ correlationId: INSTANCE.correlationId })),
  );
  assert.equal(conflict, null);
});

test('A8: different effective correlationId fails closed', () => {
  const conflict = findAcceptedMessageIdentityConflict(
    incomingAcceptedMessageIdentity(makeMessage({ correlationId: 'other-correlation' }), INSTANCE),
    durableAcceptedMessageIdentity(makeDurableRow({ correlationId: INSTANCE.correlationId })),
  );
  assert.equal(conflict, 'correlationId');
});

test('A8: causationId and contractVersion absence normalizes consistently', () => {
  assert.equal(
    findAcceptedMessageIdentityConflict(
      incomingAcceptedMessageIdentity(makeMessage(), INSTANCE),
      durableAcceptedMessageIdentity(makeDurableRow()),
    ),
    null,
  );
  // an omitted incoming value normalizes onto storage-null
  assert.equal(
    findAcceptedMessageIdentityConflict(
      incomingAcceptedMessageIdentity(makeMessage(), INSTANCE),
      durableAcceptedMessageIdentity(makeDurableRow({ causationId: null })),
    ),
    null,
  );
  // a present value never normalizes onto an absent one
  assert.equal(
    findAcceptedMessageIdentityConflict(
      incomingAcceptedMessageIdentity(makeMessage({ causationId: 'cause-1' }), INSTANCE),
      durableAcceptedMessageIdentity(makeDurableRow({ causationId: null })),
    ),
    'causationId',
  );
  assert.equal(
    findAcceptedMessageIdentityConflict(
      incomingAcceptedMessageIdentity(makeMessage({ contractVersion: '1' }), INSTANCE),
      durableAcceptedMessageIdentity(makeDurableRow({ contractVersion: null })),
    ),
    'contractVersion',
  );
  // differing present values conflict
  assert.equal(
    findAcceptedMessageIdentityConflict(
      incomingAcceptedMessageIdentity(makeMessage({ causationId: 'cause-1' }), INSTANCE),
      durableAcceptedMessageIdentity(makeDurableRow({ causationId: 'cause-2' })),
    ),
    'causationId',
  );
  assert.equal(
    findAcceptedMessageIdentityConflict(
      incomingAcceptedMessageIdentity(makeMessage({ contractVersion: '1' }), INSTANCE),
      durableAcceptedMessageIdentity(makeDurableRow({ contractVersion: '2' })),
    ),
    'contractVersion',
  );
});

test('A8: every frozen tuple component can fail the comparison', () => {
  const compatible = incomingAcceptedMessageIdentity(makeMessage(), INSTANCE);
  const durable = durableAcceptedMessageIdentity(makeDurableRow());

  assert.equal(findAcceptedMessageIdentityConflict(compatible, durable), null);
  assert.equal(
    findAcceptedMessageIdentityConflict(
      { ...compatible, targetWorkflowId: 'other-workflow' },
      durable,
    ),
    'target.workflowId',
  );
  assert.equal(
    findAcceptedMessageIdentityConflict(
      { ...compatible, targetInstanceKey: 'other-instance' },
      durable,
    ),
    'target.instanceKey',
  );
  assert.equal(
    findAcceptedMessageIdentityConflict({ ...compatible, messageId: 'm-2' }, durable),
    'messageId',
  );
  assert.equal(
    findAcceptedMessageIdentityConflict({ ...compatible, type: 'CANCEL' }, durable),
    'type',
  );
  assert.equal(
    findAcceptedMessageIdentityConflict(
      { ...compatible, canonicalPayload: '{"sku":"B"}' },
      durable,
    ),
    'payload',
  );
  assert.equal(
    findAcceptedMessageIdentityConflict({ ...compatible, packageId: 'pkg-other' }, durable),
    'packageId',
  );
});

test('A8: collision error exposes the stable MESSAGE_IDENTITY_COLLISION category', () => {
  const error = new AcceptedMessageIdentityCollisionError('deterministic collision');
  assert.equal(error.code, 'MESSAGE_IDENTITY_COLLISION');
  assert.equal(error.name, 'AcceptedMessageIdentityCollisionError');
  assert.ok(error instanceof Error);
});

test('A8: requireAcceptedMessageIdentityCompatible returns silently or throws before any write', () => {
  assert.doesNotThrow(() =>
    requireAcceptedMessageIdentityCompatible(makeMessage(), INSTANCE, makeDurableRow()),
  );

  assert.throws(
    () =>
      requireAcceptedMessageIdentityCompatible(
        makeMessage({ type: 'CANCEL', payload: { sku: 'B' } }),
        INSTANCE,
        makeDurableRow(),
      ),
    (error: unknown) => {
      assert.ok(error instanceof AcceptedMessageIdentityCollisionError);
      assert.equal((error as AcceptedMessageIdentityCollisionError).code, 'MESSAGE_IDENTITY_COLLISION');
      // Deterministic diagnostics name the first conflicting frozen component.
      assert.ok((error as Error).message.includes('type'));
      return true;
    },
  );
});
