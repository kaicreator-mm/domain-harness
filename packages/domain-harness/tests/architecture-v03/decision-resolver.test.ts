import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CountingDecisionResolverTelemetry,
  DecisionResolver,
  MemoryExactSemanticResultCacheStore,
  resolveSemanticInvocation,
  sha256Canonical,
  type CacheEligibility,
  type CompiledArtifactIdentity,
  type CurrentDecisionSchema,
  type DecisionComputation,
  type ExactSemanticResultCacheStore,
  type JsonValue,
  type PromotedSubworkflowResolver,
  type ResolvedSemanticContextProjection,
  type ResolvedSemanticInvocation,
  type SemanticCacheEntry,
  type SemanticCacheKey,
  type SemanticCachePut,
  type SemanticCacheRead,
} from './decision-resolver.proposal.js';

type QuoteInput = Record<string, JsonValue> & {
  country: string;
  amount: number;
  mode: string;
};

type QuoteDecision = Record<string, JsonValue> & {
  event: 'APPROVE' | 'REVIEW' | 'REJECT';
  payload: Record<string, JsonValue>;
};

const schema: CurrentDecisionSchema<QuoteDecision> = {
  isValid(value: JsonValue): value is QuoteDecision {
    if (value === null || Array.isArray(value) || typeof value !== 'object') return false;
    const record = value as Record<string, JsonValue>;
    const event = record.event;
    const payload = record.payload;
    return (
      (event === 'APPROVE' || event === 'REVIEW' || event === 'REJECT') &&
      payload !== null &&
      !Array.isArray(payload) &&
      typeof payload === 'object'
    );
  },
};

function artifact(
  kind: CompiledArtifactIdentity['kind'],
  artifactId: string,
  semanticContent: JsonValue,
  version = '1.0.0',
): CompiledArtifactIdentity {
  return {
    kind,
    artifactId,
    version,
    contentDigest: sha256Canonical({ kind, artifactId, semanticContent }),
  };
}

const baseArtifacts: readonly CompiledArtifactIdentity[] = [
  artifact('rule', 'rule:quote.eligibility', { blockedCountries: ['XX'] }),
  artifact('knowledge', 'knowledge:quote.policy', { maxAmount: 10000 }),
  artifact('skill', 'skill:quote.prepare', { revision: 1 }),
  artifact('tool', 'tool:catalog.lookup', { input: 'sku', output: 'price', semanticRevision: '2026-09' }),
  artifact('output-schema', 'output:quote.decision', { events: ['APPROVE', 'REVIEW', 'REJECT'] }),
  artifact('harness-config', 'harness:quote.resolve', { maxSteps: 3, policyRevision: 'r1' }),
];

const baseContext: readonly ResolvedSemanticContextProjection[] = [
  {
    projectionId: 'quote-context',
    descriptorDigest: sha256Canonical({ selectors: ['customerTier'] }),
    valueDigest: sha256Canonical({ customerTier: 'gold' }),
  },
];

function invocation(
  input: QuoteInput,
  executionSuffix: string,
  cache: CacheEligibility = { mode: 'eligible' },
  artifacts: readonly CompiledArtifactIdentity[] = baseArtifacts,
  context: readonly ResolvedSemanticContextProjection[] = baseContext,
): ResolvedSemanticInvocation<QuoteInput> {
  return resolveSemanticInvocation({
    namespace: 'tenant:acme',
    domainId: 'quote',
    decisionId: 'quote.resolve',
    input,
    dependencies: { artifacts, context },
    execution: {
      packageId: `package-${executionSuffix}`,
      workflowInstanceId: `workflow-${executionSuffix}`,
      sourceMessageId: `message-${executionSuffix}`,
      effectId: `effect-${executionSuffix}`,
    },
    cache,
  });
}

function decision(event: QuoteDecision['event'], reason: string): QuoteDecision {
  return { event, payload: { reason } };
}

function makeResolver(args: {
  store: ExactSemanticResultCacheStore<QuoteDecision>;
  telemetry?: CountingDecisionResolverTelemetry;
  rule?: (input: QuoteInput) => QuoteDecision | null;
  subworkflow?: (input: QuoteInput) => DecisionComputation<QuoteDecision> | null;
  harness?: (input: QuoteInput) => DecisionComputation<QuoteDecision>;
}) {
  const telemetry = args.telemetry ?? new CountingDecisionResolverTelemetry();
  let ruleCalls = 0;
  let subworkflowCalls = 0;
  let harnessCalls = 0;
  const resolver = new DecisionResolver<QuoteInput, QuoteDecision>({
    rule: {
      async resolve(current) {
        ruleCalls += 1;
        return args.rule?.(current.input) ?? null;
      },
    },
    cacheStore: args.store,
    subworkflow: {
      async resolve(current) {
        subworkflowCalls += 1;
        return args.subworkflow?.(current.input) ?? null;
      },
    },
    harness: {
      async resolve(current) {
        harnessCalls += 1;
        return args.harness?.(current.input) ?? { decision: decision('REVIEW', 'harness'), freshModelCalls: 1 };
      },
    },
    schema,
    telemetry,
    nowEpochMs: () => 1_800_000_000_000,
  });
  return {
    resolver,
    telemetry,
    counters: {
      get ruleCalls() {
        return ruleCalls;
      },
      get subworkflowCalls() {
        return subworkflowCalls;
      },
      get harnessCalls() {
        return harnessCalls;
      },
    },
  };
}

function entryFor(inv: ResolvedSemanticInvocation<QuoteInput>, result: QuoteDecision): SemanticCacheEntry<QuoteDecision> {
  const key = inv.semanticIdentity?.key;
  if (key === undefined) throw new Error('expected semantic cache key');
  return {
    formatVersion: 1,
    key,
    result,
    resultDigest: sha256Canonical(result),
    createdAtEpochMs: 1_700_000_000_000,
    producer: 'harness',
  };
}

test('resolver preserves Rule -> Exact Cache -> Promoted Subworkflow -> Harness ordering', async () => {
  const store = new MemoryExactSemanticResultCacheStore<QuoteDecision>();
  const setup = makeResolver({
    store,
    rule: (input) => (input.mode === 'rule' ? decision('REJECT', 'rule') : null),
    subworkflow: (input) =>
      input.mode === 'subworkflow' ? { decision: decision('APPROVE', 'subworkflow'), freshModelCalls: 0 } : null,
    harness: () => ({ decision: decision('REVIEW', 'harness'), freshModelCalls: 1 }),
  });

  const ruleInv = invocation({ country: 'MM', amount: 1, mode: 'rule' }, 'rule');
  const ruleResult = await setup.resolver.resolve(ruleInv);
  assert.equal(ruleResult.source, 'rule');
  assert.equal(setup.counters.subworkflowCalls, 0);
  assert.equal(setup.counters.harnessCalls, 0);

  const cacheInv = invocation({ country: 'MM', amount: 2, mode: 'cache' }, 'cache');
  store.seed(entryFor(cacheInv, decision('APPROVE', 'cached')));
  const cacheResult = await setup.resolver.resolve(cacheInv);
  assert.equal(cacheResult.source, 'semantic-cache');
  assert.equal(setup.counters.subworkflowCalls, 0);
  assert.equal(setup.counters.harnessCalls, 0);

  const subInv = invocation({ country: 'MM', amount: 3, mode: 'subworkflow' }, 'sub');
  const subResult = await setup.resolver.resolve(subInv);
  assert.equal(subResult.source, 'promoted-subworkflow');
  assert.equal(setup.counters.subworkflowCalls, 1);
  assert.equal(setup.counters.harnessCalls, 0);

  const harnessInv = invocation({ country: 'MM', amount: 4, mode: 'unknown' }, 'harness');
  const harnessResult = await setup.resolver.resolve(harnessInv);
  assert.equal(harnessResult.source, 'harness');
  assert.equal(setup.counters.subworkflowCalls, 2);
  assert.equal(setup.counters.harnessCalls, 1);
});

test('persistent store boundary supports cross-resolver exact hit across different execution identities', async () => {
  const store = new MemoryExactSemanticResultCacheStore<QuoteDecision>();
  const first = makeResolver({ store });
  const second = makeResolver({ store, harness: () => { throw new Error('cache hit must avoid fresh HarnessMachine'); } });
  const input: QuoteInput = { country: 'MM', amount: 500, mode: 'unknown' };

  const firstResult = await first.resolver.resolve(invocation(input, 'execution-a'));
  assert.equal(firstResult.source, 'harness');
  assert.equal(first.counters.harnessCalls, 1);

  const secondInv = invocation(input, 'execution-b');
  const firstInv = invocation(input, 'execution-a');
  assert.equal(firstInv.semanticIdentity?.key.semanticDigest, secondInv.semanticIdentity?.key.semanticDigest);
  const secondResult = await second.resolver.resolve(secondInv);
  assert.equal(secondResult.source, 'semantic-cache');
  assert.equal(second.counters.harnessCalls, 0);
});

test('semantic identity invalidates only behaviorally relevant selected dependencies', () => {
  const input: QuoteInput = { country: 'MM', amount: 900, mode: 'unknown' };
  const base = invocation(input, 'package-a');
  const packageOnlyChange = invocation(input, 'package-b');
  assert.equal(base.semanticIdentity?.key.semanticDigest, packageOnlyChange.semanticIdentity?.key.semanticDigest);

  const versionOnlyArtifacts = baseArtifacts.map((item) => ({ ...item, version: '99.0.0' }));
  const versionOnly = invocation(input, 'package-c', { mode: 'eligible' }, versionOnlyArtifacts);
  assert.equal(base.semanticIdentity?.key.semanticDigest, versionOnly.semanticIdentity?.key.semanticDigest);

  const changedRule = baseArtifacts.map((item) =>
    item.kind === 'rule' ? { ...item, contentDigest: sha256Canonical({ changed: true }) } : item,
  );
  const behaviorChange = invocation(input, 'package-d', { mode: 'eligible' }, changedRule);
  assert.notEqual(base.semanticIdentity?.key.semanticDigest, behaviorChange.semanticIdentity?.key.semanticDigest);

  const changedSelectedContext: readonly ResolvedSemanticContextProjection[] = [
    {
      ...baseContext[0]!,
      valueDigest: sha256Canonical({ customerTier: 'silver' }),
    },
  ];
  const selectedContextChange = invocation(input, 'package-e', { mode: 'eligible' }, baseArtifacts, changedSelectedContext);
  assert.notEqual(base.semanticIdentity?.key.semanticDigest, selectedContextChange.semanticIdentity?.key.semanticDigest);
});

class CountingStore implements ExactSemanticResultCacheStore<QuoteDecision> {
  readonly delegate = new MemoryExactSemanticResultCacheStore<QuoteDecision>();
  reads = 0;
  writes = 0;

  async read(key: SemanticCacheKey, nowEpochMs: number): Promise<SemanticCacheRead<QuoteDecision>> {
    this.reads += 1;
    return this.delegate.read(key, nowEpochMs);
  }

  async putIfAbsent(entry: SemanticCacheEntry<QuoteDecision>): Promise<SemanticCachePut<QuoteDecision>> {
    this.writes += 1;
    return this.delegate.putIfAbsent(entry);
  }

  async quarantine(key: SemanticCacheKey, reason: string): Promise<void> {
    void reason;
    await this.delegate.quarantine(key);
  }
}

test('non-cacheable and time-sensitive invocations bypass cache read and write', async () => {
  for (const cache of [
    { mode: 'bypass', reason: 'non-cacheable' },
    { mode: 'bypass', reason: 'time-sensitive' },
  ] as const) {
    const store = new CountingStore();
    const setup = makeResolver({ store });
    const current = invocation({ country: 'MM', amount: 42, mode: 'unknown' }, cache.reason, cache);
    assert.equal(current.semanticIdentity, undefined);
    const first = await setup.resolver.resolve(current);
    const second = await setup.resolver.resolve(current);
    assert.equal(first.source, 'harness');
    assert.equal(second.source, 'harness');
    assert.equal(setup.counters.harnessCalls, 2);
    assert.equal(store.reads, 0);
    assert.equal(store.writes, 0);
  }
});

test('cache hit is revalidated by current schema and stale invalid entry falls through safely', async () => {
  const store = new MemoryExactSemanticResultCacheStore<QuoteDecision>();
  const current = invocation({ country: 'MM', amount: 100, mode: 'unknown' }, 'invalid-cache');
  const key = current.semanticIdentity?.key;
  if (key === undefined) throw new Error('expected semantic cache key');
  store.seed({
    formatVersion: 1,
    key,
    result: { event: 'OLD_EVENT', payload: { reason: 'stale' } } as unknown as QuoteDecision,
    resultDigest: sha256Canonical({ event: 'OLD_EVENT', payload: { reason: 'stale' } }),
    createdAtEpochMs: 1_700_000_000_000,
    producer: 'harness',
  });
  const setup = makeResolver({
    store,
    harness: () => ({ decision: decision('REVIEW', 'fresh-after-invalid-cache'), freshModelCalls: 1 }),
  });
  const result = await setup.resolver.resolve(current);
  assert.equal(result.source, 'harness');
  assert.equal(result.cacheDisposition, 'invalid-entry');
  assert.equal(setup.counters.harnessCalls, 1);
});

test('valid cache hit still has no transition authority when the current Domain Machine guard rejects it', async () => {
  const store = new MemoryExactSemanticResultCacheStore<QuoteDecision>();
  const current = invocation({ country: 'MM', amount: 120, mode: 'unknown' }, 'guard');
  store.seed(entryFor(current, decision('APPROVE', 'cached-approval')));
  const setup = makeResolver({ store, harness: () => { throw new Error('guard rejection must not cause resolver fallback'); } });
  const resolved = await setup.resolver.resolve(current);
  assert.equal(resolved.source, 'semantic-cache');

  let currentState = 'awaitingDecision';
  const currentGuardAllowsApprove = false;
  if (resolved.decision.event === 'APPROVE' && currentGuardAllowsApprove) currentState = 'approved';
  else currentState = 'guardRejected';

  assert.equal(currentState, 'guardRejected');
  assert.equal(setup.counters.harnessCalls, 0);
});

test('semantic cache remains separate from execution journal/effect idempotency', async () => {
  const store = new MemoryExactSemanticResultCacheStore<QuoteDecision>();
  const first = makeResolver({ store });
  const input: QuoteInput = { country: 'MM', amount: 333, mode: 'unknown' };
  await first.resolver.resolve(invocation(input, 'journal-a'));

  const second = makeResolver({ store });
  const cached = await second.resolver.resolve(invocation(input, 'journal-b'));
  assert.equal(cached.source, 'semantic-cache');

  const committedEffects = new Set<string>();
  let mutationApplications = 0;
  const commitEffect = (effectId: string) => {
    if (committedEffects.has(effectId)) return;
    committedEffects.add(effectId);
    mutationApplications += 1;
  };

  assert.equal(mutationApplications, 0, 'cache hit is computation reuse only');
  commitEffect('effect-journal-b');
  commitEffect('effect-journal-b');
  assert.equal(mutationApplications, 1, 'effect replay is execution-specific and separately idempotent');
});

test('cache store unavailability falls through; source contract failures do not silently fall through', async () => {
  const failingStore: ExactSemanticResultCacheStore<QuoteDecision> = {
    async read() {
      throw new Error('store unavailable');
    },
    async putIfAbsent() {
      throw new Error('store unavailable');
    },
  };
  const setup = makeResolver({
    store: failingStore,
    subworkflow: () => ({ decision: decision('APPROVE', 'subworkflow-after-cache-error'), freshModelCalls: 0 }),
  });
  const result = await setup.resolver.resolve(invocation({ country: 'MM', amount: 1, mode: 'subworkflow' }, 'store-error'));
  assert.equal(result.source, 'promoted-subworkflow');
  assert.equal(result.cacheDisposition, 'store-error');
  assert.deepEqual(setup.telemetry.cacheWrites, ['store-error']);

  const invalidRule = makeResolver({
    store: new MemoryExactSemanticResultCacheStore<QuoteDecision>(),
    rule: () => ({ event: 'NOT_ALLOWED', payload: {} } as unknown as QuoteDecision),
  });
  await assert.rejects(
    invalidRule.resolver.resolve(invocation({ country: 'MM', amount: 2, mode: 'rule' }, 'invalid-rule')),
    /outside the current output schema/,
  );
  assert.equal(invalidRule.counters.subworkflowCalls, 0);
  assert.equal(invalidRule.counters.harnessCalls, 0);
});

test('LLM Avoidance Rate counts decisions without fresh model calls, not 1 - modelCalls/decisions', async () => {
  const store = new MemoryExactSemanticResultCacheStore<QuoteDecision>();
  const telemetry = new CountingDecisionResolverTelemetry();
  const subworkflow: PromotedSubworkflowResolver<QuoteInput, QuoteDecision> = {
    async resolve(current) {
      if (current.input.mode === 'reasoned-subworkflow') {
        return { decision: decision('APPROVE', 'reasoned-subworkflow'), freshModelCalls: 2 };
      }
      return { decision: decision('APPROVE', 'deterministic-subworkflow'), freshModelCalls: 0 };
    },
  };
  const resolver = new DecisionResolver<QuoteInput, QuoteDecision>({
    rule: { async resolve() { return null; } },
    cacheStore: store,
    subworkflow,
    harness: { async resolve() { throw new Error('not expected'); } },
    schema,
    telemetry,
    nowEpochMs: () => 1_800_000_000_000,
  });

  await resolver.resolve(invocation({ country: 'MM', amount: 1, mode: 'reasoned-subworkflow' }, 'metric-a'));
  await resolver.resolve(invocation({ country: 'MM', amount: 2, mode: 'deterministic-subworkflow' }, 'metric-b'));

  const snapshot = telemetry.snapshot();
  assert.deepEqual(snapshot, {
    domainDecisions: 2,
    freshModelCalls: 2,
    decisionsWithFreshModelCall: 1,
    decisionsWithoutFreshModelCall: 1,
    llmAvoidanceRate: 0.5,
  });
});
