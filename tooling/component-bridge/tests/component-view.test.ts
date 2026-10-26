import assert from 'node:assert/strict';
import test from 'node:test';
import type { V10ModuleInput } from '@kaicreator/domain-harness-contracts';
import {
  projectSelectedComponents,
  type ComponentDeclaration,
} from '../src/component-view.js';

const s: V10ModuleInput = Object.freeze({
  packageId: 'feature.rule', role: 'standard-feature', abiVersion: 'dh.v10.standard-feature/1',
  endpoint: 'rule', featureExport: 'evaluateRule',
});
const k: V10ModuleInput = Object.freeze({
  packageId: 'extension.review', role: 'kernel-extension', abiVersion: 'dh.v10.kernel-extension/1',
  endpoint: 'review', providerId: 'review', hookExport: 'advise',
});
const c: V10ModuleInput = Object.freeze({
  packageId: 'capability.inventory', role: 'capability', abiVersion: 'dh.v10.capability/1',
  endpoint: 'inventory', capabilityId: 'inventory',
  externalEffect: false,
  handlers: [
    { operationId: 'inventory.get', handler: 'getInventory' },
    { operationId: 'inventory.list', handler: 'listInventory' },
  ],
});
const semantic: ComponentDeclaration = {
  class: 'semantic', kind: 'rule', componentId: 'semantic.rule',
  modulePackageId: 'feature.rule', entry: 'evaluateRule',
};
const hook: ComponentDeclaration = {
  class: 'hook', kind: 'kernel-advisory', componentId: 'hook.review',
  modulePackageId: 'extension.review', entry: 'advise',
};
const tool: ComponentDeclaration = {
  class: 'tool', kind: 'package-operation', componentId: 'tool.inventory.get',
  modulePackageId: 'capability.inventory', operationId: 'inventory.get',
  handler: 'getInventory', externalEffect: false,
};
const secondTool: ComponentDeclaration = {
  class: 'tool', kind: 'package-operation', componentId: 'tool.inventory.list',
  modulePackageId: 'capability.inventory', operationId: 'inventory.list',
  handler: 'listInventory', externalEffect: false,
};

function refuses(f: () => unknown, code: string): void {
  assert.throws(f, (e: unknown) => {
    assert.equal((e as {code?: string}).code, code);
    return true;
  });
}

test('selected S semantic, K advisory Hook and C Tool preserve original BUILD module identities', () => {
  const result = projectSelectedComponents([tool, semantic, hook], [s, k, c]);
  assert.deepEqual(result.modules.map((m) => m.packageId),
    ['feature.rule', 'extension.review', 'capability.inventory']);
  assert.strictEqual(result.modules[0], s);
  assert.equal(result.bindings.length, 3);
  assert.deepEqual(result.bindings.map((b) => b.class), ['tool', 'semantic', 'hook']);
  assert.equal(Object.isFrozen(result.modules), true);
  assert.equal(Object.isFrozen(result.bindings), true);
});

test('multiple explicit C Operations may share the same selected C module without registering private helpers', () => {
  const result = projectSelectedComponents([tool, secondTool], [s, c]);
  assert.deepEqual(result.modules, [c]);
  assert.deepEqual(result.bindings.map((b) => b.entry), ['getInventory', 'listInventory']);
  refuses(() => projectSelectedComponents([{
    ...tool, componentId: 'tool.private', operationId: 'private.helper', handler: 'calculate',
  }], [c]), 'V10_EXPORT_CONTRACT_REFUSED');
});

test('generic Business lifecycle Hook and remote/system Tool placement cannot impersonate existing ABI', () => {
  refuses(() => projectSelectedComponents([{ ...hook, kind: 'lifecycle' }], [k]),
    'V10_EXPORT_CONTRACT_REFUSED');
  refuses(() => projectSelectedComponents([{ ...tool, kind: 'remote-operation' }], [c]),
    'V10_EXPORT_CONTRACT_REFUSED');
  refuses(() => projectSelectedComponents([{ ...tool, kind: 'system-operation' }], [c]),
    'V10_EXPORT_CONTRACT_REFUSED');
});

test('per-handler mixed effects cannot override selected C module-level externalEffect', () => {
  refuses(() => projectSelectedComponents([{ ...tool, externalEffect: true }], [c]),
    'V10_EXPORT_CONTRACT_REFUSED');
  refuses(() => projectSelectedComponents([{ ...semantic, entry: 'privateRule' }], [s]),
    'V10_EXPORT_CONTRACT_REFUSED');
});

test('unselected modules, duplicate identities and fake Tool bindings refuse deterministically', () => {
  refuses(() => projectSelectedComponents([semantic], [c]), 'V10_EXPORT_CONTRACT_REFUSED');
  refuses(() => projectSelectedComponents([tool, tool], [c]), 'BUILD_GRAPH_INVALID');
  refuses(() => projectSelectedComponents([tool], [c, c]), 'BUILD_GRAPH_INVALID');
  refuses(() => projectSelectedComponents([], [s]), 'BUILD_INPUT_INVALID');
});

test('unknown declaration fields or accessors cannot silently grant a Tool or authority', () => {
  const extra = { ...tool, permission: 'kernel:effect' };
  refuses(() => projectSelectedComponents([extra], [c]), 'BUILD_INPUT_INVALID');
  const withAccessor: Record<string, unknown> = { ...tool };
  Object.defineProperty(withAccessor, 'handler', { enumerable: true, get: () => 'getInventory' });
  refuses(() => projectSelectedComponents([withAccessor as unknown as ComponentDeclaration], [c]),
    'BUILD_INPUT_INVALID');
});
