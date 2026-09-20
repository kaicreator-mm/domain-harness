import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type {
  BehaviorallyRelevantSemanticDependencies,
  CompiledArtifactIdentity,
} from '../../src/contracts/domain-data.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  SemanticCacheContractError,
  VolatileExactSemanticCacheStore,
  prepareExactSemanticInvocation,
  prepareSemanticCacheWrite,
} from '../../src/semantic-cache/exact-semantic-cache.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const producer: CompiledArtifactIdentity = {
  kind: 'harness-config',
  artifactId: 'parts.quote',
  contentDigest: 'a'.repeat(64),
};

const dependencies: BehaviorallyRelevantSemanticDependencies = {
  artifacts: [producer],
  projections: [
    {
      source: 'workflow-context',
      projectionId: 'buyer',
      descriptorDigest: 'b'.repeat(64),
      valueDigest: 'c'.repeat(64),
    },
  ],
  revisions: [{ sourceId: 'catalog', revision: 'catalog@1' }],
};

async function prepared() {
  return prepareExactSemanticInvocation(
    {
      namespace: 'tenant:a',
      domainId: 'parts',
      decisionId: 'quote',
      selectedInput: { sku: 'A' },
      dependencies,
      requiredProjections: [{ source: 'workflow-context', projectionId: 'buyer' }],
      requiredRevisionSourceIds: ['catalog'],
    },
    sha256,
  );
}

test('T-013 regression: required projection matches source plus projectionId', async () => {
  await assert.rejects(
    prepareExactSemanticInvocation(
      {
        namespace: 'tenant:a',
        domainId: 'parts',
        decisionId: 'quote',
        selectedInput: { sku: 'A' },
        dependencies,
        requiredProjections: [{ source: 'domain-facts', projectionId: 'buyer' }],
        requiredRevisionSourceIds: ['catalog'],
      },
      sha256,
    ),
    (error: unknown) =>
      error instanceof SemanticCacheContractError &&
      error.code === 'MISSING_REQUIRED_SEMANTIC_INPUT',
  );
});

test('T-013 regression: concurrent putIfAbsent remains first-writer-wins', async () => {
  const invocation = await prepared();
  if (invocation.cacheEligibility.mode !== 'eligible') {
    throw new Error('fixture must be exact-cache eligible');
  }

  const observed = {
    artifacts: [producer],
    projections: dependencies.projections,
    revisions: dependencies.revisions,
  };
  const first = await prepareSemanticCacheWrite(
    invocation,
    { answer: 'first' },
    producer,
    observed,
    100,
    sha256,
  );
  const second = await prepareSemanticCacheWrite(
    invocation,
    { answer: 'second' },
    producer,
    observed,
    101,
    sha256,
  );
  if (!first.eligible || !second.eligible) {
    throw new Error('fixtures must be cache-write eligible');
  }

  const store = new VolatileExactSemanticCacheStore<{ answer: string }>();
  const writes = await Promise.all([
    store.putIfAbsent(first.entry, 100),
    store.putIfAbsent(second.entry, 101),
  ]);

  assert.deepEqual(
    writes.map((value) => value.status),
    ['inserted', 'existing'],
  );
  const read = await store.read(invocation.semanticIdentity.key, 102);
  assert.equal(read.status, 'hit');
  if (read.status === 'hit') assert.deepEqual(read.entry.result, { answer: 'first' });
});
