import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { OfflineGuidedJourney, JourneyRefusal, assertWireMessage, caseRefFor,
  type HostObservation, type HostReceipt } from '../../examples/v0103-guided-journey/journey.ts';

const now = 1_000;
const observation = (gms: HostObservation['gms'] = 'PRESENT_DISABLED',
  extra: Partial<HostObservation> = {}): HostObservation => ({
  snapshotId: 'redacted-device-1', revision: 1, gms, observedAtUnixMs: 900,
  validUntilUnixMs: 2_000, evidenceRefs: ['host:inventory:1'], ...extra,
});
const journey = (goal: 'gms' | 'debloat' = 'gms') => new OfflineGuidedJourney('journey-1', goal, () => now);
type Plan = ReturnType<OfflineGuidedJourney['next']>;
function step(plan: Plan) { assert.ok(plan.decision.step); return plan.decision.step; }
function outcome(issued: ReturnType<typeof step>, event = 'USER_SUBMIT', extra = {}) {
  return { messageType: 'step.outcome', contractVersion: 'dh.guided-journey/1',
    journeyId: 'journey-1', stepId: issued.stepId, event, evidenceRefs: ['host:inventory:1'], ...extra };
}
function withReceipt(next: HostObservation, issued: ReturnType<typeof step>,
  result: HostReceipt['outcome'] = 'CONFIRMED', event: HostReceipt['event'] = 'EFFECT_RECEIPT') {
  const receipt: HostReceipt = { receiptRef: 'host:receipt:1', journeyId: 'journey-1',
    stepId: issued.stepId, event, fromCaseRef: issued.caseRef, toCaseRef: caseRefFor(next),
    outcome: result, evidenceRefs: next.evidenceRefs };
  return { ...next, receipts: [receipt] };
}
const receiptOutcome = (issued: ReturnType<typeof step>, event = 'EFFECT_RECEIPT') =>
  outcome(issued, event, { receiptRef: 'host:receipt:1' });
const code = (expected: string) => (error: unknown) => error instanceof JourneyRefusal && error.code === expected;
function validPlan(plan: Plan) {
  assertWireMessage(plan.request);
  assertWireMessage(plan.decision);
  if (plan.decision.step) {
    assertWireMessage(plan.decision.step);
    assert.ok(plan.request.eligibleTemplateRefs.some(ref => ref.digest === step(plan).templateRef.digest));
  }
}

test('same goal and pinned catalog choose four different relevant steps without model/network dispatch', t => {
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected network dispatch'); });
  const expected = { PRESENT_ENABLED: 'SUMMARY', PRESENT_DISABLED: 'REVIEW_EFFECT', ABSENT: 'ASK', UNKNOWN: 'INSPECT' } as const;
  const pins: { digest: string }[] = [];
  for (const state of Object.keys(expected) as (keyof typeof expected)[]) {
    const j = journey();
    const plan = j.next(observation(state));
    validPlan(plan);
    assert.equal(step(plan).kind, expected[state]);
    pins.push(plan.request.catalogRef);
  }
  const first = pins[0];
  assert.ok(first);
  assert.ok(pins.every(pin => pin.digest === first.digest));
  assert.equal(network.mock.callCount(), 0);
});

test('debloat refuses a protected package and previews only a qualified reversible route', () => {
  const blocked = journey('debloat').next(observation('PRESENT_ENABLED', { packageProtected: true }));
  assert.equal(blocked.decision.status, 'BLOCKED');
  assert.equal(blocked.decision.reasonCode, 'PROTECTED_PACKAGE');
  assert.equal(blocked.decision.step, undefined);
  const allowed = journey('debloat').next(observation('PRESENT_ENABLED', { packageProtected: false, packageReversible: true }));
  assert.equal(step(allowed).templateRef.artifactId, 'review-debloat');
  assert.ok(step(allowed).actionPreviewRef);
  const missing = journey('debloat').next(observation('PRESENT_ENABLED'));
  assert.equal(step(missing).templateRef.artifactId, 'inspect-package');
  [blocked, allowed, missing].forEach(validPlan);
});

test('pre-BUILD assets and active pin are immutable, schema is the frozen read-only source', () => {
  const j = journey();
  const pin = j.assets.catalogRef.digest;
  const first = j.assets.templates[0];
  assert.ok(first);
  assert.ok(Object.isFrozen(first.spec));
  assert.equal(Reflect.set(j.assets.catalogRef, 'digest', 'f'.repeat(64)), false);
  assert.equal(Reflect.set(j, 'assets', { catalogRef: { digest: 'f'.repeat(64) } }), false);
  assert.equal(j.assets.catalogRef.digest, pin);
  const bytes = readFileSync(new URL('../../docs/product/v0.10.3/contracts/guided-journey-v1.schema.json', import.meta.url));
  assert.equal(j.assets.schemaSha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(Object.keys(j.assets.copy.en), Object.keys(j.assets.copy['zh-CN']));
});

test('optional static advisory is schema-valid and cannot change the Business candidate pool', () => {
  const j = journey();
  const obs = observation('UNKNOWN');
  const prepared = j.next(obs);
  const template = prepared.request.eligibleTemplateRefs[0];
  assert.ok(template);
  const advisory = { messageType: 'llm.advisory', contractVersion: 'dh.guided-journey/1',
    journeyId: 'journey-1', caseRef: caseRefFor(obs),
    suggestedTemplateRef: { digest: template.digest, version: template.version, artifactId: template.artifactId },
    reasonCode: 'ASK_FOR_READ_ONLY_EVIDENCE', evidenceRefs: ['host:inventory:1'] };
  const plan = j.next(obs, undefined, advisory);
  validPlan(plan);
  assert.equal(step(plan).kind, 'INSPECT');
  assert.equal(plan.decision.reasonCode, 'APPROVED_OFFLINE_RULE');
  const ineligible = j.assets.templates.find(item => item.ref.artifactId === 'review-enable')!;
  assert.throws(() => j.next(obs, undefined, { ...advisory, suggestedTemplateRef: ineligible.ref }), code('INVALID_CANDIDATE'));
  assert.throws(() => j.next(obs, undefined, { ...advisory, caseRef: { ...advisory.caseRef, digest: 'f'.repeat(64) } }), code('INVALID_CANDIDATE'));
  assert.throws(() => j.next(obs, undefined, { ...advisory, evidenceRefs: ['invented:evidence'] }), code('INVALID_CANDIDATE'));
  assert.throws(() => j.next(obs, undefined, { ...advisory, effectPermit: true }), code('INVALID_WIRE_MESSAGE'));
});

test('expired, regressed and same-revision changed observations are refused', () => {
  const j = journey();
  j.next(observation('PRESENT_DISABLED', { revision: 2 }));
  assert.throws(() => j.next(observation('PRESENT_DISABLED')), code('STALE_EVIDENCE'));
  assert.throws(() => journey().next(observation('PRESENT_DISABLED', { validUntilUnixMs: 999 })), code('STALE_EVIDENCE'));
  assert.throws(() => j.next(observation('PRESENT_ENABLED', { revision: 2 })), code('CASE_REVISION_CONFLICT'));
  assert.throws(() => journey().next(observation('UNKNOWN', { evidenceRefs: [] })), code('STALE_EVIDENCE'));
});

test('StepOutcome must match the actual issued step, allowed choices and current evidence', () => {
  const j = journey();
  const issued = step(j.next(observation()));
  assert.throws(() => j.next(observation(), outcome(issued, 'USER_SUBMIT', { stepId: 'invented' })), code('STALE_STEP'));
  assert.throws(() => j.next(observation(), outcome(issued, 'USER_SUBMIT', { selectedOptionIds: ['invented'] })), code('INVALID_CHOICE'));
  assert.throws(() => j.next(observation(), outcome(issued)), code('INVALID_CHOICE'));
  assert.throws(() => j.next(observation(), outcome(issued, 'USER_SUBMIT', {
    selectedOptionIds: ['review-enable'], evidenceRefs: ['invented:evidence'],
  })), code('FORGED_EVIDENCE'));
  assert.throws(() => j.next(observation('PRESENT_ENABLED', { revision: 2 }), outcome(issued, 'USER_SUBMIT', {
    selectedOptionIds: ['review-enable'],
  })), code('STALE_EVIDENCE'));
});

test('review confirmation is not a K permit, actual confirmed effect still requires read-only verification', () => {
  const j = journey();
  const obs = observation();
  const issued = step(j.next(obs));
  const preview = j.next(obs, outcome(issued, 'USER_SUBMIT', { selectedOptionIds: ['review-enable'] }));
  assert.equal(preview.decision.status, 'NEED_EVIDENCE');
  assert.equal(preview.decision.reasonCode, 'SEPARATE_K_PERMIT_REQUIRED');
  const changed = withReceipt(observation('PRESENT_ENABLED', { revision: 2 }), issued);
  const plan = j.next(changed, receiptOutcome(issued));
  validPlan(plan);
  assert.equal(step(plan).kind, 'VERIFY_OUTCOME');
  assert.equal(plan.decision.reasonCode, 'VERIFY_EFFECT');
  assert.equal(step(plan).actionPreviewRef, undefined);
});

test('UNKNOWN remains non-success until an explicitly bound Host observation receipt reconciles it', () => {
  const j = journey();
  const issued = step(j.next(observation()));
  const uncertain = withReceipt(observation('UNKNOWN', { revision: 2 }), issued, 'UNKNOWN');
  const unknown = j.next(uncertain, receiptOutcome(issued));
  validPlan(unknown);
  assert.equal(unknown.decision.reasonCode, 'RECONCILE_UNKNOWN');
  assert.equal(step(unknown).kind, 'VERIFY_OUTCOME');
  const merelyChanged = j.next(observation('PRESENT_ENABLED', { revision: 3 }));
  assert.equal(step(merelyChanged).kind, 'VERIFY_OUTCOME');
  const stillUnknown = j.next(observation('PRESENT_ENABLED', { revision: 3 }), outcome(step(merelyChanged)));
  assert.equal(stillUnknown.decision.status, 'NEED_EVIDENCE');
  const verified = withReceipt(observation('PRESENT_ENABLED', { revision: 4 }), step(merelyChanged), 'CONFIRMED', 'OBSERVATION_RECEIPT');
  const summary = j.next(verified, receiptOutcome(step(merelyChanged), 'OBSERVATION_RECEIPT'));
  validPlan(summary);
  assert.equal(step(summary).kind, 'SUMMARY');
  assert.equal(j.next(verified, outcome(step(summary))).decision.status, 'DONE');
});

test('confirmed failure exposes recovery, with no silent re-dispatch or successful result', () => {
  const j = journey();
  const issued = step(j.next(observation()));
  const failed = withReceipt(observation('PRESENT_DISABLED', { revision: 2 }), issued, 'FAILED');
  const recovery = j.next(failed, receiptOutcome(issued));
  validPlan(recovery);
  assert.equal(step(recovery).templateRef.artifactId, 'recover');
  assert.equal(recovery.decision.reasonCode, 'CONFIRMED_FAILURE');
  assert.equal(step(j.next(failed)).templateRef.artifactId, 'recover');
});

test('a receipt string alone, stale case binding, or receipt replay cannot assert success', () => {
  const j = journey();
  const issued = step(j.next(observation()));
  const next = observation('PRESENT_ENABLED', { revision: 2 });
  assert.throws(() => j.next(next, receiptOutcome(issued)), code('UNVERIFIED_RECEIPT'));
  const wrong = withReceipt(next, issued);
  const wrongReceipt = wrong.receipts[0];
  assert.ok(wrongReceipt);
  wrongReceipt.toCaseRef = { snapshotId: 'stale', digest: '0'.repeat(64) };
  assert.throws(() => j.next(wrong, receiptOutcome(issued)), code('UNVERIFIED_RECEIPT'));
  j.next(withReceipt(next, issued), receiptOutcome(issued));
  assert.throws(() => j.next(withReceipt(next, issued), receiptOutcome(issued)), code('STALE_STEP'));
});

test('pause/resume re-evaluates fresh CaseRef and BACK never replays an effect or its consent', () => {
  const j = journey();
  const issued = step(j.next(observation()));
  assert.equal(j.next(observation(), outcome(issued, 'PAUSE')).decision.status, 'WAIT');
  assert.equal(j.next(observation()).decision.status, 'WAIT');
  const resumed = j.next(observation('PRESENT_ENABLED', { revision: 2 }), outcome(issued, 'RESUME'));
  validPlan(resumed);
  assert.equal(step(resumed).kind, 'SUMMARY');
  assert.notEqual(step(resumed).stepId, issued.stepId);
  const k = journey();
  const effectStep = step(k.next(observation()));
  const newCase = withReceipt(observation('PRESENT_ENABLED', { revision: 2 }), effectStep);
  const verify = k.next(newCase, receiptOutcome(effectStep));
  const back = k.next(newCase, outcome(step(verify), 'BACK'));
  assert.equal(step(back).kind, 'VERIFY_OUTCOME');
  assert.equal(step(back).actionPreviewRef, undefined);
});

test('rejected advisory/outcome cannot partially change pause or receipt state', () => {
  const j = journey();
  const issued = step(j.next(observation('UNKNOWN')));
  assert.throws(() => j.next(observation('UNKNOWN'), outcome(issued, 'PAUSE'), {
    messageType: 'llm.advisory', contractVersion: 'dh.guided-journey/1', journeyId: 'journey-1',
    caseRef: caseRefFor(observation('UNKNOWN')), suggestedTemplateRef: j.assets.templates.at(0)!.ref,
    reasonCode: 'NO_AUTHORITY', evidenceRefs: [],
  }), code('INVALID_CANDIDATE'));
  assert.equal(j.next(observation('UNKNOWN')).decision.status, 'STEP');
});

test('canonical Schema rejects oversized/unknown wire data and required receipt omission', () => {
  const j = journey();
  const issued = step(j.next(observation()));
  assert.throws(() => assertWireMessage({ ...issued, unknownAuthority: true }), code('INVALID_WIRE_MESSAGE'));
  assert.throws(() => assertWireMessage({ ...issued, evidenceRefs: Array(25).fill('x') }), code('INVALID_WIRE_MESSAGE'));
  assert.throws(() => assertWireMessage(outcome(issued, 'EFFECT_RECEIPT')), code('INVALID_WIRE_MESSAGE'));
});
