import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonValue } from '../../../src/contracts/json.js';
import { EffectJournalConflictError } from '../../../src/execution/journal/effect-journal.js';
import type { DomainMessageAcceptanceBoundary } from '../../../src/messaging/contracts/message-acceptance.js';
import type {
  DomainMessageEffectJournalStore,
  RunDomainMessageEffectRequest,
} from '../../../src/messaging/send-effect/contracts.js';
import {
  DomainMessageEffectJournalInvariantError,
  JournaledDomainMessageEffect,
  RetryableDomainMessageEffectError,
  deriveChildMessageId,
} from '../../../src/messaging/send-effect/journaled-domain-message-effect.js';
import type { EffectJournalRecord } from '../../../src/v2/contracts/effect.js';
import type { Sha256Port } from '../../../src/v2/contracts/host.js';
import type { DomainMessage, MessageAcceptedAck } from '../../../src/v2/contracts/message.js';
import type { BeginEffectRequest, CompleteEffectRequest } from '../../../src/v2/contracts/store.js';
import type { WorkflowAddress } from '../../../src/v2/contracts/workflow.js';

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

const sourceAddress: WorkflowAddress = {
  workflowId: 'generation',
  instanceKey: 'asset-42',
};

const targetAddress: WorkflowAddress = {
  workflowId: 'quality',
  instanceKey: 'asset-42',
};

function request(overrides: Partial<RunDomainMessageEffectRequest> = {}): RunDomainMessageEffectRequest {
  return {
    source: {
      target: sourceAddress,
      sourceMessageId: 'source-message-7',
      workflowStepIdentity: 'emit-artifact-generated',
      stepVisit: 0,
    },
    effect: {
      kind: 'domain-message',
      targetExpression: '$target',
      messageType: 'ArtifactGenerated',
      payloadExpression: '$payload',
      contractVersion: '1',
    },
    resolvedTarget: targetAddress,
    payload: { artifactId: 'asset-42', revision: 3 },
    correlationId: 'corr-asset-42',
    ...overrides,
  };
}

class FakeEffectStore implements DomainMessageEffectJournalStore {
  record: EffectJournalRecord | null = null;
  readonly timeline: string[];
  failCompleteBeforeCommit = false;
  failCompleteAfterCommit = false;

  constructor(timeline: string[] = []) {
    this.timeline = timeline;
  }

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    this.timeline.push('journal:get');
    return this.record?.effectId === effectId ? cloneRecord(this.record) : null;
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    this.timeline.push(`journal:begin:${request.attempt}`);
    if (this.record?.status === 'completed') return cloneRecord(this.record);
    this.record = cloneRecord(request);
    return cloneRecord(this.record);
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    this.timeline.push('journal:complete');
    if (!this.record || this.record.effectId !== request.effectId) {
      throw new Error(`missing started effect ${request.effectId}`);
    }
    if (this.failCompleteBeforeCommit) {
      throw new Error('simulated crash before source ACK journal commit');
    }

    this.record = {
      ...this.record,
      status: request.status,
      completedAt: request.completedAt,
      ...(request.output === undefined ? {} : { output: cloneJson(request.output) }),
      ...(request.error === undefined ? {} : { error: cloneJson(request.error) }),
    };

    if (this.failCompleteAfterCommit) {
      throw new Error('simulated lost completion response after durable commit');
    }
    return cloneRecord(this.record);
  }
}

class FakeTargetAcceptance implements DomainMessageAcceptanceBoundary {
  readonly calls: DomainMessage[] = [];
  readonly timeline: string[];
  readonly accepted = new Map<string, { message: DomainMessage; ack: MessageAcceptedAck; processed: boolean }>();
  transitionCount = 0;
  rejectWith: Error | null = null;
  private nextSequence = 1;

  constructor(timeline: string[] = []) {
    this.timeline = timeline;
  }

  async accept(message: DomainMessage): Promise<MessageAcceptedAck> {
    this.timeline.push('target:accept');
    this.calls.push(cloneMessage(message));
    if (this.rejectWith) throw this.rejectWith;

    const key = targetMessageKey(message.target, message.messageId);
    const existing = this.accepted.get(key);
    if (existing) {
      return {
        ...existing.ack,
        target: { ...existing.ack.target },
        status: 'duplicate',
      };
    }

    const targetSequence = this.nextSequence++;
    const ack: MessageAcceptedAck = {
      status: 'accepted',
      messageId: message.messageId,
      target: { ...message.target },
      targetSequence,
      packageId: 'pkg-quality-v1',
      acceptedAt: `2026-09-18T04:00:00.${String(targetSequence).padStart(3, '0')}Z`,
    };
    this.accepted.set(key, {
      message: cloneMessage(message),
      ack: { ...ack, target: { ...ack.target } },
      processed: false,
    });
    return ack;
  }

  processAccepted(): void {
    for (const accepted of this.accepted.values()) {
      if (accepted.processed) continue;
      accepted.processed = true;
      this.transitionCount += 1;
      this.timeline.push(`target:transition:${accepted.ack.targetSequence}`);
    }
  }
}

function runtime(store: FakeEffectStore, acceptance: FakeTargetAcceptance): JournaledDomainMessageEffect {
  let tick = 0;
  return new JournaledDomainMessageEffect({
    store,
    acceptance,
    sha256,
    now: () => `2026-09-18T04:00:1${tick++}.000Z`,
  });
}

test('deterministic child message identity is derived only from the source effect identity', async () => {
  const first = await deriveChildMessageId(sha256, 'effect:v2:abc');
  const replay = await deriveChildMessageId(sha256, 'effect:v2:abc');
  const sibling = await deriveChildMessageId(sha256, 'effect:v2:def');

  assert.equal(first, replay);
  assert.notEqual(first, sibling);
  assert.match(first, /^message:v2:/);
});

test('G20 workflow send journals the target durable ACK before the source may advance', async () => {
  const timeline: string[] = [];
  const store = new FakeEffectStore(timeline);
  const acceptance = new FakeTargetAcceptance(timeline);

  const result = await runtime(store, acceptance).run(request());
  timeline.push('source:advance');

  assert.equal(result.status, 'completed');
  assert.equal(result.replayed, false);
  assert.equal(result.ack.status, 'accepted');
  assert.equal(acceptance.calls.length, 1);
  assert.equal(acceptance.accepted.size, 1);
  assert.equal(store.record?.status, 'completed');

  const emitted = acceptance.calls[0]!;
  assert.equal(emitted.messageId, result.messageId);
  assert.deepEqual(emitted.target, targetAddress);
  assert.equal(emitted.type, 'ArtifactGenerated');
  assert.deepEqual(emitted.payload, { artifactId: 'asset-42', revision: 3 });
  assert.equal(emitted.correlationId, 'corr-asset-42');
  assert.equal(emitted.causationId, 'source-message-7');
  assert.equal(emitted.contractVersion, '1');

  const targetAcceptIndex = timeline.indexOf('target:accept');
  const sourceJournalIndex = timeline.indexOf('journal:complete');
  const sourceAdvanceIndex = timeline.indexOf('source:advance');
  assert.ok(targetAcceptIndex >= 0);
  assert.ok(sourceJournalIndex > targetAcceptIndex, 'source ACK journal must follow target durable acceptance');
  assert.ok(sourceAdvanceIndex > sourceJournalIndex, 'source must not advance before ACK journal completion');
});

test('completed source effect replay reuses the journaled ACK without sending to the target again', async () => {
  const store = new FakeEffectStore();
  const acceptance = new FakeTargetAcceptance();
  const effectRequest = request();

  const first = await runtime(store, acceptance).run(effectRequest);
  const replay = await runtime(store, acceptance).run(effectRequest);

  assert.equal(first.ack.status, 'accepted');
  assert.equal(replay.replayed, true);
  assert.equal(replay.messageId, first.messageId);
  assert.deepEqual(replay.ack, first.ack);
  assert.equal(acceptance.calls.length, 1, 'completed source journal is replay authority');
});

test('G20 crash window re-accepts the same child ID, receives duplicate ACK, and never duplicates target transition', async () => {
  const timeline: string[] = [];
  const store = new FakeEffectStore(timeline);
  const acceptance = new FakeTargetAcceptance(timeline);
  const effectRequest = request();
  store.failCompleteBeforeCommit = true;

  await assert.rejects(
    () => runtime(store, acceptance).run(effectRequest),
    (error: unknown) => error instanceof RetryableDomainMessageEffectError && error.attempt === 1,
  );

  assert.equal(store.record?.status, 'started');
  assert.equal(acceptance.accepted.size, 1, 'target acceptance is already durable');
  assert.equal(acceptance.calls[0]?.messageId, [...acceptance.accepted.values()][0]?.message.messageId);

  // L2 explicitly allows target processing to begin before the source advances.
  acceptance.processAccepted();
  assert.equal(acceptance.transitionCount, 1);

  store.failCompleteBeforeCommit = false;
  const replay = await runtime(store, acceptance).run(effectRequest);

  assert.equal(replay.status, 'completed');
  assert.equal(replay.ack.status, 'duplicate');
  assert.equal(replay.attempt, 2);
  assert.equal(acceptance.calls.length, 2);
  assert.equal(acceptance.calls[0]?.messageId, acceptance.calls[1]?.messageId);
  assert.equal(acceptance.accepted.size, 1, 'target dedup keeps one durable message');

  acceptance.processAccepted();
  assert.equal(acceptance.transitionCount, 1, 'replay must not create a second logical target transition');
});

test('lost source journal completion response reconciles the committed ACK without target re-send', async () => {
  const store = new FakeEffectStore();
  const acceptance = new FakeTargetAcceptance();
  store.failCompleteAfterCommit = true;

  const result = await runtime(store, acceptance).run(request());

  assert.equal(result.status, 'completed');
  assert.equal(result.replayed, true);
  assert.equal(result.ack.status, 'accepted');
  assert.equal(store.record?.status, 'completed');
  assert.equal(acceptance.calls.length, 1);
});

test('same source effect identity with changed send semantics fails closed before target acceptance', async () => {
  const store = new FakeEffectStore();
  const acceptance = new FakeTargetAcceptance();
  const effectRequest = request();

  await runtime(store, acceptance).run(effectRequest);

  await assert.rejects(
    () => runtime(store, acceptance).run(request({ payload: { artifactId: 'asset-42', revision: 4 } })),
    EffectJournalConflictError,
  );
  assert.equal(acceptance.calls.length, 1);
});

test('pre-acceptance target rejection never journals a false completed source effect', async () => {
  const store = new FakeEffectStore();
  const acceptance = new FakeTargetAcceptance();
  acceptance.rejectWith = new Error('target pinned contract rejected message');

  await assert.rejects(
    () => runtime(store, acceptance).run(request()),
    /target pinned contract rejected message/,
  );

  assert.equal(store.record?.status, 'started');
  assert.equal(acceptance.accepted.size, 0);
});

test('corrupt completed source ACK journal fails closed instead of fabricating delivery evidence', async () => {
  const store = new FakeEffectStore();
  const acceptance = new FakeTargetAcceptance();
  const effectRequest = request();
  await runtime(store, acceptance).run(effectRequest);

  assert.ok(store.record);
  store.record = {
    ...store.record,
    output: { status: 'accepted', messageId: 'wrong-message-id' },
  };

  await assert.rejects(
    () => runtime(store, acceptance).run(effectRequest),
    DomainMessageEffectJournalInvariantError,
  );
  assert.equal(acceptance.calls.length, 1);
});

function targetMessageKey(target: WorkflowAddress, messageId: string): string {
  return `${target.workflowId}\u0000${target.instanceKey}\u0000${messageId}`;
}

function cloneMessage(message: DomainMessage): DomainMessage {
  return {
    ...message,
    target: { ...message.target },
    payload: cloneJson(message.payload),
  };
}

function cloneRecord(record: EffectJournalRecord): EffectJournalRecord {
  return {
    ...record,
    target: { ...record.target },
    ...(record.input === undefined ? {} : { input: cloneJson(record.input) }),
    ...(record.output === undefined ? {} : { output: cloneJson(record.output) }),
    ...(record.error === undefined ? {} : { error: cloneJson(record.error) }),
  };
}

function cloneJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)]));
}
