import assert from 'node:assert/strict';
import test from 'node:test';
import type { PromotionActivationAuditRecord } from '../../src/promotion-activation/index.js';
import type { RuntimeEvidencePort } from '../../src/contracts/runtime-evidence.js';
import {
  captureContext,
  isContractError,
  isIntegrationError,
  makeCapture,
  turnExecution,
} from './helpers.js';
import {
  admissionFixture,
  makeRequest,
  quoteEvent,
} from '../admission/helpers.js';
import { admitCentralDecision } from '../../src/admission/index.js';

const AUDIT: PromotionActivationAuditRecord = {
  auditId: 'audit-001',
  actionId: 'action-001',
  action: 'promote',
  actor: { kind: 'human-operator', actorId: 'actor-7', operatorId: 'op-7' },
  recordedAt: '2026-09-21T08:00:00.000Z',
  artifact: {
    kind: 'promoted-subworkflow',
    artifactId: 'quote-preparer',
    contentDigest: 'sha256:promoted-artifact-1',
  },
  candidate: {
    candidateKind: 'workflow',
    candidateId: 'cand-001',
    candidateContentDigest: 'sha256:candidate-1',
    validatorContractVersion: 'candidate-validator-v1',
    governanceBaseline: {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      contentDigest: 'sha256:governance-b1',
    },
  },
  package: {
    domainId: 'orders',
    packageId: 'pkg-orders-p1',
    domainIntelligenceContentDigest: 'cdi-orders-p1',
  },
  governance: {
    preChangeBaseline: {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      contentDigest: 'sha256:governance-b1',
    },
    targetBaseline: {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      contentDigest: 'sha256:governance-b1',
    },
    evaluatedUnder: {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      contentDigest: 'sha256:governance-b1',
    },
  },
  evaluationId: 'eval-001',
  artifactVersion: '3',
};

test('capture: admitted admission outcome becomes decision evidence with exact provenance', async () => {
  const fixture = await admissionFixture();
  const outcome = await admitCentralDecision(makeRequest(), fixture.ports);
  if (outcome.status !== 'admitted') assert.fail('expected admitted outcome');
  const { capture, store } = makeCapture(captureContext({
    domainId: fixture.pin.domainId,
    packageId: fixture.pin.packageId,
    governanceBaseline: fixture.pin.governanceBaseline,
  }));

  const producerArtifact = {
    kind: 'promoted-subworkflow',
    artifactId: 'quote-preparer',
    contentDigest: 'sha256:promoted-artifact-1',
  };
  const record = await capture.captureDecision({
    outcome,
    sourceExecution: {
      workflowTarget: fixture.pin.workflowTarget,
      workflowInstanceId: fixture.pin.workflowInstanceId,
      durableControlTurnId: outcome.admitted.durableControlTurnId,
    },
    producerArtifact,
  });

  assert.equal(store.records().length, 1);
  assert.equal(record.truthClass, 'runtime-evidence');
  assert.equal(record.executionAuthority, 'none');
  assert.equal(record.sourceKind, 'decision');
  assert.equal(record.durability, 'durable-audit');
  assert.ok(record.evidenceId.startsWith('ev:orders:decision:'));
  assert.equal(record.provenance.packageId, fixture.pin.packageId);
  assert.deepEqual(record.provenance.governanceBaseline, fixture.pin.governanceBaseline);
  assert.equal(
    record.provenance.sourceExecution?.durableControlTurnId,
    outcome.admitted.durableControlTurnId,
  );
  assert.deepEqual(record.provenance.producerArtifact, producerArtifact);
  assert.deepEqual(record.payload, {
    status: 'admitted',
    transitionKey: outcome.admitted.transitionKey,
    targetState: outcome.admitted.targetState,
    effectCount: 1,
    resolver: 'harness-machine',
  });
});

test('capture: denied admission outcome records reason and invariant detail', async () => {
  const fixture = await admissionFixture();
  const outcome = await admitCentralDecision(makeRequest({ event: quoteEvent(5000) }), fixture.ports);
  if (outcome.status !== 'denied') assert.fail('expected denied outcome');
  const { capture, store } = makeCapture(captureContext({
    domainId: fixture.pin.domainId,
    packageId: fixture.pin.packageId,
    governanceBaseline: fixture.pin.governanceBaseline,
  }));

  const record = await capture.captureDecision({
    outcome,
    sourceExecution: {
      workflowTarget: fixture.pin.workflowTarget,
      workflowInstanceId: fixture.pin.workflowInstanceId,
      durableControlTurnId: outcome.denial.durableControlTurnId,
    },
  });

  assert.equal(store.records().length, 1);
  assert.deepEqual(record.payload, {
    status: 'denied',
    reason: 'hard-invariant',
    invariantId: 'inv:cap-100',
    resolver: 'harness-machine',
  });
});

test('capture: failure, fallback, metric and operator override records keep their kinds and durability classes', async () => {
  const { capture, store } = makeCapture();

  const failure = await capture.captureFailure({
    code: 'ADMISSION_EFFECT_FAILED',
    message: 'tool exploded',
    sourceExecution: turnExecution(),
  });
  assert.equal(failure.sourceKind, 'workflow-failure');
  assert.equal(failure.durability, 'durable-audit');
  assert.deepEqual(failure.payload, { code: 'ADMISSION_EFFECT_FAILED', message: 'tool exploded' });

  const fallback = await capture.captureFallback({
    reason: 'promoted artifact revoked; fell through to harness',
    sourceExecution: turnExecution(),
    subjectArtifact: {
      kind: 'promoted-subworkflow',
      artifactId: 'quote-preparer',
      contentDigest: 'sha256:promoted-artifact-1',
    },
  });
  assert.equal(fallback.sourceKind, 'fallback');
  assert.equal(fallback.durability, 'durable-audit');
  assert.deepEqual(fallback.subjectArtifact, {
    kind: 'promoted-subworkflow',
    artifactId: 'quote-preparer',
    contentDigest: 'sha256:promoted-artifact-1',
  });

  const override = await capture.captureOperatorOverride({
    actionId: 'manual-intervention-9',
    actor: { kind: 'human-operator', actorId: 'actor-9', operatorId: 'op-9' },
    detail: { kind: 'manual-state-review', note: 'operator paused the instance' },
    sourceExecution: turnExecution(),
  });
  assert.equal(override.sourceKind, 'human-override');
  assert.equal(override.durability, 'durable-audit');
  assert.deepEqual(override.payload, {
    actor: { kind: 'human-operator', actorId: 'actor-9', operatorId: 'op-9' },
    detail: { kind: 'manual-state-review', note: 'operator paused the instance' },
  });

  const metric = await capture.captureMetric({
    name: 'resolver.llmAvoided',
    value: 1,
    sourceExecution: turnExecution(),
  });
  assert.equal(metric.sourceKind, 'metric');
  assert.equal(metric.durability, 'derived-ephemeral');
  assert.deepEqual(metric.payload, { name: 'resolver.llmAvoided', value: 1 });

  assert.equal(store.records().length, 4);
});

test('capture: T-015 authority audit record maps to human-override evidence', async () => {
  const { capture, store } = makeCapture();

  const record = await capture.captureHumanOverride({ audit: AUDIT });

  assert.equal(record.sourceKind, 'human-override');
  assert.ok(record.evidenceId.startsWith('ev:orders:human-override:'));
  assert.deepEqual(record.subjectArtifact, {
    kind: 'promoted-subworkflow',
    artifactId: 'quote-preparer',
    contentDigest: 'sha256:promoted-artifact-1',
  });
  assert.deepEqual(record.payload, {
    actor: { kind: 'human-operator', actorId: 'actor-7', operatorId: 'op-7' },
    detail: {
      action: 'promote',
      auditId: 'audit-001',
      recordedAt: '2026-09-21T08:00:00.000Z',
      artifactVersion: '3',
    },
  });
  assert.equal(store.records().length, 1);
});

test('capture: evidence ids are deterministic and the volatile store is append-only', async () => {
  const { capture, store } = makeCapture();

  const first = await capture.captureMetric({ name: 'resolver.llmAvoided', value: 1 });
  const replay = await capture.captureMetric({ name: 'resolver.llmAvoided', value: 1 });
  assert.equal(first.evidenceId, replay.evidenceId);
  assert.equal(store.records().length, 1, 'byte-identical re-append is idempotent');

  await assert.rejects(
    () => capture.captureMetric({ name: 'resolver.llmAvoided', value: 2 }),
    (error: unknown) => isIntegrationError(error, 'RUNTIME_EVIDENCE_APPEND_CONFLICT'),
  );
  assert.equal(store.records().length, 1, 'conflicting append fails closed without mutation');
});

test('capture: mismatched context domain/baseline provenance fails closed before append', async () => {
  const { capture, store } = makeCapture(captureContext({
    governanceBaseline: {
      domainId: 'payments',
      governanceId: 'payments-governance',
      schemaVersion: '1',
      contentDigest: 'sha256:governance-x1',
    },
  }));

  await assert.rejects(
    () => capture.captureMetric({ name: 'resolver.llmAvoided', value: 1 }),
    (error: unknown) => isContractError(error, 'RUNTIME_EVIDENCE_PROVENANCE_MISMATCH'),
  );
  assert.equal(store.records().length, 0, 'invalid evidence never reaches the port');
});

test('capture: the runtime-facing port stays write-only', () => {
  const { capture, store } = makeCapture();
  const port: RuntimeEvidencePort = store;
  assert.equal(typeof port.append, 'function');
  assert.ok(!('read' in port), 'the port contract exposes no read channel');
  assert.ok(!('records' in (capture as unknown as Record<string, unknown>)), 'capture exposes no evidence read-back');
});
