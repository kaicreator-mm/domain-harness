import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonValue } from '../../src/contracts/json.js';
import type { WorkflowSendAcceptanceBoundary, WorkflowSendAcceptanceResult } from '../../src/messaging/contracts/workflow-send-acceptance.js';
import type { DomainMessageEffectJournalStore } from '../../src/messaging/send-effect/contracts.js';
import { SuccessorJournaledDomainMessageEffect } from '../../src/messaging/send-effect/successor-journaled-domain-message-effect.js';
import {
  CompiledWorkflowMessageEffectsV3,
} from '../../src/runtime/compiled-workflow-message-effects-v3.js';
import type { CompiledStateV3 } from '../../src/runtime/compiled-workflow-ir-v3.js';
import type { PortableWorkflowState } from '../../src/runtime/compiled-workflow-runtime.js';
import type { EffectJournalRecord } from '../../src/v2/contracts/effect.js';
import type { ExpressionExecutorPort, Sha256Port } from '../../src/v2/contracts/host.js';
import type { DomainMessage, MessageAcceptedAck } from '../../src/v2/contracts/message.js';
import type { BeginEffectRequest, CompleteEffectRequest, StoredAcceptedMessage } from '../../src/v2/contracts/store.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';

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
  readonly records = new Map<string, EffectJournalRecord>();

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    const record = this.records.get(effectId);
    return record === undefined ? null : structuredClone(record);
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.records.get(request.effectId);
    if (existing !== undefined) return structuredClone(existing);
    this.records.set(request.effectId, structuredClone(request));
    return structuredClone(request);
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    const current = this.records.get(request.effectId);
    if (current === undefined) throw new Error('missing source effect');
    const next: EffectJournalRecord = {
      ...current,
      status: request.status,
      completedAt: request.completedAt,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
      ...(request.error === undefined ? {} : { error: structuredClone(request.error) }),
    };
    this.records.set(request.effectId, next);
    return structuredClone(next);
  }
}

class SequencedAcceptance implements WorkflowSendAcceptanceBoundary {
  readonly calls: DomainMessage[] = [];

  constructor(private readonly results: readonly WorkflowSendAcceptanceResult[]) {}

  async accept(message: DomainMessage): Promise<WorkflowSendAcceptanceResult> {
    const index = this.calls.length;
    this.calls.push(structuredClone(message));
    const result = this.results[index];
    if (result === undefined) throw new Error(`unexpected child send ${index}`);
    if (result.status !== 'accepted') return result;
    return {
      status: 'accepted',
      ack: {
        ...result.ack,
        messageId: message.messageId,
        target: { ...message.target },
      },
    };
  }
}

function acceptedAck(): MessageAcceptedAck {
  return {
    status: 'accepted',
    messageId: 'placeholder',
    target: { workflowId: 'placeholder', instanceKey: 'case-1' },
    targetSequence: 1,
    packageId: 'pkg-child',
    acceptedAt: '2026-09-30T02:00:00.000Z',
  };
}

function current(): WorkflowInstanceSnapshot {
  return {
    address: { workflowId: 'parent', instanceKey: 'case-1' },
    correlationId: 'corr-1',
    packageId: 'pkg-parent',
    lifecycle: 'waiting',
    stateRevision: 4,
    state: { stateId: 'emitting', data: { caseId: '1' }, lastMessage: {}, lastResult: null },
    createdAt: '2026-09-30T01:00:00.000Z',
    updatedAt: '2026-09-30T02:00:00.000Z',
  };
}

function stored(): StoredAcceptedMessage {
  return {
    message: {
      messageId: 'source-1',
      target: current().address,
      type: 'RUN',
      payload: { command: 'run' },
      correlationId: 'corr-1',
    },
    ack: {
      status: 'accepted',
      messageId: 'source-1',
      target: current().address,
      targetSequence: 5,
      packageId: 'pkg-parent',
      acceptedAt: '2026-09-30T02:00:01.000Z',
    },
  };
}

function portable(): PortableWorkflowState {
  return {
    stateId: 'emitting',
    data: { caseId: '1' },
    lastMessage: { command: 'run' },
    lastResult: { previous: true },
  };
}

function stateDefinition(): CompiledStateV3 {
  const rejected = [
    { target: 'terminal-path', when: 'is-terminal' },
    { target: 'fallback-path' },
  ] as const;
  return {
    final: false,
    done: [],
    error: [],
    events: {},
    invoke: { kind: 'expr', expression: 'old-state-invoke' },
    effects: [
      { kind: 'domain-message', targetExpression: 'child-1', messageType: 'ONE', rejected },
      { kind: 'domain-message', targetExpression: 'child-2', messageType: 'TWO', rejected },
      { kind: 'domain-message', targetExpression: 'child-3', messageType: 'THREE', rejected },
    ],
  };
}

function expression(observedRejectionScopes: JsonValue[]): ExpressionExecutorPort {
  return {
    async evaluate(request): Promise<JsonValue> {
      if (request.expression.startsWith('child-')) {
        return { workflowId: request.expression, instanceKey: 'case-1' };
      }
      if (request.expression === 'is-terminal') {
        observedRejectionScopes.push(structuredClone(request.input));
        const input = request.input as { rejection?: { code?: unknown } };
        return input.rejection?.code === 'target_terminal';
      }
      if (request.expression === 'old-state-invoke') {
        throw new Error('old-state invoke must not execute inside message-effect executor');
      }
      throw new Error(`unexpected expression ${request.expression}`);
    },
  };
}

test('permanent rejection durably completes prior siblings then routes before later siblings', async () => {
  const store = new EffectStore();
  const acceptance = new SequencedAcceptance([
    { status: 'accepted', ack: acceptedAck() },
    {
      status: 'rejected',
      rejection: {
        code: 'target_terminal',
        message: 'child already completed',
        targetLifecycle: 'completed',
      },
    },
    { status: 'accepted', ack: acceptedAck() },
  ]);
  let tick = 0;
  const messageEffect = new SuccessorJournaledDomainMessageEffect({
    store,
    acceptance,
    sha256,
    now: () => `2026-09-30T02:00:${String(10 + tick++).padStart(2, '0')}.000Z`,
  });
  const observedRejectionScopes: JsonValue[] = [];
  const childAccepted: Array<{ target: WorkflowAddress; messageId: string }> = [];
  const executor = new CompiledWorkflowMessageEffectsV3({
    expression: expression(observedRejectionScopes),
    messageEffect,
    onChildAccepted(target, messageId) {
      childAccepted.push({ target: { ...target }, messageId });
    },
  });

  const result = await executor.run({
    stateDefinition: stateDefinition(),
    current: current(),
    stored: stored(),
    state: portable(),
    logicalTime: '2026-09-30T02:00:01.000Z',
    step: 0,
  });

  assert.equal(result.status, 'rejected_routed');
  if (result.status !== 'rejected_routed') assert.fail('expected rejected route');
  assert.equal(result.state.stateId, 'terminal-path');
  assert.deepEqual(result.state.data, portable().data);
  assert.deepEqual(result.state.lastResult, portable().lastResult);
  assert.equal(result.effectIndex, 1);
  assert.equal(acceptance.calls.length, 2, 'third old-state sibling must not execute');
  assert.equal(childAccepted.length, 1, 'only accepted child emits child-accepted callback');
  assert.equal(store.records.size, 2, 'only first and rejected second sibling acquire journal records');
  for (const record of store.records.values()) assert.equal(record.status, 'completed');
  assert.equal(observedRejectionScopes.length, 1);
  const rejectionScope = observedRejectionScopes[0] as { rejection?: { code?: unknown } };
  assert.equal(rejectionScope.rejection?.code, 'target_terminal');
});

test('all accepted siblings continue and notify each child', async () => {
  const store = new EffectStore();
  const acceptance = new SequencedAcceptance([
    { status: 'accepted', ack: acceptedAck() },
    { status: 'accepted', ack: acceptedAck() },
    { status: 'accepted', ack: acceptedAck() },
  ]);
  const messageEffect = new SuccessorJournaledDomainMessageEffect({
    store,
    acceptance,
    sha256,
    now: () => '2026-09-30T02:10:00.000Z',
  });
  const childAccepted: string[] = [];
  const executor = new CompiledWorkflowMessageEffectsV3({
    expression: expression([]),
    messageEffect,
    onChildAccepted(_target, messageId) {
      childAccepted.push(messageId);
    },
  });

  const result = await executor.run({
    stateDefinition: stateDefinition(),
    current: current(),
    stored: stored(),
    state: portable(),
    logicalTime: '2026-09-30T02:00:01.000Z',
    step: 0,
  });

  assert.deepEqual(result, { status: 'continued' });
  assert.equal(acceptance.calls.length, 3);
  assert.equal(childAccepted.length, 3);
  assert.equal(store.records.size, 3);
});
