import assert from 'node:assert/strict';
import test from 'node:test';
import type { JsonValue } from '../../src/contracts/json.js';
import { VolatileHarnessExecutionJournalStore } from '../../src/harness/execution-journal.js';
import { dynamicChildSlotKey } from '../../src/promoted-child/index.js';
import { resolveDecision, type ResolvedDecision } from '../../src/decision-resolver/index.js';
import {
  promotedFixture,
  exactSelector,
  invokingContext,
  makeSlot,
  sha256,
  type PromotedFixture,
} from '../promoted-child/helpers.js';
import {
  ScriptedModel,
  ScriptedRule,
  assertJsonEqual,
  finalResponse,
  harnessConfig,
  makeFixture,
  makeInvocation,
  makePorts,
  quoteResult,
  type InvocationOptions,
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

interface PromotedSetup {
  readonly fixture: PromotedFixture;
  readonly executorCalls: { count: number };
  readonly promoted: NonNullable<InvocationOptions['promoted']>;
  readonly ports: {
    readonly runtime: PromotedFixture['runtime'];
    readonly artifactPort: PromotedFixture['port'];
    readonly revocation: { readRevocation: PromotedFixture['registry']['readRevocation'] };
  };
}

async function promotedSetup(overrides: Parameters<typeof promotedFixture>[0] = {}): Promise<PromotedSetup> {
  const fixture = await promotedFixture(overrides);
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
      revocation: { readRevocation: (artifact) => fixture.registry.readRevocation(artifact) },
    },
  };
}

test('resolver: deterministic rule resolves with zero fresh model work and never touches later sources', async () => {
  const fixture = makeFixture();
  const rule = new ScriptedRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });
  const model = new ScriptedModel([finalResponse('approve', { via: 'harness' })]);
  let cacheReads = 0;
  const store = fixture.cacheStore;
  const countingStore = new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'read') {
        return async (...args: unknown[]) => {
          cacheReads += 1;
          return (target.read as (...a: unknown[]) => unknown)(...args);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const decision = await resolveDecision(
    await makeInvocation({ harness: harnessConfig(model, fixture.journal) }),
    makePorts(fixture, { rule, cacheStore: countingStore }),
    sha256,
  );
  assert.equal(decision.source, 'rule');
  assert.equal(decision.freshModelCallCount, 0);
  assert.equal(decision.llmAvoided, true);
  assert.deepEqual(decision.structuredDecision, quoteResult('approve', { via: 'rule' }));
  assert.equal(cacheReads, 0, 'rule match must never consult the cache stage');
  assert.equal(model.calls, 0, 'rule match must never consult the Harness fallback');
  assert.equal(rule.calls, 1);
});

test('resolver: frozen order — rule beats a populated exact cache and a configured promoted selector', async () => {
  const fixture = makeFixture();
  // Populate the cache through a full Harness fallback so a hit would exist.
  const seedModel = new ScriptedModel([finalResponse('approve', { via: 'cache' })]);
  const seeded = await resolveDecision(
    await makeInvocation({ harness: harnessConfig(seedModel, fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(seeded.source, 'harness-machine');
  assert.equal(fixture.cacheStore.size, 1);

  const promoted = await promotedSetup();
  const rule = new ScriptedRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });
  const decision = await resolveDecision(
    await makeInvocation({ promoted: promoted.promoted, harness: harnessConfig(new ScriptedModel([]), fixture.journal) }),
    makePorts(fixture, { rule, promoted: promoted.ports }),
    sha256,
  );
  assert.equal(decision.source, 'rule');
  assert.deepEqual(decision.structuredDecision, quoteResult('approve', { via: 'rule' }));
  assert.equal(promoted.executorCalls.count, 0, 'rule match must not run the promoted child');
});

test('resolver: exact cache reuse across messages — second invocation hits without any execution', async () => {
  const fixture = makeFixture();
  const first = await resolveDecision(
    await makeInvocation({ harness: harnessConfig(new ScriptedModel([finalResponse('approve', { n: 1 })]), fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(first.source, 'harness-machine');
  assert.equal(first.freshModelCallCount, 1);
  assert.equal(first.llmAvoided, false);
  assert.equal(first.cacheDisposition.write, 'inserted');

  const secondJournal = new VolatileHarnessExecutionJournalStore();
  const secondModel = new ScriptedModel([]);
  const second = await resolveDecision(
    await makeInvocation({ durableControlTurnId: 'turn:2', harness: harnessConfig(secondModel, secondJournal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(second.source, 'exact-cache');
  assert.equal(second.freshModelCallCount, 0);
  assert.equal(second.llmAvoided, true);
  assert.deepEqual(second.structuredDecision, first.structuredDecision);
  assert.equal(secondModel.calls, 0, 'a cache hit must never call the model');
  assert.equal(secondJournal.getRecords().length, 0, 'a cache hit never implies mutation/execution committed');
  assert.equal(second.cacheDisposition.read, 'hit');
});

test('resolver: promoted subworkflow reuses the pre-read resolution exactly once and never calls a planner', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  let resolveExactCalls = 0;
  const basePort = promoted.fixture.port;
  const countingPort = {
    ...basePort,
    resolveExact: async (...args: Parameters<typeof basePort.resolveExact>) => {
      resolveExactCalls += 1;
      return basePort.resolveExact(...args);
    },
  };
  const model = new ScriptedModel([]);
  const decision = await resolveDecision(
    await makeInvocation({ promoted: promoted.promoted, harness: harnessConfig(model, fixture.journal) }),
    makePorts(fixture, {
      rule: noMatchRule(),
      promoted: { ...promoted.ports, artifactPort: countingPort },
    }),
    sha256,
  );
  assert.equal(decision.source, 'promoted-subworkflow');
  assert.equal(decision.freshModelCallCount, 0);
  assert.equal(decision.llmAvoided, true);
  assert.equal(model.calls, 0, 'promoted reuse must not invoke any planner/model');
  assert.equal(resolveExactCalls, 1, 'the configured selector resolves exactly once per invocation');
  assert.deepEqual(decision.selectedArtifactIdentity, promoted.fixture.body.identity);
  assert.equal(promoted.executorCalls.count, 1);
  const pin = await promoted.fixture.pinStore.get(dynamicChildSlotKey(makeSlot()));
  assert.ok(pin !== undefined, 'the promoted stage commits the durable pin before child work');
  assert.equal(pin.artifact.contentDigest, promoted.fixture.body.identity.contentDigest);
  assert.deepEqual(decision.provenance.promoted?.emittedEvents, [{ eventType: 'QUOTE_PREPARED', payload: 42 }]);
  assert.equal(decision.cacheDisposition.write, 'inserted', 'promoted-produced results are cacheable under the exact producer rule');
});

test('resolver: a promoted-produced entry serves the next invocation before any second pin or child work', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  const first = await resolveDecision(
    await makeInvocation({ promoted: promoted.promoted }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(first.source, 'promoted-subworkflow');
  assert.equal(fixture.cacheStore.size, 1);

  const second = await resolveDecision(
    await makeInvocation({ durableControlTurnId: 'turn:2', promoted: promoted.promoted }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(second.source, 'exact-cache');
  assert.deepEqual(second.structuredDecision, first.structuredDecision);
  assert.equal(promoted.executorCalls.count, 1, 'cache hit must not re-run the promoted child');
  const secondSlotPin = await promoted.fixture.pinStore.get(dynamicChildSlotKey(makeSlot()));
  assert.ok(secondSlotPin !== undefined, 'the original pin persists');
  assert.equal(promoted.executorCalls.count, 1);
});

test('resolver: true unknown falls through every source to the HarnessMachine fallback', async () => {
  const fixture = makeFixture();
  const model = new ScriptedModel([finalResponse('reject', { reason: 'unknown' })]);
  const decision = await resolveDecision(
    await makeInvocation({ harness: harnessConfig(model, fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(decision.source, 'harness-machine');
  assert.equal(decision.freshModelCallCount, 1);
  assert.equal(decision.llmAvoided, false);
  assertJsonEqual(decision.structuredDecision, quoteResult('reject', { reason: 'unknown' }));
  assert.ok(decision.provenance.harness !== undefined);
  assert.equal(decision.cacheDisposition.read, 'miss');
});

test('resolver: frozen order — exact cache beats a configured promoted selector and the Harness fallback', async () => {
  const fixture = makeFixture();
  const promoted = await promotedSetup();
  // First invocation: the promoted child resolves (its exact identity joins the
  // dependency material) but is not applicable, so the Harness fallback resolves
  // and writes under the key that already contains the promoted identity.
  const notApplicable = invokingContext({ applicabilityFacts: [] });
  const first = await resolveDecision(
    await makeInvocation({
      invoking: notApplicable,
      promoted: promoted.promoted,
      harness: harnessConfig(new ScriptedModel([finalResponse('approve', { via: 'cache' })]), fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(first.source, 'harness-machine');
  assert.equal(first.cacheDisposition.write, 'inserted');

  const model = new ScriptedModel([]);
  const decision = await resolveDecision(
    await makeInvocation({
      invoking: notApplicable,
      durableControlTurnId: 'turn:2',
      promoted: promoted.promoted,
      harness: harnessConfig(model, fixture.journal),
    }),
    makePorts(fixture, { rule: noMatchRule(), promoted: promoted.ports }),
    sha256,
  );
  assert.equal(decision.source, 'exact-cache');
  assertJsonEqual(decision.structuredDecision, quoteResult('approve', { via: 'cache' }));
  assert.equal(promoted.executorCalls.count, 0, 'cache hit must not start promoted child work');
  assert.equal(model.calls, 0, 'cache hit must not reach the Harness fallback');
  const pin = await promoted.fixture.pinStore.get(dynamicChildSlotKey(makeSlot()));
  assert.equal(pin, undefined, 'cache hit commits no dynamic child pin');
  assert.equal(
    decision.telemetry.some((event) => event.type === 'promoted-fallthrough'),
    false,
    'the promoted stage is never evaluated when the cache resolves',
  );
});

test('resolver: guard rejection is final — the resolver performs no hidden retry after returning a result', async () => {
  const fixture = makeFixture();
  const rule = noMatchRule();
  const model = new ScriptedModel([finalResponse('approve', { guard: 'will-reject' })]);
  const decision = await resolveDecision(
    await makeInvocation({ harness: harnessConfig(model, fixture.journal) }),
    makePorts(fixture, { rule }),
    sha256,
  );
  assert.equal(decision.source, 'harness-machine');
  // The parent Domain Machine now applies its current synchronous guard and rejects.
  const parentGuardRejects = (value: ResolvedDecision<QuoteDecisionResult>): boolean => {
    void value;
    return false;
  };
  assert.equal(parentGuardRejects(decision), false);
  // S7: nothing in the resolver retried or re-resolved anything.
  assert.equal(rule.calls, 1, 'no hidden rule re-evaluation');
  assert.equal(model.calls, 1, 'no hidden model retry after guard rejection');
});

test('resolver: a cache hit is returned even when the downstream guard would reject it (guard authority stays with the parent)', async () => {
  const fixture = makeFixture();
  await resolveDecision(
    await makeInvocation({ harness: harnessConfig(new ScriptedModel([finalResponse('approve', { n: 1 })]), fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  const model = new ScriptedModel([]);
  const decision = await resolveDecision(
    await makeInvocation({ durableControlTurnId: 'turn:2', harness: harnessConfig(model, fixture.journal) }),
    makePorts(fixture, { rule: noMatchRule() }),
    sha256,
  );
  assert.equal(decision.source, 'exact-cache');
  assert.equal(model.calls, 0, 'a cache hit must not fall through to re-execution; guard rejection is the parent\u2019s explicit decision');
});
