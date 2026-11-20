/**
 * DomainHarness v0.11.0 T04 (#1578) — canonical public facade surface proof.
 *
 * P2-4: the package root `.` runtime export set must be EXACTLY the union of
 * the real composition modules' runtime exports — no missing re-export, no
 * unexpected extra name, no second Runtime/Kernel/BUILD leaking in. A name
 * exported by two composition modules would be dropped by `export *`
 * (ambiguity), so the exact-set comparison also catches silent collisions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as facade from '../../src/v011/index.js';

test('T04-FACADE-1: the canonical entry runtime export set is exactly the union of the real contracts/BUILD/Boot/KDP exports', async () => {
  const contracts = await import('@kaicreator/domain-harness-contracts/v011');
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
