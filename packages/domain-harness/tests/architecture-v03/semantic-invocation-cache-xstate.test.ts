import assert from 'node:assert/strict';
import test from 'node:test';
import { createActor, setup } from 'xstate';
import {
  ExactSemanticInvocationCacheRunner,
  FakeModelPort,
  SemanticResultCache,
  makeInvocation,
} from './semantic-invocation-cache-spike.js';

interface GuardContext {
  approvalCurrentlyLegal: boolean;
}

type GuardEvent = {
  type: 'DECISION';
  result: {
    decision: string;
    reason: string;
  };
};

test('S14 cache hit still passes through current XState guard and illegal decision cannot transition', async () => {
  const cache = new SemanticResultCache();
  const model = new FakeModelPort(() => ({
    decision: 'approve',
    reason: 'semantic computation recommends approval',
  }));
  const runner = new ExactSemanticInvocationCacheRunner(cache, model);

  await runner.invoke(makeInvocation());
  const cached = await runner.invoke(makeInvocation({
    execution: {
      workflowInstanceId: 'workflow-second',
      sourceMessageId: 'message-second',
      effectId: 'effect-second',
    },
  }));
  assert.equal(cached.source, 'cache');
  assert.equal(model.calls, 1);

  const machine = setup({
    types: {
      context: {} as GuardContext,
      events: {} as GuardEvent,
    },
    guards: {
      approvalIsCurrentlyLegal: ({ context, event }) => (
        context.approvalCurrentlyLegal && event.result.decision === 'approve'
      ),
    },
  }).createMachine({
    initial: 'awaiting_decision',
    context: {
      approvalCurrentlyLegal: false,
    },
    states: {
      awaiting_decision: {
        on: {
          DECISION: {
            guard: 'approvalIsCurrentlyLegal',
            target: 'approved',
          },
        },
      },
      approved: {
        type: 'final',
      },
    },
  });

  const actor = createActor(machine).start();
  actor.send({
    type: 'DECISION',
    result: cached.result as GuardEvent['result'],
  });

  assert.equal(actor.getSnapshot().value, 'awaiting_decision');
  assert.equal(actor.getSnapshot().status, 'active');
});
