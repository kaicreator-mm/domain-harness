import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonValue } from '../../../src/contracts/json.js';
import type { WorkflowSendAcceptanceBoundary, WorkflowSendAcceptanceResult } from '../../../src/messaging/contracts/workflow-send-acceptance.js';
import type { DomainMessageEffectJournalStore, RunDomainMessageEffectRequest } from '../../../src/messaging/send-effect/contracts.js';
import {
  DomainMessageEffectJournalInvariantError,
  RetryableDomainMessageEffectError,
} from '../../../src/messaging/send-effect/journaled-domain-message-effect.js';
import {
  SuccessorJournaledDomainMessageEffect,
  WorkflowSendTransientUnavailableError,
} from '../../../src/messaging/send-effect/successor-journaled-domain-message-effect.js';
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

function request(): RunDomainMessageEffectRequest {
  return {
    source: {
      target: { workflowId: 'parent', instanceKey: 'case-1' },
      sourceMessageId: 'source-1',
      workflowStepIdentity: 'effects[0]',
      stepVisit: 0,
    },
    effect: {
      kind: 'domain-message',
      targetExpression: '$child',
      messageType: 'START',
      payloadExpression: '$payload',
      contractVersion: '1',
    },
    resolvedTarget: { workflowId: 'child', instanceKey: 'case-1' },
    payload: { caseId: '1' },
    correlationId: 'corr-1',
  };
}

class FakeStore implements DomainMessageEffectJournalStore {
  record: EffectJournalRecord | null = null;
  completeCalls = 0;
  failAfterComplete = false;

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    return this.record?.effectId === effectId ? cloneRecord(this.record) : null;
  }

  async beginEffect(input: BeginEffectRequest): Promise<EffectJournalRecord> {
    if (this.record !== null) return cloneRecord(this.record);
    this.record = cloneRecord(input);
    return cloneRecord(this.record);
  }

  async completeEffect(input: CompleteEffectRequest): Promise<EffectJournalRecord> {
    this.completeCalls += 1;
    if (this.record === null || this.record.effectId !== input.effectId) {
      throw new Error('missing started effect');
    }
    this.record = {
      ...this.record,
      status: input.status,
      completedAt: input.completedAt,
      ...(input.output === undefined ? {} : { output: cloneJson(input.output) }),
      ...(input.error === undefined ? {} : { error: cloneJson(input.error) }),
    };
    if (this.failAfterComplete) throw new Error('lost completion response');
    return cloneRecord(this.record);
  }
}

class FakeAcceptance implements WorkflowSendAcceptanceBoundary {
  readonly calls: DomainMessage[] = [];

  constructor(private result: WorkflowSendAcceptanceResult) {}

  setResult(result: WorkflowSendAcceptanceResult): void {
    this.result = result;
  }

  async accept(message: DomainMessage): Promise<WorkflowSendAcceptanceResult> {
    this.calls.push(structuredClone(message));
    return this.result;
  }
}

function accepted(): WorkflowSendAcceptanceResult {
  return {
    status: 'accepted',
    ack: {
      status: 'accepted',
      messageId: 'placeholder',
      target: { workflowId: 'child', instanceKey: 'case-1' },
      targetSequence: 1,
      packageId: 'pkg-child',
      acceptedAt: '2026-09-30T01:00:00.000Z',
    },
  };
}

function runtime(store: FakeStore, acceptance: FakeAcceptance): SuccessorJournaledDomainMessageEffect {
  let tick = 0;
  return new SuccessorJournaledDomainMessageEffect({
    store,
    acceptance: {
      async accept(message) {
        const result = await acceptance.accept(message);
        if (result.status !== 'accepted') return result;
        return {
          status: 'accepted',
          ack: {
            ...result.ack,
            messageId: message.messageId,
            target: { ...message.target },
          },
        };
      },
    },
    sha256,
    now: () => `2026-09-30T01:00:${String(tick++).padStart(2, '0')}.000Z`,
  });
}

test('accepted child send commits a versioned terminal outcome', async () => {
  const store = new FakeStore();
  const acceptance = new FakeAcceptance(accepted());
  const result = await runtime(store, acceptance).run(request());

  assert.equal(result.outcome.status, 'accepted');
  assert.equal(store.record?.status, 'completed');
  assert.equal(store.completeCalls, 1);
  assert.equal(acceptance.calls.length, 1);
});

test('permanent rejection commits and returns a terminal rejected outcome', async () => {
  const store = new FakeStore();
  const acceptance = new FakeAcceptance({
    status: 'rejected',
    rejection: {
      code: 'target_terminal',
      message: 'target completed',
      targetLifecycle: 'completed',
    },
  });
  const result = await runtime(store, acceptance).run(request());

  assert.equal(result.outcome.status, 'rejected');
  if (result.outcome.status !== 'rejected') assert.fail('expected rejected outcome');
  assert.equal(result.outcome.rejection.code, 'target_terminal');
  assert.equal(store.record?.status, 'completed');
});

test('completed rejection replay never consults target acceptance again', async () => {
  const store = new FakeStore();
  const acceptance = new FakeAcceptance({
    status: 'rejected',
    rejection: { code: 'workflow_not_found', message: 'workflow unavailable in pinned package' },
  });
  const runner = runtime(store, acceptance);
  const first = await runner.run(request());
  assert.equal(first.outcome.status, 'rejected');
  assert.equal(acceptance.calls.length, 1);

  acceptance.setResult({
    status: 'transient_unavailable',
    condition: { code: 'target_not_found', message: 'must not be consulted' },
  });
  const replay = await runner.run(request());
  assert.equal(replay.outcome.status, 'rejected');
  assert.equal(replay.replayed, true);
  assert.equal(acceptance.calls.length, 1);
});

test('transient unavailability leaves effect started and retry reuses exact child message identity', async () => {
  const store = new FakeStore();
  const acceptance = new FakeAcceptance({
    status: 'transient_unavailable',
    condition: { code: 'target_not_found', message: 'not materialized yet' },
  });
  const runner = runtime(store, acceptance);

  await assert.rejects(
    () => runner.run(request()),
    (error: unknown) => {
      assert.ok(error instanceof RetryableDomainMessageEffectError);
      assert.ok(error.cause instanceof WorkflowSendTransientUnavailableError);
      return true;
    },
  );
  assert.equal(store.record?.status, 'started');
  assert.equal(store.record?.attempt, 1);
  assert.equal(acceptance.calls.length, 1);
  const firstMessageId = acceptance.calls[0]?.messageId;

  await assert.rejects(() => runner.run(request()), RetryableDomainMessageEffectError);
  assert.equal(store.record?.status, 'started');
  assert.equal(store.record?.attempt, 1);
  assert.equal(acceptance.calls.length, 2);
  assert.equal(acceptance.calls[1]?.messageId, firstMessageId);
});

test('lost completion response reconciles the durable rejected outcome without re-sending', async () => {
  const store = new FakeStore();
  store.failAfterComplete = true;
  const acceptance = new FakeAcceptance({
    status: 'rejected',
    rejection: { code: 'message_contract_not_found', message: 'unsupported child message' },
  });
  const result = await runtime(store, acceptance).run(request());

  assert.equal(result.outcome.status, 'rejected');
  assert.equal(result.replayed, true);
  assert.equal(acceptance.calls.length, 1);
});

test('malformed completed successor outcome fails closed before target acceptance', async () => {
  const store = new FakeStore();
  const acceptance = new FakeAcceptance(accepted());
  const runner = runtime(store, acceptance);
  await runner.run(request());
  assert.ok(store.record);
  store.record = {
    ...store.record,
    output: { version: 'workflow-send-outcome/1', status: 'rejected', rejection: { code: 'unknown', message: 'bad' } },
  };

  await assert.rejects(() => runner.run(request()), DomainMessageEffectJournalInvariantError);
  assert.equal(acceptance.calls.length, 1);
});

function cloneRecord(record: EffectJournalRecord): EffectJournalRecord {
  return structuredClone(record);
}

function cloneJson(value: JsonValue): JsonValue {
  return structuredClone(value);
}
