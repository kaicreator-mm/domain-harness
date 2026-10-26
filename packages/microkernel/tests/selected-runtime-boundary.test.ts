/** T04 A7/W2+W5: source closure and published Host seam. Actual legacy tarball
 * retirement is an independent T07b gate, never inferred by this test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SELECTED_ROOTS = ['packages/microkernel/src', 'packages/host-node/src'] as const;
const DISALLOWED = [
  /^@kaicreator\/domain-harness-compiler(?:\/|$)/u,
  /^@kaicreator\/domain-harness-build(?:\/|$)/u,
  /^@kaicreator\/domain-harness(?:\/|$)/u,
  /(?:^|\/)qualified-package\/v10build(?:\/|$)/u,
  /(?:^|\/)host-v8(?:\/|$)/u,
] as const;

function selectedSourceImports(dir: string): readonly string[] {
  const results: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) {
        const text = readFileSync(join(ROOT, path), 'utf8');
        for (const match of text.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/gu)) {
          const value = match[1];
          if (value !== undefined && DISALLOWED.some((rule) => rule.test(value))) results.push(path + ' -> ' + value);
        }
      }
    }
  };
  walk(dir);
  return Object.freeze(results);
}

test('T04 A7 W5 new selected runtime cannot import legacy Compiler/Host or BUILD', () => {
  const violations = SELECTED_ROOTS.flatMap((dir) => selectedSourceImports(dir));
  assert.deepEqual(violations, [],
    'old C/H runtime may remain LEGACY_COMPAT_ONLY until T11/T07b; never selected Microkernel/Host');
});

test('T04 A7 W2 published bare Host-seam specifier has precisely five values', async () => {
  const keys = ['activateV10App', 'isV10AppFacade', 'readSelectedShadowBinding',
    'v10SelectedKernelIdentity', 'v10DeploymentDocsPrefix'].sort();
  const published = await import('@kaicreator/domain-harness-microkernel/host-seam');
  assert.deepEqual(Object.keys(published).sort(), keys);
  await assert.rejects(
    () => import('@kaicreator/domain-harness-microkernel/dist/internal/activation.js'),
    (error: unknown) => (error as NodeJS.ErrnoException).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  );
  // This is a workspace export test. T07b additionally proves exact tarballs and old H retirement.
});
