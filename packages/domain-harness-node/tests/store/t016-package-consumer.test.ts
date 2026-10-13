import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  packTarballFrom,
  stagePackedWorkspaces,
} from '../../../../packages/domain-harness-compiler/tests/packed-fixture-stage.js';


/**
 * CI robustness (mirrors the sibling N18 probe, #953 Controller 090): this
 * journey npm-installs @types/node plus the packed tarballs into a clean
 * consumer; the registry fetch needs worker egress. Probe once and skip
 * explicitly when unreachable rather than hang the install to the step
 * timeout.
 */
function npmRegistryReachable(): boolean {
  const probe = spawnSync('npm', ['ping', '--registry', process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org'], {
    encoding: 'utf8', timeout: 15_000, shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const EXPO_PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'domain-harness-expo');

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') {
    return run('npm', args, cwd);
  }
  // Windows resolves npm to npm.cmd and Node refuses to spawn batch files
  // without a shell, so build one quoted command line for the shell; passing
  // the quoted string directly (instead of spawn args) keeps paths with
  // spaces intact without the deprecated args+shell combination.
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  return execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  });
}

test('T-016 package consumer: packed core/node/expo expose the public v0.2 API to a clean TypeScript consumer', async (t) => {
  if (!npmRegistryReachable()) {
    t.skip('T-016 PACKED CONSUMER NOT_RUN(NETWORK): npm registry unreachable from this execution environment');
    return;
  }

  const root = mkdtempSync(join(tmpdir(), 'domain-harness-t016-consumer-'));
  const packDirectory = join(root, 'packs');
  const consumerDirectory = join(root, 'consumer');

  try {
    mkdirSync(packDirectory, { recursive: true });
    mkdirSync(consumerDirectory, { recursive: true });

    // #953 (Controller 102): this file used to run
    // `npm run build -w @kaicreator/domain-harness` (+ -node, + -expo) and
    // `npm pack --workspace` IN-TEST — the last writer of the LIVE shared
    // packages/domain-harness/dist inside the parallel `node --test` suite
    // (the -node and -expo invocations each rebuilt core AGAIN through
    // their prebuild hooks). While tsc truncate-rewrote dist, the t022
    // spawned children linking that same dist could read a file inside the
    // rewrite hole and exit 1 instead of the expected simulated 137 (#953
    // T022 read-only forensic, verdict TEST_INFRA_RACE). Pack from the
    // shared #996 immutable stage instead: core+node build into private
    // staged outDirs (never the live dist, with the fail-closed live-dist
    // freshness guard), and expo builds the same way through a direct
    // `tsc -p --outDir` call — a workspace-script build is unusable here
    // because expo's own prebuild hook rebuilds the live core dist.
    const staged = await stagePackedWorkspaces({ includeNodePackage: true });
    const coreTarball = staged.coreTarball;
    const nodeTarball = staged.nodeTarball;
    assert.ok(nodeTarball, 'staged node tarball packed');

    const expoStageRoot = join(root, 'expo-stage');
    mkdirSync(expoStageRoot, { recursive: true });
    cpSync(join(EXPO_PACKAGE_ROOT, 'package.json'), join(expoStageRoot, 'package.json'));
    const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    run(process.execPath, [
      tsc,
      '-p',
      join(EXPO_PACKAGE_ROOT, 'tsconfig.build.json'),
      '--outDir',
      join(expoStageRoot, 'dist'),
    ], REPO_ROOT);
    const expoTarball = packTarballFrom(expoStageRoot, packDirectory, 'domain-harness-expo', 1);

    const tarballs = [coreTarball, nodeTarball, expoTarball];
    assert.equal(
      new Set(tarballs.map((tarball) => tarball.fileName)).size,
      3,
      'core/node/expo pack as three distinct tarballs',
    );

    writeFileSync(join(consumerDirectory, 'package.json'), JSON.stringify({
      name: 'domain-harness-t016-clean-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    runNpm(
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '@types/node@^22.0.0',
        ...tarballs.map((tarball) => tarball.path),
      ],
      consumerDirectory,
    );

    writeFileSync(join(consumerDirectory, 'index.ts'), `
import {
  createDomainRuntime,
  StaticPackageRegistry,
  type CompiledDomainDataPort,
  type DomainRuntime,
  type PackageRegistry,
  type RuntimeHostBindings,
  type RuntimeResources,
  type RuntimeStore,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness/v2';
import { createNodeDomainRuntime } from '@kaicreator/domain-harness-node';
import { createExpoDomainRuntime } from '@kaicreator/domain-harness-expo';

const portableFactory: typeof createDomainRuntime = createDomainRuntime;
const nodeFactory: typeof createNodeDomainRuntime = createNodeDomainRuntime;
const expoFactory: typeof createExpoDomainRuntime = createExpoDomainRuntime;

let runtime: DomainRuntime | undefined;
let registry: PackageRegistry | undefined;
let store: RuntimeStore | undefined;
let bindings: RuntimeHostBindings | undefined;
let resources: RuntimeResources | undefined;
let domainData: CompiledDomainDataPort | undefined;
let compiledPackage: TargetCompiledDomainPackage | undefined;

void portableFactory;
void nodeFactory;
void expoFactory;
void runtime;
void registry;
void store;
void bindings;
void resources;
void domainData;
void compiledPackage;
void StaticPackageRegistry;
`);

    writeFileSync(join(consumerDirectory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: ['node'],
        lib: ['ES2022', 'DOM'],
      },
      include: ['index.ts'],
    }, null, 2));

    run(process.execPath, [tsc, '--project', 'tsconfig.json'], consumerDirectory);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
