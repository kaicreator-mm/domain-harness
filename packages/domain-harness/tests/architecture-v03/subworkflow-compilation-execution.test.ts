import assert from 'node:assert/strict';
import test from 'node:test';
import { createActor, waitFor } from 'xstate';
import { sealCandidate, type DomainDecision } from './subworkflow-compilation-model.js';
import { compilePromotedWorkflow } from './subworkflow-compilation-compiler.js';
import { promoteCandidate } from './subworkflow-compilation-validation.js';
import {
  CountingPlanner,
  baseDraft,
  decision,
  promote,
  queryRuntime,
  reasonedDraft,
  runCompiled,
  runHarness,
  validateOrThrow,
} from './subworkflow-compilation-fixture.js';

test('S1: HarnessMachine returns a structured result, DecisionTrace, and optional constrained WorkflowCandidate without free-form chain-of-thought', async () => {
  const candidate = sealCandidate(baseDraft());
  const planner = new CountingPlanner(candidate);
  const snapshot = await runHarness(planner);

  assert.equal(snapshot.output?.status, 'ok');
  if (snapshot.output?.status !== 'ok') throw new Error('HarnessMachine failed');
  assert.equal(snapshot.output.decision.type, 'QUOTE_REQUESTED');
  assert.equal(snapshot.output.decisionTrace.status, 'accepted');
  assert.equal(snapshot.output.candidate?.semanticDigest, candidate.semanticDigest);
  assert.equal(planner.calls, 1);
  assert.equal(JSON.stringify(snapshot.output).includes('chainOfThought'), false);
  assert.equal(JSON.stringify(snapshot.output).includes('reasoningText'), false);
});

test('S2-S3: validator accepts, compiler creates an executable XState child workflow, and a second compatible input runs without planner reinvocation', async () => {
  const candidate = sealCandidate(baseDraft());
  const planner = new CountingPlanner(candidate);
  const harnessSnapshot = await runHarness(planner);
  assert.equal(harnessSnapshot.output?.status, 'ok');
  if (harnessSnapshot.output?.status !== 'ok' || harnessSnapshot.output.candidate === undefined) {
    throw new Error('candidate missing from structured Harness result');
  }

  const artifact = promote(harnessSnapshot.output.candidate);
  const childSnapshot = await runCompiled(
    artifact,
    { accountId: 'LOW', country: 'MM', requestKind: 'rfq' },
  );

  assert.deepEqual(childSnapshot.output, {
    status: 'ok',
    decision: { type: 'QUOTE_REQUESTED', payload: { reasonCode: 'score_allows_quote' } },
  });
  assert.equal(planner.calls, 1, 'compiled child must not call the planner to recreate the process');
});

test('S4: a compiled subworkflow invokes a reasoned Harness step only when that step is explicitly present in the validated candidate', async () => {
  const candidate = sealCandidate(reasonedDraft());
  const validated = validateOrThrow(candidate);
  const artifact = promoteCandidate(validated, { selectedBy: 'research-reviewer', evidenceRef: 'reasoned-explicit' });
  let reasonedCalls = 0;

  const machine = compilePromotedWorkflow(artifact, {
    tools: [],
    reasoned: {
      async resolve(_input, _facts, allowedOutcomes): Promise<DomainDecision> {
        reasonedCalls += 1;
        assert.deepEqual(allowedOutcomes, ['TECHNICAL_REVIEW_REQUIRED', 'QUOTE_REQUESTED']);
        return decision('QUOTE_REQUESTED', 'explicit_reasoned_step');
      },
    },
  });
  const actor = createActor(machine, { input: { country: 'MM', requestKind: 'rfq' } }).start();
  const snapshot = await waitFor(actor, (value) => value.status === 'done', { timeout: 2_000 });

  assert.equal(reasonedCalls, 1);
  assert.equal(snapshot.output?.decision?.type, 'QUOTE_REQUESTED');
});


test('S9: applicability false fails closed before any tool or reasoned work executes', async () => {
  const candidate = sealCandidate(baseDraft());
  const artifact = promote(candidate);
  const counter = { calls: 0 };
  const machine = compilePromotedWorkflow(artifact, { tools: queryRuntime(counter) });
  const actor = createActor(machine, {
    input: { accountId: 'LOW', country: 'US', requestKind: 'rfq' },
  }).start();
  const snapshot = await waitFor(actor, (value) => value.status === 'done', { timeout: 2_000 });

  assert.deepEqual(snapshot.output, { status: 'not-applicable' });
  assert.equal(counter.calls, 0);
});

