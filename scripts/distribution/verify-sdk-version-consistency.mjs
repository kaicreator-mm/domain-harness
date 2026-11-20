#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SDK_PACKAGES = Object.freeze([
  {
    dir: 'packages/contracts',
    name: '@kaicreator/domain-harness-contracts',
    internal: [],
  },
  {
    dir: 'packages/microkernel',
    name: '@kaicreator/domain-harness-microkernel',
    internal: ['@kaicreator/domain-harness-contracts'],
  },
  {
    dir: 'tooling/build',
    name: '@kaicreator/domain-harness-build',
    internal: ['@kaicreator/domain-harness-contracts'],
  },
  {
    dir: 'packages/host-node',
    name: '@kaicreator/domain-harness-host-node',
    internal: [
      '@kaicreator/domain-harness-contracts',
      '@kaicreator/domain-harness-microkernel',
    ],
  },
]);

const INTERNAL_PREFIX = '@kaicreator/domain-harness-';
const CONSUMER_DIR = 'packages/domain-harness';
const CONSUMER_NAME = '@kaicreator/domain-harness';
// Frozen v0.11.0 consumer graph (L2 §8.1/§8.6): the canonical public SDK
// depends on exactly these three internal packages, each at the release
// version; third-party packages are not internal edges.
const CONSUMER_INTERNAL = Object.freeze([
  '@kaicreator/domain-harness-build',
  '@kaicreator/domain-harness-contracts',
  '@kaicreator/domain-harness-microkernel',
]);
// v0.11.0 M-bump root-name edge consumers (L2 §8.6): these non-release
// workspaces keep their own version (0.2.0 / 0.11.0-dev.0) but must consume
// the canonical root package at the exact release version in the given
// section — an unsatisfied edge makes npm resolve the root package name
// against a registry and breaks workspace install.
export const ROOT_EDGE_PACKAGES = Object.freeze([
  { dir: 'packages/domain-harness-node', section: 'dependencies' },
  { dir: 'packages/domain-harness-expo', section: 'dependencies' },
  { dir: 'packages/domain-harness-compiler', section: 'peerDependencies' },
  { dir: 'packages/dis-v011-runtime', section: 'dependencies' },
]);
const ROOT_PRODUCT_VERSION = '0.11.0';
const CONSUMER_PRODUCT_VERSION = '0.11.0';
const ROOT_SDK_PREPACK = 'npm run build && node scripts/assert-v011-pack-ready.mjs';
const PRIVATE_LEGACY_WORKSPACES = new Set([
  'packages/domain-harness-node',
  'packages/domain-harness-expo',
  'packages/domain-harness-compiler',
]);
const DIS_RUNTIME_DIR = 'packages/dis-v011-runtime';
const DIS_RUNTIME_INTERNAL = Object.freeze([
  '@kaicreator/domain-harness-build',
  '@kaicreator/domain-harness-contracts',
]);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function assertInternalEdges(manifest, expected, label) {
  const seen = new Set();
  for (const section of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'devDependencies',
  ]) {
    for (const [name, version] of Object.entries(manifest[section] || {})) {
      if (!name.startsWith(INTERNAL_PREFIX)) continue;
      assert.ok(SDK_PACKAGES.some((item) => item.name === name),
        `${label}: unknown internal SDK dependency ${name}`);
      assert.equal(version, expected,
        `${label}: ${section}.${name} must equal ${expected}`);
      seen.add(name);
    }
  }
  return seen;
}

function assertExactDependencyEdges(manifest, names, expected, label) {
  for (const name of names) {
    assert.equal(manifest.dependencies?.[name], expected,
      `${label}: dependencies.${name} must equal ${expected}`);
  }
}

function assertExactConsumerRuntimeGraph(manifest, expectedNames, label) {
  assert.deepEqual(Object.keys(manifest.dependencies || {}).sort(), [...expectedNames].sort(),
    `${label}: production dependencies must contain exactly the frozen graph and no third-party runtime dependency`);
}

// ---------------------------------------------------------------------------
// T04 final wiring (L2 §8.3/§8.5 step 2): release packaging shape.
// The three executable-SDK packages ship ONLY dist/v011 in the tarball; the
// legacy dist stays reachable from the workspace through the fenced legacy
// export map but is absent from the packed artifact (old executable App ABI
// unreachable). No peer/optional/bundled metadata may leak into the frozen
// four-package release graph.
// ---------------------------------------------------------------------------
const V011_CANONICAL_ENTRY = Object.freeze({
  types: './dist/v011/index.d.ts',
  import: './dist/v011/index.js',
});
const RELEASE_METADATA_SECTIONS = Object.freeze([
  'peerDependencies',
  'optionalDependencies',
  'peerDependenciesMeta',
  'bundledDependencies',
  'bundleDependencies',
]);

function assertV011OnlyPackShape(manifest, legacySubpaths, label) {
  assert.deepEqual(manifest.files, ['dist/v011', 'README.md'],
    `${label}: files whitelist must ship exactly dist/v011 + README.md (legacy dist fenced from the tarball)`);
  assert.deepEqual(manifest.exports?.['.'], V011_CANONICAL_ENTRY,
    `${label}: exports['.'] must be the canonical v011 entry`);
  for (const subpath of legacySubpaths) {
    assert.ok(manifest.exports?.[subpath],
      `${label}: exports must keep ${subpath} for workspace compatibility (fenced by the files whitelist)`);
  }
  for (const section of RELEASE_METADATA_SECTIONS) {
    assert.equal(manifest[section], undefined,
      `${label}: ${section} must be absent from the frozen release graph`);
  }
}

function assertContractsReleaseShape(manifest, label) {
  // L2 §8.3 contracts scoped deviation: `.` stays the legacy inert
  // type/constant face; `./v011` is the canonical 0.11 contracts entry.
  // Contracts are zero-dependency and ship the whole dist (inert types).
  assert.equal(manifest.dependencies, undefined,
    `${label}: contracts must stay a zero-dependency package`);
  assert.deepEqual(manifest.exports?.['./v011'], V011_CANONICAL_ENTRY,
    `${label}: exports['./v011'] must be the canonical v011 contracts entry`);
  assert.ok(manifest.exports?.['.'],
    `${label}: exports['.'] (legacy inert face) must remain for workspace compatibility`);
  assert.ok(Array.isArray(manifest.files) && manifest.files.includes('dist'),
    `${label}: files must keep shipping the full dist (legacy types are inert)`);
  for (const section of ['peerDependencies', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies']) {
    assert.equal(manifest[section], undefined,
      `${label}: ${section} must be absent from the frozen release graph`);
  }
}

export function verifySdkVersionConsistency(root = ROOT, expectedVersion) {
  const rootManifest = readJson(root, 'package.json');
  assert.equal(rootManifest.version, ROOT_PRODUCT_VERSION,
    'root monorepo product version must remain 0.11.0');

  const manifests = SDK_PACKAGES.map((item) => ({
    ...item,
    manifest: readJson(root, `${item.dir}/package.json`),
  }));
  const inferredVersion = manifests[0].manifest.version;
  const expected = expectedVersion || inferredVersion;
  assert.match(expected, /^\d+\.\d+\.\d+$/u,
    'expected SDK version must be a stable x.y.z version');

  for (const item of manifests) {
    const { manifest } = item;
    assert.equal(manifest.name, item.name, `${item.dir}: package name`);
    assert.equal(manifest.version, expected,
      `${item.dir}: source manifest version must equal ${expected}`);
    assert.equal(manifest.engines?.node, '>=22.12.0',
      `${item.dir}: Node engine must remain >=22.12.0`);
    assert.notEqual(manifest.private, true,
      `${item.dir}: public SDK package cannot be private`);
    const seen = assertInternalEdges(manifest, expected, item.dir);
    assert.deepEqual([...seen].sort(), [...item.internal].sort(),
      `${item.dir}: internal dependency graph changed`);
  }

  assertExactDependencyEdges(readJson(root, 'tooling/build/package.json'), ['ajv'], '8.17.1', 'tooling/build');

  const consumer = readJson(root, `${CONSUMER_DIR}/package.json`);
  assert.equal(consumer.name, CONSUMER_NAME, 'DomainHarness consumer package name');
  assert.equal(consumer.version, CONSUMER_PRODUCT_VERSION,
    `${CONSUMER_DIR}: product version must remain 0.11.0`);
  assert.equal(consumer.engines?.node, '>=22.12.0',
    `${CONSUMER_DIR}: canonical public SDK must declare the verified Node target floor`);
  // T04 final wiring (L2 §8.3 / AC08): the consumer IS the canonical public
  // SDK entry and must be publishable — private:true would exclude it from
  // the release graph (M-bump phase rule ended at T04 final wiring).
  assert.notEqual(consumer.private, true,
    `${CONSUMER_DIR}: must be publishable (private:true is only allowed for the private prototype)`);
  const consumerSeen = assertInternalEdges(consumer, expected, CONSUMER_DIR);
  assert.deepEqual([...consumerSeen].sort(), [...CONSUMER_INTERNAL].sort(),
    `${CONSUMER_DIR}: internal dependency graph must describe the frozen 0.11.0 graph (contracts/build/microkernel)`);
  assertExactConsumerRuntimeGraph(consumer, CONSUMER_INTERNAL, CONSUMER_DIR);
  // T04 final packaging shape (L2 §8.3/§8.5 step 2): the canonical public
  // SDK ships only dist/v011; `./legacy` and the old subpath entries stay in
  // the fenced exports map for workspace compatibility.
  assertV011OnlyPackShape(consumer, ['./legacy'], CONSUMER_DIR);
  assert.equal(consumer.scripts?.prepack, ROOT_SDK_PREPACK,
    `${CONSUMER_DIR}: prepack must freshly build and assert the untracked canonical dist`);
  assertV011OnlyPackShape(readJson(root, 'tooling/build/package.json'), ['./legacy'], 'tooling/build');
  assertV011OnlyPackShape(manifests[1].manifest, ['./legacy', './legacy/host-seam'], 'packages/microkernel');
  assertContractsReleaseShape(manifests[0].manifest, 'packages/contracts');
  // microkernel ships zero third-party runtime dependencies (L2 §8.1).
  assertExactConsumerRuntimeGraph(manifests[1].manifest, ['@kaicreator/domain-harness-contracts'], 'packages/microkernel');

  for (const item of ROOT_EDGE_PACKAGES) {
    const manifest = readJson(root, `${item.dir}/package.json`);
    if (PRIVATE_LEGACY_WORKSPACES.has(item.dir)) {
      assert.equal(manifest.private, true,
        `${item.dir}: legacy root/legacy imports are workspace-only; this package must not enter a public release graph`);
    }
    assert.equal(manifest[item.section]?.[CONSUMER_NAME], expected,
      `${item.dir}: ${item.section}.${CONSUMER_NAME} must equal ${expected}`);
  }
  const disRuntime = readJson(root, `${DIS_RUNTIME_DIR}/package.json`);
  assert.equal(disRuntime.private, true,
    `${DIS_RUNTIME_DIR}: must remain private:true and outside the public release graph`);
  const disRuntimeSeen = assertInternalEdges(disRuntime, expected, DIS_RUNTIME_DIR);
  assert.deepEqual([...disRuntimeSeen].sort(), [...DIS_RUNTIME_INTERNAL].sort(),
    `${DIS_RUNTIME_DIR}: internal dependency graph must contain exactly build/contracts and no additional SDK edge`);
  assertExactDependencyEdges(disRuntime, DIS_RUNTIME_INTERNAL, expected, DIS_RUNTIME_DIR);

  const lock = readJson(root, 'package-lock.json');
  assert.equal(lock.version, ROOT_PRODUCT_VERSION,
    'package-lock.json root product version must remain 0.11.0');
  assert.equal(lock.name, rootManifest.name,
    'package-lock.json root name must match package.json');
  const lockedRoot = lock.packages?.[''];
  assert.ok(lockedRoot, 'package-lock.json: missing root package record');
  assert.equal(lockedRoot.name, rootManifest.name,
    'package-lock.json root workspace name must match package.json');
  assert.equal(lockedRoot.version, rootManifest.version,
    'package-lock.json root package version must match package.json');

  for (const item of manifests) {
    const locked = lock.packages?.[item.dir];
    assert.ok(locked, `package-lock.json: missing workspace ${item.dir}`);
    assert.equal(locked.name, item.name, `${item.dir}: lock package name`);
    assert.equal(locked.version, expected, `${item.dir}: lock package version`);
    assert.equal(locked.engines?.node, '>=22.12.0', `${item.dir}: lock Node engine`);
    const lockedSeen = assertInternalEdges(locked, expected, `${item.dir} lock`);
    assert.deepEqual([...lockedSeen].sort(), [...item.internal].sort(),
      `${item.dir}: lock internal dependency graph changed`);
  }

  assertExactDependencyEdges(lock.packages?.['tooling/build'], ['ajv'], '8.17.1', 'tooling/build lock');

  const lockedConsumer = lock.packages?.[CONSUMER_DIR];
  assert.ok(lockedConsumer, `package-lock.json: missing workspace ${CONSUMER_DIR}`);
  assert.equal(lockedConsumer.name, consumer.name,
    `${CONSUMER_DIR}: lock package name must match package.json`);
  assert.equal(lockedConsumer.version, CONSUMER_PRODUCT_VERSION,
    `${CONSUMER_DIR}: lock product version must remain 0.11.0`);
  assert.equal(lockedConsumer.version, consumer.version,
    `${CONSUMER_DIR}: lock package version`);
  assert.equal(lockedConsumer.engines?.node, '>=22.12.0',
    `${CONSUMER_DIR}: lock must retain the verified Node target floor`);
  const lockedConsumerSeen = assertInternalEdges(lockedConsumer, expected, `${CONSUMER_DIR} lock`);
  assert.deepEqual([...lockedConsumerSeen].sort(), [...CONSUMER_INTERNAL].sort(),
    `${CONSUMER_DIR}: lock internal dependency graph must describe the frozen 0.11.0 graph`);
  assertExactConsumerRuntimeGraph(lockedConsumer, CONSUMER_INTERNAL, `${CONSUMER_DIR} lock`);

  for (const item of ROOT_EDGE_PACKAGES) {
    const locked = lock.packages?.[item.dir];
    assert.ok(locked, `package-lock.json: missing workspace ${item.dir}`);
    assert.equal(locked[item.section]?.[CONSUMER_NAME], expected,
      `${item.dir}: lock ${item.section}.${CONSUMER_NAME} must equal ${expected}`);
  }
  const lockedDisRuntime = lock.packages?.[DIS_RUNTIME_DIR];
  assert.ok(lockedDisRuntime, `package-lock.json: missing workspace ${DIS_RUNTIME_DIR}`);
  const lockedDisRuntimeSeen = assertInternalEdges(lockedDisRuntime, expected, `${DIS_RUNTIME_DIR} lock`);
  assert.deepEqual([...lockedDisRuntimeSeen].sort(), [...DIS_RUNTIME_INTERNAL].sort(),
    `${DIS_RUNTIME_DIR}: lock internal dependency graph must contain exactly build/contracts and no additional SDK edge`);
  assertExactDependencyEdges(lockedDisRuntime, DIS_RUNTIME_INTERNAL, expected, `${DIS_RUNTIME_DIR} lock`);

  return {
    version: expected,
    packages: manifests.map(({ name, dir }) => ({ name, dir })),
    consumer: CONSUMER_NAME,
    result: 'PASS',
  };
}

function expectedVersionFromArgs(args) {
  const index = args.findIndex((arg) => arg === '--expected-version');
  if (index >= 0) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith('--expected-version='));
  return inline ? inline.slice('--expected-version='.length) : undefined;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = verifySdkVersionConsistency(ROOT, expectedVersionFromArgs(process.argv.slice(2)));
    process.stdout.write(`[PASS] SDK source/lock version consistency ${result.version}\n`);
  } catch (error) {
    process.stderr.write(`[BLOCK] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
