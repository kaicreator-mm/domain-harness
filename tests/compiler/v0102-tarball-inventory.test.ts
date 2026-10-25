/**
 * v0.10.2 T07b — bounded distributable tarball inventory and legacy exclusion.
 * Run after the ordinary workspace build. No npm publish, network or lifecycle
 * script is necessary: npm pack --dry-run --json reports actual staged bytes.
 * Final clean Tiny/Rich executable installation belongs to T09/R01.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SELECTED = [
  { dir: 'packages/contracts', name: '@kaicreator/domain-harness-contracts' },
  { dir: 'packages/microkernel', name: '@kaicreator/domain-harness-microkernel' },
  { dir: 'packages/host-node', name: '@kaicreator/domain-harness-host-node' },
  { dir: 'tooling/build', name: '@kaicreator/domain-harness-build' },
] as const;
const LEGACY = [
  'packages/domain-harness',
  'packages/domain-harness-compiler',
  'packages/domain-harness-node',
  'packages/domain-harness-expo',
] as const;

type Manifest = {
  name?: string;
  version?: string;
  private?: boolean;
  engines?: { node?: string };
  main?: string;
  types?: string;
  files?: readonly string[];
  exports?: Record<string, unknown>;
};
function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(join(ROOT, path, 'package.json'), 'utf8')) as Manifest;
}

test('T07b selected workspace engines and export identities are the Node24-only distribution', () => {
  const root = readManifest('');
  assert.equal(root.engines?.node, '>=24.0.0');
  for (const selected of SELECTED) {
    const manifest = readManifest(selected.dir);
    assert.equal(manifest.name, selected.name);
    assert.equal(manifest.version, '0.10.2-rc.0');
    assert.notEqual(manifest.private, true, selected.name + ' must remain distributable');
    assert.equal(manifest.engines?.node, '>=24.0.0');
    assert.equal(manifest.main, './dist/index.js');
    assert.equal(manifest.types, './dist/index.d.ts');
    assert.deepEqual(Object.keys(manifest.exports ?? {}).sort(),
      selected.name === '@kaicreator/domain-harness-microkernel' ? ['.', './host-seam'] : ['.']);
    assert.ok(manifest.files?.includes('dist'), 'selected runtime/build must ship dist');
  }
});

test('T07b retired legacy workspaces are private and cannot advertise old v10 Runtime', () => {
  for (const path of LEGACY) {
    const manifest = readManifest(path);
    assert.equal(manifest.private, true, path + ' must not be published');
  }
  const compiler = readManifest('packages/domain-harness-compiler');
  assert.deepEqual(Object.keys(compiler.exports ?? {}), ['.'],
    'the retired compiler may remain a private in-monorepo test helper, but v10 public aliases must be gone');
});

test('T07b npm pack dry-run shows clean selected tarballs, no retired Compiler / K02 fragment', { timeout: 120_000 }, () => {
  const forbidden = /qualified-package|legacy-v[0-9]+|durable-receipt-carrier-v1[.]mjs/u;
  for (const selected of SELECTED) {
    // Actual npm pack computed on the physical current checkout, with no write.
    const stdout = execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts', '-w', selected.name],
      { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 25_000 },
    );
    const packs = JSON.parse(stdout) as {
      name: string;
      files: { path: string }[];
    }[];
    assert.equal(packs.length, 1, selected.name + ' should have one pack');
    assert.equal(packs[0]?.name, selected.name);
    const files = packs[0]!.files.map((file) => file.path);
    assert.ok(files.includes('dist/index.js'), selected.name + ': compiled entry missing');
    assert.ok(files.includes('dist/index.d.ts'), selected.name + ': typed entry missing');
    assert.ok(files.includes('package.json'), selected.name + ': manifest missing');
    assert.ok(files.every((path) => !forbidden.test(path)), selected.name + ': legacy runtime/fragment shipped');
    assert.ok(files.every((path) => !path.startsWith('src/')), selected.name + ': unselected source shipped');
    if (selected.name === '@kaicreator/domain-harness-microkernel') {
      assert.ok(files.includes('dist/host-seam.js'), 'selected trusted Host bootstrap must be shipped');
      assert.ok(files.includes('dist/host-seam.d.ts'), 'typed host-seam entry must be shipped');
    }
  }
});
