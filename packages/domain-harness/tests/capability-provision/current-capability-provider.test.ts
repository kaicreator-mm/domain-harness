import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  type CapabilityContractRef,
  type ComponentEnvelope,
} from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  type ToolOperationContract,
  type ToolOperationsDeclaration,
} from '../../src/contracts/tool-component.js';
import {
  CapabilityProvisionContractError,
  resolveCurrentCapabilityProvider,
  selectCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import * as capabilityProvisionModule from '../../src/contracts/capability-provision.js';

const CREDIT_RATING: CapabilityContractRef = {
  capabilityId: 'credit-rating-lookup',
  version: '1.1.0',
};
const CREDIT_RATING_V2: CapabilityContractRef = {
  capabilityId: 'credit-rating-lookup',
  version: '2.0.0',
};
const AUDIT_TRAIL: CapabilityContractRef = {
  capabilityId: 'audit.trail.emit',
  version: '0.3.0',
};

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function digestOf(graph: DefinitionGraphEnvelope): Promise<string> {
  return computeDefinitionGraphDigest(graph, sha256);
}

function operation(): ToolOperationContract {
  return {
    operationId: 'lookup.credit-rating',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    effect: 'idempotent',
  };
}

function declaration(provides: readonly CapabilityContractRef[]): ToolOperationsDeclaration {
  return { operations: [operation()], providesCapabilities: provides };
}

function toolComponent(overrides?: {
  componentId?: string;
  provides?: readonly CapabilityContractRef[];
  requires?: readonly CapabilityContractRef[];
  semanticBody?: JsonValue;
}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: overrides?.componentId ?? 'catalog.credit-rating.tool',
    kind: { kindId: 'tool.credit-rating.v1', version: '2.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: overrides?.requires ?? [],
    semanticBody:
      overrides?.semanticBody ??
      (declaration(overrides?.provides ?? [CREDIT_RATING]) as unknown as JsonValue),
  };
}

function semanticComponent(overrides?: {
  componentId?: string;
  requires?: readonly CapabilityContractRef[];
}): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: overrides?.componentId ?? 'quote.eligibility.rule',
    kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
    requiredSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
    requiredCapabilities: overrides?.requires ?? [],
    semanticBody: { threshold: 100, policy: { tier: 'gold', enabled: true } },
  };
}

function graphOf(
  components: readonly ComponentEnvelope[],
  relations: DefinitionGraphEnvelope['relations'] = [],
): DefinitionGraphEnvelope {
  return {
    graphId: 'provision.current.test.graph',
    components: [...components],
    relations,
  };
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) return [[...values]];
  const out: T[][] = [];
  for (const [index, value] of values.entries()) {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    for (const tail of permutations(rest)) {
      out.push([value, ...tail]);
    }
  }
  return out;
}

async function expectProvisionFailure(
  run: () => Promise<unknown>,
  code: string,
): Promise<CapabilityProvisionContractError> {
  let error: unknown;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  if (error === undefined) {
    assert.fail('expected the currentness-bound selection to fail closed');
  }
  assert.ok(
    error instanceof CapabilityProvisionContractError,
    'expected CapabilityProvisionContractError',
  );
  assert.equal((error as CapabilityProvisionContractError).code, code);
  return error as CapabilityProvisionContractError;
}

// ---------------------------------------------------------------------------
// R2 matrix 1: consumer requires the exact capability + one provider ->
// currentness-bound selection succeeds, and the evidence is frozen fresh
// values bound to the recomputed digest, the consumer and the provider.
// ---------------------------------------------------------------------------

test('#572-1: consumer requires exact capability + one provider -> currentness-bound selection succeeds', async () => {
  const provider = toolComponent({ componentId: 'catalog.credit-rating.tool' });
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const graph = graphOf([consumer, provider]);
  const digest = await digestOf(graph);

  const selection = await resolveCurrentCapabilityProvider(
    graph,
    CREDIT_RATING,
    'quote.eligibility.rule',
    digest,
    sha256,
  );

  assert.equal(selection.graphId, 'provision.current.test.graph');
  assert.equal(selection.definitionGraphDigest, digest);
  assert.deepEqual(selection.requiredCapability, CREDIT_RATING);
  assert.equal(selection.consumer.componentId, 'quote.eligibility.rule');
  assert.deepEqual(selection.consumer.requiredCapability, CREDIT_RATING);
  assert.equal(selection.provider.componentId, 'catalog.credit-rating.tool');
  assert.equal(selection.provider.family, 'tool');
  assert.deepEqual(selection.provider.providesCapability, CREDIT_RATING);

  // The requirement evidence is copied from the graph declaration, not the
  // caller-owned request object (deep-equal values, distinct identities).
  assert.notStrictEqual(selection.requiredCapability, CREDIT_RATING);
  assert.notStrictEqual(selection.consumer.requiredCapability, CREDIT_RATING);
  assert.notStrictEqual(selection.provider.providesCapability, CREDIT_RATING);

  // Every level of the evidence is runtime-frozen.
  assert.equal(Object.isFrozen(selection), true);
  assert.equal(Object.isFrozen(selection.requiredCapability), true);
  assert.equal(Object.isFrozen(selection.consumer), true);
  assert.equal(Object.isFrozen(selection.consumer.requiredCapability), true);
  assert.equal(Object.isFrozen(selection.provider), true);
  assert.equal(Object.isFrozen(selection.provider.providesCapability), true);
});

// ---------------------------------------------------------------------------
// R2 matrix 2: the consumer must actually declare the exact ref — both
// directions of a version drift are deterministic and fail closed.
// ---------------------------------------------------------------------------

test('#572-2: consumer does not require the requested capability -> CONSUMER_CAPABILITY_NOT_REQUIRED', async () => {
  const provider = toolComponent({ componentId: 'catalog.credit-rating.tool' });
  const consumer = semanticComponent({ requires: [AUDIT_TRAIL] });
  const graph = graphOf([consumer, provider]);
  const digest = await digestOf(graph);

  // Requirement membership is checked before candidacy: even with a valid
  // digest and an eligible provider present, the selection fails closed.
  await expectProvisionFailure(
    () =>
      resolveCurrentCapabilityProvider(
        graph,
        CREDIT_RATING,
        'quote.eligibility.rule',
        digest,
        sha256,
      ),
    'CONSUMER_CAPABILITY_NOT_REQUIRED',
  );
});

test('#572-2: same capabilityId at a wrong exact version on the consumer -> CONSUMER_CAPABILITY_NOT_REQUIRED', async () => {
  const provider = toolComponent({ componentId: 'catalog.credit-rating.tool' });
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const graph = graphOf([consumer, provider]);
  const digest = await digestOf(graph);

  // The consumer declares cap@1.1.0 only; requesting cap@2.0.0 fails the
  // requirement membership, never a nearest-version match.
  await expectProvisionFailure(
    () =>
      resolveCurrentCapabilityProvider(
        graph,
        CREDIT_RATING_V2,
        'quote.eligibility.rule',
        digest,
        sha256,
      ),
    'CONSUMER_CAPABILITY_NOT_REQUIRED',
  );
});

test('#572-2: reverse direction (provider only has the newer version) -> CAPABILITY_PROVIDER_NOT_FOUND', async () => {
  const provider = toolComponent({ componentId: 'catalog.credit-rating.tool', provides: [CREDIT_RATING_V2] });
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const graph = graphOf([consumer, provider]);
  const digest = await digestOf(graph);

  // The requirement membership passes (consumer declares cap@1.1.0) and the
  // candidacy then fails deterministically: the provider only declares
  // cap@2.0.0, and exactness forbids nearest-version matching.
  await expectProvisionFailure(
    () =>
      resolveCurrentCapabilityProvider(
        graph,
        CREDIT_RATING,
        'quote.eligibility.rule',
        digest,
        sha256,
      ),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
});

// ---------------------------------------------------------------------------
// R2 matrix 3: stale/mismatched/invalid currentness claims fail closed HERE —
// a supplied digest is only a claim until recomputed and matched.
// ---------------------------------------------------------------------------

test('#572-3: a digest computed from other graph content -> DEFINITION_GRAPH_DIGEST_MISMATCH', async () => {
  const provider = toolComponent({ componentId: 'catalog.credit-rating.tool' });
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const graph = graphOf([consumer, provider]);
  const otherGraph = graphOf([semanticComponent({ componentId: 'other.rule' })]);
  const foreignDigest = await digestOf(otherGraph);

  await expectProvisionFailure(
    () =>
      resolveCurrentCapabilityProvider(
        graph,
        CREDIT_RATING,
        'quote.eligibility.rule',
        foreignDigest,
        sha256,
      ),
    'DEFINITION_GRAPH_DIGEST_MISMATCH',
  );
});

test('#572-3: same graphId with changed graph content cannot reuse a stale digest', async () => {
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const graphV1 = graphOf([consumer, toolComponent({ componentId: 'catalog.credit-rating.tool' })]);
  const digestV1 = await digestOf(graphV1);

  // Mutate the provider declaration content (same graphId, same consumer
  // requirement, still a valid tool body) and recompute: the stale digest of
  // the previous content is refused.
  const graphV2 = graphOf([
    consumer,
    toolComponent({
      componentId: 'catalog.credit-rating.tool',
      provides: [CREDIT_RATING, AUDIT_TRAIL],
    }),
  ]);
  const digestV2 = await digestOf(graphV2);
  assert.notEqual(digestV1, digestV2);

  await expectProvisionFailure(
    () =>
      resolveCurrentCapabilityProvider(
        graphV2,
        CREDIT_RATING,
        'quote.eligibility.rule',
        digestV1,
        sha256,
      ),
    'DEFINITION_GRAPH_DIGEST_MISMATCH',
  );

  // The current digest binds the selection to the CURRENT content.
  const selection = await resolveCurrentCapabilityProvider(
    graphV2,
    CREDIT_RATING,
    'quote.eligibility.rule',
    digestV2,
    sha256,
  );
  assert.equal(selection.definitionGraphDigest, digestV2);
});

test('#572-3: structurally invalid digest claims fail INVALID_SELECTION_INPUT', async () => {
  const provider = toolComponent({ componentId: 'catalog.credit-rating.tool' });
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const graph = graphOf([consumer, provider]);
  const digest = await digestOf(graph);

  for (const invalid of ['', 42, null, undefined]) {
    await expectProvisionFailure(
      () =>
        resolveCurrentCapabilityProvider(
          graph,
          CREDIT_RATING,
          'quote.eligibility.rule',
          invalid as unknown as string,
          sha256,
        ),
      'INVALID_SELECTION_INPUT',
    );
  }
  // Sanity: the same graph with the valid digest still succeeds.
  const selection = await resolveCurrentCapabilityProvider(
    graph,
    CREDIT_RATING,
    'quote.eligibility.rule',
    digest,
    sha256,
  );
  assert.equal(selection.definitionGraphDigest, digest);
});

// ---------------------------------------------------------------------------
// R2 matrix 4: a structurally valid + current graph WITHOUT any trusted
// admission provenance MAY produce a CurrentCapabilityProviderSelection, but
// the result can never be mistaken for admitted/runtime-authoritative
// evidence — the type shape and the module surface make the distinction
// unambiguous (compile-time proof in type-fixtures.ts).
// ---------------------------------------------------------------------------

test('#572-4: a graph with no admission provenance yields currentness-bound (not admitted) evidence', async () => {
  // This graph has no admission object, no must-understand evidence, no
  // Assembly/KindImplementation provenance anywhere — and none is consumed.
  const provider = toolComponent({ componentId: 'catalog.credit-rating.tool' });
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const graph = graphOf([consumer, provider]);
  const digest = await digestOf(graph);

  const selection = await resolveCurrentCapabilityProvider(
    graph,
    CREDIT_RATING,
    'quote.eligibility.rule',
    digest,
    sha256,
  );

  // The evidence shape is exactly the five currentness-bound fields: no
  // admission marker, no authority marker, no runtime/implementation fields.
  assert.deepEqual(Object.keys(selection).sort(), [
    'consumer',
    'definitionGraphDigest',
    'graphId',
    'provider',
    'requiredCapability',
  ]);
  assert.deepEqual(Object.keys(selection.consumer).sort(), ['componentId', 'requiredCapability']);
  const serialized = JSON.stringify(selection);
  for (const banned of [
    'admitted',
    'authority',
    'admission',
    'implementation',
    'binding',
    'assembly',
    'runtime',
    'endpoint',
    'pin',
  ]) {
    assert.equal(
      serialized.toLowerCase().includes(banned),
      false,
      `unexpected admitted/runtime-authoritative identity "${banned}" in currentness-bound evidence`,
    );
  }

  // The candidate-discovery result stays a different, weaker shape: it has no
  // digest and no consumer, so the two evidence kinds are deep-distinguishable
  // and a candidate result can never stand in as currentness-bound evidence.
  const candidate = selectCapabilityProvider(graph, CREDIT_RATING, 'quote.eligibility.rule');
  assert.deepEqual(Object.keys(candidate).sort(), ['graphId', 'provider', 'requiredCapability']);
  assert.notDeepEqual(candidate, selection);

  // No Admitted*/authority-named value exists on the module runtime surface.
  for (const key of Object.keys(capabilityProvisionModule)) {
    assert.equal(/admitted|authority/i.test(key), false, `unexpected runtime export "${key}"`);
  }
});

// ---------------------------------------------------------------------------
// R2 matrix 5: provider ambiguity / zero-provider / permutation behavior is
// identical to the candidate API, because candidacy is delegated to it.
// ---------------------------------------------------------------------------

test('#572-5: zero eligible providers -> CAPABILITY_PROVIDER_NOT_FOUND', async () => {
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const graph = graphOf([
    consumer,
    toolComponent({ provides: [{ capabilityId: 'other.capability', version: '1.0.0' }] }),
  ]);
  const digest = await digestOf(graph);

  const failure = await expectProvisionFailure(
    () =>
      resolveCurrentCapabilityProvider(
        graph,
        CREDIT_RATING,
        'quote.eligibility.rule',
        digest,
        sha256,
      ),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
  assert.deepEqual(failure.conflictingProviderComponentIds, []);
});

test('#572-5: ambiguous providers -> CAPABILITY_PROVIDER_AMBIGUOUS with sorted, permutation-invariant diagnostics', async () => {
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const late = toolComponent({ componentId: 'bbb.credit.tool' });
  const early = toolComponent({ componentId: 'aaa.credit.tool' });

  let expected: readonly string[] = [];
  for (const order of [
    [consumer, late, early],
    [early, consumer, late],
  ]) {
    const graph = graphOf(order);
    const digest = await digestOf(graph);
    const failure = await expectProvisionFailure(
      () =>
        resolveCurrentCapabilityProvider(
          graph,
          CREDIT_RATING,
          'quote.eligibility.rule',
          digest,
          sha256,
        ),
      'CAPABILITY_PROVIDER_AMBIGUOUS',
    );
    if (expected.length === 0) {
      expected = failure.conflictingProviderComponentIds;
      assert.deepEqual([...expected], ['aaa.credit.tool', 'bbb.credit.tool']);
    } else {
      assert.deepEqual(failure.conflictingProviderComponentIds, expected);
    }
  }
});

test('#572-5: every component-order permutation yields identical currentness-bound evidence', async () => {
  const provider = toolComponent({
    componentId: 'catalog.credit-rating.tool',
    provides: [AUDIT_TRAIL, CREDIT_RATING],
  });
  const consumer = semanticComponent({ requires: [CREDIT_RATING] });
  const neutral = semanticComponent({ componentId: 'aaa.neutral.rule' });

  const baselineGraph = graphOf([provider, consumer, neutral]);
  const baselineDigest = await digestOf(baselineGraph);
  const baseline = await resolveCurrentCapabilityProvider(
    baselineGraph,
    CREDIT_RATING,
    'quote.eligibility.rule',
    baselineDigest,
    sha256,
  );

  for (const permutation of permutations([provider, consumer, neutral])) {
    const graph = graphOf(permutation);
    const digest = await digestOf(graph);
    const selection = await resolveCurrentCapabilityProvider(
      graph,
      CREDIT_RATING,
      'quote.eligibility.rule',
      digest,
      sha256,
    );
    assert.deepEqual(selection, baseline);
  }
});

// ---------------------------------------------------------------------------
// R2 matrix 7: caller mutation after selection cannot alter returned
// evidence — graph content, request refs and declarations are all snapshotted
// into frozen fresh values.
// ---------------------------------------------------------------------------

test('#572-7: caller mutation of graph/request objects after selection cannot alter the evidence', async () => {
  const required = {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  } as { capabilityId: string; version: string };
  const provided = {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  } as { capabilityId: string; version: string };
  const provider = toolComponent({ componentId: 'catalog.credit-rating.tool', provides: [provided] });
  const consumer = semanticComponent({ requires: [required] });
  const graph = graphOf([consumer, provider]);
  const digest = await digestOf(graph);

  const selection = await resolveCurrentCapabilityProvider(
    graph,
    required,
    'quote.eligibility.rule',
    digest,
    sha256,
  );

  // Mutate every caller-owned object that fed the decision.
  required.version = '9.9.9';
  (consumer.requiredCapabilities[0] as { capabilityId: string; version: string }).version =
    '8.8.8';
  const declaration = provider.semanticBody as unknown as ToolOperationsDeclaration;
  (declaration.providesCapabilities[0] as { capabilityId: string; version: string }).version =
    '7.7.7';

  assert.deepEqual(selection.requiredCapability, CREDIT_RATING);
  assert.deepEqual(selection.consumer.requiredCapability, CREDIT_RATING);
  assert.deepEqual(selection.provider.providesCapability, CREDIT_RATING);
  assert.equal(selection.definitionGraphDigest, digest);
  assert.equal(selection.consumer.componentId, 'quote.eligibility.rule');
});

// ---------------------------------------------------------------------------
// Fresh-review P2 (#572): the candidacy delegation and every authority-bearing
// capture (requirement value, graphId, frozen evidence refs) are snapshotted
// synchronously BEFORE the digest await, matching the #558 seam discipline.
// A caller mutating its own graph while the digest promise is pending must
// not mint torn hybrid evidence — the returned evidence must equal the one
// derived from an untouched twin graph, and the mutation must be substantive.
// ---------------------------------------------------------------------------

test('#572-P2: caller mutation during the pending digest cannot tear the evidence', async () => {
  const required: CapabilityContractRef = {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  };
  const provided: CapabilityContractRef = {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  };
  const consumer = semanticComponent({ requires: [required] });
  const provider = toolComponent({
    componentId: 'catalog.credit-rating.tool',
    provides: [provided],
  });
  const graph = graphOf([consumer, provider]);
  const digest = await digestOf(graph);

  // Untouched twin: identical content, never mutated — the authority
  // baseline the in-flight selection must match exactly.
  const twin = graphOf([
    semanticComponent({ requires: [CREDIT_RATING] }),
    toolComponent({ componentId: 'catalog.credit-rating.tool' }),
  ]);
  const twinDigest = await digestOf(twin);
  assert.equal(twinDigest, digest);
  const baseline = await resolveCurrentCapabilityProvider(
    twin,
    CREDIT_RATING,
    'quote.eligibility.rule',
    twinDigest,
    sha256,
  );

  // A Sha256Port that mutates the caller-owned graph the first time the
  // digest computation enters the port: graphId, the consumer requirement
  // and a later component's provider declaration all change while the
  // digest promise is pending.
  let mutated = false;
  const mutatingSha256: Sha256Port = {
    async digestUtf8(value: string): Promise<string> {
      if (!mutated) {
        mutated = true;
        (graph as { graphId: string }).graphId = 'provision.mutated.graph';
        (consumer.requiredCapabilities[0] as { version: string }).version =
          '0.0.0-mutated';
        const declaration = provider.semanticBody as unknown as ToolOperationsDeclaration;
        (declaration.providesCapabilities[0] as { version: string }).version =
          '0.0.0-mutated';
      }
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };

  const selection = await resolveCurrentCapabilityProvider(
    graph,
    required,
    'quote.eligibility.rule',
    digest,
    mutatingSha256,
  );

  // No torn hybrid: the evidence is exactly what the untouched twin graph
  // yields — pre-mutation digest, requirement, provider and graphId.
  assert.deepEqual(selection, baseline);
  assert.equal(selection.graphId, 'provision.current.test.graph');
  assert.deepEqual(selection.requiredCapability, CREDIT_RATING);
  assert.deepEqual(selection.consumer.requiredCapability, CREDIT_RATING);
  assert.deepEqual(selection.provider.providesCapability, CREDIT_RATING);
  assert.equal(selection.definitionGraphDigest, digest);

  // Negative control: the mutation is substantive. The mutated content has
  // a different digest, and a selection over it genuinely fails closed — the
  // consumer no longer declares the requested exact ref.
  assert.equal(graph.graphId, 'provision.mutated.graph');
  const mutatedDigest = await digestOf(graph);
  assert.notEqual(mutatedDigest, digest);
  await expectProvisionFailure(
    () =>
      resolveCurrentCapabilityProvider(
        graph,
        CREDIT_RATING,
        'quote.eligibility.rule',
        mutatedDigest,
        sha256,
      ),
    'CONSUMER_CAPABILITY_NOT_REQUIRED',
  );
});

// ---------------------------------------------------------------------------
// R2 matrix 8: module surface — the candidate API re-exports/behavior is
// unchanged, and the new seam is additive.
// ---------------------------------------------------------------------------

test('#572-8: the module surface exposes the typed error plus both selection seams', () => {
  assert.deepEqual(Object.keys(capabilityProvisionModule).sort(), [
    'CapabilityProvisionContractError',
    'resolveCurrentCapabilityProvider',
    'selectCapabilityProvider',
  ]);
});
