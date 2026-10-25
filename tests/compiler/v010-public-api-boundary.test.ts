/**
 * v0.10.2 T04 (#1324) — the public API boundary, semantically rewritten.
 * ===========================================================================
 * The old shape (three legacy compiler barrels identity-equal, gate
 * internals absent) is superseded. This file now asserts:
 *
 *   P1  the Microkernel public entry (`.`) equals the frozen L2 §3
 *       allowlist and its error classes share the Contracts identity;
 *   P2  the `./host-seam` module equals the exact L2 §3 seam allowlist;
 *   N1  the SELECTED RUNTIME (microkernel, host-node) never imports BUILD —
 *       not even type-only — nor the legacy Compiler packages (static scan
 *       of every source file's import specifiers);
 *   N2  host-seam internals do not leak: no gate, docs port, counters
 *       factory or import-hook registry symbol on any consumer surface,
 *       and deep `internal/*` imports are denied by the exports map;
 *   P3  the legacy compiler barrels still expose the curated v0.10 BUILD
 *       surface identity-equal across root/qualified/v10build entries
 *       (LEGACY_COMPAT_ONLY until T11).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as microkernel from '../../packages/microkernel/src/index.js';
import * as hostSeam from '../../packages/microkernel/src/host-seam.js';
import * as contracts from '@kaicreator/domain-harness-contracts';
import * as root from '../../packages/domain-harness-compiler/src/index.js';
import * as qualified from '../../packages/domain-harness-compiler/src/qualified-package/index.js';
import * as v10 from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('P1: the Microkernel `.` namespace equals the frozen L2 §3 allowlist', () => {
  assert.deepEqual(Object.keys(microkernel).sort(), [
    'load',
    'V10Error',
    'V10BuildError',
    'V10ActivationError',
    'V10ExternalEffectError',
    'V10PortDeniedError',
    'V10MultiBQueryError',
  ].sort());
  // Single class identity: the public errors ARE the Contracts classes.
  assert.equal(microkernel.V10Error, contracts.V10Error);
  assert.equal(microkernel.V10BuildError, contracts.V10BuildError);
  assert.equal(microkernel.V10ActivationError, contracts.V10ActivationError);
  assert.equal(microkernel.V10ExternalEffectError, contracts.V10ExternalEffectError);
});

test('P2: the `./host-seam` namespace equals the exact L2 §3 allowlist', () => {
  assert.deepEqual(Object.keys(hostSeam).sort(), [
    'activateV10App',
    'isV10AppFacade',
    'readSelectedShadowBinding',
    'v10SelectedKernelIdentity',
    'v10DeploymentDocsPrefix',
  ].sort());
});

test('N1: the selected runtime imports neither BUILD nor the legacy Compiler packages (not even type-only)', () => {
  const runtimeRoots = ['packages/microkernel/src', 'packages/host-node/src'];
  const forbidden = /^@kaicreator\/domain-harness-(build|compiler)(?:\/|$)/u;
  const violations: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(join(REPO_ROOT, directory), { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        const source = readFileSync(join(REPO_ROOT, full), 'utf8');
        for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/gu)) {
          const specifier = match[1]!;
          if (forbidden.test(specifier)) violations.push(`${full}: ${specifier}`);
        }
      }
    }
  };
  for (const runtimeRoot of runtimeRoots) walk(runtimeRoot);
  assert.deepEqual(violations, [], 'no runtime→BUILD / runtime→legacy-Compiler import edge may exist');
});

test('N2: host-seam internals are absent from every consumer surface and deep internals deny', async () => {
  for (const name of [
    'dispatchThroughExternalEffectGate',
    'normalizeExternalEffectEnvelope',
    'createV10DocsPort',
    'scopedDocsView',
    'freshV10Counters',
    'registerDeclaredBareImports',
    'privateModuleFragment',
    'createV10ImportHookRegistryForTests',
    'V10AppFacade',
  ]) {
    assert.equal(name in microkernel, false, `the public entry must not expose ${name}`);
    assert.equal(name in hostSeam, false, `the host seam must not expose ${name}`);
  }
  await assert.rejects(
    () => import('@kaicreator/domain-harness-microkernel/dist/internal/activation.js'),
    (error: unknown) => (error as NodeJS.ErrnoException).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
});

test('P3: the legacy compiler barrels keep the curated v0.10 BUILD surface identity-equal (LEGACY_COMPAT_ONLY until T11)', () => {
  for (const surface of [root, qualified]) {
    assert.equal(surface.buildV10App, v10.buildV10App);
    assert.equal(surface.activateV10App, v10.activateV10App);
    assert.equal(surface.V10BuildError, v10.V10BuildError);
  }
  const names = Object.keys(v10);
  assert.ok(names.length > 20, 'canonical legacy BUILD barrel must not silently go empty');
  for (const name of names) {
    assert.ok(name in root, `root is missing the canonical v0.10 binding ${name}`);
    assert.equal(root[name as keyof typeof root], v10[name], `root export drift: ${name}`);
    assert.equal(qualified[name as keyof typeof qualified], v10[name], `qualified export drift: ${name}`);
  }
});
