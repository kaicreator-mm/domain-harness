import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  WorkflowSendAcceptanceBoundary,
  WorkflowSendAcceptanceResult,
} from '../../../src/messaging/contracts/workflow-send-acceptance.js';
import type {
  DomainMessageEffectJournalStore,
  RunDomainMessageEffectRequest,
} from '../../../src/messaging/send-effect/contracts.js';
import { RetryableDomainMessageEffectError } from '../../../src/messaging/send-effect/journaled-domain-message-effect.js';
import { SuccessorJournaledDomainMessageEffect } from '../../../src/messaging/send-effect/successor-journaled-domain-message-effect.js';
import type { EffectJournalRecord } from '../../../src/v2/contracts/effect.js';
import type { Sha256Port } from '../../../src/v2/contracts/host.js';
import type { DomainMessage } from '../../../src/v2/contracts/message.js';
import type { BeginEffectRequest, CompleteEffectRequest } from '../../../src/v2/contracts/store.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    let hash = 2166136261;
    for (const character of value) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  },
};

class EffectStore implements DomainMessageEffectJournalStore {
  record: EffectJournalRecord | null = null;

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    return this.record?.effectId === effectId ? structuredClone(this.record) : null;
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    if (this.record !== null) return structuredClone(this.record);
    this.record = structuredClone(request);
    return structuredClone(request);
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    if (this.record === null) throw new Error('missing started effect');
    this.record = {
      ...this.record,
      status: request.status,
      completedAt: request.completedAt,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
      ...(request.error === undefined ? {} : { error: structuredClone(request.error) }),
    };
    return structuredClone(this.record);
  }
}

class TransientThenAccepted implements WorkflowSendAcceptanceBoundary {
  readonly messages: DomainMessage[] = [];
  private call = 0;

  async accept(message: DomainMessage): Promise<WorkflowSendAcceptanceResult> {
    this.messages.push(structuredClone(message));
    this.call += 1;
    if (this.call === 1) {
      return {
        status: 'transient_unavailable',
        condition: { code: 'target_not_found', message: 'not provisioned yet' },
      };
    }
    return {
      status: 'accepted',
      ack: {
        status: 'accepted',
        messageId: message.messageId,
        target: { ...message.target },
        targetSequence: 1,
        packageId: 'pkg-child',
        acceptedAt: '2026-09-30T04:00:00.000Z',
      },
    };
  }
}

function request(): RunDomainMessageEffectRequest {
  return {
    source: {
      target: { workflowId: 'parent', instanceKey: 'case-1' },
      sourceMessageId: 'source-1',
      workflowStepIdentity: 'emitting:message-effect:0',
      stepVisit: 0,
    },
    effect: {
      kind: 'domain-message',
      targetExpression: '$child',
      messageType: 'START',
    },
    resolvedTarget: { workflowId: 'child', instanceKey: 'case-1' },
    payload: { caseId: '1' },
    correlationId: 'corr-1',
  };
}

test('transient target absence retries the same child identity and may later converge to accepted', async () => {
  const store = new EffectStore();
  const acceptance = new TransientThenAccepted();
  let tick = 0;
  const runner = new SuccessorJournaledDomainMessageEffect({
    store,
    acceptance,
    sha256,
    now: () => `2026-09-30T04:00:${String(tick++).padStart(2, '0')}.000Z`,
  });

  await assert.rejects(() => runner.run(request()), RetryableDomainMessageEffectError);
  assert.equal(store.record?.status, 'started');
  const firstMessageId = acceptance.messages[0]?.messageId;
  assert.ok(firstMessageId);

  const accepted = await runner.run(request());
  assert.equal(accepted.outcome.status, 'accepted');
  assert.equal(store.record?.status, 'completed');
  assert.equal(acceptance.messages.length, 2);
  assert.equal(acceptance.messages[1]?.messageId, firstMessageId);
});
