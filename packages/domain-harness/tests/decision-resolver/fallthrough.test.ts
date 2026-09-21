import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonValue } from '../../src/contracts/json.js';
import { VolatileHarnessExecutionJournalStore } from '../../src/harness/execution-journal.js';
import type {
  ExactSemanticCacheStore,
  SemanticCacheEntry,
  SemanticCacheEvictionReport,
  SemanticCachePut,
  SemanticCacheRead,
} from '../../src/semantic-cache/index.js';
import {
  DecisionResolverError,
  resolveDecision,
} from '../../src/decision-resolver/index.js';
import { DynamicChildExecutionError } from '../../src/promoted-child/index.js';
import {
  exactSelector,
  invokingContext,
  promotedFixture,
  sha256,
  type PromotedFixture,
} from '../promoted-child/helpers.js';
import {
  HARNESS_PRODUCER,
  ScriptedModel,
  ScriptedRule,
  ThrowingRule,
  assertJsonEqual,
  finalResponse,
  harnessConfig,
  makeFixture,
  makeInvocation,
  makePorts,
  queryResponse,
  quoteResult,
  rejectingSchema,
  type QuoteDecisionResult,
} from './helpers.js';

const noMatchRule = () => new ScriptedRule({ status: 'no-match' });

function promotedExecutor(calls: { count: number }) {
  return {
    async executeQuery(): Promise<JsonValue> {
      calls.count += 1;
      return { quote: quoteResult('approve', { amount: 42 }), price: 42 };
    },
  };
}

async function promotedSetup(fixtureOverrides: Parameters<typeof promotedFixture>[0] = {}) {
  const fixture = await promotedFixture(fixtureOverrides);
  const executorCalls = { count: 0 };
  return {
    fixture,
    executorCalls,
    promoted: {
      selector: exactSelector(fixture),
      executor: promotedExecutor(executorCalls),
      journal: new VolatileHarnessExecutionJournalStore(),
    },
    ports: {
      runtime: fixture.runtime,
      artifactPort: fixture.port,
      revocation: { readRevocation: (artifact: Parameters<PromotedFixture['registry']['readRevocation']>[0]) => fixture.registry.readRevocation(artifact) },
    },
  };
}

class BrokenCacheStore implements ExactSemanticCacheStore<QuoteDecisionResult> {
  async read(): Promise<SemanticCacheRead<QuoteDecisionResult>> {
    throw new Error('cache store unavailable');
  }

  async putIfAbsent(): Promise<SemanticCachePut<QuoteDecisionResult>> {
    throw new Error('cache store unavailable');
  }

  async quarantine(): Promise<void> {}
  async invalidateByProducer(): Promise<number> { return 0; }
  async invalidateByDependency(): Promise<number> { return 0; }
  async invalidateNamespace(): Promise<number> { return 0; }
  async evict(): Promise<SemanticCacheEvictionReport> { return { expired: 0, capacity: 0 }; }
}

test('resolver: cache-read ineligible dependency material bypasses the read and continues', async () => {
  const fixture = makeFixture();
  const model = new ScriptedModel([finalResponse('approve', { n: 1 })]);
  const decision = await resolveDecision(
    await makeInvocation({
      allBehaviorallyRelevantDependenciesPrebound: false,
      harness: harnessConfig(model, fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(decision.source, 'harness-machine');
  assert.equal(decision.cacheDisposition.read, 'bypass');
  assert.equal(decision.cacheDisposition.reason, 'dynamic-dependency-not-prebound');
  assert.equal(model.calls, 1);
});

test('resolver: cache store unavailability is an optimization error, never a decision failure', async () => {
  const fixture = makeFixture();
  const model = new ScriptedModel([finalResponse('approve', { n: 1 })]);
  const decision = await resolveDecision(
    await makeInvocation({ harness: harnessConfig(model, fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule(), cacheStore: new BrokenCacheStore() }),
    sha256,
  );
  assert.equal(decision.source, 'harness-machine');
  assert.equal(decision.cacheDisposition.read, 'store-error');
  assert.equal(decision.cacheDisposition.write, 'store-error');
  const ops = decision.telemetry.filter((event) => event.type === 'cache-store-error').map((event) => event.operation);
  assert.deepEqual(ops, ['read', 'write']);
});

test('resolver: promoted artifact not found is a typed fallthrough, not a failure', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  const ghostSelector = {
    kind: 'exact-digest' as const,
    artifact: { kind: 'promoted-subworkflow' as const, artifactId: 'subworkflow:ghost', contentDigest: 'digest-ghost' },
  };
  const model = new ScriptedModel([finalResponse('approve', { n: 1 })]);
  const decision = await resolveDecision(
    await makeInvocation({
      promoted: { ...promoted.promoted, selector: ghostSelector },
      harness: harnessConfig(model, fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(decision.source, 'harness-machine');
  const event = decision.telemetry.find((entry) => entry.type === 'promoted-not-found');
  assert.ok(event !== undefined);
  assert.equal(promoted.executorCalls.count, 0);
});

test('resolver: promoted incompatible with the invoking pinned context falls through with telemetry', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  const model = new ScriptedModel([finalResponse('approve', { n: 1 })]);
  const decision = await resolveDecision(
    await makeInvocation({
      invoking: invokingContext({ availableArtifacts: [] }),
      promoted: promoted.promoted,
      harness: harnessConfig(model, fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(decision.source, 'harness-machine');
  const event = decision.telemetry.find((entry) => entry.type === 'promoted-fallthrough');
  assert.ok(event !== undefined && event.type === 'promoted-fallthrough');
  assert.equal(event.code, 'DYNAMIC_CHILD_INCOMPATIBLE');
  assert.equal(promoted.executorCalls.count, 0, 'incompatible promoted child must not start work');
});

test('resolver: promoted not applicable falls through with telemetry', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  const model = new ScriptedModel([finalResponse('approve', { n: 1 })]);
  const decision = await resolveDecision(
    await makeInvocation({
      invoking: invokingContext({ applicabilityFacts: [] }),
      promoted: promoted.promoted,
      harness: harnessConfig(model, fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(decision.source, 'harness-machine');
  const event = decision.telemetry.find((entry) => entry.type === 'promoted-fallthrough');
  assert.ok(event !== undefined && event.type === 'promoted-fallthrough');
  assert.equal(event.code, 'DYNAMIC_CHILD_NOT_APPLICABLE');
});

test('resolver: revoked promoted artifact with revocationPolicy=deny fails the decision closed', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  await promoted.fixture.registry.revoke(promoted.fixture.body.identity, {
    recordId: 'revocation:1',
    authorityRef: 'audit://revocation/1',
    recordedAt: '2026-09-21T06:30:00.000Z',
    reason: 'security revocation',
    revocationPolicy: 'deny',
  });
  await assert.rejects(
    () => makeInvocation({
      promoted: promoted.promoted,
      harness: harnessConfig(new ScriptedModel([finalResponse('approve', { n: 1 })]), fixture.journal),
    }).then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }), sha256)),
    (error: unknown) => error instanceof DecisionResolverError && error.code === 'DECISION_RESOLVER_PROMOTED_REVOKED_DENY',
  );
});

test('resolver: revoked promoted artifact with revocationPolicy=fallthrough emits telemetry and continues', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  const record = await promoted.fixture.registry.revoke(promoted.fixture.body.identity, {
    recordId: 'revocation:2',
    authorityRef: 'audit://revocation/2',
    recordedAt: '2026-09-21T06:30:00.000Z',
    reason: 'superseded by a newer contract',
    revocationPolicy: 'fallthrough',
  });
  const model = new ScriptedModel([finalResponse('approve', { n: 1 })]);
  const decision = await resolveDecision(
    await makeInvocation({
      promoted: promoted.promoted,
      harness: harnessConfig(model, fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(decision.source, 'harness-machine');
  const event = decision.telemetry.find((entry) => entry.type === 'revocation-fallthrough');
  assert.ok(event !== undefined && event.type === 'revocation-fallthrough');
  assert.equal(event.recordId, record.recordId);
  assert.deepEqual(event.artifact, promoted.fixture.body.identity);
  assert.equal(promoted.executorCalls.count, 0, 'a revoked artifact never starts child work');
});

test('resolver: a floating promoted selector fails closed during the pre-read', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  await assert.rejects(
    () => makeInvocation({
      promoted: { ...promoted.promoted, selector: { kind: 'version', artifactId: 'subworkflow:quote-review', version: 'latest' } },
      harness: harnessConfig(new ScriptedModel([]), fixture.journal),
    }).then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }), sha256)),
    (error: unknown) => error instanceof DynamicChildExecutionError && error.code === 'DYNAMIC_CHILD_SELECTION_INVALID',
  );
});

test('resolver: resolution with no configured Harness fallback fails closed instead of silently downgrading', async () => {
  const fixture = makeFixture();
  await assert.rejects(
    () => makeInvocation().then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule: noMatchRule() }), sha256)),
    (error: unknown) => error instanceof DecisionResolverError && error.code === 'DECISION_RESOLVER_HARNESS_UNCONFIGURED',
  );
});

test('resolver: a promoted selector without promoted ports fails closed', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  await assert.rejects(
    () => makeInvocation({ promoted: promoted.promoted }).then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule: noMatchRule() }), sha256)),
    (error: unknown) => error instanceof DecisionResolverError && error.code === 'DECISION_RESOLVER_PROMOTED_UNCONFIGURED',
  );
});

test('resolver: a deterministic rule contract/integrity error fails closed', async () => {
  const fixture = makeFixture();
  await assert.rejects(
    () => makeInvocation({
      harness: harnessConfig(new ScriptedModel([]), fixture.journal),
    }).then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule: new ThrowingRule() }), sha256)),
    (error: unknown) => error instanceof DecisionResolverError && error.code === 'DECISION_RESOLVER_RULE_FAILED',
  );
});

test('resolver: a fresh rule result violating the declared current schema fails closed', async () => {
  const fixture = makeFixture();
  const rule = new ScriptedRule({ status: 'match', result: { not: 'a-decision' } as unknown as QuoteDecisionResult });
  await assert.rejects(
    () => makeInvocation({
      harness: harnessConfig(new ScriptedModel([]), fixture.journal),
    }).then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule }), sha256)),
    (error: unknown) => error instanceof DecisionResolverError && error.code === 'DECISION_RESOLVER_SCHEMA_VIOLATION',
  );
});

test('resolver: a fresh Harness result violating the declared current schema fails closed', async () => {
  const fixture = makeFixture();
  const model = new ScriptedModel([finalResponse('approve', { n: 1 })]);
  await assert.rejects(
    () => makeInvocation({
      schema: rejectingSchema,
      harness: harnessConfig(model, fixture.journal),
    }).then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule: noMatchRule() }), sha256)),
    (error: unknown) => error instanceof DecisionResolverError && error.code === 'DECISION_RESOLVER_SCHEMA_VIOLATION',
  );
});

test('resolver: a schema-invalid cached row is quarantined and never becomes authority for any outcome', async () => {
  const fixture = makeFixture();
  // Seed a valid entry under the exact key through a normal Harness fallback.
  const seeded = await resolveDecision(
    await makeInvocation({ harness: harnessConfig(new ScriptedModel([finalResponse('approve', { n: 1 })]), fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(seeded.cacheDisposition.write, 'inserted');
  assert.equal(fixture.cacheStore.size, 1);

  // The current schema moves and rejects everything: the cached row is denied
  // and quarantined, resolution recomputes through the Harness fallback, and
  // the fresh result then fails the same current schema closed (frozen §18).
  await assert.rejects(
    () => makeInvocation({
      schema: rejectingSchema,
      durableControlTurnId: 'turn:2',
      harness: harnessConfig(new ScriptedModel([finalResponse('approve', { n: 2 })]), fixture.journal),
    }).then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule: noMatchRule() }), sha256)),
    (error: unknown) => error instanceof DecisionResolverError && error.code === 'DECISION_RESOLVER_SCHEMA_VIOLATION',
  );
  const quarantined = fixture.cacheStore.getQuarantineRecords();
  assert.equal(quarantined.length, 1);
  assert.equal(quarantined[0]?.reason, 'current-schema-revalidation-failed');
});

test('resolver: a cached row invalid under the current schema recomputes and rewrites when the fresh result is valid', async () => {
  const fixture = makeFixture();
  await resolveDecision(
    await makeInvocation({ harness: harnessConfig(new ScriptedModel([finalResponse('approve', { n: 1 })]), fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(fixture.cacheStore.size, 1);

  // Schema now requires outcome 'reject'; the cached 'approve' row is denied.
  const strictSchema = {
    isValid: (value: JsonValue): value is QuoteDecisionResult =>
      typeof value === 'object' && value !== null && !Array.isArray(value)
      && (value as Record<string, unknown>).decision !== undefined
      && typeof (value as { decision?: { outcome?: unknown } }).decision?.outcome === 'string'
      && (value as { decision: { outcome: string } }).decision.outcome === 'reject',
  };
  const model = new ScriptedModel([finalResponse('reject', { n: 2 })]);
  const decision = await resolveDecision(
    await makeInvocation({
      schema: strictSchema,
      durableControlTurnId: 'turn:2',
      harness: harnessConfig(model, fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(decision.source, 'harness-machine');
  assert.equal(decision.cacheDisposition.reason, 'quarantined');
  assert.equal(decision.cacheDisposition.write, 'inserted', 'the quarantined row is removed and the valid fresh result rewrites');
  assertJsonEqual(decision.structuredDecision, quoteResult('reject', { n: 2 }));
});

test('resolver: observed live dependency without a semantic revision skips the cache write but keeps the fresh result', async () => {
  const fixture = makeFixture();
  const model = new ScriptedModel([
    queryResponse('price.lookup', { sku: 'P-1' }),
    finalResponse('approve', { price: 42 }),
  ]);
  const liveBinding = {
    capabilityId: 'price.lookup',
    description: 'live price lookup',
    kind: 'query' as const,
    async execute(): Promise<unknown> {
      return { value: { price: 42 } };
    },
  };
  const decision = await resolveDecision(
    await makeInvocation({
      harness: harnessConfig(model, fixture.journal, {}, { capabilities: [liveBinding] }),
    }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(decision.source, 'harness-machine');
  assert.equal(decision.freshModelCallCount, 2);
  assertJsonEqual(decision.structuredDecision, quoteResult('approve', { price: 42 }));
  assert.equal(decision.cacheDisposition.write, 'skipped');
  assert.equal(decision.cacheDisposition.writeReason, 'observed-live-dependency-without-semantic-revision');
  assert.ok(decision.telemetry.some((event) => event.type === 'cache-write-ineligible'));
  assert.equal(fixture.cacheStore.size, 0, 'no entry may be written under an incomplete key');
});

test('resolver: a HarnessMachine terminal error fails closed', async () => {
  const fixture = makeFixture();
  const model = new ScriptedModel([{ kind: 'final', result: { bogus: true } }]);
  await assert.rejects(
    () => makeInvocation({
      harness: harnessConfig(model, fixture.journal),
    }).then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule: noMatchRule() }), sha256)),
    (error: unknown) => error instanceof DecisionResolverError && error.code === 'DECISION_RESOLVER_HARNESS_FAILED',
  );
});

test('resolver: a Harness execution journal failure fails closed through the journalFailure leg', async () => {
  class BrokenJournal extends VolatileHarnessExecutionJournalStore {
    override async begin(): Promise<never> {
      throw new Error('journal backend unavailable');
    }
  }
  const fixture = makeFixture();
  const journal = new BrokenJournal();
  const model = new ScriptedModel([finalResponse('approve', { n: 1 })]);
  await assert.rejects(
    () => makeInvocation({
      harness: harnessConfig(model, journal),
    }).then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule: noMatchRule() }), sha256)),
    (error: unknown) => error instanceof DecisionResolverError
      && error.code === 'DECISION_RESOLVER_HARNESS_FAILED'
      && error.message.includes('JOURNAL_STORE_ERROR'),
  );
  assert.equal(model.calls, 0, 'journal begin gates the external call; no ambiguous fresh model work executed');
});

test('resolver: Harness producer identity must be exact or the integration fails closed', async () => {
  const fixture = makeFixture();
  const model = new ScriptedModel([finalResponse('approve', { n: 1 })]);
  await assert.rejects(
    () => makeInvocation({
      harness: harnessConfig(model, fixture.journal, {
        harnessProducerIdentity: { kind: 'tool', artifactId: 'tool:not-harness', contentDigest: 'digest-tool' },
      }),
    }).then((invocation) => resolveDecision(invocation, makePorts(fixture, { rule: noMatchRule() }), sha256)),
    (error: unknown) => error instanceof Error && error.name === 'HarnessExecutionIntegrationError',
  );
});

test('resolver: harness result is written under the exact producer identity for cross-message reuse', async () => {
  const fixture = makeFixture();
  const first = await resolveDecision(
    await makeInvocation({ harness: harnessConfig(new ScriptedModel([finalResponse('approve', { n: 1 })]), fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(first.cacheDisposition.write, 'inserted');
  const second = await resolveDecision(
    await makeInvocation({ durableControlTurnId: 'turn:2', harness: harnessConfig(new ScriptedModel([]), fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(second.source, 'exact-cache');
  const entry = second.provenance.cache?.entry as SemanticCacheEntry<QuoteDecisionResult> | undefined;
  assert.ok(entry !== undefined);
  assert.deepEqual(entry.producerIdentity, HARNESS_PRODUCER);
});

test('resolver: revocation deny is not consulted when an earlier source already resolved the decision', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  await promoted.fixture.registry.revoke(promoted.fixture.body.identity, {
    recordId: 'revocation:3',
    authorityRef: 'audit://revocation/3',
    recordedAt: '2026-09-21T06:30:00.000Z',
    reason: 'security revocation',
    revocationPolicy: 'deny',
  });
  // A populated cache resolves the decision at stage 2, before the promoted stage.
  await resolveDecision(
    await makeInvocation({ harness: harnessConfig(new ScriptedModel([finalResponse('approve', { n: 1 })]), fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  const decision = await resolveDecision(
    await makeInvocation({
      durableControlTurnId: 'turn:2',
      promoted: promoted.promoted,
      harness: harnessConfig(new ScriptedModel([]), fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(decision.source, 'exact-cache', 'the deny-revoked promoted source was never reached');
});
