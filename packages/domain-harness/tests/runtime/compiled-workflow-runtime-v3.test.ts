import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonValue } from '../../src/contracts/json.js';
import { DurableToolRunner } from '../../src/execution/tool-runner/durable-tool-runner.js';
import type {
  WorkflowSendAcceptanceBoundary,
  WorkflowSendAcceptanceResult,
} from '../../src/messaging/contracts/workflow-send-acceptance.js';
import type { DomainMessageEffectJournalStore } from '../../src/messaging/send-effect/contracts.js';
import { SuccessorJournaledDomainMessageEffect } from '../../src/messaging/send-effect/successor-journaled-domain-message-effect.js';
import { CompiledWorkflowMessageEffectsV3 } from '../../src/runtime/compiled-workflow-message-effects-v3.js';
import { CompiledWorkflowRuntimeV3 } from '../../src/runtime/compiled-workflow-runtime-v3.js';
import type { ToolExecutorPort } from '../../src/v2/contracts/effect.js';
import type { EffectJournalRecord } from '../../src/v2/contracts/effect.js';
import type { ExpressionExecutorPort, Sha256Port } from '../../src/v2/contracts/host.js';
import type { DomainMessage, MessageAcceptedAck } from '../../src/v2/contracts/message.js';
import type {
  CompiledWorkflowDescriptor,
  TargetCompiledDomainPackage,
} from '../../src/v2/contracts/package.js';
import type {
  BeginEffectRequest,
  CompleteEffectRequest,
  StoredAcceptedMessage,
} from '../../src/v2/contracts/store.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';

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
    const completed: EffectJournalRecord = {
      ...current,
      status: request.status,
      completedAt: request.completedAt,
      ...(request.output === undefined ? {} : { output: structuredClone(request.output) }),
      ...(request.error === undefined ? {} : { error: structuredClone(request.error) }),
    };
    this.records.set(request.effectId, completed);
    return structuredClone(completed);
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
    acceptedAt: '2026-09-30T03:00:00.000Z',
  };
}

function workflow(): CompiledWorkflowDescriptor {
  return {
    workflowId: 'parent',
    definition: {
      initial: 'waiting',
      states: {
        waiting: {
          final: false,
          done: [],
          error: [],
          events: { RUN: { routes: [{ target: 'emitting' }] } },
        },
        emitting: {
          final: false,
          done: [],
          error: [],
          events: {},
          effects: [
            {
              kind: 'domain-message',
              targetExpression: 'child-1',
              messageType: 'ONE',
              rejected: [{ target: 'rejected' }],
            },
            {
              kind: 'domain-message',
              targetExpression: 'child-2',
              messageType: 'TWO',
              rejected: [{ target: 'rejected' }],
            },
            {
              kind: 'domain-message',
              targetExpression: 'child-3',
              messageType: 'THREE',
              rejected: [{ target: 'rejected' }],
            },
          ],
          invoke: { kind: 'expr', expression: 'old-state-invoke' },
        },
        rejected: { final: true, done: [], error: [], events: {} },
      },
      limits: { maxSteps: 16 },
    },
    messageContracts: {},
  } as unknown as CompiledWorkflowDescriptor;
}

function current(): WorkflowInstanceSnapshot {
  return {
    address: { workflowId: 'parent', instanceKey: 'case-1' },
    correlationId: 'corr-1',
    packageId: 'pkg-parent',
    lifecycle: 'waiting',
    stateRevision: 4,
    state: {
      stateId: 'waiting',
      data: { caseId: '1' },
      lastMessage: null,
      lastResult: null,
    },
    createdAt: '2026-09-30T02:00:00.000Z',
    updatedAt: '2026-09-30T02:30:00.000Z',
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
      acceptedAt: '2026-09-30T03:00:01.000Z',
    },
  };
}

function expression(invocations: string[]): ExpressionExecutorPort {
  return {
    async evaluate(request): Promise<JsonValue> {
      invocations.push(request.expression);
      if (request.expression.startsWith('child-')) {
        return { workflowId: request.expression, instanceKey: 'case-1' };
      }
      if (request.expression === 'old-state-invoke') {
        throw new Error('old-state invoke executed after permanent child rejection');
      }
      throw new Error(`unexpected expression ${request.expression}`);
    },
  };
}

test('engine3 permanent child rejection routes before later siblings and old-state invoke', async () => {
  const acceptance = new SequencedAcceptance([
    { status: 'accepted', ack: acceptedAck() },
    {
      status: 'rejected',
      rejection: {
        code: 'target_terminal',
        message: 'child already terminal',
        targetLifecycle: 'completed',
      },
    },
    { status: 'accepted', ack: acceptedAck() },
  ]);
  const store = new EffectStore();
  const invocations: string[] = [];
  const expressionPort = expression(invocations);
  const messageEffect = new SuccessorJournaledDomainMessageEffect({
    store,
    acceptance,
    sha256,
    now: () => '2026-09-30T03:00:02.000Z',
  });
  const messageEffects = new CompiledWorkflowMessageEffectsV3({
    expression: expressionPort,
    messageEffect,
    onChildAccepted() {},
  });
  const runtime = new CompiledWorkflowRuntimeV3({
    expression: expressionPort,
    toolRunner: {} as unknown as DurableToolRunner,
    toolExecutor: {} as unknown as ToolExecutorPort,
    messageEffects,
  });

  const result = await runtime.processCommand(
    { manifest: { packageId: 'pkg-parent', tools: {} } } as unknown as TargetCompiledDomainPackage,
    workflow(),
    current(),
    stored(),
  );

  assert.equal(result.status, 'applied');
  if (result.status !== 'applied') assert.fail('expected applied source command');
  assert.equal(result.transition.nextLifecycle, 'completed');
  const nextState = result.transition.nextState as { stateId?: unknown };
  assert.equal(nextState.stateId, 'rejected');
  assert.equal(acceptance.calls.length, 2, 'later old-state sibling must not execute');
  assert.equal(store.records.size, 2, 'accepted prior sibling and rejected sibling remain durable');
  assert.equal(invocations.includes('child-3'), false);
  assert.equal(invocations.includes('old-state-invoke'), false);
});
