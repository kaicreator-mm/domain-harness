// v0.6 T007 (issue #585, frozen L2 C5): portable cross-delta conformance
// journeys — scenarios 1, 5, 7, 8, 11 and 13 of the 14 mandatory #585
// scenarios. Each journey composes the EXISTING v0.6 authorities end-to-end:
// compiled T001 declaration → resolveAndAdmitTurn seam (T004) → existing
// DecisionResolver → Central Admission → T006 Decision Resolution Receipt →
// Runtime Observation projection, with the T005 declared unavailable
// disposition composed on the no-model paths. No new feature, no redesign:
// every assertion is against existing contract facts.
//
//  #585-1  deterministic-only journey with no model configured
//  #585-5  guard rejection AFTER model proposal is final; honest receipt
//  #585-7  T005 composed fail-closed: typed unavailable terminal, zero effect
//  #585-8  T005+T006 composed declared-event through Admission, honest receipt
//  #585-11 multi-turn receipt/observation correlation without contradiction
//  #585-13 failure-category distinctness at the composed boundary
import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveDurableControlTurnId } from '../../src/admission/index.js';
import {
  createXStateHarnessMachineRunner,
  DecisionResolverError,
} from '../../src/decision-resolver/index.js';
import { DomainRuntimeV3Error } from '../../src/runtime/runtime-v3-errors.js';
import { ScriptedModel, quoteResult } from '../decision-resolver/helpers.js';
import type { QuoteDecisionResult } from '../decision-resolver/helpers.js';
import {
  CapturingRule,
  conformanceFixture,
  expectAdmitted,
  expectDenied,
  harnessMaterial,
  openAndPinInstance,
  queryHarnessMaterial,
  quoteDecisionDescriptor,
  readReceiptRecords,
  resolverFixture,
  target,
  turnRequest,
  makeDefinition,
  quoteEvent,
} from './fixtures.js';

/* ------------------------------------------------------------------------ */
/* #585-1 — deterministic-only end-to-end journey, zero model access         */
/* ------------------------------------------------------------------------ */

test('#585-1: deterministic-only journey — compiled declaration → seam → Rule → Admission → receipt → observation with zero model access', async () => {
  const fixture = await conformanceFixture([await quoteDecisionDescriptor()]);
  await openAndPinInstance(fixture);
  const model = new ScriptedModel([]); // would throw if the journey touched it
  const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });

  const outcome = await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule,
    resolver: { harnessRunner: createXStateHarnessMachineRunner() },
    harness: harnessMaterial(model),
  }));
  const admitted = expectAdmitted(outcome).admitted;

  // Every authority intact: the declared transition ran through the existing
  // durable effect authority exactly once.
  assert.equal(admitted.transitionKey, 'approve');
  assert.equal(admitted.targetState, 'approved');
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);
  assert.equal(fixture.journal.getRecords()[0]!.durableControlTurnId, admitted.durableControlTurnId);

  // Zero model access: the rule resolved before the Harness fallback stage.
  assert.equal(admitted.resolver.source, 'rule');
  assert.equal(admitted.resolver.llmAvoided, true);
  assert.equal(admitted.resolver.freshModelCallCount, 0);
  assert.equal(model.calls, 0);
  assert.equal(rule.calls, 1);

  // The T006 receipt rode the return AND is durably projected through the
  // EXISTING observation stream (read back through existing cursor paging).
  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 1);
  const receipt = receipts[0]!.receipt;
  assert.equal(receipt.disposition, 'admitted');
  assert.equal(receipt.source, 'rule');
  assert.equal(receipt.freshModelCallCount, 0);
  assert.equal(receipt.llmAvoided, true);
  assert.equal(receipt.decisionId, 'quote-decision');
  assert.equal(receipt.durableControlTurnId, admitted.durableControlTurnId);
  assert.equal(receipt.governanceBindingDigest, admitted.governanceBindingDigest);
});

/* ------------------------------------------------------------------------ */
/* #585-5 — guard rejection AFTER model proposal: final, honest receipt      */
/* ------------------------------------------------------------------------ */

test('#585-5: guard rejection after a model proposal is final — no retry, no effect, no journal mutation; the receipt/observation shows the bounded category without business-truth invention', async () => {
  const fixture = await conformanceFixture([await quoteDecisionDescriptor()]);
  await openAndPinInstance(fixture);
  const harness = resolverFixture(); // the model WILL be called once (proposal)

  const denied = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { harnessRunner: harness.runner },
    harness: harnessMaterial(harness.model),
    dependencies: { artifacts: [{
      kind: 'harness-config',
      artifactId: 'harness:quote',
      contentDigest: 'digest-harness:quote',
    }] },
    definition: makeDefinition({
      approveGuardId: 'guard:tiny',
      omitReject: true,
      guards: [{
        guardId: 'guard:tiny',
        predicate: {
          op: 'lte',
          left: { source: 'event', path: ['payload', 'amount'] },
          right: { source: 'literal', value: 50 },
        },
      }],
    }),
    event: quoteEvent(80),
    turn: { kind: 'message', sourceMessageId: 'msg:5-guard' },
  })));

  // The proposal was produced (exactly once) and then rejected FINALly.
  assert.equal(harness.model.calls, 1, 'the model is never re-invoked after the denial');
  assert.equal(denied.denial.reason, 'guard');
  assert.equal(denied.denial.guardId, 'guard:tiny');
  assert.equal(denied.denial.resolver.source, 'harness-machine');
  assert.equal(fixture.tools.calls.length, 0, 'no effect execution after denial');
  assert.equal(fixture.journal.getRecords().length, 0, 'no journal mutation after denial');

  // Receipt/observation: bounded category, honest proposal evidence, no
  // invented success.
  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 1);
  const receipt = receipts[0]!.receipt;
  assert.equal(receipt.disposition, 'denied');
  assert.equal(receipt.source, 'harness-machine');
  assert.equal(receipt.freshModelCallCount, 1, 'the receipt honestly reports the fresh model proposal');
  assert.equal(receipt.llmAvoided, false);
  assert.deepEqual(receipt.failure, {
    kind: 'admission-denied',
    reason: 'guard',
    guardId: 'guard:tiny',
    transitionKey: 'approve',
  });
});

/* ------------------------------------------------------------------------ */
/* #585-7 — T005 composed fail-closed: typed unavailable terminal            */
/* ------------------------------------------------------------------------ */

test('#585-7: no-model + required semantics + declared fail-closed → typed unavailable terminal; journey ends with zero effect and zero journal mutation', async () => {
  const fixture = await conformanceFixture([
    await quoteDecisionDescriptor({ unavailable: { kind: 'fail-closed' } }),
  ]);
  await openAndPinInstance(fixture);
  const rule = new CapturingRule({ status: 'no-match' });

  let captured: unknown;
  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule,
      // No harness material and no runner: fresh semantics are required and
      // model capability is unavailable — the resolver's existing availability
      // signal fires and the compiled disposition decides.
    })),
    (candidate: unknown) => {
      captured = candidate;
      return candidate instanceof DomainRuntimeV3Error;
    },
  );
  const error = captured as DomainRuntimeV3Error;
  assert.equal(error.code, 'RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE');
  assert.ok(!(error instanceof DecisionResolverError), 'the typed terminal is its own category');

  // The deterministic sources ran, but nothing was fabricated: no model
  // answer, no effect, no journal record.
  assert.equal(rule.calls, 1);
  assert.equal(fixture.tools.calls.length, 0);
  assert.equal(fixture.journal.getRecords().length, 0);

  // The bounded unavailable receipt was projected BEFORE the typed terminal.
  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 1);
  const receipt = receipts[0]!.receipt;
  assert.equal(receipt.disposition, 'semantic-unavailable');
  assert.deepEqual(receipt.failure, { kind: 'semantic-unavailable' });
  assert.equal(receipt.source, undefined, 'no fabricated source: nothing resolved');
  assert.equal(receipt.freshModelCallCount, undefined);
});

/* ------------------------------------------------------------------------ */
/* #585-8 — T005+T006 composed declared-event through Admission              */
/* ------------------------------------------------------------------------ */

test('#585-8: declared-event disposition carries the declared material through Admission end-to-end with all gates intact and honest receipt evidence', async () => {
  // Strict schema: admission can only admit if the carried material was
  // EXACTLY the declared outcome/eventType — nothing invented at runtime.
  const fixture = await conformanceFixture([
    await quoteDecisionDescriptor({
      unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'reject' },
      resultSchema: {
        type: 'object',
        required: ['decision', 'event'],
        properties: {
          decision: {
            type: 'object',
            required: ['outcome'],
            properties: { outcome: { enum: ['reject'] } },
          },
          event: {
            type: 'object',
            required: ['type'],
            properties: { type: { enum: ['QUOTE_DECIDED'] } },
          },
        },
      },
    }),
  ]);
  await openAndPinInstance(fixture);
  const rule = new CapturingRule({ status: 'no-match' });

  const admitted = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule,
    turn: { kind: 'message', sourceMessageId: 'msg:8-declared' },
  }))).admitted;

  // Guard/invariant/schema gates intact: the SAME admission path admitted the
  // declared material and executed the declared transition effect.
  assert.equal(admitted.transitionKey, 'approve');
  assert.equal(admitted.targetState, 'approved');
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);

  // Honest receipt evidence: the source is declared-unavailable, never a
  // model/harness product.
  assert.equal(admitted.resolver.source, 'declared-unavailable');
  assert.equal(admitted.resolver.freshModelCallCount, 0);
  assert.equal(admitted.resolver.llmAvoided, true);
  assert.equal(rule.calls, 1);

  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 1);
  const receipt = receipts[0]!.receipt;
  assert.equal(receipt.disposition, 'admitted');
  assert.equal(receipt.source, 'declared-unavailable');
  assert.equal(receipt.freshModelCallCount, 0);
  assert.equal(receipt.llmAvoided, true);
  assert.equal(receipt.failure, undefined);

  // A denial of the declared material is FINAL and honestly categorized:
  // guards/hard invariants still apply (pinned invariant denies amount > 100).
  const deniedFixture = await conformanceFixture([
    await quoteDecisionDescriptor({
      unavailable: { kind: 'declared-event', eventType: 'QUOTE_DECIDED', outcome: 'reject' },
    }),
  ]);
  await openAndPinInstance(deniedFixture);
  const denied = expectDenied(await deniedFixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    event: quoteEvent(5000),
    turn: { kind: 'message', sourceMessageId: 'msg:8-denied' },
  })));
  assert.equal(denied.denial.reason, 'hard-invariant');
  assert.equal(denied.denial.resolver.source, 'declared-unavailable');
  assert.equal(deniedFixture.tools.calls.length, 0);
  const deniedReceipts = await readReceiptRecords(deniedFixture);
  assert.equal(deniedReceipts.length, 1);
  assert.equal(deniedReceipts[0]!.receipt.disposition, 'denied');
  assert.equal(deniedReceipts[0]!.receipt.source, 'declared-unavailable');
  assert.equal(deniedReceipts[0]!.receipt.failure?.kind, 'admission-denied');
});

/* ------------------------------------------------------------------------ */
/* #585-11 — multi-turn correlation of receipt/observation identities        */
/* ------------------------------------------------------------------------ */

test('#585-11: receipt/observation identities correlate across consecutive turns without contradiction', async () => {
  const fixture = await conformanceFixture([await quoteDecisionDescriptor()]);
  await openAndPinInstance(fixture);
  const declaration = fixture.declarations[0]!;

  const first = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    turn: { kind: 'message', sourceMessageId: 'msg:11-a' },
  })));
  const second = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    turn: { kind: 'message', sourceMessageId: 'msg:11-b' },
  })));

  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 2);
  const [r1, r2] = [receipts[0]!.receipt, receipts[1]!.receipt];

  // Correlation: the stable compiled identities are SHARED across turns.
  assert.equal(r1.decisionId, 'quote-decision');
  assert.equal(r2.decisionId, r1.decisionId);
  assert.equal(r1.declarationDigest, declaration.declarationDigest);
  assert.equal(r2.declarationDigest, r1.declarationDigest);
  assert.equal(r1.workflowInstanceId, r2.workflowInstanceId);
  assert.equal(r1.workflowTarget, r2.workflowTarget);

  // Without contradiction: each turn's durable identity is distinct and each
  // equals the SAME deterministic derivation Central Admission and the effect
  // journal use for that turn.
  assert.notEqual(r1.durableControlTurnId, r2.durableControlTurnId);
  assert.equal(r1.durableControlTurnId, first.admitted.durableControlTurnId);
  assert.equal(r2.durableControlTurnId, second.admitted.durableControlTurnId);
  assert.equal(
    r1.durableControlTurnId,
    deriveDurableControlTurnId(target, { kind: 'message', sourceMessageId: 'msg:11-a' }),
  );

  // The observation stream recorded both, in order, contiguously.
  assert.ok(receipts[0]!.sequence < receipts[1]!.sequence);
  assert.equal(fixture.journal.getRecords().length, 2);
  const journalTurnIds = new Set(fixture.journal.getRecords().map((record) => record.durableControlTurnId));
  assert.ok(journalTurnIds.has(r1.durableControlTurnId));
  assert.ok(journalTurnIds.has(r2.durableControlTurnId));
});

/* ------------------------------------------------------------------------ */
/* #585-13 — failure-category distinctness at the composed boundary          */
/* ------------------------------------------------------------------------ */

test('#585-13a: max-step exhaustion is never success — bounds exhaustion surfaces as a bounded resolver failure with no effect and no fabricated admission', async () => {
  // The declaration's OWN compiled maxSteps bound the harness: a model that
  // keeps answering queries can never reach a final answer.
  const fixture = await conformanceFixture([
    await quoteDecisionDescriptor({ maxSteps: 2 }),
  ]);
  await openAndPinInstance(fixture);
  const queryModel = new ScriptedModel([
    { kind: 'query', call: { capabilityId: 'quotes.lookup', input: {} } },
    { kind: 'query', call: { capabilityId: 'quotes.lookup', input: {} } },
  ]);

  let captured: unknown;
  await assert.rejects(
    () => fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      resolver: { harnessRunner: createXStateHarnessMachineRunner() },
      harness: queryHarnessMaterial(queryModel),
      turn: { kind: 'message', sourceMessageId: 'msg:13-bounds' },
    })),
    (candidate: unknown) => {
      captured = candidate;
      return candidate instanceof DecisionResolverError;
    },
  );
  const error = captured as DecisionResolverError;
  assert.equal(error.code, 'DECISION_RESOLVER_HARNESS_FAILED');
  assert.ok(error.message.includes('MAX_STEPS_EXHAUSTED'), 'the bounds-exhaustion meaning is preserved');
  assert.equal(fixture.tools.calls.length, 0, 'exhaustion never executes an effect');
  assert.equal(fixture.journal.getRecords().length, 0);

  // The receipt keeps the bounded category: resolver-failed, never admitted.
  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]!.receipt.disposition, 'resolver-failed');
  assert.equal(receipts[0]!.receipt.failure?.kind, 'resolver-failure');
  assert.equal(receipts[0]!.receipt.source, undefined, 'no fabricated source: nothing was produced');
});

test('#585-13b: unavailable is never admission-denied and resolver failure is never silent success — the composed terminal categories stay pairwise distinct', async () => {
  // (1) semantic-unavailable terminal (T005 fail-closed composition).
  const unavailableFixture = await conformanceFixture([
    await quoteDecisionDescriptor({ unavailable: { kind: 'fail-closed' } }),
  ]);
  await openAndPinInstance(unavailableFixture);
  await assert.rejects(
    () => unavailableFixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      turn: { kind: 'message', sourceMessageId: 'msg:13b-unavail' },
    })),
    (error: unknown) => error instanceof DomainRuntimeV3Error
      && error.code === 'RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE',
  );

  // (2) admission-denied terminal (same declaration shape, pinned invariant
  // denies the proposed material after a successful resolution).
  const deniedFixture = await conformanceFixture([
    await quoteDecisionDescriptor({ unavailable: { kind: 'fail-closed' } }),
  ]);
  await openAndPinInstance(deniedFixture);
  const denied = expectDenied(await deniedFixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    event: quoteEvent(5000),
    turn: { kind: 'message', sourceMessageId: 'msg:13b-denied' },
  })));
  assert.equal(denied.denial.reason, 'hard-invariant');

  // (3) resolver-failure terminal (rule integrity failure — never silent).
  const ruleFailFixture = await conformanceFixture([
    await quoteDecisionDescriptor(),
  ]);
  await openAndPinInstance(ruleFailFixture);
  await assert.rejects(
    () => ruleFailFixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new ThrowingRule(),
      turn: { kind: 'message', sourceMessageId: 'msg:13b-rulefail' },
    })),
    (error: unknown) => error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_RULE_FAILED',
  );
  assert.equal(ruleFailFixture.tools.calls.length, 0);

  // The three composed categories are pairwise distinct — no collapse.
  const unavailableReceipts = await readReceiptRecords(unavailableFixture);
  const deniedReceipts = await readReceiptRecords(deniedFixture);
  const ruleFailReceipts = await readReceiptRecords(ruleFailFixture);
  assert.equal(unavailableReceipts.length, 1);
  assert.equal(deniedReceipts.length, 1);
  assert.equal(ruleFailReceipts.length, 1);
  assert.equal(unavailableReceipts[0]!.receipt.disposition, 'semantic-unavailable');
  assert.equal(deniedReceipts[0]!.receipt.disposition, 'denied');
  assert.equal(ruleFailReceipts[0]!.receipt.disposition, 'resolver-failed');
  const spellings = new Set([
    unavailableReceipts[0]!.receipt.disposition,
    deniedReceipts[0]!.receipt.disposition,
    ruleFailReceipts[0]!.receipt.disposition,
  ]);
  assert.equal(spellings.size, 3, 'the bounded categories never collapse into one another');
});

/** Rule port whose evaluation always fails closed (integrity failure). */
class ThrowingRule {
  readonly producerIdentity = {
    kind: 'rule' as const,
    artifactId: 'rule:broken',
    contentDigest: 'digest-rule:broken',
  };

  async evaluate(): Promise<{ readonly status: 'no-match' } | { readonly status: 'match'; readonly result: QuoteDecisionResult }> {
    throw new Error('rule integrity failure');
  }
}
