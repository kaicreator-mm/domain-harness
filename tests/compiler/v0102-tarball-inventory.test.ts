/**
 * v0.11.0 T04 — bounded public tarball inventory and legacy exclusion.
 * Run after the ordinary workspace build. This static inventory uses
 * --ignore-scripts; the separate distribution pack test executes the root
 * prepack fresh-build assertion. Clean external installation belongs to T05.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ROOT_SDK = '@kaicreator/domain-harness';
const CONTRACTS = '@kaicreator/domain-harness-contracts';
const MICROKERNEL = '@kaicreator/domain-harness-microkernel';
const BUILD = '@kaicreator/domain-harness-build';
const HOST_NODE = '@kaicreator/domain-harness-host-node';
const PUBLIC_V011 = [
  { dir: 'packages/domain-harness', name: ROOT_SDK },
  { dir: 'packages/contracts', name: CONTRACTS },
  { dir: 'packages/microkernel', name: MICROKERNEL },
  { dir: 'tooling/build', name: BUILD },
] as const;
const PRIVATE_LEGACY = [
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
  exports?: Record<string, { types?: string; import?: string }>;
};
function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(join(ROOT, path, 'package.json'), 'utf8')) as Manifest;
}

test('v011 public workspaces expose the frozen Node24 canonical identities', () => {
  const root = readManifest('');
  assert.equal(root.engines?.node, '>=24.0.0');
  for (const selected of PUBLIC_V011) {
    const manifest = readManifest(selected.dir);
    assert.equal(manifest.name, selected.name);
    assert.equal(manifest.version, '0.11.0');
    assert.notEqual(manifest.private, true, selected.name + ' must be publishable');
    assert.equal(manifest.engines?.node, '>=24.0.0');
    assert.deepEqual(manifest.exports?.['.'], selected.name === CONTRACTS
      ? { types: './dist/index.d.ts', import: './dist/index.js', require: './dist/index.js' }
      : { types: './dist/v011/index.d.ts', import: './dist/v011/index.js' });
    if (selected.name === CONTRACTS) {
      assert.equal(manifest.main, './dist/index.js');
      assert.equal(manifest.types, './dist/index.d.ts');
      assert.deepEqual(Object.keys(manifest.exports ?? {}).sort(), ['.', './v011']);
      assert.ok(manifest.files?.includes('dist'), 'contracts scoped inert legacy face remains shipped');
    } else {
      assert.equal(manifest.main, './dist/v011/index.js');
      assert.equal(manifest.types, './dist/v011/index.d.ts');
      assert.deepEqual(manifest.files, ['dist/v011', 'README.md']);
      assert.ok(manifest.exports?.['./legacy'], selected.name + ': workspace legacy alias must remain');
    }
  }

  // L2 §8.6: host-node is version-aligned legacy internal infrastructure,
  // not a fifth public v011 feature package and not part of the four-pack path.
  const host = readManifest('packages/host-node');
  assert.equal(host.name, HOST_NODE);
  assert.equal(host.version, '0.11.0');
  assert.notEqual(host.private, true);
  assert.equal(host.main, './dist/index.js');
  assert.equal(host.types, './dist/index.d.ts');
});

test('v011 legacy executable workspaces remain private', () => {
  for (const path of PRIVATE_LEGACY) {
    assert.equal(readManifest(path).private, true, path + ' must remain workspace-only');
  }
  const compiler = readManifest('packages/domain-harness-compiler');
  assert.deepEqual(Object.keys(compiler.exports ?? {}), ['.'],
    'the retired compiler may remain a private in-monorepo test helper, without v10 public aliases');
});

test('Compiler build restores vendored parser assets byte-identically', () => {
  for (const name of ['acorn.mjs', 'acorn.d.mts']) {
    const relative = 'qualified-package/v09build/generated/' + name;
    const source = readFileSync(join(ROOT, 'packages/domain-harness-compiler/src', relative));
    const emitted = readFileSync(join(ROOT, 'packages/domain-harness-compiler/dist', relative));
    assert.deepEqual(emitted, source, 'vendored Compiler parser asset must survive a clean build: ' + name);
  }
});

function packFiles(name: string): string[] {
  const stdout = execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts', '-w', name],
    { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 25_000 },
  );
  const packs = JSON.parse(stdout) as { name: string; files: { path: string }[] }[];
  assert.equal(packs.length, 1, name + ' should have one pack');
  assert.equal(packs[0]?.name, name);
  return packs[0]!.files.map((file) => file.path);
}

test('v011 public pack inventory ships canonical entries and no legacy executable ABI', { timeout: 120_000 }, () => {
  const forbidden = /qualified-package|legacy-v[0-9]+|durable-receipt-carrier-v1[.]mjs/u;
  for (const selected of PUBLIC_V011) {
    const files = packFiles(selected.name);
    assert.ok(files.includes('dist/v011/index.js'), selected.name + ': canonical JS entry missing');
    assert.ok(files.includes('dist/v011/index.d.ts'), selected.name + ': canonical types missing');
    assert.ok(files.includes('package.json'), selected.name + ': manifest missing');
    assert.ok(files.every((path) => !forbidden.test(path)), selected.name + ': legacy runtime/fragment shipped');
    assert.ok(files.every((path) => !path.startsWith('src/')), selected.name + ': unselected source shipped');
    if (selected.name === CONTRACTS) {
      assert.ok(files.includes('dist/index.js'), 'contracts inert legacy root remains a scoped exception');
      assert.ok(files.includes('dist/index.d.ts'), 'contracts inert legacy types remain a scoped exception');
    } else {
      assert.ok(!files.includes('dist/index.js'), selected.name + ': legacy root leaked');
      assert.ok(!files.includes('dist/host-seam.js'), selected.name + ': legacy host-seam leaked');
      assert.ok(files.every((path) => path.startsWith('dist/v011/') || path === 'package.json' || path === 'README.md'),
        selected.name + ': unexpected file outside the v011 tarball fence');
    }
  }
});

test('legacy host-node pack inventory stays outside the v011 canonical entry claim', { timeout: 120_000 }, () => {
  const files = packFiles(HOST_NODE);
  assert.ok(files.includes('dist/index.js'));
  assert.ok(files.includes('dist/index.d.ts'));
  assert.ok(!files.includes('dist/v011/index.js'), 'host-node has no delivered v011 feature entry');
});
