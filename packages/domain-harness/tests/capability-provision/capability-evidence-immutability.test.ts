import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CapabilityContractRef,
  ComponentEnvelope,
} from '../../src/contracts/component.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type {
  ToolOperationsDeclaration,
} from '../../src/contracts/tool-component.js';
import {
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
