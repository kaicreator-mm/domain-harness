// 当前架构的可证伪测试：断言实际行为而非历史兼容。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as facade from '@kaicreator/domain-harness';

test('T04-FACADE-1: the canonical entry runtime export set is exactly the union of the real contracts/BUILD/Boot/KDP exports', async () => {
  const contracts = await import('@kaicreator/domain-harness-contracts');
  const build = await import('@kaicreator/domain-harness-build');
  const microkernel = await import('@kaicreator/domain-harness-microkernel');

  const expected = new Set<string>([
    ...Object.keys(contracts),
    ...Object.keys(build),
    ...Object.keys(microkernel),
  ]);
  const actual = new Set<string>(Object.keys(facade));

  const missing = [...expected].filter((name) => !actual.has(name));
  const unexpected = [...actual].filter((name) => !expected.has(name));
  assert.deepEqual(
    { missing, unexpected },
    { missing: [], unexpected: [] },
    'facade must re-export exactly the real composition modules (a missing name means an export-* collision or a facade drift)',
  );
  assert.ok(actual.size > 0);
});
