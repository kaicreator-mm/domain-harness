#!/usr/bin/env node
// GitHub SDK tarballs: build the immutable v0.10.3 tree, patch only disposable
// package metadata, and verify the generated .tgz in a clean consumer.
// NEVER publish to npm; NEVER move an existing Git tag or alter source files.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { assertExternalOutput, validateOutputArg } from './path-safety.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TAG = 'v0.10.3';
const SOURCE_COMMIT = '061376f4a023070f215f9feffad5c24d96d503cb';
const SOURCE_TREE = '099cdc831aef63befd62aaede7e7a853d1be468f';
const ORIGINAL_VERSION = '0.10.2-rc.0';
const VERSION = '0.10.3';
const PACKAGES = [
  { dir: 'packages/contracts', name: '@kaicreator/domain-harness-contracts' },
  { dir: 'packages/microkernel', name: '@kaicreator/domain-harness-microkernel' },
  { dir: 'tooling/build', name: '@kaicreator/domain-harness-build' },
  { dir: 'packages/host-node', name: '@kaicreator/domain-harness-host-node' },
];
const PACKAGE_NAMES = new Set(PACKAGES.map((p) => p.name));
const PACKAGE_PATHS = PACKAGES.map((p) => p.dir + '/package.json').sort();
const FORBIDDEN = /(^src\/|qualified-package|legacy-v[0-9]+|durable-receipt-carrier-v1[.]mjs|\.env|\.npmrc)/u;

function run(command, args, cwd) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  const result = spawnSync(executable, args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    // npm.cmd is a cmd script on Windows, not a native executable.
    shell: process.platform === 'win32' && command === 'npm',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    // Deliberately do not echo stderr/stdout (may include installation metadata).
    throw new Error(command + ' ' + args.slice(0, 3).join(' ') +
      ' failed; exit=' + String(result.status) +
      (result.error ? '; error=' + result.error.code : ''));
  }
  process.stdout.write('[PASS] ' + command + ' ' + args.slice(0, 3).join(' ') + '\n');
  return (result.stdout || '').trim();
}
function git(args, cwd = ROOT) { return run('git', args, cwd); }
function npm(args, cwd) { return run('npm', args, cwd); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function packageJsonFromTgz(tgzPath) {
  const data = gunzipSync(readFileSync(tgzPath));
  let offset = 0;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((v) => v === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').split('\0')[0];
    const sizeField = header.subarray(124, 136).toString('ascii').split('\0')[0].trim();
    const size = Number.parseInt(sizeField, 8);
    assert.ok(Number.isSafeInteger(size) && size >= 0, 'invalid tar member size');
    const next = offset + 512;
    if (name === 'package/package.json') {
      return JSON.parse(data.subarray(next, next + size).toString('utf8'));
    }
    offset = next + Math.ceil(size / 512) * 512;
  }
  throw new Error('package/package.json not found inside tarball ' + basename(tgzPath));
}
function assertMetadata(manifest, selected) {
  assert.equal(manifest.name, selected.name, 'selected package identity');
  assert.equal(manifest.version, VERSION, 'package version');
  assert.equal(manifest.engines?.node, '>=24.0.0', 'Node24 engine');
  assert.notEqual(manifest.private, true, 'public package cannot be private');
  for (const [name, version] of Object.entries(manifest.dependencies || {})) {
    if (name.startsWith('@kaicreator/domain-harness-')) {
      assert.ok(PACKAGE_NAMES.has(name), 'unknown internal runtime dependency ' + name);
      assert.equal(version, VERSION, 'internal dependency version ' + name);
    }
  }
  assert.ok(manifest.files?.includes('dist'), 'dist must be shipped');
}
function checkOutputDir(out) {
  // validateOutputArg already enforced an absolute native path before resolve().
  assertExternalOutput(ROOT, out);
  if (existsSync(out)) assert.equal(readdirSync(out).length, 0, 'output must be empty');
  else mkdirSync(out, { recursive: true });
  // Resolve again after creation to catch pre-existing junctions/reparse paths.
  assertExternalOutput(ROOT, out);
}
function main() {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Node >=24 required');
  assert.equal(process.argv[2], '--out', 'usage: node scripts/distribution/pack-sdk-v0103.mjs --out ABSOLUTE_EMPTY_DIR');
  assert.equal(process.argv.length, 4, 'exactly one --out argument required');
  validateOutputArg(process.argv[3]);
  const out = resolve(process.argv[3]);
  checkOutputDir(out);
  // Fail before side effects if the immutable tag has ever moved.
  assert.equal(git(['rev-parse', 'refs/tags/' + TAG + '^{commit}']), SOURCE_COMMIT);
  assert.equal(git(['rev-parse', 'refs/tags/' + TAG + '^{tree}']), SOURCE_TREE);
  assert.equal(git(['status', '--porcelain', '--', 'scripts/distribution']), '',
    'distribution script must be committed and clean');
  const scriptCommit = git(['rev-parse', 'HEAD']);
  const tmp = mkdtempSync(join(tmpdir(), 'dh-sdk-v0103-'));
  const checkout = join(tmp, 'tagged');
  let worktreeCreated = false;
  try {
    git(['worktree', 'add', '--detach', checkout, SOURCE_COMMIT]);
    worktreeCreated = true;
    assert.equal(git(['rev-parse', 'HEAD'], checkout), SOURCE_COMMIT);
    assert.equal(git(['rev-parse', 'HEAD^{tree}'], checkout), SOURCE_TREE);
    assert.equal(git(['status', '--porcelain'], checkout), '');
    // Exact-tag build/qualification is executed BEFORE changing any manifest.
    npm(['ci', '--no-audit', '--no-fund'], checkout);
    npm(['run', 'build'], checkout);
    npm(['run', 'typecheck'], checkout);
    npm(['run', 'lint'], checkout);
    run('node', ['--import', 'tsx', '--test',
      'tests/compiler/v0102-tarball-inventory.test.ts'], checkout);
    assert.equal(git(['status', '--porcelain'], checkout), '',
      'compiled tagged source must have clean tracked files');

    // Deliberate, disclosed packaging-only rewrite on disposable worktree.
    for (const selected of PACKAGES) {
      const path = join(checkout, selected.dir, 'package.json');
      const manifest = readJson(path);
      assert.equal(manifest.name, selected.name);
      assert.equal(manifest.version, ORIGINAL_VERSION);
      manifest.version = VERSION;
      for (const [name, version] of Object.entries(manifest.dependencies || {})) {
        if (PACKAGE_NAMES.has(name)) {
          assert.equal(version, ORIGINAL_VERSION, 'original internal edge');
          manifest.dependencies[name] = VERSION;
        } else if (name.startsWith('@kaicreator/domain-harness-')) {
          throw new Error('unselected internal dependency ' + name);
        }
      }
      assertMetadata(manifest, selected);
      writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
    }
    const changed = git(['diff', '--name-only'], checkout).split(/\r?\n/u).filter(Boolean).sort();
    assert.deepEqual(changed, PACKAGE_PATHS, 'metadata overlay must change four files only');

    const artifacts = [];
    for (const selected of PACKAGES) {
      // Defend against a changed junction or output symlink before writing tarballs.
      assertExternalOutput(ROOT, out);
      const packs = JSON.parse(npm(['pack', '--json', '--ignore-scripts',
        '--pack-destination', out, '--workspace', selected.name], checkout));
      assert.equal(packs.length, 1);
      const pack = packs[0];
      assert.equal(pack.name, selected.name);
      assert.equal(pack.version, VERSION);
      const entries = pack.files.map((f) => f.path);
      assert.ok(entries.includes('dist/index.js') && entries.includes('dist/index.d.ts'),
        'compiled JS and types must be in package ' + selected.name);
      assert.ok(entries.every((f) => !FORBIDDEN.test(f)),
        'unselected contents in ' + selected.name);
      const tgz = join(out, basename(pack.filename));
      assert.ok(existsSync(tgz));
      const internal = packageJsonFromTgz(tgz);
      assertMetadata(internal, selected);
      artifacts.push({
        name: selected.name, version: VERSION, filename: basename(tgz),
        sha256: sha256(tgz), sizeBytes: readFileSync(tgz).length,
        dependsOn: Object.fromEntries(Object.entries(internal.dependencies || {})
          .filter(([name]) => PACKAGE_NAMES.has(name))),
      });
    }
    const consumer = join(tmp, 'clean-consumer');
    mkdirSync(consumer);
    const dependencies = Object.fromEntries(artifacts.map((p) =>
      [p.name, 'file:' + join(out, p.filename).replaceAll('\\', '/')]));
    writeFileSync(join(consumer, 'package.json'),
      JSON.stringify({ name: 'dh-v0103-tgz-smoke', private: true,
        type: 'module', dependencies }, null, 2) + '\n');
    npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
    writeFileSync(join(consumer, 'smoke.mjs'),
      "for (const name of " + JSON.stringify([...PACKAGE_NAMES]) +
      ") { const mod = await import(name); if (!mod || Object.keys(mod).length === 0) throw new Error('missing exports: ' + name); }\n");
    run('node', ['smoke.mjs'], consumer);

    assertExternalOutput(ROOT, out);
    const sums = artifacts.map((a) => a.sha256 + '  ' + a.filename).join('\n') + '\n';
    writeFileSync(join(out, 'SHA256SUMS'), sums);
    const receipt = {
      schema: 'domain-harness.sdk-github-assets.v1',
      sourceTag: TAG, sourceCommit: SOURCE_COMMIT, sourceTree: SOURCE_TREE,
      distributionScriptCommit: scriptCommit,
      packageVersion: VERSION, metadataOverlay: 'four package.json files in disposable exact-tag worktree only',
      npmRegistryPublished: false, node: process.version,
      buildAndTypecheckAndLintAndInventory: 'PASS_EXIT0',
      freshOfflineLocalTarballInstallAndImports: 'PASS_EXIT0',
      artifacts,
    };
    writeFileSync(join(out, 'SDK_PROVENANCE.json'), JSON.stringify(receipt, null, 2) + '\n');
    process.stdout.write('[READY FOR INDEPENDENT REVIEW, NOT UPLOADED] ' + out + '\n');
  } finally {
    if (worktreeCreated) git(['worktree', 'remove', '--force', checkout]);
    rmSync(tmp, { recursive: true, force: true });
  }
}
try { main(); } catch (error) {
  console.error('[BLOCK] ' + error.message);
  process.exitCode = 1;
}
