import assert from 'node:assert/strict';
import test from 'node:test';
import { createActor, createMachine } from 'xstate';

import type { DomainWorkflowDefinition, DomainWorkflowTrigger } from '../../src/workflow/index.js';
import {
  XStateBoundaryContractError,
  adaptDomainWorkflowToXState,
  createDomainXStateEvent,
  createInternalXStateEvent,
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

  assert.equal(
    approve.guard({
      context: config.context,
      event: createDomainXStateEvent({ type: 'APPROVE', payload: { score: 12 } }),
    }),
    true,
  );
  assert.equal(
    approve.guard({
      context: config.context,
      event: createDomainXStateEvent({ type: 'APPROVE', payload: { score: 9 } }),
    }),
    false,
  );
  assert.equal('actions' in approve, false, 'T-006 must not execute durable effects from the adapter');
  assert.equal(
    pending.meta.domainHarness.state.transitions?.[0]?.effectIntents?.[0]?.effectType,
    'audit.approved',
  );
});

test('mapped config executes inside the selected XState engine without exposing engine identity publicly', () => {
  const config = adaptDomainWorkflowToXState(workflow);
  const machine = createMachine(config as unknown as Parameters<typeof createMachine>[0]);
  const actor = createActor(machine).start();

  actor.send(createDomainXStateEvent({ type: 'APPROVE', payload: { score: 12 } }));
  assert.equal(actor.getSnapshot().value, 'approved');
  actor.stop();
});

test('adapter Guard rejects untrusted accessor-backed engine event without invoking the accessor', () => {
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
    guard({ context: config.context, event: event as { type: string; [key: string]: unknown } }),
    false,
  );
  assert.equal(getterCalls, 0);
});

test('ordinary events cannot spoof any internal lifecycle control trigger', () => {
  const internalTriggers = [
    { kind: 'invocation_done', invocationKey: 'risk' },
    { kind: 'invocation_failed', invocationKey: 'risk' },
    { kind: 'wait', waitKey: 'operator' },
    { kind: 'timer', timerKey: 'reminder' },
    { kind: 'deadline', deadlineKey: 'sla' },
    { kind: 'callback', callbackKey: 'provider' },
    { kind: 'recovery', recoveryKey: 'retry' },
  ] as const satisfies readonly Exclude<DomainWorkflowTrigger, { readonly kind: 'event' }>[];

  for (const trigger of internalTriggers) {
    const candidate: DomainWorkflowDefinition = {
      workflowKey: `provenance-${trigger.kind}`,
      initialState: 'pending',
      initialContext: {},
      states: [
        {
          stateKey: 'pending',
          transitions: [
            {
              transitionKey: 'internal-only',
              trigger,
              targetState: 'done',
            },
          ],
        },
        { stateKey: 'done', kind: 'final' },
      ],
    };
    const config = adaptDomainWorkflowToXState(candidate);
    const trustedInternalEvent = createInternalXStateEvent(trigger);
    const machine = createMachine(config as unknown as Parameters<typeof createMachine>[0]);
    const actor = createActor(machine).start();

    actor.send({ type: trustedInternalEvent.type });
    assert.equal(actor.getSnapshot().value, 'pending', `${trigger.kind} accepted a forged ordinary event`);
    assert.throws(
      () => createDomainXStateEvent({ type: trustedInternalEvent.type }),
      /reserved internal event namespace/,
    );

    actor.send(trustedInternalEvent);
    assert.equal(actor.getSnapshot().value, 'done', `${trigger.kind} rejected trusted internal provenance`);
    actor.stop();
  }
});

test('adapter rejects reserved internal namespace and unsafe record keys for ordinary Domain Events', () => {
  for (const eventType of ['@@domain-harness/timer/forged', '__proto__', 'prototype', 'constructor']) {
    assert.throws(
      () =>
        adaptDomainWorkflowToXState({
          ...workflow,
          states: [
            {
              stateKey: 'pending',
              transitions: [
                {
                  transitionKey: 'reserved-event',
                  trigger: { kind: 'event', eventType },
                  targetState: 'approved',
                },
              ],
            },
            { stateKey: 'approved', kind: 'final' },
          ],
        }),
      XStateBoundaryContractError,
    );
  }
});

test('adapter rejects invalid state/guard references before machine execution', () => {
  assert.throws(
    () => adaptDomainWorkflowToXState({ ...workflow, initialState: 'missing' }),
    XStateBoundaryContractError,
  );
  assert.throws(
    () =>
      adaptDomainWorkflowToXState({
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
