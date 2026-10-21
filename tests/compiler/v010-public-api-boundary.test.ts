/** The public v0.10 package surface must not expose Host gate internals. */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as root from '../../packages/domain-harness-compiler/src/index.js';
import * as qualified from '../../packages/domain-harness-compiler/src/qualified-package/index.js';
import * as v10 from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';

test('P-I1227: root, qualified and v10build resolve the same curated BUILD API', () => {
  for (const surface of [root, qualified]) {
    assert.equal(surface.buildV10App, v10.buildV10App);
    assert.equal(surface.activateV10App, v10.activateV10App);
    assert.equal(surface.V10BuildError, v10.V10BuildError);
  }
});

test('N-I1227: public barrels never export trusted Host effect/AST internals', () => {
  for (const surface of [root, qualified, v10]) {
    for (const name of [
      'dispatchThroughExternalEffectGate',
      'normalizeExternalEffectEnvelope',
      'collectModuleEdges',
      'assertSealedImportClosure',
      // #1228: the test-only registry factory and the minted-fragment seam
      // stay internal to import-hook.ts; `export *` chains would leak them.
      'createV10ImportHookRegistryForTests',
      'privateModuleFragment',
      // #1227: internal activation counter probes must not be publicly
      // reachable either.
      'freshV10Counters',
    ]) {
      assert.equal(name in surface, false, `${name} must not be publicly reachable`);
    }
  }
});
