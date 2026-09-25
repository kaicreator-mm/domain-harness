import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type {
  CompiledArtifactIdentity,
  CompiledArtifactKind,
  ResolvedSemanticContextProjection,
  SemanticRevisionIdentity,
} from '../../src/contracts/domain-data.js';
import type { ContentDigest, Sha256Port } from '../../src/contracts/identity.js';
import {
  SemanticCacheContractError,
  VolatileExactSemanticCacheStore,
  prepareExactSemanticInvocation,
  prepareSemanticCacheWrite,
  readExactSemanticCache,
  validateObservedDependencySet,
  type ExactSemanticInvocationIdentity,
  type ExactSemanticCacheStore,
  type PreparedSemanticInvocation,
  type PrepareSemanticCacheWriteResult,
  type SemanticCacheEntry,
} from '../../src/semantic-cache/exact-semantic-cache.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function digest(character: string): ContentDigest {
  return character.repeat(64);
}

function artifact(
  kind: CompiledArtifactKind,
  artifactId: string,
  digestCharacter: string,
  version?: string,
): CompiledArtifactIdentity {
  const base = {
    kind,
    artifactId,
    contentDigest: digest(digestCharacter),
  };
  return version === undefined ? base : { ...base, version };
}

function projection(
  projectionId: string,
  descriptor = 'c',
  value = 'd',
): ResolvedSemanticContextProjection {
  return {
    projectionId,
    source: 'input',
    descriptorDigest: digest(descriptor),
    valueDigest: digest(value),
  };
}

function revision(sourceId: string, value: string): SemanticRevisionIdentity {
  return { sourceId, revision: value };
}

interface InvocationOverrides {
  readonly namespace?: string;
  readonly input?: { readonly [key: string]: string | number };
  readonly artifacts?: readonly CompiledArtifactIdentity[];
  readonly projections?: readonly ResolvedSemanticContextProjection[];
  readonly revisions?: readonly SemanticRevisionIdentity[];
  readonly allBehaviorallyRelevantDependenciesPrebound?: boolean;
}

async function invocation(overrides: InvocationOverrides = {}): Promise<PreparedSemanticInvocation> {
  return prepareExactSemanticInvocation(
    {
      namespace: overrides.namespace ?? 'tenant:a',
      domainId: 'parts',
      decisionId: 'quote',
      selectedInput: overrides.input ?? { sku: 'A' },
      dependencies: {
        artifacts: overrides.artifacts ?? [artifact('harness-config', 'h', 'a')],
        projections: overrides.projections ?? [projection('buyer')],
        revisions: overrides.revisions ?? [revision('catalog', 'r1')],
      },
      requiredProjectionIds: ['buyer'],
      requiredRevisionSourceIds: ['catalog'],
      ...(overrides.allBehaviorallyRelevantDependenciesPrebound === undefined
        ? {}
        : {
            allBehaviorallyRelevantDependenciesPrebound:
              overrides.allBehaviorallyRelevantDependenciesPrebound,
          }),
    },
    sha256,
  );
}

function exactIdentity(value: PreparedSemanticInvocation): ExactSemanticInvocationIdentity {
  if (value.cacheEligibility.mode !== 'eligible' || value.semanticIdentity === undefined) {
    throw new Error('fixture expected cache-eligible invocation');
  }
  return value.semanticIdentity;
}

function exactEntry<TResult extends { readonly [key: string]: string }>(
  value: PrepareSemanticCacheWriteResult<TResult>,
): SemanticCacheEntry<TResult> {
  if (!value.eligible) throw new Error(`fixture expected cache write: ${value.reason}`);
  return value.entry;
}

async function writable(
  prepared: PreparedSemanticInvocation,
  options: {
    readonly result?: { readonly answer: string };
    readonly producer?: CompiledArtifactIdentity;
    readonly observedArtifacts?: readonly CompiledArtifactIdentity[];
    readonly observedProjections?: readonly ResolvedSemanticContextProjection[];
    readonly observedRevisions?: readonly SemanticRevisionIdentity[];
    readonly unversionedLiveSourceIds?: readonly string[];
    readonly now?: number;
    readonly expiresAt?: number;
  } = {},
): Promise<PrepareSemanticCacheWriteResult<{ readonly answer: string }>> {
  const producer = options.producer ?? artifact('harness-config', 'h', 'a');
  return prepareSemanticCacheWrite(
    prepared,
    options.result ?? { answer: 'ok' },
    producer,
    {
      artifacts: options.observedArtifacts ?? [producer],
      projections: options.observedProjections ?? [projection('buyer')],
      revisions: options.observedRevisions ?? [revision('catalog', 'r1')],
      ...(options.unversionedLiveSourceIds === undefined
        ? {}
        : { unversionedLiveSourceIds: options.unversionedLiveSourceIds }),
    },
    options.now ?? 100,
    sha256,
    options.expiresAt,
  );
}

const schema = {
  isValid(value: unknown): value is { readonly answer: string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'answer' in value &&
      (value as { readonly answer?: unknown }).answer === 'ok'
    );
  },
};

test('T-013: exact semantic identity is canonical and excludes human artifact version metadata', async () => {
  const first = await invocation({
    artifacts: [
      artifact('knowledge', 'k', 'b', '1'),
      artifact('harness-config', 'h', 'a', '1'),
    ],
  });
  const reordered = await invocation({
    artifacts: [
      artifact('harness-config', 'h', 'a', '99'),
      artifact('knowledge', 'k', 'b', '2'),
    ],
  });
  assert.equal(
    exactIdentity(first).key.semanticDigest,
    exactIdentity(reordered).key.semanticDigest,
  );

  const changedDependency = await invocation({
    artifacts: [
      artifact('harness-config', 'h', 'e', '99'),
      artifact('knowledge', 'k', 'b', '2'),
    ],
  });
  assert.notEqual(
    exactIdentity(first).key.semanticDigest,
    exactIdentity(changedDependency).key.semanticDigest,
  );

  const changedInput = await invocation({ input: { sku: 'B' } });
  assert.notEqual(
    exactIdentity(first).key.semanticDigest,
    exactIdentity(changedInput).key.semanticDigest,
  );
});

test('T-013: missing required semantic input fails closed', async () => {
  await assert.rejects(
    invocation({ projections: [] }),
    (error: unknown) =>
      error instanceof SemanticCacheContractError &&
      error.code === 'MISSING_REQUIRED_SEMANTIC_INPUT',
  );
});

test('T-013: unbound live/dynamic dependencies make read and write ineligible', async () => {
  const missingRevision = await invocation({ revisions: [] });
  assert.deepEqual(missingRevision.cacheEligibility, {
    mode: 'bypass',
    reason: 'live-dependency-without-semantic-revision',
  });
  assert.deepEqual(await writable(missingRevision), {
    eligible: false,
    reason: 'pre-read-ineligible',
  });

  const dynamic = await invocation({ allBehaviorallyRelevantDependenciesPrebound: false });
  assert.deepEqual(dynamic.cacheEligibility, {
    mode: 'bypass',
    reason: 'dynamic-dependency-not-prebound',
  });
});

test('T-013: ObservedDependencySet is an exact subset of pre-read semantic material', async () => {
  const prepared = await invocation();
  const preRead = exactIdentity(prepared).dependencies;
  assert.deepEqual(
    validateObservedDependencySet(preRead, {
      artifacts: [artifact('harness-config', 'h', 'a')],
      projections: [projection('buyer')],
      revisions: [revision('catalog', 'r1')],
    }),
    { eligible: true },
  );

  const undeclaredArtifact = validateObservedDependencySet(preRead, {
    artifacts: [artifact('tool', 'pricing', 'f')],
  });
  assert.equal(undeclaredArtifact.eligible, false);
  if (!undeclaredArtifact.eligible) {
    assert.equal(undeclaredArtifact.reason, 'observed-artifact-not-prebound');
  }

  const unversionedLive = validateObservedDependencySet(preRead, {
    unversionedLiveSourceIds: ['clock'],
  });
  assert.equal(unversionedLive.eligible, false);
  if (!unversionedLive.eligible) {
    assert.equal(
      unversionedLive.reason,
      'observed-live-dependency-without-semantic-revision',
    );
  }

  const changedRevision = await writable(prepared, {
    observedRevisions: [revision('catalog', 'r2')],
  });
  assert.equal(changedRevision.eligible, false);
  if (!changedRevision.eligible) {
    assert.equal(changedRevision.reason, 'observed-revision-not-prebound');
  }
});

test('T-013: write requires exact producer to be prebound and observed', async () => {
  const prepared = await invocation();
  const foreignProducer = artifact('promoted-subworkflow', 'wf', 'f');
  const notPrebound = await writable(prepared, {
    producer: foreignProducer,
    observedArtifacts: [foreignProducer],
  });
  assert.equal(notPrebound.eligible, false);

  const notObserved = await writable(prepared, { observedArtifacts: [] });
  assert.equal(notObserved.eligible, false);
  if (!notObserved.eligible) assert.equal(notObserved.reason, 'producer-not-observed');
});

test('T-013: putIfAbsent is first-writer-wins and exact-only, never fuzzy/vector reuse', async () => {
  const prepared = await invocation();
  const first = exactEntry(await writable(prepared, { result: { answer: 'ok' }, now: 100 }));
  const second = exactEntry(
    await writable(prepared, { result: { answer: 'different' }, now: 101 }),
  );

  const store = new VolatileExactSemanticCacheStore<{ readonly answer: string }>();
  assert.equal((await store.putIfAbsent(first, 100)).status, 'inserted');
  const collision = await store.putIfAbsent(second, 101);
  assert.equal(collision.status, 'existing');
  assert.deepEqual(collision.entry.result, { answer: 'ok' });

  const nearMatch = await invocation({ input: { sku: 'A ' } });
  assert.deepEqual(await store.read(exactIdentity(nearMatch).key, 101), {
    status: 'miss',
    reason: 'not-found',
  });
});

test('T-013: corrupt/current-schema-invalid entries quarantine and return recompute miss', async () => {
  const prepared = await invocation();
  const entry = exactEntry(await writable(prepared, { now: 100 }));
  const store = new VolatileExactSemanticCacheStore<{ readonly answer: string }>();
  await store.putIfAbsent(entry, 100);

  const invalidSchema = {
    isValid(_value: unknown): _value is { readonly answer: string } {
      return false;
    },
  };
  assert.deepEqual(
    await readExactSemanticCache(
      store,
      exactIdentity(prepared).key,
      invalidSchema,
      110,
      sha256,
    ),
    { status: 'miss', reason: 'quarantined' },
  );
  assert.equal(store.size, 0);
  assert.equal(
    store.getQuarantineRecords().at(-1)?.reason,
    'current-schema-revalidation-failed',
  );

  const corruptSource = exactEntry(await writable(prepared, { now: 120 }));
  const corrupt: SemanticCacheEntry<{ readonly answer: string }> = {
    ...corruptSource,
    resultDigest: digest('f'),
  };
  await store.putIfAbsent(corrupt, 120);
  assert.deepEqual(
    await readExactSemanticCache(
      store,
      exactIdentity(prepared).key,
      schema,
      121,
      sha256,
    ),
    { status: 'miss', reason: 'quarantined' },
  );
  assert.equal(store.getQuarantineRecords().at(-1)?.reason, 'corrupt-cache-entry');
});

test('T-013: producer/dependency/namespace indexes invalidate only matching scope', async () => {
  const producer = artifact('harness-config', 'h', 'a');
  const knowledgeOne = artifact('knowledge', 'k1', 'b');
  const knowledgeTwo = artifact('knowledge', 'k2', 'c');

  const first = await invocation({
    namespace: 'tenant:a',
    artifacts: [producer, knowledgeOne],
  });
  const second = await invocation({
    namespace: 'tenant:a',
    input: { sku: 'B' },
    artifacts: [producer, knowledgeTwo],
  });
  const third = await invocation({
    namespace: 'tenant:b',
    input: { sku: 'C' },
    artifacts: [producer, knowledgeTwo],
  });

  const firstEntry = exactEntry(
    await writable(first, {
      observedArtifacts: [producer, knowledgeOne],
      now: 1,
    }),
  );
  const secondEntry = exactEntry(
    await writable(second, {
      observedArtifacts: [producer, knowledgeTwo],
      now: 2,
    }),
  );
  const thirdEntry = exactEntry(
    await writable(third, {
      observedArtifacts: [producer, knowledgeTwo],
      now: 3,
    }),
  );

  const store = new VolatileExactSemanticCacheStore<{ readonly answer: string }>();
  await store.putIfAbsent(firstEntry, 1);
  await store.putIfAbsent(secondEntry, 2);
  await store.putIfAbsent(thirdEntry, 3);
  assert.equal(store.size, 3);

  assert.equal(await store.invalidateByDependency(knowledgeOne, 'dependency changed'), 1);
  assert.equal(store.size, 2);
  assert.equal((await store.read(exactIdentity(second).key, 4)).status, 'hit');

  assert.equal(await store.invalidateNamespace('tenant:a', 'scope reset'), 1);
  assert.equal(store.size, 1);
  assert.equal((await store.read(exactIdentity(third).key, 4)).status, 'hit');

  assert.equal(await store.invalidateByProducer(producer, 'producer revoked'), 1);
  assert.equal(store.size, 0);
});

test('T-013: retention/eviction is deterministic operational policy only', async () => {
  const store = new VolatileExactSemanticCacheStore<{ readonly answer: string }>({
    maxEntries: 2,
    maxAgeMs: 50,
  });
  const first = await invocation({ input: { n: 1 } });
  const second = await invocation({ input: { n: 2 } });
  const third = await invocation({ input: { n: 3 } });

  await store.putIfAbsent(exactEntry(await writable(first, { now: 100 })), 100);
  await store.putIfAbsent(exactEntry(await writable(second, { now: 101 })), 101);
  await store.putIfAbsent(exactEntry(await writable(third, { now: 102 })), 102);
  assert.equal(store.size, 2);
  assert.equal((await store.read(exactIdentity(first).key, 103)).status, 'miss');
  assert.equal((await store.read(exactIdentity(third).key, 103)).status, 'hit');

  const report = await store.evict(152);
  assert.equal(report.expired, 2);
  assert.equal(store.size, 0);
});

test('T-013: cache store unavailability is optimization failure and grants no authority', async () => {
  const prepared = await invocation();
  const throwingStore: ExactSemanticCacheStore<{ readonly answer: string }> = {
    async read() {
      throw new Error('down');
    },
    async putIfAbsent() {
      throw new Error('down');
    },
    async quarantine() {
      throw new Error('down');
    },
    async invalidateByProducer() {
      throw new Error('down');
    },
    async invalidateByDependency() {
      throw new Error('down');
    },
    async invalidateNamespace() {
      throw new Error('down');
    },
    async evict() {
      throw new Error('down');
    },
  };

  assert.deepEqual(
    await readExactSemanticCache(
      throwingStore,
      exactIdentity(prepared).key,
      schema,
      1,
      sha256,
    ),
    { status: 'store-error' },
  );
});
