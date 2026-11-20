/**
 * v0.10.2 T09 public-surface smoke.
 * This source MUST be copied into a fresh isolated installed consumer root
 * before running. Executing it from the monorepo is NOT accepted evidence.
 */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from '@kaicreator/domain-harness-microkernel';
import { V10_TARGET_PROFILE } from '@kaicreator/domain-harness-contracts';

const consumerRoot = realpathSync(dirname(fileURLToPath(import.meta.url)));
const mode = process.env.DH_V0102_PROFILE;
assert.ok(mode === 'Tiny' || mode === 'Rich', 'explicit Tiny/Rich profile required');
assert.equal(process.versions.node.split('.')[0], '24', 'real Node24 process required');
assert.equal(typeof load, 'function');
assert.equal(V10_TARGET_PROFILE, 'node24-esm/1');

for (const name of ['@kaicreator/domain-harness-contracts', '@kaicreator/domain-harness-microkernel']) {
  const entry = realpathSync(fileURLToPath(import.meta.resolve(name)));
  assert.ok(entry.startsWith(join(consumerRoot, 'node_modules') + sep), name + ' escaped isolated install root: ' + entry);
}

const seam = await import('@kaicreator/domain-harness-microkernel/host-seam');
assert.equal(typeof seam.activateV10App, 'function');
await assert.rejects(
  import('@kaicreator/domain-harness-microkernel/dist/internal/activation.js'),
  (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'private Microkernel deep dist must remain unpublished',
);
await assert.rejects(
  import('@kaicreator/domain-harness-compiler/v10build'),
  (error) => error?.code === 'ERR_MODULE_NOT_FOUND' || error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  'retired Compiler v10build cannot enter the selected consumer',
);
if (mode === 'Rich') {
  const host = await import('@kaicreator/domain-harness-host-node');
  assert.equal(typeof host.openSqliteCasStore, 'function');
}
console.log(JSON.stringify({ schema: 'dh/v0102/t09-public-smoke/1', ok: true, mode, node: process.versions.node, root: consumerRoot }));
