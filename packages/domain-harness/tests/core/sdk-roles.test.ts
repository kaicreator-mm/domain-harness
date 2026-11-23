/** R43: 一个 SDK 产品的运行入口与 Package 组合入口可以分别加载。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as sdk from '@kaicreator/domain-harness';
import * as runtime from '@kaicreator/domain-harness/runtime';
import * as composition from '@kaicreator/domain-harness/composition';
import * as contracts from '@kaicreator/domain-harness-contracts';
import * as microkernel from '@kaicreator/domain-harness-microkernel';
import * as build from '@kaicreator/domain-harness-build';

test('R43: runtime subpath supplies Contracts/Boot but no BUILD or Package authoring API', () => {
  const expected = new Set([
    ...Object.keys(contracts),
    ...Object.keys(microkernel).filter((name) => name !== 'bootstrap' && name !== 'activateSelectedKdpHostInit'),
  ]);
  assert.deepEqual(new Set(Object.keys(runtime)), expected);
  assert.equal(runtime.boot, microkernel.boot);
  assert.equal('bootstrap' in runtime, false, 'KDP bootstrap remains an internal implementation detail');
  assert.equal('activateSelectedKdpHostInit' in runtime, false,
    'Host-only Kernel activation is not exposed through the normal App runtime facade');
  assert.equal('buildApp' in runtime, false);
  assert.equal('BuildRefusal' in runtime, false);
  assert.equal('digestOfBytes' in runtime, false);
});

test('R52: composition is bundled inside the SDK, preserving exported API without a BUILD peer', () => {
  assert.deepEqual(new Set(Object.keys(composition)), new Set(Object.keys(build)));
  assert.equal(typeof composition.buildApp, 'function');
  assert.equal(typeof composition.BuildRefusal, 'function');
  assert.equal(typeof composition.digestOfBytes, 'function');
  // Two separately built module instances are not the same JavaScript function identity.
  assert.notEqual(composition.buildApp, build.buildApp);
  const bytes = new TextEncoder().encode('sdk-owned-composition');
  assert.equal(composition.digestOfBytes(bytes), build.digestOfBytes(bytes));
  assert.equal(new composition.BuildRefusal('DH_BUILD_SCHEMA_INVALID', 'R52').code,
    new build.BuildRefusal('DH_BUILD_SCHEMA_INVALID', 'R52').code);
});

test('SDK root 在迁移期同时精确导出已审旧 API 和原生 Standard/KDP API', () => {
  assert.deepEqual(new Set(Object.keys(sdk)),
    new Set([
      ...Object.keys(runtime),
      ...Object.keys(composition),
      'KernelLifecycle',
      'WorkflowElement',
      'XStateWorkflowElement',
      'JsonReader',
      'YamlReader',
      'readJson',
      'readYaml',
      'writeJson',
      'writeYaml',
    ]));
  assert.equal(sdk.boot, runtime.boot);
  assert.equal('bootstrap' in sdk, false, 'root SDK must not expose direct KDP bootstrap');
  assert.equal(sdk.buildApp, composition.buildApp);
});

test('R43: compiled runtime entry does not import authoring/BUILD implementation', () => {
  const url = import.meta.resolve('@kaicreator/domain-harness/runtime');
  const source = readFileSync(fileURLToPath(url), 'utf8');
  assert.match(source, /domain-harness-microkernel/u);
  assert.doesNotMatch(source, /domain-harness-build|\.\/composition/u);
});
