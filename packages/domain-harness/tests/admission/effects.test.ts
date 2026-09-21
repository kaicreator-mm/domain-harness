import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VolatileAdmissionEffectJournal,
  admitCentralDecision,
  deriveDurableControlTurnId,
  type AdmissionEffectJournalRecord,
} from '../../src/admission/index.js';
import {
  NOW,
  RESERVE_INTENT,
  admissionFixture,
  isAdmissionError,
  makeDefinition,
  makeRequest,
  quoteEvent,
  resolvedFrom,
  target,
  type AdmissionFixture,
} from './helpers.js';

const MESSAGE_TURN = { kind: 'message', sourceMessageId: 'msg:1' } as const;

function effectRecord(
  overrides: Partial<AdmissionEffectJournalRecord> = {},
): AdmissionEffectJournalRecord {
  const turnId = deriveDurableControlTurnId(target, MESSAGE_TURN);
  return {
    effectId: `${turnId}/effect/1`,
    target,
    durableControlTurnId: turnId,
    operationOrdinal: 1,
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    status: 'started',
    attempt: 1,
    input: RESERVE_INTENT.input,
    idempotencyKey: 'reserve:quote:1',
    startedAt: NOW,
    ...overrides,
  };
}

async function admittedEffects(fixture: AdmissionFixture) {
  const outcome = await admitCentralDecision(makeRequest(), fixture.ports);
  assert.equal(outcome.status, 'admitted');
  if (outcome.status !== 'admitted') throw new Error('expected admission');
  return outcome.admitted;
}

test('effects: an effect tool failure commits the failed journal record before failing the turn', async () => {
  const fixture = await admissionFixture({ failTool: () => new Error('reserve backend down') });
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_EFFECT_FAILED')
      && (error as Error).message.includes('reserve backend down'),
  );
  // §13.4: the failure is durably committed; no admitted plan was returned.
  const records = fixture.journal.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]?.status, 'failed');
  assert.deepEqual(records[0]?.error, { message: 'reserve backend down' });
  assert.equal(fixture.tools.calls.length, 1);
});

test('effects: a durably failed effect is never retried by a later admission of the same turn', async () => {
  const first = await admissionFixture({ failTool: () => new Error('down') });
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), first.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_EFFECT_FAILED'),
  );
  const replay = await admissionFixture({ journal: first.journal });
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), replay.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_EFFECT_FAILED'),
  );
  assert.equal(replay.tools.calls.length, 0, 'a durable failed outcome admits no hidden retry');
});

test('effects V12/V8: a completed effect is replayed after a crash and never re-executed', async () => {
  const first = await admissionFixture();
  const admittedFirst = await admittedEffects(first);
  assert.equal(admittedFirst.effects[0]?.disposition, 'executed');
  assert.equal(first.tools.calls.length, 1);

  // Simulated crash + reopen: fresh orchestrator objects over the SAME
  // durable journal/pin/baseline stores.
  const recovered = await admissionFixture({
    journal: first.journal,
    baselines: first.baselines,
    durableStore: first.durableStore,
  });
  const admittedSecond = await admittedEffects(recovered);
  assert.equal(admittedSecond.effects[0]?.disposition, 'replayed');
  assert.deepEqual(admittedSecond.effects[0]?.output, admittedFirst.effects[0]?.output);
  assert.equal(
    recovered.tools.calls.length,
    0,
    'committed work is not repeated; only the durable journal decides reuse',
  );
});

test('effects V8: a decision claiming prior mutation does not suppress execution when the journal lacks the fact', async () => {
  const fixture = await admissionFixture();
  // The structured decision claims the reservation already happened; the
  // durable effect journal holds no such committed fact.
  const resolved = resolvedFrom('harness-machine', {
    decision: { outcome: 'approve', data: { amount: 42, reserved: true } },
    event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
  });
  const outcome = await admitCentralDecision(
    makeRequest({ resolved, event: quoteEvent(42) }),
    fixture.ports,
  );
  assert.equal(outcome.status, 'admitted');
  if (outcome.status !== 'admitted') return;
  assert.equal(outcome.admitted.effects[0]?.disposition, 'executed');
  assert.equal(
    fixture.tools.calls.length,
    1,
    'evidence/provenance claims never prove mutation; the journal is the only authority',
  );
});

test('effects: a started non-idempotent record is ambiguous and fails closed', async () => {
  const fixture = await admissionFixture();
  await fixture.journal.beginEffect(effectRecord());
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_EFFECT_AMBIGUOUS'),
  );
  assert.equal(fixture.tools.calls.length, 0, 'possibly-completed work is never silently repeated');
});

test('effects: a started idempotent record may re-execute under the same identity', async () => {
  const fixture = await admissionFixture({ bindings: { 'effect:reserve': 'idempotent' } });
  await fixture.journal.beginEffect(effectRecord({ effectSemantics: 'idempotent' }));
  const admitted = await admittedEffects(fixture);
  assert.equal(admitted.effects[0]?.disposition, 'executed');
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords()[0]?.status, 'completed');
});

test('effects: an incompatible journal identity for the same effect id fails closed', async () => {
  const fixture = await admissionFixture();
  await fixture.journal.beginEffect(effectRecord({ input: { reservation: 'other' } }));
  await fixture.journal.completeEffect(effectRecord().effectId, {
    status: 'completed',
    output: { reserved: true },
    completedAt: NOW,
  });
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_EFFECT_JOURNAL_CONFLICT'),
  );
  assert.equal(fixture.tools.calls.length, 0);
});

test('effects: an effect type without a declared mutation-capable binding fails closed', async () => {
  const fixture = await admissionFixture();
  const definition = makeDefinition({
    approveEffects: [{ effectType: 'effect:undeclared', input: {} }],
  });
  await assert.rejects(
    () => admitCentralDecision(makeRequest({ definition }), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_EFFECT_TOOL_UNBOUND'),
  );
  assert.equal(fixture.journal.getRecords().length, 0, 'unbound tools never enter the journal');
  assert.equal(fixture.tools.calls.length, 0);
});

test('effects: a started none-semantics record may re-execute under the same identity (review P3-3)', async () => {
  const fixture = await admissionFixture({ bindings: { 'effect:reserve': 'none' } });
  await fixture.journal.beginEffect(effectRecord({ effectSemantics: 'none' }));
  const admitted = await admittedEffects(fixture);
  assert.equal(admitted.effects[0]?.disposition, 'executed');
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords()[0]?.status, 'completed');
});

test('effects: a journal failure while committing the failed record surfaces as a journal conflict (review P3-2)', async () => {
  class UnwritableJournal extends VolatileAdmissionEffectJournal {
    override async completeEffect(): Promise<never> {
      throw new Error('journal disk full');
    }
  }
  const fixture = await admissionFixture({
    journal: new UnwritableJournal(),
    failTool: () => new Error('reserve backend down'),
  });
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_EFFECT_JOURNAL_CONFLICT')
      && (error as Error).message.includes('reserve backend down'),
  );
});

test('effects: the journal itself rejects non-canonical outcomes (review P3-4)', async () => {
  const fixture = await admissionFixture();
  const record = effectRecord();
  await fixture.journal.beginEffect(record);
  await assert.rejects(
    () => fixture.journal.completeEffect(record.effectId, {
      status: 'completed',
      output: { callback: (() => true) as unknown as string },
      completedAt: NOW,
    }),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_EFFECT_JOURNAL_CONFLICT'),
  );
});

test('effects: idempotency identity excludes volatile execution detail', async () => {
  const fixture = await admissionFixture();
  const begun = await fixture.journal.beginEffect(effectRecord({ attempt: 1, startedAt: NOW }));
  const rebegun = await fixture.journal.beginEffect(
    effectRecord({ attempt: 99, startedAt: '2027-01-01T00:00:00.000Z' }),
  );
  assert.equal(begun.disposition, 'created');
  assert.equal(rebegun.disposition, 'existing');
  assert.equal(rebegun.record.attempt, 1, 'the durable attempt does not advance on re-begin');
  assert.equal(rebegun.record.startedAt, NOW);
});
