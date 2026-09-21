import assert from 'node:assert/strict';
import test from 'node:test';
import type { DomainWorkflowEffectIntent } from '../../src/workflow/index.js';
import { requestExperimentalRollback } from '../../src/runtime-evidence/index.js';
import {
  EXPERIMENTAL,
  captureContext,
  isIntegrationError,
  makeCapture,
  turnExecution,
} from './helpers.js';
import {
  admissionFixture,
  makeDefinition,
  makeRequest,
} from '../admission/helpers.js';
import { admitCentralDecision } from '../../src/admission/index.js';

const OPERATOR = { kind: 'human-operator', actorId: 'actor-1', operatorId: 'op-1' } as const;

const COMPENSATE_INTENT: DomainWorkflowEffectIntent = {
  effectType: 'effect:compensate',
  input: { reservation: 'quote', amount: 42, action: 'release' },
  idempotencyKey: 'compensate:quote:1',
};

test('rollback: validates the exact fallback and emits fallback + human-override evidence only', async () => {
  const { capture, store } = makeCapture();
  const outcome = await requestExperimentalRollback(
    {
      experimentalArtifact: EXPERIMENTAL,
      operator: OPERATOR,
      reason: 'experiment regressed quote quality',
      sourceExecution: turnExecution(),
    },
    { capture },
  );

  assert.deepEqual(Object.keys(outcome).sort(), ['evidence', 'stableFallback']);
  assert.deepEqual(outcome.stableFallback, EXPERIMENTAL.stableFallback);
  assert.equal(outcome.evidence.length, 2);
  assert.deepEqual(
    outcome.evidence.map((record) => record.sourceKind),
    ['fallback', 'human-override'],
  );
  const [fallback, override] = outcome.evidence;
  assert.deepEqual(fallback!.subjectArtifact, EXPERIMENTAL.subjectArtifact);
  assert.deepEqual(fallback!.payload, {
    reason: 'experimental rollback: experiment regressed quote quality',
  });
  assert.deepEqual(override!.subjectArtifact, EXPERIMENTAL.subjectArtifact);
  assert.deepEqual(override!.payload, {
    actor: OPERATOR,
    detail: {
      kind: 'experimental-rollback',
      reason: 'experiment regressed quote quality',
      stableFallback: EXPERIMENTAL.stableFallback,
    },
  });
  assert.equal(store.records().length, 2);
});

test('rollback: floating fallback aliases and malformed requests fail closed', async () => {
  const floating = {
    ...EXPERIMENTAL,
    stableFallback: { ...EXPERIMENTAL.stableFallback, packageId: 'current stable' },
  };
  const { capture, store } = makeCapture();
  await assert.rejects(
    () =>
      requestExperimentalRollback(
        { experimentalArtifact: floating, operator: OPERATOR, reason: 'regression' },
        { capture },
      ),
    (error: unknown) => isIntegrationError(error, 'RUNTIME_EVIDENCE_FLOATING_FALLBACK'),
  );

  await assert.rejects(
    () =>
      requestExperimentalRollback(
        { experimentalArtifact: EXPERIMENTAL, operator: OPERATOR, reason: ' ' },
        { capture },
      ),
    (error: unknown) => isIntegrationError(error, 'INVALID_RUNTIME_EVIDENCE_INTEGRATION'),
  );

  await assert.rejects(
    () =>
      requestExperimentalRollback(
        {
          experimentalArtifact: EXPERIMENTAL,
          operator: { kind: 'llm', actorId: 'actor-1', operatorId: 'op-1' } as never,
          reason: 'autonomous rollback attempt',
        },
        { capture },
      ),
    (error: unknown) => isIntegrationError(error, 'INVALID_RUNTIME_EVIDENCE_INTEGRATION'),
  );
  assert.equal(store.records().length, 0);
});

test('rollback: never undoes committed effects — compensation stays an explicit durable admission action', async () => {
  const fixture = await admissionFixture({
    bindings: { 'effect:reserve': 'non-idempotent', 'effect:compensate': 'non-idempotent' },
  });
  const { capture, store } = makeCapture(captureContext({
    domainId: fixture.pin.domainId,
    packageId: fixture.pin.packageId,
    governanceBaseline: fixture.pin.governanceBaseline,
  }));

  const first = await admitCentralDecision(makeRequest(), fixture.ports);
  if (first.status !== 'admitted') assert.fail('expected admitted outcome');
  assert.equal(first.admitted.effects.length, 1);
  assert.equal(first.admitted.effects[0]!.disposition, 'executed');
  const journalBefore = fixture.journal.getRecords().length;
  const toolsBefore = fixture.tools.calls.length;

  const rollback = await requestExperimentalRollback(
    {
      experimentalArtifact: EXPERIMENTAL,
      operator: OPERATOR,
      reason: 'experiment regressed quote quality',
    },
    { capture },
  );
  assert.equal(rollback.evidence.length, 2);
  assert.equal(fixture.journal.getRecords().length, journalBefore, 'rollback touched no effect record');
  assert.equal(fixture.tools.calls.length, toolsBefore, 'rollback invoked no tool');

  const compensation = await admitCentralDecision(
    makeRequest({
      turn: { kind: 'message', sourceMessageId: 'msg:2' },
      definition: makeDefinition({ approveEffects: [COMPENSATE_INTENT] }),
    }),
    fixture.ports,
  );
  if (compensation.status !== 'admitted') assert.fail('expected admitted compensation');
  assert.equal(compensation.admitted.effects.length, 1);
  assert.equal(compensation.admitted.effects[0]!.effectType, 'effect:compensate');
  assert.equal(compensation.admitted.effects[0]!.disposition, 'executed');

  const records = fixture.journal.getRecords();
  assert.equal(records.length, journalBefore + 1, 'compensation is a new durable effect record');
  const reserve = records.find((record) => record.effectType === 'effect:reserve');
  assert.equal(reserve?.status, 'completed', 'the original committed effect stands untouched');
  assert.equal(store.records().length, 2, 'rollback evidence remains audit material only');
});
