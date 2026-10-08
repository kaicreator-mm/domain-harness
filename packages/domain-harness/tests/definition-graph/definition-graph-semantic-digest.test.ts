import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeComponentSemanticDigest,
} from '../../src/contracts/component-digest.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function component(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'component.a',
    kind: { kindId: 'example.kind', version: '1.0.0' },
    requiredSemanticContracts: [
      { contractId: 'contract.a', version: '1.0.0' },
      { contractId: 'contract.b', version: '2.0.0' },
    ],
    requiredCapabilities: [
      { capabilityId: 'cap.a', version: '1.0.0' },
      { capabilityId: 'cap.b', version: '2.0.0' },
    ],
    semanticBody: { threshold: 10, policy: { enabled: true } },
    ...overrides,
  };
}

function graph(components: readonly ComponentEnvelope[]): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.semantic-identity',
    components,
    relations: [],
  };
}

test('#555: graph digest composes the canonical Component semantic digest', async () => {
  const base = component();
  const componentDigest = await computeComponentSemanticDigest(base, sha256);
  const graphDigest = await computeDefinitionGraphDigest(graph([base]), sha256);

  assert.match(componentDigest, /^[0-9a-f]{64}$/);
  assert.match(graphDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(graphDigest, componentDigest, 'graph identity remains domain-separated from component identity');
});

test('#555: non-material Component extensions cannot perturb Definition semantic identity', async () => {
  const base = component();
  const withExtension = component({
    nonMaterialExtensions: { display: { label: 'Only presentation metadata' } },
  });

  assert.equal(
    await computeComponentSemanticDigest(base, sha256),
    await computeComponentSemanticDigest(withExtension, sha256),
  );
  assert.equal(
    await computeDefinitionGraphDigest(graph([base]), sha256),
    await computeDefinitionGraphDigest(graph([withExtension]), sha256),
  );
});

test('#555: required semantic/capability refs retain set semantics at Definition identity', async () => {
  const base = component();
  const permuted = component({
    requiredSemanticContracts: [...base.requiredSemanticContracts].reverse(),
    requiredCapabilities: [...base.requiredCapabilities].reverse(),
  });

  assert.equal(
    await computeComponentSemanticDigest(base, sha256),
    await computeComponentSemanticDigest(permuted, sha256),
  );
  assert.equal(
    await computeDefinitionGraphDigest(graph([base]), sha256),
    await computeDefinitionGraphDigest(graph([permuted]), sha256),
  );
});

test('#555: behaviorally material Component changes perturb Definition semantic identity', async () => {
  const base = component();
  const cases: ComponentEnvelope[] = [
    component({ semanticBody: { threshold: 11, policy: { enabled: true } } }),
    component({ kind: { kindId: 'example.kind', version: '2.0.0' } }),
    component({ requiredSemanticContracts: [{ contractId: 'contract.a', version: '9.0.0' }] }),
    component({ requiredCapabilities: [{ capabilityId: 'cap.a', version: '9.0.0' }] }),
  ];
  const baseDigest = await computeDefinitionGraphDigest(graph([base]), sha256);

  for (const changed of cases) {
    assert.notEqual(await computeDefinitionGraphDigest(graph([changed]), sha256), baseDigest);
  }
});

test('#555: Component binding identity remains part of Definition graph identity', async () => {
  const base = component();
  const rebound = component({ componentId: 'component.b' });

  assert.equal(
    await computeComponentSemanticDigest(base, sha256),
    await computeComponentSemanticDigest(rebound, sha256),
    'componentId is not local semantic content',
  );
  assert.notEqual(
    await computeDefinitionGraphDigest(graph([base]), sha256),
    await computeDefinitionGraphDigest(graph([rebound]), sha256),
    'Definition graph binds semantic content to an exact logical Component id',
  );
});
