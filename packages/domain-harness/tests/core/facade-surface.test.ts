// 当前架构的可证伪测试：断言实际行为而非历史兼容。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as facade from '@kaicreator/domain-harness';

test('SDK facade 精确导出已有接口和新增原生 KDP / Standard Elements', async () => {
  const contracts = await import('@kaicreator/domain-harness-contracts');
  const build = await import('@kaicreator/domain-harness-build');
  const microkernel = await import('@kaicreator/domain-harness-microkernel');

  const expected = new Set<string>([
    ...Object.keys(contracts),
    ...Object.keys(build),
    ...Object.keys(microkernel).filter((name) => name !== 'bootstrap' && name !== 'activateSelectedKdpHostInit'),
    'KernelLifecycle',
    'WorkflowElement',
    'XStateWorkflowElement',
    'JsonReader',
    'YamlReader',
    'readJson',
    'readYaml',
    'writeJson',
    'writeYaml',
    'NativeWorkflowContext',
    'StandardWorkflowSession',
    'routeWorkflowOutcome',
  ]);
  const actual = new Set<string>(Object.keys(facade));

  const missing = [...expected].filter((name) => !actual.has(name));
  const unexpected = [...actual].filter((name) => !expected.has(name));
  assert.deepEqual(
    { missing, unexpected },
    { missing: [], unexpected: [] },
    'SDK root must exactly expose existing and newly implemented native modules without collisions',
  );
  assert.ok(actual.size > 0);
  assert.equal('bootstrap' in facade, false, 'internal KDP bootstrap must not be public');
  assert.equal('activateSelectedKdpHostInit' in facade, false,
    'Host-only KDP activation must not become a public SDK Function API');
});
