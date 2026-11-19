import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSelectedInteraction,
  InteractionContractError,
} from '../src/interaction/selected-intent.ts';

const makeSelector = () => createSelectedInteraction({
  functions: [
    { id: 'tally.tasks.assessTaskEvidence', implementation: 'rule', effects: 'none' },
    { id: 'downloads.confirmation.describeDownloadPolicy', implementation: 'knowledge', effects: 'none' },
    { id: 'tally.release.projectReleaseReadiness', implementation: 'rule', effects: 'none' },
    { id: 'downloads.acquisition.acquire', implementation: 'external-effect', effects: 'non-idempotent' },
  ],
  routes: [
    { intentId: 'inspectTaskReadiness', functionId: 'tally.tasks.assessTaskEvidence', label: 'Assess task evidence' },
    { intentId: 'review', functionId: 'tally.tasks.assessTaskEvidence', label: 'Review task evidence' },
    { intentId: 'review', functionId: 'tally.release.projectReleaseReadiness', label: 'Review release readiness' },
    { intentId: 'downloadPolicy', functionId: 'downloads.confirmation.describeDownloadPolicy', label: 'Read download policy' },
  ],
});

test('exact alias uniquely resolves a selected no-effect function without invoking it', () => {
  const selector = makeSelector();
  assert.deepEqual(selector.resolveIntent('inspectTaskReadiness'), {
    status: 'SELECTED', intentId: 'inspectTaskReadiness',
    functionId: 'tally.tasks.assessTaskEvidence', attested: false, authority: 'NONE',
  });
  assert.equal(selector.resolveIntent('downloadPolicy').status, 'SELECTED');
  assert.equal(selector.resolveIntent('Review').status, 'NOT_SELECTED');
});

test('ambiguous intent requires an explicit choice from exactly this intent', () => {
  const selector = makeSelector();
  const result = selector.resolveIntent('review');
  assert.equal(result.status, 'NEEDS_CLARIFICATION');
  if (result.status !== 'NEEDS_CLARIFICATION') return;
  assert.equal(result.options.length, 2);
  assert.equal(Object.isFrozen(result.options), true);
  assert.equal(result.authority, 'NONE');
  assert.deepEqual(selector.clarifyIntent('review', 'tally.release.projectReleaseReadiness'), {
    status: 'SELECTED', intentId: 'review',
    functionId: 'tally.release.projectReleaseReadiness', attested: false, authority: 'NONE',
  });
  assert.deepEqual(selector.clarifyIntent('review', 'downloads.confirmation.describeDownloadPolicy'), {
    status: 'NOT_SELECTED', reason: 'UNKNOWN_CHOICE', attested: false, authority: 'NONE',
  });
  assert.equal(selector.clarifyIntent('downloadPolicy', 'downloads.confirmation.describeDownloadPolicy').status, 'NOT_SELECTED');
});

test('unknown or invalid inputs fail closed without echoing untrusted input', () => {
  const selector = makeSelector();
  for (const intentId of ['__proto__', 'constructor', {}, [], '', null, 'unknown']) {
    assert.equal(selector.resolveIntent(intentId).status, 'NOT_SELECTED');
  }
  assert.deepEqual(selector.clarifyIntent('review', '__proto__'), {
    status: 'NOT_SELECTED', reason: 'INVALID_CHOICE', attested: false, authority: 'NONE',
  });
  assert.equal(selector.clarifyIntent('missing', 'tally.tasks.assessTaskEvidence').status, 'NOT_SELECTED');
  assert.equal(selector.clarifyIntent('review', 'downloads.acquisition.acquire').status, 'NOT_SELECTED');
});

test('config forbids effectful or forged external-effect none candidate', () => {
  for (const fn of [
    { id: 'downloads.acquisition.acquire', implementation: 'external-effect', effects: 'non-idempotent' },
    { id: 'downloads.acquisition.acquire', implementation: 'external-effect', effects: 'none' },
  ] as const) {
    assert.throws(() => createSelectedInteraction({
      functions: [fn],
      routes: [{ intentId: 'acquire', functionId: fn.id, label: 'Acquire' }],
    }), (error) => error instanceof InteractionContractError);
  }
});

test('invalid routes, aliases, duplicate ids and extra fields are rejected at construction', () => {
  const fn = { id: 'tally.tasks.assessTaskEvidence', implementation: 'rule', effects: 'none' } as const;
  assert.throws(() => createSelectedInteraction({ functions: [], routes: [] }), InteractionContractError);
  assert.throws(() => createSelectedInteraction({
    functions: [fn, fn],
    routes: [{ intentId: 'review', functionId: fn.id, label: 'Review' }],
  }), InteractionContractError);
  assert.throws(() => createSelectedInteraction({
    functions: [fn],
    routes: [{ intentId: 'constructor', functionId: fn.id, label: 'Bad' }],
  }), InteractionContractError);
  assert.throws(() => createSelectedInteraction({
    functions: [fn],
    routes: [{ intentId: 'review', functionId: 'missing.function', label: 'Unknown' }],
  }), InteractionContractError);
  assert.throws(() => createSelectedInteraction({
    functions: [fn],
    routes: [
      { intentId: 'review', functionId: fn.id, label: 'A' },
      { intentId: 'review', functionId: fn.id, label: 'B' },
    ],
  }), InteractionContractError);
  assert.throws(() => createSelectedInteraction({
    functions: [fn],
    routes: [{ intentId: 'review', functionId: fn.id, label: 'Review', permit: true }],
  } as never), InteractionContractError);
});

test('snapshot does not track later mutations of the submitted routes', () => {
  const functions = [{ id: 'tally.tasks.assessTaskEvidence', implementation: 'rule', effects: 'none' }] as const;
  const routes = [{ intentId: 'review', functionId: 'tally.tasks.assessTaskEvidence', label: 'Review' }];
  const selector = createSelectedInteraction({ functions, routes });
  routes[0].functionId = 'downloads.acquisition.acquire';
  assert.equal(selector.resolveIntent('review').status, 'SELECTED');
});
