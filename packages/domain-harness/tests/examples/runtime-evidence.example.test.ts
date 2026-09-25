// T-025 example 4 — Runtime Evidence capture.
//
// Runtime Evidence is provenance/evaluation material captured at decision,
// failure, fallback, override and evaluation points. This example shows the
// frozen separations:
//
//   - records carry exact provenance (package pin + Governance Baseline pin +
//      tenant scope) and a durability class (`durable-audit` vs
//      `derived-ephemeral`);
//   - the evidence port is write-only and append-once: identical re-append is
//      idempotent, conflicting re-append fails closed;
//   - evidence is NEVER replay truth: an evidence record referencing an
//      execution slot does not suppress the durable journal's begin for that
//      slot — only the committed-work journals own replay;
//   - shadow/L4 evaluation evidence is captured without any authoritative
//      transition or mutation.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RuntimeEvidenceCapture,
  RuntimeEvidenceIntegrationError,
  VolatileAdmissionEffectJournal,
  VolatileRuntimeEvidenceStore,
  type AdmissionEffectJournalRecord,
  type RuntimeEvidenceGovernanceBaselineRef,
} from '@kaicreator/domain-harness';

const governanceBaseline: RuntimeEvidenceGovernanceBaselineRef = {
  domainId: 'orders',
  governanceId: 'orders-governance',
  schemaVersion: '1',
  contentDigest: 'governance-content-b1',
};

function evidenceStack(tenantScope = 'tenant:acme') {
  const store = new VolatileRuntimeEvidenceStore();
  const capture = new RuntimeEvidenceCapture(
    {
      domainId: 'orders',
      tenantScope,
      packageId: 'pkg-orders-b1',
      governanceBaseline,
    },
    store,
  );
  return { capture, store };
}

const sourceExecution = {
  workflowTarget: 'order-quote',
  workflowInstanceId: 'order-quote:instance:42',
  durableControlTurnId: 'turn:order-quote:instance%3A42:message:msg%3A1',
} as const;

test('example: decision evidence carries exact provenance and a durability class', async () => {
  const { capture, store } = evidenceStack();

  const admitted = await capture.captureDecision({
    outcome: {
      status: 'admitted',
      admitted: {
        transitionKey: 'approve',
        targetState: 'approved',
        durableControlTurnId: sourceExecution.durableControlTurnId,
        resolver: { source: 'harness-machine' },
        effects: [{ disposition: 'executed' }],
      },
    } as unknown as Parameters<typeof capture.captureDecision>[0]['outcome'],
    sourceExecution,
  });
  assert.equal(admitted.sourceKind, 'decision');
  assert.equal(admitted.durability, 'durable-audit');
  assert.equal(admitted.domainId, 'orders');
  assert.equal(admitted.tenantScope, 'tenant:acme');
  assert.equal(admitted.provenance.packageId, 'pkg-orders-b1');
  assert.deepEqual(admitted.provenance.governanceBaseline, governanceBaseline);
  assert.equal(
    admitted.provenance.sourceExecution?.durableControlTurnId,
    sourceExecution.durableControlTurnId,
  );

  const denied = await capture.captureDecision({
    outcome: {
      status: 'denied',
      denial: {
        reason: 'hard-invariant',
        invariantId: 'inv:cap-100',
        resolver: { source: 'harness-machine' },
      },
    } as unknown as Parameters<typeof capture.captureDecision>[0]['outcome'],
    sourceExecution: { ...sourceExecution, durableControlTurnId: 'turn:2' },
    sequence: 2,
  });
  assert.deepEqual(denied.payload, {
    status: 'denied',
    reason: 'hard-invariant',
    invariantId: 'inv:cap-100',
    resolver: 'harness-machine',
  });

  assert.equal(store.records().length, 2);
});

test('example: failure, fallback, override, evaluation and metric integration points', async () => {
  const { capture, store } = evidenceStack();

  const failure = await capture.captureFailure({
    code: 'ADMISSION_EFFECT_TOOL_UNBOUND',
    message: 'no host tool is bound for effect:unbound',
    sourceExecution,
  });
  assert.equal(failure.sourceKind, 'workflow-failure');
  assert.equal(failure.durability, 'durable-audit');

  const fallback = await capture.captureFallback({
    reason: 'resolver fell through to the bounded reasoning path',
    sourceExecution: { ...sourceExecution, durableControlTurnId: 'turn:3' },
  });
  assert.equal(fallback.sourceKind, 'fallback');

  const override = await capture.captureOperatorOverride({
    actionId: 'operator-override:rollback:1',
    actor: { kind: 'human-operator', actorId: 'user:42', operatorId: 'operator:on-call' },
    detail: { action: 'manual-quote-reopen', reason: 'customer escalation' },
  });
  assert.equal(override.sourceKind, 'human-override');

  // Shadow/L4 reference path: evidence only — no authoritative transition,
  // no durable effect, exactly identified experimental + stable fallback pair.
  const evaluation = await capture.captureEvaluation({
    shadowId: 'shadow:l4:quote-strategy:1',
    verdict: { score: 0.91, wouldAdmit: true },
    experimentalArtifact: {
      subjectArtifact: { kind: 'rule', artifactId: 'quote-strategy-x', contentDigest: 'exp-digest' },
      stableFallback: {
        packageId: 'pkg-orders-b1',
        governanceBaselineContentDigest: governanceBaseline.contentDigest,
        artifact: { kind: 'rule', artifactId: 'quote-strategy', contentDigest: 'stable-digest' },
      },
    },
  });
  assert.equal(evaluation.sourceKind, 'evaluation');

  const metric = await capture.captureMetric({
    name: 'llm-avoidance-window',
    value: { resolvedWithoutModel: 5, modelRequired: 3 },
  });
  assert.equal(metric.sourceKind, 'metric');
  assert.equal(metric.durability, 'derived-ephemeral', 'metric loss must not change correctness');

  assert.equal(store.records().length, 5);
});

test('example: the evidence port is append-once — idempotent replay, fail-closed conflict', async () => {
  const { capture, store } = evidenceStack();
  const record = await capture.captureMetric({ name: 'boot', value: { ok: true } });

  // Byte-identical re-append is a no-op (crash/retry safe).
  await store.append(record);
  assert.equal(store.records().length, 1);

  // Same identity, different content: conflict, never a silent rewrite.
  await assert.rejects(
    () => store.append({ ...record, payload: { ok: false } }),
    (error: unknown) =>
      error instanceof RuntimeEvidenceIntegrationError
      && error.code === 'RUNTIME_EVIDENCE_APPEND_CONFLICT',
  );
});

test('example: evidence referencing an effect slot never replays or suppresses the durable journal', async () => {
  const { capture } = evidenceStack();

  // Evidence may REFERENCE execution facts...
  await capture.captureDecision({
    outcome: {
      status: 'admitted',
      admitted: {
        transitionKey: 'approve',
        targetState: 'approved',
        durableControlTurnId: sourceExecution.durableControlTurnId,
        resolver: { source: 'harness-machine' },
        effects: [{ disposition: 'executed' }],
      },
    } as unknown as Parameters<typeof capture.captureDecision>[0]['outcome'],
    sourceExecution: { ...sourceExecution, executionFactRefs: ['effect:reserve:1'] },
  });

  // ...but only the committed-work journal decides whether work committed.
  // A fresh journal that has never seen the effect still begins it as
  // 'created': evidence presence changed nothing (A1 V8).
  const journal = new VolatileAdmissionEffectJournal();
  const begin: AdmissionEffectJournalRecord = {
    effectId: 'effect:reserve:1',
    target: { workflowId: 'order-quote', instanceKey: 'instance:42' },
    durableControlTurnId: sourceExecution.durableControlTurnId,
    operationOrdinal: 1,
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    status: 'started',
    attempt: 1,
    input: { reservation: 'quote', amount: 42 },
    idempotencyKey: 'reserve:quote:1',
    startedAt: '2026-09-22T00:00:00.000Z',
  };
  const first = await journal.beginEffect(begin);
  assert.equal(first.disposition, 'created', 'evidence can never stand in for the journal');

  const again = await journal.beginEffect(begin);
  assert.equal(again.disposition, 'existing', 'the journal alone owns replay identity');
});

test('example: every record declares truthClass/executionAuthority; tenant scope travels with the record', async () => {
  const acme = evidenceStack('tenant:acme');
  const globex = evidenceStack('tenant:globex');

  const left = await acme.capture.captureMetric({ name: 'window', value: 1 });
  const right = await globex.capture.captureMetric({ name: 'window', value: 1 });

  // Every record is marked non-authoritative: evidence can never gate execution.
  for (const record of [left, right]) {
    assert.equal(record.truthClass, 'runtime-evidence');
    assert.equal(record.executionAuthority, 'none');
  }
  assert.equal(left.tenantScope, 'tenant:acme');
  assert.equal(right.tenantScope, 'tenant:globex');

  // The evidenceId is scoped by domain/kind/discriminator, not by tenant:
  // tenant isolation is enforced at the store/use-gate seam, never by making
  // ids unique. If two scopes ever share one physical store, the cross-scope
  // rewrite conflicts fail closed instead of overwriting (the host-level V9
  // behavior proven in the T-024 cross-host evidence).
  await acme.store.append(left);
  await assert.rejects(
    () => acme.store.append({ ...right, payload: { value: 2 } }),
    (error: unknown) =>
      error instanceof RuntimeEvidenceIntegrationError
      && error.code === 'RUNTIME_EVIDENCE_APPEND_CONFLICT',
  );
});
