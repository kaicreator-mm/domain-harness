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

export function verifySdkVersionConsistency(root = ROOT, expectedVersion) {
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
    assert.equal(manifest.engines?.node, '>=24.0.0',
      `${item.dir}: Node engine must remain >=24.0.0`);
    assert.notEqual(manifest.private, true,
      `${item.dir}: public SDK package cannot be private`);
    const seen = assertInternalEdges(manifest, expected, item.dir);
    assert.deepEqual([...seen].sort(), [...item.internal].sort(),
      `${item.dir}: internal dependency graph changed`);
  }

  const consumer = readJson(root, `${CONSUMER_DIR}/package.json`);
  assert.equal(consumer.name, CONSUMER_NAME, 'DomainHarness consumer package name');
  assert.equal(consumer.dependencies?.['@kaicreator/domain-harness-contracts'], expected,
    `${CONSUMER_DIR}: contracts dependency must equal ${expected}`);

  const lock = readJson(root, 'package-lock.json');
  for (const item of manifests) {
    const locked = lock.packages?.[item.dir];
    assert.ok(locked, `package-lock.json: missing workspace ${item.dir}`);
    assert.equal(locked.name, item.name, `${item.dir}: lock package name`);
    assert.equal(locked.version, expected, `${item.dir}: lock package version`);
    assert.equal(locked.engines?.node, '>=24.0.0', `${item.dir}: lock Node engine`);
    const lockedSeen = assertInternalEdges(locked, expected, `${item.dir} lock`);
    assert.deepEqual([...lockedSeen].sort(), [...item.internal].sort(),
      `${item.dir}: lock internal dependency graph changed`);
  }

  const lockedConsumer = lock.packages?.[CONSUMER_DIR];
  assert.ok(lockedConsumer, `package-lock.json: missing workspace ${CONSUMER_DIR}`);
  assert.equal(lockedConsumer.version, consumer.version,
    `${CONSUMER_DIR}: lock package version`);
  assert.equal(
    lockedConsumer.dependencies?.['@kaicreator/domain-harness-contracts'],
    expected,
    `${CONSUMER_DIR}: lock contracts dependency must equal ${expected}`,
  );

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
