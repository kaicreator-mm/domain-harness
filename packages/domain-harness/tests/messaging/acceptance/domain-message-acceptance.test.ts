import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainMessageAcceptance } from '../../../src/messaging/acceptance/domain-message-acceptance.js';
import { MessageAcceptanceError } from '../../../src/messaging/contracts/message-acceptance.js';
import type { WorkflowLifecycle } from '../../../src/v2/contracts/workflow.js';
import {
  AcceptanceStoreFake,
  createMessage,
  createPackage,
  createRegistry,
  createSnapshot,
} from './acceptance-fakes.js';

test('G13: accepted ACK resolves only after durable store acceptance and is not processing completion', async () => {
  const store = new AcceptanceStoreFake(createSnapshot());
  const entered = deferred();
  const releaseCommit = deferred();
  store.beforeCommit = async () => {
    entered.resolve();
    await releaseCommit.promise;
  };
  const boundary = new DomainMessageAcceptance({
    store,
    packages: createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]),
  });

  let settled = false;
  const pending = boundary.accept(createMessage()).then((ack) => {
    settled = true;
    return ack;
  });

  await entered.promise;
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(store.persisted.length, 0);

  releaseCommit.resolve();
  const ack = await pending;
  assert.equal(ack.status, 'accepted');
  assert.equal(store.persisted.length, 1);
  assert.equal(store.persisted[0]?.ack.targetSequence, ack.targetSequence);
});

test('G12/G15: boundary recreation returns original duplicate identity without a new sequence', async () => {
  const store = new AcceptanceStoreFake(createSnapshot());
  const packages = createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]);
  const firstBoundary = new DomainMessageAcceptance({ store, packages });
  const original = await firstBoundary.accept(createMessage());

  const restartedBoundary = new DomainMessageAcceptance({ store, packages });
  const duplicate = await restartedBoundary.accept(createMessage());
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.messageId, original.messageId);
  assert.equal(duplicate.targetSequence, original.targetSequence);
  assert.equal(duplicate.packageId, original.packageId);
  assert.equal(duplicate.acceptedAt, original.acceptedAt);
  assert.equal(store.persisted.length, 1);

  const next = await restartedBoundary.accept(createMessage({ messageId: 'message-2' }));
  assert.equal(next.targetSequence, original.targetSequence + 1);
  assert.equal(store.persisted.length, 2);
});

test('G15/G16: duplicate retry returns original ACK after target becomes non-accepting', async () => {
  const nonAcceptingLifecycles: readonly WorkflowLifecycle[] = [
    'recovery_required',
    'completed',
    'failed',
    'cancelled',
    'terminated',
  ];

  for (const lifecycle of nonAcceptingLifecycles) {
    const store = new AcceptanceStoreFake(createSnapshot());
    const boundary = new DomainMessageAcceptance({
      store,
      packages: createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]),
    });
    const original = await boundary.accept(createMessage());
    store.setLifecycle(lifecycle);

    const duplicate = await boundary.accept(createMessage());
    assert.equal(duplicate.status, 'duplicate', lifecycle);
    assert.equal(duplicate.messageId, original.messageId, lifecycle);
    assert.equal(duplicate.targetSequence, original.targetSequence, lifecycle);
    assert.equal(duplicate.packageId, original.packageId, lifecycle);
    assert.equal(duplicate.acceptedAt, original.acceptedAt, lifecycle);
    assert.equal(store.acceptCalls, 1, `duplicate lookup must precede lifecycle rejection for ${lifecycle}`);
    assert.equal(store.persisted.length, 1, lifecycle);
  }
});

test('G15: duplicate identity is keyed by target/messageId before current contract validation', async () => {
  const store = new AcceptanceStoreFake(createSnapshot());
  const boundary = new DomainMessageAcceptance({
    store,
    packages: createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]),
  });
  const original = await boundary.accept(createMessage());
  store.setLifecycle('completed');

  const duplicate = await boundary.accept(
    createMessage({
      type: 'not-declared-anymore',
      contractVersion: '999',
      payload: { changed: true },
    }),
  );

  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.targetSequence, original.targetSequence);
  assert.equal(duplicate.packageId, original.packageId);
  assert.equal(duplicate.acceptedAt, original.acceptedAt);
  assert.equal(store.acceptCalls, 1);
  assert.equal(store.persisted.length, 1);
});

test('G14: concurrent accepts receive one durable per-target sequence each', async () => {
  const store = new AcceptanceStoreFake(createSnapshot());
  const boundary = new DomainMessageAcceptance({
    store,
    packages: createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]),
  });

  const acks = await Promise.all([
    boundary.accept(createMessage({ messageId: 'message-a' })),
    boundary.accept(createMessage({ messageId: 'message-b' })),
    boundary.accept(createMessage({ messageId: 'message-c' })),
  ]);

  assert.deepEqual(
    acks.map((ack) => ack.targetSequence).sort((left, right) => left - right),
    [1, 2, 3],
  );
  assert.equal(new Set(acks.map((ack) => ack.targetSequence)).size, 3);
  assert.deepEqual(
    store.persisted.map((record) => record.ack.targetSequence),
    [1, 2, 3],
  );
});

test('G16: terminal and recovery-required targets reject before calling durable acceptance', async () => {
  const rejectedLifecycles: readonly WorkflowLifecycle[] = [
    'recovery_required',
    'completed',
    'failed',
    'cancelled',
    'terminated',
  ];

  for (const lifecycle of rejectedLifecycles) {
    const store = new AcceptanceStoreFake(createSnapshot({ lifecycle }));
    const boundary = new DomainMessageAcceptance({
      store,
      packages: createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]),
    });

    await assert.rejects(
      boundary.accept(createMessage()),
      isAcceptanceError('target_not_accepting'),
    );
    assert.equal(store.acceptCalls, 0, `store acceptance must not run for ${lifecycle}`);
    assert.equal(store.persisted.length, 0);
  }
});

test('G16: RuntimeStore atomic recheck closes lifecycle race after pre-validation', async () => {
  const store = new AcceptanceStoreFake(createSnapshot());
  store.afterGetInstance = () => {
    store.setLifecycle('recovery_required');
  };
  const boundary = new DomainMessageAcceptance({
    store,
    packages: createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]),
  });

  await assert.rejects(boundary.accept(createMessage()), /atomic acceptance rejected/);
  assert.equal(store.acceptCalls, 1);
  assert.equal(store.persisted.length, 0);
});

test('G15/G16: race reconciliation returns durable duplicate if adapter rejects lifecycle before dedup', async () => {
  const store = new AcceptanceStoreFake(createSnapshot());
  store.lifecycleCheckBeforeDuplicate = true;
  store.afterGetInstance = () => {
    store.persisted.push({
      message: createMessage({ correlationId: 'corr-order-42' }),
      ack: {
        status: 'accepted',
        messageId: 'message-1',
        target: { workflowId: 'order', instanceKey: 'order-42' },
        targetSequence: 1,
        packageId: 'pkg-a',
        acceptedAt: '2026-09-18T00:00:00.001Z',
      },
    });
    store.setLifecycle('completed');
  };
  const boundary = new DomainMessageAcceptance({
    store,
    packages: createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]),
  });

  const duplicate = await boundary.accept(createMessage());

  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.targetSequence, 1);
  assert.equal(duplicate.packageId, 'pkg-a');
  assert.equal(duplicate.acceptedAt, '2026-09-18T00:00:00.001Z');
  assert.equal(store.acceptCalls, 1, 'race path must reach the store once before reconciliation');
  assert.equal(store.persisted.length, 1);
});

test('G19: effective correlation and causation identities survive durable acceptance', async () => {
  const store = new AcceptanceStoreFake(createSnapshot({ correlationId: 'corr-instance' }));
  const boundary = new DomainMessageAcceptance({
    store,
    packages: createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]),
  });

  await boundary.accept(createMessage({ causationId: 'source-message' }));
  await boundary.accept(
    createMessage({
      messageId: 'message-2',
      correlationId: 'corr-explicit',
      causationId: 'message-1',
    }),
  );

  assert.equal(store.persisted[0]?.message.correlationId, 'corr-instance');
  assert.equal(store.persisted[0]?.message.causationId, 'source-message');
  assert.equal(store.persisted[1]?.message.correlationId, 'corr-explicit');
  assert.equal(store.persisted[1]?.message.causationId, 'message-1');
});

test('G21: validation uses the target pinned package contract rather than another package version', async () => {
  const packageA = createPackage({
    packageId: 'pkg-a',
    contractVersion: '1',
    payloadSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['value'],
      properties: { value: { type: 'number' } },
    },
  });
  const packageB = createPackage({
    packageId: 'pkg-b',
    contractVersion: '2',
    payloadSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['value'],
      properties: { value: { type: 'string' } },
    },
  });
  const store = new AcceptanceStoreFake(createSnapshot({ packageId: 'pkg-a' }));
  const boundary = new DomainMessageAcceptance({
    store,
    packages: createRegistry([packageB, packageA]),
  });

  await assert.rejects(
    boundary.accept(
      createMessage({
        contractVersion: '2',
        payload: { value: 'valid-only-for-package-b' },
      }),
    ),
    isAcceptanceError('contract_version_mismatch'),
  );
  assert.equal(store.acceptCalls, 0);

  await assert.rejects(
    boundary.accept(
      createMessage({
        messageId: 'message-payload-mismatch',
        contractVersion: '1',
        payload: { value: 'still-valid-only-for-package-b' },
      }),
    ),
    isAcceptanceError('payload_contract_violation'),
  );
  assert.equal(store.acceptCalls, 0);

  const accepted = await boundary.accept(createMessage({ contractVersion: '1', payload: { value: 2 } }));
  assert.equal(accepted.packageId, 'pkg-a');
  assert.equal(store.persisted.length, 1);
});

test('G21: missing target pin fails closed before durable acceptance', async () => {
  const store = new AcceptanceStoreFake(createSnapshot({ packageId: 'pkg-missing' }));
  const boundary = new DomainMessageAcceptance({
    store,
    packages: createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]),
  });

  await assert.rejects(boundary.accept(createMessage()), isAcceptanceError('pinned_package_missing'));
  assert.equal(store.acceptCalls, 0);
  assert.equal(store.persisted.length, 0);
});

test('acceptance rejects malformed envelope and unknown message contract before persistence', async () => {
  const store = new AcceptanceStoreFake(createSnapshot());
  const boundary = new DomainMessageAcceptance({
    store,
    packages: createRegistry([createPackage({ packageId: 'pkg-a', contractVersion: '1' })]),
  });

  await assert.rejects(
    boundary.accept(createMessage({ messageId: '   ' })),
    isAcceptanceError('invalid_message'),
  );
  await assert.rejects(
    boundary.accept(createMessage({ messageId: 'unknown-type', type: 'not-declared' })),
    isAcceptanceError('message_contract_not_found'),
  );
  assert.equal(store.acceptCalls, 0);
  assert.equal(store.persisted.length, 0);
});

function isAcceptanceError(code: MessageAcceptanceError['code']): (error: unknown) => boolean {
  return (error: unknown) => error instanceof MessageAcceptanceError && error.code === code;
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
