import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitCentralDecision,
  deriveDurableControlTurnId,
} from '../../src/admission/index.js';
import type { DecisionResolverSource } from '../../src/decision-resolver/index.js';
import { PredicateContractViolation } from '../../src/workflow/index.js';
import {
  CAP_INVARIANT,
  RESERVE_INTENT,
  SpiedBaselineStore,
  admissionFixture,
  isAdmissionError,
  makeDefinition,
  makeRequest,
  quoteDecision,
  quoteEvent,
  resolvedFrom,
  target,
} from './helpers.js';

test('admission: the full frozen path admits a message turn in order with journal-first effects', async () => {
  const fixture = await admissionFixture();
  const outcome = await admitCentralDecision(makeRequest(), fixture.ports);
  assert.equal(outcome.status, 'admitted');
  if (outcome.status !== 'admitted') return;
  const admitted = outcome.admitted;
  assert.equal(admitted.transitionKey, 'approve');
  assert.equal(admitted.targetState, 'approved');
  assert.equal(admitted.governanceBindingDigest, fixture.pin.bindingDigest);
  assert.equal(
    admitted.durableControlTurnId,
    'turn:order-quote:instance%3A42:message:msg%3A1',
  );
  assert.equal(admitted.effects.length, 1);
  assert.equal(admitted.effects[0]?.disposition, 'executed');
  assert.equal(admitted.effects[0]?.effectType, 'effect:reserve');
  assert.equal(admitted.effects[0]?.idempotencyKey, 'reserve:quote:1');
  // §13.4 journal-first: every effect is durably committed before the plan returns.
  const records = fixture.journal.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]?.status, 'completed');
  // §21 resolver evidence echoes through the turn boundary.
  assert.deepEqual(admitted.resolver, {
    source: 'harness-machine',
    llmAvoided: false,
    freshModelCallCount: 1,
    cacheRead: 'disabled',
    telemetryEventCount: 0,
  });
  const toolRequest = fixture.tools.calls[0];
  assert.equal(toolRequest?.effectId, `${admitted.durableControlTurnId}/effect/1`);
  assert.equal(toolRequest?.durableControlTurnId, admitted.durableControlTurnId);
  assert.equal(toolRequest?.operationOrdinal, 1);
  assert.equal(toolRequest?.idempotencyKey, 'reserve:quote:1');
});

test('admission: no resolver source can bypass the pinned Hard Invariants', async () => {
  const sources: readonly DecisionResolverSource[] = [
    'rule',
    'exact-cache',
    'promoted-subworkflow',
    'harness-machine',
  ];
  for (const source of sources) {
    const fixture = await admissionFixture();
    const outcome = await admitCentralDecision(
      makeRequest({
        event: quoteEvent(500),
        resolved: resolvedFrom(source, quoteDecision(500)),
      }),
      fixture.ports,
    );
    assert.equal(outcome.status, 'denied', `${source} must be denied`);
    if (outcome.status !== 'denied') continue;
    assert.equal(outcome.denial.reason, 'hard-invariant');
    assert.equal(outcome.denial.invariantId, CAP_INVARIANT.invariantId);
    assert.equal(fixture.tools.calls.length, 0, `${source} must never reach the mutation path`);
    assert.equal(fixture.journal.getRecords().length, 0);
  }
});

test('admission: schema denial is source-agnostic and still proves the pinned governance gate', async () => {
  for (const source of ['harness-machine', 'exact-cache'] as const) {
    const fixture = await admissionFixture();
    const outcome = await admitCentralDecision(
      makeRequest({ resolved: resolvedFrom(source, { bogus: true }) }),
      fixture.ports,
    );
    assert.equal(outcome.status, 'denied');
    if (outcome.status !== 'denied') continue;
    assert.equal(outcome.denial.reason, 'schema');
    assert.equal(
      outcome.denial.governanceBindingDigest,
      fixture.pin.bindingDigest,
      'even a schema denial carries the exact pin evidence',
    );
    assert.equal(fixture.tools.calls.length, 0);
  }
});

test('admission: guard rejection is final — no transition, no effects, no hidden retry channel', async () => {
  // Baseline without the cap invariant so the decision reaches the guard, and
  // no guardless fallback transition for the same trigger.
  const fixture = await admissionFixture({ b1Invariants: [] });
  const resolved = resolvedFrom('harness-machine', quoteDecision(5000));
  const outcome = await admitCentralDecision(
    makeRequest({
      definition: makeDefinition({ omitReject: true }),
      event: quoteEvent(5000),
      resolved,
    }),
    fixture.ports,
  );
  assert.equal(outcome.status, 'denied');
  if (outcome.status !== 'denied') return;
  assert.equal(outcome.denial.reason, 'guard');
  assert.equal(outcome.denial.transitionKey, 'approve');
  assert.equal(outcome.denial.guardId, 'guard:amount-ok');
  assert.equal(fixture.tools.calls.length, 0);
  assert.equal(fixture.journal.getRecords().length, 0);
  // S7: admission holds no resolver port — the ResolvedDecision arrives as
  // data and there is no channel for a hidden retry after a denial.
  assert.deepEqual(Object.keys(fixture.ports).sort(), [
    'baselines',
    'effectJournal',
    'effectTools',
    'governance',
    'sha256',
  ]);
});

test('admission: a turn with no candidate transition is denied without effects', async () => {
  const fixture = await admissionFixture({ b1Invariants: [] });
  const outcome = await admitCentralDecision(
    makeRequest({
      trigger: { kind: 'event', eventType: 'UNKNOWN_EVENT' },
      event: { type: 'UNKNOWN_EVENT' },
    }),
    fixture.ports,
  );
  assert.equal(outcome.status, 'denied');
  if (outcome.status !== 'denied') return;
  assert.equal(outcome.denial.reason, 'no-candidate-transition');
  assert.equal(fixture.tools.calls.length, 0);
});

test('admission V5: guards carrying non-JSON (function) content are rejected at the preparation boundary', async () => {
  const fixture = await admissionFixture();
  const definition = makeDefinition({
    guards: [
      {
        guardId: 'guard:impure',
        predicate: {
          op: 'eq',
          left: { source: 'literal', value: (() => true) as unknown as string },
          right: { source: 'literal', value: 'x' },
        },
      },
      {
        guardId: 'guard:amount-ok',
        predicate: { op: 'constant', value: true },
      },
    ],
    approveGuardId: 'guard:impure',
  });
  await assert.rejects(
    () => admitCentralDecision(makeRequest({ definition }), fixture.ports),
    (error: unknown) => error instanceof PredicateContractViolation,
  );
  assert.equal(fixture.tools.calls.length, 0);
});

test('admission V5: a forged baseline carrying non-JSON Hard Invariant content fails closed before evaluation', async () => {
  const spied = new SpiedBaselineStore();
  const fixture = await admissionFixture({ baselines: spied });
  // A hostile store serving a body whose Hard Invariant content is not JSON:
  // digest verification canonicalizes the semantics and fails closed before
  // any predicate preparation or evaluation can occur.
  spied.fixedBody = {
    identity: fixture.b1.identity,
    semantics: {
      hardInvariants: [
        {
          invariantId: 'inv:impure',
          predicate: {
            op: 'eq',
            left: { source: 'literal', value: (() => true) as unknown as string },
            right: { source: 'literal', value: 'x' },
          },
        },
      ],
    } as unknown as typeof fixture.b1.semantics,
  };
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_PINNED_BASELINE_UNAVAILABLE'),
  );
  assert.equal(fixture.tools.calls.length, 0);
});

test('admission V6: a Harness decision flows the identical path and admission itself never sets state', async () => {
  const fixture = await admissionFixture();
  const outcome = await admitCentralDecision(makeRequest(), fixture.ports);
  assert.equal(outcome.status, 'admitted');
  if (outcome.status !== 'admitted') return;
  assert.equal(outcome.admitted.resolver.source, 'harness-machine');
  // The admitted output is a plan; admission never touched control state.
  assert.equal(fixture.durableStore.snapshotCount(), 0);
  // A Harness decision violating a Hard Invariant is denied like any source.
  const denied = await admitCentralDecision(
    makeRequest({
      event: quoteEvent(500),
      resolved: resolvedFrom('harness-machine', quoteDecision(500)),
    }),
    fixture.ports,
  );
  assert.equal(denied.status, 'denied');
});

test('admission: promoted effect intents in resolver provenance are never auto-executed', async () => {
  const fixture = await admissionFixture();
  const outcome = await admitCentralDecision(
    makeRequest({
      definition: makeDefinition({ approveEffects: [] }),
      resolved: resolvedFrom('promoted-subworkflow', quoteDecision(42)),
    }),
    fixture.ports,
  );
  assert.equal(outcome.status, 'admitted');
  if (outcome.status !== 'admitted') return;
  assert.equal(outcome.admitted.effects.length, 0, 'only the admitted transition declares executable effects');
  assert.equal(fixture.tools.calls.length, 0);
});

test('admission: unknown current state and unknown guard references fail closed', async () => {
  const fixture = await admissionFixture();
  await assert.rejects(
    () => admitCentralDecision(makeRequest({ currentStateKey: 'nowhere' }), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_UNKNOWN_STATE'),
  );
  await assert.rejects(
    () => admitCentralDecision(
      makeRequest({ definition: makeDefinition({ approveGuardId: 'guard:ghost' }) }),
      fixture.ports,
    ),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_UNKNOWN_GUARD'),
  );
});

test('admission: Durable Control Turn identity is deterministic per source kind', async () => {
  const message = { kind: 'message', sourceMessageId: 'msg:1' } as const;
  const child = {
    kind: 'child-terminal',
    parentActorId: 'decision:quote',
    childActorId: 'child:1',
    invocationOrdinal: 1,
    terminalKind: 'done',
  } as const;
  const timer = { kind: 'timer', timerId: 'timer:sla', fireOrdinal: 2 } as const;
  const callback = { kind: 'callback', externalCorrelationId: 'corr:9', callbackOrdinal: 1 } as const;
  const recovery = { kind: 'recovery', durableRecoveryActionId: 'recovery:7', resumeOrdinal: 3 } as const;
  const ids = [
    deriveDurableControlTurnId(target, message),
    deriveDurableControlTurnId(target, child),
    deriveDurableControlTurnId(target, timer),
    deriveDurableControlTurnId(target, callback),
    deriveDurableControlTurnId(target, recovery),
  ];
  assert.equal(new Set(ids).size, ids.length, 'distinct sources never collide');
  assert.equal(deriveDurableControlTurnId(target, message), ids[0], 'same source, same id');
  assert.equal(ids[0], 'turn:order-quote:instance%3A42:message:msg%3A1');
  assert.equal(ids[1], 'turn:order-quote:instance%3A42:child:decision%3Aquote:child%3A1:1:done');
  assert.equal(ids[2], 'turn:order-quote:instance%3A42:timer:timer%3Asla:2');
  assert.equal(ids[3], 'turn:order-quote:instance%3A42:callback:corr%3A9:1');
  assert.equal(ids[4], 'turn:order-quote:instance%3A42:recovery:recovery%3A7:3');
  assert.throws(
    () => deriveDurableControlTurnId(target, { kind: 'message', sourceMessageId: '' }),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_INVALID_TURN_SOURCE'),
  );
  assert.throws(
    () => deriveDurableControlTurnId(target, { kind: 'timer', timerId: 'timer:sla', fireOrdinal: 0 }),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_INVALID_TURN_SOURCE'),
  );
});

test('admission §17.7: a child-terminal turn admits and executes effects with no message-id hole', async () => {
  const fixture = await admissionFixture();
  const outcome = await admitCentralDecision(
    makeRequest({
      turn: {
        kind: 'child-terminal',
        parentActorId: 'decision:quote',
        childActorId: 'child:quote-review:1',
        invocationOrdinal: 1,
        terminalKind: 'done',
      },
      trigger: { kind: 'invocation_done', invocationKey: 'quote-review' },
      resolved: resolvedFrom('promoted-subworkflow', quoteDecision(42)),
    }),
    fixture.ports,
  );
  assert.equal(outcome.status, 'admitted');
  if (outcome.status !== 'admitted') return;
  assert.equal(outcome.admitted.transitionKey, 'approve-child');
  assert.equal(outcome.admitted.effects.length, 1);
  const effectId = outcome.admitted.effects[0]?.effectId ?? '';
  assert.ok(effectId.includes(':child:'), 'effect identity derives from the child-terminal turn id');
  assert.ok(!effectId.includes(':message:'), 'no message id appears in the effect identity');
  assert.equal(outcome.admitted.effects[0]?.disposition, 'executed');
});

test('admission §21: resolver telemetry and cache disposition surface at the turn boundary', async () => {
  const fixture = await admissionFixture();
  const outcome = await admitCentralDecision(
    makeRequest({
      resolved: resolvedFrom('exact-cache', quoteDecision(42), {
        cacheDisposition: { read: 'hit' },
        telemetry: [
          { type: 'cache-store-error', operation: 'write', message: 'degraded' },
          { type: 'cache-write-ineligible', reason: 'observed-live-dependency-without-semantic-revision' },
        ],
      }),
    }),
    fixture.ports,
  );
  assert.equal(outcome.status, 'admitted');
  if (outcome.status !== 'admitted') return;
  assert.deepEqual(outcome.admitted.resolver, {
    source: 'exact-cache',
    llmAvoided: true,
    freshModelCallCount: 0,
    cacheRead: 'hit',
    telemetryEventCount: 2,
  });
});

test('admission §15: a cache hit is not mutation — effects still execute through the durable journal', async () => {
  const fixture = await admissionFixture();
  const outcome = await admitCentralDecision(
    makeRequest({ resolved: resolvedFrom('exact-cache', quoteDecision(42)) }),
    fixture.ports,
  );
  assert.equal(outcome.status, 'admitted');
  if (outcome.status !== 'admitted') return;
  assert.equal(outcome.admitted.effects[0]?.disposition, 'executed');
  assert.equal(fixture.tools.calls.length, 1, 'mutation authority is the journal protocol, not the cache entry');
});

test('admission: multiple effect intents execute in declaration order under stable ordinals', async () => {
  const fixture = await admissionFixture();
  const secondIntent = { ...RESERVE_INTENT, idempotencyKey: 'reserve:quote:2' };
  const outcome = await admitCentralDecision(
    makeRequest({ definition: makeDefinition({ approveEffects: [RESERVE_INTENT, secondIntent] }) }),
    fixture.ports,
  );
  assert.equal(outcome.status, 'admitted');
  if (outcome.status !== 'admitted') return;
  assert.equal(outcome.admitted.effects.length, 2);
  assert.equal(fixture.tools.calls[0]?.operationOrdinal, 1);
  assert.equal(fixture.tools.calls[1]?.operationOrdinal, 2);
  assert.notEqual(outcome.admitted.effects[0]?.effectId, outcome.admitted.effects[1]?.effectId);
  assert.equal(fixture.journal.getRecords().length, 2);
});
