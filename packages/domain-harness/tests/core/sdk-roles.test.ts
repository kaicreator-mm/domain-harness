import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as sdk from '@kaicreator/domain-harness';

test('单 SDK 仅有公开包根，不提供旧 runtime/composition 子入口', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(manifest.exports),['.']);
  assert.deepEqual(Object.keys(manifest.dependencies).sort(),['@photostructure/sqlite','xstate','yaml']);
  assert.equal(typeof sdk.KernelLifecycle,'function');
  assert.equal(typeof sdk.StandardWorkflowSession,'function');
  assert.equal(typeof sdk.JsonReader,'function');
  const entry = fileURLToPath(import.meta.resolve('@kaicreator/domain-harness'));
  assert.ok(entry.replaceAll('\\','/').endsWith('dist/index.js'));
});
