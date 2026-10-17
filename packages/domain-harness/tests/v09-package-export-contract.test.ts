/**
 * N06-PKG: versioned ESM package export/emit contract.
 *
 * Run AFTER npm run build -w @kaicreator/domain-harness. This test verifies
 * actual Node package-self-resolution; it does not invent a fake v9 executor.
 * #1036 owns executable H→K dispatch and #1119 owns full clean consumers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageManifest = join(packageDir, 'package.json');

test('V09-PKG-EX01: versioned ESM and types paths point to emitted files, no privileged export', async () => {
  const manifest = JSON.parse(await readFile(packageManifest, 'utf8')) as {
    type: string;
    exports: Record<string, { import?: string; types?: string }>;
  };
  assert.equal(manifest.type, 'module');
  assert.deepEqual(manifest.exports['./v9'], {
    types: './dist/public-v9/index.d.ts',
    import: './dist/public-v9/index.js',
  });
  for (const key of Object.keys(manifest.exports)) {
    assert.equal(key.startsWith('./host-v9'), false);
    assert.equal(key.startsWith('./v9/host'), false);
    assert.equal(key.startsWith('./v9/internal'), false);
  }
  await stat(join(packageDir, 'dist/public-v9/index.js'));
  await stat(join(packageDir, 'dist/public-v9/index.d.ts'));
});

test('V09-PKG-EX02: real Node ESM resolves the published /v9 subpath; no H authority escapes', async () => {
  // Import from the package name itself, never from private source paths.
  const publicSdk = await import('@kaicreator/domain-harness/v9');
  assert.equal(typeof publicSdk.DomainHarnessV9Error, 'function');
  assert.equal(publicSdk.V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED, 'PACKAGE_NOT_AUTHORIZED');
  assert.equal(typeof publicSdk.publicInstalledReferenceFailure, 'function');
  for (const forbidden of [
    'createProtectedHostV09',
    'issueV09ApprovalProof',
    'drainProtectedDiagnostics',
    'getModuleNamespace',
    'install',
    'hostPorts',
  ]) {
    assert.equal(Object.hasOwn(publicSdk, forbidden), false);
  }
  // This PR does NOT assert send/query works; executable dispatch is #1036.
});
