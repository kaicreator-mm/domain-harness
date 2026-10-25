/**
 * Candidate authoring projection fixture (Issue #1379). Only static public
 * Component projection and typed negatives. Does NOT seal/execute an App or
 * prove any K permit, Host CAS, subscriber or physical installed consumer.
 *
 * Requires Node24 + local selected BUILD workspace after npm ci/build.
 */
import assert from 'node:assert/strict';
import { projectSelectedComponents } from '@kaicreator/domain-harness-build';

assert.equal(Number(process.versions.node.split('.')[0]), 24, 'Node24 is the selected physical authoring lane');
const feature = Object.freeze({
  packageId: 'feature.rule', role: 'standard-feature',
  abiVersion: 'dh.v10.standard-feature/1', endpoint: 'standard-feature',
  featureExport: 'evaluateRule',
});
const read = Object.freeze({
  packageId: 'capability.inventory', role: 'capability',
  abiVersion: 'v08-capability-abi/1', endpoint: 'capability-endpoint',
  capabilityId: 'inventory', externalEffect: false,
  handlers: [{ operationId: 'inventory.get', handler: 'getInventory' }],
});
const effect = Object.freeze({
  packageId: 'capability.jobs', role: 'capability',
  abiVersion: 'v08-capability-abi/1', endpoint: 'capability-endpoint',
  capabilityId: 'jobs', externalEffect: true,
  handlers: [{ operationId: 'jobs.submit', handler: 'submitJob' }],
});
const declarations = [
  { class: 'semantic', kind: 'rule', componentId: 'semantic.quality',
    modulePackageId: feature.packageId, entry: 'evaluateRule' },
  { class: 'tool', kind: 'package-operation', componentId: 'tool.inventory',
    modulePackageId: read.packageId, operationId: 'inventory.get',
    handler: 'getInventory', externalEffect: false },
  { class: 'tool', kind: 'package-operation', componentId: 'tool.jobs',
    modulePackageId: effect.packageId, operationId: 'jobs.submit',
    handler: 'submitJob', externalEffect: true },
];
const projected = projectSelectedComponents(declarations, [feature, read, effect]);
assert.deepEqual(projected.modules, [feature, read, effect]);
assert.deepEqual(projected.bindings.map(x => x.class), ['semantic', 'tool', 'tool']);
assert.equal(projected.modules[0], feature, 'pure semantic non-Tool is the original S module');
assert.equal(projected.modules.length, 3, 'read and external-effect C modules stay physically distinct');
function refuses(fn, code) {
  assert.throws(fn, e => e?.code === code, code);
}
refuses(() => projectSelectedComponents([{ ...declarations[0], entry: 'privateHelper' }], [feature]),
  'V10_EXPORT_CONTRACT_REFUSED');
refuses(() => projectSelectedComponents([{ ...declarations[1], operationId: 'private.helper' }], [read]),
  'V10_EXPORT_CONTRACT_REFUSED');
refuses(() => projectSelectedComponents([{ ...declarations[2], externalEffect: false }], [effect]),
  'V10_EXPORT_CONTRACT_REFUSED');
refuses(() => projectSelectedComponents([declarations[1], declarations[1]], [read]),
  'BUILD_GRAPH_INVALID');
refuses(() => projectSelectedComponents([{ ...declarations[1], kind: 'remote-operation' }], [read]),
  'V10_EXPORT_CONTRACT_REFUSED');
console.log(JSON.stringify({
  schema: 'dh.v0102.authoring-projection/1', ok: true,
  limitation: 'projection-only-not-a-real-packaged-App-or-K-permit-proof',
  node: process.versions.node, selected: projected.modules.map(x => x.packageId),
  classes: projected.bindings.map(x => x.class),
}));
