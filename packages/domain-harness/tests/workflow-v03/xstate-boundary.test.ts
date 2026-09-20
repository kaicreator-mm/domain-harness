import assert from 'node:assert/strict';
import test from 'node:test';

import type { JsonObject } from '../../src/contracts/json.js';
import type { DomainWorkflowDefinition } from '../../src/workflow/index.js';
import {
  XStateBoundaryContractError,
  adaptDomainWorkflowToXState,
} from '../../src/workflow/internal/xstate-adapter.js';

const workflow: DomainWorkflowDefinition = {
  workflowKey: 'review',
  initialState: 'pending',
  initialContext: { minimumScore: 10 },
  guards: [
    {
      guardId: 'score-ok',
      predicate: {
        op: 'gte',
        left: { source: 'event', path: ['payload', 'score'] },
        right: { source: 'context', path: ['minimumScore'] },
      },
    },
  ],
  states: [
    {
      stateKey: 'pending',
      transitions: [
        {
          transitionKey: 'approve',
          trigger: { kind: 'event', eventType: 'APPROVE' },
          targetState: 'approved',
          guardId: 'score-ok',
          effectIntents: [{ effectType: 'audit.approved', input: { source: 'workflow' } }],
        },
      ],
    },
    { stateKey: 'approved', kind: 'final' },
  ],
};

test('internal adapter maps Domain Workflow control semantics while keeping Effect Intent as data', () => {
  const config = adaptDomainWorkflowToXState(workflow);
  const pending = config.states['pending'];
  assert.ok(pending);
  const approve = pending.on?.['APPROVE']?.[0];
  assert.ok(approve);
  assert.ok(approve.guard);

  assert.equal(
    approve.guard({
      context: { minimumScore: 10 },
      event: { type: 'APPROVE', payload: { score: 12 } },
    }),
    true,
  );
  assert.equal(
    approve.guard({
      context: { minimumScore: 10 },
      event: { type: 'APPROVE', payload: { score: 9 } },
    }),
    false,
  );
  assert.equal('actions' in approve, false, 'T-006 must not execute durable effects from the adapter');
  assert.equal(
    pending.meta.domainHarness.state.transitions?.[0]?.effectIntents?.[0]?.effectType,
    'audit.approved',
  );
});

test('adapter guard fails closed on accessor-backed engine event without invoking the accessor', () => {
  const config = adaptDomainWorkflowToXState(workflow);
  const guard = config.states['pending']?.on?.['APPROVE']?.[0]?.guard;
  assert.ok(guard);

  let getterCalls = 0;
  const event: Record<string, unknown> = { type: 'APPROVE' };
  Object.defineProperty(event, 'payload', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { score: 12 };
    },
  });

  assert.equal(
    guard({ context: { minimumScore: 10 }, event: event as { type: string; payload?: JsonObject } }),
    false,
  );
  assert.equal(getterCalls, 0);
});

test('adapter rejects invalid state/guard references before machine execution', () => {
  assert.throws(
    () => adaptDomainWorkflowToXState({ ...workflow, initialState: 'missing' }),
    XStateBoundaryContractError,
  );
  assert.throws(
    () => adaptDomainWorkflowToXState({
      ...workflow,
      states: [
        {
          stateKey: 'pending',
          transitions: [
            {
              transitionKey: 'bad-guard',
              trigger: { kind: 'event', eventType: 'APPROVE' },
              targetState: 'approved',
              guardId: 'missing-guard',
            },
          ],
        },
        { stateKey: 'approved', kind: 'final' },
      ],
    }),
    /unknown guard/,
  );
});
