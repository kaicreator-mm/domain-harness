import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeEvidenceRecord } from '../../src/contracts/runtime-evidence.js';
import {
  VolatileAdmissionEffectJournal,
  admitCentralDecision,
} from '../../src/admission/index.js';
import {
  assertEvidenceUsableForGovernedEvaluation,
  assertEvidenceUsableForObservation,
} from '../../src/runtime-evidence/index.js';
import {
  BASELINE,
  captureContext,
  isContractError,
  makeCapture,
  turnExecution,
} from './helpers.js';
import {
  admissionFixture,
  makeRequest,
  sha256,
} from '../admission/helpers.js';

test('use gate: V8 — evidence can never claim execution/replay authority', async () => {
  const { capture } = makeCapture();
  const decision = await capture.captureMetric({ name: 'resolver.llmAvoided', value: 1 });

  const forgedAuthority = {
    ...decision,
    executionAuthority: 'committed-effect',
  } as unknown as RuntimeEvidenceRecord;
  assert.throws(
    () =>
      assertEvidenceUsableForObservation(forgedAuthority, {
        target: { domainId: 'orders' },
      }),
    (error: unknown) => isContractError(error, 'RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH'),
  );

  const forgedTruthClass = {
    ...decision,
    truthClass: 'execution-journal',
  } as unknown as RuntimeEvidenceRecord;
  assert.throws(
    () =>
      assertEvidenceUsableForGovernedEvaluation(forgedTruthClass, {
        target: { domainId: 'orders' },
        expectedPackageId: 'pkg-orders-p1',
        expectedGovernanceBaseline: BASELINE,
      }),
    (error: unknown) => isContractError(error, 'RUNTIME_EVIDENCE_NOT_EXECUTION_TRUTH'),
  );
});

test('use gate: V9 — tenant evidence isolation requires an exact external contract', async () => {
  const { capture } = makeCapture(captureContext({ tenantScope: 'tenant-t2' }));
  const record = await capture.captureDecision({
    outcome: {
      status: 'denied',
      denial: {
        reason: 'hard-invariant',
        durableControlTurnId: turnExecution().durableControlTurnId!,
        governanceBindingDigest: 'sha256:binding-1',
        invariantId: 'inv:cap-100',
        resolver: {
          source: 'rule',
          llmAvoided: true,
          freshModelCallCount: 0,
          cacheRead: 'miss',
          telemetryEventCount: 0,
        },
      },
    },
    sourceExecution: turnExecution(),
  });

  assert.throws(
    () =>
      assertEvidenceUsableForObservation(record, {
        target: { domainId: 'orders', tenantScope: 'tenant-t1' },
      }),
    (error: unknown) => isContractError(error, 'RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN'),
    'cross-tenant use without a contract is forbidden',
  );

  assert.throws(
    () =>
      assertEvidenceUsableForObservation(record, {
        target: { domainId: 'orders', tenantScope: 'tenant-t1' },
        externalScopeContract: {
          contractId: 'xt-1',
          source: { domainId: 'orders', tenantScope: 'tenant-t1' },
          target: { domainId: 'orders', tenantScope: 'tenant-t2' },
        },
      }),
    (error: unknown) => isContractError(error, 'RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN'),
    'a contract binding the wrong scope pair does not authorize',
  );

  assert.doesNotThrow(() =>
    assertEvidenceUsableForObservation(record, {
      target: { domainId: 'orders', tenantScope: 'tenant-t1' },
      externalScopeContract: {
        contractId: 'xt-2',
        source: { domainId: 'orders', tenantScope: 'tenant-t2' },
        target: { domainId: 'orders', tenantScope: 'tenant-t1' },
      },
    }),
  );

  assert.throws(
    () =>
      assertEvidenceUsableForObservation(record, {
        target: { domainId: 'payments', tenantScope: 'tenant-t2' },
      }),
    (error: unknown) => isContractError(error, 'RUNTIME_EVIDENCE_CROSS_SCOPE_FORBIDDEN'),
    'cross-domain use without a contract is forbidden',
  );

  assert.doesNotThrow(() =>
    assertEvidenceUsableForObservation(record, {
      target: { domainId: 'orders', tenantScope: 'tenant-t2' },
    }),
  );
});

test('use gate: governance-critical evaluation fails closed without exact provenance', async () => {
  const { capture } = makeCapture();
  const evaluation = await capture.captureEvaluation({
    shadowId: 'shadow-010',
    verdict: { viability: 'promising' },
    experimentalArtifact: {
      subjectArtifact: {
        kind: 'workflow',
        artifactId: 'exp-quote-v7',
        contentDigest: 'sha256:exp-artifact-v7',
      },
      stableFallback: {
        packageId: 'pkg-orders-p1',
        governanceBaselineContentDigest: 'sha256:governance-b1',
        artifact: {
          kind: 'workflow',
          artifactId: 'order-quote',
          contentDigest: 'sha256:stable-quote-v6',
        },
      },
    },
  });

  assert.throws(
    () =>
      assertEvidenceUsableForGovernedEvaluation(evaluation, {
        target: { domainId: 'orders' },
        expectedPackageId: 'pkg-orders-OTHER',
        expectedGovernanceBaseline: BASELINE,
      }),
    (error: unknown) => isContractError(error, 'RUNTIME_EVIDENCE_PROVENANCE_MISMATCH'),
  );

  assert.throws(
    () =>
      assertEvidenceUsableForGovernedEvaluation(evaluation, {
        target: { domainId: 'orders' },
        expectedPackageId: 'pkg-orders-p1',
        expectedGovernanceBaseline: { ...BASELINE, contentDigest: 'sha256:governance-b2' },
      }),
    (error: unknown) => isContractError(error, 'RUNTIME_EVIDENCE_PROVENANCE_MISMATCH'),
  );

  assert.throws(
    () =>
      assertEvidenceUsableForGovernedEvaluation(evaluation, {
        target: { domainId: 'orders' },
        expectedPackageId: 'pkg-orders-p1',
        expectedGovernanceBaseline: BASELINE,
        expectedSubjectArtifact: {
          kind: 'workflow',
          artifactId: 'exp-quote-v8',
          contentDigest: 'sha256:exp-artifact-v8',
        },
      }),
    (error: unknown) => isContractError(error, 'RUNTIME_EVIDENCE_PROVENANCE_MISMATCH'),
  );

  assert.doesNotThrow(() =>
    assertEvidenceUsableForGovernedEvaluation(evaluation, {
      target: { domainId: 'orders' },
      expectedPackageId: 'pkg-orders-p1',
      expectedGovernanceBaseline: BASELINE,
      expectedSubjectArtifact: {
        kind: 'workflow',
        artifactId: 'exp-quote-v7',
        contentDigest: 'sha256:exp-artifact-v7',
      },
    }),
  );
});

test('use gate: derived-ephemeral evidence is rejected where durable-audit is required', async () => {
  const { capture } = makeCapture();
  const metric = await capture.captureMetric({ name: 'resolver.llmAvoided', value: 1 });

  assert.throws(
    () =>
      assertEvidenceUsableForGovernedEvaluation(metric, {
        target: { domainId: 'orders' },
        expectedPackageId: 'pkg-orders-p1',
        expectedGovernanceBaseline: BASELINE,
      }),
    (error: unknown) => isContractError(error, 'RUNTIME_EVIDENCE_DURABILITY_MISMATCH'),
  );

  assert.doesNotThrow(() =>
    assertEvidenceUsableForObservation(metric, { target: { domainId: 'orders' } }),
  );
});

test('use gate: V8 integration — evidence claiming success never suppresses journal-driven retry', async () => {
  const fixture = await admissionFixture();
  const { capture, store } = makeCapture(captureContext({
    domainId: fixture.pin.domainId,
    packageId: fixture.pin.packageId,
    governanceBaseline: fixture.pin.governanceBaseline,
  }));

  const first = await admitCentralDecision(makeRequest(), fixture.ports);
  if (first.status !== 'admitted') assert.fail('expected admitted outcome');
  assert.equal(first.admitted.effects[0]!.disposition, 'executed');
  await capture.captureDecision({
    outcome: first,
    sourceExecution: {
      workflowTarget: fixture.pin.workflowTarget,
      workflowInstanceId: fixture.pin.workflowInstanceId,
      durableControlTurnId: first.admitted.durableControlTurnId,
    },
  });
  assert.equal(store.records().length, 1, 'evidence now claims the effect succeeded');
  assert.equal(fixture.tools.calls.length, 1);

  // Crash: the durable effect journal loses the committed fact; evidence survives.
  const wipedJournal = new VolatileAdmissionEffectJournal();
  const restoredPorts = {
    governance: fixture.coordinator,
    baselines: fixture.baselines,
    sha256,
    effectJournal: wipedJournal,
    effectTools: fixture.tools,
  };
  const replay = await admitCentralDecision(makeRequest(), restoredPorts);
  if (replay.status !== 'admitted') assert.fail('expected admitted replay');

  assert.equal(
    replay.admitted.effects[0]!.disposition,
    'executed',
    'V8: surviving evidence does not prove mutation and does not suppress re-execution',
  );
  assert.equal(fixture.tools.calls.length, 2, 'the effect tool ran again under the restored journal');
  assert.equal(wipedJournal.getRecords().length, 1, 'the restored journal owns the new committed fact');
  assert.equal(store.records().length, 1, 'evidence was never read to gate the retry');
});
