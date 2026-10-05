// v0.6 T007 (issue #585, frozen L2 C5): recovery and composite compatibility
// conformance — scenarios 6, 10 and 12 of the 14 mandatory #585 scenarios.
// Stale exact-cache reuse is rejected through the EXISTING semantic-cache
// currentness authorities; a simulated runtime reopen replays an admitted
// journey without duplicate decision/model work/effect through the EXISTING
// journal idempotency and admission facts; legacy non-semantic workflows run
// behaviorally unchanged in the SAME runtime instance alongside semantic
// journeys.
//
//  #585-6  stale reuse rejection: currentness-invalidated exact-cache reuse
//          never silently succeeds; receipt evidence honest
//  #585-10 portable recovery with existing durable facts: no duplicate
//          decision, no duplicate model work, no duplicate effect
//  #585-12 composite compatibility: legacy non-semantic workflows unchanged
//          in the same runtime instance alongside semantic journeys
import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonValue } from '../../src/contracts/json.js';
import { VolatileExactSemanticCacheStore } from '../../src/semantic-cache/index.js';
import { createDomainRuntime } from '../../src/runtime/create-domain-runtime.js';
import type { ResolvedDecision } from '../../src/decision-resolver/index.js';
import { createXStateHarnessMachineRunner } from '../../src/decision-resolver/index.js';
import { computeCompiledPackageId } from '../../src/package/validation.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';
import { ScriptedModel, finalResponse, quoteResult } from '../decision-resolver/helpers.js';
import type { QuoteDecisionResult } from '../decision-resolver/helpers.js';
import {
  CapturingRule,
  GuardedJourneyStore,
  conformanceFixture,
  commandMessage,
  expectAdmitted,
  harnessMaterial,
  openAndPinInstance,
  processCommandTurn,
  quoteDecisionDescriptor,
  quoteEvent,
  readReceiptRecords,
  resolverFixture,
  sha256,
  target,
  turnRequest,
  NOW,
} from './fixtures.js';

/* ------------------------------------------------------------------------ */
/* #585-6 — stale reuse rejection                                            */
/* ------------------------------------------------------------------------ */

test('#585-6a: currentness-invalidated exact-cache reuse never silently succeeds — the existing cache invalidation authority forces re-resolution with honest receipt evidence', async () => {
  const fixture = await conformanceFixture([await quoteDecisionDescriptor()]);
  await openAndPinInstance(fixture);
  const cache = new VolatileExactSemanticCacheStore<QuoteDecisionResult>();
  const seedModel = new ScriptedModel([finalResponse('approve', { via: 'cache-seed' })]);
  const producer = {
    kind: 'harness-config',
    artifactId: 'harness:quote',
    contentDigest: 'digest-harness:quote',
  } as const;
  const journeyOverrides = {
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: resolverFixture().runner },
    harness: harnessMaterial(seedModel),
    dependencies: { artifacts: [producer] },
  } as const;

  // Seed the exact cache through a full admitted journey turn.
  const seed = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    ...journeyOverrides,
    turn: { kind: 'message', sourceMessageId: 'msg:6-seed' },
  })));
  assert.equal(seed.admitted.resolver.source, 'harness-machine');
  assert.equal(seed.admitted.resolver.cacheRead, 'miss');
  assert.equal(seed.admitted.resolver.cacheWrite, 'inserted');
  assert.equal(seedModel.calls, 1);
  assert.equal(cache.size, 1);

  // Currentness invalidation through the EXISTING semantic-cache authority:
  // the producer-artifact invalidation seam removes the currentness-stale
  // entry (the same invalidation authority family the read-path currentness
  // gate belongs to).
  const invalidated = await cache.invalidateByProducer(producer, 'producer artifact currentness invalidated');
  assert.equal(invalidated, 1);

  // The replayed input CANNOT silently reuse the invalidated entry: the
  // exact-cache stage misses and the journey re-resolves FRESH.
  const replayModel = new ScriptedModel([finalResponse('approve', { via: 'fresh-reresolution' })]);
  const replay = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: resolverFixture().runner },
    harness: harnessMaterial(replayModel),
    dependencies: { artifacts: [producer] },
    turn: { kind: 'message', sourceMessageId: 'msg:6-replay' },
  })));
  assert.equal(replay.admitted.resolver.source, 'harness-machine', 'stale reuse is rejected by re-resolution');
  assert.equal(replay.admitted.resolver.cacheRead, 'miss', 'the receipt honestly reports the stale miss');
  assert.equal(replay.admitted.resolver.freshModelCallCount, 1);
  assert.equal(replayModel.calls, 1, 'fresh model work happened instead of stale reuse');

  // Receipt evidence is honest for both turns.
  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0]!.receipt.cacheRead, 'miss');
  assert.equal(receipts[1]!.receipt.cacheRead, 'miss');
});

test('#585-6b: a declared live revision source without a pre-read revision keeps the existing deterministic currentness contract — deterministic cache bypass, never silent reuse', async () => {
  const fixture = await conformanceFixture([
    await quoteDecisionDescriptor({
      dependencyMaterial: {
        requiredProjectionIds: [],
        requiredRevisionSourceIds: ['quotes.source'],
      },
    }),
  ]);
  await openAndPinInstance(fixture);
  const cache = new VolatileExactSemanticCacheStore<QuoteDecisionResult>();
  const producer = [{
    kind: 'harness-config',
    artifactId: 'harness:quote',
    contentDigest: 'digest-harness:quote',
  }] as const;

  const seed = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: resolverFixture().runner },
    harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'seed' })])),
    dependencies: { artifacts: producer },
    turn: { kind: 'message', sourceMessageId: 'msg:6b-seed' },
  })));
  assert.equal(seed.admitted.resolver.source, 'harness-machine');
  assert.equal(seed.admitted.resolver.cacheRead, 'bypass', 'the unprebound live revision bypasses the cache');
  assert.equal(cache.size, 0, 'a bypassed read never becomes silently reusable material');

  const replayModel = new ScriptedModel([finalResponse('approve', { via: 'bypassed-reresolution' })]);
  const replay = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: resolverFixture().runner },
    harness: harnessMaterial(replayModel),
    dependencies: { artifacts: producer },
    turn: { kind: 'message', sourceMessageId: 'msg:6b-replay' },
  })));
  assert.equal(replay.admitted.resolver.cacheRead, 'bypass');
  assert.equal(replayModel.calls, 1, 'deterministic re-resolution, never silent stale reuse');

  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0]!.receipt.cacheRead, 'bypass');
  assert.equal(receipts[1]!.receipt.cacheRead, 'bypass');
});

/* ------------------------------------------------------------------------ */
/* #585-10 — portable recovery: no duplicate decision/work/effect            */
/* ------------------------------------------------------------------------ */

test('#585-10: a simulated reopen/recovery after an admitted journey produces no duplicate decision, no duplicate model work, no duplicate effect', async () => {
  const decisions = [await quoteDecisionDescriptor()];
  const fixture = await conformanceFixture(decisions);
  const cache = new VolatileExactSemanticCacheStore<QuoteDecisionResult>();
  const producer = [{
    kind: 'harness-config',
    artifactId: 'harness:quote',
    contentDigest: 'digest-harness:quote',
  }] as const;
  const harness = resolverFixture();
  const message = commandMessage('msg:10-recover');
  await openAndPinInstance(fixture);

  // First journey: admitted through the harness; cache seeded; effect completed.
  const first = await processCommandTurn(fixture, message, {
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: harness.runner },
    harness: harnessMaterial(harness.model),
    dependencies: { artifacts: producer },
  });
  assert.equal(first.kind, 'processed');
  assert.equal(harness.model.calls, 1);
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);
  const originalEffectId = fixture.journal.getRecords()[0]!.effectId;
  const originalTurnId = fixture.journal.getRecords()[0]!.durableControlTurnId;

  // Simulated reopen: a NEW v3 assembly over the SAME durable stores (instance
  // store, admission effect journal, governance baselines, durable pin store,
  // effect tools). The governance pin, baseline, instance row, accepted
  // message, command outcome and effect journal record all survive. The
  // compiled package is rebuilt deterministically under the SAME packageId.
  const reopened = await conformanceFixture(decisions, {
    shared: {
      store: fixture.store,
      journal: fixture.journal,
      baselines: fixture.baselines,
      durableExecution: fixture.durableExecution,
      tools: fixture.tools,
      b1: fixture.b1,
    },
  });
  assert.equal(reopened.packageId, fixture.packageId, 'the rebuilt package identity is deterministic');
  // No re-pin: requirePinnedExecution must find the SURVIVING durable pin.

  // (i) The A8 boundary holds across the reopen: the same message is a
  // duplicate and its durable outcome fact is still applied.
  const replayAck = await processCommandTurn(reopened, message, {});
  assert.equal(replayAck.kind, 'duplicate-ack');
  if (replayAck.kind !== 'duplicate-ack') assert.fail('expected duplicate ack');
  assert.equal(replayAck.existingOutcome?.status, 'applied');

  // (ii) A recovery resume re-presents the SAME turn through the seam: the
  // durable facts make it idempotent — exact-cache reuse (no model work) and
  // journal 'replayed' (no duplicate effect execution).
  const resumed = expectAdmitted(await reopened.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'no-match' }),
    resolver: { cacheStore: cache, harnessRunner: createXStateHarnessMachineRunner() },
    harness: harnessMaterial(new ScriptedModel([finalResponse('approve', { via: 'would-be-duplicate' })])),
    dependencies: { artifacts: producer },
    turn: { kind: 'message', sourceMessageId: 'msg:10-recover' },
  })));
  assert.equal(resumed.admitted.durableControlTurnId, originalTurnId, 'the SAME durable control-turn identity');
  assert.equal(resumed.admitted.resolver.source, 'exact-cache', 'the decision reused the durable cache fact');
  assert.equal(resumed.admitted.resolver.freshModelCallCount, 0, 'no duplicate model work');
  assert.equal(resumed.admitted.effects.length, 1);
  assert.equal(resumed.admitted.effects[0]!.disposition, 'replayed', 'the completed durable effect is reused, never re-executed');
  assert.equal(resumed.admitted.effects[0]!.effectId, originalEffectId);

  // Durable facts unchanged: one model call total, one effect execution total,
  // one journal record total.
  assert.equal(harness.model.calls, 1);
  assert.equal(fixture.tools.calls.length, 1);
  assert.equal(fixture.journal.getRecords().length, 1);
});

/* ------------------------------------------------------------------------ */
/* #585-12 — composite compatibility in one runtime instance                 */
/* ------------------------------------------------------------------------ */

test('#585-12: legacy non-semantic workflows run behaviorally unchanged in the same runtime instance alongside semantic journeys', async () => {
  const fixture = await conformanceFixture([await quoteDecisionDescriptor()]);
  await openAndPinInstance(fixture);

  // (a) The legacy caller-resolved admission path (pre-v0.6 public surface)
  // in the SAME v3 runtime instance, on the SAME pinned instance.
  const legacyResolved: ResolvedDecision<JsonValue> = {
    source: 'rule',
    structuredDecision: quoteResult('reject', { via: 'legacy-caller' }),
    provenance: {},
    freshModelCallCount: 0,
    llmAvoided: true,
    cacheDisposition: { read: 'disabled' },
    telemetry: [],
  };
  const legacyOutcome = await fixture.assembly.admitTurn({
    target,
    turn: { kind: 'message', sourceMessageId: 'msg:12-legacy' },
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId: 'order-quote:instance:42',
    definition: {
      workflowKey: 'order-quote',
      initialState: 'review',
      initialContext: {},
      guards: [],
      states: [
        {
          stateKey: 'review',
          transitions: [{
            transitionKey: 'reject',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'rejected',
            effectIntents: [{
              effectType: 'effect:reserve',
              input: { reservation: 'legacy', amount: 10 },
              idempotencyKey: 'legacy:reserve:1',
            }],
          }],
        },
        { stateKey: 'rejected', kind: 'final' },
      ],
    },
    currentStateKey: 'review',
    context: {},
    event: quoteEvent(10),
    resolved: legacyResolved,
    decisionSchema: { isValid: (value: JsonValue): boolean => typeof value === 'object' && value !== null },
    now: NOW,
  });
  if (legacyOutcome.status !== 'admitted') assert.fail('expected the legacy admission path to admit');
  assert.equal(Object.hasOwn(legacyOutcome, 'receipt'), false, 'the legacy return shape is unchanged: no receipt field');
  assert.equal(fixture.tools.calls.length, 1, 'the legacy transition effect executed once');

  // (b) A semantic journey in the SAME runtime instance, on the SAME pinned
  // instance: the seam composes declarations → resolver → admission → receipt.
  const semantic = expectAdmitted(await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    rule: new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) }),
    turn: { kind: 'message', sourceMessageId: 'msg:12-semantic' },
  })));
  assert.equal(semantic.admitted.transitionKey, 'approve');
  assert.ok(Object.hasOwn(semantic, 'receipt'), 'the semantic journey carries the additive receipt');
  assert.equal(semantic.receipt.disposition, 'admitted');
  assert.equal(semantic.receipt.source, 'rule');

  // Both authorities coexisted without contradiction: two distinct durable
  // turns, two distinct effects, and only the semantic turn got a receipt.
  assert.notEqual(legacyOutcome.admitted.durableControlTurnId, semantic.admitted.durableControlTurnId);  assert.equal(fixture.tools.calls.length, 2);
  assert.equal(fixture.journal.getRecords().length, 2);
  const receipts = await readReceiptRecords(fixture);
  assert.equal(receipts.length, 1, 'legacy admitTurn has no receipt projection');

  // (c) The legacy (v0.2,2,2) runtime still boots unchanged outside the v3
  // assembly — the composite does not regress retained hosts.
  const legacyManifest: Record<string, unknown> = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'orders',
    domainVersion: '0.2.0-legacy-t007',
    packageId: 'pending',
    targetProfileId: 'legacy@1',
    requiredCapabilities: ['crypto-hash-sha256@1', 'secure-random@1', 'expression-jsonata@1'],
    workflows: {
      'order-quote': {
        workflowId: 'order-quote',
        definition: {
          initial: 'review',
          states: {
            review: { final: false, done: [], error: [], events: {} },
            approved: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts: {},
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  const legacyPackageId = await computeCompiledPackageId(
    legacyManifest as unknown as Parameters<typeof computeCompiledPackageId>[0],
    sha256,
  );
  legacyManifest.packageId = legacyPackageId;
  const legacyRuntime = await createDomainRuntime({
    packageRegistry: new StaticPackageRegistry(
      [{ manifest: legacyManifest, bindings: {} } as never],
      legacyPackageId,
    ),
    store: new GuardedJourneyStore(),
    bindings: createRuntimeHostFake({ sha256 }),
  });
  assert.equal(typeof legacyRuntime.send, 'function');
  assert.equal(typeof legacyRuntime.openInstance, 'function');
});
