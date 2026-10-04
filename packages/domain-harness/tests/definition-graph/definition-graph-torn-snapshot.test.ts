/**
 * #555 FULL_REVIEW_SUPPLEMENT adversarial regression: async torn-snapshot.
 *
 * `Sha256Port` is async and the graph envelope is caller-owned mutable
 * state. These tests drive `computeDefinitionGraphDigest` with a hostile
 * Sha256Port fixture that deliberately mutates the original graph — graphId,
 * a later Component's semantic material, bound components, relations —
 * while a digest promise is still pending. The produced digest must always
 * equal the digest of the pre-mutation admitted snapshot (never a torn
 * hybrid that never existed as one admitted graph).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
  type DefinitionRelation,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

type MutableGraph = {
  -readonly [K in keyof DefinitionGraphEnvelope]: DefinitionGraphEnvelope[K] extends readonly (infer T)[]
    ? T[]
    : DefinitionGraphEnvelope[K];
};
type MutableRelation = { -readonly [K in keyof DefinitionRelation]: DefinitionRelation[K] };
type MutableComponent = { -readonly [K in keyof ComponentEnvelope]: ComponentEnvelope[K] };

function component(componentId: string, overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { kindId: 'example.kind', version: '1.0.0' },
    requiredSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    requiredCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    semanticBody: { threshold: 10 },
    ...overrides,
  };
}

function relation(overrides: Partial<DefinitionRelation> = {}): DefinitionRelation {
  return {
    relationId: overrides.relationId ?? 'rel.a-depends-b',
    relationKind: overrides.relationKind ?? 'depends-on',
    sourceComponentId: overrides.sourceComponentId ?? 'component.a',
    targetComponentId: overrides.targetComponentId ?? 'component.b',
  };
}

/** Identical twin graphs: `victim` is mutated mid-digest, `untouched` is not. */
function graphTwin(): { victim: MutableGraph; untouched: DefinitionGraphEnvelope } {
  const build = (): DefinitionGraphEnvelope => ({
    graphId: 'graph.torn-snapshot',
    components: [component('component.a'), component('component.b')],
    relations: [relation()],
  });
  return { victim: build() as MutableGraph, untouched: build() };
}

/**
 * Sha256Port that synchronously invokes `mutate` inside the digestUtf8 call
 * at zero-based index `callIndex` — while that digest promise is still
 * pending and the caller could legitimately be touching its own graph.
 */
function mutationSha256(callIndex: number, mutate: () => void): Sha256Port {
  let calls = 0;
  return {
    async digestUtf8(value: string): Promise<string> {
      if (calls === callIndex) {
        mutate();
      }
      calls += 1;
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };
}

test('#555: mutation during the FIRST Component digest promise cannot tear the snapshot (graphId, later Component, relations)', async () => {
  const { victim, untouched } = graphTwin();

  // Call 0 is the first Component semantic digest; at that point the later
  // Component's material and the relation list have NOT been hashed yet.
  // A torn implementation reading them after the suspension would observe
  // the mutated values.
  const adversarial = mutationSha256(0, () => {
    victim.graphId = 'graph.mutated-after-admission';
    (victim.components[1] as MutableComponent).semanticBody = { threshold: 999 };
    victim.components.push(component('component.c'));
    (victim.relations[0] as MutableRelation).relationKind = 'consumes';
    victim.relations.push(
      relation({ relationId: 'rel.b-depends-c', sourceComponentId: 'component.b', targetComponentId: 'component.c' }),
    );
  });

  const digest = await computeDefinitionGraphDigest(victim, adversarial);
  const expected = await computeDefinitionGraphDigest(untouched, realSha256);

  assert.equal(
    digest,
    expected,
    'digest equals the pre-mutation admitted snapshot, never a torn hybrid',
  );

  // Prove the mutation was real: the mutated graph is still a valid graph,
  // and its own fresh digest differs from the snapshot digest.
  const mutatedDigest = await computeDefinitionGraphDigest(victim, realSha256);
  assert.notEqual(mutatedDigest, digest, 'mutation must actually change graph identity');
});

test('#555: mutation during the graph material digest cannot re-read envelope fields after suspension', async () => {
  const { victim, untouched } = graphTwin();

  // Calls 0 and 1 are the two Component digests; call 2 is the graph-level
  // material digest. Mutating at call 2 attacks any post-suspension re-read
  // of envelope.graphId / envelope.components / envelope.relations.
  const adversarial = mutationSha256(2, () => {
    victim.graphId = 'graph.mutated-at-graph-hash';
    victim.components.length = 0;
    victim.relations.length = 0;
  });

  const digest = await computeDefinitionGraphDigest(victim, adversarial);
  const expected = await computeDefinitionGraphDigest(untouched, realSha256);

  assert.equal(digest, expected, 'graph material comes from the pre-suspension snapshot only');
});

test('#555: mutating the FIRST Component itself mid-flight still digests the admitted snapshot', async () => {
  const { victim, untouched } = graphTwin();

  // Mutate component "component.a" (the first, already-being-hashed
  // component) during its own digest promise.
  const adversarial = mutationSha256(0, () => {
    (victim.components[0] as MutableComponent).semanticBody = { threshold: -1 };
    (victim.components[0] as MutableComponent).componentId = 'component.renamed';
  });

  const digest = await computeDefinitionGraphDigest(victim, adversarial);
  const expected = await computeDefinitionGraphDigest(untouched, realSha256);

  assert.equal(digest, expected, 'the admitted component snapshot wins over caller mutation');
});
