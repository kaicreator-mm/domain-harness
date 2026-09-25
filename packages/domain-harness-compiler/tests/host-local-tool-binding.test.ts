import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileDomainPackage,
  type LoadedRawDomainPackage,
  type RawToolDefinition,
  type TargetHostProfile,
} from '../src/index.js';

const CRYPTO = 'crypto-hash-sha256@1' as const;
const MODULE = 'compiled-package-module@1' as const;
const INVENTORY = 'inventory-native@1' as const;
const AUDIT = 'audit-read@1' as const;

function rawPackage(): LoadedRawDomainPackage {
  return {
    root: '/portable-fixture',
    schemaVersion: '0.1',
    domainId: 'fixture.inventory',
    limits: { maxSteps: 8 },
    workflows: new Map(),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(),
  };
}

const target: TargetHostProfile = {
  id: 'portable-host-local-fixture',
  capabilities: [CRYPTO, MODULE, INVENTORY, AUDIT],
  bindings: {
    [CRYPTO]: 'portable-sha256-v1',
    [MODULE]: 'compiled-module-v1',
    [INVENTORY]: 'inventory-native-v1',
    [AUDIT]: 'audit-read-v1',
  },
};

const bindingContents = {
  'portable-sha256-v1': 'fixture sha256 adapter artifact',
  'compiled-module-v1': 'fixture compiled module loader artifact',
  'inventory-native-v1': 'fixture project-local inventory adapter artifact',
  'audit-read-v1': 'fixture project-local audit adapter artifact',
} as const;

const tool: RawToolDefinition = {
  toolId: 'inventory.reserve',
  inputSchema: {
    type: 'object',
    required: ['sku'],
    properties: { sku: { type: 'string' } },
  },
  outputSchema: {
    type: 'object',
    required: ['reserved'],
    properties: { reserved: { type: 'boolean' } },
  },
  effect: 'idempotent',
  executionKind: 'host-local-domain-tool@1',
  bindingCapability: INVENTORY,
  requiredCapabilities: [INVENTORY, AUDIT],
};

test('compiler binds a generic host-local Tool to the selected target capability artifact', () => {
  const compiled = compileDomainPackage({
    raw: rawPackage(),
    domainVersion: '0.3-fixture',
    target,
    bindingContents,
    tools: [tool],
  });

  const descriptor = compiled.manifest.tools['inventory.reserve'];
  assert.ok(descriptor);
  assert.equal(descriptor.execution.kind, 'host-local-domain-tool@1');
  assert.equal(descriptor.execution.bindingId, 'inventory-native-v1');
  assert.equal(descriptor.execution.digest, compiled.manifest.bindingDigests['inventory-native-v1']);
  assert.deepEqual(descriptor.requiredCapabilities, [AUDIT, INVENTORY].sort());
  assert.ok(compiled.requiredBindingIds.includes('inventory-native-v1'));
  assert.ok(compiled.requiredBindingIds.includes('audit-read-v1'));
});

test('compiler fails closed when the selected local capability is not declared by the Tool', () => {
  assert.throws(
    () => compileDomainPackage({
      raw: rawPackage(),
      domainVersion: '0.3-fixture',
      target,
      bindingContents,
      tools: [{ ...tool, requiredCapabilities: [AUDIT] }],
    }),
    /bindingCapability 'inventory-native@1' must also appear in requiredCapabilities/,
  );
});
