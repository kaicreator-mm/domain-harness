import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type {
  CapabilityContractRef,
  ComponentEnvelope,
} from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type {
  ToolOperationsDeclaration,
} from '../../src/contracts/tool-component.js';
import {
  resolveCurrentCapabilityProvider,
  selectCapabilityProvider,
} from '../../src/contracts/capability-provision.js';

function toolWithMutableCapability(ref: CapabilityContractRef): ComponentEnvelope {
  const declaration: ToolOperationsDeclaration = {
    operations: [
      {
        operationId: 'lookup.credit-rating',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        effect: 'idempotent',
      },
    ],
    providesCapabilities: [ref],
  };

  return {
    family: 'tool',
    componentId: 'catalog.credit-rating.tool',
    kind: { kindId: 'tool.credit-rating.v1', version: '2.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: declaration as unknown as JsonValue,
  };
}

test('#567: successful provider-selection evidence owns fresh frozen capability refs', () => {
  const required = {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  } as { capabilityId: string; version: string };
  const provided = {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  } as { capabilityId: string; version: string };

  const graph = {
    graphId: 'capability-evidence-immutability.graph',
    components: [toolWithMutableCapability(provided)],
    relations: [],
  };

  const selection = selectCapabilityProvider(graph, required);

  assert.deepEqual(selection.requiredCapability, {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  });
  assert.deepEqual(selection.provider.providesCapability, {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  });
  assert.notStrictEqual(selection.requiredCapability, required);
  assert.notStrictEqual(selection.provider.providesCapability, provided);
  assert.equal(Object.isFrozen(selection), true);
  assert.equal(Object.isFrozen(selection.provider), true);
  assert.equal(Object.isFrozen(selection.requiredCapability), true);
  assert.equal(Object.isFrozen(selection.provider.providesCapability), true);

  required.version = '9.9.9';
  provided.version = '8.8.8';

  assert.deepEqual(selection.requiredCapability, {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  });
  assert.deepEqual(selection.provider.providesCapability, {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  });
});

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

test('#572: currentness-bound selection evidence owns fresh frozen refs (requirement, consumer, provider)', async () => {
  const required = {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  } as { capabilityId: string; version: string };
  const provided = {
    capabilityId: 'credit-rating-lookup',
    version: '1.1.0',
  } as { capabilityId: string; version: string };

  const consumer: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'quote.eligibility.rule',
    kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
    requiredSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
    requiredCapabilities: [required],
    semanticBody: { threshold: 100, policy: { tier: 'gold', enabled: true } },
  };
  const graph: DefinitionGraphEnvelope = {
    graphId: 'capability-evidence-immutability.graph',
    components: [consumer, toolWithMutableCapability(provided)],
    relations: [],
  };
  const digest = await computeDefinitionGraphDigest(graph, sha256);

  const selection = await resolveCurrentCapabilityProvider(
    graph,
    required,
    'quote.eligibility.rule',
    digest,
    sha256,
  );

  const expected = { capabilityId: 'credit-rating-lookup', version: '1.1.0' };
  assert.deepEqual(selection.requiredCapability, expected);
  assert.deepEqual(selection.consumer.requiredCapability, expected);
  assert.deepEqual(selection.provider.providesCapability, expected);
  assert.equal(selection.definitionGraphDigest, digest);

  // No alias of any caller-owned object survives into the evidence.
  assert.notStrictEqual(selection.requiredCapability, required);
  assert.notStrictEqual(selection.consumer.requiredCapability, required);
  assert.notStrictEqual(selection.provider.providesCapability, provided);
  assert.equal(Object.isFrozen(selection), true);
  assert.equal(Object.isFrozen(selection.consumer), true);
  assert.equal(Object.isFrozen(selection.requiredCapability), true);
  assert.equal(Object.isFrozen(selection.consumer.requiredCapability), true);
  assert.equal(Object.isFrozen(selection.provider), true);
  assert.equal(Object.isFrozen(selection.provider.providesCapability), true);

  // Caller mutation of the original graph envelope and request refs cannot
  // rewrite the completed currentness-bound decision.
  required.version = '9.9.9';
  provided.version = '8.8.8';
  (consumer.requiredCapabilities[0] as { capabilityId: string; version: string }).version =
    '7.7.7';

  assert.deepEqual(selection.requiredCapability, expected);
  assert.deepEqual(selection.consumer.requiredCapability, expected);
  assert.deepEqual(selection.provider.providesCapability, expected);
  assert.equal(selection.definitionGraphDigest, digest);
});
