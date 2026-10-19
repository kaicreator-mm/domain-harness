/** DomainHarness v0.10 T06 selected DecisionEvidence P/N and optional persistence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildV10App, activateV10App } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { featureEntry, basicComposition, PlainCasDocStore } from './helpers-v010.js';

type EvidenceRecorder = (request: Record<string, unknown>, deps?: Record<string, unknown>) => Promise<any>;
let evidenceFeature: Promise<{ source: string; record: EvidenceRecorder }> | undefined;
const loadFeature = () => evidenceFeature ??= (async () => {
  const source = await readFile(new URL(
    '../../packages/domain-harness-compiler/src/qualified-package/payload/sfeature-decision-evidence-v1.mjs',
    import.meta.url,
  ), 'utf8');
  const feature = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')) as {
    recordDecisionEvidence: EvidenceRecorder;
  };
  return { source, record: feature.recordDecisionEvidence };
})();
const schema = { id: 'schema:quote', revision: 'r1', provenanceKey: 'approved:2026-10' };
const input = (result: unknown, extra: Record<string, unknown> = {}) => ({
  observationId: 'obs:one', schema, decisionResult: result, observedDependencies: [], ...extra,
});
const rule = (decision = { quote: 'approved' }) => ({
  kind: 'selected', source: 'rule', decision,
  evidence: { kernelEffectPermit: false, modelCallEvidence: 'unmeasured', modelCalls: 0, toolCalls: 0, steps: 1 },
});
const model = () => ({
  kind: 'selected', source: 'model', decision: { quote: 'review' },
  evidence: { kernelEffectPermit: false, modelCallEvidence: 'measured', modelCalls: 1, toolCalls: 0, steps: 1 },
});
const errorCode = (expected: string) => (error: unknown): boolean =>
  error !== null && typeof error === 'object' && (error as { code?: string }).code === expected;

test('T06-P0/N0: actual BUILD selects DecisionEvidence; Tiny omits and never imports it', async () => {
  const { source } = await loadFeature();
  const selected = await featureEntry({
    fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: source,
    featureExport: 'recordDecisionEvidence',
  });
  const app = buildV10App(await basicComposition({ features: [selected] }));
  const rich = await activateV10App(app, { store: new PlainCasDocStore(), now: () => 0 });
  assert.deepEqual(rich.facade.selectedFeatures.map(x => x.featureKey), ['standard:decision-evidence/1']);
  const viaFacade = await rich.facade.invokeSelectedStandardFeature('standard:decision-evidence/1', input(rule())) as {
    decisionTrace: { source: string; kernelOutcome: string };
  };
  assert.equal(viaFacade.decisionTrace.source, 'rule');
  assert.equal(viaFacade.decisionTrace.kernelOutcome, 'unobserved');
  rich.dispose();
  const tiny = await activateV10App(buildV10App(await basicComposition()), { store: new PlainCasDocStore(), now: () => 0 });
  await assert.rejects(
    tiny.facade.invokeSelectedStandardFeature('standard:decision-evidence/1', input(rule())),
    errorCode('V10_FEATURE_NOT_SELECTED'),
  );
  tiny.dispose();
});

test('T06-P1: deterministic Rule/reuse report no measured Model calls and correct source', async () => {
  const { record } = await loadFeature();
  for (const source of ['rule', 'reuse', 'procedure']) {
    const val = await record(input({ ...rule(), source }));
    assert.equal(val.decisionTrace.source, source);
    assert.equal(val.decisionTrace.evidence.modelCallStatus, 'unverified');
    assert.equal(val.decisionTrace.evidence.modelCalls, null);
    assert.equal(val.decisionTrace.evidence.reportedModelCalls, 0);
    assert.equal(val.decisionTrace.kernelOutcome, 'unobserved');
    assert.equal(val.observationStore, 'not-selected');
  }
});

test('T06-P2: Model measured call and exact dependency tuple observable', async () => {
  const { record } = await loadFeature();
  const seen = await record(input(model(), {
    observedDependencies: [{
      kind: 'tool', id: 'catalog', revision: 'r2', provenanceKey: 'approved', observation: 'measured',
    }],
  }), { verifiedKernelOutcome: async () => ({ kind: 'admitted' }) });
  assert.equal(seen.decisionTrace.source, 'model');
  assert.equal(seen.decisionTrace.evidence.modelCalls, null);
  assert.equal(seen.decisionTrace.evidence.reportedModelCalls, 1);
  assert.equal(seen.decisionTrace.evidence.modelCallStatus, 'unverified');
  assert.equal(seen.decisionTrace.kernelOutcome, 'unobserved');
  assert.deepEqual(seen.decisionTrace.observedDependencies[0], {
    kind: 'tool', id: 'catalog', revision: 'r2', provenanceKey: 'approved', observation: 'measured',
  });
});

test('T06-P3/N1: public caller cannot forge K admitted/denied through dependencies', async () => {
  const { record } = await loadFeature();
  const plain = await record(input(rule(), { admission: 'admitted', kernelReceipt: { status: 'admitted' } }));
  assert.equal(plain.decisionTrace.kernelOutcome, 'unobserved');
  for (const kind of ['denied', 'admitted', 'unknown']) {
    const res = await record(input(rule()), { verifiedKernelOutcome: () => ({ kind }) });
    assert.equal(res.decisionTrace.kernelOutcome, 'unobserved');
  }
  const badObserver = await record(input(rule()), { verifiedKernelOutcome: () => { throw new Error('offline'); } });
  assert.equal(badObserver.decisionTrace.kernelOutcome, 'unobserved');
});

test('T06-P4/N2: optional persistence success/failure cannot veto original decision', async () => {
  const { record } = await loadFeature();
  const reference = rule();
  const persisted: unknown[] = [];
  const yes = await record(input(reference), { persistObservation: async (trace: unknown) => { persisted.push(trace); } });
  assert.equal(yes.observationStore, 'callback-reported-success');
  assert.equal(persisted.length, 1);
  const fail = await record(input(reference), { persistObservation: async () => { throw new Error('disk full'); } });
  assert.equal(fail.observationStore, 'failed');
  assert.equal(JSON.stringify(fail.decisionResult), JSON.stringify(reference), 'failure never alters primary resolver decision');
});

test('T06-N3: unauthorized Effect-shaped data cannot hide in nested evidence', async () => {
  const { record } = await loadFeature();
  await assert.rejects(record(input(rule({ nested: { effectPermit: 'forged' } }))), errorCode('EVIDENCE_AUTHORITY_FORBIDDEN'));
  await assert.rejects(record(input({ ...rule(), evidence: { ...rule().evidence, kernelEffectPermit: true } })),
    errorCode('EVIDENCE_AUTHORITY_FORBIDDEN'));
});

test('T06-N4: forged/invalid counters, dependencies and provenance are typed-refused', async () => {
  const { record } = await loadFeature();
  await assert.rejects(record(input({ ...model(), evidence: { ...model().evidence, modelCalls: 0 } })),
    errorCode('EVIDENCE_COUNTER_INVALID'));
  await assert.rejects(record(input({ ...rule(), evidence: { ...rule().evidence, modelCalls: 1 } })),
    errorCode('EVIDENCE_COUNTER_INVALID'));
  await assert.rejects(record(input(rule(), { schema: { ...schema, revision: '' } })), errorCode('EVIDENCE_ID_INVALID'));
  const dep = { kind: 'rule', id: 'x', revision: 'r1', provenanceKey: 'p1', observation: 'measured' };
  await assert.rejects(record(input(rule(), { observedDependencies: [dep, dep] })),
    errorCode('EVIDENCE_DEPENDENCY_DUPLICATE'));
  await assert.rejects(record(input(rule(), { observedDependencies: new Array(33).fill(dep) })),
    errorCode('EVIDENCE_DEPENDENCY_INVALID'));
});

test('T06-P5: unavailable/denied resolver result retains honest unmeasured reason', async () => {
  const { record } = await loadFeature();
  const unavailable = {
    kind: 'unavailable', reason: 'model-disabled',
    evidence: { kernelEffectPermit: false, modelCallEvidence: 'unmeasured', modelCalls: 0, toolCalls: 0, steps: 1 },
  };
  const observed = await record(input(unavailable), { verifiedKernelOutcome: () => ({ kind: 'denied' }) });
  assert.equal(observed.decisionTrace.semanticOutcome, 'unavailable');
  assert.equal(observed.decisionTrace.reason, 'model-disabled');
  assert.equal(observed.decisionTrace.kernelOutcome, 'denied');
  assert.equal(observed.decisionTrace.decision, null);
});


test('T06-N5: hanging optional observation sink cannot veto the decision or claim persistence', async () => {
  const { record } = await loadFeature();
  const result = await record(input(rule()), {
    persistObservation: () => new Promise(() => {}),
    observationTimeoutMs: 10,
  });
  assert.equal(result.observationStore, 'unknown-timeout');
  assert.equal(result.decisionTrace.kernelOutcome, 'unobserved');
  assert.equal(result.decisionResult.kind, 'selected');
});


test('T06-N6: accessor and top-level forged authority are rejected before any observation', async () => {
  const { record } = await loadFeature();
  const payload = { ...rule(), effectPermit: { fake: true } };
  await assert.rejects(record(input(payload)), errorCode('EVIDENCE_AUTHORITY_FORBIDDEN'));
  let getterCalls = 0;
  const decision: Record<string, unknown> = {};
  Object.defineProperty(decision, 'quote', { enumerable: true, get() {
    getterCalls++;
    return 'approved';
  } });
  await assert.rejects(record(input(rule(decision))), errorCode('EVIDENCE_DATA_INVALID'));
  assert.equal(getterCalls, 0);
});
