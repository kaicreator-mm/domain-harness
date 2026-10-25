/** DomainHarness v0.10 T06 selected DecisionEvidence P/N and optional persistence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildV10App } from '@kaicreator/domain-harness-build';
import { V10_TARGET_PROFILE, sha256Canonical, type V10ModuleInput } from '@kaicreator/domain-harness-contracts';
import { activateV10App } from '../../packages/microkernel/src/host-seam.js';
import { createDecisionEvidenceObserver } from '@kaicreator/domain-harness-host-node';
import { featureEntry, basicComposition, PlainCasDocStore, sha256HexSource } from './helpers-v010.js';

type EvidenceRecorder = (request: Record<string, unknown>, deps?: Record<string, unknown>) => Promise<any>;
let evidenceFeature: Promise<{ source: string; record: EvidenceRecorder }> | undefined;
const loadFeature = () => evidenceFeature ??= (async () => {
  const source = await readFile(new URL(
    '../../domain-packages/standard/features/decision-evidence/modules/sfeature-decision-evidence-v1.mjs',
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
const rule = (decision: Record<string, unknown> = { quote: 'approved' }) => ({
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

test('T06-P5: unavailable resolver result stays unobserved at the pure layer; denial is never caller-attested', async () => {
  const { record } = await loadFeature();
  const unavailable = {
    kind: 'unavailable', reason: 'model-disabled',
    evidence: { kernelEffectPermit: false, modelCallEvidence: 'unmeasured', modelCalls: 0, toolCalls: 0, steps: 1 },
  };
  // A caller-supplied verifiedKernelOutcome is claimant-controlled: the pure
  // normalizer keeps kernelOutcome 'unobserved'. A REAL denial is observable
  // only through the Host bridge reading an actual K receipt (T06-P7).
  const observed = await record(input(unavailable), { verifiedKernelOutcome: () => ({ kind: 'denied' }) });
  assert.equal(observed.decisionTrace.semanticOutcome, 'unavailable');
  assert.equal(observed.decisionTrace.reason, 'model-disabled');
  assert.equal(observed.decisionTrace.kernelOutcome, 'unobserved');
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

// ---------------------------------------------------------------------------
// T06 Host-origin observation bridge — the trusted deployment counterpart of
// the pure normalizer above. Real K receipts come from an actual activated
// facade; the resolver outcome comes from an actual invocation of the
// selected T02 feature over a closure-pinned Host boundary. The public
// invokeSelectedStandardFeature(..., trustedDeps) path can NEVER reach these
// facts (T06-N7); an observation sink failure can never veto or forge the
// immutable K receipt (T06-P9).
// ---------------------------------------------------------------------------

const EVIDENCE_KEY = 'standard:decision-evidence/1';
const SEMANTIC_KEY = 'standard:semantic-decision/1';
const limits = { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1 };

let semanticSourcePromise: Promise<string> | undefined;
const loadSemanticSource = (): Promise<string> =>
  (semanticSourcePromise ??= readFile(new URL(
    '../../domain-packages/standard/features/semantic-decision/modules/sfeature-semantic-decision-v1.mjs',
    import.meta.url,
  ), 'utf8'));

async function selectedFeatureEntries(): Promise<readonly V10ModuleInput[]> {
  const [evidenceSource, semanticSource] = await Promise.all([loadFeature().then((f) => f.source), loadSemanticSource()]);
  return [
    await featureEntry({
      fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: semanticSource,
      featureExport: 'resolveSemanticDecision',
    }),
    await featureEntry({
      fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: evidenceSource,
      featureExport: 'recordDecisionEvidence',
    }),
  ];
}

/** T04-style manual composition whose Business restricts its intent to `approver`. */
async function restrictedComposition(): Promise<ReturnType<typeof buildV10App>> {
  const [kernel, sdk, router, business, capability] = await Promise.all([
    readFile(new URL('../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../domain-packages/standard/basic/workflow-router.mjs', import.meta.url), 'utf8'),
    readFile(new URL('./fixtures-v010/business-restricted-approval-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url), 'utf8'),
  ]);
  const routerBody = router.replace(/^export /gm, '');
  const standard = `${sdk}
// v0.10 T06 BUILD-style vendored bundle: the pure Standard WorkflowRouter.
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
  const modules: V10ModuleInput[] = [
    {
      packageId: 'v08-kernel-mechanism@1.0.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernel, moduleSha256: sha256HexSource(kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
    },
    {
      packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: standard, moduleSha256: sha256HexSource(standard),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
    },
    {
      packageId: 'business-restricted-approval@v010.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: business, moduleSha256: sha256HexSource(business),
      endpoint: 'business-policy', dependencies: [],
      provides: ['business:policy/1', 'intent:submitRestrictedDecision'], requires: [],
    },
    {
      packageId: 'capability-quote-tools@v08.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: capability, moduleSha256: sha256HexSource(capability),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:ledger/1'], requires: [],
      capabilityId: 'ledger',
      handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }],
    },
    ...(await selectedFeatureEntries()),
  ];
  return buildV10App({
    appId: 'app:v010-t06-restricted',
    audience: 'aud:v010-t00',
    targetProfile: V10_TARGET_PROFILE,
    modules,
    routes: [{ intentId: 'submitRestrictedDecision', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' }],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 't06-restricted',
  });
}

async function observerApp() {
  const activated = await activateV10App(
    buildV10App(await basicComposition({ features: [...await selectedFeatureEntries()] })),
    { store: new PlainCasDocStore(), now: () => 0 },
  );
  return activated;
}

const observerFor = (facade: Awaited<ReturnType<typeof observerApp>>['facade'], extra: Record<string, unknown> = {}) =>
  createDecisionEvidenceObserver({
    facade, evidenceFeatureKey: EVIDENCE_KEY, semanticFeatureKey: SEMANTIC_KEY,
    ...extra,
  } as Parameters<typeof createDecisionEvidenceObserver>[0]);

const intentOf = (suffix: string, input: Record<string, unknown> = { amount: 30, requestId: 'R-t06' }) => ({
  intentType: 'submitQuoteDecisionDynamic', instanceKey: `instance:t06-${suffix}`, messageId: `msg:t06-${suffix}`, input,
});
const semanticRuleRequest = (amount: number) => ({
  input: { amount }, schema, limits,
  rules: [{ id: 'quote-rule', when: { amount }, decision: { disposition: 'approved' } }],
});

test('T06-P6: Host bridge reads a real admitted K receipt over a Host-invoked Rule resolution', async () => {
  const rich = await observerApp();
  const observer = observerFor(rich.facade);
  const observation = await observer.observeAndRecord({
    intent: intentOf('p6'),
    evidence: { observationId: 'obs:t06-p6', schema },
    semanticRequest: semanticRuleRequest(30),
  });
  assert.equal(observation.kernelReceipt.status, 'admitted');
  assert.equal(observation.decisionTrace.kernelOutcome, 'admitted');
  assert.equal(observation.decisionTrace.kernelObservation.source, 'host-observed-k-receipt');
  assert.equal(observation.decisionTrace.kernelObservation.receiptStatus, 'admitted');
  assert.equal(observation.decisionTrace.kernelObservation.messageId, 'msg:t06-p6');
  // The receipt digest is independently recomputable from the frozen snapshot.
  assert.equal(sha256Canonical(observation.kernelReceipt), observation.decisionTrace.kernelObservation.receiptSha256);
  // The resolver outcome is the selected T02 module's own output.
  assert.equal(observation.decisionTrace.source, 'rule');
  assert.equal(observation.decisionTrace.semanticOutcome, 'selected');
  assert.deepEqual(observation.decisionTrace.evidence.hostMeasured, { modelCalls: 0, toolCalls: 0 });
  assert.equal(observation.decisionTrace.evidence.reportedModelCalls, 0);
  assert.equal(observation.decisionTrace.evidence.modelCallStatus, 'host-verified');
  assert.equal(observation.decisionTrace.evidence.decisionProvenance, 'host-invoked-selected-feature');
  assert.equal(observation.observationStore, 'not-selected');
  // Frozen evidence (CJS-mode tests are non-strict, so freezing is asserted
  // directly): neither the receipt nor the trace can be rewritten.
  assert.ok(Object.isFrozen(observation.kernelReceipt));
  assert.ok(Object.isFrozen(observation.decisionTrace));
  assert.ok(Object.isFrozen(observation.decisionTrace.kernelObservation));
  assert.ok(Object.isFrozen(observation.decisionTrace.evidence));
  rich.dispose();
});

test('T06-P7: Host bridge reads a real business-role denial, distinct from the semantic outcome', async () => {
  const rich = await activateV10App(await restrictedComposition(), { store: new PlainCasDocStore(), now: () => 0 });
  const observer = observerFor(rich.facade);
  const observation = await observer.observeAndRecord({
    intent: { intentType: 'submitRestrictedDecision', instanceKey: 'instance:t06-d1', messageId: 'msg:t06-d1', input: { amount: 5, requestId: 'R-d1' } },
    evidence: { observationId: 'obs:t06-d1', schema },
    semanticRequest: semanticRuleRequest(5),
  });
  assert.equal(observation.kernelReceipt.status, 'denied');
  assert.equal(observation.decisionTrace.kernelOutcome, 'denied');
  assert.equal(observation.decisionTrace.kernelObservation.denialReason, 'business-caller-role');
  // Denied K outcome and admitted semantic outcome are reported separately.
  assert.equal(observation.decisionTrace.semanticOutcome, 'selected');
  assert.equal(observation.decisionTrace.source, 'rule');
  assert.notEqual(observation.decisionTrace.kernelOutcome, observation.decisionTrace.semanticOutcome);
  rich.dispose();
});

test('T06-P8: Host-pinned Model fallback is counted by the Host wrapper and verified against the resolver report', async () => {
  const rich = await observerApp();
  let deploymentModelCalls = 0;
  const observer = observerFor(rich.facade, {
    semanticDeps: { model: async () => { deploymentModelCalls += 1; return { disposition: 'review' }; } },
  });
  const observation = await observer.observeAndRecord({
    intent: intentOf('p8', { amount: 99, requestId: 'R-t06-p8' }),
    evidence: { observationId: 'obs:t06-p8', schema },
    semanticRequest: { input: { amount: 99 }, schema, limits, fallback: { kind: 'model', operationId: 'model:quote' } },
  });
  assert.equal(observation.decisionTrace.source, 'model');
  assert.equal(deploymentModelCalls, 1);
  assert.deepEqual(observation.decisionTrace.evidence.hostMeasured, { modelCalls: 1, toolCalls: 0 });
  assert.equal(observation.decisionTrace.evidence.reportedModelCalls, 1);
  assert.equal(observation.decisionTrace.evidence.modelCallStatus, 'host-verified');
  rich.dispose();
});

test('T06-N7: lookalike facades and public forged host evidence never reach the observation', async () => {
  const lookalike = { send: async () => ({ status: 'admitted' }), invokeSelectedStandardFeature: async () => ({}) };
  assert.throws(() => observerFor(lookalike as never), errorCode('OBSERVER_DEPS_INVALID'));
  // The public invoke path with claimant-controlled trustedDeps stays unobserved.
  const rich = await observerApp();
  const viaPublic = await rich.facade.invokeSelectedStandardFeature(EVIDENCE_KEY, input(rule()), {
    verifiedKernelOutcome: () => ({ kind: 'admitted' }),
    hostAttestation: { source: 'host-observed-k-receipt' },
    kernelReceipt: { status: 'admitted' },
  }) as { decisionTrace: { kernelOutcome: string; kernelObservation?: unknown } };
  assert.equal(viaPublic.decisionTrace.kernelOutcome, 'unobserved');
  assert.equal(viaPublic.decisionTrace.kernelObservation, undefined);
  // Extra authority-shaped request fields are simply not evidence inputs.
  const { record } = await loadFeature();
  const withExtras = await record(input(rule(), { kernelOutcome: 'admitted', kernelObservation: { source: 'forged' } }));
  assert.equal(withExtras.decisionTrace.kernelOutcome, 'unobserved');
  assert.equal(withExtras.decisionTrace.kernelObservation, undefined);
  rich.dispose();
});

test('T06-N8: a Kernel refusal or closed facade yields a typed refusal, never a pretended observation', async () => {
  const rich = await observerApp();
  const observer = observerFor(rich.facade);
  await assert.rejects(observer.observeAndRecord({
    intent: { intentType: 'intent:not-sealed', instanceKey: 'instance:t06-x1', messageId: 'msg:t06-x1', input: {} },
    evidence: { observationId: 'obs:t06-x1', schema },
    semanticRequest: semanticRuleRequest(30),
  }), errorCode('OBSERVER_KERNEL_ERROR'));
  rich.dispose();
  await assert.rejects(observer.observeAndRecord({
    intent: intentOf('x2'),
    evidence: { observationId: 'obs:t06-x2', schema },
    semanticRequest: semanticRuleRequest(30),
  }), errorCode('OBSERVER_FACADE_CLOSED'));
});

test('T06-P9: optional Host observation sink failure never vetoes or forges the immutable K receipt', async () => {
  const rich = await observerApp();
  const persisted: unknown[] = [];
  const observer = observerFor(rich.facade, {
    persistObservation: async (trace: unknown) => { persisted.push(trace); throw new Error('disk full'); },
  });
  const observation = await observer.observeAndRecord({
    intent: intentOf('p9'),
    evidence: { observationId: 'obs:t06-p9', schema },
    semanticRequest: semanticRuleRequest(30),
  });
  assert.equal(observation.observationStore, 'failed');
  // The already-issued immutable K receipt and the observed trace are intact.
  assert.equal(observation.kernelReceipt.status, 'admitted');
  assert.equal(observation.decisionTrace.kernelOutcome, 'admitted');
  assert.equal(persisted.length, 1);
  // The sink receives the frozen attested trace itself: a write through it is
  // silently void (non-strict CJS) and can never rewrite the evidence handed
  // back to the deployment.
  assert.ok(Object.isFrozen(persisted[0]));
  (persisted[0] as { kernelOutcome: string }).kernelOutcome = 'forged';
  assert.equal(observation.decisionTrace.kernelOutcome, 'admitted');
  rich.dispose();
});

test('T06-N9: concurrent observations keep per-invocation Host counters isolated (review P1-1)', async () => {
  for (const order of ['rule-passes-while-model-held', 'second-model-passes-while-first-held'] as const) {
    const rich = await observerApp();
    let releaseHeld: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { releaseHeld = resolve; });
    let modelEntries = 0;
    // First model call parks on the gate; later calls settle immediately.
    const model = async (): Promise<{ disposition: string }> => {
      const entry = ++modelEntries;
      if (entry === 1) await held;
      return { disposition: 'review' };
    };
    const observer = observerFor(rich.facade, { semanticDeps: { model } });
    const requestWith = (suffix: string, semanticRequest: Record<string, unknown>) => observer.observeAndRecord({
      intent: intentOf(suffix, { amount: 42, requestId: `R-${suffix}` }),
      evidence: { observationId: `obs:t06-${suffix}`, schema },
      semanticRequest,
    });
    const modelRequest = { input: { amount: 42 }, schema, limits, fallback: { kind: 'model', operationId: 'model:quote' } };
    // Held observation A enters its model call first; observation B runs to
    // completion while A is parked, then A is released. Under the OLD shared
    // counter, B's start reset A's count (A read 0) or A's parked count
    // leaked into B — both orders must stay isolated here.
    const a = requestWith(`n9a-${order === 'rule-passes-while-model-held' ? 'r' : 'm'}`, modelRequest);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const b = order === 'rule-passes-while-model-held'
      ? requestWith('n9b-r', semanticRuleRequest(30))
      : requestWith('n9b-m', modelRequest);
    const bDone = await b;
    releaseHeld?.();
    const aDone = await a;
    assert.equal(aDone.decisionTrace.source, 'model');
    assert.deepEqual(aDone.decisionTrace.evidence.hostMeasured, { modelCalls: 1, toolCalls: 0 },
      `[${order}] the held model observation must count exactly its own call`);
    assert.equal(aDone.decisionTrace.evidence.modelCallStatus, 'host-verified');
    if (order === 'rule-passes-while-model-held') {
      assert.equal(bDone.decisionTrace.source, 'rule');
      assert.deepEqual(bDone.decisionTrace.evidence.hostMeasured, { modelCalls: 0, toolCalls: 0 },
        '[rule-passes-while-model-held] the Rule observation must see zero model calls despite the parked neighbor');
    } else {
      assert.equal(bDone.decisionTrace.source, 'model');
      assert.deepEqual(bDone.decisionTrace.evidence.hostMeasured, { modelCalls: 1, toolCalls: 0 },
        '[second-model-passes-while-first-held] each concurrent model observation must count exactly one call');
    }
    assert.equal(bDone.decisionTrace.evidence.modelCallStatus, 'host-verified');
    rich.dispose();
  }
});

test('T06-N10: the Host sink receives the final attested trace, not the pre-annotation base (review P1-2)', async () => {
  const rich = await observerApp();
  const stored: unknown[] = [];
  const observer = observerFor(rich.facade, {
    semanticDeps: { model: async () => ({ disposition: 'review' }) },
    persistObservation: async (trace: unknown) => { stored.push(trace); },
  });
  const observation = await observer.observeAndRecord({
    intent: intentOf('n10', { amount: 7, requestId: 'R-n10' }),
    evidence: { observationId: 'obs:t06-n10', schema },
    semanticRequest: { input: { amount: 7 }, schema, limits, fallback: { kind: 'model', operationId: 'model:quote' } },
  });
  assert.equal(observation.observationStore, 'callback-reported-success');
  assert.equal(stored.length, 1);
  const sinkTrace = stored[0] as Record<string, any>;
  // The stored evidence carries the exact attested facts, not 'unobserved'.
  assert.equal(sinkTrace.kernelOutcome, 'admitted');
  assert.equal(sinkTrace.kernelObservation.receiptSha256, observation.decisionTrace.kernelObservation.receiptSha256);
  assert.equal(sinkTrace.kernelObservation.messageId, 'msg:t06-n10');
  assert.deepEqual(sinkTrace.evidence.hostMeasured, { modelCalls: 1, toolCalls: 0 });
  assert.equal(sinkTrace.evidence.modelCallStatus, 'host-verified');
  assert.equal(sinkTrace.evidence.decisionProvenance, 'host-invoked-selected-feature');
  assert.ok(Object.isFrozen(sinkTrace));
  assert.equal(sinkTrace, observation.decisionTrace, 'the sink stores the very frozen trace returned to the deployment');
  rich.dispose();
});

test('T06-N11: a hanging Host sink reports unknown-timeout without vetoing the observation', async () => {
  const rich = await observerApp();
  const observer = observerFor(rich.facade, {
    persistObservation: () => new Promise<void>(() => {}),
    observationTimeoutMs: 10,
  });
  const observation = await observer.observeAndRecord({
    intent: intentOf('n11'),
    evidence: { observationId: 'obs:t06-n11', schema },
    semanticRequest: semanticRuleRequest(30),
  });
  assert.equal(observation.observationStore, 'unknown-timeout');
  assert.equal(observation.decisionTrace.kernelOutcome, 'admitted');
  assert.equal(observation.kernelReceipt.status, 'admitted');
  rich.dispose();
});
