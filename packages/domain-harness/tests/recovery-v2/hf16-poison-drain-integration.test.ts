// v0.8 T-G #1006 targeted gap batch 3 — HF16 "Poison message recovery and
// queue drain" integration witness.
//
// The frozen candidate b151320 already executes the coordinator invariants
// (tests/recovery-v2/poison-message-recovery.test.ts) and the scheduler
// invariants (tests/runtime/mailbox-drain-scheduler.test.ts) separately,
// each green in the pinned 3,145-test full run. The one absent observable
// recorded in the successor ledger is their COMPOSITION: a real drain loop
// in which a poison failure durably blocks the queue, only an authorized
// retry reopens it, and the redrained queue then drains through every
// following durable message to quiescence — with the poison failure routed
// as suppressed (never a host-visible background error).
import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainMessageAcceptance } from '../../src/messaging/acceptance/domain-message-acceptance.js';
import { PoisonMessageRecoveryCoordinator } from '../../src/recovery-v2/poison-message-recovery.js';
import { RecoveryRetryNotAuthorizedError } from '../../src/recovery-v2/errors.js';
import { MailboxDrainScheduler } from '../../src/runtime/mailbox-drain-scheduler.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/contracts/package.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';
import { RecoveryStoreFake, createMessage } from './recovery-store-fake.js';

/**
 * The shared fake models accept/fail/reset/terminalize but has no
 * happy-path completion; add the disposition transition the real
 * RuntimeStore owns (`accepted` -> `processed`) so a drain loop can advance
 * past a successfully processed message.
 */
class DrainingStore extends RecoveryStoreFake {
  public async completeMessage(target: WorkflowAddress, messageId: string): Promise<void> {
    const item = this.messages.find(
      (entry) => entry.message.messageId === messageId
        && entry.message.target.workflowId === target.workflowId
        && entry.message.target.instanceKey === target.instanceKey,
    );
    if (item === undefined) {
      throw new Error(`message not found: ${messageId}`);
    }
    item.disposition = { ...item.disposition, disposition: 'processed' };
  }
}

/** Durable-poison-fact-already-recorded marker thrown AFTER the failure is persisted. */
class PoisonFailureAlreadyRecordedError extends Error {
  public constructor() {
    super('durable poison failure fact already recorded; not re-reported');
    this.name = 'PoisonFailureAlreadyRecordedError';
  }
}

function packageFixture(): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '2',
      runtimeContractMajor: 2,
      executionEngineMajor: 1,
      domainId: 'recovery-test',
      domainVersion: '1.0.0',
      packageId: 'pkg-recovery',
      targetProfileId: 'test',
      requiredCapabilities: [],
      workflows: {
        order: {
          workflowId: 'order',
          definition: {},
          messageContracts: {
            advance: {
              type: 'advance',
              version: '1',
              payloadSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['value'],
                properties: { value: { type: 'number' } },
              },
            },
          },
        },
      },
      tools: {},
      projections: {},
      schemas: {},
      bindingDigests: {},
    },
    bindings: {},
  };
}

function acceptance(store: DrainingStore): DomainMessageAcceptance {
  const pkg = packageFixture();
  return new DomainMessageAcceptance({
    store,
    packages: {
      get(packageId) {
        return packageId === pkg.manifest.packageId ? pkg : undefined;
      },
    },
  });
}

test('HF16: poison durably blocks the drain, an authorized retry reopens it, and the queue drains through every follower', async () => {
  const store = new DrainingStore();
  const mailbox = acceptance(store);
  let tick = 0;
  const recovery = new PoisonMessageRecoveryCoordinator(store, {
    now: () => `2026-10-15T00:00:00.${String(tick++).padStart(3, '0')}Z`,
  });

  const target = store.snapshot.address;
  const processedOrder: string[] = [];
  const reportedErrors: unknown[] = [];
  let poisonAttempts = 0;

  const scheduler = new MailboxDrainScheduler({
    async drain(address) {
      for (;;) {
        const next = await recovery.nextProcessableMessage(address);
        if (next === null) {
          return;
        }
        try {
          if (next.message.messageId === 'poison-1') {
            poisonAttempts += 1;
            if (poisonAttempts === 1) {
              throw new Error('fixture poison transition failed');
            }
          }
          await store.completeMessage(address, next.message.messageId);
          processedOrder.push(next.message.messageId);
        } catch (error) {
          await recovery.recordProcessingFailure({
            target: address,
            messageId: next.message.messageId,
            expectedTargetSequence: next.ack.targetSequence,
            failure: {
              code: 'domain_transition_failed',
              message: error instanceof Error ? error.message : String(error),
            },
          });
          // The durable failure fact is now observable in the store; the
          // floating drain chain must treat it as suppressed, not as a new
          // background error.
          throw new PoisonFailureAlreadyRecordedError();
        }
      }
    },
    isDrainSuppressed: (error) => error instanceof PoisonFailureAlreadyRecordedError,
    reportError(error) {
      reportedErrors.push(error);
    },
  });

  const poisonAck = await mailbox.accept(createMessage('poison-1', 1));
  const followingAck = await mailbox.accept(createMessage('following-2', 2));
  const trailingAck = await mailbox.accept(createMessage('trailing-3', 3));
  assert.equal(poisonAck.status, 'accepted');
  assert.equal(followingAck.status, 'accepted');
  assert.equal(trailingAck.status, 'accepted');

  // First drain: the poison failure is durably recorded and suppressed —
  // the host error channel stays silent by design.
  scheduler.schedule(target);
  await scheduler.awaitIdle();
  assert.deepEqual(processedOrder, []);
  assert.equal(reportedErrors.length, 0, 'suppressed poison failure must never reach reportError');
  assert.equal((await store.getMessageDisposition(target, 'poison-1'))?.disposition, 'failed');
  assert.equal(store.failCalls, 1);

  // The blocked queue starves every following durable message.
  assert.equal(await recovery.nextProcessableMessage(target), null);
  assert.equal((await store.getMessageDisposition(target, 'following-2'))?.disposition, 'accepted');
  assert.equal((await store.getMessageDisposition(target, 'trailing-3'))?.disposition, 'accepted');

  // Retry without a domain-policy reason is refused and keeps the queue blocked.
  await assert.rejects(
    () => recovery.retry({
      target,
      messageId: 'poison-1',
      authorization: { kind: 'domain-policy', reason: '   ' },
    }),
    (error: unknown) => error instanceof RecoveryRetryNotAuthorizedError,
  );
  assert.equal(await recovery.nextProcessableMessage(target), null);

  // Authorized domain-policy retry reopens the exact poison message.
  const retried = await recovery.retry({
    target,
    messageId: 'poison-1',
    authorization: { kind: 'domain-policy', reason: 'HF16 witness: transient transition fault healed' },
  });
  assert.equal(retried.instance.lifecycle, 'active');
  assert.equal(retried.message.disposition, 'accepted');

  // The redrained queue drains the healed poison first, then every follower.
  scheduler.schedule(target);
  await scheduler.awaitIdle();
  assert.deepEqual(processedOrder, ['poison-1', 'following-2', 'trailing-3']);
  assert.equal(poisonAttempts, 2);
  assert.equal(await recovery.nextProcessableMessage(target), null);
  assert.equal((await store.getMessageDisposition(target, 'following-2'))?.disposition, 'processed');
  assert.equal((await store.getMessageDisposition(target, 'trailing-3'))?.disposition, 'processed');
  assert.equal(store.resetCalls, 1);
  assert.equal(reportedErrors.length, 0);
  scheduler.dispose();
});
