import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  SDK_PACKAGES,
  verifySdkVersionConsistency,
} from '../../scripts/distribution/verify-sdk-version-consistency.mjs';

const VERSION = '0.10.3';
const CONSUMER_DIR = 'packages/domain-harness';
const CONTRACTS = '@kaicreator/domain-harness-contracts';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dh-sdk-version-consistency-'));
  const lockPackages = {
    '': { name: 'domain-harness-monorepo', version: '0.2.0' },
  };
  const manifests = new Map();
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'domain-harness-monorepo',
    private: true,
    version: '0.2.0',
  }, null, 2) + '\n');
  for (const item of SDK_PACKAGES) {
    const dependencies = Object.fromEntries(item.internal.map((name) => [name, VERSION]));
    const manifest = {
      name: item.name,
      version: VERSION,
      type: 'module',
      engines: { node: '>=24.0.0' },
      files: ['dist'],
      dependencies,
    };
    manifests.set(item.dir, manifest);
    mkdirSync(join(root, item.dir), { recursive: true });
    writeFileSync(join(root, item.dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    lockPackages[item.dir] = globalThis.structuredClone(manifest);
  }

  const consumer = {
    name: '@kaicreator/domain-harness',
    version: '0.2.0',
    dependencies: { [CONTRACTS]: VERSION },
  };
  mkdirSync(join(root, CONSUMER_DIR), { recursive: true });
  writeFileSync(join(root, CONSUMER_DIR, 'package.json'), JSON.stringify(consumer, null, 2) + '\n');
  lockPackages[CONSUMER_DIR] = globalThis.structuredClone(consumer);
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
    name: 'domain-harness-monorepo',
    version: '0.2.0',
    lockfileVersion: 3,
    requires: true,
    packages: lockPackages,
  }, null, 2) + '\n');
  return { root, lockPackages, manifests, consumer };
}

function withFixture(run) {
  const state = fixture();
  try {
    run(state);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
}

test('accepts source manifests and lockfile aligned to one stable SDK version', () => {
  withFixture(({ root }) => {
    const result = verifySdkVersionConsistency(root, VERSION);
    assert.equal(result.result, 'PASS');
    assert.equal(result.version, VERSION);
    assert.equal(result.packages.length, 4);
  });
});

test('rejects a prerelease residue in one public SDK manifest', () => {
  withFixture(({ root, manifests }) => {
    const manifest = manifests.get('packages/microkernel');
    manifest.version = '0.10.2-rc.0';
    writeFileSync(join(root, 'packages/microkernel/package.json'), JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /source manifest version/);
  });
});

test('rejects an internal SDK dependency edge that drifts from the release version', () => {
  withFixture(({ root, manifests }) => {
    const manifest = manifests.get('packages/host-node');
    manifest.dependencies[CONTRACTS] = '0.10.2-rc.0';
    writeFileSync(join(root, 'packages/host-node/package.json'), JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must equal 0\.10\.3/);
  });
});

test('rejects a lockfile that disagrees with the source workspace manifest', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages['packages/host-node'].version = '0.10.2-rc.0';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'fixture',
      version: '0.2.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /lock package version/);
  });
});

test('rejects prerelease or malformed expected release versions', () => {
  withFixture(({ root }) => {
    assert.throws(() => verifySdkVersionConsistency(root, '0.10.3-rc.0'), /stable x\.y\.z/);
  });
});

test('rejects a root monorepo product version change', () => {
  withFixture(({ root }) => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      private: true,
      version: '0.2.1',
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /root monorepo product version/);
  });
});

test('rejects a consumer product version change', () => {
  withFixture(({ root }) => {
    const path = join(root, CONSUMER_DIR, 'package.json');
    const consumer = JSON.parse(readFileSync(path, 'utf8'));
    consumer.version = '0.2.1';
    writeFileSync(path, JSON.stringify(consumer));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /product version must remain 0\.2\.0/);
  });
});

test('rejects a root lockfile product version drift', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages[''].version = '0.2.1';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.2.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /root package version must match/);
  });
});
