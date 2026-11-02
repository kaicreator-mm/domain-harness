#!/usr/bin/env node
// Build public SDK tarballs directly from a clean, exact source tag.
// No package manifest overlay, npm publish, tag mutation, or asset upload.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { assertExternalOutput, validateOutputArg } from './path-safety.mjs';
import { SDK_PACKAGES, verifySdkVersionConsistency } from './verify-sdk-version-consistency.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_NAMES = new Set(SDK_PACKAGES.map((item) => item.name));
const FORBIDDEN = /(^src\/|qualified-package|legacy-v[0-9]+|durable-receipt-carrier-v1[.]mjs|\.env|\.npmrc)/u;

function run(command, args, cwd) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32' && command === 'npm',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.slice(0, 3).join(' ')} failed; exit=${String(result.status)}${result.error ? `; error=${result.error.code}` : ''}`);
  }
  process.stdout.write(`[PASS] ${command} ${args.slice(0, 3).join(' ')}\n`);
  return (result.stdout || '').trim();
}

function git(args, cwd = ROOT) { return run('git', args, cwd); }
function npm(args, cwd) { return run('npm', args, cwd); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function packageManifestFromTgz(tgzPath) {
  const data = gunzipSync(readFileSync(tgzPath));
  let offset = 0;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').split('\0')[0];
    const sizeField = header.subarray(124, 136).toString('ascii').split('\0')[0].trim();
    const size = Number.parseInt(sizeField, 8);
    assert.ok(Number.isSafeInteger(size) && size >= 0, 'invalid tar member size');
    const contentStart = offset + 512;
    if (name === 'package/package.json') {
      const raw = data.subarray(contentStart, contentStart + size);
      return { manifest: JSON.parse(raw.toString('utf8')), raw };
    }
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`package/package.json not found inside ${basename(tgzPath)}`);
}

function checkOutputDir(outputDir) {
  assertExternalOutput(ROOT, outputDir);
  if (existsSync(outputDir)) {
    assert.equal(readdirSync(outputDir).length, 0, 'output directory must be empty');
  } else {
    mkdirSync(outputDir, { recursive: true });
  }
  assertExternalOutput(ROOT, outputDir);
}

function parseArgs(args) {
  const read = (name) => {
    const index = args.findIndex((arg) => arg === name);
    if (index >= 0) return args[index + 1];
    const inline = args.find((arg) => arg.startsWith(`${name}=`));
    return inline ? inline.slice(name.length + 1) : undefined;
  };
  return { tag: read('--tag'), out: read('--out') };
}

function main() {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Node >=24 required');
  const { tag, out: outArg } = parseArgs(process.argv.slice(2));
  assert.match(tag || '', /^v\d+\.\d+\.\d+(?:\+source-repair\.\d+)?$/u, 'usage: pack-sdk-from-tag.mjs --tag vX.Y.Z[+source-repair.N] --out ABSOLUTE_EMPTY_DIR');
  assert.ok(outArg, 'missing --out');
  validateOutputArg(outArg);
  const version = tag.slice(1).split('+')[0];
  const out = resolve(outArg);
  checkOutputDir(out);

  assert.equal(git(['status', '--porcelain']), '', 'source checkout must be clean');
  const sourceCommit = git(['rev-parse', `refs/tags/${tag}^{commit}`]);
  const sourceTree = git(['rev-parse', `refs/tags/${tag}^{tree}`]);
  assert.equal(git(['rev-parse', 'HEAD']), sourceCommit,
    'run the packer from the exact source tag checkout');
  assert.equal(git(['rev-parse', 'HEAD^{tree}']), sourceTree);
  const distributionScriptCommit = git(['rev-parse', 'HEAD']);
  const versionCheck = verifySdkVersionConsistency(ROOT, version);
  process.stdout.write(`[PASS] source manifests match ${tag}\n`);

  const temp = mkdtempSync(join(tmpdir(), 'domain-harness-sdk-source-first-'));
  const checkout = join(temp, 'tagged-source');
  let worktreeCreated = false;
  try {
    git(['worktree', 'add', '--detach', checkout, sourceCommit]);
    worktreeCreated = true;
    assert.equal(git(['rev-parse', 'HEAD'], checkout), sourceCommit);
    assert.equal(git(['rev-parse', 'HEAD^{tree}'], checkout), sourceTree);
    assert.equal(git(['status', '--porcelain'], checkout), '');

    npm(['ci', '--no-audit', '--no-fund'], checkout);
    npm(['run', 'build'], checkout);
    npm(['run', 'typecheck'], checkout);
    npm(['run', 'lint'], checkout);
    run('node', ['--import', 'tsx', '--test',
      'tests/compiler/v0102-tarball-inventory.test.ts'], checkout);
    run('node', ['scripts/distribution/verify-sdk-version-consistency.mjs',
      `--expected-version=${version}`], checkout);
    assert.equal(git(['status', '--porcelain'], checkout), '',
      'source build must not modify tracked tag files');

    const artifacts = [];
    const sourceManifests = [];
    for (const selected of SDK_PACKAGES) {
      assertExternalOutput(ROOT, out);
      const manifestPath = join(checkout, selected.dir, 'package.json');
      const sourceBytes = readFileSync(manifestPath);
      const sourceManifest = JSON.parse(sourceBytes.toString('utf8'));
      const sourceBlob = git(['rev-parse', `${tag}:${selected.dir}/package.json`], checkout);
      const packs = JSON.parse(npm([
        'pack', '--json', '--ignore-scripts', '--pack-destination', out,
        '--workspace', selected.name,
      ], checkout));
      assert.equal(packs.length, 1);
      const pack = packs[0];
      assert.equal(pack.name, selected.name);
      assert.equal(pack.version, version);
      const entries = pack.files.map((file) => file.path);
      assert.ok(entries.includes('dist/index.js') && entries.includes('dist/index.d.ts'),
        `${selected.name}: compiled JS and types must be included`);
      assert.ok(entries.every((path) => !FORBIDDEN.test(path)),
        `${selected.name}: forbidden source/private content found`);

      const tgzPath = join(out, basename(pack.filename));
      assert.ok(existsSync(tgzPath), `${selected.name}: tarball missing`);
      const packed = packageManifestFromTgz(tgzPath);
      assert.deepEqual(packed.manifest, sourceManifest,
        `${selected.name}: tarball manifest must equal exact source-tag manifest`);
      assert.deepEqual(packed.raw, sourceBytes,
        `${selected.name}: tarball package.json bytes must equal exact source-tag bytes`);
      assert.equal(packed.manifest.engines?.node, '>=24.0.0');
      assert.notEqual(packed.manifest.private, true);
      for (const [dependency, dependencyVersion] of Object.entries(packed.manifest.dependencies || {})) {
        if (PACKAGE_NAMES.has(dependency)) assert.equal(dependencyVersion, version);
      }

      const tarballBytes = readFileSync(tgzPath);
      sourceManifests.push({
        name: selected.name,
        path: `${selected.dir}/package.json`,
        gitBlob: sourceBlob,
        sha256: sha256(sourceBytes),
        version: sourceManifest.version,
      });
      artifacts.push({
        name: selected.name,
        version,
        filename: basename(tgzPath),
        sha256: sha256(tarballBytes),
        sizeBytes: tarballBytes.length,
        packageManifestSha256: sha256(packed.raw),
        packageManifestEqualsSourceTag: true,
        dependsOn: Object.fromEntries(Object.entries(packed.manifest.dependencies || {})
          .filter(([name]) => PACKAGE_NAMES.has(name))),
      });
    }

    const consumer = join(temp, 'clean-consumer');
    mkdirSync(consumer);
    const dependencies = Object.fromEntries(artifacts.map((artifact) => [
      artifact.name,
      `file:${join(out, artifact.filename).replaceAll('\\', '/')}`,
    ]));
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'domain-harness-sdk-source-first-smoke',
      private: true,
      type: 'module',
      dependencies,
    }, null, 2) + '\n');
    npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
    writeFileSync(join(consumer, 'smoke.mjs'),
      `for (const name of ${JSON.stringify([...PACKAGE_NAMES])}) {\n` +
      `  const module = await import(name);\n` +
      `  if (!module || Object.keys(module).length === 0) throw new Error('missing exports: ' + name);\n` +
      '}\n');
    run('node', ['smoke.mjs'], consumer);

    assertExternalOutput(ROOT, out);
    const sums = artifacts.map((artifact) => `${artifact.sha256}  ${artifact.filename}`).join('\n') + '\n';
    writeFileSync(join(out, 'SHA256SUMS'), sums);
    const provenance = {
      schema: 'domain-harness.sdk-github-assets.v2',
      sourceTag: tag,
      sourceCommit,
      sourceTree,
      distributionScriptCommit,
      packageVersion: version,
      sourceFirst: true,
      metadataOverlay: false,
      npmRegistryPublished: false,
      node: process.version,
      verifier: 'PASS_EXIT0',
      buildTypecheckLintAndInventory: 'PASS_EXIT0',
      sourceManifestParity: 'BYTE_IDENTICAL',
      cleanOfflineTarballInstallAndImports: 'PASS_EXIT0',
      versionCheck,
      sourceManifests,
      artifacts,
    };
    writeFileSync(join(out, 'SDK_PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n');
    process.stdout.write(`[READY FOR INDEPENDENT REVIEW, NOT UPLOADED] ${out}\n`);
  } finally {
    if (worktreeCreated) git(['worktree', 'remove', '--force', checkout]);
    rmSync(temp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`[BLOCK] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
