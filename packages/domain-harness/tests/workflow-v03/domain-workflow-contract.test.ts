import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { DomainWorkflowDefinition } from '../../src/workflow/index.js';

test('public Domain Workflow contract covers engine-neutral business semantics', () => {
  const workflow = {
    workflowKey: 'claim-review',
    initialState: 'reviewing',
    initialContext: { threshold: 10 },
    guards: [
      {
        guardId: 'amount-ok',
        predicate: {
          op: 'lte',
          left: { source: 'event', path: ['payload', 'amount'] },
          right: { source: 'context', path: ['threshold'] },
        },
      },
    ],
    states: [
      {
        stateKey: 'reviewing',
        kind: 'active',
        invocations: [
          {
            invocationKey: 'risk-check',
            operationKey: 'risk.evaluate',
            input: { claimId: 'claim-1' },
            onDoneEvent: 'RISK_READY',
            onFailureEvent: 'RISK_FAILED',
          },
        ],
        waits: [{ waitKey: 'operator-review', resumeEvent: 'REVIEW_RESUMED' }],
        timers: [{ timerKey: 'reminder', eventType: 'REMINDER_DUE', delayMs: 1_000 }],
        deadlines: [{ deadlineKey: 'sla', eventType: 'SLA_EXPIRED', at: '2030-01-01T00:00:00Z' }],
        callbacks: [{ callbackKey: 'provider', eventType: 'PROVIDER_CALLBACK' }],
        failures: [{ failureKey: 'risk-failed', code: 'risk_failed', recoverable: true }],
        recoveries: [{ recoveryKey: 'retry-risk', eventType: 'RETRY_RISK', targetState: 'reviewing' }],
        transitions: [
          {
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'APPROVE' },
            targetState: 'approved',
            guardId: 'amount-ok',
            effectIntents: [
              {
                effectType: 'claim.approved',
                input: { claimId: 'claim-1' },
                idempotencyKey: 'claim-1:approved',
              },
            ],
          },
        ],
      },
      { stateKey: 'approved', kind: 'final' },
    ],
  } satisfies DomainWorkflowDefinition;

  assert.equal(workflow.workflowKey, 'claim-review');
  assert.equal(workflow.states[0]?.transitions?.[0]?.effectIntents?.[0]?.effectType, 'claim.approved');
});

test('public Workflow surface does not expose selected-engine product identity', async () => {
  const files = ['index.ts', 'contract.ts', 'predicate.ts'];
  const publicSource = (
    await Promise.all(
      files.map((file) => readFile(new URL(`../../src/workflow/${file}`, import.meta.url), 'utf8')),
    )
  ).join('\n');

  for (const forbidden of ['xstate', 'ActorRef', 'StateNode', 'SerializedSnapshot']) {
    assert.equal(publicSource.includes(forbidden), false, `${forbidden} leaked into the public Workflow surface`);
  }

  const packageJson = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { exports?: Record<string, unknown> };
  assert.ok(packageJson.exports?.['./workflow']);
  assert.equal(packageJson.exports?.['./workflow/internal/xstate-adapter'], undefined);
});
