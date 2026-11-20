import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { redactAbsoluteCommandArgs } from '../../scripts/distribution/pack-sdk-from-tag.mjs';

import {
  ROOT_EDGE_PACKAGES,
  SDK_PACKAGES,
  verifySdkVersionConsistency,
} from '../../scripts/distribution/verify-sdk-version-consistency.mjs';

const VERSION = '0.11.0';
const CONSUMER_DIR = 'packages/domain-harness';
const CONSUMER_NAME = '@kaicreator/domain-harness';
const CONTRACTS = '@kaicreator/domain-harness-contracts';
const BUILD = '@kaicreator/domain-harness-build';
const MICROKERNEL = '@kaicreator/domain-harness-microkernel';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const V011_ENTRY = Object.freeze({
  types: './dist/v011/index.d.ts',
  import: './dist/v011/index.js',
});
const LEGACY_ENTRY = Object.freeze({
  types: './dist/index.d.ts',
  import: './dist/index.js',
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dh-sdk-version-consistency-'));
  const lockPackages = {
    '': { name: 'domain-harness-monorepo', version: '0.11.0' },
  };
  const manifests = new Map();
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'domain-harness-monorepo',
    private: true,
    version: '0.11.0',
  }, null, 2) + '\n');
  for (const item of SDK_PACKAGES) {
    const dependencies = Object.fromEntries(item.internal.map((name) => [name, VERSION]));
    const isContracts = item.dir === 'packages/contracts';
    const manifest = {
      name: item.name,
      version: VERSION,
      type: 'module',
      engines: { node: '>=24.0.0' },
      // T04 final release shape (L2 §8.3): executable SDK packages ship only
      // dist/v011; contracts keep the full dist (inert legacy types).
      files: isContracts ? ['dist', 'README.md'] : ['dist/v011', 'README.md'],
      exports: isContracts
        ? { '.': LEGACY_ENTRY, './v011': V011_ENTRY }
        : {
            '.': V011_ENTRY,
            './legacy': LEGACY_ENTRY,
            ...(item.dir === 'packages/microkernel'
              ? {
                  './legacy/host-seam': {
                    types: './dist/host-seam.d.ts',
                    import: './dist/host-seam.js',
                  },
                }
              : {}),
          },
      ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
      ...(item.dir === 'tooling/build' ? { dependencies: { ...dependencies, ajv: '8.17.1' } } : {}),
    };
    manifests.set(item.dir, manifest);
    mkdirSync(join(root, item.dir), { recursive: true });
    writeFileSync(join(root, item.dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    lockPackages[item.dir] = globalThis.structuredClone(manifest);
  }

  const consumer = {
    name: CONSUMER_NAME,
    version: '0.11.0',
    type: 'module',
    engines: { node: '>=24.0.0' },
    files: ['dist/v011', 'README.md'],
    exports: { '.': V011_ENTRY, './legacy': LEGACY_ENTRY },
    scripts: { prepack: 'npm run build && node scripts/assert-v011-pack-ready.mjs' },
    dependencies: { [BUILD]: VERSION, [CONTRACTS]: VERSION, [MICROKERNEL]: VERSION },
  };
  mkdirSync(join(root, CONSUMER_DIR), { recursive: true });
  writeFileSync(join(root, CONSUMER_DIR, 'package.json'), JSON.stringify(consumer, null, 2) + '\n');
  lockPackages[CONSUMER_DIR] = globalThis.structuredClone(consumer);

  // Non-release workspaces keep their own version but must carry the exact
  // root-name edge (dependencies for node/expo/dis, peerDependencies for the
  // retired compiler).
  for (const item of ROOT_EDGE_PACKAGES) {
    const manifest = {
      name: `fixture-${item.dir}`,
      version: '0.2.0',
      ...(item.dir === 'packages/dis-v011-runtime' || item.dir === 'packages/domain-harness-node' || item.dir === 'packages/domain-harness-expo' || item.dir === 'packages/domain-harness-compiler' ? { private: true } : {}),
      [item.section]: {
        [CONSUMER_NAME]: VERSION,
        ...(item.dir === 'packages/dis-v011-runtime'
          ? { [BUILD]: VERSION, [CONTRACTS]: VERSION }
          : {}),
      },
    };
    mkdirSync(join(root, item.dir), { recursive: true });
    writeFileSync(join(root, item.dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    lockPackages[item.dir] = globalThis.structuredClone(manifest);
  }
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
    name: 'domain-harness-monorepo',
    version: '0.11.0',
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
    manifest.version = '0.11.0-rc.0';
    writeFileSync(join(root, 'packages/microkernel/package.json'), JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /source manifest version/);
  });
});

test('rejects an internal SDK dependency edge that drifts from the release version', () => {
  withFixture(({ root, manifests }) => {
    const manifest = manifests.get('packages/host-node');
    manifest.dependencies[CONTRACTS] = '0.11.0-rc.0';
    writeFileSync(join(root, 'packages/host-node/package.json'), JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must equal 0\.11\.0/);
  });
});

test('rejects a consumer that drifts from the frozen contracts/build/microkernel graph', () => {
  withFixture(({ root }) => {
    const path = join(root, CONSUMER_DIR, 'package.json');
    const consumer = JSON.parse(readFileSync(path, 'utf8'));
    delete consumer.dependencies[MICROKERNEL];
    writeFileSync(path, JSON.stringify(consumer));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /frozen 0\.11\.0 graph/);
  });
});

test('rejects a root-name edge that drifts from the release version', () => {
  withFixture(({ root }) => {
    const path = join(root, 'packages/domain-harness-node/package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.dependencies[CONSUMER_NAME] = '0.2.0';
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must equal 0\.11\.0/);
  });
});

test('rejects a canonical consumer that returns to private (T04 final wiring)', () => {
  withFixture(({ root }) => {
    const path = join(root, CONSUMER_DIR, 'package.json');
    const consumer = JSON.parse(readFileSync(path, 'utf8'));
    consumer.private = true;
    writeFileSync(path, JSON.stringify(consumer));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must be publishable/);
  });
});

test('rejects a canonical root SDK without the verified Node target floor', () => {
  withFixture(({ root }) => {
    const path = join(root, CONSUMER_DIR, 'package.json');
    const consumer = JSON.parse(readFileSync(path, 'utf8'));
    delete consumer.engines;
    writeFileSync(path, JSON.stringify(consumer));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /verified Node target floor/);
  });
});

test('rejects a canonical root SDK without the fresh-build pack assertion', () => {
  withFixture(({ root }) => {
    const path = join(root, CONSUMER_DIR, 'package.json');
    const consumer = JSON.parse(readFileSync(path, 'utf8'));
    consumer.scripts.prepack = 'npm run build';
    writeFileSync(path, JSON.stringify(consumer));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /prepack must freshly build and assert/);
  });
});

test('rejects a private legacy workspace becoming a public legacy consumer', () => {
  withFixture(({ root }) => {
    const path = join(root, 'packages/domain-harness-compiler/package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    delete manifest.private;
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /workspace-only; this package must not enter a public release graph/);
  });
});

test('rejects a release package whose files whitelist ships the legacy dist', () => {
  withFixture(({ root }) => {
    const path = join(root, CONSUMER_DIR, 'package.json');
    const consumer = JSON.parse(readFileSync(path, 'utf8'));
    consumer.files = ['dist', 'README.md'];
    writeFileSync(path, JSON.stringify(consumer));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /legacy dist fenced/);
  });
});

test('rejects a release package whose exports root is not the v011 canonical entry', () => {
  withFixture(({ root }) => {
    const path = join(root, 'tooling/build/package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.exports['.'] = LEGACY_ENTRY;
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /canonical v011 entry/);
  });
});

test('rejects a release package that drops the fenced legacy subpath', () => {
  withFixture(({ root }) => {
    const path = join(root, 'packages/microkernel/package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    delete manifest.exports['./legacy'];
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /workspace compatibility/);
  });
});

test('rejects peer/optional/bundled metadata leaking into the release graph', () => {
  withFixture(({ root }) => {
    const path = join(root, CONSUMER_DIR, 'package.json');
    const consumer = JSON.parse(readFileSync(path, 'utf8'));
    consumer.peerDependencies = { 'some-driver': '^1.0.0' };
    writeFileSync(path, JSON.stringify(consumer));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must be absent from the frozen release graph/);
  });
});

test('rejects a microkernel third-party runtime dependency', () => {
  withFixture(({ root }) => {
    const path = join(root, 'packages/microkernel/package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.dependencies['left-pad'] = '1.0.0';
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /no third-party runtime dependency/);
  });
});

test('rejects contracts gaining a dependency (zero-dependency rule)', () => {
  withFixture(({ root }) => {
    const path = join(root, 'packages/contracts/package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.dependencies = { 'left-pad': '1.0.0' };
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /zero-dependency/);
  });
});

test('rejects a lock consumer graph that drifts while source stays valid', () => {
  withFixture(({ root, lockPackages }) => {
    delete lockPackages[CONSUMER_DIR].dependencies[MICROKERNEL];
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.11.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /frozen 0\.11\.0 graph/);
  });
});

test('rejects a lock root-name edge that drifts while source stays valid', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages['packages/domain-harness-node'].dependencies[CONSUMER_NAME] = '0.2.0';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.11.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must equal 0\.11\.0/);
  });
});

test('rejects a BUILD Ajv version that is not exact 8.17.1', () => {
  withFixture(({ root, manifests }) => {
    const manifest = manifests.get('tooling/build');
    manifest.dependencies.ajv = '^8.17.1';
    writeFileSync(join(root, 'tooling/build/package.json'), JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must equal 8\.17\.1/);
  });
});

test('rejects a lock BUILD Ajv version that is not exact 8.17.1', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages['tooling/build'].dependencies.ajv = '^8.17.1';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.11.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must equal 8\.17\.1/);
  });
});

test('rejects an extra third-party consumer production dependency', () => {
  withFixture(({ root }) => {
    const path = join(root, CONSUMER_DIR, 'package.json');
    const consumer = JSON.parse(readFileSync(path, 'utf8'));
    consumer.dependencies.ajv = '^8.17.1';
    writeFileSync(path, JSON.stringify(consumer));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /no third-party runtime dependency/);
  });
});

test('rejects an extra third-party lock consumer production dependency', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages[CONSUMER_DIR].dependencies.ajv = '^8.17.1';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.11.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /no third-party runtime dependency/);
  });
});

test('rejects dis-v011-runtime leaving the private release boundary', () => {
  withFixture(({ root }) => {
    const path = join(root, 'packages/dis-v011-runtime/package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.private = false;
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must remain private:true/);
  });
});

test('rejects an additional dis-v011-runtime SDK dependency edge', () => {
  withFixture(({ root }) => {
    const path = join(root, 'packages/dis-v011-runtime/package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.dependencies['@kaicreator/domain-harness-microkernel'] = '0.11.0';
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /no additional SDK edge/);
  });
});

test('rejects an additional dis-v011-runtime SDK dependency edge in lock', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages['packages/dis-v011-runtime'].dependencies['@kaicreator/domain-harness-microkernel'] = '0.11.0';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.11.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /no additional SDK edge/);
  });
});

test('rejects a dis-v011-runtime internal dependency that drifts', () => {
  withFixture(({ root }) => {
    const path = join(root, 'packages/dis-v011-runtime/package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.dependencies['@kaicreator/domain-harness-build'] = '0.10.3';
    writeFileSync(path, JSON.stringify(manifest));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must equal 0\.11\.0/);
  });
});

test('rejects a dis-v011-runtime lock internal dependency that drifts', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages['packages/dis-v011-runtime'].dependencies['@kaicreator/domain-harness-contracts'] = '0.10.3';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.11.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /must equal 0\.11\.0/);
  });
});

test('rejects a lockfile that disagrees with the source workspace manifest', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages['packages/host-node'].version = '0.11.0-rc.0';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.11.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /lock package version/);
  });
});

test('rejects prerelease or malformed expected release versions', () => {
  withFixture(({ root }) => {
    assert.throws(() => verifySdkVersionConsistency(root, '0.11.0-rc.0'), /stable x\.y\.z/);
  });
});

test('rejects a root monorepo product version change', () => {
  withFixture(({ root }) => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      private: true,
      version: '0.11.1',
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /root monorepo product version/);
  });
});

test('rejects a consumer product version change', () => {
  withFixture(({ root }) => {
    const path = join(root, CONSUMER_DIR, 'package.json');
    const consumer = JSON.parse(readFileSync(path, 'utf8'));
    consumer.version = '0.11.1';
    writeFileSync(path, JSON.stringify(consumer));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /product version must remain 0\.11\.0/);
  });
});

test('rejects a root lockfile product version drift', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages[''].version = '0.11.1';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.11.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /root package version must match/);
  });
});

test('redacts absolute Windows and POSIX paths from public command provenance', () => {
  const args = [
    '--pack-destination',
    'C:\\Users\\Private User\\AppData\\Local\\Temp\\sdk-output',
    '--tag',
    'v0.10.3+source-repair.1',
    '/tmp/private-checkout',
    'smoke.mjs',
  ];
  assert.deepEqual(redactAbsoluteCommandArgs(args), [
    '--pack-destination',
    '<ABSOLUTE_PATH>',
    '--tag',
    'v0.10.3+source-repair.1',
    '<ABSOLUTE_PATH>',
    'smoke.mjs',
  ]);
});

test('rejects a root package-lock name that drifts from package.json', () => {
  withFixture(({ root }) => {
    const path = join(root, 'package-lock.json');
    const lock = JSON.parse(readFileSync(path, 'utf8'));
    lock.name = 'wrong-root-name';
    writeFileSync(path, JSON.stringify(lock));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /root name must match/);
  });
});

test('rejects a root lock workspace name that drifts from package.json', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages[''].name = 'wrong-root-name';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.11.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /root workspace name must match/);
  });
});

test('rejects a consumer lock workspace name that drifts from package.json', () => {
  withFixture(({ root, lockPackages }) => {
    lockPackages[CONSUMER_DIR].name = 'wrong-consumer-name';
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({
      name: 'domain-harness-monorepo',
      version: '0.11.0',
      lockfileVersion: 3,
      requires: true,
      packages: lockPackages,
    }));
    assert.throws(() => verifySdkVersionConsistency(root, VERSION), /lock package name must match/);
  });
});

function packDryRun(name, runScripts) {
  const args = ['pack', '--dry-run', '--json', '-w', name];
  if (!runScripts) args.push('--ignore-scripts');
  const stdout = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const jsonStart = stdout.search(/^\[/mu);
  assert.ok(jsonStart >= 0, `${name}: npm pack did not emit a JSON array\n${stdout}`);
  const packs = JSON.parse(stdout.slice(jsonStart));
  assert.equal(packs.length, 1, `${name}: exactly one workspace pack expected`);
  assert.equal(packs[0].name, name);
  return { files: packs[0].files.map((file) => file.path), stdout };
}

test('v011 public pack dry-runs rebuild the root and fence every legacy executable tarball', { timeout: 240_000 }, () => {
  for (const name of [CONSUMER_NAME, CONTRACTS, BUILD, MICROKERNEL]) {
    // The root deliberately runs prepack here: this is the real fresh-build +
    // assert-v011-pack-ready witness, serialized after the v011 runtime tests.
    // Tracked-dist packages use ignore-scripts; their freshness guard is separate.
    const { files, stdout } = packDryRun(name, name === CONSUMER_NAME);
    assert.ok(files.includes('package.json'), `${name}: manifest missing`);
    assert.ok(files.includes('dist/v011/index.js'), `${name}: canonical JS entry missing`);
    assert.ok(files.includes('dist/v011/index.d.ts'), `${name}: canonical types missing`);
    if (name === CONTRACTS) {
      assert.ok(files.includes('dist/index.js'), 'contracts scoped legacy inert root must remain');
      assert.ok(files.includes('dist/index.d.ts'), 'contracts scoped legacy inert types must remain');
      continue;
    }
    assert.ok(files.includes('README.md'), `${name}: README missing`);
    assert.ok(!files.includes('dist/index.js'), `${name}: legacy executable root leaked`);
    assert.ok(!files.includes('dist/host-seam.js'), `${name}: legacy host-seam leaked`);
    assert.ok(files.every((path) => path.startsWith('dist/v011/') || path === 'package.json' || path === 'README.md'),
      `${name}: files outside dist/v011 + README/package.json leaked: ${files.join(', ')}`);
    if (name === CONSUMER_NAME) {
      assert.match(stdout, /assert-v011-pack-ready/u, 'root pack must execute its fresh-dist assertion');
    }
  }
});

