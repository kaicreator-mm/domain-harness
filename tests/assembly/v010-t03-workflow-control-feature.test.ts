/**
 * DomainHarness v0.10 T03 — selected Standard workflow-control feature:
 * bounded loop / child / WAIT / RESUME / callback / deadline semantics.
 *
 * Assembly-level P/N over the REAL BUILD/activation seam (the feature is
 * genuinely selected and init'd; Tiny omits it) and the feature's pure
 * planning contract. Physical SQLite restart/replay/dedup legs live in
 * tests/hosts/node/v010-t03-workflow-control-physical.test.ts — nothing
 * here claims a physical-Host witness. No facade feature-invocation method
 * is used: v10build/activation.ts is owned by the in-flight T02 PR #1188
 * and stays untouched; the feature surface is loaded through the same
 * exact-bytes data-URL discipline as the selected payload itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildV10App } from '../../tooling/build/dist/index.js';
import { activateV10App } from '../../packages/microkernel/src/internal/activation.js';
import { basicComposition, featureEntry, PlainCasDocStore } from './helpers-v010.js';

type Plan = (request: Record<string, any>, deps?: Record<string, any>) => any;
let selectedFeature: Promise<{ source: string; plan: Plan; init: (context: unknown) => unknown }> | undefined;
const loadSelectedFeature = (): Promise<{ source: string; plan: Plan; init: (context: unknown) => unknown }> =>
  (selectedFeature ??= (async () => {
    const source = await readFile(
      new URL('../../domain-packages/standard/features/workflow-control/modules/sfeature-workflow-control-v1.mjs', import.meta.url),
      'utf8',
    );
    const feature = await import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64')) as {
      planWorkflowControl: Plan;
      init: (context: unknown) => unknown;
    };
    return { source, plan: feature.planWorkflowControl, init: feature.init };
  })());

const NOW = 1_760_000_000_000;
const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;

const target = { workflowId: 'wfc', instanceKey: 'parent-1' };
const loopStep = (iteration: number, extra: Record<string, unknown> = {}) => ({
  kind: 'loop.next',
  target,
  control: { loopId: 'l1', iteration, maxIterations: 3, stepIntentTypes: ['loopNote'], deadlineEpochMs: NOW + 60_000, ...extra },
  step: { intentType: 'loopNote', input: { n: iteration } },
});

test('T03-A0: real T00 BUILD selects the workflow-control S feature; Tiny omits it without loading', async () => {
  const { source } = await loadSelectedFeature();
  const selected = await featureEntry({
    fixture: 'sfeature-workflow-control-v1.mjs',
    moduleSourceOverride: source,
    featureExport: 'planWorkflowControl',
  });
  const rich = buildV10App(await basicComposition({ features: [selected] }));
  const activated = await activateV10App(rich, { store: new PlainCasDocStore(), now: () => 0 });
  assert.deepEqual(activated.facade.selectedFeatures.map((v) => v.featureKey), ['standard:workflow-control/1']);
  assert.equal(activated.counters.featureImports, 1, 'exactly one feature module import');
  assert.equal(activated.counters.initCalls.length, 1, 'the sealed init contract ran');
  activated.dispose();

  const tiny = buildV10App(await basicComposition());
  const tinyActivated = await activateV10App(tiny, { store: new PlainCasDocStore(), now: () => 0 });
  assert.deepEqual(tinyActivated.facade.selectedFeatures, []);
  assert.equal(tinyActivated.counters.featureImports, 0, 'Tiny never loads the optional feature module');
  tinyActivated.dispose();
});

test('T03-A1: finite loop plans exactly its budget with deterministic scoped identities and a final step', async () => {
  const { plan } = await loadSelectedFeature();
  const seen: string[] = [];
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const planned = plan(loopStep(iteration), { now: () => NOW });
    assert.equal(planned.action, 'submit');
    assert.equal(planned.kernelEffectPermit, false);
    assert.equal(planned.proposal.intentType, 'loopNote');
    assert.equal(planned.proposal.messageId, `wfc/loop/wfc/parent-1/l1/${String(iteration)}`);
    assert.equal(planned.proposal.turnSource, null, 'a loop step is an ordinary message turn');
    assert.deepEqual(planned.budget, { iteration, maxIterations: 3, deadlineEpochMs: NOW + 60_000 });
    seen.push(planned.proposal.messageId);
    assert.equal(planned.final, iteration === 2, 'only the last in-budget step is final');
  }
  assert.equal(new Set(seen).size, 3, 'every step identity is unique and scoped');
  // Deterministic purity: the same request plans byte-identical material.
  assert.deepEqual(plan(loopStep(0), { now: () => NOW }), plan(loopStep(0), { now: () => NOW }));
});

test('T03-A2/N1: over-budget, unbounded, zero-budget and unauthorized steps refuse typed before any proposal', async () => {
  const { plan } = await loadSelectedFeature();
  assert.throws(() => plan(loopStep(3), { now: () => NOW }), code('WORKFLOW_BUDGET_EXHAUSTED'));
  assert.throws(() => plan(loopStep(9), { now: () => NOW }), code('WORKFLOW_BUDGET_EXHAUSTED'));
  for (const badBudget of [undefined, 0, -1, 1e9, 1.5]) {
    assert.throws(() => plan(loopStep(0, { maxIterations: badBudget }), { now: () => NOW }), code('WORKFLOW_BUDGET_INVALID'));
  }
  assert.throws(() => plan({ ...loopStep(0), step: { intentType: 'foreignIntent', input: {} } }, { now: () => NOW }),
    code('WORKFLOW_STEP_UNAUTHORIZED'),
  );
  assert.throws(() => plan(loopStep(0, { deadlineEpochMs: NOW - 1 }), { now: () => NOW }),
    code('WORKFLOW_DEADLINE_EXCEEDED'),
  );
});

test('T03-A2/N2: forged Std material cannot carry Kernel or effect authority', async () => {
  const { plan } = await loadSelectedFeature();
  assert.throws(() => plan({ ...loopStep(0), control: { ...loopStep(0).control, effectPermit: { effectId: 'x' } } }, { now: () => NOW }),
    code('WORKFLOW_AUTHORITY_FORBIDDEN'),
  );
  assert.throws(() => plan({ kind: 'wait.open', target, control: { externalCorrelationId: 'c1', deadlineTimerId: 't1', dueAt: new Date(NOW + 5000).toISOString(), callbackIntentType: 'cb', timeoutIntentType: 'to', hostPorts: {} } } as Record<string, unknown>, { now: () => NOW }),
    code('WORKFLOW_AUTHORITY_FORBIDDEN'),
  );
});

test('T03-A3/N3: child.open binds an exact correlation identity; self-recursion and depth overflow refuse typed', async () => {
  const { plan } = await loadSelectedFeature();
  const child = plan({
    kind: 'child.open',
    target,
    control: {
      childInstanceKey: 'child-1', invocationOrdinal: 1, lineageDepth: 1,
      childIntentType: 'childStart', doneIntentType: 'childDone', errorIntentType: 'childError',
    },
  });
  assert.equal(child.action, 'open-child');
  assert.equal(child.proposal.expectedCorrelationId, 'child:parent-1:child-1:1');
  assert.deepEqual(child.proposal.correlationGrammar, 'child:{parentInstanceKey}:{childInstanceKey}:{invocationOrdinal}');
  assert.equal(child.kernelEffectPermit, false);

  assert.throws(() => plan({ kind: 'child.open', target, control: { childInstanceKey: 'parent-1', invocationOrdinal: 1, lineageDepth: 1, childIntentType: 'a', doneIntentType: 'b', errorIntentType: 'c' } }),
    code('WORKFLOW_CHILD_INVALID'),
  );
  assert.throws(() => plan({ kind: 'child.open', target, control: { childInstanceKey: 'child-deep', invocationOrdinal: 1, lineageDepth: 33, childIntentType: 'a', doneIntentType: 'b', errorIntentType: 'c' } }),
    code('WORKFLOW_CHILD_DEPTH_EXCEEDED'),
  );
});

test('T03-A4/N4: wait.open seals the exact one-shot resume identities; a past dueAt refuses typed', async () => {
  const { plan } = await loadSelectedFeature();
  const dueAt = new Date(NOW + 10_000).toISOString();
  const wait = plan({
    kind: 'wait.open', target,
    control: { externalCorrelationId: 'corr-1', deadlineTimerId: 'timer-1', dueAt, callbackIntentType: 'callbackArrived', timeoutIntentType: 'timeoutArrived' },
  }, { now: () => NOW });
  assert.equal(wait.action, 'register-external-work');
  assert.deepEqual(wait.proposal.callbackToken, { externalCorrelationId: 'corr-1', callbackOrdinal: 1 });
  assert.equal(wait.proposal.callbackMessageId, 'ctrl:callback:corr-1:1');
  assert.equal(wait.proposal.timerMessageId, 'ctrl:timer:timer-1:1');

  assert.throws(() => plan({ kind: 'wait.open', target, control: { externalCorrelationId: 'corr-p', deadlineTimerId: 't', dueAt: new Date(NOW - 1000).toISOString(), callbackIntentType: 'cb', timeoutIntentType: 'to' } }, { now: () => NOW }),
    code('WORKFLOW_WAIT_INVALID'),
  );
});

test('T03-A5/N5: control.resume accepts only the exact winning binding; foreign/stale/losing deliveries refuse typed', async () => {
  const { plan } = await loadSelectedFeature();
  const scope = { appId: 'app-t03', tenantId: 'tenant-t03' };
  const settledCallback = {
    source: { kind: 'callback', externalCorrelationId: 'corr-1', callbackOrdinal: 1 },
    status: 'callback_received',
    scope,
  };
  const resume = plan({
    kind: 'control.resume', target,
    control: { expected: { externalCorrelationId: 'corr-1', callbackIntentType: 'callbackArrived', scope } },
    settled: settledCallback,
  });
  assert.equal(resume.action, 'submit');
  assert.deepEqual(resume.proposal.turnSource, { kind: 'callback', externalCorrelationId: 'corr-1', callbackOrdinal: 1 });
  assert.equal(resume.proposal.messageId, 'ctrl:callback:corr-1:1');
  assert.equal(resume.kernelEffectPermit, false);

  // Foreign correlation.
  assert.throws(() => plan({ kind: 'control.resume', target, control: { expected: { externalCorrelationId: 'corr-OTHER', callbackIntentType: 'cb', scope } }, settled: settledCallback }),
    code('WORKFLOW_RESUME_MISMATCH'),
  );
  // Cross-B scope.
  assert.throws(() => plan({ kind: 'control.resume', target, control: { expected: { externalCorrelationId: 'corr-1', callbackIntentType: 'cb', scope: { appId: 'app-OTHER', tenantId: 'tenant-t03' } } }, settled: settledCallback }),
    code('WORKFLOW_RESUME_MISMATCH'),
  );
  // Losing delivery: the deadline won before this callback.
  assert.throws(() => plan({ kind: 'control.resume', target, control: { expected: { externalCorrelationId: 'corr-1', callbackIntentType: 'cb', timeoutIntentType: 'to', scope } }, settled: { ...settledCallback, status: 'timed_out' } }),
    code('WORKFLOW_RESUME_MISMATCH'),
  );
  // Wrong child terminal for the awaited binding.
  assert.throws(() => plan({
      kind: 'control.resume', target,
      control: { expected: { parentActorId: 'parent-1', childActorId: 'child-1', invocationOrdinal: 1, doneIntentType: 'childDone', scope } },
      settled: { source: { kind: 'child-terminal', parentActorId: 'parent-1', childActorId: 'child-OTHER', invocationOrdinal: 1, terminalKind: 'done' }, status: 'done', scope },
    }),
    code('WORKFLOW_RESUME_MISMATCH'),
  );
  // A timer resume at a non-one-shot fire ordinal refuses typed.
  assert.throws(() => plan({
      kind: 'control.resume', target,
      control: { expected: { externalCorrelationId: 'corr-1', timeoutIntentType: 'to', scope } },
      settled: { source: { kind: 'timer', timerId: 'timer-1', fireOrdinal: 2 }, status: 'timed_out', scope },
    }),
    code('WORKFLOW_RESUME_MISMATCH'),
  );
  // An already-submitted turn proposes an idempotent REPLAY, never a new one.
  const replay = plan({
    kind: 'control.resume', target,
    control: { expected: { externalCorrelationId: 'corr-1', callbackIntentType: 'callbackArrived', scope } },
    settled: { ...settledCallback, submittedTurn: { messageId: 'ctrl:callback:corr-1:1', submittedAt: new Date(NOW).toISOString() } },
  });
  assert.equal(replay.action, 'replay');
  assert.deepEqual(replay.proposal.messageId, 'ctrl:callback:corr-1:1');
});
