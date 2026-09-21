import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  runShadowEvaluation,
  type ShadowEvaluatorPort,
} from '../../src/runtime-evidence/index.js';
import {
  EXPERIMENTAL,
  captureContext,
  isIntegrationError,
  makeCapture,
  turnExecution,
} from './helpers.js';
import { admissionFixture, makeRequest } from '../admission/helpers.js';
import { admitCentralDecision } from '../../src/admission/index.js';

function evaluator(result: {
  readonly verdict: JsonValue;
  readonly counterexamples?: readonly JsonValue[];
  readonly metrics?: Readonly<Record<string, JsonValue>>;
}): ShadowEvaluatorPort {
  return { evaluate: async () => result };
}

test('shadow: evaluation emits only Runtime Evidence through the single evidence channel', async () => {
  const { capture, store } = makeCapture();
  const outcome = await runShadowEvaluation(
    {
      shadowId: 'shadow-001',
      experimentalArtifact: EXPERIMENTAL,
      input: { quote: 42 },
      sourceExecution: turnExecution(),
    },
    {
      capture,
      evaluator: evaluator({
        verdict: { viability: 'promising' },
        counterexamples: [{ case: 'amount-overflow' }, { case: 'currency-mismatch' }],
        metrics: { agreement: 0.91, coverage: 0.5 },
      }),
    },
  );

  assert.deepEqual(Object.keys(outcome), ['evidence'], 'V10: the shadow outcome has no transition/effect channel');
  assert.equal(outcome.evidence.length, 5);
  assert.deepEqual(
    outcome.evidence.map((record) => record.sourceKind),
    ['evaluation', 'counterexample', 'counterexample', 'metric', 'metric'],
  );
  assert.deepEqual(
    outcome.evidence.map((record) => record.durability),
    ['durable-audit', 'durable-audit', 'durable-audit', 'derived-ephemeral', 'derived-ephemeral'],
  );
  const evaluation = outcome.evidence[0]!;
  assert.deepEqual(evaluation.subjectArtifact, EXPERIMENTAL.subjectArtifact);
  assert.deepEqual(evaluation.payload, {
    verdict: { viability: 'promising' },
    stableFallback: {
      packageId: 'pkg-orders-p1',
      governanceBaselineContentDigest: 'sha256:governance-b1',
      artifact: {
        kind: 'workflow',
        artifactId: 'order-quote',
        contentDigest: 'sha256:stable-quote-v6',
      },
    },
  });
  assert.equal(evaluation.provenance.sourceExecution?.durableControlTurnId, turnExecution().durableControlTurnId);
  assert.equal(new Set(outcome.evidence.map((record) => record.evidenceId)).size, 5);
  assert.equal(store.records().length, 5);
});

test('shadow: V10 — the shadow path cannot mutate the running parent workflow', async () => {
  const fixture = await admissionFixture();
  const { capture, store } = makeCapture(captureContext({
    domainId: fixture.pin.domainId,
    packageId: fixture.pin.packageId,
    governanceBaseline: fixture.pin.governanceBaseline,
  }));

  await runShadowEvaluation(
    { shadowId: 'shadow-002', experimentalArtifact: EXPERIMENTAL, input: { quote: 7 } },
    { capture, evaluator: evaluator({ verdict: { viability: 'unclear' } }) },
  );

  assert.equal(fixture.durableStore.snapshotCount(), 0, 'shadow wrote no control snapshot');
  assert.equal(fixture.journal.getRecords().length, 0, 'shadow recorded no durable effect');
  assert.equal(fixture.tools.calls.length, 0, 'shadow invoked no effect tool');
  assert.ok(store.records().length > 0, 'shadow still produced evidence');

  const parent = await admitCentralDecision(makeRequest(), fixture.ports);
  assert.equal(parent.status, 'admitted', 'the parent runtime path is unaffected by shadow evidence');
});

test('shadow: evaluator failure fails closed with failure evidence and no success evidence', async () => {
  const { capture, store } = makeCapture();
  const exploding: ShadowEvaluatorPort = {
    evaluate: async () => {
      throw new Error('evaluator blew up');
    },
  };

  await assert.rejects(
    () =>
      runShadowEvaluation(
        { shadowId: 'shadow-003', experimentalArtifact: EXPERIMENTAL, input: null },
        { capture, evaluator: exploding },
      ),
    (error: unknown) => isIntegrationError(error, 'RUNTIME_EVIDENCE_SHADOW_FAILED'),
  );

  const records = store.records();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.sourceKind, 'workflow-failure');
  assert.deepEqual(records[0]!.payload, {
    code: 'RUNTIME_EVIDENCE_SHADOW_FAILED',
    message: 'evaluator blew up',
  });
});

test('shadow: V11 — floating fallback aliases are rejected before any evaluation', async () => {
  const floating: ReadonlyArray<{
    readonly label: string;
    readonly mutate: (base: typeof EXPERIMENTAL) => typeof EXPERIMENTAL;
  }> = [
    {
      label: 'packageId latest',
      mutate: (base) => ({
        ...base,
        stableFallback: { ...base.stableFallback, packageId: 'latest' },
      }),
    },
    {
      label: 'packageId LATEST with whitespace',
      mutate: (base) => ({
        ...base,
        stableFallback: { ...base.stableFallback, packageId: ' LATEST ' },
      }),
    },
    {
      label: 'artifactId active',
      mutate: (base) => ({
        ...base,
        stableFallback: {
          ...base.stableFallback,
          artifact: { ...base.stableFallback.artifact, artifactId: 'active' },
        },
      }),
    },
    {
      label: 'artifact contentDigest current stable',
      mutate: (base) => ({
        ...base,
        stableFallback: {
          ...base.stableFallback,
          artifact: { ...base.stableFallback.artifact, contentDigest: 'current stable' },
        },
      }),
    },
    {
      label: 'governance digest nearest compatible',
      mutate: (base) => ({
        ...base,
        stableFallback: {
          ...base.stableFallback,
          governanceBaselineContentDigest: 'Nearest Compatible',
        },
      }),
    },
  ];

  for (const { label, mutate } of floating) {
    const { capture, store } = makeCapture();
    await assert.rejects(
      () =>
        runShadowEvaluation(
          { shadowId: 'shadow-004', experimentalArtifact: mutate(EXPERIMENTAL), input: null },
          { capture, evaluator: evaluator({ verdict: null }) },
        ),
      (error: unknown) => isIntegrationError(error, 'RUNTIME_EVIDENCE_FLOATING_FALLBACK'),
      label,
    );
    assert.equal(store.records().length, 0, `${label}: no evidence escapes a rejected representation`);
  }
});

test('shadow: V11 — the exact stable fallback triple is accepted and recorded verbatim', async () => {
  const { capture } = makeCapture();
  const outcome = await runShadowEvaluation(
    { shadowId: 'shadow-005', experimentalArtifact: EXPERIMENTAL, input: null },
    { capture, evaluator: evaluator({ verdict: { viability: 'promising' } }) },
  );

  const evaluation = outcome.evidence[0]!;
  assert.equal(
    (evaluation.payload as { readonly stableFallback: unknown }).stableFallback !== undefined,
    true,
  );
  assert.deepEqual(
    (evaluation.payload as { readonly stableFallback: unknown }).stableFallback,
    EXPERIMENTAL.stableFallback,
  );
});

test('shadow: an empty shadowId is rejected as malformed integration input', async () => {
  const { capture, store } = makeCapture();
  await assert.rejects(
    () =>
      runShadowEvaluation(
        { shadowId: '  ', experimentalArtifact: EXPERIMENTAL, input: null },
        { capture, evaluator: evaluator({ verdict: null }) },
      ),
    (error: unknown) => isIntegrationError(error, 'INVALID_RUNTIME_EVIDENCE_INTEGRATION'),
  );
  assert.equal(store.records().length, 0);
});
