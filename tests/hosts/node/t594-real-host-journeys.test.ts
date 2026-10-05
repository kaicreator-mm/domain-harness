// T008 (issue #594): Node REAL-host validation wave — journeys 1-8.
//
// Every journey runs the composed v0.6 authorities end-to-end over REAL
// better-sqlite3 files (NodeSqliteRuntimeStore + openNodeSqliteAuthorityStores),
// with the EXISTING product surface only (no mocks standing in for the store).
// Restart semantics (J6): close() really closes the SQLite handles and a fresh
// openT594Fixture over the SAME file is a genuinely fresh runtime assembly.
// The out-of-process SIGKILL journey lives in t594-process-kill-recovery.test.ts.
//
//   J1  compiled semantic-decision package accepted + executed end-to-end
//       through resolveAndAdmitTurn on the real node store
//   J2  Rule / Exact Reuse / non-model Promoted paths WITHOUT model config
//   J3  fresh semantic path with a host-supplied model port when configured
//   J4  declared semantic-unavailable, no model: fail-closed terminal AND
//       declared-event outcome through Admission
//   J5  resolver result through the current Admission guard/invariant authority
//   J6  receipt/observation durability + correlation across restart (J6a: the
//       durable facts; J6b: the #594 receipt-records-survive contract line)
//   J7  A8 valid duplicate replay + incompatible messageId collision fail-closed
//   J8  A9 invalid revision pair rejected without partial commit
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { deriveDurableControlTurnId } from '../../../packages/domain-harness/src/admission/index.js';
import { computeCanonicalJsonDigest } from '../../../packages/domain-harness/src/contracts/identity.js';
import type { JsonValue } from '../../../packages/domain-harness/src/contracts/json.js';
import { DomainRuntimeV3Error } from '../../../packages/domain-harness/src/runtime/runtime-v3-errors.js';
// The REAL store executes against the built workspace package, so thrown error
// classes are matched by their stable code/name contract (never instanceof —
// the src-compiled test context would hold a different class object).
import { isDecisionReceiptObservationStore } from '../../../packages/domain-harness/src/observation/decision-receipt.js';
import {
  PromotedChildRuntime,
  createRegistryPromotedChildArtifactPort,
} from '../../../packages/domain-harness/src/promoted-child/index.js';
import { PromotedArtifactRegistry } from '../../../packages/domain-harness/src/promoted-artifact/index.js';
import { createXStateHarnessMachineRunner } from '../../../packages/domain-harness/src/decision-resolver/index.js';
import {
  allAvailableArtifacts,
  makeEnvelope,
  ref,
  validationFor,
} from '../../../packages/domain-harness/tests/promoted-child/helpers.js';
import { quoteResult } from '../../../packages/domain-harness/tests/decision-resolver/helpers.js';
import {
  CapturingRule,
  commandMessage,
  expectAdmitted,
  expectDenied,
  harnessMaterial,
  makeDefinition,
  quoteDecisionDescriptor,
  quoteEvent,
  resolverFixture,
  turnRequest,
} from '../../../packages/domain-harness/tests/v06-conformance/fixtures.js';
import type { CompiledSemanticDecisionDescriptor } from '../../../packages/domain-harness/src/v2/index.js';
import {
  disposeT594Directory,
  openAndPinT594Instance,
  openT594Fixture,
  readAllT594Records,
  readT594ReceiptRecords,
  sha256,
  t594ProcessCommandTurn,
  target,
  workflowInstanceId,
  NOW,
} from './t594-real-host-fixture.ts';

/* ------------------------------------------------------------------------ */
/* J1 — compiled semantic-decision package accepted + executed end-to-end    */
/* ------------------------------------------------------------------------ */

test('T008 J1: compiled semantic-decision package accepted and executed end-to-end through resolveAndAdmitTurn on the REAL node store', async () => {
  const fixture = await openT594Fixture();
  try {
    assert.equal(existsSync(fixture.path), true, 'the runtime store is a real SQLite file on disk');
    const pragmas = fixture.store.inspectPragmas();
    assert.equal(pragmas.journalMode, 'wal', 'durable WAL journal mode');
    assert.equal(pragmas.synchronous, 2, 'synchronous=FULL durability');

    await openAndPinT594Instance(fixture);
    const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });

    const outcome = await fixture.assembly.resolveAndAdmitTurn(turnRequest({ rule }));
    const admitted = expectAdmitted(outcome).admitted;

    // The compiled declaration of the pinned package executed: the declared
    // transition ran through the existing durable effect authority exactly once.
    assert.equal(admitted.transitionKey, 'approve');
    assert.equal(admitted.targetState, 'approved');
    assert.equal(fixture.tools.calls.length, 1, 'exactly one durable effect execution');
    const journal = fixture.authorities.admissionEffectJournal.getRecords();
    assert.equal(journal.length, 1, 'one admission effect journal record on the REAL store');
    assert.equal(journal[0]!.durableControlTurnId, admitted.durableControlTurnId);

    // Zero model access: the rule resolved before the Harness fallback stage.
    assert.equal(admitted.resolver.source, 'rule');
    assert.equal(admitted.resolver.llmAvoided, true);
    assert.equal(admitted.resolver.freshModelCallCount, 0);
    assert.equal(rule.calls, 1);

    // The return carries the stable public Decision Resolution Receipt.
    assert.equal(outcome.receipt.disposition, 'admitted');
    assert.equal(outcome.receipt.source, 'rule');
    assert.equal(outcome.receipt.durableControlTurnId, admitted.durableControlTurnId);
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

/* ------------------------------------------------------------------------ */
/* J2 — Rule / Exact Reuse / non-model Promoted paths without a model        */
/* ------------------------------------------------------------------------ */

test('T008 J2a: Rule path without any model configuration on the REAL store', async () => {
  const fixture = await openT594Fixture();
  try {
    await openAndPinT594Instance(fixture);
    // No harness material and no model port exists anywhere in this turn.
    const admitted = expectAdmitted(
      await fixture.assembly.resolveAndAdmitTurn(turnRequest({
        rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
        turn: { kind: 'message', sourceMessageId: 'msg:j2a' },
      })),
    ).admitted;
    assert.equal(admitted.resolver.source, 'rule');
    assert.equal(admitted.resolver.llmAvoided, true);
    assert.equal(admitted.resolver.freshModelCallCount, 0);
    assert.equal(fixture.tools.calls.length, 1);
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

test('T008 J2b: Exact Reuse — the second identical turn is served by the REAL SQLite exact semantic cache without re-invoking the rule or any model', async () => {
  const fixture = await openT594Fixture();
  try {
    await openAndPinT594Instance(fixture);
    const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });
    const cacheStore = fixture.authorities.semanticCache;

    const first = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule,
      resolver: { cacheStore },
      // The rule's producer identity is the prebound behaviorally-relevant
      // dependency: the exact-cache write contract requires the producer to be
      // prebound and observed (frozen S9 two-phase eligibility).
      dependencies: { artifacts: [rule.producerIdentity] },
      turn: { kind: 'message', sourceMessageId: 'msg:j2b-a' },
    })));
    assert.equal(first.admitted.resolver.source, 'rule', 'turn A resolves fresh via the rule');
    assert.ok(cacheStore.size >= 1, 'the rule result was written to the REAL SQLite cache');

    // Turn B: the same decision material, with the stage-1 deterministic rule
    // falling through (frozen order Rule → Exact Cache) so the REAL cache read
    // is the authority that serves the turn — still zero model access.
    const fallThroughRule = new CapturingRule({ status: 'no-match' });
    const second = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: fallThroughRule,
      resolver: { cacheStore },
      dependencies: { artifacts: [rule.producerIdentity] },
      turn: { kind: 'message', sourceMessageId: 'msg:j2b-b' },
    })));
    assert.equal(second.admitted.resolver.source, 'exact-cache', 'turn B is served by Exact Reuse');
    assert.equal(second.admitted.resolver.llmAvoided, true);
    assert.equal(second.admitted.resolver.freshModelCallCount, 0);
    assert.equal(fallThroughRule.calls, 1, 'the stage-1 rule was consulted once and fell through');
    assert.equal(rule.calls, 1, 'the producing rule is NOT re-invoked for the cached turn');
    assert.equal(second.receipt.source, 'exact-cache');
    assert.equal(second.receipt.durableControlTurnId, second.admitted.durableControlTurnId);
    assert.notEqual(
      second.admitted.durableControlTurnId,
      first.admitted.durableControlTurnId,
      'each turn keeps its own durable identity',
    );
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

test('T008 J2c: non-model Promoted subworkflow path over the REAL SQLite promoted-artifact/pin stores', async () => {
  const fixture = await openT594Fixture({ decisions: [await promotedQuoteDescriptor()] });
  try {
    await openAndPinT594Instance(fixture);

    // Promote the quoted child into the REAL SQLite promoted-artifact store,
    // under EXACTLY the instance's pinned authority binding.
    const registry = new PromotedArtifactRegistry(fixture.authorities.promotedArtifacts, sha256);
    const authorityBinding = {
      domainId: 'orders',
      packageId: fixture.packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: fixture.b1.identity,
    };
    const material = makeEnvelope();
    await registry.promote({
      artifactId: 'subworkflow:quote-review',
      version: '1.0.0',
      validation: await validationFor(authorityBinding, material),
      authorityBinding,
      semanticMaterial: material,
      promotion: {
        recordId: 'promotion:quote-review:1',
        authorityRef: 'audit://promotion/quote-review/1',
        recordedAt: NOW,
      },
    });
    const artifactPort = createRegistryPromotedChildArtifactPort(registry);
    const runtime = new PromotedChildRuntime(artifactPort, fixture.authorities.dynamicChildPins, sha256);
    const executorCalls = { count: 0 };
    const executor = {
      async executeQuery(): Promise<JsonValue> {
        executorCalls.count += 1;
        return { quote: quoteResult('approve', { via: 'promoted' }), price: 42 };
      },
    };

    const outcome = await fixture.assembly.resolveAndAdmitTurn({
      decisionId: 'quote-decision',
      target,
      turn: { kind: 'message', sourceMessageId: 'msg:j2c' },
      trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
      workflowInstanceId,
      definition: makeDefinition(),
      currentStateKey: 'review',
      context: { order: { sku: 'P-1', quantity: 3 } },
      event: quoteEvent(42),
      now: NOW,
      rule: new CapturingRule({ status: 'no-match' }),
      resolver: {
        promoted: {
          runtime,
          artifactPort,
          revocation: { readRevocation: (artifact) => registry.readRevocation(artifact) },
        },
      },
      // The promoted execution material/ports the declared reference requires.
      promoted: { executor, journal: fixture.authorities.harnessJournal },
      invokingArtifacts: allAvailableArtifacts(),
      applicabilityFacts: [ref('knowledge', 'ctx:b2b-quote')],
    } as Parameters<typeof fixture.assembly.resolveAndAdmitTurn>[0]);
    const admitted = expectAdmitted(outcome).admitted;

    assert.equal(admitted.resolver.source, 'promoted-subworkflow');
    assert.equal(admitted.resolver.llmAvoided, true);
    assert.equal(admitted.resolver.freshModelCallCount, 0);
    assert.equal(executorCalls.count, 1, 'the promoted child query executed exactly once');
    assert.equal(admitted.transitionKey, 'approve');
    assert.equal(admitted.targetState, 'approved');
    assert.equal(fixture.tools.calls.length, 1, 'one durable effect execution on the REAL store');
    assert.ok(
      fixture.authorities.harnessJournal.getRecords().length >= 1,
      'promoted child execution journaled on the REAL SQLite store',
    );
    assert.equal(outcome.receipt.source, 'promoted-subworkflow');
    assert.equal(outcome.receipt.freshModelCallCount, 0);
    assert.equal(outcome.receipt.llmAvoided, true);
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

/* ------------------------------------------------------------------------ */
/* J3 — fresh semantic path with a host-supplied model port                  */
/* ------------------------------------------------------------------------ */

test('T008 J3: fresh semantic path with a configured model port — HarnessMachine proposal admitted once, honestly receipted, on the REAL store', async () => {
  const fixture = await openT594Fixture();
  try {
    await openAndPinT594Instance(fixture);
    const harness = resolverFixture(); // scripted model proposes approve exactly once

    const outcome = await fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      resolver: { harnessRunner: createXStateHarnessMachineRunner() },
      harness: harnessMaterial(harness.model, fixture.authorities.harnessJournal),
      turn: { kind: 'message', sourceMessageId: 'msg:j3' },
    }));
    const admitted = expectAdmitted(outcome).admitted;

    assert.equal(admitted.resolver.source, 'harness-machine');
    assert.equal(admitted.resolver.freshModelCallCount, 1);
    assert.equal(admitted.resolver.llmAvoided, false);
    assert.equal(harness.model.calls, 1, 'the host-supplied model port was called exactly once');
    assert.equal(admitted.transitionKey, 'approve');
    assert.equal(admitted.targetState, 'approved');
    assert.equal(fixture.tools.calls.length, 1, 'one durable effect execution on the REAL store');
    const harnessJournal = fixture.authorities.harnessJournal.getRecords();
    assert.ok(harnessJournal.length >= 1, 'harness execution journaled on the REAL SQLite store');

    const receipt = outcome.receipt;
    assert.equal(receipt.disposition, 'admitted');
    assert.equal(receipt.source, 'harness-machine');
    assert.equal(receipt.freshModelCallCount, 1);
    assert.equal(receipt.llmAvoided, false);
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

/* ------------------------------------------------------------------------ */
/* J4 — declared semantic-unavailable with NO model                          */
/* ------------------------------------------------------------------------ */

test('T008 J4a: no-model + required semantics + declared fail-closed → typed unavailable terminal; zero effect and zero journal mutation on the REAL store', async () => {
  const fixture = await openT594Fixture({
    decisionOverrides: [{ unavailable: { kind: 'fail-closed' } }],
  });
  try {
    await openAndPinT594Instance(fixture);
    const rule = new CapturingRule({ status: 'no-match' });

    let captured: unknown;
    await assert.rejects(
      () => fixture.assembly.resolveAndAdmitTurn(turnRequest({ rule })),
      (candidate: unknown) => {
        captured = candidate;
        return candidate instanceof DomainRuntimeV3Error;
      },
    );
    const error = captured as DomainRuntimeV3Error;
    assert.equal(error.code, 'RUNTIME_V3_SEMANTIC_INTELLIGENCE_UNAVAILABLE');

    // Deterministic sources ran; nothing was fabricated and nothing mutated.
    assert.equal(rule.calls, 1);
    assert.equal(fixture.tools.calls.length, 0);
    assert.equal(fixture.authorities.admissionEffectJournal.getRecords().length, 0);
    const instance = await fixture.store.getInstance(target);
    assert.equal(instance?.stateRevision, 0, 'no semantic state mutation');
    // Receipt durability through the REAL store is journey 6b's contract line.
    // The first wave documented the missing seam here (#594 J6b, probe ===false);
    // the T008-R1 repair (#598/#600, v0.6 165cb4d) implemented
    // DecisionReceiptObservationStore on the production store, so the seam is
    // now expected on every fixture assembly (J6b proves receipt durability).
    assert.equal(isDecisionReceiptObservationStore(fixture.store), true, 'the production node store implements the DecisionReceiptObservationStore seam (T008-R1 repair #598/#600)');
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

test('T008 J4b: declared-event disposition carries the declared material through Admission on the REAL store with all gates intact and honest receipt', async () => {
  const fixture = await openT594Fixture({
    decisionOverrides: [{
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
    }],
  });
  try {
    await openAndPinT594Instance(fixture);
    const rule = new CapturingRule({ status: 'no-match' });

    const outcome = await fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule,
      turn: { kind: 'message', sourceMessageId: 'msg:j4b' },
    }));
    const admitted = expectAdmitted(outcome).admitted;

    assert.equal(admitted.transitionKey, 'approve');
    assert.equal(admitted.targetState, 'approved');
    assert.equal(fixture.tools.calls.length, 1, 'the declared transition effect executed once');
    assert.equal(admitted.resolver.source, 'declared-unavailable');
    assert.equal(admitted.resolver.freshModelCallCount, 0);
    assert.equal(admitted.resolver.llmAvoided, true);
    assert.equal(rule.calls, 1, 'deterministic sources still ran first');
    assert.equal(fixture.authorities.admissionEffectJournal.getRecords().length, 1);
    assert.equal(outcome.receipt.disposition, 'admitted');
    assert.equal(outcome.receipt.source, 'declared-unavailable');
    assert.equal(outcome.receipt.failure, undefined);

    // A denial of the declared material is FINAL and honestly categorized:
    // the pinned hard invariant still denies amount > 100.
    const denied = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      event: quoteEvent(5000),
      turn: { kind: 'message', sourceMessageId: 'msg:j4b-denied' },
    })));
    assert.equal(denied.denial.reason, 'hard-invariant');
    assert.equal(denied.denial.resolver.source, 'declared-unavailable');
    assert.equal(fixture.tools.calls.length, 1, 'the denial executed no additional effect');
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

/* ------------------------------------------------------------------------ */
/* J5 — resolver result through the current Admission guard authority        */
/* ------------------------------------------------------------------------ */

test('T008 J5: guard rejection AFTER a model proposal is final — no retry, no effect, no journal mutation; honest bounded receipt', async () => {
  const fixture = await openT594Fixture();
  try {
    await openAndPinT594Instance(fixture);
    const harness = resolverFixture(); // the model WILL be called once (proposal)

    const denied = expectDenied(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
      rule: new CapturingRule({ status: 'no-match' }),
      resolver: { harnessRunner: harness.runner },
      harness: harnessMaterial(harness.model, fixture.authorities.harnessJournal),
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
      turn: { kind: 'message', sourceMessageId: 'msg:j5' },
    })));

    assert.equal(harness.model.calls, 1, 'the model is never re-invoked after the denial');
    assert.equal(denied.denial.reason, 'guard');
    assert.equal(denied.denial.guardId, 'guard:tiny');
    assert.equal(denied.denial.resolver.source, 'harness-machine');
    assert.equal(fixture.tools.calls.length, 0, 'no effect execution after denial');
    assert.equal(fixture.authorities.admissionEffectJournal.getRecords().length, 0, 'no journal mutation');
    const instance = await fixture.store.getInstance(target);
    assert.equal(instance?.stateRevision, 0, 'no semantic state mutation on the REAL store');

    assert.equal(denied.receipt.disposition, 'denied');
    assert.equal(denied.receipt.freshModelCallCount, 1, 'the receipt honestly reports the fresh proposal');
    assert.equal(denied.receipt.llmAvoided, false);
    assert.deepEqual(denied.receipt.failure, {
      kind: 'admission-denied',
      reason: 'guard',
      guardId: 'guard:tiny',
      transitionKey: 'approve',
    });
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

/* ------------------------------------------------------------------------ */
/* J6 — receipt/observation durability + correlation across RESTART          */
/* ------------------------------------------------------------------------ */

test('T008 J6a: durable decision facts survive REAL close/reopen and correlate with journal + admission identities', async () => {
  const fixture = await openT594Fixture();
  let firstTurnId: string;
  let secondTurnId: string;
  let preRestartKinds: readonly string[];
  try {
    await openAndPinT594Instance(fixture);
    const first = await t594ProcessCommandTurn(
      fixture,
      commandMessage('msg:j6-first'),
      { rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }) },
    );
    const second = await t594ProcessCommandTurn(
      fixture,
      commandMessage('msg:j6-second'),
      { rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }) },
    );
    assert.equal(first.kind, 'processed');
    assert.equal(second.kind, 'processed');
    if (first.kind !== 'processed' || second.kind !== 'processed') {
      assert.fail('both turns must be processed before restart');
    }
    firstTurnId = first.outcome.admitted.durableControlTurnId;
    secondTurnId = second.outcome.admitted.durableControlTurnId;
    preRestartKinds = (await readAllT594Records(fixture)).map((record) => record.kind);
    fixture.close(); // REAL better-sqlite3 close

    // Fresh runtime assembly over the SAME files.
    const reopened = await openT594Fixture({ directory: fixture.directory });
    try {
      // Instance state survived: two committed transitions.
      const instance = await reopened.store.getInstance(target);
      assert.equal(instance?.stateRevision, 2, 'two committed transitions survived restart');
      assert.equal(instance?.lifecycle, 'waiting');

      // Dispositions + command outcomes survived with their resolutions.
      const d1 = await reopened.store.getMessageDisposition(target, 'msg:j6-first');
      const d2 = await reopened.store.getMessageDisposition(target, 'msg:j6-second');
      assert.equal(d1?.disposition, 'processed');
      assert.equal(d2?.disposition, 'processed');
      const o1 = await reopened.store.getCommandOutcome(target, 'msg:j6-first');
      const o2 = await reopened.store.getCommandOutcome(target, 'msg:j6-second');
      assert.equal(o1?.status, 'applied');
      assert.equal(o2?.status, 'applied');

      // Admission effect journal survived; identities correlate with the
      // deterministic derivation Central Admission and the journal share.
      const journal = reopened.authorities.admissionEffectJournal.getRecords();
      assert.equal(journal.length, 2);
      const turnIds = new Set(journal.map((record) => record.durableControlTurnId));
      assert.ok(turnIds.has(firstTurnId), 'first turn correlates with the journal');
      assert.ok(turnIds.has(secondTurnId), 'second turn correlates with the journal');
      assert.equal(
        firstTurnId,
        deriveDurableControlTurnId(target, { kind: 'message', sourceMessageId: 'msg:j6-first' }),
      );
      assert.equal(
        secondTurnId,
        deriveDurableControlTurnId(target, { kind: 'message', sourceMessageId: 'msg:j6-second' }),
      );

      // Observation stream survived: MESSAGE_ACCEPTED records for both turns,
      // contiguous sequences, correlating with the accepted message identity.
      const records = await readAllT594Records(reopened);
      assert.deepEqual(
        records.map((record) => record.kind),
        preRestartKinds,
        'the durable record set is identical before and after reopen',
      );
      const accepted = records.filter((record) => record.kind === 'MESSAGE_ACCEPTED');
      assert.ok(
        accepted.length >= 2,
        `both acceptances were observed durably (record kinds: ${preRestartKinds.join(',')})`,
      );
      const observedIds = new Set(accepted.map((record) => record.sourceMessageId));
      assert.ok(observedIds.has('msg:j6-first'));
      assert.ok(observedIds.has('msg:j6-second'));
      for (let index = 1; index < records.length; index += 1) {
        assert.equal(
          records[index]!.sequence,
          records[index - 1]!.sequence + 1,
          'observation sequences stayed contiguous across restart',
        );
      }

      // Post-restart correlation: a NEW admitted turn on the reopened assembly
      // appends to the same durable journal/stream with a fresh turn identity.
      const third = await t594ProcessCommandTurn(
        reopened,
        commandMessage('msg:j6-third'),
        { rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }) },
      );
      assert.equal(third.kind, 'processed');
      const reopenedJournal = reopened.authorities.admissionEffectJournal.getRecords();
      assert.equal(reopenedJournal.length, 3);
      assert.equal(
        (await reopened.store.getInstance(target))?.stateRevision,
        3,
        'the reopened assembly continues the same durable instance',
      );
      assert.notEqual(
        third.kind === 'processed' ? third.outcome.admitted.durableControlTurnId : '',
        firstTurnId,
      );
    } finally {
      reopened.close();
      disposeT594Directory(reopened);
    }
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

test('T008 J6b (#594 contract): DECISION_RECEIPT records survive REAL restart — the real store must implement the receipt seam and durably project every receipt', async () => {
  const fixture = await openT594Fixture();
  try {
    await openAndPinT594Instance(fixture);
    await t594ProcessCommandTurn(
      fixture,
      commandMessage('msg:j6b-a'),
      { rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }) },
    );
    await t594ProcessCommandTurn(
      fixture,
      commandMessage('msg:j6b-b'),
      { rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }) },
    );
    fixture.close();

    const reopened = await openT594Fixture({ directory: fixture.directory });
    try {
      assert.equal(
        isDecisionReceiptObservationStore(reopened.store),
        true,
        'the real node store must implement the DecisionReceiptObservationStore seam for #594 J6 receipt durability',
      );
      const receipts = await readT594ReceiptRecords(reopened);
      assert.equal(
        receipts.length,
        2,
        'both Decision Resolution Receipts must survive the REAL restart as DECISION_RECEIPT observation records',
      );
      assert.equal(receipts[0]!.receipt.disposition, 'admitted');
      assert.equal(receipts[1]!.receipt.disposition, 'admitted');
      assert.notEqual(
        receipts[0]!.receipt.durableControlTurnId,
        receipts[1]!.receipt.durableControlTurnId,
      );
    } finally {
      reopened.close();
      disposeT594Directory(reopened);
    }
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

/* ------------------------------------------------------------------------ */
/* J7 — A8 duplicate replay + collision fail-closed                          */
/* ------------------------------------------------------------------------ */

test('T008 J7: A8 — valid duplicate replay succeeds without duplicate effect; incompatible same-messageId collision fails closed before any write', async () => {
  const fixture = await openT594Fixture();
  try {
    await openAndPinT594Instance(fixture);
    const rule = new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });

    const first = await t594ProcessCommandTurn(fixture, commandMessage('msg:a8'), { rule });
    assert.equal(first.kind, 'processed');
    const effectsAfterFirst = fixture.tools.calls.length;
    const journalAfterFirst = fixture.authorities.admissionEffectJournal.getRecords().length;
    const observationsAfterFirst = (await readAllT594Records(fixture)).length;
    const instanceAfterFirst = await fixture.store.getInstance(target);
    assert.equal(instanceAfterFirst?.stateRevision, 1);

    // Valid duplicate replay: compatible identity tuple → duplicate ack, and
    // the ORIGINAL command outcome is returned — no new effect, no new journal
    // record, no new observation, no state mutation.
    const replay = await t594ProcessCommandTurn(fixture, commandMessage('msg:a8'), { rule });
    assert.equal(replay.kind, 'duplicate-ack');
    if (replay.kind !== 'duplicate-ack') assert.fail('the replay must be a duplicate ack');
    assert.equal(replay.ack.status, 'duplicate');
    assert.equal(replay.ack.targetSequence, 1);
    assert.equal(replay.existingOutcome?.status, 'applied', 'the original outcome is reused');
    assert.equal(fixture.tools.calls.length, effectsAfterFirst, 'no duplicate effect execution');
    assert.equal(
      fixture.authorities.admissionEffectJournal.getRecords().length,
      journalAfterFirst,
      'no duplicate journal record',
    );
    assert.equal((await readAllT594Records(fixture)).length, observationsAfterFirst, 'no duplicate observation');
    assert.equal((await fixture.store.getInstance(target))?.stateRevision, 1, 'no duplicate state mutation');

    // Incompatible collision: same messageId, different logical material →
    // fail closed BEFORE any new durable write.
    const collision = commandMessage('msg:a8', { payload: { amount: 43 } });
    await assert.rejects(
      () => fixture.store.acceptMessage(collision),
      (error: unknown) => (error as { code?: unknown }).code === 'MESSAGE_IDENTITY_COLLISION'
        && (error as Error).name === 'AcceptedMessageIdentityCollisionError',
    );
    assert.equal(fixture.tools.calls.length, effectsAfterFirst, 'collision executed nothing');
    assert.equal(
      fixture.authorities.admissionEffectJournal.getRecords().length,
      journalAfterFirst,
      'collision mutated nothing',
    );
    assert.equal((await fixture.store.getInstance(target))?.stateRevision, 1, 'collision changed no state');
    assert.equal((await readAllT594Records(fixture)).length, observationsAfterFirst, 'collision observed nothing');
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

/* ------------------------------------------------------------------------ */
/* J8 — A9 invalid revision pair rejected without partial commit             */
/* ------------------------------------------------------------------------ */

test('T008 J8: A9 — an invalid revision pair is rejected by the REAL store before any durable mutation (no partial commit), then the conforming commit lands', async () => {
  const fixture = await openT594Fixture();
  try {
    await openAndPinT594Instance(fixture);
    const message = commandMessage('msg:a9');
    const ack = await fixture.store.acceptMessage(message);
    assert.equal(ack.status, 'accepted');
    const marked = await fixture.store.markMessageProcessing(message.target, message.messageId, NOW);
    assert.equal(marked, true);

    const before = await fixture.store.getInstance(target);
    assert.equal(before?.stateRevision, 0);
    const observationsBefore = (await readAllT594Records(fixture)).length;
    const journalBefore = fixture.authorities.admissionEffectJournal.getRecords().length;

    // A structurally VALID commit base (used for the positive control), whose
    // revision pair each invalid case overrides — mirroring the frozen T-003
    // node-store guard suite.
    const commitBase = {
      target: message.target,
      messageId: message.messageId,
      expectedTargetSequence: ack.targetSequence,
      expectedStateRevision: 0,
      nextStateRevision: 1,
      nextState: { phase: 'approved' },
      nextProcessData: {},
      nextLifecycle: 'waiting' as const,
      outcome: {
        status: 'applied' as const,
        resolution: { status: 'applied' as const, result: { transitionKey: 'approve' } },
        effectExecutions: [],
      },
      updatedAt: NOW,
    };

    async function assertRejectedBeforeAnyWrite(
      commitAttempt: typeof commitBase,
      expectedInstance: NonNullable<typeof before>,
    ): Promise<void> {
      await assert.rejects(
        () => fixture.store.commitProcessedCommandTurn(commitAttempt),
        (error: unknown) => (error as { code?: unknown }).code === 'STATE_REVISION_MISMATCH'
          && (error as Error).name === 'ProcessCommandContractError',
      );
      // No partial commit anywhere on the durable surface:
      assert.deepEqual(
        await fixture.store.getInstance(target),
        expectedInstance,
        'instance unchanged after the rejected commit',
      );
      const disposition = await fixture.store.getMessageDisposition(target, message.messageId);
      assert.equal(disposition?.disposition, 'processing', 'disposition unchanged — no partial commit');
      assert.equal(
        await fixture.store.getCommandOutcome(target, message.messageId),
        null,
        'no command outcome was fabricated',
      );
      assert.equal((await readAllT594Records(fixture)).length, observationsBefore, 'no observation was appended');
      assert.equal(
        fixture.authorities.admissionEffectJournal.getRecords().length,
        journalBefore,
        'no journal mutation',
      );
    }

    // INVALID pair (a): N -> N (same-revision, no safe advance).
    await assertRejectedBeforeAnyWrite(
      { ...commitBase, expectedStateRevision: 0, nextStateRevision: 0 },
      before!,
    );
    // INVALID pair (b): N -> N+2 (skips a durable revision).
    await assertRejectedBeforeAnyWrite(
      { ...commitBase, expectedStateRevision: 0, nextStateRevision: 2 },
      before!,
    );
    // INVALID pair (c): structurally conforming N+7 -> N+8 pair whose expected
    // revision does not match the durable row — the REAL store still fails
    // closed before any mutation (defensive WHERE-level boundary), with no
    // partial commit.
    await assert.rejects(
      () => fixture.store.commitProcessedCommandTurn({
        ...commitBase,
        expectedStateRevision: 7,
        nextStateRevision: 8,
      }),
      (error: unknown) => error instanceof Error
        && (error as { code?: unknown }).code === undefined
        && error.message.includes('changed during processed-command commit'),
    );
    assert.deepEqual(
      await fixture.store.getInstance(target),
      before!,
      'instance unchanged after the durable-mismatch rejection',
    );
    assert.equal(
      await fixture.store.getCommandOutcome(target, message.messageId),
      null,
      'no command outcome after the durable-mismatch rejection',
    );
    assert.equal((await readAllT594Records(fixture)).length, observationsBefore);
    assert.equal(fixture.authorities.admissionEffectJournal.getRecords().length, journalBefore);

    // Positive control: the CONFORMING N→N+1 commit lands on the same durable row.
    await fixture.store.commitProcessedCommandTurn(commitBase);
    const after = await fixture.store.getInstance(target);
    assert.equal(after?.stateRevision, 1, 'exactly one revision advance for the conforming commit');
    const processedDisposition = await fixture.store.getMessageDisposition(target, message.messageId);
    assert.equal(processedDisposition?.disposition, 'processed');
    assert.equal((await fixture.store.getCommandOutcome(target, message.messageId))?.status, 'applied');
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
});

/* ------------------------------------------------------------------------ */
/* helpers                                                                   */
/* ------------------------------------------------------------------------ */

/** The quote decision descriptor with a version-pinned promoted reference. */
async function promotedQuoteDescriptor(): Promise<CompiledSemanticDecisionDescriptor> {
  const plain = await quoteDecisionDescriptor();
  const { declarationDigest: _omitted, ...body } = plain;
  const withReference = {
    ...body,
    promotedReference: { kind: 'version', artifactId: 'subworkflow:quote-review', version: '1.0.0' },
  } as unknown as Omit<CompiledSemanticDecisionDescriptor, 'declarationDigest'>;
  return {
    ...withReference,
    declarationDigest: await computeCanonicalJsonDigest(withReference, sha256),
  } as CompiledSemanticDecisionDescriptor;
}
