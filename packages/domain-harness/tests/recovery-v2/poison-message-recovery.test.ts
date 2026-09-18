import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainMessageAcceptance } from '../../src/messaging/acceptance/domain-message-acceptance.js';
import { MessageAcceptanceError } from '../../src/messaging/contracts/message-acceptance.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/contracts/package.js';
import {
  AMBIGUOUS_NON_IDEMPOTENT_EFFECT_FAILURE_CODE,
  type RecoveryRetryAuthorization,
} from '../../src/recovery-v2/contracts.js';
import {
  AmbiguousNonIdempotentResolutionRequiredError,
  RecoveryStateError,
} from '../../src/recovery-v2/errors.js';
import { PoisonMessageRecoveryCoordinator } from '../../src/recovery-v2/poison-message-recovery.js';
import type { RecoveryRequiredToolEffectResult } from '../../src/execution/tool-runner/durable-tool-runner.js';
import { RecoveryStoreFake, createMessage } from './recovery-store-fake.js';

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

function acceptance(store: RecoveryStoreFake): DomainMessageAcceptance {
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

function coordinator(store: RecoveryStoreFake): PoisonMessageRecoveryCoordinator {
  let tick = 0;
  return new PoisonMessageRecoveryCoordinator(store, {
    now: () => `2026-09-18T02:00:00.${String(tick++).padStart(3, '0')}Z`,
  });
}

test('G17 poison message enters recovery_required, blocks following durable messages, and rejects new messages before ACK', async () => {
  const store = new RecoveryStoreFake();
  const mailbox = acceptance(store);
  const recovery = coordinator(store);

  const poisonAck = await mailbox.accept(createMessage('poison-1', 1));
  const followingAck = await mailbox.accept(createMessage('following-2', 2));
  assert.equal(poisonAck.status, 'accepted');
  assert.equal(followingAck.status, 'accepted');

  const first = await recovery.nextProcessableMessage(store.snapshot.address);
  assert.equal(first?.message.messageId, 'poison-1');

  const failed = await recovery.recordProcessingFailure({
    target: store.snapshot.address,
    messageId: 'poison-1',
    expectedTargetSequence: poisonAck.targetSequence,
    failure: {
      code: 'domain_transition_failed',
      message: 'fixture poison transition failed',
    },
  });

  assert.equal(failed.instance.lifecycle, 'recovery_required');
  assert.equal(failed.message.disposition, 'failed');
  assert.equal((await store.getMessageDisposition(store.snapshot.address, 'following-2'))?.disposition, 'accepted');
  assert.equal(await recovery.nextProcessableMessage(store.snapshot.address), null);

  const acceptCallsBeforeRejectedMessage = store.acceptCalls;
  await assert.rejects(
    () => mailbox.accept(createMessage('rejected-3', 3)),
    (error: unknown) => error instanceof MessageAcceptanceError && error.code === 'target_not_accepting',
  );
  assert.equal(store.acceptCalls, acceptCallsBeforeRejectedMessage, 'rejection must happen before durable ACK boundary');
  assert.equal(await store.getMessageDisposition(store.snapshot.address, 'rejected-3'), null);
});

test('G17 explicit domain-policy retry restores the poison message ahead of following messages', async () => {
  const store = new RecoveryStoreFake();
  const mailbox = acceptance(store);
  const recovery = coordinator(store);

  const poisonAck = await mailbox.accept(createMessage('poison-1', 1));
  await mailbox.accept(createMessage('following-2', 2));
  await recovery.recordProcessingFailure({
    target: store.snapshot.address,
    messageId: 'poison-1',
    expectedTargetSequence: poisonAck.targetSequence,
    failure: { code: 'retryable_domain_failure', message: 'retry after operator fixes input' },
  });

  const retried = await recovery.retry({
    target: store.snapshot.address,
    messageId: 'poison-1',
    authorization: { kind: 'domain-policy', reason: 'operator corrected referenced domain data' },
  });

  assert.equal(retried.instance.lifecycle, 'active');
  assert.equal(retried.message.disposition, 'accepted');
  assert.equal((await recovery.nextProcessableMessage(store.snapshot.address))?.message.messageId, 'poison-1');
  assert.equal((await store.getMessageDisposition(store.snapshot.address, 'following-2'))?.disposition, 'accepted');
});

test('G17 ambiguous non-idempotent effect cannot retry through ordinary policy and requires explicit ambiguity resolution', async () => {
  const store = new RecoveryStoreFake();
  const mailbox = acceptance(store);
  const recovery = coordinator(store);
  const poisonAck = await mailbox.accept(createMessage('poison-1', 1));

  const effect: RecoveryRequiredToolEffectResult = {
    status: 'recovery_required',
    effectId: 'effect-ambiguous-7',
    reason: 'ambiguous-non-idempotent',
    attempt: 1,
    journal: {
      effectId: 'effect-ambiguous-7',
      target: store.snapshot.address,
      sourceMessageId: 'poison-1',
      effectKind: 'tool:charge-card',
      effectSemantics: 'non-idempotent',
      status: 'started',
      attempt: 1,
      input: { amount: 100 },
      startedAt: '2026-09-18T01:00:00.000Z',
    },
  };

  const failed = await recovery.recordToolRecoveryRequired({
    target: store.snapshot.address,
    messageId: 'poison-1',
    expectedTargetSequence: poisonAck.targetSequence,
    effect,
  });
  assert.equal(failed.message.failure?.code, AMBIGUOUS_NON_IDEMPOTENT_EFFECT_FAILURE_CODE);
  assert.equal(store.resetCalls, 0);

  await assert.rejects(
    () => recovery.retry({
      target: store.snapshot.address,
      messageId: 'poison-1',
      authorization: { kind: 'domain-policy', reason: 'generic retry policy' },
    }),
    AmbiguousNonIdempotentResolutionRequiredError,
  );
  assert.equal(store.resetCalls, 0, 'ambiguous non-idempotent effect must not be blindly reset/retried');

  const explicitResolution: RecoveryRetryAuthorization = {
    kind: 'ambiguous-non-idempotent-resolved',
    effectId: 'effect-ambiguous-7',
    reason: 'operator verified the external system did not commit the effect',
  };
  const reset = await recovery.retry({
    target: store.snapshot.address,
    messageId: 'poison-1',
    authorization: explicitResolution,
  });
  assert.equal(reset.message.disposition, 'accepted');
  assert.equal(store.resetCalls, 1);
});

test('G18 normal terminalization abandons every accepted-but-unprocessed message queryably', async () => {
  const store = new RecoveryStoreFake();
  const mailbox = acceptance(store);
  const recovery = coordinator(store);

  await mailbox.accept(createMessage('pending-1', 1));
  await mailbox.accept(createMessage('pending-2', 2));

  const terminal = await recovery.terminalize({
    mode: 'normal',
    target: store.snapshot.address,
    lifecycle: 'completed',
    output: { result: 'done' },
  });

  assert.equal(terminal.lifecycle, 'completed');
  assert.equal((await store.getMessageDisposition(store.snapshot.address, 'pending-1'))?.disposition, 'abandoned');
  assert.equal((await store.getMessageDisposition(store.snapshot.address, 'pending-2'))?.disposition, 'abandoned');
});

test('G18 domain-authorized recovery terminalization abandons failed poison and all following pending messages', async () => {
  const store = new RecoveryStoreFake();
  const mailbox = acceptance(store);
  const recovery = coordinator(store);

  const poisonAck = await mailbox.accept(createMessage('poison-1', 1));
  await mailbox.accept(createMessage('following-2', 2));
  await recovery.recordProcessingFailure({
    target: store.snapshot.address,
    messageId: 'poison-1',
    expectedTargetSequence: poisonAck.targetSequence,
    failure: { code: 'unrecoverable_domain_failure', message: 'domain owner chose terminal resolution' },
  });

  await assert.rejects(
    () => recovery.terminalize({
      mode: 'normal',
      target: store.snapshot.address,
      lifecycle: 'terminated',
    }),
    RecoveryStateError,
  );

  const terminal = await recovery.terminalize({
    mode: 'recovery',
    target: store.snapshot.address,
    lifecycle: 'terminated',
    authorization: { kind: 'domain-authorized', reason: 'domain owner resolved poison by terminating instance' },
    reason: { code: 'poison_resolved_by_termination' },
  });

  assert.equal(terminal.lifecycle, 'terminated');
  assert.equal((await store.getMessageDisposition(store.snapshot.address, 'poison-1'))?.disposition, 'abandoned');
  assert.equal((await store.getMessageDisposition(store.snapshot.address, 'following-2'))?.disposition, 'abandoned');
  assert.equal(await recovery.nextProcessableMessage(store.snapshot.address), null);
});
